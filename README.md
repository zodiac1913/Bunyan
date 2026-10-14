# Bunyan

Rust app that pulls yesterday's rows from SQL Server `CATSDEV.CORE.Log` into a local SQLite
database every morning, groups like errors, and serves a dashboard (day / week / month) with
log-level and severity counts, trends, and local-LLM fix suggestions. No JavaScript: pages and
SVG charts are rendered in Rust (axum + maud).

## Quick start

```sh
cargo build --release
cp bunyan.example.toml bunyan.toml
cp dataaccess.example.json dataaccess.json # edit DevConnection with your credentials
./target/release/bunyan check               # test SQL Server access
./target/release/bunyan import              # missed days through yesterday
./target/release/bunyan serve               # UI at http://127.0.0.1:8080 + 06:45 scheduler
```

`serve` (including F5) opens the sign-in page in your OS default external browser after binding
the server. Set `[web] open_browser = false` for headless/service runs. If browser launch fails,
the server continues and logs the URL to open manually. No IDE preview is used.

The artwork in `assets/bunyan.jpeg` is embedded in the executable and displayed behind all
pages at 8% opacity. Text, controls, cards, and panels remain fully opaque for readability.
Replace the image and rebuild to change the background; no runtime asset folder is needed.

Try it without SQL Server:

```sh
bunyan -c demo.toml seed-demo --days 120    # demo.toml: [sqlite] path = "demo.db"; [web] require_login = false
bunyan -c demo.toml serve --no-schedule
```

## Commands

| Command | Purpose |
| --- | --- |
| `serve [--no-schedule]` | Web UI plus the built-in daily scheduler |
| `import` | Missed days through yesterday (capped by `max_catchup_days`) |
| `import --date 2026-10-13` | One day; safe to re-run (rows keyed on `LogIdentifier`) |
| `import --from D --to D` | Backfill a range |
| `suggest [--group ID \| --top N --days N]` | Ollama fix suggestions |
| `check` | Verify connection and SELECT permission |
| `seed-demo [--days N]` | Synthetic data for exploring the UI |

## SQL Server access

### Workstation login

The web app starts at a SQL Server login page. Authentication verifies SELECT access to the
configured log-table mapping before granting access to the local dashboard. Web SQL connections
use the signed-in credentials, overriding file/environment credentials without rewriting them.
Server, database, and TLS settings still come from the configuration.

Choose **Don't save either**, **Save username only**, or **Save username and password**.
The name and save preference are stored in local SQLite; saved passwords go only to the OS
credential store (macOS Keychain, Windows Credential Manager, or Linux Secret Service).
Linux requires an available/unlocked desktop Secret Service. Store errors are shown explicitly;
credentials are never silently saved in plaintext. Changing the save choice on successful login
removes the previously remembered password when appropriate. A changed SQL password can be
entered manually and saved to replace the old one. Use **Sign in with saved password** explicitly;
remembering a password does not automatically sign in or embed it in HTML.

A macOS Keychain authorization popup uses your **Mac login/keychain password**, not your SQL
Server password. Choose **Always Allow** only for a Bunyan executable you trust; rebuilding the
development executable may cause macOS to request authorization again. Saved-password sign-in
reads the entry once and does not rewrite it. Duplicate sign-in submissions are rejected while
an OS prompt is pending. If saving a remember choice fails after SQL authentication succeeds,
Bunyan signs you in and displays a warning rather than forcing another login attempt. Previous
saved settings may remain after a storage failure.

Sessions last 12 hours, end on app restart, and are revoked by **Sign out**. One SQL identity
is active per app instance; a new login replaces the previous session. The scheduler waits for
sign-in and pauses new work after logout/expiry; already-running imports/suggestions may finish.
Saving a password alone does not run unattended imports. CLI commands retain their existing
file/environment authentication. For an intentionally login-free local demo or unattended service,
set `[web] require_login = false`; this also restores scheduling with file/environment credentials.
That mode does not protect the dashboard.

This is a **single-workstation app**, not a multi-tenant service: all SQL users with source SELECT
access see the same existing local logs and settings. SQL permissions do not filter historical
SQLite rows. The web listener must use loopback (`127.0.0.1` or `::1`); remote HTTP login is rejected.
Browser sessions use HTTP-only, same-site cookies and same-origin form submissions.

SQL Server errors **18487**, **18488**, and **18456/state 18** display a password-change notice.
A generic 18456 is not assumed to mean expiry, because servers may mask the reason.
**Resetting an expired SQL password inside Bunyan is not supported by the current driver.**
Use SSMS or your administrator's approved SQL tool to change it, then sign in with the new password.
Live SQL expiry and OS-keychain prompts require validation against your SQL Server and OS account.

### Existing connection configuration

Each developer keeps a local, git-ignored `dataaccess.json` beside `bunyan.toml`:

```json
{
  "DevConnection": "Data Source=localhost,1433;Initial Catalog=CATSDEV;User ID=developer;Password=replace-me;Encrypt=True;TrustServerCertificate=False"
}
```

This is a standard ADO.NET SQL Server connection string. Only the `DevConnection` property is
used; unrelated JSON properties and `Persist Security Info` are unnecessary. Keep `Data Source`
(including the port), `Initial Catalog`, `User ID`, `Password`, and your TLS settings.
Quote passwords containing semicolons using ADO.NET quoting (escape double quotes as `\"` in JSON).
For an internal server with a self-signed certificate, use `TrustServerCertificate=True` only
if you trust that server.

No password export is needed. CLI actions (`check`, `import`) use this file's credentials; web
actions and the interactive scheduler use the signed-in SQL identity.
`sqlserver.dataaccess_file` can override the path; relative paths resolve beside the
TOML file. If the JSON file is absent, the old TOML/environment settings still work. An invalid
JSON file produces an error instead of falling back to another account. Restart `serve` after
changing the configuration path. CLI credentials and connection settings are read again for each
SQL connection; web passwords remain in memory for the active session.

