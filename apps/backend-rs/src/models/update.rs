use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// Mirrors Prisma VersionChannel enum
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[sqlx(type_name = "VersionChannel", rename_all = "UPPERCASE")]
pub enum VersionChannel {
    FRARM64,
    FRX64,
    SRARM64,
    SRX64,
}

pub enum VersionChannelError {
    UnknwonChannel,
}

impl std::str::FromStr for VersionChannel {
    type Err = VersionChannelError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "frarm64" => Ok(Self::FRARM64),
            "frx64" => Ok(Self::FRX64),
            "srarm64" => Ok(Self::SRARM64),
            "srx64" => Ok(Self::SRX64),
            _ => Err(VersionChannelError::UnknwonChannel),
        }
    }
}

impl VersionChannel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::FRARM64 => "frarm64",
            Self::FRX64 => "frx64",
            Self::SRARM64 => "srarm64",
            Self::SRX64 => "srx64",
        }
    }
}

/// DB row for update_files table
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UpdateFile {
    pub id: Uuid,
    pub file_name: String,
    pub channel: VersionChannel,
    pub version_name: String,
    pub version_code: i32,
    pub required_dotnet: i32,
    pub required_windows: String,
    pub original_name: String,
    pub file_size: i64,
    pub sha256: String,
    pub s3_key: String,
    pub s3_url: String,
    pub source_group: Option<String>,
    pub changelog: String,
    pub uploaded_by_admin: String,
    pub uploaded_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// DB row for patch_files table
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PatchFile {
    pub id: Uuid,
    pub from_update_file_id: Uuid,
    pub to_update_file_id: Uuid,
    pub patch_file_size: i64,
    pub patch_sha256: String,
    pub s3_key: String,
    pub s3_url: String,
    pub created_at: DateTime<Utc>,
}

/// PatchFile with joined FromUpdateFile info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatchFileWithFrom {
    pub patch: PatchFile,
    pub from_update: Option<UpdateFile>,
}

/// PatchJobQueue status enum
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[sqlx(type_name = "PatchJobStatus", rename_all = "UPPERCASE")]
pub enum PatchJobStatus {
    PENDING,
    PROCESSING,
    SUCCESS,
    FAILED,
}

/// DB row for patch_job_queues table
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PatchJobQueue {
    pub id: Uuid,
    pub update_file_id: String,
    pub status: PatchJobStatus,
    pub source_version_code: i32,
    pub target_version_code: i32,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

/// DB row for release_sources table
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ReleaseSource {
    pub id: Uuid,
    pub name: String,
    pub base_url: String,
    pub group_name: String,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
