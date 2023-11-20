use std::cmp::Reverse;
use std::ffi::OsStr;
use std::fs::Metadata;
use std::os::unix::fs::MetadataExt;
use std::os::unix::prelude::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, NaiveDateTime, Utc};
use indicatif::ProgressIterator;
use itertools::Itertools;
use regex::Regex;
use rexif::{ExifTag, TagValue};
use tokio::sync::Semaphore;
use tokio::task::{block_in_place, JoinSet};
use tracing::{info, warn};
use walkdir::WalkDir;

use crate::pica::{MediaId, MediaItem, MediaType};
use crate::pica::cache::{Cache, MediaInfo};
use crate::pica::media::MediaAccessor;
use crate::pica::store::MediaStore;

thread_local! {
    static RE_TIMESTAMP: Regex = Regex::new(r#"(20\d\d[01]\d[0123]\d)_?([012]\d[012345]\d[012345]\d)"#).unwrap();
}


pub struct ScanItem {
    pub path: PathBuf,
    pub meta: Metadata,
}

#[derive(Clone)]
pub struct IndexTask {
    pub root: PathBuf,
    pub store: MediaStore,
    pub media: MediaAccessor,
    pub cache: Cache,
}

pub async fn index(task: IndexTask) -> Result<()> {
    info!("Starting index run for {:?}", task.root);

    let mut files = block_in_place(|| {
        scan(&task.root)
            .flat_map(|res| {
                match res {
                    Ok(item) => Some(item),
                    Err(err) => {
                        warn!("Failed to scan file: {:?}", err);
                        None
                    }
                }
            })
            .collect_vec()
    });

    info!("Found {} files in scan", files.len());

    // now sort files by date
    files.sort_unstable_by_key(|item| {
        Reverse(item.meta.modified().unwrap_or(SystemTime::UNIX_EPOCH))
    });

    let task = Arc::new(task);
    let semaphore = Arc::new(Semaphore::new(4));

    let mut tasks = JoinSet::new();

    for item in files.into_iter().progress() {
        let permit = semaphore.clone().acquire_owned().await?;
        let task = Arc::clone(&task);

        tasks.spawn(async move {
            if let Err(err) = index_one(&task, &item).await {
                warn!("Failed to index {:?}: {:?}", item.path, err);
            }

            drop(permit);
        });
    }

    info!("Waiting for tasks to finish");
    while let Some(result) = tasks.join_next().await {
        if let Err(err) = result {
            warn!("Joining task failed: {:?}", err)
        }
    }

    info!("Indexing finished");

    Ok(())
}

async fn index_one(task: &IndexTask, item: &ScanItem) -> Result<()> {
    let item = parse(&task.root, &task.cache, item).await?;

    // ask for the media, this will generate thumbnails & preview images
    task.media.get(&item).await?;

    // add item to store, this makes the media available to the frontend
    task.store.push(item).await;

    Ok(())
}

/// Scan returns an iterator over files we might want to index
fn scan(root: &Path) -> impl Iterator<Item=Result<ScanItem>> {
    let files_iter = WalkDir::new(root)
        .same_file_system(true)
        .follow_links(false)
        .follow_root_links(false)
        .into_iter();

    files_iter
        // filter out hidden files
        .filter_entry(|entry| !file_is_hidden(entry.file_name()))

        // convert any error to anyhow errors.
        .map(|res| res.map_err(anyhow::Error::from))

        // keep only jpeg files
        .filter_ok(|entry| entry.file_type().is_file() && file_is_jpeg(entry.file_name()))

        // extract metadata and convert into scan items
        .map_ok(|entry| -> Result<ScanItem> {
            Ok(
                ScanItem {
                    meta: entry.metadata().with_context(|| entry.path().display().to_string())?,
                    path: entry.into_path(),
                }
            )
        })

        .flatten_ok()
}

/// Parses a MediaItem from a dir entry.
async fn parse(root: &Path, cache: &Cache, item: &ScanItem) -> Result<MediaItem> {
    let filesize = item.meta.size();

    let path = item.path.to_owned();

    let id = {
        // hash the relative path into an id
        let relpath = path.strip_prefix(root)?;
        let hash = sha1_smol::Sha1::from(relpath.as_os_str().as_bytes()).digest().bytes();

        let mut bytes = [0_u8; 8];
        bytes.copy_from_slice(&hash[..8]);
        MediaId::from(bytes)
    };

    // take the file name and clear any invalid characters from it
    let name = path.file_name()
        .ok_or_else(|| anyhow!("no filename for {:?}", path))?
        .to_string_lossy()
        .replace(core::char::REPLACEMENT_CHARACTER, "_");

    let info = match cache.get(id).await? {
        Some(info) => info,

        None => {
            let reader = image::io::Reader::open(&path)?;
            let (width, height) = reader
                .with_guessed_format()?
                .into_dimensions()?;

            let timestamp = match timestamp_from_filename(&name) {
                Some(ts) => ts,
                None => match timestamp_from_exif(&path).await.ok().flatten() {
                    Some(ts) => ts,
                    None => timestamp_file_modified(&item.meta)?,
                }
            };

            let info = MediaInfo {
                timestamp,
                width,
                height,
            };

            cache.put(id, info.clone()).await?;

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

    let hdr = false;
    let image = MediaItem { id, path, name, filesize, typ: media_type, info, hdr };

    Ok(image)
}


async fn timestamp_from_exif(path: &Path) -> Result<Option<DateTime<Utc>>> {
    let content = tokio::fs::read(path).await?;
    let (exif, _) = block_in_place(|| rexif::parse_buffer_quiet(&content));

    if let Some(e) = exif?.entries.iter().find(|e| e.tag == ExifTag::DateTimeOriginal) {
        if let TagValue::Ascii(datestr) = &e.value {
            let date = NaiveDateTime::parse_from_str(datestr, "%Y:%m:%d %H:%M:%S")?.and_utc();
            return Ok(Some(date));
        }
    }

    Ok(None)
}

fn timestamp_file_modified(metadata: &Metadata) -> Result<DateTime<Utc>> {
    let modified = metadata.modified().or_else(|_| metadata.created())?;
    let epoch_seconds = modified.duration_since(SystemTime::UNIX_EPOCH)?.as_secs();

    Ok(
        NaiveDateTime::from_timestamp_opt(epoch_seconds as i64, 0)
            .ok_or_else(|| anyhow!("invalid unix timestamp {:?}", epoch_seconds))?
            .and_utc()
    )
}

fn timestamp_from_filename(name: &str) -> Option<DateTime<Utc>> {
    RE_TIMESTAMP.with(|re| {
        if let Some(m) = re.captures(name) {
            let date = m.get(1)?.as_str();
            let time = m.get(2)?.as_str();

            let datestr = String::from(date) + time;
            let date = NaiveDateTime::parse_from_str(&datestr, "%Y%m%d%H%M%S").ok()?.and_utc();
            return Some(date);
        }

        None
    })
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
