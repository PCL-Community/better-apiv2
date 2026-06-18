
use crate::config::Config;

/// Cache keys.
pub mod keys {
    pub fn announcements() -> String { "better-api:announcements".into() }
    pub fn updates_channel(channel: &str, base_url: Option<&str>) -> String {
        format!("better-api:updates:channel:{channel}:{}", base_url.unwrap_or(""))
    }
    pub fn updates_all(base_url: Option<&str>) -> String {
        format!("better-api:updates:all:{}", base_url.unwrap_or(""))
    }
    pub fn cache_json(base_url: Option<&str>) -> String {
        format!("better-api:cache:json:{}", base_url.unwrap_or(""))
    }
    pub fn update_file(id: &str) -> String { format!("better-api:updateFile:{id}") }
    pub fn patch_file(id: &str) -> String { format!("better-api:patchFile:{id}") }
    pub fn patch_file_by_sha(old_sha: &str, new_sha: &str) -> String {
        format!("better-api:patchFile:{old_sha}:{new_sha}")
    }
    pub fn release_source(group: &str) -> String { format!("better-api:releaseSource:{group}") }
}

pub fn create_client(cfg: &Config) -> Option<redis::Client> {
    redis::Client::open(cfg.redis_url.as_str()).ok()
}
