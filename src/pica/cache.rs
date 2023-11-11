use std::path::Path;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::pica::MediaId;

#[derive(Serialize, Deserialize)]
pub struct ImageInfo {
    pub timestamp: DateTime<Utc>,
}

pub struct Cache {
    db: sled::Db,
}

impl Cache {
    pub fn new(path: impl AsRef<Path>) -> Result<Self> {
        let db = sled::open(path)?;
        Ok(Cache { db })
    }

    pub fn put(&self, id: MediaId, info: ImageInfo) -> Result<()> {
        let bytes = bincode::serialize(&info)?;
        self.db.insert(id.as_ref(), bytes)?;
        Ok(())
    }

    pub fn get(&self, id: MediaId) -> Result<Option<ImageInfo>> {
        let bytes = self.db.get(id.as_ref())?;

        let info = match bytes {
            None => None,
            Some(bytes) => Some(bincode::deserialize(&bytes)?),
        };

        Ok(info)
    }
}
