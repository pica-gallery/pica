use std::ops::Deref;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::pica::{MediaId, MediaItem};

#[derive(Clone, Default)]
pub struct MediaStore {
    items: Arc<RwLock<Vec<MediaItem>>>,
}

impl MediaStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn get(&self, id: MediaId) -> Option<MediaItem> {
        let items = self.items.read().await;
        items.iter()
            .find(|item| item.id == id)
            .cloned()
    }

    pub async fn push(&self, item: MediaItem) {
        let mut items = self.items.write().await;

        // do not add the item if it is already in the media store
        if items.iter().find(|i| i.id == item.id).is_some() {
            return;
        }

        items.push(item)
    }

    pub async fn replace(&self, new_items: Vec<MediaItem>) {
        let mut items = self.items.write().await;

        // replace previous items with the new ones
        *items = new_items
    }

    pub async fn items(&self) -> impl Deref<Target=Vec<MediaItem>> + '_ {
        self.items.read().await
    }
}

