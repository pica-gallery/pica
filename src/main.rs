use std::time::Duration;

use anyhow::{anyhow, Result};
use tokio::spawn;
use tokio::time::timeout;
use tracing::warn;

use crate::pica::cache::Cache;
use crate::pica::index::IndexTask;
use crate::pica::media;
use crate::pica::media::MediaAccessor;
use crate::pica::scale::MediaScaler;
use crate::pica::store::MediaStore;

pub mod pica;
pub mod pica_web;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let config = pica::config::load("./pica.config.yaml")?;

    let source = config.sources.first().ok_or_else(|| anyhow!("no sources defined"))?;

    let sizes = media::Sizes {
        thumb: config.thumb_size,
        preview: config.preview_size,
    };

    let store = MediaStore::new();
    let scaler = MediaScaler::new(1024 * 1024 * 1024);
    let media = MediaAccessor::new(&config.thumbs, scaler, sizes);

    // start indexing in the background
    spawn({
        let task = IndexTask {
            root: source.path.clone(),
            store: store.clone(),
            media: media.clone(),
            cache: Cache::new(&config.cache)?,
        };

        async move {
            loop {
                let index = pica::index::index(task.clone());

                // restart indexing after a short while to get the most recent files
                match timeout(Duration::from_secs(120), index).await {
                    Ok(Err(err)) => {
                        warn!("Indexing failed: {:?}", err);
                    }

                    Err(_) => {
                        // timeout, try again
                        warn!("Indexing timed out, trying again");
                        continue;
                    }

                    _ => (),
                }

                // wait a moment before trying to import again
                tokio::time::sleep(Duration::from_secs(120)).await;
            }
        }
    });

    pica_web::serve(store, media).await?;

    Ok(())
}
