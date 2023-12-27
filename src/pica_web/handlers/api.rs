use std::cmp::Reverse;

use axum::extract::{Path, State};
use axum::Json;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use itertools::Itertools;
use serde::Serialize;

use crate::pica::{AlbumId, MediaId, MediaItem};
use crate::pica_web::AppState;
use crate::pica_web::handlers::WebError;

#[derive(Serialize)]
struct MediaItemView<'a> {
    id: MediaId,
    name: &'a str,
    timestamp: DateTime<Utc>,
    width: u32,
    height: u32,
}

impl<'a> From<&'a MediaItem> for MediaItemView<'a> {
    fn from(image: &'a MediaItem) -> Self {
        Self {
            id: image.id,
            name: &image.name,
            timestamp: image.info.timestamp,
            width: image.info.width,
            height: image.info.height,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AlbumView<'a> {
    id: AlbumId,
    name: &'a str,
    items: Vec<MediaItemView<'a>>,
    timestamp: DateTime<Utc>,
    parent: Option<AlbumId>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamView<'a> {
    items: Vec<MediaItemView<'a>>,
}

pub async fn handle_stream_get(state: State<AppState>) -> Result<Response, WebError> {
    let items = state.store.items().await;

    let items = items.iter()
        .sorted_unstable_by_key(|img| Reverse(img.info.timestamp))
        .take(10000)
        .map(MediaItemView::from)
        .collect_vec();

    let stream = StreamView { items };
    Ok(Json(stream).into_response())
}

pub async fn handle_album_children_get(Path(parent_id): Path<AlbumId>, state: State<AppState>) -> Result<Response, WebError> {
    let albums = state.store.album_children(Some(parent_id)).await?;

    let albums = albums.iter()
        .map(|album| {
            AlbumView {
                id: album.id,
                name: &album.name,
                timestamp: album.timestamp,
                parent: album.parent,
                items: vec![],
            }
        })
        .collect_vec();

    Ok(Json(albums).into_response())
}

pub async fn handle_album_get(Path(id): Path<AlbumId>, state: State<AppState>) -> Result<Response, WebError> {
    let (album, items) = state.store.album(id).await?;

    let album = AlbumView {
        id: album.id,
        name: &album.name,
        timestamp: album.timestamp,
        parent: album.parent,
        items: items.iter().map(MediaItemView::from).collect(),
    };

    Ok(Json(album).into_response())
}
