use std::ffi::OsStr;
use std::ops::DerefMut;
use std::os::unix::ffi::OsStrExt;
use std::path::PathBuf;

use anyhow::Result;
use chrono::Utc;
use itertools::Itertools;
use sqlx::{Sqlite, Transaction};
use sqlx::database::{HasArguments, HasValueRef};
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;

use crate::pica::{MediaId, MediaInfo, MediaItem, MediaType};

impl sqlx::Type<Sqlite> for MediaType {
    fn type_info() -> <Sqlite as sqlx::Database>::TypeInfo {
        str::type_info()
    }
}

impl<'q> sqlx::Encode<'q, Sqlite> for MediaType {
    fn encode_by_ref(&self, buf: &mut <Sqlite as HasArguments<'q>>::ArgumentBuffer) -> IsNull {
        self.as_str().encode_by_ref(buf)
    }
}

impl<'r> sqlx::Decode<'r, Sqlite> for MediaType {
    fn decode(value: <Sqlite as HasValueRef<'r>>::ValueRef) -> Result<Self, BoxDynError> {
        match String::decode(value)?.as_str() {
            "image" => Ok(MediaType::Image),
            "video" => Ok(MediaType::Video),
            value => Err(format!("not valid: {:?}", value).into())
        }
    }
}

impl sqlx::Type<Sqlite> for MediaId {
    fn type_info() -> <Sqlite as sqlx::Database>::TypeInfo {
        i64::type_info()
    }

    fn compatible(ty: &<Sqlite as sqlx::Database>::TypeInfo) -> bool {
        i64::compatible(ty)
    }
}

impl<'q> sqlx::Encode<'q, Sqlite> for MediaId {
    fn encode_by_ref(&self, buf: &mut <Sqlite as HasArguments<'q>>::ArgumentBuffer) -> IsNull {
        let value = i64::from_be_bytes(self.0);
        value.encode(buf)
    }
}

impl<'r> sqlx::Decode<'r, Sqlite> for MediaId {
    fn decode(value: <Sqlite as HasValueRef<'r>>::ValueRef) -> Result<Self, BoxDynError> {
        let value = i64::decode(value)?;
        Ok(MediaId::from(value.to_be_bytes()))
    }
}

struct Filesize(pub u64);

impl sqlx::Type<Sqlite> for Filesize {
    fn type_info() -> <Sqlite as sqlx::Database>::TypeInfo {
        i64::type_info()
    }

    fn compatible(ty: &<Sqlite as sqlx::Database>::TypeInfo) -> bool {
        i64::compatible(ty)
    }
}

impl<'r> sqlx::Decode<'r, Sqlite> for Filesize {
    fn decode(value: <Sqlite as HasValueRef<'r>>::ValueRef) -> Result<Self, BoxDynError> {
        let value = i64::decode(value)?;
        Ok(Filesize(value as u64))
    }
}

#[derive(sqlx::FromRow)]
struct MediaRow {
    pub id: MediaId,
    pub timestamp: chrono::DateTime<Utc>,
    #[sqlx(rename = "type")]
    pub typ: MediaType,
    pub bytesize: Filesize,
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
        .bind(item.path.as_os_str().as_bytes())
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
            path: relpath,
            name: row.name,
            filesize: row.bytesize.0,
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

pub async fn read_media_items(tx: &mut Transaction<'_, Sqlite>) -> Result<Vec<MediaItem>> {
    let rows: Vec<MediaRow> = sqlx::query_as("SELECT * FROM pica_media ORDER BY timestamp DESC")
        .fetch_all(tx.deref_mut())
        .await?;

    // convert to vec
    Ok(rows.into_iter().map(MediaItem::from).collect())
}

pub async fn list_media_ids(tx: &mut Transaction<'_, Sqlite>) -> Result<Vec<MediaId>> {
    let ids: Vec<i64> = sqlx::query_scalar("SELECT id FROM pica_media")
        .fetch_all(tx.deref_mut())
        .await?;

    let ids = ids.into_iter()
        .map(|id| MediaId::from(id.to_be_bytes()))
        .collect_vec();

    Ok(ids)
}
