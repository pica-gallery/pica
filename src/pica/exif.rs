use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use chrono::{DateTime, NaiveDateTime, Utc};
use exif::{Exif, In, Tag};

pub enum Orientation {
    Original,
    FlipH,
    Rotate180,
    FlipHRotate180,
    FlipHRotate270,
    Rotate90,
    FlipHRotate90,
    Rotate270,
}

impl Orientation {
    pub fn transposed(&self) -> bool {
        match self {
            Orientation::Rotate180 => true,
            Orientation::FlipHRotate270 => true,
            Orientation::Rotate90 => true,
            Orientation::FlipHRotate90 => true,
            Orientation::Rotate270 => true,
            _ => false,
        }
    }
}

pub struct ExifInfo {
    pub exif: Exif,
    pub orientation: Orientation,
    pub timestamp: Option<DateTime<Utc>>,
}

pub fn parse_exif(path: impl AsRef<Path>) -> anyhow::Result<Option<ExifInfo>> {
    let mut fp = BufReader::new(File::open(path)?);

    let parsed = match exif::Reader::new().read_from_container(&mut fp) {
        Ok(data) => data,
        Err(exif::Error::NotFound(_)) => return Ok(None),
        Err(err) => return Err(err.into()),
    };

    let timestamp = match parsed.get_field(Tag::DateTimeOriginal, In::PRIMARY) {
        Some(tag) => {
            match &tag.value {
                exif::Value::Ascii(ascii_values) if !ascii_values.is_empty() => {
                    let datestr = std::str::from_utf8(&ascii_values[0])?;
                    Some(NaiveDateTime::parse_from_str(datestr, "%Y:%m:%d %H:%M:%S")?.and_utc())
                }

                _ => None,
            }
        }

        _ => None,
    };

    let orientation = parsed.get_field(Tag::Orientation, In::PRIMARY)
        .map(|f| parse_orientation(f.value.get_uint(0)))
        .unwrap_or(Orientation::Original);

    Ok(ExifInfo { exif: parsed, timestamp, orientation })
}

fn parse_orientation(value: Option<u32>) -> Orientation {
    match value {
        Some(2) => Orientation::FlipH,
        Some(3) => Orientation::Rotate180,
        Some(4) => Orientation::FlipHRotate180,
        Some(5) => Orientation::FlipHRotate270,
        Some(6) => Orientation::Rotate90,
        Some(7) => Orientation::FlipHRotate90,
        Some(8) => Orientation::Rotate270,
        _ => Orientation::Original,
    }
}
