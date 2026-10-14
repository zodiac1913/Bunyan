//! Server-rendered source configuration. Discovery and DDL parsing produce an unsaved draft;
//! only Save updates local SQLite, serialized against imports. SQL Server is never mutated.

use super::{AppError, AppState, pages, with_db};
use crate::{
    importer,
    log_schema::{self, Column, FIELDS, LogSchema},
    source,
};
use anyhow::{Context, Result, bail};
use axum::{
    Extension,
    extract::Form,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use maud::html;
use std::collections::HashMap;

pub async fn page(Extension(st): Extension<AppState>) -> Result<Response, AppError> {
    let fallback = st.cfg.sqlserver.table.clone();
    let mapping = with_db(&st, move |c| LogSchema::load(c, &fallback)).await?;
    Ok(render(&mapping, &[], "", None, false).into_response())
}

/// Reject browser cross-origin submissions before any settings mutation or database discovery.
fn check_origin(headers: &HeaderMap) -> Result<()> {
    if let Some(origin) = headers.get("origin") {
        let origin = reqwest::Url::parse(origin.to_str()?)?;
        let host = headers
            .get("host")
            .context("Missing Host header")?
            .to_str()?;
        let expected = reqwest::Url::parse(&format!("http://{host}"))?;
        if origin.host_str() != expected.host_str()
            || origin.port_or_known_default() != expected.port_or_known_default()
        {
            bail!("Settings must be submitted from this Bunyan web page.");
        }
    }
    Ok(())
}

pub async fn update(
    Extension(st): Extension<AppState>,
    headers: HeaderMap,
    Form(form): Form<HashMap<String, String>>,
) -> Result<Response, AppError> {
    if let Err(e) = check_origin(&headers) {
        return Ok((StatusCode::FORBIDDEN, pages::error_page(&e.to_string())).into_response());
    }
    let mut mapping = LogSchema {
        table: form
            .get("table")
            .map(|s| s.trim().to_string())
            .unwrap_or_default(),
        columns: FIELDS
            .iter()
            .map(|f| {
                (
                    f.key.to_string(),
                    form.get(&format!("column_{}", f.key))
                        .map(|s| s.trim().to_string())
                        .unwrap_or_default(),
                )
            })
            .collect(),
    };
    let ddl = form.get("ddl").cloned().unwrap_or_default();
    let mut columns = Vec::new();
    let action = form.get("action").map(String::as_str).unwrap_or("");
    let result: Result<String> = async {
        match action {
            "discover" => {
                columns = source::discover_columns(&st.cfg.sqlserver, &mapping.table).await?;
                suggest_columns(&mut mapping, &columns);
                Ok("Columns discovered read-only. Review the suggested mappings, then Save. Nothing saved yet.".into())
            }
            "ddl" => {
                let (table, parsed) = log_schema::parse_ddl(&ddl)?;
                mapping.table = table;
                columns = parsed;
                suggest_columns(&mut mapping, &columns);
                Ok("DDL described the table; it was not executed. Review mappings, then Save. Nothing saved yet.".into())
            }
            "test" => {
                if source::test_mapping(&st.cfg.sqlserver, &mapping).await? {
                    Ok("Read-only test passed: one row decoded using this draft. No logs imported and nothing saved. This does not validate all source rows.".into())
                } else {
                    Ok("Mapped query compiled, but the table is empty. Nothing imported or saved.".into())
                }
            }
            "save" => {
                mapping.validate()?;
                let _guard = importer::IMPORT_LOCK.lock().await;
                let path = st.cfg.sqlite.path.clone();
                let fallback = st.cfg.sqlserver.table.clone();
                let saved = mapping.clone();
                tokio::task::spawn_blocking(move || {
                    saved.save(&mut crate::db::open(&path)?, &fallback)
                }).await??;
                Ok("Saved locally. New imports and checks use this mapping immediately. Existing logs are unchanged.".into())
            }
            _ => bail!("Choose Discover, Parse DDL, Test, or Save."),
        }
    }.await;
    let (status, message, error) = match result {
        Ok(msg) => (StatusCode::OK, msg, false),
        Err(e) => {
            tracing::warn!("source settings: {e:#}");
            (StatusCode::BAD_REQUEST, format!("{e:#}"), true)
        }
    };
    Ok((
        status,
        render(&mapping, &columns, &ddl, Some(&message), error),
    )
        .into_response())
}

fn normalize(s: &str) -> String {
    s.chars()
        .filter(char::is_ascii_alphanumeric)
        .flat_map(char::to_lowercase)
        .collect()
}

/// Exact/known-name suggestions only: ambiguous candidates remain blank for explicit user choice.
fn suggest_columns(mapping: &mut LogSchema, columns: &[Column]) {
    for field in FIELDS {
        if let Some(current) = mapping.column(field.key)
            && let Some(found) = columns
                .iter()
                .find(|c| c.name.eq_ignore_ascii_case(current))
        {
            mapping.columns.insert(field.key.into(), found.name.clone());
            continue;
        }
        let aliases: &[&str] = match field.key {
            "id" => &["id", "eventid", "logid"],
            "timestamp" => &[
                "timestamp",
                "createdat",
                "createdon",
                "loggedat",
                "eventtime",
                "time",
            ],
            "app" => &["app", "application", "applicationname"],
            "level" => &["level", "loglevel", "type"],
            "message" => &["message", "text", "messagetext"],
            "severity" => &["severity"],
            "exception" => &["exception", "stacktrace", "exceptiontext"],
            "user" => &["username", "user", "displayname"],
            "class" => &["class", "classname"],
            "method" => &["method", "methodname"],
            "server" => &["server", "servername", "hostname"],
            _ => &[],
        };
        let matches: Vec<_> = columns
            .iter()
            .filter(|c| {
                let name = normalize(&c.name);
                name == normalize(field.default_column) || aliases.contains(&name.as_str())
            })
            .collect();
        let chosen = if matches.len() == 1 {
            matches[0].name.clone()
        } else {
            String::new()
        };
        mapping.columns.insert(field.key.into(), chosen);
    }
}

fn render(
    mapping: &LogSchema,
    columns: &[Column],
    ddl: &str,
    message: Option<&str>,
    error: bool,
) -> maud::Markup {
    let body = html! {
        h1 { "Settings" }
        p { "Describe your source log table, then map its columns to Bunyan fields. No DDL or source database changes are performed." }
        @if let Some(message) = message {
            div.flash role=[error.then_some("alert")] { (message) }
        }
        form method="post" action="/settings" {
            div.panel {
                h2 { "Source table" }
                label for="table" { "Table (schema.table) " }
                input id="table" name="table" value=(mapping.table) required;
                button type="submit" name="action" value="discover" { "Discover columns & suggest mappings" }
                p.small.muted { "Uses the database in dataaccess.json. Discovery reads INFORMATION_SCHEMA.COLUMNS using your SELECT access. DDL is not required." }
                details {
                    summary { "Optional: paste CREATE TABLE instead" }
                    p.small.muted { "One plain SQL Server CREATE TABLE statement. Omit USE/GO, comments, and unsupported computed-column syntax; otherwise use manual mapping." }
                    textarea name="ddl" rows="8" style="width:100%;font-family:monospace" { (ddl) }
                    button type="submit" name="action" value="ddl" formnovalidate { "Parse DDL (do not execute)" }
                }
            }
            @if !columns.is_empty() {
                div.panel {
                    h2 { "Described columns (unsaved)" }
                    table {
                        thead { tr { th { "Column" } th { "SQL type" } th { "Nullable" } } }
                        tbody {
                            @for c in columns {
                                tr { td { (c.name) } td { (c.data_type) } td { (if c.nullable { "Yes" } else { "No" }) } }
                            }
                        }
                    }
                }
            }
            div.panel {
                h2 { "Column mapping" }
                p { "Enter source column names only, not SQL expressions. Manual entry works without discovery or DDL." }
                p.small.muted { "Required: stable unique numeric ID, timestamp (SQL datetime/date type), log level, message. Optional unmapped fields are omitted; application defaults to Application and severity to 0. Mapped NULL/invalid required values fail visibly." }
                datalist id="source-columns" {
                    @for c in columns { option value=(c.name) {} }
                }
                table {
                    thead { tr { th { "Bunyan field" } th { "Source column" } th { "Expected type" } } }
                    tbody {
                        @for f in FIELDS {
                            tr {
                                td { label for=(format!("column_{}", f.key)) { (f.label) @if f.required { " *" } } }
                                td {
                                    input id=(format!("column_{}", f.key)) name=(format!("column_{}", f.key))
                                        list="source-columns" value=(mapping.column(f.key).unwrap_or(""));
                                }
                                td { code { (f.sql_type) } }
                            }
                        }
                    }
                }
                p {
                    button type="submit" name="action" value="test" { "Test mapping (read-only)" }
                    " "
                    button type="submit" name="action" value="save" { "Save extraction settings" }
                }
                p.small.muted { "Saved in this SQLite database, not SQL Server. Existing rows are not rewritten. Changing source table or ID after importing requires a new SQLite file to avoid collisions." }
            }
        }
    };
    pages::layout("Settings", "settings", None, body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_suggests_fields_but_does_not_guess_ambiguities() {
        let mut mapping = LogSchema::legacy("dbo.Events");
        let columns = [
            "EventId",
            "CreatedAt",
            "Message",
            "Level",
            "Severity",
            "User",
            "UserName",
        ]
        .into_iter()
        .map(|name| Column {
            name: name.into(),
            data_type: "test".into(),
            nullable: false,
        })
        .collect::<Vec<_>>();
        suggest_columns(&mut mapping, &columns);
        assert_eq!(mapping.column("id"), Some("EventId"));
        assert_eq!(mapping.column("timestamp"), Some("CreatedAt"));
        assert_eq!(mapping.column("user"), None);
        assert_eq!(mapping.column("project"), None);
        mapping.validate().unwrap();
    }

    #[test]
    fn settings_escapes_ddl_and_column_names() {
        let mut mapping = LogSchema::legacy("dbo.Events");
        mapping
            .columns
            .insert("message".into(), "<script>alert(1)</script>".into());
        let html = render(
            &mapping,
            &[],
            "</textarea><script>bad</script>",
            None,
            false,
        )
        .into_string();
        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;"));
    }

    #[test]
    fn cross_origin_settings_submission_is_rejected() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "127.0.0.1:8080".parse().unwrap());
        headers.insert("origin", "http://attacker.example".parse().unwrap());
        assert!(check_origin(&headers).is_err());
        headers.insert("origin", "http://127.0.0.1:8080".parse().unwrap());
        check_origin(&headers).unwrap();
    }
}
