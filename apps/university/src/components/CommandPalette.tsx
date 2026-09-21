import SearchRounded from '@mui/icons-material/SearchRounded';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { campuses, courses, opportunities } from '../data/catalog';
import { stateLandRecordProfiles } from '../data/stateLandRecords';

interface CommandPaletteProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

interface CommandEntry {
  id: string;
  label: string;
  detail: string;
  group: string;
  path: string;
}

const entries: CommandEntry[] = [
  ...courses.map((course) => ({
    id: course.id,
    label: course.title,
    detail: `${course.level} · ${course.language}`,
    group: 'Courses',
    path: `/courses/${course.slug}`,
  })),
  ...campuses.map((campus) => ({
    id: campus.id,
    label: campus.name,
    detail: `${campus.district}, ${campus.state}`,
    group: 'Locations',
    path: `/locations/${campus.slug}`,
  })),
  ...opportunities.map((opportunity) => ({
    id: opportunity.id,
    label: opportunity.title,
    detail: `${opportunity.organization} · ${opportunity.engagement}`,
    group: 'Work',
    path: '/opportunities',
  })),
  ...stateLandRecordProfiles.map((profile) => ({
    id: `state-${profile.code}`,
    label: `${profile.name} land records`,
    detail: `${profile.primaryRecordLabel} · ${profile.localTerms.slice(0, 3).join(' · ')}`,
    group: 'State guides',
    path: `/states/${profile.slug}`,
  })),
];

export function CommandPalette({ open, onOpen, onClose }: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return entries.slice(0, 9);
    return entries.filter((entry) => `${entry.label} ${entry.detail} ${entry.group}`.toLocaleLowerCase().includes(term)).slice(0, 12);
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        if (open) onClose();
        else onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onOpen, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  const choose = (entry: CommandEntry) => {
    onClose();
    setQuery('');
    navigate(entry.path);
  };

  return (
    <dialog
      ref={dialogRef}
      className="command-dialog"
      aria-label="Search Pattadar University"
      onClose={onClose}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="command-dialog__panel">
        <label className="command-dialog__search" htmlFor="university-command-search">
          <SearchRounded />
          <span className="sr-only">Search courses, state guides, locations, and work</span>
          <input
            ref={inputRef}
            id="university-command-search"
            value={query}
            placeholder="Search courses, states, roles, locations"
            autoComplete="off"
            aria-controls="command-results"
            aria-activedescendant={results[selected] ? `command-${results[selected].id}` : undefined}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter' && results[selected]) {
                event.preventDefault();
                choose(results[selected]);
              }
            }}
          />
          <kbd>esc</kbd>
        </label>
        <div id="command-results" className="command-dialog__results" role="listbox" aria-label="Search results">
          {results.length ? results.map((entry, index) => (
            <button
              id={`command-${entry.id}`}
              key={entry.id}
              type="button"
              role="option"
              aria-selected={index === selected}
              className={index === selected ? 'command-result is-selected' : 'command-result'}
              onMouseEnter={() => setSelected(index)}
              onClick={() => choose(entry)}
            >
              <span><strong>{entry.label}</strong><small>{entry.detail}</small></span>
              <span className="command-result__group">{entry.group}</span>
            </button>
          )) : (
            <div className="empty-inline" role="status">
              <strong>No matching course, state, or location.</strong>
              <span>Try a state, record name, role, or course.</span>
            </div>
          )}
        </div>
        <div className="command-dialog__foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
        </div>
      </div>
    </dialog>
  );
}
