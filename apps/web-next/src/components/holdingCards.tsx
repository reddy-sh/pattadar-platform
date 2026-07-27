'use client';

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
import type { Theme } from '@mui/material/styles';
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
    owned: '#2e7d32',
    'for-sale': '#1677ff',
    sold: '#8c8c8c',
    disputed: '#cf1322',
  };
  return { text: s.replace(/-/g, ' '), color: colors[s] || '#2e7d32' };
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

/** Small TONAL overlay chip (M3): tinted container fill + readable on-colour. */
const pillSx = (color: string) => ({
  bgcolor: `color-mix(in srgb, ${color} 14%, #FFFFFF)`,
  color: `color-mix(in srgb, ${color} 78%, #16191c)`,
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  px: 1.25,
  py: 0.625,
  borderRadius: 999,
  textTransform: 'capitalize' as const,
  whiteSpace: 'nowrap' as const,
});

/**
 * M3 interactive-card shell: whole card clickable with hover lift (-2px),
 * primary-tinted border + soft shadow, pressed state layer. Motion rides the
 * theme's standard tokens; `prefers-reduced-motion` is handled globally.
 */
export const clickableCardSx = (t: Theme) => ({
  position: 'relative' as const,
  display: 'flex',
  flexDirection: 'column' as const,
  cursor: 'pointer',
  transition: t.transitions.create(['transform', 'box-shadow', 'border-color', 'background-color'], {
    duration: t.transitions.duration.standard,
    easing: t.transitions.easing.easeInOut,
  }),
  '&:hover': {
    transform: 'translateY(-2px)',
    borderColor: `color-mix(in srgb, ${(t.vars ?? t).palette.primary.main} 45%, transparent)`,
    boxShadow: '0 4px 12px rgba(13, 38, 25, 0.12)',
  },
  '&:active': {
    transform: 'translateY(0)',
    boxShadow: 'none',
    backgroundColor: (t.vars ?? t).palette.action.selected,
  },
});

/**
 * Card media band (M3 anatomy, full-bleed under the card's own radius) —
 * the cover photo when there is one, else a layered emerald gradient with a
 * large, partially-cropped, low-opacity motif anchored bottom-right. Status
 * pills overlay the top-left as small tonal chips on a subtle scrim.
 */
export function CardHero({
  fileRef,
  src,
  fallbackIcon,
  pill,
  pill2,
  height = 140,
}: {
  fileRef?: string;
  /** Direct image URL (holder-photo data URLs etc.) — wins over fileRef. */
  src?: string;
  fallbackIcon: string;
  pill?: Pill;
  pill2?: Pill;
  height?: number;
}) {
  const blobUrl = useBlobUrl(fileRef);
  const url = src || blobUrl;
  return (
    <Box
      sx={{
        position: 'relative',
        height,
        flexShrink: 0,
        overflow: 'hidden',
        background:
          'radial-gradient(120% 100% at 85% -20%, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0) 55%), linear-gradient(150deg, #144E8C 0%, #1976D2 48%, #4D9BE0 100%)',
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
        <Box
          component="span"
          aria-hidden
          sx={{
            position: 'absolute',
            right: -14,
            bottom: -22,
            fontSize: 96,
            lineHeight: 1,
            opacity: 0.35,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {fallbackIcon}
        </Box>
      )}
      {/* Subtle top scrim so overlaid chips and the ⋮ read on any media. */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(9,20,33,0.32) 0%, rgba(9,20,33,0.10) 32%, rgba(9,20,33,0) 55%)',
          pointerEvents: 'none',
        }}
      />
      {(pill || pill2) && (
        <Box sx={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 0.75 }}>
          {pill && <Box sx={pillSx(pill.color)}>{pill.text}</Box>}
          {pill2 && <Box sx={pillSx(pill2.color)}>{pill2.text}</Box>}
        </Box>
      )}
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
    <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }} onClick={(e) => e.stopPropagation()}>
      <IconButton
        size="small"
        aria-label="Card actions"
        onClick={open}
        sx={{
          // Scrim circle for contrast over media; always visible (touch),
          // brightens on hover.
          bgcolor: 'rgba(10, 26, 17, 0.40)',
          color: '#fff',
          backdropFilter: 'blur(2px)',
          '&:hover': { bgcolor: 'rgba(10, 26, 17, 0.62)' },
        }}
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

/**
 * One soft container for a row of stats (M3: no borders between stats — a
 * single tinted surface with hairline dividers).
 */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={(t) => ({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'stretch',
        mb: 2,
        borderRadius: 4, // 16px — card shape
        bgcolor: 'rgba(25, 118, 210, 0.05)',
        ...t.applyStyles('dark', { bgcolor: 'rgba(144, 202, 249, 0.08)' }),
        '& > *': { flex: 1, minWidth: 140 },
        '& > * + *': { borderLeft: '1px solid', borderColor: 'divider' },
      })}
    >
      {children}
    </Box>
  );
}

/** One stat: overline label + tabular-numeral figure (source's `tile()`). */
export function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ px: 2.5, py: 1.75, minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary" component="div" sx={{ whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
      <Typography
        className="tnum"
        sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}
      >
        {value}
      </Typography>
    </Box>
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
      <Typography variant="h6" component="p" sx={{ mt: 2, mb: 1 }}>
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
