/** The dialogs that change one document itself — its name, its type, whether
 *  it exists — shared by the Reader (/papers/:id) and Documents
 *  (/papers). They lived inside Reader.tsx, which left Documents, the page
 *  built to manage files, with no way to rename or delete one.
 *
 *  "Type" is the word for a document's shelf everywhere the owner reads it
 *  (Documents' column and filter, the Reader rail). "Move" means folders only. */
import { useState } from 'react';
import type { FormEvent } from 'react';

import { useDeletePaper, useUpdatePaper } from '../api';
import { Dialog } from '../Dialog';
import { SHELF_WORD, plural } from '../ui';

/** The types a document can be given, in the order Documents lists them. */
export const PAPER_TYPES = ['title', 'revenue', 'map', 'photos', 'search', 'identity', 'old', 'unsorted'];

/** What a downloaded scan should be called on disk.
 *
 *  `downloadBlob` falls back to a bare "document" with no extension, which
 *  lands in Downloads as a file the operating system will not open. The
 *  extension therefore comes off the bytes' own media type (or the row's),
 *  never off the title, and the title is only ever the base name. */
const EXT: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/tiff': 'tif',
};

export function fileNameFor(title: string, mime: string): string {
  const ext = EXT[mime] ?? (mime.split('/')[1] ?? '').replace(/[^a-z0-9]/gi, '');
  // Slashes and colons are legal in a survey number and illegal in a filename.
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'document';
  return ext ? `${base}.${ext}` : base;
}

interface PaperRef { id: string; title: string; shelf: string }

/** Rename a document. The name the owner gives wins over the one Documents
 *  composes (paperTitle.ts). Its type and deed facts are Edit details. */
export function EditPaperDialog({ paper, onClose }: { paper: PaperRef; onClose: () => void }) {
  const editPaper = useUpdatePaper();
  const [draft, setDraft] = useState(paper.title);
  const [err, setErr] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setErr('');
    // An empty shelf means "leave the type where it is" to the API.
    try {
      // `update_paper` answers false, not an error, for a row that is not the
      // caller's: that is a refusal, and the dialog stays open saying so.
      const ok = (await editPaper.mutateAsync({ paperId: paper.id, name, shelf: '' })).web.updatePaper;
      if (!ok) { setErr('That name could not be saved. Nothing has changed.'); return; }
    } catch {
      return;
    }
    onClose();
  };

  return (
    <Dialog
      title="Rename"
      busy={editPaper.isPending}
      dismissable={false}
      initialFocus="#rd-name"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="edit-paper" className="btn primary"
                  disabled={!draft.trim() || editPaper.isPending}>
            {editPaper.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <form id="edit-paper" onSubmit={(e) => { void save(e); }} style={{ display: 'grid', gap: 'var(--space-sm)' }}>
        <div className="field">
          <label htmlFor="rd-name">What it is called</label>
          <input id="rd-name" type="text" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </div>
        {err && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>}
      </form>
    </Dialog>
  );
}

/** Give several documents one type. Each keeps its own name: the write takes
 *  a name, so each paper sends the one it already has. */
export function SetTypeDialog({ papers, onClose, onDone }: {
  papers: PaperRef[]; onClose: () => void; onDone: (n: number) => void;
}) {
  const editPaper = useUpdatePaper();
  const [shelf, setShelf] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!shelf || busy) return;
    setBusy(true);
    let n = 0;
    try {
      for (const p of papers) {
        if (p.shelf === shelf) continue;
        await editPaper.mutateAsync({ paperId: p.id, name: p.title, shelf });
        n += 1;
      }
    } catch {
      // The shared mutation raises its own failure toast; what was saved stays saved.
      setBusy(false);
      return;
    }
    setBusy(false);
    onDone(n);
  };

  return (
    <Dialog
      title={`Set the type of ${plural(papers.length, 'document')}`}
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" form="set-type" className="btn primary" disabled={!shelf || busy}>
            {busy ? 'Saving…' : 'Set the type'}
          </button>
        </>
      )}
    >
      <form id="set-type" onSubmit={(e) => { void save(e); }} className="field" style={{ margin: 0 }}>
        <label htmlFor="set-type-shelf">Type</label>
        <select id="set-type-shelf" value={shelf} onChange={(e) => setShelf(e.target.value)}>
          <option value="" disabled>Choose a type</option>
          {PAPER_TYPES.map((s) => <option key={s} value={s}>{SHELF_WORD[s] ?? s}</option>)}
        </select>
      </form>
    </Dialog>
  );
}

/** Delete one document. A shared title deed asks for its number to be typed
 *  out first: it is the most dangerous row in the vault. */
export function DeletePaperDialog({ paper, onClose, onDeleted }: {
  paper: PaperRef & { shared: boolean; recordId: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const del = useDeletePaper();
  const [confirm, setConfirm] = useState('');
  // The phrase falls back to the whole title: `replace(/^\D+/, '')` used to
  // strip every leading non-digit, so a digit-free title ("Pattadar Passbook")
  // left the sentence reading "…asks you to type  first" and gated the
  // deletion on an empty string.
  const needsPhrase = paper.shelf === 'title' && paper.shared;
  const phrase = paper.title.match(/\d[\d/-]*\d|\d/)?.[0] ?? paper.title;
  const phraseOk = confirm.trim().toLowerCase() === phrase.toLowerCase();

  const remove = async () => {
    // The shared mutation hook raises the failure toast itself; catching here
    // only stops the hand-off, so a refused delete leaves the paper where the
    // owner can see it is still filed.
    try {
      await del.mutateAsync({ paperId: paper.id });
    } catch {
      return;
    }
    onDeleted();
  };

  return (
    <Dialog
      title={`Delete ${paper.title}?`}
      busy={del.isPending}
      dismissable={!needsPhrase}
      initialFocus={needsPhrase ? '#rd-confirm' : undefined}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="delete-paper" className="btn danger"
                  disabled={del.isPending || (needsPhrase && !phraseOk)}>
            {del.isPending ? 'Removing…' : 'Delete'}
          </button>
        </>
      )}
    >
      <form id="delete-paper" onSubmit={(e) => { e.preventDefault(); void remove(); }}
            style={{ display: 'grid', gap: 'var(--space-sm)' }}>
        <p className="note" style={{ margin: 0 }}>
          {paper.recordId
            ? <>It leaves this property straight away, with its list of versions.</>
            : <>It leaves Documents straight away, with its list of versions.</>}
        </p>
        {needsPhrase && (
          <>
            <p className="note" style={{ margin: 0 }}>
              This title deed is shared. Its link is revoked with it.
            </p>
            <div className="field">
              {/* The accessible name the suite already knows this field by. */}
              <label htmlFor="rd-confirm">Type {phrase} to confirm deletion</label>
              <input id="rd-confirm" type="text" value={confirm} placeholder={phrase}
                     onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}
