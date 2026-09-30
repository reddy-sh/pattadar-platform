/**
 * The chain of title as a graph — who parted with the land, who received it,
 * how much, and on which paper.
 *
 * Two data shapes meet here, and the difference is load-bearing:
 *
 *   · `transfers` are EVENTS (record_transfers). One event has many sources and
 *     many targets, so one seller selling to two buyers, two sellers selling to
 *     one, and a chain running further down through linked deeds are all the
 *     same shape. An edge drawn from a transfer is a real claim: X gave to Y,
 *     this much, on this deed.
 *   · `owners` are the PEOPLE list (record_owners), which carries a display
 *     order and nothing else. When a record has no transfers filed yet, the
 *     graph falls back to that order and says plainly that the lines mean
 *     sequence, not a verified transfer — the same honesty the cards carry.
 *
 * An unverified transfer came off a document reading and nobody has confirmed
 * it. The deed reader's own prompt insists that seller/buyer direction can be
 * inverted, so a proposed edge is drawn dashed and labelled as a proposal until
 * a person accepts it. Nothing here silently promotes a machine's guess into
 * somebody's chain of title.
 *
 * Editing is explicit: the read view cannot be dragged or connected at all.
 * Turning on Edit makes nodes draggable and handles connectable, and dragging
 * one person onto another opens the transfer drawer with the two ends filled.
 */
import AddOutlined from '@mui/icons-material/AddOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import {
  Controls,
  Handle,
  Position,
  ReactFlow,
  getNodesBounds,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import {
  useAddTransfer, useDeleteTransfer, useLinkTransferPrior, useRemoveTransferParty,
  useSetTransferParty, useUpdateTransfer,
} from '../api';
import type { Owner, Transfer, TransferParty, TransfersView } from '../api';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { PaperPreview } from '../paper/PaperPreview';
import { useToast } from '../Toast';
import { Chip, PhotoImg, ddmmyyyy, initialsOf, plural } from '../ui';
import { ConfirmDialog } from './PropertyActions';

type Orientation = 'horizontal' | 'vertical';

/** What a person node draws. `owner` is present when the party is also a row in
 *  record_owners — that is what carries the photo and the current/previous
 *  status; a party known only from a deed has a name and nothing else. */
/** One deed a person acquired under — the paper clipped to their node.
 *  The document number is the thing a person checks a chain of title BY, so it
 *  belongs on the node beside the name rather than on the connector, where the
 *  gap between two cards cannot hold it. */
interface AcquiredUnder {
  transferId: string;
  deedNo: string;
  /** What kind of paper it is, so a numberless agreement can still be named. */
  kind: string;
  extentLabel: string;
  shareLabel: string;
  /** The filed paper, when the transfer cites one. Empty means the owner
   *  recorded a deed number but the scan is not in the vault yet. */
  deedDocumentId: string;
}

interface PersonNodeData extends Record<string, unknown> {
  key: string;
  name: string;
  owner: Owner | null;
  /** The deeds by which this person received the land, newest first. */
  acquired: AcquiredUnder[];
  editing: boolean;
  onOpen: (data: { owner: Owner | null; name: string }, trigger: HTMLElement) => void;
  onOpenTransfer: (transferId: string, trigger: HTMLElement) => void;
  onOpenPaper: (paperId: string, trigger: HTMLElement) => void;
}

type PersonNode = Node<PersonNodeData, 'person'>;

const NODE_WIDTH_REM = 17;
/** The card's own height, as w360.css fixes it. Kept here too because the
 *  canvas is sized from the graph's extent and that arithmetic needs it. */
const NODE_HEIGHT_REM = 14;
// Wide enough that the connector's own label ("sale", "gift") sits in clear
// space between two cards instead of under the next one.
const COL_STEP_REM = 26;
// Must clear the node's own height plus a gap, or a rank holding two people
// overlaps.
const ROW_STEP_REM = 15.5;
/** Breathing room around the graph inside its frame. */
const CANVAS_PAD_REM = 3;
/** At most two papers are drawn on a card; the rest are one line saying so. A
 *  fixed-height node cannot grow with a ten-deed history, and the drawer and
 *  the deeds list below the graph both hold the full set. */
const MAX_CLIPS = 2;
const NARROW_QUERY = '(max-width: 760px)';

/** The kinds of event a chain of title is made of. Free text on the server, a
 *  short list here because these are the words AP deeds actually use. */
// `agreement` is here because an unregistered sale agreement is a real link in
// an AP chain of title: it carries no registered document number, and the tag on
// the node then says what the paper IS rather than showing a blank.
const TRANSFER_KINDS = [
  'sale', 'agreement', 'gift', 'partition', 'settlement', 'inheritance', 'manual',
];
const EXTENT_UNITS = ['ac', 'guntas', 'cents', 'sq.yd', 'sq.ft', 'hectares'];

/** A party's identity for graph purposes.
 *
 *  A deed names people as strings; record_owners gives some of them ids. Two
 *  mentions of the same name are the same NODE — otherwise a five-deed chain
 *  draws the same grandfather five times and the graph stops being a chain.
 *  Linked owners key on their owner id so two genuinely different people who
 *  share a name stay apart when the owner has distinguished them. */
function partyKey(p: TransferParty): string {
  return p.ownerId ? `owner:${p.ownerId}` : `name:${p.name.trim().toLowerCase()}`;
}

function ownerKey(o: Owner): string {
  return `owner:${o.id}`;
}

/** What the tag on a node reads.
 *
 *  The registered document number when the paper has one — that is the key a
 *  chain of title is checked by, and it is what somebody reads out over the
 *  phone to a sub-registrar's office. When there is no number the tag says what
 *  the paper IS instead ("Agreement", "Partition"), because an unregistered
 *  agreement is still a link in the chain and a blank tag would hide it. */
