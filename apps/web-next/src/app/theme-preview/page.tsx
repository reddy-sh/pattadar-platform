'use client';

/**
 * Throwaway verification route (task B2): exercises the kept Minimals kit
 * components on MUI 9 + React 19 in BOTH color schemes (settings drawer).
 * Not linked from anywhere — delete once the real pages land.
 */

import * as Yup from 'yup';
import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { m } from 'motion/react';
import { yupResolver } from '@hookform/resolvers/yup';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import Container from '@mui/material/Container';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CardContent from '@mui/material/CardContent';
import TableContainer from '@mui/material/TableContainer';

import Iconify from 'src/components/iconify';
import Label from 'src/components/label';
import Scrollbar from 'src/components/scrollbar';
import { Upload } from 'src/components/upload';
import Chart, { useChart } from 'src/components/chart';
import { varFade } from 'src/components/animate';
import { useSettingsContext } from 'src/components/settings';
import FormProvider, { RHFSelect, RHFCheckbox, RHFTextField } from 'src/components/hook-form';
import { useTable, TableHeadCustom, TablePaginationCustom } from 'src/components/table';

import { fCurrency } from 'src/utils/format-number';

// ----------------------------------------------------------------------

const PARCELS = [
  { id: '1', survey: '123/2A', village: 'Kankipadu', extent: '2.45 ac', value: 4250000, status: 'verified' },
  { id: '2', survey: '88/1B', village: 'Penamaluru', extent: '1.10 ac', value: 1980000, status: 'pending' },
  { id: '3', survey: '456/3', village: 'Gannavaram', extent: '0.62 ac', value: 860000, status: 'verified' },
  { id: '4', survey: '12/4C', village: 'Vuyyuru', extent: '3.00 ac', value: 5400000, status: 'disputed' },
];

const TABLE_HEAD = [
  { id: 'survey', label: 'Survey no.' },
  { id: 'village', label: 'Village' },
  { id: 'extent', label: 'Extent' },
  { id: 'value', label: 'Value', align: 'right' },
  { id: 'status', label: 'Status' },
  { id: '', label: '' },
];

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  verified: 'success',
  pending: 'warning',
  disputed: 'error',
};

// ----------------------------------------------------------------------

