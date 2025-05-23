use crate::info;
use arcstr::ArcStr;
use itertools::Itertools;
use std::borrow::Cow;
use std::cmp::Reverse;
use std::collections::HashMap;
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tracing::instrument;

use crate::pica::{Album, AlbumId, AlbumInfo, MediaItem};

#[derive(Clone)]
pub struct Config {
    // regex that identifies a directory as an album. To identify all directories as an album,
    // use a regex that matches any name
    pub classify_as_album: regex::bytes::Regex,

    // a regex to clean the name of an album,
    // e.g. removing a date prefix from the directory, if any,
    pub strip_title: Option<regex::Regex>,
}

#[instrument(skip_all)]
pub fn by_directory(conf: &Config, items: impl IntoIterator<Item = MediaItem>) -> Vec<Album> {
    let mut albums = HashMap::<PathBuf, Album>::new();

    info!("Path: {:?}", conf.classify_as_album);

    for item in items {
        let Some(parent) = item.relpath.parent() else {
            continue;
        };

        let Some(relpath) = parent.ancestors().find(|path| {
            path.file_name()
                .map(|path| path.as_bytes())
                .map(|name| conf.classify_as_album.is_match_at(name, 0))
                .unwrap_or_default()
        }) else {
            continue;
        };

        let name = relpath
            .file_name()
            .and_then(|f| f.to_str())
            .map(|name| cleanup_album_title(conf, name))
            .unwrap_or("Unknown".into());

        let album = albums.entry(relpath.into()).or_insert_with_key(|relpath| {
            let info = AlbumInfo {
                id: album_id_for_relpath(relpath),
                name: ArcStr::from(name),
                timestamp: item.info.timestamp,
            };

            Album {
                info,
                relpath: Some(Arc::new(relpath.clone())),
                items: Vec::new(),
                cover: item.clone(),
            }
        });

        album.info.timestamp = album.info.timestamp.max(item.info.timestamp);
        album.items.push(item);
    }

    // get a sorted list of all albums
    let mut albums = albums
        .into_values()
        .sorted_unstable_by_key(|a| a.info.timestamp)
        .collect_vec();

    // sort items within all albums by time, descending
    for album in &mut albums {
        album.items.sort_by_key(|item| Reverse(item.info.timestamp));
        album.cover = album.items[0].clone();
    }

    albums
}

fn cleanup_album_title<'a>(config: &Config, title: &'a str) -> Cow<'a, str> {
    match &config.strip_title {
        None => title.into(),
        Some(re) => re.replace_all(title, ""),
    }
}

fn album_id_for_relpath(path: &Path) -> AlbumId {
    let hash = sha1_smol::Sha1::from(path.as_os_str().as_bytes()).digest().bytes();

    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&hash[..8]);
    bytes[0] = 0x7f;

    AlbumId::from(bytes)
}
