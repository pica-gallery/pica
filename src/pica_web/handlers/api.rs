use std::cmp::Reverse;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::anyhow;
use arcstr::ArcStr;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use itertools::Itertools;
use serde::Serialize;
use tracing::instrument;

use pica_image::exif::parse_exif_generic;

use crate::pica::{Album, AlbumId, by_directory, Location, MediaId, MediaItem};
use crate::pica_web::{AppState, User};
use crate::pica_web::handlers::WebError;

#[derive(Serialize)]
struct MediaItemView {
    id: MediaId,
    name: ArcStr,
    timestamp: DateTime<Utc>,
    width: u32,
    height: u32,

    #[serde(skip_serializing_if = "Option::is_none")]
    location: Option<LocationView>,
}

#[derive(Serialize)]
struct LocationView {
    latitude: f32,
    longitude: f32,
    city: Option<ArcStr>,
    country: Option<ArcStr>,
}

impl From<Location> for LocationView {
    fn from(value: Location) -> Self {
        Self {
            latitude: value.latitude,
            longitude: value.longitude,
            city: value.city.as_ref().map(|city| city.name.clone()),
            country: value.city.as_ref().map(|city| city.country.clone()),
        }
    }
}

impl From<MediaItem> for MediaItemView {
    fn from(media: MediaItem) -> Self {
        Self {
            id: media.id,
            name: media.name,
            timestamp: media.info.timestamp,
            width: media.info.width,
            height: media.info.height,
            location: media.location.map(LocationView::from),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExifView {
    item: MediaItemView,
    exif: Option<HashMap<String, String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AlbumView {
    id: AlbumId,
    name: ArcStr,
    items: Vec<MediaItemView>,
    timestamp: DateTime<Utc>,
    relpath: Option<Arc<PathBuf>>,
    cover: MediaItemView,
}

impl From<Album> for AlbumView {
    fn from(value: Album) -> Self {
        Self::from_album(value, usize::MAX)
    }
}

impl AlbumView {
    fn from_album(album: Album, n: usize) -> AlbumView {
        Self {
            id: album.info.id,
            name: album.info.name,
            timestamp: album.info.timestamp,
            items: album.items.into_iter().take(n).map(MediaItemView::from).collect(),
            relpath: album.relpath,
            cover: album.cover.into(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamView {
    items: Vec<MediaItemView>,
}

#[instrument(skip_all)]
pub async fn handle_stream_get(user: User, State(state): State<AppState>) -> Result<Response, WebError> {
    let mut items = state.store.items().await;

    let has_access = user_has_access_pred(&state, &user);

    items.sort_unstable_by_key(|img| Reverse(img.info.timestamp));

    let items = items.into_iter()
        .filter(has_access)
        .take(10000)
        .map(MediaItemView::from)
        .collect_vec();

    encode_json(StreamView { items })
}

fn user_has_access_pred<'a>(state: &'a AppState, user: &'a User) -> impl Fn(&MediaItem) -> bool + 'a {
    // find all sources the customer is allowed to access
    let sources: Vec<_> = state.sources.iter()
        .filter(|s| s.access.contains(&user.name))
        .map(|s| s.name.as_str())
        .collect();

    move |item: &MediaItem| sources.contains(&item.source.as_str())
}

#[instrument(skip_all)]
pub async fn handle_albums_get(user: User, State(state): State<AppState>) -> Result<Response, WebError> {
    albums_get(state, user, 0).await
}

#[instrument(skip_all)]
pub async fn handle_albums_get_full(user: User, State(state): State<AppState>) -> Result<Response, WebError> {
    albums_get(state, user, usize::MAX).await
}

#[instrument(skip_all)]
async fn albums_get(state: AppState, user: User, n: usize) -> Result<Response, WebError> {
    let images = state.store.items().await
        .into_iter()
        .filter(user_has_access_pred(&state, &user))
        .collect_vec();

    let albums = by_directory(images);

    let albums = albums.into_iter().map(|al| AlbumView::from_album(al, n)).collect_vec();

    encode_json(albums)
}

#[instrument(skip_all, fields(? id))]
pub async fn handle_album_get(Path(id): Path<AlbumId>, user: User, State(state): State<AppState>) -> Result<Response, WebError> {
    let images = state.store.items().await
        .into_iter()
        .filter(user_has_access_pred(&state, &user))
        .collect_vec();

    let albums = by_directory(images);

    let album = albums
        .into_iter()
        .find(|a| a.info.id == id)
        .ok_or_else(|| anyhow!("no album found for id {:?}", id))?;

    encode_json(AlbumView::from(album))
}

#[instrument(skip_all, fields(? id))]
pub async fn handle_exif_get(Path(id): Path<MediaId>, user: User, State(state): State<AppState>) -> Result<Response, WebError> {
    let Some(media) = state.store.get(id).await else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };

    if !user_has_access_pred(&state, &user)(&media) {
        return Ok(StatusCode::FORBIDDEN.into_response());
    }

    let path = state.accessor.full(&media)?;
    let exif = parse_exif_generic(path)?;
    let result = ExifView {
        item: media.into(),
        exif: exif.map(|raw| raw.0),
    };

    encode_json(result)
}

#[instrument(skip_all)]
fn encode_json<T: Serialize>(value: T) -> Result<Response, WebError> {
    Ok(Json(value).into_response())
}
