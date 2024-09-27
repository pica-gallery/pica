use std::ffi::OsStr;
use std::ops::DerefMut;
use std::os::unix::ffi::OsStrExt;
use std::path::PathBuf;

use anyhow::Result;
use chrono::Utc;
use sqlx::{Sqlite, Transaction};

use crate::pica::{MediaId, MediaInfo, MediaItem, SourceId};

#[derive(sqlx::FromRow)]
struct MediaRow {
    pub id: MediaId,
    pub source: String,
    pub relpath: Vec<u8>,
    pub bytesize: i64,
    pub width: u32,
    pub height: u32,
    pub timestamp: chrono::DateTime<Utc>,
    pub latitude: Option<f32>,
    pub longitude: Option<f32>,
}

/// Stores a scanned MediaItem into the database.
pub async fn store_media_item(tx: &mut Transaction<'_, Sqlite>, item: &MediaItem) -> Result<()> {
    sqlx::query("INSERT OR IGNORE INTO pica_media_cache (id, source, relpath, bytesize, width, height, timestamp, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(item.id)
        .bind(item.source.as_str())
        .bind(item.relpath.as_os_str().as_bytes())
        .bind(item.filesize as i64)
        .bind(item.info.width)
        .bind(item.info.height)
        .bind(item.info.timestamp)
        .bind(item.info.latitude)
        .bind(item.info.longitude)
        .execute(tx.deref_mut())
        .await?;

    Ok(())
}

impl TryFrom<MediaRow> for MediaItem {
    type Error = anyhow::Error;

    fn try_from(row: MediaRow) -> Result<Self> {
        let relpath = PathBuf::from(OsStr::from_bytes(&row.relpath));

        let info = MediaInfo {
            timestamp: row.timestamp,
            width: row.width,
            height: row.height,
            latitude: row.latitude,
            longitude: row.longitude,
        };

        let source = SourceId(row.source.into());
        MediaItem::from_media_info(row.id, source, relpath, row.bytesize as u64, info)
    }
}

pub async fn read_media_item(tx: &mut Transaction<'_, Sqlite>, id: MediaId) -> Result<Option<MediaItem>> {
    let row: Option<MediaRow> = sqlx::query_as("SELECT * FROM pica_media_cache WHERE id=?")
        .bind(id)
        .fetch_optional(tx.deref_mut())
        .await?;

    // get the single row if any
    let Some(row) = row else {
        return Ok(None);
    };

    Ok(Some(MediaItem::try_from(row)?))
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
