use anyhow::Result;
use axum::Router;
use axum::routing::get;
use tokio::net::ToSocketAddrs;
use tower_http::compression::CompressionLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::pica::accessor::MediaAccessor;
use crate::pica::store::MediaStore;

mod handlers;

#[derive(Clone)]
pub struct AppState {
    pub store: MediaStore,
    pub accessor: MediaAccessor,
}

pub async fn serve(store: MediaStore, accessor: MediaAccessor, addr: impl ToSocketAddrs) -> Result<()> {
    let state = AppState {
        store,
        accessor,
    };

    let app = Router::new()
        .route("/api/stream", get(handlers::api::handle_stream_get))
        .route("/api/albums", get(handlers::api::handle_albums_get))
        .route("/api/albums/:id", get(handlers::api::handle_album_get))
        .route("/api/media/:id/exif", get(handlers::api::handle_exif_get))
        .layer(CompressionLayer::new().gzip(true))
        .route("/media/thumb/:id/*path", get(handlers::media::handle_thumbnail))
        .route("/media/preview/sdr/:id/*path", get(handlers::media::handle_preview_sdr))
        .route("/media/preview/hdr/:id/*path", get(handlers::media::handle_preview_hdr))
        .route("/media/fullsize/:id/*path", get(handlers::media::handle_fullsize))
        .nest_service("/", handlers::frontend::frontend())
        .layer(TraceLayer::new_for_http()
            .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
            .on_response(DefaultOnResponse::new().level(Level::INFO))
        )
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
