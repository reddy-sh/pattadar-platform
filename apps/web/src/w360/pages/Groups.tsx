/**
 * Families & Groups, drawn in the current design and mounted at /app/groups.
 *
 * What was here before: a "Not yet redrawn" card with one button reading
 * "Open Families & Groups", which was a react-router `Link` to
 * `/legacy/groups`. Clicking it performed a same-tab navigation OUT of this
 * app and into the previous one — different chrome, different nav rail,
 * different type scale — and the address bar changed to /legacy/groups. From
 * the outside that is indistinguishable from the app throwing you somewhere
 * else by mistake, and there was no way back except the browser's Back
 * button. The section is drawn here now, so the rail entry leads to the
 * feature and nothing leaves /app.
 *
 * The screen is list-over-detail on one page rather than a list route and a
 * `:id` route, because `groups` returns the whole list in one read with the
 * counts already on it — a detail route would refetch what is on screen. The
 * selected group rides in `?g=<id>` so a group is still linkable and survives
 * a reload, with `replace` on selection: which card is open is view state, and
 * pushing a history entry per click would mean Back walks through six groups
 * before it leaves the screen. Navigating away and coming back does restore
 * the selection, which is the case that matters.
 *
 * What is deliberately NOT here: the "View holdings ›" button the previous
 * screen carries. It navigates to `/app/parcels?group=<id>`, and
 * `/app/parcels` is a static `<Navigate to="/app/properties?kind=parcel">`
 * that discards the query string — so it silently lands on every parcel the
 * account owns, filtered by nothing, and says it is showing one group's land.
 * There is no group facet in the W360 property list to point it at. The Land
 * tab below answers the same question truthfully, from data it already has.
 */
