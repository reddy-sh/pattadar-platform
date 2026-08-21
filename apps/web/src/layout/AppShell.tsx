/**
 * Hallmark · design-system: design.md · theme: Bloom · designed-as-app
 *
 * Shell chrome — AppBar header (matte surface, ink wordmark + amber dot),
 * navigation drawer regrouped under section headers (permanent on desktop,
 * temporary on mobile), measure-capped content area, slim footer, and a
 * right-hand assistant panel. All accents come from `palette.*` seams so both
 * colour schemes stay correct — no hardcoded ramps.
 *
 * Accent budget (design.md § CTA voice, ≤5% per viewport): the amber in this
 * bar is the brand dot, the selected nav pill and the Wallet dot — three
 * deliberate marks. The wordmark and the avatar were amber too, which left
 * nothing reading as primary.
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
      { label: 'Vault', path: '/app/documents', icon: <DescriptionOutlinedIcon /> },
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
                    bgcolor: 'primary.container',
                    color: 'primary.onContainer',
                    '& .MuiListItemIcon-root': { color: 'primary.onContainer' },
                    '& .MuiListItemText-primary': { fontWeight: 600 },
                    '&:hover': {
                      bgcolor: `color-mix(in srgb, ${(t.vars ?? t).palette.primary.main} 24%, transparent)`,
                    },
                  },
                })}
              >
                <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
                {item.goldDot && (
                  <Box
                    sx={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      flexShrink: 0,
                    }}
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
          {/* Brand wordmark — NOT a heading: each page owns its single <h1>.
              Ink wordmark + amber dot is the landing nav's exact voice
              (design.md § What pages MUST share); an all-amber wordmark was
              one of six accents competing in this bar. */}
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, flexGrow: 1 }}>
            <Typography
              variant="h6"
              component="div"
              sx={{
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: 'text.primary',
              }}
            >
              Pattadar
            </Typography>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: 'primary.main',
              }}
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
            {/* Neutral, not amber — identity is not an action. */}
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'action.selected',
                color: 'text.primary',
                fontSize: 15,
                fontWeight: 600,
              }}
            >
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
        {/* Measure cap + centring: without it, content hugged the left edge and
            left ~400px of dead gutter on a 1440 viewport. 80rem is --max-width
            from tokens.css, so the app and the marketing pages agree. */}
        <Box
          sx={{
            flexGrow: 1,
            width: '100%',
            maxWidth: '80rem',
            mx: 'auto',
            p: { xs: 2, sm: 3 },
          }}
        >
          <Outlet />
        </Box>
        <Divider />
        <Box component="footer" sx={{ width: '100%', maxWidth: '80rem', mx: 'auto', px: 3, py: 1.5 }}>
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
