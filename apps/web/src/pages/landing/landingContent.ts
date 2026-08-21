/**
 * Landing page copy — BYTE-FROZEN (design.md § Copy freeze).
 *
 * Every user-visible string on the landing page lives here, extracted
 * verbatim from the pre-Bloom page. Redesigns restyle the page around these
 * strings; they may not add, remove or alter them. Icons stay in the page
 * component, keyed by the `icon` names used here.
 *
 * Whitespace rules used during extraction: JSX text runs were collapsed to
 * single spaces exactly as React renders them; `&apos;` became a straight
 * apostrophe; `’` escapes were kept as written.
 */

export const NAV_LINKS: [string, string][] = [
  ['About', 'story'],
  ['Features', 'features'],
  ['Pattadar AI', 'ai'],
  ['How it works', 'how'],
  ['6 Pillars', 'pillars'],
  ['Services', 'services'],
  ['FAQ', 'faq'],
];

export const WORDMARK = { name: 'Pattadar', dot: '.' };

export const NAV_CTA = 'Sign in';

export const HERO = {
  badge: 'Land · Records · Family',
  h1Line1: "Your family's land records,",
  h1Line2: 'in one secure place',
  leadPrefix: 'Pattadar helps Andhra Pradesh land-owners manage ',
  flipWords: ['parcels', 'passbooks', 'registered deeds', 'documents', 'family'],
  leadSuffix: ' — securely, and in plain language the whole family can understand.',
  ctaPrimary: 'Get started',
  ctaSecondary: 'Sign in',
};

export const TRUST_ITEMS = [
  { icon: 'lock', text: 'Encrypted at rest, stored in India' },
  { icon: 'visibilityOff', text: 'Aadhaar numbers always masked' },
  { icon: 'manageAccounts', text: 'You control your data' },
] as const;

export const PRODUCT_FRAME = {
  overline: 'Land portfolio · sample',
  costLabel: 'Acquisition cost',
  costValue: '₹2,84,50,000',
  costDelta: '↑ 10% since purchase · guideline basis',
  countsLine: '12 parcels · 3 passbooks · 2 properties',
  honesty:
    'True market value is hard to know in India — Pattadar tracks what you paid and the official guideline value, honestly.',
  parcels: [
    ['Survey 123/2A · Guntur', '2.45 acres'],
    ['Survey 87/1B · Krishna', '1.10 acres'],
    ['Flat · Vijayawada', '1,250 sft'],
    ['Survey 456/3 · Kurnool', '3.20 acres'],
  ] as [string, string][],
};

export const STORY = {
  eyebrow: 'Our story',
  h2: 'How Pattadar evolved',
  intro:
    'Pattadar evolved from the real pain of revenue issues — problems our own family faced with land records in Andhra Pradesh — into a platform built to deliver on that experience.',
  entries: [
    {
      t: 'Born from real pain',
      b: 'It started in Katragunta village, Prakasam district — inside the everyday revenue problems Andhra Pradesh families face when land is bought, sold or simply held.',
    },
    {
      t: 'Understanding the system',
      b: 'We mapped the six pillars the revenue system stands on — 1B & Adangal, survey numbers, the RSR, the Field Measurement Book, village maps and legal rights — the records true ownership depends on.',
    },
    {
      t: 'Every stage examined',
      b: 'Before, during and after a transaction — each stage’s pain points were studied one by one, and each got a practical answer.',
    },
    {
      t: 'The AI platform',
      b: 'The ideas became software: passbooks and deeds read by AI, a living land portfolio, a documents drive, and family members verified with secure links.',
    },
    {
      t: 'Today — pattadar.com',
      b: 'A secure home for your family’s land records — and a foundation growing towards the wallet, the AI watch dog and on-demand property services.',
    },
  ],
};

export const FEATURES_HEAD = {
  eyebrow: 'Everything in one place',
  h2: 'What you can do',
};

export interface FeatureContent {
  icon: string;
  title: string;
  body: string;
  wide?: boolean;
}

