/**
 * Manual Add-Parcel dialog — port of the rhub pattadar app's "Add Parcel"
 * modal (ParcelsView): passbook, survey number/sub-division, extent + unit
 * (converted to canonical acres), classification, acquisition source and an
 * optional cost-per-acre saved as acquisition cost (extent × cost/acre).
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { toAcres, unitKey } from '@pattadar/core';
import { gql } from '../../api/client';

const PARCEL_UNIT_OPTIONS = [
  { value: 'acre', label: 'Acres' },
  { value: 'cent', label: 'Cents' },
  { value: 'gunta', label: 'Guntas' },
  { value: 'sqyd', label: 'Sq. yards' },
  { value: 'sqft', label: 'Sq. feet' },
  { value: 'hectare', label: 'Hectares' },
  { value: 'ankanam', label: 'Ankanam' },
];

const ACQUISITION_OPTIONS = ['sale', 'gift', 'inheritance', 'partition', 'will', 'grant'];

interface PassbookOption {
  id: string;
  pattadarNo: string;
  village: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  passbooks: PassbookOption[];
  notify: (msg: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
}

export function AddParcelDialog({ open, onClose, onCreated, passbooks, notify }: Props) {
  const [passbookId, setPassbookId] = useState('');
  const [surveyNo, setSurveyNo] = useState('');
  const [subdivision, setSubdivision] = useState('');
  const [extent, setExtent] = useState('');
  const [unit, setUnit] = useState('acre');
  const [classification, setClassification] = useState('agri');
  const [acquisitionSource, setAcquisitionSource] = useState('sale');
  const [costPerAcre, setCostPerAcre] = useState('');
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const reset = () => {
    setPassbookId('');
    setSurveyNo('');
    setSubdivision('');
    setExtent('');
    setUnit('acre');
    setClassification('agri');
    setAcquisitionSource('sale');
    setCostPerAcre('');
    setTried(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  const handleCreate = async () => {
    setTried(true);
    if (!passbookId || !surveyNo || !(parseFloat(extent) > 0)) return;
    setSaving(true);
    try {
      const extentAcres = toAcres(parseFloat(extent), unitKey(unit));
      const data = await gql<{ createParcel: { id: string } | null }>(
        'mutation($passbookId: String!, $surveyNo: String!, $subdivision: String!, $extent: Float!, $unit: String!, $classification: String!, $acquisitionSource: String!) { createParcel(passbookId: $passbookId, surveyNo: $surveyNo, subdivision: $subdivision, extent: $extent, unit: $unit, classification: $classification, acquisitionSource: $acquisitionSource) { id } }',
        { passbookId, surveyNo, subdivision: subdivision || '', extent: extentAcres, unit, classification, acquisitionSource },
      );
      const pid = data?.createParcel?.id;
      if (pid && Number(costPerAcre) > 0) {
        await gql(
          'mutation($id: String!, $purchasePrice: Float!) { updateParcel(id: $id, purchasePrice: $purchasePrice) { id } }',
          { id: pid, purchasePrice: Math.round(Number(costPerAcre) * extentAcres) },
        );
      }
      if (data) {
        notify('Parcel created', 'success');
        close();
        onCreated();
      }
    } catch {
      notify("Couldn't create the parcel — try again", 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>Add Parcel</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 1.5, pt: 0.5 }}>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <TextField
              select
              size="small"
              fullWidth
              required
              label="Passbook"
              value={passbookId}
              error={tried && !passbookId}
              onChange={(e) => setPassbookId(e.target.value)}
            >
              {passbooks.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.pattadarNo} ({p.village})
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <TextField
            size="small"
            required
            label="Survey Number"
            value={surveyNo}
            error={tried && !surveyNo}
            onChange={(e) => setSurveyNo(e.target.value)}
          />
          <TextField size="small" label="Sub-division" value={subdivision} onChange={(e) => setSubdivision(e.target.value)} />
          <TextField
            size="small"
            required
            label="Extent"
            type="number"
            value={extent}
            error={tried && !(parseFloat(extent) > 0)}
            onChange={(e) => setExtent(e.target.value)}
          />
          <TextField select size="small" required label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {PARCEL_UNIT_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            required
            label="Classification"
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
          >
            <MenuItem value="agri">Agricultural</MenuItem>
            <MenuItem value="non-agri">Non-Agricultural</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            required
            label="Acquisition Source"
            value={acquisitionSource}
            onChange={(e) => setAcquisitionSource(e.target.value)}
          >
            {ACQUISITION_OPTIONS.map((o) => (
              <MenuItem key={o} value={o}>
                {o.charAt(0).toUpperCase() + o.slice(1)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Cost per acre (₹)"
            type="number"
            value={costPerAcre}
            onChange={(e) => setCostPerAcre(e.target.value)}
            helperText="Optional — saved as acquisition cost (extent × cost/acre)"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleCreate()} disabled={saving}>
          {saving ? 'Saving…' : 'OK'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
