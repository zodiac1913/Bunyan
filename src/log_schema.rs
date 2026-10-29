//! Developer-defined source schema. Only names are configurable, never executable SQL.
//! Settings live in Bunyan's SQLite file and are reloaded for each import/check.

use anyhow::{Context, Result, bail};
use regex::Regex;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::sync::LazyLock;

/// The order matches `SourceLog` decoding in `source.rs`. Missing optional fields become SQL NULL,
/// except app/severity which use the documented defaults below.
pub struct Field {
    pub key: &'static str,
    pub label: &'static str,
    pub default_column: &'static str,
    pub sql_type: &'static str,
    pub required: bool,
}

pub const FIELDS: &[Field] = &[
    Field {
        key: "id",
        label: "Unique numeric ID",
        default_column: "LogIdentifier",
        sql_type: "bigint",
        required: true,
    },
    Field {
        key: "app",
        label: "Application",
        default_column: "LogApp",
        sql_type: "nvarchar(max)",
        required: false,
    },
    Field {
        key: "level",
        label: "Log level",
        default_column: "LogType",
        sql_type: "nvarchar(max)",
        required: true,
    },
    Field {
        key: "message",
        label: "Message",
        default_column: "LogMessage",
        sql_type: "nvarchar(max)",
        required: true,
    },
    Field {
        key: "exception",
        label: "Exception / stack trace",
        default_column: "LogException",
        sql_type: "nvarchar(max)",
        required: false,
    },
    Field {
        key: "severity",
        label: "Numeric severity",
        default_column: "LogSeverity",
        sql_type: "int",
        required: false,
    },
    Field {
        key: "task_id",
        label: "App ID",
        default_column: "TaskDefinitionIdentifier",
        sql_type: "bigint",
        required: false,
    },
    Field {
        key: "task",
        label: "App",
        default_column: "TaskDefinitionTitle",
        sql_type: "nvarchar(max)",
        required: false,
    },
    Field {
        key: "project_id",
        label: "Project ID",
        default_column: "ProjectIdentifier",
        sql_type: "bigint",
        required: false,
    },
    Field {
        key: "project",
        label: "Project name",
        default_column: "ProjectName",
        sql_type: "nvarchar(max)",
        required: false,
    },
    Field {
        key: "customer_id",
        label: "Customer service ID",
        default_column: "CustomerServiceIdentifier",
        sql_type: "bigint",
        required: false,
    },
    Field {
        key: "class",
        label: "Class",
        default_column: "ClassName",
        sql_type: "nvarchar(max)",
        required: false,
    },
    Field {
        key: "method",
        label: "Method",
        default_column: "MethodName",
        sql_type: "nvarchar(max)",
        required: false,
    },
    Field {
        key: "account",
        label: "User account",
        default_column: "AddUserAccount",
        sql_type: "nvarchar(max)",
        required: false,
    },
    Field {
        key: "server",
        label: "Server",
        default_column: "Server",
        sql_type: "nvarchar(max)",
        required: false,
    },
    Field {
        key: "user_id",
        label: "User ID",
        default_column: "AddUserIdentifier",
        sql_type: "bigint",
        required: false,
    },
    Field {
        key: "user",
        label: "User name",
        default_column: "AddUserName",
        sql_type: "nvarchar(max)",
        required: false,
    },
    Field {
        key: "timestamp",
        label: "Timestamp",
        default_column: "AddTimeStamp",
        sql_type: "datetime2",
        required: true,
    },
];

/// A single source per SQLite file. Numeric IDs must be stable and unique across all imported days.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct LogSchema {
    pub table: String,
    pub columns: BTreeMap<String, String>,
}

impl LogSchema {
    pub fn legacy(table: &str) -> Self {
        Self {
            table: table.to_string(),
            columns: FIELDS
                .iter()
                .map(|f| (f.key.into(), f.default_column.into()))
                .collect(),
        }
    }

    pub fn column(&self, key: &str) -> Option<&str> {
        self.columns
            .get(key)
            .map(String::as_str)
            .filter(|c| !c.is_empty())
    }

