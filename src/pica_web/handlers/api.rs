use std::cmp::Reverse;

use axum::extract::State;
use axum::Json;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use itertools::Itertools;
use serde::Serialize;

use crate::pica::{Album, AlbumId, by_directory, MediaId, MediaItem};
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
    relpath: Option<&'a std::path::Path>,
}

impl<'a, 'b: 'a> From<&'b Album<'a>> for AlbumView<'a> {
    fn from(value: &'b Album<'a>) -> Self {
        Self::from_album(value, usize::MAX)
    }
}

impl<'a> AlbumView<'a> {
    fn from_album<'b: 'a>(album: &'b Album<'a>, n: usize) -> AlbumView<'a> {
        Self {
            id: album.id,
            name: &album.name,
            items: album.items.iter().take(n).copied().map(MediaItemView::from).collect(),
            timestamp: album.timestamp,
            relpath: album.relpath.as_deref(),
        }
    }
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

pub async fn handle_albums_get(state: State<AppState>) -> Result<Response, WebError> {
    let images = state.store.items().await;
    let albums = by_directory(&images);

    let albums = albums
        .iter()
        .map(|al| AlbumView::from_album(al, 4))
        .collect_vec();

    Ok(Json(albums).into_response())
}
