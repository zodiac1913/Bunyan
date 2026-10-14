//! Runtime configuration loaded from a TOML file (default `bunyan.toml`).
//! SQL access prefers a local `dataaccess.json`; TOML/env credentials remain a fallback.

use anyhow::{Context, Result, bail};
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct Config {
    pub sqlserver: SqlServerConfig,
    pub sqlite: SqliteConfig,
    pub schedule: ScheduleConfig,
    pub ollama: OllamaConfig,
    pub source: SourceConfig,
    pub web: WebConfig,
}

/// Connection to the read-only SQL Server that owns `CORE.Log`.
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct SqlServerConfig {
    /// Web sessions override file/env authentication without persisting their password.
    #[serde(skip)]
    pub credentials: Option<SqlCredentials>,
    /// Relative paths are resolved beside the TOML config, not the executable.
    pub dataaccess_file: PathBuf,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    /// Plain-text password; prefer `password_env` so the file can be shared safely.
    pub password: Option<String>,
    pub password_env: String,
    /// Initial source table, e.g. `CORE.Log`; a saved Settings mapping takes precedence.
    pub table: String,
    /// `required` (default), `off`, or `not_supported`.
    pub encrypt: String,
    /// Accept self-signed server certificates (common on internal SQL Servers).
    pub trust_cert: bool,
}

/// Session-only SQL authentication. Debug output must never reveal the password.
#[derive(Clone)]
pub struct SqlCredentials {
    pub username: String,
    pub password: String,
}

impl std::fmt::Debug for SqlCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SqlCredentials")
            .field("username", &self.username)
            .finish_non_exhaustive()
    }
}

impl Default for SqlServerConfig {
    fn default() -> Self {
        Self {
            credentials: None,
            dataaccess_file: PathBuf::from("dataaccess.json"),
            host: "localhost".into(),
            port: 1433,
            database: "CATSDEV".into(),
            user: "bunyan_reader".into(),
            password: None,
            password_env: "BUNYAN_SQL_PASSWORD".into(),
            table: "CORE.Log".into(),
            encrypt: "required".into(),
            trust_cert: true,
        }
    }
}

impl SqlServerConfig {
    /// Reads developer-local credentials on connection. An existing but invalid JSON file is an
    /// error, never a reason to silently connect using different TOML/environment credentials.
    pub fn connection_config(&self) -> Result<tiberius::Config> {
        let mut c = self.connection_target()?;
        if let Some(credentials) = &self.credentials {
            c.authentication(tiberius::AuthMethod::sql_server(
                &credentials.username,
                &credentials.password,
            ));
        } else if !self.dataaccess_file.try_exists()? {
            c.authentication(tiberius::AuthMethod::sql_server(
                &self.user,
                self.resolve_password()?,
            ));
        }
        Ok(c)
    }

    /// Reads server/database/TLS settings without requiring a fallback password.
    pub fn connection_target(&self) -> Result<tiberius::Config> {
        let mut c = if self.dataaccess_file.try_exists()? {
            #[derive(Deserialize)]
            struct DataAccess {
                #[serde(rename = "DevConnection")]
                connection: String,
            }

            let text = std::fs::read_to_string(&self.dataaccess_file)
                .with_context(|| format!("reading {}", self.dataaccess_file.display()))?;
            // Parser errors may contain credential values; report only the location/format.
            let access: DataAccess = serde_json::from_str(&text).map_err(|e| {
                anyhow::anyhow!(
                    "{}: expected JSON with a string DevConnection (line {}, column {})",
                    self.dataaccess_file.display(),
                    e.line(),
                    e.column()
                )
            })?;
            if access.connection.trim().is_empty() {
                bail!("{}: DevConnection is empty", self.dataaccess_file.display());
            }
            tiberius::Config::from_ado_string(&access.connection).map_err(|_| {
                anyhow::anyhow!(
                    "{}: invalid DevConnection SQL Server connection string",
                    self.dataaccess_file.display()
                )
            })?
        } else {
            let mut c = tiberius::Config::new();
            c.host(&self.host);
            c.port(self.port);
            c.database(&self.database);
            c.encryption(match self.encrypt.to_lowercase().as_str() {
                "off" => tiberius::EncryptionLevel::Off,
                "not_supported" => tiberius::EncryptionLevel::NotSupported,
                _ => tiberius::EncryptionLevel::Required,
            });
            if self.trust_cert {
                c.trust_cert();
            }
            c
        };
        c.application_name("Bunyan");
        c.readonly(true);
        Ok(c)
    }