    pub fn validate(&self) -> Result<()> {
        table_parts(&self.table)?;
        for field in FIELDS {
            match self.column(field.key) {
                Some(c) => {
                    quote_identifier(c)?;
                }
                None if field.required => bail!("{} needs a source column.", field.label),
                None => {}
            }
        }
        for key in self.columns.keys() {
            if !FIELDS.iter().any(|f| f.key == key) {
                bail!("Unknown mapping field: {key}");
            }
        }
        Ok(())
    }

    /// Uses CAST (not TRY_CAST) so bad source values fail visibly instead of disappearing.
    pub fn projection(&self) -> Result<String> {
        self.validate()?;
        FIELDS
            .iter()
            .map(|f| {
                let value = match self.column(f.key) {
                    Some(c) => quote_identifier(c)?,
                    None if f.key == "app" => "N'Application'".into(),
                    None if f.key == "severity" => "0".into(),
                    None => "NULL".into(),
                };
                Ok(format!("CAST({value} AS {})", f.sql_type))
            })
            .collect::<Result<Vec<_>>>()
            .map(|v| v.join(", "))
    }

    /// Loads a saved mapping or preserves the original CORE.Log-compatible mapping.
    pub fn load(conn: &Connection, fallback_table: &str) -> Result<Self> {
        conn.execute_batch("CREATE TABLE IF NOT EXISTS source_settings (id INTEGER PRIMARY KEY CHECK(id=1), mapping TEXT NOT NULL);")?;
        let saved: Option<String> = conn
            .query_row("SELECT mapping FROM source_settings WHERE id=1", [], |r| {
                r.get(0)
            })
            .optional()?;
        let schema = match saved {
            Some(text) => serde_json::from_str(&text).context("reading saved source mapping")?,
            None => Self::legacy(fallback_table),
        };
        schema.validate()?;
        Ok(schema)
    }

    /// Persists only local extraction settings, never credentials or source database changes.
    /// Rejects a source/identity switch once data exists to prevent LogIdentifier collisions.
    pub fn save(&self, conn: &mut Connection, fallback_table: &str) -> Result<()> {
        self.validate()?;
        let tx = conn.transaction()?;
        let old = Self::load(&tx, fallback_table)?;
        let has_data: bool =
            tx.query_row("SELECT EXISTS(SELECT 1 FROM log_entries)", [], |r| r.get(0))?;
        if has_data
            && (!quoted_table(&old.table)?.eq_ignore_ascii_case(&quoted_table(&self.table)?)
                || !old
                    .column("id")
                    .unwrap_or("")
                    .eq_ignore_ascii_case(self.column("id").unwrap_or("")))
        {
            bail!(
                "This SQLite file already has logs. Use a new sqlite.path before changing the source table or ID column."
            );
        }
        tx.execute(
            "INSERT INTO source_settings(id, mapping) VALUES(1, ?1) ON CONFLICT(id) DO UPDATE SET mapping=excluded.mapping",
            params![serde_json::to_string(self)?],
        )?;
        tx.commit()?;
        Ok(())
    }
}

/// Quotes a SQL Server identifier as data, including any closing brackets.
pub fn quote_identifier(name: &str) -> Result<String> {
    if name.trim().is_empty() || name.chars().count() > 128 || name.chars().any(char::is_control) {
        bail!(
            "Column/schema names must be nonempty, at most 128 characters, and contain no control characters."
        );
    }
    Ok(format!("[{}]", name.replace(']', "]]")))
}

