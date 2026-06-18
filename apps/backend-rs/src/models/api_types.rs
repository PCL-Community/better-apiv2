use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Response for /apiv2/updates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatesResponse {
    pub assets: Vec<UpdateAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAsset {
    pub id: String,
    pub file_name: String,
    pub required: Requirements,
    pub version: Version,
    pub upd_time: String,
    pub downloads: Vec<String>,
    pub patches: Vec<String>,
    pub sha256: String,
    pub changelog: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Requirements {
    pub dotnet: i32,
    pub windows: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Version {
    pub channel: String,
    pub name: String,
    pub code: i32,
}

/// Response for /apiv2/cache.json — MD5 hash per channel
pub type CacheResponse = HashMap<String, String>;

/// Health check response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
}

/// Multipart upload input for creating an update
#[derive(Debug)]
pub struct CreateUpdateInput {
    pub file: Vec<u8>,
    pub file_name: String,
    pub changelog: String,
    pub uploaded_by_admin: String,
}

/// Batch release input
#[derive(Debug)]
pub struct BatchReleaseInput {
    pub version_name: String,
    pub version_code: i32,
    pub source_group: Option<String>,
    pub changelog: String,
    pub uploaded_by_admin: String,
    pub required: Requirements,
    pub file_channels: Vec<FileChannel>,
}

#[derive(Debug)]
pub struct FileChannel {
    pub file: Vec<u8>,
    pub file_name: String,
    pub channel: String,
}

/// Source create/update request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceInput {
    pub name: String,
    pub base_url: String,
    pub group_name: String,
    pub enabled: Option<bool>,
}
