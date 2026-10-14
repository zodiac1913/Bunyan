//! HTML views. Pure functions from view models to `maud::Markup`; no data access here.

use super::charts::{self, fmt_num};
use super::{Dash, GroupView, enc, style, type_color};
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
                @if let Some(s) = refresh_secs { meta http-equiv="refresh" content=(s); }
                title { (title) " · Bunyan" }
                style { (PreEscaped(style::CSS)) }
            }
            body {
                header.top {
                    span.brand { "🪓 Bunyan" }
                    @if active != "login" {
                        a href="/" class=[(active == "dash").then_some("active")] { "Dashboard" }
                        a href="/imports" class=[(active == "imports").then_some("active")] { "Imports" }
                        a href="/settings" class=[(active == "settings").then_some("active")] { "Settings" }
                        form.logout method="post" action="/logout" { button type="submit" { "Sign out" } }
                    }
                }
                main { (body) }
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

fn card(label: &str, value: i64, prev: Option<i64>) -> Markup {
    html! {
        div.card {
            div.k { (label) }
            div.v { (fmt_num(value)) }
            @if let Some(p) = prev { (delta(value, p)) " vs previous" }
        }
    }
}

fn level_label(level: &str) -> String {
    match level {
        "issues" => "Issues (non-informational)".into(),
        "all" => "All levels".into(),
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
            form.inline method="get" action="/" {
                input type="hidden" name="period" value=(period_name);
                input type="date" name="date" value=(d.anchor.to_string());
                select name="app" {
                    option value="" selected[d.filter.app.is_none()] { "All apps" }
                    @for a in &d.apps { option value=(a) selected[d.filter.app.as_deref() == Some(a.as_str())] { (a) } }
                }
                select name="level" {
                    @for l in ["all", "issues"] { option value=(l) selected[d.filter.level == l] { (level_label(l)) } }
                    @for t in &d.types { option value=(t) selected[d.filter.level == *t] { (t) " only" } }
                }
                button type="submit" { "Apply" }
            }
        }
        h1 { (d.period.label(d.anchor)) }
        @if let Some(n) = d.partial_days {
            p.small.muted { "In progress: changes compare the first " (n) " day(s) with the same span of the previous " (period_name) "." }
        }
        div.cards {
            (card("Total entries", d.total, Some(d.prev_total)))
            (card("Issues (non-info)", d.issues, Some(d.prev_issues)))
            (card("Errors & critical", d.errors, Some(d.prev_errors)))
            (card("Distinct kinds", d.distinct_groups, None))
            (card("New kinds", d.new_groups, None))
        }
        div.grid2 {
            div.panel {
                h2 { "By log level" }
                (charts::hbars(&d.by_type.iter().map(|(t, c)| (t.clone(), *c, type_color(t))).collect::<Vec<_>>()))
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
            thead { tr {
                th { "Severity" }
                @for t in &d.sev_types { th.num { (type_badge(t)) } }
                th.num { "Total" }
            } }
            tbody {
                @for s in &d.severities {
                    tr {
                        td { (s) }
                        @for t in &d.sev_types {
                            td.num { (d.sev_counts.get(&(*s, t.clone())).map(|c| fmt_num(*c)).unwrap_or_default()) }
                        }
                        td.num { strong { (fmt_num(d.sev_types.iter().map(|t| d.sev_counts.get(&(*s, t.clone())).unwrap_or(&0)).sum())) } }
                    }
                }
            }
        }
    }
}

fn top_table(d: &Dash) -> Markup {
    if d.top.is_empty() {
        return html! { p.muted { "Nothing logged for this filter and range." } };
    }
    let (start, end) = (d.start.to_string(), d.end.to_string());
    html! {
        table {
            thead { tr {
                th { "Kind" } th { "App" } th { "Level" } th { "Where" } th.num { "Max sev" }
                th.num { "Count" } th.num { "Prev" } th.num { "Change" } th { "Fix" }
            } }
            tbody {
                @for g in &d.top {
                    @let prev = *d.prev_counts.get(&g.id).unwrap_or(&0);
                    @let first_day = g.first_seen.get(..10).unwrap_or("");
                    tr {
                        td {
                            a href=(format!("/groups/{}", g.id)) { (truncate(&g.template, 140)) }
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
        h1 { (type_badge(&g.log_type)) " " (truncate(&g.template, 160)) }
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
                @if let Some(s) = &g.suggestion {
                    pre.suggestion { (s) }
                    p.small.muted {
                        "Generated by " (g.suggestion_model.as_deref().unwrap_or("?")) " at " (g.suggestion_at.as_deref().unwrap_or("?"))
                        ". LLM output — verify before applying."
                    }
                }
                form method="post" action=(format!("/groups/{}/suggest", g.id)) {
                    button type="submit" { @if g.suggestion.is_some() { "Regenerate" } @else { "Suggest a fix" } }
                    span.small.muted {
                        " via local Ollama (" (v.model) ")"
                        @if v.source_configured { ", with source-code context" }
                    }
                }
            }
        }
        div.panel {
            h2 { "Normalized message" }
            pre { (g.template) }
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
                thead { tr { th { "LogIdentifier" } th { "Time" } th.num { "Sev" } th { "Server" } th { "Project" } th { "Task" } th { "User" } th { "Message" } } }
                tbody {
                    @for e in &v.entries {
                        tr {
                            td.small { (e.log_identifier) }
                            td.small { (e.add_timestamp) }
                            td.num { (e.log_severity) }
                            td.small { (e.server.as_deref().unwrap_or("")) }
                            td.small { (e.project_name.as_deref().unwrap_or("")) }
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
        &truncate(&g.template, 60),
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
) -> Markup {
    let running = runs.iter().any(|r| r.status == "running");
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
            form.inline method="post" action="/imports" {
                label { "Import day " input type="date" name="day" value=(yesterday.to_string()); }
                button type="submit" disabled[running] { "Run import" }
                span.small.muted { "Re-importing a day is safe; existing rows are skipped." }
            }
        }
        div.panel {
            h2 { "Recent runs" }
            @if runs.is_empty() { p.muted { "No imports yet." } } @else {
                table {
                    thead { tr { th { "Day" } th { "Trigger" } th { "Started" } th { "Finished" } th { "Status" } th.num { "Fetched" } th.num { "New" } th { "Error" } } }
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
        let view = GroupView {
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
                project_name: None,
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
    }
}
