/** Notes — what the owner wants remembered about this land.
 *
 *  The one hanger that holds nothing official. Everything else on a record is
 *  either a document, a measurement or a transaction; this is the sentence a
 *  village officer said at the bund, the neighbour who mows the north edge, the
 *  reason the last tenant left.
 *
 *  Notes are written and edited where they are read (founder, 13/10/2026):
 *  "Add a note" opens a blank note card at the top of the list — newest first,
 *  so that is where it will sit once saved — and a note's Edit turns that same
 *  card into the editor in place. Notes used to be append-only with the
 *  composer in a side drawer; both were reversed on request. Every add and
 *  every edit writes an audit line on this property's trail (Activity), so a
 *  rewrite is never silent. The API's `deleteNote` (iOS names it) stays
 *  unoffered here.
 *
 *  The body is rich text, stored as Markdown in the one `body` column
 *  (RichText.tsx): the first line is the note's headline, the rest is the
 *  formatted prose.
 */
import { useEffect, useId, useRef, useState } from 'react';
import AddOutlined from '@mui/icons-material/AddOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';

import { useAddNote, useNotes, useUpdateNote, type RecordNote } from '../api';
import { Card, Empty, Failed, plural } from '../ui';
import { Sk } from '../skeletons';
import { fmtLocal } from '../../lib/format';
import { RichText, RichTextField } from '../RichText';
import { Dialog } from '../Dialog';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';

/** A note is one `body` column. The first line is treated as its headline —
 *  the editor writes it that way, and a note filed before this screen
 *  existed, or from the legacy detail page, simply has no second part and
 *  renders as a headline alone. */
function split(body: string): { head: string; rest: string } {
  const [first, ...others] = body.split('\n');
  return { head: first.trim(), rest: others.join('\n').trim() };
}

/** The headline and the rest, joined the way `split` reads them back. A blank
 *  line between the two so the note is still legible wherever it is shown as
 *  raw text — the audit log, an export, the phone. */
const joinNote = (head: string, rest: string) =>
  rest.trim() ? `${head.trim()}\n\n${rest.trim()}` : head.trim();

/**
 * The editor, drawn as the note card it fills. Used blank for a new note and
 * pre-filled for an edit, so writing and reading happen in the same place.
 */
