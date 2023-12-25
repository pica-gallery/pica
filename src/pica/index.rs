use std::ffi::OsStr;
use std::fs::Metadata;
use std::os::unix::fs::MetadataExt;
use std::os::unix::prelude::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, NaiveDateTime, Utc};
use itertools::Itertools;
use regex::Regex;
use rexif::{ExifTag, TagValue};
use tokio::sync::Mutex;
use tokio::task::block_in_place;
use tokio::time::sleep;
use tracing::{debug, info, warn};
use walkdir::WalkDir;

use crate::pica::{db, MediaId, MediaInfo, MediaItem, MediaType};
use crate::pica::accessor::MediaAccessor;
use crate::pica::queue::ScanQueue;

thread_local! {
    static RE_TIMESTAMP: Regex = Regex::new(r#"(20\d\d[01]\d[0123]\d)_?([012]\d[012345]\d[012345]\d)"#).unwrap();
}

pub struct ScanItem {
    pub id: MediaId,
    pub path: PathBuf,
    pub relpath: PathBuf,
    pub meta: Metadata,
}

pub struct Scanner {
    root: PathBuf,
    queue: Arc<Mutex<ScanQueue>>,
}

impl Scanner {
    pub fn new(root: impl Into<PathBuf>, queue: Arc<Mutex<ScanQueue>>) -> Self {
        Self { root: root.into(), queue }
    }

    /// Runs scanning once and writes the files found to the scan queue
    pub fn scan(&self) {
        info!("Starting index run for {:?}", self.root);

        for item in scan_iter(&self.root) {
            let item = match item {
                Ok(item) => item,
                Err(err) => {
                    warn!("Failed to scan file: {:?}", err);
                    continue;
                }
            };

            let path = item.path.clone();
            if let Err(err) = self.add(item) {
                warn!("Failed to enqueue scanned file {:?}: {:?}", path, err)
            }
        }
    }

    fn add(&self, item: ScanItem) -> Result<()> {
        let timestamp = guess_timestamp(&item)?;
        self.queue.blocking_lock().add(item, timestamp);
        Ok(())
    }
}

/// Returns an iterator over files we might want to index
fn scan_iter(root: &Path) -> impl Iterator<Item=Result<ScanItem>> + '_ {
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
        .map_ok(move |entry| -> Result<ScanItem> {
            let relpath = entry.path().strip_prefix(&root)
                .with_context(|| entry.path().display().to_string())?
                .to_owned();

            // hash the relative path into an id
            let hash = sha1_smol::Sha1::from(relpath.as_os_str().as_bytes()).digest().bytes();

            let mut bytes = [0_u8; 8];
            bytes.copy_from_slice(&hash[..8]);
            let id = MediaId::from(bytes);

            Ok(
                ScanItem {
                    id,
                    relpath,

                    meta: entry
                        .metadata()
                        .with_context(|| entry.path().display().to_string())?,

                    path: entry.into_path(),
                }
            )
        })

        .flatten_ok()
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

pub struct Indexer {
    db: sqlx::sqlite::SqlitePool,
    queue: Arc<Mutex<ScanQueue>>,
    accessor: MediaAccessor,
}

impl Indexer {
    pub fn new(db: sqlx::sqlite::SqlitePool, queue: Arc<Mutex<ScanQueue>>, accessor: MediaAccessor) -> Self {
        Self { db, queue, accessor }
    }

    pub async fn run(self) {
        loop {
            let item = match self.queue.lock().await.poll() {
                Some(item) => item,
                None => {
                    // no more data in queue, wait a moment before trying again
                    sleep(Duration::from_millis(100)).await;
                    continue;
                }
            };

            if let Err(err) = self.index_one(&item).await {
                warn!("Failed to parse item {:?}: {:?}", item.path, err);
            }
        }
    }

    async fn index_one(&self, item: &ScanItem) -> Result<()> {
        debug!("Indexing file: {:?}", item.relpath);
        let item = parse(item).await?;

        debug!("Create thumbnails for: {:?}", item.relpath);
        self.accessor.thumb(&item).await?;
        self.accessor.preview(&item).await?;

        // put item into database
        debug!("Put media item {:?} into database: {:?}", item.id, item.relpath);
        let mut tx = self.db.begin().await?;
        db::store_media_item(&mut tx, &item).await?;
        tx.commit().await?;

        // mark as done in queue (TODO also handle errors correctly)
        self.queue.lock().await.done(item.id);

        Ok(())
    }
}

/// Parses a [ScanItem] into a new [MediaItem]
async fn parse(item: &ScanItem) -> Result<MediaItem> {
    let filesize = item.meta.size();

    let path = item.path.to_owned();

    let id = {
        // hash the relative path into an id
        let hash = sha1_smol::Sha1::from(item.relpath.as_os_str().as_bytes()).digest().bytes();

        let mut bytes = [0_u8; 8];
        bytes.copy_from_slice(&hash[..8]);
        MediaId::from(bytes)
    };

    // take the file name and clear any invalid characters from it
    let name = path.file_name()
        .ok_or_else(|| anyhow!("no filename for {:?}", path))?
        .to_string_lossy()
        .replace(core::char::REPLACEMENT_CHARACTER, "_");

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

    let extension = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();

    let media_type = match extension.as_str() {
        "jpg" | "jpeg" | "png" => MediaType::Image,
        "mp4" | "mkv" | "avi" | "mov" => MediaType::Video,
        other => bail!("unknown extension: {:?}", other),
    };

    Ok(MediaItem { id, relpath: path, name, filesize, typ: media_type, info, hdr: false })
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

// Best effort guess for the file name of a scan item
fn guess_timestamp(item: &ScanItem) -> Result<DateTime<Utc>> {
    if let Some(name) = item.path.file_name().unwrap_or_default().to_str() {
        if let Some(timestamp) = timestamp_from_filename(name) {
            return Ok(timestamp);
        }
    }

    timestamp_file_modified(&item.meta)
}
