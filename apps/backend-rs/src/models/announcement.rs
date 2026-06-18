use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// DB row for announcements table
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Announcement {
    pub id: Uuid,
    pub title: String,
    pub detail: String,
    pub details: Option<String>,
    pub priority: i32,
    pub level: i32,
    pub skip: Option<String>,      // JSON text
    pub buttons: Option<String>,   // JSON text
    pub date: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// DB row for announcement_buttons table
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AnnouncementButton {
    pub id: Uuid,
    pub text: String,
    pub command: String,           // OPEN_URL | OPEN_WEBPAGE
    pub command_parameter: String,
    pub announcement_id1: Option<String>,
    pub announcement_id2: Option<String>,
}

/// Parsed skip condition from JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkipCondition {
    pub min: Option<String>,
    pub max: Option<String>,
    pub not_before: Option<String>,
    pub not_after: Option<String>,
}

/// Parsed button from JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Button {
    pub text: String,
    pub exec: String,
    pub argument: String,
}

/// API response announcement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnouncementResponse {
    pub id: String,
    pub title: String,
    pub details: String,
    pub priority: i32,
    pub level: i32,
    pub date: String,
    pub skip: Option<SkipCondition>,
    pub buttons: Vec<Button>,
}
