/**
 * Landing page copy. Revised for product accuracy by user request on 28/09/2026.
 *
 * User-visible strings live here. Keep claims tied to what the product can do,
 * distinguish saved copies from official records, and mark future work clearly.
 * Icons stay in the page component, keyed by the names used here.
 */

export const NAV_LINKS: [string, string][] = [
  ['About', 'story'],
  ['Features', 'features'],
  ['Pattadar AI', 'ai'],
  ['How it works', 'how'],
  ['Land records', 'pillars'],
  ['University', 'university'],
  ['Network', 'network'],
  ['Services', 'services'],
  ['FAQ', 'faq'],
];

export const WORDMARK = { name: 'Pattadar', dot: '.' };

export const NAV_CTA = 'Sign in';

export const HERO = {
  badge: 'India · Andhra Pradesh · Telangana',
  h1Line1: 'One piece of land.',
  h1Line2: 'Many places to look.',
  lead: 'Revenue entries, survey maps and registered deeds tell different parts of the story. Pattadar helps your family keep its copies together; official records stay with the state.',
  ctaPrimary: 'Get started',
  ctaSecondary: 'Sign in',
};

export const LAND_STORY = {
  note: 'Illustrative landscape and record trail',
  chapters: [
    { label: 'Revenue', title: 'The name is in one record.', detail: 'A passbook, 1-B or Adangal can describe a holding.' },
    { label: 'Survey', title: 'The shape is in another.', detail: 'An FMB sketch or village map helps locate the parcel.' },
    { label: 'Deed', title: 'The transaction has its own trail.', detail: 'A registered deed records a transaction; it is not the survey map.' },
    { label: 'Pattadar', title: 'Keep the copies in one place.', detail: 'Organise the papers you have and share selected copies with family or advisers.' },
  ],
  records: [
    { office: 'Revenue', paper: '1-B / Adangal' },
    { office: 'Survey', paper: 'FMB / village map' },
    { office: 'Registration', paper: 'Registered deed' },
  ],
} as const;

export const TRUST_ITEMS = [
  { icon: 'lock', text: 'Encrypted storage' },
  { icon: 'visibilityOff', text: 'Aadhaar field masked' },
  { icon: 'manageAccounts', text: 'You choose access' },
] as const;

export const HERO_SCENE = {
  preview: 'Illustrative preview',
  property: 'Sample property',
  place: 'Andhra Pradesh',
  stages: [
    { label: 'Property', description: 'A sample property in the portfolio' },
    { label: 'Record', description: 'The sample property record is open' },
    { label: 'File a copy', description: 'A deed copy is ready to file with the property' },
    { label: 'Share', description: 'Selected copies are ready to share by link' },
  ],
  documents: [
    { title: 'Passbook.pdf', shelf: 'Revenue record' },
    { title: 'FMB sketch.pdf', shelf: 'Map' },
    { title: 'Deed copy.pdf', shelf: 'Title' },
  ],
} as const;

export const JOURNEY_SCENE = {
  upload: 'Sample passbook.pdf',
  invite: 'anita@example.com',
  note: 'Illustrative preview',
} as const;

/* PRODUCT_FRAME (the "Land portfolio · sample" card) was removed on
 * 27/09/2026 by explicit request — a deliberate exception to the freeze,
 * recorded in design.md § Copy freeze. Do not restore it incidentally. */

