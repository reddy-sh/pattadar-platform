/**
 * Set WHO holds some properties: the one holder dialog, used by Properties'
 * selection bar ("Set holder") and by a family or group's Properties tab
 * ("Take out of this group", which opens it already pointed at your own name).
 *
 * One dialog for both, so the khata warning — a parcel is held through its
 * khata, and the other parcels on it move too — is said in one place, in one
 * set of words, before anything moves.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { useHolderChange, useSetRecordHolder, OWN_NAME } from './api';
import type { RecordCard } from './api';
import { Dialog } from './Dialog';
import { GraphQLRequestError } from '../api/client';
import { useGroups } from './groupsData';
import { GROUP_LAND_DISCLAIMER } from './groupsView';
import { num, plural } from './ui';

/** The picker's value for "In your own name". The api takes '' or `personal`;
 *  the Holder facet already says `personal`, so the picker does too. */
export const PERSONAL = 'personal';

/** What a confirmed move did, for the caller's toast. */
export interface HolderMoved {
  groupId: string;
  holderLabel: string;
  siblings: number;
}
const sameHolder = (a: string, b: string) =>
  (a === PERSONAL ? '' : a) === (b === PERSONAL ? '' : b);
/** Where a property stands now, in the words the "Held by" column uses. */
const heldWord = (groupId: string, label: string) =>
  (groupId && groupId !== PERSONAL ? `Held by ${label}` : OWN_NAME);

