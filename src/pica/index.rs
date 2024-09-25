use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs::Metadata;
use std::os::unix::fs::MetadataExt;
use std::os::unix::prelude::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use itertools::Itertools;
use pica_image::exif::ExifSummary;
use regex::Regex;
use tokio::sync::Mutex;
use tokio::task::block_in_place;
use tokio::time::sleep;
use tracing::{debug, info, instrument, warn};
use walkdir::WalkDir;

use crate::pica::accessor::MediaAccessor;
use crate::pica::queue::{QueueItem, ScanQueue};
use crate::pica::store::MediaStore;
use crate::pica::{db, MediaId, MediaInfo, MediaItem};
use pica_image::MediaType;

thread_local! {
    static RE_TIMESTAMP: Regex = Regex::new(r#"((?:19|20)\d\d[01]\d[0123]\d)_?([012]\d[012345]\d[012345]\d)"#).unwrap();
    static RE_TIMESTAMP_WA: Regex = Regex::new(r#"\b(20\d\d(?:01|02|03|04|05|06|07|08|09|10|11|12)[0123]\d)-WA\d\d\d\d"#).unwrap();
}

pub struct ScanItem {
    pub id: MediaId,
    pub source: String,
    pub path: PathBuf,
    pub relpath: PathBuf,

    // filesize in bytes
    pub filesize: u64,

    // modified timestamp from metadata
    pub timestamp: DateTime<Utc>,

    // the media type, derived from the file name
    pub typ: MediaType,
}

pub struct Scanner {
    root: PathBuf,
    queue: Arc<Mutex<ScanQueue>>,
    known: HashSet<MediaId>,
    source: String,
}

impl Scanner {
    pub fn new(root: impl Into<PathBuf>, queue: Arc<Mutex<ScanQueue>>, source: impl Into<String>) -> Self {
        Self {
            root: root.into(),
            queue,
            known: HashSet::new(),
            source: source.into(),
        }
    }

    /// Runs scanning once and writes the files found to the scan queue
    #[instrument(skip_all)]
    pub async fn scan(&mut self) {
        let start_time = Instant::now();

        debug!("Starting scan in {:?}", self.root);

        let mut seen = HashSet::new();

        let items = block_in_place(|| scan_path_for_items(&self.source, &self.root));

        info!(
            "Scan of {:?} finished in {:?}, found {} media files",
            self.root,
            Instant::now().duration_since(start_time),
            items.len(),
        );

        let items = collapse_raw_with_jpeg(items);

        for item in items {
            seen.insert(item.id);

            if !self.known.contains(&item.id) {
                self.queue.lock().await.add(item);
            }
        }

        // remove the ones that we did not see this time
        let deleted = self.known.difference(&seen);
        let mut queue = self.queue.lock().await;
        deleted.for_each(|id| queue.remove(*id));

        self.known = seen;
    }
}

#[instrument(skip_all)]
fn collapse_raw_with_jpeg(items: Vec<ScanItem>) -> impl Iterator<Item = ScanItem> {
    // set of all names
    let names: HashSet<_> = items
        .iter()
        .filter(|item| !item.typ.is_raw())
        .map(|item| item.relpath.with_extension(""))
        .collect();

    items.into_iter().filter(move |item| {
        if item.typ.is_raw() {
            // skip this if we have a non-raw version of this image
            let base = item.relpath.with_extension("");
            if names.contains(&base) {
                return false;
            }
        }

        return true;
    })
}

/// Returns an iterator over files we might want to index
#[instrument]
fn scan_path_for_items(source: &str, root: &Path) -> Vec<ScanItem> {
    let files_iter = WalkDir::new(root)
        .same_file_system(true)
        .follow_links(false)
        .follow_root_links(false)
        .into_iter();

    let items_iter = files_iter
        // filter out hidden files
        .filter_entry(|entry| !file_is_hidden(entry.file_name()))
        // convert any error to anyhow errors.
        .map(|res| res.map_err(anyhow::Error::from))
        // keep only jpeg files
        .filter_ok(|entry| entry.file_type().is_file() && file_is_indexable(entry.path()))
        // extract metadata and convert into scan items
        .map_ok(move |entry| -> Result<ScanItem> {
            let ctx = || entry.path().display().to_string();

            let relpath = entry.path().strip_prefix(root).with_context(ctx)?.to_owned();

            let meta = entry.metadata().with_context(ctx)?;
            let timestamp = timestamp_from_metadata(&meta).with_context(ctx)?;

            // hash the relative path and file size into an id
            let hash = {
                let mut hasher = sha1_smol::Sha1::new();
                hasher.update(source.as_bytes());
                hasher.update(relpath.as_os_str().as_bytes());
                hasher.update(meta.size().to_be_bytes().as_slice());
                hasher.digest().bytes()
            };

            let typ = MediaType::from_path(&relpath).ok_or_else(|| anyhow!("no media type in {:?}", relpath))?;

            // build id from hash
            let mut bytes = [0_u8; 8];
            bytes.copy_from_slice(&hash[..8]);
            let id = MediaId::from(bytes);

            Ok(ScanItem {
                id,
                timestamp,
                relpath,
                typ,
                source: source.to_owned(),
                filesize: meta.size(),
                path: entry.into_path(),
            })
        })
        .flatten_ok()
        // filter out what looks like crap
        .filter_ok(|item| item.filesize > 8192);

    let mut items = Vec::new();

    for item in items_iter {
        match item {
            Err(err) => warn!("Failed to scan file: {:?}", err),
            Ok(item) => items.push(item),
        }
    }

    items
}

fn file_is_hidden(name: &OsStr) -> bool {
    name.to_str().map(|name| name.starts_with('.')).unwrap_or(false)
}

fn file_is_indexable(name: &Path) -> bool {
    match MediaType::from_path(name) {
        Some(MediaType::GenericVideo) => false,
        Some(_) => true,
        None => false,
    }
}

pub struct Indexer {
    db: sqlx::sqlite::SqlitePool,
    queue: Arc<Mutex<ScanQueue>>,
    accessor: Option<MediaAccessor>,
    store: MediaStore,
}

impl Indexer {
    pub fn new(
        db: sqlx::sqlite::SqlitePool,
        queue: Arc<Mutex<ScanQueue>>,
        store: MediaStore,
        accessor: Option<MediaAccessor>,
    ) -> Self {
        Self {
            db,
            queue,
            accessor,
            store,
        }
    }

    pub async fn run(self) {
        loop {
            // must not be inlined into the match statement. This would keep the lock guard alive
            // for the expression, including the sleep.
            let queued = self.queue.lock().await.poll();

            match queued {
                Some(QueueItem::Add(item)) => {
                    let task = self.index_one(&item);

                    if let Err(err) = task.await {
                        warn!("Indexing failed for {:?}: {:?}", item.relpath, err);
                    }
                }

                Some(QueueItem::Remove(item)) => {
                    self.store.remove(item).await;
                }

                None => {
                    // no more data in queue, wait a moment before trying again
                    sleep(Duration::from_millis(100)).await;
                    continue;
                }
            };
        }
    }

    #[instrument(skip_all, fields(? item.relpath))]
    async fn index_one(&self, item: &ScanItem) -> Result<()> {
        let existing_error = {
            let mut tx = self.db.begin().await?;
            db::media::media_get_error(&mut tx, item.id).await?
        };

        if let Some(err) = existing_error {
            bail!("Indexing failed previously: {:?}", err)
        }

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
                db::media::media_mark_as_error(&mut tx, item.id, &err.to_string()).await?;
                tx.commit().await?;
                Err(err)
            }
        }
    }

    #[instrument(skip_all, fields(? item.relpath))]
    async fn parse_item(&self, item: &ScanItem) -> Result<MediaItem> {
        // check cache for an indexed version first
        let cached = {
            let mut tx = self.db.begin().await?;
            db::media::read_media_item(&mut tx, item.id).await?
        };

        if let Some(media) = cached {
            // ensure that media exists
            if let Some(accessor) = &self.accessor {
                debug!("Create thumbnails");
                accessor.thumb(&media).await?;
                accessor.preview(&media).await?;
            }

            return Ok(media);
        }

        let item = parse(item).await.with_context(|| "parse to MediaItem")?;

        // store the parsed item in the database
        let mut tx = self.db.begin().await?;
        db::media::store_media_item(&mut tx, &item).await?;
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
#[instrument(skip_all, fields(? item.relpath))]
async fn parse(item: &ScanItem) -> Result<MediaItem> {
    let path = block_in_place(|| pica_image::get(&item.path))?;

    let reader = image::ImageReader::open(path.as_ref())?;

    let (width, height) = reader.with_guessed_format()?.into_dimensions()?;

    let exif = match block_in_place(|| pica_image::exif::parse_exif(&path)) {
        Ok(Some(exif)) => Some(exif),
        Ok(None) => None,
        Err(err) => {
            warn!("Failed to parse exif data of {:?}: {:?}", path, err);
            None
        }
    };

    // if we have information about the orientation, rotate width + height
    let (width, height) = match &exif {
        Some(ExifSummary { orientation, .. }) if orientation.transposed() => (height, width),
        _ => (width, height),
    };

    let timestamp = timestamp_from_path(&item.relpath)
        .or_else(|| exif.as_ref()?.timestamp)
        .unwrap_or(item.timestamp);

    let info = MediaInfo {
        timestamp,
        width,
        height,
        latitude: exif.as_ref().and_then(|exif| exif.latitude),
        longitude: exif.as_ref().and_then(|exif| exif.longitude),
    };

    MediaItem::from_media_info(item.id, item.source.clone(), item.path.clone(), item.filesize, info)
}

fn timestamp_from_metadata(metadata: &Metadata) -> Result<DateTime<Utc>> {
    let modified = metadata.modified().or_else(|_| metadata.created())?;
    let epoch_seconds = modified.duration_since(SystemTime::UNIX_EPOCH)?.as_secs();

    let timestamp = DateTime::<Utc>::from_timestamp(epoch_seconds as i64, 0)
        .ok_or_else(|| anyhow!("invalid unix timestamp {:?}", epoch_seconds))?;

    Ok(timestamp)
}

fn timestamp_from_path(path: &Path) -> Option<DateTime<Utc>> {
    let name = path.file_name()?.to_str()?;

    let android = RE_TIMESTAMP.with(|re| {
        let m = re.captures(name)?;
        let date = m.get(1)?.as_str();
        let time = m.get(2)?.as_str();

        let datestr = String::from(date) + time;
        let date = NaiveDateTime::parse_from_str(&datestr, "%Y%m%d%H%M%S").ok()?.and_utc();
        Some(date)
    });

    // check for whatsapp file naming
    let whatsapp = || {
        RE_TIMESTAMP_WA.with(|re| {
            let m = re.captures(name)?;
            let date = m.get(1)?.as_str();

            let date = NaiveDate::parse_from_str(date, "%Y%m%d")
                .ok()?
                .and_time(NaiveTime::from_hms_opt(12, 0, 0)?)
                .and_utc();

            Some(date)
        })
    };

    android.or_else(whatsapp)
}
