use anyhow::Result;
use sqlx::SqlitePool;

use crate::pica::{db, MediaId, MediaItem};

#[derive(Clone)]
pub struct MediaStore {
    db: SqlitePool,
}

impl MediaStore {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    pub async fn get(&self, id: MediaId) -> Result<Option<MediaItem>> {
        let mut tx = self.db.begin().await?;
        db::read_media_item(&mut tx, id).await
    }

    pub async fn items(&self) -> Result<Vec<MediaItem>> {
        let mut tx = self.db.begin().await?;
        db::read_media_items(&mut tx).await
    }
}

