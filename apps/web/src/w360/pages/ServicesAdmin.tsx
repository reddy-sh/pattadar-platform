import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import PublishOutlined from '@mui/icons-material/PublishOutlined';

import {
  useArchiveServiceCatalogue,
  useGeographyReference,
  usePortfolio,
  usePublishServiceCatalogue,
  useSaveServiceCatalogue,
  useServiceCatalogueAdmin,
  type CatalogueEntry,
  type ServiceOffer,
} from '../api';
import {
  BandSearch, ChipPicker, Empty, FacetFilter, Failed, FormError, inrFull,
  PageHead, Pill, PlaceLine, plural, statusWord, ViewToggle,
} from '../ui';
import { Dialog } from '../Dialog';
import { Drawer, DrawerAction } from '../Drawer';
import { ServiceList } from '../ServiceList';
import { ConfirmDialog } from './PropertyActions';
import { Sk } from '../skeletons';

const TITLE = 'Service catalogue';


type Form = {
  label: string; blurb: string; deliverable: string; price: string; days: string; enabled: boolean;
  /** Where it is offered: none = everywhere; "AP/GUNTUR" limits a state. */
  states: string[]; districts: string[];
};
const formOf = (e: CatalogueEntry): Form => ({
  label: e.label, blurb: e.blurb, deliverable: e.deliverable, price: String(e.price), days: String(e.days), enabled: e.enabled,
  states: [...e.states], districts: [...e.districts],
});
/** The fold the server compares districts by (catalogue.district_code). */
const districtCode = (name: string) =>
  name.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
const scopeKeyOf = (state: string, district: string) =>
  (state === '*' ? 'IN/*' : district === '*' ? `IN/${state}` : `IN/${state}/${district}`);
const sameAreas = (a: { states: string[]; districts: string[] }, b: { states: string[]; districts: string[] }) =>
  [...a.states].sort().join() === [...b.states].sort().join()
  && [...a.districts].sort().join() === [...b.districts].sort().join();
/** "Guntur" from "GUNTUR" where the reference list has not named it. */
const titleOf = (code: string) => code.toLowerCase().replaceAll('_', ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());

type StateRow = { id: string; code: string; name: string };

/** The service catalogue as its manager sees it (spec 2026-10-09 §7).
 *
 *  Owners browse the same catalogue read-only under Services (OrderLand's
 *  `ServiceList`); a super-admin manages it here through the same component's
 *  `manage` mode. A row opens the drawer that edits name, description, price,
 *  turnaround and where it is offered. A price can differ by state and by
 *  district: each place keeps its own versioned drafts, which a super-admin
 *  publishes. The services themselves and their order forms are code. Placed
 *  orders keep the price of the day they were placed. */
