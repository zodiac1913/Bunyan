//! SQLite store: schema, idempotent ingestion of source rows, and the read queries behind the web UI.
//! Callers open short-lived connections via [`open`]; WAL mode lets the web server read while an import writes.

use crate::normalize::{self, GroupKey};
use anyhow::Result;
use chrono::{NaiveDate, NaiveDateTime};
use rusqlite::{Connection, OptionalExtension, params, params_from_iter};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS error_groups (
    id               INTEGER PRIMARY KEY,
    fingerprint      TEXT NOT NULL UNIQUE,
    log_app          TEXT NOT NULL,
    log_type         TEXT NOT NULL,
    class_name       TEXT,
    method_name      TEXT,
    exception_type   TEXT,
    template         TEXT NOT NULL,
    sample_message   TEXT NOT NULL,
    sample_exception TEXT,
    first_seen       TEXT NOT NULL,
    last_seen        TEXT NOT NULL,
    suggestion       TEXT,
    suggestion_model TEXT,
    suggestion_at    TEXT
);
CREATE TABLE IF NOT EXISTS log_entries (
    log_identifier              INTEGER PRIMARY KEY,
    group_id                    INTEGER NOT NULL REFERENCES error_groups(id),
    log_app                     TEXT NOT NULL,
    log_type                    TEXT NOT NULL,
    log_severity                INTEGER NOT NULL,
    message                     TEXT NOT NULL,
    exception                   TEXT,
    task_definition_identifier  INTEGER,
    task_definition_title       TEXT,
    project_identifier          INTEGER,
    project_name                TEXT,
    customer_service_identifier INTEGER,
    class_name                  TEXT,
    method_name                 TEXT,
    add_user_account            TEXT,
    server                      TEXT,
    add_user_identifier         INTEGER,
    add_user_name               TEXT,
    add_timestamp               TEXT NOT NULL,
    day                         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_entries_day       ON log_entries(day);
CREATE INDEX IF NOT EXISTS ix_entries_group_day ON log_entries(group_id, day);
CREATE TABLE IF NOT EXISTS import_runs (
    id            INTEGER PRIMARY KEY,
    day           TEXT NOT NULL,
    trigger       TEXT NOT NULL,
    started_at    TEXT NOT NULL,
    finished_at   TEXT,
    status        TEXT NOT NULL,
    rows_fetched  INTEGER NOT NULL DEFAULT 0,
    rows_inserted INTEGER NOT NULL DEFAULT 0,
    error         TEXT
);
CREATE TABLE IF NOT EXISTS login_preferences (
    context          TEXT PRIMARY KEY,
    username         TEXT NOT NULL,
    saved_password   INTEGER NOT NULL DEFAULT 0 CHECK(saved_password IN (0, 1))
);
CREATE TABLE IF NOT EXISTS sql_connection (
    id     INTEGER PRIMARY KEY CHECK(id = 1),
    target TEXT NOT NULL
);
"#;

/// Lower-cased `LogType` values treated as non-problems; everything else counts as an "issue".
pub const INFORMATIONAL_TYPES: &[&str] = &[
    "info",
    "information",
    "informational",
    "debug",
    "trace",
    "verbose",
    "audit",
];

pub fn is_informational(log_type: &str) -> bool {
    INFORMATIONAL_TYPES.contains(&log_type.trim().to_lowercase().as_str())
}

/// Presentation aliases are unified without rewriting original source logs or group identities.
pub fn canonical_level(level: &str) -> &str {
    if ["info", "information", "informational"]
        .iter()
        .any(|alias| level.trim().eq_ignore_ascii_case(alias))
    {
        "Information"
    } else {
        level
    }
}

/// Unifies the deployed application's casing without changing raw logs or group fingerprints.
pub fn canonical_app(app: &str) -> &str {
    if app.eq_ignore_ascii_case("DotNetCats") {
        "DotNetCats"
    } else {
        app
    }
}

fn level_sql(column: &str, message: &str) -> String {
    // This application's successful sign-in/session-renewal messages are normal activity,
    // even when their source LogType is blank. Match the event suffix, not arbitrary mentions.
    format!(
        "CASE WHEN lower(trim({column})) IN ('info','information','informational')
         OR lower(rtrim({message})) LIKE '%updated user/login'
         THEN 'Information' ELSE {column} END"
    )
}

/// Opens (and migrates) the database. Cheap enough to call per request.
pub fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(std::time::Duration::from_secs(10))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

/// One row of the SQL Server `CORE.Log` table (LastUpdate* columns are not kept).
#[derive(Debug, Clone)]
pub struct SourceLog {
    pub log_identifier: i64,
    pub log_app: String,
    pub log_type: String,
    pub log_message: String,
    pub log_exception: Option<String>,
    pub log_severity: i32,
    pub task_definition_identifier: Option<i64>,
    pub task_definition_title: Option<String>,
    pub project_identifier: Option<i64>,
    pub project_name: Option<String>,
    pub customer_service_identifier: Option<i64>,
    pub class_name: Option<String>,
    pub method_name: Option<String>,
    pub add_user_account: Option<String>,
    pub server: Option<String>,
    pub add_user_identifier: Option<i64>,
    pub add_user_name: Option<String>,
    pub add_timestamp: NaiveDateTime,
}

const TS_FMT: &str = "%Y-%m-%d %H:%M:%S%.3f";

/// Groups and stores rows in one transaction. Re-importing the same rows is a no-op
/// (keyed on `LogIdentifier`). Returns how many entries were newly inserted.
pub fn ingest(conn: &mut Connection, rows: &[SourceLog]) -> Result<usize> {
    let tx = conn.transaction()?;
    let mut inserted = 0;
    {
        let mut upsert_group = tx.prepare_cached(
            "INSERT INTO error_groups (fingerprint, log_app, log_type, class_name, method_name, exception_type,
                                       template, sample_message, sample_exception, first_seen, last_seen)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
             ON CONFLICT(fingerprint) DO UPDATE SET
                first_seen = min(first_seen, excluded.first_seen),
                last_seen  = max(last_seen,  excluded.last_seen)
             RETURNING id",
        )?;
        let mut insert_entry = tx.prepare_cached(
            "INSERT OR IGNORE INTO log_entries (log_identifier, group_id, log_app, log_type, log_severity, message, exception,
                task_definition_identifier, task_definition_title, project_identifier, project_name,
                customer_service_identifier, class_name, method_name, add_user_account, server,
                add_user_identifier, add_user_name, add_timestamp, day)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        )?;
        for r in rows {
            let template = normalize::template(&r.log_message);
            let ex_type = normalize::exception_type(r.log_exception.as_deref());
            let fingerprint = GroupKey {
                app: &r.log_app,
                log_type: &r.log_type,
                class_name: r.class_name.as_deref(),
                method_name: r.method_name.as_deref(),
                exception_type: ex_type.as_deref(),
                template: &template,
            }
            .fingerprint();
            let ts = r.add_timestamp.format(TS_FMT).to_string();
            let group_id: i64 = upsert_group.query_row(
                params![
                    fingerprint,
                    r.log_app,
                    r.log_type,
                    r.class_name,
                    r.method_name,
                    ex_type,
                    template,
                    r.log_message,
                    r.log_exception,
                    ts
                ],
                |row| row.get(0),
            )?;
            inserted += insert_entry.execute(params![
                r.log_identifier,
                group_id,
                r.log_app,
                r.log_type,
                r.log_severity,
                r.log_message,
                r.log_exception,
                r.task_definition_identifier,
                r.task_definition_title,
                r.project_identifier,
                r.project_name,
                r.customer_service_identifier,
                r.class_name,
                r.method_name,
                r.add_user_account,
                r.server,
                r.add_user_identifier,
                r.add_user_name,
                ts,
                r.add_timestamp.date().to_string()
            ])?;
        }
    }
    tx.commit()?;
    Ok(inserted)
}

