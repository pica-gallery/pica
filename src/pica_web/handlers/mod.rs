use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

pub mod api;
pub mod frontend;
pub mod media;
pub mod auth;

pub struct WebError(anyhow::Error);

impl IntoResponse for WebError {
    fn into_response(self) -> Response {
        let formatted = format!("{:?}", self.0);
        (StatusCode::INTERNAL_SERVER_ERROR, formatted).into_response()
    }
}

impl<T: Into<anyhow::Error>> From<T> for WebError {
    fn from(err: T) -> Self {
        WebError(err.into())
    }
}
