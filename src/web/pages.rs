//! HTML views. Pure functions from view models to `maud::Markup`; no data access here.

use super::charts::{self, fmt_num};
use super::{
    Dash, EntriesView, GroupView, KindsView, enc, list_params as list_query, style, type_color,
};
use crate::config::Config;
use crate::db::ImportRun;
use crate::periods::Period;
use chrono::NaiveDate;
use maud::{DOCTYPE, Markup, PreEscaped, html};

pub(super) fn layout(title: &str, active: &str, refresh_secs: Option<u32>, body: Markup) -> Markup {
    html! {
        (DOCTYPE)
        html lang="en" {
            head {
                meta charset="utf-8";
                meta name="viewport" content="width=device-width, initial-scale=1";
                meta name="bunyan-startup" content=(super::startup_id());
                script src="/assets/dashboard-state.js" defer {}
                script src="/assets/js/logout.js" defer {}
                @if let Some(s) = refresh_secs { meta http-equiv="refresh" content=(s); }
                title { (title) " · Bunyan" }
                link rel="stylesheet" href="/assets/css/catsStrap.css";
                link rel="stylesheet" href="/assets/css/bootstrap/icons/font/bootstrap-icons.css";
                link id="smly-css" rel="stylesheet" href="/assets/js/sml/sml.css";
                link id="smly-sidebar-css" rel="stylesheet" href="/assets/js/sml/Page/smlSidebar.css";
                style { (PreEscaped(style::CSS)) }
                script src="/assets/css/bootstrap/js/bootstrap.bundle.min.js" defer {}
                script type="module" src="/assets/js/sml/sml.js" {}
            }
            body {
                a.skip-link.visually-hidden-focusable href="#pageContentWrapper" { "Skip to main content" }
                header.top {
                    span.brand { "🪓 Bunyan" }
                    @if active != "login" {
                        nav aria-label="Main navigation" {
                            @for (section, url, text, icon) in [
                                ("dash", "/", "Dashboard", "bi bi-speedometer2"),
                                ("imports", "/imports", "Imports", "bi bi-database-down"),
                                ("settings", "/settings", "Settings", "bi bi-gear"),
                                ("ai", "/ai", "AI Chat", "bi bi-chat-dots"),
                            ] {
                                sml-reactive-button.bunyan-reactive class=[(active == section).then_some("active")] type="button" role="link" aria-current=[(active == section).then_some("page")] aria-label=(text) title=(text) data-icon=(icon) data-text=(text) data-url=(url) data-button-type="link" {}
                            }
                        }
                        div.header-account {
                            span.me-5 title="Bunyan version" { (env!("BUNYAN_VERSION")) }
                            sml-reactive-button.bunyan-reactive.logout id="sign-out" type="button" aria-label="Sign out" title="Sign out" data-icon="bi bi-box-arrow-right" data-text="Sign out" {}
                        }
                    }
                }
                main id="pageContentWrapper" tabindex="-1" {
                    noscript { p.flash { "JavaScript is required for action buttons. Enable it to sign in, save settings, import logs, or request AI suggestions." } }
                    p.flash id="dashboard-state-error" hidden {}
                    p.flash id="logout-error" role="alert" hidden {}
                    (body)
                }
            }
        }
    }
}

pub fn error_page(msg: &str) -> Markup {
    layout(
        "Error",
        "",
        None,
        html! { h1 { "Something went wrong" } pre { (msg) } p { a href="/" { "Back to dashboard" } } },
    )
}

fn type_badge(t: &str) -> Markup {
    html! { span.badge style=(format!("background:{}", type_color(t))) { (t) } }
}

