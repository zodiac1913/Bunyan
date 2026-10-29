# Bunyan

Rust app that pulls yesterday's rows from SQL Server `CATSDEV.CORE.Log` into a local SQLite
database every morning, groups like errors, and serves a dashboard (day / week / month) with
log-level and severity counts, trends, and AI fix suggestions (local Ollama by default). Pages and SVG charts are
rendered in Rust (axum + maud); dashboard filters submit immediately on change.
The browser remembers the selected app, log level, date, and Day/Week/Month in local storage.
Dashboard links restore that investigation after viewing a log, settings, or imports; explicit
filtered URLs and **Latest** take precedence. Restarting Bunyan discards the remembered selections
on the next page load without clearing unrelated browser storage. No log text or credentials are
stored by this helper. If browser storage is blocked, a notice explains using Back instead.

## Quick start

Release identifiers live in `VERSION` as `YYYY.MM.DD.xx`, where the attempt is 0-99
(for example, `2026.10.15.0`, then `2026.10.15.1`). Update it before each release build;
Cargo embeds it in `bunyan --version` and the navbar beside Sign Out, with `me-5` spacing.
Rebuild the binary/app after changing it. Cargo's package version remains SemVer for tooling.

### Clickable desktop app (macOS, Linux, Windows)

Desktop mode opens the **OS default external browser**, not an IDE tab. **Sign Out**
revokes the session, clears the cookie, stops the web server/scheduler, and exits Bunyan.
The browser tab remains with a stopped message; click the app icon again to restart.
Closing the tab alone does not stop Bunyan. In-flight requests get up to five seconds
to finish; do not sign out while work you need is running. Data/settings survive exit.
The desktop app is not installed as a service and does not restart itself.

**Build prerequisites:** Rust 1.89+ and Cargo (current stable recommended), a native C/C++
toolchain for bundled SQLite (Xcode Command Line Tools on macOS, build-essential on Linux,
MSVC Build Tools on Windows), and the .NET 10 SDK for the SQL password-change helper.
End users need the .NET 10 runtime for password changes; the rest of the UI does not
need .NET. Linux saved-password support needs an unlocked Secret Service/keyring.
Ollama is optional; install it and pull a model to use local AI.

Build on each target OS; these scripts do not cross-compile:

| OS | Build command from the repo root | Click to launch |
| --- | --- | --- |
| macOS | `sh scripts/package-desktop.sh` | `target/desktop/Bunyan.app` (movable to Applications) |
| Linux | `sh scripts/package-desktop.sh` | `target/desktop/Bunyan.desktop` |
| Windows (PowerShell) | `powershell -ExecutionPolicy Bypass -File scripts/package-desktop.ps1` | `target/desktop/Bunyan.lnk` |

The macOS app has an artwork icon and is ad-hoc signed for local builds, **not notarized**.
Public distribution requires your own Developer ID signing/notarization. The Linux launcher
has absolute paths: keep its sibling `Bunyan` directory in place, then copy the launcher to
`~/.local/share/applications/` for an app-menu entry. Your desktop may require marking it
trusted. The Windows shortcut uses an artwork icon and a minimized console so command-line
commands continue to work; keep its sibling `Bunyan` directory in place. Windows signing
and Linux/Windows installer distribution are not supplied by these local packaging scripts.
Only macOS packaging has been run here; Linux and Windows need native build/smoke testing.

**First run and defaults**

