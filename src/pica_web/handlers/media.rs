use std::path::PathBuf;
use std::str::FromStr;

use anyhow::anyhow;
use anyhow::Result;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{HeaderValue, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use mime::Mime;
use tower::ServiceExt;
use tower_http::services::ServeFile;
use tracing::debug;

use crate::pica::media::Media;
use crate::pica::MediaId;
use crate::pica_web::AppState;
use crate::pica_web::handlers::WebError;

pub async fn handle_thumbnail(
    Path((id, _)): Path<(String, String)>,
    State(state): State<AppState>,
    request: Request<Body>,
) -> Result<Response, WebError> {
    let id = MediaId::from_str(&id)?;
    handle_image_scaled(id, state, request, |m: Media| Some(m.thumb)).await
}

pub async fn handle_preview_sdr(
    Path((id, _)): Path<(String, String)>,
    State(state): State<AppState>,
    request: Request<Body>,
) -> Result<Response, WebError> {
    let id = MediaId::from_str(&id)?;
    handle_image_scaled(id, state, request, |m: Media| Some(m.preview_sdr)).await
}

pub async fn handle_preview_hdr(
    Path((id, _)): Path<(String, String)>,
    State(state): State<AppState>,
    request: Request<Body>,
) -> Result<Response, WebError> {
    let id = MediaId::from_str(&id)?;
    handle_image_scaled(id, state, request, |m: Media| m.preview_hdr).await
}

async fn handle_image_scaled(
    id: MediaId, state: AppState, request: Request<Body>,
    selector: impl FnOnce(Media) -> Option<PathBuf>,
) -> Result<Response, WebError> {
    let image = state.store.get(id)
        .await
        .ok_or_else(|| anyhow!("unknown image {:?}", id))?;

    let Some(thumbnail) = selector(state.accessor.get(&image).await?) else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };

    let mime = Mime::from_str("image/avif").unwrap();

    let mut resp = ServeFile::new_with_mime(thumbnail, &mime)
        .oneshot(request)
        .await?;

    if resp.status().is_success() {
        resp.headers_mut().insert(
            axum::http::header::CACHE_CONTROL,
            HeaderValue::from_static("immutable"),
        );
    }

    Ok(resp.into_response())
}

pub async fn handle_fullsize(
    Path((id, _)): Path<(String, String)>,
    state: State<AppState>,
    request: Request<Body>,
) -> Result<Response, WebError> {
    let id = MediaId::from_str(&id)?;
    let image = state.store.get(id)
        .await
        .ok_or_else(|| anyhow!("unknown image {:?}", id))?;

    debug!("Serve full image for {:?}", image.path);

    let mime = Mime::from_str("image/jpeg").unwrap();

    let mut resp = ServeFile::new_with_mime(&image.path, &mime)
        .oneshot(request)
        .await?;

    resp.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        HeaderValue::from_static("immutable"),
    );

    Ok(resp.into_response())
}
