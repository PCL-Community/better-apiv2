pub mod config;
pub mod db;
pub mod middleware;
pub mod models;
pub mod cache;
pub mod routes;
pub mod services;

use axum::http::Method;
use axum::routing::{get, post, put};
use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

use crate::db::AppState;

pub fn setup_tracing() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "better_apiv2=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
}

pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers(Any);

    Router::new()
        // Public routes
        .route("/health", get(routes::health::health_check))
        .route(
            "/apiv2/announcements",
            get(routes::announcements::get_announcements),
        )
        .route(
            "/apiv2/announcements.json",
            get(routes::announcements::get_announcements_json),
        )
        .route("/apiv2/cache.json", get(routes::updates::get_cache_json))
        .route("/apiv2/cache", get(routes::updates::get_cache))
        .route(
            "/apiv2/updates/updates-{channel}.json",
            get(routes::updates::get_updates_channel_json),
        )
        .route("/apiv2/updates", get(routes::updates::get_updates))
        .route(
            "/apiv2/updates/{id}",
            get(routes::updates::get_update_by_id),
        )
        .route(
            "/apiv2/updates/{id}/download",
            get(routes::updates::download_update),
        )
        .route(
            "/apiv2/updates/{id}/patches/{patchId}/download",
            get(routes::updates::download_patch),
        )
        .route(
            "/static/patch/{filename}",
            get(routes::updates::download_patch_by_sha),
        )
        // Auth routes
        .route("/auth/github/login", get(routes::auth::github_login))
        .route(
            "/auth/github/callback",
            get(routes::auth::github_callback),
        )
        .route(
            "/auth/github/logout",
            post(routes::auth::github_logout),
        )
        // Admin routes
        .route("/admin/me", get(routes::admin::me))
        .route(
            "/admin/announcements",
            post(routes::admin::create_announcement),
        )
        .route(
            "/admin/announcements/{id}",
            put(routes::admin::update_announcement)
                .delete(routes::admin::delete_announcement),
        )
        .route("/admin/updates", post(routes::admin::create_update))
        .route(
            "/admin/updates/batch",
            post(routes::admin::batch_release),
        )
        .route(
            "/admin/updates/{id}",
            put(routes::admin::update_update)
                .delete(routes::admin::delete_update),
        )
        .route("/admin/sources", get(routes::admin::list_sources))
        .route("/admin/sources/{id}", put(routes::admin::update_source).delete(routes::admin::delete_source))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}