import { Suspense, lazy, useCallback, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined';
import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined';
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import EmailOutlined from '@mui/icons-material/EmailOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import SmsOutlined from '@mui/icons-material/SmsOutlined';
import WhatsApp from '@mui/icons-material/WhatsApp';
import WorkOutlineOutlined from '@mui/icons-material/WorkOutlineOutlined';

import { formatArea } from '@pattadar/core';

import { fmtLocal } from '../../lib/format';
import {
  GROUP_TYPES,
  groupTypeDef,
  memberStatusChip,
  relMeta,
  verifyLink,
} from '../../pages/families/familiesData';
import type { GroupMember, MemberVars } from '../../pages/families/familiesData';
import { EMPTY_FILTER, PERSONAL_GROUP, useProperties } from '../api';
import type { RecordCard } from '../api';
import { Dialog } from '../Dialog';
import { useToast } from '../Toast';
import {
  holdingCount,
  useAssignHolding,
  useCreateGroup,
  useDeleteGroup,
  useGroupActivity,
  useGroupMembers,
  useGroups,
  useInviteMember,
  useNotifiers,
  useRemoveMember,
  useSaveMember,
  useSetMemberStatus,
  useSetNotifiers,
  useUpdateGroup,
} from '../groupsData';
import type { GroupRow } from '../groupsData';
import {
  Card, Chip, Empty, Failed, Icon, Loading, Menu, PageHead, State, ddmmyyyy, num, plural, statusWord,
} from '../ui';

/**
 * The member form, behind a lazy import.
 *
 * It is 750 lines of MUI — Autocomplete, the country-code list, the Aadhaar
 * scan-and-prefill flow — and it is reused rather than redrawn because it is
 * the one part of this feature that is genuinely intricate and already
 * correct. It is also the only MUI on this screen, and none of it is loaded
 * until somebody actually opens it: the W360 pages otherwise pull in only MUI
 * *icons*, so importing this eagerly would put the whole of MUI core in front
 * of the first paint of a screen where most visits never add a person.
 *
 * Rendered only while open, so the chunk is fetched on the click.
 */
const PersonDialog = lazy(() =>
  import('../../pages/families/PersonDialog').then((m) => ({ default: m.PersonDialog })),
);

const HEAD = {
  eyebrow: 'People',
  title: 'Families & Groups',
  // Not "which passbooks the group holds": a passbook is a container, and a
  // group can hold a flat that has no passbook at all. What a group holds is
  // land and property.
  lede:
    'Land and property held by more than one person: who is in the group, what each '
    + 'is owed, and which holdings the group keeps together.',
};

/** A glyph per group type. The type defs carry an emoji, which is the previous
 *  app's vocabulary; these screens are mono-labelled and hairline-ruled and an
 *  emoji reads as a sticker on them. */
const TYPE_ICON: Record<string, typeof GroupsOutlined> = {
  family: GroupsOutlined,
  partnership: HandshakeOutlined,
  company: ApartmentOutlined,
  huf: AccountBalanceOutlined,
  trust: GavelOutlined,
  portfolio: WorkOutlineOutlined,
};

/** What choosing each type actually commits you to. The create dialog used to
 *  offer six labels with no explanation of the difference, and the difference
 *  is not cosmetic — it decides whether members have relationships and heirs
 *  or just roles, and it cannot be changed afterwards. */
const TYPE_BLURB: Record<string, string> = {
  family: 'Relationships, heirs and inheritance shares.',
  partnership: 'Partners holding land together.',
  company: 'A company or LLP named on the title.',
  huf: 'A Karta and coparceners.',
  trust: 'Trustees and beneficiaries.',
  portfolio: 'No succession machinery — just holdings kept together.',
};

function TypeGlyph({ type, size = 20 }: { type: string; size?: number }) {
  const C = TYPE_ICON[type] ?? GroupsOutlined;
  return <C sx={{ fontSize: size }} aria-hidden />;
}

/** memberStatusChip speaks MUI's palette; `.state` speaks four words. */
const STATE_OF: Record<string, string> = {
  success: 'good',
  warning: 'warn',
  error: 'bad',
  default: 'unknown',
};

const cap = (s?: string) => {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

const KIND_WORD: Record<string, string> = {
  coowner: 'Co-owner',
  legalheir: 'Legal heir',
  nominee: 'Nominee',
};

/**
 * What a group holds, in one phrase.
 *
 * Never "N passbooks". A passbook is a container: the panel this replaced read
 * "3 passbooks · 0 Cents" for a group whose khatas were all empty, and it could
 * not mention a flat at all because built property has no passbook.
 */
function holdingWord(g: GroupRow): string {
  const n = holdingCount(g);
  if (n === 0) return 'No holdings';
  if (g.parcelCount && g.propertyCount) {
    return `${plural(g.parcelCount, 'parcel')} · ${plural(g.propertyCount, 'property', 'properties')}`;
  }
  return g.propertyCount
    ? plural(g.propertyCount, 'property', 'properties')
    : plural(g.parcelCount, 'land parcel');
}

/**
 * Who is in this group, counted the way the screen actually shows them.
 *
 * `memberCount` is `count(*) WHERE is_self = false` — deliberately "people you
 * have added", not "rows in the members table". But the `members` resolver
 * calls `ensure_self` and returns your own row with them, so a freshly created
 * group printed "0 members" on its card directly above a table with one person
 * in it. Two true numbers that contradict each other on one screen; the reader
 * has no way to know which is lying, and neither is.
 *
 * So the count is never printed bare. It says who it counts.
 */
const peopleWord = (others: number) =>
  others === 0 ? 'Just you' : `You and ${plural(others, 'other')}`;

/** Rows the Members table will have: your self row plus everyone added. Exact,
 *  not an estimate — `members` seats the self node on every read. */
const rowCount = (others: number) => others + 1;

// ── The screen ─────────────────────────────────────────────────────────

export function Groups() {
  const [params, setParams] = useSearchParams();
  const groups = useGroups();
  const [creating, setCreating] = useState(false);

  const list = groups.data ?? [];
  const wanted = params.get('g') || '';
  // Falls back to the first group, which is also what makes this self-healing
  // after a delete: the id in the URL stops matching and the screen moves to
  // whatever is left rather than showing an empty detail panel.
  const selected = useMemo(
    () => list.find((g) => g.id === wanted) ?? list[0],
    [list, wanted],
  );

  const select = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params);
      next.set('g', id);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const clearSelection = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete('g');
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <main>
      <PageHead
        eyebrow={HEAD.eyebrow}
        title={HEAD.title}
        actions={
          list.length > 0 ? (
            <button type="button" className="btn primary" onClick={() => setCreating(true)}>
              <AddOutlined sx={{ fontSize: 16 }} /> New group
            </button>
          ) : undefined
        }
      >
        <p className="lede" style={{ marginTop: '0.375rem', maxWidth: '46rem' }}>{HEAD.lede}</p>
      </PageHead>

      {groups.isPending && <Loading h="60vh" what="your families and groups" />}

      {/* A failed read is not an empty account. Before this, both painted the
          same thing — the previous screen swallowed the error and rendered an
          empty sample set with a chip on it. */}
      {groups.isError && !groups.data && (
        <Failed
          what="Families & Groups"
          error={groups.error}
          onRetry={() => groups.refetch()}
          boxed
          h="26rem"
        />
      )}

      {groups.data && list.length === 0 && (
        <Empty
          boxed
          h="24rem"
          icon="person"
          title="You have no groups yet"
          action={
            <button type="button" className="btn primary" onClick={() => setCreating(true)}>
              <AddOutlined sx={{ fontSize: 16 }} /> Create your first group
            </button>
          }
        >
          A group is how land is held by more than one person — a family, a partnership, a
          company, an HUF, a trust, or a plain portfolio to keep holdings together. Members,
          what each is owed, and the passbooks the group holds all live inside it.
        </Empty>
      )}

      {list.length > 0 && (
        <>
          {/* The list refreshed and failed while a good copy was on screen.
              The cards below are still true, so they stay. */}
          {groups.isRefetchError && (
            <p
              className="note"
              role="status"
              style={{ color: 'var(--w-danger)', marginBottom: 'var(--space-md)' }}
            >
              The list could not refresh just now. What is shown was correct as of the last
              successful read.
            </p>
          )}

          <div className="cards" style={{ marginBottom: 'var(--space-lg)' }}>
            {list.map((g) => {
              const def = groupTypeDef(g.type);
              const on = g.id === selected?.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  className={on ? 'rec selected' : 'rec'}
                  aria-pressed={on}
                  onClick={() => select(g.id)}
                  style={{
                    padding: 0, width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                  }}
                >
                  <span className="meat" style={{ display: 'grid', gap: '0.375rem' }}>
                    <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                      <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
                        <TypeGlyph type={g.type} size={18} />
                      </span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <strong
                          style={{
                            display: 'block', fontSize: '0.9375rem',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          {g.name}
                        </strong>
                        <span className="note" style={{ display: 'block' }}>{def.label}</span>
                      </span>
                    </span>
                    <span className="note" style={{ display: 'block' }}>
                      {peopleWord(g.memberCount)} · {holdingWord(g)}
                      {g.totalExtent > 0 ? ` · ${formatArea(g.totalExtent)}` : ''}
                    </span>
                    <span className="note" style={{ display: 'block' }}>
                      Your role: {g.myRole || def.primaryRole}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* `key` resets the tab, the open dialog and every draft inside the
              panel when the selected group changes. Without it, switching from
              a family to a company kept the Members tab's edit dialog open
              over a different group's member. */}
          {selected && (
            <GroupDetail key={selected.id} group={selected} onDeleted={clearSelection} />
          )}
        </>
      )}

      {creating && (
        <GroupFormDialog onClose={() => setCreating(false)} onCreated={select} />
      )}
    </main>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────

const SAFEGUARD_STAGE: Record<string, string> = {
  active: 'Active',
  reminder_1: 'First reminder sent',
  reminder_2: 'Second reminder sent',
  final_reminder: 'Final reminder sent',
  family_selected: 'Notifying selected family',
  family_all: 'Family email complete',
  family_exhausted: 'Notifier order complete',
  delivery_attention: 'Delivery needs review',
  closed_head: 'Confirmed by the head',
  closed_family: 'Acknowledged by family',
};

type TabId = 'members' | 'holdings' | 'activity';

function GroupDetail({ group, onDeleted }: { group: GroupRow; onDeleted: () => void }) {
  const def = groupTypeDef(group.type);
  const [tab, setTab] = useState<TabId>('members');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifiers, setNotifiers] = useState(false);

  const tabs: { id: TabId; label: string; n?: number }[] = [
    // `rowCount`, not `memberCount`: a badge beside a tab is a promise about
    // how many rows are behind it, and the table includes your own row.
    { id: 'members', label: 'Members', n: rowCount(group.memberCount) },
    // Holdings, not passbooks — the badge has to match the number of rows in
    // the panel, and the panel lists parcels and properties.
    { id: 'holdings', label: 'Holdings', n: holdingCount(group) },
    { id: 'activity', label: 'Activity' },
  ];

  const actions = [
    {
      label: 'Edit name and description',
      icon: <EditOutlined sx={{ fontSize: 16 }} />,
      onClick: () => setEditing(true),
    },
    {
      label: 'Delete this group',
      icon: <DeleteOutlineOutlined sx={{ fontSize: 16 }} />,
      danger: true,
      rule: true,
      onClick: () => setDeleting(true),
    },
  ];

  return (
    <Card>
      <div
        className="row between"
        style={{ flexWrap: 'nowrap', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}
      >
        <div className="row tight" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
          <span className="avatarlg"><TypeGlyph type={group.type} size={22} /></span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>{group.name}</h2>
            <p className="note" style={{ margin: '0.125rem 0 0' }}>
              {def.label} · Head: {group.headName || 'You'} · Your role: {group.myRole || def.primaryRole} ·{' '}
              {peopleWord(group.memberCount)} · {holdingWord(group)}
              {group.totalExtent > 0 ? ` · ${formatArea(group.totalExtent)}` : ''}
              {def.hasTree && group.lastActiveAt ? ` · Last active ${ddmmyyyy(group.lastActiveAt)}` : ''}
            </p>
            {group.description && (
              <p className="note" style={{ margin: '0.375rem 0 0', maxWidth: '44rem' }}>
                {group.description}
              </p>
            )}
          </div>
        </div>
        <div className="row tight" style={{ flexWrap: 'nowrap' }}>
          {/* The high-level way out of this screen and into the real one. The
              group facet means this is a filter on /app/properties, not a
              reduced copy of it — so filtering, sorting, search, the map, tags
              and bulk ordering are all still there. */}
          {holdingCount(group) > 0 && (
            <Link className="btn" to={`/app/properties?group=${group.id}`}>
              See its {plural(holdingCount(group), 'holding')}
            </Link>
          )}
          <Menu label={`Actions for ${group.name}`} header={group.name} items={actions} />
        </div>
      </div>

      {/* `accent`, not `alert`: `.card.alert` is the danger wash, and this is a
          standing explanation of how the safeguard works, not a problem with
          this group. Painted red it read as something being wrong. */}
      {def.hasTree && (
        <div
          className="card accent"
          style={{ marginBottom: 'var(--space-md)', display: 'grid', gap: 'var(--space-sm)' }}
        >
          <div className="row tight" style={{ flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.875rem' }}>Inactivity safeguard</strong>
            <Chip tone={group.inactivityStage === 'active' ? undefined : 'alert'}>
              {SAFEGUARD_STAGE[group.inactivityStage] || 'Monitoring'}
            </Chip>
          </div>
          <p className="note" style={{ margin: 0, maxWidth: '46rem' }}>
            After six months without activity, the head is reminded on days 1, 7 and 15.
            If the final reminder is unanswered, verified family emails are contacted together,
            or one at a time when you set an order. Alerts never transfer account or property control.
          </p>
          {group.inactivityNextAt && (
            <p className="note" style={{ margin: 0 }}>
              Next check: {ddmmyyyy(group.inactivityNextAt)}
              {group.inactivityLastOutcome ? ` · Last outcome: ${group.inactivityLastOutcome.replaceAll('_', ' ')}` : ''}
            </p>
          )}
          {group.inactivityStage === 'delivery_attention' && (
            <p className="note accent" style={{ margin: 0 }}>
              A provider outcome could not be confirmed. Pattadar will not resend automatically;
              contact support before any new attempt.
            </p>
          )}
          {group.inactiveContactGaps > 0 && (
            <p className="note accent" style={{ margin: 0 }}>
              {plural(group.inactiveContactGaps, 'member needs', 'members need')} a verified email before everyone can be contacted.
            </p>
          )}
          <button
            type="button"
            className="btn sm"
            style={{ justifySelf: 'start' }}
            onClick={() => setNotifiers(true)}
          >
            Configure notifiers
          </button>
        </div>
      )}

      <TabStrip tabs={tabs} value={tab} onChange={setTab} label={`${group.name} detail`} idBase={group.id} />

      <div
        role="tabpanel"
        id={`${group.id}-panel-${tab}`}
        aria-labelledby={`${group.id}-tab-${tab}`}
      >
        {tab === 'members' && <MembersTab group={group} />}
        {tab === 'holdings' && <HoldingsTab group={group} />}
        {tab === 'activity' && <ActivityTab group={group} />}
      </div>

      {editing && <GroupFormDialog group={group} onClose={() => setEditing(false)} />}
      {deleting && (
        <DeleteGroupDialog
          group={group}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      )}
      {notifiers && <NotifierDialog group={group} onClose={() => setNotifiers(false)} />}
    </Card>
  );
}

/**
 * A real tab list: `aria-selected`, one tab stop for the whole strip, and
 * Arrow/Home/End moving between them. The stylesheet already keys on
 * `[aria-selected='true']`, which is only a valid attribute inside
 * `role="tablist"` — so declaring the role means also honouring the keyboard
 * contract that comes with it, rather than borrowing the styling and leaving a
 * keyboard user to Tab through every tab to reach the panel.
 */
function TabStrip<T extends string>({
  tabs, value, onChange, label, idBase,
}: {
  tabs: { id: T; label: string; n?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  idBase: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = tabs.findIndex((t) => t.id === value);
    let to = -1;
    if (e.key === 'ArrowRight') to = (at + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') to = (at - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = tabs.length - 1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    refs.current[tabs[to].id]?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${idBase}-tab-${t.id}`}
          aria-controls={`${idBase}-panel-${t.id}`}
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          ref={(el) => { refs.current[t.id] = el; }}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.n !== undefined && <span className="n">{num(t.n)}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Members ────────────────────────────────────────────────────────────

interface InviteInfo {
  name: string;
  link: string;
  to: string;
}

function MembersTab({ group }: { group: GroupRow }) {
  const q = useGroupMembers(group.id);
  const save = useSaveMember();
  const remove = useRemoveMember();
  const invite = useInviteMember();
  const setStatus = useSetMemberStatus();
  const toast = useToast();

  const [form, setForm] = useState<{ editing: GroupMember | null } | null>(null);
  const [removing, setRemoving] = useState<GroupMember | null>(null);
  const [invited, setInvited] = useState<InviteInfo | null>(null);

  const hasTree = groupTypeDef(group.type).hasTree;
  const members = q.data?.members ?? [];
  // Your own row is always among them — `members` seats it on every read — so
  // "how many people are in this group besides me" is a filter, not a count.
  const others = members.filter((m) => !m.isSelf).length;
  const heirs = members.filter((m) => m.isBeneficiary);
  const allocated = heirs.reduce((s, m) => s + (Number(m.sharePct) || 0), 0);
  const pending = heirs.filter((m) => m.status === 'pending').length;

  /** PersonDialog owns its own saving state and prints a rejected submit at
   *  the top of its form, so this must THROW rather than swallow — and must
   *  not close the dialog on failure, which would discard a filled-in form. */
  const submit = useCallback(
    async (vars: MemberVars) => {
      const wasEditing = form?.editing ?? null;
      const saved = await save.mutateAsync({
        groupId: group.id,
        memberId: wasEditing?.id ?? null,
        vars,
      });
      setForm(null);
      toast.ok(wasEditing ? `${vars.name || 'That person'} saved` : `${vars.name || 'Person'} added`);
      // A new heir gets a verification link the moment they become one. An
      // existing member who was already an heir does not — they have one.
      if (saved && vars.isBeneficiary && !wasEditing?.isBeneficiary && saved.inviteToken) {
        setInvited({
          name: vars.name,
          link: verifyLink(saved.inviteToken),
          to: saved.isMinor
            ? saved.guardianContact || saved.email || saved.phone
            : saved.email || saved.phone,
        });
      }
    },
    [form, group.id, save, toast],
  );

  const notify = useCallback(
    (msg: string, severity: 'success' | 'error' | 'warning' | 'info' = 'success') => {
      if (severity === 'error' || severity === 'warning') toast.bad(msg);
      else toast.ok(msg);
    },
    [toast],
  );

  const doInvite = async (m: GroupMember) => {
    const to = (m.email || m.phone || '').trim();
    if (!to) {
      toast.bad('Add a mobile number or an email address first, then invite.');
      return;
    }
    try {
      await invite.mutateAsync({ id: m.id });
      toast.ok(`Invitation sent to ${to}`);
    } catch {
      /* the write raised it */
    }
  };

  const doRevoke = async (m: GroupMember) => {
    try {
      await setStatus.mutateAsync({ id: m.id, status: 'revoked' });
      toast.ok(`${m.name || 'That person'}'s access is revoked`);
    } catch {
      /* the write raised it */
    }
  };

  const doRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync({ id: removing.id });
      toast.ok(`${removing.name || 'That person'} removed`);
      setRemoving(null);
    } catch {
      // Left open on purpose: the dialog is the only thing on screen naming
      // who this was about, and the toast explaining the refusal is beside it.
    }
  };

  const rowActions = (m: GroupMember) => {
    const alreadyInvited = m.inviteStatus === 'invited' || (m.status === 'pending' && !!m.inviteToken);
    const acts: {
      label: string; onClick: () => void; danger?: boolean; rule?: boolean;
    }[] = [{ label: 'Edit', onClick: () => setForm({ editing: m }) }];
    if (m.isBeneficiary && m.status !== 'verified') {
      acts.push({
        label: alreadyInvited ? 'Send a reminder' : 'Send the invite',
        onClick: () => void doInvite(m),
      });
    }
    if (m.status === 'pending' && m.inviteToken) {
      acts.push({
        label: 'Copy the invite link',
        onClick: () => setInvited({
          name: m.name,
          link: verifyLink(m.inviteToken),
          to: m.isMinor ? m.guardianContact || m.email || m.phone : m.email || m.phone,
        }),
      });
    }
    if (m.status && m.status !== 'revoked') {
      acts.push({ label: 'Revoke access', onClick: () => void doRevoke(m) });
    }
    acts.push({
      label: 'Remove from this group', danger: true, rule: true, onClick: () => setRemoving(m),
    });
    return acts;
  };

  if (q.isPending) return <Loading h="16rem" what="the people in this group" />;
  if (q.isError && !q.data) {
    return (
      <Failed what="This group's members" error={q.error} onRetry={() => q.refetch()} h="16rem" />
    );
  }

  return (
    <>
      <div
        className="row between"
        style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}
      >
        <p className="note" style={{ margin: 0 }}>
          {others === 0
            ? 'Only you so far. Add the people who hold this land with you.'
            : heirs.length === 0
              ? `${peopleWord(others)} · nobody is down for a share yet.`
              : <>
                {plural(heirs.length, 'heir')} ·{' '}
                <strong style={allocated > 100 ? { color: 'var(--w-danger)' } : undefined}>
                  {num(allocated)}% allocated
                </strong>
                {/* Over 100% is arithmetic nobody can honour, and the server
                    does not refuse it — so at least say so where the shares
                    are being typed. */}
                {allocated > 100 && ' — that is more than the whole'}
                {pending > 0 && ` · ${num(pending)} still to verify`}
              </>}
        </p>
        <button
          type="button"
          className="btn primary"
          onClick={() => setForm({ editing: null })}
        >
          <PersonAddAltOutlined sx={{ fontSize: 16 }} /> Add a person
        </button>
      </div>

      {/* Genuinely zero rows means the server returned nothing for this group,
          which it does when the group is not the caller's — not the same as "a
          new group with only you in it", where your own row is real content
          and shows the role you hold. */}
      {members.length === 0 ? (
        <Empty icon="person" title="No one is listed for this group">
          Nothing came back for this group. Reload the page; if it stays empty, the group may
          no longer be yours.
        </Empty>
      ) : (
        <div className="scroll-x">
          <table style={{ minWidth: '54rem' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>{hasTree ? 'Relationship' : 'Role'}</th>
                <th>Contact</th>
                <th>Born</th>
                <th className="right" style={{ textAlign: 'right' }}>Share</th>
                <th>Held as</th>
                <th>Aadhaar</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const st = memberStatusChip(m);
                const parcel = q.data?.parcels.find((p) => p.id === m.parcelId);
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                        <span
                          className="avatarlg"
                          style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.6875rem' }}
                        >
                          {(m.name || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ display: 'block' }}>{m.name || '—'}</strong>
                          {(m.isSelf || m.isBeneficiary || m.isMinor) && (
                            <span className="row tight" style={{ marginTop: '0.125rem' }}>
                              {m.isSelf && <Chip>You</Chip>}
                              {m.isBeneficiary && <Chip>heir</Chip>}
                              {m.isMinor && <Chip>minor</Chip>}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td>{hasTree ? relMeta(m.relation).label : m.role || '—'}</td>
                    <td>
                      {m.phone || m.email ? (
                        <>
                          {m.phone && (
                            <span className="mono" style={{ display: 'block', whiteSpace: 'nowrap' }}>
                              {m.phone}{m.phoneVerified && <span className="up" title="Verified"> ✓</span>}
                            </span>
                          )}
                          {m.email && (
                            <span className="note" style={{ display: 'block' }}>
                              {m.email}{m.emailVerified && <span className="up" title="Verified"> ✓</span>}
                            </span>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {m.dob ? fmtLocal(m.dob, { dateOnly: true }) : '—'}
                      {m.gender && (
                        <span className="note" style={{ display: 'block' }}>{cap(m.gender)}</span>
                      )}
                    </td>
                    <td className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {m.isBeneficiary ? (
                        <>
                          {num(Number(m.sharePct) || 0)}%
                          <span className="note" style={{ display: 'block' }}>
                            {parcel ? parcel.surveyNo : 'whole estate'}
                          </span>
                        </>
                      ) : '—'}
                    </td>
                    <td>
                      {m.isBeneficiary ? (KIND_WORD[m.kind] ?? (cap(m.kind) || '—')) : '—'}
                    </td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>{m.aadhaarMasked || '—'}</td>
                    <td>
                      {st.label === '—'
                        ? '—'
                        : <State state={STATE_OF[st.color] ?? 'unknown'}>{st.label}</State>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Menu
                        label={`Actions for ${m.name || 'this person'}`}
                        header={m.name || undefined}
                        items={rowActions(m)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Suspense fallback={null}>
          <PersonDialog
            open
            editing={form.editing}
            people={members}
            parcels={q.data?.parcels ?? []}
            myAddress={q.data?.myAddress ?? ''}
            groupType={group.type}
            onCancel={() => setForm(null)}
            onSubmit={submit}
            notify={notify}
          />
        </Suspense>
      )}

      {removing && (
        <Dialog
          title={`Remove ${removing.name || 'this person'}?`}
          busy={remove.isPending}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button
                type="button"
                className="btn"
                disabled={remove.isPending}
                onClick={() => setRemoving(null)}
              >
                Keep them
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={remove.isPending}
                onClick={() => void doRemove()}
              >
                {remove.isPending ? 'Removing…' : 'Remove'}
              </button>
            </>
          }
        >
          <p className="note" style={{ marginTop: 0 }}>
            This takes {removing.name || 'this person'} out of {group.name} — their
            relationship, share and verification status go with them. No land is deleted.
          </p>
        </Dialog>
      )}

      {invited && <InviteDialog invite={invited} onClose={() => setInvited(null)} />}
    </>
  );
}

// ── Holdings ───────────────────────────────────────────────────────────

/**
 * What the group holds — read through the Properties screen's own query.
 *
 * `useProperties({ groups: [id] })` is the exact call `/app/properties` makes,
 * with one facet pre-ticked. That matters twice over. It cannot disagree with
 * the Properties screen about what a group holds, because it is the same
 * answer; and everything a holding needs to describe itself — kind, place,
 * extent in its own unit, its cover photo — arrives already shaped.
 *
 * This panel stays deliberately high-level: a headline, the holdings in one
 * line each, and a way in and out of the group. Anyone who wants to filter,
 * sort, search, map, tag or bulk-order goes to the real screen through the link
 * at the top, which arrives with the group already applied. Rebuilding a
 * thinner version of that here is how the old Land tab ended up listing
 * passbooks with blank khatas and an extent of zero.
 */
function HoldingsTab({ group }: { group: GroupRow }) {
  const mine = useProperties({ ...EMPTY_FILTER, groups: [group.id] });
  const assign = useAssignHolding();
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  const held = mine.data?.cards ?? [];
  const acres = held.filter((c) => c.extentUnit === 'ac')
    .reduce((s, c) => s + (Number(c.extent) || 0), 0);
  const parcels = held.filter((c) => c.kind === 'parcel').length;
  const built = held.length - parcels;

  const move = async (card: RecordCard, groupId: string, word: string) => {
    try {
      await assign.mutateAsync({
        kind: card.kind === 'property' ? 'property' : 'parcel',
        passbookId: card.passbookId,
        recordId: card.id,
        groupId,
      });
      toast.ok(word);
    } catch {
      /* the write raised it */
    }
  };

  if (mine.isPending && !mine.data) return <Loading h="16rem" what="what this group holds" />;
  if (mine.isError && !mine.data) {
    return (
      <Failed
        what="This group's holdings"
        error={mine.error}
        onRetry={() => mine.refetch()}
        h="16rem"
      />
    );
  }

  return (
    <>
      <div
        className="row between"
        style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}
      >
        <p className="note" style={{ margin: 0, maxWidth: '34rem' }}>
          {held.length === 0
            ? `${group.name} holds nothing yet.`
            : [
              `${group.name} holds ${plural(held.length, 'holding')}`,
              parcels > 0 && built > 0 ? `${plural(parcels, 'land parcel')} and ${plural(built, 'property', 'properties')}` : '',
              acres > 0 ? formatArea(acres) : '',
            ].filter(Boolean).join(' · ')}
        </p>
        {held.length > 0 && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <AddOutlined sx={{ fontSize: 16 }} /> Add a holding
          </button>
        )}
      </div>

      {held.length === 0 ? (
        <Empty
          icon="agri"
          title="Nothing is held by this group yet"
          action={
            <button type="button" className="btn primary" onClick={() => setAdding(true)}>
              <AddOutlined sx={{ fontSize: 16 }} /> Add a holding
            </button>
          }
        >
          Land and property you own can be held by {group.name} instead of in your own name.
          Moving it here changes who holds it, never what it is — and it can be moved back.
        </Empty>
      ) : (
        <div className="rows boxed">
          {held.map((c) => (
            <div key={c.id}>
              <span className="muted" style={{ display: 'flex', color: 'var(--w-info)' }}>
                <Icon name={c.kind === 'parcel' ? 'agri' : c.classification} size={18} />
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <Link
                  to={`/app/records/${c.id}`}
                  style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: 'inherit' }}
                >
                  {c.title}
                </Link>
                <span className="note" style={{ display: 'block' }}>
                  {[c.kind === 'parcel' ? 'Land parcel' : statusWord(c.classification),
                    c.placeLine,
                    c.khataNo ? `Khata ${c.khataNo}` : ''].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="num" style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                {c.extentUnit === 'ac'
                  ? formatArea(Number(c.extent) || 0)
                  : `${num(Number(c.extent) || 0)} ${c.extentUnit}`}
              </span>
              {/* No "Open this record" item here: the title beside it is
                  already a router Link, and a menu entry would have had to be
                  either a full page reload or a second way to do the same
                  thing. */}
              <Menu
                label={`Actions for ${c.title}`}
                header={c.title}
                items={[{
                  label: c.kind === 'parcel' && c.passbookId
                    ? 'Take its khata out of this group'
                    : 'Take out of this group',
                  danger: true,
                  onClick: () => void move(c, '', 'Held in your own name again'),
                }]}
              />
            </div>
          ))}
        </div>
      )}

      {held.length > 0 && (
        <p className="note" style={{ marginTop: 'var(--space-md)' }}>
          A holding in a group still belongs to you. Taking it out puts it back in your own
          name and never deletes anything.
        </p>
      )}

      {adding && (
        <AddHoldingDialog
          group={group}
          busy={assign.isPending}
          onClose={() => setAdding(false)}
          onPick={async (card) => {
            await move(card, group.id, `${card.title} is now held by ${group.name}`);
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

/**
 * Pick something held in your own name and move it in.
 *
 * The list is `groups: ['personal']` — the same facet, asked the other way
 * round — so it is exactly what the Properties screen shows under "In your own
 * name" and nothing has to be excluded by hand.
 *
 * A parcel names its khata out loud. Agricultural land has no group of its own:
 * `assignLandToGroup` moves the PASSBOOK, so every parcel on that khata comes
 * along. Somebody choosing one survey number out of four is entitled to know
 * that before they click, not after.
 */
function AddHoldingDialog({
  group, busy, onClose, onPick,
}: {
  group: GroupRow;
  busy: boolean;
  onClose: () => void;
  onPick: (card: RecordCard) => void | Promise<void>;
}) {
  const free = useProperties({ ...EMPTY_FILTER, groups: [PERSONAL_GROUP] });
  const cards = free.data?.cards ?? [];

  /** How many other parcels ride along on the same khata. */
  const alsoOnKhata = (c: RecordCard) =>
    c.kind === 'parcel' && c.passbookId
      ? cards.filter((o) => o.kind === 'parcel' && o.passbookId === c.passbookId && o.id !== c.id).length
      : 0;

  return (
    <Dialog
      title={`Add a holding to ${group.name}`}
      onClose={onClose}
      busy={busy}
      wide
      footer={<button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>}
    >
      {free.isPending && !free.data && <Loading h="10rem" what="what you hold in your own name" />}
      {free.isError && !free.data && (
        <Failed what="Your holdings" error={free.error} onRetry={() => free.refetch()} h="10rem" />
      )}
      {free.data && cards.length === 0 && (
        <Empty icon="agri" title="Nothing is in your own name">
          Everything you own is already held by a group. Take something out of its group first,
          or add a new record from Properties.
        </Empty>
      )}
      {cards.length > 0 && (
        <>
          <p className="note" style={{ marginTop: 0, maxWidth: '38rem' }}>
            These are held in your own name. Choose one to move it into {group.name}.
          </p>
          <div className="rows boxed" style={{ marginTop: 'var(--space-sm)' }}>
            {cards.map((c) => {
              const along = alsoOnKhata(c);
              return (
                <div key={c.id}>
                  <span className="muted" style={{ display: 'flex', color: 'var(--w-info)' }}>
                    <Icon name={c.kind === 'parcel' ? 'agri' : c.classification} size={18} />
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem' }}>
                      {c.title}
                    </span>
                    <span className="note" style={{ display: 'block' }}>
                      {[c.kind === 'parcel' ? 'Land parcel' : statusWord(c.classification),
                        c.placeLine,
                        c.khataNo ? `Khata ${c.khataNo}` : ''].filter(Boolean).join(' · ')}
                    </span>
                    {along > 0 && (
                      <span className="note accent" style={{ display: 'block' }}>
                        Moves the whole khata — {plural(along, 'other parcel')} on it{' '}
                        {along === 1 ? 'comes' : 'come'} too.
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={busy}
                    onClick={() => void onPick(c)}
                  >
                    Move in
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Dialog>
  );
}

// ── Activity ───────────────────────────────────────────────────────────

function ActivityTab({ group }: { group: GroupRow }) {
  const q = useGroupActivity(group.id);
  const events = q.data ?? [];

  if (q.isPending) return <Loading h="12rem" what="this group's history" />;
  if (q.isError && !q.data) {
    return <Failed what="This group's history" error={q.error} onRetry={() => q.refetch()} h="12rem" />;
  }
  if (events.length === 0) {
    return (
      <Empty icon="clock" title="Nothing has happened yet">
        Changes to this group, its members and its passbooks are listed here as they happen.
      </Empty>
    );
  }

  return (
    <div className="scroll-x">
      <table style={{ minWidth: '34rem' }}>
        <thead>
          <tr>
            <th>What</th>
            <th>Detail</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{cap(e.action.replace(/_/g, ' '))}</td>
              <td>{e.details || '—'}</td>
              <td className="note" style={{ whiteSpace: 'nowrap' }}>
                {e.timestamp ? fmtLocal(e.timestamp) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Create / edit a group ──────────────────────────────────────────────

function GroupFormDialog({
  group, onClose, onCreated,
}: {
  group?: GroupRow;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const create = useCreateGroup();
  const update = useUpdateGroup();
  const toast = useToast();
  const editing = !!group;

  const [type, setType] = useState(group?.type ?? 'family');
  const [name, setName] = useState(group?.name ?? '');
  const [desc, setDesc] = useState(group?.description ?? '');
  const [err, setErr] = useState('');

  const busy = create.isPending || update.isPending;
  const formId = editing ? 'group-edit' : 'group-new';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr('Give the group a name.');
      return;
    }
    setErr('');
    try {
      if (group) {
        await update.mutateAsync({ id: group.id, name: name.trim(), description: desc.trim() });
        toast.ok('Saved');
      } else {
        const id = await create.mutateAsync({ type, name: name.trim(), description: desc.trim() });
        // createGroup returns '' when the payload had no id on it. Reporting
        // success here and then selecting nothing is how a create that did not
        // happen looks like one that did.
        if (!id) {
          setErr('The server did not say which group it created. Reload and check before trying again.');
          return;
        }
        toast.ok(`${name.trim()} created`);
        onCreated?.(id);
      }
      onClose();
    } catch {
      // The write raised the toast. The dialog stays open with the typed work
      // in it, which is the whole reason this catch is not a rethrow.
    }
  };

  return (
    <Dialog
      title={editing ? `Edit ${group.name}` : 'New group'}
      onClose={onClose}
      busy={busy}
      // Holding typed work: only Cancel and Escape close it, never a stray
      // click on the scrim.
      dismissable={false}
      initialFocus="#group-name"
      footer={
        <>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" form={formId} className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Create group'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 'var(--space-md)' }}>
        {err && (
          <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
        )}

        {editing ? (
          /* update_group takes only name and description — the resolver has no
             `type` argument at all. A select here would look editable, save
             without complaint and leave the type exactly as it was. */
          <div className="field">
            <label>Type</label>
            <p className="note" style={{ margin: 0 }}>
              {groupTypeDef(group.type).label} — fixed once the group exists, because the
              members inside it are described in its terms. Create a new group to hold this
              land differently.
            </p>
          </div>
        ) : (
          <div className="field">
            <label>What kind of group</label>
            <div className="choice">
              {GROUP_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  aria-pressed={type === t.type}
                  onClick={() => setType(t.type)}
                >
                  {t.label}
                  <small>{TYPE_BLURB[t.type] ?? ''}</small>
                </button>
              ))}
            </div>
            <span className="note">This cannot be changed later.</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="group-name">Name</label>
          <input
            id="group-name"
            type="text"
            value={name}
            maxLength={160}
            placeholder="Telukutla Family / Reddy &amp; Sons"
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) setErr('');
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="group-desc">Description</label>
          <textarea
            id="group-desc"
            rows={3}
            value={desc}
            maxLength={2000}
            onChange={(e) => setDesc(e.target.value)}
          />
          <span className="note">Optional — what this group is for.</span>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteGroupDialog({
  group, onClose, onDeleted,
}: {
  group: GroupRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const del = useDeleteGroup();
  const toast = useToast();

  const run = async () => {
    try {
      await del.mutateAsync({ id: group.id });
      toast.ok(`${group.name} deleted`);
      onDeleted();
      onClose();
    } catch {
      /* the write raised it; the dialog stays so the name is still on screen */
    }
  };

  return (
    <Dialog
      title={`Delete ${group.name}?`}
      onClose={onClose}
      busy={del.isPending}
      footer={
        <>
          <button type="button" className="btn" disabled={del.isPending} onClick={onClose}>
            Keep it
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={del.isPending}
            onClick={() => void run()}
          >
            {del.isPending ? 'Deleting…' : 'Delete this group'}
          </button>
        </>
      }
    >
      <p className="note" style={{ marginTop: 0, maxWidth: '32rem' }}>
        This removes the group and everyone listed in it —{' '}
        {peopleWord(group.memberCount).toLowerCase()} — along with their relationships, shares
        and verification status. It cannot be undone.
      </p>
      <p className="note" style={{ maxWidth: '32rem' }}>
        <strong>Nothing you own is deleted.</strong> The{' '}
        {plural(holdingCount(group), 'holding')} this group holds{' '}
        {holdingCount(group) === 1 ? 'goes' : 'go'} back into your own name and{' '}
        {holdingCount(group) === 1 ? 'stays' : 'stay'} in your portfolio.
      </p>
    </Dialog>
  );
}

// ── Notifier priority ──────────────────────────────────────────────────

function NotifierDialog({ group, onClose }: { group: GroupRow; onClose: () => void }) {
  const q = useNotifiers(group.id, true);
  const save = useSetNotifiers();
  const toast = useToast();

  type Pick = { id: string; name: string; relation: string; email: string };
  const [order, setOrder] = useState<Pick[] | null>(null);
  const [mode, setMode] = useState<'all' | 'selected' | null>(null);
  const loaded = q.data;
  const configured = loaded?.notifiers.some((n) => n.priority > 0) ?? false;
  const currentMode = mode ?? (configured ? 'selected' : 'all');
  const current = useMemo(() => {
    if (order) return order;
    if (!loaded || !configured) return [];
    return loaded.notifiers
      .filter((n) => n.eligible)
      .map((n) => ({ id: n.memberId, name: n.name, relation: n.relation, email: n.contact }));
  }, [configured, loaded, order]);

  const eligible = (loaded?.members ?? [])
    .filter((m) => !m.isSelf && !m.isMinor && m.emailVerified && m.inactivityEmailConsent && !!m.email)
    .map((m) => ({ id: m.id, name: m.name, relation: m.relation || m.role, email: m.email }));
  const unready = (loaded?.members ?? [])
    .filter((m) => !m.isSelf && !m.isMinor
      && (!m.emailVerified || !m.inactivityEmailConsent || !m.email));
  const outside = eligible.filter((m) => !current.some((o) => o.id === m.id));

  const move = (at: number, by: number) => {
    const to = at + by;
    if (to < 0 || to >= current.length) return;
    const next = [...current];
    [next[at], next[to]] = [next[to], next[at]];
    setOrder(next);
  };

  const persist = async () => {
    const ids = currentMode === 'all' ? [] : current.map((o) => o.id);
    try {
      await save.mutateAsync({ groupId: group.id, memberIds: ids });
      toast.ok(currentMode === 'all' ? 'All verified family emails will be contacted together' : 'Notifier order saved');
      onClose();
    } catch {
      /* the write raised it */
    }
  };

  return (
    <Dialog
      title="Family notification settings"
      onClose={onClose}
      busy={save.isPending}
      wide
      footer={
        <>
          <button type="button" className="btn" disabled={save.isPending} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={save.isPending || !loaded || q.isError || (currentMode === 'selected' && current.length === 0)}
            onClick={() => void persist()}
          >
            {save.isPending ? 'Saving…' : 'Save notification settings'}
          </button>
        </>
      }
    >
      <p className="note" style={{ marginTop: 0, maxWidth: '40rem' }}>
        These contacts are used only after the head misses the first, second and final activity reminders.
        A family acknowledgement stops later contacts but never transfers account or property control.
      </p>

      {q.isPending && <Loading h="8rem" what="the current notification settings" />}
      {q.isError && (
        <Failed what="The notification settings" error={q.error} onRetry={() => q.refetch()} h="8rem" />
      )}

      {loaded && (
        <>
          <fieldset className="field" style={{ maxWidth: '40rem' }}>
            <legend>Who should be contacted?</legend>
            <label className="row tight">
              <input
                type="radio"
                name="notifier-mode"
                checked={currentMode === 'all'}
                onChange={() => setMode('all')}
              />
              Email all family members with a verified email together
            </label>
            <label className="row tight">
              <input
                type="radio"
                name="notifier-mode"
                checked={currentMode === 'selected'}
                onChange={() => setMode('selected')}
              />
              Email selected family members in order
            </label>
          </fieldset>

          {unready.length > 0 && (
            <p className="note accent" style={{ margin: 'var(--space-md) 0' }}>
              {plural(unready.length, 'member is', 'members are')} excluded until their email is verified and they consent to safeguard email.
            </p>
          )}

          {currentMode === 'all' ? (
            <p className="note" style={{ margin: 'var(--space-md) 0' }}>
              {eligible.length === 0
                ? 'No family member has a verified email yet.'
                : `${plural(eligible.length, 'verified family email')} will be contacted together.`}
            </p>
          ) : (
            <>
              {current.length === 0 ? (
                <p className="note" style={{ margin: 'var(--space-md) 0' }}>
                  Add at least one verified family email to create an order.
                </p>
              ) : (
                <div className="rows boxed" style={{ margin: 'var(--space-md) 0' }}>
                  {current.map((m, i) => (
                    <div key={m.id}>
                      <span className="avatarlg" style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.6875rem' }}>
                        {i + 1}
                      </span>
                      <span className="grow">
                        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem' }}>{m.name}</span>
                        <span className="note" style={{ display: 'block' }}>
                          {[m.relation ? relMeta(m.relation).label : '', m.email].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                        <button
                          type="button"
                          className="iconbtn"
                          style={{ minWidth: '2.75rem', minHeight: '2.75rem' }}
                          aria-label={`Move ${m.name} up`}
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          <ArrowUpwardOutlined sx={{ fontSize: 16 }} />
                        </button>
                        <button
                          type="button"
                          className="iconbtn"
                          style={{ minWidth: '2.75rem', minHeight: '2.75rem' }}
                          aria-label={`Move ${m.name} down`}
                          disabled={i === current.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDownwardOutlined sx={{ fontSize: 16 }} />
                        </button>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => setOrder(current.filter((_x, x) => x !== i))}
                        >
                          Take out
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {outside.length > 0 && (
                <div className="field" style={{ maxWidth: '28rem' }}>
                  <label htmlFor="notif-add">Add a verified family email</label>
                  <select
                    id="notif-add"
                    value=""
                    onChange={(e) => {
                      const member = eligible.find((x) => x.id === e.target.value);
                      if (member) setOrder([...current, member]);
                    }}
                  >
                    <option value="">Choose a member…</option>
                    {outside.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.relation ? `${member.name} — ${relMeta(member.relation).label}` : member.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Dialog>
  );
}

// ── The verification link ──────────────────────────────────────────────

function InviteDialog({ invite, onClose }: { invite: InviteInfo; onClose: () => void }) {
  const toast = useToast();
  const msg = `Hi ${invite.name}, please verify your co-ownership on Pattadar: ${invite.link}`;

  const hand = (label: string, href: string, icon: ReactNode) => (
    <a className="btn sm" href={href} target="_blank" rel="noreferrer">
      {icon} {label}
    </a>
  );

  return (
    <Dialog
      title="Verification link"
      onClose={onClose}
      footer={<button type="button" className="btn primary" onClick={onClose}>Done</button>}
    >
      <p className="note" style={{ marginTop: 0, maxWidth: '34rem' }}>
        Send this to <strong>{invite.name}</strong>
        {invite.to ? ` (${invite.to})` : ''} so they can confirm who they are. It works without
        an account.
      </p>
      <div className="row tight" style={{ flexWrap: 'nowrap', marginBottom: 'var(--space-sm)' }}>
        <input className="grow mono" type="text" readOnly value={invite.link} />
        <button
          type="button"
          className="btn"
          onClick={() => {
            navigator.clipboard.writeText(invite.link)
              .then(() => toast.ok('Link copied'))
              .catch(() => toast.bad('Could not copy the link. Select it and copy by hand.'));
          }}
        >
          <ContentCopyOutlined sx={{ fontSize: 15 }} /> Copy
        </button>
      </div>
      <div className="row tight">
        {hand('WhatsApp', `https://wa.me/?text=${encodeURIComponent(msg)}`, <WhatsApp sx={{ fontSize: 15 }} />)}
        {hand(
          'SMS',
          `sms:${invite.to.startsWith('+') ? invite.to.replace(/\s/g, '') : ''}?&body=${encodeURIComponent(msg)}`,
          <SmsOutlined sx={{ fontSize: 15 }} />,
        )}
        {hand(
          'Email',
          `mailto:${invite.to.includes('@') ? invite.to : ''}?subject=${encodeURIComponent('Verify your co-ownership on Pattadar')}&body=${encodeURIComponent(msg)}`,
          <EmailOutlined sx={{ fontSize: 15 }} />,
        )}
      </div>
    </Dialog>
  );
}
