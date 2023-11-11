use anyhow::Result;
use axum::Router;
use axum::routing::get;
use tower_http::services::{ServeDir, ServeFile};

use crate::pica::media::MediaAccessor;
use crate::pica::MediaStore;

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
        .route("/media/thumb/:id/*path", get(handlers::media::handle_thumbnail))
        .route("/media/preview/:id/*path", get(handlers::media::handle_preview))
        .route("/media/fullsize/:id/*path", get(handlers::media::handle_fullsize))
        .nest_service("/", ServeDir::new("./frontend/pica/dist/pica/"))
        .fallback_service(ServeFile::new("./frontend/pica/dist/pica/index.html"))
        .with_state(state);

    axum::Server::bind(&"0.0.0.0:3000".parse()?)
        .serve(app.into_make_service())
        .await?;

    Ok(())
}
