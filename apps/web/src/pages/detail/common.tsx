/**
 * Shared building blocks for the three record-detail pages (parcel 360,
 * property 360, passbook record) — MUI ports of the small helpers the rhub
 * pattadar app keeps inside RemoteApp.tsx: description fields, status chips,
 * the append-only NotesPanel, the read-only audit timeline, the linked
 * documents list (My Drive preview/download) and the media hero banner.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { gql } from '../../api/client';
import { avaColor, fmtLocal } from '../../lib/format';
import { openFileViewer } from '../../components/FileViewer';
import type { ViewerFile } from '../../components/FileViewer';
import { useBlobUrl } from '../../components/holdingCards';
import { fetchFileBlob } from '../documents/storage';

// ── tiny display helpers (ported from source) ────────────────────────────

/** ISO "YYYY-MM-DD" → "DD/MM/YYYY" (Indian convention); '—' when empty. */
export const fmtDMY = (s?: string): string =>
  s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';

export const money = (v?: number): string =>
  Number(v) > 0 ? `₹${Math.round(Number(v)).toLocaleString('en-IN')}` : '—';

export const dashVal = (v?: string | number | null): string =>
  v === '' || v === null || v === undefined ? '—' : String(v);

const STATUS_COLOR: Record<string, 'success' | 'info' | 'default' | 'error' | 'warning'> = {
  owned: 'success',
  'for-sale': 'info',
  sold: 'default',
  disputed: 'error',
  mortgaged: 'warning',
  rental: 'info',
  registered: 'success',
  possession: 'success',
  under_purchase: 'warning',
  agreement: 'warning',
};

/** Status chip — same colour semantics as the source's statusTag. */
export function StatusChip({ status }: { status?: string }) {
  const s = String(status || 'owned');
  return <Chip size="small" color={STATUS_COLOR[s] || 'success'} label={s.replace(/[-_]/g, ' ')} />;
}

/** Humanise a user id into a readable author name (source's authorName). */
export function authorName(uid?: string): string {
  if (!uid || uid === 'system') return 'System';
  const base = uid.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, (c) => c.toUpperCase()) : uid;
}

// ── layout atoms ─────────────────────────────────────────────────────────

/** Section card: small title + content (source used AntD Card size=small). */
export function SectionCard({
  title,
  action,
  children,
  sx,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  sx?: object;
}) {
  return (
    <Card sx={{ p: 1.75, height: '100%', ...sx }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{title}</Typography>
        {action}
      </Box>
      {children}
    </Card>
  );
}

/** One label/value row of a description list (AntD Descriptions.Item port). */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, py: 0.4, alignItems: 'baseline', minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}:
      </Typography>
      <Typography variant="body2" component="div" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Box>
  );
}

/** Two-column (single on xs) grid of Fields. */
export function FieldGrid({ columns = 2, children }: { columns?: 1 | 2; children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: columns === 2 ? { xs: '1fr', sm: '1fr 1fr' } : '1fr',
        columnGap: 2,
      }}
    >
      {children}
    </Box>
  );
}

/** Record-not-found body with a back link. */
export function NotFoundCard({ what, backTo, backLabel }: { what: string; backTo: string; backLabel: string }) {
  return (
    <Card sx={{ p: 4, textAlign: 'center' }}>
      <Typography sx={{ fontSize: 40 }}>🔍</Typography>
      <Typography sx={{ fontWeight: 600, mt: 1 }}>{what} not found or not yours</Typography>
      <Button href={backTo} sx={{ mt: 2 }}>
        ← {backLabel}
      </Button>
    </Card>
  );
}

// ── notes (append-only log; source's NotesPanel) ─────────────────────────

interface NoteRow {
  id: string;
  body: string;
  createdAt: string;
  ownerUserId: string;
}

export function NotesPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await gql<{ notes: NoteRow[] }>(
        `query($t:String!,$i:String!){ notes(entityType:$t,entityId:$i){ id body createdAt ownerUserId } }`,
        { t: entityType, i: entityId },
      );
      setNotes(d?.notes ?? []);
    } catch {
      setNotes([]);
    }
  }, [entityType, entityId]);
  useEffect(() => {
    if (entityId) void load();
  }, [load, entityId]);

  const add = useCallback(async () => {
    const b = body.trim();
    if (!b) return;
    setBusy(true);
    try {
      await gql(`mutation($t:String!,$i:String!,$b:String!){ addNote(entityType:$t,entityId:$i,body:$b){ id } }`, {
        t: entityType,
        i: entityId,
        b,
      });
      setBody('');
      await load();
    } catch {
      /* note stays in the box for retry */
    } finally {
      setBusy(false);
    }
  }, [entityType, entityId, body, load]);

  return (
    <Box>
      <TextField
        fullWidth
        multiline
        minRows={2}
        maxRows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void add();
          }
        }}
        placeholder="Add a note… (Enter to save, Shift+Enter for a new line)"
      />
      <Box sx={{ textAlign: 'right', my: 1 }}>
        <Button size="small" variant="contained" onClick={() => void add()} disabled={busy || !body.trim()}>
          Add note
        </Button>
      </Box>
      {notes.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No notes yet
        </Typography>
      ) : (
        notes.map((n) => (
          <Box key={n.id} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {n.body}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
              <Avatar sx={{ width: 18, height: 18, fontSize: 10, bgcolor: avaColor(authorName(n.ownerUserId)) }}>
                {authorName(n.ownerUserId).slice(0, 1).toUpperCase()}
              </Avatar>
              <Typography variant="caption" color="text.secondary">
                {authorName(n.ownerUserId)} · {fmtLocal(n.createdAt)}
              </Typography>
            </Box>
          </Box>
        ))
      )}
    </Box>
  );
}

