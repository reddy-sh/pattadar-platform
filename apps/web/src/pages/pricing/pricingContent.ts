export const PRICING_NAV_LABEL = 'Pricing';

export const PRICING = {
  eyebrow: 'Plans and capacity',
  title: 'Start free. Pay for a larger family record when you need it.',
  lead:
    'Every plan keeps the same encryption, malware checks, backups and account controls. Paid plans add space and capacity — never weaker or stronger basic security.',
  availability:
    'This page is a pricing preview. The current pilot remains free for invited families. Plan limits, paid subscriptions and add-on checkout will begin only after Pattadar implements them and confirms the final terms.',
  annualNote: 'Proposed annual prices cover 12 months for the price of 10.',
  startFree: 'Create an account',
  signIn: 'Sign in',
  plansHeading: 'Choose the capacity that fits your records',
  planStatusFree: 'Planned free allowance',
  planStatusPlanned: 'Paid checkout coming later',
  holdingsNote:
    'A holding is one land parcel or one built property. A passbook is a container and does not use a holding slot.',
  securityHeading: 'Included for every family',
  securityBody:
    'Encryption, malware scanning, backups, existing-record access, account export and erasure, share revocation and the email inactivity safeguard are included on Free and paid plans.',
  aiHeading: 'AI stays optional and prepaid',
  aiBody:
    'No plan reads documents with AI automatically. You see the estimated credits before a reading and choose whether to continue.',
  storageHeading: 'Add storage without changing plans',
  footerPrivacy: 'Privacy',
  footerTerms: 'Terms',
  footerGrievance: 'Grievance: grievance@pattadar.com',
} as const;

export interface PublicPlan {
  code: string;
  name: string;
  monthly: string;
  annual: string;
  groups: string;
  holdings: string;
  storage: string;
  versions: string;
  status: string;
  free?: boolean;
}

export const PUBLIC_PLANS: PublicPlan[] = [
  {
    code: 'free',
    name: 'Free',
    monthly: '₹0',
    annual: 'Always free without AI',
    groups: '1 Family',
    holdings: '2 holdings',
    storage: '1 GB storage',
    versions: '100 stored file versions',
    status: PRICING.planStatusFree,
    free: true,
  },
  {
    code: 'family',
    name: 'Family',
    monthly: '₹249 / month',
    annual: '₹2,490 / year',
    groups: '3 groups',
    holdings: '25 holdings',
    storage: '10 GB storage',
    versions: '1,000 stored file versions',
    status: PRICING.planStatusPlanned,
  },
  {
    code: 'family-plus',
    name: 'Family Plus',
    monthly: '₹599 / month',
    annual: '₹5,990 / year',
    groups: '10 groups',
    holdings: '100 holdings',
    storage: '40 GB storage',
    versions: '5,000 stored file versions',
    status: PRICING.planStatusPlanned,
  },
  {
    code: 'estate',
    name: 'Estate',
    monthly: '₹1,499 / month',
    annual: '₹14,990 / year',
    groups: '25 groups',
    holdings: '500 holdings',
    storage: '100 GB storage',
    versions: '20,000 stored file versions',
    status: PRICING.planStatusPlanned,
  },
];

export const STORAGE_ADDONS = [
  ['10 GB additional storage · 1,000 file versions', '₹149 / month'],
  ['100 GB additional storage · 10,000 file versions', '₹1,399 / month'],
] as const;

export const AI_PACKS = [
  ['25 credits', '₹249'],
  ['100 credits', '₹799'],
  ['500 credits', '₹2,999'],
] as const;
