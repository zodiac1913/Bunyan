//! Workstation login: one active SQL identity, opaque browser sessions, and optional OS-keychain
//! passwords. SQLite contains only the remembered name/flag; passwords never enter HTML or cookies.

use super::{AppError, AppState, pages, with_db};
use crate::{
    config::{Config, SqlCredentials},
    source,
};
use anyhow::{Context, Result};
use axum::{
    extract::{Form, Request, State},
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
    username: String,
    #[serde(default)]
    password: String,
    remember: Remember,
    #[serde(default)]
    action: String,
}

impl Auth {
    /// Scope saved credentials to the configured target and local database, not the current password.
    pub(super) fn new(cfg: &Config, port: u16) -> Result<(Self, watch::Receiver<ActiveLogin>)> {
        let mut target = cfg.sqlserver.connection_target()?;
        target.authentication(tiberius::AuthMethod::sql_server("", ""));
        let path = std::fs::canonicalize(&cfg.sqlite.path)?;
        let context = hex::encode(Sha256::digest(format!("{path:?}|{target:?}")));
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
    let public = matches!(
        request.uri().path(),
        "/login" | "/health" | "/assets/bunyan.jpeg"
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
    let context = st.auth.context.clone();
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
        keychain_entry(&context, &username)?.get_password().context(
            "Saved password could not be read. Enter it manually or unlock your OS keychain.",
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
    let context = st.auth.context.clone();
    let username = form.username.clone();
    let password = (form.remember == Remember::Password).then(|| form.password.clone());
    // OS keychain calls may prompt or block. Never run them on an async executor thread.
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
                .context("Could not save the password in the OS keychain")?;
        }
        Ok(())
    })
    .await??;
    let context = st.auth.context.clone();
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

pub(super) async fn page(
    State(st): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    if st.auth.config(&headers).await.is_some() {
        return Ok(Redirect::to("/").into_response());
    }
    let pref = preference(&st).await?;
    Ok(render(&pref, None).into_response())
}

pub(super) async fn login(
    State(st): State<AppState>,
    Form(mut form): Form<LoginForm>,
) -> Result<Response, AppError> {
    // Do not queue duplicate submissions behind an interactive OS credential-store prompt.
    let Ok(_guard) = st.auth.login_lock.try_lock() else {
        return Ok((StatusCode::CONFLICT, render(
            &Preference::default(),
            Some("A sign-in is already in progress. Finish or cancel the OS Keychain prompt before trying again."),
        )).into_response());
    };
    let old = preference(&st).await?;
    let display = Preference {
        username: form.username.trim().to_string(),
        saved_password: old.saved_password && old.username == form.username.trim(),
    };
    let fail = |status, message: &str| (status, render(&display, Some(message))).into_response();
    let mut attempt = st.auth.last_attempt.lock().await;
    if attempt.is_some_and(|time| time.elapsed() < Duration::from_secs(2)) {
        return Ok(fail(
            StatusCode::TOO_MANY_REQUESTS,
            "Wait two seconds before trying again.",
        ));
    }
    *attempt = Some(Instant::now());
    drop(attempt);
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
        match saved_password(st.auth.context.clone(), form.username.clone()).await {
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
    let mut response = Redirect::to("/login").into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        format!("{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")
            .parse()
            .unwrap(),
    );
    response
}

fn render(pref: &Preference, error: Option<&str>) -> Markup {
    pages::layout(
        "Sign in",
        "login",
        None,
        html! {
            section.login-panel.panel {
                h1 { "Welcome to Bunyan" }
                p { "Sign in with your SQL Server account to view this workstation's log dashboard." }
                p.small.muted { "A macOS Keychain popup asks for your Mac login/keychain password, not your SQL Server password. Choose Always Allow only if you trust this Bunyan executable. Rebuilding the development app may cause macOS to ask again." }
                @if let Some(error) = error { div.flash role="alert" { (error) } }
                form method="post" action="/login" {
                    label for="username" { "SQL Server username" }
                    input id="username" name="username" autocomplete="username" required maxlength="256" value=(&pref.username);
                    label for="password" { "Password" }
                    input id="password" name="password" type="password" autocomplete="current-password";
                    label for="remember" { "Remember on this computer" }
                    select id="remember" name="remember" {
                        option value="nothing" selected[pref.username.is_empty()] { "Don't save either" }
                        option value="username" selected[!pref.username.is_empty() && !pref.saved_password] { "Save username only" }
                        option value="password" selected[pref.saved_password] { "Save username and password (OS keychain)" }
                    }
                    div.login-actions {
                        button type="submit" name="action" value="password" { "Sign in" }
                        @if pref.saved_password {
                            button type="submit" name="action" value="saved" { "Sign in with saved password" }
                        }
                    }
                }
                p.small.muted { "Saving does not automatically sign you in. Sessions end after 12 hours or when the app stops. Bunyan saves passwords only in the OS keychain, never in SQLite or cookies." }
                details {
                    summary { "Password expired or changed?" }
                    p { (source::PASSWORD_CHANGE_MESSAGE) }
                    p { "If your password was changed elsewhere, enter the new password above. Choose to save it to replace the old saved password." }
                }
            }
        },
    )
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
    async fn saved_sign_in_does_not_rewrite_keychain_password() {
        let (_dir, st, _) = state();
        let mut form = LoginForm {
            username: "saved-user".into(),
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
        for path in ["/", "/imports", "/settings", "/groups/1"] {
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
