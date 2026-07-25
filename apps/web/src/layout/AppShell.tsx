/**
 * Shell-lite chrome: AppBar header, navigation drawer (permanent on desktop,
 * temporary on mobile), routed content area, slim footer, and a right-hand
 * assistant panel placeholder.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
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
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';

const DRAWER_WIDTH = 248;

interface NavItem {
  label: string;
  path: string;
  icon: ReactElement;
}

/** Navigation order mirrors the rhub pattadar menu. */
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <DashboardOutlinedIcon /> },
  { label: 'Passbooks', path: '/passbooks', icon: <MenuBookOutlinedIcon /> },
  { label: 'Parcels', path: '/parcels', icon: <MapOutlinedIcon /> },
  { label: 'Properties', path: '/properties', icon: <HomeWorkOutlinedIcon /> },
  { label: 'Documents', path: '/documents', icon: <DescriptionOutlinedIcon /> },
  { label: 'Deeds', path: '/deeds', icon: <HistoryEduOutlinedIcon /> },
  { label: 'Groups', path: '/groups', icon: <GroupsOutlinedIcon /> },
  { label: 'Invitations', path: '/invitations', icon: <MailOutlinedIcon /> },
  { label: 'Notifications', path: '/notifications', icon: <NotificationsOutlinedIcon /> },
  { label: 'SRO Offices', path: '/sro', icon: <AccountBalanceOutlinedIcon /> },
  { label: 'Stamp Duty', path: '/stamp-duty', icon: <ReceiptLongOutlinedIcon /> },
  { label: 'Market Value', path: '/market-value', icon: <TrendingUpOutlinedIcon /> },
  { label: 'Calculator', path: '/calculator', icon: <CalculateOutlinedIcon /> },
  { label: 'Audit', path: '/audit', icon: <FactCheckOutlinedIcon /> },
  { label: 'Admin', path: '/admin', icon: <AdminPanelSettingsOutlinedIcon /> },
  { label: 'Profile', path: '/profile', icon: <PersonOutlinedIcon /> },
];

function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  if (!mode) return null;
  const isDark = mode === 'dark' || (mode === 'system' && systemMode === 'dark');
  return (
    <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton color="inherit" onClick={() => setMode(isDark ? 'light' : 'dark')}>
        {isDark ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
      </IconButton>
    </Tooltip>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <List dense sx={{ pt: 1 }}>
      {NAV_ITEMS.map((item) => (
        <ListItemButton
          key={item.path}
          component={NavLink}
          to={item.path}
          onClick={onNavigate}
          selected={item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
          <ListItemText primary={item.label} />
        </ListItemButton>
      ))}
    </List>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarAnchor, setAvatarAnchor] = useState<HTMLElement | null>(null);

  const drawerContent = (
    <>
      <Toolbar />
      <NavList onNavigate={() => setMobileOpen(false)} />
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
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
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Pattadar
          </Typography>
          <ThemeToggle />
          <Tooltip title="Assistant arrives in Phase 3">
            <span>
              <IconButton color="inherit" disabled>
                <SmartToyOutlinedIcon />
              </IconButton>
            </span>
          </Tooltip>
          {/* Avatar placeholder — wired to Auth0 profile in Phase 2. */}
          <IconButton onClick={(e) => setAvatarAnchor(e.currentTarget)} sx={{ ml: 1 }}>
            <Avatar sx={{ width: 32, height: 32 }}>P</Avatar>
          </IconButton>
          <Menu
            anchorEl={avatarAnchor}
            open={Boolean(avatarAnchor)}
            onClose={() => setAvatarAnchor(null)}
          >
            <MenuItem disabled>Signed-in user (Phase 2)</MenuItem>
            <Divider />
            <MenuItem disabled>Sign out</MenuItem>
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
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        {drawerContent}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Toolbar />
        <Box sx={{ flexGrow: 1, p: 3 }}>
          <Outlet />
        </Box>
        <Divider />
        <Box component="footer" sx={{ px: 3, py: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Pattadar — Andhra Pradesh land records. Dates shown DD/MM/YYYY.
          </Typography>
        </Box>
      </Box>

      {/* TODO(Phase 3): assistant panel — services/assistant chat surface.
          Stub kept closed so the layout seam is already in place. */}
      <Drawer anchor="right" variant="temporary" open={false}>
        <Box sx={{ width: 320, p: 2 }}>
          <Typography variant="h4">Assistant</Typography>
        </Box>
      </Drawer>
    </Box>
  );
}
