use std::cmp::Reverse;
use std::path::PathBuf;

use anyhow::anyhow;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use itertools::Itertools;
use serde::Serialize;

use crate::pica::{Album, AlbumId, by_directory, Location, MediaId, MediaItem};
use crate::pica::exif::{GenericExif, parse_exif_generic};
use crate::pica_web::AppState;
use crate::pica_web::handlers::WebError;

#[derive(Serialize)]
struct MediaItemView {
    id: MediaId,
    name: String,
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
    city: Option<String>,
    country: Option<String>,
}

impl From<Location> for LocationView {
    fn from(value: Location) -> Self {
        let mut city = value.city;

        Self {
            latitude: value.latitude,
            longitude: value.longitude,
            city: city.as_mut().map(|city| std::mem::take(&mut city.name)),
            country: city.as_mut().map(|city| std::mem::take(&mut city.country)),
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
    exif: Option<GenericExif>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AlbumView {
    id: AlbumId,
    name: String,
    items: Vec<MediaItemView>,
    timestamp: DateTime<Utc>,
    relpath: Option<PathBuf>,
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
            id: album.id,
            name: album.name,
            items: album.items.into_iter().take(n).map(MediaItemView::from).collect(),
            timestamp: album.timestamp,
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

pub async fn handle_stream_get(state: State<AppState>) -> Result<Response, WebError> {
    let items = state.store.items().await;

    let items = items.into_iter()
        .sorted_unstable_by_key(|img| Reverse(img.info.timestamp))
        .take(10000)
        .map(MediaItemView::from)
        .collect_vec();

    let stream = StreamView { items };
    Ok(Json(stream).into_response())
}


pub async fn handle_albums_get(state: State<AppState>) -> Result<Response, WebError> {
    albums_get(state, 0).await
}

pub async fn handle_albums_get_full(state: State<AppState>) -> Result<Response, WebError> {
    albums_get(state, usize::MAX).await
}

async fn albums_get(state: State<AppState>, n: usize) -> Result<Response, WebError> {
    let images = state.store.items().await;
    let albums = by_directory(images);

    let albums = albums
        .into_iter()
        .map(|al| AlbumView::from_album(al, n))
        .collect_vec();

    Ok(Json(albums).into_response())
}

pub async fn handle_album_get(Path(id): Path<AlbumId>, state: State<AppState>) -> Result<Response, WebError> {
    let images = state.store.items().await;
    let albums = by_directory(images);

    let album = albums.into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| anyhow!("no album found for id {:?}", id))?;

    let view = AlbumView::from(album);
    Ok(Json(view).into_response())
}

pub async fn handle_exif_get(Path(id): Path<MediaId>, state: State<AppState>) -> Result<Response, WebError> {
    let Some(media) = state.store.get(id).await else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };

    let exif = parse_exif_generic(state.accessor.full(&media))?;
    let result = ExifView { item: media.into(), exif };

    Ok(Json(result).into_response())
}
