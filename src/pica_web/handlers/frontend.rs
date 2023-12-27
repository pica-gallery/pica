use std::path::Path;

use axum::body::Body;
use axum::handler::Handler;
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Router;
use axum::routing::get;
use include_dir::{Dir, include_dir};
use tower_http::compression::CompressionLayer;
use tower_http::compression::predicate::SizeAbove;
use tracing::info;

static FRONTEND: Dir = include_dir!("$CARGO_MANIFEST_DIR/frontend/dist/pica/browser/");

pub fn frontend() -> Router {
    Router::new()
        .fallback(get(serve))
        .layer(CompressionLayer::new().compress_when(SizeAbove::new(1024)))
}

async fn serve(req: axum::extract::Request) -> Response {
    let path = req.uri().path();
    info!("Serve frontend file: {:?}", path);

    // strip leading / from the path
    let path = path.strip_prefix('/').unwrap_or(path);

    serve_file(path)
        .or_else(|| serve_file("index.html"))
        .unwrap_or_else(|| StatusCode::NOT_FOUND.into_response())
}

fn serve_file(path: impl AsRef<Path>) -> Option<Response> {
    let file = FRONTEND.get_file(&path)?;

    let content_type = mime_guess::from_path(path)
        .first_raw()
        .map(HeaderValue::from_static)
        .unwrap_or_else(|| {
            HeaderValue::from_str(mime::APPLICATION_OCTET_STREAM.as_ref()).unwrap()
        });

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "public, max-age=604800, immutable")
        .body(Body::from(file.contents()))
        .ok()
}
