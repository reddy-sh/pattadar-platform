import type { LessonContent } from '../domain/types';
import { defineLesson } from './defineLesson';

export const learnerCourseLessons: Record<string, LessonContent> = {
  'buy-records': defineLesson('buy-records', {
    overview: 'Andhra Pradesh property information is spread across registration, revenue, survey, restriction, tax, and planning systems. This lesson builds a mental model for using those systems together without treating one portal result as a complete title decision.',
    objectives: ['Explain what each major record layer is designed to show.', 'Build a dated, source-linked Andhra Pradesh property file.', 'Recognise questions that require an authority or qualified professional.'],
    sections: [
      { heading: 'Use six evidence layers', body: 'Registration records show registered instruments and indexed transactions. Revenue records such as 1-B, the Pattadar passbook, and Adangal support administration of rights, accounts, possession, or cultivation. Survey records such as FMB, RSR, village maps, and BhuNaksha describe parcel geometry and survey history. Restriction lists, tax records, and planning or RERA approvals answer separate questions. No layer replaces all the others.' },
      { heading: 'Anchor every search to property identity', body: 'Record district, mandal, village, survey and subdivision number, stated extent, boundaries, document number and year, SRO, current claimant, and any old references. Preserve uncertain spellings and legacy numbers. A search against the wrong village, SRO, period, or subdivision can return a clean-looking but irrelevant result.' },
      { heading: 'Preserve provenance and time', body: 'For each result, retain the official URL or issuing office, request or certificate number, search inputs, issue or capture date, covered period, and an unaltered copy. Separate owner-supplied documents from independently obtained official records. A portal screenshot without its parameters and date is a lead, not a conclusion.' },
    ],
    practice: {
      title: 'Build an AP record-layer index',
      steps: ['Create rows for registration, 1-B or passbook, Adangal, survey, restrictions, tax, and planning evidence.', 'Add official source, search parameters, issue date, property identifiers, and evidence status.', 'Mark each mismatch, missing period, unavailable service, or professional-review question without resolving it by assumption.'],
      deliverable: 'A dated Andhra Pradesh property index that shows what each source can and cannot establish.',
    },
    knowledgeCheck: {
      prompt: 'MeeBhoomi shows a matching name and survey number. What is the strongest conclusion?',
      options: ['It is one current revenue source to preserve and compare with registration, survey, restriction, and other evidence.', 'It guarantees marketable title and permits immediate payment.', 'It makes the registered instrument and EC unnecessary.'],
      correctOption: 0,
      explanation: 'A revenue result is useful evidence, but it does not by itself answer every title, transaction, restriction, survey, or planning question.',
    },
    referenceIds: ['ap-land-records-service', 'ap-ror-act', 'dolr-dilrmp', 'ap-bhudhaar'],
  }),
  'ap-ror': defineLesson('ap-ror', {
    overview: 'The Record of Rights, commonly encountered as 1-B, and the Pattadar passbook are core Andhra Pradesh revenue records. Read them as dated administrative evidence and reconcile them with the underlying transaction and survey trail.',
    objectives: ['Identify the key identity, account, rights, and parcel fields in a 1-B record.', 'Distinguish a revenue entry from a registered title instrument.', 'Prepare a correction or escalation question without altering source evidence.'],
    sections: [
      { heading: 'Read the header before the names', body: 'Confirm district, mandal, village, account or khata reference, survey and subdivision, issue date, service source, and stated extent before interpreting a holder entry. A familiar name in a different parcel context is not a match. Keep the original language, transliteration, and visible identifiers together.' },
      { heading: 'Understand the record boundary', body: 'The Rights in Land framework provides for preparation, maintenance, amendment, inspection, and copies of the Record of Rights. A current 1-B or passbook can be important revenue evidence, but learners must not present it as a substitute for the registered chain, restriction review, survey reconciliation, or a qualified title opinion.' },
      { heading: 'Handle stale or conflicting entries', body: 'Compare the 1-B with the instrument, mutation history, Adangal, FMB or survey reference, tax evidence, and the person claiming authority. Record a mismatch exactly. Use the published correction or mutation service and retain the application, receipt, order, and before-and-after records rather than editing a working copy.' },
    ],
    practice: {
      title: 'Annotate a sample 1-B',
      steps: ['Mark jurisdiction, khata, survey, subdivision, extent, holder, rights description, source, and date.', 'Compare those fields with a fictional registered deed and list every agreement or mismatch.', 'Write the official-service question and professional-review question separately.'],
      deliverable: 'An annotated 1-B comparison sheet with source limits and unresolved issues.',
    },
    knowledgeCheck: {
      prompt: 'A registered deed names one person, while the current 1-B names another. What should the learner do?',
      options: ['Change the 1-B copy to match the deed.', 'Preserve both records, investigate the transaction and mutation trail, and route the conflict for qualified review.', 'Assume the newest-looking screen is legally conclusive.'],
      correctOption: 1,
      explanation: 'A material identity conflict requires source-backed investigation and the appropriate authority or professional; it cannot be corrected informally.',
    },
    referenceIds: ['ap-ror-act', 'ap-meebhoomi', 'ap-gsws-services', 'ap-gsws-manual'],
  }),
  'ap-adangal': defineLesson('ap-adangal', {
    overview: 'Adangal is a village-level revenue and cultivation record used to understand parcel, land-use, and cultivation entries for a stated period. Its value depends on the exact parcel, season or period, source, and comparison with other records.',
    objectives: ['Locate parcel, classification, extent, irrigation, possession, and cultivation fields.', 'Explain why a cultivator entry is not automatically an ownership finding.', 'Compare Adangal with 1-B, survey, and registration evidence.'],
    sections: [
      { heading: 'Read the period and parcel first', body: 'Confirm village, survey and subdivision, extent, classification, assessment, water or irrigation source, crop or use entry, cultivator or enjoyment entry, and the record period. An older season may explain historical use but should not be described as the current position.' },
      { heading: 'Separate cultivation from ownership', body: 'Cultivation, possession, and rights can be represented in different legal and administrative contexts. The Andhra Pradesh Crop Cultivator Rights Act expressly creates a cultivation-rights framework without turning the cultivation arrangement or card into ownership. Record what the field says and avoid converting it into a title conclusion.' },
      { heading: 'Compare across layers', body: 'Place Adangal beside 1-B or passbook, registered instruments, FMB or RSR references, and current site observations. Differences in name, extent, classification, land use, irrigation, or subdivision should become explicit review questions. Never merge differing fields into a new unofficial record.' },
    ],
    practice: {
      title: 'Build an Adangal comparison',
      steps: ['Extract every parcel, period, classification, cultivation, and irrigation field from a sample.', 'Compare it with a sample 1-B and parcel visit note.', 'Label each finding as match, time-related variation, unresolved conflict, or outside learner scope.'],
      deliverable: 'A period-aware comparison that does not confuse cultivation with ownership.',
    },
    knowledgeCheck: {
      prompt: 'A person is shown as cultivator in an Adangal entry. What may the learner safely say?',
      options: ['The entry records cultivation information for its stated period and must be interpreted with the governing records.', 'The person automatically owns the land.', 'Every registered title instrument is invalid.'],
      correctOption: 0,
      explanation: 'A cultivation entry has an important but bounded meaning; ownership and transaction questions require the other record layers and qualified review.',
    },
    referenceIds: ['ap-land-records-service', 'ap-meebhoomi', 'ap-gsws-services', 'ap-crop-cultivator-act'],
  }),
  'ap-survey': defineLesson('ap-survey', {
    overview: 'Andhra Pradesh survey evidence includes the Re-settlement Register, Field Measurement Book, village maps, subdivisions, and BhuNaksha. These sources help connect a record description to mapped geometry, but a screen map is not a field demarcation.',
    objectives: ['Explain the different roles of RSR, FMB, village maps, and BhuNaksha.', 'Request and preserve an official FMB copy.', 'Recognise when a licensed or authorised survey process is needed.'],
    sections: [
      { heading: 'Use each survey record for its purpose', body: 'RSR or Diglot material provides historical settlement context such as survey identity, classification, and extent. An FMB contains measurement and subdivision detail. Village maps show wider spatial context. BhuNaksha provides official digital cadastral-map access. Their dates, scales, and update paths can differ.' },
      { heading: 'Read geometry with identifiers', body: 'Check village, survey and subdivision number, sheet or map reference, scale, adjoining parcels, dimensions, symbols, and north or orientation information. Preserve the certified copy or official extract and request metadata. Do not stretch a screenshot or estimate dimensions from display pixels.' },
      { heading: 'Know when the map stops', body: 'A digital parcel outline is useful for orientation and reconciliation, but it does not authorise entry or replace professional demarcation, monument recovery, subdivision approval, or resolution of a boundary dispute. Conflicting geometry, missing stones, occupation differences, or disputed access are stop-and-escalate conditions.' },
    ],
    practice: {
      title: 'Reconcile a parcel across survey sources',
      steps: ['Match the survey and subdivision identity across an RSR extract, FMB copy, and BhuNaksha view.', 'List dimensions, neighbours, scale, date, and any visible differences.', 'Write a field-demarcation brief that states the unresolved question without declaring a boundary.'],
      deliverable: 'A survey-source comparison and a properly scoped professional referral.',
    },
    knowledgeCheck: {
      prompt: 'BhuNaksha displays a parcel outline that differs from an occupied fence. What should happen?',
      options: ['Move the fence to the screen line.', 'Treat the fence as the legal boundary.', 'Preserve both observations and seek the appropriate official survey or professional demarcation process.'],
      correctOption: 2,
      explanation: 'A map view and occupation evidence can reveal a question, but they do not let the learner settle a boundary dispute.',
    },
    referenceIds: ['ap-bhunaksha', 'ap-survey-records', 'ap-fmb-manual'],
  }),
  'ap-restrictions': defineLesson('ap-restrictions', {
    overview: 'A matching name or deed is not enough when land may be assigned, government-owned, dotted, notified as prohibited, affected by an institution or proceeding, or otherwise restricted. This lesson teaches detection and escalation, never circumvention.',
    objectives: ['Recognise common Andhra Pradesh restriction categories and source types.', 'Run a parcel-specific prohibited-property review with preserved parameters.', 'Apply a stop condition when status is unclear or restricted.'],
    sections: [
      { heading: 'Distinguish the categories', body: 'Assigned lands can carry statutory transfer restrictions. Government-property protections, endowment or Wakf interests, surplus or acquisition matters, court or authority interests, and published Section 22-A prohibited-property entries raise different questions. Dotted-land status concerns entries in the Re-settlement Register and has its own statutory process. Do not collapse these labels into one generic warning.' },
      { heading: 'Search with exact identity and current publications', body: 'Use the official registration and district publication sources available for the relevant location. Preserve district, mandal, village, survey and subdivision, document context, search date, list or notification version, and the returned record. A no-result search is only as reliable as its inputs and coverage.' },
      { heading: 'Stop, verify, and use the lawful process', body: 'Any match, ambiguous classification, missing list, conflicting official source, assigned-land indicator, dotted entry, or government or institutional claim should pause transaction advice. Route the issue to the competent revenue or registration authority and a qualified legal professional. Never coach a learner to rename, subdivide, backdate, or structure around a restriction.' },
    ],
    practice: {
      title: 'Prepare a restriction-screening note',
      steps: ['Classify five fictional alerts as assigned, government, dotted, prohibited-list, or other institutional or proceeding risk.', 'Record the exact official source, parameters, date, and result for each.', 'Write the stop action, authority question, and professional referral without recommending a workaround.'],
      deliverable: 'A parcel-specific restriction log with evidence and accountable next actions.',
    },
    knowledgeCheck: {
      prompt: 'A survey number appears on an official prohibited-property publication. What is the correct learning response?',
      options: ['Continue if the price is attractive.', 'Pause the workflow, preserve the match, and seek confirmation or remedy only through the competent authority and qualified review.', 'Change the subdivision number in the application.'],
      correctOption: 1,
      explanation: 'A restriction indicator is a stop condition. The course teaches lawful verification and remedy, not avoidance.',
    },
    referenceIds: ['ap-assigned-lands-act', 'ap-prohibited-properties', 'ap-dotted-lands-act', 'ap-government-property-act', 'ap-gsws-manual'],
  }),
  'ap-registration': defineLesson('ap-registration', {
    overview: 'The Andhra Pradesh Registration and Stamps system supports document preparation and registration services, Encumbrance Certificate searches, certified copies, market-value assistance, fees, and appointments. Each output has a defined scope and search context.',
    objectives: ['Navigate only verified government registration entry points.', 'Record complete EC and certified-copy search parameters.', 'Explain the limits of registration, EC, and guideline market value.'],
    sections: [
      { heading: 'Verify the portal and workflow', body: 'Start from the official Andhra Pradesh IGRS address or the national NGDRS state-link directory. A registration workflow can include document nature, property and SRO, parties, property schedule, witnesses, enclosures, market value, consideration, payment, review, and slot selection. Check every populated field before submission.' },
      { heading: 'Treat EC and certified copies as scoped evidence', body: 'An EC search reflects indexed registered transactions found for the selected property details, office, and period. Preserve those parameters and review the returned entries and no-entry wording carefully. Obtain certified copies for relevant instruments when needed. An EC is not a universal certificate that no legal claim, unregistered interest, error, or restriction exists.' },
      { heading: 'Separate value, registration, and title conclusions', body: 'Official market-value assistance supports stamp and registration workflows; it is not necessarily the negotiated or appraised market price. Registration creates a formal public record for the instrument but does not cure a defective transferor right, wrong parcel identity, prohibited transaction, or missing professional review.' },
    ],
    practice: {
      title: 'Create a registration research packet',
      steps: ['Verify the government portal and identify the applicable SRO and document context.', 'Draft EC search parameters and a certified-copy request for a fictional parcel.', 'List what the EC, certified copy, market-value result, and registered instrument each do not prove alone.'],
      deliverable: 'A source-verified registration packet with preserved parameters and limitations.',
    },
    knowledgeCheck: {
      prompt: 'An EC search returns no entries for the selected period. What is the safe interpretation?',
      options: ['The selected search found no indexed entries shown for those parameters and period; inputs and other evidence still need review.', 'The property has perfect title forever.', 'No registered instrument needs to be inspected.'],
      correctOption: 0,
      explanation: 'The result is bounded by the search identity, office, period, index, and record system; it is not a complete title guarantee.',
    },
    referenceIds: ['ap-registration', 'ngdrs-state-links', 'ap-registration-manual', 'india-services-ec', 'dolr-registration-faq'],
  }),
  'ap-mutation': defineLesson('ap-mutation', {
    overview: 'Registration, mutation, correction, subdivision, resurvey rectification, and e-passbook issuance are related but separate workflows. A learner should identify the right service and preserve the complete before-and-after trail.',
    objectives: ['Choose among mutation, correction, subdivision, passbook, and survey-related services.', 'Track an application through its responsible authority and evidence.', 'Keep a reproducible change history for later review.'],
    sections: [
      { heading: 'Name the change before choosing a service', body: 'A registered transfer may require a mutation workflow; a clerical field error may require correction; a new parcel division may require subdivision and survey action; a survey discrepancy may require resurvey rectification; and a passbook request has its own service. Do not use a simple correction request to conceal a disputed right or uncompleted transaction.' },
      { heading: 'Follow the published service chain', body: 'Use official GSWS, MeeSeva, MeeBhoomi, or other notified government channels as applicable. Record required inputs, applicant authority, service number, receiving office, approver, payment, status, query, inspection, order, and delivery. Portal availability or names can change, so verify the current government entry point.' },
      { heading: 'Preserve the change record', body: 'Keep the pre-application record, supporting instrument or order, submitted fields, receipt, communications, deficiency requests, final order, and newly issued record. Compare all parcel and person fields after completion. A successful status message does not excuse a wrong survey number, extent, name, or classification.' },
    ],
    practice: {
      title: 'Route five record-change scenarios',
      steps: ['Classify each scenario as mutation, correction, subdivision, resurvey rectification, passbook, or professional dispute review.', 'List the official service, evidence, authority, and stop conditions.', 'Create an audit folder structure for application through final verification.'],
      deliverable: 'A workflow decision table and reproducible change-history checklist.',
    },
    knowledgeCheck: {
      prompt: 'A sale deed is registered, but the revenue record still shows the prior holder. What should the learner do?',
      options: ['Alter the downloaded record.', 'Use the applicable official mutation workflow, preserve the registration evidence and application trail, and verify the resulting fields.', 'Assume registration and mutation are the same event.'],
      correctOption: 1,
      explanation: 'Registration and revenue-record updating are distinct controlled processes whose evidence should remain linked.',
    },
    referenceIds: ['ap-ror-act', 'ap-gsws-services', 'ap-gsws-manual', 'ap-bhudhaar'],
  }),
  'buy-names': defineLesson('buy-names', {
    overview: 'Property problems often begin with small differences in names, survey references, extents, or boundaries. The goal is to compare, not guess.',
    objectives: ['Normalise comparisons without altering source text.', 'Trace survey and subdivision references.', 'Escalate material mismatches.'],
    sections: [
      { heading: 'Compare names as evidence', body: 'Place each spelling, initial, parent name, and address side by side. A spelling variation may be harmless, but identity must be supported by the record trail rather than assumed.' },
      { heading: 'Trace the land reference', body: 'Follow parent survey numbers, subdivisions, plot numbers, village references, and stated boundaries across records. Preserve both old and new references so a reviewer can understand the chain.' },
      { heading: 'Reconcile extent carefully', body: 'Convert units only in a separate working column and keep the original value. If arithmetic, boundaries, and stated extent disagree, stop and seek survey or legal review before money changes hands.' },
    ],
    practice: {
      title: 'Complete a three-record comparison',
      steps: ['Copy identity and parcel fields exactly from three sample records.', 'Highlight matches, explainable variations, and conflicts.', 'Write one follow-up question for each unresolved conflict.'],
      deliverable: 'A comparison sheet that preserves original values and labels every mismatch.',
    },
    knowledgeCheck: {
      prompt: 'Two records show slightly different owner names and different extents. What should the buyer do?',
      options: ['Choose the newer-looking record.', 'Document both differences and route them for verification.', 'Average the extents and continue.'],
      correctOption: 1,
      explanation: 'Material identity or extent differences need evidence and qualified review, not informal correction.',
    },
    referenceIds: ['ap-ror-act', 'ap-survey-records'],
  }),
  'buy-visit': defineLesson('buy-visit', {
    overview: 'A site visit tests whether the physical place, access, occupation, and visible boundaries align with the paper description. It does not replace a survey.',
    objectives: ['Prepare a consented visit plan.', 'Capture location context in a repeatable order.', 'Separate observations from conclusions.'],
    sections: [
      { heading: 'Plan before travel', body: 'Confirm permission, meeting contact, safe access, parcel reference, weather, daylight, and the specific questions the visit should answer. Never enter occupied or restricted land without clear authority.' },
      { heading: 'Use a capture sequence', body: 'Begin with approach and access, then wide parcel context, visible markers, occupation or structures, utilities, drainage, and issue-specific details. Photograph a marker in context before taking a close-up.' },
      { heading: 'Report only what you observed', body: 'Use phrases such as "visible marker" or "person present stated" and include date, time, location method, and limitations. Do not label a line as the legal boundary unless a qualified survey supports that conclusion.' },
    ],
    practice: {
      title: 'Plan a mock site visit',
      steps: ['Write the permission and safety checks.', 'Create a ten-shot capture list.', 'Prepare an observation template with a limitations field.'],
      deliverable: 'A visit plan another field worker could follow without verbal instructions.',
    },
    knowledgeCheck: {
      prompt: 'A fence appears to follow the parcel edge. How should it be recorded?',
      options: ['As the confirmed legal boundary.', 'As irrelevant because only papers matter.', 'As a visible fence line requiring comparison with survey evidence.'],
      correctOption: 2,
      explanation: 'A physical fence is useful evidence, but its legal significance requires verification.',
    },
    referenceIds: ['ap-survey-records', 'ap-bhunaksha'],
  }),
  'buy-check': defineLesson('buy-check', {
    overview: 'This readiness check combines the record, comparison, and field workflows into a decision gate. It measures whether the file is ready for professional review, not whether the learner should buy.',
    objectives: ['Assemble a traceable review pack.', 'Classify open issues by impact.', 'Choose a safe next action.'],
    sections: [
      { heading: 'Use clear status labels', body: 'Mark each requirement as present and reviewed, present but unresolved, missing, or not applicable with a reason. Avoid a simple yes/no that hides uncertainty.' },
      { heading: 'Prioritise stop conditions', body: 'Identity conflicts, unexplained title breaks, material extent differences, disputed access, occupation concerns, or pressure to pay before review should pause the transaction workflow.' },
      { heading: 'Prepare the handoff', body: 'Give the reviewer the index, source files, comparison sheet, site note, and a short question list. Keep facts, seller statements, and learner concerns in separate fields.' },
      { heading: 'Run the buyer-specific checks', body: 'Before a non-refundable payment, inspect originals or authority-verifiable copies and route mortgages, unpaid taxes, litigation, succession, acquisition, and transfer restrictions to the competent offices and an advocate. Verify any power of attorney for authenticity, current force, non-revocation, and sufficient authority. For an applicable RERA project, compare promoter, title, sanctioned plans, approvals, promised completion, and updates. After registration, track mutation, possession, payment, document delivery, and handover evidence.' },
    ],
    practice: {
      title: 'Complete a buyer readiness gate',
      steps: ['Score a sample file using the four status labels.', 'Identify the top three unresolved risks.', 'Write the next owner and action for each risk.'],
      deliverable: 'A one-page readiness summary linked to the supporting file index.',
    },
    knowledgeCheck: {
      prompt: 'When is a buyer file ready to move forward?',
      options: ['When every uncertainty has been hidden from the summary.', 'When required evidence and unresolved issues are visible and routed to the right reviewer.', 'When the seller requests an advance quickly.'],
      correctOption: 1,
      explanation: 'Readiness means the evidence and remaining decisions are explicit; it is not a guarantee of purchase safety.',
    },
    referenceIds: ['ap-registration', 'ap-rera', 'ap-dpms', 'dolr-registration-faq'],
  }),

  'sell-inventory': defineLesson('sell-inventory', {
    overview: 'A sale-ready file begins with an honest inventory of what exists, where it came from, and what still needs attention.',
    objectives: ['Create a property file inventory.', 'Separate originals, verified extracts, and informal copies.', 'Protect sensitive identity information.'],
    sections: [
      { heading: 'Map the file', body: 'List title, revenue, tax, encumbrance, survey, approval, loan, inheritance, authority, and identity records that may be relevant. Record the physical or digital location of each item.' },
      { heading: 'Label evidence quality', body: 'Identify whether an item is an original, certified or portal extract, ordinary scan, screenshot, or owner statement. Do not make a copy appear more authoritative than it is.' },
      { heading: 'Minimise sensitive data', body: 'Share only the identity fields needed for the stated purpose. Mask unrelated identifiers in working copies, keep originals controlled, and record who received access.' },
      { heading: 'Prepare the ownership baseline', body: 'Include the deed or instrument by which title or the relevant interest was acquired, the current 1-B or other Record of Rights for agricultural land, or the current municipal mutation or assessment for urban property. Keep link documents and the record that each current document replaced.' },
    ],
    practice: {
      title: 'Inventory a sample seller file',
      steps: ['Group records by purpose.', 'Label source and evidence quality.', 'Flag duplicates, missing pages, and sensitive fields.'],
      deliverable: 'A controlled inventory that points to each source item.',
    },
    knowledgeCheck: {
      prompt: 'How should a portal screenshot be labelled?',
      options: ['As an original government certificate.', 'As a screenshot with URL or source and capture date.', 'Without a label if the text is readable.'],
      correctOption: 1,
      explanation: 'The label preserves what the item actually proves and lets a reviewer obtain a current source if needed.',
    },
    referenceIds: ['dolr-registration-faq', 'ap-ror-act', 'ap-registration'],
  }),
  'sell-gaps': defineLesson('sell-gaps', {
    overview: 'Trustworthy sellers describe gaps and known discrepancies before they become surprises. Clear disclosure improves review without making legal conclusions.',
    objectives: ['Write neutral gap descriptions.', 'Distinguish known fact from owner recollection.', 'Assign a resolution route.'],
    sections: [
      { heading: 'Describe the observable gap', body: 'State which record or field is missing, conflicting, stale, or unreadable. Avoid words such as "clear" or "perfect" unless a qualified reviewer has documented the basis.' },
      { heading: 'Add provenance', body: 'Say who reported the issue, what source was checked, and the relevant date. An owner recollection can be useful context but should never be presented as a verified record.' },
      { heading: 'Route rather than conceal', body: 'Direct survey questions to a survey professional, title or dispute questions to a qualified legal professional, and portal corrections to the responsible authority or service workflow.' },
      { heading: 'Disclose known transaction risks', body: 'Record known mortgages, court or family disputes, notices, acquisition or transfer restrictions, plan deviations, unpaid government or utility dues, and any other material issue. State the evidence and current status without promising that the list is exhaustive or legally resolved.' },
    ],
    practice: {
      title: 'Write a discrepancy log',
      steps: ['Select five sample mismatches.', 'Describe each in factual language.', 'Add evidence, impact, next action, and responsible reviewer.'],
      deliverable: 'A discrepancy log suitable for sharing with a buyer reviewer.',
    },
    knowledgeCheck: {
      prompt: 'What is the clearest way to describe a missing tax receipt?',
      options: ['Taxes are definitely paid.', 'No tax receipt was available in the supplied file as of the review date; current status needs verification.', 'The buyer should ignore tax records.'],
      correctOption: 1,
      explanation: 'The statement identifies the actual gap, time boundary, and required follow-up without inventing a conclusion.',
    },
    referenceIds: ['dolr-registration-faq', 'ap-registration'],
  }),
  'sell-share': defineLesson('sell-share', {
    overview: 'Secure sharing gives the intended reviewer enough information for a defined purpose while reducing unnecessary exposure.',
    objectives: ['Create a purpose-limited share pack.', 'Set access and expiry controls.', 'Maintain a disclosure log.'],
    sections: [
      { heading: 'Package by purpose', body: 'A preliminary buyer review may need different records from a bank, lawyer, or field worker. Include an index and exclusions so recipients know what the pack does and does not contain.' },
      { heading: 'Control access', body: 'Use named recipients, authentication, expiry, download restrictions where practical, and revocation. Avoid permanent public links and casual messaging for high-risk identity records.' },
      { heading: 'Log the disclosure', body: 'Record recipient, purpose, item set, permission source, share time, expiry, and revocation. A log supports correction when a file is replaced or consent changes.' },
    ],
    practice: {
      title: 'Prepare a secure handoff',
      steps: ['Choose the minimum records for a stated review purpose.', 'Redact unrelated sensitive fields.', 'Write the access, expiry, and revocation entry.'],
      deliverable: 'A share manifest that can be reconciled with the disclosure log.',
    },
    knowledgeCheck: {
      prompt: 'Which sharing approach is strongest?',
      options: ['A public link with no expiry.', 'A named, expiring share containing only purpose-relevant records.', 'Sending every identity document in a group chat.'],
      correctOption: 1,
      explanation: 'Purpose limitation, named access, expiry, and a record of disclosure reduce avoidable risk.',
    },
    referenceIds: ['dpdp-act', 'dpdp-rules'],
  }),
  'sell-check': defineLesson('sell-check', {
    overview: 'The seller readiness check confirms that records, known issues, permissions, and handoff controls are ready for a buyer or professional review.',
    objectives: ['Test the completeness of a sale pack.', 'Verify disclosure and privacy controls.', 'Create a next-action list.'],
    sections: [
      { heading: 'Check the pack against the index', body: 'Open every linked item, confirm page order and readability, and make sure property identifiers match the index. A listed file that cannot be opened is still missing.' },
      { heading: 'Check claims against evidence', body: 'Review the summary for unsupported words such as guaranteed, approved, dispute-free, or exact. Replace conclusions with source-backed statements and reviewer notes.' },
      { heading: 'Check the receiving workflow', body: 'Confirm consent, recipient, purpose, access period, contact for questions, and the correction process. Keep a frozen version of exactly what was shared.' },
      { heading: 'Close the transfer trail', body: 'At completion, preserve the approved settlement or consideration record, possession and key handover, original documents delivered, retained copies, registration output, mutation follow-up, and any post-completion undertaking. Record what remains outstanding and who owns it.' },
    ],
    practice: {
      title: 'Run a sale-pack quality review',
      steps: ['Test every index link.', 'Challenge each claim in the summary.', 'Record unresolved items and sharing controls.'],
      deliverable: 'A signed-off readiness checklist or a clear not-ready decision.',
    },
    knowledgeCheck: {
      prompt: 'A pack is complete but includes an unsupported "clear title" statement. Is it ready?',
      options: ['Yes, because all files are present.', 'No; remove or qualify the claim and route title review appropriately.', 'Yes, if the seller believes it.'],
      correctOption: 1,
      explanation: 'File completeness does not justify a professional conclusion that the evidence has not established.',
    },
    referenceIds: ['dolr-registration-faq', 'ap-registration', 'dpdp-act', 'dpdp-rules'],
  }),

  'survey-brief': defineLesson('survey-brief', {
    overview: 'A survey assignment should begin with a written question, parcel identity, permitted scope, expected outputs, and escalation rules.',
    objectives: ['Translate a request into a field brief.', 'Identify missing prerequisites.', 'Define evidence and handoff standards.'],
    sections: [
      { heading: 'Identify the decision', body: 'Ask what the client or reviewer needs to decide and what a field visit can realistically establish. A boundary retracement, feature capture, and general site observation are different assignments.' },
      { heading: 'Validate inputs', body: 'Check parcel identifiers, available plans, control information, contact details, access permission, known disputes, expected coordinate reference, and equipment needs before scheduling.' },
      { heading: 'Define the output', body: 'Specify required notes, measurements, coordinate metadata, photographs, sketches, raw files, review format, and limitations. Name the reviewer who can accept or reject the package.' },
    ],
    practice: {
      title: 'Rewrite a vague survey request',
      steps: ['State the decision question.', 'List required inputs and exclusions.', 'Define outputs, reviewer, and stop conditions.'],
      deliverable: 'A field brief with no implied authority beyond the assignment.',
    },
    knowledgeCheck: {
      prompt: 'A request says only "measure my land." What should happen first?',
      options: ['Travel immediately and estimate the area.', 'Clarify parcel, purpose, authority, scope, evidence, and reviewer.', 'Promise a legal boundary certificate.'],
      correctOption: 1,
      explanation: 'A precise brief protects the client, field worker, and reviewer from an ambiguous or unauthorised assignment.',
    },
  }),
  'survey-safety': defineLesson('survey-safety', {
    overview: 'Field quality begins with consent and safety. No measurement is worth entering without authority or continuing through an unsafe or hostile situation.',
    objectives: ['Verify access consent.', 'Complete a dynamic risk check.', 'Use clear stop and incident rules.'],
    sections: [
      { heading: 'Confirm authority and consent', body: 'Record who requested the work, who granted access, the allowed area and time, and any occupants or neighbours who need notice. Permission to inspect one parcel does not authorise entry elsewhere.' },
      { heading: 'Assess changing conditions', body: 'Check traffic, animals, weather, terrain, electrical hazards, vegetation, water, machinery, visibility, and interpersonal conflict. Reassess when conditions change.' },
      { heading: 'Stop and communicate', body: 'Pause for disputed access, threats, injury, unsafe weather, unknown hazardous areas, or a scope change. Notify the assignment owner and document facts without escalating confrontation.' },
    ],
    practice: {
      title: 'Prepare a field safety card',
      steps: ['List site-specific hazards and controls.', 'Write check-in and emergency contacts.', 'Define three immediate stop conditions.'],
      deliverable: 'A pocket-ready safety and consent brief reviewed before departure.',
    },
    knowledgeCheck: {
      prompt: 'A neighbour disputes access while the team is setting up. What should the field worker do?',
      options: ['Continue quickly before the dispute grows.', 'Pause, withdraw from conflict, record facts, and escalate.', 'Argue that the assignment proves access rights.'],
      correctOption: 1,
      explanation: 'The field worker should not decide the dispute or create a safety incident.',
    },
  }),
  'survey-capture': defineLesson('survey-capture', {
    overview: 'Reviewable survey evidence connects each observation to equipment, settings, control, time, and field notes instead of leaving isolated numbers.',
    objectives: ['Use a repeatable capture sequence.', 'Record measurement provenance.', 'Preserve raw observations and uncertainty.'],
    sections: [
      { heading: 'Establish and record setup', body: 'Log equipment identity, calibration or check status, coordinate reference, control source, station setup, environmental conditions, and team members before collecting parcel observations.' },
      { heading: 'Capture features systematically', body: 'Use stable point identifiers and connect corners, markers, occupation features, access, structures, and relevant terrain to notes and photographs. Repeat critical observations when the method requires it.' },
      { heading: 'Protect the raw trail', body: 'Preserve raw files, field-book entries, corrections, failed observations, and export settings. Never replace an inconvenient result without retaining and explaining the original.' },
    ],
    practice: {
      title: 'Run a controlled capture exercise',
      steps: ['Record setup and control metadata.', 'Capture a small feature set with stable point IDs.', 'Export data and link each point to a note or photo.'],
      deliverable: 'A raw and processed capture bundle with a visible chain between observations.',
    },
    knowledgeCheck: {
      prompt: 'Why keep a failed or repeated observation?',
      options: ['To make the package longer.', 'To preserve the decision trail and help reviewers understand quality.', 'It should always be deleted.'],
      correctOption: 1,
      explanation: 'Reviewers need the original evidence and the reason a measurement was repeated or excluded.',
    },
  }),
  'survey-pack': defineLesson('survey-pack', {
    overview: 'A strong review package lets another qualified person reproduce the logic, identify limits, and request corrections without returning to the field unnecessarily.',
    objectives: ['Organise a survey evidence package.', 'Document processing and quality checks.', 'Write limitations clearly.'],
    sections: [
      { heading: 'Use a predictable structure', body: 'Include assignment brief, consent and safety record, equipment and control notes, field book, raw data, processed outputs, sketches, photos, issue log, and a manifest with hashes or version identifiers where available.' },
      { heading: 'Explain processing', body: 'Record software, coordinate system, transformations, adjustments, exclusions, and quality thresholds. A clean drawing without processing notes is difficult to audit.' },
      { heading: 'State limits and open questions', body: 'Describe obstructed areas, weak control, missing monuments, conflicting occupation, weather effects, or scope exclusions. Route legal significance and final certification to the authorised professional.' },
    ],
    practice: {
      title: 'Assemble a review package',
      steps: ['Place sample evidence in the standard folder order.', 'Write a processing and quality note.', 'Create an issue log with owner and status.'],
      deliverable: 'A versioned package that a reviewer can navigate from the manifest.',
    },
    knowledgeCheck: {
      prompt: 'What makes a processed plan reviewable?',
      options: ['Only its visual polish.', 'A traceable link to inputs, methods, checks, limits, and versions.', 'Removing all uncertainty notes.'],
      correctOption: 1,
      explanation: 'Reviewability comes from traceability and declared limits, not appearance alone.',
    },
  }),
  'survey-assess': defineLesson('survey-assess', {
    overview: 'The supervised assessment tests preparation, safe execution, traceability, and handoff. It does not grant statutory surveying authority.',
    objectives: ['Demonstrate the complete field workflow.', 'Respond to an evidence-quality challenge.', 'Accept reviewer feedback and correction.'],
    sections: [
      { heading: 'Assessment evidence', body: 'The assessor reviews the brief, consent, risk controls, setup, observation trail, package structure, and communication. Missing safety or provenance evidence can require reassessment even when measurements look plausible.' },
      { heading: 'Quality challenge', body: 'Learners must explain one discrepancy, identify what can and cannot be concluded, and choose whether to repeat, qualify, or escalate the observation.' },
      { heading: 'Credential boundary', body: 'A Pattadar learning record may evidence completion of this curriculum and human review. It is not a government licence, cadastral authority, or substitute for jurisdiction-specific professional registration.' },
    ],
    practice: {
      title: 'Prepare for assessor review',
      steps: ['Run the rubric against your package.', 'Choose one weak item and correct it transparently.', 'Prepare a five-minute method and limitations briefing.'],
      deliverable: 'An assessor-ready package plus a signed learner declaration of scope.',
    },
    knowledgeCheck: {
      prompt: 'What does successful course assessment prove?',
      options: ['Automatic legal authority to certify boundaries.', 'Completion of the published learning and review requirements only.', 'Ownership of the surveyed parcel.'],
      correctOption: 1,
      explanation: 'Professional or statutory authority depends on jurisdiction and cannot be created by this course.',
    },
  }),

  'writer-intake': defineLesson('writer-intake', {
    overview: 'A complete intake records the client, authority, purpose, parties, property, requested document, source material, deadlines, and professional review needs.',
    objectives: ['Run a structured client intake.', 'Verify authority and identity proportionately.', 'Identify conflicts and missing inputs early.'],
    sections: [
      { heading: 'Understand the requested outcome', body: 'Ask what the client expects the document to do, who will rely on it, the jurisdiction, timing, and whether a lawyer or registering authority must review it. Do not start from a template name alone.' },
      { heading: 'Record parties and authority', body: 'Capture names exactly as supported, roles, contact channels, representation or power documents, and consent to process data. Do not infer authority from possession of a file.' },
      { heading: 'Open an issue list', body: 'Record missing facts, conflicts, unusual terms, language needs, accessibility needs, urgency, and review routing. Confirm the agreed scope and exclusions back to the client.' },
    ],
    practice: {
      title: 'Conduct a simulated intake',
      steps: ['Use a role-based intake form.', 'Read back the scope and uncertain facts.', 'Create the source and issue lists before drafting.'],
      deliverable: 'A consented intake record with explicit scope, exclusions, and reviewer.',
    },
    knowledgeCheck: {
      prompt: 'A client provides a relative\'s papers and asks for a transfer draft. What must be checked first?',
      options: ['Font and page margins.', 'Identity, authority, consent, purpose, and required professional review.', 'Whether the client wants it today.'],
      correctOption: 1,
      explanation: 'Possessing records does not itself establish authority to instruct or disclose.',
    },
  }),
  'writer-source': defineLesson('writer-source', {
    overview: 'Drafting stays trustworthy when verified source facts, client instructions, assumptions, and unresolved questions are kept distinct.',
    objectives: ['Build a fact-source matrix.', 'Label instructions and assumptions.', 'Prevent unsupported facts from entering a draft.'],
    sections: [
      { heading: 'Create four evidence lanes', body: 'Classify each item as source-supported fact, client statement, drafting instruction, or unresolved question. One sentence may contain more than one lane and should be split.' },
      { heading: 'Link facts to sources', body: 'For names, dates, amounts, parcel references, extents, and authority, record the exact source page or field. If sources conflict, preserve both and stop the affected clause.' },
      { heading: 'Control assumptions', body: 'Do not silently fill blank dates, expand initials, choose survey references, or translate legal effect. Use placeholders and questions until an authorised reviewer resolves them.' },
    ],
    practice: {
      title: 'Build a source matrix',
      steps: ['Extract ten proposed facts from a sample instruction.', 'Link each to evidence or label it as a statement.', 'Turn unsupported facts into clear questions.'],
      deliverable: 'A source matrix with no unlabeled assumption.',
    },
    knowledgeCheck: {
      prompt: 'The client states an extent that differs from the supplied record. What belongs in the draft?',
      options: ['The larger value.', 'A resolved value supported by review; until then, a placeholder and issue note.', 'Both values merged into one.'],
      correctOption: 1,
      explanation: 'Conflicting material facts must remain visible and unresolved until the proper reviewer decides.',
    },
  }),
  'writer-draft': defineLesson('writer-draft', {
    overview: 'A first draft should express only the approved structure and supported facts, with controlled placeholders for everything still open.',
    objectives: ['Use an approved template safely.', 'Maintain clause and source traceability.', 'Produce a reviewable first draft.'],
    sections: [
      { heading: 'Choose the controlled starting point', body: 'Confirm template owner, jurisdiction, version, permitted use, and mandatory reviewer. Copying a previous client document can carry hidden facts, names, or outdated clauses.' },
      { heading: 'Draft from the source matrix', body: 'Populate parties, property descriptions, consideration, dates, schedules, and execution fields only from approved sources or instructions. Use unique placeholders that cannot be mistaken for final text.' },
      { heading: 'Run mechanical and meaning checks', body: 'Check defined terms, cross-references, repeated values, attachments, page numbering, names, dates, numerals and words, and formatting. Then compare every material clause with the intake scope.' },
    ],
    practice: {
      title: 'Prepare a controlled first draft',
      steps: ['Open the approved sample template.', 'Populate it from the source matrix.', 'Run the drafting checklist and export a watermarked review copy.'],
      deliverable: 'A versioned first draft, source matrix, and open-question log.',
    },
    knowledgeCheck: {
      prompt: 'What is the safest way to handle an unknown execution date?',
      options: ['Guess today\'s date.', 'Use a controlled placeholder and add it to the open-question log.', 'Delete the execution section.'],
      correctOption: 1,
      explanation: 'A visible placeholder protects the draft from an invented material fact.',
    },
  }),
  'writer-review': defineLesson('writer-review', {
    overview: 'Review is a governed handoff: the right person sees the right version, changes are traceable, and client approval is informed.',
    objectives: ['Route drafts to authorised reviewers.', 'Manage versions and comments.', 'Capture informed approval and delivery.'],
    sections: [
      { heading: 'Match reviewer to question', body: 'Send legal effect to a qualified legal professional, survey descriptions to the appropriate survey reviewer, language issues to a competent translator, and identity corrections to the responsible authority or client workflow.' },
      { heading: 'Control versions', body: 'Use a stable file name, version number, date, editor, change note, and status such as draft, under review, approved, or superseded. Never overwrite the final review trail.' },
      { heading: 'Confirm consent and handoff', body: 'Explain material changes and unresolved limits in accessible language. Capture approval, delivery recipient, delivery method, and retained records before closing the assignment.' },
    ],
    practice: {
      title: 'Run a review cycle',
      steps: ['Assign sample comments to the correct reviewer.', 'Apply changes with a version note.', 'Prepare an approval and delivery record.'],
      deliverable: 'A final-review package with draft history, decisions, and client approval.',
    },
    knowledgeCheck: {
      prompt: 'A reviewer sends changes by phone. What should the writer do?',
      options: ['Apply them with no record.', 'Document the instruction, confirm it with the reviewer, and preserve the new version.', 'Ignore all phone instructions.'],
      correctOption: 1,
      explanation: 'The change can be handled, but its source, confirmation, and resulting version must be traceable.',
    },
  }),
  'writer-assess': defineLesson('writer-assess', {
    overview: 'The drafting assessment measures intake quality, source discipline, drafting control, escalation, and review handoff using a simulated matter.',
    objectives: ['Complete a traceable draft workflow.', 'Identify issues outside the writer role.', 'Defend source and version decisions.'],
    sections: [
      { heading: 'Assessment package', body: 'Submit the intake, authority check, source matrix, issue log, first draft, reviewer routing, revised draft, approval record, and limitations note. Personal data should be fictional or safely redacted.' },
      { heading: 'Critical failures', body: 'Unsupported material facts, concealed conflicts, uncontrolled client data, false professional claims, missing approval, or ignoring a required reviewer are grounds for correction or reassessment.' },
      { heading: 'Scope of recognition', body: 'Successful completion may support a Pattadar learning or skill record after human review. It does not create legal-practice authority, registration rights, or government recognition.' },
    ],
    practice: {
      title: 'Complete the mock drafting matter',
      steps: ['Run intake and source classification.', 'Produce and revise the controlled draft.', 'Submit a short rationale for every escalation.'],
      deliverable: 'A complete simulated matter mapped to the published rubric.',
    },
    knowledgeCheck: {
      prompt: 'Which item best demonstrates safe drafting competence?',
      options: ['A polished final document with no source trail.', 'A traceable package showing sources, limits, review, versions, and approval.', 'The fastest completion time.'],
      correctOption: 1,
      explanation: 'Professional-quality drafting is judged by controlled process as well as the final document.',
    },
  }),

  'visit-consent': defineLesson('visit-consent', {
    overview: 'A site-photo assignment must define who authorised it, what may be captured, where the worker may stand, and how images will be used.',
    objectives: ['Confirm identity, scope, and access.', 'Protect people and sensitive details.', 'Set stop and contact rules.'],
    sections: [
      { heading: 'Confirm the assignment', body: 'Record requester, property reference, purpose, requested views, date window, delivery recipient, and whether location metadata is required. Clarify what is explicitly out of scope.' },
      { heading: 'Verify permission', body: 'Confirm access with the authorised person and note occupants, neighbours, tenants, security, or local contacts who may be affected. Do not enter locked, occupied, or disputed areas without clear permission.' },
      { heading: 'Protect privacy and safety', body: 'Avoid faces, children, vehicle numbers, house interiors, identity papers, security systems, and unrelated neighbouring property unless the assignment specifically requires and permits capture.' },
    ],
    practice: {
      title: 'Prepare a visit authorisation',
      steps: ['Write the purpose and exact capture scope.', 'List privacy exclusions.', 'Add check-in, stop, and escalation contacts.'],
      deliverable: 'A field-ready consent and scope record.',
    },
    knowledgeCheck: {
      prompt: 'The worker arrives and a tenant says no photos are allowed. What should happen?',
      options: ['Photograph from inside quickly.', 'Pause, avoid conflict, contact the assignment owner, and record the issue.', 'Tell the tenant the requester always has authority.'],
      correctOption: 1,
      explanation: 'A field worker should not resolve an access conflict or continue against an on-site objection.',
    },
  }),
  'visit-sequence': defineLesson('visit-sequence', {
    overview: 'A standard photo sequence makes a visit understandable to someone who was not present and reduces missed evidence.',
    objectives: ['Capture context before detail.', 'Link images to a shot list.', 'Write neutral captions and limitations.'],
    sections: [
      { heading: 'Orient the reviewer', body: 'Start with approach road, entrance, wide context, and a location confirmation method. Then move around the site in a declared direction so the sequence can be followed.' },
      { heading: 'Pair context and detail', body: 'For each marker, structure, damage, utility, drainage feature, or requested issue, take a wider locating view before a close view. Use a safe scale reference where useful and permitted.' },
      { heading: 'Close the sequence', body: 'Record final overview, departure or completion status, inaccessible areas, weather, lighting, device time, and any deviation from the plan. Do not use filters that obscure evidence.' },
    ],
    practice: {
      title: 'Create a shot sequence',
      steps: ['Draft a 12-image route for a sample parcel.', 'Pair every detail with a context image.', 'Write a factual caption and file ID for each shot.'],
      deliverable: 'An ordered shot list with purpose, position, and caption fields.',
    },
    knowledgeCheck: {
      prompt: 'Why take a wide image before a close-up?',
      options: ['To use more storage.', 'To show where the detail sits in the site context.', 'Because close-ups are never useful.'],
      correctOption: 1,
      explanation: 'Context lets a remote reviewer locate and interpret the detail.',
    },
  }),
  'visit-field': defineLesson('visit-field', {
    overview: 'The practice visit combines consent, safety, capture sequence, file discipline, and communication in a supervised low-risk setting.',
    objectives: ['Execute the planned visit safely.', 'Maintain a live evidence log.', 'Deliver an auditable package.'],
    sections: [
      { heading: 'Check in and orient', body: 'Confirm arrival, contact, permission, weather, device time, location method, battery, storage, and changed conditions before the first capture.' },
      { heading: 'Capture and log together', body: 'Use stable image IDs and record direction, subject, observation, and requested issue while still on site. Avoid relying on memory after departure.' },
      { heading: 'Handoff without alteration', body: 'Preserve original files and metadata, create working copies only when needed, and provide a manifest. Cropping or annotation should be disclosed and never replace the original.' },
    ],
    practice: {
      title: 'Complete the supervised visit',
      steps: ['Run arrival and safety checks.', 'Follow the approved shot list and log deviations.', 'Upload originals, manifest, captions, and limitations.'],
      deliverable: 'A complete practice-visit package approved by the supervisor.',
    },
    knowledgeCheck: {
      prompt: 'A photo is dark but still readable. What should the worker do on site?',
      options: ['Delete it and hide the issue.', 'Retake it if safe, retaining the original and recording the replacement.', 'Brighten it heavily and discard the original.'],
      correctOption: 1,
      explanation: 'Retaining the trail while improving capture quality keeps the evidence honest.',
    },
  }),
  'visit-review': defineLesson('visit-review', {
    overview: 'Evidence review checks completeness, context, integrity, privacy, and whether the visit answered the assignment without overstating conclusions.',
    objectives: ['Review a package against scope.', 'Identify evidence and privacy defects.', 'Return actionable corrections.'],
    sections: [
      { heading: 'Reconcile scope and manifest', body: 'Confirm that every requested view is present or has an explained limitation, file IDs match captions, originals are available, and timestamps follow the visit sequence.' },
      { heading: 'Check usefulness and integrity', body: 'Look for orientation, focus, readable detail, context pairs, duplicated or missing files, unexplained edits, and metadata anomalies. Ask for clarification instead of inventing location or meaning.' },
      { heading: 'Check privacy and language', body: 'Identify unnecessary people, identifiers, interiors, or neighbouring details. Ensure captions state observations rather than ownership, boundary, defect, or legal conclusions.' },
    ],
    practice: {
      title: 'Audit a sample evidence pack',
      steps: ['Reconcile the shot list and files.', 'Record quality, integrity, and privacy defects.', 'Issue a pass, correction, or re-visit decision with reasons.'],
      deliverable: 'A completed quality rubric and correction note.',
    },
    knowledgeCheck: {
      prompt: 'A key close-up has no context image. What is the correct review result?',
      options: ['Assume its location from the caption.', 'Record the defect and request clarification or a safe re-capture if material.', 'Pass it because the image is sharp.'],
      correctOption: 1,
      explanation: 'Visual quality alone does not establish where the detail belongs.',
    },
  }),
};