// ── audit (read-only activity; source's AuditLogPanel) ───────────────────

const ACTION_TEXT: Record<string, string> = {
  upload_document: 'Uploaded a document',
  delete_document: 'Deleted a document',
  reclassify_document: 'Re-classified a document',
  add_note: 'Added a note',
  create_parcel: 'Created parcel',
  update_parcel: 'Updated parcel',
  record_mutation: 'Recorded mutation',
  update_parcel_geo: 'Updated location',
  create_passbook: 'Created passbook',
};

interface AuditRow {
  id: string;
  action: string;
  details: string;
  timestamp: string;
}

export function AuditTrailPanel({ target }: { target: string }) {
  const [events, setEvents] = useState<AuditRow[]>([]);
  useEffect(() => {
    if (!target) return;
    void (async () => {
      try {
        const d = await gql<{ auditEvents: AuditRow[] }>(
          `query($t:String!){ auditEvents(target:$t){ id action details timestamp } }`,
          { t: target },
        );
        setEvents(d?.auditEvents ?? []);
      } catch {
        setEvents([]);
      }
    })();
  }, [target]);

  if (events.length === 0)
    return (
      <Typography variant="body2" color="text.secondary">
        No activity recorded yet
      </Typography>
    );
  return (
    <Box>
      {events.map((e) => (
        <Box key={e.id} sx={{ display: 'flex', gap: 1.25, py: 0.75 }}>
          <Box sx={{ mt: 0.9, width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
          <Box>
            <Typography variant="body2">
              <b>{ACTION_TEXT[e.action] || String(e.action || '').replace(/_/g, ' ')}</b>
              {e.details ? (
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}
                  · {e.details}
                </Typography>
              ) : null}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {fmtLocal(e.timestamp)}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// ── linked documents ─────────────────────────────────────────────────────
// (The read-only DocumentsList lived here until the Files tabs gained the
// full upload panel — see PropertyFilesPanel.tsx.)

export interface LinkedDoc {
  id: string;
  docType: string;
  fileRef: string;
  tags?: string;
  createdAt?: string;
}

// ── media hero (parity: the source's ParcelPhotosSection cover banner) ───

const heroChipSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.75,
  px: 1.5,
  py: 0.75,
  borderRadius: 999,
  bgcolor: 'rgba(0,0,0,0.65)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  backdropFilter: 'blur(2px)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
} as const;

/**
 * Full-width hero banner above the record tabs — the newest photo (or a
 * video placeholder) as cover, "📷 N Photos" / "🎬 Video" chips bottom-left.
 * Clicking opens the in-portal FileViewer over all of the record's media
 * (never a new tab). Blob failures / no media degrade to the emerald
 * gradient — never a broken image.
 */
export function MediaHero({
  photos,
  videos,
  fallbackIcon,
  onGoFiles,
}: {
  photos: { fileRef: string; name: string }[];
  videos: { fileRef: string; name: string }[];
  fallbackIcon: string;
  onGoFiles?: () => void;
}) {
  const cover = photos[0]; // arrays are newest-first
  const url = useBlobUrl(cover?.fileRef);
  const items: ViewerFile[] = [
    ...photos.map((p) => ({ name: p.name, kind: 'image' as const, load: () => fetchFileBlob(p.fileRef) })),
    ...videos.map((v) => ({ name: v.name, kind: 'video' as const, load: () => fetchFileBlob(v.fileRef) })),
  ];
  const openAt = (i: number) => {
    if (items.length) openFileViewer(items, i);
    else onGoFiles?.();
  };
  return (
    <Box
      onClick={() => openAt(0)}
      role="button"
      aria-label={items.length ? 'Open gallery' : 'Add photos from the Files tab'}
      title={items.length ? 'Open gallery' : 'Add photos from the Files tab'}
      sx={{
        position: 'relative',
        height: { xs: 190, sm: 240, md: 280 },
        borderRadius: 3,
        overflow: 'hidden',
        cursor: 'pointer',
        mb: 1.5,
        background: 'linear-gradient(135deg, #144E8C 0%, #4D9BE0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url ? (
        <Box
          component="img"
          src={url}
          alt={cover?.name || 'Photo'}
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <Box component="span" sx={{ fontSize: 56, opacity: 0.9 }}>
          {photos.length === 0 && videos.length > 0 ? '🎬' : fallbackIcon}
        </Box>
      )}
      <Box sx={{ position: 'absolute', left: 16, bottom: 14, display: 'flex', gap: 1.25 }}>
        {photos.length > 0 && (
          <Box
            sx={heroChipSx}
            onClick={(e) => {
              e.stopPropagation();
              openAt(0);
            }}
          >
            📷 {photos.length} Photo{photos.length !== 1 ? 's' : ''}
          </Box>
        )}
        {videos.length > 0 && (
          <Box
            sx={heroChipSx}
            onClick={(e) => {
              e.stopPropagation();
              openAt(photos.length);
            }}
          >
            🎬 {videos.length > 1 ? `${videos.length} Videos` : 'Video'}
          </Box>
        )}
        {photos.length === 0 && videos.length === 0 && onGoFiles && (
          <Box
            sx={heroChipSx}
            onClick={(e) => {
              e.stopPropagation();
              onGoFiles();
            }}
          >
            📷 Add photos ›
          </Box>
        )}
      </Box>
    </Box>
  );
}
