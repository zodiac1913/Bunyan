//! One persisted provider per database. Cloud requests require explicit consent; credentials
//! come from environment variables and are never included in saved settings or UI responses.

use crate::config::Config;
use anyhow::{Context, Result, bail};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    #[default]
    Ollama,
    Openai,
    Copilot,
}

impl Provider {
    pub fn name(self) -> &'static str {
        match self {
            Self::Ollama => "Ollama",
            Self::Openai => "OpenAI",
            Self::Copilot => "GitHub Copilot",
        }
    }
}

/// Saved settings contain no secrets. Legacy TOML Ollama settings remain the initial fallback.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Settings {
    pub provider: Provider,
    pub ollama_url: String,
    pub ollama_model: String,
    pub openai_model: String,
    pub copilot_model: String,
    pub copilot_models: Vec<String>,
    pub timeout_secs: u64,
    pub cloud_consent: bool,
}

impl Settings {
    pub fn fallback(cfg: &Config) -> Self {
        Self {
            provider: Provider::Ollama,
            ollama_url: cfg.ollama.url.clone(),
            ollama_model: cfg.ollama.model.clone(),
            openai_model: "gpt-4.1-mini".into(),
            copilot_model: "auto".into(),
            copilot_models: vec!["auto".into()],
            timeout_secs: cfg.ollama.timeout_secs,
            cloud_consent: false,
        }
    }

    pub fn model(&self) -> &str {
        match self.provider {
            Provider::Ollama => &self.ollama_model,
            Provider::Openai => &self.openai_model,
            Provider::Copilot => &self.copilot_model,
        }
    }

    pub fn label(&self) -> String {
        format!("{} / {}", self.provider.name(), self.model())
    }

    pub fn validate(&self) -> Result<()> {
        anyhow::ensure!(
            (1..=3600).contains(&self.timeout_secs),
            "AI timeout must be between 1 and 3600 seconds."
        );
        anyhow::ensure!(
            !self.model().trim().is_empty() && !self.model().chars().any(char::is_control),
            "Enter a valid model for the selected AI provider."
        );
        if self.provider == Provider::Ollama {
            crate::source_code::local_ollama(&self.ollama_url)?;
            let url = reqwest::Url::parse(&self.ollama_url)?;
            anyhow::ensure!(
                url.username().is_empty()
                    && url.password().is_none()
                    && url.query().is_none()
                    && url.fragment().is_none(),
                "Ollama URL must not contain credentials, query parameters, or fragments."
            );
        } else {
            anyhow::ensure!(
                self.cloud_consent,
                "Explicit consent is required to send log messages, exceptions, and source excerpts to a hosted AI provider."
            );
        }
        anyhow::ensure!(
            self.copilot_models.len() <= 100
                && self
                    .copilot_models
                    .iter()
                    .all(|model| !model.trim().is_empty()
                        && model.len() <= 200
                        && !model.chars().any(char::is_control)),
            "Enter at most 100 valid Copilot model IDs."
        );
        Ok(())
    }
}

/// Reloaded for each job so manual, scheduled, and CLI suggestions share a single selection.
pub fn load(conn: &Connection, cfg: &Config) -> Result<Settings> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS ai_settings (id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL);")?;
    let text: Option<String> = conn
        .query_row("SELECT config FROM ai_settings WHERE id=1", [], |row| {
            row.get(0)
        })
        .optional()?;
    match text {
        Some(text) => serde_json::from_str(&text).context("Reading saved AI settings"),
        None => Ok(Settings::fallback(cfg)),
    }
}

/// Save a single provider atomically. Credentials are checked only when a generation is requested.
pub fn save(conn: &Connection, cfg: &Config, settings: &Settings) -> Result<()> {
    settings.validate()?;
    load(conn, cfg)?;
    conn.execute(
        "INSERT INTO ai_settings(id,config) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET config=excluded.config",
        [serde_json::to_string(settings)?],
    )?;
    Ok(())
}

