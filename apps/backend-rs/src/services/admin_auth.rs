use chrono::{Duration, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{AdminSession, AdminUser};

pub struct AdminAuthService {
    db: PgPool,
    ttl_hours: i64,
}

impl AdminAuthService {
    pub fn new(db: PgPool, ttl_hours: u64) -> Self {
        Self {
            db,
            ttl_hours: ttl_hours as i64,
        }
    }

    /// Login with GitHub info: upsert user + create session.
    pub async fn login(
        &self,
        github_id: &str,
        login: &str,
        name: Option<&str>,
        avatar_url: Option<&str>,
        is_team_member: bool,
    ) -> Result<(AdminUser, AdminSession), sqlx::Error> {
        // Upsert admin user
        let user = sqlx::query_as::<_, AdminUser>(
            r#"
            INSERT INTO admin_users (id, github_id, login, name, avatar_url, is_team_member)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (github_id)
            DO UPDATE SET
                login = EXCLUDED.login,
                name = EXCLUDED.name,
                avatar_url = EXCLUDED.avatar_url,
                is_team_member = EXCLUDED.is_team_member,
                updated_at = NOW()
            RETURNING *
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(github_id)
        .bind(login)
        .bind(name)
        .bind(avatar_url)
        .bind(is_team_member)
        .fetch_one(&self.db)
        .await?;

        let token = Uuid::new_v4().to_string();
        let expires_at = Utc::now() + Duration::hours(self.ttl_hours);

        let session = sqlx::query_as::<_, AdminSession>(
            r#"
            INSERT INTO admin_sessions (id, token, user_id, expires_at)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(&token)
        .bind(user.id.to_string())
        .bind(expires_at)
        .fetch_one(&self.db)
        .await?;

        Ok((user, session))
    }

    /// Get admin user by session token (validates expiry).
    pub async fn get_user_by_token(
        &self,
        token: &str,
    ) -> Result<Option<AdminUser>, sqlx::Error> {
        let session = sqlx::query_as::<_, AdminSession>(
            r#"
            SELECT * FROM admin_sessions
            WHERE token = $1 AND expires_at > NOW()
            LIMIT 1
            "#,
        )
        .bind(token)
        .fetch_optional(&self.db)
        .await?;

        match session {
            Some(s) => {
                let user = sqlx::query_as::<_, AdminUser>(
                    "SELECT * FROM admin_users WHERE id = $1::uuid LIMIT 1",
                )
                .bind(&s.user_id)
                .fetch_optional(&self.db)
                .await?;
                Ok(user)
            }
            None => Ok(None),
        }
    }

    /// Logout: delete session.
    pub async fn logout(&self, token: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM admin_sessions WHERE token = $1")
            .bind(token)
            .execute(&self.db)
            .await?;
        Ok(())
    }
}
