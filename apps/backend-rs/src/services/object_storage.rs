use aws_config::BehaviorVersion;
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::config::Region;
use aws_sdk_s3::operation::put_object::PutObjectOutput;
use aws_sdk_s3::primitives::ByteStream;
use serde::Deserialize;
use std::path::Path;

use crate::config::Config;

#[derive(Debug, Clone, Deserialize)]
pub struct S3BackendConfig {
    pub name: String,
    pub endpoint: Option<String>,
    pub bucket: String,
    pub region: Option<String>,
    pub access_key: Option<String>,
    pub secret_key: Option<String>,
    pub public_base_url: Option<String>,
    #[serde(default = "default_true")]
    pub force_path_style: bool,
}

fn default_true() -> bool {
    true
}

pub struct S3Backend {
    pub name: String,
    client: S3Client,
    pub bucket: String,
    pub public_base_url: String,
}

pub struct ObjectStorageService {
    pub backends: Vec<S3Backend>,
    pub upload_dir: String, // local FS fallback
}

impl ObjectStorageService {
    /// Build from config, supporting both S3_BACKENDS JSON and legacy env vars.
    pub async fn new(cfg: &Config) -> Self {
        let mut backends = Vec::new();

        // Parse S3_BACKENDS JSON array
        if let Some(json) = &cfg.s3_backends_json
            && let Ok(configs) = serde_json::from_str::<Vec<S3BackendConfig>>(json)
        {
            for bc in configs {
                if let Some(s3) = Self::build_backend(&bc).await {
                    backends.push(s3);
                }
            }
        }

        // Parse legacy env vars
        if backends.is_empty() && !cfg.s3_bucket.is_empty() {
            let legacy = S3BackendConfig {
                name: "legacy".into(),
                endpoint: cfg.s3_endpoint.clone(),
                bucket: cfg.s3_bucket.clone(),
                region: Some(cfg.s3_region.clone()),
                access_key: cfg.s3_access_key_id.clone(),
                secret_key: cfg.s3_secret_access_key.clone(),
                public_base_url: cfg.s3_public_base_url.clone(),
                force_path_style: true,
            };
            if let Some(s3) = Self::build_backend(&legacy).await {
                backends.push(s3);
            }
        }

        Self {
            backends,
            upload_dir: cfg.upload_dir.clone(),
        }
    }

    async fn build_backend(bc: &S3BackendConfig) -> Option<S3Backend> {
        let region = bc.region.clone().unwrap_or_else(|| "auto".to_string());

        let mut loader =
            aws_config::defaults(BehaviorVersion::latest()).region(Region::new(region.clone()));

        // Custom endpoint + credentials
        if let (Some(ak), Some(sk)) = (&bc.access_key, &bc.secret_key) {
            use aws_sdk_s3::config::Credentials;
            let creds = Credentials::new(ak, sk, None, None, "env");
            loader = loader.credentials_provider(creds);
        }

        let sdk_config = loader.load().await;

        let mut s3_config =
            aws_sdk_s3::config::Builder::from(&sdk_config).force_path_style(bc.force_path_style);

        if let Some(endpoint) = &bc.endpoint {
            s3_config = s3_config.endpoint_url(endpoint).region(Region::new(region));
        }

        let client = S3Client::from_conf(s3_config.build());

        Some(S3Backend {
            name: bc.name.clone(),
            client,
            bucket: bc.bucket.clone(),
            public_base_url: bc
                .public_base_url
                .clone()
                .unwrap_or_default()
                .trim_end_matches('/')
                .to_string(),
        })
    }

    /// Sanitize path segment for object keys.
    pub fn sanitize_key_part(s: &str) -> String {
        s.chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' {
                    c
                } else {
                    '_'
                }
            })
            .collect()
    }

    /// Local FS path for a key.
    pub fn local_path(&self, key: &str) -> String {
        Path::new(&self.upload_dir)
            .join(key)
            .to_string_lossy()
            .to_string()
    }

    /// Check local file existence.
    pub fn local_exists(&self, key: &str) -> bool {
        Path::new(&self.local_path(key)).exists()
    }

    /// Upload buffer to local FS and all S3 backends.
    pub async fn upload(&self, key: &str, data: &[u8]) -> Result<Vec<PutObjectOutput>, String> {
        // Write to local FS
        let local_path = self.local_path(key);
        if let Some(parent) = Path::new(&local_path).parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("mkdir failed: {e}"))?;
        }
        tokio::fs::write(&local_path, data)
            .await
            .map_err(|e| format!("write failed: {e}"))?;

        // Upload to each S3 backend
        let mut results = Vec::new();
        for backend in &self.backends {
            let body = ByteStream::from(data.to_vec());
            match backend
                .client
                .put_object()
                .bucket(&backend.bucket)
                .key(key)
                .body(body)
                .send()
                .await
            {
                Ok(out) => results.push(out),
                Err(e) => {
                    tracing::warn!("S3 upload to {} failed for key {key}: {e}", backend.name);
                }
            }
        }
        Ok(results)
    }

    /// Delete from local FS and all S3 backends.
    pub async fn delete(&self, key: &str) {
        // Local
        let local_path = self.local_path(key);
        let _ = tokio::fs::remove_file(&local_path).await;

        // S3
        for backend in &self.backends {
            if let Err(e) = backend
                .client
                .delete_object()
                .bucket(&backend.bucket)
                .key(key)
                .send()
                .await
            {
                tracing::warn!("S3 delete on {} failed for key {key}: {e}", backend.name);
            }
        }
    }

    /// Get public URL for a key (first backend or local path).
    pub fn public_url(&self, key: &str) -> String {
        if let Some(backend) = self.backends.first()
            && !backend.public_base_url.is_empty()
        {
            return format!("{}/{}", backend.public_base_url, key);
        }
        self.local_path(key)
    }

    /// Check if we have any S3 backends configured.
    pub fn has_s3(&self) -> bool {
        !self.backends.is_empty()
    }
}
