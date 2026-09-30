import { HERO_SCENE } from './landingContent';

export const HERO_FRAME = {
  wide: { viewBox: '0 0 680 500', width: 680, height: 500 },
  compact: { viewBox: '175 68 501 428', width: 501, height: 428 },
  small: { viewBox: '175 112 501 380', width: 501, height: 380 },
  tiny: { viewBox: '175 108 501 340', width: 501, height: 340 },
} as const;

const PAPER = 'var(--color-paper)';
const SURFACE = 'var(--color-paper-2)';
const RAISED = 'var(--color-paper-3)';
const RULE = 'var(--color-rule-strong)';
const INK = 'var(--color-ink)';
const MUTED = 'var(--color-ink-2)';
const DIM = 'var(--color-ink-3)';
const ACCENT = 'var(--color-accent)';

export function ProductChrome() {
  return (
    <g>
      <rect x="4" y="4" width="672" height="492" rx="8" fill={PAPER} stroke={RULE} />
      <path d="M4 59H676M158 59V496" stroke={RULE} strokeOpacity="0.7" />
      <text x="23" y="38" fill={INK} fontSize="22" fontWeight="700">Pattadar<tspan fill={ACCENT}>.</tspan></text>
      <text x="23" y="90" fill={DIM} fontSize="10" fontWeight="700">YOUR PORTFOLIO</text>
      <rect x="15" y="106" width="132" height="35" rx="6" fill={RAISED} stroke={RULE} />
      <text x="29" y="129" fill={ACCENT} fontSize="13" fontWeight="700">Properties</text>
      <text x="29" y="169" fill={MUTED} fontSize="13">Documents</text>
      <text x="23" y="210" fill={DIM} fontSize="10" fontWeight="700">SHARED</text>
      <text x="29" y="237" fill={MUTED} fontSize="13">Invitations</text>
      <path d="M15 189H146" stroke={RULE} strokeOpacity="0.6" />
    </g>
  );
}

export function PropertiesView({ showTitle = true }: { showTitle?: boolean }) {
  return (
    <g>
      <text x="188" y="100" fill={DIM} fontSize="10" fontWeight="700">YOUR PROPERTIES</text>
      <text x="188" y="138" fill={INK} fontSize="28" fontWeight="700">Properties</text>
      <rect x="554" y="106" width="94" height="34" rx="17" fill={ACCENT} />
      <text x="601" y="128" fill="var(--color-accent-ink)" textAnchor="middle" fontSize="12" fontWeight="700">+ Add</text>
      <path d="M188 157H649" stroke={RULE} />
      <rect x="188" y="178" width="461" height="243" rx="8" fill={SURFACE} stroke={RULE} />
      <rect x="189" y="179" width="459" height="111" rx="7" fill={RAISED} />
      <path d="M189 290H648" stroke={RULE} />
      <path d="M265 257L303 213L361 230L420 199L466 222L439 264Z" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" />
      <path d="M303 213L316 259M361 230L345 270M420 199L405 270" stroke={RULE} strokeWidth="1.5" />
      <circle cx="420" cy="199" r="4" fill={ACCENT} />
      {showTitle && <text x="208" y="322" fill={INK} fontSize="19" fontWeight="700">{HERO_SCENE.property}</text>}
      <text x="208" y="347" fill={MUTED} fontSize="13">Land parcel · {HERO_SCENE.place}</text>
      <path d="M208 364H628" stroke={RULE} strokeOpacity="0.7" />
      <text x="208" y="391" fill={MUTED} fontSize="13">Documents beside this property</text>
      <text x="630" y="392" fill={ACCENT} textAnchor="end" fontSize="13" fontWeight="700">Open record →</text>
    </g>
  );
}

export function RecordFrame({ showTitle = true }: { showTitle?: boolean }) {
  return (
    <g>
      <text x="188" y="96" fill={MUTED} fontSize="12">Properties  ›  {HERO_SCENE.property}</text>
      {showTitle && <text x="188" y="136" fill={INK} fontSize="27" fontWeight="700">{HERO_SCENE.property}</text>}
      <text x="188" y="159" fill={DIM} fontSize="11">LAND PARCEL · {HERO_SCENE.place.toUpperCase()}</text>
      <rect x="521" y="108" width="128" height="35" rx="17" fill={SURFACE} stroke={RULE} />
      <text x="585" y="131" fill={INK} textAnchor="middle" fontSize="12" fontWeight="700">Share securely</text>
      <text x="188" y="202" fill={ACCENT} fontSize="13" fontWeight="700">Documents</text>
      <text x="283" y="202" fill={MUTED} fontSize="13">People</text>
      <text x="343" y="202" fill={MUTED} fontSize="13">Location</text>
      <text x="427" y="202" fill={MUTED} fontSize="13">Activity</text>
      <path d="M188 216H649" stroke={RULE} />
      <path d="M188 216H263" stroke={ACCENT} strokeWidth="2" />
    </g>
  );
}

