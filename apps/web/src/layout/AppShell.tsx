/**
 * Pattadar Bloom · Material 3-guided application shell
 *
 * Shell chrome — AppBar header (matte surface, ink wordmark + amber dot),
 * navigation drawer regrouped under section headers (permanent on desktop,
 * temporary on mobile), measure-capped content area, slim footer, and a
 * right-hand assistant panel. All accents come from `palette.*` seams so all
 * three colour schemes stay correct — no hardcoded ramps.
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
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import CheckIcon from '@mui/icons-material/Check';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { AssistantPanel } from '../assistant/AssistantPanel';
import { isAuthMocked, useAuth } from '../auth/AuthProvider';
import { FileViewerHost } from '../components/FileViewer';
import { SCHEME_ICON } from '../components/schemeIcons';
import { useThemeChoice } from '../components/useThemeChoice';

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

/** The previous app's theme menu. Same choice, same options, as W360's: both
 *  go through useThemeChoice, so a scheme chosen in one is the one the other
 *  shows. */
function ThemeToggle() {
  const { choice, choose, options } = useThemeChoice();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const current = options.find((o) => o.id === choice) ?? options[0];
  const Trigger = SCHEME_ICON[current.icon];

  return (
    <>
      <Tooltip title="Theme">
        <IconButton color="inherit" aria-label="Change theme" onClick={(e) => setAnchor(e.currentTarget)}>
          <Trigger />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {options.map((o) => {
          const Glyph = SCHEME_ICON[o.icon];
          return (
            <MenuItem
              key={o.id}
              role="menuitemradio"
              aria-checked={choice === o.id}
              selected={choice === o.id}
              onClick={() => { choose(o.id); setAnchor(null); }}
            >
              <ListItemIcon><Glyph fontSize="small" /></ListItemIcon>
              <ListItemText>{o.label}</ListItemText>
              {choice === o.id && (
                <CheckIcon fontSize="small" sx={{ ml: 1.5, color: 'primary.main' }} />
              )}
            </MenuItem>
          );
        })}
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
                    '& .MuiListItemText-primary': { fontWeight: 700 },
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
      {/* Quiet top bar — titles live in content. It wears the scheme's header
          colours (palette.chrome): the page's own in Bloom and High Contrast,
          Pattadar Gold's charcoal with a gold rule. */}
      <AppBar
        position="fixed"
        elevation={0}
        color="transparent"
        sx={(t) => ({
          zIndex: t.zIndex.drawer + 1,
          bgcolor: 'chrome.bg',
          borderBottom: `${(t.vars ?? t).palette.chrome.ruleWidth} solid ${(t.vars ?? t).palette.chrome.rule}`,
          color: 'chrome.ink',
        })}
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
                color: 'chrome.ink',
              }}
            >
              Pattadar
            </Typography>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: 'chrome.accent',
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
                color: 'chrome.ink',
                fontSize: 15,
                fontWeight: 700,
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
