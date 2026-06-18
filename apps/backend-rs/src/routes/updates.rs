use axum::extract::{Path, Query, State};
use axum::response::{IntoResponse, Response};

use serde::Deserialize;
use uuid::Uuid;

use crate::db::AppState;
use crate::models::{CacheResponse, UpdatesResponse};
use crate::services::{ApiError, ApiResult};

#[derive(Debug, Deserialize)]
pub struct UpdatesQuery {
    channel: Option<String>,
}

/// GET /apiv2/updates — all or filtered by ?channel=
pub async fn get_updates(
    State(state): State<AppState>,
    Query(query): Query<UpdatesQuery>,
) -> ApiResult<UpdatesResponse> {
    // TODO: implement update queries with Redis caching
    let _ = state;
    let _ = query;
    Err(ApiError::not_found("not implemented yet"))
}

/// GET /apiv2/updates/:id — single update lookup
pub async fn get_update_by_id(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<UpdatesResponse> {
    let _ = state;
    let _ = id;
    Err(ApiError::not_found("not implemented yet"))
}

/// GET /apiv2/updates/:id/download — download the update file
pub async fn download_update(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Response {
    let _ = state;
    let _ = id;
    // TODO: implement
    ApiError::not_found("not implemented yet").into_response()
}

/// GET /apiv2/updates/:id/patches/:patchId/download — download a specific patch
pub async fn download_patch(
    State(state): State<AppState>,
    Path((id, patch_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let _ = state;
    let _ = id;
    let _ = patch_id;
    // TODO: implement
    ApiError::not_found("not implemented yet").into_response()
}

/// GET /static/patch/:filename — download by SHA pair
pub async fn download_patch_by_sha(
    State(state): State<AppState>,
    Path(filename): Path<String>,
) -> Response {
    let _ = state;
    let _ = filename;
    // TODO: implement
    ApiError::not_found("not implemented yet").into_response()
}

/// GET /apiv2/updates/updates-{channel}.json — legacy route
pub async fn get_updates_channel_json(
    State(state): State<AppState>,
    Path(channel): Path<String>,
) -> ApiResult<UpdatesResponse> {
    let _ = state;
    let _ = channel;
    Err(ApiError::not_found("not implemented yet"))
}

/// GET /apiv2/cache.json — MD5 cache map
pub async fn get_cache_json(
    State(state): State<AppState>,
) -> ApiResult<CacheResponse> {
    let _ = state;
    Err(ApiError::not_found("not implemented yet"))
}

/// GET /apiv2/cache — same as above
pub async fn get_cache(
    State(state): State<AppState>,
) -> ApiResult<CacheResponse> {
    get_cache_json(State(state)).await
}
