use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Result};
use tokio::sync::Mutex;
use tracing::info;

use crate::pica::index::{Indexer, Scanner};
use crate::pica::accessor;
use crate::pica::accessor::MediaAccessor;
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

    let sizes = accessor::Sizes {
        thumb: config.thumb_size,
        preview: config.preview_size,
    };

    let store = MediaStore::new(db.clone());
    let scaler = MediaScaler::new(1024 * 1024 * 1024);
    let media = MediaAccessor::new(db.clone(), scaler, sizes, &source.path);

    // start four indexer queues
    for _ in 0..4 {
        let indexer = Indexer::new(db.clone(), queue.clone(), media.clone());
        tokio::task::spawn(indexer.run());
    }


    pica_web::serve(store, media).await?;

    Ok(())
}

