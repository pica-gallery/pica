use std::num::NonZeroU64;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Result};
use tokio::sync::Mutex;
use tokio::time::sleep;
use tracing::info;

use crate::pica::{accessor, scale};
use crate::pica::accessor::{MediaAccessor, Storage};
use crate::pica::config::ImageCodecConfig;
use crate::pica::index::{Indexer, Scanner};
use crate::pica::queue::ScanQueue;
use crate::pica::scale::{ImageType, MediaScaler};
use crate::pica::store::MediaStore;

pub mod pica;
pub mod pica_web;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let config = pica::config::load("./pica.config.yaml")?;

    info!("Open database");
    let db = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(8)
        .connect(&config.database)
        .await?;

    sqlx::migrate!("./sql").run(&db).await?;

    let source = config.sources.first().ok_or_else(|| anyhow!("no sources defined"))?;

    let queue = Arc::new(Mutex::new(ScanQueue::default()));

    info!("Starting scanner");
    let scanner = Scanner::new(&source.path, queue.clone());
    tokio::task::spawn(scanner_loop(scanner, Duration::from_secs(config.scan_interval_in_seconds.get() as _)));

    let sizes = accessor::Sizes {
        thumb: config.thumb_size,
        preview: config.preview_size,
    };

    let scaler_options = scale::Options {
        use_image_magick: config.use_image_magick,

        max_memory: NonZeroU64::from(config.max_memory_in_megabytes)
            .checked_mul(NonZeroU64::new(1024 * 1024).unwrap())
            .ok_or_else(|| anyhow!("max memory > 4gb"))?,

        image_type: match config.image_codec {
            ImageCodecConfig::Avif => ImageType::Avif,
            ImageCodecConfig::Jpeg => ImageType::Jpeg,
        },
    };

    // put images into some extra storage space
    let storage = Storage::new(db.clone());

    let store = MediaStore::empty();
    let scaler = MediaScaler::new(scaler_options);
    let media = MediaAccessor::new(storage, scaler, sizes, &source.path);

    // start four indexer queues
    info!("Starting {} indexers", config.indexer_threads.get());
    for _ in 0..config.indexer_threads.get() {
        let indexer = Indexer::new(db.clone(), queue.clone(), store.clone(), (!config.lazy_thumbs).then(|| media.clone()));
        tokio::task::spawn(indexer.run());
    }

    info!("Starting webserver on {:?}", config.http_address);
    pica_web::serve(store, media, config.http_address).await?;

    Ok(())
}

async fn scanner_loop(mut scanner: Scanner, interval: Duration) {
    loop {
        scanner.scan().await;
        sleep(interval).await;
    }
}
