//! Bounded, read-only retrieval from one local checkout. Logs are hints, never filesystem paths:
//! only regular allowlisted files beneath the configured root are read; symlinks are not followed.

use crate::config::SourceConfig;
use anyhow::{Context, Result};
use regex::Regex;
use rusqlite::{Connection, OptionalExtension};
use std::path::PathBuf;

const SKIP_DIRS: &[&str] = &[
    ".git",
    ".vs",
    ".idea",
    "bin",
    "obj",
    "node_modules",
    "packages",
    "target",
    "vendor",
];
const EXTENSIONS: &[&str] = &[
    "cs", "vb", "sql", "fs", "rs", "go", "js", "ts", "jsx", "tsx", "py", "java",
];
const MAX_ENTRIES: usize = 200_000;
const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_SNIPPETS: usize = 3;
const MAX_SNIPPET_CHARS: usize = 12_000;

/// Paths are relative to the checkout; line numbers and evidence are included in AI prompts.
#[derive(Debug)]
pub struct Snippet {
    pub file: PathBuf,
    pub code: String,
    pub evidence: &'static str,
}

/// Create/read only Bunyan's SQLite settings; an explicit disabled setting overrides TOML.
pub fn load(conn: &Connection, fallback: &SourceConfig) -> Result<SourceConfig> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS source_code_settings (id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL);")?;
    let text: Option<String> = conn
        .query_row(
            "SELECT config FROM source_code_settings WHERE id=1",
            [],
            |r| r.get(0),
        )
        .optional()?;
    match text {
        Some(text) => serde_json::from_str(&text).context("Reading saved source-code settings"),
        None => Ok(fallback.clone()),
    }
}

/// Persist validated settings locally; no files in the selected checkout are changed.
pub fn save(conn: &Connection, cfg: &SourceConfig) -> Result<()> {
    let checked = validate(cfg.clone())?;
    load(conn, cfg)?;
    conn.execute(
        "INSERT INTO source_code_settings(id,config) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET config=excluded.config",
        [serde_json::to_string(&checked)?],
    )?;
    Ok(())
}

/// Resolve the checkout once and reject unsupported extensions or unbounded context sizes.
pub fn validate(mut cfg: SourceConfig) -> Result<SourceConfig> {
    anyhow::ensure!(
        (5..=200).contains(&cfg.context_lines),
        "Context lines must be between 5 and 200."
    );
    anyhow::ensure!(
        !cfg.extensions.is_empty(),
        "Choose at least one source extension."
    );
    for extension in &mut cfg.extensions {
        *extension = extension
            .trim()
            .trim_start_matches('.')
            .to_ascii_lowercase();
        anyhow::ensure!(
            EXTENSIONS.contains(&extension.as_str()),
            "Unsupported source extension: {extension}. Use code extensions only (cs, vb, sql, fs, rs, go, js, ts, jsx, tsx, py, java)."
        );
    }
    cfg.extensions.sort();
    cfg.extensions.dedup();
    if let Some(root) = &cfg.root {
        anyhow::ensure!(root.is_absolute(), "Enter an absolute local checkout path.");
        let root = root
            .canonicalize()
            .context("Cannot open the local source checkout")?;
        anyhow::ensure!(
            root.is_dir(),
            "The source checkout path must be a directory."
        );
        std::fs::read_dir(&root).context("Cannot read the source checkout")?;
        cfg.root = Some(root);
    }
    Ok(cfg)
}

/// Source-bearing prompts must stay on loopback, and redirects must not forward them elsewhere.
pub fn local_ollama(url: &str) -> Result<()> {
    let url = reqwest::Url::parse(url)?;
    let local = url.host_str().is_some_and(|host| {
        host == "localhost"
            || host
                .trim_matches(['[', ']'])
                .parse::<std::net::IpAddr>()
                .is_ok_and(|ip| ip.is_loopback())
    });
    anyhow::ensure!(
        matches!(url.scheme(), "http" | "https") && local,
        "Ollama requires a loopback URL (localhost, 127.0.0.1, or ::1)."
    );
    Ok(())
}

