use std::cmp::Reverse;

use axum::extract::State;
use axum::Json;
use axum::response::IntoResponse;
use chrono::{DateTime, Utc};
use itertools::Itertools;
use serde::Serialize;

use crate::pica::{MediaId, MediaItem};
use crate::pica_web::AppState;

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
    name: &'a str,
    items: Vec<MediaItemView<'a>>,
    timestamp: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamView<'a> {
    items: Vec<MediaItemView<'a>>,
}

pub async fn handle_stream_get(state: State<AppState>) -> impl IntoResponse {
    let items = state.store.items().await;

    let items = items.iter()
        .sorted_unstable_by_key(|img| Reverse(img.info.timestamp))
        .take(10000)
        .map(MediaItemView::from)
        .collect_vec();

    let stream = StreamView { items };
    Json(stream).into_response()
}