export const STORY = {
  eyebrow: 'The context',
  h2: 'Why one property has many records',
  intro:
    'Across India, revenue records, survey maps and registered documents serve different purposes. For a family in Andhra Pradesh or Telangana, an older deed, a current entry and a sketch may need to be read together, especially after a sale or inheritance.',
  sources: [
    { label: 'India: DILRMP', href: 'https://dolr.gov.in/en/programmes-schemes/dilrmp-2/' },
    { label: 'Andhra Pradesh: MeeBhoomi', href: 'https://meebhoomi.ap.gov.in/' },
    { label: 'Telangana: Bhu Bharati', href: 'https://bhubharati.telangana.gov.in/' },
  ],
  entries: [
    {
      t: 'Revenue',
      b: 'In Andhra Pradesh, 1-B and Adangal entries can be viewed through official land-record services. Telangana maintains its own record-of-rights and passbook services.',
    },
    {
      t: 'Survey',
      b: 'Field measurement books and cadastral maps describe land spatially. They answer a different question from the name or transaction on a document.',
    },
    {
      t: 'Registration',
      b: 'A registered deed belongs to the transaction trail. It is worth reading alongside current revenue and survey information, not as a substitute for either.',
    },
    {
      t: 'The family gap',
      b: 'Copies end up in folders, phones and different hands. Our family faced that work in Katragunta village, Prakasam district. Missing copies make it harder to know what to check with the official source.',
    },
    {
      t: 'Where Pattadar fits',
      b: 'Pattadar helps organise and share the copies a family has. It does not issue official records, verify title, settle boundaries or change an entry in a government register.',
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
    title: 'Properties in one view',
    body: 'See the properties you have added, their recorded details and the documents attached to each one. Open a property to review what you have saved.',
    wide: true,
  },
  {
    icon: 'documentScanner',
    title: 'Optional document reading',
    body: 'Choose AI reading for a passbook or deed when available. It suggests fields from the image; check names, survey numbers and extents against the paper before saving.',
  },
  {
    icon: 'folder',
    title: 'Documents beside the property',
    body: 'Upload a document, give it a type and link it to the relevant property. View your saved copy alongside the details you entered.',
  },
  {
    icon: 'diversity',
    title: 'Family access by invitation',
    body: 'Add family members and send an invitation link. You can see when an invitation is accepted and choose which records to share.',
    wide: true,
  },
  {
    icon: 'healthSafety',
    title: 'An inactivity safeguard',
    body: 'After six months without activity, Pattadar can email eligible family members who have verified their address and agreed to receive the notice.',
  },
  {
    icon: 'travelExplore',
    title: 'Location and boundary notes',
    body: 'Pin a property on a map and draw a boundary for your own reference. A drawn outline is not an official survey or proof of extent.',
  },
  {
    icon: 'calculate',
    title: 'Useful property tools',
    body: 'Estimate stamp duty, look up an SRO and convert common land units. Confirm current rates and record details with the relevant office before a transaction.',
  },
  {
    icon: 'factCheck',
    title: 'Export when you need a copy',
    body: 'Download available records as PDF, Excel or CSV, and review account activity. Your own copies remain separate from official government entries.',
  },
];

export const AI = {
  eyebrow: 'Pattadar AI',
  h2: 'An assistant for your records',
  lead: 'Ask about information you have saved in Pattadar. The assistant can help locate a property or document; check important details against the original record.',
  points: [
    [
      'Answers from your records',
      'It uses information in your saved properties and documents to answer questions about what is on file.',
    ],
    [
      'Find the right place',
      'Ask it to find a record and it can point you to the relevant page or saved document.',
    ],
    [
      'Plain language',
      'It explains what it found in everyday words and keeps the source record in view.',
    ],
  ] as [string, string][],
  convoOverline: 'Assistant · sample conversation',
  convo: [
    { role: 'user', text: 'Which of my properties has no deed attached?' },
    {
      role: 'assistant',
      text: 'I cannot find a deed copy in Pattadar for Survey 87/1B (Krishna) or Survey 456/3 (Kurnool). A deed may exist outside your saved files. Shall I open one?',
    },
    { role: 'user', text: 'Open the Krishna property.' },
    {
      role: 'assistant',
      text: 'Opening Survey 87/1B. You can attach a copy of the deed in Documents.',
    },
  ] as { role: 'user' | 'assistant'; text: string }[],
  openedRecord: {
    title: 'Survey 87/1B',
    detail: 'Property · Documents',
    state: 'Sample record opened',
  },
};

export const HOW = {
  eyebrow: 'Three simple steps',
  h2: 'How Pattadar works',
  steps: [
    {
      n: '1',
      title: 'Add a property',
      body: 'Enter the property details you know and attach a passbook or deed. If you choose AI reading, check its suggested details before saving.',
    },
    {
      n: '2',
      title: 'Invite family members',
      body: 'Send an invitation link to someone you trust. You can track whether they accepted and decide which records they may access.',
    },
    {
      n: '3',
      title: 'Keep your copies together',
      body: 'Return to the property to find its documents, location notes and family information. Update your copy when an official record changes.',
    },
  ],
};

export const PILLARS = {
  eyebrow: 'Know the papers',
  h2: 'What to keep with a property',
  intro:
    'Different documents answer different questions about a property. Keep your copies together so you can compare them when needed.',
  items: [
    {
      icon: 'article',
      title: '1B & Adangal',
      body: 'Revenue entries can show the recorded holder, use and extent. Compare the latest copy with the underlying deed and other official records.',
    },
    {
      icon: 'straighten',
      title: 'Survey number & boundaries',
      body: 'The survey number helps identify a parcel in government records. A map pin or hand-drawn outline is only a reference until surveyed.',
    },
    {
      icon: 'historyEdu',
      title: 'Register of Survey Records',
      body: 'An older survey record can help trace how a parcel was described. Keep a legible copy with its date and source.',
    },
    {
      icon: 'squareFoot',
      title: 'Field Measurement Book',
      body: 'An FMB sketch records survey measurements. Keep it with the parcel so its lines can be compared with the latest official survey.',
    },
    {
      icon: 'map',
      title: 'Village & registration maps',
      body: 'Maps provide location context; registration records show where a deed was recorded. Both help when checking a property’s paperwork.',
    },
    {
      icon: 'gavel',
      title: 'Legal rights',
      body: 'Orders, notices and other legal papers may affect a property. Keep copies with the record and ask a qualified professional when rights are unclear.',
    },
  ],
};

export const STAGES = {
  eyebrow: 'Solutions for common revenue issues',
  h2: 'With you at every stage',
  intro:
    'The papers you need change over the course of a transaction. Pattadar helps you keep copies ready for review at each stage.',
  stageLabel: 'Stage',
  items: [
    {
      stage: 'Before buying or selling',
      body: 'Gather the deed, current revenue entries and survey papers. Compare names and extents, and get discrepancies checked before you commit.',
    },
    {
      stage: 'During the transaction',
      body: 'Keep the documents you are using together and share selected copies with the people helping you. The registrar confirms the official requirements.',
    },
    {
      stage: 'After the transaction',
      body: 'Add the registered deed and receipts to your file. Check the official mutation and passbook status separately, then update your saved details.',
    },
  ],
};

export const WALLET = {
  title: 'Pattadar Wallet',
  chip: 'Coming soon',
  body: 'A planned way to keep property payments and their receipts beside the relevant property. Payments are not available in Pattadar yet.',
};

/** User-authorized addition to the otherwise frozen landing copy. */
export const UNIVERSITY = {
  eyebrow: 'Pattadar University',
  h2: 'Training people you can trust with your land',
  intro:
    'Pattadar University helps surveyors, advocates, field teams and other property-service professionals learn the standards behind careful work: owner privacy, evidence handling, field safety and local compliance.',
  points: [
    {
      title: 'Learn for the work',
      body: 'Role-specific courses connect practical field skills with the rules and responsibilities that protect property owners.',
    },
    {
      title: 'Prove what was completed',
      body: 'Eligible learners can receive a signed Pattadar credential with a live status, validity dates and a public verification code.',
    },
    {
      title: 'See who is serving you',
      body: 'When a professional is assigned to a service, the owner can view their current Pattadar training credentials from that request.',
    },
  ],
  cta: 'Explore Pattadar University',
  note: 'Courses, credentials, mentoring and property-sector opportunities.',
  disclaimer:
    'Pattadar University credentials confirm Pattadar training. They do not replace a government licence or professional registration.',
};

export const ROADMAP = {
  eyebrow: 'Beyond record-keeping',
  h2: "Services we're building next",
  chip: 'On the roadmap',
  items: [
    {
      title: 'AI Watch Dog',
      body: 'Exploring alerts for changes in records where reliable source data is available. This would not replace checking official records.',
    },
    {
      title: 'On-demand property visits',
      body: 'A planned way to request a site visit or document errand and receive evidence of the work completed.',
    },
  ],
};

/** Founder-requested addition, 03/10/2026 (design.md § Copy freeze). Every
 * offering is future work: nothing in the network is onboarded yet, so the
 * copy never claims a listing or a professional exists. The two former
 * ROADMAP items (legal professionals, document writers) live here now, with
 * their wording unchanged. Guarded by scripts/network-interest-tests.ts. */
export const NETWORK = {
  eyebrow: 'Pattadar Network',
  h2: 'A network around your land',
  intro:
    'We are planning a marketplace and a network of property professionals built around the records you keep in Pattadar. None of it is open yet.',
  chip: 'Coming soon',
  note: 'No listings or professionals are on Pattadar today. A listing or directory entry will never replace checking a licence, registration or official record.',
  items: [
    { icon: 'sell', title: 'Sell a property', body: 'A planned way to list a property from your Pattadar record, publishing only the details you choose.' },
    { icon: 'buy', title: 'Buy a property', body: 'A planned way to find properties listed by their owners in Andhra Pradesh and Telangana.' },
    { icon: 'rent', title: 'Rent or lease', body: 'A planned way to offer or find land and property for rent or lease.' },
    { icon: 'gavel', title: 'Lawyers and advocates', body: 'A planned way to find a legal professional and share the documents relevant to your question.' },
    { icon: 'straighten', title: 'Licensed surveyors', body: 'A planned way to find a licensed surveyor for measurement and boundary work.' },
    { icon: 'historyEdu', title: 'Document writers', body: 'A planned directory of document writers for families preparing a transaction.' },
    { icon: 'developer', title: 'Land developers', body: 'A planned way to reach land and landscape developers for your plot.' },
    { icon: 'more', title: 'Valuers, builders and more', body: 'More property services will follow as the network grows.' },
  ],
};

/** The register-interest form inside #network (NetworkInterestForm.tsx).
 * `consent` is DRAFT wording (decision D4) and needs Reddy's approval before
 * production. It must equal services/api/src/network.py CONSENT_TEXT byte for
 * byte: changing it means bumping `consentVersion`, CONSENT_VERSION and
 * CONSENT_TEXT_SHA256 together (scripts/network-interest-tests.ts). */
export const NETWORK_INTEREST = {
  h3: 'Register your interest',
  lead: 'Tell us what you are looking for or what you offer, and we will contact you when the network opens. Give a mobile number, an email, or both.',
  interestLabel: 'I am interested in',
  interestPlaceholder: 'Choose one',
  groups: [
    {
      label: 'I want to…',
      options: [
        { value: 'sell', label: 'Sell a property' },
        { value: 'buy', label: 'Buy a property' },
        { value: 'rent', label: 'Rent a property out, or rent one' },
        { value: 'lease', label: 'Lease land or property' },
      ],
    },
    {
      label: 'I am a…',
      options: [
        { value: 'lawyer', label: 'Lawyer or advocate' },
        { value: 'surveyor', label: 'Licensed surveyor' },
        { value: 'document_writer', label: 'Document writer' },
        { value: 'developer', label: 'Land developer' },
        { value: 'valuer', label: 'Valuer' },
        { value: 'other_professional', label: 'Other property professional' },
      ],
    },
  ],
  nameLabel: 'Your name',
  phoneLabel: 'Mobile number',
  phonePlaceholder: '98480 12345',
  phoneHelp: 'Indian mobile number',
  emailLabel: 'Email',
  districtLabel: 'District (optional)',
  mandalLabel: 'Mandal (optional)',
  noteLabel: 'Anything we should know (optional)',
  consent: 'I agree that Pattadar may contact me by phone or email about Pattadar Network. I can withdraw at any time. See the privacy notice.',
  consentLinkText: 'privacy notice',
  consentVersion: '2026-10-03',
  submit: 'Register interest',
  sending: 'Sending…',
  honeypotLabel: 'Website',
  errors: {
    interest: 'Choose what you are interested in.',
    name: 'Enter your name.',
    phone: 'Enter a 10-digit Indian mobile number.',
    email: 'Enter a valid email address.',
    contact: 'Give a mobile number or an email.',
    district: 'Keep the district to 60 characters.',
    mandal: 'Keep the mandal to 60 characters.',
    note: 'Keep the note to 500 characters.',
    idNumber: "Please don't enter Aadhaar or other ID numbers here.",
    consent: 'Tick the box to agree before you register.',
    consentVersion: 'This page is out of date. Reload it and try again.',
  },
  received: 'Thanks. We will contact you when Pattadar Network opens near you.',
  rateLimited: 'Too many requests right now. Please try again later.',
  failed: "We couldn't save that. Please try again.",
};

export const FAQ = {
  eyebrow: 'Common questions',
  h2: 'Asked by families like yours',
  items: [
    [
      'Is my Aadhaar number safe here?',
      'Pattadar shows saved Aadhaar numbers masked and protects the stored number with encryption. Do not share a card image unless it is needed for the task. Pattadar does not perform Aadhaar authentication.',
    ],
    [
      'Who can see my land records?',
      'Your account controls access to your saved records. You can invite family members or share selected documents with a recipient; review access before sending a link.',
    ],
    [
      'Is Pattadar a government website?',
      'No. Pattadar is a private service for organising your copies. Government offices remain the source of official records and ownership changes.',
    ],
    [
      'What if the AI reads my deed wrongly?',
      'Treat AI reading as a draft. Compare each suggested name, number and extent with the document before saving; you can correct mistakes.',
    ],
    [
      'What does it cost?',
      'The current pilot is free for invited families. Pricing is a preview; paid checkout is not available yet.',
    ],
  ] as [string, string][],
};

export const FINAL_CTA = {
  // Rendered as one heading: prefix + em phrase — concatenation is the
  // original frozen string "Your family's land deserves this care".
  h2Prefix: "Your family's land ",
  h2Em: 'deserves this care',
  body: 'Add one property and attach the papers you already have. Build the file at your own pace.',
  cta: 'Create an account',
};

export const FOOTER = {
  copyrightTail: ' Pattadar · Katragunta, Prakasam, Andhra Pradesh · San Francisco, California',
  university: 'Pattadar University',
  privacy: 'Privacy',
  terms: 'Terms',
  grievance: 'Grievance: grievance@pattadar.com',
  grievanceHref: 'mailto:grievance@pattadar.com',
};
