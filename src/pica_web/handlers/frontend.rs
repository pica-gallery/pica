use axum::http::header::CACHE_CONTROL;
use axum::http::HeaderValue;
use axum::Router;
use axum::routing::{get_service, MethodRouter};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;

pub fn router<S: 'static + Clone + Send + Sync>() -> Router<S> {
    Router::<S>::new()
        .nest_service("/", serve_static_files_service("./frontend/dist/pica/browser"))
        .fallback_service(serve_static_file_service("./frontend/dist/pica/browser/index.html"))
}

fn serve_static_file_service(path: impl AsRef<std::path::Path>) -> MethodRouter {
    let add_cache_control = SetResponseHeaderLayer::overriding(
        CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=300"),
    );

    get_service(ServeFile::new(path)
        .precompressed_gzip())
        .layer(add_cache_control)
}

fn serve_static_files_service(path: impl AsRef<std::path::Path>) -> MethodRouter {
    let add_cache_control = SetResponseHeaderLayer::overriding(
        CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=604800, immutable"),
    );

    get_service(ServeDir::new(path)
        .precompressed_gzip())
        .layer(add_cache_control)
}