/// Parses schema.table (or table, defaulting to dbo), allowing SQL Server bracket quoting.
pub fn table_parts(table: &str) -> Result<(String, String)> {
    static TABLE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(
        r"^\s*(?:\[((?:[^\]]|\]\])+)\]|([A-Za-z_][A-Za-z0-9_]*))(?:\s*\.\s*(?:\[((?:[^\]]|\]\])+)\]|([A-Za-z_][A-Za-z0-9_]*)))?\s*$"
    ).expect("table regex")
    });
    let caps = TABLE.captures(table).context(
        "Use table or schema.table (brackets are allowed); database comes from dataaccess.json.",
    )?;
    let part = |a, b| {
        caps.get(a)
            .or_else(|| caps.get(b))
            .map(|m| m.as_str().replace("]]", "]"))
    };
    let first = part(1, 2).expect("first table part");
    let (schema, name) = match part(3, 4) {
        Some(second) => (first, second),
        None => ("dbo".into(), first),
    };
    quote_identifier(&schema)?;
    quote_identifier(&name)?;
    Ok((schema, name))
}

pub fn quoted_table(table: &str) -> Result<String> {
    let (schema, name) = table_parts(table)?;
    Ok(format!(
        "{}.{}",
        quote_identifier(&schema)?,
        quote_identifier(&name)?
    ))
}

#[derive(Clone, Debug)]
pub struct Column {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
}

