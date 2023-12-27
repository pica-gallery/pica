use std::borrow::Cow;
use std::ffi::OsStr;
use std::fs::Metadata;
use std::hash::Hash;
use std::os::unix::fs::MetadataExt;
use std::os::unix::prelude::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, NaiveDateTime, Utc};
use itertools::Itertools;
use regex::Regex;
use sqlx::{Sqlite, Transaction};
use tokio::sync::Mutex;
use tokio::task::block_in_place;
use tokio::time::sleep;
use tracing::{debug, debug_span, info, Instrument, warn};
use walkdir::WalkDir;

use crate::pica;
use crate::pica::{Album, AlbumId, db, MediaId, MediaInfo, MediaItem, MediaType};
use crate::pica::accessor::MediaAccessor;
use crate::pica::db::CreateAblum;
use crate::pica::exif::ExifInfo;
use crate::pica::queue::ScanQueue;
use crate::pica::store::MediaStore;

thread_local! {
    static RE_TIMESTAMP: Regex = Regex::new(r#"(20\d\d[01]\d[0123]\d)_?([012]\d[012345]\d[012345]\d)"#).unwrap();
}

pub struct ScanItem {
    pub id: MediaId,
    pub path: PathBuf,
    pub relpath: PathBuf,
    pub meta: Metadata,
    pub timestamp: DateTime<Utc>,
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
    pub async fn scan(&mut self) {
        let start_time = Instant::now();
        debug!("Starting scan in {:?}",  self.root);

        let mut iter = scan_iter(&self.root);
        while let Some(item) = block_in_place(|| iter.next()) {
            let item = match item {
                Ok(item) => item,
                Err(err) => {
                    warn!("Failed to scan file: {:?}", err);
                    continue;
                }
            };

            self.queue.lock().await.add(item);
        }

        debug!("Scan finished in {:?}", Instant::now().duration_since(start_time));
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
            let ctx = || entry.path().display().to_string();

            let relpath = entry.path()
                .strip_prefix(root)
                .with_context(ctx)?
                .to_owned();

            let meta = entry.metadata().with_context(ctx)?;
            let timestamp = guess_timestamp(entry.path(), &meta).with_context(ctx)?;

            // hash the relative path and file size into an id
            let hash = {
                let mut hasher = sha1_smol::Sha1::new();
                hasher.update(relpath.as_os_str().as_bytes());
                hasher.update(meta.size().to_be_bytes().as_slice());
                hasher.digest().bytes()
            };

            // build id from hash
            let mut bytes = [0_u8; 8];
            bytes.copy_from_slice(&hash[..8]);
            let id = MediaId::from(bytes);

            Ok(
                ScanItem {
                    id,
                    meta,
                    timestamp,
                    relpath,
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
    accessor: Option<MediaAccessor>,
    store: MediaStore,
}

impl Indexer {
    pub fn new(db: sqlx::sqlite::SqlitePool, queue: Arc<Mutex<ScanQueue>>, store: MediaStore, accessor: Option<MediaAccessor>) -> Self {
        Self { db, queue, accessor, store }
    }

    pub async fn run(self) {
        loop {
            // must not be inlined into the match statement. This would keep the lock guard alive
            // for the expression, including the sleep.
            let polled_item = self.queue.lock().await.poll();

            let item = match polled_item {
                Some(item) => item,
                None => {
                    // no more data in queue, wait a moment before trying again
                    sleep(Duration::from_millis(100)).await;
                    continue;
                }
            };

            let task = self
                .index_one(&item)
                .instrument(debug_span!("Indexing", relpath=?item.relpath));

            if let Err(err) = task.await {
                warn!("Indexing failed for {:?}: {:?}", item.relpath, err);
            }
        }
    }

    async fn index_one(&self, item: &ScanItem) -> Result<()> {
        // skip if the item is already index
        let option = self.store.get(item.id).await;
        if option.is_some() {
            return Ok(());
        }

        // TODO check the error cache first
        let result = self.parse_item(item).await;

        match result {
            Ok(media) => {
                // put the media item into the store
                let count = self.store.add(media).await;
                debug!("Added item to library, total items: {}", count);
                Ok(())
            }

            Err(err) => {
                let mut tx = self.db.begin().await?;
                db::media_mark_as_error(&mut tx, item.id, &err.to_string()).await?;
                tx.commit().await?;
                Err(err)
            }
        }
    }

    async fn parse_item(&self, item: &ScanItem) -> Result<MediaItem> {
        // check cache for an indexed version first
        let cached = {
            let mut tx = self.db.begin().await?;
            db::read_media_item(&mut tx, item.id).await?
        };

        if let Some(media) = cached {
            return Ok(media);
        }

        let item = parse(item).await?;

        // store the parsed item in the database
        let mut tx = self.db.begin().await?;
        db::store_media_item(&mut tx, &item).await?;
        tx.commit().await?;

        if let Some(accessor) = &self.accessor {
            debug!("Create thumbnails");
            accessor.thumb(&item).await?;
            accessor.preview(&item).await?;
        }

        Ok(item)
    }
}

/// Parses a [ScanItem] into a new [MediaItem]
async fn parse(item: &ScanItem) -> Result<MediaItem> {
    let filesize = item.meta.size();

    let path = item.path.to_owned();

    // take the file name and clear any invalid characters from it
    let name = path.file_name()
        .ok_or_else(|| anyhow!("no filename for {:?}", path))?
        .to_string_lossy()
        .replace(core::char::REPLACEMENT_CHARACTER, "_");

    let reader = image::io::Reader::open(&path)?;
    let (width, height) = reader
        .with_guessed_format()?
        .into_dimensions()?;

    let exif = match block_in_place(|| pica::exif::parse_exif(&path)) {
        Ok(Some(exif)) => Some(exif),
        Ok(None) => None,
        Err(err) => {
            warn!("Failed to parse exif data of {:?}: {:?}", path, err);
            None
        }
    };

    // if we have information about the orientation, rotate width + height
    let (width, height) = match &exif {
        Some(ExifInfo { orientation, .. }) if orientation.transposed() => (height, width),
        _ => (width, height)
    };

    let timestamp = match timestamp_from_filename(&name) {
        Some(ts) => ts,
        None => match exif.and_then(|e| e.timestamp) {
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

    Ok(MediaItem { id: item.id, relpath: item.relpath.clone(), name, filesize, typ: media_type, info, hdr: false })
}

/*
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
*/

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
fn guess_timestamp(path: &Path, meta: &Metadata) -> Result<DateTime<Utc>> {
    if let Some(name) = path.file_name().unwrap_or_default().to_str() {
        if let Some(timestamp) = timestamp_from_filename(name) {
            return Ok(timestamp);
        }
    }

    timestamp_file_modified(meta)
}

async fn upsert_album_for_media_item(tx: &mut Transaction<'_, Sqlite>, item: &MediaItem) -> Result<Album> {
    let Some(relpath) = item.relpath.parent() else {
        bail!("no parent directory for {:?}", item.relpath)
    };

    let mut tail = None;
    let mut missing_parent_paths = vec![];

    for anchestor in relpath.ancestors() {
        if let Some(album) = db::load_album_by_relpath(tx, anchestor).await? {
            // we found a parent that has an album, use this one as the base
            tail = Some(album);
            break;
        }

        missing_parent_paths.push(anchestor);
    }

    for path in missing_parent_paths.iter().rev() {
        let album = upsert_album_for_relpath_with_parent(tx, path, item.info.timestamp, tail.map(|a| a.id)).await?;

        // create the next pending album using this album as a parent
        tail = Some(album);
    }

    tail.ok_or_else(|| anyhow!("failed to create album for path {:?}", item.relpath))
}

async fn upsert_album_for_relpath_with_parent(tx: &mut Transaction<'_, Sqlite>, relpath: &Path, timestamp: DateTime<Utc>, parent: Option<AlbumId>) -> Result<Album> {
    let name = relpath
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or(Cow::Borrowed("Filesystem"));

    let create = CreateAblum {
        name: name.as_ref(),
        timestamp,
        parent,
        relpath: Some(relpath),
    };

    db::create_album(tx, create).await
}
