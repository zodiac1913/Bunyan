//! SQL authentication password changes use Microsoft's LOGIN7 implementation, including expired
//! passwords. The isolated helper receives secrets on stdin and returns only fixed result codes.

use crate::config::SqlServerConfig;
use anyhow::{Context, Result};
use serde::Serialize;
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command};

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
struct Request<'a> {
    connection_string: Option<String>,
    host: &'a str,
    port: u16,
    trust_certificate: bool,
    username: &'a str,
    old_password: &'a str,
    new_password: &'a str,
}

fn helper_path() -> Result<PathBuf> {
    let executable = std::env::current_exe()?;
    let directory = executable
        .parent()
        .context("Cannot locate the application directory")?;
    let bundled = directory.join("password-change/Bunyan.PasswordChange.dll");
    if bundled.is_file() {
        return Ok(bundled);
    }
    // macOS app bundles keep managed runtime files in Resources, outside the signed code directory.
    if cfg!(target_os = "macos") {
        let resource = directory.join("../Resources/password-change/Bunyan.PasswordChange.dll");
        if resource.is_file() {
            return Ok(resource);
        }
    }
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target/password-change/Bunyan.PasswordChange.dll");
    anyhow::ensure!(
        development.is_file(),
        "Password helper is not built. Publish tools/PasswordChange to target/password-change first."
    );
    Ok(development)
}

fn dotnet_path() -> PathBuf {
    if let Some(root) = std::env::var_os("DOTNET_ROOT") {
        return PathBuf::from(root).join(if cfg!(windows) {
            "dotnet.exe"
        } else {
            "dotnet"
        });
    }
    if let Some(home) = std::env::var_os("HOME") {
        let local = PathBuf::from(home).join(".dotnet/dotnet");
        if local.is_file() {
            return local;
        }
    }
    PathBuf::from("dotnet")
}

fn result(code: &[u8]) -> Result<()> {
    match code {
        b"ok" => Ok(()),
        b"policy" => anyhow::bail!(
            "SQL Server rejected the new password's policy or password history. Choose a different password."
        ),
        b"authentication" => anyhow::bail!(
            "SQL Server rejected the current credentials. Check the username and current password."
        ),
        b"connection" => {
            anyhow::bail!("Could not reach SQL Server. Check network access and server settings.")
        }
        b"invalid_request" => {
            anyhow::bail!("The password helper rejected the request or connection settings.")
        }
        b"rejected" => anyhow::bail!(
            "SQL Server rejected the password change. Check password policy, TLS settings, and whether this is a SQL login; contact your administrator if it continues."
        ),
        _ => anyhow::bail!(
            "Password helper failed unexpectedly. The change outcome is unknown; try signing in with the new password before retrying."
        ),
    }
}

/// Changes only the specified SQL login; no credentials are persisted here. A timeout is ambiguous:
/// SQL Server may have accepted the new password before the helper's response was lost.
pub async fn change(
    cfg: &SqlServerConfig,
    username: &str,
    old_password: &str,
    new_password: &str,
) -> Result<()> {
    let helper = helper_path()?;
    let request = serde_json::to_vec(&Request {
        connection_string: cfg.local_connection_string()?,
        host: &cfg.host,
        port: cfg.port,
        trust_certificate: cfg.trust_cert,
        username,
        old_password,
        new_password,
    })?;
    let mut child = Command::new(dotnet_path())
        .arg(helper)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .context(
            "Cannot start the password helper. Install the .NET 10 runtime or set DOTNET_ROOT.",
        )?;
    let outcome = tokio::time::timeout(Duration::from_secs(25), async move {
        let mut stdin = child.stdin.take().context("Password helper stdin unavailable")?;
        stdin.write_all(&request).await?;
        stdin.shutdown().await?;
        drop(stdin);
        child.wait_with_output().await.context("Password helper did not finish")
    })
    .await
    .context("Password change timed out; outcome unknown. Try signing in with the new password before retrying.")??;
    if !outcome.status.success() {
        return result(b"unexpected");
    }
    result(&outcome.stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_explicit_success_is_accepted_and_errors_are_sanitized() {
        assert!(result(b"ok").is_ok());
        for code in [
            b"policy".as_slice(),
            b"authentication",
            b"connection",
            b"invalid_request",
            b"rejected",
            b"private-secret",
            b"",
        ] {
            let error = result(code).unwrap_err().to_string();
            assert!(!error.contains("private-secret"));
        }
    }
}
