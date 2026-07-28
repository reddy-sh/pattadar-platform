'use client';

/**
 * Parcel location dialog — port of the predecessor pattadar app's ParcelLocationModal:
 * pin a location or draw the boundary on the open-source map straight from the
 * holdings list, saved via updateParcelGeo.
 */
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { gql } from '../../api/client';
import { GeoMap } from '../../components/GeoMapLazy';

export type LocationTarget = { id: string; title: string; geoPoint: string; autoLocate: string } | null;

export function LocationDialog({
  target,
  onClose,
  onDone,
  notify,
}: {
  target: LocationTarget;
  onClose: () => void;
  onDone: () => void;
  notify: (msg: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
}) {
  const [geo, setGeo] = useState('');
  const [mapMode, setMapMode] = useState<'marker' | 'polygon'>('marker');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (target) {
      setGeo(target.geoPoint || '');
      setMapMode(target.geoPoint.includes('Polygon') ? 'polygon' : 'marker');
    }
  }, [target]);

  const save = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await gql(`mutation($id: String!, $geo: String!) { updateParcelGeo(parcelId: $id, geoPoint: $geo) { id } }`, {
        id: target.id,
        geo,
      });
      notify('Location saved', 'success');
      onDone();
      onClose();
    } catch {
      notify('Could not save location', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Location — {target?.title}</DialogTitle>
      <DialogContent>
        {target ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">
                Mode:
              </Typography>
              <TextField select size="small" value={mapMode} onChange={(e) => setMapMode(e.target.value as 'marker' | 'polygon')} sx={{ width: 170 }}>
                <MenuItem value="marker">Pin a location</MenuItem>
                <MenuItem value="polygon">Draw boundary</MenuItem>
              </TextField>
              <Typography variant="caption" color="text.secondary">
                OpenStreetMap · no account needed
              </Typography>
            </Box>
            <GeoMap key={mapMode} value={target.geoPoint} onChange={setGeo} mode={mapMode} height={430} label={target.title} autoLocate={target.autoLocate} />
          </>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save location'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