    /// Identifies the active configuration without exposing a connection string or password.
    pub fn connection_label(&self) -> Result<String> {
        if let Some(credentials) = &self.credentials {
            return Ok(format!(
                "{} @ {}",
                credentials.username,
                self.connection_target()?.get_addr()
            ));
        }
        if self.dataaccess_file.try_exists()? {
            Ok(format!(
                "{} (DevConnection)",
                self.dataaccess_file.display()
            ))
        } else {
            Ok(format!(
                "{}@{}:{}/{}",
                self.user, self.host, self.port, self.database
            ))
        }
    }

    /// Resolves the password from the env var first, then the file. Errors if neither is set.
    pub fn resolve_password(&self) -> Result<String> {
        if let Ok(pw) = std::env::var(&self.password_env)
            && !pw.is_empty()
        {
            return Ok(pw);
        }
        match &self.password {
            Some(pw) if !pw.is_empty() => Ok(pw.clone()),
            _ => bail!(
                "no SQL Server credentials: create {} with DevConnection, set env var {}, or sqlserver.password",
                self.dataaccess_file.display(),
                self.password_env
            ),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct SqliteConfig {
    pub path: PathBuf,
}

impl Default for SqliteConfig {
    fn default() -> Self {
        Self {
            path: PathBuf::from("bunyan.db"),
        }
    }
}

/// Daily import schedule, evaluated in the machine's local time zone.
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct ScheduleConfig {
    pub enabled: bool,
    /// `HH:MM`, 24-hour local time.
    pub daily_at: String,
    /// When the app was offline, import at most this many missed days on the next run.
    pub max_catchup_days: u32,
    /// After each scheduled import, ask the LLM about this many top error groups lacking a suggestion.
    pub auto_suggest_top: u32,
}

impl Default for ScheduleConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            daily_at: "06:45".into(),
            max_catchup_days: 7,
            auto_suggest_top: 5,
        }
    }
}

