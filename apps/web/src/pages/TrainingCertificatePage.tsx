import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';

import { gql } from '../api/client';
import type { TrainingCertificate } from '../w360/api';
import { TRAINING_CERTIFICATE } from '../w360/api';
import './TrainingCertificatePage.css';

type Answer = { trainingCertificate: TrainingCertificate | null };
type Feedback = '' | 'Link copied' | 'Verification code copied' | 'Sharing is not available';

const date = (value: string) => {
  if (!value) return 'No expiry';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const stateCopy = (state: string) => ({
  valid: ['Verified', 'Signature, identity and status are current'],
  revoked: ['Revoked', 'This certificate is no longer valid'],
  expired: ['Expired', 'The validity period has ended'],
  tampered: ['Verification failed', 'The signed record does not match'],
}[state] ?? [state, 'Check the live record before relying on it']);

function Marks({ certificate }: { certificate: TrainingCertificate }) {
  const qr = useRef<HTMLCanvasElement>(null);
  const barcode = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (qr.current) {
      void QRCode.toCanvas(qr.current, window.location.href, {
        errorCorrectionLevel: 'H', width: 144, margin: 1,
        color: { dark: '#17120f', light: '#fffdf9' },
      });
    }
    if (barcode.current) {
      JsBarcode(barcode.current, certificate.certificateNo, {
        format: 'CODE128', displayValue: false, height: 40, margin: 0,
        background: '#fffdf9', lineColor: '#17120f',
      });
    }
  }, [certificate.certificateNo]);
  return (
    <div className="certificateMarks">
      <div className="certificateQr">
        <canvas ref={qr} aria-label="QR code for live certificate verification" />
        <span>Scan to verify live</span>
      </div>
      <div className="certificateBarcode">
        <svg ref={barcode} aria-label={`Barcode ${certificate.certificateNo}`} />
        <span>{certificate.certificateNo}</span>
      </div>
    </div>
  );
}

function UniversityMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`universityMark${small ? ' small' : ''}`} aria-hidden>
      <span className="universityMonogram">PU</span>
      <span className="universityRing">Pattadar<br />University</span>
    </span>
  );
}

