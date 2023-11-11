use axum::response::{IntoResponse, Response};

pub mod media;
pub mod api;

pub struct WebError(anyhow::Error);

impl IntoResponse for WebError {
    fn into_response(self) -> Response {
        self.0.to_string().into_response()
    }
}

impl<T: Into<anyhow::Error>> From<T> for WebError {
    fn from(err: T) -> Self {
        WebError(err.into())
    }
}