/// Parses a single ordinary SQL Server CREATE TABLE for form assistance only; never executes it.
/// Unsupported syntax produces an explicit error so manual entry remains the escape hatch.
pub fn parse_ddl(ddl: &str) -> Result<(String, Vec<Column>)> {
    static HEADER: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?is)^\s*CREATE\s+TABLE\s+(.+?)\s*\(").expect("DDL header regex")
    });
    static COLUMN: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(
        r"(?is)^\s*(?:\[((?:[^\]]|\]\])+)\]|([A-Za-z_][A-Za-z0-9_]*))\s+(\[?[A-Za-z_][A-Za-z0-9_]*\]?)(.*)$"
    ).expect("DDL column regex")
    });
    let caps = HEADER
        .captures(ddl)
        .context("Paste one CREATE TABLE statement, or enter the table and columns manually.")?;
    let table = caps[1].trim().to_string();
    table_parts(&table)?;
    let body = &ddl[caps.get(0).expect("header").end()..];
    let mut depth = 0usize;
    let mut bracket = false;
    let mut string = false;
    let mut start = 0;
    let mut parts = Vec::new();
    let mut closed = false;
    let mut chars = body.char_indices().peekable();
    while let Some((i, c)) = chars.next() {
        if string {
            if c == '\'' {
                if chars.peek().is_some_and(|(_, n)| *n == '\'') {
                    chars.next();
                } else {
                    string = false;
                }
            }
        } else if bracket {
            if c == ']' {
                if chars.peek().is_some_and(|(_, n)| *n == ']') {
                    chars.next();
                } else {
                    bracket = false;
                }
            }
        } else {
            match c {
                '\'' => string = true,
                '[' => bracket = true,
                '(' => depth += 1,
                ')' if depth == 0 => {
                    parts.push(&body[start..i]);
                    closed = true;
                    break;
                }
                ')' => depth -= 1,
                ',' if depth == 0 => {
                    parts.push(&body[start..i]);
                    start = i + 1;
                }
                _ => {}
            }
        }
    }
    if !closed {
        bail!("CREATE TABLE has unbalanced brackets, quotes, or parentheses.");
    }
    let mut columns = Vec::new();
    let mut names = HashSet::new();
    for part in parts {
        let upper = part.trim().to_ascii_uppercase();
        if ["CONSTRAINT ", "PRIMARY ", "FOREIGN ", "UNIQUE ", "CHECK "]
            .iter()
            .any(|s| upper.starts_with(s))
        {
            continue;
        }
        let c = COLUMN.captures(part).context(
            "Unsupported column syntax in DDL. Use plain column definitions or manual mapping.",
        )?;
        let name = c
            .get(1)
            .or_else(|| c.get(2))
            .expect("column name")
            .as_str()
            .replace("]]", "]");
        quote_identifier(&name)?;
        if !names.insert(name.to_lowercase()) {
            bail!("Duplicate column in DDL: {name}");
        }
        let data_type = c[3].trim_matches(['[', ']']).to_lowercase();
        if data_type == "as" {
            bail!(
                "Computed columns in pasted DDL are unsupported; use discovery or manual mapping."
            );
        }
        columns.push(Column {
            name,
            data_type,
            nullable: !c[4].to_uppercase().contains("NOT NULL"),
        });
    }
    if columns.is_empty() {
        bail!("No columns found in CREATE TABLE.");
    }
    Ok((table, columns))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn legacy_projection_and_safe_identifiers() {
        let mut mapping = LogSchema::legacy("CORE.Log");
        assert_eq!(quoted_table(&mapping.table).unwrap(), "[CORE].[Log]");
        assert_eq!(
            table_parts("[my schema].[log.table]").unwrap(),
            ("my schema".into(), "log.table".into())
        );
        mapping
            .columns
            .insert("message".into(), "message]; DROP TABLE x;--".into());
        assert!(
            mapping
                .projection()
                .unwrap()
                .contains("[message]]; DROP TABLE x;--]")
        );
        assert!(quoted_table("CORE.Log; DROP TABLE x").is_err());
        mapping.columns.remove("timestamp");
        assert!(mapping.validate().is_err());
    }

    #[test]
    fn optional_fields_have_explicit_defaults_and_casts() {
        let mut mapping = LogSchema::legacy("dbo.Events");
        mapping
            .columns
            .retain(|k, _| FIELDS.iter().any(|f| f.required && f.key == k));
        let projection = mapping.projection().unwrap();
        assert!(projection.contains("CAST(N'Application' AS nvarchar(max))"));
        assert!(projection.contains("CAST(0 AS int)"));
        assert!(projection.contains("CAST(NULL AS bigint)"));
        assert_eq!(projection.matches("CAST(").count(), FIELDS.len());
    }

    #[test]
    fn persists_and_protects_existing_source_identity() {
        let mut conn = db::open(std::path::Path::new(":memory:")).unwrap();
        let mapping = LogSchema::legacy("dbo.Events");
        mapping.save(&mut conn, "CORE.Log").unwrap();
        assert_eq!(LogSchema::load(&conn, "CORE.Log").unwrap(), mapping);
        conn.execute_batch(
            "INSERT INTO error_groups(id,fingerprint,log_app,log_type,template,sample_message,first_seen,last_seen)
             VALUES(1,'a','app','Error','msg','msg','2026-10-01','2026-10-01');
             INSERT INTO log_entries(log_identifier,group_id,log_app,log_type,log_severity,message,add_timestamp,day)
             VALUES(1,1,'app','Error',1,'msg','2026-10-01','2026-10-01');"
        ).unwrap();
        assert!(
            LogSchema::legacy("other.Log")
                .save(&mut conn, "CORE.Log")
                .is_err()
        );
        let mut updated = mapping.clone();
        updated
            .columns
            .insert("message".into(), "OtherMessage".into());
        updated.save(&mut conn, "CORE.Log").unwrap();
        updated.columns.insert("id".into(), "OtherId".into());
        assert!(updated.save(&mut conn, "CORE.Log").is_err());
    }

    #[test]
    fn ddl_handles_types_constraints_and_quoted_commas() {
        let (table, columns) = parse_ddl(
            "CREATE TABLE [dbo].[Events] (
             [EventId] bigint IDENTITY(1,1) NOT NULL,
             [Text] nvarchar(max) DEFAULT ('can''t, fail'),
             Amount decimal(18,2) NULL,
             [When] datetime2(7) NOT NULL,
             CONSTRAINT PK_Events PRIMARY KEY (EventId)) ON [PRIMARY];",
        )
        .unwrap();
        assert_eq!(table, "[dbo].[Events]");
        assert_eq!(columns.len(), 4);
        assert_eq!(columns[0].name, "EventId");
        assert!(!columns[0].nullable);
        assert_eq!(columns[2].data_type, "decimal");
        assert!(columns[2].nullable);
        assert!(parse_ddl("SELECT * FROM CORE.Log").is_err());
        assert!(parse_ddl("CREATE TABLE dbo.X (Id int").is_err());
        assert!(parse_ddl("CREATE TABLE dbo.X (A int, a int)").is_err());
    }
}
