use axum::body::Body;
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use std::path::Path;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

use crate::services::ApiError;

/// Stream a local file as the HTTP response body with Content-Type
/// application/octet-stream.
pub async fn stream_local_file(path: &str) -> Response {
    let path = path.to_string();
    match File::open(&path).await {
        Ok(file) => {
            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            let content_type = if path.ends_with(".zip") {
                "application/zip"
            } else if path.ends_with(".patch") {
                "application/octet-stream"
            } else {
                "application/octet-stream"
            };

            let mut headers = HeaderMap::new();
            if let Ok(val) = content_type.parse() {
                headers.insert("Content-Type", val);
            }

            let filename = Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy())
                .unwrap_or_else(|| std::borrow::Cow::Borrowed("download"));

            let disposition = format!("attachment; filename=\"{filename}\"");
            if let Ok(val) = disposition.parse() {
                headers.insert("Content-Disposition", val);
            }

            (headers, body).into_response()
        }
        Err(e) => {
            tracing::error!("file not found {path}: {e}");
            ApiError::not_found("file not found").into_response()
        }
    }
}