export function paperTagLabel(deedNo: string, kind: string): string {
  const no = deedNo.trim();
  if (no) return no;
  const k = kind.trim().toLowerCase();
  if (!k || k === 'manual') return 'No document number';
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function PersonPhoto({ owner, name }: { owner: Owner | null; name: string }) {
  const initials = (
    <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
      {initialsOf(name)}
    </span>
  );
  if (!owner?.photoRef) return initials;
  return (
    <span
      className="avatarlg personphoto"
      style={{ width: '2.25rem', height: '2.25rem', padding: 0, overflow: 'hidden' }}
    >
      <PhotoImg
        fileRef={owner.photoRef}
        alt={name}
        thumb={160}
        fallback={initials}
        className="personphoto-img"
      />
    </span>
  );
}

function PersonChainNode({ data, id }: NodeProps<PersonNode>) {
  const { name, owner, acquired, editing, onOpen, onOpenTransfer, onOpenPaper } = data;
  const flow = useReactFlow<PersonNode, Edge>();
  const updateNodeInternals = useUpdateNodeInternals();
  const status = owner ? (owner.isCurrent ? 'Current owner' : 'Previous owner') : 'Named on a deed';
  const statusClass = owner ? (owner.isCurrent ? 'owned' : 'was') : '';
  // Parentage and address are two different facts and get two lines. Joined
  // with a "·" they read as one run-on sentence and the clamp cut the address
  // mid-word, so "Podili S.R.O" arrived as "Podili…" — a deed's own wording is
  // how a person recognises their family, and it is not filler to be elided.
  const parentage = owner?.parentage ?? '';
  const address = owner?.address ?? '';
  const tone = owner ? (owner.isCurrent ? 'current' : 'past') : 'party';

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, editing, updateNodeInternals]);

  const revealForKeyboard = (trigger: HTMLButtonElement) => {
    if (!trigger.matches(':focus-visible')) return;
    void flow.fitView({ nodes: [{ id }], padding: 0.6, maxZoom: 1, duration: 0 });
  };

  const accessibleName = `Open ${name}`;

  return (
    <div className={`ownerchain-node ${tone}`}>
      {/* Handles are only connectable in Edit mode, so a read-only graph cannot
          be rewired by a stray drag. */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={editing}
        className={editing ? 'ownerchain-handle live' : 'ownerchain-handle'}
      />
      {owner ? (
        <button
          type="button"
          className="ownerchain-open nodrag nopan"
          aria-label={accessibleName}
          onFocus={(event) => revealForKeyboard(event.currentTarget)}
          onClick={(event) => onOpen({ owner, name }, event.currentTarget)}
        >
          <span className="ownerchain-person">
            <PersonPhoto owner={owner} name={name} />
            <span className="ownerchain-name">
              <strong>{name}</strong>
              <span className={statusClass ? `pill ${statusClass}` : 'pill'}>{status}</span>
            </span>
          </span>
          {/* Parentage first, on its own line — it is how a deed identifies a
              person, and it belongs next to the name rather than buried in the
              address. The address follows it. */}
          {parentage && <span className="ownerchain-parentage">{parentage}</span>}
          {address && <span className="ownerchain-detail">{address}</span>}
        </button>
      ) : (
        /* A party known only from a deed has no owner row to open, so the
           card is not a button — and says so on itself, where it used to
           answer a click with a toast that led nowhere. */
        <div className="ownerchain-open static">
          <span className="ownerchain-person">
            <PersonPhoto owner={owner} name={name} />
            <span className="ownerchain-name">
              <strong>{name}</strong>
              <span className="pill">{status}</span>
            </span>
          </span>
          <span className="ownerchain-detail">Not filed as an owner of this property yet.</span>
        </div>
      )}

      {/* The papers this person's title rests on. Each is its own button, so a
          deed number opens the event it belongs to rather than the person —
          which is what somebody checking a chain actually wants next. Outside
          the card's own button because a button inside a button is not a
          control a keyboard can reach. */}
      {acquired.length > 0 && (
        <div className="ownerchain-papers nodrag nopan">
          {acquired.slice(0, MAX_CLIPS).map((a) => {
            const tag = paperTagLabel(a.deedNo, a.kind);
            return (
              <button
                key={a.transferId}
                type="button"
                // A tag with a scan behind it reads as a link and opens the paper
                // in the side panel. One without opens the event instead, which
                // is where a scan gets attached — so the tag always leads
                // somewhere rather than being a dead number.
                className={`ownerchain-tag${a.deedDocumentId ? ' filed' : ''}`}
                aria-label={a.deedDocumentId
                  ? `Open scan of ${tag}`
                  : `Open transfer ${tag}`}
                onClick={(event) => (a.deedDocumentId
                  ? onOpenPaper(a.deedDocumentId, event.currentTarget)
                  : onOpenTransfer(a.transferId, event.currentTarget))}
              >
                <LocalOfferOutlined sx={{ fontSize: 13 }} aria-hidden />
                <span className="ownerchain-tag-no">{tag}</span>
                {a.extentLabel && <span className="ownerchain-tag-ext">{a.extentLabel}</span>}
                {a.shareLabel && <span className="ownerchain-tag-ext">{a.shareLabel}</span>}
              </button>
            );
          })}
          {acquired.length > MAX_CLIPS && (
            <span className="note" style={{ fontSize: '0.625rem' }}>
              and {acquired.length - MAX_CLIPS} more
            </span>
          )}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={editing}
        className={editing ? 'ownerchain-handle live' : 'ownerchain-handle'}
      />
    </div>
  );
}

const NODE_TYPES = { person: PersonChainNode } satisfies NodeTypes;

function useChainOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(() => {
    if (typeof window === 'undefined') return 'horizontal';
    return window.matchMedia(NARROW_QUERY).matches ? 'vertical' : 'horizontal';
  });
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const update = () => setOrientation(query.matches ? 'vertical' : 'horizontal');
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return orientation;
}

/** React Flow positions are CSS pixels while the nodes are sized in rems. Keep
 *  both on one scale so text-only zoom cannot make ranks overlap. */
function useRootRem(): number {
  const read = () => {
    if (typeof window === 'undefined') return 16;
    return Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  };
  const [rem, setRem] = useState(read);
  useEffect(() => {
    const update = () => setRem((current) => {
      const next = read();
      return current === next ? current : next;
    });
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  return rem;
}

interface PersonSeed {
  key: string;
  name: string;
  owner: Owner | null;
  acquired: AcquiredUnder[];
}

/** Every person the chain mentions, and what each received.
 *
 *  Owners come first so the people the record actually holds keep their photo
 *  and status; a party named only on a deed is added as it is met. */
function collectPeople(owners: Owner[], transfers: Transfer[]): Map<string, PersonSeed> {
  const people = new Map<string, PersonSeed>();
  const byName = new Map<string, string>();
  for (const o of owners) {
    const key = ownerKey(o);
    people.set(key, { key, name: o.name, owner: o, acquired: [] });
    byName.set(o.name.trim().toLowerCase(), key);
  }
  const resolve = (p: TransferParty): string => {
    // A deed party with no owner id may still BE one of the owners by name —
    // the deed reader and the owners list are filled from the same paper.
    if (!p.ownerId) {
      const hit = byName.get(p.name.trim().toLowerCase());
      if (hit) return hit;
    }
    return partyKey(p);
  };
  for (const t of transfers) {
    for (const p of [...t.fromParties, ...t.toParties]) {
      const key = resolve(p);
      if (!people.has(key)) {
        people.set(key, { key, name: p.name || '(unnamed)', owner: null, acquired: [] });
      }
      // Only the receiving side gets a paper clipped to it: the deed is how
      // THIS person came to hold the land. The seller's own paper is the
      // earlier transfer, clipped to them there.
      if (p.side === 'to') {
        people.get(key)!.acquired.push({
          transferId: t.id,
          deedNo: t.deedNo,
          kind: t.kind,
          extentLabel: p.extentLabel,
          shareLabel: p.shareLabel,
          deedDocumentId: t.deedDocumentId,
        });
      }
    }
  }
  return people;
}

/** Rank each person by how far down the chain they sit.
 *
 *  Depth 0 is whoever never received anything from anybody on this record — the
 *  root of the chain. Everyone else sits one column right of the deepest person
 *  who gave to them, so a split fans out and a merge converges, which is the
 *  whole point of drawing this as a graph rather than a list.
 *
 *  The walk is depth-capped rather than trusting the data to be acyclic: the
 *  server refuses a prior-transfer cycle, but a from/to pair can still name the
 *  same two people in both directions, and an uncapped walk would hang. */
function rankPeople(
  people: Map<string, PersonSeed>,
  transfers: Transfer[],
  keyOf: (p: TransferParty) => string,
): Map<string, number> {
  const givers = new Map<string, Set<string>>();
  for (const t of transfers) {
    for (const to of t.toParties) {
      const target = keyOf(to);
      const set = givers.get(target) ?? new Set<string>();
      for (const from of t.fromParties) {
        const source = keyOf(from);
        if (source !== target) set.add(source);
      }
      givers.set(target, set);
    }
  }
  const depth = new Map<string, number>();
  const cap = people.size + 1;
  const measure = (key: string, seen: Set<string>): number => {
    if (depth.has(key)) return depth.get(key)!;
    if (seen.has(key) || seen.size > cap) return 0;
    const from = givers.get(key);
    if (!from || from.size === 0) {
      depth.set(key, 0);
      return 0;
    }
    seen.add(key);
    let best = 0;
    for (const source of from) {
      best = Math.max(best, measure(source, seen) + 1);
    }
    seen.delete(key);
    depth.set(key, best);
    return best;
  };
  for (const key of people.keys()) measure(key, new Set());
  return depth;
}

interface GraphInput {
  owners: Owner[];
  transfers: Transfer[];
  orientation: Orientation;
  rem: number;
  editing: boolean;
  onOpenPerson: (data: { owner: Owner | null; name: string }, trigger: HTMLElement) => void;
  onOpenTransfer: (transferId: string, trigger: HTMLElement) => void;
  onOpenPaper: (paperId: string, trigger: HTMLElement) => void;
}

function buildGraph({
  owners, transfers, orientation, rem, editing, onOpenPerson, onOpenTransfer, onOpenPaper,
}: GraphInput): { nodes: PersonNode[]; edges: Edge[]; ranks: number; rows: number } {
  const people = collectPeople(owners, transfers);
  const byName = new Map<string, string>();
  for (const seed of people.values()) {
    if (seed.owner) byName.set(seed.owner.name.trim().toLowerCase(), seed.key);
  }
  const keyOf = (p: TransferParty): string => {
    if (!p.ownerId) {
      const hit = byName.get(p.name.trim().toLowerCase());
      if (hit) return hit;
    }
    return partyKey(p);
  };

  const depth = transfers.length
    ? rankPeople(people, transfers, keyOf)
    // No transfers filed: fall back to the owners' own recorded order, current
    // owners last so the chain still reads oldest-to-newest left to right.
    : new Map<string, number>([...people.values()].map((seed, index) => [
        seed.key,
        seed.owner && !seed.owner.isCurrent ? index : people.size,
      ]));

  const columns = new Map<number, PersonSeed[]>();
  for (const seed of people.values()) {
    const d = depth.get(seed.key) ?? 0;
    (columns.get(d) ?? columns.set(d, []).get(d)!).push(seed);
  }
  // The step ALONG the chain is always the long one; the step BETWEEN siblings
  // in a rank has to clear the node's own size on that axis. Vertically the
  // siblings sit side by side, so they need the node's WIDTH, not its height —
  // an 11rem gap under a 17rem card overlaps every split and merge, which are
  // the only ranks that hold more than one person.
  const colStep = COL_STEP_REM * rem;
  const rowStep = (orientation === 'vertical' ? NODE_WIDTH_REM + 2 : ROW_STEP_REM) * rem;
  const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length));

  const nodes: PersonNode[] = [];
  for (const [d, seeds] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    const offset = ((tallest - seeds.length) * rowStep) / 2;
    seeds.forEach((seed, row) => {
      const along = d * colStep;
      const across = offset + row * rowStep;
      nodes.push({
        id: seed.key,
        type: 'person',
        position: orientation === 'horizontal'
          ? { x: along, y: across }
          : { x: across, y: along },
        data: {
          key: seed.key, name: seed.name, owner: seed.owner,
          acquired: seed.acquired, editing,
          onOpen: onOpenPerson, onOpenTransfer, onOpenPaper,
        },
        style: { width: `${NODE_WIDTH_REM}rem` },
        draggable: editing,
        connectable: editing,
        selectable: false,
        deletable: false,
        focusable: false,
      });
    });
  }

  const edges: Edge[] = [];
  if (transfers.length) {
    for (const t of transfers) {
      for (const from of t.fromParties) {
        for (const to of t.toParties) {
          const source = keyOf(from);
          const target = keyOf(to);
          if (source === target) continue;
          // The connector says only WHAT KIND of event this was. The deed number
          // and the amount are clipped to the receiving node, where there is
          // room for them — the gap between two cards is a few rem wide, and a
          // full "2.80 ac · Deed 3521/2011" was drawn straight under the next
          // card. Keeping the kind here also means a merge no longer repeats
          // one receiver's extent on every seller's arrow.
          const label = t.kind === 'manual' ? '' : t.kind;
          // A transfer's connector is a control — a click opens the event — so
          // it is one for a keyboard too: a Tab stop that says what it is and
          // opens the same drawer on Enter or Space. (The order-only lines of
          // the fallback below open nothing and stay pictures.)
          const what = label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Transfer';
          edges.push({
            id: `t-${t.id}-${source}-${target}`,
            source,
            target,
            type: 'smoothstep',
            label: label || undefined,
            className: t.verified ? 'chain-edge' : 'chain-edge proposed',
            markerEnd: { type: 'arrowclosed' as never, width: 16, height: 16 },
            animated: false,
            selectable: false,
            focusable: true,
            ariaRole: 'button',
            ariaLabel: `${what} from ${from.name} to ${to.name}`
              + `${t.deedNo ? `, deed ${t.deedNo}` : ''}${t.verified ? '' : ', not confirmed'}`,
            domAttributes: {
              onKeyDown: (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                // An SVG <g> takes focus() like any element, which is all the
                // drawer's focus return needs of its opener.
                onOpenTransfer(t.id, event.currentTarget as unknown as HTMLElement);
              },
            },
            reconnectable: false,
            data: { transferId: t.id },
          });
        }
      }
    }
  } else {
    // The honest fallback: sequence, not succession. No arrowheads.
    const ordered = [...people.values()].sort(
      (a, b) => (depth.get(a.key) ?? 0) - (depth.get(b.key) ?? 0),
    );
    for (let i = 0; i < ordered.length - 1; i += 1) {
      edges.push({
        id: `order-${ordered[i].key}-${ordered[i + 1].key}`,
        source: ordered[i].key,
        target: ordered[i + 1].key,
        type: 'smoothstep',
        className: 'chain-edge order-only',
        animated: false,
        selectable: false,
        focusable: false,
        reconnectable: false,
      });
    }
  }

  // `ranks` is how far the chain runs; `rows` is the widest rank — a split or a
  // merge. Which of the two the canvas measures depends on which way it is
  // drawn, so both come back.
  return { nodes, edges, ranks: columns.size, rows: tallest };
}

/** The drawer that files or edits one event. Everything a transfer claims is
 *  entered here — who gave, who received, how much, and the paper behind it —
 *  so the canvas stays a picture and never becomes a form.
 *
 *  Exported because the People tab's empty Owners state offers "Add a
 *  transfer" too: a chain of title starts with a transfer, and the only way
 *  to file the first one used to be drawn inside the chain it would create. */
export function TransferDrawer({
  recordId, recordTitle, transfer, owners, others, seed, onClose, returnFocus,
}: {
  recordId: string;
  recordTitle: string;
  transfer: Transfer | null;
  owners: Owner[];
  /** The record's other transfers — what this one can be linked back to. */
  others: Transfer[];
  /** A drag on the canvas arrives with the two ends already chosen. */
  seed: { fromName: string; toName: string } | null;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLElement | null>;
}) {
  const addTransfer = useAddTransfer();
  const updateTransfer = useUpdateTransfer();
  const delTransfer = useDeleteTransfer();
  const setParty = useSetTransferParty();
  const removeParty = useRemoveTransferParty();
  const linkPrior = useLinkTransferPrior();
  const toast = useToast();

  const [kind, setKind] = useState(transfer?.kind || 'sale');
  const [deedNo, setDeedNo] = useState(transfer?.deedNo ?? '');
  const [sro, setSro] = useState(transfer?.sro ?? '');
  const [registeredOn, setRegisteredOn] = useState(transfer?.registeredOn ?? '');
  const [note, setNote] = useState(transfer?.note ?? '');
  const [fromName, setFromName] = useState(seed?.fromName ?? '');
  const [toName, setToName] = useState(seed?.toName ?? '');
  const [extent, setExtent] = useState('');
  const [unit, setUnit] = useState('ac');
  const [shareNum, setShareNum] = useState('');
  const [shareDen, setShareDen] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState('');

  const busy = addTransfer.isPending || updateTransfer.isPending
    || setParty.isPending || delTransfer.isPending;
  const editingExisting = !!transfer;
  const canSave = editingExisting
    ? !busy
    : (fromName.trim().length > 0 || toName.trim().length > 0) && !busy;
  const dirty = editingExisting
    ? kind !== transfer!.kind || deedNo !== transfer!.deedNo || sro !== transfer!.sro
      || registeredOn !== transfer!.registeredOn || note !== transfer!.note
      || !!fromName.trim() || !!toName.trim()
    : [fromName, toName, deedNo, sro, registeredOn, note, extent].some((v) => v.trim());

  /** An owner id for a typed name, when the record already holds that person.
   *  Linking rather than duplicating is what keeps one person one node. */
  const ownerIdFor = (name: string): string => {
    const hit = owners.find((o) => o.name.trim().toLowerCase() === name.trim().toLowerCase());
    return hit?.id ?? '';
  };

  const addEndpoint = async (transferId: string, side: 'from' | 'to', name: string) => {
    if (!name.trim()) return;
    await setParty.mutateAsync({
      transferId,
      side,
      ownerId: ownerIdFor(name),
      name: name.trim(),
      parentage: '',
      address: '',
      extent: side === 'to' ? Number(extent || 0) : 0,
      extentUnit: side === 'to' ? unit : '',
      shareNum: side === 'to' ? Number(shareNum || 0) : 0,
      shareDen: side === 'to' ? Number(shareDen || 0) : 0,
      isGpa: false,
      partyId: '',
    });
  };

  const save = async () => {
    if (!canSave) return;
    setErr('');
    try {
      if (editingExisting) {
        const res = await updateTransfer.mutateAsync({
          transferId: transfer!.id,
          kind: kind !== transfer!.kind ? kind : '',
          deedDocumentId: '',
          deedNo: deedNo !== transfer!.deedNo ? (deedNo.trim() || '-') : '',
          sro: sro !== transfer!.sro ? (sro.trim() || '-') : '',
          registeredOn: registeredOn !== transfer!.registeredOn ? (registeredOn.trim() || '-') : '',
          note: note !== transfer!.note ? (note.trim() || '-') : '',
          verified: null,
        });
        if (!res.web.updateTransfer && !fromName.trim() && !toName.trim()) {
          setErr('That change was not saved. This transfer may already be off the property.');
          return;
        }
        await addEndpoint(transfer!.id, 'from', fromName);
        await addEndpoint(transfer!.id, 'to', toName);
        onClose();
        return;
      }
      const created = await addTransfer.mutateAsync({
        recordId,
        kind,
        deedDocumentId: '',
        deedNo: deedNo.trim(),
        sro: sro.trim(),
        registeredOn: registeredOn.trim(),
        priorTransferId: '',
        note: note.trim(),
        source: 'manual',
        // The owner is entering their own succession; they are the authority.
        verified: true,
      });
      const id = created.web.addTransfer;
      if (!id) {
        setErr('That transfer was not filed. This record may no longer be yours to edit.');
        return;
      }
      await addEndpoint(id, 'from', fromName);
      await addEndpoint(id, 'to', toName);
      onClose();
    } catch {
      setErr('That could not be saved. Try again.');
    }
  };

  /** The confirmation's own answer, printed inside it: it holds open until
   *  the server says the transfer is gone. */
  const [removeErr, setRemoveErr] = useState('');
  const remove = async () => {
    if (!transfer || delTransfer.isPending) return;
    setRemoveErr('');
    try {
      const res = await delTransfer.mutateAsync({ transferId: transfer.id });
      if (!res.web.deleteTransfer) {
        setRemoveErr('That transfer was not removed. It may already be off this property.');
        return;
      }
      onClose();
    } catch {
      setRemoveErr('That transfer could not be removed. It is still on this property.');
    }
  };

  const dropParty = async (party: TransferParty) => {
    try {
      await removeParty.mutateAsync({ partyId: party.id });
    } catch {
      toast.bad('That party could not be removed.');
    }
  };

  /** The document-to-document link the deeds themselves carry: this event rests
   *  on an earlier one. The server refuses a cycle, so a wrong pick is a
   *  refusal rather than a chain that loops. */
  const setPrior = async (priorId: string) => {
    if (!transfer) return;
    try {
      const res = await linkPrior.mutateAsync({
        transferId: transfer.id, priorTransferId: priorId,
      });
      if (!res.web.linkTransferPrior) {
        toast.bad('That link was not made. A chain cannot point back into itself.');
      }
    } catch {
      toast.bad('That link could not be saved.');
    }
  };

  /** How one transfer reads in a one-line list. */
  const labelOf = (t: Transfer) => [
    t.deedNo ? `Deed ${t.deedNo}` : `A ${t.kind}`,
    t.registeredOn ? ddmmyyyy(t.registeredOn) : '',
    t.toParties.map((p) => p.name).join(', '),
  ].filter(Boolean).join(' · ');

  /** Accepting a proposal. The edge stops being dashed and starts counting as
   *  part of the chain — which is why it is a deliberate click and not a
   *  side-effect of opening the panel. */
  const confirmDirection = async () => {
    if (!transfer) return;
    try {
      await updateTransfer.mutateAsync({
        transferId: transfer.id, kind: '', deedDocumentId: '', deedNo: '',
        sro: '', registeredOn: '', note: '', verified: true,
      });
      onClose();
    } catch {
      toast.bad('That could not be confirmed. Try again.');
    }
  };

  /** The reading got it backwards. Every endpoint swaps side, and the transfer
   *  is left UNconfirmed: the person has told us the direction was wrong, not
   *  that the rest of the reading is right. */
  const flipDirection = async () => {
    if (!transfer) return;
    try {
      for (const p of [...transfer.fromParties, ...transfer.toParties]) {
        await setParty.mutateAsync({
          transferId: transfer.id,
          side: p.side === 'from' ? 'to' : 'from',
          ownerId: p.ownerId,
          name: p.name,
          parentage: p.parentage,
          address: p.address,
          // Extent belongs to whoever received; a party moving to the giving
          // side loses it, and one arriving on the receiving side has none
          // stated until somebody enters it.
          extent: 0,
          extentUnit: '',
          shareNum: 0,
          shareDen: 0,
          isGpa: p.isGpa,
          partyId: p.id,
        });
      }
      // Silent on success: the panel redraws with the two sides swapped under
      // "On this transfer now", and the amounts cleared, which is the answer.
    } catch {
      toast.bad('That could not be swapped. Try again.');
    }
  };

  return (
    <Drawer
      // The side of the People tab this panel belongs to, as the owner's own
      // drawer says it — not a fourth name for the same list.
      eyebrow={drawerEyebrow(recordTitle, 'Owners')}
      title={editingExisting ? 'This transfer' : 'Add a transfer'}
      onClose={onClose}
      onSubmit={() => void save()}
      busy={busy}
      dirty={dirty}
      over={confirming && transfer ? (
        <ConfirmDialog
          title="Remove this transfer?"
          // What delete_transfer does (web360.py): the event and the people
          // on it go; a later transfer that rested on it loses only the link.
          body={'This event and the people on it are removed from the chain.'
            + ' A later transfer that rested on it keeps everything but that link.'}
          actionLabel="Remove"
          danger
          busy={delTransfer.isPending}
          error={removeErr}
          onConfirm={() => void remove()}
          onClose={() => { setRemoveErr(''); setConfirming(false); }}
        />
      ) : undefined}
      discardCopy={{
        title: 'Discard this transfer?',
        body: 'Your unsaved changes will be lost.',
      }}
      initialFocus="#tr-from"
      returnFocus={returnFocus}
      primary={(
        <DrawerAction
          label={editingExisting ? 'Save changes' : 'File this transfer'}
          working="Saving…"
          pending={busy}
          paused={addTransfer.isPaused || updateTransfer.isPaused}
          disabled={!canSave}
        />
      )}
    >
      {transfer && !transfer.verified && (
        <div className="callout">
          <strong style={{ fontSize: '0.875rem' }}>Read from a document, not confirmed</strong>
          <div className="row tight">
            <button type="button" className="btn sm primary" disabled={busy}
                    onClick={() => void confirmDirection()}>
              <CheckCircleOutlined sx={{ fontSize: 15 }} /> The direction is right — confirm
            </button>
            <button type="button" className="btn sm" disabled={busy}
                    onClick={() => void flipDirection()}>
              Swap who gave and who received
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <label>What kind of event</label>
        <div className="row tight">
          {TRANSFER_KINDS.map((k) => (
            <Chip key={k} wash active={kind === k} onClick={() => setKind(k)}>{k}</Chip>
          ))}
        </div>
      </div>

      {/* The two ends. On an existing transfer these ADD an endpoint, which is
          how a split is entered: save the deed once, then add the second buyer. */}
      <div className="field">
        <label htmlFor="tr-from">Who parted with it</label>
        <input id="tr-from" type="text" list="tr-owner-names" value={fromName}
               placeholder="Name of the seller / giver"
               onChange={(e) => setFromName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="tr-to">Who received it</label>
        <input id="tr-to" type="text" list="tr-owner-names" value={toName}
               placeholder="Name of the buyer / receiver"
               onChange={(e) => setToName(e.target.value)} />
      </div>
      <datalist id="tr-owner-names">
        {owners.map((o) => <option key={o.id} value={o.name} />)}
      </datalist>

      <div className="field">
        <label htmlFor="tr-extent">How much they received</label>
        <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
          <input id="tr-extent" type="number" min="0" step="0.01" value={extent}
                 placeholder="2.50" style={{ flex: '1 1 8rem' }}
                 onChange={(e) => setExtent(e.target.value)} />
          <select aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {EXTENT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

      </div>

      <div className="field">
        <label>Share, if the document states one</label>
        <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap', alignItems: 'center' }}>
          <input type="number" min="0" step="1" value={shareNum} placeholder="1"
                 aria-label="Share numerator" style={{ flex: '0 1 5rem' }}
                 onChange={(e) => setShareNum(e.target.value)} />
          <span aria-hidden>/</span>
          <input type="number" min="0" step="1" value={shareDen} placeholder="2"
                 aria-label="Share denominator" style={{ flex: '0 1 5rem' }}
                 onChange={(e) => setShareDen(e.target.value)} />
        </div>
      </div>

      <hr className="hr" />

      <div className="field">
        <label htmlFor="tr-deed">Deed number</label>
        <input id="tr-deed" type="text" value={deedNo} placeholder="e.g. 2056/2010"
               onChange={(e) => setDeedNo(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="tr-sro">Registering office</label>
        <input id="tr-sro" type="text" value={sro} placeholder="Sub-Registrar Office"
               onChange={(e) => setSro(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="tr-on">Registered on</label>
        <input id="tr-on" type="date" value={registeredOn}
               onChange={(e) => setRegisteredOn(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="tr-note">Note</label>
        <textarea id="tr-note" rows={2} value={note}
                  placeholder="Anything worth remembering about this event"
                  onChange={(e) => setNote(e.target.value)} />
      </div>

      {transfer && others.length > 0 && (
        <div className="field">
          <label htmlFor="tr-prior">Rests on an earlier transfer</label>
          <select id="tr-prior" value={transfer.priorTransferId} disabled={linkPrior.isPending}
                  onChange={(e) => void setPrior(e.target.value)}>
            <option value="">Not linked</option>
            {others.map((t) => (
              <option key={t.id} value={t.id}>{labelOf(t)}</option>
            ))}
          </select>
        </div>
      )}

      {transfer && (transfer.fromParties.length > 0 || transfer.toParties.length > 0) && (
        <>
          <hr className="hr" />
          <div className="field">
            <label>On this transfer now</label>
            <div className="rows">
              {[...transfer.fromParties, ...transfer.toParties].map((p) => (
                <div key={p.id}>
                  <span className="grow">
                    <strong style={{ fontSize: '0.875rem' }}>{p.name}</strong>
                    <span className="note" style={{ display: 'block' }}>
                      {p.side === 'from' ? 'parted with it' : 'received it'}
                      {p.extentLabel ? ` · ${p.extentLabel}` : ''}
                      {p.shareLabel ? ` · ${p.shareLabel} share` : ''}
                    </span>
                  </span>
                  <button type="button" className="btn sm" disabled={removeParty.isPending}
                          onClick={() => void dropParty(p)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {transfer && (
        <>
          <hr className="hr" />
          {/* Removing asks in the shared confirmation (the drawer's `over`),
              which takes focus and says what goes. */}
          <button type="button" className="btn sm" aria-haspopup="dialog"
                  onClick={() => { setRemoveErr(''); setConfirming(true); }}>
            <DeleteOutlineOutlined sx={{ fontSize: 16 }} /> Remove this transfer
          </button>
        </>
      )}

      {err && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Drawer>
  );
}

export function OwnerChain({ recordId, recordTitle, owners, transfersQ, onOpenOwner }: {
  recordId: string;
  recordTitle: string;
  owners: Owner[];
  transfersQ: { data?: TransfersView; isLoading: boolean };
  onOpenOwner: (owner: Owner, trigger: HTMLElement) => void;
}) {
  const orientation = useChainOrientation();
  const rem = useRootRem();
  const [editing, setEditing] = useState(false);
  /** The drawer holds an ID, never a copy of the row. Its controls save as soon
   *  as they are used, so a snapshot taken at open time would show the old
   *  prior-link and the old party list immediately after changing them. */
  const [drawer, setDrawer] = useState<
    { transferId: string | null; seed: { fromName: string; toName: string } | null } | null
  >(null);
  /** The paper open in the side panel, or ''. */
  const [preview, setPreview] = useState('');
  const openTrigger = useRef<HTMLElement | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const flowRef = useRef<ReactFlowInstance<PersonNode, Edge> | null>(null);

  const transfers = transfersQ.data?.transfers ?? [];
  const unverified = transfersQ.data?.unverifiedCount ?? 0;

  /** A person node opens their owner drawer when they ARE an owner. A party
   *  known only from a deed has no owner row to edit; its card is not a
   *  button and says so on itself (PersonChainNode), so nothing reaches here
   *  for one. */
  const onOpenPerson = useCallback((
    data: { owner: Owner | null; name: string }, trigger: HTMLElement,
  ) => {
    if (data.owner) onOpenOwner(data.owner, trigger);
  }, [onOpenOwner]);

  /** A clip with no scan behind it opens the event, where one is attached. */
  const onOpenTransfer = useCallback((transferId: string, trigger: HTMLElement) => {
    openTrigger.current = trigger;
    setDrawer({ transferId, seed: null });
  }, []);

  /** A clip with a filed scan opens it in the same side panel Papers, the Vault
   *  and a shelf all use — one preview surface for every paper in the app, so a
   *  deed opened from the chain behaves exactly as it does from its shelf. */
  const onOpenPaper = useCallback((paperId: string, trigger: HTMLElement) => {
    openTrigger.current = trigger;
    setPreview(paperId);
  }, []);

  const graph = useMemo(
    () => buildGraph({
      owners, transfers, orientation, rem, editing, onOpenPerson, onOpenTransfer, onOpenPaper,
    }),
    [editing, onOpenPaper, onOpenPerson, onOpenTransfer, orientation, owners, rem, transfers],
  );

  const fitViewOptions = useMemo(
    () => ({ padding: orientation === 'vertical' ? 0.22 : 0.16, maxZoom: 1 }),
    [orientation],
  );
  const layoutSignature =
    `${graph.nodes.length}:${graph.edges.length}:${orientation}:${rem}`;

  /** How tall the drawing itself is — the widest rank when it runs across the
   *  screen, the rank count when it runs down it. */
  const spanRem = orientation === 'horizontal'
    ? (graph.rows - 1) * ROW_STEP_REM + NODE_HEIGHT_REM + CANVAS_PAD_REM
    : (graph.ranks - 1) * COL_STEP_REM + NODE_HEIGHT_REM + CANVAS_PAD_REM;
  /** Content height is the narrow-screen fallback, where a vertical chain must
   *  make the document longer rather than squeeze every node. On desktop CSS
   *  overrides this custom value and the graph flexes through the viewport space
   *  left by the shared record frame. */
  const canvasHeight = Math.round(Math.max(spanRem * rem, 20 * rem));

  /** Fit the graph, then lift it to the top of the frame.
   *
   *  `fitView` centres, and it has to run first because it is what measures the
   *  nodes and picks the zoom. Once it has, the graph's top edge is wherever
   *  centring left it; this slides the viewport up so that edge sits one pad
   *  below the frame's own top. On a frame taller than the drawing that removes
   *  the band of empty canvas above the cards; on a frame shorter than it the
   *  shift is nil, because fitView already had the graph filling the height. */
  const alignTop = useCallback(() => {
    const flow = flowRef.current;
    if (!flow || graph.nodes.length === 0) return;
    void flow.fitView(fitViewOptions).then(() => {
      const instance = flowRef.current;
      if (!instance) return;
      const bounds = getNodesBounds(instance.getNodes());
      if (!Number.isFinite(bounds.y) || !Number.isFinite(bounds.height)) return;
      const viewport = instance.getViewport();
      const pad = CANVAS_PAD_REM * rem * 0.5;
      const topOnScreen = bounds.y * viewport.zoom + viewport.y;
      const lift = topOnScreen - pad;
      // Only ever move it UP, and only when centring actually pushed it down.
      if (lift <= 1) return;
      instance.setViewport({ ...viewport, y: viewport.y - lift });
    });
  }, [fitViewOptions, graph.nodes.length, rem]);

  // Re-run whenever the drawing OR its frame changes. `canvasHeight` is in the
  // list because a box that grew or shrank is a new frame to fit into, and
  // without it a resized window left the graph placed against the old height.
  useEffect(() => {
    const frame = window.requestAnimationFrame(alignTop);
    return () => window.cancelAnimationFrame(frame);
  }, [alignTop, canvasHeight, layoutSignature]);

  /** Dragging one person onto another proposes a transfer between them. The
   *  drawer opens with both ends filled; nothing is written until it is saved,
   *  so a mis-drag costs a cancel rather than a wrong claim about title. */
  const onConnect = useCallback((connection: Connection) => {
    const nameOf = (id: string | null) =>
      graph.nodes.find((n) => n.id === id)?.data.name ?? '';
    const fromName = nameOf(connection.source);
    const toName = nameOf(connection.target);
    if (!fromName || !toName || fromName === toName) return;
    openTrigger.current = editButton.current;
    setDrawer({ transferId: null, seed: { fromName, toName } });
  }, [graph.nodes]);

  const confirmAll = async () => {
    // Confirming is per transfer on purpose — there is no "accept everything"
    // shortcut, because the thing being accepted is a claim about who owns land.
    const first = transfers.find((t) => !t.verified);
    if (!first) return;
    openTrigger.current = editButton.current;
    setDrawer({ transferId: first.id, seed: null });
  };

  if (transfersQ.isLoading) {
    return (
      <section className="card ownerchain">
        <div className="ownerchain-head">
          <span>
            <span className="eyebrow">Chain of title</span>
            <strong>Reading the chain…</strong>
          </span>
        </div>
        <div className="ownerchain-canvas" aria-busy="true" />
      </section>
    );
  }

  const hasTransfers = transfers.length > 0;

  return (
    <>
      {drawer && (
        <TransferDrawer
          // Keyed by id so switching between two transfers remounts the form
          // rather than carrying the first one's typed values into the second.
          key={drawer.transferId ?? 'new'}
          recordId={recordId}
          recordTitle={recordTitle}
          transfer={transfers.find((t) => t.id === drawer.transferId) ?? null}
          owners={owners}
          others={transfers.filter((t) => t.id !== drawer.transferId)}
          seed={drawer.seed}
          returnFocus={openTrigger}
          onClose={() => setDrawer(null)}
        />
      )}

      <section className="card ownerchain" aria-label="Chain of title">
        <div className="ownerchain-head">
          <span>
            <span className="eyebrow">{hasTransfers ? 'Chain of title' : 'Recorded order'}</span>
            <strong>
              {hasTransfers
                ? `${plural(transfers.length, 'transfer')} · ${plural(graph.nodes.length, 'person', 'people')}`
                : 'No transfers filed'}
            </strong>
          </span>
          <div className="row tight">
            <button ref={editButton} type="button" className={`btn sm${editing ? ' primary' : ''}`}
                    aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
              <EditOutlined sx={{ fontSize: 15 }} /> {editing ? 'Done editing' : 'Edit chain'}
            </button>
            <button type="button" className="btn sm" onClick={() => {
              openTrigger.current = editButton.current;
              setDrawer({ transferId: null, seed: null });
            }}>
              <AddOutlined sx={{ fontSize: 15 }} /> Add a transfer
            </button>
          </div>
        </div>

        {unverified > 0 && (
          <div className="row tight" style={{ alignItems: 'center' }}>
            <span className="note grow" style={{ color: 'var(--w-accent)' }}>
              {plural(unverified, 'transfer')} not confirmed
            </span>
            <button type="button" className="btn sm" onClick={() => void confirmAll()}>
              <CheckCircleOutlined sx={{ fontSize: 15 }} /> Review
            </button>
          </div>
        )}

        <div
          className="ownerchain-canvas"
          style={{ '--chain-content-height': `${canvasHeight}px` } as CSSProperties}
        >
          <ReactFlow<PersonNode, Edge>
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={NODE_TYPES}
            onInit={(instance) => { flowRef.current = instance; }}
            onConnect={onConnect}
            onEdgeClick={(_event, edge) => {
              const id = (edge.data as { transferId?: string } | undefined)?.transferId;
              const hit = transfers.find((t) => t.id === id);
              if (!hit) return;
              openTrigger.current = editButton.current;
              setDrawer({ transferId: hit.id, seed: null });
            }}
            aria-label="Chain of title"
            // The library's default tells a screen reader an edge can be
            // selected and deleted; here Enter opens the transfer, and
            // deleting one is done in its drawer, behind a confirmation.
            ariaLabelConfig={{ 'edge.a11yDescription.default': 'Press Enter to open this transfer.' }}
            fitView
            fitViewOptions={fitViewOptions}
            minZoom={orientation === 'vertical' ? 0.1 : 0.25}
            maxZoom={1.25}
            nodesDraggable={editing}
            nodesConnectable={editing}
            nodesFocusable={false}
            edgesFocusable={false}
            edgesReconnectable={false}
            elementsSelectable={false}
            panOnDrag={orientation === 'horizontal'}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={orientation === 'horizontal'}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            panActivationKeyCode={null}
            zoomActivationKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Controls
              position="bottom-left"
              showZoom={orientation === 'horizontal'}
              showInteractive={false}
              fitViewOptions={fitViewOptions}
              // Fit means the same thing here as it does on load: the graph
              // against the top of the frame, not floating in the middle of it.
              onFitView={alignTop}
              aria-label="Chain view controls"
            />
          </ReactFlow>
        </div>

        {/* Transfer details stay on the graph: the receiving node carries its
            deed tag and clicking an edge opens that transfer. A second list of
            every deed below the canvas duplicated those links and consumed the
            space the chain itself needs. */}
      </section>

      {/* The scan, in the same resizable right-side panel every other paper in
          the app opens into. The graph stays behind it, so a deed is read where
          the chain was being read rather than on another screen. */}
      {preview && (
        <PaperPreview
          paperId={preview}
          onClose={() => setPreview('')}
          returnFocus={openTrigger}
        />
      )}
    </>
  );
}
