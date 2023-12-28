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

use crate::pica::{MediaId, MediaItem};
use crate::pica_web::AppState;
use crate::pica_web::handlers::WebError;

enum ImageType {
    Thumbnail,
    Preview,
}

pub async fn handle_thumbnail(
    Path((id, _)): Path<(MediaId, String)>,
    State(state): State<AppState>,
) -> Result<Response, WebError> {
    handle_image_scaled(id, state, ImageType::Thumbnail).await
}

pub async fn handle_preview_sdr(
    Path((id, _)): Path<(MediaId, String)>,
    State(state): State<AppState>,
) -> Result<Response, WebError> {
    handle_image_scaled(id, state, ImageType::Preview).await
}

pub async fn handle_preview_hdr(
    Path((id, _)): Path<(MediaId, String)>,
    State(state): State<AppState>,
) -> Result<Response, WebError> {
    handle_image_scaled(id, state, ImageType::Preview).await
}

async fn handle_image_scaled(id: MediaId, state: AppState, image_type: ImageType) -> Result<Response, WebError> {
    let media = state.store.get(id).await
        .ok_or_else(|| anyhow!("unknown image {:?}", id))?;

    let image = match image_type {
        ImageType::Thumbnail => state.accessor.thumb(&media).await?,
        ImageType::Preview => state.accessor.preview(&media).await?,
    };

    let resp = Response::builder()
        .header(http::header::CONTENT_TYPE, image.typ.mime_type())
        .header(http::header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(axum::body::Body::from(image.blob))?;

    Ok(resp)
}

pub async fn handle_fullsize(
    Path((id, _)): Path<(MediaId, String)>,
    state: State<AppState>,
    request: Request<Body>,
) -> Result<Response, WebError> {

    let media = state.store.get(id).await
        .ok_or_else(|| anyhow!("unknown image {:?}", id))?;

    debug!("Serve full image for {:?}", media.relpath);

    // guess mime from the media path
    let mime = mime_guess::from_path(&media.relpath)
        .first_or(Mime::from_str("image/jpeg")?);

    // serve file to response
    let path = state.accessor.full(&media);
    let mut resp = ServeFile::new_with_mime(&path, &mime)
        .oneshot(request)
        .await?;

    //  on success inject cache header into response
    if resp.status().is_success() {
        resp.headers_mut().insert(
            http::header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        );
    }

    Ok(resp.into_response())
}
