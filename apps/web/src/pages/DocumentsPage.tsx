/**
 * Documents — drive-style list of everything uploaded: type chips (doc-type
 * taxonomy from the rhub docTypes.ts), the passbook/parcel each file is
 * linked to, and preview/download actions. Filter chips by document family.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { parseISOToDisplay } from '@pattadar/core';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useChartColors } from '../components/charts/chartColors';
import { useDocuments } from '../data/hooks';

/** Doc-type taxonomy (rhub docTypes.ts): key → label + family. */
const DOC_TYPES: Record<string, { label: string; family: string }> = {
  sale_deed: { label: 'Sale Deed', family: 'Deeds' },
  gift_deed: { label: 'Gift Deed', family: 'Deeds' },
  partition_deed: { label: 'Partition Deed', family: 'Deeds' },
  settlement_deed: { label: 'Settlement Deed', family: 'Deeds' },
  gpa: { label: 'GPA', family: 'Deeds' },
  mortgage: { label: 'Mortgage', family: 'Deeds' },
  ec: { label: 'Encumbrance Certificate', family: 'EC' },
  passbook: { label: 'Pattadar Passbook', family: 'Records' },
  ror_1b: { label: 'ROR / Adangal (1-B)', family: 'Records' },
  tax_receipt: { label: 'Tax Receipt', family: 'Records' },
  fmb: { label: 'FMB', family: 'Survey' },
  map: { label: 'Map / Survey Sketch', family: 'Survey' },
  legal_heir: { label: 'Legal Heir / Death Cert', family: 'Legal' },
  court_order: { label: 'Court Order', family: 'Legal' },
  photo: { label: 'Photo', family: 'Photos' },
  video: { label: 'Video', family: 'Photos' },
  other: { label: 'Other', family: 'Other' },
};

const FAMILIES = ['All', 'Deeds', 'EC', 'Records', 'Survey', 'Legal', 'Photos'];

/** Family → fixed categorical slot (color follows the entity). */
const FAMILY_SLOT: Record<string, number> = {
  Deeds: 3,
  EC: 1,
  Records: 0,
  Survey: 2,
  Legal: 4,
  Photos: 5,
  Other: 5,
};

export function DocumentsPage() {
  const { data, isSample } = useDocuments();
  const [family, setFamily] = useState('All');
  const colors = useChartColors();

  const parcelOf = new Map(data.parcels.map((p) => [p.id, `Sy ${p.surveyNo}`]));
  const passbookOf = new Map(data.passbooks.map((b) => [b.id, `Passbook ${b.pattadarNo}`]));

  const rows = data.documents.filter((doc) => {
    if (family === 'All') return true;
    const t = DOC_TYPES[doc.docType] ?? DOC_TYPES.other;
    return t.family === family;
  });

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Deeds, passbooks, certificates and photos — every file linked to the land it belongs to."
        sample={isSample}
      />

      <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
        {FAMILIES.map((f) => (
          <Chip
            key={f}
            size="small"
            label={f}
            color={family === f ? 'primary' : 'default'}
            variant={family === f ? 'filled' : 'outlined'}
            onClick={() => setFamily(f)}
          />
        ))}
      </Box>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<DescriptionOutlinedIcon />}
            title={family === 'All' ? 'No documents yet' : `No ${family.toLowerCase()} here yet`}
            description="Upload a deed or passbook photo — it is read automatically and filed under the right parcel."
          />
        </Card>
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>File</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Linked to</TableCell>
                  <TableCell>Added</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((doc) => {
                  const t = DOC_TYPES[doc.docType] ?? DOC_TYPES.other;
                  const dotColor = colors[FAMILY_SLOT[t.family] ?? 5];
                  const linked =
                    (doc.parcelId && parcelOf.get(doc.parcelId)) ||
                    (doc.passbookId && passbookOf.get(doc.passbookId)) ||
                    '—';
                  const isImage = /\.(jpe?g|png|webp)$/i.test(doc.fileRef);
                  return (
                    <TableRow key={doc.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ color: 'text.secondary', display: 'flex' }}>
                            {isImage ? <ImageOutlinedIcon fontSize="small" /> : <PictureAsPdfOutlinedIcon fontSize="small" />}
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {doc.fileRef}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          icon={
                            <Box
                              component="span"
                              sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor, ml: '6px !important' }}
                            />
                          }
                          label={t.label}
                        />
                      </TableCell>
                      <TableCell>{linked}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{parseISOToDisplay(doc.createdAt)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title={isSample ? 'Available with live data' : 'Preview'}>
                          <span>
                            <IconButton size="small" disabled={isSample} aria-label={`Preview ${doc.fileRef}`}>
                              <VisibilityOutlinedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={isSample ? 'Available with live data' : 'Download'}>
                          <span>
                            <IconButton size="small" disabled={isSample} aria-label={`Download ${doc.fileRef}`}>
                              <FileDownloadOutlinedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </>
  );
}
