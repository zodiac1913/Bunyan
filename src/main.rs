//! Bunyan: pulls `CORE.Log` rows from SQL Server into SQLite daily, groups like errors,
//! and serves a dashboard of level/severity counts and day/week/month trends with LLM fix suggestions.

mod config;
mod db;
mod demo;
mod importer;
mod llm;
mod log_schema;
mod normalize;
mod periods;
mod scheduler;
mod source;
mod web;

use anyhow::{Result, bail};
use chrono::{Duration, NaiveDate};
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "bunyan",
    version,
    about = "SQL Server log summarizer and trend dashboard"
)]
struct Cli {
    /// Path to the TOML config file.
    #[arg(short, long, global = true, default_value = "bunyan.toml")]
    config: PathBuf,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run the web UI and the daily scheduler.
    Serve {
        /// Do not run the built-in daily import scheduler.
        #[arg(long)]
        no_schedule: bool,
    },
    /// Import log rows from SQL Server. Default: missed days through yesterday (same as the scheduler).
    Import {
        /// Import a single day (YYYY-MM-DD).
        #[arg(long, conflicts_with_all = ["from", "to"])]
        date: Option<NaiveDate>,
        /// First day of a backfill range (inclusive).
        #[arg(long, requires = "to")]
        from: Option<NaiveDate>,
        /// Last day of a backfill range (inclusive).
        #[arg(long, requires = "from")]
        to: Option<NaiveDate>,
    },
    /// Generate LLM fix suggestions with local Ollama.
    Suggest {
        /// A specific error group id.
        #[arg(long)]
        group: Option<i64>,
        /// Otherwise: the top N issue groups lacking a suggestion...
        #[arg(long, default_value_t = 10)]
        top: i64,
        /// ...seen in the last N days.
        #[arg(long, default_value_t = 7)]
        days: i64,
    },
    /// Test the SQL Server connection and read permission.
    Check,
    /// Fill SQLite with synthetic data to explore the UI without SQL Server.
    SeedDemo {
        #[arg(long, default_value_t = 120)]
        days: u32,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "bunyan=info".into()),
        )
        .init();
    let cli = Cli::parse();
    let cfg = config::Config::load(&cli.config)?;

    match cli.command {
        Command::Serve { no_schedule } => {
            db::fail_stale_runs(&db::open(&cfg.sqlite.path)?)?;
            web::serve(cfg, !no_schedule).await?;
        }
        Command::Import { date, from, to } => {
            let days = match (date, from, to) {
                (Some(d), _, _) => vec![d],
                (None, Some(f), Some(t)) => {
                    if t < f {
                        bail!("--to must not be before --from");
                    }
                    f.iter_days().take_while(|d| *d <= t).collect()
                }
                _ => importer::pending_days(&cfg)?,
            };
            if days.is_empty() {
                println!("Already up to date.");
            }
            let mut failed = 0;
            for d in days {
                match importer::import_day(&cfg, d, "cli").await {
                    Ok((f, i)) => println!("{d}: fetched {f}, new {i}"),
                    Err(e) => {
                        failed += 1;
                        eprintln!("{d}: FAILED {e:#}");
                    }
                }
            }
            if failed > 0 {
                bail!("{failed} day(s) failed");
            }
        }
        Command::Suggest { group, top, days } => match group {
            Some(id) => println!("{}", llm::suggest_group(&cfg, id).await?),
            None => {
                let end = importer::yesterday() + Duration::days(1);
                let n = llm::suggest_top(&cfg, end - Duration::days(days), end, top).await?;
                println!("Generated {n} suggestion(s).");
            }
        },
        Command::Check => {
            let mapping = cfg.log_schema()?;
            let (rows, latest) = source::ping(&cfg.sqlserver, &mapping).await?;
            println!(
                "Connected. {} has {rows} rows; latest timestamp: {latest:?}",
                mapping.table
            );
        }
        Command::SeedDemo { days } => {
            let n = demo::seed(&cfg.sqlite.path, days, importer::yesterday())?;
            println!("Inserted {n} demo rows into {}", cfg.sqlite.path.display());
        }
    }
    Ok(())
}
