//! First-run SQL connection setup. Persist only an allowlisted connection target in SQLite;
//! submitted usernames/passwords stay in memory until the existing Remember flow handles them.

use crate::config::{Config, SqlCredentials, SqlServerConfig};
use anyhow::{Context, Result, ensure};
use connection_string::AdoNetString;
use rusqlite::{Connection, OptionalExtension};

/// Parsed setup input separates credentials from the only string permitted in SQLite.
pub struct Setup {
    pub target: String,
    pub credentials: SqlCredentials,
}

impl Setup {
    /// Accept SQL-auth ADO.NET strings using the same parser as Tiberius. Parser diagnostics can
    /// contain input secrets, so never propagate them or retain unknown connection-string values.
    pub fn parse(input: &str) -> Result<Self> {
        ensure!(
            input.len() <= 16_384,
            "Connection string is too long (maximum 16 KiB)."
        );
        let mut pairs: AdoNetString = input.trim().parse().map_err(|_| {
            anyhow::anyhow!(
                "Invalid SQL Server connection string. Use key=value pairs separated by semicolons."
            )
        })?;
        let take = |pairs: &mut AdoNetString, keys: &[&str]| -> Result<String> {
            let values: Vec<_> = keys.iter().filter_map(|key| pairs.remove(*key)).collect();
            ensure!(
                values.len() <= 1,
                "Use only one spelling of each connection setting."
            );
            Ok(values.into_iter().next().unwrap_or_default())
        };
        let server = take(
            &mut pairs,
            &[
                "server",
                "data source",
                "addr",
                "address",
                "network address",
            ],
        )?;
        let database = take(&mut pairs, &["database", "initial catalog", "databasename"])?;
        let username = take(&mut pairs, &["uid", "username", "user", "user id"])?;
        let password = take(&mut pairs, &["password", "pwd"])?;
        ensure!(
            !server.trim().is_empty(),
            "Connection string needs Data Source (server and optional port)."
        );
        ensure!(
            !database.trim().is_empty(),
            "Connection string needs Initial Catalog (database)."
        );
        ensure!(
            !username.trim().is_empty() && username.len() <= 256,
            "Connection string needs a SQL Server User ID (up to 256 bytes)."
        );
        ensure!(
            !password.is_empty() && !password.contains('\0'),
            "Connection string needs a SQL Server Password without NUL characters."
        );
        let integrated = take(
            &mut pairs,
            &[
                "integratedsecurity",
                "integrated security",
                "trusted_connection",
            ],
        )?;
        ensure!(
            integrated.is_empty()
                || ["false", "no"]
                    .iter()
                    .any(|v| integrated.eq_ignore_ascii_case(v)),
            "Use SQL Server User ID and Password; integrated authentication is not supported by this sign-in page."
        );
        ensure!(
            !pairs.contains_key("authentication"),
            "Authentication modes other than SQL Server User ID and Password are not supported."
        );
        // Canonical target keys ensure aliases do not affect the saved credential-store identity.
        let mut target: AdoNetString = "".parse().expect("empty ADO dictionary is valid");
        target.insert("server".into(), server);
        target.insert("database".into(), database);
        for key in [
            "encrypt",
            "trustservercertificate",
            "hostnameincertificate",
            "hostname in certificate",
            "multisubnetfailover",
        ] {
            if let Some(value) = pairs.remove(key) {
                target.insert(key.into(), value);
            }
        }
        // AdoNetString's Display does not round-trip punctuation such as tcp: or instance slashes.
        // Quote whole values and sort keys for a stable, injection-safe credential-store identity.
        let mut keys: Vec<_> = target.keys().collect();
        keys.sort();
        let target = keys
            .into_iter()
            .map(|key| format!("{key}=\"{}\"", target[key].replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(";");
        tiberius::Config::from_ado_string(&target).map_err(|_| {
            anyhow::anyhow!("Invalid SQL Server server, port, database, or TLS settings.")
        })?;
        Ok(Self {
            target,
            credentials: SqlCredentials { username, password },
        })
    }
}

/// Existing TOML/DevConnection configurations still work; placeholder desktop defaults never
/// trigger a network login. The saved web target takes precedence over either file source.
pub fn needs_setup(cfg: &SqlServerConfig) -> Result<bool> {
    Ok(cfg.web_target.is_none()
        && !cfg.dataaccess_file.try_exists()?
        && (cfg.host.trim().is_empty() || cfg.host == "sqlserver.example.local"))
}

/// Read setup on startup/each unauthenticated request so a successful setup needs no app restart.
pub fn apply_saved(cfg: &mut Config) -> Result<()> {
    let conn = crate::db::open(&cfg.sqlite.path)?;
    let target: Option<String> = conn
        .query_row("SELECT target FROM sql_connection WHERE id=1", [], |row| {
            row.get(0)
        })
        .optional()?;
    if let Some(target) = target {
        tiberius::Config::from_ado_string(&target).map_err(|_| {
            anyhow::anyhow!("Saved SQL connection target is invalid; configure it again.")
        })?;
        cfg.sqlserver.web_target = Some(target);
    }
    Ok(())
}

/// Store only a target produced by Setup::parse. No submitted authentication/unknown attributes
/// are included; callers keep password storage under the user's separate Remember choice.
pub fn save(conn: &Connection, setup: &Setup) -> Result<()> {
    conn.execute(
        "INSERT INTO sql_connection(id,target) VALUES(1,?1)
        ON CONFLICT(id) DO UPDATE SET target=excluded.target",
        [&setup.target],
    )
    .context("Could not save the SQL connection target")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parsing_and_persistence_keep_credentials_out_of_saved_target() {
        for input in [
            "Data Source=tcp:sql.example.test,41433;Initial Catalog=COOLCATS;Persist Security Info=True;User ID=example-user;Password={semi;colon};Encrypt=True;TrustServerCertificate=True",
            "SERVER=tcp:sql.example.test,41433;DATABASE=COOLCATS;UID=example-user;PWD={semi;colon};Encrypt=True;TrustServerCertificate=True",
        ] {
            let setup = Setup::parse(input).unwrap();
            assert_eq!(setup.credentials.username, "example-user");
            assert_eq!(setup.credentials.password, "semi;colon");
            assert!(!setup.target.contains("example-user"));
            assert!(!setup.target.contains("semi"));
            assert!(!setup.target.contains("persist"));
            let parsed: AdoNetString = setup.target.parse().unwrap();
            assert_eq!(parsed.get("database").unwrap(), "COOLCATS");
            assert_eq!(parsed.get("encrypt").unwrap(), "True");
            assert_eq!(parsed.get("trustservercertificate").unwrap(), "True");
            assert_eq!(
                tiberius::Config::from_ado_string(&setup.target)
                    .unwrap()
                    .get_addr(),
                "sql.example.test:41433"
            );
            let dir = tempfile::tempdir().unwrap();
            let mut cfg = Config::default();
            cfg.sqlite.path = dir.path().join("setup.db");
            cfg.sqlserver.dataaccess_file = dir.path().join("absent.json");
            cfg.sqlserver.host = "sqlserver.example.local".into();
            assert!(needs_setup(&cfg.sqlserver).unwrap());
            save(&crate::db::open(&cfg.sqlite.path).unwrap(), &setup).unwrap();
            apply_saved(&mut cfg).unwrap();
            assert!(!needs_setup(&cfg.sqlserver).unwrap());
            assert_eq!(
                cfg.sqlserver.connection_target().unwrap().get_addr(),
                "sql.example.test:41433"
            );
        }
    }

    #[test]
    fn invalid_input_is_rejected_without_echoing_secrets() {
        for input in [
            "Password=private-secret;broken",
            "Server=sql;Database=db;Password=private-secret",
            "Server=sql;Database=db;User ID=user",
            "Server=sql;Database=db;User ID=user;Password=private-secret;Integrated Security=true",
            "Server=sql;Database=db;User ID=user;Password=private-secret;Encrypt=private-secret",
            "Server=sql;Database=db;User ID=user;Password=private-secret;Authentication=Active Directory Password",
        ] {
            let error = Setup::parse(input)
                .err()
                .expect("input must fail")
                .to_string();
            assert!(!error.contains("private-secret"));
        }
    }
}