function HolderRows({ rows }: {
  rows: Array<{ id: string; title: string; khataNo: string; groupId: string; label: string }>;
}) {
  return (
    <div className="rows boxed">
      {rows.map((r) => (
        <div className="row" key={r.id}>
          <span className="grow">
            <strong>{r.title}</strong>
            <small className="note" style={{ display: 'block' }}>
              {[r.khataNo && `Khata ${r.khataNo}`, heldWord(r.groupId, r.label)]
                .filter(Boolean).join(' · ')}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Set WHO holds the selected properties (decision memo 06/10/2026, § 4.4).
 *
 * A parcel is held through its khata, so moving one parcel moves every parcel
 * on that khata — the server answers that list (`holderChange`) before anything
 * is written, and this dialog names the parcels nobody ticked BEFORE the press,
 * not in a toast after it. A built property moves alone.
 *
 * Nothing is chosen on open unless the caller was asked for one holder in
 * particular. A preselected holder would otherwise preview — and one Enter
 * would make — a move nobody asked for.
 */
export function SetHolderDialog({ records, onDone, onClose, initialTarget = '', title = 'Set holder' }: {
  records: RecordCard[];
  /** What moved, from the preview the press confirmed: where it went
   *  (`groupId` empty for your own name) and how many khata siblings went
   *  along that nobody ticked. */
  onDone: (moved: HolderMoved) => void;
  onClose: () => void;
  /** The holder to start on. Empty by default: see above. A group's "Take out
   *  of this group" starts on `personal`, because that is what was asked for
   *  — and the preview of what moves is drawn before the press either way. */
  initialTarget?: string;
  title?: string;
}) {
  const groups = useGroups();
  const save = useSetRecordHolder(false);
  const [target, setTarget] = useState(initialTarget);
  const [err, setErr] = useState('');
  const ids = useMemo(() => records.map((r) => r.id), [records]);
  const preview = useHolderChange(ids, target, !!target);
  // A preview for a different target is not this one: while the next answer is
  // in flight, react-query has no data for the new key, so `change` is empty
  // rather than the previous holder's list.
  const change = target ? preview.data : undefined;
  const chosen = change?.records.filter((r) => r.requested) ?? [];
  const siblings = change?.records.filter((r) => !r.requested) ?? [];
  const moving = change?.records.filter((r) => !sameHolder(r.fromGroupId, change.groupId)) ?? [];
  const options = useMemo(
    () => [...(groups.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [groups.data]);
  const toWord = (c: { groupId: string; holderLabel: string }) =>
    (c.groupId ? c.holderLabel : 'your own name');

  const submit = async () => {
    if (!target || !change || moving.length === 0 || save.isPending) return;
    setErr('');
    try {
      await save.mutateAsync({ recordIds: ids, groupId: target });
      onDone({
        groupId: change.groupId && change.groupId !== PERSONAL ? change.groupId : '',
        holderLabel: change.holderLabel,
        siblings: siblings.filter((r) => !sameHolder(r.fromGroupId, change.groupId)).length,
      });
    } catch (e) {
      // The api refuses with the owner's sentence (a property or group no
      // longer in the account); anything else is the network.
      setErr(e instanceof GraphQLRequestError && e.message
        ? e.message
        : 'That did not go through. No holder was changed.');
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={save.isPending}
      initialFocus="#hd-holder"
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary"
                  disabled={!change || moving.length === 0 || save.isPending}
                  onClick={() => void submit()}>
            {save.isPending ? 'Saving…'
              : `Move ${plural(moving.length || records.length, 'property', 'properties')}`}
          </button>
        </>
      )}
    >
      <div className="field">
        <label htmlFor="hd-holder">Who holds {records.length === 1 ? 'it' : 'them'}</label>
        <select id="hd-holder" value={target}
                onChange={(e) => { setErr(''); setTarget(e.target.value); }}>
          <option value="" disabled>Choose a holder</option>
          <option value={PERSONAL}>{OWN_NAME}</option>
          {options.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      {groups.isError && (
        <p className="note" role="alert" style={{ color: 'var(--w-warn)' }}>
          Your families and groups did not load, so only {OWN_NAME.toLowerCase()} can be chosen.
          Close this and try again.
        </p>
      )}
      {groups.data && groups.data.length === 0 && (
        <p className="note">
          You have no families or groups yet. Make one in{' '}
          <Link to="/groups">Families &amp; groups</Link>.
        </p>
      )}

      {!change && (
        <HolderRows rows={records.map((r) => ({
          id: r.id, title: r.title, khataNo: r.khataNo, groupId: r.groupId, label: r.holderLabel,
        }))} />
      )}
      {target && preview.isFetching && !change && (
        <p className="note" role="status">Checking which properties move…</p>
      )}
      {target && preview.isError && !change && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
          {preview.error instanceof GraphQLRequestError && preview.error.message
            ? preview.error.message
            : 'Which properties move could not be checked. Try again.'}
        </p>
      )}

      {change && (
        <>
          <HolderRows rows={chosen.map((r) => ({
            id: r.id, title: r.title, khataNo: r.khataNo, groupId: r.fromGroupId, label: r.fromHolderLabel,
          }))} />
          {siblings.length > 0 && (
            <>
              <p className="note" data-testid="holder-siblings" style={{ color: 'var(--w-warn)' }}>
                A khata has one holder, so {siblings.length === 1
                  ? 'this other parcel on the same khata moves'
                  : `these ${siblings.length} other parcels on the same khata move`} to{' '}
                {toWord(change)} too.
              </p>
              <HolderRows rows={siblings.map((r) => ({
                id: r.id, title: r.title, khataNo: r.khataNo, groupId: r.fromGroupId, label: r.fromHolderLabel,
              }))} />
            </>
          )}
          {moving.length > 0 && (change.memberShares ?? []).length > 0 && (
            <div data-testid="holder-shares">
              <p className="note" style={{ margin: 0, color: 'var(--w-warn)' }}>
                {change.memberShares.length === 1 ? 'A member’s share is' : 'Members’ shares are'} tied
                to land that leaves {change.memberShares.length === 1 ? 'their group' : 'their groups'}:
              </p>
              <ul className="note" style={{ margin: 0 }}>
                {change.memberShares.map((m) => (
                  <li key={`${m.memberId}-${m.recordId}`}>
                    {m.memberName} · {num(m.sharePct)}% of {m.recordTitle} · {m.groupName}
                  </li>
                ))}
              </ul>
              <p className="note" style={{ margin: 0 }}>
                The shares stay on the group’s Members tab, marked as no longer held by the group.
              </p>
            </div>
          )}
          {moving.length === 0 ? (
            <p className="note" role="status">
              {change.groupId
                ? `${records.length === 1 ? 'It is' : 'These are'} already held by ${change.holderLabel}.`
                : `${records.length === 1 ? 'It is' : 'These are'} already in your own name.`}
            </p>
          ) : (
            <>
              <p className="note">
                {plural(moving.length, 'property', 'properties')} will be{' '}
                {change.groupId ? `held by ${change.holderLabel}` : 'in your own name'}.
              </p>
              {/* The fixed disclaimer the group page carries (memo § 4.6): a
                  holder is the owner's own record, never a title claim. */}
              <p className="note" style={{ color: 'var(--w-ink-3)' }}>
                {GROUP_LAND_DISCLAIMER}
              </p>
            </>
          )}
        </>
      )}
      {err && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Dialog>
  );
}
