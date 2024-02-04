use axum::http::StatusCode;
use axum::Json;
use axum::response::{IntoResponse, Response};
use axum_login::tower_sessions::Session;
use serde::Deserialize;
use tracing::instrument;

use crate::pica_web::auth::{AuthSession, Credentials};
use crate::pica_web::handlers::WebError;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[instrument(skip_all)]
pub async fn login(
    mut auth_session: AuthSession,
    Json(payload): Json<LoginRequest>,
) -> Result<Response, WebError> {
    let creds = Credentials {
        username: payload.username,
        password: payload.password,
    };

    let Some(user) = auth_session.authenticate(creds).await? else {
        return Ok(StatusCode::UNAUTHORIZED.into_response());
    };

    auth_session.login(&user).await?;

    Ok(().into_response())
}

/// Touches the session to update the expiry timestamp.
#[instrument(skip_all)]
pub async fn touch(session: Session) -> Result<(), WebError> {
    session.save().await?;
    Ok(())
}
