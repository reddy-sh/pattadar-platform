export type OfficialReferenceKind = 'law' | 'portal' | 'manual' | 'service' | 'programme';

export interface OfficialReference {
  id: string;
  title: string;
  authority: string;
  url: string;
  kind: OfficialReferenceKind;
  description: string;
  reviewedOn: string;
}

const reviewedOn = '2026-09-20';

export const officialReferences: OfficialReference[] = [
  {
    id: 'ap-land-records-service',
    title: 'MeeBhoomi land-record services',
    authority: 'Revenue Department, Government of Andhra Pradesh',
    url: 'https://tirupati.ap.gov.in/service/land-records/',
    kind: 'service',
    description: 'Official district guidance describing MeeBhoomi, land ownership details, electronic passbooks, khata information, and land-record access.',
    reviewedOn,
  },
  {
    id: 'ap-meebhoomi',
    title: 'MeeBhoomi',
    authority: 'Revenue Department, Government of Andhra Pradesh',
    url: 'https://meebhoomi.ap.gov.in/',
    kind: 'portal',
    description: 'Official Andhra Pradesh portal for available land-record information and electronic passbook services.',
    reviewedOn,
  },
  {
    id: 'ap-ror-act',
    title: 'Andhra Pradesh Rights in Land and Pattadar Pass Books Act, 1971',
    authority: 'India Code, Government of India',
    url: 'https://www.indiacode.nic.in/bitstream/123456789/19253/1/ror_act_5.12.2022_.pdf',
    kind: 'law',
    description: 'Official text governing preparation, maintenance, amendment, inspection, and copies of the Record of Rights.',
    reviewedOn,
  },
  {
    id: 'ap-gsws-services',
    title: 'GSWS revenue-service catalogue',
    authority: 'Anakapalli District, Government of Andhra Pradesh',
    url: 'https://anakapalli.ap.gov.in/gsws/',
    kind: 'service',
    description: 'Official catalogue listing ROR-1B, Adangal, mutation, passbook, subdivision, correction, conversion, and survey services.',
    reviewedOn,
  },
  {
    id: 'ap-gsws-manual',
    title: 'GSWS Citizen Service Provider manual',
    authority: 'GSWS, Government of Andhra Pradesh',
    url: 'https://vswsonline.ap.gov.in/assets/User-Manuals/CSP-User-Manual.pdf',
    kind: 'manual',
    description: 'Official service manual naming approval authorities and workflows for ROR-1B, Adangal, mutation, passbooks, 22-A changes, and dotted-land claims.',
    reviewedOn,
  },
  {
    id: 'ap-bhunaksha',
    title: 'BhuNaksha Andhra Pradesh',
    authority: 'Survey, Settlements and Land Records, Government of Andhra Pradesh',
    url: 'https://bhunaksha.ap.gov.in/',
    kind: 'portal',
    description: 'Official cadastral-mapping portal integrated with Andhra Pradesh land-record systems.',
    reviewedOn,
  },
  {
    id: 'ap-survey-records',
    title: 'Settlement, survey, and land records',
    authority: 'Krishna District, Government of Andhra Pradesh',
    url: 'https://krishna.ap.gov.in/settlements-survey-land-records/',
    kind: 'service',
    description: 'Official explanation of FMBs, RSRs, village maps, subdivision, demarcation, maintenance surveys, and certified-copy services.',
    reviewedOn,
  },
  {
    id: 'ap-fmb-manual',
    title: 'Issue of Field Measurement Book copy',
    authority: 'GSWS / MeeSeva, Government of Andhra Pradesh',
    url: 'https://gramawardsachivalayam.ap.gov.in/GSWS/downloads/MeeSevakiosk2/Revenue/MEESEVA%20User%20Manual%20for%20KIOSKS%20-Issue%20of%20FMB%20Ver%201.1.pdf',
    kind: 'manual',
    description: 'Official service workflow for requesting an FMB copy.',
    reviewedOn,
  },
  {
    id: 'ap-registration',
    title: 'Andhra Pradesh Registration and Stamps IGRS',
    authority: 'Registration and Stamps Department, Government of Andhra Pradesh',
    url: 'https://registration.ap.gov.in/igrs',
    kind: 'portal',
    description: 'Official state portal for registration services, EC search, certified copies, market-value assistance, fee tools, and slot-based registration workflows.',
    reviewedOn,
  },
  {
    id: 'ngdrs-state-links',
    title: 'NGDRS state and union-territory portal directory',
    authority: 'Department of Land Resources, Government of India',
    url: 'https://ngdrs.gov.in/NGDRS_Website/state_ut_links.php',
    kind: 'portal',
    description: 'Official national directory identifying the Andhra Pradesh Registration and Stamps portal.',
    reviewedOn,
  },
  {
    id: 'ap-registration-manual',
    title: 'Pre-registration and document-creation manual',
    authority: 'Registration and Stamps Department, Government of Andhra Pradesh',
    url: 'https://vswsonline.ap.gov.in/assets/User-Manuals/Property-Registration.pdf',
    kind: 'manual',
    description: 'Official citizen workflow for document type, SRO, parties, property schedule, enclosures, market value, payment, review, and slot selection.',
    reviewedOn,
  },
  {
    id: 'india-services-ec',
    title: 'e-Encumbrance service for Andhra Pradesh',
    authority: 'National Government Services Portal, Government of India',
    url: 'https://services.india.gov.in/service/detail/apply-for-e-encumbrance-service-on-any-property-registered-andhra-pradesh-1',
    kind: 'service',
    description: 'Official service listing for citizen searches of registered-property encumbrances.',
    reviewedOn,
  },
  {
    id: 'ap-assigned-lands-act',
    title: 'Andhra Pradesh Assigned Lands (Prohibition of Transfers) Act, 1977',
    authority: 'India Code, Government of India',
    url: 'https://www.indiacode.nic.in/bitstream/123456789/8711/1/act_9_of_1977.pdf',
    kind: 'law',
    description: 'Official Act governing transfer restrictions and registration treatment for listed assigned lands.',
    reviewedOn,
  },
  {
    id: 'ap-prohibited-properties',
    title: 'Prohibited lands under Section 22-A(1)(e)',
    authority: 'YSR Kadapa District, Government of Andhra Pradesh',
    url: 'https://kadapa.ap.gov.in/notice_category/prohibited-lands-u-s-22-a1-e-of-registration-act-1908/',
    kind: 'service',
    description: 'Official district publication page for Section 22-A(1)(e) notifications and changes to prohibited-property lists.',
    reviewedOn,
  },
  {
    id: 'ap-dotted-lands-act',
    title: 'Andhra Pradesh Dotted Lands (Updation in Re-settlement Register) Act, 2017',
    authority: 'India Code, Government of India',
    url: 'https://www.indiacode.nic.in/indiacode/handle/123456789/9285?view_type=browse',
    kind: 'law',
    description: 'Official Act concerning updates to the Re-settlement Register for survey numbers marked as dotted lands.',
    reviewedOn,
  },
  {
    id: 'ap-government-property-act',
    title: 'Andhra Pradesh Government Property (Preservation, Protection and Resumption) Act, 2007',
    authority: 'India Code, Government of India',
    url: 'https://www.indiacode.nic.in/handle/123456789/15898?locale=en',
    kind: 'law',
    description: 'Official Act protecting state property and addressing transactions adverse to government title or interest.',
    reviewedOn,
  },
  {
    id: 'ap-crop-cultivator-act',
    title: 'Andhra Pradesh Crop Cultivator Rights Act, 2019',
    authority: 'India Code, Government of India',
    url: 'https://www.indiacode.nic.in/bitstream/123456789/19897/2/the_andhra_pradesh_crop_cultivator_rights_act%2C_2019.pdf',
    kind: 'law',
    description: 'Official Act distinguishing a crop-cultivation arrangement and card from ownership rights in the land.',
    reviewedOn,
  },
  {
    id: 'ap-bhudhaar',
    title: 'BhuSeva / Bhudhaar',
    authority: 'Office of the Chief Commissioner of Land Administration, Andhra Pradesh',
    url: 'https://bhudhaar.ap.gov.in/',
    kind: 'portal',
    description: 'Official portal presenting land information, property history, approved-layout information, mutation, conversion, subdivision, and grievance services.',
    reviewedOn,
  },
  {
    id: 'ap-rera',
    title: 'Andhra Pradesh Real Estate Regulatory Authority',
    authority: 'Andhra Pradesh Real Estate Regulatory Authority',
    url: 'https://rera.ap.gov.in/RERA/Views/index.html',
    kind: 'portal',
    description: 'Official project and promoter disclosure portal for RERA-regulated developments.',
    reviewedOn,
  },
  {
    id: 'ap-rera-rules',
    title: 'Andhra Pradesh Real Estate Rules, 2017',
    authority: 'Government of Andhra Pradesh',
    url: 'https://rera.ap.gov.in/RERA/DOCUMENTS/gos/1.MS115%20_27032017_AP%20Rules%202017.PDF',
    kind: 'law',
    description: 'Official state rules supporting project disclosures, approvals, completion, and other RERA-regulated project requirements.',
    reviewedOn,
  },
  {
    id: 'ap-cdma-charter',
    title: 'Citizen charter for municipal services',
    authority: 'Commissioner and Director of Municipal Administration, Government of Andhra Pradesh',
    url: 'https://cdma.ap.gov.in/resources/citizen-charter/',
    kind: 'service',
    description: 'Official municipal service guidance for building, occupancy, property-tax, trade, and related local-body services.',
    reviewedOn,
  },
  {
    id: 'ap-dpms',
    title: 'Andhra Pradesh Development Permission Management System',
    authority: 'Directorate of Town and Country Planning, Government of Andhra Pradesh',
    url: 'https://portal.apdpms.ap.gov.in/portal',
    kind: 'portal',
    description: 'Official portal for applicable building and layout permission workflows.',
    reviewedOn,
  },
  {
    id: 'dolr-registration-faq',
    title: 'Registration Act FAQ: buyer and seller duties',
    authority: 'Department of Land Resources, Government of India',
    url: 'https://cdnbbsr.s3waas.gov.in/s3d79c6256b9bdac53a55801a066b70da3/uploads/2020/10/2020101147.pdf',
    kind: 'manual',
    description: 'Official registration guidance covering registered instruments and buyer/seller checks.',
    reviewedOn,
  },
  {
    id: 'dolr-dilrmp',
    title: 'Digital India Land Records Modernization Programme',
    authority: 'Department of Land Resources, Government of India',
    url: 'https://dolr.gov.in/en/programmes-schemes/dilrmp-2/',
    kind: 'programme',
    description: 'Official national programme context for computerised records, registration integration, cadastral maps, and modern record rooms.',
    reviewedOn,
  },
  {
    id: 'dpdp-act',
    title: 'Digital Personal Data Protection Act, 2023',
    authority: 'India Code, Government of India',
    url: 'https://www.indiacode.nic.in/indiacode/handle/123456789/22037?view_type=browse',
    kind: 'law',
    description: 'Official law used for purpose limitation and personal-data handling in learning and service workflows.',
    reviewedOn,
  },
  {
    id: 'dpdp-rules',
    title: 'Digital Personal Data Protection Rules, 2025',
    authority: 'Ministry of Electronics and Information Technology, Government of India',
    url: 'https://www.meity.gov.in/documents/act-and-policies/digital-personal-dataprotection-rules-2025gDOxUjMtQWa?pageTitle=Digital-Personal-Data-ProtectionRules-2025',
    kind: 'law',
    description: 'Official rules used for personal-data notices, safeguards, and governed processing workflows.',
    reviewedOn,
  },
];

const referenceById = new Map(officialReferences.map((reference) => [reference.id, reference]));

export function officialReferenceById(id: string): OfficialReference | undefined {
  return referenceById.get(id);
}

export function officialReferencesById(ids: string[] | undefined): OfficialReference[] {
  return (ids ?? []).flatMap((id) => {
    const reference = officialReferenceById(id);
    return reference ? [reference] : [];
  });
}

export function isGovernmentReferenceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLocaleLowerCase();
    return host === 'gov.in'
      || host.endsWith('.gov.in')
      || host === 'nic.in'
      || host.endsWith('.nic.in');
  } catch {
    return false;
  }
}
