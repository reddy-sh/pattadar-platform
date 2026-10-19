/** Owner words for the property master record (Overview tab).
 *  docs/specs/2026-10-11-property-overview.md §0–§2. Pure, so it is tested
 *  without a browser (recordMaster.test.ts). */
import type {
  AcquisitionInput, AcquisitionParty, AcquisitionPartyInput, ComplianceCheck, RecordAcquisition, RecordField, RecordFieldSource,
} from './api';

/** How the land was acquired: the contract's `mode` enum, in owner words. */
export const MODES: { key: string; label: string }[] = [
  { key: 'sale', label: 'Sale' },
  { key: 'gift', label: 'Gift' },
  { key: 'inheritance', label: 'Inheritance' },
  { key: 'partition', label: 'Partition' },
  { key: 'settlement', label: 'Settlement' },
  { key: 'will', label: 'Will' },
  { key: 'govt_grant', label: 'Government grant' },
  { key: 'agreement', label: 'Agreement' },
  { key: 'unregistered_sale', label: 'Unregistered sale' },
  { key: 'other', label: 'Other' },
];

/** The legacy properties default 'purchase' is read as a sale (spec §0.1). */
export function modeLabel(mode: string): string {
  const key = mode === 'purchase' ? 'sale' : mode;
  return MODES.find((m) => m.key === key)?.label ?? '';
}

