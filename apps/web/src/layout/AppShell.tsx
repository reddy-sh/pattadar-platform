/**
 * Shell chrome — "Emerald & Gold" redesign. AppBar header (matte surface,
 * emerald wordmark with a gold dot), navigation drawer regrouped under
 * section headers (permanent on desktop, temporary on mobile), routed
 * content area, slim footer, and a right-hand assistant panel placeholder.
 * Selected nav item renders as an emerald pill; the Wallet item carries a
 * small gold dot.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import SettingsBrightnessOutlinedIcon from '@mui/icons-material/SettingsBrightnessOutlined';
import CheckIcon from '@mui/icons-material/Check';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { brand } from '@pattadar/tokens';
import { AssistantPanel } from '../assistant/AssistantPanel';
import { isAuthMocked, useAuth } from '../auth/AuthProvider';
import { FileViewerHost } from '../components/FileViewer';

const DRAWER_WIDTH = 252;

interface NavItem {
  label: string;
  path: string;
  icon: ReactElement;
  /** Small gold dot after the label (Wallet). */
  goldDot?: boolean;
}

interface NavSection {
  header: string;
  items: NavItem[];
}

// One flat section, in the exact order of the current rhub pattadar app's
// sider menu (plus Wallet, ours, with its gold dot).
const NAV_SECTIONS: NavSection[] = [
  {
    header: '',
    items: [
      { label: 'Dashboard', path: '/app', icon: <DashboardOutlinedIcon /> },
      { label: 'Passbooks', path: '/app/passbooks', icon: <MenuBookOutlinedIcon /> },
      { label: 'Land & Properties', path: '/app/parcels', icon: <MapOutlinedIcon /> },
      { label: 'Documents', path: '/app/documents', icon: <DescriptionOutlinedIcon /> },
      { label: 'Families & Groups', path: '/app/groups', icon: <GroupsOutlinedIcon /> },
      { label: 'Invitations', path: '/app/invitations', icon: <MailOutlinedIcon /> },
      { label: 'Notifications', path: '/app/notifications', icon: <NotificationsOutlinedIcon /> },
      { label: 'Wallet', path: '/app/wallet', icon: <AccountBalanceWalletOutlinedIcon />, goldDot: true },
      { label: 'Tools', path: '/app/tools', icon: <CalculateOutlinedIcon /> },
      { label: 'Audit Log', path: '/app/audit', icon: <FactCheckOutlinedIcon /> },
      { label: 'Admin & Ref Data', path: '/app/admin', icon: <AdminPanelSettingsOutlinedIcon /> },
      { label: 'Profile', path: '/app/profile', icon: <PersonOutlinedIcon /> },
    ],
  },
];

