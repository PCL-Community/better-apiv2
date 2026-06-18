use better_apiv2::{build_router, config::Config, db::AppState, setup_tracing};

#[tokio::main]
async fn main() {
    setup_tracing();

    dotenvy::dotenv().ok();

    let cfg = Config::from_env();
    let port = cfg.port;

    let state = AppState::new(cfg)
        .await
        .expect("failed to initialize app state");

    let app = build_router(state);

    let addr = format!("0.0.0.0:{port}");
    tracing::info!("listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind");

    axum::serve(listener, app)
        .await
        .expect("server error");
}