The file contains plaintext credentials: never share/commit it, and restrict its permissions
(e.g. `chmod 600 dataaccess.json` on macOS/Linux or a user-only ACL on Windows).

Your existing SQL login works if it can SELECT from `CORE.Log`. Bunyan only issues SELECTs and
forces `ApplicationIntent=ReadOnly`; that flag is a routing hint, **not** a permission restriction.
For database-enforced read-only access, an admin can optionally run
[sql/readonly-login.sql](sql/readonly-login.sql) to create `bunyan_reader` with `SELECT` on
`CORE.Log` only and explicit `DENY` on writes.

## Source table settings

Open **Settings** in the web UI to adapt Bunyan to another SQL Server log table. Choose:

- **Manual mapping:** enter `schema.table` and each source column name. No DDL is necessary.
- **Discover columns & suggest mappings:** reads `INFORMATION_SCHEMA.COLUMNS` in the connected
  database, showing names, SQL types, and nullability. It does not require permission to script DDL.
  Review name-based suggestions; ambiguous fields stay blank.
- **Optional DDL paste:** paste one ordinary SQL Server `CREATE TABLE` statement to describe
  columns without database access. It is parsed only, **never executed**. Omit `USE`, `GO`,
  comments, and computed columns; if parsing is unsupported, use discovery or manual entry.

These actions create a draft. **Test mapping (read-only)** compiles the SELECT and decodes one
sample row, reporting conversion/NULL errors without importing anything. This is a sample check,
not a validation of every source row. **Save extraction settings** persists the mapping in
`source_settings` in the local SQLite file. It takes effect on subsequent CLI, manual, and
scheduled imports/checks without restarting. Credentials stay in `dataaccess.json`.

Required fields are a stable, unique numeric ID (convertible to `bigint`), timestamp (native SQL
date/datetime, interpreted as stored wall-clock time), log level, and message. Optional unmapped
fields become NULL; application defaults to `Application` and severity to `0`. Map numeric
severity if you want meaningful severity statistics. Mapping values must be column names, never
SQL expressions. Source values are CAST to Bunyan types; invalid conversions or mapped required
NULLs fail visibly rather than being skipped. Column names may contain spaces; enter raw names
without brackets. Tables can use brackets, e.g. `[dbo].[Application Log]`.

Existing SQLite rows are not rewritten when mappings change; changes affect newly imported rows.
Re-imports still skip existing IDs. One SQLite file tracks one source. Once logs exist, changing
the table or ID column is blocked to avoid ID collisions; use a new `sqlite.path` for another
source. Before any settings are saved, the original `CORE.Log` mapping remains the default.
Discovery, mapping tests, and imports only SELECT from SQL Server. No source schema is changed.

## Scheduling (Windows, Linux, macOS)

`bunyan serve` contains its own scheduler: at `schedule.daily_at` (default `06:45`, local time) it
imports yesterday plus any days missed while the app was down, then optionally asks Ollama about
the top new issues. It checks the clock every 30s, so sleep/hibernate and DST changes don't skip runs.

With login required, sign in before the scheduler can import. For unattended operation, explicitly
set `[web] require_login = false` and keep the loopback-only dashboard inaccessible to untrusted users.
Keep `serve` running with your OS service manager (Windows service via NSSM or Task Scheduler
"at startup", systemd unit, or launchd agent). If you prefer OS scheduling instead, set
`schedule.enabled = false` and schedule `bunyan import` at 06:45.

## How errors are grouped

Application choices, displayed group labels, and filters unify `DotnetCats` and `DotNetCats`
as **DotNetCats**. Selecting it includes both spellings in historical and new logs; old filter
URLs still work. Raw application values and existing group identities remain unchanged.
Other application names retain their existing behavior.
The dashboard defaults to **DotNetCats** and **All levels**, shown first in the level selector.
Explicit selections (including **All apps**) persist through period, date, and Latest navigation.

Reports, chart legends, level filters, and group labels treat `Info`, `Information`, and
`Informational` as one **Information** level (case-insensitive, ignoring surrounding spaces).
Existing and future rows use this rule without rewriting raw log types or group identities.
Messages ending with `Updated User/Login` are also classified as Information: they represent
normal sign-in or activity-driven session renewal, not errors. This rule applies to historical
data, charts, filters, group labels, and automated suggestion selection. Other blank log types
remain separate; they are not assumed to be informational. Original stored levels stay intact.

Each message is normalized (GUIDs, timestamps, dates, emails, quoted strings, hex and numbers
become placeholders). The group key is `LogApp + LogType + ClassName + MethodName + exception
type + normalized message`, hashed into `error_groups.fingerprint`. Every source row is kept in
`log_entries` linked to its group, so counts per day/week/month are computed on demand.

## Fix suggestions

Use **View exception** on a dashboard group, or **Show / hide full exception** on a recent
occurrence, to inspect the complete stored exception in a scrollable view. Suggestions always
include the group's full sample exception, regardless of whether the view is collapsed; they
do not include every occurrence's exception. Bunyan does not truncate the sample exception,
but the configured Ollama model's context window still limits what the model can process.

Uses local Ollama (`[ollama]` in config), so log contents stay on the machine. Set `[source] root`
to a read-only checkout of the main app and Bunyan will find `<ClassName>.cs` and include the
method's code in the prompt. Suggestions are LLM output; verify before applying.

## Data

SQLite file at `sqlite.path` (default `bunyan.db`): `error_groups`, `log_entries`, `import_runs`,
`source_settings` (saved extraction mapping), `login_preferences` (remembered username/save flag;
no passwords).
