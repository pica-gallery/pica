use std::cmp::Reverse;
use std::collections::HashMap;
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};

use itertools::Itertools;

use crate::pica::{Album, AlbumId, MediaItem};

pub fn by_directory(items: impl IntoIterator<Item=MediaItem>) -> Vec<Album> {
    let re_album = regex::bytes::Regex::new(r#"Sony|staging|20\d\d-[01]\d-[0123]\d "#).unwrap();
    let re_clean = regex::Regex::new(r#"^20\d\d-[01]\d-[0123]\d\s+"#).unwrap();

    let mut albums = HashMap::<PathBuf, Album>::new();

    for item in items {
        // let name = item.relpath.iter().rev().skip(1).find_map(|segment| {
        //     let is_match = re_album.is_match_at(segment.as_bytes(), 0);
        //     if is_match { std::str::from_utf8(segment.as_bytes()).ok() } else { None }
        // });

        let Some(parent) = item.relpath.parent() else {
            continue;
        };

        let relpath = parent.ancestors().find(|path| {
            let name = path.file_name().map(|path| path.as_bytes());
            name.map(|name| re_album.is_match_at(name, 0)).unwrap_or_default()
        });

        let Some(relpath) = relpath else {
            continue;
        };

        let name = relpath.file_name()
            .and_then(|f| f.to_str())
            .map(|name| re_clean.replace(name, ""))
            .unwrap_or("Unknown".into());

        let album = albums.entry(relpath.into()).or_insert_with_key(|_relpath| {
            Album {
                id: album_id_for_relpath(relpath),
                name: name.into_owned(),
                timestamp: item.info.timestamp,
                relpath: Some(relpath.into()),
                items: Vec::new(),
                cover: item.clone(),
            }
        });

        album.timestamp = album.timestamp.max(item.info.timestamp);
        album.items.push(item);
    }

    // get a sorted list of all albums
    let mut albums = albums.into_values()
        .sorted_unstable_by_key(|a| a.timestamp)
        .collect_vec();

    // sort items within all albums by time, descending
    for album in &mut albums {
        album.items.sort_by_key(|item| Reverse(item.info.timestamp));
        album.cover = album.items[0].clone();
    }

    albums
}

fn album_id_for_relpath(path: &Path) -> AlbumId {
    let hash = sha1_smol::Sha1::from(path.as_os_str().as_bytes()).digest().bytes();

    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&hash[..8]);
    bytes[0] = 0x7f;

    AlbumId::from(bytes)
}
