use std::cmp::Reverse;
use std::collections::HashMap;
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use arcstr::ArcStr;

use itertools::Itertools;
use tracing::instrument;

use crate::pica::{Album, AlbumId, AlbumInfo, MediaItem};

#[instrument(skip_all)]
pub fn by_directory(items: impl IntoIterator<Item=MediaItem>) -> Vec<Album> {
    let re_album = regex::bytes::Regex::new(r#"Sony|staging|20\d\d-[01]\d-[0123]\d "#).unwrap();
    let re_clean = regex::Regex::new(r#"^20\d\d-[01]\d-[0123]\d\s+"#).unwrap();

    let mut albums = HashMap::<PathBuf, Album>::new();
    
    for item in items {
        let Some(parent) = item.relpath.parent() else {
            continue;
        };

        let Some(relpath) = parent.ancestors().find(|path| {
            let name = path.file_name().map(|path| path.as_bytes());
            name.map(|name| re_album.is_match_at(name, 0)).unwrap_or_default()
        }) else {
            continue;
        };

        let name = relpath.file_name()
            .and_then(|f| f.to_str())
            .map(|name| re_clean.replace(name, ""))
            .unwrap_or("Unknown".into());

        let album = albums.entry(relpath.into()).or_insert_with_key(|_relpath| {
            let info = AlbumInfo {
                id: album_id_for_relpath(relpath),
                name: ArcStr::from(name),
                timestamp: item.info.timestamp,
            };

            Album {
                info,
                relpath: Some(relpath.to_owned().into()),
                items: Vec::new(),
                cover: item.clone(),
            }
        });

        album.info.timestamp = album.info.timestamp.max(item.info.timestamp);
        album.items.push(item);
    }

    // get a sorted list of all albums
    let mut albums = albums.into_values()
        .sorted_unstable_by_key(|a| a.info.timestamp)
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
