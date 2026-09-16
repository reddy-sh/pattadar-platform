/**
 * The web-next component kit — one import surface.
 *
 * Views import from 'src/components/kit' and never from a file inside it.
 * Enforced by an eslint `no-restricted-imports` rule forbidding deep imports
 * into src/components/kit/** from src/views/**, shipped alongside the rule
 * banning bare <Button> / <IconButton> imports inside src/views/**.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 */

// Layer 0 — types and pure helpers
export * from './types';
export * from './tokens';
export * from './format';
export * from './columns';

// Layer 1 — hooks
export * from './useQueryState';
export * from './useFilePicker';
export * from './useRowSelection';

// Layer 1 — primitives
export * from './Action';
export * from './ActionMenu';
export * from './ConfirmDialog';
export * from './FormDialog';
export * from './SearchField';
export * from './TabStrip';
export * from './FilterBar';
export * from './StatusChip';
export * from './StatTiles';
export * from './Section';
export * from './ZeroState';
export * from './KitSkeletons';
export * from './DataTable';
export * from './CardGrid';
export * from './ExportAction';
export * from './PageHeader';
export * from './ListToolbar';
export * from './FieldGrid';
export * from './MapSurface';
export * from './ToastProvider';

// Layer 2 — scaffolds
export * from './ListScreen';
export * from './TabbedScreen';
export * from './RecordScreen';