function NoteEditor({ initial, saveLabel, working, pending, onSave, onCancel }: {
  initial?: RecordNote;
  saveLabel: string;
  working: string;
  pending: boolean;
  /** Resolves to an error sentence, or '' when the note is saved. */
  onSave: (body: string) => Promise<string>;
  onCancel: () => void;
}) {
  const uid = useId();
  // What the editor opened with, kept once: a refetch that hands down a new
  // `initial` must not move the goalposts for "nothing has changed".
  const [start] = useState(() => split(initial?.body ?? ''));
  const [head, setHead] = useState(start.head);
  const [rest, setRest] = useState(start.rest);
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState(false);
  const line = head.trim();
  const unchanged = head.trim() === start.head && rest.trim() === start.rest;
  // Cancel asks before throwing typed text away, as the drawer did.
  const cancel = () => (unchanged ? onCancel() : setAsking(true));

  async function save() {
    if (!line || pending || (initial && unchanged)) return;
    setErr('');
    // On failure the typed note stays on screen: this card is the only place
    // holding text that exists nowhere else.
    setErr(await onSave(joinNote(head, rest)));
  }

  return (
    <Card className="note-edit" labelledBy={`${uid}-title`}>
      <h3 id={`${uid}-title`} className="sr-only">{initial ? 'Edit note' : 'New note'}</h3>
      {initial && (
        <p className="eyebrow" style={{ margin: 0 }}>{fmtLocal(initial.createdAt, { dateOnly: true })}</p>
      )}
      <div className="field">
        <label htmlFor={`${uid}-head`}>What happened</label>
        <input id={`${uid}-head`} type="text" value={head} autoFocus
               placeholder="Village officer confirmed the north boundary"
               onChange={(e) => setHead(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-rest`}>Anything else worth keeping</label>
        <RichTextField id={`${uid}-rest`} label="Anything else worth keeping" value={rest} onChange={setRest}
                       placeholder="Who said it, what was agreed, what was not." />
      </div>
      {err && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>}
      <div className="note-edit-foot">
        {!line && <p className="note" id={`${uid}-why`} style={{ margin: 0 }}>Fill in what happened to save the note.</p>}
        <button type="button" className="btn" onClick={cancel} disabled={pending}>Cancel</button>
        <button type="button" className="btn primary" onClick={() => void save()}
                disabled={!line || pending || (!!initial && unchanged)}
                aria-describedby={line ? undefined : `${uid}-why`}>
          {pending ? working : saveLabel}
        </button>
      </div>
      {asking && (
        <Dialog
          title={initial ? 'Discard your changes?' : 'Discard this note?'}
          onClose={() => setAsking(false)}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setAsking(false)}>Keep editing</button>
              <button type="button" className="btn danger" onClick={onCancel}>Discard</button>
            </>
          )}
        >
          <p className="note" style={{ margin: 0 }}>What you have typed will be lost.</p>
        </Dialog>
      )}
    </Card>
  );
}

/** Three stand-in notes for the first read's grey cards. */
const SKELETON = [0, 1, 2].map((i) => ({ id: `sk-${i}`, body: '', createdAt: '' }));
/** Centres Sk's 0.72em bar in the text's own line box, so each grey line is as
 *  tall as the line of text that replaces it. */
const LINE = { marginBlock: 'calc((1lh - 0.72em) / 2)' };

export function RecordNotes() {
  const rec = useRecordCtx();
  const { data, isLoading, error, refetch } = useNotes(rec.id);
  const add = useAddNote(false);
  const update = useUpdateNote(false);
  /** 'new' for the blank card on top, a note's id for one being edited. One
   *  editor at a time, so nothing typed is lost to a second one opening. */
  const [editing, setEditing] = useState<string | null>(null);
  const addTrigger = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  const editTriggers = useRef(new Map<string, HTMLButtonElement>());

  const notes = data ?? [];

  // The note being edited left the list (removed on the phone, say): drop
  // the editor rather than leave Add and every Edit disabled with nothing open.
  useEffect(() => {
    if (editing && editing !== 'new' && data && !data.some((n) => n.id === editing)) setEditing(null);
  }, [data, editing]);

  /** Back to reading, focus on the control that opened the editor. */
  const refocus = useRef<string | null>(null);
  function close(id: string) {
    refocus.current = id;
    setEditing(null);
  }
  // After the commit that redraws the read card: before it, the note's Edit
  // button does not exist yet (its card is still the editor).
  useEffect(() => {
    const id = refocus.current;
    if (editing !== null || !id) return;
    refocus.current = null;
    (id === 'new' ? addTrigger.current : editTriggers.current.get(id))?.focus();
  }, [editing]);

  async function addNote(body: string): Promise<string> {
    try {
      const res = await add.mutateAsync({ entityId: rec.id, body });
      if (!res.addNote?.id) return 'That note was not saved. Nothing has been written down.';
      close('new');
      return '';
    } catch {
      return 'That note was not saved. Try again.';
    }
  }

  async function saveEdit(id: string, body: string): Promise<string> {
    try {
      const res = await update.mutateAsync({ id, body });
      if (!res.updateNote?.id) return 'That note is no longer here, so the change was not saved.';
      close(id);
      return '';
    } catch {
      return 'That change was not saved. Try again.';
    }
  }

  return (
    <>
      <SectionHead
        title="Notes"
        // The sort order is worth saying only when there is an order to see.
        sub={data && (notes.length > 1
          ? `${plural(notes.length, 'note')} · Newest first`
          : plural(notes.length, 'note'))}
        // Standing guidance, behind the ⓘ: true of every note here (the read
        // is scoped to the owner), so said once rather than on every card.
        info="Only you can see your notes. Adding or editing a note is kept in Activity."
        actions={{
          primary: {
            label: 'Add a note', icon: <AddOutlined sx={{ fontSize: 17 }} />,
            ref: addTrigger, expanded: editing === 'new',
            // Another note open in the editor holds unsaved text.
            disabled: editing !== null && editing !== 'new',
            onClick: () => setEditing('new'),
          },
        }}
      />

      <div className="stack">
        {/* Outside the read's states: a note can be written while the list is
            still loading, or after it failed to load. */}
        {editing === 'new' && (
          <NoteEditor saveLabel="Add the note" working="Adding…" pending={add.isPending}
                      onSave={addNote} onCancel={() => close('new')} />
        )}
        {!isLoading && !data ? (
          // A read that failed is not a property with nothing written on it.
          <Failed what="These notes" error={error} boxed h="16rem"
                  onRetry={() => void refetch()} />
        ) : !isLoading && notes.length === 0 && editing !== 'new' ? (
          // One "Add a note" on the screen: the section head already opens
          // the same editor.
          <Empty boxed h="10rem" title="No notes yet" />
        ) : (
          // The first read draws these same note cards in grey — date, headline,
          // two lines of prose — so nothing moves when the notes land.
          <div className="stack" {...(isLoading && {
            role: 'status', 'aria-busy': true, 'aria-label': 'Loading your notes on this property',
          })}>
            {(isLoading ? SKELETON : notes).map((n, i) => {
              if (n.id === editing) {
                return (
                  <NoteEditor key={n.id} initial={n} saveLabel="Save changes" working="Saving…"
                              pending={update.isPending}
                              onSave={(body) => saveEdit(n.id, body)} onCancel={() => close(n.id)} />
                );
              }
              const { head: title, rest: body } = split(n.body);
              return (
                <article key={n.id} className="card" aria-hidden={isLoading || undefined}>
                  <div className="note-top">
                    {/* The owner's own calendar day. `createdAt` is UTC with no
                        zone, and its first ten characters were the UTC day — the
                        day before, for anything filed before 05:30 IST. */}
                    <p className="eyebrow" style={{ margin: 0 }}>
                      {isLoading ? <Sk w="5.5rem" style={LINE} /> : fmtLocal(n.createdAt, { dateOnly: true })}
                    </p>
                    {!isLoading && (
                      <button type="button" className="iconbtn" aria-label={`Edit note: ${title}`} title="Edit"
                              disabled={editing !== null}
                              ref={(el) => { if (el) editTriggers.current.set(n.id, el); else editTriggers.current.delete(n.id); }}
                              onClick={() => setEditing(n.id)}>
                        <EditOutlined sx={{ fontSize: 17 }} />
                      </button>
                    )}
                  </div>
                  <h3 style={{ marginTop: '0.25rem' }}>
                    {isLoading ? <Sk w={`${12 + i * 3}rem`} style={LINE} /> : title}
                  </h3>
                  {isLoading ? (
                    <p style={{ fontSize: '0.9375rem', lineHeight: 1.55, margin: '0.5rem 0 0' }}>
                      <Sk style={LINE} /><Sk w={`${55 - i * 10}%`} style={LINE} />
                    </p>
                  ) : body && <RichText text={body} />}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
