use reqwest::Client;
use serde::Deserialize;

use crate::config::Config;

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubUser {
    pub id: i64,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubEmail {
    pub email: String,
    pub primary: bool,
    pub verified: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubTeam {
    pub slug: String,
}

pub struct GitHubAuth {
    client: Client,
    cfg: Config,
}

impl GitHubAuth {
    pub fn new(cfg: &Config) -> Self {
        let client = if let Some(proxy_url) = &cfg.github_proxy {
            Client::builder()
                .proxy(reqwest::Proxy::all(proxy_url).unwrap())
                .build()
                .unwrap_or_default()
        } else {
            Client::new()
        };
        Self {
            client,
            cfg: cfg.clone(),
        }
    }

    /// Exchange authorization code for an access token.
    pub async fn exchange_code(&self, code: &str) -> Result<String, String> {
        let params = [
            ("client_id", self.cfg.github_client_id.as_str()),
            ("client_secret", self.cfg.github_client_secret.as_str()),
            ("code", code),
            ("redirect_uri", self.cfg.github_redirect_uri.as_str()),
        ];
        let resp = self
            .client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("request failed: {e}"))?;

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("parse failed: {e}"))?;

        if let Some(token) = body["access_token"].as_str() {
            Ok(token.to_string())
        } else if let Some(err) = body["error_description"].as_str() {
            Err(err.to_string())
        } else {
            Err("no access_token in response".to_string())
        }
    }

    /// Get authenticated user's profile.
    pub async fn get_user(&self, token: &str) -> Result<GitHubUser, String> {
        let resp = self
            .client
            .get("https://api.github.com/user")
            .header("Authorization", format!("Bearer {token}"))
            .header("User-Agent", "better-apiv2")
            .send()
            .await
            .map_err(|e| format!("request failed: {e}"))?;

        resp.json().await.map_err(|e| format!("parse failed: {e}"))
    }

    /// Check if user is a member of the configured team.
    pub async fn is_team_member(&self, token: &str) -> Result<bool, String> {
        let org = &self.cfg.github_org;
        let slug = &self.cfg.github_team_slug;
        let url = format!(
            "https://api.github.com/orgs/{org}/teams/{slug}/memberships/@@me"
        );

        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {token}"))
            .header("User-Agent", "better-apiv2")
            .send()
            .await
            .map_err(|e| format!("check membership failed: {e}"))?;

        Ok(resp.status().is_success())
    }
}
