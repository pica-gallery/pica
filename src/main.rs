use anyhow::{anyhow, Result};
use indicatif::ProgressIterator;
use tokio::spawn;

use crate::pica::cache::Cache;
use crate::pica::index::IndexTask;
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

    let store = MediaStore::new();
    let scaler = MediaScaler::new(1024 * 1024 * 1024);
    let media = MediaAccessor::new(&config.thumbs, scaler);

    // start indexing in the background
    spawn({
        pica::index::index(IndexTask {
            root: source.path.clone(),
            cache: Cache::new(&config.cache)?,
            store: store.clone(),
            media: media.clone(),
            sizes: vec![config.thumb_size, config.preview_size],
        })
    });

    pica_web::serve(store, media).await?;

    Ok(())
}
