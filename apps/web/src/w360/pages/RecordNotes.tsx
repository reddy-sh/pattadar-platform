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
 *  Two things about notes are deliberate and both are the server's rule, not a
 *  gap in this screen:
 *
 *   - they are append-only. There is no update or delete resolver for `notes`,
 *     so a filed note cannot be edited or withdrawn. What somebody wrote down
 *     at the time is the point of writing it down.
 *   - filing one writes an audit line, and that line cannot be removed either.
 *
 *  Both are said on screen, because an owner who expects an edit button and
 *  finds none should be told why rather than left looking for it.
 */
import { useRef, useState } from 'react';
import AddOutlined from '@mui/icons-material/AddOutlined';

import { useAddNote, useNotes } from '../api';
import { Card, Failed, Loading, ddmmyyyy, plural } from '../ui';
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
      setErr('That note was not filed. What you wrote is still here — try again.');
    }
  }

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Notes')}
      title="Add a note"
      sub="A visit, a dispute, a boundary walk — anything about this land that is on no document."
      onClose={onClose}
      onSubmit={() => void file()}
      busy={add.isPending}
      dirty={dirty}
      discardCopy={{
        title: 'Discard this note?',
        body: 'Nothing has been written down yet. Closing this panel loses what you have typed, and a note is the one thing here that exists nowhere else.',
      }}
      initialFocus="#no-head"
      returnFocus={returnFocus}
      primary={(
        <DrawerAction
          label="File the note"
          working="Filing…"
          pending={add.isPending}
          paused={add.isPaused}
          disabled={!line}
        />
      )}
    >
      <div className="field">
        <label htmlFor="no-head">What happened</label>
        <input id="no-head" type="text" value={head}
               placeholder="Village officer confirmed the north boundary"
               onChange={(e) => setHead(e.target.value)} />
        <span className="note">One line. It becomes the note&rsquo;s heading in the list.</span>
      </div>

      <div className="field">
        <label htmlFor="no-rest">Anything else worth keeping</label>
        <textarea id="no-rest" rows={6} value={rest}
                  placeholder="Who said it, what was agreed, what was not."
                  onChange={(e) => setRest(e.target.value)} />
      </div>

      {/* Said before it is filed, not after. Append-only is the server's rule —
          there is no update or delete resolver for `notes` — and an owner who
          goes looking for an edit button should have been told there is none
          while the text was still theirs to change. */}
      <p className="note" style={{ margin: 0 }}>
        A note is filed by you and cannot be edited or removed afterwards. Filing one also
        writes a line in the Audit log saying so, and that line cannot be removed either.
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
        title="What you want remembered"
        sub={data && `${plural(notes.length, 'note')} · newest first`
          + ' · nothing here is a legal record'}
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

      <div className="split">
        <div>
          {isLoading ? (
            <Loading h="16rem" />
          ) : !data ? (
            // A read that failed is not a record with nothing written on it.
            <Failed what="These notes" error={error} boxed h="16rem"
                    onRetry={() => void refetch()} />
          ) : notes.length === 0 ? (
            <div className="card">
              <h3>Nothing is written down about this land yet</h3>
              <p className="note" style={{ marginTop: '0.375rem' }}>
                What the village officer said, what a neighbour claims, which corner
                floods. None of it is on any document, and it is what a dispute turns
                on years later.
              </p>
              {/* The empty state opens the same drawer as the header. It used to
                  be prose alone, which left the one screen most likely to be
                  empty as the only hanger whose empty state asked for nothing —
                  the reader had to go back up to the section head to act on the
                  sentence they had just read. */}
              <button type="button" className="btn primary" aria-haspopup="dialog"
                      style={{ marginTop: 'var(--space-md)' }}
                      onClick={() => setWriting(true)}>
                <AddOutlined sx={{ fontSize: 17 }} /> Add a note
              </button>
            </div>
          ) : (
            <div className="stack">
              {notes.map((n) => {
                const { head: title, rest: body } = split(n.body);
                return (
                  <article key={n.id} className="card">
                    <p className="eyebrow" style={{ margin: 0 }}>{ddmmyyyy(n.createdAt)}</p>
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
                    <p className="note" style={{ margin: 'var(--space-sm) 0 0' }}>
                      Filed by you
                    </p>
                  </article>
                );
              })}
            </div>
          )}

          <p className="note" style={{ marginTop: 'var(--space-md)' }}>
            A note is yours. Filing one also writes a line in the Audit log saying a note
            was filed, and neither that line nor the note can be removed.
          </p>
        </div>

        <aside className="stack">
          <Card title="Worth writing down" className="railcard">
            <ul className="railnotes">
              <li>Who sits on each side</li>
              <li>What was said at a visit, and by whom</li>
              <li>Any dispute, however small</li>
              <li>What the crop was, season by season</li>
            </ul>
          </Card>

          <Card title="Who can see notes" className="railcard">
            <p className="note" style={{ margin: 0 }}>
              You only. A note is filed under your account, and nobody you share this
              record with — or assign to it on the People hanger — is shown it.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
