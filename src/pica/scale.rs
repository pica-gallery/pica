use std::ffi::OsString;
use std::fmt::Debug;
use std::fs;
use std::num::NonZeroU64;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{anyhow, Result};
use image::imageops::FilterType;
use image::{image_dimensions, io};
use sqlx::__rt::spawn_blocking;
use tempfile::NamedTempFile;
use tokio::sync::Semaphore;
use tracing::instrument;

use pica_image::exif::{parse_exif, Orientation};

pub struct Image {
    pub typ: ImageType,
    pub blob: Vec<u8>,
}

#[derive(Clone, Debug)]
pub enum ImageType {
    Jpeg,
    Avif,
}

impl ImageType {
    pub fn mime_type(&self) -> &'static str {
        match self {
            ImageType::Jpeg => "image/jpeg",
            ImageType::Avif => "image/avif",
        }
    }
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
    #[instrument(skip_all, fields(?path, size))]
    pub async fn image(&self, path: impl AsRef<Path> + Debug, size: u32) -> Result<Image> {
        let (width, height) = image_dimensions(path.as_ref())?;

        // memory to reserve
        let memory = self.options.max_memory.get().min(width as u64 * height as u64 * 4);

        // reserve some bytes to load the image into memory
        let _guard = self
            .memory
            .acquire_many(u32::try_from(memory).unwrap_or(u32::MAX))
            .await?;

        // run resize in a different task to not block the executor
        let bytes = self.resize(path.as_ref(), size).await?;

        let thumb = Image {
            typ: self.options.image_type.clone(),
            blob: bytes,
        };
        Ok(thumb)
    }

    async fn resize(&self, path: impl AsRef<Path>, size: u32) -> Result<Vec<u8>> {
        let path = PathBuf::from(path.as_ref());
        let format = self.options.image_type.clone();
        let use_image_magick = self.options.use_image_magick;

        let task = move || {
            if use_image_magick {
                resize_imagemagick(&path, &format, size)
            } else {
                resize_rust(&path, &format, size)
            }
        };

        spawn_blocking(task).await
    }
}

/// Resizes the image using image magick.
#[instrument(skip_all, fields(?source, format, size))]
fn resize_imagemagick(source: &Path, format: &ImageType, size: u32) -> Result<Vec<u8>> {
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
        .arg("-strip")
        .arg(source)
        .arg(target_avif)
        .output()?;

    if !res.status.success() {
        return Err(anyhow!("resize failed with status {:?}", res.status.code()));
    }

    // read bytes of the target file
    let bytes = fs::read(target)?;

    Ok(bytes)
}

#[instrument(skip_all, fields(?source, format, size))]
fn resize_rust(source: &Path, format: &ImageType, size: u32) -> Result<Vec<u8>> {
    let rotate = parse_exif(source).ok().flatten().map(|r| r.orientation);

    let mut image = io::Reader::open(source)?.with_guessed_format()?.decode()?;

    image = match rotate {
        Some(Orientation::FlipH) => image.fliph(),
        Some(Orientation::Rotate180) => image.rotate180(),
        Some(Orientation::FlipHRotate180) => image.fliph().rotate180(),
        Some(Orientation::FlipHRotate270) => image.fliph().rotate270(),
        Some(Orientation::Rotate90) => image.rotate90(),
        Some(Orientation::FlipHRotate90) => image.fliph().rotate90(),
        Some(Orientation::Rotate270) => image.rotate270(),
        _ => image,
    };

    let scaled = if size >= 512 {
        image.resize(size, size, FilterType::Gaussian)
    } else {
        image.thumbnail(size, size)
    };

    let mut writer = Vec::new();

    match format {
        ImageType::Jpeg => {
            scaled.write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, 60))?;
        }

        ImageType::Avif => {
            scaled.write_with_encoder(image::codecs::avif::AvifEncoder::new_with_speed_quality(
                &mut writer,
                10,
                60,
            ))?;
        }
    };

    Ok(writer)
}
