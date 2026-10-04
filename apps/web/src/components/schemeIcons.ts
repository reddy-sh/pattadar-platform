/**
 * The glyph each colour scheme wears in a theme menu. The registry names a
 * glyph by key (`SchemeEntry.icon`); this is the one place the web maps those
 * keys onto its outlined icon set, for W360's menu and the previous app's.
 */
import ContrastOutlined from '@mui/icons-material/ContrastOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined';
import type { SchemeIcon } from '@pattadar/tokens';

export const SCHEME_ICON: Record<SchemeIcon, typeof LightModeOutlined> = {
  light: LightModeOutlined,
  dark: DarkModeOutlined,
  // Pattadar Gold: a rosette, the one gold thing an outlined set has.
  gold: WorkspacePremiumOutlined,
  contrast: ContrastOutlined,
};
