//! Fix suggestions from a local Ollama model. Log text never leaves the machine.
//! When `[source] root` points at a read-only checkout of the main app, the offending
//! class/method source is included in the prompt for more specific advice.

use crate::config::{Config, SourceConfig};
use crate::db::{self, GroupDetail};
use anyhow::{Context, Result, bail};
use chrono::NaiveDate;
use serde::Deserialize;
use std::path::{Path, PathBuf};

const SKIP_DIRS: &[&str] = &[
    ".git",
    "bin",
    "obj",
    "node_modules",
    "packages",
    ".vs",
    "target",
];
const MAX_WALK_ENTRIES: usize = 200_000;

#[derive(Deserialize)]
struct GenerateResponse {
    response: String,
}

/// Generates and stores a suggestion for one error group. Returns the suggestion text.
pub async fn suggest_group(cfg: &Config, group_id: i64) -> Result<String> {
    let path = cfg.sqlite.path.clone();
    let group = tokio::task::spawn_blocking(move || db::group_detail(&db::open(&path)?, group_id))
        .await??
        .context("group not found")?;
    let src_cfg = cfg.source.clone();
    let (class, method) = (group.class_name.clone(), group.method_name.clone());
    let snippet = tokio::task::spawn_blocking(move || {
        find_source(&src_cfg, class.as_deref(), method.as_deref())
    })
    .await?;
    let prompt = build_prompt(&group, snippet.as_ref());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(cfg.ollama.timeout_secs))
        .build()?;
    let resp = client
        .post(format!(
            "{}/api/generate",
            cfg.ollama.url.trim_end_matches('/')
        ))
        .json(&serde_json::json!({
            "model": cfg.ollama.model,
            "prompt": prompt,
            "stream": false,
            "options": { "temperature": 0.2 }
        }))
        .send()
        .await
        .with_context(|| format!("calling Ollama at {}", cfg.ollama.url))?;
    if !resp.status().is_success() {
        bail!(
            "Ollama returned {}: {}",
            resp.status(),
            resp.text().await.unwrap_or_default()
        );
    }
    let text = resp
        .json::<GenerateResponse>()
        .await?
        .response
        .trim()
        .to_string();
    if text.is_empty() {
        bail!("Ollama returned an empty response");
    }
    let path = cfg.sqlite.path.clone();
    let (t, model) = (text.clone(), cfg.ollama.model.clone());
    tokio::task::spawn_blocking(move || {
        db::save_suggestion(&db::open(&path)?, group_id, &t, &model)
    })
    .await??;
    Ok(text)
}

/// Suggests fixes for up to `limit` top issue groups in `[start, end)` that lack one. Stops on first LLM error.
pub async fn suggest_top(
    cfg: &Config,
    start: NaiveDate,
    end: NaiveDate,
    limit: i64,
) -> Result<usize> {
    let path = cfg.sqlite.path.clone();
    let ids = tokio::task::spawn_blocking(move || {
        db::groups_needing_suggestion(&db::open(&path)?, start, end, limit)
    })
    .await??;
    for id in &ids {
        tracing::info!(group = id, "generating suggestion");
        suggest_group(cfg, *id).await?;
    }
    Ok(ids.len())
}

fn truncate(s: &str, max: usize) -> &str {
    match s.char_indices().nth(max) {
        Some((i, _)) => &s[..i],
        None => s,
    }
}

