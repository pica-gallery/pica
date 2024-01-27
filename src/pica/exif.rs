use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use anyhow::Result;
use chrono::{DateTime, NaiveDateTime, Utc};
use exif::{Exif, Field, In, Tag, Value};
use serde::Serialize;

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
        matches!(self,
            | Orientation::Rotate180
            | Orientation::FlipHRotate270
            | Orientation::Rotate90
            | Orientation::FlipHRotate90
            | Orientation::Rotate270
        )
    }
}

pub struct ExifInfo {
    pub exif: Exif,
    pub orientation: Orientation,
    pub timestamp: Option<DateTime<Utc>>,
    pub latitude: Option<f32>,
    pub longitude: Option<f32>,
}

pub fn parse_exif(path: impl AsRef<Path>) -> anyhow::Result<Option<ExifInfo>> {
    let mut fp = BufReader::new(File::open(path)?);

    let parsed = match exif::Reader::new().read_from_container(&mut fp) {
        Ok(data) => data,
        Err(exif::Error::NotFound(_)) => return Ok(None),
        Err(err) => return Err(err.into()),
    };

    let timestamp = match parsed.get_field(Tag::DateTimeOriginal, In::PRIMARY) {
        Some(Field { value: Value::Ascii(ascii_values), .. }) if !ascii_values.is_empty() => {
            let datestr = std::str::from_utf8(&ascii_values[0])?;
            Some(NaiveDateTime::parse_from_str(datestr, "%Y:%m:%d %H:%M:%S")?.and_utc())
        }

        _ => None,
    };

    let latitude = parse_gps_coordinate_value(parsed.get_field(Tag::GPSLatitude, In::PRIMARY));
    let latitude_ref = parse_gps_coordinate_ref(parsed.get_field(Tag::GPSLatitudeRef, In::PRIMARY));
    let longitude = parse_gps_coordinate_value(parsed.get_field(Tag::GPSLongitude, In::PRIMARY));
    let longitude_ref = parse_gps_coordinate_ref(parsed.get_field(Tag::GPSLongitudeRef, In::PRIMARY));

    // multiply with east/west and north/south factor
    let latitude = latitude.and_then(|value| Some(value * latitude_ref?));
    let longitude = longitude.and_then(|value| Some(value * longitude_ref?));

    let orientation = parsed.get_field(Tag::Orientation, In::PRIMARY)
        .map(|f| parse_orientation(f.value.get_uint(0)))
        .unwrap_or(Orientation::Original);

    Ok(Some(ExifInfo { exif: parsed, timestamp, orientation, latitude, longitude }))
}

fn parse_gps_coordinate_value(field: Option<&Field>) -> Option<f32> {
    let values = match &field?.value {
        Value::Rational(values) => values.get(..3)?,
        _ => return None,
    };

    Some(values[0].to_f32() + values[1].to_f32() / 60.0 + values[2].to_f32() / 3600.0)
}

fn parse_gps_coordinate_ref(field: Option<&Field>) -> Option<f32> {
    let value = match &field?.value {
        Value::Ascii(values) => values.first().and_then(|value| value.first()),
        _ => return None,
    };

    match value {
        Some(b'w' | b'W' | b's' | b'S') => Some(-1.0),
        Some(b'e' | b'E' | b'n' | b'N') => Some(1.0),
        _ => None,
    }
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

#[derive(Serialize)]
#[serde(transparent)]
pub struct GenericExif(HashMap<String, String>);

pub fn parse_exif_generic(path: impl AsRef<Path>) -> Result<Option<GenericExif>> {
    let mut fp = BufReader::new(File::open(path)?);

    let parsed = match exif::Reader::new().read_from_container(&mut fp) {
        Ok(data) => data,
        Err(exif::Error::NotFound(_)) => return Ok(None),
        Err(err) => return Err(err.into()),
    };

    let fields = parsed.fields()
        .filter(|field| field.ifd_num == In::PRIMARY)
        .map(|field| (field.tag.to_string(), field.display_value().to_string()))
        .collect();

    Ok(Some(GenericExif(fields)))
}
