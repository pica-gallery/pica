use std::collections::HashMap;

use chrono::Utc;
use priority_queue::PriorityQueue;

use crate::pica::index::ScanItem;
use crate::pica::MediaId;

pub enum QueueItem {
    Add(ScanItem),
    Remove(MediaId),
}

#[derive(Default)]
pub struct ScanQueue {
    queue: PriorityQueue<MediaId, chrono::DateTime<Utc>>,
    queued: HashMap<MediaId, QueueItem>,
}

impl ScanQueue {
    pub fn add(&mut self, item: ScanItem) {
        self.queue.push(item.id, item.timestamp);
        self.queued.insert(item.id, QueueItem::Add(item));
    }

    pub fn remove(&mut self, item: MediaId) {
        let timestamp = self.queue.peek()
            .map(|(_, ts)| *ts)
            .unwrap_or_else(Utc::now);

        // push with a large timestamp (high priority)
        self.queue.push(item, timestamp);
        self.queued.insert(item, QueueItem::Remove(item));
    }

    pub fn poll(&mut self) -> Option<QueueItem> {
        let (id, _) = self.queue.pop()?;
        self.queued.remove(&id)
    }
}
