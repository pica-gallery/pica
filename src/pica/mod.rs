use std::fmt::{Debug, Display, Formatter};
use std::hash::{Hash, Hasher};
use std::marker::PhantomData;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;

use anyhow::{anyhow, ensure};
use arcstr::ArcStr;
use chrono::{DateTime, Utc};
use derive_more::Deref;
use pica_image::MediaType;
use serde::Serialize;
use serde_with::serde_derive::Deserialize;
use serde_with::{DeserializeFromStr, SerializeDisplay};

pub mod album;
pub mod index;

pub mod accessor;
pub mod config;
pub mod db;
pub mod queue;
pub mod scale;
pub mod store;

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
        Self {
            value,
            _marker: PhantomData,
        }
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

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
#[derive(Deref)]
#[derive(Serialize, Deserialize)]
#[serde(transparent)]
pub struct SourceId(ArcStr);

impl From<&str> for SourceId {
    fn from(value: &str) -> Self {
        Self(value.into())
    }
}

#[derive(Clone, Debug)]
pub struct MediaInfo {
    pub timestamp: DateTime<Utc>,
    pub width: u32,
    pub height: u32,
    pub latitude: Option<f32>,
    pub longitude: Option<f32>,
}

/// A [MediaItem] references a media file on the filesystem.
#[derive(Clone, Debug)]
pub struct MediaItem {
    pub id: MediaId,
    pub source: SourceId,
    pub relpath: Arc<PathBuf>,
    pub filesize: u64,
    pub name: ArcStr,
    pub typ: MediaType,
    pub info: MediaInfo,
    pub location: Option<Location>,
}

impl MediaItem {
    pub fn from_media_info(id: MediaId, source: SourceId, relpath: PathBuf, filesize: u64, info: MediaInfo) -> anyhow::Result<Self> {
        // take the file name and clear any invalid characters from it
        let name = relpath
            .file_name()
            .ok_or_else(|| anyhow!("no file name in {:?}", relpath))?
            .to_string_lossy()
            .replace(core::char::REPLACEMENT_CHARACTER, "_")
            .into();

        let typ = MediaType::from_path(&relpath).ok_or_else(|| anyhow!("unknown media type for file {:?}", relpath))?;

        let location = match (info.latitude, info.longitude) {
            (Some(latitude), Some(longitude)) => {
                let city = pica_geo::nearest_city(latitude, longitude)?.map(City::from);
                Some(Location {
                    latitude,
                    longitude,
                    city,
                })
            }

            _ => None,
        };

        Ok(Self {
            id,
            filesize,
            info,
            name,
            typ,
            location,
            source,
            relpath: relpath.into(),
        })
    }
}

#[derive(Clone, Debug)]
pub struct Location {
    pub latitude: f32,
    pub longitude: f32,
    pub city: Option<City>,
}

#[derive(Clone, Debug)]
pub struct City {
    pub latitude: f32,
    pub longitude: f32,
    pub name: ArcStr,
    pub country: ArcStr,
}

impl From<&pica_geo::City> for City {
    fn from(value: &pica_geo::City) -> Self {
        Self {
            name: value.name.clone(),
            country: value.country.clone(),
            latitude: value.latitude,
            longitude: value.longitude,
        }
    }
}

pub type AlbumId = Id<Album>;

#[derive(Clone, Debug)]
pub struct AlbumInfo {
    pub id: AlbumId,
    pub name: ArcStr,
    pub timestamp: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct Album {
    pub info: AlbumInfo,

    // the album has a relpath if it is based on the file system
    pub relpath: Option<Arc<PathBuf>>,

    // a copy of the media items in this album
    pub items: Vec<MediaItem>,

    // the albums preview image
    pub cover: MediaItem,
}
