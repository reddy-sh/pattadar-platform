/**
 * In-portal file viewer — HARD RULE: portal content NEVER opens a new tab.
 * A full-screen MUI Dialog (dark surface) that renders
 * images, PDFs (iframe over a blob URL) and video inline; anything else
 * shows "Download to view". Lists get ←/→ navigation (buttons + arrow keys)
 * and Download always saves via an anchor `download` attribute.
 *
 * Open it from anywhere with openFileViewer(files, index) — a window
 * CustomEvent carries the request to the single <FileViewerHost/> mounted in
 * AppShell (fire-and-forget, same pattern as the rhub shell actions).
 */
import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';

export type ViewerKind = 'image' | 'pdf' | 'video' | 'other';

export interface ViewerFile {
  name: string;
  /** Ready URL (e.g. a data: URL) — used as-is. */
  url?: string;
  /** Ready bytes — the viewer creates (and revokes) the object URL. */
  blob?: Blob;
  /** Lazy fetch, called when the file is first shown; may reject. */
  load?: () => Promise<Blob>;
  /** Optional type override; otherwise sniffed from MIME / file name. */
  kind?: ViewerKind;
}

const OPEN_EVENT = 'pattadar:view-files';

/** Open the in-portal viewer over a list of files (never a new tab). */
export function openFileViewer(files: ViewerFile[], index = 0): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { files, index } }));
}

function sniffKind(blob: Blob | undefined, name: string, url: string): ViewerKind {
  const mime =
    String(blob?.type || (url.startsWith('data:') ? url.slice(5).split(/[;,]/)[0] : '')).toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('video/')) return 'video';
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'svg'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  return 'other';
}

type Resolved =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; url: string; kind: ViewerKind };

/** Mounted once (AppShell); listens for openFileViewer() requests. */
export function FileViewerHost() {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<ViewerFile[]>([]);
  const [idx, setIdx] = useState(0);
  const [cur, setCur] = useState<Resolved>({ state: 'loading' });
  const cacheRef = useRef(new Map<number, Resolved>());
  const madeUrlsRef = useRef<string[]>([]);

  const cleanup = () => {
    madeUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    madeUrlsRef.current = [];
    cacheRef.current.clear();
  };

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ files?: ViewerFile[]; index?: number }>).detail;
      if (!d?.files?.length) return;
      cleanup();
      setFiles(d.files);
      setIdx(Math.min(Math.max(0, d.index ?? 0), d.files.length - 1));
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      cleanup();
    };
  }, []);

  // Resolve the current file (lazy blob fetch → object URL), cached per session.
  useEffect(() => {
    if (!open) return;
    const f = files[idx];
    if (!f) return;
    const hit = cacheRef.current.get(idx);
    if (hit) {
      setCur(hit);
      return;
    }
    let cancelled = false;
    setCur({ state: 'loading' });
    void (async () => {
      let r: Resolved;
      try {
        let blob = f.blob;
        let url = f.url || '';
        if (!url) {
          if (!blob && f.load) blob = await f.load();
          if (!blob) throw new Error('no source');
          url = URL.createObjectURL(blob);
          madeUrlsRef.current.push(url);
        }
        r = { state: 'ready', url, kind: f.kind || sniffKind(blob, f.name, url) };
      } catch {
        r = { state: 'error' };
      }
      cacheRef.current.set(idx, r);
      if (!cancelled) setCur(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, idx, files]);

  const close = () => {
    setOpen(false);
    cleanup();
  };
  const step = (dir: 1 | -1) => setIdx((i) => (i + dir + files.length) % files.length);

  const download = () => {
    if (cur.state !== 'ready') return;
    const a = document.createElement('a');
    a.href = cur.url;
    a.download = files[idx]?.name || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const name = files[idx]?.name || '';
  const many = files.length > 1;

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={close}
      onKeyDown={(e) => {
        if (!many) return;
        if (e.key === 'ArrowRight') step(1);
        if (e.key === 'ArrowLeft') step(-1);
      }}
      slotProps={{ paper: { sx: { bgcolor: 'var(--color-paper)', color: 'var(--color-ink)' } } }}
    >
      {/* Top bar — filename, counter, Download, close. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: '1px solid var(--color-rule)',
          flexShrink: 0,
        }}
      >
        <Typography noWrap sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} title={name}>
          {name}
        </Typography>
        {many && (
          <Typography variant="body2" sx={{ opacity: 0.7, flexShrink: 0 }}>
            {idx + 1} / {files.length}
          </Typography>
        )}
        <Button
          size="small"
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={download}
          disabled={cur.state !== 'ready'}
          sx={{ color: 'var(--color-ink)', borderColor: 'var(--color-rule-strong)', flexShrink: 0 }}
          variant="outlined"
        >
          Download
        </Button>
        <IconButton onClick={close} aria-label="Close viewer" sx={{ color: 'var(--color-ink)', flexShrink: 0 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Body — centered content with side navigation. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {cur.state === 'loading' && <CircularProgress sx={{ color: 'var(--color-ink)' }} aria-label="Loading file" />}
        {cur.state === 'error' && (
          <Box sx={{ textAlign: 'center', px: 3 }}>
            <Typography sx={{ fontSize: 40 }}>⚠️</Typography>
            <Typography sx={{ fontWeight: 600, mt: 1 }}>Could not load this file</Typography>
            <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>
              Files are stored on the cloud gateway — this preview may only be available on pattadar.com.
            </Typography>
          </Box>
        )}
        {cur.state === 'ready' && cur.kind === 'image' && (
          <Box
            component="img"
            src={cur.url}
            alt={name}
            sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        )}
        {/* White stays: a PDF page IS white, and tinting the frame behind it
            would show as a halo around the document. */}
        {cur.state === 'ready' && cur.kind === 'pdf' && (
          <Box component="iframe" title={name} src={cur.url} sx={{ border: 0, width: '100%', height: '100%', bgcolor: '#fff' }} />
        )}
        {cur.state === 'ready' && cur.kind === 'video' && (
          <Box component="video" controls autoPlay src={cur.url} sx={{ maxWidth: '100%', maxHeight: '100%' }} />
        )}
        {cur.state === 'ready' && cur.kind === 'other' && (
          <Box sx={{ textAlign: 'center', px: 3 }}>
            <Typography sx={{ fontSize: 40 }}>📄</Typography>
            <Typography sx={{ fontWeight: 600, mt: 1 }}>{name}</Typography>
            <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5, mb: 2 }}>
              This file type has no inline preview — download to view.
            </Typography>
            <Button variant="contained" startIcon={<FileDownloadOutlinedIcon />} onClick={download}>
              Download to view
            </Button>
          </Box>
        )}
        {/* Neutral white-on-scrim: these float over arbitrary user media, so a
            palette tint would fight whatever photo is underneath. */}
        {many && (
          <>
            <IconButton
              aria-label="Previous file"
              onClick={() => step(-1)}
              sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#fff', bgcolor: 'rgba(255,255,255,0.12)', '&:hover': { bgcolor: 'rgba(255,255,255,0.24)' } }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              aria-label="Next file"
              onClick={() => step(1)}
              sx={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#fff', bgcolor: 'rgba(255,255,255,0.12)', '&:hover': { bgcolor: 'rgba(255,255,255,0.24)' } }}
            >
              <ChevronRightIcon />
            </IconButton>
          </>
        )}
      </Box>
    </Dialog>
  );
}
