/* Hallmark · component: trust panel · genre: editorial · theme: Pattadar system
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass
 */
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import StarRounded from '@mui/icons-material/StarRounded';
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined';
import { Link } from 'react-router';

import type { AssignedResourceTrust } from './api';
import { plural } from './ui';

const stateWord = (state: string) => ({
  valid: 'Live', verified: 'Verified', expiring: 'Expiring soon',
  expired: 'Expired', lapsed: 'Expired', revoked: 'Revoked',
  tampered: 'Verification failed', pending: 'Under review', rejected: 'Not accepted',
}[state] ?? state.replaceAll('_', ' '));

export function AssignedResourceProof({ resource }: { resource: AssignedResourceTrust }) {
  const rating = resource.ratingCount > 0
    ? `${resource.ratingAverage.toFixed(1)} from ${plural(resource.ratingCount, 'service rating')}`
    : 'No service ratings yet';
  return (
    <section className="resource-proof" aria-label={`Verified work profile for ${resource.name}`}>
      <div className="resource-proof-head">
        <div>
          <p className="eyebrow">Verified work profile</p>
          <strong>{resource.role}</strong>
          {resource.firm && <span className="note">{resource.firm}</span>}
        </div>
        <span className={`resource-proof-state ${resource.professionalVerified ? 'good' : 'warn'}`}>
          <ShieldOutlined sx={{ fontSize: 16 }} aria-hidden />
          {resource.professionalVerified ? 'Professional proof checked' : 'No current professional proof'}
        </span>
      </div>

      <div className="resource-proof-metrics">
        <span><StarRounded sx={{ fontSize: 16 }} aria-hidden /> {rating}</span>
        <span>{plural(resource.jobsOpen, 'active Pattadar job')}</span>
      </div>

      {resource.professionalCredentials.length > 0 && (
        <div className="resource-proof-list" aria-label="Professional credentials">
          {resource.professionalCredentials.map((credential, index) => (
            <div className="resource-proof-row" key={`${credential.kind}-${index}`}>
              <ShieldOutlined sx={{ fontSize: 18 }} aria-hidden />
              <span className="grow">
                <strong>{credential.kind}</strong>
                <span className="note">
                  {[credential.authority, credential.numberMasked].filter(Boolean).join(' · ')}
                  {credential.expiresOn ? ` · valid until ${credential.expiresOn}` : ''}
                </span>
              </span>
              <span className={`state ${credential.state === 'verified' ? 'good' : credential.state === 'expiring' ? 'warn' : 'bad'}`}>
                {stateWord(credential.state)}
              </span>
            </div>
          ))}
        </div>
      )}

      {resource.trainingCertificates.length > 0 && (
        <div className="resource-proof-list" aria-label="Pattadar University certificates">
          {resource.trainingCertificates.map((certificate) => (
            <div className="resource-proof-row" key={certificate.certificateNo}>
              <WorkspacePremiumOutlined sx={{ fontSize: 18 }} aria-hidden />
              <span className="grow">
                <strong>{certificate.courseTitle}</strong>
                <span className="note">
                  {certificate.certificateNo}
                  {certificate.validUntil ? ` · valid until ${certificate.validUntil}` : ''}
                </span>
              </span>
              <Link
                className="btn sm resource-proof-link"
                to={`/certificate/${certificate.verificationCode}`}
                target="_blank"
                rel="noreferrer"
              >
                View certificate <OpenInNewRounded sx={{ fontSize: 14 }} aria-hidden />
              </Link>
            </div>
          ))}
        </div>
      )}

      <p className="resource-proof-privacy">
        You are seeing work identity and live credential status for this assignment.
        Personal evidence and private documents remain protected.
      </p>
    </section>
  );
}
