use std::ffi::OsStr;
use std::ops::DerefMut;
use std::os::unix::ffi::OsStrExt;
use std::path::PathBuf;

use anyhow::Result;
use chrono::Utc;
use sqlx::{FromRow, Sqlite, Transaction};

use crate::pica::{MediaId, MediaInfo, MediaItem, MediaType};

mod types;
pub mod image;

#[derive(sqlx::FromRow)]
struct MediaRow {
    pub id: MediaId,
    pub timestamp: chrono::DateTime<Utc>,
    #[sqlx(rename = "type")]
    pub typ: MediaType,
    pub bytesize: i64,
    pub width: u32,
    pub height: u32,
    pub relpath: Vec<u8>,
    pub name: String,
}

/// Stores a scanned MediaItem into the database.
pub async fn store_media_item(tx: &mut Transaction<'_, Sqlite>, item: &MediaItem) -> Result<()> {
    sqlx::query("INSERT OR IGNORE INTO pica_media (id, timestamp, type, bytesize, width, height, relpath, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(item.id)
        .bind(item.info.timestamp)
        .bind(item.typ.as_str())
        .bind(item.filesize as i64)
        .bind(item.info.width)
        .bind(item.info.height)
        .bind(item.relpath.as_os_str().as_bytes())
        .bind(&item.name)
        .execute(tx.deref_mut())
        .await?;

    Ok(())
}

impl From<MediaRow> for MediaItem {
    fn from(row: MediaRow) -> Self {
        let relpath = PathBuf::from(OsStr::from_bytes(&row.relpath));

        // convert to media item
        Self {
            id: row.id,
            relpath,
            name: row.name,
            filesize: row.bytesize as u64,
            typ: row.typ,
            info: MediaInfo {
                timestamp: row.timestamp,
                width: row.width,
                height: row.height,
            },
            hdr: false,
        }
    }
}

pub async fn read_media_item(tx: &mut Transaction<'_, Sqlite>, id: MediaId) -> Result<Option<MediaItem>> {
    let row: Option<MediaRow> = sqlx::query_as("SELECT * FROM pica_media WHERE id=?")
        .bind(id)
        .fetch_optional(tx.deref_mut())
        .await?;

    // get the single row if any
    let Some(row) = row else { return Ok(None); };
    Ok(Some(row.into()))
}

pub async fn media_mark_as_error(tx: &mut Transaction<'_, Sqlite>, id: MediaId, error: &str) -> Result<()> {
    sqlx::query("INSERT OR REPLACE INTO pica_media_error (id, error) VALUES (?, ?)")
        .bind(id)
        .bind(error)
        .execute(tx.deref_mut())
        .await?;

    Ok(())
}

pub async fn media_get_error(tx: &mut Transaction<'_, Sqlite>, id: MediaId) -> Result<Option<String>> {
    let has_error = sqlx::query_scalar("SELECT error FROM pica_media_error WHERE id=?")
        .bind(id)
        .fetch_optional(tx.deref_mut())
        .await?;

    Ok(has_error)
}

/*
#[derive(FromRow)]
struct AlbumRow {
    pub id: AlbumId,
    pub name: String,
    pub timestamp: DateTime<Utc>,
    pub relpath: Option<Vec<u8>>,
    pub parent: Option<AlbumId>,
}

impl From<AlbumRow> for AlbumInfo {
    fn from(value: AlbumRow) -> Self {
        Self {
            id: value.id,
            name: value.name,
            timestamp: value.timestamp,
            parent: value.parent,
            relpath: value.relpath.map(|rp| PathBuf::from(OsStr::from_bytes(&rp))),
        }
    }
}

pub struct CreateAblum<'a> {
    pub name: &'a str,
    pub timestamp: DateTime<Utc>,
    pub relpath: Option<&'a Path>,
    pub parent: Option<AlbumId>,
}

pub async fn create_album(tx: &mut Transaction<'_, Sqlite>, album: CreateAblum<'_>) -> Result<Album> {
    let album: AlbumRow = sqlx::query_as("INSERT INTO pica_album (name, timestamp, relpath, parent) VALUES (?, ?, ?, ?) RETURNING *")
        .bind(album.name)
        .bind(album.timestamp)
        .bind(album.relpath.as_ref().map(|p| p.as_os_str().as_bytes()))
        .bind(album.parent)
        .fetch_one(tx.deref_mut())
        .await?;

    Ok(album.into())
}

pub async fn album_add_media(tx: &mut Transaction<'_, Sqlite>, album: AlbumId, media: MediaId) -> Result<()> {
    sqlx::query("INSERT OR IGNORE INTO pica_album_member (album, media) VALUES (?, ?)")
        .bind(album)
        .bind(media)
        .execute(tx.deref_mut())
        .await?;

    Ok(())
}

pub async fn load_album_by_id(tx: &mut Transaction<'_, Sqlite>, id: AlbumId) -> Result<Album> {
    let album: AlbumRow = sqlx::query_as("SELECT * FROM pica_album WHERE id=?")
        .bind(id)
        .fetch_one(tx.deref_mut())
        .await?;

    Ok(Album::from(album))
}

pub async fn load_album_by_relpath(tx: &mut Transaction<'_, Sqlite>, relpath: impl AsRef<Path>) -> Result<Option<Album>> {
    let album: Option<AlbumRow> = sqlx::query_as("SELECT * FROM pica_album WHERE relpath=?")
        .bind(relpath.as_ref().as_os_str().as_bytes())
        .fetch_optional(tx.deref_mut())
        .await?;

    Ok(album.map(Album::from))
}

pub async fn load_albums_by_parent(tx: &mut Transaction<'_, Sqlite>, parent: Option<AlbumId>) -> Result<Vec<Album>> {
    let albums: Vec<AlbumRow> = sqlx::query_as("SELECT * FROM pica_album WHERE parent=?")
        .bind(parent)
        .fetch_all(tx.deref_mut())
        .await?;

    Ok(albums.into_iter().map(Album::from).collect())
}

pub async fn load_album_media(tx: &mut Transaction<'_, Sqlite>, album: AlbumId) -> Result<Vec<MediaItem>> {
    let items: Vec<MediaRow> = sqlx::query_as("SELECT * FROM pica_media WHERE id IN (SELECT media FROM pica_album_member WHERE album=?)")
        .bind(album)
        .fetch_all(tx.deref_mut())
        .await?;

    Ok(items.into_iter().map(MediaItem::from).collect())
}
*/
