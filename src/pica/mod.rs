use std::fmt::{Debug, Display, Formatter};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Arc;

use anyhow::{ensure, Result};
use chrono::{DateTime, Utc};
use derive_more::{AsRef, From};
use indicatif::ProgressIterator;
use itertools::Itertools;
use serde_with::SerializeDisplay;
use tokio::sync::RwLock;

use crate::pica::cache::Cache;

mod album;
mod index;

pub mod config;
pub mod cache;
pub mod scale;
pub mod media;


#[derive(Clone)]
pub struct MediaStore {
    items: Arc<RwLock<Vec<MediaItem>>>,
}

impl MediaStore {
    pub fn new(items: Vec<MediaItem>) -> Self {
        Self { items: Arc::new(items.into()) }
    }

    pub async fn get(&self, id: MediaId) -> Option<MediaItem> {
        let items = self.items.read().await;
        items.iter()
            .find(|item| item.id == id)
            .cloned()
    }

    pub async fn update(&self, new_items: Vec<MediaItem>) {
        let mut items = self.items.write().await;

        // replace previous items with the new ones
        *items = new_items
    }

    pub async fn items(&self) -> Vec<MediaItem> {
        let items = self.items.write().await;
        items.clone()
    }
}


#[derive(Copy, Clone, Eq, PartialEq, From, AsRef)]
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

/// A [MediaItem] references a media file on the filesystem.
#[derive(Clone, Debug)]
pub struct MediaItem {
    pub id: MediaId,
    pub path: PathBuf,
    pub name: String,
    pub filesize: u64,
    pub timestamp: DateTime<Utc>,
    pub typ: MediaType,
}

/// An [Album] can group multiple [MediaItem] under a common timestamp and name.
#[derive(Clone, Debug)]
pub struct Album {
    pub name: String,
    pub items: Vec<MediaItem>,
    pub timestamp: DateTime<Utc>,
}

/// Lists all media files in the given directory.
pub fn list(cache: &Cache, root: impl AsRef<Path>) -> Result<Vec<MediaItem>> {
    let indexer = index::IndexContext::new(cache, root.as_ref().to_path_buf());

    // quickly scan all files
    let files: Vec<_> = indexer.scan().try_collect()?;

    // and create media items from it
    let items = files
        .into_iter()
        .progress()
        .map(|entry| indexer.parse(entry))
        .try_collect()?;

    Ok(items)
}

/// Builds a list of album from the given media files.
pub fn albums(images: Vec<MediaItem>) -> Vec<Album> {
    album::by_directory(images)
}
