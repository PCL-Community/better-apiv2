use axum::extract::{FromRef, FromRequestParts};
use axum::http::request::Parts;

use crate::db::AppState;
use crate::models::AdminUser;
use crate::services::admin_auth::AdminAuthService;
use crate::services::ApiError;

/// Extractor that validates admin auth from Bearer token or cookie.
#[derive(Debug, Clone)]
pub struct AdminGuard {
    pub user: AdminUser,
}

impl<S> FromRequestParts<S> for AdminGuard
where
    S: Send + Sync,
    AppState: axum::extract::FromRef<S>,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);

        // Extract token: Bearer header first, then cookie
        let token = parts
            .headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(|s| s.to_string())
            .or_else(|| {
                parts.headers.get("Cookie").and_then(|v| v.to_str().ok()).and_then(|cookies| {
                    cookies.split(';').find_map(|c| {
                        let c = c.trim();
                        c.strip_prefix("token=").map(|t| t.to_string())
                    })
                })
            });

        let token = token.ok_or_else(|| ApiError::unauthorized("missing authentication"))?;

        let auth = AdminAuthService::new(app_state.db.clone(), app_state.cfg.admin_session_ttl_hours);

        let user = auth
            .get_user_by_token(&token)
            .await
            .map_err(|_| ApiError::internal("auth query failed"))?
            .ok_or_else(|| ApiError::unauthorized("invalid or expired session"))?;

        Ok(Self { user })
    }
}
