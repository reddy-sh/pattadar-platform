/** Lazy first-frame posters from the same Range-streamed video source.
 *
 * The gateway has no video transcoder/thumbnailer. A hidden native video asks
 * only for metadata and the ranges needed around one second, then a canvas
 * captures that frame. No full-file Blob is created. Posters are in-memory
 * data URLs and disappear with the page; the original remains the evidence.
 */
import { useEffect, useState } from 'react';

import { useMediaStream } from './mediaStream';

export function useVideoPoster(fileRef: string, enabled: boolean) {
  const [done, setDone] = useState(false);
  const [url, setUrl] = useState('');
  const stream = useMediaStream(fileRef, enabled && !done);
  const [poster, setPoster] = useState('');

  useEffect(() => { setDone(false); setUrl(''); }, [fileRef]);
  useEffect(() => { if (stream.url) setUrl(stream.url); }, [stream.url]);

  useEffect(() => {
    setPoster('');
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
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    };
    const capture = () => {
      if (cancelled || settled || !video.videoWidth || !video.videoHeight) return;
      settled = true;
      const width = Math.min(320, video.videoWidth);
      const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) { setDone(true); release(); return; }
      try {
        context.drawImage(video, 0, 0, width, height);
        setPoster(canvas.toDataURL('image/jpeg', 0.72));
      } catch { /* unsupported codec/canvas policy: keep the video-icon fallback */ }
      setDone(true);
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
      if (settled) return;
      settled = true;
      setDone(true);
      release();
    };
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
  }, [enabled, stream.url]);

  return { poster, url, status: stream.status, message: stream.message, retry: stream.retry };
}
