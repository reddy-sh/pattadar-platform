/**
 * "Register a Deed" dialog — functional port of the rhub RegisteredDocsView
 * modal: left panel imports a scanned registered document (PDF/image, English
 * or Telugu) through the AI extractor (/api/gateway/pattadar/
 * import-registered-document) with the rotating land-deed reading messages
 * and failure-reason surfacing; the right panel is the editable field form
 * that saves via createRegisteredDocument. The file is mirrored to My Drive
 * best-effort, exactly like the source.
 */
import { useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { apiFetch, gql } from '../../api/client';
import { uploadToDrive } from './storage';
import { useReadingMessage } from './readingMessages';

interface ExtractedParty {
  role?: string;
  name?: string;
  parentage?: string;
  is_gpa?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ExtractedFields {
  doc_type?: string;
  document_no?: string;
  reg_year?: string;
  sro?: string;
  consideration?: number;
  survey_no?: string;
  plot_no?: string;
  extent?: string;
  classification?: string;
  village?: string;
  district?: string;
  parties?: ExtractedParty[];
  boundaries?: { north?: string; south?: string; east?: string; west?: string };
  prior_document?: string;
  gpa_document?: string;
  [k: string]: any;
}

interface FormState {
  docType: string;
  documentNo: string;
  regYear: string;
  sro: string;
  consideration: string;
  surveyNo: string;
  plotNo: string;
  extent: string;
  classification: string;
  village: string;
  district: string;
}

const EMPTY_FORM: FormState = {
  docType: '',
  documentNo: '',
  regYear: '',
  sro: '',
  consideration: '',
  surveyNo: '',
  plotNo: '',
  extent: '',
  classification: '',
  village: '',
  district: '',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onToast: (msg: string, severity: 'success' | 'error' | 'info') => void;
}

export function DeedImportDialog({ open, onClose, onSaved, onToast }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [extracted, setExtracted] = useState<ExtractedFields | null>(null);
  const [importing, setImporting] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const readingMsg = useReadingMessage(importing);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleImport = async (file: File) => {
    setImporting(true);
    setFailReason('');
    setFileName(file.name);
    try {
      // My Drive mirror — best-effort, exactly like the source.
      void uploadToDrive(file);
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch('/api/gateway/pattadar/import-registered-document', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        // Hard failure (e.g. a 504 timeout) — surface the backend's readable error message.
        let reason = "Couldn't read this document — please fill in the details below.";
        try {
          const body = await res.json();
          if (body?.error) reason = String(body.error);
        } catch {
          /* keep fallback */
        }
        setFailReason(reason);
        setImporting(false);
        return;
      }
      const f = ((await res.json())?.fields || {}) as ExtractedFields;
      setExtracted(f);
      setForm({
        docType: f.doc_type || '',
        documentNo: f.document_no || '',
        regYear: f.reg_year || '',
        sro: f.sro || '',
        consideration: f.consideration ? String(f.consideration) : '',
        surveyNo: f.survey_no || '',
        plotNo: f.plot_no || '',
        extent: f.extent || '',
        classification: f.classification || '',
        village: f.village || '',
        district: f.district || '',
      });
      onToast(`Extracted ${f.doc_type || 'document'} ${f.document_no || ''} — review and save`, 'success');
    } catch {
      setFailReason("Couldn't read this document — please fill in the details below.");
    }
    setImporting(false);
  };

  const handleSave = async () => {
    if (!form.docType.trim()) {
      onToast('Document Type is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payloadObj = {
        ...(extracted || {}),
        doc_type: form.docType,
        document_no: form.documentNo,
        reg_year: form.regYear,
        sro: form.sro,
        consideration: Number(form.consideration) || 0,
        survey_no: form.surveyNo,
        plot_no: form.plotNo,
        extent: form.extent,
        classification: form.classification,
        village: form.village,
        district: form.district,
      };
      const data = await gql<{ createRegisteredDocument: { id: string } | null }>(
        'mutation($fileRef: String!, $payload: String!) { createRegisteredDocument(fileRef: $fileRef, payload: $payload) { id } }',
        { fileRef: '', payload: JSON.stringify(payloadObj) },
      );
      if (data?.createRegisteredDocument?.id) {
        onToast('Registered document saved', 'success');
        setForm(EMPTY_FORM);
        setExtracted(null);
        setFileName('');
        onSaved();
        onClose();
      } else {
        onToast('Could not save the deed', 'error');
      }
    } catch {
      onToast('Could not save the deed', 'error');
    }
    setSaving(false);
  };

  const handleClose = () => {
    setExtracted(null);
    setFailReason('');
    setFileName('');
    setForm(EMPTY_FORM);
    onClose();
  };

  const field = (k: keyof FormState, label: string, required = false) => (
    <TextField
      size="small"
      fullWidth
      required={required}
      label={label}
      value={form[k]}
      onChange={set(k)}
    />
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>Register a Deed</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '13fr 11fr' }, gap: 2.5, mt: 0.5 }}>
          {/* ── Left: AI import ─────────────────────────────────────── */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Import a registered document (AI)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Upload the scanned deed (PDF or image, English or Telugu). Key legal info is
              extracted for you to review; the file is also saved to your My Drive.
            </Typography>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImport(f);
                e.target.value = '';
              }}
            />
            <Button
              variant="outlined"
              fullWidth
              startIcon={importing ? <CircularProgress size={16} /> : <UploadFileOutlinedIcon />}
              disabled={importing}
              onClick={() => fileInput.current?.click()}
              sx={{ my: 1.5 }}
            >
              {importing ? 'Reading…' : 'Upload & extract'}
            </Button>
            {importing && (
              <Alert severity="info" icon={<CircularProgress size={16} />} sx={{ mb: 1.5 }}>
                {readingMsg}
              </Alert>
            )}
            {!importing && failReason && (
              <Alert severity="error" sx={{ mb: 1.5 }}>
                {failReason}
              </Alert>
            )}
            {fileName && !importing && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {fileName}
              </Typography>
            )}
            {extracted ? (
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Parties
                </Typography>
                {(extracted.parties || []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    —
                  </Typography>
                ) : (
                  (extracted.parties || []).map((p, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.25, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        label={p.role || 'party'}
                        color={p.role === 'buyer' ? 'success' : 'warning'}
                        variant="outlined"
                      />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {p.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {p.parentage}
                      </Typography>
                      {p.is_gpa && <Chip size="small" label="GPA" variant="outlined" />}
                    </Box>
                  ))
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Boundaries
                </Typography>
                <Typography variant="body2">
                  N: {extracted.boundaries?.north || '—'} · S: {extracted.boundaries?.south || '—'}
                  <br />
                  E: {extracted.boundaries?.east || '—'} · W: {extracted.boundaries?.west || '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Chain — prior: {extracted.prior_document || '—'} · GPA: {extracted.gpa_document || '—'}
                </Typography>
              </Box>
            ) : (
              !importing &&
              !failReason && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No document imported yet
                </Typography>
              )
            )}
          </Box>

          {/* ── Right: editable fields ───────────────────────────────── */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.25, alignContent: 'start' }}>
            <Box sx={{ gridColumn: 'span 3' }}>{field('docType', 'Document Type (Sale Deed / Gift / …)', true)}</Box>
            {field('documentNo', 'Doc No.')}
            {field('regYear', 'Year')}
            {field('sro', 'SRO')}
            <Box sx={{ gridColumn: 'span 3' }}>
              <TextField
                size="small"
                fullWidth
                type="number"
                label="Consideration (₹)"
                value={form.consideration}
                onChange={set('consideration')}
              />
            </Box>
            {field('surveyNo', 'Survey No.')}
            {field('plotNo', 'Plot No.')}
            {field('extent', 'Extent')}
            {field('classification', 'Classification')}
            {field('village', 'Village')}
            {field('district', 'District')}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving || importing}>
          {saving ? 'Saving…' : 'Save deed'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
