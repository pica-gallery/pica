use std::num::NonZeroU64;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Result};
use opentelemetry::global;
use tokio::sync::Mutex;
use tokio::time::sleep;
use tracing::info;
use tracing_subscriber::filter::LevelFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer};

use crate::pica::accessor::{MediaAccessor, Storage};
use crate::pica::config::ImageCodecConfig;
use crate::pica::index::{Indexer, Scanner};
use crate::pica::queue::ScanQueue;
use crate::pica::scale::{ImageType, MediaScaler};
use crate::pica::store::MediaStore;
use crate::pica::{accessor, scale};

pub mod pica;
pub mod pica_web;

fn initialize_tracing(jaeger_endpoint: Option<String>) -> Result<()> {
    let opentelemetry = jaeger_endpoint
        .map(|jaeger_endpoint| -> Result<_> {
            // Allows you to pass along context (i.e., trace IDs) across services
            global::set_text_map_propagator(opentelemetry_jaeger::Propagator::new());

            // Sets up the machinery needed to export data to Jaeger
            let tracer = opentelemetry_jaeger::new_agent_pipeline()
                .with_endpoint(jaeger_endpoint)
                .with_service_name("pica")
                .install_simple()?;

            // Create a tracing layer with the configured tracer
            Ok(tracing_opentelemetry::layer().with_tracer(tracer))
        })
        .transpose()?;

    // The SubscriberExt and SubscriberInitExt traits are needed to extend the
    // Registry to accept `opentelemetry (the OpenTelemetryLayer type).
    let env_filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env_lossy();

    let fmt = tracing_subscriber::fmt::Layer::default().with_filter(env_filter);

    tracing_subscriber::registry()
        .with(opentelemetry)
        .with(fmt)
        .try_init()?;

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let config = pica::config::load("./pica.config.yaml")?;

    initialize_tracing(config.jaeger_tracing)?;

    // parse users from config
    let users: Vec<_> = config
        .users
        .into_iter()
        .map(|user| pica_web::User::new(user.name, user.passwd))
        .collect();

    info!("Open database at {:?}", config.database);
    let db = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(8)
        .connect(&config.database)
        .await?;

    sqlx::migrate!("./sql").run(&db).await?;

    let queue = Arc::new(Mutex::new(ScanQueue::default()));

    for source in &config.sources {
        info!("Starting scanner for source {:?}", source.name);
        let scanner = Scanner::new(&source.path, queue.clone(), &source.name);

        tokio::task::spawn(scanner_loop(
            scanner,
            Duration::from_secs(config.scan_interval_in_seconds.get() as _),
        ));
    }

    let sizes = accessor::Sizes {
        thumb: config.thumb_size,
        preview: config.preview_size,
    };

    let scaler_options = scale::Options {
        use_image_magick: config.use_image_magick,
        prefer_ultra_hdr: config.prefer_ultra_hdr,

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

    let sources = config
        .sources
        .iter()
        .map(|s| (s.name.clone(), s.path.clone()))
        .collect();

    let store = MediaStore::empty();
    let scaler = MediaScaler::new(scaler_options);
    let media = MediaAccessor::new(storage, scaler, sizes, sources);

    // start four indexer queues
    info!("Starting {} indexers", config.indexer_threads.get());
    for _ in 0..config.indexer_threads.get() {
        let indexer = Indexer::new(
            db.clone(),
            queue.clone(),
            store.clone(),
            (!config.lazy_thumbs).then(|| media.clone()),
        );
        tokio::task::spawn(indexer.run());
    }

    let opts = pica_web::Options {
        accessor: media,
        addr: config.http_address,
        sources: config.sources,
        store,
        users,
        db,
    };

    pica_web::serve(opts).await?;

    Ok(())
}

async fn scanner_loop(mut scanner: Scanner, interval: Duration) {
    loop {
        scanner.scan().await;
        sleep(interval).await;
    }
}
