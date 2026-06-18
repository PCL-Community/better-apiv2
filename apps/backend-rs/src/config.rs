use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub port: u16,
    pub cors_origin: String,
    pub node_env: String,

    // GitHub OAuth
    pub github_client_id: String,
    pub github_client_secret: String,
    pub github_redirect_uri: String,
    pub github_org: String,
    pub github_team_slug: String,
    pub github_proxy: Option<String>,

    // Admin session
    pub admin_session_ttl_hours: u64,

    // Storage
    pub storage_provider: String,
    pub s3_backends_json: Option<String>,
    pub s3_endpoint: Option<String>,
    pub s3_region: String,
    pub s3_bucket: String,
    pub s3_access_key_id: Option<String>,
    pub s3_secret_access_key: Option<String>,
    pub s3_public_base_url: Option<String>,
    pub upload_dir: String,

    // Patch
    pub patch_concurrency: usize,
    pub bsdiff_command: String,
    pub bspatch_command: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL")
                .expect("DATABASE_URL must be set"),
            redis_url: env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".to_string()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()
                .expect("PORT must be a number"),
            cors_origin: env::var("CORS_ORIGIN")
                .unwrap_or_else(|_| "*".to_string()),
            node_env: env::var("NODE_ENV")
                .unwrap_or_else(|_| "development".to_string()),

            github_client_id: env::var("GITHUB_CLIENT_ID")
                .expect("GITHUB_CLIENT_ID must be set"),
            github_client_secret: env::var("GITHUB_CLIENT_SECRET")
                .expect("GITHUB_CLIENT_SECRET must be set"),
            github_redirect_uri: env::var("GITHUB_REDIRECT_URI")
                .expect("GITHUB_REDIRECT_URI must be set"),
            github_org: env::var("GITHUB_ORG")
                .unwrap_or_else(|_| "PCL-Community".to_string()),
            github_team_slug: env::var("GITHUB_TEAM_SLUG")
                .unwrap_or_else(|_| "ce-dev".to_string()),
            github_proxy: env::var("GITHUB_PROXY").ok(),

            admin_session_ttl_hours: env::var("ADMIN_SESSION_TTL_HOURS")
                .unwrap_or_else(|_| "24".to_string())
                .parse()
                .expect("ADMIN_SESSION_TTL_HOURS must be a number"),

            storage_provider: env::var("STORAGE_PROVIDER")
                .unwrap_or_else(|_| "local".to_string()),
            s3_backends_json: env::var("S3_BACKENDS").ok(),
            s3_endpoint: env::var("S3_ENDPOINT").ok(),
            s3_region: env::var("S3_REGION")
                .unwrap_or_else(|_| "auto".to_string()),
            s3_bucket: env::var("S3_BUCKET")
                .unwrap_or_else(|_| String::new()),
            s3_access_key_id: env::var("S3_ACCESS_KEY_ID").ok(),
            s3_secret_access_key: env::var("S3_SECRET_ACCESS_KEY").ok(),
            s3_public_base_url: env::var("S3_PUBLIC_BASE_URL").ok(),
            upload_dir: env::var("UPLOAD_DIR")
                .unwrap_or_else(|_| "./uploads".to_string()),

            patch_concurrency: env::var("PATCH_CONCURRENCY")
                .unwrap_or_else(|_| "2".to_string())
                .parse()
                .expect("PATCH_CONCURRENCY must be a number"),
            bsdiff_command: env::var("BSDIFF_COMMAND")
                .unwrap_or_else(|_| "bsdiff".to_string()),
            bspatch_command: env::var("BSPATCH_COMMAND")
                .unwrap_or_else(|_| "bspatch".to_string()),
        }
    }
}
