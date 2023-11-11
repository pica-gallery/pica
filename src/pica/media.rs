use std::path::PathBuf;

use anyhow::Result;

use crate::pica::MediaItem;
use crate::pica::scale::MediaScaler;

#[derive(Clone)]
pub struct MediaAccessor {
    cache: PathBuf,
    scaler: MediaScaler,
}

impl MediaAccessor {
    pub fn new(cache: impl Into<PathBuf>, scaler: MediaScaler) -> Self {
        Self { cache: cache.into(), scaler }
    }

    pub async fn get(&self, image: &MediaItem, size: u32) -> Result<PathBuf> {
        use tokio::fs;

        let fname = format!("{}.{}.avif", hex::encode(image.id.as_bytes()), size);

        let parent = self.cache.join(&fname[..3]);
        let path = parent.join(fname);

        if let Ok(true) = fs::try_exists(&path).await {
            return Ok(path);
        }

        let thumb = self.scaler.image(&image.path, size).await?;

        fs::create_dir_all(&parent).await?;
        fs::write(&path, &thumb.bytes).await?;

        Ok(path)
    }
}

