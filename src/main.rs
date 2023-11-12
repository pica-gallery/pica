use std::cmp::Reverse;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use indicatif::ProgressIterator;
use tokio::spawn;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use tracing::{debug, info, warn};

use crate::pica::cache::Cache;
use crate::pica::media::MediaAccessor;
use crate::pica::MediaStore;
use crate::pica::scale::MediaScaler;

pub mod pica;
pub mod pica_web;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let config = pica::config::load("./pica.config.yaml")?;

    let cache = Cache::new(&config.cache)?;

    let source = config.sources.first().ok_or_else(|| anyhow!("no sources defined"))?;

    info!("Looking for files in {:?}", source.path);
    let images = pica::list(&cache, &source.path)?;

    // max one gig of memory
    let scaler = MediaScaler::new(1024 * 1024 * 1024);
    let media = MediaAccessor::new(&config.thumbs, scaler);

    let store = MediaStore::new(images);

    let sizes = vec![config.thumb_size, config.preview_size];
    spawn(prepare(media.clone(), sizes, store.clone()));

    pica_web::serve(store, media).await?;

    Ok(())
}

async fn prepare(accessor: MediaAccessor, sizes: Vec<u32>, store: MediaStore) {
    let semaphore = Arc::new(Semaphore::new(16));
    let mut tasks = JoinSet::new();

    // get all items
    let mut items = store.items().await;

    // sort them by timestamp desc
    items.sort_by_key(|item| Reverse(item.info.timestamp));

    for item in items.iter().progress() {
        for &size in &sizes {
            let item = item.clone();

            // get a permit to schedule the job
            let Ok(permit) = semaphore.clone().acquire_owned().await else {
                warn!("Semaphore is closed");
                break;
            };

            let accessor = accessor.clone();

            let task = async move {
                debug!("Scaling {:?} to size {}", item.path, size);

                if let Err(err) = accessor.get(&item, size).await {
                    warn!("Failed to scale {:?} to size {}: {:?}", item.path, size, err)
                }

                // free the permit
                drop(permit);
            };

            tasks.spawn(task);
        }
    }

    info!("Waiting for tasks to finish");
    while let Some(result) = tasks.join_next().await {
        if let Err(err) = result {
            warn!("Joining task failed: {:?}", err)
        }
    }

    info!("All files are now prepared");
}