/// No automatic provider fallback: unavailable credentials, malformed output, or timeouts fail visibly.
pub async fn generate(settings: &Settings, prompt: &str) -> Result<String> {
    settings.validate()?;
    let text = match settings.provider {
        Provider::Ollama => {
            http_generate(
                settings,
                prompt,
                &format!("{}/api/generate", settings.ollama_url.trim_end_matches('/')),
                None,
            )
            .await?
        }
        Provider::Openai => {
            let key = secret("OPENAI_API_KEY")?;
            http_generate(
                settings,
                prompt,
                "https://api.openai.com/v1/chat/completions",
                Some(&key),
            )
            .await?
        }
        Provider::Copilot => {
            let token = secret("COPILOT_GITHUB_TOKEN")?;
            copilot_generate(settings, prompt, &token, "copilot").await?
        }
    };
    let text = text.trim().to_owned();
    anyhow::ensure!(
        !text.is_empty(),
        "{} returned an empty response.",
        settings.provider.name()
    );
    Ok(text)
}

/// The browser supplies only user/assistant turns; the server owns the read-only system context.
#[derive(Clone, Serialize)]
pub struct Message {
    pub role: &'static str,
    pub content: String,
}

/// Model overrides are per chat request and never change the single saved active provider.
pub async fn chat(settings: &Settings, messages: &[Message]) -> Result<String> {
    settings.validate()?;
    let text = match settings.provider {
        Provider::Copilot => {
            let token = secret("COPILOT_GITHUB_TOKEN")?;
            let prompt = serde_json::to_string(messages)?;
            copilot_generate(settings, &prompt, &token, "copilot").await?
        }
        Provider::Ollama | Provider::Openai => {
            let (endpoint, key) = if settings.provider == Provider::Ollama {
                (
                    format!("{}/api/chat", settings.ollama_url.trim_end_matches('/')),
                    None,
                )
            } else {
                (
                    "https://api.openai.com/v1/chat/completions".into(),
                    Some(secret("OPENAI_API_KEY")?),
                )
            };
            let mut body =
                serde_json::json!({"model":settings.model(), "messages":messages, "stream":false});
            if settings.provider == Provider::Openai {
                body["store"] = false.into();
            }
            let body = request_json(settings, &endpoint, key.as_deref(), body).await?;
            let content = if settings.provider == Provider::Ollama {
                body.pointer("/message/content")
            } else {
                body.pointer("/choices/0/message/content")
            };
            content
                .and_then(serde_json::Value::as_str)
                .context("AI provider returned no chat text.")?
                .to_owned()
        }
    };
    let text = text.trim().to_string();
    anyhow::ensure!(
        !text.is_empty(),
        "{} returned an empty response.",
        settings.provider.name()
    );
    anyhow::ensure!(
        !crate::db::suggestion_is_outdated(&text),
        "AI response contains internal grouping placeholders. Retry with the original error details."
    );
    Ok(text)
}

/// Ollama/OpenAI enumerate their own models; Copilot's list is configured from the user's
/// account (/model in the CLI), since the CLI has no stable model-enumeration command.
pub async fn models(settings: &Settings) -> Result<Vec<String>> {
    // Model metadata contains no logs/source. Listing models does not authorize hosted generation.
    let mut discovery = settings.clone();
    discovery.cloud_consent = true;
    discovery.validate()?;
    if settings.provider == Provider::Copilot {
        secret("COPILOT_GITHUB_TOKEN")?;
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            tokio::process::Command::new("copilot")
                .arg("--version")
                .kill_on_drop(true)
                .output(),
        )
        .await
        .context("Copilot CLI availability check timed out.")?
        .context("Install GitHub Copilot CLI and ensure copilot is on PATH.")?;
        anyhow::ensure!(
            output.status.success(),
            "GitHub Copilot CLI availability check failed."
        );
        let mut models = settings.copilot_models.clone();
        models.push(settings.copilot_model.clone());
        models.sort();
        models.dedup();
        return Ok(models);
    }
    let endpoint = if settings.provider == Provider::Ollama {
        format!("{}/api/tags", settings.ollama_url.trim_end_matches('/'))
    } else {
        "https://api.openai.com/v1/models".into()
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .build()?;
    let mut request = client.get(endpoint);
    if settings.provider == Provider::Openai {
        request = request.bearer_auth(secret("OPENAI_API_KEY")?);
    }
    let response = request.send().await.context("Cannot list AI models.")?;
    anyhow::ensure!(
        response.status().is_success(),
        "Model discovery returned HTTP {}.",
        response.status()
    );
    let body: serde_json::Value = response
        .json()
        .await
        .context("Invalid model-list response.")?;
    let (list, field) = if settings.provider == Provider::Ollama {
        (body.get("models"), "name")
    } else {
        (body.get("data"), "id")
    };
    let list = list
        .and_then(serde_json::Value::as_array)
        .context("Provider returned no model list.")?;
    let mut models: Vec<String> = list
        .iter()
        .map(|item| {
            item.get(field)
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
                .context("Provider returned an invalid model ID.")
        })
        .collect::<Result<_>>()?;
    models.sort();
    models.dedup();
    Ok(models)
}

