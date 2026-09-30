import { defineLesson } from './defineLesson';

export const telanganaCourseLessons = {
  'ts-records': defineLesson('ts-records', {
    overview: 'Build a Telangana property review from separate revenue, survey, registration, restriction, planning, and field evidence instead of treating one portal result as a complete title answer.',
    objectives: ['Identify the purpose of each record layer.', 'Create a source-and-date trail for every item.', 'Recognise conflicts that require an authority or qualified professional.'],
    sections: [
      { heading: 'Start with parcel identity', body: 'Record the district, division, mandal, village, survey and subdivision numbers, extent, holder names, and the date of every search. Small differences can identify a different parcel or an unresolved update.' },
      { heading: 'Keep evidence layers separate', body: 'ROR-1B, Pahani, ePPB, parcel maps, registered instruments, restriction information, tax records, planning approvals, and site observations answer different questions. Preserve each source rather than merging them into a single unsupported conclusion.' },
      { heading: 'Escalate material conflicts', body: 'A mismatch in holder, survey number, extent, classification, restriction status, or map requires the competent department or a qualified survey or legal professional. Learning material cannot determine title or a legal boundary.' },
    ],
    practice: { title: 'Create a Telangana record map', steps: ['List each available record and its issuing authority.', 'Add parcel identifiers, issue date, and certification status.', 'Mark every conflict and the person or authority that must resolve it.'], deliverable: 'A one-page evidence map with source links, dates, conflicts, and next actions.' },
    knowledgeCheck: { prompt: 'Bhu Bharati shows a matching holder and survey number. What is the safe conclusion?', options: ['The portal result is one current source to preserve and compare with the other evidence layers.', 'The property has guaranteed marketable title.', 'Survey and registration evidence are no longer needed.'], correctOption: 0, explanation: 'A current revenue result is important evidence, but it does not settle every title, boundary, restriction, planning, or transaction question.' },
    referenceIds: ['ts-bhu-bharati', 'ts-bhu-bharati-act', 'dolr-dilrmp'],
  }),
  'ts-ror': defineLesson('ts-ror', {
    overview: 'Read Telangana revenue records as dated administrative records, preserving their parcel context and limits.',
    objectives: ['Distinguish ROR-1B, Pahani, and ePPB.', 'Check holder, extent, classification, and remarks.', 'Avoid converting a revenue entry into an unsupported title opinion.'],
    sections: [
      { heading: 'ROR-1B and ePPB', body: 'Review the recorded pattadar or holder, shares, survey and subdivision, extent, land classification, acquisition mode, and remarks. An electronic passbook should be tied back to the current Record of Rights and its issue context.' },
      { heading: 'Pahani is period-specific', body: 'Pahani or Adangal-style information may record cultivation, possession, land use, and seasonal details. Preserve the record year and do not infer ownership from a cultivation entry alone.' },
      { heading: 'Compare before relying', body: 'Compare names, shares, survey references, extent, and classification with the registered instrument, mutation trail, survey map, and restriction information. Record differences exactly as found.' },
    ],
    practice: { title: 'Annotate a revenue-record set', steps: ['Transcribe the parcel and holder identifiers from each record.', 'Note the period, issue date, and source URL.', 'Create a discrepancy list without attempting an informal correction.'], deliverable: 'An annotated ROR-1B, Pahani, and ePPB comparison sheet.' },
    knowledgeCheck: { prompt: 'A Pahani names a cultivator who is not the person shown in ROR-1B. What should the learner do?', options: ['Replace the ROR-1B name.', 'Preserve both dated entries and investigate their legal and administrative context.', 'Treat the cultivator as the automatic owner.'], correctOption: 1, explanation: 'The records serve different purposes and periods. A material difference must remain visible until reviewed through the proper process.' },
    referenceIds: ['ts-bhu-bharati', 'ts-bhu-bharati-act', 'ts-bhu-bharati-rules'],
  }),
  'ts-bhubharati': defineLesson('ts-bhubharati', {
    overview: 'Use the current Bhu Bharati system carefully, keeping public information, applications, acknowledgements, orders, and final updated records distinct.',
    objectives: ['Use the current official entry point.', 'Preserve search and application evidence.', 'Distinguish submission from departmental completion.'],
    sections: [
      { heading: 'Use the current system', body: 'Bhu Bharati is Telangana\'s current integrated official entry point. Older screenshots, instructions, or portal names may describe superseded workflows and should not be presented as the current process without verification.' },
      { heading: 'Capture reproducible searches', body: 'Keep the official URL, date, location hierarchy, survey input, and result identifier. Label screenshots as screenshots and retain downloadable or certified outputs in their original form.' },
      { heading: 'Track the full workflow', body: 'Payment, eKYC, slot booking, acknowledgement, departmental review, and approval are separate events. A submitted application or transaction summary is not proof that the underlying record has changed.' },
    ],
    practice: { title: 'Document an official portal session', steps: ['Record the exact Bhu Bharati service used.', 'Save the inputs, acknowledgement, and transaction identifiers.', 'Define the final record or order that must be verified after processing.'], deliverable: 'A reproducible portal-session note with a clear completion test.' },
    knowledgeCheck: { prompt: 'A mutation application has an acknowledgement number. What does that prove?', options: ['That the new owner is already recorded.', 'That an application was received; the departmental decision and updated record still need verification.', 'That no registered instrument is needed.'], correctOption: 1, explanation: 'An acknowledgement proves a process step, not the final departmental outcome or resulting Record of Rights.' },
    referenceIds: ['ts-bhu-bharati', 'ts-bhu-bharati-rules', 'ts-state-services'],
  }),
  'ts-mutation': defineLesson('ts-mutation', {
    overview: 'Follow mutation, succession, and correction as controlled administrative workflows linked to evidence and a final updated record.',
    objectives: ['Choose the correct change workflow.', 'Keep the supporting basis and application trail linked.', 'Verify the order and resulting ROR-1B or ePPB.'],
    sections: [
      { heading: 'Classify the requested change', body: 'A registered transfer, succession, passbook correction, pending mutation, court-related entry, and appeal are not interchangeable requests. Use the service that matches the factual and legal basis.' },
      { heading: 'Preserve authority and evidence', body: 'Keep the registered deed, succession evidence, order, identity and authority records, application, payment, eKYC, notices, and departmental communications together. Do not alter source documents to make fields agree.' },
      { heading: 'Verify implementation', body: 'Completion means checking the issued order and the resulting current record. If the order and ROR-1B or ePPB differ, preserve both and use the notified correction or appeal channel.' },
    ],
    practice: { title: 'Build a mutation control sheet', steps: ['Name the change and its supporting basis.', 'List each official process milestone and evidence item.', 'Define the final fields to verify in the updated record.'], deliverable: 'A mutation tracker from source instrument through final record verification.' },
    knowledgeCheck: { prompt: 'A registered deed is complete but ROR-1B still shows the prior holder. What is the correct response?', options: ['Alter the ROR copy.', 'Use the applicable mutation workflow and verify the resulting update.', 'Assume registration and mutation are the same event.'], correctOption: 1, explanation: 'Registration and revenue-record updating are linked but distinct controlled processes.' },
    referenceIds: ['ts-bhu-bharati', 'ts-bhu-bharati-act', 'ts-bhu-bharati-rules', 'ts-state-services'],
  }),
  'ts-survey': defineLesson('ts-survey', {
    overview: 'Use the Bhu Bharati map and survey records to understand recorded parcel context without treating a screen line as field demarcation.',
    objectives: ['Search with the full administrative hierarchy.', 'Compare textual and spatial identifiers.', 'Know when an official survey or demarcation is required.'],
    sections: [
      { heading: 'Preserve the location hierarchy', body: 'Record district, division, mandal, village, survey number, and subdivision. Similar survey numbers in different villages or administrative units are not the same parcel.' },
      { heading: 'Read the map as one evidence layer', body: 'A parcel map or LPM can help locate recorded geometry and adjoining parcels. Check its identifiers, layer, scale or display context, and relation to the textual record.' },
      { heading: 'Do not demarcate from the screen', body: 'A digital line does not authorise moving a fence or settling a neighbour dispute. Use the competent survey process and qualified personnel when the ground boundary matters.' },
    ],
    practice: { title: 'Prepare a survey comparison', steps: ['Capture the full search hierarchy and parcel result.', 'Compare survey and subdivision references with ROR-1B and the deed.', 'List physical observations separately from mapped geometry.'], deliverable: 'A survey comparison that states what the map shows and what still requires field verification.' },
    knowledgeCheck: { prompt: 'The online parcel outline differs from the occupied fence. What should happen?', options: ['Move the fence to the online line.', 'Treat occupation as conclusive.', 'Preserve both observations and request the appropriate survey or demarcation review.'], correctOption: 2, explanation: 'The difference identifies a boundary question; neither a screen line nor a fence alone settles it.' },
    referenceIds: ['ts-bhu-bharati-gis', 'ts-bhu-bharati', 'dolr-dilrmp'],
  }),
  'ts-registration': defineLesson('ts-registration', {
    overview: 'Connect registration evidence to the same parcel identity while keeping registration, revenue mutation, and title review separate.',
    objectives: ['Review the registered instrument and transaction trail.', 'Use consistent property and party identifiers.', 'State the limits of registration and search results.'],
    sections: [
      { heading: 'Review the instrument', body: 'Check parties, authority, execution and registration dates, document and office details, consideration, schedule, boundaries, survey references, extent, and annexures. Preserve the certified source when required.' },
      { heading: 'Reconcile the property schedule', body: 'Compare the deed schedule with ROR-1B, map, mutation, restriction, tax, and planning records. A name or extent mismatch should be recorded, not silently normalised.' },
      { heading: 'Keep conclusions bounded', body: 'Registration records a document through the statutory process; it does not by itself prove every title, possession, boundary, restriction, or approval issue. Route legal conclusions to a qualified professional.' },
    ],
    practice: { title: 'Build a transaction chronology', steps: ['List registered instruments and dates in order.', 'Match each property schedule to current parcel identifiers.', 'Add linked mutation and unresolved review items.'], deliverable: 'A dated transaction chronology with source references and open questions.' },
    knowledgeCheck: { prompt: 'A registered instrument and current ROR-1B show different extents. What is the safe action?', options: ['Use the larger extent.', 'Document the mismatch and route it for official or qualified review.', 'Average the two figures.'], correctOption: 1, explanation: 'A material extent conflict must remain visible until the appropriate authority or professional resolves it.' },
    referenceIds: ['ts-bhu-bharati', 'ts-state-services', 'ngdrs-state-links', 'dolr-registration-faq'],
  }),
  'ts-restrictions': defineLesson('ts-restrictions', {
    overview: 'Treat restriction, land-use conversion, and grievance information as stop-or-escalate controls rather than fields to work around.',
    objectives: ['Check current prohibited-property information.', 'Separate NALA status from ownership records.', 'Use official grievance and appeal paths.'],
    sections: [
      { heading: 'Restrictions are a stop condition', body: 'A prohibited-property match, assigned-land issue, government claim, court flag, or other restriction requires confirmation through the competent authority and qualified review before a transaction proceeds.' },
      { heading: 'NALA answers a land-use question', body: 'NALA or non-agricultural conversion concerns authorised land use and related process. It does not replace the Record of Rights, registration evidence, planning permission, or building approval.' },
      { heading: 'Use the notified remedy', body: 'Bhu Bharati publishes grievance, correction, appeal, and revision workflows for specified matters. Preserve the disputed entry, application basis, acknowledgement, order, and final updated status.' },
    ],
    practice: { title: 'Prepare a restriction escalation note', steps: ['Capture the exact parcel and restriction result.', 'Identify the official correction, grievance, or appeal route.', 'State what work must pause and what evidence will confirm resolution.'], deliverable: 'A stop-and-escalate note with the official remedy and verification criteria.' },
    knowledgeCheck: { prompt: 'A survey number appears in prohibited-property information. What should the learner do?', options: ['Continue if the seller promises a correction.', 'Pause, preserve the match, and use the competent official and professional review process.', 'Change the survey number in the file.'], correctOption: 1, explanation: 'A restriction indicator must be resolved through lawful official channels, not ignored or edited around.' },
    referenceIds: ['ts-bhu-bharati', 'ts-bhu-bharati-act', 'ts-bhu-bharati-rules'],
  }),
  'ts-check': defineLesson('ts-check', {
    overview: 'Assemble a review-ready Telangana property file that makes evidence, dates, conflicts, and escalation decisions easy to inspect.',
    objectives: ['Test completeness without claiming certainty.', 'Make every source and unresolved issue traceable.', 'Route regulated conclusions to the right authority or professional.'],
    sections: [
      { heading: 'Completeness is not clearance', body: 'A complete file can still contain conflicts or restrictions. Readiness means the relevant evidence and missing decisions are visible, not that the University has certified title or boundary.' },
      { heading: 'Use a dated decision log', body: 'For each issue, record the source, fact observed, impact, owner, next action, due date, and outcome. Keep later records linked rather than overwriting the earlier state.' },
      { heading: 'State the boundary of the review', body: 'Separate education and administrative checking from legal opinion, statutory certification, valuation, engineering, planning approval, and boundary demarcation.' },
    ],
    practice: { title: 'Run the Telangana readiness review', steps: ['Check revenue, survey, registration, restriction, planning, tax, and field layers.', 'List missing records and unresolved differences.', 'Assign each issue to the competent authority or qualified reviewer.'], deliverable: 'A review pack with a clear ready, hold, or escalate status and supporting reasons.' },
    knowledgeCheck: { prompt: 'When is the file ready to move to the next decision?', options: ['When uncertainty has been removed from the summary.', 'When required evidence and unresolved issues are visible and routed to the correct reviewer.', 'When every file has the same spelling.'], correctOption: 1, explanation: 'A governed review makes uncertainty and responsibility explicit; it does not hide issues or create a professional conclusion.' },
    referenceIds: ['ts-bhu-bharati', 'ts-bhu-bharati-act', 'ts-bhu-bharati-gis', 'ts-state-services', 'dolr-registration-faq'],
  }),
};
