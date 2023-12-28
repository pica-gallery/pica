use std::fmt::{Debug, Display, Formatter};
use std::hash::{Hash, Hasher};
use std::marker::PhantomData;
use std::path::PathBuf;
use std::str::FromStr;

use anyhow::ensure;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_with::{DeserializeFromStr, SerializeDisplay};

mod album;
pub mod index;

pub mod config;
pub mod scale;
pub mod accessor;
pub mod store;
pub mod db;
pub mod queue;
mod exif;

 pub use album::by_directory;

#[derive(SerializeDisplay, DeserializeFromStr)]
pub struct Id<T> {
    _marker: PhantomData<fn(&T)>,
    value: [u8; 8],
}

/// A unique identifier of a media item.
/// A ImageId should be stable independently of the location of the media item in question.
impl<T> Id<T> {
    pub fn as_bytes(&self) -> &[u8] {
        &self.value[..]
    }
}

impl<T> Clone for Id<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> Copy for Id<T> {}

impl<T> Hash for Id<T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.value.hash(state)
    }
}

impl<T> PartialEq for Id<T> {
    fn eq(&self, other: &Self) -> bool {
        self.value == other.value
    }
}

impl<T> Eq for Id<T> {}

impl<T> From<[u8; 8]> for Id<T> {
    fn from(value: [u8; 8]) -> Self {
        Self { value, _marker: PhantomData }
    }
}

impl<T> FromStr for Id<T> {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        ensure!(s.len() == 16, "expected hex string of length 16, got {}", s.len());

        let mut bytes = [0; 8];
        hex::decode_to_slice(s, &mut bytes[..])?;

        Ok(bytes.into())
    }
}

impl<T> Debug for Id<T> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "Id({})", self)
    }
}

impl<T> Display for Id<T> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(&hex::encode(self.value))
    }
}

pub type MediaId = Id<MediaItem>;

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

pub type AlbumId = Id<Album<'static>>;

#[derive(Clone, Debug)]
pub struct AlbumInfo {
    pub id: AlbumId,
    pub name: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct Album<'a> {
    pub id: AlbumId,
    pub name: String,
    pub timestamp: DateTime<Utc>,

    // the album has a relpath if it is based on the file system
    pub relpath: Option<PathBuf>,

    // a copy of the media items in this album
    pub items: Vec<&'a MediaItem>,
}
