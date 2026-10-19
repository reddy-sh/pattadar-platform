/** Edit details — a document's type, deed number, registration date and
 *  registration office, from Documents' row menu and from the Reader.
 *
 *  The server replaces all four fields on every save, so every field is sent
 *  every time, starting from what the read gave (an omitted field would be
 *  erased). The date is DD/MM/YYYY, day first, and is never put through
 *  `new Date(string)`, which reads "03/04/2026" as 4 March. */
import { useId, useState } from 'react';
import type { RefObject } from 'react';

import { useUpdatePaperDetails } from '../api';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { SHELF_WORD } from '../ui';
import { PAPER_TYPES } from '../pages/PaperDialogs';
import { dayFirstProblem } from './dayFirst';

export interface PaperDetails {
  id: string; title: string; shelf: string;
  docNo?: string; registeredOn?: string; office?: string;
}

export function PaperDetailsDrawer({ paper, eyebrow = 'Documents', onClose, returnFocus }: {
  paper: PaperDetails; eyebrow?: string; onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const save = useUpdatePaperDetails();
  const whyId = useId();
  const [shelf, setShelf] = useState(paper.shelf || 'unsorted');
  const [docNo, setDocNo] = useState(paper.docNo ?? '');
  const [registeredOn, setRegisteredOn] = useState(paper.registeredOn ?? '');
  const [office, setOffice] = useState(paper.office ?? '');
  const [err, setErr] = useState('');
  const dateProblem = dayFirstProblem(registeredOn);
  const dirty = shelf !== (paper.shelf || 'unsorted') || docNo !== (paper.docNo ?? '')
    || registeredOn !== (paper.registeredOn ?? '') || office !== (paper.office ?? '');
  const types = PAPER_TYPES.includes(paper.shelf) || !paper.shelf ? PAPER_TYPES : [...PAPER_TYPES, paper.shelf];

  const file = async () => {
    if (dateProblem || save.isPending) return;
    setErr('');
    try {
      const ok = (await save.mutateAsync({
        paperId: paper.id, shelf, docNo: docNo.trim(), registeredOn: registeredOn.trim(), office: office.trim(),
      })).web.updatePaperDetails;
      if (!ok) { setErr('Those details could not be saved. Nothing has changed.'); return; }
    } catch {
      return;
    }
    onClose();
  };

  return (
    <Drawer
      eyebrow={drawerEyebrow(eyebrow, 'Edit details')}
      title="Edit details"
      sub={paper.title}
      onClose={onClose}
      onSubmit={() => void file()}
      busy={save.isPending}
      dirty={dirty}
      discardCopy={{ title: 'Discard these changes?', body: 'The details you changed will not be saved.' }}
      initialFocus="#pd-type"
      returnFocus={returnFocus}
      primaryWhy={dateProblem ? { id: whyId, text: dateProblem } : undefined}
      primary={(
        <DrawerAction label="Save the details" working="Saving…" pending={save.isPending}
                      paused={save.isPaused} disabled={!!dateProblem}
                      describedBy={dateProblem ? whyId : undefined} />
      )}
    >
      <div className="field">
        <label htmlFor="pd-type">Type</label>
        <select id="pd-type" value={shelf} onChange={(e) => setShelf(e.target.value)}>
          {types.map((s) => <option key={s} value={s}>{SHELF_WORD[s] ?? s}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pd-docno">Deed number</label>
        <input id="pd-docno" type="text" value={docNo} autoComplete="off" placeholder="1842/2019"
               onChange={(e) => setDocNo(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pd-date">Registration date</label>
        <input id="pd-date" type="text" inputMode="numeric" value={registeredOn} autoComplete="off"
               placeholder="DD/MM/YYYY" aria-invalid={!!dateProblem || undefined}
               onChange={(e) => setRegisteredOn(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pd-office">Registration office</label>
        <input id="pd-office" type="text" value={office} autoComplete="off" placeholder="Markapur SRO"
               onChange={(e) => setOffice(e.target.value)} />
      </div>
      {err && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>}
    </Drawer>
  );
}
