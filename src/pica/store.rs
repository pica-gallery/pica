use std::collections::HashMap;
use std::sync::Arc;

use itertools::Itertools;

use tokio::sync::RwLock;
use tracing::instrument;

use crate::pica::{MediaId, MediaItem};

struct MediaItemsState {
    items: HashMap<MediaId, MediaItem>,
}

#[derive(Clone)]
pub struct MediaStore {
    // the current set of all media items.
    state: Arc<RwLock<MediaItemsState>>,
}

impl MediaStore {
    pub fn empty() -> Self {
        let items = MediaItemsState { items: HashMap::new() };
        Self {
            state: Arc::new(RwLock::new(items)),
        }
    }

    /// Adds a new item to the media store.
    #[instrument(skip_all, fields(?item.relpath))]
    pub async fn add(&self, item: MediaItem) -> usize {
        let mut state = self.state.write().await;
        state.items.insert(item.id, item);
        state.items.len()
    }

    #[instrument(skip_all, fields(id))]
    pub async fn remove(&self, id: MediaId) {
        let mut state = self.state.write().await;
        state.items.remove(&id);
    }

    #[instrument(skip_all, fields(id))]
    pub async fn get(&self, id: MediaId) -> Option<MediaItem> {
        let state = self.state.read().await;
        state.items.get(&id).cloned()
    }

    #[instrument(skip_all)]
    pub async fn items(&self) -> Vec<MediaItem> {
        let state = self.state.read().await;
        state.items.values().cloned().collect_vec()
    }
}