impl ScheduleConfig {
    pub fn time(&self) -> Result<chrono::NaiveTime> {
        chrono::NaiveTime::parse_from_str(&self.daily_at, "%H:%M")
            .with_context(|| format!("schedule.daily_at must be HH:MM, got {:?}", self.daily_at))
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct OllamaConfig {
    pub url: String,
    pub model: String,
    pub timeout_secs: u64,
}

impl Default for OllamaConfig {
    fn default() -> Self {
        Self {
            url: "http://localhost:11434".into(),
            model: "qwen2.5-coder:latest".into(),
            timeout_secs: 300,
        }
    }
}

/// Optional read-only checkout of the main application; used to add code context to LLM prompts.
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct SourceConfig {
    pub root: Option<PathBuf>,
    pub extensions: Vec<String>,
    pub context_lines: usize,
}

impl Default for SourceConfig {
    fn default() -> Self {
        Self {
            root: None,
            extensions: vec!["cs".into(), "vb".into(), "sql".into()],
            context_lines: 40,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct WebConfig {
    pub bind: String,
    /// Disable only for an intentionally unauthenticated local demo/service.
    pub require_login: bool,
    /// Launch the OS default browser for interactive runs; disable for headless services.
    pub open_browser: bool,
}

impl Default for WebConfig {
    fn default() -> Self {
        Self {
            bind: "127.0.0.1:8080".into(),
            require_login: true,
            open_browser: true,
        }
    }
}

impl Config {
    /// Reloads locally saved source settings so CLI and scheduled imports see web edits immediately.
    pub fn log_schema(&self) -> Result<crate::log_schema::LogSchema> {
        crate::log_schema::LogSchema::load(
            &crate::db::open(&self.sqlite.path)?,
            &self.sqlserver.table,
        )
    }

    /// Loads `path` if it exists; a missing file yields defaults so `seed-demo`/`serve` work out of the box.
    pub fn load(path: &Path) -> Result<Self> {
        let mut cfg = if path.try_exists()? {
            let text = std::fs::read_to_string(path)
                .with_context(|| format!("reading {}", path.display()))?;
            toml::from_str::<Config>(&text)
                .with_context(|| format!("parsing {}", path.display()))?
        } else {
            Self::default()
        };
        if cfg.sqlserver.dataaccess_file.is_relative() {
            cfg.sqlserver.dataaccess_file = path
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join(&cfg.sqlserver.dataaccess_file);
        }
        cfg.schedule.time()?;
        Ok(cfg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_auth_overrides_file_auth_without_exposing_password() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("dataaccess.json");
        std::fs::write(&path, serde_json::json!({
            "DevConnection": "Data Source=test.example,41433;Initial Catalog=TestDb;User ID=file-user;Password=file-secret;Encrypt=True"
        }).to_string()).unwrap();
        let mut cfg = SqlServerConfig {
            dataaccess_file: path,
            credentials: Some(SqlCredentials {
                username: "session-user".into(),
                password: "session-secret".into(),
            }),
            ..Default::default()
        };
        let debug = format!("{:?}", cfg.connection_config().unwrap());
        assert!(debug.contains("session-user"));
        assert!(!debug.contains("file-user"));
        assert!(!debug.contains("session-secret"));
        assert_eq!(
            cfg.connection_config().unwrap().get_addr(),
            "test.example:41433"
        );
        assert!(cfg.connection_label().unwrap().contains("session-user"));
        cfg.dataaccess_file = dir.path().join("absent.json");
        cfg.password = None;
        cfg.password_env = "BUNYAN_TEST_UNUSED_PASSWORD_ENV".into();
        assert!(cfg.connection_config().is_ok());
        assert!(!format!("{:?}", cfg.credentials).contains("session-secret"));
    }

    #[test]
    fn json_connection_overrides_legacy_settings() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("dataaccess.json"),
            serde_json::json!({
                "DevConnection": "Data Source=test.example,41433;Initial Catalog=TestDb;User ID=developer;Password=\"p;a=s\";Encrypt=True;TrustServerCertificate=True;ApplicationIntent=ReadWrite;Persist Security Info=True"
            }).to_string(),
        ).unwrap();
        // Also resolve beside a missing TOML file, as with a fresh developer checkout.
        let cfg = Config::load(&dir.path().join("bunyan.toml")).unwrap();
        let c = cfg.sqlserver.connection_config().unwrap();
        assert_eq!(c.get_addr(), "test.example:41433");
        let debug = format!("{c:?}");
        assert!(debug.contains("TestDb"));
        assert!(debug.contains("readonly: true"));
        assert!(!debug.contains("p;a=s"));
        assert!(
            cfg.sqlserver
                .connection_label()
                .unwrap()
                .contains("DevConnection")
        );
    }

    #[test]
    fn invalid_json_never_falls_back_or_exposes_secrets() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("dataaccess.json");
        let cfg = SqlServerConfig {
            dataaccess_file: path.clone(),
            password: Some("legacy-password".into()),
            ..Default::default()
        };
        for text in [
            r#"{"DevConnection":"Password=private-secret;Encrypt=invalid"}"#,
            r#"{"DevConnection":""}"#,
            r#"{"Unexpected":"private-secret"}"#,
            r#"{"DevConnection": private-secret}"#,
        ] {
            std::fs::write(&path, text).unwrap();
            let error = format!("{:#}", cfg.connection_config().unwrap_err());
            assert!(!error.contains("private-secret"));
            assert!(!error.contains("legacy-password"));
            assert!(error.contains("dataaccess.json"));
        }
    }

    #[test]
    fn absent_json_preserves_legacy_access() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = SqlServerConfig {
            dataaccess_file: dir.path().join("missing.json"),
            password_env: "BUNYAN_TEST_UNUSED_PASSWORD_ENV".into(),
            password: Some("test-password".into()),
            host: "legacy.example".into(),
            port: 1435,
            ..Default::default()
        };
        assert_eq!(
            cfg.connection_config().unwrap().get_addr(),
            "legacy.example:1435"
        );
        assert!(cfg.connection_label().unwrap().contains("legacy.example"));
    }
}
