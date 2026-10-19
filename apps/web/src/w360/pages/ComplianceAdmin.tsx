import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import AddOutlined from '@mui/icons-material/AddOutlined';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import LaunchOutlined from '@mui/icons-material/LaunchOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import PrivacyTipOutlined from '@mui/icons-material/PrivacyTipOutlined';
import PublishOutlined from '@mui/icons-material/PublishOutlined';
import TranslateOutlined from '@mui/icons-material/TranslateOutlined';

import {
  parseGovernanceDocument,
  useArchiveGovernancePolicy,
  useGeographyReference,
  useGovernanceAdminPolicies,
  useGovernanceAdminPolicy,
  useGovernancePolicyHistory,
  usePortfolio,
  usePublishGovernancePolicy,
  useSaveGovernancePolicy,
  useServicesOffered,
  type GeographyRow,
  type GovernanceDocument,
  type GovernancePolicy,
  type GovernanceServiceVisual,
} from '../api';
import {
  Card, ddmmyyyy, Empty, FacetFilter, Failed, FormError, PageHead, Pill, PlaceLine, plural,
  statusWord, TabPanel, TabStrip,
} from '../ui';
import { Dialog } from '../Dialog';
import { Drawer } from '../Drawer';
import { ConfirmDialog } from './PropertyActions';
import { ServiceVisual, serviceVisualSrc } from '../ServiceVisual';
import { Sk } from '../skeletons';

type HeadRef = RefObject<HTMLButtonElement & HTMLAnchorElement | null>;

type View = 'records' | 'buyer' | 'seller' | 'services' | 'visuals' | 'workforce' | 'sharing' | 'sources' | 'manage';

const VIEWS: { id: View; label: string }[] = [
  { id: 'records', label: 'Property records' },
  { id: 'buyer', label: 'Buyer' },
  { id: 'seller', label: 'Seller' },
  { id: 'services', label: 'Service requests' },
  { id: 'visuals', label: 'Service visuals' },
  { id: 'workforce', label: 'Company members' },
  { id: 'sharing', label: 'Secure sharing' },
  { id: 'sources', label: 'Sources' },
  { id: 'manage', label: 'Manage' },
];

/** The trail's actions as governance_policy_events stores them. */
const ACTION_WORD: Record<string, string> = {
  create: 'Added', revise: 'Revised', publish: 'Published', archive: 'Archived',
};

const LEVELS = ['state', 'district', 'mandal', 'village'] as const;
type Level = typeof LEVELS[number];
type Scope = Record<Level, string>;
const ANYWHERE: Scope = { state: '*', district: '*', mandal: '*', village: '*' };

const pretty = (raw: string) => {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
};
const code = (value: string, fallback = '*') => {
  const out = value.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_*-]/g, '');
  return out || fallback;
};
const keyOf = (s: Scope) => `IN/${s.state}/${s.district}/${s.mandal}/${s.village}`;

/** A place code as a name: GUNTUR → Guntur. A state keeps its code (AP is
 *  spelled out) because two letters title-cased read as neither. */
function placeName(level: Level, value: string): string {
  if (level === 'state') return value === 'AP' ? 'Andhra Pradesh' : value.replaceAll('_', ' ');
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** The named places of a scope, widest first; empty for the whole country. */
function scopeParts(s: Scope): string[] {
  const parts: string[] = [];
  for (const level of LEVELS) {
    if (s[level] === '*') break;
    parts.push(placeName(level, s[level]));
  }
  return parts;
}

/** A code is a storage key, not a sentence — nobody should ever read a bare
 *  '*' off this screen. This turns a scope into the phrase an admin would
 *  actually say out loud. */
function scopeLabel(s: Scope): string {
  const parts = scopeParts(s);
  return parts.length ? parts.join(', ') : 'All states and union territories';
}

const scopeOfKey = (key: string): Scope => {
  const [, state = '*', district = '*', mandal = '*', village = '*'] = key.split('/');
  return { state, district, mandal, village };
};
const scopeOfPolicy = (p: GovernancePolicy): Scope => ({
  state: p.stateCode, district: p.districtCode, mandal: p.mandalCode, village: p.villageCode,
});

/** recordOfRights → "Record of rights" (sentence case, N1). */
const termLabel = (key: string) => {
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Distinct, counted values one level of the scope hierarchy holds among the
 *  configured policies, restricted to those matching every concrete code in
 *  `parent`. Drives the scope FacetFilter's cascade: a group is empty (and so
 *  hidden by FacetFilter itself) until its parent level is chosen. */
function scopeOptions(rows: GovernancePolicy[], level: Level, parent: Partial<Scope>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const at = scopeOfPolicy(row);
    if (Object.entries(parent).some(([key, value]) => at[key as Level] !== value)) continue;
    const value = at[level];
    if (!value || value === '*') continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, label: placeName(level, key), count }));
}

/** One level of a new scope's address. A dropdown sourced from the
 *  government reference list (states.states/districtsByState/…) whenever
 *  that list actually has rows for the chosen parent — typing a code by hand
 *  is the fallback for a level the LGD sync hasn't reached yet (villages,
 *  today; a newly split district tomorrow), not the default. CRUD at any
 *  level must not dead-end just because the reference import is behind. */
