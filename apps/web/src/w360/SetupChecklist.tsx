/**
 * "Finish setting up" on Home: the setup tasks an invitation or a referral
 * left for this account (growth.py `setupTasks`). Drawn only while one is
 * open; a failed read draws nothing, because Home's own content is the point
 * of the page and this card is an addition to it.
 */
import { Link } from 'react-router';

import { useSetupTasks } from './growthData';
import { Icon } from './ui';

export function SetupChecklist() {
  const q = useSetupTasks();
  const tasks = q.data ?? [];
  const open = tasks.filter((t) => !t.done).length;
  if (!tasks.length || !open) return null;
  const done = tasks.length - open;
  return (
    <section className="sec card pad-lg" aria-labelledby="setup-h">
      <div className="cardhead">
        <h2 id="setup-h">Finish setting up</h2>
        <span className="note">{done} of {tasks.length} done</span>
      </div>
      <ol className="rows" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {tasks.map((t) => (
          <li key={t.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <span className={t.done ? 'up' : 'muted'} style={{ display: 'flex', paddingTop: '0.125rem' }}>
              <Icon name={t.done ? 'ok' : 'clock'} size={18} />
            </span>
            <span className="grow" style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', textDecoration: t.done ? 'line-through' : undefined }}>{t.title}</strong>
              {!t.done && <span className="note">{t.detail}</span>}
            </span>
            {!t.done && t.route && <Link className="btn sm" to={t.route}>Open</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}
