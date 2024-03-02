use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::{anyhow, Result};
use sqlx::SqlitePool;
use tokio::task::spawn_blocking;
use tracing::{debug_span, instrument, Instrument};

use crate::pica::scale::{Image, MediaScaler};
use crate::pica::{db, MediaId, MediaItem};

#[derive(Clone)]
pub struct MediaAccessor {
    storage: Storage,
    scaler: MediaScaler,
    sizes: Sizes,
    sources: HashMap<String, PathBuf>,
}

#[derive(Clone)]
pub struct Sizes {
    pub thumb: u32,
    pub preview: u32,
}

impl MediaAccessor {
    pub fn new(storage: Storage, scaler: MediaScaler, sizes: Sizes, sources: HashMap<String, PathBuf>) -> Self {
        Self {
            storage,
            scaler,
            sizes,
            sources,
        }
    }

    pub fn full(&self, item: &MediaItem) -> Result<PathBuf> {
        let root = self.sources
            .get(item.source.as_str())
            .ok_or_else(|| anyhow!("source {:?} not found", item.source))?;
        
        Ok(root.join(item.relpath.as_ref()))
    }

    pub async fn thumb(&self, item: &MediaItem) -> Result<Image> {
        self.scaled(item, self.sizes.thumb)
            .instrument(debug_span!("scale", size = self.sizes.thumb))
            .await
    }

    pub async fn preview(&self, item: &MediaItem) -> Result<Image> {
        self.scaled(item, self.sizes.preview)
            .instrument(debug_span!("scale", size = self.sizes.preview))
            .await
    }

    #[instrument(skip_all, fields(? media.relpath, size))]
    async fn scaled(&self, media: &MediaItem, size: u32) -> Result<Image> {
        // check if the thumbnail is already in the database
        if let Some(image) = self.storage.load(media.id, size).await? {
            return Ok(image);
        }

        let path = self.full(media)?;

        // extract an image we can process from the media file.
        let path = spawn_blocking(|| pica_image::get(path)).await??;

        let image = self.scaler.scaled(path, size).await?;

        // save it for next time
        self.storage.store(media.id, size, &image).await?;

        Ok(image)
    }
}

#[derive(Clone)]
pub struct Storage {
    db: SqlitePool,
}

impl Storage {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    #[instrument(skip_all, fields(? id, size))]
    pub async fn store(&self, id: MediaId, size: u32, image: &Image) -> Result<()> {
        let mut tx = self.db.begin().await?;
        db::image::store(&mut tx, id, size, image).await?;
        tx.commit().await?;

        Ok(())
    }

    #[instrument(skip_all, fields(? id, size))]
    pub async fn load(&self, id: MediaId, size: u32) -> Result<Option<Image>> {
        let mut tx = self.db.begin().await?;
        db::image::load(&mut tx, id, size).await
    }
}