/// "▲ 12%" style change vs previous period. For error counts, up is bad (red).
fn delta(cur: i64, prev: i64) -> Markup {
    if prev == 0 && cur == 0 {
        return html! { span.delta { "—" } };
    }
    if prev == 0 {
        return html! { span.delta.up { "new" } };
    }
    let pct = (cur - prev) as f64 / prev as f64 * 100.0;
    let class = if pct > 0.5 {
        "delta up"
    } else if pct < -0.5 {
        "delta down"
    } else {
        "delta"
    };
    let arrow = if pct > 0.5 {
        "▲"
    } else if pct < -0.5 {
        "▼"
    } else {
        "■"
    };
    html! { span class=(class) title=(format!("previous period: {}", fmt_num(prev))) { (arrow) " " (format!("{:.0}%", pct.abs())) } }
}

fn card(label: &str, value: i64, prev: Option<i64>, href: &str) -> Markup {
    html! {
        div.card {
            div.k { (label) }
            div.v { a.count-link href=(href) { (fmt_num(value)) } }
            @if let Some(p) = prev { (delta(value, p)) " vs previous" }
        }
    }
}

fn level_label(level: &str) -> String {
    match level {
        "issues" => "Issues (non-informational)".into(),
        "all" => "All levels".into(),
        "errors" => "Errors & critical".into(),
        other => other.into(),
    }
}

pub fn dashboard(d: &Dash) -> Markup {
    let period_name = d.period.as_str();
    let bucket_title = match d.period {
        Period::Day => "Entries by hour",
        _ => "Entries by day",
    };
    let trend_title = match d.period {
        Period::Day => "Trend — last 30 days",
        Period::Week => "Trend — last 12 weeks",
        Period::Month => "Trend — last 12 months",
    };
    let body = html! {
        div.toolbar {
            div.tabs {
                @for p in [Period::Day, Period::Week, Period::Month] {
                    a href=(d.url(Some(p), None)) class=[(p == d.period).then_some("active")] { (capitalize(p.as_str())) }
                }
            }
            div.nav {
                a href=(d.url(None, Some(d.period.prev_start(d.anchor)))) { "◀ Previous " (period_name) }
                a href=(d.url(None, Some(d.period.next_start(d.anchor)))) { "Next " (period_name) " ▶" }
                a href=(format!("/?period={}&level={}&app={}", period_name, enc(&d.filter.level), enc(d.filter.app.as_deref().unwrap_or("")))) { "Latest" }
            }
            form.inline id="dashboard-filters" aria-label="Dashboard filters" method="get" action="/" {
                input type="hidden" name="period" value=(period_name);
                input type="date" name="date" aria-label="Date" value=(d.anchor.to_string()) onchange="this.form.requestSubmit()";
                select name="app" aria-label="Log app" onchange="this.form.requestSubmit()" {
                    option value="" selected[d.filter.app.is_none()] { "All apps" }
                    @for a in &d.apps { option value=(a) selected[d.filter.app.as_deref() == Some(a.as_str())] { (a) } }
                }
                select name="level" aria-label="Log level" onchange="this.form.requestSubmit()" {
                    @for l in ["all", "issues"] { option value=(l) selected[d.filter.level == l] { (level_label(l)) } }
                    @for t in &d.types { option value=(t) selected[d.filter.level == *t] { (t) " only" } }
                }
            }
        }
        h1 { (d.period.label(d.anchor)) }
        @if let Some(n) = d.partial_days {
            p.small.muted { "In progress: changes compare the first " (n) " day(s) with the same span of the previous " (period_name) "." }
        }
        div.cards {
            (card("Total entries", d.total, Some(d.prev_total), &d.entries_url("all", None)))
            (card("Issues (non-info)", d.issues, Some(d.prev_issues), &d.entries_url("issues", None)))
            (card("Errors & critical", d.errors, Some(d.prev_errors), &d.entries_url("errors", None)))
            (card("Distinct kinds", d.distinct_groups, None, &d.kinds_url(false)))
            (card("New kinds", d.new_groups, None, &d.kinds_url(true)))
        }
        div.grid2 {
            div.panel {
                h2 { "By log level" }
                (charts::hbars(&d.by_type.iter().map(|(t, c)| (t.clone(), *c, type_color(t), Some(d.entries_url(t, None)))).collect::<Vec<_>>()))
            }
            div.panel {
                h2 { "By severity" }
                (severity_table(d))
            }
        }
        div.panel { h2 { (bucket_title) } (charts::stacked_columns(&d.bucket_labels, &d.bucket_series)) }
        div.panel { h2 { (trend_title) } (charts::lines(&d.trend_labels, &d.trend_series)) }
        div.panel {
            h2 { "Top kinds — " (level_label(&d.filter.level)) }
            (top_table(d))
        }
    };
    layout(&d.period.label(d.anchor), "dash", None, body)
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    c.next()
        .map(|f| f.to_uppercase().collect::<String>() + c.as_str())
        .unwrap_or_default()
}

