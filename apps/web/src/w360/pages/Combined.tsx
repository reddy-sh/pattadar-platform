/** Combined properties — the list.
 *
 *  A combined property is several records an owner holds as one piece of ground:
 *  thirty acres and thirty acres, two khatas, one fence. This screen is
 *  deliberately thin. It is not a second Properties: there are a handful of
 *  these, not four hundred, so there is no faceted rail, no map view and no
 *  sort chip — furniture for rows that do not exist is the defect the Properties
 *  screen's own filter rail was rebuilt to fix.
 *
 *  There is also no "New combined property" button here, and that is not an
 *  omission. A holding is made OF records, so it is made where the records are:
 *  you tick them on Properties and press Combine. A second creation path here
 *  would need its own record picker — the same decision asked in two places,
 *  which is how two pickers come to disagree about what may be combined.
 */
import { Link } from 'react-router';

import { useCombinedProperties } from '../api';
import { Empty, Failed, Icon, PageHead, Pill, inrOr, num, plural } from '../ui';
import { Sk } from '../skeletons';

/** Acres, plot yards and built square feet in one line — and only the ones this
 *  holding actually has. They are never added together: a line reading
 *  "61,450" over land and slab would be a number that measures nothing. */
function ExtentLine({ farm, plot, built }: { farm: number; plot: number; built: number }) {
  const bits = [
    farm > 0 && `${num(farm, 2)} ac`,
    plot > 0 && `${num(plot)} Sq.yd`,
    built > 0 && `${num(built)} Sq.ft built`,
  ].filter(Boolean) as string[];
  return <span className="num">{bits.join(' · ') || 'No extent recorded'}</span>;
}

export function Combined() {
  const { data, isLoading, error } = useCombinedProperties();

  return (
    <main>
      <PageHead eyebrow="Viewed together" title="Combined views" />

      {isLoading && <Sk w="100%" h="8rem" r="var(--radius-md)" />}
      {!isLoading && !data && <Failed what="Your combined views" error={error} boxed h="18rem" />}

      {data && data.length === 0 && (
        <Empty
          boxed h="20rem" icon="parcel" title="No combined views yet"
          action={
            <Link className="btn primary" to="/app/properties">Go to Properties</Link>
          }
        >
          On Properties, select 2 or more and choose Combine. Official records stay separate.
        </Empty>
      )}

      {data && data.length > 0 && (
        <div className="rows boxed card" style={{ padding: 0 }}>
          {data.map((c) => (
            <div className="row" key={c.id}>
              <span className="grow">
                <Link to={`/app/combined/${c.id}`} className="accent"
                      style={{ textDecoration: 'none', fontWeight: 700 }}>
                  {c.name}
                </Link>
                <small className="note" style={{ display: 'block' }}>
                  {[
                    plural(c.memberCount, 'record'),
                    c.placeLine,
                    `${c.surveyedCount} of ${c.memberCount} with boundaries`,
                  ].filter(Boolean).join(' · ')}
                </small>
                {c.note && <small className="note" style={{ display: 'block' }}>{c.note}</small>}
              </span>
              {/* A holding that has lost a member says so here rather than only
                  on its own page: the list is where somebody would notice. */}
              {!c.isComplete && <Pill kind="disputed">Missing a record</Pill>}
              <ExtentLine farm={c.farmExtent} plot={c.plotExtent} built={c.builtExtent} />
              <span className="num">{inrOr(c.marketValue)}</span>
              <Link className="btn sm" to={`/app/combined/${c.id}`}>
                <Icon name="parcel" size={15} /> Open
              </Link>
            </div>
          ))}
        </div>
      )}

    </main>
  );
}

export default Combined;