1. Click the icon (or run `cargo run -- desktop`). No subcommand also selects desktop mode.
2. Bunyan creates a **new, separate per-user** config, SQLite database, log, and instance lock:

   | OS | Data/config directory |
   | --- | --- |
   | macOS | `~/Library/Application Support/Bunyan/` |
   | Linux | `$XDG_DATA_HOME/Bunyan/`, or `~/.local/share/Bunyan/` |
   | Windows | `%LOCALAPPDATA%\Bunyan\` |

3. The generated `bunyan.toml` starts from `bunyan.example.toml`. Defaults are
   `127.0.0.1:8080`, SQL login required, a 06:45 daily schedule (after sign-in), a fresh
   `bunyan.db`, and local Ollama `qwen2.5-coder:latest`. No checkout database, passwords,
   connection files, or AI settings are copied into a package or imported automatically.
4. On first sign-in, paste your SQL Server **ADO.NET connection string** and select
   **Remember on this computer**. Username/password inputs are hidden until a target exists.
   Bunyan parses the string before any SQL connection attempt, saves only server/database/TLS
   settings in SQLite, and uses the supplied credentials to verify read access.
   The original string/password are never written to config, logs, SQLite, or returned HTML.
   After setup (including a failed SQL login), the string input is hidden and normal
   username/password sign-in is shown. Use **Change SQL Server connection** to correct it.
   Changing targets after logs have been imported requires a fresh SQLite database to avoid
   mixing sources. Existing TOML/`dataaccess.json` configurations continue to work; web setup
   takes precedence without rewriting either file.
   If SQL is not configured yet, use Ctrl+C from a
   terminal launch, or stop that specific Bunyan process; there is no login-page Quit control.
5. Set the table/columns, related checkout, and AI provider in web **Settings**. Web-saved
   settings live in that per-user SQLite file. Desktop-relative database paths resolve
   beside the TOML, regardless of where the app icon was opened.

For an isolated no-SQL demo, create a config in an empty folder:

```toml
[web]
require_login = false
[schedule]
enabled = false
```

Then run `bunyan -c /absolute/path/to/demo/bunyan.toml desktop`. Sign Out still stops
the desktop app in demo mode. To seed that same database first, use
`bunyan -c /absolute/path/to/demo/bunyan.toml seed-demo --days 120` **from that folder**
(CLI-relative SQLite paths remain relative to the working directory).

**Diagnostics:** `bunyan.log` in the data directory records startup, URL, and failures;
macOS Finder startup failures also go to `launcher.log` and show a native alert.
`bunyan desktop --no-browser --no-schedule` runs the same lifecycle from a terminal.
`-c /absolute/path/to/bunyan.toml` overrides the desktop config/data folder for testing;
logs and the instance lock live beside that file. A second desktop process using the
same folder is rejected rather than opening the SQLite database twice. A busy port is
an explicit startup error: stop the other Bunyan instance, or choose another loopback
port in TOML (`127.0.0.1:0` requests an available port). Never kill an unrelated process.
Terminal environment variables may not be inherited by Finder-launched apps; arrange
`OPENAI_API_KEY`, `COPILOT_GITHUB_TOKEN`, and `DOTNET_ROOT` in the launch environment if needed.

### Developer CLI / persistent server

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
Catstrap (`assets/css/catsStrap.css`) supplies Bootstrap-compatible base CSS. The bundled
Bootstrap JavaScript, Bootstrap Icons CSS/WOFF fonts, and SML ES modules/styles load locally
on every page, including sign-in. Bunyan-specific styles load last to preserve existing layout
and artwork. UI libraries are embedded at build time from `assets/css` and `assets/js`;
rebuild after replacing them. Documentation, hidden files, and symlinks are not served.
SML's Tzedek-only compliance integration is removed; its stylesheet URLs resolve relative
to the module, and its page wrapper points at Bunyan's main content.
All application actions use `sml-reactive-button` with explicit `aria-label`, `title`,
`data-icon`, and `data-text`. The component preserves form validation, submitter action values,
and `formnovalidate`; disabled controls block mouse and keyboard activation. These actions
require JavaScript to load SML, including sign-in and server-rendered form submissions.
Navbar destinations also use SML link buttons with icons, accessible names, and `aria-current`
for the active section. The Dashboard button restores the saved investigation filters.
The By severity table identifies column and row headers explicitly. Shared log-level colors
retain their severity families while meeting 4.5:1 contrast against white badge text.
Settings sections also use SML link buttons, including **Change SQL password**, which is no
longer a main-navbar destination. Password changes remain accessible from sign-in for expired
passwords; the existing password-change URL and authentication rules are unchanged.
The password page keeps the main Settings navigation while signed in (or with login disabled).
Unauthenticated recovery and successful password changes use the signed-out layout.

Try it without SQL Server:

```sh
bunyan -c demo.toml seed-demo --days 120    # demo.toml: [sqlite] path = "demo.db"; [web] require_login = false
bunyan -c demo.toml serve --no-schedule
```

## Commands

### Web imports (uses your signed-in credentials)

In **Imports**, set **From day** and optionally **Through day**, then **Run import**.
Leave Through day blank for one day; a range includes both endpoints. Days run sequentially,
each with its own Recent runs result. Failed days are recorded and the remaining days continue.
Existing rows are skipped on re-import. An active range disables another manual submission and
keeps the page refreshing, including between days; the scheduler uses the same import lock.
Keep Bunyan running while the range finishes: desktop Sign Out cancels unfinished work.
The web path uses the current SQL session, so no CLI password/environment setup is needed.
CLI commands run separately and do not inherit the browser's signed-in credentials.

| Command | Purpose |
| --- | --- |
| `(no command)` / `desktop [--no-schedule] [--no-browser]` | Per-user app; browser launch and server exit on Sign Out |
| `serve [--no-schedule]` | Web UI plus the built-in daily scheduler |
| `import` | Missed days through yesterday (capped by `max_catchup_days`) |
| `import --date 2026-10-13` | One day; safe to re-run (rows keyed on `LogIdentifier`) |
| `import --from D --to D` | Backfill a range |
| `suggest [--group ID \| --top N --days N]` | Fix suggestions using the active AI provider |
| `check` | Verify connection and SELECT permission |
| `seed-demo [--days N]` | Synthetic data for exploring the UI |

## SQL Server access

### Workstation login

For a new desktop installation, no manual connection-file editing is necessary. An example
of the first-run input (fake credentials; replace every value for your own server):

```text
Data Source=sqlserver.example.local,1433;Initial Catalog=COOLCATS;Persist Security Info=True;User ID=BGFN;Password=SuperDuperSafe;Encrypt=True;TrustServerCertificate=True
```

SQL authentication (`User ID`/`Password`, also `UID`/`PWD`) is supported; integrated/Entra
authentication is not supported by this login flow. Use `TrustServerCertificate=False` with
a valid certificate when possible. `Persist Security Info` does **not** override Remember.
Only Data Source, Initial Catalog, and supported TLS/multi-subnet options are retained;
pooling/driver-specific options are not applied. Parsing handles quoted/escaped semicolons.
The sanitized target persists even if credentials/network/SELECT verification fails, so retry
with the normal password inputs or choose **Change SQL Server connection**. Credentials are
remembered **only after successful SQL authentication**:

- **Don't save either:** persist the non-secret target only.
- **Save username only:** also persist the username in SQLite.
- **Save username and password:** persist username in SQLite and password in the OS keychain.

Without setup, placeholder desktop defaults do not attempt SQL login. Supplied credentials
are still verified against the configured table before dashboard access; real SQL/network/
certificate/permission failures are not bypassed. Developer CLI imports still require CLI
credentials via the existing TOML/environment mechanism; the saved target contains no password.

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

On macOS, a Keychain authorization popup uses your **Mac login/keychain password**, not your SQL
Server password. Choose **Always Allow** only for a Bunyan executable you trust; rebuilding the
development executable may cause macOS to request authorization again. On Windows, saved passwords
use **Windows Credential Manager**. Saved-password sign-in first opens Windows' system
credential dialog and verifies the current Windows account through its available providers (such as
a PIV card or account password) before reading the SQL password. The provider response is verified
by Windows and is not unpacked by Bunyan. Saved-password sign-in reads the entry once and does not
rewrite it. Duplicate sign-in submissions are rejected while an OS credential-store request is
pending. If saving a remember choice fails after SQL authentication succeeds, Bunyan signs you in
and displays a warning rather than forcing another login attempt. Previous saved settings may
remain after a storage failure.

Sessions last 12 hours, end on app restart, and are revoked by **Sign out**.
Sign out uses a JavaScript same-origin POST, without an HTML form; failures remain
visible and retryable. One SQL identity
is active per app instance; a new login replaces the previous session. The scheduler waits for
sign-in and pauses new work after logout/expiry; already-running imports/suggestions may finish.
In desktop mode, Sign Out instead stops Bunyan completely; in `serve` mode it only signs out
and leaves the listener available for another login.
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
Use **Password expired or changed? > Change SQL Server password now** on the sign-in page
(or visit `/password/change`) to change your own SQL login password, expired or not.
The current password is required; this is not an administrator reset or an OS password change.
SQL Server enforces password policy/history. Success signs out local sessions and updates an
already-saved OS-keychain password for the same username. A keychain failure is reported without
claiming the SQL change failed. File/environment credentials are not rewritten.
After a timeout or unknown result, try signing in with the new password before retrying.
Already-running imports may finish using their previous session configuration.

Password changes use a small Microsoft.Data.SqlClient helper because Tiberius does not expose
LOGIN7 password changes for expired logins. Install the .NET 10 SDK and publish it once:

```sh
dotnet publish tools/PasswordChange/PasswordChange.csproj -c Release -o target/password-change
```

For distribution, copy the entire publish directory as `password-change` beside the Bunyan
executable; the target machine needs the .NET 10 runtime. Development runs also find
`target/password-change`. `DOTNET_ROOT` can identify the runtime directory; Bunyan otherwise
checks `~/.dotnet/dotnet`, then `dotnet` on PATH.
Passwords and connection settings go through private stdin, never process arguments or temporary
files. The helper requires encrypted SQL transport and preserves the configured certificate trust
setting. Only fixed error classifications return to Bunyan; server exception text is not displayed.
Live SQL expiry, actual password rotation, and OS-keychain prompts require validation against your
SQL Server and OS account. Never send a new password in chat or commit it to a SQL script.

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
Run that script in SQLCMD mode, supplying `BUNYAN_READER_PASSWORD` through the local
environment, never a committed file or command-line argument. SQLCMD substitutes SQL
text, so escape any single quote in the password as two single quotes in that variable.
Rotate previously exposed credentials; removing them from Git does not revoke them.

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
imports yesterday plus any days missed while the app was down, then optionally asks the active AI about
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
The dashboard defaults to **DotNetCats** and **Issues (non-informational)** at startup.
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
Dashboard/group titles show the original sample message. The separately labeled grouping
pattern uses readable labels such as `[quoted value]`, not HTML-like internal tokens.
The active AI receives the original sample message/exception, not the normalized grouping pattern,
so SQL keywords such as `RowCount` remain available for diagnosis. Saved suggestions containing
internal grouping placeholders are marked outdated and hidden, with a **Regenerate** action.
They remain eligible for CLI/batch suggestion generation and no longer receive the dashboard's
suggestion badge. New placeholder-based responses are rejected with an explicit error rather
than saved. Existing advice is retained until successfully replaced; original logs and grouping
identities are unchanged.

## Fix suggestions

### AI provider setup and chat

**Settings > AI** selects exactly one provider: **Ollama** (default), **OpenAI**, or
**GitHub Copilot**. Defaults start from `[ollama]` in TOML; saved AI settings override them in
the local database for new chat, manual, CLI, and scheduled requests. In-flight jobs keep their
original provider/model. There is no fallback to another provider on failure.
Each provider's default model is a dropdown. Unconfigured/unreachable providers have disabled
dropdowns with a setup/discovery explanation; saving other settings preserves their models.
Ollama/OpenAI list available models; Copilot uses the configured account model IDs after checking
for its token and installed CLI. Refresh the settings page after changing setup. Model-list
requests send no logs/source and do not require cloud-data consent; generation still does.

- **Ollama:** start a local Ollama service and pull the desired model (initially
  `qwen2.5-coder:latest`). The URL must be loopback. No cloud credentials are needed.
- **OpenAI:** set `OPENAI_API_KEY` in the environment that launches Bunyan and select a supported
  text-chat model. Uses the official Chat Completions API with `store: false` and no tools.
  API billing/access is separate from a ChatGPT subscription; provider retention policies still apply.
- **GitHub Copilot:** install the current [Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli)
  on PATH and set `COPILOT_GITHUB_TOKEN` in Bunyan's environment. Use a fine-grained GitHub token
  with **Copilot Requests** permission and an entitled account; organizational policy may restrict
  access. Bunyan deliberately does not reuse interactive CLI login/config files. The CLI runs
  with piped stdin in an isolated temporary working/config directory, an allowlisted environment,
  no available tools, shell/write denied, built-in MCPs disabled, no custom instructions,
  no automatic updates, and remote export disabled. The checkout is never its working directory.
  Temporary CLI session/config files are removed after each request. A current CLI supporting
  these flags is required; older versions fail explicitly rather than running with reduced controls.

Hosted providers require the explicit cloud-data consent checkbox before activation. Logs,
exceptions, messages, and matching source excerpts may contain sensitive information; follow
your organization's policies before enabling sharing. Keys/tokens are read from process
environment only, never accepted in browser forms, stored in SQLite, or printed in provider
errors. HTTP redirects are disabled and requests bypass proxies. Provider errors do not cause a
retry against another provider. Credential changes require restarting Bunyan.

Use **AI Chat** in the navbar for a read-only discussion, or **Discuss this issue with AI** on
a log to attach its original message, full sample exception, and matching source snippets.
The **Model** dropdown changes the next chat request only, not the provider or saved suggestion
default. Ollama lists installed models; OpenAI lists models available to the API key (some may
not support text chat and will fail visibly). Copilot has no stable CLI model-list endpoint:
use `/model` in the CLI to discover your account's IDs and enter them in **Settings > AI**;
the default `auto` is always available as a configured choice. **Refresh models** reloads the list.
Discovery failures show a warning and the explicitly configured default, not a fabricated list.

Chat history and model choice live in tab-local browser session storage, separately for each
provider and attached log. They are cleared on the next AI Chat load after a Bunyan restart, or
with **Clear conversation**. History contains conversation text, may include quoted evidence,
and is not saved to SQLite; do not use a shared browser profile for sensitive conversations.
Each request includes the prior exchanges and fresh attached log/source evidence. Requests
also reload **Settings > Source Code** for general chat, searching the current and prior user
messages for stack file/line hints, stack symbols, or matching error text. The AI is told the
checkout is configured and read-only, to use retrieved snippets instead of requesting the
repository, and to ask for specific lookup hints if no candidates match. This is bounded
retrieval, not model-controlled filesystem access; missing source configuration is explained
by directing users to **Settings > Source Code**.
Conversations are capped at 20 exchanges, messages at 16,000 characters, and HTTP request bodies at Axum's
2 MiB default limit; oversized requests fail visibly. Clear the conversation to start again.
No model can edit the checkout, run commands, or apply fixes; read-only instructions explicitly
require proposed changes, source citations, and honest uncertainty.

Ollama integration, OpenAI request/response handling, and isolated Copilot CLI execution are
tested with local mocks. Live OpenAI/Copilot access requires the user's own account and has
not been certified against paid accounts here.

Use **View exception** on a dashboard group, or **Show / hide full exception** on a recent
occurrence, to inspect the complete stored exception in a scrollable view. Suggestions always
include the group's full sample exception, regardless of whether the view is collapsed; they
do not include every occurrence's exception. Bunyan does not truncate the sample exception,
but the selected model's context window still limits what the model can process.

Settings has **Log Source & Columns**, **Source Code**, and **AI** tabs. On **Source Code**, enter the
absolute path to a local checkout of the related application, select source extensions/context
lines, and **Save source settings**. On macOS, **Pick Folder...** opens a separate native
folder dialog and fills the unsaved path; cancel keeps the draft unchanged. Approve macOS
Automation access if prompted, or enter the path manually. Picking never saves automatically.
Use the deployed branch/version; Bunyan never clones,
pulls, changes branches, or edits that checkout. One checkout is associated with each Bunyan
SQLite database. Leaving the path blank and saving explicitly disables source context.
Saved settings override `[source]` in TOML and apply immediately to new manual, scheduled, and
CLI suggestions, including existing signed-in sessions. Existing suggestions are not rewritten;
use **Regenerate** to request one with the current source settings.

**Test lookup** previews an unsaved draft using class, method, message, and/or exception hints;
it neither calls AI nor saves preview hints. Retrieval ranks stack filenames/line numbers,
class filenames and methods, message/exception text matching source string literals, then
method-only candidates. Matching is heuristic, not full semantic/call-graph analysis. Ambiguous
matches are labeled candidates; no match is explicitly reported, not replaced with invented code.
Up to three relative paths, evidence labels, and line-numbered excerpts accompany the prompt.
Each excerpt has the configured 5–200 lines, capped at 12,000 characters with a truncation marker.
Hidden/build/dependency directories, symlinks, binary files, and files over 512 KiB are excluded.
Scans exceeding 200,000 entries or encountering unreadable directories/files fail visibly;
choose a narrower source folder if needed.

Ollama requests require a loopback URL (`localhost`, `127.0.0.1`, or `::1`); hosted providers
require cloud-data consent in AI settings. Source code can itself contain secrets:
select a checkout safe to share with your selected provider. Prompt instructions
treat logs/source as untrusted evidence and require cited paths/lines and verification.
The model's context window still applies. Suggestions are proposals only; Bunyan does not
apply changes to the related repository. Review and test every proposed fix.

## Data

SQLite file at `sqlite.path` (default `bunyan.db`): `error_groups`, `log_entries`, `import_runs`,
`source_settings` (saved extraction mapping), `source_code_settings` (related checkout/settings),
`ai_settings` (one active provider, models, and cloud consent; no secrets),
`login_preferences` (remembered username/save flag;
no passwords).