export default function ThemePreviewPage() {
  const settings = useSettingsContext();

  const { enqueueSnackbar } = useSnackbar();

  const table = useTable({ defaultOrderBy: 'survey' });

  const [files, setFiles] = useState<(File & { preview: string })[]>([]);

  const handleDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [
      ...prev,
      ...acceptedFiles.map((file) =>
        Object.assign(file, { preview: URL.createObjectURL(file) })
      ),
    ]);
  }, []);

  const methods = useForm({
    resolver: yupResolver(
      Yup.object().shape({
        ownerName: Yup.string().required('Owner name is required'),
        district: Yup.string().required('District is required'),
        consent: Yup.boolean().oneOf([true], 'Consent is required'),
      })
    ),
    defaultValues: { ownerName: '', district: '', consent: false },
  });

  const onSubmit = methods.handleSubmit((data) => {
    enqueueSnackbar(`Saved ${data.ownerName} (${data.district})`, { variant: 'success' });
  });

  const chartOptions = useChart({
    xaxis: { categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
  });

  return (
    <Container maxWidth="lg" sx={{ py: 5 }}>
      <Stack
        direction="row"
        sx={{ mb: 4, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h3">Theme preview</Typography>
        <IconButton onClick={settings.onToggle} aria-label="Open settings">
          <Iconify icon="solar:settings-bold" />
        </IconButton>
      </Stack>

      <Stack spacing={4}>
        {/* Buttons — all variants incl. the ported `tonal` seam */}
        <Card>
          <CardHeader title="Buttons" />
          <CardContent>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Button variant="contained" color="primary">
                Contained
              </Button>
              <Button variant="outlined" color="primary">
                Outlined
              </Button>
              <Button variant="text" color="primary">
                Text
              </Button>
              <Button variant="soft" color="primary">
                Soft
              </Button>
              <Button variant="tonal">Tonal</Button>
              <Button variant="tonal" disabled>
                Tonal disabled
              </Button>
              <Button variant="contained" color="secondary">
                Gold
              </Button>
              <Button variant="soft" color="error">
                Soft error
              </Button>
              <Button
                variant="contained"
                onClick={() => enqueueSnackbar('Bottom-center snackbar (seam)', { variant: 'info' })}
              >
                Trigger snackbar
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={() => enqueueSnackbar('Something failed', { variant: 'error' })}
              >
                Error snackbar
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Card grid — MUI 9 Grid (size prop) */}
        <Grid container spacing={3}>
          {['Parcels', 'Deeds', 'Passbooks'].map((title, index) => (
            <Grid key={title} size={{ xs: 12, sm: 6, md: 4 }}>
              <m.div {...varFade().inUp}>
                <Card>
                  <CardHeader title={title} />
                  <CardContent>
                    <Typography variant="h4" className="tnum">
                      {fCurrency(1250000 * (index + 1))}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      Tabular numerals via the ported .tnum utility class.
                    </Typography>
                    <Label color={(['success', 'warning', 'error'] as const)[index]} sx={{ mt: 2 }}>
                      {['verified', 'pending', 'disputed'][index]}
                    </Label>
                  </CardContent>
                </Card>
              </m.div>
            </Grid>
          ))}
        </Grid>

        {/* Kit table + rowActions hover-reveal seam */}
        <Card>
          <CardHeader title="Parcels table" />
          <TableContainer sx={{ mt: 2 }}>
            <Scrollbar>
              <Table size={table.dense ? 'small' : 'medium'}>
                <TableHeadCustom
                  order={table.order}
                  orderBy={table.orderBy}
                  headLabel={TABLE_HEAD}
                  onSort={table.onSort}
                />
                <TableBody>
                  {PARCELS.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>{row.survey}</TableCell>
                      <TableCell>{row.village}</TableCell>
                      <TableCell>{row.extent}</TableCell>
                      <TableCell align="right" className="tnum">
                        {fCurrency(row.value)}
                      </TableCell>
                      <TableCell>
                        <Label variant="soft" color={STATUS_COLOR[row.status]}>
                          {row.status}
                        </Label>
                      </TableCell>
                      <TableCell align="right">
                        <Box component="span" className="rowActions">
                          <IconButton size="small" aria-label="Edit">
                            <Iconify icon="solar:pen-bold" width={18} />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Scrollbar>
          </TableContainer>
          <TablePaginationCustom
            count={PARCELS.length}
            page={table.page}
            rowsPerPage={table.rowsPerPage}
            onPageChange={table.onChangePage}
            onRowsPerPageChange={table.onChangeRowsPerPage}
            dense={table.dense}
            onChangeDense={table.onChangeDense}
          />
        </Card>

        {/* Hook-form: text / select / checkbox with yup validation */}
        <Card>
          <CardHeader title="Form" />
          <CardContent>
            <FormProvider methods={methods} onSubmit={onSubmit}>
              <Stack spacing={3} sx={{ maxWidth: 480 }}>
                <RHFTextField name="ownerName" label="Owner name" />
                <RHFSelect name="district" label="District">
                  <MenuItem value="ntr">NTR</MenuItem>
                  <MenuItem value="krishna">Krishna</MenuItem>
                  <MenuItem value="guntur">Guntur</MenuItem>
                </RHFSelect>
                <RHFCheckbox name="consent" label="I confirm the details are accurate" />
                <Button type="submit" variant="contained">
                  Submit
                </Button>
              </Stack>
            </FormProvider>
          </CardContent>
        </Card>

        {/* Upload dropzone */}
        <Card>
          <CardHeader title="Upload" />
          <CardContent>
            <Upload
              multiple
              files={files}
              onDrop={handleDrop}
              onRemove={(file: File & { preview: string }) =>
                setFiles((prev) => prev.filter((f) => f !== file))
              }
            />
          </CardContent>
        </Card>

        {/* ApexCharts under React 19 */}
        <Card>
          <CardHeader title="Chart" />
          <CardContent>
            <Chart
              dir="ltr"
              type="line"
              series={[{ name: 'Portfolio value', data: [64, 68, 66, 74, 78, 85] }]}
              options={chartOptions}
              width="100%"
              height={280}
            />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
