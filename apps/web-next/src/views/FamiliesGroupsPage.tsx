'use client';

/**
 * Families & Groups — functional-parity port of the predecessor pattadar app's
 * GroupsListView + GroupDetailView (founder screenshot contract): typed
 * group cards ("<n> members · <n> passbooks · Your role: …", "View
 * holdings ›" deep link) with the full in-page group detail — member table,
 * PersonDialog (Scan Aadhaar AI + manual form), verification invites,
 * land assignment, notifier priority editor and activity.
 */
import { useState } from 'react';
import { useRouter } from 'src/routes/hooks';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { CardGridSkeleton, HeaderSkeleton } from '../components/Skeletons';
import { GROUP_TYPES, createGroup, groupTypeDef, useGroupsList } from './families/familiesData';
import { GroupDetail } from './families/GroupDetail';

interface Toast {
  msg: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}

export function FamiliesGroupsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: groups, isSample, isLoading } = useGroupsList();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newType, setNewType] = useState('family');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [nameError, setNameError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = (msg: string, severity: Toast['severity'] = 'success') =>
    setToast({ msg, severity });
  const selected = groups.find((g) => g.id === selectedId) ?? groups[0];

  const openCreate = () => {
    setNewType('family');
    setNewName('');
    setNewDesc('');
    setNameError('');
    setCreateOpen(true);
  };
  const doCreate = async () => {
    if (!newName.trim()) {
      setNameError('Give the group a name');
      return;
    }
    try {
      const id = await createGroup(newType, newName.trim(), newDesc || '');
      setCreateOpen(false);
      if (id) {
        notify('Group created');
        setSelectedId(id);
        void queryClient.invalidateQueries({ queryKey: ['pattadar'] });
      } else {
        notify('Could not create group', 'error');
      }
    } catch {
      notify('Could not create group', 'error');
    }
  };

  // Shaped loading state — never paint the sample dataset uncredited.
  if (isLoading)
    return (
      <>
        <HeaderSkeleton />
        <CardGridSkeleton count={3} />
      </>
    );

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Families & Groups"
        subtitle="Your families, partnerships, and companies that hold land. Each has members with shares."
        sample={isSample}
        actions={
          /* One filled action per region: the empty state owns it when the list is empty. */
          <Button
            variant={groups.length === 0 ? 'tonal' : 'contained'}
            startIcon={<AddIcon />}
            onClick={openCreate}
          >
            Create Group
          </Button>
        }
      />

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GroupsOutlinedIcon />}
            title="No groups yet"
            description="Create your family, a partnership, or a company."
            action={
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                Create your first group
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* ── Typed group cards ─────────────────────────────────────── */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
              gap: 1.5,
              mb: 2.5,
            }}
          >
            {groups.map((g) => {
              const def = groupTypeDef(g.type);
              const isSelected = selected?.id === g.id;
              return (
                <Card
                  key={g.id}
                  onClick={() => setSelectedId(g.id)}
                  sx={{
                    cursor: 'pointer',
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    borderWidth: isSelected ? 2 : 1,
                  }}
                >
                  <CardContent sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                        <Box component="span" sx={{ fontSize: 26, lineHeight: 1 }}>
                          {def.icon}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                            {g.name}
                          </Typography>
                          <Chip size="small" variant="outlined" label={def.label} />
                        </Box>
                      </Box>
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 2,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          color: 'text.secondary',
                          fontSize: 13,
                        }}
                      >
                        <span>
                          {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
                        </span>
                        <span>
                          {g.landCount} passbook{g.landCount === 1 ? '' : 's'}
                        </span>
                        <span>Your role: {g.myRole || def.primaryRole}</span>
                        <Link
                          component="button"
                          underline="hover"
                          sx={{ ml: 'auto', whiteSpace: 'nowrap' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/app/parcels?group=${g.id}`);
                          }}
                        >
                          View holdings ›
                        </Link>
                      </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>

          {/* ── In-page detail for the selected group ─────────────────── */}
          {selected && <GroupDetail key={selected.id} group={selected} notify={notify} />}
        </>
      )}

      {/* ── Create group dialog (typed groups per the source enum) ────── */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create a group</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            required
            size="small"
            label="Type"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            sx={{ mt: 1 }}
          >
            {GROUP_TYPES.map((g) => (
              <MenuItem key={g.type} value={g.type}>
                {g.icon}&nbsp;&nbsp;{g.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            required
            size="small"
            label="Name"
            placeholder="e.g. Telukutla Family / Reddy & Sons"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (e.target.value.trim()) setNameError('');
            }}
            error={!!nameError}
            helperText={nameError}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            size="small"
            label="Description (optional)"
            multiline
            minRows={2}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void doCreate()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}>
        <Alert severity={toast?.severity ?? 'success'} onClose={() => setToast(null)}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
