/**
 * Passbooks — pattadar passbook cards: number, owner, photo placeholder,
 * place, extent, linked-parcel count, group chip.
 */
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { formatArea, parseISOToDisplay } from '@pattadar/core';
import { green } from '@pattadar/tokens';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { usePassbooks } from '../data/hooks';

export function PassbooksPage() {
  const { data, isSample } = usePassbooks();
  const parcelCount = new Map<string, number>();
  for (const p of data.parcels) {
    parcelCount.set(p.passbookId, (parcelCount.get(p.passbookId) || 0) + 1);
  }
  const groupName = new Map(data.groups.map((g) => [g.id, g.name]));

  return (
    <>
      <PageHeader
        title="Passbooks"
        subtitle="Your pattadar passbooks — the official record of ownership, one per district registration."
        sample={isSample}
      />
      {data.passbooks.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MenuBookOutlinedIcon />}
            title="No passbooks yet"
            description="Create your first passbook, or upload a photo of the physical book and we will read it for you."
          />
        </Card>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
            gap: 1.5,
          }}
        >
          {data.passbooks.map((b) => {
            const count = parcelCount.get(b.id) || 0;
            const gname = b.groupId ? groupName.get(b.groupId) : '';
            return (
              <Card key={b.id}>
                {/* Emerald passbook-cover band. */}
                <Box
                  sx={(t) => ({
                    height: 64,
                    background: `linear-gradient(120deg, ${green[700]}, ${green[500]})`,
                    display: 'flex',
                    alignItems: 'center',
                    px: 2,
                    ...t.applyStyles('dark', {
                      background: `linear-gradient(120deg, ${green[800]}, ${green[600]})`,
                    }),
                  })}
                >
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, letterSpacing: '0.06em' }}>
                    PATTADAR PASSBOOK · {b.district.toUpperCase()}
                  </Typography>
                </Box>
                <CardContent>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Avatar
                      src={b.photo || undefined}
                      sx={{ width: 52, height: 52, bgcolor: green[100], color: green[700], fontWeight: 700 }}
                    >
                      {(b.ownerName[0] || 'P').toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                        {b.ownerName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Passbook no {b.pattadarNo}
                        {b.fatherHusbandName ? ` · s/o ${b.fatherHusbandName}` : ''}
                      </Typography>
                    </Box>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    {[b.village, b.mandal, b.district].filter(Boolean).join(' · ')}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                    <Chip size="small" variant="outlined" label={formatArea(b.totalExtent)} />
                    <Chip size="small" variant="outlined" label={`${count} parcel${count !== 1 ? 's' : ''}`} />
                    {gname && <Chip size="small" color="primary" variant="outlined" label={gname} />}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                    Added {parseISOToDisplay(b.createdAt)}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </>
  );
}
