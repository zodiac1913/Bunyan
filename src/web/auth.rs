//! Workstation login: one active SQL identity, opaque browser sessions, and optional OS-keychain
//! passwords. SQLite contains only the remembered name/flag; passwords never enter HTML or cookies.

use super::{AppError, AppState, pages, with_db};
use crate::{
    config::{Config, SqlCredentials},
    source,
};
use anyhow::{Context, Result};
use axum::{
    extract::{Form, Query, Request, State},
    http::{HeaderMap, Method, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Redirect, Response},
};
use maud::{Markup, html};
use rusqlite::{OptionalExtension, params};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, RwLock, watch};

const COOKIE: &str = "bunyan_session";
const SESSION_LIFETIME: Duration = Duration::from_secs(12 * 60 * 60);

/// The scheduler receives the same credentials and absolute expiry as the active browser session.
pub type ActiveLogin = Option<(Arc<Config>, Instant)>;

pub(super) struct Auth {
    context: String,
    port: u16,
    session: RwLock<Option<Session>>,
    login_lock: Mutex<()>,
    last_attempt: Mutex<Option<Instant>>,
    scheduled: watch::Sender<ActiveLogin>,
}

struct Session {
    token: String,
    config: Arc<Config>,
    expires: Instant,
}

#[derive(Clone, Default)]
struct Preference {
    username: String,
    saved_password: bool,
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
enum Remember {
    Nothing,
    Username,
    Password,
}

#[derive(Deserialize)]
pub(super) struct LoginForm {
    #[serde(default)]
    username: String,
    #[serde(default)]
    connection_string: String,
    #[serde(default)]
    password: String,
    remember: Remember,
    #[serde(default)]
    action: String,
}

/// Both current and expired SQL logins require the old password; no administrator reset is exposed.
#[derive(Deserialize)]
pub(super) struct PasswordForm {
    username: String,
    old_password: String,
    new_password: String,
    confirm_password: String,
}

impl PasswordForm {
    fn validate(&self) -> Result<()> {
        anyhow::ensure!(
            !self.username.is_empty() && self.username.len() <= 256,
            "Enter your SQL Server username (up to 256 bytes)."
        );
        anyhow::ensure!(
            !self.old_password.is_empty(),
            "Enter your current SQL Server password, even if expired."
        );
        anyhow::ensure!(
            !self.new_password.is_empty() && self.new_password.encode_utf16().count() <= 128,
            "Enter a new password of up to 128 UTF-16 code units."
        );
        anyhow::ensure!(
            !self.old_password.contains('\0') && !self.new_password.contains('\0'),
            "Passwords cannot contain a NUL character."
        );
        anyhow::ensure!(
            self.new_password == self.confirm_password,
            "The new passwords do not match."
        );
        anyhow::ensure!(
            self.new_password != self.old_password,
            "Choose a new password different from the current password."
        );
        Ok(())
    }
}

impl Auth {
    /// Scope saved credentials to the configured target and local database, not the current password.
    pub(super) fn new(cfg: &Config, port: u16) -> Result<(Self, watch::Receiver<ActiveLogin>)> {
        let context = Self::credential_context(cfg)?;
        let (scheduled, receiver) = watch::channel(None);
        Ok((
            Self {
                context,
                port,
                session: RwLock::new(None),
                login_lock: Mutex::new(()),
                last_attempt: Mutex::new(None),
                scheduled,
            },
            receiver,
        ))
    }

    fn credential_context(cfg: &Config) -> Result<String> {
        let mut target = cfg.sqlserver.connection_target()?;
        target.authentication(tiberius::AuthMethod::sql_server("", ""));
        let path = std::fs::canonicalize(&cfg.sqlite.path)?;
        Ok(hex::encode(Sha256::digest(format!("{path:?}|{target:?}"))))
    }

    async fn config(&self, headers: &HeaderMap) -> Option<Arc<Config>> {
        let token = session_cookie(headers)?;
        let mut session = self.session.write().await;
        if session
            .as_ref()
            .is_some_and(|s| s.expires <= Instant::now())
        {
            *session = None;
            self.scheduled.send_replace(None);
        }
        session
            .as_ref()
            .filter(|s| s.token == token)
            .map(|s| s.config.clone())
    }

    async fn clear(&self) {
        *self.session.write().await = None;
        self.scheduled.send_replace(None);
    }
}

fn credential_context(st: &AppState) -> Result<String> {
    if st.cfg.sqlserver.web_target.is_some() {
        Auth::credential_context(&st.cfg)
    } else {
        Ok(st.auth.context.clone())
    }
}

/// Public authentication routes use fresh setup without bypassing session checks for protected pages.
async fn configured_state(mut st: AppState) -> Result<AppState, AppError> {
    let cfg = (*st.cfg).clone();
    let cfg = with_db(&st, move |_conn| {
        let mut cfg = cfg;
        crate::connection::apply_saved(&mut cfg)?;
        Ok(cfg)
    })
    .await?;
    st.cfg = Arc::new(cfg);
    Ok(st)
}

fn session_cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| part.trim().strip_prefix(&format!("{COOKIE}=")))
}

fn random_token() -> Result<String> {
    let mut bytes = [0; 32];
    getrandom::fill(&mut bytes)
        .map_err(|_| anyhow::anyhow!("OS session randomness unavailable"))?;
    Ok(hex::encode(bytes))
}

/// Bind login to this loopback origin, including POSTs to prevent cross-site credential/logout forms.
fn check_request(headers: &HeaderMap, method: &Method, port: u16) -> Result<()> {
    let host = headers
        .get(header::HOST)
        .context("Missing Host header")?
        .to_str()?;
    let url = reqwest::Url::parse(&format!("http://{host}"))?;
    let local = url.host_str().is_some_and(|host| {
        host == "localhost"
            || host
                .trim_matches(['[', ']'])
                .parse::<std::net::IpAddr>()
                .is_ok_and(|ip| ip.is_loopback())
    });
    anyhow::ensure!(
        local && url.port_or_known_default() == Some(port),
        "Use this app's localhost URL."
    );
    if !matches!(*method, Method::GET | Method::HEAD) {
        let origin = headers
            .get(header::ORIGIN)
            .context("Missing same-origin submission header")?
            .to_str()?;
        anyhow::ensure!(
            origin == url.origin().ascii_serialization(),
            "Cross-origin submission rejected."
        );
    }
    Ok(())
}

pub(super) async fn guard(
    State(st): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    if let Err(error) = check_request(request.headers(), request.method(), st.auth.port) {
        return (StatusCode::FORBIDDEN, pages::error_page(&error.to_string())).into_response();
    }
    let public = super::assets::embedded(request.uri().path()).is_some()
        || matches!(
            request.uri().path(),
            "/login"
                | "/password/change"
                | "/health"
                | "/assets/bunyan.jpeg"
                | "/assets/dashboard-state.js"
                | "/assets/ai-chat.js"
        );
    let mut response = if public {
        next.run(request).await
    } else if !st.cfg.web.require_login {
        request.extensions_mut().insert(st);
        next.run(request).await
    } else if let Some(cfg) = st.auth.config(request.headers()).await {
        request.extensions_mut().insert(AppState { cfg, ..st });
        next.run(request).await
    } else {
        Redirect::to("/login").into_response()
    };
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
        .headers_mut()
        // `no-referrer` can turn same-origin POST origins into "null", breaking our CSRF check.
        .insert(header::REFERRER_POLICY, "same-origin".parse().unwrap());
    response
        .headers_mut()
        .insert("x-frame-options", "DENY".parse().unwrap());
    response
}

async fn preference(st: &AppState) -> Result<Preference, AppError> {
    let context = credential_context(st)?;
    with_db(st, move |conn| {
        Ok(conn
            .query_row(
                "SELECT username, saved_password FROM login_preferences WHERE context=?1",
                [context],
                |row| {
                    Ok(Preference {
                        username: row.get(0)?,
                        saved_password: row.get(1)?,
                    })
                },
            )
            .optional()?
            .unwrap_or_default())
    })
    .await
}

