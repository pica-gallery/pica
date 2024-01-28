use std::sync::{Arc, OnceLock};

use anyhow::{anyhow, Result};
use arcstr::ArcStr;
use ordered_float::OrderedFloat;
use serde::Deserialize;

static DATA: &[u8] = include_bytes!("./worldcities.csv.gz");

#[derive(Deserialize)]
pub struct City {
    #[serde(rename = "city")]
    pub name: ArcStr,
    pub country: ArcStr,
    #[serde(rename = "lat")]
    pub latitude: f32,
    #[serde(rename = "lng")]
    pub longitude: f32,
}

pub fn nearest_city(latitude: f32, longitude: f32) -> Result<Option<&'static City>> {
    Ok(
        cities()?
            .iter()
            .min_by_key(|&city| OrderedFloat(distance_sqr(city, latitude, longitude))),
    )
}

fn distance_sqr(city: &City, latitude: f32, longitude: f32) -> f32 {
    let d_lat = city.latitude - latitude;
    let d_long = city.longitude - longitude;
    d_lat * d_lat + d_long * d_long
}

fn cities() -> Result<&'static [City]> {
    static CITIES: OnceLock<Result<Vec<City>>> = OnceLock::new();
    CITIES.get_or_init(parse).as_deref().map_err(|err| anyhow!("{:?}", err))
}

fn parse() -> Result<Vec<City>> {
    let mut r = csv::Reader::from_reader(flate2::read::GzDecoder::new(DATA));

    let mut cities = Vec::<City>::new();
    for record in r.deserialize() {
        cities.push(record?);
    }

    Ok(cities)
}
