use anyhow::Result;
use axum::routing::{get, post};
use axum::Router;
use axum_login::tower_sessions::cookie::time::Duration;
use axum_login::tower_sessions::{ExpiredDeletion, Expiry, SessionManagerLayer};
use axum_login::{login_required, AuthManagerLayerBuilder};
use sqlx::SqlitePool;
use std::fmt::Display;
use std::sync::Arc;
use tokio::net::ToSocketAddrs;
use tokio::signal;
use tokio::task::AbortHandle;
use tower_http::compression::CompressionLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tower_http::CompressionLevel;
use tower_sessions_sqlx_store::SqliteStore;
use tracing::{info, Level};

use crate::pica::accessor::MediaAccessor;
use crate::pica::store::MediaStore;

mod handlers;
mod auth;
mod streamzip;

use crate::pica::config::SourceConfig;
use crate::pica_web::handlers::media::ScaleQueue;
pub use auth::User;

pub struct Options<A> {
    pub store: MediaStore,
    pub accessor: MediaAccessor,
    pub sources: Vec<SourceConfig>,
    pub addr: A,
    pub db: SqlitePool,
    pub users: Vec<User>,
}

#[derive(Clone)]
pub struct AppState {
    pub store: MediaStore,
    pub accessor: MediaAccessor,
    pub sources: Vec<SourceConfig>,
    pub scale_queue: Arc<ScaleQueue>,
}

pub async fn serve<A>(opts: Options<A>) -> Result<()>
where
    A: ToSocketAddrs + Display,
{
    let scale_queue = Arc::new(ScaleQueue::new(opts.accessor.clone()));

    for _idx in 0..8 {
        let queue = scale_queue.clone();
        tokio::spawn(async move { queue.work().await });
    }

    let state = AppState {
        store: opts.store,
        accessor: opts.accessor,
        sources: opts.sources,
        scale_queue,
    };

    info!("Create session store in database");
    let session_store = SqliteStore::new(opts.db);
    session_store.migrate().await?;

    // cleanup expired sessions from time to time
    let delete_task = tokio::task::spawn(
        session_store
            .clone()
            .continuously_delete_expired(std::time::Duration::from_secs(60))
    );

    let session_layer = SessionManagerLayer::new(session_store)
        .with_expiry(Expiry::OnInactivity(Duration::weeks(4)));

    let auth_backend = auth::Backend::from(opts.users);

    let auth_layer = AuthManagerLayerBuilder::new(auth_backend, session_layer).build();

    let app = Router::new()
        .route("/api/stream", get(handlers::api::handle_stream_get))
        .route("/api/albums", get(handlers::api::handle_albums_get))
        .route("/api/albums/full", get(handlers::api::handle_albums_get_full))
        .route("/api/albums/:id", get(handlers::api::handle_album_get))
        .route("/api/media/:id/exif", get(handlers::api::handle_exif_get))
        .layer(CompressionLayer::new().gzip(true).quality(CompressionLevel::Fastest))
        .route("/media/thumb/:id/*path", get(handlers::media::handle_thumbnail))
        .route("/media/preview/sdr/:id/*path", get(handlers::media::handle_preview_sdr))
        .route("/media/preview/hdr/:id/*path", get(handlers::media::handle_preview_hdr))
        .route("/media/fullsize/:id/*path", get(handlers::media::handle_fullsize))
        .route("/media/multi", get(handlers::media::handle_download_zip))
        .route("/api/auth/touch", post(handlers::auth::touch))
        .route_layer(login_required!(auth::Backend))
        .route("/api/auth/login", post(handlers::auth::login))
        .layer(auth_layer)
        .nest_service("/", handlers::frontend::frontend())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .with_state(state);

    info!("Starting webserver on http://{}/", opts.addr);
    let listener = tokio::net::TcpListener::bind(opts.addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(delete_task.abort_handle()))
        .await?;

    Ok(())
}

async fn shutdown_signal(deletion_task_abort_handle: AbortHandle) {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => { deletion_task_abort_handle.abort() },
        _ = terminate => { deletion_task_abort_handle.abort() },
    }
}
