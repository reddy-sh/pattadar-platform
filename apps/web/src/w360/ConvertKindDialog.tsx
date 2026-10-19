/** "Change to agricultural land?" — the one confirmation for moving a property
 *  to the farmland register (Reddy, 12/10/2026, D1; spec 2026-10-11 §7). The
 *  Overview's farmland prompt and the property's ⋮ menu both open it. It says
 *  what changes before it changes: the unit becomes acres and the land moves
 *  under a khata. The address stays /properties/:id, so nothing navigates;
 *  the refreshed record re-reads as a parcel. */
import { useState } from 'react';

import { type ConvertTarget, useConvertRecordKind, useRecordOverview } from './api';
import { Dialog } from './Dialog';
import { num } from './ui';

export function ConvertKindDialog({ rec, onClose }: {
  rec: { id: string; title: string };
  onClose: () => void;
}) {
  const convert = useConvertRecordKind();
  const [err, setErr] = useState('');
  // The server's own preview of this move (same code as the move): the
  // extent in its unit and in acres, and which khata it goes under.
  const t = useRecordOverview(rec.id).data?.convertTarget ?? null;
  return (
    <Dialog
      title="Change to agricultural land?"
      busy={convert.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={convert.isPending}
                  onClick={async () => {
                    setErr('');
                    try {
                      await convert.mutateAsync({ recordId: rec.id, to: 'parcel' });
                      onClose();
                    } catch (e) {
                      // The server's refusal is in words ("It has a building
                      // on it…"); nothing was moved.
                      setErr(e instanceof Error ? e.message : 'Nothing was changed. Try again.');
                    }
                  }}>
            {convert.isPending ? 'Changing…' : 'Change to agricultural land'}
          </button>
        </>
      )}
    >
      <p style={{ marginTop: 0 }}>{rec.title} will be kept as agricultural land.</p>
      <ul className="stack sm" style={{ margin: 0, paddingLeft: '1.25rem' }}>
        <li>
          Its extent is measured in acres
          {t && t.fromArea > 0 && <>: <span className="num">{num(t.fromArea)} {t.fromUnit}</span> becomes{' '}
            <span className="num">{num(t.acres, 2)} ac</span></>}.
        </li>
        <li>{khataLine(t)}</li>
        <li>Its documents, photos, people and activity stay with it, at the same address.</li>
      </ul>
      {err && <p className="note" role="alert" style={{ marginBottom: 0, color: 'var(--w-danger)' }}>{err}</p>}
    </Dialog>
  );
}

/** Exactly what the server will do with the khata for THIS record. */
function khataLine(t: ConvertTarget | null): string {
  if (!t) return 'It moves under a khata.';
  const where = t.village ? ` in ${t.village}` : '';
  if (t.reuse) return `It moves under your khata ${t.khataNo}${where}.`;
  return t.khataNo
    ? `It moves under a new khata ${t.khataNo}${where}; you have none with that number there yet.`
    : 'It moves under a new khata you can fill in later.';
}
