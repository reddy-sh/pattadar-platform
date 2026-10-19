import type { ChangeEvent } from 'react';
import Box from '@mui/material/Box';
import type { AssistantModel } from '../types';

/** Which admin-enabled model answers; cheapest first, with list prices. */
export function ModelPicker({ models, value, onChange, disabled }: {
  models: AssistantModel[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  if (models.length < 2) return null;
  const fallback = models.find((item) => item.default)?.id ?? models[0].id;
  const price = (item: AssistantModel) =>
    item.input_per_mtok === null ? '' : ` · $${item.input_per_mtok}/$${item.output_per_mtok} per M`;
  return (
    <Box component="label" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: '100%', fontSize: '0.72rem', color: 'text.secondary' }}>
      Model
      <Box
        component="select"
        value={value || fallback}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value === fallback && !value ? '' : event.target.value)}
        aria-label="Assistant model"
        sx={{
          font: 'inherit', color: 'text.primary', bgcolor: 'transparent', border: 1, borderColor: 'divider',
          borderRadius: 1, px: 0.5, py: 0.25, cursor: 'pointer', '& option': { color: 'initial' },
          // A select sizes to its longest option; at phone width it must shrink
          // (its text truncates) rather than run under Send and out of the frame.
          minWidth: 0, maxWidth: '100%', flex: '0 1 auto', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
        }}
      >
        {models.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}{item.default ? ' (default)' : ''}{price(item)}
          </option>
        ))}
      </Box>
    </Box>
  );
}