fn secret(name: &str) -> Result<String> {
    let value = std::env::var(name).with_context(|| {
        format!("Set {name} in Bunyan's environment before using this provider.")
    })?;
    anyhow::ensure!(!value.trim().is_empty(), "{name} must not be empty.");
    Ok(value)
}

async fn http_generate(
    settings: &Settings,
    prompt: &str,
    endpoint: &str,
    key: Option<&str>,
) -> Result<String> {
    let body = if settings.provider == Provider::Ollama {
        serde_json::json!({"model": settings.model(), "prompt": prompt, "stream": false, "options": {"temperature": 0.2}})
    } else {
        serde_json::json!({"model": settings.model(), "messages": [{"role": "user", "content": prompt}], "stream": false, "store": false})
    };
    let body = request_json(settings, endpoint, key, body).await?;
    let text = if settings.provider == Provider::Ollama {
        body.get("response")
    } else {
        body.pointer("/choices/0/message/content")
    };
    text.and_then(serde_json::Value::as_str)
        .map(str::to_owned)
        .context("AI provider returned no text response.")
}

async fn request_json(
    settings: &Settings,
    endpoint: &str,
    key: Option<&str>,
    body: serde_json::Value,
) -> Result<serde_json::Value> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(settings.timeout_secs))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .build()?;
    let mut request = client.post(endpoint);
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    let response = request
        .json(&body)
        .send()
        .await
        .with_context(|| format!("Calling {}", settings.provider.name()))?;
    anyhow::ensure!(
        response.status().is_success(),
        "{} returned HTTP {}. Check credentials, model access, quota, and provider availability.",
        settings.provider.name(),
        response.status()
    );
    response
        .json()
        .await
        .context("AI provider returned invalid JSON.")
}

