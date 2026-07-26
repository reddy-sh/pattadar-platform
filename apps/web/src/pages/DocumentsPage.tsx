/**
 * Documents — the full documents experience from the current rhub pattadar
 * app, in two tabs:
 *   · All documents  — every classified file (DocumentsView table mode +
 *     FilesPanel upload/AI-classify pipeline, links, trash flow)
 *   · Registered deeds — AI-imported registered documents (RegisteredDocsView
 *     + inline deed detail, Add-as-Parcel / Link-to-Passbook)
 * The old /app/deeds route redirects here.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { PageHeader } from '../components/PageHeader';
import { useDocuments } from '../data/hooks';
import { DocumentsTab } from './documents/DocumentsTab';
import { RegisteredDeedsTab } from './documents/RegisteredDeedsTab';

interface Toast {
  msg: string;
  severity: 'success' | 'error' | 'info';
}

export function DocumentsPage() {
  const [searchParams] = useSearchParams();
  const { isSample } = useDocuments();
  const [tab, setTab] = useState<'all' | 'deeds'>(searchParams.get('tab') === 'deeds' ? 'deeds' : 'all');
  const [toast, setToast] = useState<Toast | null>(null);
  const onToast = (msg: string, severity: Toast['severity']) => setToast({ msg, severity });

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Deeds, passbooks, certificates and photos — every file linked to the land it belongs to."
        sample={isSample}
      />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="All documents" value="all" />
        <Tab label="Registered deeds" value="deeds" />
      </Tabs>
      {tab === 'all' ? <DocumentsTab onToast={onToast} /> : <RegisteredDeedsTab onToast={onToast} />}
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast?.severity ?? 'info'} onClose={() => setToast(null)} variant="filled">
          {toast?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