#[cfg(not(test))]
fn keychain_entry(context: &str, username: &str) -> Result<keyring::Entry> {
    keyring::Entry::new(&format!("Bunyan.SQL.{context}"), username)
        .context("OS credential store is unavailable")
}

// Unit tests exercise all remember modes without touching the developer's real credential store.
#[cfg(test)]
fn keychain_entry(context: &str, username: &str) -> Result<tests::TestEntry> {
    Ok(tests::TestEntry(format!("{context}:{username}")))
}

async fn saved_password(context: String, username: String) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(all(windows, not(test)))]
        crate::windows_auth::reauthenticate()?;
        keychain_entry(&context, &username)?.get_password().context(
            "Saved password could not be read. Enter it manually or check that your OS credential store is available.",
        )
    })
    .await?
}

async fn save_preference(st: &AppState, form: &LoginForm, old: Preference) -> Result<()> {
    // A successful saved-password login has already read this exact entry; do not write it again.
    if form.action == "saved"
        && form.remember == Remember::Password
        && old.saved_password
        && old.username == form.username
    {
        return Ok(());
    }
    let context = credential_context(st)?;
    let username = form.username.clone();
    let password = (form.remember == Remember::Password).then(|| form.password.clone());
    // OS credential-store calls may block. Never run them on an async executor thread.
    tokio::task::spawn_blocking(move || -> Result<()> {
        if old.saved_password && (password.is_none() || old.username != username) {
            match keychain_entry(&context, &old.username)?.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => {}
                Err(error) => {
                    return Err(error).context("Could not remove the previously saved password");
                }
            }
        }
        if let Some(password) = password {
            keychain_entry(&context, &username)?
                .set_password(&password)
                .context("Could not save the password in the OS credential store")?;
        }
        Ok(())
    })
    .await??;
    let context = credential_context(st)?;
    let username = form.username.clone();
    let remember_name = form.remember != Remember::Nothing;
    let remember_password = form.remember == Remember::Password;
    with_db(st, move |conn| {
        if remember_name {
            conn.execute(
                "INSERT INTO login_preferences(context,username,saved_password) VALUES (?1,?2,?3)
                 ON CONFLICT(context) DO UPDATE SET username=excluded.username,saved_password=excluded.saved_password",
                params![context, username, remember_password],
            )?;
        } else {
            conn.execute("DELETE FROM login_preferences WHERE context=?1", [context])?;
        }
        Ok(())
    }).await.map_err(|e| e.0)?;
    Ok(())
}

#[derive(Deserialize, Default)]
pub(super) struct LoginQuery {
    #[serde(default)]
    setup: bool,
}

pub(super) async fn page(
    State(st): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LoginQuery>,
) -> Result<Response, AppError> {
    if st.auth.config(&headers).await.is_some() {
        return Ok(Redirect::to("/").into_response());
    }
    let st = configured_state(st).await?;
    let pref = preference(&st).await?;
    Ok(render_login(
        &pref,
        None,
        query.setup || crate::connection::needs_setup(&st.cfg.sqlserver)?,
    )
    .into_response())
}

/// Public before sign-in so expired accounts can recover, protected by the same origin and retry guards.
pub(super) async fn password_page(
    State(st): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let st = configured_state(st).await?;
    let pref = preference(&st).await?;
    let show_navigation = !st.cfg.web.require_login || st.auth.config(&headers).await.is_some();
    Ok(render_password(&pref.username, None, show_navigation).into_response())
}

pub(super) async fn change_password(
    State(st): State<AppState>,
    headers: HeaderMap,
    Form(mut form): Form<PasswordForm>,
) -> Result<Response, AppError> {
    let st = configured_state(st).await?;
    let show_navigation = !st.cfg.web.require_login || st.auth.config(&headers).await.is_some();
    form.username = form.username.trim().to_string();
    let fail = |status, message: &str| {
        (
            status,
            render_password(&form.username, Some(message), show_navigation),
        )
            .into_response()
    };
    if crate::connection::needs_setup(&st.cfg.sqlserver)? {
        return Ok(fail(
            StatusCode::BAD_REQUEST,
            "Configure your SQL Server connection on the sign-in page before changing a password.",
        ));
    }
    let Ok(_guard) = st.auth.login_lock.try_lock() else {
        return Ok(fail(
            StatusCode::CONFLICT,
            "A sign-in or password change is already in progress.",
        ));
    };
    let mut attempt = st.auth.last_attempt.lock().await;
    if attempt.is_some_and(|time| time.elapsed() < Duration::from_secs(2)) {
        return Ok(fail(
            StatusCode::TOO_MANY_REQUESTS,
            "Wait two seconds before trying again.",
        ));
    }
    *attempt = Some(Instant::now());
    drop(attempt);
    if let Err(error) = form.validate() {
        return Ok(fail(StatusCode::BAD_REQUEST, &error.to_string()));
    }
    let old = preference(&st).await?;
    if let Err(error) = crate::password_change::change(
        &st.cfg.sqlserver,
        &form.username,
        &form.old_password,
        &form.new_password,
    )
    .await
    {
        tracing::warn!("SQL password change did not report success");
        return Ok(fail(StatusCode::BAD_REQUEST, &error.to_string()));
    }
    finish_password_change(&st, form, old).await
}

/// Once SQL reports success, revoke local sessions and replace an existing saved password only.
/// Credential-store failure must never suggest that the server password change was rolled back.
async fn finish_password_change(
    st: &AppState,
    form: PasswordForm,
    old: Preference,
) -> Result<Response, AppError> {
    st.auth.clear().await;
    let mut message = String::from(
        "Your SQL Server password was changed. Sign in with the new password. Local sessions were signed out. File/environment credentials were not updated.",
    );
    if old.saved_password && old.username == form.username {
        let login = LoginForm {
            connection_string: String::new(),
            username: form.username.clone(),
            password: form.new_password,
            remember: Remember::Password,
            action: "password".into(),
        };
        if save_preference(st, &login, old).await.is_err() {
            tracing::warn!("SQL password changed, but updating the saved password failed");
            message.push_str(" The OS credential store could not be updated; its old password may remain. Enter the new password manually and save it again.");
        } else {
            message.push_str(" Your saved OS credential-store password was updated.");
        }
    }
    let mut response =
        render_password(&form.username, Some(&message), !st.cfg.web.require_login).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        format!("{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0").parse()?,
    );
    Ok(response)
}

fn render_password(username: &str, message: Option<&str>, show_navigation: bool) -> Markup {
    pages::layout(
        "Change SQL password",
        if show_navigation { "settings" } else { "login" },
        None,
        html! {
            h1 { "Settings" }
            (super::settings::tabs("password"))
            section.login-panel.panel {
                h2 { "Change SQL Server password" }
                p { "Change your own SQL login password, including an expired password. You must know the current password. This does not change your Mac or Windows login." }
                @if let Some(message) = message { div.flash role="alert" { (message) } }
                form method="post" action="/password/change" aria-label="Change SQL Server password" {
                    label for="username" { "SQL Server username * (required)" }
                    input id="username" name="username" autocomplete="username" required aria-required="true" maxlength="256" value=(username);
                    label for="old-password" { "Current password (even if expired) * (required)" }
                    input id="old-password" name="old_password" type="password" autocomplete="current-password" required aria-required="true";
                    label for="new-password" { "New password * (required)" }
                    input id="new-password" name="new_password" type="password" autocomplete="new-password" maxlength="128" required aria-required="true";
                    label for="confirm-password" { "Confirm new password * (required)" }
                    input id="confirm-password" name="confirm_password" type="password" autocomplete="new-password" maxlength="128" required aria-required="true";
                    sml-reactive-button.bunyan-reactive type="submit" aria-label="Change SQL password" title="Change SQL password" data-icon="bi bi-key" data-text="Change SQL password" {}
                }
                p { a href="/login" { "Back to sign in" } " | " a href="/" { "Dashboard" } }
                p.small.muted { "SQL Server enforces its password policy and history. A successful change signs out local sessions and updates an already-saved password for this username. Local configuration files are never rewritten." }
            }
        },
    )
}