function DocumentRow({ index }: { index: number }) {
  const document = HERO_SCENE.documents[index];
  const y = 286 + index * 54;
  return (
    <g>
      <rect x="188" y={y} width="461" height="50" rx="6" fill={SURFACE} stroke={RULE} />
      <rect x="201" y={y + 9} width="31" height="31" rx="5" fill={RAISED} />
      <path d={`M210 ${y + 16}h11v15h-11zM212 ${y + 21}h7M212 ${y + 25}h7`} stroke={MUTED} strokeWidth="1.2" />
      <text x="245" y={y + 22} fill={INK} fontSize="13" fontWeight="700">{document.title}</text>
      <text x="245" y={y + 39} fill={MUTED} fontSize="11">Saved copy</text>
      <rect x="545" y={y + 13} width="84" height="24" rx="12" fill={PAPER} stroke={RULE} />
      <text x="587" y={y + 29} fill={MUTED} textAnchor="middle" fontSize="11">{document.shelf}</text>
    </g>
  );
}

export function DocumentsView({ showNew = false }: { showNew?: boolean }) {
  return (
    <g>
      <text x="188" y="250" fill={INK} fontSize="20" fontWeight="700">Documents</text>
      <text x="188" y="269" fill={MUTED} fontSize="11">Copies saved with this property</text>
      <rect x="519" y="229" width="130" height="32" rx="16" fill={ACCENT} />
      <text x="584" y="250" fill="var(--color-accent-ink)" textAnchor="middle" fontSize="11" fontWeight="700">+ Add a document</text>
      <DocumentRow index={0} />
      <DocumentRow index={1} />
      {showNew && <DocumentRow index={2} />}
    </g>
  );
}

export function NewDocumentRow() {
  return <DocumentRow index={2} />;
}

export function UploadDrawer({ compact = false }: { compact?: boolean }) {
  return (
    <g>
      <rect x="354" y="59" width="322" height="437" fill={SURFACE} stroke={RULE} />
      <text x="374" y="90" fill={DIM} fontSize="10" fontWeight="700">{HERO_SCENE.property.toUpperCase()} · DOCUMENTS</text>
      <text x="374" y="137" fill={INK} fontSize="21" fontWeight="700">File a document</text>
      <path d="M354 152H676" stroke={RULE} />
      <rect x="374" y="166" width="281" height="110" rx="7" fill={PAPER} stroke={RULE} strokeDasharray="4 4" />
      <text x="392" y="197" fill={INK} fontSize="13" fontWeight="700">Deed copy.pdf</text>
      <text x="392" y="219" fill={MUTED} fontSize="11">Scan selected for this property</text>
      <rect x="392" y="237" width="116" height="24" rx="12" fill={RAISED} stroke={RULE} />
      <text x="450" y="253" fill={INK} textAnchor="middle" fontSize="11">Review file</text>
      <text x="374" y="309" fill={DIM} fontSize="10" fontWeight="700">WHICH SHELF</text>
      <rect x="374" y="321" width="68" height="26" rx="13" fill={RAISED} stroke={ACCENT} />
      <text x="408" y="338" fill={ACCENT} textAnchor="middle" fontSize="11" fontWeight="700">Title</text>
      <rect x="451" y="321" width="109" height="26" rx="13" fill={PAPER} stroke={RULE} />
      <text x="505" y="338" fill={MUTED} textAnchor="middle" fontSize="11">Revenue record</text>
      <path d={compact ? 'M354 395H676' : 'M354 432H676'} stroke={RULE} />
      <rect x="374" y={compact ? 405 : 446} width="281" height="34" rx="17" fill={ACCENT} />
      <text x="514" y={compact ? 427 : 468} fill="var(--color-accent-ink)" textAnchor="middle" fontSize="12" fontWeight="700">File the document</text>
    </g>
  );
}

export function ShareView({ compact = false, showFootnote = true }: { compact?: boolean; showFootnote?: boolean }) {
  return (
    <g>
      <rect x="188" y="232" width="461" height={compact ? 208 : 230} rx="7" fill={SURFACE} stroke={RULE} />
      <text x="207" y="258" fill={INK} fontSize="16" fontWeight="700">Share securely</text>
      <text x="207" y="277" fill={MUTED} fontSize="11">Valid for 30 days · Anyone with the link can download</text>
      <path d="M207 290H630" stroke={RULE} />
      <rect x="208" y="306" width="16" height="16" rx="3" fill={ACCENT} />
      <path d="M211 314l4 4 6-8" stroke="var(--color-accent-ink)" strokeWidth="2" fill="none" />
      <text x="237" y="319" fill={INK} fontSize="12">Passbook.pdf</text>
      <rect x="208" y="334" width="16" height="16" rx="3" fill={ACCENT} />
      <path d="M211 342l4 4 6-8" stroke="var(--color-accent-ink)" strokeWidth="2" fill="none" />
      <text x="237" y="347" fill={INK} fontSize="12">Deed copy.pdf</text>
      <text x="208" y={compact ? 367 : 379} fill={DIM} fontSize="10" fontWeight="700">WHO IS IT FOR</text>
      <rect x="207" y={compact ? 376 : 388} width="298" height="33" rx="5" fill={PAPER} stroke={RULE} />
      <text x="219" y={compact ? 398 : 410} fill={MUTED} fontSize="11">A name or a firm</text>
      <rect x="522" y={compact ? 376 : 388} width="107" height="33" rx="16" fill={RAISED} stroke={RULE} />
      <text x="576" y={compact ? 398 : 410} fill={MUTED} textAnchor="middle" fontSize="11" fontWeight="700">Share</text>
      {showFootnote && <text x="207" y="438" fill={DIM} fontSize="10">Select files and name the link before sharing.</text>}
    </g>
  );
}
