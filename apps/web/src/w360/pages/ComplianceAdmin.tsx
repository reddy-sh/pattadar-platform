import { useMemo, useState } from 'react';
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import LaunchOutlined from '@mui/icons-material/LaunchOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import PrivacyTipOutlined from '@mui/icons-material/PrivacyTipOutlined';

import {
  parseGovernanceDocument,
  useGovernanceAdminPolicy,
  usePortfolio,
  type GovernanceDocument,
} from '../api';
import { Card, Failed, Loading, Pill } from '../ui';

type View = 'records' | 'buyer' | 'seller' | 'services' | 'sharing' | 'sources';

const VIEWS: { key: View; label: string }[] = [
  { key: 'records', label: 'Property records' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'seller', label: 'Seller' },
  { key: 'services', label: 'Service requests' },
  { key: 'sharing', label: 'Secure sharing' },
  { key: 'sources', label: 'Sources' },
];

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
  const policy = useGovernanceAdminPolicy('IN', 'AP', '*', allowed);
  const document = useMemo(() => parseGovernanceDocument(policy.data), [policy.data]);
  const [view, setView] = useState<View>('records');

  if (portfolio.isLoading) return <main><Loading what="your administration access" h="24rem" /></main>;
  if (!allowed) {
    return (
      <main className="compliance-admin">
        <div className="compliance-denied">
          <LockOutlined sx={{ fontSize: 28 }} aria-hidden />
          <h1>Compliance administration is restricted</h1>
          <p>Only a super-admin can read policy drafts, source provenance and publication controls.</p>
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
          <p className="lede">The published baseline used when records are added, work is requested, and papers are shared.</p>
        </div>
        <div className="row tight compliance-status">
          <Pill kind="owned">Published</Pill>
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
          <label htmlFor="gov-state">State</label>
          <select id="gov-state" value="AP" aria-readonly="true" onChange={() => {}}>
            <option value="AP">Andhra Pradesh</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="gov-district">District scope</label>
          <select id="gov-district" value="*" aria-readonly="true" onChange={() => {}}>
            <option value="*">All districts</option>
          </select>
        </div>
        <div className="compliance-review">
          <span className="eyebrow">Review by</span>
          <strong>{document.policy.reviewBy}</strong>
          <small>{document.jurisdiction.authorityName}</small>
        </div>
      </section>

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
                      <strong>{item.title}</strong>
                      <small>{item.why}</small>
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
              <p className="eyebrow">{service.label}</p>
              <h2>{service.purpose}</h2>
              <div className="compliance-three">
                <div><strong>Share</strong><ul>{service.share.map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><strong>Do not share</strong><ul>{service.doNotShare.map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><strong>Controls</strong><ul>{service.controls.map((item) => <li key={item}>{item}</li>)}</ul></div>
              </div>
            </section>
          ))}
        </div>
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

      <footer className="compliance-notice">
        <LockOutlined sx={{ fontSize: 17 }} aria-hidden />
        <span>{document.policy.legalNotice}</span>
        <span className="mono">{policy.data.sourceDigest.slice(0, 12)}</span>
      </footer>
    </main>
  );
}