// ---------- import run bookkeeping ----------

pub fn start_run(conn: &Connection, day: NaiveDate, trigger: &str) -> Result<i64> {
    conn.execute(
        "INSERT INTO import_runs (day, trigger, started_at, status) VALUES (?1, ?2, ?3, 'running')",
        params![day.to_string(), trigger, now()],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn finish_run(conn: &Connection, id: i64, result: &Result<(usize, usize)>) -> Result<()> {
    let (status, fetched, inserted, err) = match result {
        Ok((f, i)) => ("ok", *f as i64, *i as i64, None),
        Err(e) => ("failed", 0, 0, Some(format!("{e:#}"))),
    };
    conn.execute(
        "UPDATE import_runs SET finished_at=?2, status=?3, rows_fetched=?4, rows_inserted=?5, error=?6 WHERE id=?1",
        params![id, now(), status, fetched, inserted, err],
    )?;
    Ok(())
}

/// Marks runs left `running` by a crashed/killed process as failed; call once at startup.
pub fn fail_stale_runs(conn: &Connection) -> Result<()> {
    conn.execute(
        "UPDATE import_runs SET status='failed', error='interrupted (process stopped)', finished_at=?1 WHERE status='running'",
        [now()],
    )?;
    Ok(())
}

/// Most recent day that imported successfully, used for catch-up after downtime.
pub fn last_successful_day(conn: &Connection) -> Result<Option<NaiveDate>> {
    let s: Option<String> = conn.query_row(
        "SELECT max(day) FROM import_runs WHERE status='ok'",
        [],
        |r| r.get(0),
    )?;
    Ok(s.and_then(|s| s.parse().ok()))
}

pub struct ImportRun {
    pub day: String,
    pub trigger: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub status: String,
    pub rows_fetched: i64,
    pub rows_inserted: i64,
    pub error: Option<String>,
}

pub fn recent_runs(conn: &Connection, limit: i64) -> Result<Vec<ImportRun>> {
    let mut st = conn.prepare(
        "SELECT day, trigger, started_at, finished_at, status, rows_fetched, rows_inserted, error
         FROM import_runs ORDER BY id DESC LIMIT ?1",
    )?;
    let rows = st.query_map([limit], |r| {
        Ok(ImportRun {
            day: r.get(0)?,
            trigger: r.get(1)?,
            started_at: r.get(2)?,
            finished_at: r.get(3)?,
            status: r.get(4)?,
            rows_fetched: r.get(5)?,
            rows_inserted: r.get(6)?,
            error: r.get(7)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

// ---------- read queries for the dashboard ----------

/// Optional dashboard filters. `level`: `"issues"` (non-informational), `"all"`, or an exact LogType.
#[derive(Debug, Clone, Default)]
pub struct Filter {
    pub app: Option<String>,
    pub level: String,
}

impl Filter {
    /// Appends `AND ...` clauses for table alias `e` and pushes their bound values.
    fn sql(&self, params: &mut Vec<String>, include_level: bool) -> String {
        let mut sql = String::new();
        if let Some(app) = &self.app {
            params.push(canonical_app(app).to_string());
            sql += &format!(" AND e.log_app = ?{}", params.len());
            if canonical_app(app) == "DotNetCats" {
                sql += " COLLATE NOCASE";
            }
        }
        if include_level {
            match self.level.as_str() {
                "all" | "" => {}
                // Same definition as the dashboard's "Errors & critical" card.
                "errors" => {
                    let level = format!("lower({})", level_sql("e.log_type", "e.message"));
                    sql += &format!(
                        " AND ({level} LIKE '%crit%' OR {level} LIKE '%fatal%' OR {level} LIKE '%err%')"
                    );
                }
                "issues" => {
                    let list = INFORMATIONAL_TYPES
                        .iter()
                        .map(|t| format!("'{t}'"))
                        .collect::<Vec<_>>()
                        .join(",");
                    sql += &format!(
                        " AND lower(trim({})) NOT IN ({list})",
                        level_sql("e.log_type", "e.message")
                    );
                }
                other => {
                    params.push(canonical_level(other).to_string());
                    sql += &format!(
                        " AND {} = ?{}",
                        level_sql("e.log_type", "e.message"),
                        params.len()
                    );
                }
            }
        }
        sql
    }
}

fn range_params(start: NaiveDate, end: NaiveDate) -> Vec<String> {
    vec![start.to_string(), end.to_string()]
}

/// Counts per LogType in `[start, end)` (app filter only; level breakdown is the point).
pub fn counts_by_type(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    f: &Filter,
) -> Result<Vec<(String, i64)>> {
    let mut p = range_params(start, end);
    let sql = format!(
        "SELECT {}, COUNT(*) FROM log_entries e WHERE e.day >= ?1 AND e.day < ?2 {} GROUP BY 1 ORDER BY 2 DESC",
        level_sql("e.log_type", "e.message"),
        f.sql(&mut p, false)
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params_from_iter(p), |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Counts per (LogSeverity, LogType) in `[start, end)`.
pub fn counts_by_severity(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    f: &Filter,
) -> Result<Vec<(i64, String, i64)>> {
    let mut p = range_params(start, end);
    let sql = format!(
        "SELECT e.log_severity, {}, COUNT(*) FROM log_entries e WHERE e.day >= ?1 AND e.day < ?2 {}
         GROUP BY 1, 2 ORDER BY 1",
        level_sql("e.log_type", "e.message"),
        f.sql(&mut p, false)
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params_from_iter(p), |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Counts per (bucket, LogType). Bucket is the hour `"00".."23"` when `hourly`, else the day.
pub fn counts_by_bucket(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    f: &Filter,
    hourly: bool,
) -> Result<Vec<(String, String, i64)>> {
    let mut p = range_params(start, end);
    let bucket = if hourly {
        "substr(e.add_timestamp, 12, 2)"
    } else {
        "e.day"
    };
    let sql = format!(
        "SELECT {bucket}, {}, COUNT(*) FROM log_entries e WHERE e.day >= ?1 AND e.day < ?2 {} GROUP BY 1, 2",
        level_sql("e.log_type", "e.message"),
        f.sql(&mut p, false)
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params_from_iter(p), |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub struct GroupRow {
    pub id: i64,
    pub log_app: String,
    pub log_type: String,
    pub class_name: Option<String>,
    pub method_name: Option<String>,
    pub exception_type: Option<String>,
    pub sample_message: String,
    pub first_seen: String,
    pub last_seen: String,
    pub has_suggestion: bool,
    pub count: i64,
    pub max_severity: i64,
}

/// Top error groups by occurrences in `[start, end)`, honoring app and level filters.
pub fn top_groups(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    f: &Filter,
    limit: i64,
) -> Result<Vec<GroupRow>> {
    kind_groups(conn, start, end, f, false, limit)
}

/// Like [`top_groups`]; `new_only` keeps groups whose first occurrence ever is in `[start, end)`.
pub fn kind_groups(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    f: &Filter,
    new_only: bool,
    limit: i64,
) -> Result<Vec<GroupRow>> {
    let mut p = range_params(start, end);
    let mut filter = f.sql(&mut p, true);
    if new_only {
        filter += " AND substr(g.first_seen,1,10) >= ?1 AND substr(g.first_seen,1,10) < ?2";
    }
    p.push(limit.to_string());
    let level = level_sql("g.log_type", "g.sample_message");
    let sql = format!(
        "SELECT g.id, g.log_app, {level}, g.class_name, g.method_name, g.exception_type, g.sample_message,
                g.first_seen, g.last_seen, g.suggestion, COUNT(*), MAX(e.log_severity)
         FROM log_entries e JOIN error_groups g ON g.id = e.group_id
         WHERE e.day >= ?1 AND e.day < ?2 {filter}
         GROUP BY g.id ORDER BY COUNT(*) DESC LIMIT ?{}",
        p.len()
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params_from_iter(p), |r| {
        Ok(GroupRow {
            id: r.get(0)?,
            log_app: canonical_app(&r.get::<_, String>(1)?).to_string(),
            log_type: canonical_level(&r.get::<_, String>(2)?).to_string(),
            class_name: r.get(3)?,
            method_name: r.get(4)?,
            exception_type: r.get(5)?,
            sample_message: r.get(6)?,
            first_seen: r.get(7)?,
            last_seen: r.get(8)?,
            has_suggestion: r
                .get::<_, Option<String>>(9)?
                .is_some_and(|text| !suggestion_is_outdated(&text)),
            count: r.get(10)?,
            max_severity: r.get(11)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Occurrence counts for the given groups in `[start, end)`; used for period-over-period deltas.
pub fn group_counts(
    conn: &Connection,
    ids: &[i64],
    start: NaiveDate,
    end: NaiveDate,
) -> Result<HashMap<i64, i64>> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let id_list = ids.iter().map(i64::to_string).collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT group_id, COUNT(*) FROM log_entries WHERE day >= ?1 AND day < ?2 AND group_id IN ({id_list}) GROUP BY group_id"
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params_from_iter(range_params(start, end)), |r| {
        Ok((r.get(0)?, r.get(1)?))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Groups whose first occurrence ever falls inside `[start, end)` and match the filters.
pub fn new_group_count(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    f: &Filter,
) -> Result<i64> {
    let mut p = range_params(start, end);
    let filter = f
        .sql(&mut p, true)
        .replace("e.", "g.")
        .replace("g.message", "g.sample_message");
    let sql = format!(
        "SELECT COUNT(*) FROM error_groups g WHERE substr(g.first_seen,1,10) >= ?1 AND substr(g.first_seen,1,10) < ?2 {filter}"
    );
    Ok(conn.query_row(&sql, params_from_iter(p), |r| r.get(0))?)
}

/// Distinct error groups with at least one entry in `[start, end)` matching the filters.
pub fn distinct_group_count(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    f: &Filter,
) -> Result<i64> {
    let mut p = range_params(start, end);
    let sql = format!(
        "SELECT COUNT(DISTINCT e.group_id) FROM log_entries e WHERE e.day >= ?1 AND e.day < ?2 {}",
        f.sql(&mut p, true)
    );
    Ok(conn.query_row(&sql, params_from_iter(p), |r| r.get(0))?)
}

pub fn distinct_apps(conn: &Connection) -> Result<Vec<String>> {
    let mut st = conn.prepare("SELECT DISTINCT log_app FROM error_groups ORDER BY 1")?;
    let rows = st.query_map([], |r| {
        Ok(canonical_app(&r.get::<_, String>(0)?).to_string())
    })?;
    let apps = rows.collect::<Result<std::collections::BTreeSet<_>, _>>()?;
    Ok(apps.into_iter().collect())
}

pub fn distinct_types(conn: &Connection) -> Result<Vec<String>> {
    let mut st = conn.prepare(&format!(
        "SELECT DISTINCT {} FROM error_groups ORDER BY 1",
        level_sql("log_type", "sample_message")
    ))?;
    let rows = st.query_map([], |r| r.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn latest_day(conn: &Connection) -> Result<Option<NaiveDate>> {
    let s: Option<String> = conn.query_row("SELECT max(day) FROM log_entries", [], |r| r.get(0))?;
    Ok(s.and_then(|s| s.parse().ok()))
}

// ---------- group detail ----------

pub struct GroupDetail {
    pub id: i64,
    pub log_app: String,
    pub log_type: String,
    pub class_name: Option<String>,
    pub method_name: Option<String>,
    pub exception_type: Option<String>,
    pub template: String,
    pub sample_message: String,
    pub sample_exception: Option<String>,
    pub first_seen: String,
    pub last_seen: String,
    pub suggestion: Option<String>,
    pub suggestion_model: Option<String>,
    pub suggestion_at: Option<String>,
    pub total: i64,
}

pub fn group_detail(conn: &Connection, id: i64) -> Result<Option<GroupDetail>> {
    let level = level_sql("g.log_type", "g.sample_message");
    Ok(conn
        .query_row(
            &format!("SELECT g.id, g.log_app, {level}, g.class_name, g.method_name, g.exception_type, g.template,
                    g.sample_message, g.sample_exception, g.first_seen, g.last_seen,
                    g.suggestion, g.suggestion_model, g.suggestion_at,
                    (SELECT COUNT(*) FROM log_entries e WHERE e.group_id = g.id)
             FROM error_groups g WHERE g.id = ?1"),
            [id],
            |r| {
                Ok(GroupDetail {
                    id: r.get(0)?,
                    log_app: canonical_app(&r.get::<_, String>(1)?).to_string(),
                    log_type: canonical_level(&r.get::<_, String>(2)?).to_string(),
                    class_name: r.get(3)?,
                    method_name: r.get(4)?,
                    exception_type: r.get(5)?,
                    template: r.get(6)?,
                    sample_message: r.get(7)?,
                    sample_exception: r.get(8)?,
                    first_seen: r.get(9)?,
                    last_seen: r.get(10)?,
                    suggestion: r.get(11)?,
                    suggestion_model: r.get(12)?,
                    suggestion_at: r.get(13)?,
                    total: r.get(14)?,
                })
            },
        )
        .optional()?)
}

/// Per-day counts for one group in `[start, end)`.
pub fn group_daily(
    conn: &Connection,
    id: i64,
    start: NaiveDate,
    end: NaiveDate,
) -> Result<HashMap<String, i64>> {
    let mut st = conn.prepare(
        "SELECT day, COUNT(*) FROM log_entries WHERE group_id = ?1 AND day >= ?2 AND day < ?3 GROUP BY day",
    )?;
    let rows = st.query_map(params![id, start.to_string(), end.to_string()], |r| {
        Ok((r.get(0)?, r.get(1)?))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn group_severities(conn: &Connection, id: i64) -> Result<Vec<(i64, i64)>> {
    let mut st = conn.prepare(
        "SELECT log_severity, COUNT(*) FROM log_entries WHERE group_id = ?1 GROUP BY 1 ORDER BY 1",
    )?;
    let rows = st.query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub struct EntryRow {
    pub log_identifier: i64,
    pub add_timestamp: String,
    pub log_severity: i64,
    pub message: String,
    pub exception: Option<String>,
    pub server: Option<String>,
    pub class_name: Option<String>,
    pub method_name: Option<String>,
    pub task_definition_title: Option<String>,
    pub add_user_name: Option<String>,
}

pub struct RangeEntry {
    pub log_identifier: i64,
    pub add_timestamp: String,
    pub log_type: String,
    pub log_severity: i64,
    pub group_id: i64,
    pub message: String,
    pub server: Option<String>,
    pub class_name: Option<String>,
    pub method_name: Option<String>,
    pub task_definition_title: Option<String>,
    pub add_user_name: Option<String>,
    /// Trimmed exception length; the exception text itself is fetched on demand.
    pub exception_len: i64,
}

#[derive(Debug, Serialize)]
pub struct EntryDetails {
    pub log_identifier: i64,
    pub log_app: String,
    pub log_type: String,
    pub log_severity: i64,
    pub message: String,
    pub exception: Option<String>,
    pub task_definition_identifier: Option<i64>,
    pub task_definition_title: Option<String>,
    pub project_identifier: Option<i64>,
    pub project_name: Option<String>,
    pub customer_service_identifier: Option<i64>,
    pub class_name: Option<String>,
    pub method_name: Option<String>,
    pub add_user_account: Option<String>,
    pub server: Option<String>,
    pub add_user_identifier: Option<i64>,
    pub add_user_name: Option<String>,
    pub add_timestamp: String,
}

/// One page of entries in `[start, end)` (newest first) plus the total matching count.
#[cfg(test)]
pub fn entries_in_range(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    f: &Filter,
    severity: Option<i64>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<RangeEntry>, i64)> {
    entries_in_range_with_types(conn, start, end, f, None, severity, limit, offset)
}

/// Distinct level types available for this range and app, regardless of level selection.
pub fn entry_types_in_range(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    f: &Filter,
) -> Result<Vec<String>> {
    let mut params = range_params(start, end);
    let sql = format!(
        "SELECT DISTINCT {} FROM log_entries e WHERE e.day >= ?1 AND e.day < ?2 {}
         ORDER BY 1 COLLATE NOCASE",
        level_sql("e.log_type", "e.message"),
        f.sql(&mut params, false)
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(params), |row| row.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Entries in a range filtered to a selected set of exact level types.
pub fn entries_in_types(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    f: &Filter,
    types: &[String],
    severity: Option<i64>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<RangeEntry>, i64)> {
    entries_in_range_with_types(conn, start, end, f, Some(types), severity, limit, offset)
}

fn entries_in_range_with_types(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    f: &Filter,
    types: Option<&[String]>,
    severity: Option<i64>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<RangeEntry>, i64)> {
    let mut p = range_params(start, end);
    let mut filter = f.sql(&mut p, types.is_none());
    if let Some(types) = types {
        if types.is_empty() {
            filter += " AND 0";
        } else {
            let placeholders = types
                .iter()
                .map(|level| {
                    p.push(canonical_level(level).to_string());
                    format!("?{}", p.len())
                })
                .collect::<Vec<_>>()
                .join(", ");
            filter += &format!(
                " AND {} IN ({placeholders})",
                level_sql("e.log_type", "e.message")
            );
        }
    }
    if let Some(n) = severity {
        filter += &format!(" AND e.log_severity = {n}");
    }
    let total: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM log_entries e WHERE e.day >= ?1 AND e.day < ?2 {filter}"),
        params_from_iter(p.iter()),
        |r| r.get(0),
    )?;
    let sql = format!(
        "SELECT e.log_identifier, e.add_timestamp, {}, e.log_severity, e.group_id, e.message,
                e.server, e.class_name, e.method_name, e.task_definition_title, e.add_user_name,
                length(trim(coalesce(e.exception, '')))
         FROM log_entries e WHERE e.day >= ?1 AND e.day < ?2 {filter}
         ORDER BY e.add_timestamp DESC, e.log_identifier DESC LIMIT {limit} OFFSET {offset}",
        level_sql("e.log_type", "e.message")
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params_from_iter(p), |r| {
        Ok(RangeEntry {
            log_identifier: r.get(0)?,
            add_timestamp: r.get(1)?,
            log_type: canonical_level(&r.get::<_, String>(2)?).to_string(),
            log_severity: r.get(3)?,
            group_id: r.get(4)?,
            message: r.get(5)?,
            server: r.get(6)?,
            class_name: r.get(7)?,
            method_name: r.get(8)?,
            task_definition_title: r.get(9)?,
            add_user_name: r.get(10)?,
            exception_len: r.get(11)?,
        })
    })?;
    Ok((rows.collect::<Result<_, _>>()?, total))
}

pub fn entry_details(conn: &Connection, log_identifier: i64) -> Result<Option<EntryDetails>> {
    Ok(conn
        .query_row(
            "SELECT log_identifier, log_app, log_type, log_severity, message, exception,
                    task_definition_identifier, task_definition_title, project_identifier,
                    project_name, customer_service_identifier, class_name, method_name,
                    add_user_account, server, add_user_identifier, add_user_name, add_timestamp
             FROM log_entries WHERE log_identifier = ?1",
            [log_identifier],
            |r| {
                Ok(EntryDetails {
                    log_identifier: r.get(0)?,
                    log_app: r.get(1)?,
                    log_type: canonical_level(&r.get::<_, String>(2)?).to_string(),
                    log_severity: r.get(3)?,
                    message: r.get(4)?,
                    exception: r.get(5)?,
                    task_definition_identifier: r.get(6)?,
                    task_definition_title: r.get(7)?,
                    project_identifier: r.get(8)?,
                    project_name: r.get(9)?,
                    customer_service_identifier: r.get(10)?,
                    class_name: r.get(11)?,
                    method_name: r.get(12)?,
                    add_user_account: r.get(13)?,
                    server: r.get(14)?,
                    add_user_identifier: r.get(15)?,
                    add_user_name: r.get(16)?,
                    add_timestamp: r.get(17)?,
                })
            },
        )
        .optional()?)
}

pub fn group_entries(conn: &Connection, id: i64, limit: i64) -> Result<Vec<EntryRow>> {
    let mut st = conn.prepare(
        "SELECT log_identifier, add_timestamp, log_severity, message, server, class_name, method_name, task_definition_title, add_user_name, exception
         FROM log_entries WHERE group_id = ?1 ORDER BY add_timestamp DESC LIMIT ?2",
    )?;
    let rows = st.query_map(params![id, limit], |r| {
        Ok(EntryRow {
            log_identifier: r.get(0)?,
            add_timestamp: r.get(1)?,
            log_severity: r.get(2)?,
            message: r.get(3)?,
            server: r.get(4)?,
            class_name: r.get(5)?,
            method_name: r.get(6)?,
            task_definition_title: r.get(7)?,
            add_user_name: r.get(8)?,
            exception: r.get(9)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Uses the same token definitions as grouping-pattern display; original log text is never rewritten.
pub fn suggestion_is_outdated(text: &str) -> bool {
    normalize::display_template(text) != text
}

/// Rejects placeholder-based advice before writing, preserving any previously saved suggestion.
pub fn save_suggestion(conn: &Connection, id: i64, text: &str, model: &str) -> Result<()> {
    anyhow::ensure!(
        !suggestion_is_outdated(text),
        "AI suggestion contains internal grouping placeholders instead of original log values. Generate a new suggestion from the original error."
    );
    conn.execute(
        "UPDATE error_groups SET suggestion = ?2, suggestion_model = ?3, suggestion_at = ?4 WHERE id = ?1",
        params![id, text, model, now()],
    )?;
    Ok(())
}

/// Top non-informational groups seen in `[start, end)` that lack a current suggestion.
pub fn groups_needing_suggestion(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    limit: i64,
) -> Result<Vec<i64>> {
    let f = Filter {
        app: None,
        level: "issues".into(),
    };
    Ok(top_groups(conn, start, end, &f, 500)?
        .into_iter()
        .filter(|g| !g.has_suggestion)
        .take(limit as usize)
        .map(|g| g.id)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: i64, msg: &str, ts: &str) -> SourceLog {
        SourceLog {
            log_identifier: id,
            log_app: "Web".into(),
            log_type: "Error".into(),
            log_message: msg.into(),
            log_exception: Some("System.TimeoutException: boom".into()),
            log_severity: 3,
            task_definition_identifier: None,
            task_definition_title: None,
            project_identifier: None,
            project_name: None,
            customer_service_identifier: None,
            class_name: Some("OrderService".into()),
            method_name: Some("Save".into()),
            add_user_account: None,
            server: Some("APP01".into()),
            add_user_identifier: None,
            add_user_name: None,
            add_timestamp: NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S").unwrap(),
        }
    }

    #[test]
    fn entry_details_returns_all_source_fields() {
        let mut connection = open(std::path::Path::new(":memory:")).unwrap();
        let mut source_entry = row(9, "Full failure", "2026-10-13 08:00:00");
        source_entry.log_app = "WebHost".into();
        source_entry.task_definition_identifier = Some(12);
        source_entry.task_definition_title = Some("Orders API".into());
        source_entry.project_identifier = Some(34);
        source_entry.project_name = Some("Orders".into());
        source_entry.customer_service_identifier = Some(56);
        source_entry.add_user_account = Some("DOMAIN\\user".into());
        source_entry.add_user_identifier = Some(78);
        source_entry.add_user_name = Some("Example User".into());
        ingest(&mut connection, &[source_entry]).unwrap();

        let details = entry_details(&connection, 9).unwrap().unwrap();
        let json = serde_json::to_value(details).unwrap();
        assert_eq!(json["log_identifier"], 9);
        assert_eq!(json["log_app"], "WebHost");
        assert_eq!(json["log_type"], "Error");
        assert_eq!(json["log_severity"], 3);
        assert_eq!(json["message"], "Full failure");
        assert_eq!(json["exception"], "System.TimeoutException: boom");
        assert_eq!(json["task_definition_identifier"], 12);
        assert_eq!(json["task_definition_title"], "Orders API");
        assert_eq!(json["project_identifier"], 34);
        assert_eq!(json["project_name"], "Orders");
        assert_eq!(json["customer_service_identifier"], 56);
        assert_eq!(json["class_name"], "OrderService");
        assert_eq!(json["method_name"], "Save");
        assert_eq!(json["add_user_account"], "DOMAIN\\user");
        assert_eq!(json["server"], "APP01");
        assert_eq!(json["add_user_identifier"], 78);
        assert_eq!(json["add_user_name"], "Example User");
        assert_eq!(json["add_timestamp"], "2026-10-13 08:00:00.000");
    }

    #[test]
    fn entries_can_be_filtered_by_multiple_exact_types() {
        let mut connection = open(std::path::Path::new(":memory:")).unwrap();
        let error = row(1, "Failure", "2026-10-13 08:00:00");
        let mut information = row(2, "Started", "2026-10-13 09:00:00");
        information.log_type = "Information".into();
        let mut warning = row(3, "Slow", "2026-10-13 10:00:00");
        warning.log_type = "Warning".into();
        ingest(&mut connection, &[error, information, warning]).unwrap();

        let start = "2026-10-13".parse().unwrap();
        let end = "2026-10-14".parse().unwrap();
        let filter = Filter {
            app: None,
            level: "all".into(),
        };
        let types = entry_types_in_range(&connection, start, end, &filter).unwrap();
        assert_eq!(types, ["Error", "Information", "Warning"]);
        let selected = vec!["Error".into(), "Warning".into()];
        let (entries, total) =
            entries_in_types(&connection, start, end, &filter, &selected, None, 10, 0).unwrap();
        assert_eq!(total, 2);
        assert_eq!(
            entries
                .iter()
                .map(|entry| entry.log_identifier)
                .collect::<Vec<_>>(),
            [3, 1]
        );
        let (entries, total) =
            entries_in_types(&connection, start, end, &filter, &[], None, 10, 0).unwrap();
        assert_eq!(total, 0);
        assert!(entries.is_empty());
    }

    #[test]
    fn entry_lists_match_dashboard_counts_for_each_level_scope_and_severity() {
        let mut c = open(std::path::Path::new(":memory:")).unwrap();
        let mut critical = row(3, "Meltdown", "2026-10-13 09:00:00");
        critical.log_type = "Critical".into();
        let mut info = row(2, "Hello", "2026-10-13 08:30:00");
        info.log_type = "Information".into();
        info.log_severity = 1;
        ingest(
            &mut c,
            &[row(1, "Boom", "2026-10-13 08:00:00"), info, critical],
        )
        .unwrap();
        let (start, end): (NaiveDate, NaiveDate) =
            ("2026-10-13".parse().unwrap(), "2026-10-14".parse().unwrap());
        let list = |level: &str, severity| {
            let f = Filter {
                app: None,
                level: level.into(),
            };
            let (rows, total) = entries_in_range(&c, start, end, &f, severity, 10, 0).unwrap();
            (
                rows.iter().map(|r| r.log_identifier).collect::<Vec<_>>(),
                total,
            )
        };
        assert_eq!(list("all", None), (vec![3, 2, 1], 3));
        assert_eq!(list("issues", None), (vec![3, 1], 2));
        assert_eq!(list("errors", None), (vec![3, 1], 2));
        assert_eq!(list("Critical", None), (vec![3], 1));
        assert_eq!(list("all", Some(1)), (vec![2], 1));
        let f = Filter {
            app: None,
            level: "all".into(),
        };
        let (all, _) = entries_in_range(&c, start, end, &f, None, 10, 0).unwrap();
        let len = |id| {
            all.iter()
                .find(|r| r.log_identifier == id)
                .unwrap()
                .exception_len
        };
        assert_eq!(len(1), "System.TimeoutException: boom".len() as i64);
        let detail = entry_details(&c, 1).unwrap().unwrap();
        assert_eq!(detail.message, "Boom");
        assert!(detail.exception.unwrap().contains("boom"));
        assert!(entry_details(&c, 404).unwrap().is_none());
        let (page, total) = entries_in_range(&c, start, end, &f, None, 2, 2).unwrap();
        assert_eq!((page.len(), total), (1, 3));

        let issues = Filter {
            app: None,
            level: "issues".into(),
        };
        let kinds = kind_groups(&c, start, end, &issues, false, 10).unwrap();
        assert_eq!(
            kinds.len() as i64,
            distinct_group_count(&c, start, end, &issues).unwrap()
        );
        let new = kind_groups(&c, start, end, &issues, true, 10).unwrap();
        assert_eq!(
            new.len() as i64,
            new_group_count(&c, start, end, &issues).unwrap()
        );
        let later: NaiveDate = "2026-10-15".parse().unwrap();
        assert!(
            kind_groups(&c, end, later, &issues, true, 10)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn outdated_suggestions_are_eligible_for_regeneration_and_rejected_on_save() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("suggestions.db");
        let mut c = open(&path).unwrap();
        let original = "Incorrect syntax near the keyword 'RowCount'.";
        ingest(&mut c, &[row(1, original, "2026-10-13 08:00:00")]).unwrap();
        let start = "2026-10-13".parse().unwrap();
        let end = "2026-10-14".parse().unwrap();
        let filter = Filter {
            app: None,
            level: "issues".into(),
        };
        let id = top_groups(&c, start, end, &filter, 10).unwrap()[0].id;
        // Simulate legacy advice, which predates the save-time validation.
        c.execute(
            "UPDATE error_groups SET suggestion = ?1 WHERE id = ?2",
            params!["Check the SQL keyword '<str>'.", id],
        )
        .unwrap();
        drop(c);
        let c = open(&path).unwrap();
        let group = group_detail(&c, id).unwrap().unwrap();
        assert!(suggestion_is_outdated(group.suggestion.as_deref().unwrap()));
        assert_eq!(group.sample_message, original);
        assert_eq!(group.template, normalize::template(original));
        assert!(!top_groups(&c, start, end, &filter, 10).unwrap()[0].has_suggestion);
        assert_eq!(
            groups_needing_suggestion(&c, start, end, 10).unwrap(),
            vec![id]
        );

        let valid = "Quote the RowCount alias with square brackets, then rerun the query.";
        save_suggestion(&c, id, valid, "local").unwrap();
        assert!(top_groups(&c, start, end, &filter, 10).unwrap()[0].has_suggestion);
        assert!(
            groups_needing_suggestion(&c, start, end, 10)
                .unwrap()
                .is_empty()
        );
        for token in [
            "<str>", "<guid>", "<ts>", "<date>", "<email>", "<hex>", "<n>",
        ] {
            let error = save_suggestion(&c, id, &format!("Inspect {token}."), "local").unwrap_err();
            assert!(error.to_string().contains("internal grouping placeholders"));
        }
        let group = group_detail(&c, id).unwrap().unwrap();
        assert_eq!(group.suggestion.as_deref(), Some(valid));
        assert_eq!(group.suggestion_model.as_deref(), Some("local"));
        assert_eq!(group.sample_message, original);
    }

    #[test]
    fn dotnetcats_casing_unifies_app_choices_labels_and_all_filters() {
        let mut c = open(Path::new(":memory:")).unwrap();
        let mut rows = vec![
            row(1, "Shared failure", "2026-10-13 08:00:00"),
            row(2, "Shared failure", "2026-10-13 09:00:00"),
            row(3, "Distinct failure", "2026-10-13 10:00:00"),
            row(4, "Other failure", "2026-10-13 11:00:00"),
        ];
        for (r, app) in rows
            .iter_mut()
            .zip(["DotnetCats", "DotNetCats", "DotNetCats", "CatsWeb"])
        {
            r.log_app = app.into();
        }
        ingest(&mut c, &rows).unwrap();
        assert_eq!(distinct_apps(&c).unwrap(), vec!["CatsWeb", "DotNetCats"]);
        let start = "2026-10-13".parse().unwrap();
        let end = "2026-10-14".parse().unwrap();
        for app in ["DotNetCats", "DotnetCats", "dotnetcats"] {
            let filter = Filter {
                app: Some(app.into()),
                level: "all".into(),
            };
            assert_eq!(
                counts_by_type(&c, start, end, &filter).unwrap(),
                vec![("Error".into(), 3)]
            );
            assert_eq!(
                counts_by_severity(&c, start, end, &filter)
                    .unwrap()
                    .iter()
                    .map(|r| r.2)
                    .sum::<i64>(),
                3
            );
            for hourly in [false, true] {
                assert_eq!(
                    counts_by_bucket(&c, start, end, &filter, hourly)
                        .unwrap()
                        .iter()
                        .map(|r| r.2)
                        .sum::<i64>(),
                    3
                );
            }
            let groups = top_groups(&c, start, end, &filter, 10).unwrap();
            assert_eq!(groups.len(), 2);
            assert_eq!(groups.iter().map(|g| g.count).sum::<i64>(), 3);
            assert!(groups.iter().all(|g| g.log_app == "DotNetCats"));
            for group in &groups {
                assert_eq!(
                    group_detail(&c, group.id).unwrap().unwrap().log_app,
                    "DotNetCats"
                );
            }
            assert_eq!(new_group_count(&c, start, end, &filter).unwrap(), 2);
            assert_eq!(distinct_group_count(&c, start, end, &filter).unwrap(), 2);
        }
        assert_eq!(canonical_app("CatsWeb"), "CatsWeb");
        assert_eq!(canonical_app("catsweb"), "catsweb");
        assert_eq!(
            c.query_row(
                "SELECT log_app FROM log_entries WHERE log_identifier=1",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "DotnetCats"
        );
        assert_eq!(
            c.query_row(
                "SELECT log_app FROM error_groups WHERE sample_message='Shared failure'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "DotnetCats"
        );
    }

    #[test]
    fn login_updates_are_information_for_reports_filters_and_suggestions() {
        let mut c = open(Path::new(":memory:")).unwrap();
        let mut rows = vec![
            row(
                1,
                "User A of Team Updated User/Login",
                "2026-10-13 08:00:00",
            ),
            row(2, "User B updated user/login  ", "2026-10-13 09:00:00"),
            row(3, "Updated User/Login failed", "2026-10-13 10:00:00"),
        ];
        for r in &mut rows {
            r.log_type.clear();
        }
        ingest(&mut c, &rows).unwrap();
        let start = "2026-10-13".parse().unwrap();
        let end = "2026-10-14".parse().unwrap();
        let info = Filter {
            app: None,
            level: "Info".into(),
        };
        assert_eq!(
            counts_by_type(&c, start, end, &info).unwrap(),
            vec![("Information".into(), 2), ("".into(), 1)]
        );
        assert_eq!(
            counts_by_severity(&c, start, end, &info)
                .unwrap()
                .iter()
                .filter(|r| r.1 == "Information")
                .map(|r| r.2)
                .sum::<i64>(),
            2
        );
        for hourly in [false, true] {
            assert_eq!(
                counts_by_bucket(&c, start, end, &info, hourly)
                    .unwrap()
                    .iter()
                    .filter(|r| r.1 == "Information")
                    .map(|r| r.2)
                    .sum::<i64>(),
                2
            );
        }
        let groups = top_groups(&c, start, end, &info, 10).unwrap();
        assert_eq!(groups.len(), 2);
        assert!(groups.iter().all(|g| g.log_type == "Information"));
        assert_eq!(new_group_count(&c, start, end, &info).unwrap(), 2);
        assert_eq!(distinct_group_count(&c, start, end, &info).unwrap(), 2);
        assert_eq!(
            group_detail(&c, groups[0].id).unwrap().unwrap().log_type,
            "Information"
        );
        assert_eq!(
            distinct_types(&c).unwrap(),
            vec!["".to_string(), "Information".to_string()]
        );
        let issues = Filter {
            app: None,
            level: "issues".into(),
        };
        let issue_groups = top_groups(&c, start, end, &issues, 10).unwrap();
        assert_eq!(issue_groups.len(), 1);
        assert_eq!(
            groups_needing_suggestion(&c, start, end, 10).unwrap(),
            vec![issue_groups[0].id]
        );
        assert_eq!(
            c.query_row(
                "SELECT log_type FROM log_entries WHERE log_identifier=1",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            ""
        );
    }

    #[test]
    fn information_aliases_merge_in_reports_and_filters_without_changing_storage() {
        let mut c = open(Path::new(":memory:")).unwrap();
        let mut rows = vec![
            row(1, "First event", "2026-10-13 08:00:00"),
            row(2, "Second event", "2026-10-13 08:00:00"),
            row(3, "Third event", "2026-10-13 08:00:00"),
            row(4, "Unknown event", "2026-10-13 08:00:00"),
        ];
        for (r, level) in rows
            .iter_mut()
            .zip(["Info", "Information", " informational ", ""])
        {
            r.log_type = level.into();
        }
        ingest(&mut c, &rows).unwrap();
        let start = "2026-10-13".parse().unwrap();
        let end = "2026-10-14".parse().unwrap();
        let all = Filter {
            app: None,
            level: "all".into(),
        };
        assert_eq!(
            counts_by_type(&c, start, end, &all).unwrap(),
            vec![("Information".into(), 3), ("".into(), 1)]
        );
        assert_eq!(
            counts_by_severity(&c, start, end, &all)
                .unwrap()
                .iter()
                .filter(|(_, t, _)| t == "Information")
                .map(|r| r.2)
                .sum::<i64>(),
            3
        );
        for hourly in [true, false] {
            assert_eq!(
                counts_by_bucket(&c, start, end, &all, hourly)
                    .unwrap()
                    .iter()
                    .filter(|(_, t, _)| t == "Information")
                    .map(|r| r.2)
                    .sum::<i64>(),
                3
            );
        }
        assert_eq!(
            distinct_types(&c).unwrap(),
            vec!["".to_string(), "Information".to_string()]
        );
        for level in ["Info", "Information", "informational"] {
            let f = Filter {
                app: None,
                level: level.into(),
            };
            let top = top_groups(&c, start, end, &f, 10).unwrap();
            assert_eq!(top.len(), 3);
            assert!(top.iter().all(|g| g.log_type == "Information"));
            assert_eq!(new_group_count(&c, start, end, &f).unwrap(), 3);
            assert_eq!(
                group_detail(&c, top[0].id).unwrap().unwrap().log_type,
                "Information"
            );
        }
        let issues = Filter {
            app: None,
            level: "issues".into(),
        };
        assert_eq!(top_groups(&c, start, end, &issues, 10).unwrap().len(), 1);
        assert_eq!(
            c.query_row(
                "SELECT log_type FROM log_entries WHERE log_identifier=1",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "Info"
        );
    }

    #[test]
    fn ingest_groups_and_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let mut c = open(&dir.path().join("t.db")).unwrap();
        let rows = vec![
            row(1, "Order 12 timed out", "2026-10-13 08:00:00"),
            row(2, "Order 99 timed out", "2026-10-13 09:00:00"),
            row(3, "Disk full on D:", "2026-10-12 09:00:00"),
        ];
        assert_eq!(ingest(&mut c, &rows).unwrap(), 3);
        assert_eq!(ingest(&mut c, &rows).unwrap(), 0);
        let d = |s: &str| s.parse::<NaiveDate>().unwrap();
        let f = Filter {
            app: None,
            level: "issues".into(),
        };
        let top = top_groups(&c, d("2026-10-12"), d("2026-10-14"), &f, 10).unwrap();
        assert_eq!(top.len(), 2);
        assert_eq!(top[0].count, 2);
        let entries = group_entries(&c, top[0].id, 50).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(
            entries[0].exception.as_deref(),
            rows[1].log_exception.as_deref()
        );
        assert_eq!(top[0].first_seen, "2026-10-13 08:00:00.000");
        assert_eq!(
            new_group_count(&c, d("2026-10-13"), d("2026-10-14"), &f).unwrap(),
            1
        );
    }
}
