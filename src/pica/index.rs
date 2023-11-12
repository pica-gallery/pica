use std::ffi::OsStr;
use std::os::unix::fs::MetadataExt;
use std::os::unix::prelude::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::SystemTime;

use anyhow::{anyhow, bail, Result};
use chrono::{DateTime, NaiveDateTime, Utc};
use itertools::Itertools;
use regex::Regex;
use rexif::{ExifTag, TagValue};
use walkdir::{DirEntry, WalkDir};

use crate::pica::{MediaId, MediaItem, MediaType};
use crate::pica::cache::{Cache, MediaInfo};

static RE_TIMESTAMP: OnceLock<Regex> = OnceLock::new();

pub struct IndexContext<'a> {
    cache: &'a Cache,
    root: PathBuf,
}

impl<'a> IndexContext<'a> {
    pub fn new(cache: &'a Cache, root: PathBuf) -> Self {
        Self { cache, root }
    }

    pub fn scan(&self) -> impl Iterator<Item=Result<DirEntry>> {
        let iter = WalkDir::new(&self.root)
            .same_file_system(true)
            .follow_links(false)
            .follow_root_links(false)
            .into_iter();

        iter
            .filter_entry(|entry| !file_is_hidden(entry.file_name()))
            .filter_ok(|entry| entry.file_type().is_file() && file_is_jpeg(entry.file_name()))
            .map(|res| res.map_err(anyhow::Error::from))
    }

    /// Parses a MediaItem from a dir entry.
    pub fn parse(&self, entry: DirEntry) -> Result<MediaItem> {
        let meta = entry.metadata()?;
        let filesize = meta.size();

        let path = entry.into_path();

        let id = {
            let relpath = path.strip_prefix(&self.root)?;
            let hash = sha1_smol::Sha1::from(relpath.as_os_str().as_bytes()).digest().bytes();

            let mut bytes = [0_u8; 8];
            bytes.copy_from_slice(&hash[..8]);
            MediaId::from(bytes)
        };

        let name = path.file_name()
            .ok_or_else(|| anyhow!("no filename for {:?}", path))?
            .to_string_lossy()
            .replace(core::char::REPLACEMENT_CHARACTER, "_");

        let info = match self.cache.get(id)? {
            Some(info) => info,

            None => {
                let reader = image::io::Reader::open(&path)?;
                let (width, height) = reader
                    .with_guessed_format()?
                    .into_dimensions()?;

                let timestamp = match timestamp_from_filename(&name) {
                    Some(ts) => ts,
                    None => match timestamp_from_exif(&path).ok().flatten() {
                        Some(ts) => ts,
                        None => timestamp_file_modified(&path)?,
                    }
                };

                let info = MediaInfo {
                    timestamp,
                    width,
                    height,
                };

                self.cache.put(id, info.clone())?;

                info
            }
        };

        let extension = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_lowercase();

        let media_type = match extension.as_str() {
            "jpg" | "jpeg" | "png" => MediaType::Image,
            "mp4" | "mkv" | "avi" | "mov" => MediaType::Video,
            other => bail!("unknown extension: {:?}", other),
        };

        let image = MediaItem { id, path, name, filesize, typ: media_type, info };
        Ok(image)
    }
}

fn timestamp_from_exif(path: &Path) -> Result<Option<DateTime<Utc>>> {
    let (exif, _) = rexif::parse_buffer_quiet(&std::fs::read(path)?);

    if let Some(e) = exif?.entries.iter().find(|e| e.tag == ExifTag::DateTimeOriginal) {
        if let TagValue::Ascii(datestr) = &e.value {
            let date = NaiveDateTime::parse_from_str(datestr, "%Y:%m:%d %H:%M:%S")?.and_utc();
            return Ok(Some(date));
        }
    }

    Ok(None)
}

fn timestamp_file_modified(path: impl AsRef<Path>) -> Result<DateTime<Utc>> {
    let metadata = std::fs::metadata(path)?;
    let modified = metadata.modified()?;
    let epoch_seconds = modified.duration_since(SystemTime::UNIX_EPOCH)?.as_secs();

    Ok(
        NaiveDateTime::from_timestamp_opt(epoch_seconds as i64, 0)
            .ok_or_else(|| anyhow!("invalid unix timestamp {:?}", epoch_seconds))?
            .and_utc()
    )
}

fn timestamp_from_filename(name: &str) -> Option<DateTime<Utc>> {
    let re = RE_TIMESTAMP.get_or_init(|| Regex::new(r#"(20\d\d[01]\d[0123]\d)_?([012]\d[012345]\d[012345]\d)"#).unwrap());

    if let Some(m) = re.captures(name) {
        let date = m.get(1)?.as_str();
        let time = m.get(2)?.as_str();

        let datestr = String::from(date) + time;
        let date = NaiveDateTime::parse_from_str(&datestr, "%Y%m%d%H%M%S").ok()?.and_utc();
        return Some(date);
    }

    None
}

fn file_is_hidden(name: &OsStr) -> bool {
    name.to_str()
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

fn file_is_jpeg(name: &OsStr) -> bool {
    name.to_str()
        .map(|name| {
            let lower = name.to_lowercase();
            lower.ends_with(".jpg") || lower.ends_with(".jpeg")
        })
        .unwrap_or(false)
}
