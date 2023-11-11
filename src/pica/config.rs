use std::fs::File;
use std::path::{Path, PathBuf};
use anyhow::Result;

use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PicaConfig {
    pub thumb_size: u32,
    pub preview_size: u32,

    pub cache: PathBuf,
    pub thumbs: PathBuf,

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

pub fn load(path: impl AsRef<Path>) -> Result<PicaConfig> {
    let fp = File::open(path)?;
    let config = serde_yaml::from_reader(fp)?;
    Ok(config)
}
