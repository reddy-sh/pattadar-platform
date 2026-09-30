/** Notes — what the owner wants remembered about this land.
 *
 *  The one hanger that holds nothing official. Everything else on a record is
 *  either a document, a measurement or a transaction; this is the sentence a
 *  village officer said at the bund, the neighbour who mows the north edge, the
 *  reason the last tenant left. That knowledge decided disputes long before it
 *  had anywhere to live, and until now this app's answer was a read-only card
 *  in the Papers rail showing the single most recent note with no way to add a
 *  second one.
 *
 *  Two things about notes are deliberate:
 *
 *   - they cannot be edited. There is no update resolver for `notes`, so what
 *     somebody wrote down at the time stays as it was written — which is the
 *     point of writing it down. This screen offers no removal either. The API
 *     does keep a `deleteNote` (the iOS client names it); a removal writes its
 *     own audit line on this property's trail, so a note never leaves the
 *     Activity tab silently.
 *   - adding one writes an audit line on the same trail, shown in Activity.
 *
 *  The first is said behind the ⓘ beside the heading and inside the drawer,
 *  because an owner who expects an edit button and finds none should be told
 *  why rather than left looking for it. It says only what is enforced: an
 *  earlier "cannot be edited or removed" was not true of the API.
 */
import { useId, useRef, useState } from 'react';
import AddOutlined from '@mui/icons-material/AddOutlined';

import { useAddNote, useNotes } from '../api';
import { Empty, Failed, Loading, plural } from '../ui';
import { fmtLocal } from '../../lib/format';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';

/** A note is one `body` column. The first line is treated as its headline —
 *  the composer writes it that way, and a note filed before this screen
 *  existed, or from the legacy detail page, simply has no second part and
 *  renders as a headline alone. */
function split(body: string): { head: string; rest: string } {
  const [first, ...others] = body.split('\n');
  return { head: first.trim(), rest: others.join('\n').trim() };
}

/**
 * Writing a note, in the drawer every hanger now uses.
 *
 * This was an inline card under the section head, and the argument for that was
 * written down: "a note is not worth a modal — the thing being remembered is
 * usually on screen behind it." That reasoning was sound for a composer nobody
 * else on the record matched, and it stopped being sound once the other eight
 * hangers all opened a drawer to add something: a reader who has learnt that
 * adding is a panel on the right should not have to learn a second thing here.
 * The record's own name is on the panel's eyebrow, which is what the inline
 * card was really giving up.
 *
 * The two boxes are the whole of it. `notes` is one `body` column — no kind, no
 * date, no attendee, no attachment — so the headline and the rest are joined
 * the way `split` reads them back and nothing else is asked for. A drawer with
 * a date picker and a "who was there" box that both went nowhere would file
 * exactly the same row while implying it had kept more.
 */
