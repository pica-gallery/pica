use std::fmt::{Debug, Display, Formatter};
use std::path::PathBuf;
use std::str::FromStr;

use anyhow::ensure;
use chrono::{DateTime, Utc};
use derive_more::{AsRef, From};
use serde_with::SerializeDisplay;

mod album;
pub mod index;

pub mod config;
pub mod scale;
pub mod accessor;
pub mod store;
pub mod db;
pub mod queue;
mod exif;

#[derive(Copy, Clone, Eq, PartialEq, Hash, From, AsRef)]
#[derive(SerializeDisplay)]
pub struct MediaId([u8; 8]);


/// A unique identifier of a media item.
/// A ImageId should be stable independently of the location of the media item in question.
impl MediaId {
    pub fn as_bytes(&self) -> &[u8] {
        &self.0[..]
    }
}

impl FromStr for MediaId {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        ensure!(s.len() == 16, "expected hex string of length 16, got {}", s.len());

        let mut bytes = [0; 8];
        hex::decode_to_slice(s, &mut bytes[..])?;

        Ok(bytes.into())
    }
}

impl Debug for MediaId {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "ImageId({})", self)
    }
}

impl Display for MediaId {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(&hex::encode(self.0))
    }
}

#[derive(Clone, Debug)]
pub enum MediaType {
    Image,
    Video,
}

impl MediaType {
    pub fn as_str(&self) -> &'static str {
        match self {
            MediaType::Image => "image",
            MediaType::Video => "video",
        }
    }
}

#[derive(Clone, Debug)]
pub struct MediaInfo {
    pub timestamp: DateTime<Utc>,
    pub width: u32,
    pub height: u32,
}

/// A [MediaItem] references a media file on the filesystem.
#[derive(Clone, Debug)]
pub struct MediaItem {
    pub id: MediaId,
    pub relpath: PathBuf,
    pub name: String,
    pub filesize: u64,
    pub typ: MediaType,
    pub info: MediaInfo,
    pub hdr: bool,
}

/// An [Album] can group multiple [MediaItem] under a common timestamp and name.
#[derive(Clone, Debug)]
pub struct Album {
    pub name: String,
    pub items: Vec<MediaItem>,
    pub timestamp: DateTime<Utc>,
}

/// Builds a list of album from the given media files.
pub fn albums(images: Vec<MediaItem>) -> Vec<Album> {
    album::by_directory(images)
}
