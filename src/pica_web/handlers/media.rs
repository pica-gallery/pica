use crate::pica::accessor::MediaAccessor;
use crate::pica::scale::Image;
use crate::pica::{MediaId, MediaItem};
use crate::pica_web::auth::AuthSession;
use crate::pica_web::handlers::WebError;
use crate::pica_web::{streamzip, AppState};
use anyhow::anyhow;
use anyhow::Result;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http;
use axum::http::header::{CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::http::{HeaderValue, Request};
use axum::response::{IntoResponse, Response};
use axum_extra::extract::Query;
use futures_util::StreamExt;
use itertools::Itertools;
use mime::Mime;
use serde::Deserialize;
use std::io::{BufWriter, Write};
use std::str::FromStr;
use tokio::sync::mpsc::{Receiver, Sender};
use tokio::sync::{oneshot, Mutex, Notify};
use tokio::task::spawn_blocking;
use tokio_stream::wrappers::ReceiverStream;
use tower::ServiceExt;
use tower_http::services::ServeFile;
use tracing::{debug, debug_span, instrument, Instrument, Span};

#[derive(Debug)]
enum ImageType {
    Thumbnail,
    Preview,
}

#[instrument(skip_all, fields(? id))]
pub async fn handle_thumbnail(
    Path((id, _)): Path<(MediaId, String)>,
    auth_session: AuthSession,
    State(state): State<AppState>,
) -> Result<Response, WebError> {
    handle_image_scaled(id, auth_session, state, ImageType::Thumbnail).await
}

#[instrument(skip_all, fields(? id))]
pub async fn handle_preview_sdr(
    Path((id, _)): Path<(MediaId, String)>,
    auth_session: AuthSession,
    State(state): State<AppState>,
) -> Result<Response, WebError> {
    handle_image_scaled(id, auth_session, state, ImageType::Preview).await
}

#[instrument(skip_all, fields(? id))]
pub async fn handle_preview_hdr(
    Path((id, _)): Path<(MediaId, String)>,
    auth_session: AuthSession,
    State(state): State<AppState>,
) -> Result<Response, WebError> {
    handle_image_scaled(id, auth_session, state, ImageType::Preview).await
}

#[instrument(skip_all, fields(? id, ? image_type))]
async fn handle_image_scaled(id: MediaId, _auth: AuthSession, state: AppState, image_type: ImageType) -> Result<Response, WebError> {
    let media = state
        .store
        .get(id)
        .await
        .ok_or_else(|| anyhow!("unknown image {:?}", id))?;

    // scale image
    let image = state.scale_queue.scaled(media, image_type)
        .instrument(debug_span!("scaled"))
        .await?;

    let resp = Response::builder()
        .header(http::header::CONTENT_TYPE, image.typ.mime_type())
        .header(http::header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(axum::body::Body::from(image.blob))?;

    Ok(resp)
}

#[instrument(skip_all, fields(? id))]
pub async fn handle_fullsize(
    Path((id, _)): Path<(MediaId, String)>,
    state: State<AppState>,
    request: Request<Body>,
) -> Result<Response, WebError> {
    let media = state
        .store
        .get(id)
        .await
        .ok_or_else(|| anyhow!("unknown image {:?}", id))?;

    debug!("Serve full image for {:?}", media.relpath);

    // guess mime from the media path
    let mime = mime_guess::from_path(media.relpath.as_ref()).first_or(Mime::from_str("image/jpeg")?);

    // serve file to response
    let path = state.accessor.full(&media)?;
    let mut resp = ServeFile::new_with_mime(&path, &mime).oneshot(request).await?;

    //  on success inject cache header into response
    if resp.status().is_success() {
        resp.headers_mut().insert(
            http::header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        );
    }

    Ok(resp.into_response())
}

#[derive(Deserialize)]
pub struct DownloadZipRequest {
    #[serde(rename = "m")]
    items: Vec<MediaId>,
}

#[instrument(skip_all)]
pub async fn handle_download_zip(
    state: State<AppState>,
    q: Query<DownloadZipRequest>,
) -> Result<Response, WebError> {
    let span = debug_span!("create zip file");

    // collect files to download
    let files: Vec<_> = state
        .store
        .items().await
        .into_iter().filter(|item| q.items.contains(&item.id))
        .map(|media| state.accessor.full(&media))
        .try_collect()?;

    // bridge a sync Write with an async Receiver
    let (w, recv) = WriteToChannel::new();

    // start zip creation in a background task
    spawn_blocking(move || {
        let _entered = span.entered();
        let out = streamzip::StreamOutput::new(BufWriter::new(w))?;
        streamzip::write(out, &files)
    });

    // convert the receiver into a streaming body
    let recv_stream = ReceiverStream::new(recv).map(|vec| anyhow::Ok(vec));
    let body = Body::from_stream(recv_stream);

    let headers = [
        (CONTENT_TYPE, "application/zip"),
        (CONTENT_DISPOSITION, "attachment; filename=\"photos.zip\""),
    ];

    Ok((headers, body).into_response())
}


pub struct ThumbnailTask {
    result: oneshot::Sender<Result<Image>>,
    media: MediaItem,
    image_type: ImageType,
    span: Span,
}

pub struct ScaleQueue {
    notify: Notify,
    tasks: Mutex<Vec<ThumbnailTask>>,
    accessor: MediaAccessor,
}

impl ScaleQueue {
    pub fn new(accessor: MediaAccessor) -> Self {
        Self { notify: Notify::new(), tasks: Mutex::new(Vec::new()), accessor }
    }

    async fn scaled(&self, media: MediaItem, image_type: ImageType) -> Result<Image> {
        // check if it already exists before we go into the queue
        let scaled = match image_type {
            ImageType::Thumbnail => self.accessor.try_thumb(&media).await?,
            ImageType::Preview => self.accessor.try_preview(&media).await?,
        };

        if let Some(scaled) = scaled {
            return Ok(scaled);
        }

        let (send, recv) = oneshot::channel();

        let task = ThumbnailTask {
            result: send,
            media,
            image_type,
            span: Span::current(),
        };

        // enqueue the task to be processed by a worker
        self.tasks.lock().await.push(task);
        self.notify.notify_one();

        recv.await?
    }

    pub async fn work(&self) {
        loop {
            // wait to be notified
            self.notify.notified().await;

            // process as many tasks as we can get
            while let Some(task) = self.pop_task().await {
                let future = async {
                    if task.result.is_closed() {
                        debug!("Receiver is already closed");
                        return;
                    }

                    let result = self.process(&task.media, task.image_type).await;
                    let _ = task.result.send(result);
                };

                future.instrument(task.span).await;
            }
        }
    }

    async fn process(&self, media: &MediaItem, image_type: ImageType) -> Result<Image> {
        match image_type {
            ImageType::Thumbnail => self.accessor.thumb(media).await,
            ImageType::Preview => self.accessor.preview(media).await,
        }
    }

    async fn pop_task(&self) -> Option<ThumbnailTask> {
        self.tasks.lock().await.pop()
    }
}

struct WriteToChannel {
    sender: Sender<Vec<u8>>,
}

impl WriteToChannel {
    pub fn new() -> (Self, Receiver<Vec<u8>>) {
        let (sender, receiver) = tokio::sync::mpsc::channel(1);
        (Self { sender }, receiver)
    }
}

impl Write for WriteToChannel {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        match self.sender.blocking_send(buf.into()) {
            Ok(()) => Ok(buf.len()),
            Err(_) => Err(std::io::ErrorKind::UnexpectedEof.into()),
        }
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
