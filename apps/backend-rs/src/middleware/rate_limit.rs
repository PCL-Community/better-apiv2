use axum::extract::{FromRef, FromRequestParts};
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};

use crate::db::AppState;
use crate::services::ApiError;

/// Rate-limit extractor. Uses client IP as bucket key.
#[derive(Debug)]
pub struct RateLimit;

impl<S> FromRequestParts<S> for RateLimit
where
    S: Send + Sync,
    AppState: axum::extract::FromRef<S>,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);
        let limiter = &app_state.rate_limiter;

        // Get client IP
        let ip = parts
            .headers
            .get("X-Forwarded-For")
            .and_then(|v| v.to_str().ok())
            .or_else(|| parts.headers.get("X-Real-IP").and_then(|v| v.to_str().ok()))
            .unwrap_or("unknown")
            .to_string();

        if !limiter.check(&ip) {
            return Err(ApiError::too_many_requests("rate limit exceeded").into_response());
        }

        Ok(Self)
    }
}
