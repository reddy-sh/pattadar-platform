import { useEffect, useMemo, useState } from 'react';
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

import {
  parseGovernanceDocument,
  useArchiveGovernancePolicy,
  useGovernanceAdminPolicies,
  useGovernanceAdminPolicy,
  useGovernancePolicyHistory,
  usePortfolio,
  usePublishGovernancePolicy,
  useSaveGovernancePolicy,
  type GovernanceDocument,
} from '../api';
import { Card, Failed, Loading, Pill } from '../ui';

type View = 'records' | 'buyer' | 'seller' | 'services' | 'workforce' | 'sharing' | 'sources' | 'manage';

const VIEWS: { key: View; label: string }[] = [
  { key: 'records', label: 'Property records' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'seller', label: 'Seller' },
  { key: 'services', label: 'Service requests' },
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
  const scopeKey = `IN/${code(stateCode)}/${code(districtCode)}`;
  const policy = useGovernanceAdminPolicy('IN', code(stateCode), code(districtCode), allowed);
  const policies = useGovernanceAdminPolicies('IN', allowed);
  const history = useGovernancePolicyHistory(scopeKey, allowed);
  const document = useMemo(() => parseGovernanceDocument(policy.data), [policy.data]);
  const [view, setView] = useState<View>('records');
  const [workforceCategory, setWorkforceCategory] = useState('');
  const [editing, setEditing] = useState(false);
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

  const chooseScope = (key: string) => {
    const [, state = '*', district = '*'] = key.split('/');
    setStateCode(state);
    setDistrictCode(district);
    setEditing(false);
    setReason('');
    setManageError('');
  };

  const beginOverride = () => {
    if (!document) return;
    const next = structuredClone(document);
    next.jurisdiction.countryCode = 'IN';
    next.jurisdiction.stateCode = code(stateCode);
    next.jurisdiction.districtCode = code(districtCode);
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

  return (
    <main className="compliance-admin">
      <header className="compliance-titlebar">
        <div>
          <p className="eyebrow">Administration · Governance</p>
          <h1>Compliance rules</h1>
          <p className="lede">Published guidance for records, service requests and secure sharing.</p>
        </div>
        <div className="row tight compliance-status">
          <Pill kind={policy.data.status === 'published' ? 'owned' : 'managed'}>{policy.data.status}</Pill>
          <span className="mono">Revision {policy.data.revision}</span>
        </div>
      </header>

      <section className="compliance-scope" aria-label="Policy jurisdiction">
        <div className="field">
          <label htmlFor="gov-country">Country</label>
          <select id="gov-country" value="IN" aria-readonly="true" onChange={() => {}}>
            <option value="IN">India</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="gov-state">State code</label>
          <input id="gov-state" value={stateCode} maxLength={16}
                 onChange={(e) => { setStateCode(code(e.target.value)); setDistrictCode('*'); setEditing(false); }} />
        </div>
        <div className="field">
          <label htmlFor="gov-district">District code</label>
          <input id="gov-district" value={districtCode} maxLength={80}
                 disabled={code(stateCode) === '*'}
                 onChange={(e) => { setDistrictCode(code(e.target.value)); setEditing(false); }} />
        </div>
        <div className="compliance-review">
          <span className="eyebrow">Effective scope</span>
          <strong>{policy.data.scopeKey}</strong>
          <small>{exact ? 'Exact policy' : `Inherited by ${scopeKey}`}</small>
        </div>
      </section>

      <div className="compliance-scope-list" aria-label="Configured policy scopes">
        {(policies.data ?? []).map((item) => (
          <button key={item.scopeKey} type="button" className="chip"
                  aria-pressed={scopeKey === item.scopeKey}
                  onClick={() => chooseScope(item.scopeKey)}>
            {item.scopeKey} · r{item.revision} · {item.status}
          </button>
        ))}
        {!exact && (
          <button type="button" className="btn sm" onClick={beginOverride}>
            <AddOutlined sx={{ fontSize: 15 }} /> Create {scopeKey} override
          </button>
        )}
      </div>

      <section className="compliance-terms" aria-label="Government terminology">
        <span className="eyebrow">Government naming</span>
        <div className="compliance-term-grid">
          {Object.entries(document.jurisdiction.localTerms).map(([key, value]) => (
            <div key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><strong>{value}</strong></div>
          ))}
        </div>
      </section>

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

      {view === 'workforce' && (
        <section className="compliance-guide-band">
          <p className="eyebrow">Workforce governance</p>
          <h2>Who may receive company work</h2>
          <div className="row tight" style={{ marginBottom: 'var(--space-md)' }}>
            {[...new Set((document.workforceCompliance ?? []).map((rule) => rule.category))].map((category) => (
              <button key={category} type="button" className="chip"
                      aria-pressed={workforceCategory === category}
                      onClick={() => setWorkforceCategory((value) => value === category ? '' : category)}>
                {category.replaceAll('_', ' ')}
              </button>
            ))}
            {workforceCategory && (
              <button type="button" className="clearall" onClick={() => setWorkforceCategory('')}>Clear</button>
            )}
          </div>
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
            {(history.data ?? []).map((event) => (
              <div key={event.id}>
                <span><strong>{event.action}</strong><small>{event.detail}</small></span>
                <span className="note">r{event.revision} · {event.actor} · {event.createdAt}</span>
                <span className="mono note">{event.sourceDigest.slice(0, 10)}</span>
              </div>
            ))}
            {!history.isLoading && (history.data?.length ?? 0) === 0 && (
              <p className="note">No changes have been recorded for {scopeKey}.</p>
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
