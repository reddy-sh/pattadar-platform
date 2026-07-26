/**
 * Card building blocks for the Passbooks and Land & Properties grids —
 * functional port of the rhub pattadar app's ParcelGallery helpers
 * (CardHero, CardActions, parcelPill, stakePill) in MUI.
 */
import { useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { apiFetch } from '../api/client';

export interface Pill {
  text: string;
  color: string;
}

/** Status pill for a holding card hero — colour-coded like a listing site. */
export function parcelPill(status?: string, litigation?: boolean): Pill {
  if (litigation) return { text: 'Litigation', color: '#cf1322' };
  const s = String(status || 'owned');
  const colors: Record<string, string> = {
    owned: '#389e0d',
    'for-sale': '#1677ff',
    sold: '#8c8c8c',
    disputed: '#cf1322',
  };
  return { text: s.replace(/-/g, ' '), color: colors[s] || '#389e0d' };
}

/** Stake pill (managed / watch) — owned holdings show no second pill. */
export function stakePill(stake?: string): Pill | undefined {
  if (stake === 'managed') return { text: 'Managed', color: '#d48806' };
  if (stake === 'watch') return { text: 'Watch', color: '#1677ff' };
  return undefined;
}

/** Fetch a My-Drive fileRef's bytes into an object URL (card cover photos). */
export function useBlobUrl(fileRef?: string): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!fileRef) {
      setUrl('');
      return;
    }
    let revoke = '';
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/gateway/storage/files/${fileRef}/content`);
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        revoke = URL.createObjectURL(blob);
        setUrl(revoke);
      } catch {
        /* cover is decorative — ignore */
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [fileRef]);
  return url;
}

const pillSx = (color: string) => ({
  position: 'absolute' as const,
  top: 8,
  bgcolor: color,
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  px: 1,
  py: 0.5,
  borderRadius: 999,
  textTransform: 'capitalize' as const,
  whiteSpace: 'nowrap' as const,
});

/**
 * Card hero band — the cover photo when there is one, else an emerald
 * gradient with an icon; status pills overlay the top-left corner.
 */
export function CardHero({
  fileRef,
  fallbackIcon,
  pill,
  pill2,
  height = 110,
}: {
  fileRef?: string;
  fallbackIcon: string;
  pill?: Pill;
  pill2?: Pill;
  height?: number;
}) {
  const url = useBlobUrl(fileRef);
  return (
    <Box
      sx={{
        position: 'relative',
        height,
        borderRadius: 2.5,
        overflow: 'hidden',
        mb: 1.25,
        background: 'linear-gradient(135deg, #1E7A46 0%, #35996B 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url ? (
        <Box
          component="img"
          src={url}
          alt=""
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <Box component="span" sx={{ fontSize: 40, opacity: 0.9 }}>
          {fallbackIcon}
        </Box>
      )}
      {pill && <Box sx={{ ...pillSx(pill.color), left: 8 }}>{pill.text}</Box>}
      {pill2 && <Box sx={{ ...pillSx(pill2.color), right: 8 }}>{pill2.text}</Box>}
    </Box>
  );
}

export interface CardAction {
  key: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}

/** Top-right "⋮" menu on a grid card (stops click-through to the card). */
export function CardActionsMenu({ actions }: { actions: CardAction[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setAnchor(e.currentTarget);
  };
  return (
    <Box sx={{ position: 'absolute', top: 10, right: 10, zIndex: 2 }} onClick={(e) => e.stopPropagation()}>
      <IconButton
        size="small"
        aria-label="Card actions"
        onClick={open}
        sx={{ bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'rgba(255,255,255,0.95)' }, color: '#1A1A1A' }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {actions.map((a) => (
          <MenuItem
            key={a.key}
            onClick={() => {
              setAnchor(null);
              a.onClick();
            }}
            sx={a.danger ? { color: 'error.main' } : undefined}
          >
            {a.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

/** Small stat card: caption label + big bold value (source's `tile()`). */
export function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card sx={{ p: 1.5, flex: 1, minWidth: 140 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.3 }}>{value}</Typography>
    </Card>
  );
}

/** First-run landing for an empty list page (source's EmptyLanding). */
export function EmptyLanding({
  icon,
  title,
  body,
  ctaText,
  onCta,
  secondary,
}: {
  icon: string;
  title: string;
  body: string;
  ctaText: string;
  onCta: () => void;
  secondary?: ReactNode;
}) {
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 9, px: 3 }}>
      <Box sx={{ fontSize: 56, lineHeight: 1 }}>{icon}</Box>
      <Typography variant="h4" component="p" sx={{ mt: 2, mb: 1 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
        {body}
      </Typography>
      <Button variant="contained" size="large" sx={{ mt: 2.5 }} onClick={onCta}>
        {ctaText}
      </Button>
      {secondary && <Box sx={{ mt: 1.5 }}>{secondary}</Box>}
    </Card>
  );
}
