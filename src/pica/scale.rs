use std::ffi::OsString;
use std::fs;
use std::path::Path;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use image::image_dimensions;
use tempfile::NamedTempFile;
use tokio::sync::Semaphore;
use tokio::task::spawn_blocking;

#[derive(Clone)]
pub struct MediaScaler {
    max_memory: u32,
    memory: Arc<Semaphore>,
}

impl MediaScaler {
    pub fn new(max_memory: u32) -> Self {
        MediaScaler {
            max_memory,
            memory: Arc::new(Semaphore::new(max_memory as usize)),
        }
    }

    /// Generate a resized version of an image
    pub async fn image(&self, path: impl AsRef<Path>, size: u32) -> Result<Image> {
        let (width, height) = image_dimensions(path.as_ref())?;

        // reserve some bytes to load the image into memory
        let _guard = self.memory
            .acquire_many(self.max_memory.min(width * height * 4))
            .await?;

        let path = path.as_ref().to_owned();

        // run resize in a different task to not block the executor
        let bytes = spawn_blocking(move || resize(path, "avif", size)).await??;

        let thumb = Image { typ: ImageType::AVIF, bytes };
        Ok(thumb)
    }
}

pub enum ImageType {
    JPEG,
    AVIF,
}

pub struct Image {
    pub typ: ImageType,
    pub bytes: Vec<u8>,
}

fn resize(source: impl AsRef<Path>, format: &str, size: u32) -> Result<Vec<u8>> {
    use std::process::Command;

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
        .arg("65")
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
