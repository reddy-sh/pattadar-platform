/** Asking someone outside the app to do a piece of work on a record.
 *
 *  The owner says what they need and what of theirs may be shown. Who does
 *  the work is assigned afterwards, against people the system knows — an
 *  owner sending a link themselves cannot revoke it, track it, or be answered
 *  to when it goes wrong.
 *
 *  Since W16 the job can also be sent to somebody with no account, from its own
 *  ticket page: Pattadar writes to them, keeps a copy of what went, and can
 *  withdraw it. That is the same rule, not a reversal of it — this screen still
 *  hands the owner no link and sends nothing itself.
 *
 *  Two rules shape this screen:
 *
 *  1. The boundary file carries GEOMETRY ONLY. No owner, no khata, no survey
 *     number, no coordinates of anything but the corners. A surveyor needs to
 *     know where the land is; they do not need to know whose it is, and a file
 *     forwarded on twice does not stop being forwarded.
 *  2. Everything else is opt-in and named. A photo or a paper goes only
 *     because someone ticked it, and the screen says plainly what leaves.
 *
 *  What is shared is named on the request, so whoever it is assigned to sees
 *  exactly what the owner allowed and nothing else. That last sentence is only
 *  true if everything named actually exists: a file the owner adds here is
 *  uploaded and filed on the RECORD before the request is raised, so the name
 *  in the request points at a paper somebody can open.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import SendOutlined from '@mui/icons-material/SendOutlined';

import { useAddPaper, useBoundary, useCreateRequest, useOrders, usePapers, usePhotos, useRecord } from '../api';
import { openSameJob } from '../orderFlow';
import { MAX_UPLOAD_BYTES, mb } from '../filePhotos';
import { STORAGE_OFFLINE_MSG, uploadToDrive } from '../../pages/documents/storage';
import { Card, Chip, Failed, Loading, pairs } from '../ui';

/** What each kind of request opens with. The words are the ones an owner
 *  would actually send, not a template someone has to rewrite. */
const OPENERS: Record<string, { title: string; message: string; noGeo?: string }> = {
  survey: {
    title: 'Ask a surveyor',
    message: 'Hey dear surveyor, please do the survey for this location. '
      + 'The boundary is attached as a GeoJSON file.',
    // A record with no ring is the common way into this screen — the "Order a
    // survey" button on the boundary tab is shown precisely when there is no
    // boundary — and the surveyed wording promises an attachment that cannot
    // exist. Asking for the corners to be established is the actual job.
    noGeo: 'Hey dear surveyor, please do the survey for this location. '
      + 'There is no boundary on record yet — please establish the corners on '
      + 'site and send the sheet back.',
  },
  opinion: {
    title: 'Ask an advocate',
    message: 'Please read these papers and tell me whether the title is clean.',
  },
  visit: {
    title: 'Ask someone to visit',
    message: 'Please visit this land and send me photos of what you find.',
  },
};

/** The two ways raising a request ends badly, kept here rather than inline so
 *  the wording cannot drift between them.
 *
 *  RAISE_FAILED deliberately does not say "nothing was filed". A request that
 *  dies on the way back — a 502 at the gateway, a connection dropped after the
 *  API committed — leaves the job created, which is exactly the case where a
 *  blind retry files it twice. So the owner is sent to look before retrying. */
const RAISE_FAILED =
  'That request did not go through. Check your connection, then look under '
  + 'Services before trying again — if the job is already there, it was filed.';
const RAISE_REJECTED = 'That request was not accepted. A message is required.';
const PAPER_FAILED =
  'That file was stored but could not be filed against this record, so no '
  + 'request was raised. Try again, or file it under Papers first.';

