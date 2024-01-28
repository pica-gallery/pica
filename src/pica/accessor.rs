use std::path::PathBuf;

use anyhow::Result;
use sqlx::SqlitePool;
use tracing::{debug_span, Instrument, instrument};

use crate::pica;
use crate::pica::{db, MediaId, MediaItem};
use crate::pica::scale::{Image, MediaScaler};

#[derive(Clone)]
pub struct MediaAccessor {
    storage: Storage,
    scaler: MediaScaler,
    root: PathBuf,
    sizes: Sizes,
}

#[derive(Clone)]
pub struct Sizes {
    pub thumb: u32,
    pub preview: u32,
}

impl MediaAccessor {
    pub fn new(storage: Storage, scaler: MediaScaler, sizes: Sizes, root: impl Into<PathBuf>) -> Self {
        Self { storage, scaler, sizes, root: root.into() }
    }

    pub fn full(&self, item: &MediaItem) -> PathBuf {
        self.root.join(item.relpath.as_ref())
    }

    pub async fn thumb(&self, item: &MediaItem) -> Result<Image> {
        self.scaled(item, self.sizes.thumb)
            .instrument(debug_span!("scale", size=self.sizes.thumb))
            .await
    }

    pub async fn preview(&self, item: &MediaItem) -> Result<Image> {
        self.scaled(item, self.sizes.preview)
            .instrument(debug_span!("scale", size=self.sizes.preview))
            .await
    }

    #[instrument(skip_all, fields(?media.relpath, size))]
    async fn scaled(&self, media: &MediaItem, size: u32) -> Result<Image> {
        // check if the thumbnail is already in the database
        if let Some(image) = self.storage.load(media.id, size).await? {
            return Ok(image);
        }

        let path = self.root.join(media.relpath.as_ref());

        // extract an image we can process from the media file.
        let path = pica::image::get(path).await?;

        let image = self.scaler.image(path, size).await?;

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

    #[instrument(skip_all, fields(?id, size))]
    pub async fn store(&self, id: MediaId, size: u32, image: &Image) -> Result<()> {
        let mut tx = self.db.begin().await?;
        db::image::store(&mut tx, id, size, image).await?;
        tx.commit().await?;

        Ok(())
    }

    #[instrument(skip_all, fields(?id, size))]
    pub async fn load(&self, id: MediaId, size: u32) -> Result<Option<Image>> {
        let mut tx = self.db.begin().await?;
        db::image::load(&mut tx, id, size).await
    }
}
