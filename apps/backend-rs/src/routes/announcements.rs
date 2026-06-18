use axum::extract::State;
use axum::Json;

use crate::db::AppState;
use crate::models::AnnouncementResponse;
use crate::services::{ApiError, ApiResult};

/// GET /apiv2/announcements — list all announcements
pub async fn get_announcements(
    State(state): State<AppState>,
) -> ApiResult<Vec<AnnouncementResponse>> {
    let svc = crate::services::AnnouncementService::new(state.db.clone());
    let data = svc
        .get_announcements(state.redis.as_ref())
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(data))
}

/// GET /apiv2/announcements.json — same, legacy compat
pub async fn get_announcements_json(
    State(state): State<AppState>,
) -> ApiResult<Vec<AnnouncementResponse>> {
    get_announcements(State(state)).await
}
