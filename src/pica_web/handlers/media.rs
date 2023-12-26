use std::str::FromStr;

use anyhow::anyhow;
use anyhow::Result;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http;
use axum::http::{HeaderValue, Request};
use axum::response::{IntoResponse, Response};
use mime::Mime;
use tower::ServiceExt;
use tower_http::services::ServeFile;
use tracing::debug;

use crate::pica::MediaId;
use crate::pica_web::AppState;
use crate::pica_web::handlers::WebError;

enum ImageType {
    Thumbnail,
    Preview,
}

pub async fn handle_thumbnail(
    Path((id, _)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<Response, WebError> {
    let id = MediaId::from_str(&id)?;
    handle_image_scaled(id, state, ImageType::Thumbnail).await
}

pub async fn handle_preview_sdr(
    Path((id, _)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<Response, WebError> {
    let id = MediaId::from_str(&id)?;
    handle_image_scaled(id, state, ImageType::Preview).await
}

pub async fn handle_preview_hdr(
    Path((id, _)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<Response, WebError> {
    let id = MediaId::from_str(&id)?;
    handle_image_scaled(id, state, ImageType::Preview).await
}

async fn handle_image_scaled(id: MediaId, state: AppState, image_type: ImageType) -> Result<Response, WebError> {
    let image = state.store.get(id)
        .await?
        .ok_or_else(|| anyhow!("unknown image {:?}", id))?;

    let thumbnail = match image_type {
        ImageType::Thumbnail => state.accessor.thumb(&image).await?,
        ImageType::Preview => state.accessor.preview(&image).await?,
    };

    let resp = Response::builder()
        .header(http::header::CONTENT_TYPE, "image/avif")
        .header(http::header::CACHE_CONTROL, "immutable")
        .body(axum::body::Body::from(thumbnail))?;

    Ok(resp)
}

pub async fn handle_fullsize(
    Path((id, _)): Path<(String, String)>,
    state: State<AppState>,
    request: Request<Body>,
) -> Result<Response, WebError> {
    let id = MediaId::from_str(&id)?;

    let media = state.store.get(id)
        .await?
        .ok_or_else(|| anyhow!("unknown image {:?}", id))?;

    debug!("Serve full image for {:?}", media.relpath);

    let mime = Mime::from_str("image/jpeg").unwrap();

    let path = state.accessor.full(&media);
    let mut resp = ServeFile::new_with_mime(&path, &mime)
        .oneshot(request)
        .await?;

    resp.headers_mut().insert(
        http::header::CACHE_CONTROL,
        HeaderValue::from_static("immutable"),
    );

    Ok(resp.into_response())
}
