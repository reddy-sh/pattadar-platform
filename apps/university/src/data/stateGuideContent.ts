import type {
  StateGuideSourceKind,
  StateLearningGuide,
  StateRecordExplainer,
  UniversityStateCode,
} from '../domain/types';
import { stateLandRecordProfiles } from './stateLandRecords';

type RecordSeed = readonly [name: string, purpose: string, verify: string];

interface StateGuideSeed {
  records: readonly RecordSeed[];
  mutation: string;
  survey: string;
  specialQuestion: string;
  specialAnswer: string;
  portalNote?: string;
}

const seeds: Record<UniversityStateCode, StateGuideSeed> = {
  AP: {
    records: [
      ['ROR-1B', 'Revenue Record of Rights used to read the recorded pattadar, account, survey, extent, and related entries.', 'Match the village, survey and subdivision, extent, names, and mutation history to the current certified record.'],
      ['Adangal / Pahani', 'Village account commonly used for land classification, possession or cultivation, crop, and season-related entries.', 'Check the fasli or record period and do not substitute a cultivation entry for a title review.'],
      ['FMB and RSR', 'Survey measurement and settlement references used to understand parcel geometry, numbering, and older survey context.', 'Reconcile survey and subdivision numbers, scale, dimensions, and any resurvey conversion with the ground parcel.'],
      ['Section 22-A prohibited-property status', 'Registration restriction information used to identify properties listed as prohibited from registration.', 'Search the current official list and escalate any match, omission, or classification dispute to the competent authority.'],
    ],
    mutation: 'Mutation updates the revenue record after a qualifying transfer, succession, partition, or order. Track the application and verify the final ROR-1B and passbook entry; a registered deed and a completed mutation are separate evidence.',
    survey: 'Use FMB, RSR, village-map, subdivision, and field evidence together. A portal sketch is not a boundary demarcation, and a mismatch in extent or numbering should go to the survey authority.',
    specialQuestion: 'What requires extra care in Andhra Pradesh?',
    specialAnswer: 'Prohibited, assigned, government, endowment, wakf, dotted, ceiling, and other restricted-land questions require the current competent-authority record. Never infer clearance from a missing portal result alone.',
  },
  AR: {
    records: [
      ['Land Holding Certificate', 'A certificate service used to evidence a recorded holding in areas covered by the state land-management system.', 'Verify the certificate number, issue date, issuing office, land description, and online verification result.'],
      ['Land allotment order', 'The administrative basis and conditions under which land may have been allotted.', 'Read the allotment purpose, area, tenure, conditions, transfer limits, and later orders rather than relying on a summary.'],
      ['Survey number and site plan', 'Identifiers and spatial material used where survey coverage exists.', 'Confirm the surveyed locality, parcel reference, dimensions, adjoining land, and whether the plan is certified.'],
    ],
    mutation: 'Use LISA or the competent land-management office for the notified transfer or record-update service. Confirm that any approval, mutation, or certificate is final and applies to the same allotment and surveyed parcel.',
    survey: 'Digital and cadastral coverage depends on the area. If a parcel is not available online, identify the District Land Revenue and Settlement Office or other competent office instead of assuming no record exists.',
    specialQuestion: 'Does one Arunachal Pradesh workflow apply everywhere?',
    specialAnswer: 'No. Allotment, surveyed holdings, customary interests, forest context, and local administrative coverage can differ. Establish the tenure and competent authority before selecting documents or a transfer route.',
  },
  AS: {
    records: [
      ['Jamabandi / Record of Rights', 'The revenue record used to view recorded pattadars, land particulars, and rights for a revenue location.', 'Match district, circle, village, patta, dag, names, area, and the current record status.'],
      ['Chitha', 'A field or plot-level revenue record maintained in the land-record system.', 'Compare the dag and land particulars with the Jamabandi, map, and the transaction being reviewed.'],
      ['Patta, Dag, and Khatian', 'Linked account and parcel identifiers used to locate the correct holding and plot.', 'Preserve every identifier exactly; similar owner names are not enough to establish a parcel match.'],
      ['Mutation order', 'The decision that supports an update after transfer, succession, partition, or another recognised event.', 'Verify the case number, order, affected dag and patta, parties, and that the Jamabandi was actually updated.'],
    ],
    mutation: 'Mission Basundhara provides notified mutation, correction, and related services. Track the case through completion and compare the resulting Jamabandi with the order and registered instrument.',
    survey: 'Use Dharitree textual records with the official Bhunaksha or survey route where available. A cadastral display helps identify a parcel but is not a substitute for official demarcation.',
    specialQuestion: 'How do I obtain a certified Jamabandi in Assam?',
    specialAnswer: 'Dharitree states that its online information is current and directs citizens to the Assam RTPS service for a certified Jamabandi or Record of Rights. If a record is missing online, contact the circle office.',
    portalNote: 'For a certified Jamabandi, follow Dharitree\'s current link to the Assam RTPS service rather than printing the view page.',
  },
  BR: {
    records: [
      ['Jamabandi / Register-II', 'The current revenue register for a raiyat, including land particulars such as khata, khesra, area, boundary, and rent entries.', 'Check the Jamabandi number, current volume and page, raiyat, khata, khesra, area, and post-mutation entries.'],
      ['CS or RS Khatian', 'A survey Record of Rights that may provide the base or revisional record for a parcel.', 'Identify the survey edition and village coverage; a historic Khatian and current Jamabandi answer different questions.'],
      ['Khata and Khesra', 'Account and plot identifiers used to find the relevant holding and parcel.', 'Reconcile both identifiers across the Khatian, Jamabandi, map, deed, and mutation case.'],
      ['Dakhil-Kharij', 'The mutation process used to seek an update to revenue records after an eligible change.', 'Verify the application, order, affected plots, and the final Register-II update rather than stopping at application status.'],
    ],
    mutation: 'Use BiharBhumi for the notified online Dakhil-Kharij route and case status. Mutation changes the revenue entry; retain the underlying deed, succession paper, court order, or other basis separately.',
    survey: 'Compare the applicable CS or RS Khatian and map with the live Jamabandi. Where survey editions or plot numbers differ, preserve the correlation instead of silently treating them as identical.',
    specialQuestion: 'Why can two Bihar land records look different?',
    specialAnswer: 'A cadastral or revisional Khatian records a survey settlement, while Register-II is updated through later revenue events. Differences in names, plots, area, or classification need a documented correlation and competent review.',
  },
  CG: {
    records: [
      ['P-II Khasra', 'The parcel-level revenue record used for Khasra, land, and cultivation-related particulars.', 'Verify the Khasra number, area, land class, holder or possessor entries, crop period, and remarks.'],
      ['B-I Khatauni', 'The account-level revenue extract used to group recorded holdings and holders.', 'Match the account, holder names, linked Khasras, total area, and current certified version.'],
      ['BhuNaksha', 'The cadastral map layer used to locate a Khasra spatially.', 'Check that map and textual record use the same village and Khasra; use survey demarcation for a live boundary question.'],
      ['Naamantaran / mutation', 'The record-update proceeding following an eligible transfer or other change.', 'Read the order and verify that both P-II and B-I were updated for the correct parcel and parties.'],
    ],
    mutation: 'Bhuiyan supports mutation information and digitally signed record outputs. Keep the mutation order, registered document, and updated P-II and B-I together as separate parts of the trail.',
    survey: 'Use the BhuNaksha view to cross-reference the Khasra, not to replace measurements or demarcation. Escalate area, overlap, or on-ground marker conflicts to the survey or revenue authority.',
    specialQuestion: 'Which Chhattisgarh copy should be used officially?',
    specialAnswer: 'Bhuiyan provides a route for digitally signed P-II Khasra and B-I Khatauni copies. Confirm the signature or verification details and the receiving authority\'s current copy requirement.',
  },
  GA: {
    records: [
      ['Form I and XIV', 'The rural Record of Rights and cultivator record used for surveyed village properties.', 'Match taluka, village, survey, subdivision, names, area, tenure or cultivation entries, and current mutation status.'],
      ['Form D', 'The property-register form used in city-survey contexts.', 'Use it only for the applicable city-survey property and verify the property identifier, holder, area, and current certified copy.'],
      ['Survey plan', 'The cadastral plan for a survey number or subdivision.', 'Compare survey and subdivision, dimensions, adjoining parcels, and the certified plan with physical occupation.'],
      ['Mutation notice and status', 'Public notice and case information for proposed changes to the record.', 'Check objections, final disposal, affected survey details, and the resulting updated Form I and XIV or Form D.'],
    ],
    mutation: 'The Directorate publishes mutation notices and status. A pending notice is not a completed update; obtain the final order and confirm that the applicable rural or city-survey record changed.',
    survey: 'Choose the rural cadastral or city-survey plan that matches the property. A plan copy identifies recorded geometry, while disputed boundaries require the notified survey procedure.',
    specialQuestion: 'Is the Goa portal view an official certified copy?',
    specialAnswer: 'The Directorate states that online Form I and XIV and Form D views are for information. It directs users to Goa Online for an official copy after payment.',
    portalNote: 'Treat the free portal display as informational and use the linked official-copy service when certification is required.',
  },
  GJ: {
    records: [
      ['Village Form 7/12', 'The village land record commonly used for parcel, occupant, cultivation, and related revenue details.', 'Verify village, survey or block number, area, tenure, holder, crop or land-use entries, and remarks.'],
      ['Village Form 8A', 'The account-level record used to review a khatedar and linked holdings.', 'Match the khata, holder, linked survey numbers, area totals, and current issue date.'],
      ['Village Form 6', 'The mutation register in which proposed and certified changes are recorded.', 'Read the entry number, event, notice and certification status, then confirm its effect in 7/12 and 8A.'],
      ['e-Dhara RoR copy', 'The electronic Record of Rights service delivered through e-Dhara and notified access points.', 'Check the form number, village, parcel identifiers, certification, issue date, and verification details.'],
    ],
    mutation: 'e-Dhara maintains the mutation workflow through Village Form 6. A mutation entry must reach certification and then appear correctly in the updated 7/12 and 8A.',
    survey: 'Match the survey or block number and any subdivision across AnyRoR, the cadastral map, the deed, and field evidence. Use the survey authority for measurements or boundary restoration.',
    specialQuestion: 'How do Gujarat 7/12, 8A, and VF6 fit together?',
    specialAnswer: 'The 7/12 is parcel-focused, 8A is account-focused, and VF6 records mutations. Reviewing all three helps show whether a transaction or order was carried into the live revenue records.',
  },
  HR: {
    records: [
      ['Jamabandi', 'The periodic Record of Rights for an estate, recording rights and parcel-account relationships.', 'Confirm the estate, Jamabandi year, owner, Khewat, Khatoni, Khasra, shares, area, and remarks.'],
      ['Khewat and Khatoni', 'Account groupings used to connect proprietors, cultivators or tenures, and parcels.', 'Trace the correct account relationships and shares instead of relying on a name-only result.'],
      ['Khasra Girdawari', 'The periodic field and cultivation inspection record.', 'Check the crop period, Khasra, cultivation or possession entry, and whether it answers the question being asked.'],
      ['Mutation / Intkal', 'The proceeding that records a qualifying change in the revenue system.', 'Verify the mutation number, type, sanction status, affected shares and Khasras, and later Jamabandi reflection.'],
    ],
    mutation: 'Use the official Jamabandi system to inspect mutation information and the resulting revenue record. Keep the sanctioned Intkal and its legal basis with the updated Jamabandi.',
    survey: 'Use the cadastral map and Khasra identifiers to orient the parcel. Demarcation, partition, and a disputed on-ground boundary require the competent revenue or survey process.',
    specialQuestion: 'Why does the Jamabandi year matter in Haryana?',
    specialAnswer: 'Jamabandi is a periodic record. Later mutations and field entries may post after the selected record year, so review the relevant Jamabandi period together with subsequent Intkal and Girdawari entries.',
  },
  HP: {
    records: [
      ['Jamabandi', 'The periodic Record of Rights used to review recorded holders, shares, land, and revenue particulars.', 'Match district, tehsil, village, year, Khewat, Khatoni, Khasra, shares, area, and remarks.'],
      ['Khewat, Khatoni, and Khasra', 'Linked account, holding, and parcel identifiers used to locate the land and rights.', 'Trace all three identifiers across the record, map, mutation, and deed.'],
      ['Shajra Nasab', 'A genealogical record used in the revenue context to understand lineage relationships.', 'Use it with succession and mutation evidence; a family tree alone does not establish a completed transfer.'],
      ['Musavi / plot map', 'The settlement or cadastral map used to identify Khasra geometry.', 'Confirm the settlement edition, scale, Khasra, and map availability before using it for comparison.'],
    ],
    mutation: 'Review the mutation order and its effect in the current Jamabandi. For inheritance, also reconcile the Shajra Nasab and the succession basis; for a transfer, preserve the registered instrument.',
    survey: 'HimBhoomi provides available map services, but coverage and verification can differ. Use the applicable settlement map and competent demarcation process for boundary conclusions.',
    specialQuestion: 'What else should a Himachal Pradesh buyer verify?',
    specialAnswer: 'Land class, permitted use, access, forest or government context, and purchaser or transfer eligibility may require approvals outside the Jamabandi. Check the current competent authority before committing.',
  },
  JH: {
    records: [
      ['Register-II', 'The live revenue ledger used to review a raiyat and land-account entries.', 'Match district, circle, halka, mouza, register page, raiyat, khata, Khesra, area, and rent details.'],
      ['Khata', 'The holding or account reference that groups recorded parcel interests.', 'Compare the Khata number and holder across Register-II, Khesra details, map, deed, and mutation.'],
      ['Khesra / plot', 'The parcel identifier used for land details and map searches.', 'Check area, land class, boundaries, and whether old and current plot references differ.'],
      ['Bhu-Naksha', 'The cadastral map used to locate the Khesra spatially.', 'Use the same mouza and Khesra as the textual record; seek demarcation for a live boundary issue.'],
    ],
    mutation: 'Jharbhoomi provides mutation status and Register-II access. Verify the final order and updated ledger rather than treating an application receipt as an updated right.',
    survey: 'Reconcile the Khesra and Khata with Bhu-Naksha and field identity. Older survey records or changing plot references may require the circle or survey office to establish correlation.',
    specialQuestion: 'Is Register-II enough for a Jharkhand purchase?',
    specialAnswer: 'No single search should be used alone. Review the registered chain, mutation order, current Register-II, relevant survey record, cadastral map, land class, restrictions, and field identity.',
  },
  KA: {
    records: [
      ['RTC / Pahani', 'The Record of Rights, Tenancy and Crops used for current revenue, holder, tenancy, land, and crop entries.', 'Match district, taluk, hobli, village, survey, hissa, extent, holder, classification, and record year.'],
      ['Mutation Register', 'The register of changes proposed or carried into the RTC after a qualifying event.', 'Verify the mutation reference, event, order, affected survey and hissa, and final RTC update.'],
      ['Tippan / Atlas', 'Survey measurement material used to understand the parcel and subdivision framework.', 'Confirm the correct village, survey, hissa, scale, measurements, and relation to the current sketch.'],
      ['Survey sketch', 'A survey output used for subdivision, measurement, or parcel identification.', 'Check who issued it, the purpose, survey and hissa, date, dimensions, and whether it is final.'],
    ],
    mutation: 'Use the notified Bhoomi or Revenue Department service to review mutation and the resulting RTC. Keep the transaction document or order and the certified mutation record with the updated RTC.',
    survey: 'Survey number and hissa are both material. Compare RTC, mutation, Tippan or Atlas, survey sketch, registration schedule, and field markers before drawing a boundary conclusion.',
    specialQuestion: 'What is the main Karnataka parcel-matching risk?',
    specialAnswer: 'A survey number can contain multiple hissa or subdivision interests. Names or a parent survey number alone are not enough; match the exact hissa, extent, map or sketch, and transaction schedule.',
  },
  KL: {
    records: [
      ['Thandaper', 'The revenue account used to connect a landholder with land and tax records.', 'Verify the Thandaper number, holder, village, old and resurvey references, extent, and current tax context.'],
      ['Basic Tax Register', 'The village land register used for survey, extent, classification, and tax-related particulars.', 'Check whether the record is old-survey, resurvey, or digital BTR and preserve any correlation between identifiers.'],
      ['FMB and block map', 'Survey measurement and block-map records used to understand parcel geometry.', 'Match block, resurvey and subdivision numbers, dimensions, and certified issue details.'],
      ['Pokkuvaravu', 'Transfer of registry or mutation in the revenue records.', 'Confirm the application or order, subdivision where relevant, updated Thandaper and BTR, and the underlying registered instrument.'],
    ],
    mutation: 'Pokkuvaravu updates the revenue and tax record after the notified process. Verify the final change in Thandaper and BTR and preserve the registered document and any pre-mutation sketch.',
    survey: 'Old-survey and resurvey references can differ. Use the official correlation, FMB, block map, BTR, and survey office record rather than guessing that two numbers identify the same parcel.',
    specialQuestion: 'Why is survey correlation important in Kerala?',
    specialAnswer: 'Resurvey created new block, survey, and subdivision references in many areas. A transaction file should preserve the link between old title descriptions and current resurvey records, especially where a digital land-record complaint is pending.',
  },
  MP: {
    records: [
      ['Khasra', 'The parcel-level revenue record used for land, holder, cultivation, and classification details.', 'Match district, tehsil, village, survey number, year, area, land class, holder, and remarks.'],
      ['B-1 / Khatauni', 'The account-level Record of Rights used to review recorded holders and linked parcels.', 'Verify account, holder, linked Khasras, shares or area, and the current certified issue.'],
      ['Cadastral map', 'The map layer used to locate a Khasra and its recorded shape.', 'Check village and Khasra consistency and use the survey authority for measurements or demarcation.'],
      ['Mutation', 'The revenue proceeding used to record an eligible change.', 'Review the order, affected Khasras and shares, final status, and resulting Khasra and B-1 entries.'],
    ],
    mutation: 'MP Bhulekh provides mutation and record services. Confirm that the final order has been implemented in both parcel and account records and keep its legal basis separately.',
    survey: 'Use the cadastral map to reconcile parcel identity with Khasra and the registration schedule. Do not infer a measured boundary from a screen image.',
    specialQuestion: 'Which Madhya Pradesh output should be retained?',
    specialAnswer: 'Retain the official or digitally certified extract required for the use case, including its verification details. A search display or downloaded preview may not be the same as a certified copy.',
  },
  MH: {
    records: [
      ['7/12 extract', 'The rural Record of Rights and crop extract used for occupant, land, cultivation, charge, and remark entries.', 'Match district, taluka, village, survey or Gat number, holder, area, tenure, crop, and mutation remarks.'],
      ['8A', 'The village account extract used to review a holder and linked land accounts.', 'Compare account, holder, linked survey or Gat numbers, area totals, and current issue date.'],
      ['Property Card', 'The city-survey record used for properties within applicable urban survey areas.', 'Use the correct CTS or city-survey number and verify holder, area, tenure, encumbrance remarks, and mutations.'],
      ['Ferfar', 'The mutation entry that records a proposed and certified change to 7/12 or a Property Card.', 'Check entry number, event, notice, certification, affected parcel and parties, and final record effect.'],
    ],
    mutation: 'Use e-Hakk or the notified Mahabhumi workflow for eligible mutation applications and Aapli Chawdi or status services for notices. Confirm certification and the updated 7/12 or Property Card.',
    survey: 'Match rural survey or Gat numbers to Mahabhunakasha, or urban CTS numbers to the Property Card and map. Use e-Mojni or the competent survey office for measurement and demarcation.',
    specialQuestion: 'Can a free Maharashtra Bhulekh view be used as a legal copy?',
    specialAnswer: 'Mahabhumi distinguishes free view-only records from digitally signed 7/12, 8A, Ferfar, and Property Card copies. The portal states that digitally signed copies may be used for official and legal purposes.',
    portalNote: 'Choose the digitally signed service when the receiving authority requires an official record; the free Bhulekh display is view-only.',
  },
  MN: {
    records: [
      ['Jamabandi (MLR Form 8)', 'The land ledger identified by Manipur\'s official land-record forms.', 'Match district, circle, village, new patta number, new dag number, holder, area, and current print or certification status.'],
      ['Dag Chitha (MLR Form 7)', 'The field index used to connect a Dag or plot with land particulars.', 'Compare Dag, patta, classification, area, and village with the Jamabandi and field map.'],
      ['Field Map', 'The cadastral record used to identify the recorded parcel framework.', 'Confirm the map edition, Dag, scale, adjoining parcels, and whether the area has complete digital coverage.'],
      ['Partition-Mutation (MLR Form 16)', 'The prescribed application form for the combined partition and mutation process.', 'Track the order and resulting new Dag, patta, Jamabandi, and map changes.'],
    ],
    mutation: 'Use the Loucha Pathap and competent revenue-office process for mutation or partition. Confirm the final order and resulting Jamabandi and Dag entries; online availability varies.',
    survey: 'Field maps and surveyed records are available only where the system covers the land. Confirm district and village coverage with the relevant Sub-Deputy Collector or revenue authority.',
    specialQuestion: 'What if a Manipur record is not online?',
    specialAnswer: 'Absence from the portal does not establish absence of rights or records. Confirm survey coverage and request the maintained record from the competent revenue office.',
  },
  ML: {
    records: [
      ['Customary or community evidence', 'Village, clan, community, district-council, or other customary evidence relevant to the local tenure system.', 'Identify the governing custom, competent authority, land category, persons with rights, transfer limits, and dispute process.'],
      ['Cadastral survey map', 'A government or district-council survey output where land has been surveyed and demarcated.', 'Verify the surveyed area, map and register identifiers, occupancy or possession entry, objections, and final status.'],
      ['Occupancy or possession record', 'A record prepared under a notified survey-and-record process for covered land.', 'Read the record with the survey map and do not extend it to unsurveyed or differently governed land.'],
      ['Transfer permission', 'Approval required where a transfer is controlled by the applicable land-transfer framework.', 'Confirm the parties, land, competent authority, permission terms, exceptions, and final registration route.'],
    ],
    mutation: 'Do not assume a statewide Jamabandi mutation workflow. First establish the tenure system and whether the district council, village authority, Deputy Commissioner, or another authority keeps and updates the relevant evidence.',
    survey: 'The state government says statewide Records of Rights do not exist and that most land was not surveyed, apart from limited contexts. Use the applicable cadastral-survey and district-council process where coverage exists.',
    specialQuestion: 'Why is Meghalaya different from a typical RoR state?',
    specialAnswer: 'Land is substantially governed through Sixth Schedule institutions and customary systems. The state government says there is no statewide Record of Rights, so a guide must begin with tenure, authority, survey status, and transfer restrictions.',
  },
  MZ: {
    records: [
      ['Land Settlement Certificate', 'A settlement document for the land and purpose stated in the certificate.', 'Check the LSC type, holder, area, grade, location, map, conditions, tax, validity, and office-record clearance.'],
      ['House Pass', 'A pass for a house-site holding subject to its stated validity and conditions.', 'Verify validity or renewal, area, holder, location, transfer permission, tax, and any path to an LSC.'],
      ['Periodic Patta', 'A periodic tenure document whose conditions and permissions remain material.', 'Check term, permitted use, area, transfer or mortgage approval, tax, map, and current validity.'],
      ['Site plan', 'The mapped or surveyed description linked to an LSC, pass, lease, or mutation.', 'Confirm that the map is current, geo-referenced where required, and matches the document and ground parcel.'],
    ],
    mutation: 'e-Ram identifies Form 11 for transfer of ownership. Registration of the qualifying deed, office-record clearance, tenure-specific permission, survey requirements, and the final updated document are distinct steps.',
    survey: 'Some mutations require a fresh GIS-compatible survey or demarcation before the land can be updated. Compare the current site plan with the tenure document and office record.',
    specialQuestion: 'Why does the Mizoram tenure type matter?',
    specialAnswer: 'An LSC, House Pass, Periodic Patta, land lease, and other documents can carry different validity, use, transfer, mortgage, and approval conditions. Read the actual instrument before choosing a workflow.',
  },
  NL: {
    records: [
      ['Customary or community record', 'Evidence maintained under the traditional and tribe-specific system governing the land.', 'Identify the community, village or tribal authority, applicable custom, holders, boundaries, consent, and transfer limits.'],
      ['Patta / Jamabandi', 'Government revenue records used in covered towns, administrative headquarters, Dimapur Mouza, and government or notified lands.', 'Confirm that the parcel falls within the record system and match patta, plot, holder, area, tenure, and current status.'],
      ['Patta Pass Book', 'A passbook issued through the notified government process for covered pattadars.', 'Verify issuing authority, physical verification, plot sheet, trace map, original Patta or Jamabandi, and discrepancy notes.'],
      ['Trace map', 'A parcel map used in the Patta Pass Book verification process.', 'Check plot identity, boundaries, adjoining land, issue source, and consistency with the ground position.'],
    ],
    mutation: 'A government-record mutation route applies only where the government land-record system has jurisdiction. For customary land, identify the competent traditional and administrative process before documenting a change.',
    survey: 'The Directorate says its maintained records are concentrated in government lands, towns, administrative headquarters, and specified covered areas. Confirm coverage before requesting an RoR or map.',
    specialQuestion: 'Does Nagaland have one statewide land-record system?',
    specialAnswer: 'No. The Directorate explains that land is primarily administered through tribe-specific traditional and customary systems, while government land records cover particular towns, headquarters, and government or acquired lands.',
  },
  OD: {
    records: [
      ['Record of Rights / Patta', 'The revenue record showing Khatiyan, tenant or holder, plot, rent, cess, and related land particulars.', 'Match district, tahasil, village, RI circle, Khatiyan, tenant, plots, area, Kisam, rent, and remarks.'],
      ['Khatiyan', 'The account or Record of Rights reference used to group tenant and plot details.', 'Compare the Khatiyan number, tenant names, all linked plots, shares or area, and front and back pages.'],
      ['Plot and Kisam', 'The parcel number and recorded land classification.', 'Verify plot number, unique plot ID where available, area, Kisam, map position, and current use.'],
      ['Map view', 'The official cadastral-map service linked from Bhulekh.', 'Use the same district, tahasil, village, RI circle, and plot as the textual RoR; seek demarcation for a boundary dispute.'],
    ],
    mutation: 'Use the notified Tahasil or e-service route for mutation. Review the order and confirm the updated Khatiyan and plot details rather than treating filing or payment as completion.',
    survey: 'Bhulekh links RoR and map searches by revenue location. Match plot and Khatiyan across both layers and preserve the official copy or demarcation record needed for the purpose.',
    specialQuestion: 'What information is split across the Odisha RoR?',
    specialAnswer: 'Bhulekh explains that tenant, rent, and cess details appear on the front and that the back page shows all plot details. Review the complete RoR, not a single visible section.',
  },
  PB: {
    records: [
      ['Jamabandi', 'The periodic Record of Rights used to review owners, cultivation or tenure accounts, parcels, shares, and remarks.', 'Select the correct district, tehsil, village, Jamabandi period, owner, Khewat, Khatouni, Khasra, shares, and area.'],
      ['Khewat and Khatouni', 'Account references connecting proprietors, cultivators or tenures, and Khasras.', 'Trace the correct account and share relationships instead of relying only on an owner-name match.'],
      ['Mutation / Intkal', 'The revenue entry for a qualifying transfer, succession, partition, or order.', 'Verify mutation number, type, sanction, parties, shares, Khasras, and later Jamabandi effect.'],
      ['Rapat and Fard', 'Daily-report information and the requested Record of Rights copy used in the revenue system.', 'Distinguish the event report from the certified or digitally signed Fard required for the use case.'],
    ],
    mutation: 'Easy Jamabandi provides mutation searches and application tracking. Confirm the sanctioned Intkal and its effect in the relevant Jamabandi; keep the deed or other legal basis separately.',
    survey: 'Use Khasra and map data to identify the parcel, while treating field demarcation as a separate revenue or survey service. Match the correct Jamabandi period and map edition.',
    specialQuestion: 'How should I obtain a Punjab Fard?',
    specialAnswer: 'The official portal provides a digitally signed Fard service searchable by owner, Khewat, Khatouni, or Khasra. Preserve its digital-verification details and issue context.',
    portalNote: 'Use the official digital Fard service when a signed copy is required, not a screenshot of a Jamabandi search.',
  },
  RJ: {
    records: [
      ['Jamabandi', 'The revenue Record of Rights used to review khatedars, shares, land parcels, and classification.', 'Match district, tehsil, village, account, Khasra, holder, shares, area, land class, and record period.'],
      ['Khata and Khasra', 'The account and parcel identifiers used to locate the land.', 'Reconcile both across Jamabandi, map, mutation, registration schedule, and field identity.'],
      ['Girdawari', 'The seasonal cultivation or field-inspection record.', 'Check the crop period, Khasra, recorded cultivator or possession, and whether the entry is relevant to the decision.'],
      ['Revenue map', 'The cadastral map used to locate a Khasra in the revenue village.', 'Confirm village, Khasra, map edition, adjoining parcels, and use demarcation for an on-ground boundary.'],
    ],
    mutation: 'Use Apna Khata and the notified revenue service to review mutation or name-transfer information. Verify the final order and updated Jamabandi after any notice or objection period.',
    survey: 'A Khasra search and revenue map should identify the same parcel and village. Area or boundary conflicts require a competent revenue survey, not visual estimation from the portal.',
    specialQuestion: 'What should be recorded from an Apna Khata search?',
    specialAnswer: 'Record the district, tehsil, village, record year, account, Khasra, holder, share, area, land class, copy type, and search date so another reviewer can reproduce the result.',
  },
  SK: {
    records: [
      ['Parcha', 'The land-record extract used to review a holding through the state ILRMS.', 'Match district, subdivision, revenue circle, revenue block, Khatiyan, holder, land, area, and issue status.'],
      ['Property map', 'The Bhunaksha layer used to locate the parcel.', 'Compare the map with the Parcha, transaction schedule, adjoining parcels, and any field survey.'],
      ['Encumbrance check', 'The ILRMS service used to query registered encumbrance information available in the system.', 'Use the correct parcel and period and do not treat a limited result as a substitute for the full legal review required.'],
      ['Inheritance / mutation', 'The integrated service for succession or another recognised update.', 'Track the application and verify the final Parcha and map effect after approval.'],
    ],
    mutation: 'Sikkim ILRMS integrates property registration and mutation workflows. Even where data moves between systems, retain the registered deed, mutation decision, and updated Parcha as separate evidence.',
    survey: 'Use Know Your Map with the exact revenue block, Khatiyan, and parcel context. Boundary or area disagreement still requires the competent survey and revenue process.',
    specialQuestion: 'What does Sikkim ILRMS combine?',
    specialAnswer: 'The official portal offers property information, Reference Parcha, property map, encumbrance, government-land, inheritance or mutation, tracking, and registration-linked services in one system.',
  },
  TN: {
    records: [
      ['Patta / Chitta', 'The rural land-record service used to review patta holder, survey, subdivision, area, and land particulars.', 'Match district, taluk, village, patta, survey, subdivision, holder, area, and land classification.'],
      ['A-Register', 'The village register used for survey, extent, classification, assessment, and related land particulars.', 'Compare survey and subdivision, extent, land type, government or private classification, and current village context.'],
      ['FMB', 'The Field Measurement Book sketch used to understand recorded parcel measurements.', 'Check survey and subdivision, scale, dimensions, adjoining fields, and whether a certified survey is needed.'],
      ['TSLR', 'The Town Survey Land Register used in covered urban survey areas.', 'Use the correct town-survey block and number and match owner, extent, classification, and registration description.'],
    ],
    mutation: 'Use the notified Patta transfer or revenue workflow for the applicable rural, natham, or town-survey property. Verify the final Patta or TSLR update and retain the supporting instrument or order.',
    survey: 'Choose the correct record family: rural FMB and A-Register, natham records, or urban town-survey records. Similar survey numbers in different systems are not automatically the same parcel.',
    specialQuestion: 'Which Tamil Nadu land-record family applies?',
    specialAnswer: 'Rural patta land, natham land, and town-survey property can use different services and registers. Establish the land and survey category before searching or comparing records.',
  },
  TS: {
    records: [
      ['ROR-1B', 'The Record of Rights service for recorded ownership and parcel information.', 'Match district, mandal, village, survey or subdivision, pattadar, extent, ownership history, and current status.'],
      ['Pahani / Adangal', 'The land and cultivation record available through the current state system.', 'Check the record period, survey, extent, land class, cultivation entries, and relationship to the ROR-1B.'],
      ['Pattadar Passbook / ePPB', 'The passbook output linked to the recorded pattadar and holding.', 'Verify issue and download details, pattadar, survey numbers, extents, corrections, and current validity.'],
      ['Land Parcel Map', 'The survey-map service showing recorded parcel boundaries, extent, and geo-referenced location.', 'Match the LPM to the same survey or subdivision and use official survey action for a boundary dispute.'],
      ['Prohibited-property status', 'The current Bhu Bharati information service for registration restrictions.', 'Search the current official status and escalate a match, omission, or grievance through the notified process.'],
    ],
    mutation: 'Bhu Bharati publishes mutation, succession, correction, pending-mutation, and appeal workflows. Track the full departmental process and verify the resulting ROR-1B and ePPB.',
    survey: 'Use the Land Parcel Map with ROR-1B and Pahani for parcel identity. A displayed map does not replace survey action where boundary, extent, or acquired-land splitting is disputed.',
    specialQuestion: 'Which Telangana portal is current?',
    specialAnswer: 'Bhu Bharati is the current integrated official entry point for land-record, registration, survey-map, correction, appeal, and prohibited-property services. Avoid teaching older portal names as the current workflow.',
  },
  TR: {
    records: [
      ['Khatian / Record of Rights', 'The revenue record used to review a holding and its recorded rights.', 'Match district, subdivision, tehsil, Mouja, Khatian, holder, plot, area, land class, and record year.'],
      ['Plot / Dag', 'The parcel identifier used for land details and map searches.', 'Compare the Dag with the Khatian, map, deed, mutation, and any old-to-new identifier correlation.'],
      ['Mouja', 'The revenue village or locality unit required to locate the correct record.', 'Use the correct Mouja and jurisdiction; the same plot or Khatian number can recur elsewhere.'],
      ['Land map', 'The cadastral layer used to view the recorded plot framework.', 'Match location and Dag exactly and request official demarcation for a physical boundary conclusion.'],
    ],
    mutation: 'Use Jami and the notified revenue workflow for mutation information. Verify the final order and updated Khatian and plot entries, not only an application status.',
    survey: 'Preserve the complete district-to-Mouja location hierarchy when comparing Khatian and map data. Escalate old or changed Dag references to the survey or revenue office.',
    specialQuestion: 'What is essential in a Tripura record search?',
    specialAnswer: 'The full revenue location is essential: district, subdivision, tehsil, and Mouja, followed by Khatian and Dag. An identifier without that location context is not a reliable parcel match.',
  },
  UP: {
    records: [
      ['Khatauni / Record of Rights', 'The revenue record used to review account holders, shares, Gata or Khasra parcels, area, and land details.', 'Match district, tehsil, village, Khatauni year, khata, holder, shares, Gata or Khasra, area, and remarks.'],
      ['Khasra / Gata', 'The parcel identifier used in textual and cadastral records.', 'Reconcile current and historic parcel numbers, area, land class, map, deed schedule, and mutation order.'],
      ['BhuNaksha', 'The cadastral map service used to locate a Gata or Khasra.', 'Check village and parcel identity and use the notified measurement process for a boundary conclusion.'],
      ['Gharauni', 'A property card produced under the SVAMITVA framework for covered rural abadi properties.', 'Confirm village and property coverage, card identity, holder and map, and do not substitute it for agricultural Khatauni.'],
    ],
    mutation: 'Dakhil-Kharij is the revenue mutation route after an eligible event. Track the case, read the order, and verify the real-time Khatauni update for the affected shares and Gatas.',
    survey: 'Agricultural Khatauni and BhuNaksha, archived survey records, and abadi Gharauni serve different record families. Use the one that matches the land and decision.',
    specialQuestion: 'Are Khatauni and Gharauni interchangeable?',
    specialAnswer: 'No. Khatauni is used for the applicable revenue holding, while Gharauni is a property card for covered rural abadi areas under SVAMITVA. Determine the land category first.',
  },
  UK: {
    records: [
      ['Khatauni / Record of Rights', 'The revenue account record used to review holders, shares, and linked Khasras.', 'Match district, tehsil, village, record year, khata, holder, shares, Khasras, area, and remarks.'],
      ['Khasra', 'The parcel identifier used for land details and map comparison.', 'Check parcel number, area, class, holder or cultivation entry, map, and transaction schedule.'],
      ['Naksha', 'The cadastral map used to locate a Khasra within the revenue village.', 'Confirm the map edition and village and seek official demarcation for boundaries or access.'],
      ['Mutation', 'The revenue process for updating a qualifying change.', 'Verify the application, order, affected shares and parcels, and the final Khatauni update.'],
    ],
    mutation: 'Use the notified revenue route for mutation and confirm the completed update in Khatauni. A deed, succession basis, and mutation order should remain traceable as separate documents.',
    survey: 'Mountain terrain, access, forest boundaries, and old survey references can make a map-only review unreliable. Use the competent survey or revenue office for on-ground demarcation.',
    specialQuestion: 'What checks sit outside Uttarakhand Bhulekh?',
    specialAnswer: 'Land class, forest or government status, access, permitted use, and current purchaser or conversion restrictions can require other authorities and current legal review beyond the Khatauni.',
  },
  WB: {
    records: [
      ['Record of Rights / Khatian', 'The land record used to review recorded raiyats or holders, plots, shares, area, and classification.', 'Match district, block, Mouza, J.L. number, Khatian, plot, holder, share, area, classification, and record status.'],
      ['Plot and Mouza identifiers', 'The parcel and revenue-locality references used to locate the land.', 'Preserve the Mouza and J.L. number with every Khatian and plot search to prevent false matches.'],
      ['RS-LR plot information', 'The official correlation service between revisional-settlement and land-reforms plot references.', 'Use the published correlation and verify affected plots and areas instead of assuming old and new numbers match one-to-one.'],
      ['Mutation and conversion status', 'Separate services for record updates and changes in land use or classification.', 'Check the case, order, plots, final Khatian effect, and any conversion conditions.'],
    ],
    mutation: 'BanglarBhumi provides mutation application and status services and signed RoR delivery. Verify the order and the updated Khatian and plot information after completion.',
    survey: 'Use plot and Mouza maps with the correct J.L., RS or LR context. A correlation or plot map does not replace field survey where the boundary is disputed.',
    specialQuestion: 'Why do RS and LR numbers matter in West Bengal?',
    specialAnswer: 'A parcel may be described under different survey or settlement series. BanglarBhumi provides RS-LR information so reviewers can document the relationship instead of guessing from similar numbers.',
  },
  AN: {
    records: [
      ['Form F / Record of Rights', 'The revenue record used to review a holding by location, survey, subdivision, or holding number.', 'Match tehsil, revenue village, holding, survey, subdivision, holder, area, tenure, and current issue.'],
      ['Holding number', 'The account or holding reference used to locate linked parcels.', 'Compare the holding number, holder, all linked surveys and subdivisions, and total area.'],
      ['Survey and subdivision', 'The parcel identifiers used in the RoR and land map.', 'Match both numbers across Form F, map, deed or allotment, and physical location.'],
      ['Land map', 'The cadastral record used to understand the surveyed parcel framework.', 'Confirm map coverage, scale, parcel identifiers, adjoining land, and whether demarcation is required.'],
    ],
    mutation: 'Use the notified Revenue Department workflow for a transfer, succession, subdivision, or other update. Confirm any required permission and the final Form F change.',
    survey: 'Island, village, survey, and subdivision context are all material. A map and Form F should refer to the same parcel; boundary conclusions require the competent survey process.',
    specialQuestion: 'What makes an Andaman and Nicobar transfer different?',
    specialAnswer: 'Land tenure and transfer permissions can depend on the island, land category, allotment, and parties. Check the current Revenue Department checklist and permission before registration.',
  },
  CH: {
    records: [
      ['Estate Office property record', 'The planned-city property file and online information for applicable Estate Office plots and premises.', 'Match file type and number or sector and plot, allottee or transferee, tenure, dues, conveyance or lease, and office record.'],
      ['Village Jamabandi / RoR', 'The revenue record used for applicable village land within the Union Territory.', 'Match village, record year, Khewat, Khatoni, Khasra, holder, shares, area, and mutation entries.'],
      ['Conveyance or lease deed', 'The instrument defining title or leasehold terms for the relevant planned property.', 'Read conditions, term, transfer permissions, breaches, charges, and later Estate Office orders.'],
      ['Demarcation record', 'The revenue or estate process used to establish the recorded site on the ground.', 'Verify the authority, property or Khasra identity, plan, measurements, date, and objections.'],
    ],
    mutation: 'First identify the controlling authority. Estate Office transfer or substitution, Housing Board or society changes, and village-revenue mutation are different workflows.',
    survey: 'Planned-sector plot plans and village cadastral maps are different systems. Use the plan and demarcation process belonging to the property authority.',
    specialQuestion: 'Why must Chandigarh properties be classified first?',
    specialAnswer: 'A property may belong to the Estate Office, Housing Board, municipal or society records, or the village revenue system. The correct documents and transfer workflow depend on that classification.',
    portalNote: 'The Estate Office says its online property information is provisional and that the office record prevails if there is a discrepancy.',
  },
  DH: {
    records: [
      ['Form I and XIV', 'The Record of Rights form used for applicable surveyed rural land.', 'Match district, village, survey, subdivision, holder, area, land particulars, and current certified copy.'],
      ['Form 3 / Abolition Record', 'A historical or tenure-conversion record relevant to covered land.', 'Confirm the district, former tenure, holder, parcel, order, and relationship to the current RoR.'],
      ['Property Card', 'The record used for applicable urban or city-survey property.', 'Match city-survey or property identifier, holder, area, tenure, mutation, and issue status.'],
      ['Site plan', 'The official parcel or property plan supplied through the revenue service.', 'Check identifiers, scale, dimensions, adjoining land, issue date, and whether field demarcation is needed.'],
    ],
    mutation: 'Use the Collectorate or notified online service for the applicable district and record family. Confirm the order and update in Form I and XIV or the Property Card.',
    survey: 'Dadra and Nagar Haveli, Daman, and Diu can use different local record histories. Match the district, rural or urban system, survey identifiers, and current site plan.',
    specialQuestion: 'Which record applies in Dadra and Nagar Haveli and Daman and Diu?',
    specialAnswer: 'It depends on district and whether the property is in the rural revenue, abolition-record, or urban property-card system. Confirm the competent Collectorate and requested copy type.',
  },
  DL: {
    records: [
      ['Khatauni', 'The rural Record of Rights used to review a khata, owners, shares, and linked Khasras.', 'Match district, subdivision, village, base year, khata, owners, shares, Khasras, area in Bigha-Biswa, and remarks.'],
      ['Khasra Girdawari', 'The periodic field and cultivation record for applicable rural land.', 'Check period, Khasra, cultivation or possession entry, land use, and later proceedings.'],
      ['Field Book', 'A revenue or survey record supporting parcel measurements and field details.', 'Confirm village, Khasra, map or field references, measurements, and issuing office.'],
      ['Mutation and proceedings', 'The revenue update and linked proceedings under applicable land laws.', 'Review the order and legal section, affected shares and Khasras, and final Khatauni effect.'],
    ],
    mutation: 'Use the Revenue Department process for covered rural land and verify the digitally signed Khatauni after completion. Urban authority, leasehold, DDA, society, and municipal changes follow other systems.',
    survey: 'Indraprastha Bhulekh and cadastral material concern applicable rural land. Do not apply a rural Khasra or Khatauni model to every urban property.',
    specialQuestion: 'Does every Delhi property have a Khatauni?',
    specialAnswer: 'No. Khatauni is a rural revenue record. Urban property may instead depend on DDA, L&DO, municipal, leasehold, cooperative, allotment, or other authority records plus registration.',
  },
  JK: {
    records: [
      ['Jamabandi', 'The periodic Record of Rights used to review holders, shares, parcels, land class, and revenue entries.', 'Match district, tehsil, village, settlement or year, Khewat, Khata, Khasra, holder, shares, area, and remarks.'],
      ['Khasra and Girdawari', 'The parcel identifier and periodic cultivation or possession inspection record.', 'Check Khasra, season or period, land class, cultivation or possession, and relation to the Jamabandi.'],
      ['Mutation', 'The revenue entry for a qualifying transfer, succession, partition, or order.', 'Verify mutation number, type, attestation, parties, shares, Khasras, and later Jamabandi effect.'],
      ['Shajra Nasab and cadastral map', 'Genealogical and spatial records used alongside the RoR.', 'Use lineage with succession evidence and use the map with survey records; neither alone resolves title or boundary.'],
    ],
    mutation: 'Review the attested mutation and the updated Jamabandi together. Preserve the registered deed, succession basis, court order, or other source of the change.',
    survey: 'Use the applicable settlement map, Khasra, and current Jamabandi. Old and new settlement references or map differences require documented correlation by the revenue or survey authority.',
    specialQuestion: 'Why should the settlement or record year be preserved?',
    specialAnswer: 'Jamabandi, Girdawari, mutations, and cadastral maps are time-bound records. The year shows which rights and parcel framework the copy reflects and what later entries must also be checked.',
  },
  LA: {
    records: [
      ['Jamabandi', 'The Record of Rights being digitised and delivered through the Ladakh land-record programme.', 'Confirm district, tehsil, village, record year, holder, account, Khasra, shares, area, and portal coverage.'],
      ['Girdawari', 'The periodic cultivation or field-inspection record.', 'Check Khasra, season, cultivation or possession entry, and whether the record is complete for the village.'],
      ['Mutation', 'The revenue proceeding for a qualifying change.', 'Verify the order or attestation, affected parties and Khasras, and final Jamabandi implementation.'],
      ['Mussavi / cadastral map', 'The settlement map used to understand the recorded parcel framework.', 'Match the Khasra and map edition and confirm whether it has been digitised and geo-referenced.'],
    ],
    mutation: 'Use the available Ladakh Land Records service or competent tehsil where the online module is not complete. Confirm the final revenue update, not only a submitted request.',
    survey: 'The Administration describes an ongoing GIS and survey or resurvey programme. Confirm village and module availability and obtain the maintained office record where digitisation is incomplete.',
    specialQuestion: 'Is Ladakh digital land-record coverage complete?',
    specialAnswer: 'No. The official portal describes a staged programme and reports that textual Jamabandi data-entry modules came online during rollout. Treat availability as village- and module-specific.',
  },
  LD: {
    records: [
      ['Record of Rights', 'The land record available through the Union Territory land-record system.', 'Match island, village or survey block, survey, subdivision, holder, rights, area, land type, and current copy.'],
      ['Land register', 'The register of holdings and parcel details available through MIS reports.', 'Check island, holding, linked surveys and subdivisions, area totals, land type, and map link.'],
      ['Survey and subdivision', 'The parcel identifiers used to search textual records and maps.', 'Preserve both numbers and the island or survey-block context across every record.'],
      ['Map view', 'The spatial view linked to the land register and parcel search.', 'Confirm map coverage and parcel identity and use the survey authority for a live boundary issue.'],
    ],
    mutation: 'Use the notified Lakshadweep revenue and registration process for a transfer or other update. Confirm the changed RoR or land register and any approval required for the land and parties.',
    survey: 'Island and survey-block context are essential. Match survey and subdivision in the land register and map and request competent demarcation where the ground boundary matters.',
    specialQuestion: 'What should be checked beyond Lakshadweep RoR?',
    specialAnswer: 'Island-specific tenure, land category, transfer controls, coastal or environmental context, entry rules, and competent-authority permissions may sit outside the RoR search.',
  },
  PY: {
    records: [
      ['Patta / Record of Rights', 'The land-record extract used to review a recorded holder and parcel.', 'Select the correct region, taluk, village, land type, survey or resurvey number, holder, area, and copy status.'],
      ['Settlement / Chitta Register', 'The settlement register used for survey and land particulars in the applicable region.', 'Check survey edition, village, holder, extent, classification, and relation to the current Patta.'],
      ['FMB', 'The Field Measurement Book sketch used to understand recorded parcel measurements.', 'Match survey and subdivision, scale, dimensions, adjoining fields, and official issue details.'],
      ['Town Survey and Guideline Register', 'Urban survey and valuation-reference services for applicable properties.', 'Use the correct town-survey identifier and keep valuation guidance separate from ownership or title evidence.'],
    ],
    mutation: 'Use Nilamagal or the competent Revenue office for the applicable region and record family. Verify the final Patta or town-survey update and retain its supporting instrument or order.',
    survey: 'Puducherry, Karaikal, Mahe, and Yanam have different local survey contexts. Choose the region, land type, and survey system before comparing FMB, settlement, or town-survey records.',
    specialQuestion: 'Is a Nilamagal portal view the same as a signed extract?',
    specialAnswer: 'No. Nilamagal distinguishes public viewing and service outputs. Confirm whether the receiving authority needs a digitally signed or otherwise certified extract.',
    portalNote: 'Select the correct region and service, then confirm whether the output is a public view or a digitally signed extract.',
  },
};