function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  if (!mode) return null;
  const isDark = mode === 'dark' || (mode === 'system' && systemMode === 'dark');
  const options = [
    { value: 'light' as const, label: 'Light', icon: <LightModeOutlinedIcon fontSize="small" /> },
    { value: 'dark' as const, label: 'Dark', icon: <DarkModeOutlinedIcon fontSize="small" /> },
    { value: 'system' as const, label: 'Match device', icon: <SettingsBrightnessOutlinedIcon fontSize="small" /> },
  ];
  return (
    <>
      <Tooltip title="Theme">
        <IconButton color="inherit" aria-label="Change theme" onClick={(e) => setAnchor(e.currentTarget)}>
          {isDark ? <DarkModeOutlinedIcon /> : <LightModeOutlinedIcon />}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {options.map((o) => (
          <MenuItem
            key={o.value}
            selected={mode === o.value}
            onClick={() => {
              setMode(o.value);
              setAnchor(null);
            }}
          >
            <ListItemIcon>{o.icon}</ListItemIcon>
            <ListItemText>{o.label}</ListItemText>
            {mode === o.value && <CheckIcon fontSize="small" sx={{ ml: 1.5, color: 'primary.main' }} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <Box sx={{ overflowY: 'auto', pb: 2 }}>
      {NAV_SECTIONS.map((section) => (
        <List
          key={section.header || 'main'}
          dense
          subheader={
            section.header ? <ListSubheader disableSticky>{section.header}</ListSubheader> : undefined
          }
          sx={{ pt: 0.5, pb: 0 }}
        >
          {section.items.map((item) => {
            const selected =
              item.path === '/app' ? pathname === '/app' : pathname.startsWith(item.path);
            return (
              <ListItemButton
                key={item.path}
                component={NavLink}
                to={item.path}
                onClick={onNavigate}
                selected={selected}
                sx={(t) => ({
                  mx: 1.5,
                  my: 0.25,
                  minHeight: 48,
                  borderRadius: 999, // M3 inset active pill
                  '& .MuiSvgIcon-root': { fontSize: 24 },
                  '&.Mui-selected': {
                    bgcolor: brand[100],
                    color: brand[800],
                    '& .MuiListItemIcon-root': { color: brand[700] },
                    '& .MuiListItemText-primary': { fontWeight: 600 },
                    '&:hover': { bgcolor: brand[200] },
                    ...t.applyStyles('dark', {
                      bgcolor: 'rgba(144, 202, 249, 0.16)',
                      color: brand[300],
                      '& .MuiListItemIcon-root': { color: brand[300] },
                      '&:hover': { bgcolor: 'rgba(144, 202, 249, 0.24)' },
                    }),
                  },
                })}
              >
                <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
                {item.goldDot && (
                  <Box
                    sx={(t) => ({
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      bgcolor: brand[600],
                      flexShrink: 0,
                      ...t.applyStyles('dark', { bgcolor: brand[300] }),
                    })}
                  />
                )}
              </ListItemButton>
            );
          })}
        </List>
      ))}
    </Box>
  );
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [avatarAnchor, setAvatarAnchor] = useState<HTMLElement | null>(null);

  const drawerContent = (
    <>
      <Toolbar />
      <NavList onNavigate={() => setMobileOpen(false)} />
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Quiet top bar — blends with the page; titles live in content. */}
      <AppBar
        position="fixed"
        elevation={0}
        color="transparent"
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          bgcolor: 'background.default',
          borderBottom: 1,
          borderColor: 'divider',
          color: 'text.primary',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            sx={{ mr: 1, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          {/* Brand wordmark — NOT a heading: each page owns its single <h1>. */}
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, flexGrow: 1 }}>
            <Typography
              variant="h6"
              component="div"
              sx={(t) => ({
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: brand[700],
                ...t.applyStyles('dark', { color: brand[300] }),
              })}
            >
              Pattadar
            </Typography>
            <Box
              sx={(t) => ({
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: brand[500],
                ...t.applyStyles('dark', { bgcolor: brand[300] }),
              })}
            />
          </Box>
          {isAuthMocked && (
            <Chip size="small" color="warning" label="Auth mocked — dev only" sx={{ mr: 1 }} />
          )}
          <ThemeToggle />
          <Tooltip title="Assistant">
            <IconButton
              color="inherit"
              aria-label="Open assistant"
              onClick={() => setAssistantOpen(true)}
            >
              <SmartToyOutlinedIcon />
            </IconButton>
          </Tooltip>
          <IconButton
            onClick={(e) => setAvatarAnchor(e.currentTarget)}
            aria-label="Account menu"
            sx={{ ml: 1 }}
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: brand[600], fontSize: 15 }}>
              {(user?.email?.[0] ?? 'P').toUpperCase()}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={avatarAnchor}
            open={Boolean(avatarAnchor)}
            onClose={() => setAvatarAnchor(null)}
          >
            <MenuItem disabled>{user?.email ?? 'Signed in'}</MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                setAvatarAnchor(null);
                void signOut();
              }}
            >
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Navigation: permanent on md+, temporary (overlay) below. */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH },
        }}
      >
        {drawerContent}
      </Drawer>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Toolbar />
        <Box sx={{ flexGrow: 1, p: { xs: 2, sm: 3 } }}>
          <Outlet />
        </Box>
        <Divider />
        <Box component="footer" sx={{ px: 3, py: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Pattadar — your land and property, in one place. Dates shown DD/MM/YYYY.
          </Typography>
        </Box>
      </Box>

      {/* Assistant panel — services/assistant chat surface (SSE streaming). */}
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />

      {/* In-portal file viewer — the one place portal files are previewed. */}
      <FileViewerHost />
    </Box>
  );
}