fn severity_table(d: &Dash) -> Markup {
    if d.severities.is_empty() {
        return html! { p.muted { "No data." } };
    }
    html! {
        table {
            caption { "Log entries by severity and log level" }
            thead { tr {
                th scope="col" { "Severity" }
                @for t in &d.sev_types { th.num scope="col" { (type_badge(t)) } }
                th.num scope="col" { "Total" }
            } }
            tbody {
                @for s in &d.severities {
                    tr {
                        th.severity-row scope="row" { (s) }
                        @for t in &d.sev_types {
                            td.num {
                                @if let Some(c) = d.sev_counts.get(&(*s, t.clone())) {
                                    a.count-link href=(d.entries_url(t, Some(*s))) { (fmt_num(*c)) }
                                }
                            }
                        }
                        td.num { strong { a.count-link href=(d.entries_url("all", Some(*s))) { (fmt_num(d.sev_types.iter().map(|t| d.sev_counts.get(&(*s, t.clone())).unwrap_or(&0)).sum())) } } }
                    }
                }
            }
        }
    }
}

fn top_table(d: &Dash) -> Markup {
    kinds_table(&d.top, &d.prev_counts, d.start, d.end, &d.filter.level)
}

fn kinds_table(
    groups: &[crate::db::GroupRow],
    prev_counts: &std::collections::HashMap<i64, i64>,
    start: NaiveDate,
    end: NaiveDate,
    level: &str,
) -> Markup {
    if groups.is_empty() {
        return html! { p.muted { "Nothing logged for this filter and range." } };
    }
    let (start, end) = (start.to_string(), end.to_string());
    html! {
        table {
            caption { "Top kinds — " (level_label(level)) }
            thead { tr {
                th scope="col" { "Kind" } th scope="col" { "App" } th scope="col" { "Level" } th scope="col" { "Where" } th.num scope="col" { "Max sev" }
                th.num scope="col" { "Count" } th.num scope="col" { "Prev" } th.num scope="col" { "Change" } th scope="col" { "Fix" }
            } }
            tbody {
                @for g in groups {
                    @let prev = *prev_counts.get(&g.id).unwrap_or(&0);
                    @let first_day = g.first_seen.get(..10).unwrap_or("");
                    tr {
                        td {
                            a href=(format!("/groups/{}", g.id)) { (truncate(&g.sample_message, 140)) }
                            @if first_day >= start.as_str() && first_day < end.as_str() { " " span.badge.new { "NEW" } }
                            @if let Some(ex) = &g.exception_type {
                                div.small.muted { code { (ex) } }
                                a.small href=(format!("/groups/{}#sample-exception", g.id)) { "View exception" }
                            }
                            div.small.muted { "last seen " (g.last_seen.get(..16).unwrap_or(&g.last_seen)) }
                        }
                        td { (g.log_app) }
                        td { (type_badge(&g.log_type)) }
                        td.small { (g.class_name.as_deref().unwrap_or("")) @if let Some(m) = &g.method_name { "." (m) } }
                        td.num { (g.max_severity) }
                        td.num { strong { (fmt_num(g.count)) } }
                        td.num { (fmt_num(prev)) }
                        td.num { (delta(g.count, prev)) }
                        td { @if g.has_suggestion { span.badge.fix { "✓ suggested" } } }
                    }
                }
            }
        }
    }
}

