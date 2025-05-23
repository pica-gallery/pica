use std::fs::File;
use std::num::{NonZeroU32, NonZeroU8};
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::de::Error;
use serde::{Deserialize, Deserializer};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PicaConfig {
    pub thumb_size: u32,
    pub preview_size: u32,
    pub lazy_thumbs: bool,
    pub scan_interval_in_seconds: NonZeroU32,
    pub indexer_threads: NonZeroU8,
    pub http_address: String,

    #[serde(rename = "allowAccessOverHTTP", default = "allow_access_over_http_default")]
    pub allow_access_over_http: bool,

    // use image magick to generate thumbnails and preview images
    pub use_image_magick: bool,
    pub image_codec: ImageCodecConfig,
    pub prefer_ultra_hdr: bool,

    // sqlite database url
    pub database: String,

    // Patterns to include. If not specified, everything will be included.
    pub sources: Vec<SourceConfig>,

    pub users: Vec<UserConfig>,

    pub album_config: AlbumConfig,

    #[serde(default)]
    pub otlp_endpoint: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceConfig {
    /// The name of this media source
    pub name: String,
    pub path: PathBuf,

    /// List of users that can access this source
    pub access: Vec<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserConfig {
    /// The login name of this user
    pub name: String,

    /// The password encrypted using htpasswd.
    /// For example: `htpasswd -n -B -C 7 ignored | cut -d: -f2-`
    pub passwd: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageCodecConfig {
    Avif,
    Jpeg,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct AlbumConfig {
    #[serde(deserialize_with = "deserialize_bytes_regex")]
    pub classify_as_album: regex::bytes::Regex,

    #[serde(deserialize_with = "deserialize_regex_opt")]
    pub strip_title: Option<regex::Regex>,
}

pub fn load(path: impl AsRef<Path>) -> Result<PicaConfig> {
    let fp = File::open(path)?;
    let config = serde_yaml::from_reader(fp)?;
    Ok(config)
}

fn allow_access_over_http_default() -> bool {
    true
}

fn deserialize_bytes_regex<'de, D: Deserializer<'de>>(deserialize: D) -> Result<regex::bytes::Regex, D::Error> {
    let pattern = String::deserialize(deserialize)?;
    let regex = regex::bytes::Regex::new(&pattern).map_err(|err| {
        let text = format!("parse regex {:?}: {}", pattern, err);
        Error::custom(text)
    })?;

    Ok(regex)
}

fn deserialize_regex_opt<'de, D: Deserializer<'de>>(deserialize: D) -> Result<Option<regex::Regex>, D::Error> {
    let Some(pattern) = Option::<String>::deserialize(deserialize)? else {
        return Ok(None);
    };

    if pattern.is_empty() {
        // interpret empty string as no value too
        return Ok(None);
    }

    let regex = regex::Regex::new(&pattern).map_err(|err| {
        let text = format!("parse regex {:?}: {}", pattern, err);
        Error::custom(text)
    })?;

    Ok(Some(regex))
}
