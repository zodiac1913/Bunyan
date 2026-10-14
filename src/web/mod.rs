//! HTTP server (axum) rendering HTML with maud. Navigation is plain links and GET forms, so the
//! browser needs no JavaScript. Long jobs (imports, LLM suggestions) run as background tasks and
//! pages auto-refresh via `<meta http-equiv="refresh">` while they are pending.

mod auth;
mod charts;
mod pages;
mod settings;
mod style;

use crate::config::Config;
use crate::db::{self, Filter};
use crate::periods::Period;
use crate::{importer, llm};
use anyhow::Result;
use axum::extract::{Form, Path, Query};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::{Extension, Router, middleware};
use chrono::{Duration, NaiveDate};
use rusqlite::Connection;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

pub use charts::Series;

/// Shared state. `suggesting`/`suggest_errors` track background LLM jobs by group id.
#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<Config>,
    auth: Arc<auth::Auth>,
    suggesting: Arc<Mutex<HashSet<i64>>>,
    suggest_errors: Arc<Mutex<HashMap<i64, String>>>,
}

/// Login uses local HTTP only: refuse remote listeners rather than exposing SQL passwords over HTTP.
pub async fn serve(cfg: Config, schedule: bool) -> Result<()> {
    let bind = cfg.web.bind.clone();
    let open_browser = cfg.web.open_browser;
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    let address = listener.local_addr()?;
    anyhow::ensure!(
        address.ip().is_loopback(),
        "SQL login requires a loopback web.bind (127.0.0.1 or ::1). Remote HTTP login is not supported."
    );
    let (auth, authenticated) = auth::Auth::new(&cfg, address.port())?;
    if cfg.schedule.enabled && schedule {
        tokio::spawn(crate::scheduler::run(cfg.clone(), authenticated));
    }
    let state = AppState {
        cfg: Arc::new(cfg),
        auth: Arc::new(auth),
        suggesting: Default::default(),
        suggest_errors: Default::default(),
    };
    let app = router(state);
    let url = browser_url(address);
    tracing::info!("web UI at {url}");
    if open_browser {
        // Run the OS launcher off the async thread; failure must not stop the web server.
        tokio::task::spawn_blocking(move || {
            if let Err(error) = open::that(&url) {
                tracing::warn!("Cannot open default browser: {error}. Open {url} manually.");
            }
        });
    }
    axum::serve(listener, app).await?;
    Ok(())
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/login", get(auth::page).post(auth::login))
        .route("/logout", post(auth::logout))
        .route("/", get(dashboard))
        .route("/assets/bunyan.jpeg", get(background_image))
        .route("/groups/{id}", get(group_page))
        .route("/groups/{id}/suggest", post(suggest))
        .route("/imports", get(imports_page).post(run_import))
        .route("/settings", get(settings::page).post(settings::update))
        .route("/health", get(|| async { "ok" }))
        .layer(middleware::from_fn_with_state(state.clone(), auth::guard))
        .with_state(state)
}

/// Embed the artwork so the dashboard needs no asset files beside the executable.
async fn background_image() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/jpeg")],
        include_bytes!("../../assets/bunyan.jpeg").as_slice(),
    )
}

/// Wildcard bind addresses are listener targets, not browser destinations.
fn browser_url(mut address: std::net::SocketAddr) -> String {
    if address.ip().is_unspecified() {
        address.set_ip(match address.ip() {
            std::net::IpAddr::V4(_) => std::net::Ipv4Addr::LOCALHOST.into(),
            std::net::IpAddr::V6(_) => std::net::Ipv6Addr::LOCALHOST.into(),
        });
    }
    format!("http://{address}/")
}

#[cfg(test)]
mod browser_tests {
    use super::*;