pub fn kinds(v: &KindsView) -> Markup {
    let title = if v.new_only {
        "New kinds"
    } else {
        "Distinct kinds"
    };
    let body = html! {
        p { a href=(format!("/?{}", list_query(v.period, v.anchor, v.filter.app.as_deref(), &v.filter.level))) { "← Dashboard" } }
        h1 { (title) " — " (v.period.label(v.anchor)) }
        p.small.muted {
            (level_label(&v.filter.level)) ", " (v.filter.app.as_deref().unwrap_or("all apps")) ". "
            (fmt_num(v.groups.len() as i64)) " kind(s), most frequent first."
        }
        div.panel { (kinds_table(&v.groups, &v.prev_counts, v.start, v.end, &v.filter.level)) }
    };
    layout(title, "dash", None, body)
}

/// Exceptions this short or shorter carry nothing worth a modal, so their button stays disabled.
const EXCEPTION_MIN_CHARS: i64 = 20;

pub fn entries(v: &EntriesView) -> Markup {
    let per = EntriesView::per_page();
    let first = v.page * per;
    let last = first + v.entries.len() as i64;
    let sev = v
        .severity
        .map(|s| format!(", severity {s}"))
        .unwrap_or_default();
    let level_summary = if v.available_types.is_empty() {
        "no levels available".to_string()
    } else if v.selected_types.len() == v.available_types.len() {
        "all levels".to_string()
    } else if v.selected_types.is_empty() {
        "no levels selected".to_string()
    } else {
        format!("levels: {}", v.selected_types.join(", "))
    };
    let body = html! {
        p { a href=(v.dashboard_url()) { "← Dashboard" } }
        h1 { "Log entries — " (v.period.label(v.anchor)) }
        p.small.muted {
            (level_summary) (sev) ", " (v.filter.app.as_deref().unwrap_or("all apps")) ". "
            @if v.total == 0 { "No entries." } @else {
                "Showing " (fmt_num(first + 1)) "–" (fmt_num(last)) " of " (fmt_num(v.total)) ", newest first."
            }
        }
        div.panel {
            form.level-filter method="get" action="/entries" {
                input type="hidden" name="period" value=(v.period.as_str());
                input type="hidden" name="date" value=(v.anchor);
                input type="hidden" name="app" value=(v.filter.app.as_deref().unwrap_or(""));
                input type="hidden" name="level" value=(v.filter.level);
                @if let Some(severity) = v.severity {
                    input type="hidden" name="severity" value=(severity);
                }
                input type="hidden" name="level_type" value="";
                fieldset {
                    legend { "Level types" }
                    div.level-filter-options {
                        @for (index, level) in v.available_types.iter().enumerate() {
                            label.level-filter-option for=(format!("entry-level-{index}")) {
                                input type="checkbox" id=(format!("entry-level-{index}")) name="level_type" value=(level)
                                    checked[v.selected_types.contains(level)];
                                (level)
                            }
                        }
                        @if v.available_types.is_empty() {
                            p.small.muted { "No level types in this range." }
                        }
                    }
                }
            }
            @if v.entries.is_empty() {
                p.muted { "Nothing logged for this filter and range." }
            } @else {
                table {
                    caption { "Log entries" }
                    thead { tr {
                        th scope="col" { "LogIdentifier" } th scope="col" { "Time" } th scope="col" { "Level" } th.num scope="col" { "Sev" }
                        th scope="col" { "Server" } th scope="col" { "Controller" } th scope="col" { "Action" }
                        th scope="col" { "App" } th scope="col" { "User" } th scope="col" { "Message" } th scope="col" { "Exception" }
                    } }
                    tbody {
                        @for e in &v.entries {
                            tr {
                                td.small { (e.log_identifier) }
                                td.small { (e.add_timestamp) }
                                td { (type_badge(&e.log_type)) }
                                td.num { (e.log_severity) }
                                td.small { (e.server.as_deref().unwrap_or("")) }
                                td.small { (e.class_name.as_deref().unwrap_or("")) }
                                td.small { (e.method_name.as_deref().unwrap_or("")) }
                                td.small { (e.task_definition_title.as_deref().unwrap_or("")) }
                                td.small { (e.add_user_name.as_deref().unwrap_or("")) }
                                td.small { a href=(format!("/groups/{}", e.group_id)) { (truncate(&e.message, 200)) } }
                                td {
                                    @let has_exception = e.exception_len > EXCEPTION_MIN_CHARS;
                                    button.exception-btn type="button" disabled[!has_exception]
                                        data-exception-url=[has_exception.then(|| format!("/entries/{}/exception", e.log_identifier))]
                                        data-log-identifier=(e.log_identifier)
                                        title="Click to see exception" aria-label="Click to see exception" { "!" }
                                }
                            }
                        }
                    }
                }
                dialog id="exception-dialog" aria-labelledby="exception-title" {
                    h2 id="exception-title" { "Log entry details" }
                    p.small.muted id="exception-meta" {}
                    dl id="exception-fields" {}
                    form method="dialog" { button type="submit" { "Close" } }
                }
                div.toolbar {
                    div.nav {
                        @if v.page > 0 { a href=(v.page_url(v.page - 1)) { "◀ Newer" } }
                        @if last < v.total { a href=(v.page_url(v.page + 1)) { "Older ▶" } }
                    }
                }
            }
        }
        script src="/assets/entry-exceptions.js" defer {}
    };
    layout("Log entries", "dash", None, body)
}

