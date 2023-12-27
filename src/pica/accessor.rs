use std::path::PathBuf;

use anyhow::Result;
use itertools::Itertools;
use sqlx::SqlitePool;
use tracing::{debug_span, Instrument};

use crate::pica::{db, MediaItem};
use crate::pica::scale::MediaScaler;

#[derive(Clone)]
pub struct MediaAccessor {
    cache: SqlitePool,
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
    pub fn new(cache: SqlitePool, scaler: MediaScaler, sizes: Sizes, root: impl Into<PathBuf>) -> Self {
        Self { cache, scaler, sizes, root: root.into() }
    }

    pub fn full(&self, item: &MediaItem) -> PathBuf {
        self.root.join(&item.relpath)
    }

    pub async fn thumb(&self, item: &MediaItem) -> Result<Vec<u8>> {
        self.get_sdr(item, self.sizes.thumb)
            .instrument(debug_span!("scale", size=self.sizes.thumb))
            .await
    }

    pub async fn preview(&self, item: &MediaItem) -> Result<Vec<u8>> {
        self.get_sdr(item, self.sizes.preview)
            .instrument(debug_span!("scale", size=self.sizes.preview))
            .await
    }

    async fn get_sdr(&self, image: &MediaItem, size: u32) -> Result<Vec<u8>> {
        // check if the thumbnail is already in the database
        {
            let mut tx = self.cache.begin().await?;
            if let Some(image) = db::load_image(&mut tx, image.id, size).await? {
                return Ok(image);
            }
        }

        let path = self.root.join(&image.relpath);
        let thumb = self.scaler.image(path, size).await?;

        let mut tx = self.cache.begin().await?;
        db::store_image(&mut tx, image.id, size, &thumb.typ, &thumb.bytes).await?;
        tx.commit().await?;

        Ok(thumb.bytes)
    }

    async fn get_hdr(&self, _image: &MediaItem, _size: u32) -> Result<PathBuf> {
        anyhow::bail!("not implemented")
    }
}

