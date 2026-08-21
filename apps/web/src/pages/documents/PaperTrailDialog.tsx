/**
 * The paper trail — what a document cites, and what cites it.
 *
 * A chain of title is the ordinary case, not an advanced one: land bought from
 * A and sold on to C is two registered deeds, and the second one's whole claim
 * rests on the first. Until now those were two unrelated rows, and the reader's
 * own citation could only ever render as a dashed "cited, not filed" card.
 *
 * Both directions are shown, and labelled, because a trail you can only walk
 * one way tells a person half of what they own.
 */
import { useEffect, useMemo, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import { gql } from '../../api/client';

/** The kinds of link a person can assert. Free text is refused server-side —
 *  a trail whose edges say whatever somebody typed cannot be walked. */
export const RELATIONS: { key: string; label: string; hint: string }[] = [
  { key: 'prior_title', label: 'Comes from', hint: 'The deed this one’s title rests on' },
  { key: 'gpa', label: 'Acted under', hint: 'The power of attorney used to execute it' },
  { key: 'amendment', label: 'Amends', hint: 'A rectification or supplementary deed' },
  { key: 'correction', label: 'Corrects', hint: 'Fixes an error in the other paper' },
  { key: 'ec_for', label: 'Searched for', hint: 'An EC covering that document' },
];

const relationLabel = (key: string) => RELATIONS.find((r) => r.key === key)?.label ?? key;

/** How the far end reads when this document is the one being CITED. */
const inverseLabel = (key: string) =>
  ({
    prior_title: 'Is the source of',
    gpa: 'Was the authority for',
    amendment: 'Is amended by',
    correction: 'Is corrected by',
    ec_for: 'Was searched by',
  })[key] ?? `Cited by (${key})`;

export interface TrailDoc {
  id: string;
  name: string;
  docTypeLabel: string;
  regYear: string;
}

interface Link {
  id: string;
  relation: string;
  direction: 'cites' | 'cited_by';
  fromDocumentId: string;
  toDocumentId: string;
  otherName: string;
  otherDocType: string;
  otherRegYear: string;
}

export function PaperTrailDialog({
  doc,
  candidates,
  onClose,
  onToast,
}: {
  doc: TrailDoc | null;
  /** Every other document in the vault — what this one may be linked to. */
  candidates: TrailDoc[];
  onClose: () => void;
  onToast: (msg: string, severity: 'success' | 'error' | 'info') => void;
}) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [relation, setRelation] = useState('prior_title');
  const [target, setTarget] = useState<TrailDoc | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (id: string) => {
    setLinks(null);
    try {
      const d = await gql<{ documentLinks: Link[] }>(
        'query($id:String!){ documentLinks(documentId:$id){ id relation direction fromDocumentId toDocumentId otherName otherDocType otherRegYear } }',
        { id },
      );
      setLinks(d.documentLinks ?? []);
    } catch {
      setLinks([]);
      onToast('Could not load the paper trail', 'error');
    }
  };

  useEffect(() => {
    if (doc) void load(doc.id);
    else {
      setLinks(null);
      setTarget(null);
      setRelation('prior_title');
    }
    // The dialog is keyed to one document; reloading on identity is the point.
  }, [doc?.id]);

  // A document may not cite itself, and one already linked is not offered
  // twice — the server refuses both, but an option that can only fail is a
  // trap rather than a choice.
  const linkable = useMemo(() => {
    if (!doc) return [];
    const taken = new Set((links ?? []).map((l) => (l.direction === 'cites' ? l.toDocumentId : l.fromDocumentId)));
    return candidates.filter((c) => c.id !== doc.id && !taken.has(c.id));
  }, [candidates, doc, links]);

  const addLink = async () => {
    if (!doc || !target) return;
    setBusy(true);
    try {
      await gql(
        'mutation($f:String!,$t:String!,$r:String!,$n:String!){ linkDocuments(fromId:$f,toId:$t,relation:$r,note:$n){ id } }',
        { f: doc.id, t: target.id, r: relation, n: '' },
      );
      setTarget(null);
      await load(doc.id);
      onToast('Linked', 'success');
    } catch (err) {
      // The server's refusal is the useful sentence — "those two already point
      // the other way round" tells a person exactly what to do next.
      onToast(err instanceof Error ? err.message : 'Could not link those documents', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeLink = async (id: string) => {
    if (!doc) return;
    setBusy(true);
    try {
      await gql('mutation($id:String!){ unlinkDocuments(id:$id) }', { id });
      await load(doc.id);
      onToast('Link removed', 'success');
    } catch {
      onToast('Could not remove that link', 'error');
    } finally {
      setBusy(false);
    }
  };

  const label = (l: Link) => (l.direction === 'cites' ? relationLabel(l.relation) : inverseLabel(l.relation));

  return (
    <Dialog open={!!doc} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        Paper trail
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {doc?.name}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {links === null ? (
          <LinearProgress sx={{ my: 3 }} />
        ) : links.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', my: 2 }}>
            Nothing is linked to this document yet. If it was bought from someone who had bought it
            themselves, link the earlier deed here — that is the chain of title.
          </Typography>
        ) : (
          <Box sx={{ my: 1 }}>
            {links.map((l) => (
              <Box
                key={l.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}
              >
                {/* Which way this edge runs, at a glance. */}
                {l.direction === 'cites' ? (
                  <NorthEastIcon fontSize="small" sx={{ color: 'primary.main' }} />
                ) : (
                  <SouthWestIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                )}
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    {label(l)}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {l.otherName || 'Document'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    {[l.otherDocType, l.otherRegYear].filter(Boolean).join(' · ') || '—'}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  aria-label={`Remove the link to ${l.otherName || 'this document'}`}
                  disabled={busy}
                  onClick={() => void removeLink(l.id)}
                >
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.6 }}>
          LINK ANOTHER DOCUMENT
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
          <TextField
            select
            size="small"
            label="This document…"
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            sx={{ minWidth: 170 }}
            helperText={RELATIONS.find((r) => r.key === relation)?.hint}
          >
            {RELATIONS.map((r) => (
              <MenuItem key={r.key} value={r.key}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            size="small"
            sx={{ flexGrow: 1, minWidth: 220 }}
            options={linkable}
            value={target}
            onChange={(_e, v) => setTarget(v)}
            getOptionLabel={(o) => o.name}
            renderOption={(props, o) => (
              <li {...props} key={o.id}>
                <Box>
                  <Typography variant="body2">{o.name}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {[o.docTypeLabel, o.regYear].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
              </li>
            )}
            renderInput={(params) => <TextField {...params} label="…this one" />}
          />
        </Box>
        {linkable.length === 0 && links !== null ? (
          <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1 }}>
            There is nothing else in the vault to link to yet.
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Done
        </Button>
        <Button variant="contained" disabled={!target || busy} onClick={() => void addLink()}>
          Link
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** A one-line summary for the row, so the trail is visible without opening it. */
export function trailChip(count: number) {
  if (!count) return null;
  return <Chip size="small" variant="outlined" label={count === 1 ? '1 link' : `${count} links`} />;
}