/// Search all eligible files deterministically; rank explicit stack file/line hints above
/// class/method matches and message literals. No match is distinct from a failed/incomplete scan.
pub fn find(
    cfg: &SourceConfig,
    class: Option<&str>,
    method: Option<&str>,
    message: &str,
    exception: &str,
) -> Result<Vec<Snippet>> {
    if cfg.root.is_none() {
        return Ok(Vec::new());
    }
    let cfg = validate(cfg.clone())?;
    let root = cfg.root.as_ref().expect("validated root");
    let file_hint = Regex::new(
        r"(?i)([A-Za-z0-9_.-]+\.(?:cs|vb|sql|fs|rs|go|js|ts|jsx|tsx|py|java))(?::line\s+|:)(\d+)",
    )?;
    let hints: Vec<_> = file_hint
        .captures_iter(exception)
        .chain(file_hint.captures_iter(message))
        .map(|c| {
            (
                c[1].to_ascii_lowercase(),
                c[2].parse::<usize>().unwrap_or(0),
            )
        })
        .collect();
    let frame = Regex::new(r"\bat\s+([\w.`+]+)\.([\w`<>]+)\s*\(")?;
    let mut symbols: Vec<(String, Option<String>)> = frame
        .captures_iter(exception)
        .map(|c| (simple_class(&c[1]), Some(c[2].to_string())))
        .collect();
    if let Some(class) = class.filter(|c| !c.is_empty()) {
        symbols.insert(0, (simple_class(class), method.map(str::to_owned)));
    }
    let method_pattern = method
        .filter(|s| !s.is_empty())
        .map(|m| Regex::new(&format!(r"\b{}\s*\(", regex::escape(m))))
        .transpose()?;
    let literal = Regex::new(r#""([^"\r\n]{16,200})""#)?;
    let mut stack = vec![root.clone()];
    let mut seen = 0;
    let mut candidates = Vec::new();
    while let Some(dir) = stack.pop() {
        let mut entries = std::fs::read_dir(&dir)
            .with_context(|| format!("Reading source directory {}", dir.display()))?
            .take(MAX_ENTRIES - seen + 1)
            .collect::<std::io::Result<Vec<_>>>()?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            seen += 1;
            anyhow::ensure!(
                seen <= MAX_ENTRIES,
                "Source lookup exceeded 200,000 entries. Choose a narrower checkout/subdirectory."
            );
            let kind = entry.file_type()?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if kind.is_dir() {
                if !name.starts_with('.') && !SKIP_DIRS.contains(&name.as_str()) {
                    stack.push(path);
                }
                continue;
            }
            if !kind.is_file()
                || name.starts_with('.')
                || !path.extension().is_some_and(|ext| {
                    cfg.extensions
                        .iter()
                        .any(|e| ext.to_string_lossy().eq_ignore_ascii_case(e))
                })
            {
                continue;
            }
            // Oversized and binary files are ineligible, not silently truncated source evidence.
            if entry.metadata()?.len() > MAX_FILE_BYTES {
                continue;
            }
            let bytes = std::fs::read(&path)
                .with_context(|| format!("Reading source file {}", path.display()))?;
            let text = match std::str::from_utf8(&bytes) {
                Ok(text) if !text.contains('\0') => text,
                _ => continue,
            };
            let lines: Vec<_> = text.lines().collect();
            if lines.is_empty() {
                continue;
            }
            let mut score = 0;
            let mut center = 0;
            let mut evidence = "";
            if let Some((_, line)) = hints.iter().find(|(file, line)| {
                name.eq_ignore_ascii_case(file) && *line > 0 && *line <= lines.len()
            }) {
                score = 100;
                center = line - 1;
                evidence = "stack/message filename and line (verify checkout version)";
            }
            let stem = path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_ascii_lowercase();
            for (class, method) in &symbols {
                if stem != *class {
                    continue;
                }
                let pattern = method
                    .as_ref()
                    .map(|m| Regex::new(&format!(r"\b{}\s*\(", regex::escape(m))))
                    .transpose()?;
                let found = pattern.and_then(|re| lines.iter().position(|l| re.is_match(l)));
                let candidate_score = if found.is_some() { 90 } else { 60 };
                if candidate_score > score {
                    score = candidate_score;
                    center = found.unwrap_or(0);
                    evidence = if found.is_some() {
                        "class filename and method"
                    } else {
                        "class filename only; method not located"
                    };
                }
            }
            if score == 0 {
                if let Some(line) = lines.iter().position(|line| {
                    literal.captures_iter(line).any(|c| {
                        c[1].split_whitespace().count() >= 3
                            && (message.contains(&c[1]) || exception.contains(&c[1]))
                    })
                }) {
                    score = 50;
                    center = line;
                    evidence = "message/exception text matches a source string literal";
                } else if let Some(line) = method_pattern
                    .as_ref()
                    .and_then(|re| lines.iter().position(|l| re.is_match(l)))
                {
                    score = 30;
                    center = line;
                    evidence = "method name only; verify this candidate";
                }
            }
            if score == 0 {
                continue;
            }
            let from = center.saturating_sub(cfg.context_lines / 4);
            let to = (from + cfg.context_lines).min(lines.len());
            let code: String = lines[from..to]
                .iter()
                .enumerate()
                .map(|(i, l)| format!("{:>5} {l}\n", from + i + 1))
                .collect();
            let code = if code.chars().count() > MAX_SNIPPET_CHARS {
                let mut bounded: String = code.chars().take(MAX_SNIPPET_CHARS - 40).collect();
                bounded.push_str("\n[Source snippet truncated]\n");
                bounded
            } else {
                code
            };
            let relative = path.strip_prefix(root)?.to_path_buf();
            candidates.push((
                score,
                Snippet {
                    file: relative,
                    code,
                    evidence,
                },
            ));
            candidates.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.file.cmp(&b.1.file)));
            candidates.truncate(MAX_SNIPPETS);
        }
    }
    Ok(candidates.into_iter().map(|(_, snippet)| snippet).collect())
}