fn truncate(s: &str, max: usize) -> String {
    match s.char_indices().nth(max) {
        Some((i, _)) => format!("{}…", &s[..i]),
        None => s.to_string(),
    }
}

pub fn group(v: &GroupView) -> Markup {
    let g = &v.g;
    let body = html! {
        p { a href="/" { "← Dashboard" } }
        p { a href=(format!("/ai?group={}", g.id)) { "Discuss this issue with AI" } }
        h1 { (type_badge(&g.log_type)) " " (truncate(&g.sample_message, 160)) }
        @if let Some(e) = &v.suggest_error { div.flash { "Suggestion failed: " (e) } }
        div.grid2 {
            div.panel {
                h2 { "Facts" }
                dl.facts {
                    dt { "App" } dd { (g.log_app) }
                    dt { "Where" } dd { code { (g.class_name.as_deref().unwrap_or("?")) "." (g.method_name.as_deref().unwrap_or("?")) } }
                    dt { "Exception" } dd { code { (g.exception_type.as_deref().unwrap_or("—")) } }
                    dt { "Occurrences" } dd { strong { (fmt_num(g.total)) } }
                    dt { "First seen" } dd { (g.first_seen) }
                    dt { "Last seen" } dd { (g.last_seen) }
                    dt { "By severity" } dd {
                        @for (s, c) in &v.severities { span.small { "sev " (s) ": " (fmt_num(*c)) } " " }
                    }
                }
            }
            div.panel {
                h2 { "Last 30 days (to last seen)" }
                (charts::stacked_columns(&v.daily_labels, &v.daily))
            }
        }
        div.panel {
            h2 { "Suggested fix" }
            @if v.suggesting {
                p.muted { "Generating with " code { (v.model) } "… this page refreshes automatically." }
            } @else {
                @if g.suggestion.as_deref().is_some_and(crate::db::suggestion_is_outdated) {
                    p.flash { "This saved suggestion is outdated because it used grouping placeholders instead of original error details. Regenerate it to analyze the original message and exception." }
                } @else if let Some(s) = &g.suggestion {
                    pre.suggestion { (s) }
                    p.small.muted {
                        "Generated by " (g.suggestion_model.as_deref().unwrap_or("?")) " at " (g.suggestion_at.as_deref().unwrap_or("?"))
                        ". LLM output — verify before applying."
                    }
                }
                form method="post" action=(format!("/groups/{}/suggest", g.id)) {
                    @let text = if g.suggestion.is_some() { "Regenerate" } else { "Suggest a fix" };
                    sml-reactive-button.bunyan-reactive type="submit" aria-label=(text) title=(text) data-icon="bi bi-lightbulb" data-text=(text) {}
                    span.small.muted {
                        " via " (v.model)
                        @if v.source_configured { ", source lookup enabled (matches included when found)" }
                        @else { " — " a href="/settings/source" { "Connect related source code" } }
                    }
                }
            }
        }
        div.panel {
            h2 { "Grouping pattern (not the original error)" }
            p.small.muted { "Bracketed labels represent values combined for grouping. Use the original sample message below to diagnose the error." }
            pre { (crate::normalize::display_template(&g.template)) }
            h2 { "Sample message" }
            pre { (g.sample_message) }
            @if let Some(ex) = &g.sample_exception {
                details.exception id="sample-exception" open {
                    summary { "Show / hide full sample exception" }
                    pre { (ex) }
                    p.small.muted { "The full sample exception is included when requesting an AI suggestion, even when collapsed. The model's context limit still applies." }
                }
            }
        }
        div.panel {
            h2 { "Recent occurrences" }
            table {
                thead { tr { th { "LogIdentifier" } th { "Time" } th.num { "Sev" } th { "Server" } th { "Controller" } th { "Action" } th { "App" } th { "User" } th { "Message" } } }
                tbody {
                    @for e in &v.entries {
                        tr {
                            td.small { (e.log_identifier) }
                            td.small { (e.add_timestamp) }
                            td.num { (e.log_severity) }
                            td.small { (e.server.as_deref().unwrap_or("")) }
                            td.small { (e.class_name.as_deref().unwrap_or("")) }
                            td.small { (e.method_name.as_deref().unwrap_or("")) }
                            td.small { (e.task_definition_title.as_deref().unwrap_or("")) }
                            td.small { (e.add_user_name.as_deref().unwrap_or("")) }
                            td.small {
                                (truncate(&e.message, 200))
                                @if let Some(ex) = &e.exception {
                                    details.exception {
                                        summary { "Show / hide full exception" }
                                        pre { (ex) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    };
    layout(
        &truncate(&g.sample_message, 60),
        "",
        v.suggesting.then_some(5),
        body,
    )
}

pub fn imports(
    cfg: &Config,
    runs: &[ImportRun],
    yesterday: NaiveDate,
    source_label: &str,
    importing: bool,
) -> Markup {
    let running = importing || runs.iter().any(|r| r.status == "running");
    let body = html! {
        h1 { "Imports" }
        div.panel {
            p {
                @if cfg.schedule.enabled {
                    "Scheduled daily at " strong { (cfg.schedule.daily_at) } " (local time) while " code { "bunyan serve" } " is running. "
                    "Each run imports yesterday plus up to " (cfg.schedule.max_catchup_days) " missed days."
                } @else {
                    "Scheduler disabled in config."
                }
            }
            p.small.muted {
                "Source: " code { (source_label) }
            }
            form.inline method="post" action="/imports" aria-label="Import logs by date range" {
                label for="import-day" { "From day * (required)" }
                input id="import-day" type="date" name="day" value=(yesterday.to_string()) required aria-required="true" aria-describedby="import-range-help";
                label for="import-through" { "Through day (optional)" }
                input id="import-through" type="date" name="through" aria-describedby="import-range-help";
                sml-reactive-button.bunyan-reactive type="submit" disabled[running] aria-label="Run import" title="Run import" data-icon="bi bi-database-down" data-text="Run import" {}
            }
            p.small.muted id="import-range-help" { "Leave Through day blank for one day. Ranges include both dates and run one day at a time using your signed-in SQL credentials. Failed days are recorded and remaining days continue. Re-importing is safe; existing rows are skipped." }
            @if running {
                p.flash role="status" { "Import in progress. This page refreshes until all selected days finish. Stay signed in; signing out of the desktop app stops unfinished imports." }
            }
        }
        div.panel {
            h2 { "Recent runs" }
            @if runs.is_empty() { p.muted { "No imports yet." } } @else {
                table {
                    caption { "Recent import runs" }
                    thead { tr { th scope="col" { "Day" } th scope="col" { "Trigger" } th scope="col" { "Started" } th scope="col" { "Finished" } th scope="col" { "Status" } th.num scope="col" { "Fetched" } th.num scope="col" { "New" } th scope="col" { "Error" } } }
                    tbody {
                        @for r in runs {
                            tr {
                                td { a href=(format!("/?period=day&date={}&level=issues", r.day)) { (r.day) } }
                                td { (r.trigger) }
                                td.small { (r.started_at) }
                                td.small { (r.finished_at.as_deref().unwrap_or("")) }
                                td { span class=(format!("status-{}", r.status)) { (r.status) } }
                                td.num { (fmt_num(r.rows_fetched)) }
                                td.num { (fmt_num(r.rows_inserted)) }
                                td.small { (r.error.as_deref().unwrap_or("")) }
                            }
                        }
                    }
                }
            }
        }
    };
    layout("Imports", "imports", running.then_some(3), body)
}

#[cfg(test)]
mod exception_tests {
    use super::*;

    #[test]
    fn full_sample_and_occurrence_exceptions_are_expandable_and_escaped() {
        let exception = format!("<script>{}EXCEPTION_END", "frame\n".repeat(1000));
        let mut view = GroupView {
            g: crate::db::GroupDetail {
                id: 1,
                log_app: "DotNetCats".into(),
                log_type: "Error".into(),
                class_name: None,
                method_name: None,
                exception_type: None,
                template: "Failure".into(),
                sample_message: "Failure".into(),
                sample_exception: Some(exception.clone()),
                first_seen: "2026-10-13".into(),
                last_seen: "2026-10-13".into(),
                suggestion: None,
                suggestion_model: None,
                suggestion_at: None,
                total: 1,
            },
            daily_labels: vec![],
            daily: vec![],
            severities: vec![],
            entries: vec![crate::db::EntryRow {
                log_identifier: 1,
                add_timestamp: "2026-10-13".into(),
                log_severity: 3,
                message: "Failure".into(),
                exception: Some(exception),
                server: None,
                class_name: None,
                method_name: None,
                task_definition_title: None,
                add_user_name: None,
            }],
            suggesting: false,
            suggest_error: None,
            model: "local".into(),
            source_configured: false,
        };
        let markup = group(&view).into_string();
        assert!(markup.contains("id=\"sample-exception\" open"));
        assert!(markup.contains("Show / hide full exception"));
        assert_eq!(markup.matches("EXCEPTION_END").count(), 2);
        assert!(!markup.contains("<script>"));
        assert_eq!(markup.matches("&lt;script&gt;").count(), 2);

        view.g.template = "Failure '<str>'".into();
        view.g.suggestion = Some("OUTDATED_ADVICE: Inspect '<str>'.".into());
        let markup = group(&view).into_string();
        assert!(markup.contains("This saved suggestion is outdated"));
        assert!(markup.contains("data-text=\"Regenerate\""));
        assert!(markup.contains("[quoted value]"));
        assert!(!markup.contains("OUTDATED_ADVICE"));
        assert!(!markup.contains("&lt;str&gt;"));

        view.g.suggestion = Some("CURRENT_ADVICE: Inspect the original exception.".into());
        let markup = group(&view).into_string();
        assert!(markup.contains("CURRENT_ADVICE"));
        assert!(!markup.contains("This saved suggestion is outdated"));
    }
}
