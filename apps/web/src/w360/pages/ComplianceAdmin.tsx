import { useEffect, useMemo, useState } from 'react';
import AddOutlined from '@mui/icons-material/AddOutlined';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import LaunchOutlined from '@mui/icons-material/LaunchOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import PrivacyTipOutlined from '@mui/icons-material/PrivacyTipOutlined';
import PublishOutlined from '@mui/icons-material/PublishOutlined';

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
import { Card, FacetFilter, Failed, Loading, Pill, plural } from '../ui';
import { Drawer } from '../Drawer';
import { ServiceVisual, serviceVisualSrc } from '../ServiceVisual';

type View = 'records' | 'buyer' | 'seller' | 'services' | 'visuals' | 'workforce' | 'sharing' | 'sources' | 'manage';

const VIEWS: { key: View; label: string }[] = [
  { key: 'records', label: 'Property records' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'seller', label: 'Seller' },
  { key: 'services', label: 'Service requests' },
  { key: 'visuals', label: 'Service visuals' },
  { key: 'workforce', label: 'Company members' },
  { key: 'sharing', label: 'Secure sharing' },
  { key: 'sources', label: 'Sources' },
  { key: 'manage', label: 'Manage' },
];

const pretty = (raw: string) => {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
};
const code = (value: string, fallback = '*') => {
  const out = value.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_*-]/g, '');
  return out || fallback;
};

/** Distinct, counted values one level of the scope hierarchy holds among the
 *  configured policies, restricted to those matching every concrete code in
 *  `parent`. Drives the scope FacetFilter's cascade: a group is empty (and so
 *  hidden by FacetFilter itself) until its parent level is chosen. */
function scopeOptions(
  rows: GovernancePolicy[], level: 'stateCode' | 'districtCode' | 'mandalCode' | 'villageCode',
  parent: Partial<Record<'stateCode' | 'districtCode' | 'mandalCode', string>>,
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (Object.entries(parent).some(([key, value]) => row[key as keyof GovernancePolicy] !== value)) continue;
    const value = row[level];
    if (!value || value === '*') continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, label: key.replaceAll('_', ' '), count }));
}

/** A code is a storage key, not a sentence — nobody should ever read a bare
 *  '*' off this screen. This turns a state/district/mandal/village code
 *  quartet into the phrase an admin would actually say out loud. */
function scopeLabel(state: string, district: string, mandal: string, village: string): string {
  if (state === '*') return 'All states and union territories';
  const parts = [state === 'AP' ? 'Andhra Pradesh' : state.replaceAll('_', ' ')];
  if (district !== '*') parts.push(district.replaceAll('_', ' '));
  if (mandal !== '*') parts.push(mandal.replaceAll('_', ' '));
  if (village !== '*') parts.push(village.replaceAll('_', ' '));
  return parts.join(', ');
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
            {loading ? 'Loading…' : disabled ? `Choose the level above first`
              : `Choose a ${label.toLowerCase()}…`}
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
      <input id={id} value={codeValue === '*' ? '' : codeValue} maxLength={80}
             placeholder={placeholder}
             onChange={(e) => onChangeLevel(code(e.target.value || '*'), '')} />
      <small className="note">No official {label.toLowerCase()} list loaded.</small>
    </div>
  );
}

function GuideList({ document, kind }: { document: GovernanceDocument; kind: 'buyer' | 'seller' }) {
  const guide = document.guides.find((item) => item.key === kind);
  if (!guide) return null;
  return (
    <section className="compliance-guide-band">
      <p className="eyebrow">{guide.label}</p>
      <h2>{kind === 'buyer' ? 'Before money or signatures move' : 'Prepare once, disclose clearly'}</h2>
      <ol className="compliance-numbered">
        {guide.items.map((item) => <li key={item}>{item}</li>)}
      </ol>
    </section>
  );
}

