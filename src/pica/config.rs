use std::fs::File;
use std::num::{NonZeroU16, NonZeroU32, NonZeroU8};
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PicaConfig {
    pub thumb_size: u32,
    pub preview_size: u32,
    pub lazy_thumbs: bool,
    pub scan_interval_in_seconds: NonZeroU32,
    pub indexer_threads: NonZeroU8,
    pub http_address: String,

    // use image magick to generate thumbnails and preview images
    pub use_image_magick: bool,
    pub image_codec: ImageCodecConfig,
    pub max_memory_in_megabytes: NonZeroU32,

    // sqlite database url
    pub database: String,

    // Patterns to include. If not specified, everything will be included.
    pub sources: Vec<SourceConfig>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceConfig {
    /// The name of this media source
    pub name: String,
    pub path: PathBuf,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageCodecConfig {
    Avif,
    Jpeg,
}

pub fn load(path: impl AsRef<Path>) -> Result<PicaConfig> {
    let fp = File::open(path)?;
    let config = serde_yaml::from_reader(fp)?;
    Ok(config)
}