export const FEATURES: FeatureContent[] = [
  {
    icon: 'dashboard',
    title: 'A living land portfolio',
    body: 'Every parcel, passbook and property in one dashboard — extents, acquisition cost, guideline values and four health rings that show records, succession, tax and family verification at a glance.',
    wide: true,
  },
  {
    icon: 'documentScanner',
    title: 'AI reading, in two languages',
    body: 'Photograph a passbook, deed or Aadhaar card — English or Telugu — and the khata, survey numbers, extents and parties are read and filled in. You approve every detail before it is saved.',
  },
  {
    icon: 'folder',
    title: 'A real documents drive',
    body: 'Upload anything — the type is detected automatically and filed with the right land. Versions kept, trash recoverable, and every file opens in-portal — you never leave Pattadar.',
  },
  {
    icon: 'diversity',
    title: 'Family, verified — not just listed',
    body: 'Typed groups for families, partnerships and companies. Heirs carry shares, minors get guardians, Aadhaar stays masked, and every member confirms through a secure link on WhatsApp, SMS or email.',
    wide: true,
  },
  {
    icon: 'healthSafety',
    title: 'The inactivity safeguard',
    body: 'If the head of the family goes quiet for months, Pattadar alerts your chosen people in priority order — so the records never die with a phone.',
  },
  {
    icon: 'travelExplore',
    title: 'Boundaries on a live map',
    body: 'See each parcel on the satellite map, draw its boundary and measure area and side lengths — your land, exactly where it is.',
  },
  {
    icon: 'calculate',
    title: 'AP-IGRS tools built in',
    body: 'Stamp-duty calculator on real AP rates, the SRO office finder, guideline market values and land-unit conversion — acres, cents and guntas.',
  },
  {
    icon: 'factCheck',
    title: 'Auditable, exportable, yours',
    body: 'Every action lands in an audit log. Any table exports to branded PDF, Excel or CSV — your records leave with you, never locked in.',
  },
];

export const AI = {
  eyebrow: 'Pattadar AI',
  h2: 'An assistant that knows your land',
  lead: 'Ask in plain words — the Pattadar AI Assistant answers from your own records, and can even open the right page or record for you. No jargon, ever: it speaks the way your family does.',
  points: [
    [
      'Answers from your records',
      'It reads your portfolio — parcels, passbooks, documents, family — and answers about YOUR land, not generic advice.',
    ],
    [
      'Acts, not just talks',
      'Ask it to find a record and it opens the page, applies the filter and takes you there.',
    ],
    [
      'Plain language by rule',
      'Technical talk is deliberately kept away from you — answers come in words a farming family uses.',
    ],
  ] as [string, string][],
  convoOverline: 'Assistant · sample conversation',
  convo: [
    { role: 'user', text: 'Which of my parcels is missing a registered deed?' },
    {
      role: 'assistant',
      text: 'Two parcels have no deed on file — Survey 87/1B (Krishna) and Survey 456/3 (Kurnool). Shall I open them so you can upload the deeds?',
    },
    { role: 'user', text: 'Yes, open the Krishna one.' },
    {
      role: 'assistant',
      text: 'Opening Survey 87/1B now — the Files section is ready for the deed upload. 📄',
    },
  ] as { role: 'user' | 'assistant'; text: string }[],
};

export const HOW = {
  eyebrow: 'Three simple steps',
  h2: 'How Pattadar works',
  steps: [
    {
      n: '1',
      title: 'Add your land in minutes',
      body: 'Take a photo of your pattadar passbook or registered deed — the details are read for you and filled in automatically. No typing, no forms from scratch.',
    },
    {
      n: '2',
      title: 'Bring in your family',
      body: 'Add family members and heirs, send each one a secure verification link on WhatsApp or SMS, and see who has confirmed — all in one place.',
    },
    {
      n: '3',
      title: 'Everything stays organised',
      body: 'Parcels, passbooks, property papers and values — safe, together, and explained in plain language. Your records are ready whenever you need them.',
    },
  ],
};