export function ServicesAdmin() {
  const portfolio = usePortfolio();
  const allowed = !!portfolio.data?.isSuperAdmin;
  const [params, setParams] = useSearchParams();
  // The place lives in the address, so a link to Guntur's prices opens that.
  const scope = (params.get('state') || '*').toUpperCase();
  const scopeDistrict = scope === '*' ? '*' : (params.get('district') || '*').toUpperCase();
  // Grid · List, as on Properties; Grid unless the address says list.
  const view = params.get('view') === 'list' ? 'list' : 'grid';
  const setView = (v: 'grid' | 'list') => {
    const next = new URLSearchParams(params);
    if (v === 'list') next.set('view', 'list'); else next.delete('view');
    setParams(next, { replace: true });
  };
  const setPlace = (state: string, district = '*') => {
    const next = new URLSearchParams(params);
    if (state !== '*') next.set('state', state); else next.delete('state');
    if (state !== '*' && district !== '*') next.set('district', district); else next.delete('district');
    setParams(next, { replace: true });
  };
  const admin = useServiceCatalogueAdmin(scope, scopeDistrict, allowed);
  const geography = useGeographyReference('', '', '', allowed);
  const stateRows: StateRow[] = (geography.data?.states ?? []).map((s) => ({
    id: s.id, code: (s.code || '').toUpperCase(), name: s.name,
  })).filter((s) => s.code);
  const scopeStateId = stateRows.find((s) => s.code === scope)?.id ?? '';
  const scopeGeo = useGeographyReference(scopeStateId, '', '', allowed && !!scopeStateId);
  const save = useSaveServiceCatalogue(false);
  const publish = usePublishServiceCatalogue(false);
  const archive = useArchiveServiceCatalogue(false);
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [q, setQ] = useState('');
  /** The service open in the drawer, and its form. */
  const [open, setOpen] = useState<CatalogueEntry | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [cloning, setCloning] = useState(false);
  /** A service being switched off or back on from its card, with its reason. */
  const [quick, setQuick] = useState<CatalogueEntry | null>(null);
  const [quickReason, setQuickReason] = useState('');
  const [quickError, setQuickError] = useState('');
  /** A clone waiting for its place's catalogue to load, then opened there. */
  const [pendingClone, setPendingClone] = useState<{ scopeKey: string; key: string; form: Form; from: string } | null>(null);
  /** The dialog and the revision it was opened for, so a refetch while it
   *  is open cannot retarget it. */
  const [confirm, setConfirm] = useState<{ kind: 'publish' | 'archive'; setId: string } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionError, setActionError] = useState('');
  const fieldId = useId().replace(/:/g, '');

  useEffect(() => {
    const d = admin.data;
    if (!pendingClone || !d || admin.isFetching || d.scopeKey !== pendingClone.scopeKey) return;
    const entry = d.services.find((e) => e.key === pendingClone.key);
    if (entry) {
      setOpen(entry); setForm(pendingClone.form);
      setReason(`Priced separately from ${pendingClone.from}`); setError('');
    }
    setPendingClone(null);
  }, [pendingClone, admin.data, admin.isFetching]);

  const head = <PageHead title="Service catalogue" />;
  const loadingHead = <PageHead title="Service catalogue" summary={<Sk w="18rem" h="1rem" r="var(--radius-xs)" />} />;
  if (portfolio.isLoading) {
    return <main className="services-admin">{loadingHead}<SkCatalogue label="Loading your administration access" view={view} /></main>;
  }
  if (!allowed) {
    return (
      <main>
        {head}
        <Empty boxed h="24rem" icon="lock" title="The service catalogue is restricted">
          Only a super-admin can change what services cost, where they are offered, or switch them off.
        </Empty>
      </main>
    );
  }
  if (admin.isLoading) {
    return <main className="services-admin">{loadingHead}<SkCatalogue label="Loading the service catalogue" view={view} /></main>;
  }
  if (admin.error || !admin.data) {
    return <main>{head}<Failed what="The service catalogue" error={admin.error} boxed h="24rem" /></main>;
  }

  const data = admin.data;
  const current = data.current;
  const inherited = new Map(data.inherited.map((e) => [e.key, e]));
  const stateName = (code: string) => stateRows.find((s) => s.code === code)?.name ?? code;
  const scopeDistricts = (scopeGeo.data?.districts ?? []).map((d) => ({ code: districtCode(d.name), name: d.name }));
  const districtName = (code: string) => scopeDistricts.find((d) => d.code === code)?.name ?? titleOf(code);
  const placeOfKey = (key: string) => {
    const [, st = '*', dist] = key.split('/');
    if (st === '*') return 'All states and union territories';
    return dist ? `${districtName(dist)}, ${stateName(st)}` : stateName(st);
  };
  const here = placeOfKey(data.scopeKey);
  const sourceWord = (source: string) => (source ? placeOfKey(source) : 'Standard');
  const offered = data.services.filter((e) => e.enabled).length;
  const changedHere = data.services.filter((e) => e.source === data.scopeKey).length;
  // The catalogue's own totals; how many the filter lets through is the tally's.
  const summary = [plural(data.services.length, 'service'), `${offered} offered`,
    changedHere ? `${changedHere} set here` : ''].filter(Boolean).join(' · ');
  const stateOptions = [...new Set([
    ...stateRows.map((s) => s.code),
    ...data.scopes.map((s) => s.stateCode).filter((c) => c !== '*'),
  ])].sort((a, b) => stateName(a).localeCompare(stateName(b)));
  const districtOptions = scope === '*' ? [] : [...new Set([
    ...scopeDistricts.map((d) => d.code),
    ...data.scopes.filter((s) => s.stateCode === scope && s.districtCode !== '*').map((s) => s.districtCode),
  ])].sort((a, b) => districtName(a).localeCompare(districtName(b)));
  const groups = [...new Set(data.services.map((e) => e.group))].sort();
  const statusOf = (e: CatalogueEntry) => (e.enabled ? 'offered' : 'off');
  const needle = q.trim().toLowerCase();
  const shown = data.services
    .filter((e) => !groupFilter.length || groupFilter.includes(e.group))
    .filter((e) => !statusFilter.length || statusFilter.includes(statusOf(e)))
    .filter((e) => !needle || `${e.label} ${e.blurb} ${e.group}`.toLowerCase().includes(needle));
  /** The marketplace row's shape; the admin read carries no order form. */
  const asOffer = (e: CatalogueEntry): ServiceOffer => ({
    ...e, shelves: [], fields: [],
    visual: { assetKey: e.key, src: '', alt: '', caption: '', sourceScope: '' },
    filesTo: '', aliases: [], perRecord: false, directionsField: '', guides: [], synonyms: [],
    alsoCalled: '', flatPriceNote: '', featured: false,
  });
  const byKey = new Map(data.services.map((e) => [e.key, e]));

  function openEditor(entry: CatalogueEntry) {
    setOpen(entry); setForm(formOf(entry)); setReason(''); setError('');
  }
  function closeEditor() { setOpen(null); setForm(null); setReason(''); setError(''); setCloning(false); }
  const toggle = (group: string, key: string) => {
    if (group === 'state') { closeEditor(); setPlace(scope === key ? '*' : key); return; }
    if (group === 'district') { closeEditor(); setPlace(scope, scopeDistrict === key ? '*' : key); return; }
    const flip = (list: string[]) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
    if (group === 'group') setGroupFilter(flip);
    else setStatusFilter(flip);
  };
  const clearAll = () => {
    closeEditor(); setGroupFilter([]); setStatusFilter([]); setQ(''); setPlace('*');
  };
  const patch = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f));
  const dirty = !!open && !!form && JSON.stringify(form) !== JSON.stringify(formOf(open));

  /** This place's draft after the edit: every service as it now stands here,
   *  saved as only what differs from the wider places, so other services'
   *  changes in the draft are kept and a later change there still reaches
   *  every service this place does not set. */
  const draftDocument = (key = open?.key, form0 = form, fail = setError): string | null => {
    const form = form0;
    if (!key || !form) return null;
    const setError = fail;
    const price = Number(form.price);
    const days = Number(form.days);
    if (!form.label.trim() || !form.blurb.trim() || !form.deliverable.trim()) {
      setError('The draft could not be saved. Enter a name, a description and what the owner gets.');
      return null;
    }
    if (!(price > 0) || price > 1_000_000) {
      setError('The draft could not be saved. Enter a price above ₹0 and at most ₹10,00,000.');
      return null;
    }
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError('The draft could not be saved. Enter a turnaround of 1 to 365 days.');
      return null;
    }
    const services: Record<string, Record<string, unknown>> = {};
    for (const entry of data.services) {
      const now = entry.key === key
        ? { label: form.label.trim(), blurb: form.blurb.trim(), deliverable: form.deliverable.trim(),
            price, days, enabled: form.enabled,
            states: form.states, districts: form.districts.filter((d) => form.states.includes(d.split('/')[0])) }
        : entry;
      const base = inherited.get(entry.key) ?? entry;
      const out: Record<string, unknown> = {};
      if (now.label !== base.label) out.label = now.label;
      if (now.blurb !== base.blurb) out.blurb = now.blurb;
      if (now.deliverable !== base.deliverable) out.deliverable = now.deliverable;
      if (now.price !== base.price) out.price = now.price;
      if (now.days !== base.days) out.days = now.days;
      if (now.enabled !== base.enabled) out.enabled = now.enabled;
      if (!sameAreas(now, base)) out.areas = { states: now.states, districts: now.districts };
      if (Object.keys(out).length) services[entry.key] = out;
    }
    return JSON.stringify({ schemaVersion: 1, services });
  };

  const saveDraft = async () => {
    setError('');
    if (!reason.trim()) { setError('The draft could not be saved. Enter a change reason.'); return; }
    const document = draftDocument();
    if (!document) return;
    try {
      const result = await save.mutateAsync({
        stateCode: data.stateCode, districtCode: data.districtCode, document, reason: reason.trim(),
        expectedRevision: current?.revision ?? 0,
      });
      if (!result.web.saveServiceCatalogue) {
        setError('The draft could not be saved. Reload the page; these prices may have been changed meanwhile.');
        return;
      }
      closeEditor();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The draft could not be saved. Try again.');
    }
  };

  /** Clone the open service to another place: go there, and open its drawer
   *  with these values as an unsaved draft to review, price and save. */
  const cloneTo = (state: string, district: string) => {
    if (!open || !form) return;
    setPendingClone({ scopeKey: scopeKeyOf(state, district), key: open.key, form, from: here });
    setOpen(null); setForm(null); setCloning(false);
    setPlace(state, district);
  };

  const closeQuick = () => { setQuick(null); setQuickReason(''); setQuickError(''); };
  /** Switch a service off here, or offer it again, as a draft: the same
   *  draft the drawer saves, with only `enabled` changed. */
  const saveQuick = async () => {
    if (!quick) return;
    if (!quickReason.trim()) { setQuickError('The draft could not be saved. Enter a reason.'); return; }
    const document = draftDocument(quick.key, { ...formOf(quick), enabled: !quick.enabled }, setQuickError);
    if (!document) return;
    try {
      const result = await save.mutateAsync({
        stateCode: data.stateCode, districtCode: data.districtCode, document, reason: quickReason.trim(),
        expectedRevision: current?.revision ?? 0,
      });
      if (!result.web.saveServiceCatalogue) {
        setQuickError('The draft could not be saved. Reload the page; these prices may have been changed meanwhile.');
        return;
      }
      closeQuick();
    } catch (e) {
      setQuickError(e instanceof Error ? e.message : 'The draft could not be saved. Try again.');
    }
  };


  const closeConfirm = () => { setConfirm(null); setActionReason(''); setActionError(''); };
  const stillShown = () => !!confirm && current?.id === confirm.setId;
  const CHANGED = 'These prices changed while the dialog was open. Cancel, then reload the page.';

  const publishDraft = async () => {
    if (!confirm || !stillShown() || current?.status !== 'draft') { setActionError(CHANGED); return; }
    try {
      const result = await publish.mutateAsync({ setId: confirm.setId, reason: actionReason.trim() });
      if (!result.web.publishServiceCatalogue) setActionError('The draft could not be published. Reload the page and try again.');
      else closeConfirm();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The draft could not be published. Try again.');
    }
  };

  const archiveCurrent = async () => {
    if (!confirm || !stillShown()) { setActionError(CHANGED); return; }
    if (!actionReason.trim()) { setActionError('The prices could not be archived. Enter an archive reason.'); return; }
    try {
      const result = await archive.mutateAsync({ setId: confirm.setId, reason: actionReason.trim() });
      if (!result.web.archiveServiceCatalogue) setActionError('The prices could not be archived. Reload the page and try again.');
      else closeConfirm();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The prices could not be archived. Try again.');
    }
  };

  // Another place's prices are being read: the last ones stay, dimmed and
  // inert, and nothing acts on them until the new answer lands (design.md § Loading).
  const stale = admin.isPlaceholderData;
  const isDraft = current?.status === 'draft';
  const archiveLabel = isDraft ? 'Archive draft' : 'Archive these prices';
  const wider = data.scopeKey === 'IN/*' ? 'the standard prices'
    : data.districtCode === '*' ? 'the prices for all states' : `the prices for ${stateName(data.stateCode)}`;

  return (
    <main className="services-admin">
      {/* No eyebrow: "Administration" is the rail group (design.md § Page head, V2). */}
      <PageHead
        title="Service catalogue"
        pill={current ? <Pill kind={isDraft ? 'managed' : 'owned'}>{statusWord(current.status)}</Pill> : undefined}
        summary={summary}
        actions={{
          primary: isDraft ? {
            label: 'Publish draft', icon: <PublishOutlined sx={{ fontSize: 16 }} />, disabled: stale,
            onClick: () => setConfirm({ kind: 'publish', setId: current.id }),
          } : undefined,
          overflow: current ? [{
            label: archiveLabel, icon: <ArchiveOutlined sx={{ fontSize: 16 }} />, disabled: stale,
            onClick: () => setConfirm({ kind: 'archive', setId: current.id }),
          }] : [],
        }}
      />

      {/* The band (design.md § Page head, slot 5): where these prices apply,
          then + Filter and its chips, the tally and search. */}
      <div className="compliance-band">
        <PlaceLine label="Price scope">
          {data.districtCode !== '*' && <span>{stateName(data.stateCode)}</span>}
          <strong>{data.districtCode !== '*' ? districtName(data.districtCode) : here}</strong>
          <span>
            {current ? `Own prices · revision ${current.revision}`
              : data.stateCode === '*' ? 'Standard prices' : `Uses ${wider}`}
          </span>
        </PlaceLine>
        <FacetFilter
          groups={[
            { key: 'state', label: 'State', options: stateOptions.map((code) => ({ key: code, label: stateName(code) })) },
            { key: 'district', label: 'District', options: districtOptions.map((code) => ({ key: code, label: districtName(code) })) },
            {
              key: 'group', label: 'Group',
              options: groups.map((g) => ({ key: g, label: g, count: data.services.filter((e) => e.group === g).length })),
            },
            {
              key: 'status', label: 'Status',
              options: [
                { key: 'offered', label: 'Offered', count: offered },
                { key: 'off', label: 'Off', count: data.services.length - offered },
              ],
            },
          ]}
          selected={{
            state: scope === '*' ? [] : [scope], district: scopeDistrict === '*' ? [] : [scopeDistrict],
            group: groupFilter, status: statusFilter,
          }}
          onToggle={toggle}
          onClear={clearAll}
          tally={`${shown.length} of ${data.services.length} shown`}
          ariaLabel="Narrow the services"
          searchPlaceholder={districtOptions.length > 8 ? 'Find a state, district or group' : undefined}
          search={(
            <BandSearch value={q} onChange={setQ} placeholder="Search services" label="Search services" />
          )}
          view={<ViewToggle views={['grid', 'list']} value={view} onChange={setView} />}
        />
      </div>

      <div aria-busy={stale} inert={stale}
           style={{ display: 'grid', gap: 'var(--space-lg)', minWidth: 0,
             opacity: stale ? 0.6 : 1, pointerEvents: stale ? 'none' : undefined,
             transition: 'opacity var(--dur-fast) var(--ease-out)' }}>
      {shown.length === 0 && (
        <Empty boxed h="12rem" title="No service matches"
               action={<button type="button" className="btn" onClick={clearAll}>Clear all</button>}>
          Nothing in the catalogue for {here} matches this filter or search.
        </Empty>
      )}

      {shown.length > 0 && (
        <ServiceList
          mode="manage" label={`Services for ${here}`} grouped layout={view}
          offers={shown.map(asOffer)}
          menu={(o) => {
            const e = byKey.get(o.key);
            if (!e) return [];
            return [
              { label: 'Edit', onClick: () => openEditor(e) },
              // The drawer first, the dialog over it a frame later: opened in
              // one render, the drawer's focus effect (a parent's, so it runs
              // after the dialog's) would take focus back from the dialog.
              { label: 'Set a price for another place', onClick: () => { openEditor(e); requestAnimationFrame(() => setCloning(true)); } },
              { label: e.enabled ? `Switch off in ${here}` : `Offer in ${here}`, onClick: () => setQuick(e) },
            ];
          }}
          state={data.stateCode === 'AP' || data.stateCode === 'TS' ? data.stateCode : null}
          onManage={(o) => { const e = byKey.get(o.key); if (e) openEditor(e); }}
          off={(key) => !byKey.get(key)?.enabled}
          note={(o) => {
            const e = byKey.get(o.key);
            const base = e ? inherited.get(e.key) : undefined;
            const was = e && base && e.price !== base.price ? ` · was ${inrFull(base.price)}` : '';
            return `set by ${sourceWord(e?.source ?? '')}${was}`;
          }}
        />
      )}
      </div>



      {open && form && (
        <Drawer
          eyebrow={`${here} · ${TITLE}`}
          title={open.label}
          sub={`Saved as a draft for ${here}. Owners keep today's price until the draft is published.`}
          onClose={closeEditor}
          onSubmit={() => void saveDraft()}
          busy={save.isPending}
          dirty={dirty}
          initialFocus={`#${fieldId}-price`}
          primary={(
            <DrawerAction label="Save draft" working="Saving…" pending={save.isPending} paused={save.isPaused} />
          )}
          over={cloning ? (
            <CloneDialog service={open.label} states={stateRows}
                         onClose={() => setCloning(false)} onClone={cloneTo} />
          ) : undefined}
        >
          <div className="field">
            <label htmlFor={`${fieldId}-label`}>Name</label>
            <input type="text" id={`${fieldId}-label`} value={form.label} maxLength={80}
                   onChange={(e) => patch({ label: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-blurb`}>Description owners read</label>
            <textarea id={`${fieldId}-blurb`} rows={3} value={form.blurb} maxLength={300}
                      onChange={(e) => patch({ blurb: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-deliverable`}>What the owner gets</label>
            <textarea id={`${fieldId}-deliverable`} rows={2} value={form.deliverable} maxLength={160}
                      onChange={(e) => patch({ deliverable: e.target.value })} />
          </div>
          <div className="services-admin-pair">
            <div className="field">
              <label htmlFor={`${fieldId}-price`}>Price in rupees</label>
              <input type="number" id={`${fieldId}-price`} inputMode="decimal"
                     value={form.price} onChange={(e) => patch({ price: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`${fieldId}-days`}>Turnaround in days</label>
              <input type="number" id={`${fieldId}-days`} inputMode="numeric"
                     value={form.days} onChange={(e) => patch({ days: e.target.value })} />
            </div>
          </div>
          <p className="note" style={{ margin: 0 }}>
            Without its own price here it uses {wider}:{' '}
            {inrFull((inherited.get(open.key) ?? open).price)} · {plural((inherited.get(open.key) ?? open).days, 'day')}
          </p>
          <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setCloning(true)}>
            <ContentCopyOutlined sx={{ fontSize: 15 }} /> Set a price for another place
          </button>
          <label className="row tight">
            <input type="checkbox" checked={form.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
            <span>Offered to owners in {here}</span>
          </label>
          <AreaPicker states={stateRows} form={form} onChange={patch} />
          <div className="field">
            <label htmlFor={`${fieldId}-reason`}>Change reason</label>
            <input type="text" id={`${fieldId}-reason`} value={reason} maxLength={4000}
                   placeholder="Why is this changing?" onChange={(e) => setReason(e.target.value)} />
          </div>
          <FormError>{error}</FormError>
        </Drawer>
      )}

      {confirm?.kind === 'publish' && current && (
        <ConfirmDialog
          title="Publish these prices?"
          body={`Revision ${current.revision} becomes the price list for ${here}. New orders are charged it at once; orders already placed keep their price.`}
          actionLabel="Publish draft"
          busyLabel="Publishing…"
          busy={publish.isPending}
          error={actionError}
          onConfirm={() => void publishDraft()}
          onClose={closeConfirm}
          extra={(
            <div className="field">
              <label htmlFor="catalogue-publish-reason">Publication reason (optional)</label>
              <input type="text" id="catalogue-publish-reason" value={actionReason} maxLength={4000}
                     onChange={(e) => setActionReason(e.target.value)} />
            </div>
          )}
        />
      )}
      {quick && (
        <ConfirmDialog
          title={quick.enabled ? `Switch off ${quick.label} in ${here}?` : `Offer ${quick.label} in ${here}?`}
          body={`Saved as a draft for ${here}. Owners see the change only when the draft is published.`}
          actionLabel={quick.enabled ? 'Switch off' : 'Offer it'}
          busyLabel="Saving…"
          danger={quick.enabled}
          busy={save.isPending}
          error={quickError}
          onConfirm={() => void saveQuick()}
          onClose={closeQuick}
          extra={(
            <div className="field">
              <label htmlFor="catalogue-quick-reason">Reason</label>
              <input type="text" id="catalogue-quick-reason" value={quickReason} maxLength={4000}
                     onChange={(e) => setQuickReason(e.target.value)} />
            </div>
          )}
        />
      )}
      {confirm?.kind === 'archive' && current && (
        <ConfirmDialog
          title={isDraft ? 'Archive this draft?' : 'Archive these prices?'}
          body={isDraft
            ? `Revision ${current.revision} is archived. The prices owners pay now do not change.`
            : `${here} stops having its own prices. Owners there pay ${wider} from now on.`}
          actionLabel={archiveLabel}
          busyLabel="Archiving…"
          danger
          busy={archive.isPending}
          error={actionError}
          onConfirm={() => void archiveCurrent()}
          onClose={closeConfirm}
          extra={(
            <div className="field">
              <label htmlFor="catalogue-archive-reason">Archive reason</label>
              <input type="text" id="catalogue-archive-reason" value={actionReason} maxLength={4000}
                     onChange={(e) => setActionReason(e.target.value)} />
            </div>
          )}
        />
      )}
    </main>
  );
}

/** Choose another state, and optionally one of its districts, to price this
 *  service for. The clone opens there as an unsaved draft. */
function CloneDialog({ service, states, onClose, onClone }: {
  service: string; states: StateRow[]; onClose: () => void;
  onClone: (state: string, district: string) => void;
}) {
  const [state, setState] = useState<string[]>([]);
  const [district, setDistrict] = useState<string[]>([]);
  const stateId = states.find((s) => s.code === state[0])?.id ?? '';
  const ref = useGeographyReference(stateId, '', '', !!stateId);
  const districts = (ref.data?.districts ?? []).map((d) => ({ id: districtCode(d.name), label: d.name }));
  return (
    <Dialog
      title={`Set a price for ${service} in another place`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!state.length}
                  onClick={() => onClone(state[0], district[0] ?? '*')}>
            Clone as a draft
          </button>
        </>
      )}
    >
      <p className="note" style={{ margin: 0 }}>
        The service opens in that place with these values, as a draft owners do not see until it is published.
      </p>
      <div className="field">
        <span className="field-label">State</span>
        <ChipPicker label="State" single placeholder="Find a state"
                    options={states.map((s) => ({ id: s.code, label: s.name }))}
                    selected={state} onChange={(ids) => { setState(ids); setDistrict([]); }} />
      </div>
      {state.length > 0 && (
        <div className="field">
          <span className="field-label">District (optional)</span>
          {ref.isLoading ? <p className="note">Loading the districts…</p>
            : districts.length === 0
              ? <p className="note">No official district list is loaded for this state; the price will apply to all of it.</p>
              : (
                <ChipPicker label="District" single placeholder="Find a district" options={districts}
                            selected={district} onChange={setDistrict} empty="The whole state" />
              )}
        </div>
      )}
    </Dialog>
  );
}

/** Where a service is offered: everywhere, or only in the chosen states and,
 *  within a state, optionally only some districts. Both are type-to-find
 *  chip pickers, so 36 states and 700 districts never become a long list. */
function AreaPicker({ states, form, onChange }: {
  states: StateRow[]; form: Form; onChange: (p: Partial<Form>) => void;
}) {
  const limited = form.states.length > 0;
  const setStates = (codes: string[]) => onChange({
    states: codes, districts: form.districts.filter((d) => codes.includes(d.split('/')[0])),
  });
  return (
    <fieldset className="share-paper-picker services-areas">
      <legend>Where it is offered</legend>
      <label>
        <input type="radio" name="service-areas" checked={!limited}
               onChange={() => onChange({ states: [], districts: [] })} />
        <span><strong>Everywhere</strong><small>Every state and district Pattadar serves.</small></span>
      </label>
      <label>
        <input type="radio" name="service-areas" checked={limited} disabled={states.length === 0}
               onChange={() => { if (!limited && states[0]) onChange({ states: [states[0].code] }); }} />
        <span><strong>Only in chosen states</strong>
          <small>{states.length ? 'A state with no districts chosen is offered in all of it.' : 'No official state list is loaded yet.'}</small></span>
      </label>
      {limited && (
        <>
          <ChipPicker label="States" placeholder="Find a state"
                      options={states.map((s) => ({ id: s.code, label: s.name }))}
                      selected={form.states} onChange={setStates} />
          {form.states.map((code) => {
            const st = states.find((s) => s.code === code);
            return st ? <DistrictPicker key={code} state={st} form={form} onChange={onChange} /> : null;
          })}
        </>
      )}
    </fieldset>
  );
}

/** One chosen state's districts, read from the government reference list. */
function DistrictPicker({ state, form, onChange }: {
  state: StateRow; form: Form; onChange: (p: Partial<Form>) => void;
}) {
  const ref = useGeographyReference(state.id, '', '', true);
  const all = (ref.data?.districts ?? []).map((d) => ({ id: `${state.code}/${districtCode(d.name)}`, label: d.name }));
  const mine = form.districts.filter((d) => d.startsWith(`${state.code}/`));
  return (
    <div className="services-districts" role="group" aria-label={`Districts of ${state.name}`}>
      <span className="field-label">Districts of {state.name}</span>
      {ref.isLoading ? <p className="note">Loading the districts of {state.name}…</p>
        : all.length === 0
          ? <p className="note">No official district list is loaded for {state.name}; it is offered in all of it.</p>
          : (
            <ChipPicker
              label={`Districts of ${state.name}`} placeholder="Find a district" options={all}
              selected={mine} empty={`All ${all.length} districts`}
              onChange={(ids) => onChange({
                districts: [...form.districts.filter((d) => !d.startsWith(`${state.code}/`)), ...ids],
              })}
            />
          )}
    </div>
  );
}

/** The catalogue while its first read is pending (design.md § Loading): the
 *  band's place line and filter row, then a group of service cards (or rows)
 *  in the real `.svc-list` boxes, so nothing moves when the services land.
 *  shortcut: composed here; worth an SkServiceList in skeletons.tsx once the
 *  order screens draw the same list while loading. */
function SkCatalogue({ label, view }: { label: string; view: 'grid' | 'list' }) {
  const wave = (i: number) => ({ animationDelay: `${(i % 6) * 90}ms` });
  return (
    <div role="status" aria-busy="true" aria-label={label}
         style={{ display: 'grid', gap: 'var(--space-lg)', minWidth: 0 }}>
      <div className="compliance-band" aria-hidden>
        <div className="placeline"><Sk w="16rem" h="0.8125rem" /></div>
        <div className="filterbar band">
          <Sk w="5.5rem" h="1.75rem" r="var(--radius-pill)" />
          <Sk w="12rem" h="1.75rem" r="var(--radius-pill)" style={{ marginLeft: 'auto' }} />
        </div>
      </div>
      <div className={view === 'grid' ? 'svc-list grid' : 'svc-list'} aria-hidden>
        <Sk w="7rem" h="0.75rem" />
        <ul>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="svc-row" data-mode="manage">
              <div className="svc-main">
                <span className="svc-body">
                  <Sk w="62%" h="1rem" style={wave(i)} />
                  <Sk w="90%" style={wave(i)} />
                  {view === 'list' && <Sk w="40%" style={wave(i)} />}
                </span>
                {view === 'list' ? <Sk w="4rem" h="1rem" style={wave(i)} /> : (
                  <span className="svc-foot">
                    <Sk w="5rem" h="1.375rem" style={wave(i)} />
                    <Sk w="5rem" style={wave(i)} />
                    <Sk w="60%" h="0.75rem" style={{ ...wave(i), gridColumn: '1 / -1' }} />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
