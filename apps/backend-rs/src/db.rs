use axum::extract::FromRef;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::sync::Arc;

use crate::config::Config;
use crate::cache;
use crate::services::rate_limiter::RateLimiter;

/// Global app state holder, clone-friendly (Arc internally)
#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<Config>,
    pub db: PgPool,
    pub redis: Option<redis::Client>,
    pub rate_limiter: Arc<RateLimiter>,
}

impl AppState {
    pub async fn new(cfg: Config) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(20)
            .connect(&cfg.database_url)
            .await?;

        // Attempt Redis client creation (non-fatal)
        let redis = cache::create_client(&cfg);

        let rate_limiter = Arc::new(RateLimiter::new(60, 100));

        Ok(Self {
            cfg: Arc::new(cfg),
            db: pool,
            redis,
            rate_limiter,
        })
    }
}

impl FromRef<AppState> for PgPool {
    fn from_ref(state: &AppState) -> Self {
        state.db.clone()
    }
}

impl FromRef<AppState> for Arc<Config> {
    fn from_ref(state: &AppState) -> Self {
        state.cfg.clone()
    }
}

impl FromRef<AppState> for Arc<RateLimiter> {
    fn from_ref(state: &AppState) -> Self {
        state.rate_limiter.clone()
    }
}
