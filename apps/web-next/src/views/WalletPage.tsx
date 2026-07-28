'use client';

/**
 * Wallet — design-forward coming-soon view. Gold-glass balance card with
 * disabled Add money / Send actions, a sample transaction history
 * (DD/MM/YYYY), and a plain-language explainer of what the wallet will do.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AddIcon from '@mui/icons-material/Add';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { formatINR, parseISOToDisplay } from '@pattadar/core';
import { GlassCard } from '../components/GlassCard';
import { PageHeader } from '../components/PageHeader';
import { useStatusColors } from '../components/charts/chartColors';
import { useWallet } from '../data/hooks';

export function WalletPage() {
  const { data: wallet, isSample } = useWallet();
  const statusColors = useStatusColors();

  return (
    <>
      <PageHeader
        eyebrow="Money"
        title="Wallet"
        subtitle="Pay stamp duty, government fees and service charges from one balance."
        sample={isSample}
        actions={<Chip size="small" color="secondary" variant="outlined" label="Coming soon" />}
      />

      {/* ── Gold-glass balance card ─────────────────────────────────── */}
      <GlassCard tone="gold" sx={{ mb: 2.5, maxWidth: 560 }}>
        <Typography variant="overline" color="text.secondary">
          Wallet balance
        </Typography>
        <Typography
          component="p"
          sx={{ fontSize: { xs: 34, sm: 44 }, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em' }}
        >
          {formatINR(wallet.balance)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Available for payments once the wallet goes live
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mt: 2.5 }}>
          <Tooltip title="Coming soon">
            <span>
              <Button variant="contained" startIcon={<AddIcon />} disabled>
                Add money
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Coming soon">
            <span>
              <Button variant="outlined" startIcon={<SendOutlinedIcon />} disabled>
                Send
              </Button>
            </span>
          </Tooltip>
        </Box>
      </GlassCard>

      {/* ── What the wallet will do ─────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5, mb: 2.5 }}>
        {[
          {
            icon: <ReceiptLongOutlinedIcon />,
            title: 'Pay stamp duty & fees',
            text: 'Settle registration charges, EC and certified-copy fees without visiting the office counter.',
          },
          {
            icon: <AccountBalanceOutlinedIcon />,
            title: 'One place for receipts',
            text: 'Every payment gets a receipt stored against the right parcel or property automatically.',
          },
          {
            icon: <DescriptionOutlinedIcon />,
            title: 'Family-safe records',
            text: 'Payments show up in your activity history, so the whole family can see what was paid and why.',
          },
        ].map((f) => (
          <Card key={f.title}>
            <CardContent>
              <Box sx={{ color: 'secondary.main', mb: 1 }}>{f.icon}</Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {f.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {f.text}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* ── Sample transactions ─────────────────────────────────────── */}
      <Card>
        <CardContent sx={{ pb: 0 }}>
          <Typography variant="h6" component="h2">
            Recent transactions
          </Typography>
          <Typography variant="caption" color="text.secondary">
            A preview of how your payment history will look.
          </Typography>
        </CardContent>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ mt: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Category</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {wallet.transactions.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{parseISOToDisplay(t.date)}</TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={t.category} />
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                      color: t.direction === 'credit' ? statusColors.good : 'text.primary',
                    }}
                  >
                    {t.direction === 'credit' ? '+' : '−'} {formatINR(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </>
  );
}