fn simple_class(class: &str) -> String {
    class
        .rsplit('.')
        .next()
        .unwrap_or(class)
        .split(['`', '+'])
        .next()
        .unwrap_or(class)
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn config(root: &Path) -> SourceConfig {
        SourceConfig {
            root: Some(root.into()),
            context_lines: 8,
            ..SourceConfig::default()
        }
    }

    #[test]
    fn settings_round_trip_and_explicit_disable_override_fallback() {
        let dir = tempfile::tempdir().unwrap();
        let conn = Connection::open_in_memory().unwrap();
        let fallback = config(dir.path());
        assert_eq!(load(&conn, &fallback).unwrap().root, fallback.root);
        save(&conn, &SourceConfig::default()).unwrap();
        assert!(load(&conn, &fallback).unwrap().root.is_none());
        save(&conn, &fallback).unwrap();
        assert_eq!(
            load(&conn, &SourceConfig::default()).unwrap().root,
            Some(dir.path().canonicalize().unwrap())
        );
    }

    #[test]
    fn retrieves_stack_frames_messages_and_class_methods_without_build_artifacts() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("bin")).unwrap();
        std::fs::write(
            dir.path().join("bin/OrderService.cs"),
            "private build artifact",
        )
        .unwrap();
        std::fs::write(dir.path().join("OrderService.cs"), "class OrderService {\n void Save (int id) {\n throw new Exception(\"Could not process this order\");\n }\n}\n").unwrap();
        let cfg = config(dir.path());
        let matches = find(&cfg, Some("Acme.OrderService"), Some("Save"), "", "").unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].file, PathBuf::from("OrderService.cs"));
        assert!(matches[0].code.contains("Save (int"));
        assert_eq!(matches[0].evidence, "class filename and method");
        let matches = find(
            &cfg,
            None,
            None,
            "",
            "at Acme.OrderService.Save(Int32 id) in C:\\build\\OrderService.cs:line 3",
        )
        .unwrap();
        assert!(matches[0].evidence.starts_with("stack/message filename"));
        let matches = find(&cfg, None, None, "Could not process this order", "").unwrap();
        assert!(matches[0].evidence.starts_with("message/exception"));
        assert!(find(&cfg, None, None, "unrelated", "").unwrap().is_empty());
    }

    #[test]
    fn validates_paths_extensions_and_local_ollama() {
        let dir = tempfile::tempdir().unwrap();
        let mut cfg = config(dir.path());
        cfg.extensions = vec!["json".into()];
        assert!(validate(cfg).is_err());
        let mut cfg = config(dir.path());
        cfg.context_lines = 201;
        assert!(validate(cfg).is_err());
        for url in [
            "http://localhost:11434",
            "http://127.0.0.1:11434",
            "http://[::1]:11434",
        ] {
            local_ollama(url).unwrap();
        }
        assert!(local_ollama("https://example.com").is_err());
        assert!(local_ollama("http://localhost.evil.example").is_err());
    }

    #[test]
    fn ranks_bounds_and_orders_candidates_deterministically() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["Z.cs", "C.cs", "A.cs", "B.cs"] {
            std::fs::write(dir.path().join(name), "void Save () {}\n").unwrap();
        }
        let cfg = config(dir.path());
        let snippets = find(&cfg, None, Some("Save"), "", "").unwrap();
        assert_eq!(snippets.len(), MAX_SNIPPETS);
        assert_eq!(
            snippets
                .iter()
                .map(|s| s.file.to_string_lossy().into_owned())
                .collect::<Vec<_>>(),
            ["A.cs", "B.cs", "C.cs"]
        );
        let snippets = find(&cfg, None, Some("Save"), "", "in Z.cs:line 1").unwrap();
        assert_eq!(snippets[0].file, PathBuf::from("Z.cs"));
        std::fs::write(
            dir.path().join("Huge.cs"),
            format!("void Unique() {{ {} }}", "x".repeat(20_000)),
        )
        .unwrap();
        let snippets = find(&cfg, Some("Huge"), Some("Unique"), "", "").unwrap();
        assert!(snippets[0].code.chars().count() <= MAX_SNIPPET_CHARS);
        assert!(snippets[0].code.contains("[Source snippet truncated]"));
        std::fs::write(
            dir.path().join("Oversize.cs"),
            vec![b'x'; MAX_FILE_BYTES as usize + 1],
        )
        .unwrap();
        assert!(
            find(&cfg, Some("Oversize"), None, "", "")
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn finds_stack_symbols_without_line_numbers_and_surfaces_missing_roots() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("OrderService.cs"), "void Save() {}\n").unwrap();
        let cfg = config(dir.path());
        let snippets = find(&cfg, None, None, "", "at Acme.OrderService.Save(Int32 id)").unwrap();
        assert_eq!(snippets.len(), 1);
        assert_eq!(snippets[0].evidence, "class filename and method");
        let mut cfg = cfg;
        cfg.root = Some(dir.path().join("missing"));
        assert!(find(&cfg, Some("OrderService"), None, "", "").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_symlink_files_or_directories() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("Secret.cs"), "outside").unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("linked")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("Secret.cs"),
            dir.path().join("Secret.cs"),
        )
        .unwrap();
        assert!(
            find(&config(dir.path()), Some("Secret"), None, "", "")
                .unwrap()
                .is_empty()
        );
    }
}
