use axum::extract::{Query, State};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::db::AppState;
use crate::models::AdminUserResponse;
use crate::services::{admin_auth::AdminAuthService, github_auth::GitHubAuth, ApiError};

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    code: String,
    state: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: AdminUserResponse,
}

/// GET /auth/github/login — redirect to GitHub OAuth
pub async fn github_login() -> Response {
    // TODO: implement redirect to GitHub
    ApiError::not_found("not implemented yet").into_response()
}

/// GET /auth/github/callback — OAuth callback
pub async fn github_callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
) -> Result<Json<LoginResponse>, ApiError> {
    let gh = GitHubAuth::new(&state.cfg);

    let token = gh
        .exchange_code(&query.code)
        .await
        .map_err(|e| ApiError::bad_request(format!("oauth failed: {e}")))?;

    let user = gh
        .get_user(&token)
        .await
        .map_err(|e| ApiError::internal(format!("get user failed: {e}")))?;

    let is_team = gh
        .is_team_member(&token)
        .await
        .unwrap_or(false);

    let auth = AdminAuthService::new(
        state.db.clone(),
        state.cfg.admin_session_ttl_hours,
    );

    let (user, session) = auth
        .login(
            &user.id.to_string(),
            &user.login,
            user.name.as_deref(),
            user.avatar_url.as_deref(),
            is_team,
        )
        .await
        .map_err(|e| {
            tracing::error!("login failed: {e}");
            ApiError::internal("login failed")
        })?;

    Ok(Json(LoginResponse {
        token: session.token,
        user: user.into(),
    }))
}

/// POST /auth/github/logout — clear session
pub async fn github_logout(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // TODO: extract token from cookie/header, delete session
    let _ = state;
    Err(ApiError::not_found("not implemented yet"))
}
