use std::ffi::OsString;
use std::fmt::Debug;
use std::fs;
use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{ImageFormat, ImageReader};
use tempfile::NamedTempFile;
use tokio::task::spawn_blocking;
use tracing::{debug_span, instrument, Instrument};

use pica_image::exif::{parse_exif, Orientation};
use ultrahdr_rs::{Jpeg, SegmentKind};

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
    pub prefer_ultra_hdr: bool,
    pub use_image_magick: bool,
    pub image_type: ImageType,
}

#[derive(Clone)]
pub struct MediaScaler {
    options: Options,
}

impl MediaScaler {
    pub fn new(options: Options) -> Self {
        MediaScaler {
            options,
        }
    }

    /// Generate a resized version of an image
    #[instrument(skip_all, fields(? path, size))]
    pub async fn scaled(&self, path: impl AsRef<Path> + Debug, size: u32) -> Result<Image> {
        // run resize in a different task to not block the executor
        let bytes = self.resize(path.as_ref(), size)
            .instrument(debug_span!("resize"))
            .await?;

        let thumb = Image {
            typ: self.options.image_type.clone(),
            blob: bytes,
        };
        Ok(thumb)
    }

    async fn resize(&self, path: impl AsRef<Path>, size: u32) -> Result<Vec<u8>> {
        let path = PathBuf::from(path.as_ref());
        let options = self.options.clone();

        let span = debug_span!("resize-inner");

        let task = move || {
            let _entered = span.entered();

            if options.prefer_ultra_hdr {
                if ultrahdr_rs::is_ultrahdr(BufReader::new(File::open(&path)?))? {
                    return resize_ultrahdr(&path, size);
                }
            }

            if options.use_image_magick {
                resize_imagemagick(&path, &options.image_type, size)
            } else {
                resize_rust(&path, &options.image_type, size)
            }
        };

        spawn_blocking(task).await?
    }
}

/// Resizes the image using image magick.
#[instrument(skip_all, fields(? source, format, size))]
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
        .arg("-interlace").arg("Plane")
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

#[instrument(skip_all, fields(? source, format, size))]
fn resize_rust(source: &Path, format: &ImageType, size: u32) -> Result<Vec<u8>> {
    let rotate = parse_exif(source).ok().flatten().map(|r| r.orientation);

    let mut image = {
        let _span = debug_span!("read image");
        ImageReader::open(source)?.with_guessed_format()?.decode()?
    };

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

    let scaled = if image.width() < size && image.height() < size {
        // no resize needed
        image
    } else if size >= 512 {
        let _span = debug_span!("resize gaussian", size=?size).entered();
        image.resize(size, size, FilterType::Gaussian)
    } else {
        let _span = debug_span!("resize thumbnail", size=?size).entered();
        image.thumbnail(size, size)
    };

    let mut writer = Vec::new();

    match format {
        ImageType::Jpeg => {
            let _span = debug_span!("write jpeg").entered();
            scaled.write_with_encoder(JpegEncoder::new_with_quality(&mut writer, 60))?;
        }

        ImageType::Avif => {
            let _span = debug_span!("write avif").entered();
            scaled.write_with_encoder(image::codecs::avif::AvifEncoder::new_with_speed_quality(
                &mut writer,
                10,
                60,
            ))?;
        }
    };

    Ok(writer)
}

#[instrument(skip_all, fields(? source, format, size))]
fn resize_ultrahdr(source: &Path, size: u32) -> Result<Vec<u8>> {
    // check if the image needs rotating
    let rotate = parse_exif(source).ok().flatten().map(|r| r.orientation);

    // load the ultra hdr image to memory
    let r = BufReader::new(File::open(source)?);
    let uhdr = ultrahdr_rs::UltraHDR::from_reader(r)?;

    let primary = resize_jpeg(&uhdr.primary, &rotate, size)?;
    let mut gainmap = resize_jpeg(&uhdr.gainmap, &rotate, size / 4)?;

    // copy gainmap xmp info from original gainmap
    // TODO make this nicer
    let xmp = uhdr.gainmap.segments
        .into_iter()
        .find(|seg| matches!(&seg.kind, SegmentKind::App(app) if app.has_prefix(b"http://ns.adobe.com/xap/1.0/\0")))
        .ok_or_else(|| anyhow!("did not find gainmap in source"))?;

    // put it after app0 tag
    gainmap.segments.insert(2, xmp);

    // write a new uhdr image
    //  TODO add the necessary segments to the jpegs
    let mut buf = Vec::new();
    ultrahdr_rs::write_ultra_hdr(&mut buf, &primary, &gainmap)?;

    Ok(buf)
}

fn resize_jpeg(jpeg: &Jpeg, rotate: &Option<Orientation>, size: u32) -> Result<Jpeg> {
    // resize the primary image
    let image = BufReader::new(jpeg.as_read());
    let image = image::load(image, ImageFormat::Jpeg)?;

    // rotate image if required
    let image = match rotate {
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

    // encode image as jpeg to a Vec
    let mut encoded = Vec::new();
    scaled.write_with_encoder(JpegEncoder::new_with_quality(&mut encoded, 60))?;

    // parse image back into a jpeg
    let result = Jpeg::from_bytes(encoded)?;

    Ok(result)
}
