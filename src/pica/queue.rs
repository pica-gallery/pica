use std::collections::HashMap;

use chrono::Utc;
use priority_queue::PriorityQueue;

use crate::pica::index::ScanItem;
use crate::pica::MediaId;

#[derive(Default)]
pub struct ScanQueue {
    queue: PriorityQueue<MediaId, chrono::DateTime<Utc>>,
    queued: HashMap<MediaId, ScanItem>,
}

impl ScanQueue {
    pub fn add(&mut self, item: ScanItem) {
        self.queue.push(item.id, item.timestamp);
        self.queued.insert(item.id, item);
    }

    pub fn poll(&mut self) -> Option<ScanItem> {
        let (id, _) = self.queue.pop()?;
        self.queued.remove(&id)
    }
}