/** The small muted line beside a value: who said it. */
export function sourceMarker(src: RecordFieldSource | null | undefined): string {
  if (!src) return '';
  if (src.source === 'manual') return 'you entered';
  if (src.source === 'legacy') return 'entered before sources were kept';
  const label = src.label.trim();
  if (!label) {
    return src.source === 'public_record' ? 'from public record'
      : src.source === 'deed_reading' ? 'from the deed'
        : src.source === 'passbook_reading' ? 'from the passbook' : '';
  }
  return `from ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/** The short tag drawn beside a value; its full words are `sourceTitle`. */
export function sourceTag(src: RecordFieldSource | null | undefined): string {
  if (!src) return '';
  return ({
    manual: 'You', legacy: 'Earlier', public_record: 'Public', deed_reading: 'Deed', passbook_reading: 'Passbook',
  } as Record<string, string>)[src.source] ?? 'Source';
}

/** The full source, as a sentence: "From public record · RID … · schedule 2",
 *  "From deed 1576/1989", "You entered". The public record's RID and schedule
 *  are owner facts (the registry's own reference), so they are said in full. */
export function sourceTitle(src: RecordFieldSource | null | undefined): string {
  if (!src) return '';
  if (src.source === 'public_record') {
    const [tag, rid, sNo] = src.sourceRef.split(':');
    if (tag === 'pr' && rid) return `From public record · RID ${rid}${sNo ? ` · schedule ${sNo}` : ''}`;
  }
  const m = sourceMarker(src);
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** The Compliance check's rows: what needs doing first (fail, then warn,
 *  then what cannot be told), passed last; the server's order within each. */
const RANK: Record<string, number> = { fail: 0, warn: 1, unknown: 2, pass: 3 };
export const checksInOrder = (checks: ComplianceCheck[]) =>
  [...checks].sort((a, b) => (RANK[a.status] ?? 2) - (RANK[b.status] ?? 2));

/** "Checked 12/10/2026 14:05", in India time; the server stamps UTC. */
export function checkedLine(iso: string): string {
  const d = new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  return `Checked ${day} ${time}`;
}

/** The title-side checks: an Upload is the deed flow, an Add the Title drawer. */
export const isTitleCheck = (c: Pick<ComplianceCheck, 'key' | 'fieldKey'>, fields: RecordField[]) =>
  c.key === 'deed' || c.key === 'chain' || c.fieldKey === 'from_parties'
  || fields.some((f) => f.key === c.fieldKey && f.group === 'title');

/** The source a later claim came from, as the noun after "from the". */
const CLAIM_FROM: Record<string, string> = {
  deed_reading: 'deed', passbook_reading: 'passbook', public_record: 'public record',
};

/** Accessible names for a conflict's two choices. Each starts with the words
 *  the button shows ("Use this", "Keep mine"), so a voice user can say them. */
export function claimChoiceNames(fieldLabel: string, src: Pick<RecordFieldSource, 'source'> | null | undefined) {
  const what = fieldLabel.trim().toLowerCase();
  const from = (src && CLAIM_FROM[src.source]) || 'other source';
  return { use: `Use this: ${what} from the ${from}`, keep: `Keep mine: your ${what}` };
}

/** "Deed 1576/1989 says 2.80 ac" — a later claim that disagrees. */
export function conflictText(label: string, display: string): string {
  return `${label.trim() || 'Another source'} says ${display}`;
}

/** Field keys the group drawers never edit: the pin and outline belong to
 *  Location, the parties and the holders to the acquisition and People. */
const NOT_IN_DRAWER = new Set(['geo', 'from_parties', 'holders']);

/** The fields one group's Edit drawer offers. Title fields are edited in the
 *  acquisition drawer, so the title group has none here. */
export function editableIn(fields: RecordField[], group: string): RecordField[] {
  if (group === 'title') return [];
  return fields.filter((f) => f.group === group && !NOT_IN_DRAWER.has(f.key));
}

/** The rows a group card draws: only fields that hold a value. An unset field
 *  is never an empty row; the important ones are listed as missing instead. */
export function shownIn(fields: RecordField[], group: string): RecordField[] {
  return fields.filter((f) => f.group === group && f.value.trim() !== '' && !NOT_IN_DRAWER.has(f.key));
}

/** The two sides of a transfer named the way the deed names them, so the
 *  Title card shows labelled fields ("Seller", "Buyer") rather than a
 *  sentence ("From … · seller", "Held by …"). With no mode (or "Other") the
 *  earlier side's own role names them (founder, 12/10/2026: a seller with
 *  no mode still read "From … · seller / Held by …"). Plural when there are several. */
export function partyLabels(mode: string, nFrom: number, nTo: number, fromRole = ''): [string, string] {
  const pair: Record<string, [string, string]> = {
    sale: ['Seller', 'Buyer'], agreement: ['Seller', 'Buyer'], unregistered_sale: ['Seller', 'Buyer'],
    gift: ['Donor', 'Donee'], inheritance: ['Deceased', 'Legal heir'], will: ['Testator', 'Beneficiary'],
    settlement: ['Settlor', 'Settlee'], partition: ['Partitioned from', 'Allotted to'],
    govt_grant: ['Granted by', 'Grantee'],
  };
  const byRole: Record<string, string> = {
    seller: 'sale', vendor: 'sale', donor: 'gift', deceased: 'inheritance', testator: 'will', settlor: 'settlement',
  };
  const [from, to] = pair[mode] ?? pair[byRole[fromRole.trim().toLowerCase()] ?? ''] ?? ['Earlier owner', 'Owner'];
  const many = (w: string, n: number) => (n > 1 && /^[A-Z][a-z]+( heir)?$/.test(w) ? `${w}s` : w);
  return [many(from, nFrom), many(to, nTo)];
}

/** A holder's share, or '' when the paper did not say (0/0). */
export function shareText(p: AcquisitionParty): string {
  return p.shareDen > 0 && p.shareNum > 0 ? `${p.shareNum}/${p.shareDen}` : '';
}

/** Input type for one field in an edit drawer. */
export function inputKind(key: string): 'date' | 'text' {
  return /(^|_)date$/.test(key) ? 'date' : 'text';
}

/** "Title"'s source line: a deed is named by the acquisition's own
 *  document number; every other source as `sourceTitle` says it. */
export function acquisitionSourceLine(a: Pick<RecordAcquisition, 'docNo' | 'source'>): string {
  const s = a.source;
  if (!s) return '';
  if (s.source === 'deed_reading') return a.docNo ? `From deed ${a.docNo}` : 'From the deed';
  return s.source === 'public_record' && !s.sourceRef.startsWith('pr:') ? 'From public record' : sourceTitle(s);
}

/** The acquisition drawer's own fields, as typed. */
export interface AcquisitionDraft {
  mode: string; registered: string; docNo: string; regDate: string; execDate: string; sro: string;
  consideration: string; govtValue: string; stampDuty: string; proofNo: string;
}

/** The parties as the drawer will send them: trimmed, blank rows dropped. */
function cleanParties(from: AcquisitionPartyInput[], inherited: boolean): AcquisitionPartyInput[] {
  return from.filter((p) => p.name.trim()).map((p) => ({
    name: p.name.trim(), parentage: (p.parentage ?? '').trim(),
    relationship: (p.relationship ?? '').trim(), role: inherited ? 'deceased' : (p.role ?? ''),
  }));
}

/** Whether the parties differ from what the drawer opened with — every field
 *  of every row, and a row added or taken out, not just the names. */
export function partiesChanged(start: AcquisitionPartyInput[], now: AcquisitionPartyInput[]): boolean {
  const norm = (ps: AcquisitionPartyInput[]) => JSON.stringify(ps.filter((p) => p.name.trim()).map((p) => [
    p.name.trim(), (p.parentage ?? '').trim(), (p.relationship ?? '').trim(), p.role ?? '',
  ]));
  return norm(start) !== norm(now);
}

/** What setAcquisition is sent. Not registered means there is no document
 *  number, registration date or office to send: a value left in those boxes
 *  from before the owner said "No" is dropped, not stored. */
export function acquisitionInput(v: AcquisitionDraft, from: AcquisitionPartyInput[]): AcquisitionInput {
  const money = (s: string) => (s.trim() ? Number(s) || 0 : 0);
  const registered = v.registered !== 'no';
  return {
    mode: v.mode, registered: v.registered,
    docNo: registered ? v.docNo.trim() : '', regDate: registered ? v.regDate : '',
    sro: registered ? v.sro.trim() : '', execDate: v.execDate,
    consideration: money(v.consideration), govtValue: money(v.govtValue), stampDuty: money(v.stampDuty),
    proofNo: v.proofNo.trim(),
    fromParties: cleanParties(from, v.mode === 'inheritance'),
  };
}

/** The drawer box behind each title field it can clear. */
const CLEARABLE: [keyof AcquisitionDraft, string][] = [
  ['docNo', 'doc_no'], ['regDate', 'reg_date'], ['execDate', 'exec_date'], ['sro', 'sro'],
  ['consideration', 'consideration'], ['govtValue', 'govt_value'], ['stampDuty', 'stamp_duty'],
];

/** The title fields the owner emptied in the drawer. setAcquisition reads a
 *  blank as "not stated" and keeps the old value, so these go to
 *  setRecordFields as '' to clear them. Registered "No" already clears the
 *  document number, date and office on the server, so those are not sent. */
export function clearedTitleKeys(start: AcquisitionDraft, now: AcquisitionDraft): string[] {
  const dropped = now.registered === 'no' ? new Set(['docNo', 'regDate', 'sro']) : new Set<string>();
  return CLEARABLE
    .filter(([k]) => !dropped.has(k) && start[k].trim() !== '' && now[k].trim() === '')
    .map(([, key]) => key);
}
