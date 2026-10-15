//! Click-to-run mode keeps writable state outside the installed app. A held OS file lock
//! prevents two desktop processes from opening the same database; crashes release the lock.

use anyhow::{Context, Result};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Holds the per-user paths and log; dropping this value releases the desktop-instance lock.
pub struct Desktop {
    pub config: PathBuf,
    pub log: File,
    _lock: File,
}

impl Desktop {
    /// Creates first-run defaults only if absent. Explicit config paths also isolate logs/locks
    /// in that config's directory; no files or credentials are copied from a developer checkout.
    pub fn prepare(config: Option<PathBuf>) -> Result<Self> {
        let config = match config {
            Some(path) => std::path::absolute(path)?,
            None => dirs::data_local_dir()
                .context("Cannot locate the current user's application-data directory")?
                .join("Bunyan/bunyan.toml"),
        };
        Self::prepare_at(config)
    }

    fn prepare_at(config: PathBuf) -> Result<Self> {
        let directory = config.parent().context("Config needs a parent directory")?;
        std::fs::create_dir_all(directory)
            .with_context(|| format!("creating {}", directory.display()))?;
        let mut log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(directory.join("bunyan.log"))?;
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(directory.join("desktop.lock"))?;
        if let Err(error) = lock.try_lock() {
            let message = format!(
                "Bunyan is already running for this data folder, or the OS could not lock it: {error}. Use its existing browser window and Sign Out before relaunching."
            );
            writeln!(log, "{message}")?;
            anyhow::bail!(message);
        }
        if !config.try_exists()? {
            let mut draft = tempfile::NamedTempFile::new_in(directory)?;
            draft.write_all(include_bytes!("../bunyan.example.toml"))?;
            draft
                .persist_noclobber(&config)
                .with_context(|| format!("creating {}", config.display()))?;
        }
        Ok(Self {
            config,
            log,
            _lock: lock,
        })
    }

    /// Desktop-relative database paths resolve beside the config, never Finder's/Explorer's
    /// working directory. CLI commands deliberately retain their existing path semantics.
    pub fn load_config(&self) -> Result<crate::config::Config> {
        let mut cfg = crate::config::Config::load(&self.config)?;
        cfg.sqlite.path = database_path(&self.config, &cfg.sqlite.path);
        Ok(cfg)
    }
}

fn database_path(config: &Path, database: &Path) -> PathBuf {
    if database.is_absolute() {
        database.to_owned()
    } else {
        config
            .parent()
            .expect("desktop config has a parent")
            .join(database)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_launch_creates_defaults_and_relative_data_paths_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("app/bunyan.toml");
        let app = Desktop::prepare(Some(config.clone())).unwrap();
        let cfg = app.load_config().unwrap();
        assert!(cfg.web.require_login);
        assert!(cfg.web.open_browser);
        assert_eq!(cfg.sqlite.path, config.parent().unwrap().join("bunyan.db"));
        assert_eq!(
            cfg.sqlserver.dataaccess_file,
            config.parent().unwrap().join("dataaccess.json")
        );
        assert!(Desktop::prepare(Some(config.clone())).is_err());
        assert!(
            std::fs::read_to_string(config.parent().unwrap().join("bunyan.log"))
                .unwrap()
                .contains("Bunyan is already running")
        );
        drop(app);
        let custom = "[web]\nopen_browser = false\n[sqlite]\npath = 'custom.db'\n";
        std::fs::write(&config, custom).unwrap();
        let app = Desktop::prepare(Some(config.clone())).unwrap();
        assert!(!app.load_config().unwrap().web.open_browser);
        assert_eq!(std::fs::read_to_string(&config).unwrap(), custom);
        assert_eq!(
            app.load_config().unwrap().sqlite.path,
            dir.path().join("app/custom.db")
        );
        let absolute = dir.path().join("elsewhere.db");
        assert_eq!(database_path(&config, &absolute), absolute);
    }
}
