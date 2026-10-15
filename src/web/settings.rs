//! Server-rendered source configuration. Discovery and DDL parsing produce an unsaved draft;
//! only Save updates local SQLite, serialized against imports. SQL Server is never mutated.

use super::{AppError, AppState, pages, with_db};
use crate::{
    config::SourceConfig,
    importer,
    log_schema::{self, Column, FIELDS, LogSchema},
    source,
    source_code::{self, Snippet},
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
use std::path::PathBuf;

#[cfg(target_os = "macos")]
static FOLDER_PICKER: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// macOS owns the separate native dialog. No submitted path is interpolated into AppleScript.
/// Cancellation preserves the draft; other dialog failures are displayed rather than hidden.
#[cfg(target_os = "macos")]
async fn pick_folder() -> Result<Option<PathBuf>> {
    let _guard = FOLDER_PICKER.try_lock().map_err(|_| {
        anyhow::anyhow!("A folder picker is already open. Finish or cancel it first.")
    })?;
    let output = tokio::process::Command::new("/usr/bin/osascript")
        .args(["-e", r#"try
    tell application "System Events"
        activate
        set selectedFolder to choose folder with prompt "Choose the related application's source checkout"
        return POSIX path of selectedFolder
    end tell
on error number -128
    return ""
end try"#])
        .kill_on_drop(true)
        .output()
        .await
        .context("Could not open the macOS folder picker")?;
    anyhow::ensure!(
        output.status.success(),
        "macOS could not open the folder picker. Check Automation permissions for Bunyan/osascript in System Settings, or enter the folder path manually."
    );
    folder_selection(&output.stdout)
}

#[cfg(not(target_os = "macos"))]
async fn pick_folder() -> Result<Option<PathBuf>> {
    bail!(
        "The native folder picker currently supports macOS. Enter the local folder path manually."
    );
}

#[cfg(any(target_os = "macos", test))]
fn folder_selection(output: &[u8]) -> Result<Option<PathBuf>> {
    // osascript appends one newline; whitespace can legitimately belong to a folder name.
    let path = std::str::from_utf8(output).context("The folder picker returned an invalid path")?;
    let path = path.strip_suffix('\n').unwrap_or(path);
    if path.is_empty() {
        return Ok(None);
    }
    let path = PathBuf::from(path);
    anyhow::ensure!(
        path.is_absolute(),
        "The folder picker returned a non-absolute path."
    );
    Ok(Some(path))
}

pub async fn page(Extension(st): Extension<AppState>) -> Result<Response, AppError> {
    let fallback = st.cfg.sqlserver.table.clone();
    let mapping = with_db(&st, move |c| LogSchema::load(c, &fallback)).await?;
    Ok(render(&mapping, &[], "", None, false).into_response())
}

pub(super) fn tabs(active: &str) -> maud::Markup {
    html! {
        nav.tabs.toolbar aria-label="Settings sections" {
            @for (section, url, text, icon) in [
                ("logs", "/settings", "Log Source & Columns", "bi bi-table"),
                ("source", "/settings/source", "Source Code", "bi bi-code-slash"),
                ("ai", "/settings/ai", "AI", "bi bi-robot"),
                ("password", "/password/change", "Change SQL password", "bi bi-key"),
            ] {
                sml-reactive-button.bunyan-reactive class=[(active == section).then_some("active")] type="button" role="link" aria-current=[(active == section).then_some("page")] aria-label=(text) title=(text) data-icon=(icon) data-text=(text) data-url=(url) data-button-type="link" {}
            }
        }
    }
}

pub async fn source_page(Extension(st): Extension<AppState>) -> Result<Response, AppError> {
    let fallback = st.cfg.source.clone();
    let cfg = with_db(&st, move |conn| source_code::load(conn, &fallback)).await?;
    Ok(render_source(&cfg, &HashMap::new(), &[], None, false).into_response())
}

/// Test uses an unsaved draft and never calls AI. Save takes effect on subsequent suggestions.
pub async fn source_update(
    Extension(st): Extension<AppState>,
    headers: HeaderMap,
    Form(form): Form<HashMap<String, String>>,
) -> Result<Response, AppError> {
    if let Err(error) = check_origin(&headers) {
        return Ok((StatusCode::FORBIDDEN, pages::error_page(&error.to_string())).into_response());
    }
    let value = |key: &str| form.get(key).map(String::as_str).unwrap_or("").trim();
    let mut cfg = SourceConfig {
        root: (!value("root").is_empty()).then(|| PathBuf::from(value("root"))),
        extensions: value("extensions")
            .split([',', ' '])
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .collect(),
        context_lines: value("context_lines").parse().unwrap_or(0),
    };
    let action = value("action");
    let mut snippets = Vec::new();
    let result: Result<String> = async {
        if action == "browse" {
            return match pick_folder().await? {
                Some(path) => {
                    cfg.root = Some(path);
                    Ok("Folder selected. Review the path, then Save source settings. Nothing saved yet.".into())
                }
                None => Ok("Folder selection canceled. Your draft is unchanged; nothing saved.".into()),
            };
        }
        cfg = source_code::validate(cfg.clone())?;
        match action {
            "save" => {
                let saved = cfg.clone();
                with_db(&st, move |conn| source_code::save(conn, &saved)).await.map_err(|e| e.0)?;
                Ok("Saved locally. New manual, scheduled, and CLI suggestions use these settings immediately. Existing suggestions are unchanged; regenerate them for source context.".into())
            }
            "test" => {
                anyhow::ensure!(cfg.root.is_some(), "Enter a checkout path before testing lookup.");
                anyhow::ensure!(["class", "method", "message", "exception"].iter().any(|key| !value(key).is_empty()), "Enter a class, method, message, or exception to test.");
                let draft = cfg.clone();
                let class = value("class").to_string();
                let method = value("method").to_string();
                let message = value("message").to_string();
                let exception = value("exception").to_string();
                snippets = tokio::task::spawn_blocking(move || source_code::find(
                    &draft, (!class.is_empty()).then_some(class.as_str()),
                    (!method.is_empty()).then_some(method.as_str()), &message, &exception,
                )).await??;
                Ok(if snippets.is_empty() {
                    "No matching source found. Check the checkout, extensions, and hints. Nothing saved; AI was not called.".into()
                } else {
                    format!("Found {} candidate source file(s). Review the evidence below. Nothing saved; AI was not called.", snippets.len())
                })
            }
            _ => bail!("Choose Test lookup or Save source settings."),
        }
    }.await;
    let (status, message, error) = match result {
        Ok(message) => (StatusCode::OK, message, false),
        Err(error) => {
            tracing::warn!("source-code settings: {error:#}");
            (StatusCode::BAD_REQUEST, format!("{error:#}"), true)
        }
    };
    Ok((
        status,
        render_source(&cfg, &form, &snippets, Some(&message), error),
    )
        .into_response())
}

fn render_source(
    cfg: &SourceConfig,
    form: &HashMap<String, String>,
    snippets: &[Snippet],
    message: Option<&str>,
    error: bool,
) -> maud::Markup {
    let value = |key: &str| form.get(key).map(String::as_str).unwrap_or("");
    pages::layout(
        "Source Code Settings",
        "settings",
        None,
        html! {
            h1 { "Settings" }
            (tabs("source"))
            p { "Point Bunyan at the related application's local checkout. Source files are read-only evidence for suggestions, never edited or executed." }
            @if let Some(message) = message {
                div.flash role=[error.then_some("alert")] { (message) }
            }
            form method="post" action="/settings/source" aria-label="Source code settings and lookup" {
                section.panel {
                    h2 { "Related source checkout" }
                    p {
                        label for="source-root" { "Absolute local repository / source folder path " }
                        input id="source-root" name="root" size="65" value=(cfg.root.as_ref().map(|p| p.display().to_string()).unwrap_or_default()) placeholder="/Users/you/Dev/RelatedApp";
                        @if cfg!(target_os = "macos") {
                            " "
                            sml-reactive-button.bunyan-reactive type="submit" name="action" value="browse" formnovalidate aria-label="Pick Folder..." title="Pick Folder..." data-icon="bi bi-folder2-open" data-text="Pick Folder..." {}
                        }
                    }
                    p.small.muted { "Leave blank and Save to disable source context. One related checkout per Bunyan SQLite database. Keep it on the deployed branch/version; Bunyan does not clone, pull, or change branches." }
                    p {
                        label for="extensions" { "Source extensions * (required) " }
                        input id="extensions" name="extensions" value=(cfg.extensions.join(", ")) required aria-required="true";
                        " "
                        label for="context-lines" { "Lines per candidate * (required) " }
                        input id="context-lines" name="context_lines" type="number" min="5" max="200" value=(cfg.context_lines) required aria-required="true";
                    }
                    p { sml-reactive-button.bunyan-reactive type="submit" name="action" value="save" aria-label="Save source settings" title="Save source settings" data-icon="bi bi-save" data-text="Save source settings" {} }
                    p.small.muted { "Only code extensions are allowed. Build/dependency/hidden directories, symlinks, binary files, and files over 512 KiB are excluded. At most 3 candidate snippets (12,000 characters each) accompany requests to the active AI provider. Ollama is local; hosted providers require explicit consent in AI settings. Source files can contain secrets: choose a checkout safe for your selected provider." }
                }
                section.panel {
                    h2 { "Test source lookup (unsaved draft)" }
                    p { "Paste hints from a log to see exactly which candidate snippets would accompany it. Stack file/line and class/method matches rank above message literals or method-only matches." }
                    p {
                        label for="lookup-class" { "Class " }
                        input id="lookup-class" name="class" value=(value("class")) placeholder="Acme.Services.OrderService";
                        " "
                        label for="lookup-method" { "Method " }
                        input id="lookup-method" name="method" value=(value("method")) placeholder="Save";
                    }
                    p { label for="lookup-message" { "Message" } }
                    textarea id="lookup-message" name="message" rows="3" style="width:100%" { (value("message")) }
                    p { label for="lookup-exception" { "Exception / stack trace" } }
                    textarea id="lookup-exception" name="exception" rows="6" style="width:100%" { (value("exception")) }
                    p { sml-reactive-button.bunyan-reactive type="submit" name="action" value="test" aria-label="Test lookup (read-only)" title="Test lookup (read-only)" data-icon="bi bi-search" data-text="Test lookup (read-only)" {} }
                    p.small.muted { "Testing does not save settings or call AI. Preview hints are not stored. A matching filename/method does not prove root cause; inspect the candidates." }
                }
            }
            @for snippet in snippets {
                section.panel {
                    h2 { (snippet.file.display()) }
                    p.small.muted { "Match: " (snippet.evidence) }
                    pre { (snippet.code) }
                }
            }
        },
    )
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
        (tabs("logs"))
        p { "Describe your source log table, then map its columns to Bunyan fields. No DDL or source database changes are performed." }
        @if let Some(message) = message {
            div.flash role=[error.then_some("alert")] { (message) }
        }
        form method="post" action="/settings" aria-label="Log source and column mapping" {
            div.panel {
                h2 { "Source table" }
                label for="table" { "Table (schema.table) (required) " }
                input id="table" name="table" value=(mapping.table) required aria-required="true";
                sml-reactive-button.bunyan-reactive type="submit" name="action" value="discover" aria-label="Discover columns & suggest mappings" title="Discover columns & suggest mappings" data-icon="bi bi-magic" data-text="Discover columns & suggest mappings" {}
                p.small.muted { "Uses the database in dataaccess.json. Discovery reads INFORMATION_SCHEMA.COLUMNS using your SELECT access. DDL is not required." }
                details {
                    summary { "Optional: paste CREATE TABLE instead" }
                    p.small.muted { "One plain SQL Server CREATE TABLE statement. Omit USE/GO, comments, and unsupported computed-column syntax; otherwise use manual mapping." }
                    label for="source-ddl" { "CREATE TABLE statement (optional)" }
                    textarea id="source-ddl" name="ddl" rows="8" style="width:100%;font-family:monospace" { (ddl) }
                    sml-reactive-button.bunyan-reactive type="submit" name="action" value="ddl" formnovalidate aria-label="Parse DDL (do not execute)" title="Parse DDL (do not execute)" data-icon="bi bi-filetype-sql" data-text="Parse DDL (do not execute)" {}
                }
            }
            @if !columns.is_empty() {
                div.panel {
                    h2 { "Described columns (unsaved)" }
                    table {
                        caption { "Described source columns (unsaved)" }
                        thead { tr { th scope="col" { "Column" } th scope="col" { "SQL type" } th scope="col" { "Nullable" } } }
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
                    caption { "Bunyan fields mapped to source columns" }
                    thead { tr { th scope="col" { "Bunyan field" } th scope="col" { "Source column" } th scope="col" { "Expected type" } } }
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
                    sml-reactive-button.bunyan-reactive type="submit" name="action" value="test" aria-label="Test mapping (read-only)" title="Test mapping (read-only)" data-icon="bi bi-check2-circle" data-text="Test mapping (read-only)" {}
                    " "
                    sml-reactive-button.bunyan-reactive type="submit" name="action" value="save" aria-label="Save extraction settings" title="Save extraction settings" data-icon="bi bi-save" data-text="Save extraction settings" {}
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
    fn folder_picker_preserves_spaces_and_handles_cancel_and_invalid_output() {
        assert!(folder_selection(b"\n").unwrap().is_none());
        assert_eq!(
            folder_selection(b"/Users/me/My Related App/ \n").unwrap(),
            Some(PathBuf::from("/Users/me/My Related App/ "))
        );
        assert!(folder_selection(b"relative/path\n").is_err());
        assert!(folder_selection(&[0xff]).is_err());
    }

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
    fn extraction_settings_have_required_indicators_labels_and_scoped_tables() {
        let mapping = LogSchema::legacy("dbo.Events");
        let columns = [Column {
            name: "EventId".into(),
            data_type: "bigint".into(),
            nullable: false,
        }];
        for described in [&[][..], &columns[..]] {
            let html = render(&mapping, described, "", None, false).into_string();
            assert!(
                html.contains("action=\"/settings\" aria-label=\"Log source and column mapping\"")
            );
            assert!(html.contains("<label for=\"table\">Table (schema.table) (required) </label>"));
            assert!(
                html.contains(
                    "name=\"table\" value=\"dbo.Events\" required aria-required=\"true\""
                )
            );
            assert!(
                html.contains(
                    "<label for=\"source-ddl\">CREATE TABLE statement (optional)</label>"
                )
            );
            assert!(html.contains("<textarea id=\"source-ddl\" name=\"ddl\""));
            assert!(html.contains("value=\"ddl\" formnovalidate"));
            for label in [
                "Parse DDL (do not execute)",
                "Discover columns &amp; suggest mappings",
            ] {
                assert!(html.contains(&format!("aria-label=\"{label}\" title=\"{label}\"")));
                assert!(html.contains(&format!("data-text=\"{label}\"")));
            }
            assert!(html.contains("<caption>Bunyan fields mapped to source columns</caption>"));
            let tables = if described.is_empty() { 1 } else { 2 };
            assert_eq!(html.matches("<caption>").count(), tables);
            assert_eq!(html.matches("<th ").count(), tables * 3);
            assert_eq!(html.matches("scope=\"col\"").count(), tables * 3);
            if !described.is_empty() {
                assert!(html.contains("<caption>Described source columns (unsaved)</caption>"));
            }
        }
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
        assert!(html.contains("Log Source &amp; Columns"));
        assert!(html.contains("data-url=\"/settings/source\""));
    }

    #[test]
    fn source_settings_escape_preview_and_show_active_tab() {
        let cfg = SourceConfig::default();
        let form = HashMap::from([("exception".into(), "</textarea><script>bad</script>".into())]);
        let snippets = vec![Snippet {
            file: "Demo.cs".into(),
            code: "<script>source</script>".into(),
            evidence: "test",
        }];
        let html = render_source(&cfg, &form, &snippets, Some("<bad>"), true).into_string();
        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;source"));
        assert!(html.contains("aria-current=\"page\" aria-label=\"Source Code\""));
        assert!(html.contains(
            "action=\"/settings/source\" aria-label=\"Source code settings and lookup\""
        ));
        for (id, label) in [
            ("extensions", "Source extensions"),
            ("context-lines", "Lines per candidate"),
        ] {
            assert!(html.contains(&format!(
                "<label for=\"{id}\">{label} * (required) </label>"
            )));
            let input = html
                .split(&format!("<input id=\"{id}\""))
                .nth(1)
                .unwrap()
                .split('>')
                .next()
                .unwrap();
            assert!(input.contains(" required aria-required=\"true\""));
        }
        assert_eq!(html.matches("aria-required=\"true\"").count(), 2);
        for (id, label) in [
            (
                "source-root",
                "Absolute local repository / source folder path ",
            ),
            ("lookup-class", "Class "),
            ("lookup-method", "Method "),
            ("lookup-message", "Message"),
            ("lookup-exception", "Exception / stack trace"),
        ] {
            assert!(html.contains(&format!("<label for=\"{id}\">{label}</label>")));
            assert!(html.contains(&format!("id=\"{id}\" name=")));
        }
        for label in ["Save source settings", "Test lookup (read-only)"] {
            assert!(html.contains(&format!("aria-label=\"{label}\" title=\"{label}\"")));
            assert!(html.contains(&format!("data-text=\"{label}\"")));
        }
        if cfg!(target_os = "macos") {
            assert!(html.contains("value=\"browse\" formnovalidate"));
            assert!(html.contains("aria-label=\"Pick Folder...\" title=\"Pick Folder...\""));
            assert!(html.contains("data-text=\"Pick Folder...\""));
        }
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