export function ComplianceAdmin() {
  const portfolio = usePortfolio();
  const allowed = !!portfolio.data?.isSuperAdmin;
  const [stateCode, setStateCode] = useState('*');
  const [districtCode, setDistrictCode] = useState('*');
  const [mandalCode, setMandalCode] = useState('*');
  const [villageCode, setVillageCode] = useState('*');
  const scopeKey = `IN/${code(stateCode)}/${code(districtCode)}/${code(mandalCode)}/${code(villageCode)}`;
  const policy = useGovernanceAdminPolicy(
    'IN', code(stateCode), code(districtCode), code(mandalCode), code(villageCode), allowed);
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
  const [namingOpen, setNamingOpen] = useState(false);
  const [refStateId, setRefStateId] = useState('');
  const [refDistrictId, setRefDistrictId] = useState('');
  const [refMandalId, setRefMandalId] = useState('');
  const [refVillageId, setRefVillageId] = useState('');
  const geography = useGeographyReference(refStateId, refDistrictId, refMandalId, addingScope);
  const [draft, setDraft] = useState('');
  const [reason, setReason] = useState('');
  const [manageError, setManageError] = useState('');
  const save = useSaveGovernancePolicy(false);
  const publish = usePublishGovernancePolicy(false);
  const archive = useArchiveGovernancePolicy(false);

  const exact = policy.data?.scopeKey === scopeKey;
  const busy = save.isPending || publish.isPending || archive.isPending;

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

  /** State, district, mandal and village are set independently: choosing one
   *  resets only the levels below it, and each carries its own override,
   *  revision and history without touching a sibling or parent scope. */
  const toggleScope = (group: string, value: string) => {
    setEditing(false); setReason(''); setManageError(''); setAddingScope(false);
    if (group === 'state') {
      setStateCode((current) => code(current) === value ? '*' : value);
      setDistrictCode('*'); setMandalCode('*'); setVillageCode('*');
    } else if (group === 'district') {
      setDistrictCode((current) => code(current) === value ? '*' : value);
      setMandalCode('*'); setVillageCode('*');
    } else if (group === 'mandal') {
      setMandalCode((current) => code(current) === value ? '*' : value);
      setVillageCode('*');
    } else {
      setVillageCode((current) => code(current) === value ? '*' : value);
    }
  };

  const clearScope = () => {
    setStateCode('*'); setDistrictCode('*'); setMandalCode('*'); setVillageCode('*');
    setEditing(false); setReason(''); setManageError(''); setAddingScope(false);
  };

  /** Same independence rule as toggleScope, for the reference-data pickers in
   *  the new-scope panel: picking (or clearing, or typing past a gap in the
   *  reference list) one level resets only what is below it, and remembers
   *  the reference row id so the next level's dropdown knows whose children
   *  to ask for. */
  const setScopeLevel = (level: 'state' | 'district' | 'mandal' | 'village', nextCode: string, refId: string) => {
    setEditing(false); setReason(''); setManageError('');
    if (level === 'state') {
      setRefStateId(refId); setRefDistrictId(''); setRefMandalId(''); setRefVillageId('');
      setStateCode(nextCode); setDistrictCode('*'); setMandalCode('*'); setVillageCode('*');
    } else if (level === 'district') {
      setRefDistrictId(refId); setRefMandalId(''); setRefVillageId('');
      setDistrictCode(nextCode); setMandalCode('*'); setVillageCode('*');
    } else if (level === 'mandal') {
      setRefMandalId(refId); setRefVillageId('');
      setMandalCode(nextCode); setVillageCode('*');
    } else {
      setRefVillageId(refId);
      setVillageCode(nextCode);
    }
  };

  const beginOverride = () => {
    if (!document) return;
    const next = structuredClone(document);
    next.jurisdiction.countryCode = 'IN';
    next.jurisdiction.stateCode = code(stateCode);
    next.jurisdiction.districtCode = code(districtCode);
    next.jurisdiction.mandalCode = code(mandalCode);
    next.jurisdiction.villageCode = code(villageCode);
    if (code(stateCode) === '*') {
      next.jurisdiction.stateName = 'All states and union territories';
      next.jurisdiction.districtName = 'All districts';
      next.jurisdiction.authorityName = 'Government of India';
    } else {
      if (next.jurisdiction.stateCode !== policy.data?.stateCode) {
        next.jurisdiction.stateName = code(stateCode) === 'AP'
          ? 'Andhra Pradesh' : code(stateCode).replaceAll('_', ' ');
      }
      next.jurisdiction.districtName = code(districtCode) === '*'
        ? 'All districts' : code(districtCode).replaceAll('_', ' ');
    }
    next.jurisdiction.mandalName = code(mandalCode) === '*'
      ? 'All mandals' : code(mandalCode).replaceAll('_', ' ');
    next.jurisdiction.villageName = code(villageCode) === '*'
      ? 'All villages' : code(villageCode).replaceAll('_', ' ');
    setDraft(JSON.stringify(next, null, 2));
    setEditing(true);
    setView('manage');
    setManageError('');
  };

  const saveDraft = async () => {
    setManageError('');
    if (!reason.trim()) {
      setManageError('Record why this revision is needed.');
      return;
    }
    try {
      const result = await save.mutateAsync({
        countryCode: 'IN', stateCode: code(stateCode), districtCode: code(districtCode),
        mandalCode: code(mandalCode), villageCode: code(villageCode),
        document: draft, reason: reason.trim(),
        expectedRevision: exact ? (policy.data?.revision ?? 0) : 0,
      });
      if (!result.web.saveGovernancePolicy) {
        setManageError('The draft was not saved. Check the scope, document and current revision.');
        return;
      }
      setEditing(false);
      setReason('');
    } catch (error) {
      setManageError(error instanceof Error ? error.message : 'The draft was not saved.');
    }
  };

  const publishDraft = async () => {
    if (!policy.data || policy.data.status !== 'draft') return;
    setManageError('');
    try {
      const result = await publish.mutateAsync({ policyId: policy.data.id, reason: reason.trim() });
      if (!result.web.publishGovernancePolicy) setManageError('The draft was not published.');
      else setReason('');
    } catch (error) {
      setManageError(error instanceof Error ? error.message : 'The draft was not published.');
    }
  };

  const archivePolicy = async () => {
    if (!policy.data || !reason.trim()) {
      setManageError('Record why this scope is being archived.');
      return;
    }
    setManageError('');
    try {
      const result = await archive.mutateAsync({ policyId: policy.data.id, reason: reason.trim() });
      if (!result.web.archiveGovernancePolicy) {
        setManageError('That revision cannot be archived. The global fallback must stay published.');
      } else {
        setReason('');
        setEditing(false);
      }
    } catch (error) {
      setManageError(error instanceof Error ? error.message : 'The policy was not archived.');
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
      setVisualError('Record why these visual mappings are changing.');
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
        countryCode: 'IN', stateCode: code(stateCode), districtCode: code(districtCode),
        mandalCode: code(mandalCode), villageCode: code(villageCode),
        document: JSON.stringify(next), reason: visualReason.trim(),
        expectedRevision: exact ? (policy.data?.revision ?? 0) : 0,
      });
      if (!result.web.saveGovernancePolicy) {
        setVisualError('The visual mapping draft was not saved. Reload the scope and try again.');
        return;
      }
      setVisualEditing(false);
      setVisualReason('');
    } catch (error) {
      setVisualError(error instanceof Error ? error.message : 'The visual mapping draft was not saved.');
    }
  };

  if (portfolio.isLoading) return <main><Loading what="your administration access" h="24rem" /></main>;
  if (!allowed) {
    return (
      <main className="compliance-admin">
        <div className="compliance-denied">
          <LockOutlined sx={{ fontSize: 28 }} aria-hidden />
          <h1>Compliance administration is restricted</h1>
          <p>Only a super-admin can read policy drafts, provenance and publication controls.</p>
        </div>
      </main>
    );
  }
  if (policy.isLoading) return <main><Loading what="the compliance policy" h="24rem" /></main>;
  if (policy.error) return <main><Failed what="The compliance policy" error={policy.error} boxed h="24rem" /></main>;
  if (!document || !policy.data) {
    return <main><Failed what="The compliance policy document" boxed h="24rem" /></main>;
  }

  const sourceById = new Map(document.sources.map((source) => [source.id, source]));
  const visualOffers = (offers.data ?? []).filter(
    (offer) => !visualCategory || offer.group === visualCategory,
  );
  const visualCategories = [...new Set((offers.data ?? []).map((offer) => offer.group))];

  const scopeRows = policies.data ?? [];
  const stateOptions = scopeOptions(scopeRows, 'stateCode', {});
  const districtOptions = code(stateCode) === '*' ? []
    : scopeOptions(scopeRows, 'districtCode', { stateCode: code(stateCode) });
  const mandalOptions = code(districtCode) === '*' ? []
    : scopeOptions(scopeRows, 'mandalCode', { stateCode: code(stateCode), districtCode: code(districtCode) });
  const villageOptions = code(mandalCode) === '*' ? []
    : scopeOptions(scopeRows, 'villageCode', {
      stateCode: code(stateCode), districtCode: code(districtCode), mandalCode: code(mandalCode),
    });

  return (
    <main className="compliance-admin">
      <header className="compliance-titlebar">
        <div>
          <p className="eyebrow">Administration · Governance</p>
          <h1>Compliance rules</h1>
        </div>
        <div className="row tight compliance-status">
          <Pill kind={policy.data.status === 'published' ? 'owned' : 'managed'}>{policy.data.status}</Pill>
          <span className="mono">Revision {policy.data.revision}</span>
        </div>
      </header>

      <section className="compliance-scope" aria-label="Policy jurisdiction">
        <div className="compliance-review">
          <span className="eyebrow">Effective scope</span>
          <strong>{scopeLabel(code(stateCode), code(districtCode), code(mandalCode), code(villageCode))}</strong>
          <small>
            {exact ? 'This scope has its own policy.' : `Inherited from ${scopeLabel(
              policy.data.stateCode, policy.data.districtCode, policy.data.mandalCode, policy.data.villageCode,
            )}.`}
          </small>
        </div>

        <FacetFilter
          groups={[
            { key: 'state', label: 'State', options: stateOptions },
            { key: 'district', label: 'District', options: districtOptions },
            { key: 'mandal', label: 'Mandal', options: mandalOptions },
            { key: 'village', label: 'Village', options: villageOptions },
          ]}
          selected={{
            state: code(stateCode) !== '*' ? [code(stateCode)] : [],
            district: code(districtCode) !== '*' ? [code(districtCode)] : [],
            mandal: code(mandalCode) !== '*' ? [code(mandalCode)] : [],
            village: code(villageCode) !== '*' ? [code(villageCode)] : [],
          }}
          onToggle={toggleScope}
          onClear={clearScope}
          tally={plural(scopeRows.length, 'configured scope')}
          trailing={(
            <button type="button" className="btn sm" onClick={() => setAddingScope((value) => {
              const next = !value;
              if (next) {
                setRefStateId(''); setRefDistrictId(''); setRefMandalId(''); setRefVillageId('');
              }
              return next;
            })}>
              <AddOutlined sx={{ fontSize: 15 }} /> {addingScope ? 'Cancel new scope' : 'New scope'}
            </button>
          )}
          ariaLabel="Browse configured compliance policy scopes"
        />

        {addingScope && (
          <div className="compliance-new-scope" aria-label="Create a new policy scope">
            <ScopeLevelField id="gov-state" label="State" placeholder="e.g. AP"
                             options={geography.data?.states ?? []} selectedId={refStateId}
                             codeValue={stateCode} loading={geography.isLoading} disabled={false}
                             deriveCode={(row) => code(row.code || row.name)}
                             onChangeLevel={(next, refId) => setScopeLevel('state', next, refId)} />
            <ScopeLevelField id="gov-district" label="District" placeholder="e.g. GUNTUR"
                             options={geography.data?.districts ?? []} selectedId={refDistrictId}
                             codeValue={districtCode} loading={geography.isLoading} disabled={!refStateId}
                             deriveCode={(row) => code(row.name)}
                             onChangeLevel={(next, refId) => setScopeLevel('district', next, refId)} />
            <ScopeLevelField id="gov-mandal" label="Mandal" placeholder="e.g. TENALI"
                             options={geography.data?.mandals ?? []} selectedId={refMandalId}
                             codeValue={mandalCode} loading={geography.isLoading} disabled={!refDistrictId}
                             deriveCode={(row) => code(row.name)}
                             onChangeLevel={(next, refId) => setScopeLevel('mandal', next, refId)} />
            <ScopeLevelField id="gov-village" label="Village" placeholder="e.g. KOTTAPALEM"
                             options={geography.data?.villages ?? []} selectedId={refVillageId}
                             codeValue={villageCode} loading={geography.isLoading} disabled={!refMandalId}
                             deriveCode={(row) => code(row.name)}
                             onChangeLevel={(next, refId) => setScopeLevel('village', next, refId)} />
            <button type="button" className="btn primary sm" disabled={code(stateCode) === '*'}
                    onClick={() => { beginOverride(); setAddingScope(false); }}>
              {exact ? 'Create new revision' : `Create ${scopeLabel(
                code(stateCode), code(districtCode), code(mandalCode), code(villageCode),
              )} override`}
            </button>
          </div>
        )}
      </section>

      <div className="compliance-naming-trigger">
        <button type="button" className="btn sm" onClick={() => setNamingOpen(true)}>
          <InfoOutlined sx={{ fontSize: 15 }} /> Government naming for this scope
        </button>
      </div>

      {namingOpen && (
        <Drawer
          title="Government naming"
          sub={scopeLabel(
            document.jurisdiction.stateCode, document.jurisdiction.districtCode,
            document.jurisdiction.mandalCode ?? '*', document.jurisdiction.villageCode ?? '*',
          )}
          onClose={() => setNamingOpen(false)}
        >
          <dl className="compliance-naming-list">
            {Object.entries(document.jurisdiction.localTerms).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replace(/([A-Z])/g, ' $1')}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Drawer>
      )}

      <nav className="compliance-tabs" aria-label="Compliance policy views">
        {VIEWS.map((item) => (
          <button key={item.key} type="button" aria-pressed={view === item.key}
                  onClick={() => setView(item.key)}>{item.label}</button>
        ))}
      </nav>

      {view === 'records' && (
        <div className="compliance-checklist-grid">
          {document.propertyTypes.map((type) => (
            <Card key={type.key} title={type.label}>
              <div className="compliance-items">
                {type.items.map((item) => (
                  <div key={item.key} className="compliance-item">
                    <CheckCircleOutlineOutlined sx={{ fontSize: 18 }} aria-hidden />
                    <span>
                      <strong>{item.title}</strong><small>{item.why}</small>
                      <span className="row tight">
                        <span className={`pill ${item.level === 'required' ? 'owned' : 'managed'}`}>{item.level}</span>
                        {item.sourceIds.slice(0, 2).map((id) => (
                          <span className="note" key={id}>{sourceById.get(id)?.authority ?? id}</span>
                        ))}
                      </span>
                    </span>
                  </div>
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
            <section key={service.key} className="compliance-guide-band">
              <p className="eyebrow">{service.label}</p><h2>{service.purpose}</h2>
              <div className="compliance-three">
                <div><strong>Share</strong><ul>{service.share.map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><strong>Do not share</strong><ul>{service.doNotShare.map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><strong>Controls</strong><ul>{service.controls.map((item) => <li key={item}>{item}</li>)}</ul></div>
              </div>
            </section>
          ))}
        </div>
      )}

      {view === 'visuals' && (
        <section className="compliance-visuals">
          <div className="row between compliance-visuals-head">
            <div>
              <p className="eyebrow"><ImageOutlined sx={{ fontSize: 15 }} /> Service visual language</p>
              <h2>Show the work before asking people to read it</h2>
            </div>
            {!visualEditing && (
              <button type="button" className="btn" onClick={() => {
                setVisualEditing(true); setVisualError('');
              }}>
                <EditOutlined sx={{ fontSize: 16 }} /> Edit mappings
              </button>
            )}
          </div>

          {offers.isLoading ? <Loading what="the service visual library" h="14rem" />
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
                              <span className="pill managed">{offer.group}</span>
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
                <input id="visual-change-reason" value={visualReason} maxLength={4000}
                       placeholder="Why is this mapping clearer or more accurate?"
                       onChange={(event) => setVisualReason(event.target.value)} />
              </div>
              <div className="row tight">
                <button type="button" className="btn primary" disabled={busy}
                        onClick={() => void saveVisualMappings()}>Save audited draft</button>
                <button type="button" className="btn" disabled={busy} onClick={() => {
                  setVisualEditing(false); setVisualReason(''); setVisualError('');
                }}>Discard</button>
              </div>
              <p className="note">Publish the saved draft from Manage before owners see it.</p>
            </div>
          )}
          {visualError && (
            <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{visualError}</p>
          )}
        </section>
      )}

      {view === 'workforce' && (
        <section className="compliance-guide-band">
          <p className="eyebrow">Workforce governance</p>
          <h2>Who may receive company work</h2>
          <FacetFilter
            groups={[{
              key: 'category', label: 'Category',
              options: [...new Set((document.workforceCompliance ?? []).map((rule) => rule.category))]
                .map((category) => ({
                  key: category,
                  label: category.replaceAll('_', ' '),
                  count: (document.workforceCompliance ?? [])
                    .filter((rule) => rule.category === category).length,
                })),
            }]}
            selected={{ category: workforceCategory ? [workforceCategory] : [] }}
            onToggle={(_group, category) => setWorkforceCategory(
              (value) => value === category ? '' : category)}
            onClear={() => setWorkforceCategory('')}
            tally={`${(document.workforceCompliance ?? [])
              .filter((rule) => !workforceCategory || rule.category === workforceCategory).length} rules`}
            ariaLabel="Filter workforce governance rules"
          />
          <div className="compliance-items">
            {(document.workforceCompliance ?? [])
              .filter((rule) => !workforceCategory || rule.category === workforceCategory)
              .map((rule) => (
                <div key={rule.key} className="compliance-item">
                  <CheckCircleOutlineOutlined sx={{ fontSize: 18 }} aria-hidden />
                  <span>
                    <strong>{rule.title}</strong>
                    <small>{rule.rule}</small>
                    <span className="note">Enforced: {rule.enforcement}</span>
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {view === 'sharing' && (
        <section className="compliance-guide-band sharing-baseline">
          <PrivacyTipOutlined sx={{ fontSize: 28 }} aria-hidden />
          <p className="eyebrow">{document.secureSharing.label}</p>
          <h2>Share the property, not the person</h2>
          <div className="compliance-three">
            <div><strong>Purpose-relevant</strong><ul>{document.secureSharing.shareWhenNeeded.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><strong>Never by default</strong><ul>{document.secureSharing.neverByDefault.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><strong>Required controls</strong><ul>{document.secureSharing.controls.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>
        </section>
      )}

      {view === 'sources' && (
        <div className="compliance-source-list">
          {document.sources.map((source) => (
            <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
              <GavelOutlined sx={{ fontSize: 19 }} aria-hidden />
              <span><strong>{source.title}</strong><small>{source.authority}</small></span>
              <LaunchOutlined sx={{ fontSize: 16 }} aria-hidden />
            </a>
          ))}
        </div>
      )}

      {view === 'manage' && (
        <section className="compliance-manage">
          <div className="row between">
            <div><p className="eyebrow">Policy document</p><h2>{scopeKey}</h2></div>
            <div className="row tight">
              {!editing && (
                <button type="button" className="btn" onClick={beginOverride}>
                  <EditOutlined sx={{ fontSize: 16 }} /> {exact ? 'Create revision' : 'Create override'}
                </button>
              )}
              {exact && policy.data.status === 'draft' && !editing && (
                <button type="button" className="btn primary" disabled={busy}
                        onClick={() => void publishDraft()}>
                  <PublishOutlined sx={{ fontSize: 16 }} /> Publish draft
                </button>
              )}
            </div>
          </div>

          {editing && (
            <>
              <textarea className="input compliance-json" value={draft} spellCheck={false}
                        aria-label="Policy JSON document" onChange={(e) => setDraft(e.target.value)} />
              <div className="field">
                <label htmlFor="gov-reason">Change reason</label>
                <input id="gov-reason" value={reason} maxLength={4000}
                       onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="row tight">
                <button type="button" className="btn primary" disabled={busy}
                        onClick={() => void saveDraft()}>Save draft</button>
                <button type="button" className="btn" disabled={busy}
                        onClick={() => { setEditing(false); setManageError(''); }}>Discard edits</button>
              </div>
            </>
          )}

          {!editing && exact && (
            <div className="compliance-archive-row">
              <div className="field grow">
                <label htmlFor="gov-action-reason">Publication or archive reason</label>
                <input id="gov-action-reason" value={reason} maxLength={4000}
                       onChange={(e) => setReason(e.target.value)} />
              </div>
              <button type="button" className="btn danger" disabled={busy}
                      onClick={() => void archivePolicy()}>
                <ArchiveOutlined sx={{ fontSize: 16 }} /> Archive scope
              </button>
            </div>
          )}

          {manageError && <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{manageError}</p>}

          <div className="compliance-history">
            <p className="eyebrow"><HistoryOutlined sx={{ fontSize: 15 }} /> Change history</p>
            {/* villageCode is the only level with no levels below it — every
                wider scope has a wildcard tail, and that's exactly when the
                server cascades. Naming which levels are included would have
                to change with how many are still wildcarded, so this says
                only what's true at every depth: everything under the scope. */}
            {code(villageCode) === '*' && (
              <p className="note">Includes changes under {scopeKey}.</p>
            )}
            {(history.data ?? []).map((event) => (
              <div key={event.id}>
                <span><strong>{event.action}</strong><small>{event.detail}</small></span>
                <span className="note">
                  r{event.revision} · {event.actor} · {event.createdAt}
                  {event.scopeKey !== scopeKey && <> · {event.scopeKey}</>}
                </span>
                <span className="mono note">{event.sourceDigest.slice(0, 10)}</span>
              </div>
            ))}
            {!history.isLoading && (history.data?.length ?? 0) === 0 && (
              <p className="note">
                No changes have been recorded for {scopeKey}
                {code(villageCode) === '*' ? ' or anything under it.' : '.'}
              </p>
            )}
          </div>
        </section>
      )}

      <footer className="compliance-notice">
        <LockOutlined sx={{ fontSize: 17 }} aria-hidden />
        <span>{document.policy.legalNotice}</span>
        <span className="mono">{policy.data.sourceDigest.slice(0, 12)}</span>
      </footer>
    </main>
  );
}
