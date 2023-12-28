use std::collections::HashMap;
use std::os::unix::ffi::OsStrExt;
use std::path::Path;

use itertools::Itertools;

use crate::pica::{Album, AlbumId, MediaItem};

pub fn by_directory(items: &[MediaItem]) -> Vec<Album<'_>> {
    // let re_album = regex::bytes::Regex::new(r#"20\d\d-[01]\d-[0123]\d "#).unwrap();

    let mut albums = HashMap::<&Path, Album>::new();

    for item in items {
        // let name = item.relpath.iter().rev().skip(1).find_map(|segment| {
        //     let is_match = re_album.is_match_at(segment.as_bytes(), 0);
        //     if is_match { std::str::from_utf8(segment.as_bytes()).ok() } else { None }
        // });

        let Some(parent) = item.relpath.parent() else {
            continue;
        };

        let name = parent.file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("Unknown");

        let album = albums.entry(&parent).or_insert_with_key(|_relpath| {
            Album {
                id: album_id_for_relpath(&parent),
                name: name.to_owned(),
                timestamp: item.info.timestamp,
                relpath: Some(parent.into()),
                items: Vec::new(),
            }
        });

        album.timestamp = album.timestamp.min(item.info.timestamp);
        album.items.push(item);
    }

    // get a sorted list of all albums
    let mut albums = albums.into_values()
        .sorted_unstable_by_key(|a| a.timestamp)
        .collect_vec();

    // sort items within all albums by time
    for album in &mut albums {
        album.items.sort_by_key(|item| item.info.timestamp)
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
