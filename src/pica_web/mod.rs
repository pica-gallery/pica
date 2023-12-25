use anyhow::Result;
use axum::Router;
use axum::routing::get;
use tower_http::compression::CompressionLayer;


use crate::pica::accessor::MediaAccessor;
use crate::pica::store::MediaStore;

mod handlers;

#[derive(Clone)]
pub struct AppState {
    pub store: MediaStore,
    pub accessor: MediaAccessor,
}

pub async fn serve(store: MediaStore, accessor: MediaAccessor) -> Result<()> {
    let state = AppState {
        store,
        accessor,
    };

    let app = Router::new()
        .route("/api/stream", get(handlers::api::handle_stream_get))
        .layer(CompressionLayer::new().gzip(true))
        .route("/media/thumb/:id/*path", get(handlers::media::handle_thumbnail))
        .route("/media/preview/sdr/:id/*path", get(handlers::media::handle_preview_sdr))
        .route("/media/preview/hdr/:id/*path", get(handlers::media::handle_preview_hdr))
        .route("/media/fullsize/:id/*path", get(handlers::media::handle_fullsize))
        .merge(handlers::frontend::router())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    axum::serve(listener, app).await?;

    Ok(())
}