function ScopeLevelField({
  id, label, options, selectedId, codeValue, loading, disabled, placeholder, deriveCode, onChangeLevel,
}: {
  id: string; label: string; options: GeographyRow[]; selectedId: string; codeValue: string;
  loading: boolean; disabled: boolean; placeholder: string;
  deriveCode: (row: GeographyRow) => string;
  onChangeLevel: (nextCode: string, refId: string) => void;
}) {
  if (loading || disabled || options.length > 0) {
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select id={id} value={selectedId} disabled={disabled || loading}
                onChange={(e) => {
                  const row = options.find((o) => o.id === e.target.value);
                  onChangeLevel(row ? deriveCode(row) : '*', row?.id ?? '');
                }}>
          <option value="">
            {loading ? 'Loading…' : disabled ? 'Choose the level above first'
              : `Choose a ${label.toLowerCase()}`}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input type="text" id={id} value={codeValue === '*' ? '' : codeValue} maxLength={80}
             placeholder={placeholder}
             onChange={(e) => onChangeLevel(code(e.target.value || '*'), '')} />
      <small className="note">No official {label.toLowerCase()} list loaded.</small>
    </div>
  );
}

/** Picks the address of a scope to add. Its picks are its own: browsing is
 *  untouched until the admin confirms, so Cancel undoes nothing because
 *  nothing was done. */
function NewScopeDialog({ configured, onCreate, onClose }: {
  configured: Set<string>;
  onCreate: (scope: Scope) => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<Scope>(ANYWHERE);
  const [ref, setRef] = useState<Scope>({ state: '', district: '', mandal: '', village: '' });
  const geography = useGeographyReference(ref.state, ref.district, ref.mandal, true);
  /** Picking one level resets only the levels below it, and remembers the
   *  reference row id so the next level's dropdown knows whose children to
   *  ask for. */
  const choose = (level: Level, next: string, refId: string) => {
    const below = LEVELS.slice(LEVELS.indexOf(level) + 1);
    setPick((p) => ({ ...p, [level]: next, ...Object.fromEntries(below.map((l) => [l, '*'])) }));
    setRef((r) => ({ ...r, [level]: refId, ...Object.fromEntries(below.map((l) => [l, ''])) }));
  };
  const exists = configured.has(keyOf(pick));
  const field = (level: Level, label: string, placeholder: string, options: GeographyRow[] | undefined,
                 disabled: boolean, derive: (row: GeographyRow) => string) => (
    <ScopeLevelField id={`gov-${level}`} label={label} placeholder={placeholder}
                     options={options ?? []} selectedId={ref[level]} codeValue={pick[level]}
                     loading={geography.isLoading} disabled={disabled} deriveCode={derive}
                     onChangeLevel={(next, refId) => choose(level, next, refId)} />
  );
  return (
    <Dialog
      title="New scope"
      onClose={onClose}
      dismissable={false}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={pick.state === '*'}
                  onClick={() => onCreate(pick)}>
            {exists ? 'Create revision' : 'Create override'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ margin: 0 }}>
        Choose the place this policy covers. It starts as a copy of the policy in effect there.
      </p>
      {field('state', 'State', 'e.g. AP', geography.data?.states, false, (row) => code(row.code || row.name))}
      {field('district', 'District', 'e.g. GUNTUR', geography.data?.districts, !ref.state, (row) => code(row.name))}
      {field('mandal', 'Mandal', 'e.g. TENALI', geography.data?.mandals, !ref.district, (row) => code(row.name))}
      {field('village', 'Village', 'e.g. KOTTAPALEM', geography.data?.villages, !ref.mandal, (row) => code(row.name))}
      {pick.state !== '*' && (
        <p className="note" style={{ margin: 0 }}>
          {exists ? `${scopeLabel(pick)} has its own policy. This adds a new revision of it.`
            : `${scopeLabel(pick)} has no policy of its own yet.`}
        </p>
      )}
    </Dialog>
  );
}

/** A checklist row: what to hold, why, and anything that qualifies it. */
function CheckRow({ title, detail, meta }: { title: string; detail: string; meta?: ReactNode }) {
  return (
    <div className="compliance-item">
      <CheckCircleOutlineOutlined sx={{ fontSize: 18 }} aria-hidden />
      <span>
        <strong>{title}</strong><small>{detail}</small>
        {meta}
      </span>
    </div>
  );
}