export const PILLARS = {
  eyebrow: 'Built on how AP land records actually work',
  h2: 'The 6 pillars of your land record',
  intro:
    'Accurate ownership rests on six kinds of records. Pattadar understands each one — and keeps your copies organised, linked and explained.',
  items: [
    {
      icon: 'article',
      title: '1B & Adangal',
      body: 'The core ownership record — who holds the land and with what rights. Validating its history is how true ownership is established and protected from tampering.',
    },
    {
      icon: 'straighten',
      title: 'Survey number & boundaries',
      body: 'The identity of your land on the ground. Captured precisely so your parcel can be identified at any point in time, without ambiguity.',
    },
    {
      icon: 'historyEdu',
      title: 'Register of Survey Records',
      body: 'The historical archive. Old records go missing or fade — your copies are preserved digitally as lasting evidence.',
    },
    {
      icon: 'squareFoot',
      title: 'Field Measurement Book',
      body: 'The exact dimensions and extents used in surveys, disputes and transactions. Essential when the size of the land is questioned.',
    },
    {
      icon: 'map',
      title: 'Village & registration maps',
      body: 'Where your land sits and which registration office serves it — so the right office and the right map are always one tap away.',
    },
    {
      icon: 'gavel',
      title: 'Legal rights',
      body: 'Court orders and legal developments can affect property interests. Keeping the legal picture beside the land record keeps decisions informed.',
    },
  ],
};

export const STAGES = {
  eyebrow: 'Solutions for common revenue issues',
  h2: 'With you at every stage',
  intro:
    'Revenue problems appear before, during and after a property changes hands. Pattadar was born from those pain points — and organises your records so each stage goes smoothly.',
  stageLabel: 'Stage',
  items: [
    {
      stage: 'Before buying or selling',
      body: 'Have the 1B, Adangal and field measurement records validated and side-by-side, so surprises surface before money moves — not after.',
    },
    {
      stage: 'During the transaction',
      body: 'The right documents, the right extents and the right parties — everything the registration needs, organised and shareable in one place.',
    },
    {
      stage: 'After the transaction',
      body: 'New ownership lands in your passbook automatically, with the deed, receipts and family records linked and preserved from day one.',
    },
  ],
};

export const WALLET = {
  title: 'Pattadar Wallet',
  chip: 'Coming soon',
  body: 'Pay stamp duty, registration fees and family expenses from one secure balance — with every transaction recorded next to the land it belongs to.',
};

export const ROADMAP = {
  eyebrow: 'Beyond record-keeping',
  h2: "Services we're building next",
  chip: 'On the roadmap',
  items: [
    {
      title: 'AI Watch Dog',
      body: 'Alerts you to suspicious activity around your records — like double registrations or unauthorised 1B/Adangal changes.',
    },
    {
      title: 'On-demand property visits',
      body: 'Living far away? Request a photo visit, maintenance check or paperwork errand, delivered on a promised timeline.',
    },
    {
      title: 'Legal connect',
      body: 'When something goes wrong, reach a lawyer and share documents securely — everything stays inside the platform.',
    },
    {
      title: 'Trusted document writers',
      body: 'Ready to transact? Find rated document writers to prepare your papers at the right time.',
    },
  ],
};

export const FAQ = {
  eyebrow: 'Common questions',
  h2: 'Asked by families like yours',
  items: [
    [
      'Is my Aadhaar number safe here?',
      'Yes. Aadhaar numbers are always shown masked (XXXX XXXX 1234), stored encrypted in India, and never shared. Pattadar does not perform any Aadhaar authentication — your card photo is kept only for your own records.',
    ],
    [
      'Who can see my land records?',
      'Only you, and the family members you personally invite. Each member confirms through a secure link before they can see anything.',
    ],
    [
      'Is Pattadar a government website?',
      'No. Pattadar is a private service that helps you keep your own copies organised. Your official records always remain with the government registration offices.',
    ],
    [
      'What if the AI reads my deed wrongly?',
      'Every detail the AI fills in is shown to you for checking before it is saved — you always have the final word.',
    ],
    [
      'What does it cost?',
      'The pilot is free for invited families. Pricing for later will be announced well in advance — nothing is charged silently.',
    ],
  ] as [string, string][],
};

export const FINAL_CTA = {
  // Rendered as one heading: prefix + em phrase — concatenation is the
  // original frozen string "Your family's land deserves this care".
  h2Prefix: "Your family's land ",
  h2Em: 'deserves this care',
  body: 'Start with one passbook photo — see everything fall into place.',
  cta: 'Get started free',
};

export const FOOTER = {
  copyrightTail: ' Pattadar · Katragunta, Prakasam, Andhra Pradesh · San Francisco, California',
  privacy: 'Privacy',
  terms: 'Terms',
  grievance: 'Grievance: grievance@pattadar.com',
  grievanceHref: 'mailto:grievance@pattadar.com',
};
