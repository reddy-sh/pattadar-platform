/** Lazy first-frame posters from the same Range-streamed video source.
 *
 * The gateway has no video transcoder/thumbnailer. A hidden native video asks
 * only for metadata and the ranges needed around one second, then a canvas
 * captures that frame. No full-file Blob is created. Posters are in-memory
 * data URLs and disappear with the page; the original remains the evidence.
 */
import { useEffect, useState } from 'react';

import { useMediaStream } from './mediaStream';

export function useVideoPoster(fileRef: string, enabled: boolean, maxWidth = 320) {
  // Each result names the file it was made for. The stage and Compare panes
  // keep one instance across files, and must never show the previous file's
  // frame; a capture also closes its stream, so a poster cannot be cleared
  // when the stream goes away, only when the file does.
  const [doneFor, setDoneFor] = useState('');
  const [kept, setKept] = useState({ ref: '', url: '' });
  const [shot, setShot] = useState({ ref: '', src: '' });
  const stream = useMediaStream(fileRef, enabled && doneFor !== fileRef);

  useEffect(() => { if (stream.url) setKept({ ref: fileRef, url: stream.url }); }, [fileRef, stream.url]);

  useEffect(() => {
    if (!enabled || !stream.url) return;
    const video = document.createElement('video');
    let cancelled = false;
    let settled = false;
    let captureTimer: number | undefined;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('aria-hidden', 'true');
    Object.assign(video.style, {
      position: 'fixed',
      left: '-2px',
      top: '-2px',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    });
    video.src = stream.url;
    document.body.appendChild(video);

    const release = () => {
      if (captureTimer !== undefined) window.clearTimeout(captureTimer);
      captureTimer = undefined;
      window.clearTimeout(giveUp);
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    };
    const capture = () => {
      if (cancelled || settled || !video.videoWidth || !video.videoHeight) return;
      // Dimensions arrive with the metadata, a drawable frame only later; a
      // draw before then stored a black poster. loadeddata/canplay re-arm.
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (captureTimer !== undefined) window.clearTimeout(captureTimer);
        captureTimer = undefined;
        return;
      }
      settled = true;
      const width = Math.min(maxWidth, video.videoWidth);
      const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) { setDoneFor(fileRef); release(); return; }
      try {
        context.drawImage(video, 0, 0, width, height);
        setShot({ ref: fileRef, src: canvas.toDataURL('image/jpeg', 0.72) });
      } catch { /* unsupported codec/canvas policy: keep the video-icon fallback */ }
      setDoneFor(fileRef);
      release();
    };
    const captureDecodedFrame = () => {
      if (cancelled || settled) return;
      // requestVideoFrameCallback is preferred, but Chromium may withhold it
      // for a nearly invisible decoder. Once loadeddata says dimensions exist,
      // a short fallback draw prevents an orphaned hidden video.
      if (captureTimer === undefined) captureTimer = window.setTimeout(capture, 100);
      if ('requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback(() => capture());
      } else {
        requestAnimationFrame(capture);
      }
    };
    const failed = () => {
      if (cancelled || settled) return;
      settled = true;
      setDoneFor(fileRef);
      release();
    };
    // A clip that never decodes a frame (and never errors) gives up rather
    // than keep a hidden video and its stream session alive.
    const giveUp = window.setTimeout(failed, 20_000);
    const seek = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = duration > 0 ? Math.min(1, duration / 2) : 0;
      // Chromium does not consistently decode a drawable frame for a detached,
      // metadata-only video. Muted play asks for one real frame; the callback
      // above captures it and immediately pauses/releases the stream.
      void video.play().catch(() => { /* loadeddata/canplay may still provide a frame */ });
      if (duration <= 0) captureDecodedFrame();
    };
    video.addEventListener('loadedmetadata', seek, { once: true });
    video.addEventListener('seeked', captureDecodedFrame, { once: true });
    video.addEventListener('loadeddata', captureDecodedFrame, { once: true });
    video.addEventListener('canplay', captureDecodedFrame, { once: true });
    video.addEventListener('error', failed, { once: true });
    video.load();
    return () => {
      cancelled = true;
      release();
    };
  }, [enabled, fileRef, stream.url, maxWidth]);

  return {
    poster: shot.ref === fileRef ? shot.src : '',
    url: kept.ref === fileRef ? kept.url : '',
    status: stream.status, message: stream.message, retry: stream.retry,
  };
}
