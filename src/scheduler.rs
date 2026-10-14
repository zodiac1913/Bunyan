//! In-process daily scheduler (no cron / Task Scheduler / launchd needed, so it behaves the same on
//! Windows, Linux, and macOS). Runs while `bunyan serve` is up; wakes every 30s and compares wall-clock
//! time so sleep/hibernate or DST shifts cannot make it skip a day.

use crate::config::Config;
use crate::importer;
use chrono::{Local, NaiveDate};
use std::sync::Arc;
use tokio::sync::watch;

/// Logged-out workstations pause new imports. Already-running work keeps its captured credentials.
pub async fn run(
    cfg: Config,
    authenticated: watch::Receiver<Option<(Arc<Config>, std::time::Instant)>>,
) {
    let at = match cfg.schedule.time() {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("scheduler disabled: {e:#}");
            return;
        }
    };
    tracing::info!(
        "scheduler: daily import at {} local time",
        at.format("%H:%M")
    );
    // Starting after today's slot triggers an immediate run; `pending_days` makes it a no-op if
    // yesterday is already imported, and imports missed days otherwise.
    let mut last_run: Option<NaiveDate> = None;
    loop {
        let now = Local::now();
        let today = now.date_naive();
        let active = authenticated
            .borrow()
            .clone()
            .filter(|(_, expires)| *expires > std::time::Instant::now())
            .map(|(active, _)| active);
        let active = if cfg.web.require_login {
            active
        } else {
            Some(Arc::new(cfg.clone()))
        };
        if let Some(active) = active
            && now.time() >= at
            && last_run != Some(today)
        {
            last_run = Some(today);
            tracing::info!("scheduler: starting daily import");
            importer::run_scheduled(&active).await;
        }
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
    }
}
