use std::path::Path;

use axum::body::Body;
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use include_dir::{include_dir, Dir};
use tower_http::compression::predicate::SizeAbove;
use tower_http::compression::CompressionLayer;
use tracing::info;

static FRONTEND: Dir = include_dir!("$CARGO_MANIFEST_DIR/frontend/dist/pica/browser/");

const CACHE_CONTROL_INDEX: &str = "public, max-age=3600";
const CACHE_CONTROL_IMMUTABLE: &str = "public, max-age=31536000, immutable";

pub fn frontend() -> Router {
    Router::new()
        .route("/", get(serve_index))
        .fallback(get(serve))
        .layer(CompressionLayer::new().compress_when(SizeAbove::new(1024)))
}

async fn serve(req: axum::extract::Request) -> Response {
    let path = req.uri().path();
    info!("Serve frontend file: {:?}", path);

    // strip leading / from the path
    let path = path.strip_prefix('/').unwrap_or(path);

    match build_response(path, CACHE_CONTROL_IMMUTABLE) {
        Some(resp) => resp,
        None => serve_index().await,
    }
}

async fn serve_index() -> Response {
    build_response("index.html", CACHE_CONTROL_INDEX).unwrap_or_else(|| StatusCode::NOT_FOUND.into_response())
}

fn build_response(path: impl AsRef<Path>, cache_control: &str) -> Option<Response> {
    let file = FRONTEND.get_file(&path)?;

    let content_type = mime_guess::from_path(path)
        .first_raw()
        .map(HeaderValue::from_static)
        .unwrap_or_else(|| HeaderValue::from_str(mime::APPLICATION_OCTET_STREAM.as_ref()).unwrap());

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, cache_control)
        .body(Body::from(file.contents()))
        .ok()
}
