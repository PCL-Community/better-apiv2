use axum::extract::{Path, State};
use axum::Json;
use uuid::Uuid;

use crate::db::AppState;
use crate::middleware::admin_guard::AdminGuard;
use crate::models::AdminUserResponse;
use crate::services::{ApiError, ApiResult};

/// GET /admin/me — current user info
pub async fn me(
    admin: AdminGuard,
) -> Json<AdminUserResponse> {
    Json(admin.user.into())
}

/// POST /admin/announcements — create
pub async fn create_announcement(
    State(state): State<AppState>,
    admin: AdminGuard,
    // TODO: add JSON body
) -> ApiResult<serde_json::Value> {
    let _ = state;
    let _ = admin;
    Err(ApiError::not_found("not implemented yet"))
}

/// PUT /admin/announcements/:id — update
pub async fn update_announcement(
    State(state): State<AppState>,
    admin: AdminGuard,
    Path(id): Path<Uuid>,
    // TODO: add JSON body
) -> ApiResult<serde_json::Value> {
    let _ = state;
    let _ = admin;
    let _ = id;
    Err(ApiError::not_found("not implemented yet"))
}

/// DELETE /admin/announcements/:id
pub async fn delete_announcement(
    State(state): State<AppState>,
    admin: AdminGuard,
    Path(id): Path<Uuid>,
) -> ApiResult<serde_json::Value> {
    let _ = state;
    let _ = admin;
    let _ = id;
    Err(ApiError::not_found("not implemented yet"))
}

/// POST /admin/updates — upload new version
pub async fn create_update(
    State(state): State<AppState>,
    admin: AdminGuard,
    // TODO: multipart
) -> ApiResult<serde_json::Value> {
    let _ = state;
    let _ = admin;
    Err(ApiError::not_found("not implemented yet"))
}

/// POST /admin/updates/batch — batch release
pub async fn batch_release(
    State(state): State<AppState>,
    admin: AdminGuard,
) -> ApiResult<serde_json::Value> {
    let _ = state;
    let _ = admin;
    Err(ApiError::not_found("not implemented yet"))
}

/// PUT /admin/updates/:id — update metadata
pub async fn update_update(
    State(state): State<AppState>,
    admin: AdminGuard,
    Path(id): Path<Uuid>,
) -> ApiResult<serde_json::Value> {
    let _ = state;
    let _ = admin;
    let _ = id;
    Err(ApiError::not_found("not implemented yet"))
}

/// DELETE /admin/updates/:id
pub async fn delete_update(
    State(state): State<AppState>,
    admin: AdminGuard,
    Path(id): Path<Uuid>,
) -> ApiResult<serde_json::Value> {
    let _ = state;
    let _ = admin;
    let _ = id;
    Err(ApiError::not_found("not implemented yet"))
}

/// GET /admin/sources — list release sources
pub async fn list_sources(
    State(state): State<AppState>,
    admin: AdminGuard,
) -> ApiResult<serde_json::Value> {
    let _ = state;
    let _ = admin;
    Err(ApiError::not_found("not implemented yet"))
}

/// POST /admin/sources — create release source
pub async fn create_source(
    State(state): State<AppState>,
    admin: AdminGuard,
) -> ApiResult<serde_json::Value> {
    let _ = state;
    let _ = admin;
    Err(ApiError::not_found("not implemented yet"))
}

/// PUT /admin/sources/:id
pub async fn update_source(
    State(state): State<AppState>,
    admin: AdminGuard,
    Path(id): Path<Uuid>,
) -> ApiResult<serde_json::Value> {
    let _ = state;
    let _ = admin;
    let _ = id;
    Err(ApiError::not_found("not implemented yet"))
}

/// DELETE /admin/sources/:id
pub async fn delete_source(
    State(state): State<AppState>,
    admin: AdminGuard,
    Path(id): Path<Uuid>,
) -> ApiResult<serde_json::Value> {
    let _ = state;
    let _ = admin;
    let _ = id;
    Err(ApiError::not_found("not implemented yet"))
}