export function TrainingCertificatePage() {
  const { code = '' } = useParams();
  const [certificate, setCertificate] = useState<TrainingCertificate | null>();
  const [feedback, setFeedback] = useState<Feedback>('');

  useEffect(() => {
    let live = true;
    void gql<Answer>(`query VerifyTrainingCertificate($code:String!) {
      trainingCertificate(code:$code) { ${TRAINING_CERTIFICATE} }
    }`, { code }).then((result) => {
      if (live) setCertificate(result.trainingCertificate);
    }).catch(() => { if (live) setCertificate(null); });
    return () => { live = false; };
  }, [code]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(''), 2400);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const copy = async (value: string, message: Feedback) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(message);
    } catch {
      setFeedback('Sharing is not available');
    }
  };

  const share = async () => {
    if (!certificate) return;
    const data = {
      title: `${certificate.recipientName} - Pattadar University certificate`,
      text: `Verify ${certificate.recipientName}'s ${certificate.courseTitle} certificate.`,
      url: window.location.href,
    };
    if (navigator.share) {
      try { await navigator.share(data); } catch { /* A cancelled share needs no warning. */ }
      return;
    }
    await copy(window.location.href, 'Link copied');
  };

  if (certificate === undefined) {
    return (
      <main className="certificatePage certificatePending">
        <UniversityMark />
        <p className="certificateLoading">Checking the signed Pattadar record...</p>
      </main>
    );
  }
  if (!certificate) {
    return (
      <main className="certificatePage certificateInvalidPage">
        <section className="certificateInvalid">
          <UniversityMark />
          <p className="certificateOverline">Pattadar University verification</p>
          <h1>Certificate not verified</h1>
          <p>The code is invalid or does not match a certificate issued by Pattadar.</p>
          <Link to="/">Return to Pattadar</Link>
        </section>
      </main>
    );
  }

  const state = certificate.verificationState;
  const [stateTitle, stateDetail] = stateCopy(state);
  return (
    <main className="certificatePage" data-status={state}>
      <nav className="certificateToolbar" aria-label="Certificate actions">
        <Link className="certificateToolbarBrand" to="/">
          <UniversityMark small />
          <span><strong>Pattadar University</strong><small>Public credential</small></span>
        </Link>
        <div className="certificateActions">
          <button type="button" onClick={() => { void copy(window.location.href, 'Link copied'); }}>
            <ContentCopyOutlined sx={{ fontSize: 17 }} aria-hidden /> Copy link
          </button>
          <button type="button" onClick={() => { void share(); }}>
            <ShareOutlined sx={{ fontSize: 17 }} aria-hidden /> Share
          </button>
          <button type="button" onClick={() => window.print()}>
            <PrintOutlined sx={{ fontSize: 17 }} aria-hidden /> Print / PDF
          </button>
        </div>
      </nav>

      <section className="trainingCertificate" aria-labelledby="certificate-title">
        <div className="certificateFrame">
          <header className="certificateHead">
            <div className="certificateIdentity">
              <UniversityMark />
              <div>
                <p className="certificateBrand">Pattadar University</p>
                <p className="certificateKicker">Certificate of training completion</p>
              </div>
            </div>
            <div className={`certificateStatus ${state}`} role="status">
              <VerifiedRounded sx={{ fontSize: 22 }} aria-hidden />
              <span><strong>{stateTitle}</strong><small>{stateDetail}</small></span>
            </div>
          </header>

          <div className="certificateBody">
            <div className="certificateWatermark" aria-hidden>PU</div>
            <p className="certificateOverline">Pattadar University hereby certifies that</p>
            <h1 id="certificate-title">{certificate.recipientName}</h1>
            <span className="certificateRule" aria-hidden />
            <p>has successfully completed the assessed learning programme</p>
            <h2>{certificate.courseTitle}</h2>
            <p className="certificateCourse">
              {certificate.courseCode} / Version {certificate.courseVersion} / {certificate.hours} learning hours
            </p>
            {certificate.skills.length > 0 && (
              <div className="certificateSkills" aria-label="Demonstrated capabilities">
                {certificate.skills.map((skill) => <span key={skill}>{skill}</span>)}
              </div>
            )}
          </div>

          <div className="certificateLower">
            <dl className="certificateFacts">
              <div><dt>Certificate number</dt><dd>{certificate.certificateNo}</dd></div>
              <div><dt>Completed</dt><dd>{date(certificate.completedOn)}</dd></div>
              <div><dt>Issued</dt><dd>{date(certificate.issuedOn)}</dd></div>
              <div><dt>Valid until</dt><dd>{date(certificate.validUntil)}</dd></div>
            </dl>
            <div className="certificateSignatures">
              <div><span className="signatureName">{certificate.trainerName}</span><small>Trainer</small></div>
              <div><span className="signatureName">{certificate.trainerRef || 'Pattadar University'}</span><small>Faculty reference</small></div>
            </div>
          </div>

          {state === 'revoked' && (
            <div className="certificateNotice">Revoked {date(certificate.revokedAt)}. {certificate.revokeReason}</div>
          )}
          {state === 'expired' && <div className="certificateNotice">This credential has expired.</div>}
          {state === 'tampered' && <div className="certificateNotice">The signed record no longer matches this certificate.</div>}

          <div className="certificateVerification">
            <div className="verificationCopy">
              <p className="certificateOverline">Independent live verification</p>
              <h3>Trust the record, not the screenshot.</h3>
              <p>Scan the code or open this public link to check signature integrity, validity and revocation status directly with Pattadar.</p>
              <button type="button" onClick={() => { void copy(certificate.verificationCode, 'Verification code copied'); }}>
                <ContentCopyOutlined sx={{ fontSize: 15 }} aria-hidden /> Copy verification code
              </button>
            </div>
            <Marks certificate={certificate} />
          </div>

          <footer className="certificateFoot">
            <p>Internal company training credential. It is not a government licence, professional registration, or authority to perform regulated work.</p>
            <p className="certificateCode">{certificate.verificationCode}</p>
          </footer>
        </div>
      </section>
      <p className="certificateFeedback" role="status" aria-live="polite">{feedback}</p>
    </main>
  );
}
