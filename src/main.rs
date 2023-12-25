use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Result};
use tokio::sync::Mutex;
use tracing::info;

use crate::pica::index::{Indexer, Scanner};
use crate::pica::media;
use crate::pica::media::MediaAccessor;
use crate::pica::queue::ScanQueue;
use crate::pica::scale::MediaScaler;
use crate::pica::store::MediaStore;

pub mod pica;
pub mod pica_web;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let config = pica::config::load("./pica.config.yaml")?;

    info!("Open database");
    let db = sqlx::sqlite::SqlitePool::connect(&config.database).await?;
    sqlx::migrate!("./sql").run(&db).await?;

    let source = config.sources.first().ok_or_else(|| anyhow!("no sources defined"))?;

    let mut queue = ScanQueue::default();

    pica::db::list_media_ids(&mut db.begin().await?)
        .await?
        .into_iter().for_each(|id| queue.done(id));

    let queue = Arc::new(Mutex::new(queue));

    let scanner = Scanner::new(&source.path, queue.clone());

    tokio::task::spawn_blocking(move || {
        loop {
            info!("Scanning for new media files...");
            scanner.scan();

            std::thread::sleep(Duration::from_secs(10));
        }
    });

    // start four indexer queues
    for _ in 0..4 {
        let indexer = Indexer::new(db.clone(), queue.clone());
        tokio::task::spawn(indexer.run());
    }

    let sizes = media::Sizes {
        thumb: config.thumb_size,
        preview: config.preview_size,
    };

    let store = MediaStore::new(db);
    let scaler = MediaScaler::new(1024 * 1024 * 1024);
    let media = MediaAccessor::new(&config.thumbs, scaler, sizes);

    pica_web::serve(store, media).await?;

    Ok(())
}

