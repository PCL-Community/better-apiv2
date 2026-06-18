use axum::body::Body;
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use std::path::Path;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

/// Stream a local file as the HTTP response body with Content-Type
/// application/octet-stream.
pub async fn stream_local_file(path: &str) -> Response {
    let path = path.to_string();
    match File::open(&path).await {
        Ok(file) => {
            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            // Determine content-type from extension
            let content_type = if path.ends_with(".zip") {
                "application/zip"
            } else {
                "application/octet-stream"
            };

            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", content_type.parse().unwrap());
            headers.insert(
                "Content-Disposition",
                format!(
                    "attachment; filename=\"{}\"",
                    Path::new(&path)
                        .file_name()
                        .map(|n| n.to_string_lossy())
                        .unwrap_or_else(|| std::borrow::Cow::Borrowed("download"))
                )
                .parse()
                .unwrap(),
            );

            (headers, body).into_response()
        }
        Err(e) => {
            tracing::error!("file not found {path}: {e}");
            crate::services::ApiError::not_found("file not found").into_response()
        }
    }
}