fn build_prompt(g: &GroupDetail, snippet: Option<&(PathBuf, String)>) -> String {
    let mut p = String::from(
        "You are a senior .NET/SQL Server engineer triaging production logs.\n\
         Given the recurring log entry below, respond concisely with:\n\
         1. Likely root cause\n2. Concrete fix (code or configuration), with a short code sample if useful\n\
         3. How to verify the fix\n\
         If the information is insufficient, say what additional data would help. Do not invent class names.\n\n",
    );
    p += &format!("Application: {}\nLog type: {}\n", g.log_app, g.log_type);
    if let Some(c) = &g.class_name {
        p += &format!("Class: {c}\n");
    }
    if let Some(m) = &g.method_name {
        p += &format!("Method: {m}\n");
    }
    if let Some(e) = &g.exception_type {
        p += &format!("Exception type: {e}\n");
    }
    p += &format!(
        "Occurrences: {} (first {}, last {})\nNormalized message: {}\nSample message: {}\n",
        g.total,
        g.first_seen,
        g.last_seen,
        g.template,
        truncate(&g.sample_message, 2000)
    );
    if let Some(ex) = &g.sample_exception {
        p += &format!("Sample exception:\n{ex}\n");
    }
    if let Some((file, code)) = snippet {
        p += &format!(
            "\nRelevant source ({}):\n```\n{}\n```\n",
            file.display(),
            code
        );
    }
    p
}

/// Read-only search of the configured source tree for `<ClassName>.<ext>`; returns the file and
/// lines around the method (or the file head if the method is not found).
pub fn find_source(
    cfg: &SourceConfig,
    class: Option<&str>,
    method: Option<&str>,
) -> Option<(PathBuf, String)> {
    let root = cfg.root.as_ref()?;
    // ClassName may be namespace-qualified ("Foo.Bar.OrderService").
    let class = class?.rsplit('.').next()?.to_lowercase();
    let file = walk_find(root, &class, &cfg.extensions)?;
    let text = std::fs::read_to_string(&file).ok()?;
    let lines: Vec<&str> = text.lines().collect();
    let center = method
        .and_then(|m| {
            let needle = format!("{m}(");
            lines.iter().position(|l| l.contains(&needle))
        })
        .unwrap_or(0);
    let from = center.saturating_sub(cfg.context_lines / 4);
    let to = (center + cfg.context_lines).min(lines.len());
    let snippet = lines[from..to]
        .iter()
        .enumerate()
        .map(|(i, l)| format!("{:>5} {}", from + i + 1, l))
        .collect::<Vec<_>>()
        .join("\n");
    Some((file, snippet))
}

fn walk_find(root: &Path, stem_lower: &str, exts: &[String]) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    let mut seen = 0;
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            seen += 1;
            if seen > MAX_WALK_ENTRIES {
                return None;
            }
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                if !SKIP_DIRS.contains(&name.as_str()) {
                    stack.push(path);
                }
            } else if ft.is_file() {
                let stem = path.file_stem().map(|s| s.to_string_lossy().to_lowercase());
                let ext = path.extension().map(|s| s.to_string_lossy().to_lowercase());
                if stem.as_deref() == Some(stem_lower)
                    && ext.is_some_and(|e| exts.iter().any(|x| x.eq_ignore_ascii_case(&e)))
                {
                    return Some(path);
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_includes_full_large_sample_exception() {
        let exception = format!("{}END_OF_EXCEPTION", "stack frame\n".repeat(1000));
        let group = GroupDetail {
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
        };
        let prompt = build_prompt(&group, None);
        assert!(prompt.contains(&exception));
        assert!(prompt.contains("END_OF_EXCEPTION"));
    }

    #[test]
    fn finds_method_in_source_tree() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("src/Services")).unwrap();
        std::fs::create_dir_all(dir.path().join("bin")).unwrap();
        std::fs::write(dir.path().join("bin/OrderService.cs"), "wrong").unwrap();
        std::fs::write(
            dir.path().join("src/Services/OrderService.cs"),
            "class OrderService {\n  void Other() {}\n  public void Save(int id) {\n    db.Save(id);\n  }\n}\n",
        )
        .unwrap();
        let cfg = SourceConfig {
            root: Some(dir.path().into()),
            extensions: vec!["cs".into()],
            context_lines: 8,
        };
        let (file, snip) = find_source(&cfg, Some("Acme.OrderService"), Some("Save")).unwrap();
        assert!(file.ends_with("src/Services/OrderService.cs"));
        assert!(snip.contains("public void Save(int id)"));
    }
}
