/**
 * Help & support, at /app/help — the rail's "Help & resources" group opens it.
 *
 * Every way to get an answer that already exists, in one place: the in-app
 * assistant, the support inbox the iOS and Expo apps already offer, the
 * grievance officer the privacy notice names, Pattadar University, and the
 * policies. Nothing here is a new channel; it only gathers the existing ones.
 */
import { Link, useOutletContext } from 'react-router';

import MailOutlined from '@mui/icons-material/MailOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';

import { GRIEVANCE_EMAIL, SUPPORT_EMAIL, UNIVERSITY_URL } from '../../lib/links';
import type { ShellContext } from '../Shell';
import { Card, PageHead } from '../ui';

export function Help() {
  const shell = useOutletContext<ShellContext | undefined>();
  return (
    <main>
      <PageHead title="Help & support" />
      <div style={{
        display: 'grid', gap: 'var(--space-md)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 20rem), 1fr))', maxWidth: '64rem',
      }}>
        <Card title="Ask the assistant">
          <p className="note" style={{ marginTop: 0 }}>
            Questions about your records, documents and how Pattadar works, answered in the app.
          </p>
          <button type="button" className="btn primary" onClick={() => shell?.openAssistant()}
                  disabled={!shell}>
            <SmartToyOutlined sx={{ fontSize: 16 }} aria-hidden /> Open the assistant
          </button>
        </Card>

        <Card title="Contact support">
          <p className="note" style={{ marginTop: 0 }}>
            For a problem with your records, a service you ordered or your account. Include the
            reference shown on the screen. Never email a password or a full Aadhaar number.
          </p>
          <a className="btn" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Pattadar help')}`}>
            <MailOutlined sx={{ fontSize: 16 }} aria-hidden /> {SUPPORT_EMAIL}
          </a>
        </Card>

        <Card title="Pattadar University">
          <p className="note" style={{ marginTop: 0 }}>
            Learn the standards behind careful land work: owner privacy, evidence handling, field
            safety and local compliance.
          </p>
          <a className="btn" href={UNIVERSITY_URL} target="_blank" rel="noopener noreferrer">
            <SchoolOutlined sx={{ fontSize: 16 }} aria-hidden /> Open Pattadar University
            <OpenInNewOutlined sx={{ fontSize: 14 }} aria-label="opens in a new tab" />
          </a>
        </Card>

        <Card title="Privacy, data and grievances">
          <p className="note" style={{ marginTop: 0 }}>
            Export your data, manage consent or request deletion from{' '}
            <Link to="/app/account">Privacy &amp; your data</Link>. For a privacy concern or a
            complaint, write to the grievance officer at{' '}
            <a href={`mailto:${GRIEVANCE_EMAIL}`}>{GRIEVANCE_EMAIL}</a>.
          </p>
          <p className="note" style={{ marginBottom: 0 }}>
            <Link to="/privacy">Privacy notice</Link> · <Link to="/terms">Terms of use</Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
