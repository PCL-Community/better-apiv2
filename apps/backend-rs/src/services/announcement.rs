use redis::AsyncCommands;
use sqlx::PgPool;

use crate::cache;
use crate::models::{Announcement, AnnouncementResponse, Button, SkipCondition};

const CACHE_TTL: usize = 3600;

pub struct AnnouncementService {
    db: PgPool,
}

impl AnnouncementService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    async fn fetch_from_db(&self) -> Result<Vec<AnnouncementResponse>, sqlx::Error> {
        let rows = sqlx::query_as::<_, Announcement>(
            "SELECT * FROM announcements ORDER BY priority ASC, date DESC",
        )
        .fetch_all(&self.db)
        .await?;

        let resp = rows
            .into_iter()
            .map(|a| {
                let details = a.details.unwrap_or(a.detail.clone());
                let skip: Option<SkipCondition> =
                    a.skip.and_then(|s| serde_json::from_str(&s).ok());
                let buttons: Vec<Button> = a
                    .buttons
                    .and_then(|b| serde_json::from_str(&b).ok())
                    .unwrap_or_default();

                AnnouncementResponse {
                    id: a.id.to_string(),
                    title: a.title,
                    details,
                    priority: a.priority,
                    level: a.level,
                    date: a.date.format("%Y-%m-%d %H:%M:%S%:z").to_string(),
                    skip,
                    buttons,
                }
            })
            .collect();

        Ok(resp)
    }

    /// Get announcements with Redis caching.
    pub async fn get_announcements(
        &self,
        redis_client: Option<&redis::Client>,
    ) -> Result<Vec<AnnouncementResponse>, sqlx::Error> {
        if let Some(client) = redis_client
            && let Ok(mut conn) = client.get_multiplexed_async_connection().await
        {
            let key = cache::keys::announcements();
            if let Ok(Some(cached)) = conn.get::<_, Option<String>>(&key).await
                && let Ok(data) = serde_json::from_str(&cached)
            {
                return Ok(data);
            }
        }

        let data = self.fetch_from_db().await?;

        if let Some(client) = redis_client
            && let Ok(mut conn) = client.get_multiplexed_async_connection().await
            && let Ok(json) = serde_json::to_string(&data)
        {
            let key = cache::keys::announcements();
            let _: Result<(), _> = conn.set_ex(&key, &json, CACHE_TTL as u64).await;
        }

        Ok(data)
    }

    /// Invalidate announcement cache.
    pub async fn invalidate_cache(redis_client: Option<&redis::Client>) {
        if let Some(client) = redis_client
            && let Ok(mut conn) = client.get_multiplexed_async_connection().await
        {
            let key = cache::keys::announcements();
            let _: Result<(), _> = conn.del(&key).await;
        }
    }
}
