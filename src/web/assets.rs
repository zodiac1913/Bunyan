//! Local library responses come only from a build-time allowlist, never arbitrary disk paths.

use axum::{
    extract::OriginalUri,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};

pub(super) fn embedded(path: &str) -> Option<(&'static str, &'static [u8])> {
    include!(concat!(env!("OUT_DIR"), "/ui_assets.rs"))
}

/// Keep relative ES-module imports, CSS font URLs, and source maps on their original asset paths.
pub(super) async fn serve(OriginalUri(uri): OriginalUri) -> Response {
    match embedded(uri.path()) {
        Some((mime, bytes)) => ([(header::CONTENT_TYPE, mime)], bytes).into_response(),
        None => (StatusCode::NOT_FOUND, "UI asset not found.").into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn libraries_and_icon_fonts_are_embedded_with_correct_mime_types() {
        for (path, mime) in [
            ("/assets/css/catsStrap.css", "text/css; charset=utf-8"),
            (
                "/assets/css/bootstrap/js/bootstrap.bundle.min.js",
                "text/javascript; charset=utf-8",
            ),
            (
                "/assets/css/bootstrap/icons/font/bootstrap-icons.css",
                "text/css; charset=utf-8",
            ),
            (
                "/assets/css/bootstrap/icons/font/fonts/bootstrap-icons.woff2",
                "font/woff2",
            ),
            (
                "/assets/css/bootstrap/icons/font/fonts/bootstrap-icons.woff",
                "font/woff",
            ),
            ("/assets/js/sml/sml.js", "text/javascript; charset=utf-8"),
            ("/assets/js/logout.js", "text/javascript; charset=utf-8"),
            (
                "/assets/js/sml/smlUtils.js",
                "text/javascript; charset=utf-8",
            ),
            ("/assets/js/sml/sml.css", "text/css; charset=utf-8"),
            (
                "/assets/js/sml/Page/smlSidebar.css",
                "text/css; charset=utf-8",
            ),
        ] {
            let response = serve(OriginalUri(path.parse().unwrap())).await;
            assert_eq!(response.status(), StatusCode::OK, "{path}");
            assert_eq!(response.headers()[header::CONTENT_TYPE], mime, "{path}");
            let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap();
            assert!(!bytes.is_empty(), "{path}");
        }
        let response = serve(OriginalUri(
            "/assets/css/bootstrap/icons/font/fonts/bootstrap-icons.woff2?v=1"
                .parse()
                .unwrap(),
        ))
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        for path in [
            "/assets/.DS_Store",
            "/assets/js/sml/Docs/smlDocsData.js",
            "/assets/css/../../bunyan.toml",
        ] {
            assert!(embedded(path).is_none());
        }
        assert_eq!(
            serve(OriginalUri("/assets/js/missing.js".parse().unwrap()))
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn shared_layout_loads_libraries_before_app_styles_and_sml_targets_main() {
        let page = crate::web::pages::error_page("test").into_string();
        let catstrap = page.find("href=\"/assets/css/catsStrap.css\"").unwrap();
        let icons = page
            .find("href=\"/assets/css/bootstrap/icons/font/bootstrap-icons.css\"")
            .unwrap();
        let styles = page.find("<style>").unwrap();
        assert!(catstrap < icons && icons < styles);
        assert!(page.contains("src=\"/assets/css/bootstrap/js/bootstrap.bundle.min.js\" defer"));
        assert!(page.contains("type=\"module\" src=\"/assets/js/sml/sml.js\""));
        assert!(page.contains("<main id=\"pageContentWrapper\" tabindex=\"-1\">"));
        assert!(page.contains("id=\"smly-css\""));
        assert!(page.contains("id=\"smly-sidebar-css\""));
    }

    #[test]
    fn imports_have_explicit_form_labels_and_accessible_run_headers() {
        let cfg = crate::config::Config::default();
        let day = chrono::NaiveDate::from_ymd_opt(2026, 10, 14).unwrap();
        for status in ["ok", "running"] {
            let runs = [crate::db::ImportRun {
                day: day.to_string(),
                trigger: "manual".into(),
                started_at: "2026-10-15 12:00:00".into(),
                finished_at: None,
                status: status.into(),
                rows_fetched: 7,
                rows_inserted: 3,
                error: None,
            }];
            let page =
                crate::web::pages::imports(&cfg, &runs, day, "Test source", false).into_string();
            assert!(page.contains("action=\"/imports\" aria-label=\"Import logs by date range\""));
            assert!(page.contains("<label for=\"import-day\">From day * (required)</label>"));
            assert!(page.contains(
                "<input id=\"import-day\" type=\"date\" name=\"day\" value=\"2026-10-14\" required aria-required=\"true\" aria-describedby=\"import-range-help\">"
            ));
            assert!(page.contains("<label for=\"import-through\">Through day (optional)</label>"));
            assert!(page.contains("<input id=\"import-through\" type=\"date\" name=\"through\" aria-describedby=\"import-range-help\">"));
            assert!(page.contains("<caption>Recent import runs</caption>"));
            assert_eq!(page.matches("scope=\"col\"").count(), 8);
            assert_eq!(page.matches("<th ").count(), 8);
            assert!(page.contains("<td class=\"num\">7</td>"));
            assert!(page.contains("<td class=\"num\">3</td>"));
            assert_eq!(
                page.contains("type=\"submit\" disabled"),
                status == "running"
            );
        }
        let empty = crate::web::pages::imports(&cfg, &[], day, "Test source", false).into_string();
        assert!(empty.contains("No imports yet."));
        assert!(empty.contains("aria-label=\"Import logs by date range\""));
        assert!(!empty.contains("<table>"));
        let busy = crate::web::pages::imports(&cfg, &[], day, "Test source", true).into_string();
        assert!(busy.contains("type=\"submit\" disabled"));
        assert!(busy.contains("http-equiv=\"refresh\" content=\"3\""));
        assert!(busy.contains("Import in progress."));
    }

    #[test]
    fn skip_link_precedes_navigation_and_targets_focusable_main_on_every_layout() {
        for active in ["dash", "imports", "settings", "ai", "login"] {
            let page =
                crate::web::pages::layout("Test", active, None, maud::html! {}).into_string();
            assert!(page.contains(
                "<body><a class=\"skip-link visually-hidden-focusable\" href=\"#pageContentWrapper\">Skip to main content</a>"
            ));
            assert!(page.contains("<main id=\"pageContentWrapper\" tabindex=\"-1\">"));
            assert_eq!(page.matches("id=\"pageContentWrapper\"").count(), 1);
        }
    }

    #[test]
    fn navbar_uses_accessible_reactive_links_with_the_current_section_marked() {
        for active in ["dash", "imports", "settings", "ai"] {
            let page =
                crate::web::pages::layout("Test", active, None, maud::html! {}).into_string();
            assert!(page.contains("src=\"/assets/js/logout.js\" defer"));
            assert!(page.contains("id=\"sign-out\" type=\"button\""));
            assert!(!page.contains("action=\"/logout\""));
            assert!(page.contains("id=\"logout-error\" role=\"alert\" hidden"));
            let version = format!(
                "<span class=\"me-5\" title=\"Bunyan version\">{}</span>",
                env!("BUNYAN_VERSION")
            );
            assert!(page.contains(&version));
            assert!(page.find(&version).unwrap() < page.find("id=\"sign-out\"").unwrap());
            let nav = page
                .split("<nav aria-label=\"Main navigation\">")
                .nth(1)
                .unwrap()
                .split("</nav>")
                .next()
                .unwrap();
            assert!(!nav.contains("<a "));
            assert_eq!(nav.matches("<sml-reactive-button").count(), 4);
            assert_eq!(nav.matches("aria-current=\"page\"").count(), 1);
            assert!(!nav.contains("/password/change"));
            for url in ["/", "/imports", "/settings", "/ai"] {
                assert!(nav.contains(&format!("data-url=\"{url}\"")));
            }
            for attribute in [
                "aria-label=",
                "title=",
                "data-icon=",
                "data-text=",
                "role=\"link\"",
            ] {
                assert_eq!(nav.matches(attribute).count(), 4);
            }
        }
    }

    #[test]
    fn settings_sections_are_accessible_reactive_links_including_password_changes() {
        for active in ["logs", "source", "ai", "password"] {
            let tabs = crate::web::settings::tabs(active).into_string();
            assert!(!tabs.contains("<a "));
            assert_eq!(tabs.matches("<sml-reactive-button").count(), 4);
            assert_eq!(tabs.matches("aria-current=\"page\"").count(), 1);
            for url in [
                "/settings",
                "/settings/source",
                "/settings/ai",
                "/password/change",
            ] {
                assert!(tabs.contains(&format!("data-url=\"{url}\"")));
            }
            for attr in [
                "aria-label=",
                "title=",
                "data-icon=",
                "data-text=",
                "role=\"link\"",
            ] {
                let expected = if attr == "aria-label=" { 5 } else { 4 };
                assert_eq!(tabs.matches(attr).count(), expected);
            }
        }
    }
}
