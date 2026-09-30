import { HERO_SCENE, JOURNEY_SCENE } from './landingContent';

const PAPER = 'var(--color-paper)';
const SURFACE = 'var(--color-paper-2)';
const RAISED = 'var(--color-paper-3)';
const RULE = 'var(--color-rule-strong)';
const INK = 'var(--color-ink)';
const MUTED = 'var(--color-ink-2)';
const DIM = 'var(--color-ink-3)';
const ACCENT = 'var(--color-accent)';

export function JourneyChrome() {
  return (
    <g>
      <rect x="4" y="4" width="512" height="412" rx="8" fill={PAPER} stroke={RULE} />
      <path d="M4 53H516" stroke={RULE} />
      <text x="23" y="35" fill={INK} fontSize="19" fontWeight="700">Pattadar<tspan fill={ACCENT}>.</tspan></text>
      <text x="496" y="35" fill={DIM} fontSize="10" textAnchor="end">{JOURNEY_SCENE.note}</text>
    </g>
  );
}

export function AddPropertyView() {
  return (
    <g>
      <text x="28" y="82" fill={DIM} fontSize="10" fontWeight="700">YOUR PROPERTIES</text>
      <text x="28" y="115" fill={INK} fontSize="23" fontWeight="700">Add a property</text>
      <path d="M28 132H492" stroke={RULE} />
      <rect x="28" y="152" width="464" height="124" rx="7" fill={SURFACE} stroke={RULE} strokeDasharray="4 4" />
      <text x="48" y="183" fill={INK} fontSize="14" fontWeight="700">Start from the paper</text>
      <text x="48" y="206" fill={MUTED} fontSize="11">Passbook or deed · PDF or photo</text>
      <rect x="48" y="224" width="180" height="34" rx="17" fill={RAISED} stroke={ACCENT} />
      <text x="138" y="246" fill={INK} textAnchor="middle" fontSize="12" fontWeight="700">{JOURNEY_SCENE.upload}</text>
      <text x="28" y="308" fill={DIM} fontSize="10" fontWeight="700">REVIEW BEFORE SAVING</text>
      <rect x="28" y="319" width="225" height="45" rx="5" fill={SURFACE} stroke={RULE} />
      <text x="42" y="337" fill={MUTED} fontSize="11">Survey number</text>
      <text x="42" y="353" fill={INK} fontSize="12">Check against the paper</text>
      <rect x="265" y="319" width="227" height="45" rx="5" fill={SURFACE} stroke={RULE} />
      <text x="279" y="337" fill={MUTED} fontSize="11">Village</text>
      <text x="279" y="353" fill={INK} fontSize="12">Check against the paper</text>
      <text x="28" y="395" fill={MUTED} fontSize="11">AI suggestions are optional; the owner checks each detail.</text>
    </g>
  );
}

export function InviteView() {
  return (
    <g>
      <text x="28" y="82" fill={DIM} fontSize="10" fontWeight="700">INVITATIONS</text>
      <text x="28" y="115" fill={INK} fontSize="23" fontWeight="700">Invite someone</text>
      <path d="M28 132H492" stroke={RULE} />
      <text x="28" y="158" fill={DIM} fontSize="10" fontWeight="700">MOBILE NUMBER OR EMAIL</text>
      <rect x="28" y="170" width="464" height="38" rx="5" fill={SURFACE} stroke={RULE} />
      <text x="42" y="195" fill={MUTED} fontSize="12">{JOURNEY_SCENE.invite}</text>
      <text x="28" y="235" fill={DIM} fontSize="10" fontWeight="700">INVITE THEM TO</text>
      <rect x="28" y="247" width="464" height="53" rx="6" fill={RAISED} stroke={ACCENT} />
      <text x="43" y="269" fill={INK} fontSize="13" fontWeight="700">{HERO_SCENE.property}</text>
      <text x="43" y="288" fill={MUTED} fontSize="11">This property only</text>
      <text x="28" y="327" fill={DIM} fontSize="10" fontWeight="700">ROLE</text>
      <text x="267" y="327" fill={DIM} fontSize="10" fontWeight="700">OPEN FOR</text>
      <rect x="28" y="337" width="225" height="38" rx="5" fill={SURFACE} stroke={RULE} />
      <text x="43" y="362" fill={INK} fontSize="12">View</text>
      <rect x="265" y="337" width="227" height="38" rx="5" fill={SURFACE} stroke={RULE} />
      <text x="280" y="362" fill={INK} fontSize="12">30 days</text>
      <text x="28" y="398" fill={MUTED} fontSize="11">Property-scoped access</text>
      <rect x="360" y="383" width="132" height="28" rx="14" fill={ACCENT} />
      <text x="426" y="402" fill="var(--color-accent-ink)" textAnchor="middle" fontSize="11" fontWeight="700">Send invitation</text>
    </g>
  );
}

export function OrganisedView() {
  return (
    <g>
      <text x="28" y="82" fill={MUTED} fontSize="11">Properties  ›  {HERO_SCENE.property}</text>
      <text x="28" y="116" fill={INK} fontSize="23" fontWeight="700">{HERO_SCENE.property}</text>
      <text x="28" y="138" fill={DIM} fontSize="10">LAND PARCEL · {HERO_SCENE.place.toUpperCase()}</text>
      <text x="28" y="177" fill={ACCENT} fontSize="12" fontWeight="700">Documents</text>
      <text x="126" y="177" fill={MUTED} fontSize="12">People</text>
      <text x="187" y="177" fill={MUTED} fontSize="12">Location</text>
      <path d="M28 188H492" stroke={RULE} />
      <path d="M28 188H105" stroke={ACCENT} strokeWidth="2" />
      <text x="28" y="221" fill={INK} fontSize="17" fontWeight="700">Documents saved with this property</text>
      {HERO_SCENE.documents.map((doc, index) => {
        const y = 238 + index * 50;
        return (
          <g key={doc.title}>
            <rect x="28" y={y} width="464" height="45" rx="6" fill={SURFACE} stroke={RULE} />
            <rect x="39" y={y + 8} width="28" height="28" rx="5" fill={RAISED} />
            <path d={`M48 ${y + 13}h10v17H48zM50 ${y + 20}h6`} stroke={MUTED} strokeWidth="1.3" />
            <text x="78" y={y + 20} fill={INK} fontSize="12" fontWeight="700">{doc.title}</text>
            <text x="78" y={y + 36} fill={MUTED} fontSize="10">Saved copy</text>
            <text x="472" y={y + 27} fill={MUTED} textAnchor="end" fontSize="11">{doc.shelf}</text>
          </g>
        );
      })}
      <text x="28" y="404" fill={DIM} fontSize="10">Copies here are separate from official government records.</text>
    </g>
  );
}
