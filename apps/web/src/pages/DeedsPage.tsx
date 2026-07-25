/**
 * Deeds — registered documents: doc no, type, SRO, parties, consideration,
 * stamp duty, date. (Parties and stamp duty are sample-only enrichments;
 * live rows show "—" until the API carries them.)
 */
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import { formatINRCompact, parseISOToDisplay } from '@pattadar/core';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useDeeds } from '../data/hooks';

export function DeedsPage() {
  const { data: deeds, isSample } = useDeeds();

  return (
    <>
      <PageHeader
        title="Deeds"
        subtitle="Registered documents — the sale, gift and partition deeds behind your holdings."
        sample={isSample}
      />
      {deeds.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HistoryEduOutlinedIcon />}
            title="No registered deeds yet"
            description="Upload a deed under Documents and its registration details will appear here."
          />
        </Card>
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Doc no</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>SRO</TableCell>
                  <TableCell>Survey / plot</TableCell>
                  <TableCell>Village</TableCell>
                  <TableCell>Parties</TableCell>
                  <TableCell align="right">Consideration</TableCell>
                  <TableCell align="right">Stamp duty</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deeds.map((d) => (
                  <TableRow key={d.id} hover>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{d.documentNo}</TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" label={d.docType} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{d.sro}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {d.surveyNo ? `Sy ${d.surveyNo}` : d.plotNo ? `Plot ${d.plotNo}` : '—'}
                    </TableCell>
                    <TableCell>{[d.village, d.district].filter(Boolean).join(', ')}</TableCell>
                    <TableCell>{d.parties || '—'}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {d.consideration > 0 ? formatINRCompact(d.consideration) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {d.stampDuty ? formatINRCompact(d.stampDuty) : '—'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{parseISOToDisplay(d.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </>
  );
}
