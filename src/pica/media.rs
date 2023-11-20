use std::path::PathBuf;

use anyhow::{Result};

use crate::pica::MediaItem;
use crate::pica::scale::MediaScaler;

#[derive(Clone)]
pub struct MediaAccessor {
    cache: PathBuf,
    scaler: MediaScaler,
    sizes: Sizes,
}

#[derive(Clone)]
pub struct Sizes {
    pub thumb: u32,
    pub preview: u32,
}

pub struct Media {
    // a thumbnail in thumbnail size
    pub thumb: PathBuf,

    // the sdr preview of the image, this one always exists
    pub preview_sdr: PathBuf,

    // hdr preview of the image. only available for hdr images
    pub preview_hdr: Option<PathBuf>,
}

impl MediaAccessor {
    pub fn new(cache: impl Into<PathBuf>, scaler: MediaScaler, sizes: Sizes) -> Self {
        Self { cache: cache.into(), scaler, sizes }
    }

    pub async fn get(&self, item: &MediaItem) -> Result<Media> {
        let thumb = self.get_sdr(item, self.sizes.thumb).await?;
        let preview_sdr = self.get_sdr(item, self.sizes.preview).await?;

        let preview_hdr = if item.hdr { Some(self.get_hdr(item, self.sizes.preview).await?) } else { None };

        Ok(Media { thumb, preview_sdr, preview_hdr })
    }

    async fn get_sdr(&self, image: &MediaItem, size: u32) -> Result<PathBuf> {
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

    async fn get_hdr(&self, _image: &MediaItem, _size: u32) -> Result<PathBuf> {
        anyhow::bail!("not implemented")
    }
}