    #[test]
    fn dashboard_defaults_and_explicit_filters_survive_navigation() {
        let conn = db::open(std::path::Path::new(":memory:")).unwrap();
        let dash = build_dash(&conn, DashQuery::default()).unwrap();
        assert_eq!(dash.filter.app.as_deref(), Some("DotNetCats"));
        assert_eq!(dash.filter.level, "all");
        let markup = pages::dashboard(&dash).into_string();
        assert!(markup.find("All levels").unwrap() < markup.find("Issues (non-info)").unwrap());
        assert!(
            dash.url(Some(Period::Week), None)
                .contains("&app=DotNetCats")
        );
        for (app, expected) in [
            ("", None),
            ("CatsWeb", Some("CatsWeb")),
            ("DotnetCats", Some("DotNetCats")),
        ] {
            let dash = build_dash(
                &conn,
                DashQuery {
                    app: Some(app.into()),
                    level: Some("issues".into()),
                    ..Default::default()
                },
            )
            .unwrap();
            assert_eq!(dash.filter.app.as_deref(), expected);
            assert_eq!(dash.filter.level, "issues");
            assert!(
                dash.url(None, None)
                    .ends_with(&format!("&app={}", expected.unwrap_or("")))
            );
            let markup = pages::dashboard(&dash).into_string();
            assert!(markup.contains(&format!(
                "level=issues&amp;app={}\">Latest",
                expected.unwrap_or("")
            )));
        }
    }

    #[tokio::test]
    async fn background_is_embedded_and_served_as_jpeg() {
        let response = background_image().await.into_response();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "image/jpeg");
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(bytes.as_ref(), include_bytes!("../../assets/bunyan.jpeg"));
        assert!(bytes.starts_with(&[0xff, 0xd8, 0xff]));
    }

    #[test]
    fn browser_addresses_support_loopback_wildcards_and_ipv6() {
        for (bind, expected) in [
            ("127.0.0.1:8080", "http://127.0.0.1:8080/"),
            ("0.0.0.0:8080", "http://127.0.0.1:8080/"),
            ("[::]:8080", "http://[::1]:8080/"),
            ("[::1]:8080", "http://[::1]:8080/"),
        ] {
            assert_eq!(browser_url(bind.parse().unwrap()), expected);
        }
        assert!(Config::default().web.open_browser);
    }
}

// ---------- errors & db helper ----------

pub struct AppError(anyhow::Error);

impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(e: E) -> Self {
        AppError(e.into())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        tracing::error!("request failed: {:#}", self.0);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            pages::error_page(&format!("{:#}", self.0)),
        )
            .into_response()
    }
}

