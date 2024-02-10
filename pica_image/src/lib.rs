use std::fmt::Debug;
use std::fs::File;
use std::io::{BufReader, Cursor, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use tempfile::TempPath;
use tracing::{info, instrument};

mod crx;
pub mod exif;

pub fn get(path: impl AsRef<Path> + Into<PathBuf>) -> Result<MediaFileRef> {
    match MediaType::from_path(path.as_ref()) {
        Some(MediaType::GenericImage) => Ok(MediaFileRef::Persistent(path.into())),
        Some(MediaType::GenericVideo) => todo!(),
        Some(MediaType::Arw) => extract_thumbnail_arw(path.as_ref()),
        Some(MediaType::Cr3) => extract_thumbnail_cr3(path.as_ref()),
        None => Err(anyhow!("unknown media type for {:?}", path.as_ref())),
    }
}

#[instrument(skip_all, fields(? path))]
fn extract_thumbnail_cr3(path: &Path) -> Result<MediaFileRef> {
    let fp = BufReader::new(File::open(path)?);

    // find preview in file
    let mut preview = crx::read_preview(fp)?.ok_or_else(|| anyhow!("no preview in {:?}", path))?;

    // copy it to a temporary file
    let mut jpeg = tempfile::Builder::new().suffix(".jpg").tempfile()?;

    std::io::copy(&mut preview, &mut jpeg)?;
    jpeg.flush()?;

    Ok(MediaFileRef::Temporary(jpeg.into_temp_path()))
}

#[instrument(skip_all, fields(? path))]
fn extract_thumbnail_arw(path: &Path) -> Result<MediaFileRef> {
    use ::exif::*;

    let mut fp = BufReader::new(File::open(path)?);

    // read a little bit if the file into memory
    let mut buf = Vec::new();
    (&mut fp).take(1024 * 1024).read_to_end(&mut buf)?;

    // parse the exif data
    let parsed = Reader::new().read_from_container(&mut Cursor::new(buf))?;

    // find the preview image in the exif data
    let tag_preview_start = Tag(Context::Tiff, 513);
    let tag_preview_len = Tag(Context::Tiff, 514);

    let preview_start = parsed
        .get_field(tag_preview_start, In(0))
        .ok_or_else(|| anyhow!("PreviewImageStart not found"))?
        .value
        .get_uint(0)
        .ok_or_else(|| anyhow!("no value for PreviewImageStart"))?;

    let preview_len = parsed
        .get_field(tag_preview_len, In(0))
        .ok_or_else(|| anyhow!("PreviewImageLength not found"))?
        .value
        .get_uint(0)
        .ok_or_else(|| anyhow!("no value for PreviewImageLength"))?;

    info!("Preview starts at {} with {} bytes", preview_start, preview_len);

    fp.seek(SeekFrom::Start(preview_start as u64))?;

    let mut jpeg = tempfile::Builder::new().suffix(".jpg").tempfile()?;

    std::io::copy(&mut fp.take(preview_len as u64), &mut jpeg)?;
    jpeg.flush()?;

    Ok(MediaFileRef::Temporary(jpeg.into_temp_path()))
}

// A media file format
#[derive(Clone, Debug)]
pub enum MediaType {
    // simple generic image format like jpg, png or avif
    GenericImage,

    // a generic video format
    GenericVideo,

    // sony arw file
    Arw,

    // canon raw file
    Cr3,
}

impl MediaType {
    pub fn from_path(path: impl AsRef<Path>) -> Option<Self> {
        // get format from file extension
        let extension = path.as_ref().extension()?.to_str()?;

        let format = match extension.to_ascii_lowercase().as_str() {
            "jpg" | "jpeg" | "png" | "avif" => MediaType::GenericImage,
            "mp4" | "avi" | "mov" | "mkv" => MediaType::GenericVideo,
            "arw" => MediaType::Arw,
            "cr3" => MediaType::Cr3,
            _ => return None,
        };

        Some(format)
    }

    pub fn is_raw(&self) -> bool {
        matches!(self, Self::Arw | Self::Cr3)
    }
}

#[derive(Debug)]
pub enum MediaFileRef {
    Temporary(TempPath),
    Persistent(PathBuf),
}

impl AsRef<Path> for MediaFileRef {
    fn as_ref(&self) -> &Path {
        match self {
            MediaFileRef::Temporary(p) => p.as_ref(),
            MediaFileRef::Persistent(p) => p.as_ref(),
        }
    }
}
