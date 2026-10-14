//! Read-only access to the SQL Server log table via `tiberius` (pure Rust TDS, works on Windows/Linux/macOS).
//! Only issues a single parameterized SELECT; the login should have nothing beyond SELECT on the table.

use crate::config::SqlServerConfig;
use crate::db::SourceLog;
use crate::log_schema::{Column, LogSchema, quote_identifier, quoted_table, table_parts};
use anyhow::{Context, Result};
use chrono::{NaiveDate, NaiveDateTime};
use futures_util::TryStreamExt;
use tiberius::{Client, Row};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

type SqlClient = Client<Compat<TcpStream>>;

pub const PASSWORD_CHANGE_MESSAGE: &str = "SQL Server requires a password change. Use SSMS or your administrator's approved SQL tool to change it, then sign in here with the new password. In-app password reset is not supported yet.";

fn sql_error(error: &anyhow::Error) -> Option<(u32, u8)> {
    error.chain().find_map(
        |cause| match cause.downcast_ref::<tiberius::error::Error>()? {
            tiberius::error::Error::Server(token) => Some((token.code(), token.state())),
            _ => None,
        },
    )
}

fn requires_password_change(error: Option<(u32, u8)>) -> bool {
    matches!(error, Some((18487 | 18488, _)) | Some((18456, 18)))
}

/// Generic rejection does not prove expiry; only explicit SQL Server error codes/states do.
pub fn password_change_required(error: &anyhow::Error) -> bool {
    requires_password_change(sql_error(error))
}

/// Login UI messages never include server-provided text or submitted secrets.
pub fn login_error_message(error: &anyhow::Error) -> &'static str {
    login_message(sql_error(error))
}

fn login_message(error: Option<(u32, u8)>) -> &'static str {
    if requires_password_change(error) {
        return PASSWORD_CHANGE_MESSAGE;
    }
    match error {
        Some((18456, _)) => {
            "SQL Server rejected the login. Check your username and password. The server may hide the exact reason; contact your administrator if it continues."
        }
        Some((18470 | 18486, _)) => {
            "This SQL login is disabled or locked. Contact your SQL Server administrator."
        }
        _ => {
            "Could not connect or read the configured log table. Check server settings, network access, TLS, and SELECT permissions."
        }
    }
}

async fn connect(cfg: &SqlServerConfig) -> Result<SqlClient> {
    let c = cfg.connection_config()?;
    let tcp = TcpStream::connect(c.get_addr())
        .await
        .with_context(|| format!("connecting to SQL Server {}", c.get_addr()))?;
    tcp.set_nodelay(true)?;
    let result = Client::connect(c, tcp.compat_write())
        .await
        .context("SQL Server login failed");
    match result {
        Err(error) if password_change_required(&error) => {
            Err(error.context(PASSWORD_CHANGE_MESSAGE))
        }
        other => other,
    }
}

/// Fetches rows whose mapped timestamp falls on `day` (source wall-clock time, as stored).
pub async fn fetch_day(
    cfg: &SqlServerConfig,
    mapping: &LogSchema,
    day: NaiveDate,
) -> Result<Vec<SourceLog>> {
    let table = quoted_table(&mapping.table)?;
    let projection = mapping.projection()?;
    let timestamp = quote_identifier(
        mapping
            .column("timestamp")
            .context("Timestamp mapping missing")?,
    )?;
    let id = quote_identifier(mapping.column("id").context("ID mapping missing")?)?;
    let start = day.and_hms_opt(0, 0, 0).expect("midnight");
    let end = start + chrono::Duration::days(1);
    let sql = format!(
        "SELECT {projection}
         FROM {table}
         WHERE {timestamp} >= @P1 AND {timestamp} < @P2
         ORDER BY {id}"
    );
    let mut client = connect(cfg).await?;
    let mut stream = client.query(sql, &[&start, &end]).await?.into_row_stream();
    let mut out = Vec::new();
    while let Some(row) = stream.try_next().await? {
        out.push(map_row(&row)?);
    }
    Ok(out)
}

