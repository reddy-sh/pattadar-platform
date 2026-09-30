import { useEffect, useRef, useState } from 'react';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';

import './themeSamples.css';

type ThemeKey = 'pattadar' | 'light' | 'dark';
type PreviewView = 'overview' | 'documents' | 'map';

const themes: Array<{ key: ThemeKey; name: string; description: string }> = [
  { key: 'pattadar', name: 'Pattadar Gold', description: 'Signature theme' },
  { key: 'light', name: 'Light', description: 'Standard light' },
  { key: 'dark', name: 'Dark', description: 'Standard dark' },
];

function ThemeChoices({ value, onChange }: { value: ThemeKey; onChange: (value: ThemeKey) => void }) {
  return (
    <div className="appearance-options" role="group" aria-label="Theme">
      {themes.map((item) => (
        <button
          className="appearance-option"
          data-selected={value === item.key}
          key={item.key}
          onClick={() => onChange(item.key)}
          type="button"
          aria-pressed={value === item.key}
        >
          <span className="appearance-option__palette" data-palette={item.key} aria-hidden="true">
            <i /><i /><i />
          </span>
          <span className="appearance-option__text">
            <strong>{item.name}</strong>
            <small>{item.description}</small>
          </span>
          {value === item.key && <CheckRoundedIcon className="appearance-option__check" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

function ThemeGallery({ value, onChange }: { value: ThemeKey; onChange: (value: ThemeKey) => void }) {
  return (
    <section className="theme-gallery" aria-labelledby="theme-gallery-title">
      <div className="theme-samples__section-label"><span>01</span><h2 id="theme-gallery-title">Theme templates</h2></div>
      <div className="theme-gallery__grid">
        {themes.map((item) => (
          <button
            aria-pressed={value === item.key}
            className="theme-template"
            data-selected={value === item.key}
            data-theme={item.key}
            key={item.key}
            onClick={() => onChange(item.key)}
            type="button"
          >
            <span className="theme-template__label">
              <span><strong>{item.name}</strong><small>{item.description}</small></span>
              {value === item.key && <CheckRoundedIcon aria-hidden="true" />}
            </span>
            <span className="theme-template__canvas">
              <span className="theme-template__mast"><img src="/brand/pattadar-mark.svg" alt="" />Pattadar <span>LAND RECORDS</span></span>
              <span className="theme-template__record">
                <span className="theme-template__eyebrow">PARCEL / 001</span>
                <strong>Survey 121/2</strong>
                <span className="theme-template__subline">Ongole · Prakasam</span>
                <span className="theme-template__facts">
                  <span><small>EXTENT</small><b>8.20 acres</b></span>
                  <span><small>RECORD</small><b>ROR - 1B</b></span>
                </span>
                <span className="theme-template__map" aria-hidden="true">
                  <svg viewBox="0 0 260 65">
                    <path d="M9 50 82 21l61 11 35-25 72 18-15 32-92-9-61 7Z" />
                    <path d="m82 21 61 11-7 19-54 4Z" />
                  </svg>
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function FieldMap({ large = false }: { large?: boolean }) {
  return (
    <div className="field-map" data-large={large}>
      <div className="field-map__label">PARCEL SKETCH / 121-2</div>
      <svg viewBox="0 0 560 360" role="img" aria-label="Illustrative survey map with parcel 121 slash 2 highlighted">
        <defs>
          <pattern id="survey-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" className="field-map__grid" />
          </pattern>
        </defs>
        <path className="field-map__paper" d="M0 0h560v360H0z" />
        <path fill="url(#survey-grid)" d="M0 0h560v360H0z" />
        <path className="field-map__track" d="M0 319 76 311l66-42 112 11 115 44 101-36 90-8" />
        <path className="field-map__plot" d="M50 51 251 32l101 57 157-18 18 193-159 54-145-25-135 31Z" />
        <path className="field-map__selected" d="m251 32 101 57-9 98-106-18Z" />
        <path className="field-map__boundary" d="M237 169 223 293M352 89l-9 98 25 131M50 163l187 6 106 18 178-4M88 324l61-161M223 293l-74-130" />
        <circle className="field-map__marker" cx="251" cy="32" r="6" />
        <circle className="field-map__marker" cx="352" cy="89" r="6" />
        <circle className="field-map__marker" cx="223" cy="293" r="6" />
        <text x="273" y="124" className="field-map__selected-text">121/2</text>
        <text x="108" y="119">121/1</text>
        <text x="402" y="136">122</text>
        <text x="249" y="239">121/3</text>
        <text x="403" y="251">123</text>
        <text x="31" y="253" className="field-map__road">ACCESS TRACK</text>
      </svg>
      <div className="field-map__north" aria-label="North">N <span>↑</span></div>
      <div className="field-map__scale"><span /> 50 m</div>
    </div>
  );
}

function PortalPreview({ theme }: { theme: ThemeKey }) {
  const [view, setView] = useState<PreviewView>('overview');

  return (
    <section className="sample-portal" data-theme={theme} aria-label={`${themes.find((item) => item.key === theme)?.name} portal sample`}>
      <div className="sample-portal__top">
        <div className="sample-portal__brand">
          <img src="/brand/pattadar-mark.svg" alt="" />
          <span>Pattadar</span>
        </div>
        <span className="sample-portal__context">LAND RECORDS <span>/ 001</span></span>
      </div>

      <nav className="sample-portal__nav" aria-label="Sample portal views">
        {(['overview', 'documents', 'map'] as const).map((item) => (
          <button
            aria-current={view === item ? 'page' : undefined}
            key={item}
            onClick={() => setView(item)}
            type="button"
          >
            {item === 'overview' ? 'Overview' : item === 'documents' ? 'Documents' : 'Field map'}
          </button>
        ))}
      </nav>

      {view === 'overview' && (
        <div className="sample-portal__body">
          <div className="sample-portal__heading">
            <div>
              <p className="sample-portal__eyebrow">PARCEL / 001</p>
              <h2>Survey 121/2</h2>
              <p className="sample-portal__lead">Agricultural land · Prakasam district</p>
            </div>
            <span className="sample-portal__sample-tag">Illustrative record</span>
          </div>

          <div className="sample-portal__locator" aria-label="Sample record location">
            <div><span>District</span><strong>Prakasam</strong></div>
            <div><span>Mandal</span><strong>Ongole</strong></div>
            <div><span>Village</span><strong>Sample village</strong></div>
          </div>
          <div className="sample-record">
            <div className="sample-record__detail">
              <div className="sample-record__kicker"><span className="sample-record__index">01</span> RECORD PARTICULARS</div>
              <h3>Parcel details</h3>
              <dl>
                <div><dt>Survey / subdivision</dt><dd>121 / 2</dd></div>
                <div><dt>Extent</dt><dd>8.20 acres</dd></div>
                <div><dt>Record</dt><dd>ROR - 1B</dd></div>
                <div><dt>Boundary</dt><dd>FMB sketch</dd></div>
              </dl>
              <button className="sample-record__action" type="button" onClick={() => setView('map')}>
                View parcel sketch <ArrowForwardRoundedIcon aria-hidden="true" />
              </button>
            </div>
            <FieldMap />
          </div>
          <p className="sample-portal__note">Illustrative fields only. Confirm details against the source record.</p>
        </div>
      )}

      {view === 'documents' && (
        <div className="sample-portal__body">
          <div className="sample-portal__heading">
            <div>
              <p className="sample-portal__eyebrow">PARCEL / 001</p>
              <h2>Record set</h2>
              <p className="sample-portal__lead">Documents associated with survey 121/2.</p>
            </div>
            <span className="sample-portal__sample-tag">Illustrative record</span>
          </div>
          <div className="sample-documents">
            {[
              ['01', 'ROR - 1B', 'Ownership particulars'],
              ['02', 'Adangal', 'Land and cultivation details'],
              ['03', 'FMB sketch', 'Survey boundary reference'],
            ].map(([number, title, detail]) => (
              <div className="sample-documents__row" key={number}>
                <span>{number}</span><strong>{title}</strong><small>{detail}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'map' && (
        <div className="sample-portal__body">
          <div className="sample-portal__heading">
            <div>
              <p className="sample-portal__eyebrow">PARCEL / 001</p>
              <h2>Parcel sketch</h2>
              <p className="sample-portal__lead">Survey 121/2 in the context of adjoining parcels.</p>
            </div>
            <span className="sample-portal__sample-tag">Illustrative record</span>
          </div>
          <FieldMap large />
        </div>
      )}
      <div className="sample-portal__foot">DEMONSTRATION ONLY · NOT AN OFFICIAL LAND RECORD</div>
    </section>
  );
}

export function ThemeSamplesPage() {
  const [theme, setTheme] = useState<ThemeKey>('pattadar');
  const [paperOpen, setPaperOpen] = useState(false);
  const accountButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const paper = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!paperOpen) return;
    closeButton.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPaperOpen(false);
      } else if (event.key === 'Tab') {
        const buttons = paper.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
      accountButton.current?.focus();
    };
  }, [paperOpen]);

  return (
    <div className="theme-samples" data-theme={theme}>
      <header className="theme-samples__topbar">
        <a className="theme-samples__brand" href="/" aria-label="Pattadar home">
          <img src="/brand/pattadar-mark.svg" alt="" />
          <span>Pattadar<span className="theme-samples__brand-dot">.</span></span>
        </a>
        <span className="theme-samples__header-note">APPEARANCE STUDY</span>
        <button
          aria-controls="appearance-paper"
          aria-expanded={paperOpen}
          className="theme-samples__account"
          onClick={() => setPaperOpen(true)}
          ref={accountButton}
          type="button"
        >
          <AccountCircleOutlinedIcon aria-hidden="true" />
          <span>Account center</span>
          <span className="theme-samples__account-short">Account</span>
          <TuneRoundedIcon className="theme-samples__account-tune" aria-hidden="true" />
        </button>
      </header>

      <main className="theme-samples__main">
        <div className="theme-samples__intro">
          <p className="theme-samples__overline">PATTADAR / APPEARANCE STUDY</p>
          <h1>One portal. Three palettes.</h1>
          <p>Compare the same illustrative record in Pattadar Gold, Light, and Dark. Pattadar Gold opens by default.</p>
        </div>

        <ThemeGallery value={theme} onChange={setTheme} />

        <div className="theme-samples__studio">
          <div className="theme-samples__live">
            <div className="theme-samples__section-label"><span>02</span><h2>Selected theme</h2></div>
            <PortalPreview theme={theme} />
          </div>
        </div>

        <section className="identity-section" aria-labelledby="identity-title">
          <div className="identity-section__head">
            <div>
              <p className="theme-samples__overline">PATTADAR / IDENTITY</p>
              <h2 id="identity-title">Pattadar identity</h2>
            </div>
            <p>SVG marks and a 1024px app icon.</p>
          </div>
          <div className="identity-section__grid">
            <article>
              <div className="identity-section__art"><img className="identity-section__mark" src="/brand/pattadar-mark.svg" alt="Pattadar mark" /></div>
              <div className="identity-section__caption"><span>01 / Mark</span><a href="/brand/pattadar-mark.svg" download aria-label="Download Pattadar mark SVG"><DownloadRoundedIcon aria-hidden="true" /></a></div>
            </article>
            <article>
              <div className="identity-section__art">
                <img className="identity-section__wordmark" src="/brand/pattadar-logo.svg" alt="Pattadar wordmark" />
                <img className="identity-section__wordmark identity-section__wordmark--light" src="/brand/pattadar-logo-light.svg" alt="Pattadar wordmark" />
              </div>
              <div className="identity-section__caption"><span>02 / Wordmark</span><a href={theme === 'dark' ? '/brand/pattadar-logo-light.svg' : '/brand/pattadar-logo.svg'} download aria-label="Download Pattadar wordmark SVG"><DownloadRoundedIcon aria-hidden="true" /></a></div>
            </article>
            <article>
              <div className="identity-section__art"><img className="identity-section__icon" src="/brand/pattadar-icon.svg" alt="Pattadar app icon" /></div>
              <div className="identity-section__caption"><span>03 / App icon</span><a href="/brand/pattadar-icon-1024.png" download aria-label="Download Pattadar 1024 pixel app icon PNG"><DownloadRoundedIcon aria-hidden="true" /></a></div>
            </article>
          </div>
        </section>
      </main>

      {paperOpen && (
        <>
          <button className="appearance-backdrop" type="button" tabIndex={-1} aria-label="Close account center" onClick={() => setPaperOpen(false)} />
          <aside className="appearance-paper" id="appearance-paper" ref={paper} role="dialog" aria-modal="true" aria-labelledby="appearance-paper-title">
            <div className="appearance-paper__top">
              <span>ACCOUNT CENTER</span>
              <button ref={closeButton} type="button" aria-label="Close account center" onClick={() => setPaperOpen(false)}>
                <CloseRoundedIcon aria-hidden="true" />
              </button>
            </div>
            <h2 id="appearance-paper-title">Appearance</h2>
            <p className="appearance-paper__lead">Make the portal comfortable for the way you read.</p>
            <section>
              <div className="theme-samples__section-label"><span>01</span><h3>Theme</h3></div>
              <ThemeChoices value={theme} onChange={setTheme} />
            </section>
            <div className="appearance-paper__foot">Changes are shown instantly in the sample.</div>
          </aside>
        </>
      )}
    </div>
  );
}
