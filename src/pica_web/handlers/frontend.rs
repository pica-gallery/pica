use axum::handler::Handler;
use axum::http::header::CACHE_CONTROL;
use axum::http::HeaderValue;
use axum::routing::{get_service, MethodRouter};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;

pub fn frontend(path: impl AsRef<std::path::Path>) -> MethodRouter {
    let add_cache_control = SetResponseHeaderLayer::overriding(
        CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=604800, immutable"),
    );

    let index = ServeFile::new(path.as_ref().join("index.html")).precompressed_gzip();

    let serve = ServeDir::new(path.as_ref())
        .precompressed_gzip()
        .not_found_service(index);

    get_service(serve).layer(add_cache_control)
}
