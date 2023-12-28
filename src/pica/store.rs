use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use itertools::Itertools;
use sqlx::SqlitePool;
use tokio::sync::RwLock;

use crate::pica::{Album, AlbumId, db, MediaId, MediaItem};

struct MediaItemsState {
    items: HashMap<MediaId, MediaItem>,
}

#[derive(Clone)]
pub struct MediaStore {
    db: SqlitePool,

    // the current set of all media items.
    state: Arc<RwLock<MediaItemsState>>,
}


impl MediaStore {
    pub fn new(db: SqlitePool) -> Self {
        let items = MediaItemsState { items: HashMap::new() };
        Self { db, state: Arc::new(RwLock::new(items)) }
    }

    /// Adds a new item to the media store.
    pub async fn add(&self, item: MediaItem) -> usize {
        let mut state = self.state.write().await;
        state.items.insert(item.id, item);
        state.items.len()
    }
    
    pub async fn remove(&self, id: MediaId) {
        let mut state = self.state.write().await;
        state.items.remove(&id);
    }
    
    pub async fn get(&self, id: MediaId) -> Option<MediaItem> {
        let state = self.state.read().await;
        state.items.get(&id).cloned()
    }

    pub async fn items(&self) -> Vec<MediaItem> {
        let state = self.state.read().await;
        state.items.values().cloned().collect_vec()
    }

    pub async fn album(&self, id: AlbumId) -> Result<(Album, Vec<MediaItem>)> {
        let mut tx = self.db.begin().await?;
        let album = db::load_album_by_id(&mut tx, id).await?;
        let media = db::load_album_media(&mut tx, id).await?;
        Ok((album, media))
    }

    pub async fn album_children(&self, parent_id: Option<AlbumId>) -> Result<Vec<Album>> {
        let mut tx = self.db.begin().await?;
        db::load_albums_by_parent(&mut tx, parent_id).await
    }
}