/// Copilot gets only stdin evidence in an isolated temporary workspace/configuration. No tools,
/// repository instructions, MCP integrations, or inherited shell hooks may act on the checkout.
async fn copilot_generate(
    settings: &Settings,
    prompt: &str,
    token: &str,
    executable: &str,
) -> Result<String> {
    let dir = tempfile::tempdir().context("Creating isolated Copilot workspace")?;
    let mut command = tokio::process::Command::new(executable);
    command
        .args([
            "--silent",
            "--stream=off",
            "--available-tools=",
            "--deny-tool=shell",
            "--deny-tool=write",
            "--disable-builtin-mcps",
            "--no-custom-instructions",
            "--no-auto-update",
            "--no-ask-user",
            "--no-color",
            "--no-bash-env",
            "--no-remote-export",
            "--model",
        ])
        .arg(&settings.copilot_model)
        .current_dir(dir.path())
        .env_clear()
        .env(
            "PATH",
            std::env::var_os("PATH").context("PATH is required for Copilot CLI.")?,
        )
        .env("HOME", dir.path())
        .env("USERPROFILE", dir.path())
        .env("TMPDIR", dir.path())
        .env("TMP", dir.path())
        .env("TEMP", dir.path())
        .env("COPILOT_HOME", dir.path())
        .env("COPILOT_GITHUB_TOKEN", token)
        .env_remove("NODE_OPTIONS")
        .env_remove("BASH_ENV")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    if let Some(root) = std::env::var_os("SystemRoot") {
        command.env("SystemRoot", root);
    }
    let work = async {
        let mut child = command.spawn().context("Cannot start GitHub Copilot CLI. Install a current version and ensure copilot is on PATH.")?;
        let mut stdin = child.stdin.take().context("Cannot open Copilot stdin")?;
        // Drain stdout/stderr concurrently with input so large prompts cannot deadlock a child.
        let write = async {
            stdin.write_all(prompt.as_bytes()).await?;
            drop(stdin);
            Ok::<_, std::io::Error>(())
        };
        let ((), output) = tokio::try_join!(write, child.wait_with_output())?;
        if !output.status.success() {
            bail!(
                "GitHub Copilot CLI failed ({}). Check COPILOT_GITHUB_TOKEN, subscription/model access, and CLI version. Provider diagnostics are withheld because they may contain log text or secrets.",
                output.status
            );
        }
        String::from_utf8(output.stdout).context("Copilot returned invalid UTF-8.")
    };
    tokio::time::timeout(std::time::Duration::from_secs(settings.timeout_secs), work)
        .await
        .context("GitHub Copilot request timed out.")?
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Json, Router,
        extract::State,
        http::{HeaderMap, StatusCode},
        routing::{get, post},
    };
    use std::sync::{Arc, Mutex};

    #[test]
    fn one_provider_is_persisted_and_hosted_selection_requires_consent() {
        let dir = tempfile::tempdir().unwrap();
        let mut cfg = Config::default();
        cfg.sqlite.path = dir.path().join("ai.db");
        let conn = crate::db::open(&cfg.sqlite.path).unwrap();
        let mut settings = load(&conn, &cfg).unwrap();
        assert_eq!(settings.provider, Provider::Ollama);
        assert_eq!(settings.model(), cfg.ollama.model);
        settings.provider = Provider::Openai;
        assert!(
            save(&conn, &cfg, &settings)
                .unwrap_err()
                .to_string()
                .contains("consent")
        );
        assert_eq!(load(&conn, &cfg).unwrap().provider, Provider::Ollama);
        settings.cloud_consent = true;
        save(&conn, &cfg, &settings).unwrap();
        settings.provider = Provider::Copilot;
        save(&conn, &cfg, &settings).unwrap();
        drop(conn);
        let conn = crate::db::open(&cfg.sqlite.path).unwrap();
        assert_eq!(load(&conn, &cfg).unwrap().provider, Provider::Copilot);
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM ai_settings", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        settings.provider = Provider::Ollama;
        settings.ollama_url = "https://example.com".into();
        assert!(save(&conn, &cfg, &settings).is_err());
    }

    #[tokio::test]
    async fn providers_use_expected_requests_and_hide_failure_bodies() {
        let captured = Arc::new(Mutex::new(Vec::<serde_json::Value>::new()));
        let app = Router::new()
            .route("/api/generate", post(|State(captured): State<Arc<Mutex<Vec<serde_json::Value>>>>, Json(body): Json<serde_json::Value>| async move {
                captured.lock().unwrap().push(body);
                Json(serde_json::json!({"response":"Local advice"}))
            }))
            .route("/openai", post(|State(captured): State<Arc<Mutex<Vec<serde_json::Value>>>>, headers: HeaderMap, Json(body): Json<serde_json::Value>| async move {
                assert_eq!(headers["authorization"], "Bearer fake-test-key");
                captured.lock().unwrap().push(body);
                Json(serde_json::json!({"choices":[{"message":{"content":"Hosted advice"}}]}))
            }))
            .route("/api/chat", post(|Json(body): Json<serde_json::Value>| async move {
                assert_eq!(body["model"], "alternate-model");
                assert_eq!(body["messages"][0]["role"], "system");
                assert_eq!(body["messages"][2]["role"], "assistant");
                Json(serde_json::json!({"message":{"content":"Follow-up answer"}}))
            }))
            .route("/api/tags", get(|| async { Json(serde_json::json!({"models":[{"name":"alternate-model"},{"name":"local-model"}]})) }))
            .route("/failure", post(|| async { (StatusCode::UNAUTHORIZED, "PRIVATE_PROVIDER_BODY") }))
            .route("/malformed", post(|| async { Json(serde_json::json!({"choices":[]})) }))
            .with_state(captured.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let mut settings = Settings::fallback(&Config::default());
        settings.ollama_url = base.clone();
        assert_eq!(
            generate(&settings, "test prompt").await.unwrap(),
            "Local advice"
        );
        assert_eq!(captured.lock().unwrap()[0]["prompt"], "test prompt");
        settings.ollama_model = "alternate-model".into();
        let messages = vec![
            Message {
                role: "system",
                content: "Read-only context".into(),
            },
            Message {
                role: "user",
                content: "Question".into(),
            },
            Message {
                role: "assistant",
                content: "Prior answer".into(),
            },
            Message {
                role: "user",
                content: "Follow-up".into(),
            },
        ];
        assert_eq!(
            chat(&settings, &messages).await.unwrap(),
            "Follow-up answer"
        );
        assert!(
            models(&settings)
                .await
                .unwrap()
                .contains(&"local-model".to_string())
        );
        settings.provider = Provider::Openai;
        settings.cloud_consent = true;
        assert_eq!(
            http_generate(
                &settings,
                "test prompt",
                &format!("{base}/openai"),
                Some("fake-test-key")
            )
            .await
            .unwrap(),
            "Hosted advice"
        );
        {
            let captured = captured.lock().unwrap();
            assert_eq!(captured[1]["store"], false);
            assert_eq!(captured[1]["messages"][0]["content"], "test prompt");
            assert!(captured[1].get("tools").is_none());
        }
        let error = http_generate(
            &settings,
            "test prompt",
            &format!("{base}/failure"),
            Some("fake-test-key"),
        )
        .await
        .unwrap_err()
        .to_string();
        assert!(error.contains("401"));
        assert!(!error.contains("PRIVATE_PROVIDER_BODY"));
        assert!(!error.contains("fake-test-key"));
        assert!(
            http_generate(
                &settings,
                "test",
                &format!("{base}/malformed"),
                Some("fake-test-key")
            )
            .await
            .is_err()
        );
        server.abort();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn copilot_receives_stdin_without_repo_access_or_inherited_config() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let executable = dir.path().join("fake-copilot");
        std::fs::write(&executable, "#!/bin/sh\nprintf '%s\\n' \"$@\"\nprintf 'HOME=%s\\nCONFIG=%s\\nTOKEN=%s\\n' \"$HOME\" \"$COPILOT_HOME\" \"$COPILOT_GITHUB_TOKEN\"\n/bin/pwd\n/bin/cat\n").unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
        let settings = Settings::fallback(&Config::default());
        let output = copilot_generate(
            &settings,
            "PRIVATE_TEST_PROMPT",
            "fake-token",
            executable.to_str().unwrap(),
        )
        .await
        .unwrap();
        assert!(output.contains("--available-tools="));
        assert!(output.contains("--deny-tool=write"));
        assert!(output.contains("--deny-tool=shell"));
        assert!(output.contains("--disable-builtin-mcps"));
        assert!(output.contains("--no-custom-instructions"));
        assert!(output.contains("PRIVATE_TEST_PROMPT"));
        let (args, environment) = output.split_once("HOME=").unwrap();
        assert!(!args.contains("PRIVATE_TEST_PROMPT"));
        assert!(!args.contains("fake-token"));
        let home = environment.lines().next().unwrap();
        assert!(
            !std::path::Path::new(home).exists(),
            "temporary CLI data must be removed"
        );
        assert!(!output.contains(&std::env::current_dir().unwrap().display().to_string()));
        std::fs::write(
            &executable,
            "#!/bin/sh\nprintf 'SECRET_DIAGNOSTICS' >&2\nexit 1\n",
        )
        .unwrap();
        let error = copilot_generate(
            &settings,
            "test",
            "fake-token",
            executable.to_str().unwrap(),
        )
        .await
        .unwrap_err()
        .to_string();
        assert!(error.contains("failed"));
        assert!(!error.contains("SECRET_DIAGNOSTICS"));
    }
}
