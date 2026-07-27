'use client';

/**
 * Shell chrome — "Emerald & Gold" AppBar header, navigation drawer (permanent
 * on desktop, temporary on mobile), routed content area, slim footer, and a
 * right-hand assistant panel. Rebuilt for the App Router (no <Outlet/> — a
 * layout receives `children`) on top of Next's routing primitives and this
 * app's useAuth/useSettingsContext seams.
 *
 * Ported from apps/web/src/layout/AppShell.tsx (react-router NavLink/
 * useLocation/Outlet → next/link + usePathname + `children`). Behaviourally
 * unchanged — the nav e2e spec (tests/e2e-ux/specs/nav.spec.ts) was written
 * against that shell, so the DOM contract it asserts (a real
 * `<Drawer variant="permanent">` producing `.MuiDrawer-docked`, MUI's native
 * `selected` prop producing `.Mui-selected`, an aria-label="Change theme"
 * button opening a Light/Dark/Match-device menu) is reproduced verbatim here
 * rather than through `src/layouts/dashboard/*` / `src/components/nav-section`.
 *
 * Those kit files are a DONOR, not a drop-in, for this shell:
 *  - `layouts/dashboard/nav-vertical.js`'s desktop rail is a plain
 *    position:fixed `<Stack>`, not an MUI `<Drawer>` — it never renders
 *    `.MuiDrawer-docked`.
 *  - `components/nav-section`'s `useActiveLink` compares `pathname` against
 *    `${path}/` for leaf routes, which next/navigation's `usePathname()`
 *    (no trailing slash) never matches — the active pill would never light,
 *    and the item never gets MUI's `selected` prop (no `Mui-selected`) either.
 *  - `layouts/common/{searchbar,language-popover,contacts-popover,
 *    notifications-popover}` are deleted per the B5 brief (language-popover
 *    imports the pruned `src/locales`; the rest are kit demo data).
 *  - `layouts/common/{account-popover,settings-button}.js` still import
 *    `use-mocked-user` / `framer-motion` (not a dependency here) — rather
 *    than patch those, the account menu and settings toggle are implemented
 *    directly below, wired to `useAuth` and the kit's already root-mounted
 *    `<SettingsDrawer/>` (see src/app/layout.tsx).
 */
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import dynamic from 'next/dynamic';
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
import Iconify from 'src/components/iconify';
import { useSettingsContext } from 'src/components/settings';
import { RouterLink } from 'src/routes/components';
import { usePathname } from 'src/routes/hooks';
import { isAuthMocked, useAuth } from 'src/auth/AuthProvider';
import { AssistantPanel } from 'src/assistant/AssistantPanel';

// Blob URLs are browser-only — load client-side, never during SSR (same
// treatment as GeoMap; see .superpowers/sdd/phase-C-recipe.md).
const FileViewerHost = dynamic(
  () => import('src/components/FileViewer').then((m) => m.FileViewerHost),
  { ssr: false },
);

const DRAWER_WIDTH = 252;

interface NavItem {
  label: string;
  path: string;
  icon: ReactElement;
  /** Small gold dot after the label (Wallet). */
  goldDot?: boolean;
}

// Flat list, in the exact order/labels/paths the nav e2e spec asserts.
const NAV_ITEMS: NavItem[] = [
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
];

function ThemeToggle() {
  // Mode lives in SettingsContext (persisted to localStorage) — ThemeProvider's
  // ModeSync pushes it into MUI's own colour scheme, so writes go through
  // settings.onUpdate rather than useColorScheme().setMode directly (a direct
  // setMode would get overwritten right back by ModeSync on the next render).
  const settings = useSettingsContext();
  const { mode, systemMode } = useColorScheme();
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
            selected={settings.themeMode === o.value}
            onClick={() => {
              settings.onUpdate('themeMode', o.value);
              setAnchor(null);
            }}
          >
            <ListItemIcon>{o.icon}</ListItemIcon>
            <ListItemText>{o.label}</ListItemText>
            {settings.themeMode === o.value && (
              <CheckIcon fontSize="small" sx={{ ml: 1.5, color: 'primary.main' }} />
            )}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <Box sx={{ overflowY: 'auto', pb: 2 }}>
      <List dense sx={{ pt: 0.5, pb: 0 }}>
        {NAV_ITEMS.map((item) => {
          const selected = item.path === '/app' ? pathname === '/app' : pathname.startsWith(item.path);
          return (
            <ListItemButton
              key={item.path}
              component={RouterLink}
              href={item.path}
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
    </Box>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const settings = useSettingsContext();
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
          <Tooltip title="Settings">
            <IconButton color="inherit" aria-label="Open settings" onClick={settings.onToggle}>
              <Iconify icon="solar:settings-bold-duotone" width={24} />
            </IconButton>
          </Tooltip>
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
        <Box sx={{ flexGrow: 1, p: { xs: 2, sm: 3 } }}>{children}</Box>
        <Divider />
        <Box component="footer" sx={{ px: 3, py: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Pattadar — your land and property, in one place. Dates shown DD/MM/YYYY.
          </Typography>
        </Box>
      </Box>

      {/* Assistant panel — services/assistant chat surface (SSE streaming). */}
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />

      {/* In-portal file preview host — listens for openFileViewer() calls. */}
      <FileViewerHost />
    </Box>
  );
}
