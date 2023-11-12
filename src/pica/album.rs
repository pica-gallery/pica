use std::collections::HashMap;
use std::os::unix::prelude::OsStrExt;

use itertools::Itertools;
use regex::bytes::Regex;

use crate::pica::{Album, MediaItem};

pub fn by_directory(images: Vec<MediaItem>) -> Vec<Album> {
    let re_album = Regex::new(r#"20\d\d-[01]\d-[0123]\d "#).unwrap();

    let mut albums = HashMap::<String, Album>::new();

    for image in images {
        let name = image.path.iter().rev().skip(1).find_map(|segment| {
            let is_match = re_album.is_match_at(segment.as_bytes(), 0);
            if is_match { std::str::from_utf8(segment.as_bytes()).ok() } else { None }
        });

        let Some(name) = name else {
            continue;
        };

        let album = albums.entry(name.to_string()).or_insert_with_key(|name| {
            Album {
                items: Vec::new(),
                name: name.clone(),
                timestamp: image.info.timestamp,
            }
        });

        album.timestamp = album.timestamp.min(image.info.timestamp);
        album.items.push(image);
    }

    // get a sorted list of all albums
    let mut albums = albums.into_values()
        .sorted_unstable_by_key(|a| a.timestamp)
        .collect_vec();

    // sort images within all albums by time
    for album in &mut albums {
        album.items.sort_by_key(|item| item.info.timestamp)
    }

    albums
}
