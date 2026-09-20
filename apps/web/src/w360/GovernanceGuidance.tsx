/** Contextual slices of the published compliance policy.
 *
 * The admin screen owns the full document. These components deliberately show
 * only the small part needed to make a record, service request or share safer.
 */
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined';
import PrivacyTipOutlined from '@mui/icons-material/PrivacyTipOutlined';
import ReportOutlined from '@mui/icons-material/ReportOutlined';

import {
  parseGovernanceDocument,
  useGovernancePolicy,
  type GovernanceDocument,
  type GovernancePropertyType,
} from './api';

function propertyChecklist(
  document: GovernanceDocument | null, kind: string, classification: string,
): GovernancePropertyType | null {
  if (!document) return null;
  const cls = classification.toLowerCase();
  return document.propertyTypes.find((item) => item.matches.includes(cls))
    ?? document.propertyTypes.find((item) => item.matches.includes(kind.toLowerCase()))
    ?? null;
}

export function RecordComplianceGuidance({
  kind, classification, district = '*', compact = false,
}: {
  kind: string; classification: string; district?: string; compact?: boolean;
}) {
  const query = useGovernancePolicy('IN', 'AP', district || '*');
  const document = parseGovernanceDocument(query.data);
  const checklist = propertyChecklist(document, kind, classification);
  if (!checklist) return null;
  const items = compact ? checklist.items.slice(0, 4) : checklist.items;

  return (
    <section className="governance-guidance" aria-label={`${checklist.label} records guidance`}>
      <div className="governance-guidance-head">
        <CheckCircleOutlineOutlined sx={{ fontSize: 18 }} aria-hidden />
        <span>
          <strong>{checklist.label} baseline</strong>
          <small>{document?.jurisdiction.stateName} · published guidance</small>
        </span>
      </div>
      <ul>
        {items.map((item) => <li key={item.key}>{item.title}</li>)}
      </ul>
      {compact && checklist.items.length > items.length && (
        <p className="note">Add the record first to see the complete checklist against its papers.</p>
      )}
    </section>
  );
}

export function ServiceRequestGuidance({
  serviceKind, district = '*',
}: { serviceKind: string; district?: string }) {
  const query = useGovernancePolicy('IN', 'AP', district || '*');
  const document = parseGovernanceDocument(query.data);
  if (!document) return null;
  const survey = /survey|boundary|fmb|demarc/i.test(serviceKind);
  const guide = document.serviceRequests.find((item) => item.key === (survey ? 'land_survey' : 'document_fetch'));
  if (!guide) return null;

  return (
    <section className="governance-guidance service-guidance" aria-label="Service request sharing guidance">
      <div className="governance-guidance-head">
        <PrivacyTipOutlined sx={{ fontSize: 18 }} aria-hidden />
        <span><strong>What this request needs</strong><small>{guide.label}</small></span>
      </div>
      <div className="governance-columns">
        <div>
          <span className="eyebrow">Share for this work</span>
          <ul>{guide.share.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div>
          <span className="eyebrow">Keep out by default</span>
          <ul>{guide.doNotShare.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>
      <p className="note">{guide.controls[0]}. {guide.controls[guide.controls.length - 1]}.</p>
    </section>
  );
}

export function SecureShareGuidance({ district = '*' }: { district?: string }) {
  const query = useGovernancePolicy('IN', 'AP', district || '*');
  const document = parseGovernanceDocument(query.data);
  const guide = document?.secureSharing;
  if (!guide) return null;
  return (
    <section className="governance-guidance share-guidance" aria-label="Secure sharing guidance">
      <div className="governance-guidance-head">
        <ReportOutlined sx={{ fontSize: 18 }} aria-hidden />
        <span><strong>Share the property, not the person</strong><small>Purpose-limited access</small></span>
      </div>
      <p className="note">
        Choose only the papers needed for this purpose. Do not share {guide.neverByDefault.slice(0, 4).join(', ')} by default.
      </p>
      <p className="note">{guide.controls.slice(0, 3).join(' · ')}</p>
    </section>
  );
}