pub(super) async fn login(
    State(st): State<AppState>,
    Form(mut form): Form<LoginForm>,
) -> Result<Response, AppError> {
    let mut st = configured_state(st).await?;
    let mut setup_required = crate::connection::needs_setup(&st.cfg.sqlserver)?;
    let auth = st.auth.clone();
    // Do not queue duplicate submissions behind an interactive OS credential-store prompt.
    let Ok(_guard) = auth.login_lock.try_lock() else {
        return Ok((StatusCode::CONFLICT, render_login(
            &Preference::default(),
            Some("A sign-in is already in progress. Finish or cancel the OS credential-store request before trying again."),
            setup_required,
        )).into_response());
    };
    let mut attempt = st.auth.last_attempt.lock().await;
    if attempt.is_some_and(|time| time.elapsed() < Duration::from_secs(2)) {
        let pref = preference(&st).await?;
        return Ok((
            StatusCode::TOO_MANY_REQUESTS,
            render_login(
                &pref,
                Some("Wait two seconds before trying again."),
                setup_required || !form.connection_string.trim().is_empty(),
            ),
        )
            .into_response());
    }
    *attempt = Some(Instant::now());
    drop(attempt);
    if !form.connection_string.trim().is_empty() {
        let setup = match crate::connection::Setup::parse(&form.connection_string) {
            Ok(setup) => setup,
            Err(error) => {
                return Ok((
                    StatusCode::BAD_REQUEST,
                    render_login(&Preference::default(), Some(&error.to_string()), true),
                )
                    .into_response());
            }
        };
        form.connection_string.clear();
        form.username = setup.credentials.username.clone();
        form.password = setup.credentials.password.clone();
        form.action = "password".into();
        let mut cfg = (*st.cfg).clone();
        let previous_context = Auth::credential_context(&cfg)?;
        cfg.sqlserver.web_target = Some(setup.target.clone());
        let target_changed = previous_context != Auth::credential_context(&cfg)?;
        if target_changed
            && with_db(&st, |conn| {
                Ok(
                    conn.query_row("SELECT EXISTS(SELECT 1 FROM log_entries)", [], |row| {
                        row.get::<_, bool>(0)
                    })?,
                )
            })
            .await?
        {
            return Ok((StatusCode::BAD_REQUEST, render_login(&Preference::default(),
                Some("Changing SQL targets after importing requires a new SQLite database to avoid mixing source logs."), true,
            )).into_response());
        }
        if let Err(error) = with_db(&st, move |conn| crate::connection::save(conn, &setup)).await {
            tracing::warn!("Connection setup could not be saved");
            return Ok((
                StatusCode::INTERNAL_SERVER_ERROR,
                render_login(&Preference::default(), Some(&error.0.to_string()), true),
            )
                .into_response());
        }
        st.auth.clear().await;
        st.cfg = Arc::new(cfg);
        setup_required = false;
    }
    if setup_required {
        return Ok((
            StatusCode::BAD_REQUEST,
            render_login(
                &Preference::default(),
                Some("Paste your SQL Server connection string before signing in."),
                true,
            ),
        )
            .into_response());
    }
    let old = preference(&st).await?;
    let display = Preference {
        username: form.username.trim().to_string(),
        saved_password: old.saved_password && old.username == form.username.trim(),
    };
    let fail = |status, message: &str| (status, render(&display, Some(message))).into_response();
    form.username = form.username.trim().to_string();
    if form.username.is_empty() || form.username.len() > 256 {
        return Ok(fail(
            StatusCode::BAD_REQUEST,
            "Enter your SQL Server username (up to 256 bytes).",
        ));
    }
    if form.action == "saved" {
        if !display.saved_password {
            return Ok(fail(
                StatusCode::BAD_REQUEST,
                "No password is saved for that username.",
            ));
        }
        match saved_password(credential_context(&st)?, form.username.clone()).await {
            Ok(password) => form.password = password,
            Err(error) => return Ok(fail(StatusCode::BAD_REQUEST, &format!("{error:#}"))),
        }
    }
    if form.password.is_empty() {
        return Ok(fail(
            StatusCode::BAD_REQUEST,
            "Enter your SQL Server password.",
        ));
    }
    let mut cfg = (*st.cfg).clone();
    cfg.sqlserver.credentials = Some(SqlCredentials {
        username: form.username.clone(),
        password: form.password.clone(),
    });
    let authenticated = tokio::time::timeout(Duration::from_secs(20), async {
        source::test_mapping(&cfg.sqlserver, &cfg.log_schema()?).await
    })
    .await;
    match authenticated {
        Ok(Ok(_)) => {}
        Ok(Err(error)) => {
            // Log only the safe classification: SQL server text can contain sensitive details.
            tracing::warn!("login rejected: {}", source::login_error_message(&error));
            return Ok(fail(
                StatusCode::UNAUTHORIZED,
                source::login_error_message(&error),
            ));
        }
        Err(_) => {
            return Ok(fail(
                StatusCode::GATEWAY_TIMEOUT,
                "SQL Server did not respond within 20 seconds.",
            ));
        }
    }
    let token = random_token()?;
    let warning = save_preference(&st, &form, old).await.err().map(|error| {
        tracing::warn!("SQL login succeeded, but saving the login preference failed");
        format!("You are signed in, but your remember choice could not be saved: {error:#}. Your previous saved settings may remain. You do not need to sign in again.")
    });
    complete_login(&st, cfg, token, warning).await
}

/// Optional credential storage must not undo successful SQL authentication; surface failures once.
async fn complete_login(
    st: &AppState,
    cfg: Config,
    token: String,
    warning: Option<String>,
) -> Result<Response, AppError> {
    let cfg = Arc::new(cfg);
    let expires = Instant::now() + SESSION_LIFETIME;
    *st.auth.session.write().await = Some(Session {
        token: token.clone(),
        config: cfg.clone(),
        expires,
    });
    st.auth.scheduled.send_replace(Some((cfg, expires)));
    let mut response = if let Some(warning) = warning {
        pages::layout(
            "Signed in",
            "login",
            None,
            html! {
                section.login-panel.panel {
                    h1 { "Signed in" }
                    div.flash role="alert" { (warning) }
                    p { a href="/" { "Continue to dashboard" } }
                }
            },
        )
        .into_response()
    } else {
        Redirect::to("/").into_response()
    };
    response.headers_mut().insert(
        header::SET_COOKIE,
        format!(
            "{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={}",
            SESSION_LIFETIME.as_secs()
        )
        .parse()?,
    );
    Ok(response)
}

pub(super) async fn logout(State(st): State<AppState>) -> Response {
    let _guard = st.auth.login_lock.lock().await;
    st.auth.clear().await;
    let mut response = if let Some(shutdown) = &st.desktop_shutdown {
        // Graceful shutdown lets this JSON and cookie reach the browser before the listener exits.
        shutdown.send_replace(true);
        axum::Json(serde_json::json!({ "shutdown": true })).into_response()
    } else {
        Redirect::to("/login").into_response()
    };
    response.headers_mut().insert(
        header::SET_COOKIE,
        format!("{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")
            .parse()
            .unwrap(),
    );
    response
}

fn render(pref: &Preference, error: Option<&str>) -> Markup {
    render_login(pref, error, false)
}