/** Labelled lists side by side (share / do not share / controls). */
function ListColumns({ columns }: { columns: { label: string; items: string[] }[] }) {
  return (
    <div className="compliance-three">
      {columns.map((column) => (
        <div key={column.label}>
          <strong>{column.label}</strong>
          <ul>{column.items.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

/** A tab's section: its heading repeats the tab's name (V3). */
function Section({ title, lead, aside, children, className }: {
  title: string; lead?: ReactNode; aside?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <section className={`compliance-section ${className ?? ''}`}>
      <div className="compliance-section-head">
        <div>
          <h2>{title}</h2>
          {lead && <p className="note">{lead}</p>}
        </div>
        {aside && <div className="row tight">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** A compliance-item's shape: the tick, a title, its reason, a pill. */
function SkCheckRows({ rows }: { rows: number }) {
  return Array.from({ length: rows }, (_, i) => (
    <div key={i} className="compliance-item">
      <Sk w="1.125rem" h="1.125rem" r="var(--radius-pill)" />
      <span>
        <Sk w={`${55 + ((i * 13) % 30)}%`} h="0.9375rem" />
        <Sk w={`${70 + ((i * 7) % 25)}%`} h="0.8125rem" />
        <Sk w="4rem" h="1.125rem" r="var(--radius-pill)" />
      </span>
    </div>
  ));
}

/** The page under its head while access or the policy is first read
 *  (design.md § Loading): the scope band, the tab strip printed for real but
 *  inert, and the default view — two property-type checklist cards. A grid
 *  repeating main's gap, not display:contents, which drops the status role in
 *  some screen readers. */
function SkCompliance({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}
         style={{ display: 'grid', gap: 'var(--space-lg)', minWidth: 0 }}>
      <div className="compliance-band" aria-hidden>
        <div className="placeline"><Sk w="10rem" /><Sk w="14rem" h="1rem" /><Sk w="12rem" /></div>
        <div className="row tight" style={{ paddingBlock: 'var(--space-sm)' }}>
          {['5rem', '5.5rem', '5.5rem', '5rem'].map((w, i) => (
            <Sk key={i} w={w} h="2rem" r="var(--radius-pill)" />
          ))}
        </div>
      </div>
      <div aria-hidden>
        <nav className="tabs">{VIEWS.map((v) => <span key={v.id} className="sk-tab muted">{v.label}</span>)}</nav>
        <div className="compliance-checklist-grid">
          {[0, 1].map((i) => (
            <Card key={i} title={<Sk w="9rem" h="1.1rem" />}>
              <div className="compliance-items"><SkCheckRows rows={4} /></div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The service visual cards' shape: the picture, then title, caption, notes. */
function SkVisualGrid() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the service visual library">
      <div className="row tight" aria-hidden style={{ paddingBlock: 'var(--space-sm)' }}>
        <Sk w="6rem" h="2rem" r="var(--radius-pill)" /><Sk w="7rem" />
      </div>
      <div className="compliance-visual-grid" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <article key={i} className="compliance-visual-item">
            <Sk h="10rem" r="0" />
            <div className="compliance-visual-copy">
              <span className="row between tight"><Sk w="55%" h="1rem" /><Sk w="4rem" h="1.125rem" r="var(--radius-pill)" /></span>
              <Sk w="90%" /><Sk w="70%" /><Sk w="50%" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/** The change history's rows: action and detail, who and when, the digest. */
function SkHistory() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the change history">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="compliance-history-row" aria-hidden>
          <span><Sk w="5rem" h="0.9375rem" /><Sk w={`${10 + i * 3}rem`} h="0.8125rem" /></span>
          <Sk w="14rem" /><Sk w="5rem" />
        </div>
      ))}
    </div>
  );
}

/** While a changed scope is read the last answer stays, dimmed and inert,
 *  rather than blanking (design.md § Loading). */
const dim = (stale: boolean) => ({
  opacity: stale ? 0.6 : 1, pointerEvents: stale ? 'none' as const : undefined,
  transition: 'opacity var(--dur-fast) var(--ease-out)',
});

function GuideList({ document, kind }: { document: GovernanceDocument; kind: 'buyer' | 'seller' }) {
  const guide = document.guides.find((item) => item.key === kind);
  if (!guide) return <Empty>This policy has no {kind} guidance.</Empty>;
  return (
    <Section title={guide.label}
             lead={kind === 'buyer' ? 'Before money or signatures move.' : 'Prepare once, disclose clearly.'}>
      <ol className="compliance-numbered">
        {guide.items.map((item) => <li key={item}>{item}</li>)}
      </ol>
    </Section>
  );
}

export function ComplianceAdmin() {
  const portfolio = usePortfolio();
  const allowed = !!portfolio.data?.isSuperAdmin;
  // Codes as the server keys them ('*' for every level not chosen).
  const [scope, setScope] = useState<Scope>(ANYWHERE);
  const scopeKey = keyOf(scope);
  const policy = useGovernanceAdminPolicy('IN', scope.state, scope.district, scope.mandal, scope.village, allowed);
  const policies = useGovernanceAdminPolicies('IN', allowed);
  const history = useGovernancePolicyHistory(scopeKey, allowed);
  const offers = useServicesOffered('', '', allowed);
  const document = useMemo(() => parseGovernanceDocument(policy.data), [policy.data]);
  const [view, setView] = useState<View>('records');
  const [workforceCategory, setWorkforceCategory] = useState('');
  const [visualCategory, setVisualCategory] = useState('');
  const [visualEditing, setVisualEditing] = useState(false);
  const [visualDraft, setVisualDraft] = useState<Record<string, GovernanceServiceVisual>>({});
  const [visualReason, setVisualReason] = useState('');
  const [visualError, setVisualError] = useState('');
  const [editing, setEditing] = useState(false);
  const [addingScope, setAddingScope] = useState(false);
  /** Set by NewScopeDialog: start the override once the picked scope's
   *  in-effect policy has loaded, so the copy is of the right document. */
  const [pendingOverride, setPendingOverride] = useState(false);
  const [namingOpen, setNamingOpen] = useState(false);
  /** The dialog and the revision it was opened for: a refetch while it is
   *  open must not retarget it at another (inherited) policy. */
  const [confirm, setConfirm] = useState<{ kind: 'publish' | 'archive'; policyId: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [reason, setReason] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [manageError, setManageError] = useState('');
  const [actionError, setActionError] = useState('');
  const newScopeRef: HeadRef = useRef(null);
  const namingRef: HeadRef = useRef(null);
  const manageRef: HeadRef = useRef(null);
  const save = useSaveGovernancePolicy(false);
  const publish = usePublishGovernancePolicy(false);
  const archive = useArchiveGovernancePolicy(false);

  const exact = policy.data?.scopeKey === scopeKey;
  // A changed scope is still being read: commands wait for its own policy.
  const stale = policy.isPlaceholderData;
  const busy = save.isPending || publish.isPending || archive.isPending || stale;

  useEffect(() => {
    if (!editing) setDraft(policy.data?.document ? pretty(policy.data.document) : '');
  }, [policy.data?.id, policy.data?.document, editing]);

  useEffect(() => {
    if (visualEditing || !document) return;
    const governed = new Map((document.serviceVisuals ?? []).map((item) => [item.serviceKey, item]));
    setVisualDraft(Object.fromEntries((offers.data ?? []).map((offer) => [
      offer.key,
      governed.get(offer.key) ?? {
        serviceKey: offer.key,
        assetKey: offer.visual.assetKey || offer.key,
        alt: offer.visual.alt,
        caption: offer.visual.caption,
      },
    ])));
  }, [document, offers.data, visualEditing]);

  /** Hand focus back to the head command that opened a panel — on a phone
   *  that is the ⋮, since the menu item that opened it is gone (design.md
   *  § Page head, Phone). After the panel's own focus return has run. */
  const refocus = (to: HeadRef) => { requestAnimationFrame(() => to.current?.focus()); };

  // Leaving a scope leaves its work: the JSON draft, a pending override and
  // the visual mapping edits, so none of them is saved into the next scope.
  const resetWork = () => {
    setEditing(false); setReason(''); setManageError(''); setPendingOverride(false);
    setVisualEditing(false); setVisualReason(''); setVisualError('');
  };

  /** State, district, mandal and village are set independently: choosing one
   *  resets only the levels below it, and each carries its own override,
   *  revision and history without touching a sibling or parent scope. */
  const toggleScope = (group: string, value: string) => {
    resetWork();
    setScope((s) => {
      if (group === 'state') return { ...ANYWHERE, state: s.state === value ? '*' : value };
      if (group === 'district') return { ...s, district: s.district === value ? '*' : value, mandal: '*', village: '*' };
      if (group === 'mandal') return { ...s, mandal: s.mandal === value ? '*' : value, village: '*' };
      return { ...s, village: s.village === value ? '*' : value };
    });
  };

  const clearScope = () => { setScope(ANYWHERE); resetWork(); };

  const beginOverride = () => {
    if (!document) return;
    const next = structuredClone(document);
    next.jurisdiction.countryCode = 'IN';
    next.jurisdiction.stateCode = scope.state;
    next.jurisdiction.districtCode = scope.district;
    next.jurisdiction.mandalCode = scope.mandal;
    next.jurisdiction.villageCode = scope.village;
    if (scope.state === '*') {
      next.jurisdiction.stateName = 'All states and union territories';
      next.jurisdiction.districtName = 'All districts';
      next.jurisdiction.authorityName = 'Government of India';
    } else {
      if (scope.state !== policy.data?.stateCode) next.jurisdiction.stateName = placeName('state', scope.state);
      next.jurisdiction.districtName = scope.district === '*' ? 'All districts' : placeName('district', scope.district);
    }
    next.jurisdiction.mandalName = scope.mandal === '*' ? 'All mandals' : placeName('mandal', scope.mandal);
    next.jurisdiction.villageName = scope.village === '*' ? 'All villages' : placeName('village', scope.village);
    setDraft(JSON.stringify(next, null, 2));
    setEditing(true);
    setView('manage');
    setManageError('');
  };

  // beginOverride reads the scope and document this waits for.
  useEffect(() => {
    if (pendingOverride && policy.data && !policy.isFetching) {
      setPendingOverride(false);
      beginOverride();
    }
  }, [pendingOverride, policy.data, policy.isFetching]);

  const saveDraft = async () => {
    setManageError('');
    if (!reason.trim()) {
      setManageError('The draft could not be saved. Enter a change reason.');
      return;
    }
    try {
      const result = await save.mutateAsync({
        countryCode: 'IN', stateCode: scope.state, districtCode: scope.district,
        mandalCode: scope.mandal, villageCode: scope.village,
        document: draft, reason: reason.trim(),
        expectedRevision: exact ? (policy.data?.revision ?? 0) : 0,
      });
      if (!result.web.saveGovernancePolicy) {
        setManageError('The draft could not be saved. Check the document is valid, and reload if this scope was revised meanwhile.');
        return;
      }
      setEditing(false);
      setReason('');
    } catch (error) {
      setManageError(error instanceof Error ? error.message : 'The draft could not be saved. Try again.');
    }
  };

  const closeConfirm = () => { setConfirm(null); setActionReason(''); setActionError(''); };

  /** The opened-for revision is still the one on screen. */
  const stillShown = () => !!confirm && exact && policy.data?.id === confirm.policyId;
  const CHANGED = 'This scope changed while the dialog was open. Cancel, then reload the page.';

  const publishDraft = async () => {
    if (!confirm || !stillShown() || policy.data?.status !== 'draft') { setActionError(CHANGED); return; }
    setActionError('');
    try {
      const result = await publish.mutateAsync({ policyId: confirm.policyId, reason: actionReason.trim() });
      if (!result.web.publishGovernancePolicy) setActionError('The draft could not be published. Reload the page and try again.');
      else { closeConfirm(); refocus(manageRef); }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The draft could not be published. Try again.');
    }
  };

  const archivePolicy = async () => {
    if (!confirm || !policy.data || !stillShown()) { setActionError(CHANGED); return; }
    if (!actionReason.trim()) {
      setActionError('The scope could not be archived. Enter an archive reason.');
      return;
    }
    setActionError('');
    try {
      const result = await archive.mutateAsync({ policyId: confirm.policyId, reason: actionReason.trim() });
      if (!result.web.archiveGovernancePolicy) {
        setActionError(policy.data.stateCode === '*'
          ? 'This scope could not be archived. All states and union territories must keep a published policy, so publish a replacement revision first.'
          : 'This scope could not be archived. Reload the page and try again.');
      } else {
        closeConfirm();
        resetWork();
        refocus(manageRef);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The scope could not be archived. Try again.');
    }
  };

  const updateVisual = (serviceKey: string, patch: Partial<GovernanceServiceVisual>) => {
    setVisualDraft((current) => ({
      ...current,
      [serviceKey]: { ...current[serviceKey], serviceKey, ...patch },
    }));
  };

  const saveVisualMappings = async () => {
    if (!document || !offers.data) return;
    setVisualError('');
    if (!visualReason.trim()) {
      setVisualError('The visual mapping draft could not be saved. Enter a change reason.');
      return;
    }
    const next = structuredClone(document);
    next.serviceVisuals = offers.data.map((offer) => visualDraft[offer.key] ?? {
      serviceKey: offer.key,
      assetKey: offer.visual.assetKey,
      alt: offer.visual.alt,
      caption: offer.visual.caption,
    });
    try {
      const result = await save.mutateAsync({
        countryCode: 'IN', stateCode: scope.state, districtCode: scope.district,
        mandalCode: scope.mandal, villageCode: scope.village,
        document: JSON.stringify(next), reason: visualReason.trim(),
        expectedRevision: exact ? (policy.data?.revision ?? 0) : 0,
      });
      if (!result.web.saveGovernancePolicy) {
        setVisualError('The visual mapping draft could not be saved. Reload the scope and try again.');
        return;
      }
      setVisualEditing(false);
      setVisualReason('');
    } catch (error) {
      setVisualError(error instanceof Error ? error.message : 'The visual mapping draft could not be saved. Try again.');
    }
  };

  const scopeRows = policies.data ?? [];
  // An archived scope is no longer configured: it is not counted, and New
  // scope offers to add it again.
  const live = scopeRows.filter((row) => row.status !== 'archived');
  // The page's own figures (design.md § Page head, slot 3): every configured
  // scope, whatever the filter shows; a zero figure is dropped.
  const published = live.filter((row) => row.status === 'published').length;
  const drafts = live.filter((row) => row.status === 'draft').length;
  const summary = policies.isLoading ? <Sk w="18rem" h="1rem" r="var(--radius-xs)" />
    : policies.error ? undefined
      : [plural(live.length, 'configured scope'),
        published ? `${published} published` : '', drafts ? plural(drafts, 'draft') : '']
        .filter(Boolean).join(' · ');

  // Every state draws the head (design.md § Page head), not only the loaded one.
  const head = <PageHead title="Compliance rules" />;
  const loadingHead = <PageHead title="Compliance rules" summary={<Sk w="18rem" h="1rem" r="var(--radius-xs)" />} />;
  if (portfolio.isLoading) {
    return <main className="compliance-admin">{loadingHead}<SkCompliance label="Loading your administration access" /></main>;
  }
  if (!allowed) {
    return (
      <main>
        {head}
        <Empty boxed h="24rem" icon="lock" title="Compliance administration is restricted">
          Only a super-admin can read policy drafts, provenance and publication controls.
        </Empty>
      </main>
    );
  }
  if (policy.isLoading) {
    return <main className="compliance-admin">{loadingHead}<SkCompliance label="Loading the compliance policy" /></main>;
  }
  if (policy.error) return <main>{head}<Failed what="The compliance policy" error={policy.error} boxed h="24rem" /></main>;
  if (!document || !policy.data) {
    return <main>{head}<Failed what="The compliance policy document" boxed h="24rem" /></main>;
  }

  const effective = policy.data;
  const sourceById = new Map(document.sources.map((source) => [source.id, source]));
  const visualOffers = (offers.data ?? []).filter(
    (offer) => !visualCategory || offer.group === visualCategory,
  );
  const visualCategories = [...new Set((offers.data ?? []).map((offer) => offer.group))];
  const workforce = document.workforceCompliance ?? [];
  const workforceShown = workforce.filter((rule) => !workforceCategory || rule.category === workforceCategory);

  const districtOptions = scope.state === '*' ? [] : scopeOptions(scopeRows, 'district', { state: scope.state });
  const mandalOptions = scope.district === '*' ? []
    : scopeOptions(scopeRows, 'mandal', { state: scope.state, district: scope.district });
  const villageOptions = scope.mandal === '*' ? []
    : scopeOptions(scopeRows, 'village', { state: scope.state, district: scope.district, mandal: scope.mandal });
  // The tally counts what the filter lets through: this scope and every scope under it.
  const inScope = live.filter((row) => LEVELS
    .every((level) => scope[level] === '*' || scopeOfPolicy(row)[level] === scope[level])).length;
  const configured = new Set(live.map((row) => row.scopeKey));

  const parts = scopeParts(scope);
  const here = scopeLabel(scope);

  return (
    <main className="compliance-admin">
      {/* No eyebrow: "Administration" is the rail group, not a parent
          (design.md § Page head, V2). Making a new scope is the page's
          command, so it is the head's, not the filter band's. */}
      <PageHead
        title="Compliance rules"
        pill={<Pill kind={effective.status === 'published' ? 'owned' : 'managed'}>{statusWord(effective.status)}</Pill>}
        summary={summary}
        actions={{
          secondaries: [
            {
              label: 'New scope', icon: <AddOutlined sx={{ fontSize: 16 }} />, ref: newScopeRef,
              onClick: () => setAddingScope(true),
            },
            {
              label: 'Government naming', icon: <TranslateOutlined sx={{ fontSize: 16 }} />, ref: namingRef,
              tip: `Government naming for ${here}`, expanded: namingOpen,
              onClick: () => setNamingOpen(true),
            },
          ],
        }}
      />

      <div className="compliance-band">
        <PlaceLine label="Policy scope">
          {parts.length > 1 && <span>{parts.slice(0, -1).join(' · ')}</span>}
          <strong>{parts.at(-1) ?? 'All states and union territories'}</strong>
          <span>
            {exact ? 'Own policy' : `Inherited from ${scopeLabel(scopeOfPolicy(effective))}`}
            {` · revision ${effective.revision}`}
          </span>
        </PlaceLine>
        <FacetFilter
          groups={[
            { key: 'state', label: 'State', options: scopeOptions(scopeRows, 'state', {}) },
            { key: 'district', label: 'District', options: districtOptions },
            { key: 'mandal', label: 'Mandal', options: mandalOptions },
            { key: 'village', label: 'Village', options: villageOptions },
          ]}
          selected={Object.fromEntries(LEVELS.map((level) => [level, scope[level] !== '*' ? [scope[level]] : []]))}
          onToggle={toggleScope}
          onClear={clearScope}
          tally={policies.isLoading ? undefined : plural(inScope, 'configured scope')}
          ariaLabel="Browse configured compliance policy scopes"
        />
      </div>

      {addingScope && (
        <NewScopeDialog
          configured={configured}
          onClose={() => { setAddingScope(false); refocus(newScopeRef); }}
          onCreate={(picked) => {
            setAddingScope(false);
            resetWork();
            setScope(picked);
            setPendingOverride(true);
          }}
        />
      )}

      {namingOpen && (
        <Drawer
          title="Government naming"
          sub={scopeLabel({
            state: document.jurisdiction.stateCode, district: document.jurisdiction.districtCode,
            mandal: document.jurisdiction.mandalCode ?? '*', village: document.jurisdiction.villageCode ?? '*',
          })}
          onClose={() => { setNamingOpen(false); refocus(namingRef); }}
        >
          <dl className="compliance-naming-list">
            {Object.entries(document.jurisdiction.localTerms).map(([key, value]) => (
              <div key={key}>
                <dt>{termLabel(key)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Drawer>
      )}

      <div>
        <TabStrip tabs={VIEWS} value={view} onChange={setView} label="Compliance policy views" idBase="compliance" />
        <TabPanel idBase="compliance" id={view}>
          <div aria-busy={stale} style={dim(stale)}>
          {view === 'records' && (
            <div className="compliance-checklist-grid">
              {document.propertyTypes.map((type) => (
                <Card key={type.key} title={type.label}>
                  <div className="compliance-items">
                    {type.items.map((item) => (
                      <CheckRow key={item.key} title={item.title} detail={item.why} meta={(
                        <span className="row tight">
                          <Pill kind={item.level === 'required' ? 'owned' : 'managed'}>{statusWord(item.level)}</Pill>
                          {item.sourceIds.slice(0, 2).map((id) => (
                            <span className="note" key={id}>{sourceById.get(id)?.authority ?? id}</span>
                          ))}
                        </span>
                      )} />
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {view === 'buyer' && <GuideList document={document} kind="buyer" />}
          {view === 'seller' && <GuideList document={document} kind="seller" />}

          {view === 'services' && (
            <div className="compliance-service-list">
              {document.serviceRequests.map((service) => (
                <Section key={service.key} title={service.label} lead={service.purpose}>
                  <ListColumns columns={[
                    { label: 'Share', items: service.share },
                    { label: 'Do not share', items: service.doNotShare },
                    { label: 'Controls', items: service.controls },
                  ]} />
                </Section>
              ))}
            </div>
          )}

          {view === 'visuals' && (
            <Section
              title="Service visuals"
              lead="Show the work before asking people to read it."
              className="compliance-visuals"
              aside={!visualEditing && (
                <button type="button" className="btn" disabled={stale} onClick={() => {
                  setVisualEditing(true); setVisualError('');
                }}>
                  <EditOutlined sx={{ fontSize: 16 }} /> Edit mappings
                </button>
              )}
            >
              {offers.isLoading ? <SkVisualGrid />
                : offers.error ? <Failed what="The service visual library" error={offers.error} boxed h="14rem" />
                  : (
                    <>
                      <FacetFilter
                        groups={[{
                          key: 'category', label: 'Category',
                          options: visualCategories.map((category) => ({
                            key: category, label: category,
                            count: (offers.data ?? []).filter((offer) => offer.group === category).length,
                          })),
                        }]}
                        selected={{ category: visualCategory ? [visualCategory] : [] }}
                        onToggle={(_group, category) => setVisualCategory(
                          (value) => value === category ? '' : category)}
                        onClear={() => setVisualCategory('')}
                        tally={`${visualOffers.length} of ${(offers.data ?? []).length} shown`}
                        ariaLabel="Filter service visuals"
                      />

                      <div className="compliance-visual-grid">
                        {visualOffers.map((offer) => {
                          const mapped = visualDraft[offer.key] ?? {
                            serviceKey: offer.key,
                            assetKey: offer.visual.assetKey,
                            alt: offer.visual.alt,
                            caption: offer.visual.caption,
                          };
                          const preview = {
                            ...offer.visual,
                            assetKey: mapped.assetKey,
                            src: serviceVisualSrc(mapped.assetKey),
                            alt: mapped.alt,
                            caption: mapped.caption,
                          };
                          return (
                            <article key={offer.key} className="compliance-visual-item">
                              <ServiceVisual serviceKey={offer.key} label={offer.label}
                                             visual={preview} variant="admin" />
                              <div className="compliance-visual-copy">
                                <span className="row between tight">
                                  <strong>{offer.label}</strong>
                                  <Pill kind="managed">{offer.group}</Pill>
                                </span>
                                {!visualEditing ? (
                                  <>
                                    <p>{mapped.caption}</p>
                                    <small className="note">Image description: {mapped.alt}</small>
                                    <span className="mono note">{mapped.assetKey} · {offer.visual.sourceScope}</span>
                                  </>
                                ) : (
                                  <div className="compliance-visual-fields">
                                    <div className="field">
                                      <label htmlFor={`visual-asset-${offer.key}`}>Image</label>
                                      <select id={`visual-asset-${offer.key}`} value={mapped.assetKey}
                                              onChange={(event) => updateVisual(offer.key, {
                                                assetKey: event.target.value,
                                              })}>
                                        {(offers.data ?? []).map((asset) => (
                                          <option key={asset.key} value={asset.key}>{asset.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="field">
                                      <label htmlFor={`visual-caption-${offer.key}`}>Plain-language meaning</label>
                                      <textarea id={`visual-caption-${offer.key}`} rows={2} maxLength={320}
                                                value={mapped.caption}
                                                onChange={(event) => updateVisual(offer.key, {
                                                  caption: event.target.value,
                                                })} />
                                    </div>
                                    <div className="field">
                                      <label htmlFor={`visual-alt-${offer.key}`}>Image description</label>
                                      <textarea id={`visual-alt-${offer.key}`} rows={2} maxLength={280}
                                                value={mapped.alt}
                                                onChange={(event) => updateVisual(offer.key, {
                                                  alt: event.target.value,
                                                })} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </>
                  )}

              {visualEditing && (
                <div className="compliance-visual-save">
                  <div className="field grow">
                    <label htmlFor="visual-change-reason">Change reason</label>
                    <input type="text" id="visual-change-reason" value={visualReason} maxLength={4000}
                           placeholder="Why is this mapping clearer or more accurate?"
                           onChange={(event) => setVisualReason(event.target.value)} />
                  </div>
                  <div className="row tight">
                    <button type="button" className="btn primary" disabled={busy}
                            onClick={() => void saveVisualMappings()}>
                      {save.isPending ? 'Saving…' : 'Save audited draft'}
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => {
                      setVisualEditing(false); setVisualReason(''); setVisualError('');
                    }}>Discard edits</button>
                  </div>
                  <p className="note">Publish the saved draft from Manage before owners see it.</p>
                </div>
              )}
              <FormError>{visualError}</FormError>
            </Section>
          )}

          {view === 'workforce' && (
            <Section title="Company members" lead="Who may receive company work.">
              <FacetFilter
                groups={[{
                  key: 'category', label: 'Category',
                  options: [...new Set(workforce.map((rule) => rule.category))].map((category) => ({
                    key: category,
                    label: statusWord(category),
                    count: workforce.filter((rule) => rule.category === category).length,
                  })),
                }]}
                selected={{ category: workforceCategory ? [workforceCategory] : [] }}
                onToggle={(_group, category) => setWorkforceCategory(
                  (value) => value === category ? '' : category)}
                onClear={() => setWorkforceCategory('')}
                tally={plural(workforceShown.length, 'rule')}
                ariaLabel="Filter company member rules"
              />
              <div className="compliance-items">
                {workforceShown.map((rule) => (
                  <CheckRow key={rule.key} title={rule.title} detail={rule.rule}
                            meta={<span className="note">Enforced: {rule.enforcement}</span>} />
                ))}
              </div>
            </Section>
          )}

          {view === 'sharing' && (
            <Section title={document.secureSharing.label} lead="Share the property, not the person."
                     aside={<PrivacyTipOutlined sx={{ fontSize: 24 }} aria-hidden />}>
              <ListColumns columns={[
                { label: 'Purpose-relevant', items: document.secureSharing.shareWhenNeeded },
                { label: 'Never by default', items: document.secureSharing.neverByDefault },
                { label: 'Required controls', items: document.secureSharing.controls },
              ]} />
            </Section>
          )}

          {view === 'sources' && (
            <Section title="Sources" lead={plural(document.sources.length, 'source')}>
              <div className="compliance-source-list">
                {document.sources.map((source) => (
                  <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                    <GavelOutlined sx={{ fontSize: 19 }} aria-hidden />
                    <span><strong>{source.title}</strong><small>{source.authority}</small></span>
                    <LaunchOutlined sx={{ fontSize: 16 }} aria-hidden />
                  </a>
                ))}
              </div>
            </Section>
          )}

          {view === 'manage' && (
            <Section
              title="Policy document"
              lead={<>{here} · <span className="mono">{scopeKey}</span></>}
              className="compliance-manage"
              aside={!editing && (
                <>
                  <button ref={manageRef} type="button" className="btn" disabled={stale} onClick={beginOverride}>
                    <EditOutlined sx={{ fontSize: 16 }} /> {exact ? 'Create revision' : 'Create override'}
                  </button>
                  {exact && effective.status === 'draft' && (
                    <button type="button" className="btn primary" disabled={busy}
                            onClick={() => setConfirm({ kind: 'publish', policyId: effective.id })}>
                      <PublishOutlined sx={{ fontSize: 16 }} /> Publish draft
                    </button>
                  )}
                  {/* The country fallback's published revision is the floor
                      every owner stands on; the server refuses to archive it
                      (web360.py archive_governance_policy), so it is not offered. */}
                  {exact && !(effective.stateCode === '*' && effective.status === 'published') && (
                    <button type="button" className="btn danger" disabled={busy}
                            onClick={() => setConfirm({ kind: 'archive', policyId: effective.id })}>
                      <ArchiveOutlined sx={{ fontSize: 16 }} /> {effective.status === 'draft' ? 'Archive draft' : 'Archive scope'}
                    </button>
                  )}
                </>
              )}
            >
              {editing && (
                <>
                  {/* Opening the editor is asking to write in it, so it takes focus
                      (and New scope's head button may have unmounted meanwhile). */}
                  <textarea className="input compliance-json" value={draft} spellCheck={false} autoFocus
                            aria-label="Policy JSON document" onChange={(e) => setDraft(e.target.value)} />
                  <div className="field">
                    <label htmlFor="gov-reason">Change reason</label>
                    <input type="text" id="gov-reason" value={reason} maxLength={4000}
                           onChange={(e) => setReason(e.target.value)} />
                  </div>
                  <div className="row tight">
                    <button type="button" className="btn primary" disabled={busy}
                            onClick={() => void saveDraft()}>{save.isPending ? 'Saving…' : 'Save draft'}</button>
                    <button type="button" className="btn" disabled={busy}
                            onClick={() => { setEditing(false); setManageError(''); }}>Discard edits</button>
                  </div>
                </>
              )}
              <FormError>{manageError}</FormError>

              {/* Opacity compounds, so the history dims on its own only when the panel does not. */}
              <div className="compliance-history" aria-busy={history.isPlaceholderData}
                   style={dim(history.isPlaceholderData && !stale)}>
                <h3><HistoryOutlined sx={{ fontSize: 16 }} aria-hidden /> Change history</h3>
                {/* villageCode is the only level with no levels below it — every
                    wider scope has a wildcard tail, and that's exactly when the
                    server cascades. */}
                {history.isLoading ? <SkHistory />
                  : history.error ? <Failed what="The change history" error={history.error} />
                    : (history.data?.length ?? 0) === 0 ? (
                      <Empty>
                        {scope.village === '*'
                          ? `No changes have been recorded for ${here} or any scope under it.`
                          : `No changes have been recorded for ${here}.`}
                      </Empty>
                    ) : (
                      <>
                        {scope.village === '*' && <p className="note">Includes changes to every scope under {here}.</p>}
                        {(history.data ?? []).map((event) => (
                          <div key={event.id} className="compliance-history-row">
                            <span>
                              <strong>{ACTION_WORD[event.action] ?? statusWord(event.action)}</strong>
                              <small>{event.detail}</small>
                            </span>
                            <span className="note">
                              Revision {event.revision} · {event.actor} · {ddmmyyyy(event.createdAt)}
                              {event.scopeKey !== scopeKey && <> · {scopeLabel(scopeOfKey(event.scopeKey))}</>}
                            </span>
                            <span className="mono note">{event.sourceDigest.slice(0, 10)}</span>
                          </div>
                        ))}
                      </>
                    )}
              </div>
            </Section>
          )}
          </div>
        </TabPanel>
      </div>

      {confirm?.kind === 'publish' && (
        <ConfirmDialog
          title="Publish this draft?"
          body={`Revision ${effective.revision} becomes the policy for ${here}. Owners there see it from now on.`}
          actionLabel="Publish draft"
          busyLabel="Publishing…"
          busy={publish.isPending}
          error={actionError}
          onConfirm={() => void publishDraft()}
          onClose={closeConfirm}
          extra={(
            <div className="field">
              <label htmlFor="gov-publish-reason">Publication reason (optional)</label>
              <input type="text" id="gov-publish-reason" value={actionReason} maxLength={4000}
                     onChange={(e) => setActionReason(e.target.value)} />
            </div>
          )}
        />
      )}
      {confirm?.kind === 'archive' && (
        // Archiving takes one revision out. A draft over a published revision
        // leaves that published one in effect; only a published revision
        // hands the place to the wider scope (web360.py _policy_row).
        <ConfirmDialog
          title={effective.status === 'draft' ? 'Archive this draft?' : 'Archive this scope?'}
          body={effective.status === 'draft'
            ? `Revision ${effective.revision} is archived. ${here} keeps its published policy if it has one; otherwise owners there fall back to the wider scope's policy. The change history is kept.`
            : `${here} stops having its own policy. Owners there fall back to the wider scope's policy. The change history is kept.`}
          actionLabel={effective.status === 'draft' ? 'Archive draft' : 'Archive scope'}
          busyLabel="Archiving…"
          danger
          busy={archive.isPending}
          error={actionError}
          onConfirm={() => void archivePolicy()}
          onClose={closeConfirm}
          extra={(
            <div className="field">
              <label htmlFor="gov-archive-reason">Archive reason</label>
              <input type="text" id="gov-archive-reason" value={actionReason} maxLength={4000}
                     onChange={(e) => setActionReason(e.target.value)} />
            </div>
          )}
        />
      )}

      <footer className="compliance-notice">
        <LockOutlined sx={{ fontSize: 17 }} aria-hidden />
        <span>{document.policy.legalNotice}</span>
        <span className="mono">{effective.sourceDigest.slice(0, 12)}</span>
      </footer>
    </main>
  );
}
