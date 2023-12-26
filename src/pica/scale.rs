use std::ffi::OsString;
use std::fs;
use std::num::NonZeroU64;
use std::path::Path;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use image::image_dimensions;
use tempfile::NamedTempFile;
use tokio::sync::Semaphore;
use tokio::task::spawn_blocking;

#[derive(Clone)]
pub enum ImageType {
    Jpeg,
    Avif,
}

#[derive(Clone)]
pub struct Options {
    pub use_image_magick: bool,
    pub image_type: ImageType,
    pub max_memory: NonZeroU64,
}

#[derive(Clone)]
pub struct MediaScaler {
    options: Options,
    memory: Arc<Semaphore>,
}

impl MediaScaler {
    pub fn new(options: Options) -> Self {
        MediaScaler {
            memory: Arc::new(Semaphore::new(options.max_memory.get() as _)),
            options,
        }
    }

    /// Generate a resized version of an image
    pub async fn image(&self, path: impl AsRef<Path>, size: u32) -> Result<Image> {
        let (width, height) = image_dimensions(path.as_ref())?;

        // memory to reserve
        let memory = self.options.max_memory.get().min(width as u64 * height as u64 * 4);

        // reserve some bytes to load the image into memory
        let _guard = self.memory
            .acquire_many(u32::try_from(memory).unwrap_or(u32::MAX))
            .await?;

        let path = path.as_ref().to_owned();
        let image_type = self.options.image_type.clone();

        // run resize in a different task to not block the executor
        let bytes = spawn_blocking(move || resize(path, &image_type, size)).await??;

        let thumb = Image { typ: ImageType::Avif, bytes };
        Ok(thumb)
    }
}

pub struct Image {
    pub typ: ImageType,
    pub bytes: Vec<u8>,
}

fn resize(source: impl AsRef<Path>, format: &ImageType, size: u32) -> Result<Vec<u8>> {
    use std::process::Command;

    let format = match format {
        ImageType::Jpeg => "jpeg",
        ImageType::Avif => "avif",
    };

    // a temporary file that will cleanup after itself
    let target = NamedTempFile::new()?;

    // include iamge format into target location
    let mut target_avif = OsString::from(format);
    target_avif.push(":");
    target_avif.push(target.as_ref());

    let res = Command::new("convert")
        .arg("-auto-orient")
        .arg("-resize")
        .arg(format!("{}x{}", size, size))
        .arg("-quality")
        .arg("60")
        .arg(source.as_ref())
        .arg(target_avif)
        .output()?;

    if !res.status.success() {
        return Err(anyhow!("resize failed with status {:?}", res.status.code()));
    }

    // read bytes of the target file
    let bytes = fs::read(target)?;

    Ok(bytes)
}