/// Runs a blocking SQLite closure on the blocking pool with a fresh connection.
async fn with_db<T, F>(st: &AppState, f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce(&Connection) -> Result<T> + Send + 'static,
{
    let path = st.cfg.sqlite.path.clone();
    Ok(tokio::task::spawn_blocking(move || f(&db::open(&path)?)).await??)
}

// ---------- log level presentation ----------

/// Sort order: critical/fatal, error, warning, info, debug/trace, other.
pub fn type_rank(t: &str) -> u8 {
    let l = t.to_lowercase();
    if l.contains("crit") || l.contains("fatal") {
        0
    } else if l.contains("err") {
        1
    } else if l.contains("warn") {
        2
    } else if l.starts_with("info") {
        3
    } else if db::is_informational(&l) {
        4
    } else {
        5
    }
}

pub fn type_color(t: &str) -> String {
    match type_rank(t) {
        0 => "#7f1d1d".into(),
        1 => "#dc2626".into(),
        2 => "#f59e0b".into(),
        3 => "#3b82f6".into(),
        4 => "#9ca3af".into(),
        _ => {
            const PALETTE: [&str; 5] = ["#0d9488", "#7c3aed", "#db2777", "#65a30d", "#0891b2"];
            PALETTE[t.bytes().map(usize::from).sum::<usize>() % PALETTE.len()].into()
        }
    }
}

fn sort_types(types: &mut [String]) {
    types.sort_by(|a, b| type_rank(a).cmp(&type_rank(b)).then_with(|| a.cmp(b)));
}

/// Percent-encodes a query-string value.
pub fn enc(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

// ---------- dashboard ----------

#[derive(Deserialize, Default)]
pub struct DashQuery {
    period: Option<String>,
    date: Option<String>,
    app: Option<String>,
    level: Option<String>,
}

pub struct Dash {
    pub period: Period,
    pub anchor: NaiveDate,
    pub start: NaiveDate,
    pub end: NaiveDate,
    pub filter: Filter,
    /// `Some(n)` when the period is in progress; deltas compare the first `n` days of each.
    pub partial_days: Option<i64>,
    pub apps: Vec<String>,
    pub types: Vec<String>,
    pub total: i64,
    pub prev_total: i64,
    pub issues: i64,
    pub prev_issues: i64,
    pub errors: i64,
    pub prev_errors: i64,
    pub distinct_groups: i64,
    pub new_groups: i64,
    pub by_type: Vec<(String, i64)>,
    pub severities: Vec<i64>,
    pub sev_types: Vec<String>,
    pub sev_counts: HashMap<(i64, String), i64>,
    pub bucket_labels: Vec<String>,
    pub bucket_series: Vec<Series>,
    pub trend_labels: Vec<String>,
    pub trend_series: Vec<Series>,
    pub top: Vec<db::GroupRow>,
    pub prev_counts: HashMap<i64, i64>,
}

impl Dash {
    /// Builds a dashboard URL keeping current filters; `None` keeps the current value.
    pub fn url(&self, period: Option<Period>, date: Option<NaiveDate>) -> String {
        let mut u = format!(
            "/?period={}&date={}&level={}",
            period.unwrap_or(self.period).as_str(),
            date.unwrap_or(self.anchor),
            enc(&self.filter.level)
        );
        // An explicit empty app preserves "All apps" instead of restoring the default app.
        u += &format!("&app={}", enc(self.filter.app.as_deref().unwrap_or("")));
        u
    }
}

fn series_from(
    types: &[String],
    buckets: usize,
    mut lookup: impl FnMut(&str, usize) -> i64,
) -> Vec<Series> {
    types
        .iter()
        .map(|t| Series {
            name: t.clone(),
            color: type_color(t),
            values: (0..buckets).map(|i| lookup(t, i)).collect(),
        })
        .collect()
}

fn build_dash(conn: &Connection, q: DashQuery) -> Result<Dash> {
    let period = Period::parse(q.period.as_deref().unwrap_or("day"));
    let anchor = match q.date.as_deref().and_then(|d| d.parse().ok()) {
        Some(d) => d,
        None => db::latest_day(conn)?.unwrap_or_else(importer::yesterday),
    };
    let filter = Filter {
        app: q
            .app
            .or_else(|| Some("DotNetCats".into()))
            .filter(|a| !a.is_empty())
            .map(|a| db::canonical_app(&a).to_string()),
        level: q
            .level
            .filter(|l| !l.is_empty())
            .map(|l| db::canonical_level(&l).to_string())
            .unwrap_or_else(|| "all".into()),
    };
    let (start, end) = period.range(anchor);
    // If the period is still in progress (data stops before `end`), compare against the same
    // number of days at the start of the previous period instead of the whole thing.
    let data_end = match db::latest_day(conn)? {
        Some(l) => end.min(l + Duration::days(1)),
        None => end,
    };
    let partial_days = (data_end > start && data_end < end).then(|| (data_end - start).num_days());
    let pstart = period.prev_start(anchor);
    let pend = match partial_days {
        Some(n) => period.next_start(pstart).min(pstart + Duration::days(n)),
        None => period.next_start(pstart),
    };

    let mut by_type = db::counts_by_type(conn, start, end, &filter)?;
    by_type.sort_by(|a, b| type_rank(&a.0).cmp(&type_rank(&b.0)).then(b.1.cmp(&a.1)));
    let prev_by_type = db::counts_by_type(conn, pstart, pend, &filter)?;
    let sum = |rows: &[(String, i64)], pred: &dyn Fn(&str) -> bool| -> i64 {
        rows.iter().filter(|(t, _)| pred(t)).map(|(_, c)| c).sum()
    };
    let is_issue = |t: &str| !db::is_informational(t);
    let is_error = |t: &str| type_rank(t) <= 1;

    let sev_rows = db::counts_by_severity(conn, start, end, &filter)?;
    let mut severities: Vec<i64> = sev_rows.iter().map(|r| r.0).collect();
    severities.dedup();
    let mut sev_types: Vec<String> = sev_rows
        .iter()
        .map(|r| r.1.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    sort_types(&mut sev_types);
    let sev_counts = sev_rows.into_iter().map(|(s, t, c)| ((s, t), c)).collect();

    // Types present in either the period or the trend window, so colors/legend stay consistent.
    let trend_starts = period.trend_buckets(anchor);
    let trend_end = period.next_start(*trend_starts.last().expect("non-empty trend"));
    let trend_rows = db::counts_by_bucket(conn, trend_starts[0], trend_end, &filter, false)?;
    let mut chart_types: Vec<String> = trend_rows
        .iter()
        .map(|r| r.1.clone())
        .chain(by_type.iter().map(|r| r.0.clone()))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    sort_types(&mut chart_types);

    let hourly = period == Period::Day;
    let bucket_rows = db::counts_by_bucket(conn, start, end, &filter, hourly)?;
    let bucket_keys: Vec<String> = if hourly {
        (0..24).map(|h| format!("{h:02}")).collect()
    } else {
        start
            .iter_days()
            .take_while(|d| *d < end)
            .map(|d| d.to_string())
            .collect()
    };
    let bucket_map: HashMap<(String, String), i64> = bucket_rows
        .into_iter()
        .map(|(b, t, c)| ((b, t), c))
        .collect();
    let bucket_series = series_from(&chart_types, bucket_keys.len(), |t, i| {
        *bucket_map
            .get(&(bucket_keys[i].clone(), t.to_string()))
            .unwrap_or(&0)
    });
    let bucket_labels = bucket_keys
        .iter()
        .map(|k| match k.parse::<NaiveDate>() {
            Ok(d) if period == Period::Week => d.format("%a %m/%d").to_string(),
            Ok(d) => d.format("%-d").to_string(),
            Err(_) => format!("{k}:00"),
        })
        .collect();

    let mut trend_map: HashMap<(NaiveDate, String), i64> = HashMap::new();
    for (day, t, c) in trend_rows {
        if let Ok(d) = day.parse::<NaiveDate>() {
            *trend_map.entry((period.start_of(d), t)).or_default() += c;
        }
    }
    let trend_series = series_from(&chart_types, trend_starts.len(), |t, i| {
        *trend_map
            .get(&(trend_starts[i], t.to_string()))
            .unwrap_or(&0)
    });
    let trend_labels = trend_starts
        .iter()
        .map(|d| period.bucket_label(*d))
        .collect();

    let top = db::top_groups(conn, start, end, &filter, 25)?;
    let ids: Vec<i64> = top.iter().map(|g| g.id).collect();
    let prev_counts = db::group_counts(conn, &ids, pstart, pend)?;
    let mut types = db::distinct_types(conn)?;
    sort_types(&mut types);

    Ok(Dash {
        period,
        anchor,
        start,
        end,
        apps: db::distinct_apps(conn)?,
        types,
        total: sum(&by_type, &|_| true),
        prev_total: sum(&prev_by_type, &|_| true),
        issues: sum(&by_type, &is_issue),
        prev_issues: sum(&prev_by_type, &is_issue),
        errors: sum(&by_type, &is_error),
        prev_errors: sum(&prev_by_type, &is_error),
        distinct_groups: db::distinct_group_count(conn, start, end, &filter)?,
        new_groups: db::new_group_count(conn, start, end, &filter)?,
        filter,
        partial_days,
        by_type,
        severities,
        sev_types,
        sev_counts,
        bucket_labels,
        bucket_series,
        trend_labels,
        trend_series,
        top,
        prev_counts,
    })
}

async fn dashboard(
    Extension(st): Extension<AppState>,
    Query(q): Query<DashQuery>,
) -> Result<Response, AppError> {
    let dash = with_db(&st, move |c| build_dash(c, q)).await?;
    Ok(pages::dashboard(&dash).into_response())
}

// ---------- group detail & suggestions ----------

pub struct GroupView {
    pub g: db::GroupDetail,
    pub daily_labels: Vec<String>,
    pub daily: Vec<Series>,
    pub severities: Vec<(i64, i64)>,
    pub entries: Vec<db::EntryRow>,
    pub suggesting: bool,
    pub suggest_error: Option<String>,
    pub model: String,
    pub source_configured: bool,
}

async fn group_page(
    Extension(st): Extension<AppState>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let data = with_db(&st, move |c| {
        let Some(g) = db::group_detail(c, id)? else {
            return Ok(None);
        };
        let last: NaiveDate = g
            .last_seen
            .get(..10)
            .and_then(|s| s.parse().ok())
            .unwrap_or_else(importer::yesterday);
        let (start, end) = (last - Duration::days(29), last + Duration::days(1));
        let counts = db::group_daily(c, id, start, end)?;
        let days: Vec<NaiveDate> = start.iter_days().take_while(|d| *d < end).collect();
        let series = vec![Series {
            name: g.log_type.clone(),
            color: type_color(&g.log_type),
            values: days
                .iter()
                .map(|d| *counts.get(&d.to_string()).unwrap_or(&0))
                .collect(),
        }];
        let labels = days.iter().map(|d| d.format("%m/%d").to_string()).collect();
        Ok(Some((
            g,
            labels,
            series,
            db::group_severities(c, id)?,
            db::group_entries(c, id, 50)?,
        )))
    })
    .await?;
    let Some((g, daily_labels, daily, severities, entries)) = data else {
        return Ok((
            StatusCode::NOT_FOUND,
            pages::error_page("Error group not found."),
        )
            .into_response());
    };
    let view = GroupView {
        g,
        daily_labels,
        daily,
        severities,
        entries,
        suggesting: st.suggesting.lock().unwrap().contains(&id),
        suggest_error: st.suggest_errors.lock().unwrap().get(&id).cloned(),
        model: st.cfg.ollama.model.clone(),
        source_configured: st.cfg.source.root.is_some(),
    };
    Ok(pages::group(&view).into_response())
}

async fn suggest(Extension(st): Extension<AppState>, Path(id): Path<i64>) -> Redirect {
    if st.suggesting.lock().unwrap().insert(id) {
        st.suggest_errors.lock().unwrap().remove(&id);
        let st2 = st.clone();
        tokio::spawn(async move {
            if let Err(e) = llm::suggest_group(&st2.cfg, id).await {
                st2.suggest_errors
                    .lock()
                    .unwrap()
                    .insert(id, format!("{e:#}"));
            }
            st2.suggesting.lock().unwrap().remove(&id);
        });
    }
    Redirect::to(&format!("/groups/{id}"))
}

// ---------- imports ----------

#[derive(Deserialize)]
struct ImportForm {
    day: String,
}

async fn imports_page(Extension(st): Extension<AppState>) -> Result<Response, AppError> {
    let runs = with_db(&st, |c| db::recent_runs(c, 60)).await?;
    let source_label = format!(
        "{} · {}",
        st.cfg.sqlserver.connection_label()?,
        st.cfg.log_schema()?.table
    );
    Ok(pages::imports(&st.cfg, &runs, importer::yesterday(), &source_label).into_response())
}

async fn run_import(
    Extension(st): Extension<AppState>,
    Form(f): Form<ImportForm>,
) -> Result<Redirect, AppError> {
    let day: NaiveDate = f
        .day
        .parse()
        .map_err(|_| anyhow::anyhow!("invalid date {:?}", f.day))?;
    let cfg = st.cfg.clone();
    tokio::spawn(async move {
        let _ = importer::import_day(&cfg, day, "manual").await;
    });
    // Give the run a moment to register so the redirected page shows it as running.
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    Ok(Redirect::to("/imports"))
}
