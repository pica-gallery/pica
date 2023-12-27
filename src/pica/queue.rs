use std::collections::HashMap;

use chrono::Utc;
use priority_queue::PriorityQueue;

use crate::pica::index::ScanItem;
use crate::pica::MediaId;

#[derive(Eq, PartialEq)]
pub enum State {
    Done,
    Seen,
    Queued,
}

#[derive(Default)]
pub struct ScanQueue {
    state: HashMap<MediaId, State>,
    queue: PriorityQueue<MediaId, chrono::DateTime<Utc>>,
    queued: HashMap<MediaId, ScanItem>,
}

impl ScanQueue {
    pub fn add(&mut self, item: ScanItem, timestamp: chrono::DateTime<Utc>) -> bool {
        if self.state.contains_key(&item.id) {
            return false
        }

        self.queue.push(item.id, timestamp);
        self.state.insert(item.id, State::Queued);
        self.queued.insert(item.id, item);
        true
    }

    pub fn poll(&mut self) -> Option<ScanItem> {
        let (id, _) = self.queue.pop()?;

        match self.queued.remove(&id) {
            None => None,

            Some(item) => {
                self.state.insert(item.id, State::Seen);
                Some(item)
            }
        }
    }

    pub fn done(&mut self, id: MediaId) {
        self.state.insert(id, State::Done);
    }

    pub fn done_len(&self) -> usize {
        self.state.len()
    }
}