function linksForKinds(code: UniversityStateCode, requested: StateGuideSourceKind[]): StateGuideSourceKind[] {
  const profile = stateLandRecordProfiles.find((item) => item.code === code);
  if (!profile) return ['national'];
  return requested.filter((kind) => kind === 'national' || profile.officialLinks.some((link) => link.kind === kind));
}

function recordExplainers(records: readonly RecordSeed[]): StateRecordExplainer[] {
  return records.map(([name, purpose, verify]) => ({ name, purpose, verify }));
}

export const stateLearningGuides: StateLearningGuide[] = stateLandRecordProfiles.map((profile) => {
  const seed = seeds[profile.code];
  const landSource = linksForKinds(profile.code, ['land-records', 'guidance', 'national']);
  const registrationSource = linksForKinds(profile.code, ['registration', 'national']);
  const portalNames = profile.officialLinks.map((link) => link.label).join(', ');

  return {
    code: profile.code,
    answerSummary: `${profile.summary} For a first review, start with ${profile.primaryRecordLabel}, then reconcile mutation, registration, survey or map, restrictions, and the present field identity.`,
    recordExplainers: recordExplainers(seed.records),
    accessSteps: [
      `Open only the official ${profile.name} entry point listed in this guide: ${portalNames}.`,
      `Select the complete revenue location and use exact account, survey, subdivision, plot, holding, or property identifiers from an existing official document.`,
      `Save the result with its search date, record period, issue status, and verification details. ${seed.portalNote ?? 'Confirm whether it is a public view or a certified or digitally signed copy.'}`,
      'Compare the revenue result with the registered instrument, mutation order, cadastral or survey record, applicable restrictions, tax or planning evidence, and a consented site review.',
    ],
    topics: [
      {
        id: 'mutation',
        question: `How does mutation work in ${profile.name}?`,
        answer: seed.mutation,
        sourceKinds: landSource,
      },
      {
        id: 'survey',
        question: `How should maps and survey records be used in ${profile.name}?`,
        answer: seed.survey,
        sourceKinds: landSource,
      },
      {
        id: 'registration',
        question: 'How do registration and land records fit together?',
        answer: `Use the listed registration authority for the registered instrument, fee, appointment, and copy services available in ${profile.name}. Registration records the instrument; mutation updates the applicable revenue record. Even where systems are integrated, preserve the registered document, final mutation decision, and updated land record separately.`,
        sourceKinds: registrationSource,
      },
      {
        id: 'special-context',
        question: seed.specialQuestion,
        answer: seed.specialAnswer,
        sourceKinds: landSource,
      },
    ],
    checklist: [
      `Identify the exact authority and record family for the parcel, starting with ${profile.primaryRecordLabel}.`,
      'Capture the full revenue location, every parcel and account identifier, the record period, issue date, and copy or certification type.',
      'Compare names, shares, area, land class, tenure, encumbrance or remark fields, and mutation references without silently normalising differences.',
      'Reconcile the current land record with the underlying registered instrument, succession document, court or authority order, and mutation decision.',
      'Match the textual parcel to the applicable cadastral map or survey record and document any old-to-new number correlation.',
      'Check current transfer, prohibited-property, government, forest, tribal, tenancy, planning, acquisition, court, and land-use restrictions with the competent authority where applicable.',
      'Visit the site with consent, record boundaries and occupation without making a survey claim, and escalate conflicts to a qualified professional or authority.',
    ],
    faqs: [
      {
        question: `Which land record should I check first in ${profile.name}?`,
        answer: `Start with ${profile.primaryRecordLabel}. Then use the record-specific identifiers to find the current mutation, map or survey, and registered-instrument trail. The correct starting record can still differ for rural, urban, customary, abadi, allotment, or special-tenure land.`,
        sourceKinds: landSource,
      },
      {
        question: `Does an online ${profile.name} land record prove ownership?`,
        answer: `Do not treat a portal view by itself as a conclusive title opinion. It is one evidence layer. Confirm its certification and date, then reconcile the registered chain, mutation, survey or map, restrictions, possession, and any dispute or authority record.`,
        sourceKinds: ['national', ...landSource],
      },
      {
        question: `How do I change a name in ${profile.name} land records?`,
        answer: seed.mutation,
        sourceKinds: landSource,
      },
      {
        question: `Where can I get official ${profile.name} land-record information?`,
        answer: `Use the government systems linked on this page: ${portalNames}. Check the authority named on the service and avoid look-alike private sites, paid intermediaries, or search snippets as evidence.`,
        sourceKinds: [...landSource, ...registrationSource],
      },
    ],
    seoTitle: `${profile.name} Land Records Guide | Pattadar University`,
    seoDescription: `Learn ${profile.name} land records: ${profile.primaryRecordLabel}, mutation, survey maps, registration checks, evidence limits, and official government sources.`,
    searchTerms: [profile.name, profile.primaryRecordLabel, ...profile.localTerms, 'land records', 'mutation', 'survey map', 'registration'],
    editorialNote: 'Human-reviewed educational summary based only on the government sources linked on this page. Portal coverage and procedures can change; a changed source requires editorial review before this guide is republished.',
    reviewedOn: profile.reviewedOn,
  };
});

const guideByCode = new Map(stateLearningGuides.map((guide) => [guide.code, guide]));

export function stateLearningGuideByCode(code: UniversityStateCode): StateLearningGuide {
  const guide = guideByCode.get(code);
  if (!guide) throw new Error(`Missing state learning guide for ${code}`);
  return guide;
}