fn render_login(pref: &Preference, error: Option<&str>, setup_required: bool) -> Markup {
    pages::layout(
        "Sign in",
        "login",
        None,
        html! {
            section.login-panel.panel {
                h1 { "Welcome to Bunyan" }
                p { "Sign in with your SQL Server account to view this workstation's log dashboard." }
                p.small.muted { (credential_store_notice()) }
                @if let Some(error) = error { div.flash role="alert" { (error) } }
                form method="post" action="/login" aria-label="SQL Server sign in" {
                    @if setup_required {
                        label for="connection-string" { "SQL Server connection string * (required)" }
                        textarea id="connection-string" name="connection_string" rows="5" required aria-required="true" aria-describedby="connection-help" autocomplete="off" spellcheck="false" placeholder="Data Source=sqlserver.example.local,1433;Initial Catalog=COOLCATS;Persist Security Info=True;User ID=BGFN;Password=SuperDuperSafe;Encrypt=True;TrustServerCertificate=True" {}
                        p.small.muted id="connection-help" { "Paste an ADO.NET connection string with Data Source, Initial Catalog, User ID, and Password. Only server/database/TLS settings are saved in SQLite. The original string is never stored or redisplayed; Remember controls username/password storage. Pooling and other driver-specific options are not applied." }
                    } @else {
                        label for="username" { "SQL Server username * (required)" }
                        input id="username" name="username" autocomplete="username" required aria-required="true" maxlength="256" value=(&pref.username);
                        label for="password" { "Password" }
                        input id="password" name="password" type="password" autocomplete="current-password";
                    }
                    label for="remember" { "Remember on this computer" }
                    select id="remember" name="remember" {
                        option value="nothing" selected[pref.username.is_empty()] { "Don't save either" }
                        option value="username" selected[!pref.username.is_empty() && !pref.saved_password] { "Save username only" }
                        option value="password" selected[pref.saved_password] { "Save username and password (OS credential store)" }
                    }
                    div.login-actions {
                        sml-reactive-button.bunyan-reactive type="submit" name="action" value="password" aria-label="Sign in" title="Sign in" data-icon="bi bi-box-arrow-in-right" data-text="Sign in" {}
                        @if pref.saved_password && !setup_required {
                            sml-reactive-button.bunyan-reactive type="submit" name="action" value="saved" aria-label="Sign in with saved password" title="Sign in with saved password" data-icon="bi bi-shield-lock" data-text="Sign in with saved password" {}
                        }
                        @if !setup_required {
                            p { a href="/login?setup=true" { "Change SQL Server connection" } }
                        }
                    }
                }
                p.small.muted { "Saving does not automatically sign you in. Sessions end after 12 hours or when the app stops. Bunyan saves passwords only in the OS keychain, never in SQLite or cookies." }
                details {
                    summary { "Password expired or changed?" }
                    p { (source::PASSWORD_CHANGE_MESSAGE) }
                    p { a href="/password/change" { "Change SQL Server password now" } }
                    p { "If your password was changed elsewhere, enter the new password above. Choose to save it to replace the old saved password." }
                }
            }
        },
    )
}

