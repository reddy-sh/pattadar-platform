/**
 * The empty conversation: greeting, scope line and four suggestion cards that
 * send complete, in-scope prompts on click (never a template with a blank).
 */
import type { ReactNode } from 'react';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { IncognitoIcon } from '../rich/IncognitoIcon';

export interface EmptyStateProps {
  onAsk: (prompt: string) => void;
  incognito: boolean;
  /** Public-records coverage line from the capability check; '' hides it. */
  coverage: string;
  /** Disables the cards while a send or upload is in flight. */
  disabled?: boolean;
}

export interface Suggestion {
  icon: ReactNode;
  title: string;
  description: string;
  prompt: string;
}

export const SUGGESTIONS: Suggestion[] = [
  {
    icon: <PersonSearchOutlinedIcon fontSize="small" />,
    title: "Find deeds by a person's name",
    description: 'Every registered sale where they bought or sold.',
    prompt: 'Find the properties of Sankara Reddy Telukutla',
  },
  {
    icon: <SellOutlinedIcon fontSize="small" />,
    title: 'Government values in a village',
    description: 'Government values, survey by survey.',
    prompt: 'Show the price rates in Katragunta village',
  },
  {
    icon: <HistoryEduOutlinedIcon fontSize="small" />,
    title: 'Property history by survey',
    description: 'The chain of registered documents on one survey number.',
    prompt: 'Show the property history for survey 120-2 in Katragunta',
  },
  {
    icon: <CalculateOutlinedIcon fontSize="small" />,
    title: 'Explain stamp duty',
    description: 'How the duty on a sale deed is worked out.',
    prompt: 'Explain how stamp duty is calculated for a sale deed',
  },
];

export function EmptyState({ onAsk, incognito, coverage, disabled = false }: EmptyStateProps) {
  return (
    <Box sx={{ px: 1, pt: { xs: 3, sm: 5 }, pb: 2, maxWidth: '40rem', mx: 'auto', containerType: 'inline-size' }}>
      <Box sx={{ textAlign: 'center', px: 1 }}>
        <Box
          aria-hidden
          sx={{
            width: 44, height: 44, mx: 'auto', mb: 1.25, borderRadius: '50%',
            display: 'grid', placeItems: 'center',
            border: 1, borderColor: 'divider', color: incognito ? 'text.primary' : 'primary.main',
          }}
        >
          {incognito ? <IncognitoIcon sx={{ fontSize: 24 }} /> : <SmartToyOutlinedIcon sx={{ fontSize: 24 }} />}
        </Box>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>Hello! I'm your Pattadar Assistant.</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.55, maxWidth: '34rem', mx: 'auto' }}>
          Ask about your properties, documents, family, or a file you upload. Questions outside Pattadar are declined.
        </Typography>
      </Box>

      <Box
        component="ul"
        aria-label="Suggested questions"
        sx={{
          listStyle: 'none', m: 0, p: 0, mt: 3,
          display: 'grid', gap: 1,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
          // The drawer can be narrower than the viewport breakpoint says; a
          // container query on the wrapper keeps a slim drawer at one column.
          '@container (max-width: 420px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
        }}
      >
        {SUGGESTIONS.map((suggestion) => (
          <Box component="li" key={suggestion.prompt} sx={{ minWidth: 0, display: 'flex' }}>
            <ButtonBase
              onClick={() => onAsk(suggestion.prompt)}
              disabled={disabled}
              aria-label={`${suggestion.title}: ${suggestion.prompt}`}
              sx={(theme) => ({
                flex: 1, minWidth: 0,
                display: 'flex', alignItems: 'flex-start', gap: 1.25, textAlign: 'left',
                p: 1.5, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: 'background.paper',
                transition: theme.transitions.create(['transform', 'border-color'], { duration: 120 }),
                '&:hover': { borderColor: 'text.secondary', transform: 'translateY(-2px)' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                '&.Mui-disabled': { opacity: 0.6 },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } },
              })}
            >
              <Box aria-hidden sx={{ color: 'primary.main', display: 'flex', mt: 0.25 }}>{suggestion.icon}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.4 }}>{suggestion.title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45, mt: 0.25 }}>
                  {suggestion.description}
                </Typography>
              </Box>
            </ButtonBase>
          </Box>
        ))}
      </Box>

      {coverage && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
          {`Public records ${coverage}.`}
        </Typography>
      )}
    </Box>
  );
}
