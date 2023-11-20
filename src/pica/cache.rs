use std::path::Path;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::task::block_in_place;

use crate::pica::MediaId;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MediaInfo {
    pub timestamp: DateTime<Utc>,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone)]
pub struct Cache {
    db: sled::Db,
}

impl Cache {
    pub fn new(path: impl AsRef<Path>) -> Result<Self> {
        let db = sled::open(path)?;
        Ok(Cache { db })
    }

    pub async fn put(&self, id: MediaId, info: MediaInfo) -> Result<()> {
        block_in_place(|| {
            let bytes = bincode::serialize(&info)?;
            self.db.insert(id.as_ref(), bytes)?;
            Ok(())
        })
    }

    pub async fn get(&self, id: MediaId) -> Result<Option<MediaInfo>> {
        let bytes = block_in_place(|| self.db.get(id.as_ref())).with_context(|| "read entry from cache")?;
        
        let info = match bytes {
            None => None,
            Some(bytes) => Some(bincode::deserialize(&bytes).with_context(|| "deserialize cached entry")?),
        };

        Ok(info)
    }
}