fn credential_store_notice() -> &'static str {
    if cfg!(target_os = "macos") {
        "Saved passwords are stored in macOS Keychain. Its authorization popup uses your Mac login/keychain password, not your SQL Server password. Choose Always Allow only if you trust this Bunyan executable; rebuilding the development app may cause macOS to ask again."
    } else if cfg!(windows) {
        "Saved passwords are stored in Windows Credential Manager. Sign in with saved password first verifies your Windows account using the system credential dialog, such as your PIV card or Windows password."
    } else {
        "Saved passwords are stored in your desktop's OS credential store, not in Bunyan's SQLite database or cookies. On Linux, an available and unlocked Secret Service is required. They are used only when you choose Sign in with saved password."
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{Body, to_bytes};
    use std::{
        collections::HashMap,
        sync::{LazyLock, Mutex as StdMutex},
    };
    use tower::ServiceExt;

    static SECRETS: LazyLock<StdMutex<HashMap<String, String>>> = LazyLock::new(Default::default);
    static WRITES: LazyLock<StdMutex<HashMap<String, usize>>> = LazyLock::new(Default::default);

    fn password_form() -> PasswordForm {
        PasswordForm {
            username: "sql-user".into(),
            old_password: "old-test-value".into(),
            new_password: "new-test-value".into(),
            confirm_password: "new-test-value".into(),
        }
    }

    #[test]
    fn password_validation_rejects_invalid_input_without_echoing_secrets() {
        assert!(password_form().validate().is_ok());
        for field in ["username", "old", "new", "confirm", "same", "long", "nul"] {
            let mut form = password_form();
            match field {
                "username" => form.username.clear(),
                "old" => form.old_password.clear(),
                "new" => form.new_password.clear(),
                "confirm" => form.confirm_password = "not-the-same".into(),
                "same" => {
                    form.new_password = form.old_password.clone();
                    form.confirm_password = form.old_password.clone();
                }
                "long" => {
                    form.new_password = "a".repeat(129);
                    form.confirm_password = form.new_password.clone();
                }
                "nul" => form.old_password.push('\0'),
                _ => unreachable!(),
            }
            let error = form.validate().unwrap_err().to_string();
            assert!(!error.contains("test-value"));
        }
        let mut form = password_form();
        form.new_password = "a".repeat(128);
        form.confirm_password = form.new_password.clone();
        assert!(form.validate().is_ok());
        form.new_password = "\u{1f512}".repeat(65);
        form.confirm_password = form.new_password.clone();
        assert!(form.validate().is_err());
    }

    #[tokio::test]
    async fn password_settings_preserve_navigation_for_sessions_and_public_recovery() {
        let (_dir, st, _) = state();
        let token = signed_in(&st, Instant::now() + Duration::from_secs(60)).await;
        let app = super::super::router(st.clone());
        for authenticated in [false, true] {
            for method in [Method::GET, Method::POST] {
                let mut request = Request::builder()
                    .uri("/password/change")
                    .method(method.clone())
                    .header(header::HOST, "127.0.0.1:8080")
                    .header(header::ORIGIN, "http://127.0.0.1:8080")
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded");
                if authenticated {
                    request = request.header(header::COOKIE, format!("{COOKIE}={token}"));
                }
                // Invalid input exercises the error page without contacting SQL Server.
                *st.auth.last_attempt.lock().await = None;
                let response = app.clone().oneshot(request.body(Body::from(
                    "username=test&old_password=old&new_password=new&confirm_password=mismatch"
                )).unwrap()).await.unwrap();
                assert_eq!(
                    response.status(),
                    if method == Method::GET {
                        StatusCode::OK
                    } else {
                        StatusCode::BAD_REQUEST
                    }
                );
                let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let html = std::str::from_utf8(&bytes).unwrap();
                assert_eq!(
                    html.contains("<nav aria-label=\"Main navigation\">"),
                    authenticated
                );
                assert!(html.contains("aria-current=\"page\" aria-label=\"Change SQL password\""));
                if authenticated {
                    assert!(html.contains("aria-current=\"page\" aria-label=\"Settings\""));
                }
            }
        }
        let mut cfg = (*st.cfg).clone();
        cfg.web.require_login = false;
        let app = super::super::router(AppState {
            cfg: Arc::new(cfg),
            ..st
        });
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/password/change")
                    .header(header::HOST, "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(
            std::str::from_utf8(&bytes)
                .unwrap()
                .contains("<nav aria-label=\"Main navigation\">")
        );
    }

    #[tokio::test]
    async fn password_form_is_public_but_posts_require_origin_and_never_echo_secrets() {
        let (_dir, st, _) = state();
        let app = super::super::router(st);
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/password/change")
                    .header(header::HOST, "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let html = std::str::from_utf8(&body).unwrap();
        assert_eq!(html.matches("<h1>").count(), 1);
        assert!(html.contains("<h1>Settings</h1>"));
        assert!(html.contains("<h2>Change SQL Server password</h2>"));
        assert!(
            html.contains("action=\"/password/change\" aria-label=\"Change SQL Server password\"")
        );
        for (id, label) in [
            ("username", "SQL Server username"),
            ("old-password", "Current password (even if expired)"),
            ("new-password", "New password"),
            ("confirm-password", "Confirm new password"),
        ] {
            assert!(html.contains(&format!("<label for=\"{id}\">{label} * (required)</label>")));
            let input = html
                .split(&format!("<input id=\"{id}\""))
                .nth(1)
                .unwrap()
                .split('>')
                .next()
                .unwrap();
            assert!(input.contains("required aria-required=\"true\""));
        }
        assert!(
            std::str::from_utf8(&body)
                .unwrap()
                .contains("autocomplete=\"new-password\"")
        );

        for origin in [
            None,
            Some("http://evil.example"),
            Some("http://127.0.0.1:8080"),
        ] {
            let mut request = Request::builder()
                .uri("/password/change")
                .method(Method::POST)
                .header(header::HOST, "127.0.0.1:8080")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded");
            if let Some(origin) = origin {
                request = request.header(header::ORIGIN, origin);
            }
            let response = app.clone().oneshot(request.body(Body::from(
                "username=test&old_password=private-old-value&new_password=private-new-value&confirm_password=mismatch"
            )).unwrap()).await.unwrap();
            assert_eq!(
                response.status(),
                if origin == Some("http://127.0.0.1:8080") {
                    StatusCode::BAD_REQUEST
                } else {
                    StatusCode::FORBIDDEN
                }
            );
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            let text = std::str::from_utf8(&body).unwrap();
            assert!(!text.contains("private-old-value"));
            assert!(!text.contains("private-new-value"));
        }
    }

    #[tokio::test]
    async fn password_change_replaces_saved_secret_and_revokes_session_and_scheduler() {
        let (_dir, st, receiver) = state();
        let mut form = password_form();
        form.username = "rotation-test-user".into();
        let login = LoginForm {
            username: form.username.clone(),
            password: form.old_password.clone(),
            connection_string: String::new(),
            remember: Remember::Password,
            action: "password".into(),
        };
        save_preference(&st, &login, Preference::default())
            .await
            .unwrap();
        let old = preference(&st).await.unwrap_or_else(|e| panic!("{}", e.0));
        signed_in(&st, Instant::now() + SESSION_LIFETIME).await;
        assert!(receiver.borrow().is_some());
        let response = finish_password_change(&st, form, old)
            .await
            .unwrap_or_else(|e| panic!("{}", e.0));
        assert!(st.auth.session.read().await.is_none());
        assert!(receiver.borrow().is_none());
        assert!(
            response.headers()[header::SET_COOKIE]
                .to_str()
                .unwrap()
                .contains("Max-Age=0")
        );
        assert_eq!(
            saved_password(st.auth.context.clone(), login.username)
                .await
                .unwrap(),
            "new-test-value"
        );
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let text = std::str::from_utf8(&body).unwrap();
        assert!(text.contains("password was changed"));
        assert!(!text.contains("test-value"));
    }

    #[tokio::test]
    async fn password_change_does_not_save_an_unremembered_password() {
        let (_dir, st, _) = state();
        let form = password_form();
        finish_password_change(&st, form, Preference::default())
            .await
            .unwrap_or_else(|e| panic!("{}", e.0));
        assert!(
            saved_password(st.auth.context.clone(), "sql-user".into())
                .await
                .is_err()
        );
    }

    pub(super) struct TestEntry(pub String);

    impl TestEntry {
        pub fn set_password(&self, password: &str) -> keyring::Result<()> {
            *WRITES.lock().unwrap().entry(self.0.clone()).or_default() += 1;
            SECRETS
                .lock()
                .unwrap()
                .insert(self.0.clone(), password.to_string());
            Ok(())
        }
    }

    #[tokio::test]
    async fn first_run_requires_a_string_without_attempting_sql_or_saving_secrets() {
        let (_dir, mut st, _) = state();
        Arc::make_mut(&mut st.cfg).sqlserver.host = "sqlserver.example.local".into();
        let app = super::super::router(st.clone());
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/login")
                    .header(header::HOST, "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let html = std::str::from_utf8(&body).unwrap();
        assert!(html.contains("name=\"connection_string\""));
        assert!(!html.contains("name=\"username\""));
        assert!(!html.contains("name=\"password\""));
        assert!(html.contains("name=\"remember\""));
        assert!(html.contains("aria-label=\"SQL Server sign in\""));
        for payload in [
            "username=test&password=private-secret&remember=nothing",
            "connection_string=Password%3Dprivate-secret%3Bbroken&remember=password",
        ] {
            *st.auth.last_attempt.lock().await = None;
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/login")
                        .method(Method::POST)
                        .header(header::HOST, "127.0.0.1:8080")
                        .header(header::ORIGIN, "http://127.0.0.1:8080")
                        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                        .body(Body::from(payload))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert!(
                !std::str::from_utf8(&bytes)
                    .unwrap()
                    .contains("private-secret")
            );
            assert!(st.auth.session.read().await.is_none());
        }
        let conn = crate::db::open(&st.cfg.sqlite.path).unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM sql_connection", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM login_preferences", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn connection_setup_uses_submitted_target_and_survives_a_failed_login_and_restart() {
        let (_dir, mut st, _) = state();
        Arc::make_mut(&mut st.cfg).sqlserver.host = "sqlserver.example.local".into();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        // A local non-SQL endpoint proves the submitted target is used, without real credentials.
        let accepted = tokio::spawn(async move {
            listener.accept().await.unwrap();
        });
        let connection = format!("Data Source={address};Initial Catalog=FixtureDb;User ID=setup-user;Password=setup-private-secret;Encrypt=True;TrustServerCertificate=True")
            .replace(&address.to_string(), &format!("{},{}", address.ip(), address.port()));
        let mut encoded = reqwest::Url::parse("http://localhost/").unwrap();
        encoded
            .query_pairs_mut()
            .append_pair("connection_string", &connection)
            .append_pair("remember", "password");
        let response = tokio::time::timeout(
            Duration::from_secs(5),
            super::super::router(st.clone()).oneshot(
                Request::builder()
                    .uri("/login")
                    .method(Method::POST)
                    .header(header::HOST, "127.0.0.1:8080")
                    .header(header::ORIGIN, "http://127.0.0.1:8080")
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from(encoded.query().unwrap().to_owned()))
                    .unwrap(),
            ),
        )
        .await
        .unwrap()
        .unwrap();
        accepted.await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let html = std::str::from_utf8(&bytes).unwrap();
        assert!(!html.contains("name=\"connection_string\""));
        assert!(!html.contains("setup-private-secret"));
        assert!(html.contains("name=\"username\""));
        assert!(html.contains("value=\"setup-user\""));
        assert!(html.contains("Change SQL Server connection"));
        let conn = crate::db::open(&st.cfg.sqlite.path).unwrap();
        let target: String = conn
            .query_row("SELECT target FROM sql_connection", [], |row| row.get(0))
            .unwrap();
        assert!(!target.contains("setup-private-secret"));
        assert!(!target.contains("setup-user"));
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM login_preferences", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        let (auth, _) = Auth::new(&st.cfg, 8080).unwrap();
        st.auth = Arc::new(auth);
        let app = super::super::router(st.clone());
        for (url, setup) in [("/login", false), ("/login?setup=true", true)] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(url)
                        .header(header::HOST, "127.0.0.1:8080")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert_eq!(
                std::str::from_utf8(&bytes)
                    .unwrap()
                    .contains("name=\"connection_string\""),
                setup
            );
        }
        let configured = configured_state(st)
            .await
            .unwrap_or_else(|e| panic!("{}", e.0));
        assert_eq!(
            configured
                .cfg
                .sqlserver
                .connection_target()
                .unwrap()
                .get_addr(),
            address.to_string()
        );
    }

    #[tokio::test]
    async fn connection_setup_rejects_cross_origin_and_mixing_imported_sources() {
        let (_dir, st, _) = state();
        let conn = crate::db::open(&st.cfg.sqlite.path).unwrap();
        crate::demo::seed(
            &st.cfg.sqlite.path,
            1,
            chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap(),
        )
        .unwrap();
        let app = super::super::router(st.clone());
        let mut encoded = reqwest::Url::parse("http://localhost/").unwrap();
        encoded
            .query_pairs_mut()
            .append_pair(
                "connection_string",
                "Server=different.example.test,1433;Database=FixtureDb;UID=user;PWD=do-not-store",
            )
            .append_pair("remember", "password");
        for (origin, status) in [
            ("http://untrusted.example", StatusCode::FORBIDDEN),
            ("http://127.0.0.1:8080", StatusCode::BAD_REQUEST),
        ] {
            *st.auth.last_attempt.lock().await = None;
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/login")
                        .method(Method::POST)
                        .header(header::HOST, "127.0.0.1:8080")
                        .header(header::ORIGIN, origin)
                        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                        .body(Body::from(encoded.query().unwrap().to_owned()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), status);
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            let html = std::str::from_utf8(&bytes).unwrap();
            assert!(!html.contains("do-not-store"));
            if status == StatusCode::BAD_REQUEST {
                assert!(html.contains("requires a new SQLite database"));
            }
            assert_eq!(
                conn.query_row("SELECT COUNT(*) FROM sql_connection", [], |row| row
                    .get::<_, i64>(0))
                    .unwrap(),
                0
            );
        }
    }

    #[tokio::test]
    async fn setup_credentials_obey_all_remember_choices_and_target_scoping() {
        let (_dir, st, _) = state();
        let setup = crate::connection::Setup::parse("Server=sql.example.test,1433;Database=FixtureDb;UID=setup-user;PWD=setup-private-secret;Encrypt=true").unwrap();
        crate::connection::save(&crate::db::open(&st.cfg.sqlite.path).unwrap(), &setup).unwrap();
        let st = configured_state(st)
            .await
            .unwrap_or_else(|e| panic!("{}", e.0));
        let context = credential_context(&st).unwrap();
        let mut form = LoginForm {
            username: setup.credentials.username,
            password: setup.credentials.password,
            connection_string: String::new(),
            remember: Remember::Nothing,
            action: "password".into(),
        };
        for remember in [
            Remember::Nothing,
            Remember::Username,
            Remember::Password,
            Remember::Nothing,
        ] {
            let old = preference(&st).await.unwrap_or_else(|e| panic!("{}", e.0));
            form.remember = remember;
            save_preference(&st, &form, old).await.unwrap();
            let pref = preference(&st).await.unwrap_or_else(|e| panic!("{}", e.0));
            assert_eq!(
                !pref.username.is_empty(),
                form.remember != Remember::Nothing
            );
            assert_eq!(pref.saved_password, form.remember == Remember::Password);
            let stored = saved_password(context.clone(), form.username.clone()).await;
            assert_eq!(stored.is_ok(), form.remember == Remember::Password);
        }
        let restarted = configured_state(st.clone())
            .await
            .unwrap_or_else(|e| panic!("{}", e.0));
        assert_eq!(credential_context(&restarted).unwrap(), context);
        let mut other = (*st.cfg).clone();
        other.sqlserver.web_target = Some(crate::connection::Setup::parse(
            "Server=another.example.test,1433;Database=FixtureDb;UID=setup-user;PWD=setup-private-secret;Encrypt=true"
        ).unwrap().target);
        assert_ne!(Auth::credential_context(&other).unwrap(), context);
    }

    #[tokio::test]
    async fn saved_sign_in_does_not_rewrite_keychain_password() {
        let (_dir, st, _) = state();
        let mut form = LoginForm {
            username: "saved-user".into(),
            connection_string: String::new(),
            password: "saved-secret".into(),
            remember: Remember::Password,
            action: "password".into(),
        };
        save_preference(&st, &form, Preference::default())
            .await
            .unwrap();
        let old = preference(&st).await.unwrap_or_else(|e| panic!("{}", e.0));
        form.action = "saved".into();
        form.password = saved_password(st.auth.context.clone(), form.username.clone())
            .await
            .unwrap();
        save_preference(&st, &form, old.clone()).await.unwrap();
        let key = format!("{}:{}", st.auth.context, form.username);
        assert_eq!(WRITES.lock().unwrap().get(&key), Some(&1));
        form.action = "password".into();
        form.password = "new-secret".into();
        save_preference(&st, &form, old).await.unwrap();
        assert_eq!(WRITES.lock().unwrap().get(&key), Some(&2));
    }

    #[tokio::test]
    async fn persistence_failure_warning_keeps_user_authenticated() {
        let (_dir, st, receiver) = state();
        let token = random_token().unwrap();
        let response = complete_login(
            &st,
            (*st.cfg).clone(),
            token.clone(),
            Some("Remember choice failed; you are still signed in.".into()),
        )
        .await
        .unwrap_or_else(|e| panic!("{}", e.0));
        assert_eq!(response.status(), StatusCode::OK);
        assert!(
            response.headers()[header::SET_COOKIE]
                .to_str()
                .unwrap()
                .contains(&token)
        );
        assert!(receiver.borrow().is_some());
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body = std::str::from_utf8(&body).unwrap();
        assert!(body.contains("Remember choice failed"));
        assert!(body.contains("Continue to dashboard"));
        let response = super::super::router(st)
            .oneshot(
                Request::builder()
                    .uri("/login")
                    .header(header::HOST, "127.0.0.1:8080")
                    .header(header::COOKIE, format!("{COOKIE}={token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(response.headers()[header::LOCATION], "/");
    }

    #[tokio::test]
    async fn duplicate_login_is_rejected_instead_of_queueing_keychain_prompts() {
        let (_dir, st, _) = state();
        let _guard = st.auth.login_lock.lock().await;
        let response = super::super::router(st.clone())
            .oneshot(
                Request::builder()
                    .uri("/login")
                    .method(Method::POST)
                    .header(header::HOST, "127.0.0.1:8080")
                    .header(header::ORIGIN, "http://127.0.0.1:8080")
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("username=test&password=test&remember=password"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CONFLICT);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(
            std::str::from_utf8(&body)
                .unwrap()
                .contains("A sign-in is already in progress")
        );
    }

    impl TestEntry {
        pub fn get_password(&self) -> keyring::Result<String> {
            SECRETS
                .lock()
                .unwrap()
                .get(&self.0)
                .cloned()
                .ok_or(keyring::Error::NoEntry)
        }

        pub fn delete_credential(&self) -> keyring::Result<()> {
            SECRETS
                .lock()
                .unwrap()
                .remove(&self.0)
                .map(|_| ())
                .ok_or(keyring::Error::NoEntry)
        }
    }

    #[tokio::test]
    async fn saved_password_is_replaced_and_removed_when_remember_mode_changes() {
        let (_dir, st, _) = state();
        let mut form = LoginForm {
            username: "sql-user".into(),
            connection_string: String::new(),
            password: "first-password".into(),
            remember: Remember::Password,
            action: String::new(),
        };
        save_preference(&st, &form, Preference::default())
            .await
            .unwrap();
        let stored = preference(&st).await.unwrap_or_else(|e| panic!("{}", e.0));
        assert!(stored.saved_password);
        assert_eq!(
            saved_password(st.auth.context.clone(), form.username.clone())
                .await
                .unwrap(),
            "first-password"
        );
        form.password = "changed-password".into();
        save_preference(&st, &form, stored).await.unwrap();
        assert_eq!(
            saved_password(st.auth.context.clone(), form.username.clone())
                .await
                .unwrap(),
            "changed-password"
        );
        let stored = preference(&st).await.unwrap_or_else(|e| panic!("{}", e.0));
        form.remember = Remember::Username;
        save_preference(&st, &form, stored).await.unwrap();
        assert!(
            saved_password(st.auth.context.clone(), form.username.clone())
                .await
                .is_err()
        );
        let stored = preference(&st).await.unwrap_or_else(|e| panic!("{}", e.0));
        assert_eq!(stored.username, "sql-user");
        assert!(!stored.saved_password);

        form.remember = Remember::Password;
        save_preference(&st, &form, stored).await.unwrap();
        let stored = preference(&st).await.unwrap_or_else(|e| panic!("{}", e.0));
        form.username = "another-user".into();
        save_preference(&st, &form, stored).await.unwrap();
        assert!(
            saved_password(st.auth.context.clone(), "sql-user".into())
                .await
                .is_err()
        );
        assert!(
            saved_password(st.auth.context.clone(), "another-user".into())
                .await
                .is_ok()
        );
        let stored = preference(&st).await.unwrap_or_else(|e| panic!("{}", e.0));
        form.remember = Remember::Nothing;
        save_preference(&st, &form, stored).await.unwrap();
        assert!(
            saved_password(st.auth.context.clone(), "another-user".into())
                .await
                .is_err()
        );
        assert!(
            preference(&st)
                .await
                .unwrap_or_else(|e| panic!("{}", e.0))
                .username
                .is_empty()
        );
    }

    fn state() -> (tempfile::TempDir, AppState, watch::Receiver<ActiveLogin>) {
        let dir = tempfile::tempdir().unwrap();
        let mut cfg = Config::default();
        cfg.sqlite.path = dir.path().join("test.db");
        cfg.sqlserver.dataaccess_file = dir.path().join("missing.json");
        crate::db::open(&cfg.sqlite.path).unwrap();
        let (auth, receiver) = Auth::new(&cfg, 8080).unwrap();
        let st = AppState {
            cfg: Arc::new(cfg),
            auth: Arc::new(auth),
            suggesting: Default::default(),
            suggest_errors: Default::default(),
            desktop_shutdown: None,
        };
        (dir, st, receiver)
    }

    async fn signed_in(st: &AppState, expires: Instant) -> String {
        let mut cfg = (*st.cfg).clone();
        cfg.sqlserver.credentials = Some(SqlCredentials {
            username: "session-user".into(),
            password: "secret-not-for-html".into(),
        });
        let token = random_token().unwrap();
        let cfg = Arc::new(cfg);
        *st.auth.session.write().await = Some(Session {
            token: token.clone(),
            config: cfg.clone(),
            expires,
        });
        st.auth.scheduled.send_replace(Some((cfg, expires)));
        token
    }

    #[tokio::test]
    async fn protected_pages_redirect_and_login_needs_no_sql_or_keychain() {
        let (_dir, st, _) = state();
        let app = super::super::router(st);
        for path in [
            "/assets/css/catsStrap.css",
            "/assets/css/bootstrap/js/bootstrap.bundle.min.js",
            "/assets/css/bootstrap/icons/font/bootstrap-icons.css",
            "/assets/css/bootstrap/icons/font/fonts/bootstrap-icons.woff2?v=1",
            "/assets/js/sml/sml.js",
            "/assets/js/sml/smlUtils.js",
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .header(header::HOST, "127.0.0.1:8080")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK, "{path}");
        }
        for path in [
            "/",
            "/imports",
            "/settings",
            "/settings/source",
            "/groups/1",
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .header(header::HOST, "127.0.0.1:8080")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::SEE_OTHER);
            assert_eq!(response.headers()[header::LOCATION], "/login");
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
            assert_eq!(response.headers()[header::REFERRER_POLICY], "same-origin");
        }
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/login")
                    .header(header::HOST, "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::REFERRER_POLICY], "same-origin");
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(
            std::str::from_utf8(&body)
                .unwrap()
                .contains("Welcome to Bunyan")
        );
    }

    #[tokio::test]
    async fn source_settings_preview_is_unsaved_then_save_is_used_by_existing_sessions() {
        let (dir, st, _) = state();
        let root = dir.path().join("related");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(
            root.join("Orders.cs"),
            "class Orders { void Save() { /* source fixture */ } }",
        )
        .unwrap();
        let token = signed_in(&st, Instant::now() + SESSION_LIFETIME).await;
        let app = super::super::router(st.clone());
        for action in ["test", "save", "invalid"] {
            let mut url = reqwest::Url::parse("http://localhost/").unwrap();
            url.query_pairs_mut().extend_pairs([
                ("action", action),
                ("root", root.to_str().unwrap()),
                ("extensions", "cs"),
                ("context_lines", "40"),
                ("class", "Acme.Orders"),
                ("method", "Save"),
            ]);
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/settings/source")
                        .method(Method::POST)
                        .header(header::HOST, "127.0.0.1:8080")
                        .header(header::ORIGIN, "http://127.0.0.1:8080")
                        .header(header::COOKIE, format!("{COOKIE}={token}"))
                        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                        .body(Body::from(url.query().unwrap().to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(
                response.status(),
                if action == "invalid" {
                    StatusCode::BAD_REQUEST
                } else {
                    StatusCode::OK
                }
            );
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            let body = std::str::from_utf8(&body).unwrap();
            if action == "test" {
                assert!(body.contains("source fixture"));
                assert!(body.contains("Nothing saved"));
                assert!(st.cfg.source_settings().unwrap().root.is_none());
            } else {
                assert_eq!(
                    st.cfg.source_settings().unwrap().root,
                    Some(root.canonicalize().unwrap())
                );
            }
        }
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/settings/source")
                    .header(header::HOST, "127.0.0.1:8080")
                    .header(header::COOKIE, format!("{COOKIE}={token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(
            std::str::from_utf8(&body)
                .unwrap()
                .contains(root.to_str().unwrap())
        );
    }

    #[tokio::test]
    async fn desktop_logout_stops_the_listener_and_can_restart_without_losing_data() {
        let (_dir, mut st, mut scheduled) = state();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        Arc::get_mut(&mut st.auth).unwrap().port = address.port();
        let url = format!("http://{address}");
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let mut listener = Some(listener);
        for _ in 0..2 {
            let token = signed_in(&st, Instant::now() + Duration::from_secs(60)).await;
            let (shutdown, stopping) = watch::channel(false);
            st.desktop_shutdown = Some(shutdown.clone());
            let server = tokio::spawn(super::super::run_server(
                listener.take().unwrap(),
                st.clone(),
                stopping,
            ));
            assert_eq!(
                client
                    .get(format!("{url}/health"))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::OK
            );
            let rejected = client
                .post(format!("{url}/logout"))
                .header("origin", "http://untrusted.example")
                .header("cookie", format!("{COOKIE}={token}"))
                .send()
                .await
                .unwrap();
            assert_eq!(rejected.status(), StatusCode::FORBIDDEN);
            assert!(!*shutdown.borrow());
            let get = client
                .get(format!("{url}/logout"))
                .header("cookie", format!("{COOKIE}={token}"))
                .send()
                .await
                .unwrap();
            assert_eq!(get.status(), StatusCode::METHOD_NOT_ALLOWED);
            assert!(!*shutdown.borrow());
            let response = client
                .post(format!("{url}/logout"))
                .header("origin", &url)
                .header("cookie", format!("{COOKIE}={token}"))
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert!(
                response.headers()[header::SET_COOKIE]
                    .to_str()
                    .unwrap()
                    .contains("Max-Age=0")
            );
            assert_eq!(
                response.json::<serde_json::Value>().await.unwrap()["shutdown"],
                true
            );
            tokio::time::timeout(Duration::from_secs(3), server)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            assert!(st.auth.session.read().await.is_none());
            assert!(scheduled.borrow_and_update().is_none());
            assert!(tokio::net::TcpStream::connect(address).await.is_err());
            assert!(st.cfg.sqlite.path.is_file());
            listener = Some(tokio::net::TcpListener::bind(address).await.unwrap());
        }
    }

    #[tokio::test]
    async fn web_import_ranges_use_the_session_and_reject_overlapping_requests() {
        let (_dir, mut st, _) = state();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let cfg = Arc::make_mut(&mut st.cfg);
        cfg.sqlserver.host = "127.0.0.1".into();
        cfg.sqlserver.port = listener.local_addr().unwrap().port();
        cfg.sqlserver.password = None;
        cfg.sqlserver.password_env = "BUNYAN_TEST_UNUSED_RANGE_PASSWORD".into();
        let token = signed_in(&st, Instant::now() + SESSION_LIFETIME).await;
        let app = super::super::router(st.clone());
        let request = |body: &str, origin: &str| {
            Request::builder()
                .method(Method::POST)
                .uri("/imports")
                .header(header::HOST, "127.0.0.1:8080")
                .header(header::ORIGIN, origin)
                .header(header::COOKIE, format!("{COOKIE}={token}"))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(body.to_owned()))
                .unwrap()
        };
        let guard = crate::importer::IMPORT_LOCK.lock().await;
        for (body, origin, status) in [
            (
                "day=2026-10-14&through=2026-10-12",
                "http://127.0.0.1:8080",
                StatusCode::BAD_REQUEST,
            ),
            (
                "day=2026-10-12&through=2026-10-14",
                "http://untrusted.example",
                StatusCode::FORBIDDEN,
            ),
            (
                "day=2026-10-12&through=2026-10-14",
                "http://127.0.0.1:8080",
                StatusCode::CONFLICT,
            ),
        ] {
            assert_eq!(
                app.clone()
                    .oneshot(request(body, origin))
                    .await
                    .unwrap()
                    .status(),
                status
            );
        }
        assert!(
            crate::db::recent_runs(&crate::db::open(&st.cfg.sqlite.path).unwrap(), 60)
                .unwrap()
                .is_empty()
        );
        drop(guard);
        // Closing three local non-SQL sockets exercises failed-day continuation without real SQL.
        // Reaching them also proves the captured session supplied credentials absent from base config.
        let connections = tokio::spawn(async move {
            for _ in 0..3 {
                drop(listener.accept().await.unwrap());
            }
        });
        let response = app
            .oneshot(request(
                "day=2026-10-12&through=2026-10-14",
                "http://127.0.0.1:8080",
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(response.headers()[header::LOCATION], "/imports");
        tokio::time::timeout(Duration::from_secs(5), connections)
            .await
            .unwrap()
            .unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            let _finished = crate::importer::IMPORT_LOCK.lock().await;
        })
        .await
        .unwrap();
        let runs =
            crate::db::recent_runs(&crate::db::open(&st.cfg.sqlite.path).unwrap(), 60).unwrap();
        assert_eq!(runs.len(), 3);
        for (run, day) in runs
            .iter()
            .rev()
            .zip(["2026-10-12", "2026-10-13", "2026-10-14"])
        {
            assert_eq!(run.day, day);
            assert_eq!(run.trigger, "manual");
            assert_eq!(run.status, "failed");
            assert!(run.finished_at.is_some());
            assert!(
                !run.error
                    .as_ref()
                    .unwrap()
                    .contains("no SQL Server credentials")
            );
            assert!(!run.error.as_ref().unwrap().contains("secret-not-for-html"));
        }
    }

    #[tokio::test]
    async fn authenticated_requests_use_session_credentials_and_logout_revokes_them() {
        let (_dir, st, receiver) = state();
        let token = signed_in(&st, Instant::now() + SESSION_LIFETIME).await;
        let cookie = format!("{COOKIE}={token}");
        let app = super::super::router(st.clone());
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/imports")
                    .header(header::HOST, "127.0.0.1:8080")
                    .header(header::COOKIE, &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body = std::str::from_utf8(&body).unwrap();
        assert!(body.contains("session-user"));
        assert!(!body.contains("secret-not-for-html"));
        assert!(receiver.borrow().is_some());

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/logout")
                    .method(Method::POST)
                    .header(header::HOST, "127.0.0.1:8080")
                    .header(header::ORIGIN, "http://127.0.0.1:8080")
                    .header(header::COOKIE, &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert!(
            response.headers()[header::SET_COOKIE]
                .to_str()
                .unwrap()
                .contains("Max-Age=0")
        );
        assert!(receiver.borrow().is_none());
        assert!(
            st.auth
                .config(&HeaderMap::from_iter([(
                    header::COOKIE,
                    cookie.parse().unwrap()
                )]))
                .await
                .is_none()
        );
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/")
                    .header(header::HOST, "127.0.0.1:8080")
                    .header(header::COOKIE, &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.headers()[header::LOCATION], "/login");
    }

    #[tokio::test]
    async fn sessions_expire_and_reject_unknown_tokens() {
        let (_dir, st, receiver) = state();
        let token = signed_in(&st, Instant::now() - Duration::from_secs(1)).await;
        let headers =
            HeaderMap::from_iter([(header::COOKIE, format!("{COOKIE}={token}").parse().unwrap())]);
        assert!(st.auth.config(&headers).await.is_none());
        assert!(receiver.borrow().is_none());
        signed_in(&st, Instant::now() + SESSION_LIFETIME).await;
        assert!(st.auth.config(&headers).await.is_none());
    }

    #[tokio::test]
    async fn username_only_and_nothing_never_store_passwords_in_sqlite() {
        let (_dir, st, _) = state();
        let mut form = LoginForm {
            username: "remembered-user".into(),
            connection_string: String::new(),
            password: "never-store-in-sqlite".into(),
            remember: Remember::Username,
            action: String::new(),
        };
        save_preference(&st, &form, Preference::default())
            .await
            .unwrap();
        let stored = preference(&st).await.unwrap_or_else(|e| panic!("{}", e.0));
        assert_eq!(stored.username, "remembered-user");
        assert!(!stored.saved_password);
        let bytes = std::fs::read(&st.cfg.sqlite.path).unwrap();
        assert!(
            !bytes
                .windows(form.password.len())
                .any(|w| w == form.password.as_bytes())
        );
        form.remember = Remember::Nothing;
        save_preference(&st, &form, stored).await.unwrap();
        assert!(
            preference(&st)
                .await
                .unwrap_or_else(|e| panic!("{}", e.0))
                .username
                .is_empty()
        );
    }

    #[tokio::test]
    async fn cross_origin_login_cannot_reach_sql_or_change_session() {
        let (_dir, st, receiver) = state();
        let response = super::super::router(st)
            .oneshot(
                Request::builder()
                    .uri("/login")
                    .method(Method::POST)
                    .header(header::HOST, "127.0.0.1:8080")
                    .header(header::ORIGIN, "https://attacker.example")
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("username=bad&password=secret&remember=password"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(receiver.borrow().is_none());
    }

    #[test]
    fn origins_and_hosts_must_match_local_listener() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "127.0.0.1:8080".parse().unwrap());
        assert!(check_request(&headers, &Method::GET, 8080).is_ok());
        assert!(check_request(&headers, &Method::POST, 8080).is_err());
        headers.insert(header::ORIGIN, "http://127.0.0.1:8080".parse().unwrap());
        assert!(check_request(&headers, &Method::POST, 8080).is_ok());
        headers.insert(header::ORIGIN, "https://attacker.example".parse().unwrap());
        assert!(check_request(&headers, &Method::POST, 8080).is_err());
        headers.insert(header::HOST, "attacker.example:8080".parse().unwrap());
        assert!(check_request(&headers, &Method::GET, 8080).is_err());
    }

    #[test]
    fn login_markup_has_no_password_and_escapes_names() {
        let markup = render(
            &Preference {
                username: "<script>".into(),
                saved_password: true,
            },
            None,
        )
        .into_string();
        assert!(markup.contains("&lt;script&gt;"));
        assert!(!markup.contains("value=\"<script>\""));
        assert!(markup.contains("value=\"saved\""));
        assert!(
            markup
                .contains("name=\"password\" type=\"password\" autocomplete=\"current-password\"")
        );
        if cfg!(windows) {
            assert!(markup.contains("Windows Credential Manager"));
            assert!(!markup.contains("macOS Keychain"));
        }
        assert!(!markup.contains("href=\"/settings\""));
    }

    #[test]
    fn tokens_are_random_and_cookie_parser_uses_exact_name() {
        let first = random_token().unwrap();
        assert_eq!(first.len(), 64);
        assert_ne!(first, random_token().unwrap());
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            "not_bunyan_session=bad; bunyan_session=good"
                .parse()
                .unwrap(),
        );
        assert_eq!(session_cookie(&headers), Some("good"));
    }
}
