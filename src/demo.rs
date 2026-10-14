//! `bunyan seed-demo`: fills SQLite with synthetic `CORE.Log`-shaped rows so the UI can be explored
//! without SQL Server. Goes through the real `db::ingest` path, so grouping is exercised too.

use crate::db::{self, SourceLog};
use anyhow::Result;
use chrono::{Duration, NaiveDate};
use std::path::Path;

/// Tiny deterministic xorshift PRNG; avoids a `rand` dependency for demo data.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

struct Kind {
    app: &'static str,
    log_type: &'static str,
    severity: i32,
    class: &'static str,
    method: &'static str,
    message: &'static str,
    exception: Option<&'static str>,
    weight: u64,
}

const KINDS: &[Kind] = &[
    Kind {
        app: "CATS.Web",
        log_type: "Information",
        severity: 1,
        class: "LoginController",
        method: "Login",
        message: "User {u} logged in",
        exception: None,
        weight: 300,
    },
    Kind {
        app: "CATS.Tasks",
        log_type: "Information",
        severity: 1,
        class: "TaskRunner",
        method: "Execute",
        message: "Task {n} completed in {n} ms",
        exception: None,
        weight: 250,
    },
    Kind {
        app: "CATS.Web",
        log_type: "Warning",
        severity: 2,
        class: "ProjectService",
        method: "Load",
        message: "Project {n} load took {n} ms (threshold 2000 ms)",
        exception: None,
        weight: 80,
    },
    Kind {
        app: "CATS.Tasks",
        log_type: "Warning",
        severity: 2,
        class: "EmailSender",
        method: "Send",
        message: "Retrying email to '{u}@example.com' attempt {n}",
        exception: None,
        weight: 50,
    },
    Kind {
        app: "CATS.Web",
        log_type: "Error",
        severity: 3,
        class: "OrderRepository",
        method: "Save",
        message: "Failed to save order {n}",
        exception: Some(
            "System.Data.SqlClient.SqlException (0x80131904): Execution Timeout Expired.  The timeout period elapsed prior to completion of the operation or the server is not responding.\n   at System.Data.SqlClient.SqlCommand.ExecuteNonQuery()\n   at CATS.Data.OrderRepository.Save(Order order)",
        ),
        weight: 25,
    },
    Kind {
        app: "CATS.Tasks",
        log_type: "Error",
        severity: 3,
        class: "ImportJob",
        method: "ParseRow",
        message: "Could not parse row {n} in file 'import_{n}.csv'",
        exception: Some(
            "System.FormatException: Input string was not in a correct format.\n   at System.Number.ParseInt32(String s)\n   at CATS.Tasks.ImportJob.ParseRow(String line)",
        ),
        weight: 18,
    },
    Kind {
        app: "CATS.Web",
        log_type: "Error",
        severity: 4,
        class: "CustomerController",
        method: "Details",
        message: "Unhandled exception for customer service {n}",
        exception: Some(
            "System.NullReferenceException: Object reference not set to an instance of an object.\n   at CATS.Web.CustomerController.Details(Int64 id)",
        ),
        weight: 12,
    },
    Kind {
        app: "CATS.Tasks",
        log_type: "Critical",
        severity: 5,
        class: "TaskScheduler",
        method: "Start",
        message: "Scheduler host {u} stopped unexpectedly",
        exception: Some(
            "System.OutOfMemoryException: Exception of type 'System.OutOfMemoryException' was thrown.",
        ),
        weight: 2,
    },
];

const USERS: &[&str] = &["alice", "bob", "carol", "dave", "erin"];
const SERVERS: &[&str] = &["APP01", "APP02", "TASK01"];

pub fn seed(path: &Path, days: u32, end: NaiveDate) -> Result<usize> {
    let mut conn = db::open(path)?;
    let mut next_id: i64 = conn.query_row(
        "SELECT COALESCE(MAX(log_identifier), 0) + 1 FROM log_entries",
        [],
        |r| r.get(0),
    )?;
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let total_weight: u64 = KINDS.iter().map(|k| k.weight).sum();
    let mut inserted = 0;
    for offset in (0..days as i64).rev() {
        let day = end - Duration::days(offset);
        let weekend = matches!(day.format("%a").to_string().as_str(), "Sat" | "Sun");
        let base = if weekend { 120 } else { 450 };
        let count = base + rng.below(200);
        // A recurring mid-month incident makes trends visible.
        let incident = day.format("%d").to_string().parse::<u32>().unwrap_or(1) % 15 == 0;
        let mut rows = Vec::with_capacity(count as usize);
        for _ in 0..count {
            let mut pick = rng.below(total_weight);
            let mut kind = &KINDS[0];
            for k in KINDS {
                if pick < k.weight {
                    kind = k;
                    break;
                }
                pick -= k.weight;
            }
            if incident && rng.below(4) == 0 {
                kind = &KINDS[4];
            }
            let hour = if weekend {
                rng.below(24)
            } else {
                7 + rng.below(12)
            };
            let ts = day
                .and_hms_opt(hour as u32, rng.below(60) as u32, rng.below(60) as u32)
                .expect("valid time");
            let user = USERS[rng.below(USERS.len() as u64) as usize];
            let mut msg = kind.message.replace("{u}", user);
            while msg.contains("{n}") {
                msg = msg.replacen("{n}", &rng.below(5000).to_string(), 1);
            }
            rows.push(SourceLog {
                log_identifier: next_id,
                log_app: kind.app.into(),
                log_type: kind.log_type.into(),
                log_message: msg,
                log_exception: kind.exception.map(String::from),
                log_severity: kind.severity,
                task_definition_identifier: None,
                task_definition_title: kind
                    .app
                    .ends_with("Tasks")
                    .then(|| "Nightly Sync".to_string()),
                project_identifier: Some(rng.below(40) as i64),
                project_name: Some(format!("Project {}", rng.below(40))),
                customer_service_identifier: None,
                class_name: Some(kind.class.into()),
                method_name: Some(kind.method.into()),
                add_user_account: Some(format!("CORP\\{user}")),
                server: Some(SERVERS[rng.below(SERVERS.len() as u64) as usize].into()),
                add_user_identifier: None,
                add_user_name: Some(user.into()),
                add_timestamp: ts,
            });
            next_id += 1;
        }
        inserted += db::ingest(&mut conn, &rows)?;
        let run = db::start_run(&conn, day, "demo")?;
        db::finish_run(&conn, run, &Ok((rows.len(), rows.len())))?;
    }
    Ok(inserted)
}
