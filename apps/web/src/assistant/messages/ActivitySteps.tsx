import { memo, useId, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { MessageActivity } from '../types';
import { focusRingSx } from './focusRing';

export interface ActivityStepsProps {
  activities: MessageActivity[];
  /** Start expanded (e.g. for a reply that ended in an error). Defaults to false. */
  defaultExpanded?: boolean;
}

/** Friendly wording for each tool, past tense once done and present while running. */
const TOOL_WORDS: Record<string, { done: string; running: string }> = {
  'find properties by party': { done: 'Searched deeds by name', running: 'Searching deeds by name' },
  'get price rates': { done: 'Looked up government values', running: 'Looking up government values' },
  'get property history': { done: 'Traced property history', running: 'Tracing property history' },
  'get analytical stats': { done: 'Summarised public records', running: 'Summarising public records' },
  'get record by rid': { done: 'Opened a deed record', running: 'Opening a deed record' },
  'search semantic boundaries': { done: 'Searched boundary descriptions', running: 'Searching boundary descriptions' },
  'resolve village': { done: 'Matched the village', running: 'Matching the village' },
  'generate report': { done: 'Prepared a report', running: 'Preparing a report' },
  'navigate user': { done: 'Opened a page', running: 'Opening a page' },
  'set filter': { done: 'Filtered the list', running: 'Filtering the list' },
  'open record': { done: 'Opened a property', running: 'Opening a property' },
  'fill field': { done: 'Filled a field', running: 'Filling a field' },
  'submit form': { done: 'Submitted the form', running: 'Submitting the form' },
};

/**
 * Turns a shell label ("Thinking", "Using Find Properties By Party") into the
 * words the step list shows. Unknown tools keep their own name.
 */
export function friendlyActivityLabel(activity: MessageActivity): string {
  const { label, state } = activity;
  if (activity.id === 'thinking' || label === 'Thinking') return state === 'running' ? 'Thinking' : 'Thought it through';
  const match = /^Using\s+(.+)$/i.exec(label.trim());
  if (!match) return label;
  const tool = match[1].trim();
  const words = TOOL_WORDS[tool.toLowerCase()];
  if (words) return state === 'running' ? words.running : words.done;
  return state === 'running' ? `Using ${tool}` : `Used ${tool}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0.1, ms / 1000).toFixed(1)}s`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function StepIcon({ state }: { state: MessageActivity['state'] }) {
  if (state === 'running') return <CircularProgress size={12} thickness={5} sx={{ color: 'primary.main' }} aria-hidden />;
  if (state === 'error') return <ErrorOutlineIcon sx={{ fontSize: 15, color: 'error.main' }} aria-hidden />;
  return <CheckCircleOutlinedIcon sx={{ fontSize: 15, color: 'success.main' }} aria-hidden />;
}

/**
 * The reply's working steps as one compact line. While something runs it shows a
 * single spinner and the current step; once finished it folds to a summary
 * ("Thinking · Searched deeds by name") that opens into the full list. Errors
 * always stay visible.
 */
function ActivityStepsView({ activities, defaultExpanded = false }: ActivityStepsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const listId = useId();
  // Wall-clock timings are measured here, since the shell does not stamp them.
  const timings = useRef(new Map<string, { start: number; end?: number }>()).current;
  const now = Date.now();
  for (const activity of activities) {
    const timing = timings.get(activity.id);
    if (!timing) timings.set(activity.id, { start: now, end: activity.state === 'running' ? undefined : now });
    else if (activity.state !== 'running' && timing.end === undefined) timing.end = now;
  }

  if (activities.length === 0) return null;

  const running = activities.filter((activity) => activity.state === 'running');
  const errors = activities.filter((activity) => activity.state === 'error');
  const current = running.at(-1);
  const durationOf = (activity: MessageActivity) => {
    const timing = timings.get(activity.id);
    if (!timing?.end || timing.end - timing.start < 50) return null;
    return formatDuration(timing.end - timing.start);
  };

  const summary = current
    ? friendlyActivityLabel(current)
    : activities
      .filter((activity) => activity.state !== 'error')
      .map((activity) => (activity.id === 'thinking' ? 'Thinking' : friendlyActivityLabel(activity)))
      .filter((label, index, all) => all.indexOf(label) === index)
      .join(' · ') || 'Steps';

  return (
    <Box sx={{ my: 0.5, maxWidth: '100%' }}>
      <ButtonBase
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={listId}
        sx={(theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          maxWidth: '100%',
          px: 0.75,
          py: 0.375,
          ml: -0.75,
          borderRadius: 1.5,
          color: 'text.secondary',
          textAlign: 'left',
          transition: theme.transitions.create(['background-color', 'color'], { duration: 120 }),
          '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
          ...focusRingSx(theme),
        })}
      >
        {current ? <StepIcon state="running" /> : errors.length > 0 ? <StepIcon state="error" /> : <StepIcon state="done" />}
        <Typography
          component="span"
          variant="caption"
          noWrap
          sx={{ fontSize: '0.8rem', lineHeight: 1.5, minWidth: 0 }}
        >
          {summary}
          {current && activities.length > 1 ? ` · step ${activities.indexOf(current) + 1} of ${activities.length}` : ''}
        </Typography>
        <ExpandMoreIcon
          aria-hidden
          sx={(theme) => ({
            fontSize: 16,
            flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: theme.transitions.create('transform', { duration: 120 }),
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          })}
        />
      </ButtonBase>

      {/* Errors stay readable even while the list is folded. */}
      {!expanded && errors.length > 0 && (
        <Box role="alert" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
          <Typography variant="caption" sx={{ color: 'error.main', lineHeight: 1.5 }}>
            {errors.map((activity) => friendlyActivityLabel(activity)).join(' · ')}
          </Typography>
        </Box>
      )}

      <Collapse in={expanded} timeout={{ enter: 220, exit: 120 }} unmountOnExit>
        <Box
          component="ol"
          id={listId}
          aria-label="Steps taken"
          sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0, pl: 1, borderLeft: 1, borderColor: 'divider' }}
        >
          {activities.map((activity) => {
            const duration = durationOf(activity);
            return (
              <Box
                component="li"
                key={activity.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.25, pl: 0.5, minWidth: 0 }}
              >
                <StepIcon state={activity.state} />
                <Typography
                  variant="caption"
                  sx={{
                    color: activity.state === 'error' ? 'error.main' : 'text.secondary',
                    lineHeight: 1.5,
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {friendlyActivityLabel(activity)}
                  {duration && (
                    <Box component="span" sx={{ color: 'text.disabled', fontVariantNumeric: 'tabular-nums' }}>
                      {` · ${duration}`}
                    </Box>
                  )}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}

/** Memoised: a streamed token re-renders the panel, never an unchanged ActivitySteps. */
export const ActivitySteps = memo(ActivityStepsView);
