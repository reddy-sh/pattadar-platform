import AppsRounded from '@mui/icons-material/AppsRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import SellOutlined from '@mui/icons-material/SellOutlined';
import ShoppingCartOutlined from '@mui/icons-material/ShoppingCartOutlined';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import { roleLabels, universityStates } from '../data/catalog';
import { careerRoles, type DiscoveryFilters as DiscoveryFilterState, type LearningGoal } from '../domain/discovery';

interface DiscoveryFiltersProps {
  filters: DiscoveryFilterState;
  hasActiveFilters: boolean;
  idPrefix: string;
  mode?: 'courses' | 'careers';
  onChange: (patch: Partial<DiscoveryFilterState>) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}

const goalOptions: Array<{
  label: string;
  value: LearningGoal;
  icon: typeof AppsRounded;
}> = [
  { value: 'all', label: 'All learning', icon: AppsRounded },
  { value: 'buyer', label: 'Buy property', icon: ShoppingCartOutlined },
  { value: 'seller', label: 'Sell property', icon: SellOutlined },
  { value: 'career', label: 'Build a career', icon: WorkOutlineRounded },
];

export function DiscoveryFilters({
  filters,
  hasActiveFilters,
  idPrefix,
  mode = 'courses',
  onChange,
  onClear,
  resultCount,
  totalCount,
}: DiscoveryFiltersProps) {
  const itemLabel = mode === 'careers' ? 'opportunities' : 'courses';
  const showCareerRole = mode === 'careers' || filters.goal === 'career';

  return (
    <section className="discovery-filter" aria-label={mode === 'careers' ? 'Filter opportunities' : 'Filter learning'}>
      {mode === 'courses' ? (
        <fieldset className="discovery-filter__goal">
          <legend>Your goal</legend>
          <div className="discovery-segments">
            {goalOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filters.goal === value}
                onClick={() => onChange({ goal: value })}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <label className="filter-select" htmlFor={`${idPrefix}-state`}>
        <span>State or union territory</span>
        <select
          id={`${idPrefix}-state`}
          value={filters.stateCode}
          onChange={(event) => onChange({ stateCode: event.target.value as DiscoveryFilterState['stateCode'] })}
        >
          <option value="all">All India</option>
          {universityStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
        </select>
      </label>

      {showCareerRole ? (
        <label className="filter-select" htmlFor={`${idPrefix}-career`}>
          <span>Career discipline</span>
          <select
            id={`${idPrefix}-career`}
            value={filters.careerRole}
            onChange={(event) => onChange({ careerRole: event.target.value as DiscoveryFilterState['careerRole'] })}
          >
            <option value="all">All career disciplines</option>
            {careerRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
          </select>
        </label>
      ) : null}

      <div className="discovery-filter__summary">
        <span aria-live="polite">Showing <strong>{resultCount}</strong> of {totalCount} {itemLabel}</span>
        {hasActiveFilters ? (
          <button className="button button--quiet discovery-filter__clear" type="button" onClick={onClear}>
            <RestartAltRounded /> Clear filters
          </button>
        ) : null}
      </div>
      <p className="discovery-filter__note">
        General practice courses remain visible nationwide. State-specific courses cover only the named jurisdiction; proposed learning centres are separate.
      </p>
    </section>
  );
}
