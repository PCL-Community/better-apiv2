use anyhow::Context;

use better_apiv2::{build_router, config::Config, db::AppState, setup_tracing};

#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        println!("Error: {e}");
    }
}

async fn run() -> anyhow::Result<()> {
    setup_tracing();

    dotenvy::dotenv().ok();

    let cfg = Config::from_env().context("failed to load configuration")?;
    let port = cfg.port;

    let state = AppState::new(cfg)
        .await
        .context("failed to initialize app state")?;

    let app = build_router(state);

    let addr = format!("0.0.0.0:{port}");
    tracing::info!("listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .context("failed to bind TCP listener")?;

    axum::serve(listener, app).await.context("server error")?;

    Ok(())
}
