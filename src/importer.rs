//! Daily import pipeline: SQL Server -> SQLite for one calendar day, plus catch-up for missed days.
//! Used by the CLI (`bunyan import`), the web "Run import" form, and the built-in scheduler.

use crate::config::Config;
use crate::{db, llm, source};
use anyhow::Result;
use chrono::{Duration, Local, NaiveDate};
use tokio::sync::Mutex;

/// Serializes imports so a manual run and the scheduler never overlap.
pub(crate) static IMPORT_LOCK: Mutex<()> = Mutex::const_new(());

pub fn yesterday() -> NaiveDate {
    Local::now().date_naive() - Duration::days(1)
}

/// Imports one day and records the outcome in `import_runs`. Returns `(fetched, inserted)`.
pub async fn import_day(cfg: &Config, day: NaiveDate, trigger: &str) -> Result<(usize, usize)> {
    let _guard = IMPORT_LOCK.lock().await;
    let path = cfg.sqlite.path.clone();
    let run_id = {
        let conn = db::open(&path)?;
        db::start_run(&conn, day, trigger)?
    };
    let result = async {
        let mapping = cfg.log_schema()?;
        let rows = source::fetch_day(&cfg.sqlserver, &mapping, day).await?;
        let fetched = rows.len();
        let path = path.clone();
        let inserted = tokio::task::spawn_blocking(move || -> Result<usize> {
            let mut conn = db::open(&path)?;
            db::ingest(&mut conn, &rows)
        })
        .await??;
        Ok((fetched, inserted))
    }
    .await;
    let conn = db::open(&path)?;
    db::finish_run(&conn, run_id, &result)?;
    match &result {
        Ok((f, i)) => tracing::info!(%day, fetched = f, inserted = i, "import ok"),
        Err(e) => tracing::error!(%day, error = %format!("{e:#}"), "import failed"),
    }
    result
}

/// Days still to import: everything after the last successful day through yesterday,
/// capped at `max_catchup_days`. With no history, just yesterday.
pub fn pending_days(cfg: &Config) -> Result<Vec<NaiveDate>> {
    let conn = db::open(&cfg.sqlite.path)?;
    let y = yesterday();
    let first = match db::last_successful_day(&conn)? {
        Some(last) => last + Duration::days(1),
        None => y,
    };
    let floor = y - Duration::days(cfg.schedule.max_catchup_days.max(1) as i64 - 1);
    let mut d = first.max(floor);
    let mut out = Vec::new();
    while d <= y {
        out.push(d);
        d += Duration::days(1);
    }
    Ok(out)
}

/// Scheduled job body: catch-up import, then optional LLM suggestions for the newest top errors.
pub async fn run_scheduled(cfg: &Config) {
    let days = match pending_days(cfg) {
        Ok(d) => d,
        Err(e) => {
            tracing::error!("cannot compute pending days: {e:#}");
            return;
        }
    };
    if days.is_empty() {
        tracing::info!("nothing to import; already up to date");
    }
    for day in &days {
        let _ = import_day(cfg, *day, "schedule").await;
    }
    if cfg.schedule.auto_suggest_top > 0 {
        let end = yesterday() + Duration::days(1);
        let start = end - Duration::days(7);
        if let Err(e) =
            llm::suggest_top(cfg, start, end, cfg.schedule.auto_suggest_top as i64).await
        {
            tracing::warn!("auto-suggest skipped: {e:#}");
        }
    }
}
