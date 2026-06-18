use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// DB row for admin_users table
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AdminUser {
    pub id: Uuid,
    pub github_id: String,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub is_team_member: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// DB row for admin_sessions table
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AdminSession {
    pub id: Uuid,
    pub token: String,
    pub user_id: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// API response for /admin/me
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminUserResponse {
    pub id: String,
    pub github_id: String,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub is_team_member: bool,
}

impl From<AdminUser> for AdminUserResponse {
    fn from(u: AdminUser) -> Self {
        Self {
            id: u.id.to_string(),
            github_id: u.github_id,
            login: u.login,
            name: u.name,
            avatar_url: u.avatar_url,
            is_team_member: u.is_team_member,
        }
    }
}