export function RequestWork() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const kind = sp.get('kind') ?? 'survey';
  const opener = OPENERS[kind] ?? OPENERS.survey;

  const { data: rec, isLoading: recLoading, error: recError } = useRecord(id);
  const { data: bound } = useBoundary(id);
  const { data: photos } = usePhotos(id);
  const { data: papers } = usePapers(id);
  const { data: orders, isLoading: ordersLoading, error: ordersError } = useOrders(id);
  const duplicate = openSameJob(orders, kind);

  const [asOwner, setAsOwner] = useState(true);
  const [who, setWho] = useState('');
  const [message, setMessage] = useState(opener.message);
  const [touched, setTouched] = useState(false);
  const [sendGeo, setSendGeo] = useState(true);
  const [pickedPhotos, setPickedPhotos] = useState<string[]>([]);
  const [pickedPapers, setPickedPapers] = useState<string[]>([]);
  const [extra, setExtra] = useState<File[]>([]);
  const [filing, setFiling] = useState(false);
  const [sent, setSent] = useState('');
  const [madeId, setMadeId] = useState('');
  const raise = useCreateRequest();
  const addPaper = useAddPaper();
  // "Add a file" is a real button over this input. A <label> wrapping a hidden
  // input takes no focus and a `hidden` input is out of the tab order, so the
  // only way to attach a deed to the request was a mouse.
  const pickExtra = useRef<HTMLInputElement>(null);

  const ring = useMemo(
    () => pairs(bound?.ring?.length ? bound.ring : (rec?.ring ?? [])),
    [bound?.ring, rec?.ring],
  );
  const surveyed = ring.length >= 3;

  /** The opener has to be chosen after the record lands, not at the first
   *  render: `rec` and `bound` are both undefined then, so a useState
   *  initialiser reading `ring` would tell every record — surveyed ones
   *  included — that it has no boundary, and never correct itself. The
   *  textarea sits behind the `!rec` gate below, so nobody sees the swap;
   *  `touched` is what stops it overwriting a message the owner has typed. */
  const body = !surveyed && opener.noGeo ? opener.noGeo : opener.message;
  useEffect(() => { if (!touched) setMessage(body); }, [body, touched]);

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const attachmentCount =
    (sendGeo && surveyed ? 1 : 0) + pickedPhotos.length + pickedPapers.length + extra.length;
  const busy = filing || raise.isPending || ordersLoading;

  /** File the request. Nothing leaves the system here — what the owner
   *  allowed is named on the request, and assignment happens after. */
  async function raiseIt() {
    if (!id || duplicate || ordersError || !orders) return;
    setSent('');
    const named = [
      ...(sendGeo && surveyed ? ['the boundary as GeoJSON'] : []),
      ...(photos?.photos ?? []).filter((x) => pickedPhotos.includes(x.id))
        .map((x) => x.caption || x.fileName || 'a photo'),
      ...(papers ?? []).filter((d) => pickedPapers.includes(d.id)).map((d) => d.title),
    ];
    setFiling(true);
    try {
      // The "Something else" picker used to hand createRequest a bare filename
      // and keep the bytes in the browser: the surveyor read "Sale deed.pdf" in
      // a sentence and got no file. Each one now goes to storage and onto the
      // record as a paper FIRST, so a failed upload cannot leave a request
      // promising a document that does not exist.
      const filedIds: string[] = [];
      let left = extra;
      const stop = (why: string) => {
        // Whatever did land is already a paper on the record, so it is ticked
        // rather than queued again; only the files that never went stay here,
        // and a retry does not upload the same bytes twice.
        setExtra(left);
        if (filedIds.length) setPickedPapers((prev) => [...prev, ...filedIds]);
        setSent(why);
      };
      for (const f of extra) {
        // Refused by name before a byte is sent, the way every other upload on
        // this module refuses one — the gateway would take it, the point is
        // that the owner is told first.
        if (f.size > MAX_UPLOAD_BYTES) {
          stop(`${f.name} is ${mb(f.size)}. The limit is ${mb(MAX_UPLOAD_BYTES)} — `
            + 'it was not uploaded and no request was raised.');
          return;
        }
        const node = await uploadToDrive(f);
        if (!node) { stop(STORAGE_OFFLINE_MSG); return; }
        const title = f.name || 'Paper';
        const filed = await addPaper.mutateAsync({
          recordId: id, fileRef: node.id, name: title, subtitle: 'Added for this request',
          shelf: 'unsorted', pageCount: 0, mimeType: node.mimeType, sizeBytes: node.sizeBytes,
        });
        if (!filed.web.addPaper) { stop(PAPER_FAILED); return; }
        filedIds.push(filed.web.addPaper);
        // The name that goes on the request is the one the paper was filed
        // under, so the two read the same in a month's time.
        named.push(title);
        left = left.slice(1);
      }
      if (filedIds.length) {
        // They are papers now. Moving them across keeps the count honest and
        // stops the Papers card, which refetches on the addPaper, from
        // offering the same file a second time.
        setExtra([]);
        setPickedPapers((prev) => [...prev, ...filedIds]);
      }

      const res = await raise.mutateAsync({
        recordId: id, kind,
        message: message.trim(),
        requester: asOwner ? 'the owner' : (who.trim() || 'acting for the owner'),
        shared: named.join(', '),
        attachmentManifest: JSON.stringify({
          documentIds: [...pickedPapers, ...filedIds], photoIds: pickedPhotos,
          includeBoundary: sendGeo && surveyed,
        }),
      });
      if (!res.web.createRequest) {
        setSent(RAISE_REJECTED);
        return;
      }
      setMadeId(res.web.createRequest);
    } catch (error) {
      setSent(error instanceof Error ? error.message : RAISE_FAILED);
    } finally {
      setFiling(false);
    }
  }

  if (recLoading) return <main><Loading h="60vh" /></main>;
  // A read that settled with nothing is not a read still running. `retry: 1`
  // means a failed record read ends here for good, and drawing the skeleton
  // for it rendered the outage as an eternity.
  if (!rec) return <main><Failed what="This record" error={recError} h="60vh" /></main>;

  return (
    <main>
      <header className="pagehead">
        <div className="grow">
          <button type="button" className="link accent"
                  style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer' }}
                  onClick={() => nav(`/app/records/${id}/map`)}>
            <ArrowBackOutlined sx={{ fontSize: 14 }} /> Back to {rec.title}
          </button>
          <h1>{opener.title}</h1>
          <p className="note">
            They do not need an account. You choose exactly what leaves this record.
          </p>
        </div>
      </header>

      {duplicate && (
        <Card className="alert" title="This request already exists">
          <p className="note" style={{ marginTop: 0 }}>
            {duplicate.title} is already running on {rec.title}. Open it to see its status,
            messages and files, or cancel it before starting again.
          </p>
          <div className="row tight">
            <Link className="btn primary" to={`/app/services/${duplicate.id}`}>Open request</Link>
            <Link className="btn danger" to={`/app/services/${duplicate.id}?action=cancel`}>
              Cancel request
            </Link>
          </div>
        </Card>
      )}

      {!duplicate && ordersError && (
        <Card className="alert" title="Existing requests could not be checked">
          <p className="note" style={{ margin: 0 }}>
            Nothing can be raised until Pattadar confirms that the same work is not already open.
          </p>
        </Card>
      )}

      {!duplicate && <div className="split" style={{ marginTop: 'var(--space-md)', minWidth: 0 }}>
        <div className="stack" style={{ minWidth: 0 }}>
          <Card title="Who is asking">
            <div className="row tight" style={{ marginBottom: 'var(--space-sm)' }}>
              <button type="button" className={`chip${asOwner ? '' : ' static'}`}
                      aria-pressed={asOwner} onClick={() => setAsOwner(true)}>
                I am the owner
              </button>
              <button type="button" className={`chip${asOwner ? ' static' : ''}`}
                      aria-pressed={!asOwner} onClick={() => setAsOwner(false)}>
                I am acting for the owner
              </button>
            </div>
            {!asOwner && (
              <span className="search" style={{ width: '100%' }}>
                <input value={who} onChange={(e) => setWho(e.target.value)}
                       aria-label="Your name" placeholder="Your name, and who you act for" />
              </span>
            )}
          </Card>

          <Card title="Your message">
            <textarea className="input" rows={5} style={{ width: '100%' }}
                      aria-label="Message" value={message}
                      onChange={(e) => { setTouched(true); setMessage(e.target.value); }} />
            <p className="note" style={{ marginTop: 'var(--space-xs)' }}>
              Your name is added at the end. Nothing else about the record goes in
              unless you type it.
            </p>
          </Card>

          <Card title="Raise the request">
            <p className="note" style={{ marginBottom: 'var(--space-sm)' }}>
              It goes on this record as <strong>Placed</strong>. Someone is put on it
              from the people this account works with, or Pattadar writes to a new
              person on your behalf — either way the system does the sending, so it
              can be taken back. You follow it under Services.
            </p>
            {/* The confirmation used to redirect itself two seconds later. It asks
                the owner to do something — open the job and put somebody on it —
                and then took the screen away mid-sentence, with the link they were
                reaching for. Both exits are the owner's act now. */}
            {madeId ? (
              <div className="row tight">
                <p className="note grow">
                  Filed as a job. Nobody has it yet — open it to put somebody on it, or to have
                  Pattadar send it to a surveyor.
                </p>
                <Link className="btn sm" to={`/app/services/${madeId}`}>Open the job</Link>
                <button type="button" className="btn sm"
                        onClick={() => nav(`/app/records/${id}/services`)}>
                  Back to Services
                </button>
              </div>
            ) : (
              <>
                <div className="row tight">
                  <button type="button" className="btn primary"
                          disabled={!message.trim() || busy}
                          onClick={() => void raiseIt()}>
                    <SendOutlined sx={{ fontSize: 16 }} />
                    {busy ? 'Raising…' : 'Create request'}
                  </button>
                  <button type="button" className="btn" onClick={() => nav(`/app/records/${id}`)}>
                    Cancel
                  </button>
                </div>
                {/* Why the button is off, on screen rather than in a `title=`.
                    A disabled control fires no hover, so that tooltip could not
                    be read in any browser: an owner who cleared the box saw a
                    bright primary button, pressed it, and was told nothing. */}
                {!message.trim() && (
                  <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                    Type your message first. The request is the message — there is nothing
                    to raise without it.
                  </p>
                )}
              </>
            )}
            {sent && (
              <p className="note" style={{ marginTop: 'var(--space-sm)', color: 'var(--w-danger)' }}>
                {sent}
              </p>
            )}
            <p className="note" style={{ marginTop: 'var(--space-xs)' }}>
              {attachmentCount === 0
                ? 'Nothing of yours is attached. The request carries only your message.'
                : `Whoever it is assigned to sees the ${attachmentCount} thing${attachmentCount === 1 ? '' : 's'} you ticked, and nothing else.`}
            </p>
          </Card>
        </div>

        <aside className="stack" style={{ minWidth: 0 }}>
          <Card title="What to send" aside={<Chip>{attachmentCount}</Chip>}>
            <label className="row tight" style={{ cursor: 'pointer' }}>
              {/* Ticked only when there is something to send. The state starts
                  true for the ordinary surveyed record, and a record with no
                  ring used to show a ticked box above the line saying it has no
                  boundary — while the count, which reads the same condition,
                  said nothing was attached. */}
              <input type="checkbox" checked={sendGeo && surveyed} disabled={!surveyed}
                     onChange={(e) => setSendGeo(e.target.checked)} />
              <span className="grow">
                <strong style={{ fontSize: '0.9375rem' }}>The boundary, as GeoJSON</strong>
                <span className="note" style={{ display: 'block' }}>
                  {surveyed
                    ? `${ring.length} corners. Geometry only — no name, no khata, no survey number.`
                    : 'This record has no surveyed boundary yet. Your message asks for the corners to be established on site.'}
                </span>
              </span>
            </label>
          </Card>

          <Card title="Photos" aside={<Chip>{pickedPhotos.length}</Chip>}>
            {(photos?.photos ?? []).length === 0 ? (
              <p className="note">No photos on this record.</p>
            ) : (
              <div className="rows boxed">
                {(photos?.photos ?? []).slice(0, 12).map((p) => (
                  <label key={p.id} style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={pickedPhotos.includes(p.id)}
                           onChange={() => toggle(pickedPhotos, setPickedPhotos, p.id)} />
                    <span className="grow">
                      {p.caption || p.fileName || 'Photo'}
                      <span className="note" style={{ display: 'block' }}>
                        {p.mediaKind === 'video' ? 'Video' : 'Photo'}
                        {p.capturedAt && ` · ${p.capturedAt.slice(0, 10)}`}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Card>

          <Card title="Papers" aside={<Chip>{pickedPapers.length}</Chip>}>
            {(papers ?? []).length === 0 ? (
              <p className="note">Nothing is filed against this record.</p>
            ) : (
              <div className="rows boxed">
                {(papers ?? []).map((d) => (
                  <label key={d.id} style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={pickedPapers.includes(d.id)}
                           onChange={() => toggle(pickedPapers, setPickedPapers, d.id)} />
                    <span className="grow">
                      {d.title}
                      <span className="note" style={{ display: 'block' }}>{d.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
              A paper names people. Send one only when the person asking needs it.
            </p>
          </Card>

          <Card title="Something else" aside={<Chip>{extra.length}</Chip>}>
            {/* A real button over a hidden input, not a <label> wrapping one.
                The label took no focus and the input is `hidden`, so the tab
                order skipped this card entirely and a keyboard could not add a
                file to a request at all.
                The pick is appended, not replaced. Picking a second file used
                to throw the first one away while the count stayed at 1, so the
                owner was never told what had gone. Same name and size twice is
                the same file picked twice, not two files. */}
            <input
              ref={pickExtra}
              type="file" hidden multiple
              aria-label="Add a file to this request"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setExtra((prev) => [
                  ...prev,
                  ...picked.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size)),
                ]);
                e.target.value = '';
              }}
            />
            <button type="button" className="btn sm"
                    onClick={() => pickExtra.current?.click()}>
              Add a file
            </button>
            {extra.length > 0 && (
              <p className="note" style={{ marginTop: 'var(--space-xs)' }}>
                {extra.map((f) => `${f.name} · ${mb(f.size)}`).join(', ')}
              </p>
            )}
            <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
              Each one is filed against this record as a paper when you raise the
              request, then named on it. Up to {mb(MAX_UPLOAD_BYTES)} each.
            </p>
          </Card>
        </aside>
      </div>}
    </main>
  );
}