function NoteDrawer({ recordId, recordTitle, onClose, returnFocus }: {
  recordId: string;
  recordTitle: string;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const add = useAddNote(false);
  const whyId = useId();
  const [head, setHead] = useState('');
  const [rest, setRest] = useState('');
  const [err, setErr] = useState('');

  const line = head.trim();
  const dirty = !!(line || rest.trim());

  async function file() {
    if (!line || add.isPending) return;
    setErr('');
    // The headline and the body are one column, joined the way `split` reads
    // them back. A blank line between the two so the note is still legible
    // wherever it is shown as raw text — the audit log, an export, the phone.
    const body = rest.trim() ? `${line}\n\n${rest.trim()}` : line;
    try {
      const res = await add.mutateAsync({ entityId: recordId, body });
      if (!res.addNote?.id) {
        setErr('That note was not filed. Nothing has been written down.');
        return;
      }
      onClose();
    } catch {
      // The typed note stays on screen. Losing what somebody just wrote because
      // the network dropped is the one failure this screen must not have — it is
      // the only place in the app holding text that exists nowhere else.
      setErr('That note was not filed. Try again.');
    }
  }

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Notes')}
      title="Add a note"
      onClose={onClose}
      onSubmit={() => void file()}
      busy={add.isPending}
      dirty={dirty}
      discardCopy={{
        title: 'Discard this note?',
        body: 'What you have typed will be lost.',
      }}
      initialFocus="#no-head"
      returnFocus={returnFocus}
      // One verb for one act: the header's "Add a note" opens this, and its
      // primary adds it.
      primaryWhy={line ? undefined : { id: whyId, text: 'Fill in what happened to add the note.' }}
      primary={(
        <DrawerAction
          label="Add the note"
          working="Adding…"
          pending={add.isPending}
          paused={add.isPaused}
          disabled={!line}
          describedBy={line ? undefined : whyId}
        />
      )}
    >
      <div className="field">
        <label htmlFor="no-head">What happened</label>
        <input id="no-head" type="text" value={head}
               placeholder="Village officer confirmed the north boundary"
               onChange={(e) => setHead(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="no-rest">Anything else worth keeping</label>
        <textarea id="no-rest" rows={6} value={rest}
                  placeholder="Who said it, what was agreed, what was not."
                  onChange={(e) => setRest(e.target.value)} />
      </div>

      <p className="note" style={{ margin: 0 }}>
        A note cannot be edited once it is added.
      </p>

      {err && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Drawer>
  );
}

export function RecordNotes() {
  const rec = useRecordCtx();
  const { data, isLoading, error, refetch } = useNotes(rec.id);
  const [writing, setWriting] = useState(false);
  const addTrigger = useRef<HTMLButtonElement>(null);

  const notes = data ?? [];

  return (
    <>
      <SectionHead
        title="Notes"
        // The sort order is worth saying only when there is an order to see.
        sub={data && (notes.length > 1
          ? `${plural(notes.length, 'note')} · Newest first`
          : plural(notes.length, 'note'))}
        // Standing guidance, behind the ⓘ. "Only you" used to fill a whole
        // rail column of its own, and "Filed by you" sat on every card: both
        // are true of every note here (the read is scoped to the owner), so
        // they are said once, here.
        info="Only you can see your notes. A note cannot be edited once it is added."
        actions={(
          <button ref={addTrigger} type="button" className="btn primary"
                  aria-haspopup="dialog" aria-expanded={writing}
                  onClick={() => setWriting(true)}>
            <AddOutlined sx={{ fontSize: 17 }} /> Add a note
          </button>
        )}
      />

      {writing && (
        <NoteDrawer
          recordId={rec.id}
          recordTitle={rec.title}
          returnFocus={addTrigger}
          onClose={() => setWriting(false)}
        />
      )}

      <div>
        {isLoading ? (
          <Loading h="16rem" what="these notes" />
        ) : !data ? (
          // A read that failed is not a property with nothing written on it.
          <Failed what="These notes" error={error} boxed h="16rem"
                  onRetry={() => void refetch()} />
        ) : notes.length === 0 ? (
          // One "Add a note" on the screen: the section head already opens
          // the same drawer.
          <Empty boxed h="10rem" title="No notes yet" />
        ) : (
          <div className="stack">
            {notes.map((n) => {
              const { head: title, rest: body } = split(n.body);
              return (
                <article key={n.id} className="card">
                  {/* The owner's own calendar day. `createdAt` is UTC with no
                      zone, and its first ten characters were the UTC day — the
                      day before, for anything filed before 05:30 IST. */}
                  <p className="eyebrow" style={{ margin: 0 }}>
                    {fmtLocal(n.createdAt, { dateOnly: true })}
                  </p>
                  <h3 style={{ marginTop: '0.25rem' }}>{title}</h3>
                  {body && (
                    // Filed as typed, line breaks and all: a note is prose
                    // somebody wrote, not a field.
                    <p style={{
                      fontSize: '0.9375rem', lineHeight: 1.55,
                      margin: '0.5rem 0 0', whiteSpace: 'pre-wrap',
                    }}>
                      {body}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
