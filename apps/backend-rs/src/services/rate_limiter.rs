use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;

/// Sliding-window rate limiter (in-memory, per-IP).
pub struct RateLimiter {
    buckets: Arc<DashMap<String, RateBucket>>,
    window_secs: u64,
    max_requests: u64,
}

struct RateBucket {
    count: u64,
    reset_at: Instant,
}

impl RateLimiter {
    pub fn new(window_secs: u64, max_requests: u64) -> Self {
        Self {
            buckets: Arc::new(DashMap::new()),
            window_secs,
            max_requests,
        }
    }

    pub fn check(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut bucket = self
            .buckets
            .entry(key.to_string())
            .or_insert(RateBucket {
                count: 0,
                reset_at: now + Duration::from_secs(self.window_secs),
            });

        if now >= bucket.reset_at {
            bucket.count = 0;
            bucket.reset_at = now + Duration::from_secs(self.window_secs);
        }

        if bucket.count >= self.max_requests {
            return false;
        }

        bucket.count += 1;
        true
    }

    /// Retrieve remaining quota info for response headers.
    pub fn remaining(&self, key: &str) -> (u64, u64) {
        if let Some(bucket) = self.buckets.get(key) {
            let remaining = self.max_requests.saturating_sub(bucket.count);
            let reset_in = bucket
                .reset_at
                .duration_since(Instant::now())
                .as_secs();
            (remaining, reset_in)
        } else {
            (self.max_requests, self.window_secs)
        }
    }
}