/// Reads one mapped row to verify columns and conversions without importing or modifying any data.
pub async fn test_mapping(cfg: &SqlServerConfig, mapping: &LogSchema) -> Result<bool> {
    let table = quoted_table(&mapping.table)?;
    let projection = mapping.projection()?;
    let mut client = connect(cfg).await?;
    let row = client
        .query(format!("SELECT TOP (1) {projection} FROM {table}"), &[])
        .await?
        .into_row()
        .await?;
    if let Some(row) = row {
        map_row(&row)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Connectivity check for `bunyan check`: compiles the projection and returns count/latest timestamp.
pub async fn ping(
    cfg: &SqlServerConfig,
    mapping: &LogSchema,
) -> Result<(i64, Option<NaiveDateTime>)> {
    let table = quoted_table(&mapping.table)?;
    let projection = mapping.projection()?;
    let timestamp = quote_identifier(
        mapping
            .column("timestamp")
            .context("Timestamp mapping missing")?,
    )?;
    let mut client = connect(cfg).await?;
    // Compile every mapped column as well as checking connectivity; no source rows are changed.
    client
        .query(format!("SELECT TOP (0) {projection} FROM {table}"), &[])
        .await?
        .into_results()
        .await?;
    let row = client
        .query(
            format!("SELECT COUNT_BIG(*), CAST(MAX({timestamp}) AS datetime2) FROM {table}"),
            &[],
        )
        .await?
        .into_row()
        .await?
        .context("no result")?;
    Ok((
        row.try_get::<i64, _>(0)?.unwrap_or(0),
        row.try_get::<NaiveDateTime, _>(1)?,
    ))
}

/// Discovers visible columns via SQL Server metadata using SELECT only; no DDL permissions needed.
pub async fn discover_columns(cfg: &SqlServerConfig, table: &str) -> Result<Vec<Column>> {
    let (schema, table) = table_parts(table)?;
    let mut client = connect(cfg).await?;
    let rows = client
        .query(
            "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA=@P1 AND TABLE_NAME=@P2 ORDER BY ORDINAL_POSITION",
            &[&schema.as_str(), &table.as_str()],
        )
        .await?
        .into_first_result()
        .await?;
    let columns = rows
        .iter()
        .map(|r| {
            Ok(Column {
                name: s(r, 0)?.context("Metadata column name missing")?,
                data_type: s(r, 1)?.context("Metadata column type missing")?,
                nullable: s(r, 2)?.as_deref() == Some("YES"),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    anyhow::ensure!(
        !columns.is_empty(),
        "No visible columns. Check the table name, selected database, and SELECT permission."
    );
    Ok(columns)
}

fn s(row: &Row, i: usize) -> Result<Option<String>> {
    Ok(row.try_get::<&str, _>(i)?.map(str::to_string))
}

fn map_row(row: &Row) -> Result<SourceLog> {
    Ok(SourceLog {
        log_identifier: row.try_get::<i64, _>(0)?.context("LogIdentifier null")?,
        log_app: s(row, 1)?
            .context("Application is NULL; unmap it to use the default Application label")?,
        log_type: s(row, 2)?.context("Mapped log level is NULL")?,
        log_message: s(row, 3)?.context("Mapped message is NULL")?,
        log_exception: s(row, 4)?,
        log_severity: row
            .try_get::<i32, _>(5)?
            .context("Severity is NULL; unmap it to use the default 0")?,
        task_definition_identifier: row.try_get::<i64, _>(6)?,
        task_definition_title: s(row, 7)?,
        project_identifier: row.try_get::<i64, _>(8)?,
        project_name: s(row, 9)?,
        customer_service_identifier: row.try_get::<i64, _>(10)?,
        class_name: s(row, 11)?,
        method_name: s(row, 12)?,
        add_user_account: s(row, 13)?,
        server: s(row, 14)?,
        add_user_identifier: row.try_get::<i64, _>(15)?,
        add_user_name: s(row, 16)?,
        add_timestamp: row
            .try_get::<NaiveDateTime, _>(17)?
            .context("AddTimeStamp null")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expiry_is_detected_only_from_explicit_sql_errors() {
        for error in [(18487, 1), (18488, 1), (18456, 18)] {
            assert!(requires_password_change(Some(error)));
            assert_eq!(login_message(Some(error)), PASSWORD_CHANGE_MESSAGE);
        }
        for error in [(18456, 1), (18456, 8), (18470, 1), (18486, 1), (4060, 1)] {
            assert!(!requires_password_change(Some(error)));
            assert_ne!(login_message(Some(error)), PASSWORD_CHANGE_MESSAGE);
        }
        let error = anyhow::anyhow!("private-password 18487").context("SQL connection failed");
        assert!(!password_change_required(&error));
        assert!(!login_error_message(&error).contains("private-password"));
        assert!(!requires_password_change(None));
    }
}
