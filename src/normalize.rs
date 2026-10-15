//! Turns individual log messages into a stable "kind" so repeats of the same problem
//! (differing only in ids, numbers, timestamps, quoted values) collapse into one error group.

use regex::Regex;
use sha2::{Digest, Sha256};
use std::sync::LazyLock;

const MAX_TEMPLATE_LEN: usize = 500;

static REPLACEMENTS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    [
        (
            r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
            "<guid>",
        ),
        (
            r"\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?",
            "<ts>",
        ),
        (
            r"\b\d{1,2}/\d{1,2}/\d{2,4}( \d{1,2}:\d{2}(:\d{2})?( ?[AP]M)?)?",
            "<date>",
        ),
        (r"[\w.+-]+@[\w-]+\.[\w.-]+", "<email>"),
        (r"'[^']*'", "'<str>'"),
        (r#""[^"]*""#, "\"<str>\""),
        (r"(?i)\b0x[0-9a-f]+\b", "<hex>"),
        (r"\b\d+(\.\d+)?\b", "<n>"),
        (r"\s+", " "),
    ]
    .into_iter()
    .map(|(p, r)| (Regex::new(p).expect("static regex"), r))
    .collect()
});

/// Replaces volatile tokens with placeholders. Output is trimmed and capped at 500 chars.
pub fn template(message: &str) -> String {
    let mut s = message.to_string();
    for (re, rep) in REPLACEMENTS.iter() {
        s = re.replace_all(&s, *rep).into_owned();
    }
    let s = s.trim();
    match s.char_indices().nth(MAX_TEMPLATE_LEN) {
        Some((i, _)) => s[..i].to_string(),
        None => s.to_string(),
    }
}

/// Human-readable grouping labels only; stored templates and group fingerprints stay unchanged.
pub fn display_template(template: &str) -> String {
    [
        ("<str>", "[quoted value]"),
        ("<guid>", "[identifier]"),
        ("<ts>", "[timestamp]"),
        ("<date>", "[date]"),
        ("<email>", "[email address]"),
        ("<hex>", "[hex value]"),
        ("<n>", "[number]"),
    ]
    .into_iter()
    .fold(template.to_string(), |text, (token, label)| {
        text.replace(token, label)
    })
}

/// Best-effort .NET-style exception type from the first line of a stack dump,
/// e.g. `System.Data.SqlClient.SqlException: Timeout expired` -> `System.Data.SqlClient.SqlException`.
pub fn exception_type(exception: Option<&str>) -> Option<String> {
    let line = exception?.lines().map(str::trim).find(|l| !l.is_empty())?;
    // SqlException etc. append an HRESULT: "System.X.SqlException (0x80131904): ..."
    let head = line.split(':').next()?.split(" (").next()?.trim();
    let looks_like_type = !head.is_empty()
        && head.len() <= 200
        && head
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '.' | '_' | '`' | '+'));
    looks_like_type.then(|| head.to_string())
}

/// Inputs that define an error group; two entries with equal keys are the same "kind".
pub struct GroupKey<'a> {
    pub app: &'a str,
    pub log_type: &'a str,
    pub class_name: Option<&'a str>,
    pub method_name: Option<&'a str>,
    pub exception_type: Option<&'a str>,
    pub template: &'a str,
}

impl GroupKey<'_> {
    /// Hex SHA-256 of the key fields; stored as the unique `error_groups.fingerprint`.
    pub fn fingerprint(&self) -> String {
        let mut h = Sha256::new();
        for part in [
            self.app,
            self.log_type,
            self.class_name.unwrap_or(""),
            self.method_name.unwrap_or(""),
            self.exception_type.unwrap_or(""),
            self.template,
        ] {
            h.update(part.to_lowercase().as_bytes());
            h.update([0u8]);
        }
        hex::encode(h.finalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapses_volatile_tokens() {
        let a = template(
            "Order 1234 failed for user 'bob' at 2026-10-13 08:01:02.123 id 3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        );
        let b = template(
            "Order 99 failed for user 'alice' at 2026-10-12 23:59:59 id 6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        );
        assert_eq!(a, b);
        assert_eq!(a, "Order <n> failed for user '<str>' at <ts> id <guid>");
    }

    #[test]
    fn display_labels_do_not_change_stored_grouping() {
        let original = "Incorrect syntax near the keyword 'RowCount'.";
        let grouped = template(original);
        assert_eq!(grouped, "Incorrect syntax near the keyword '<str>'.");
        assert_eq!(
            display_template(&grouped),
            "Incorrect syntax near the keyword '[quoted value]'."
        );
        assert_eq!(template(original), grouped);
        assert_eq!(
            display_template("<guid> <ts> <date> <email> <hex> <n>"),
            "[identifier] [timestamp] [date] [email address] [hex value] [number]"
        );
    }

    #[test]
    fn extracts_exception_type() {
        let ex =
            "\n System.Data.SqlClient.SqlException (0x80131904): Timeout expired.\n   at Foo.Bar()";
        assert_eq!(
            exception_type(Some(ex)).as_deref(),
            Some("System.Data.SqlClient.SqlException")
        );
        assert_eq!(
            exception_type(Some(
                "System.NullReferenceException: Object reference not set"
            ))
            .as_deref(),
            Some("System.NullReferenceException")
        );
        assert_eq!(exception_type(Some("something went wrong: badly")), None);
        assert_eq!(exception_type(None), None);
    }

    #[test]
    fn fingerprint_is_case_insensitive_and_stable() {
        let k1 = GroupKey {
            app: "Web",
            log_type: "Error",
            class_name: Some("A"),
            method_name: None,
            exception_type: None,
            template: "x <n>",
        };
        let k2 = GroupKey {
            app: "web",
            log_type: "ERROR",
            class_name: Some("a"),
            method_name: None,
            exception_type: None,
            template: "X <n>",
        };
        assert_eq!(k1.fingerprint(), k2.fingerprint());
    }
}
