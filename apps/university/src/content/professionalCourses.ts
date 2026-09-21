import type { LessonContent } from '../domain/types';
import { defineLesson } from './defineLesson';

export const professionalCourseLessons: Record<string, LessonContent> = {
  'dev-site': defineLesson('dev-site', {
    overview: 'Development planning starts by reading the whole site: parcel context, terrain, water, access, neighbours, existing use, and the regulatory questions that still need professional answers.',
    objectives: ['Create a site-context baseline.', 'Separate observation from technical conclusion.', 'Identify regulated dependencies early.', 'Choose the correct AP checklist for the property type.'],
    sections: [
      { heading: 'Read beyond the parcel outline', body: 'Record surrounding roads, drainage paths, slopes, low points, adjoining use, vegetation, structures, utilities, occupation, and visible hazards. A development idea can fail because of conditions outside the proposed building area.' },
      { heading: 'Compare sources and field reality', body: 'Place maps, records, plans, imagery, and field observations side by side with dates and sources. Do not treat an online layer or old plan as a current boundary, approval, or engineering result.' },
      { heading: 'Open the dependency register', body: 'List questions requiring planning, survey, geotechnical, drainage, environmental, utility, access, fire, legal, or other qualified review. Assign an owner and decision date to each.' },
      { heading: 'Open the property-type record set', body: 'For a house, open plot, or commercial building, start with the registered title or lease chain and current EC, then add the applicable municipal mutation or assessment, property or vacant-land tax evidence, survey or approved layout, permissions, completion or occupancy record, RERA record, and operating approvals. Label conditional items instead of deleting them from the checklist.' },
    ],
    practice: {
      title: 'Prepare a site-context board',
      steps: ['Map observed site and surrounding features.', 'Add source dates and uncertainty labels.', 'Create the first professional dependency register.'],
      deliverable: 'A source-linked context board and unresolved-question register.',
    },
    knowledgeCheck: {
      prompt: 'An online map shows a road touching the parcel. What can be concluded?',
      options: ['Legal and physical access are guaranteed.', 'The road is a lead that needs current field, record, and professional verification.', 'No further access review is needed.'],
      correctOption: 1,
      explanation: 'Map appearance alone does not establish usable or lawful access.',
    },
    referenceIds: ['ap-registration', 'ap-gsws-services', 'ap-cdma-charter'],
  }),
  'dev-access': defineLesson('dev-access', {
    overview: 'Access, drainage, and utilities are connected systems. Readiness work identifies constraints and questions without pretending to replace engineering or authority approvals.',
    objectives: ['Document access conditions.', 'Trace likely water movement.', 'Build a utility evidence matrix.', 'Verify plot layout, land use, and project disclosures.'],
    sections: [
      { heading: 'Access is more than an entrance', body: 'Record road type, width observations, surface, gradients, turning constraints, gates, seasonal conditions, apparent rights, emergency access questions, and the authority or professional who must confirm requirements.' },
      { heading: 'Follow water through the site', body: 'Observe high and low areas, channels, culverts, ponding, erosion, neighbouring flows, and safe discharge questions during appropriate conditions. Do not design drainage from a dry-day visit alone.' },
      { heading: 'Verify utilities independently', body: 'For electricity, water, wastewater, telecom, and other services, record visible evidence, provider response, distance or capacity questions, connection cost status, and whether design approval is still required.' },
      { heading: 'Check plot and project controls', body: 'For an open plot, compare the final approved layout, proceedings, plot number, roads, open spaces, land-use or zoning position, conversion record where applicable, FMB or field sketch, and ground access. For plotted development, verify the AP RERA project and promoter disclosures when applicable. A brochure or broker-marked plan is not an approval.' },
    ],
    practice: {
      title: 'Build an infrastructure constraint matrix',
      steps: ['Create separate access, drainage, and utility rows.', 'Add observed evidence and source contacts.', 'Label each item as known, assumed, pending, or not feasible.'],
      deliverable: 'A constraint matrix with verification owner and next action for every assumption.',
    },
    knowledgeCheck: {
      prompt: 'A utility pole is visible beside the land. What does that prove?',
      options: ['The parcel has immediate connection capacity.', 'Only that infrastructure is visible; provider and design confirmation are still needed.', 'All utility costs are included.'],
      correctOption: 1,
      explanation: 'Visibility does not establish rights, capacity, route, approval, or cost.',
    },
    referenceIds: ['ap-dpms', 'ap-rera', 'ap-rera-rules', 'ap-bhunaksha', 'ap-survey-records'],
  }),
  'dev-plan': defineLesson('dev-plan', {
    overview: 'A readiness brief turns scattered observations into a decision document: goals, evidence, constraints, dependencies, options, estimates, and next gates.',
    objectives: ['Structure a readiness brief.', 'Rank constraints and unknowns.', 'Define a staged decision path.', 'Reconcile permission, sanctioned-plan, and occupancy evidence.'],
    sections: [
      { heading: 'State the proposed use and assumptions', body: 'Describe the intended use, scale, timing, budget range, access needs, service expectations, and known exclusions. Label each assumption so it can be tested rather than becoming an accidental promise.' },
      { heading: 'Rank constraints by decision impact', body: 'Separate fatal or stop conditions, major design constraints, cost or schedule risks, and routine follow-ups. Explain the evidence behind each rating and who can change it.' },
      { heading: 'Create decision gates', body: 'Sequence low-cost verification before irreversible spend: property and access review, survey, planning check, site investigations, concept design, utility responses, estimates, approvals, and procurement as applicable.' },
      { heading: 'Verify the approved building state', body: 'For residential or commercial construction, record the permission authority, permit and sanctioned-plan identifiers, approved use, setbacks, parking and built area where applicable, revisions, completion or occupancy certificate, and current municipal assessment. Compare the approved plan with available completion evidence and observations; route any deviation to the responsible authority and qualified professional.' },
    ],
    practice: {
      title: 'Write a development-readiness brief',
      steps: ['Summarise goal, site, evidence, and assumptions.', 'Rank constraints and professional dependencies.', 'Build staged go, hold, or stop decision gates.'],
      deliverable: 'A concise readiness brief with source appendix and dependency owners.',
    },
    knowledgeCheck: {
      prompt: 'Which item should be resolved earliest?',
      options: ['A low-cost fatal access uncertainty before detailed design.', 'Final landscaping colours.', 'Marketing copy for the finished site.'],
      correctOption: 0,
      explanation: 'Early gates should test conditions that could stop or fundamentally change the project.',
    },
    referenceIds: ['ap-dpms', 'ap-cdma-charter', 'ap-rera-rules'],
  }),
  'dev-review': defineLesson('dev-review', {
    overview: 'The routing assessment tests whether each question goes to an appropriately qualified professional or authority with enough context to answer it.',
    objectives: ['Match questions to reviewers.', 'Prepare complete referral packs.', 'Avoid unlicensed technical conclusions.', 'Route conditional use and operating approvals.'],
    sections: [
      { heading: 'Route the question, not just the project', body: 'Boundary, title, planning, structural, geotechnical, drainage, environmental, utility, valuation, and construction questions may need different professionals. One adviser should not be assumed to cover every domain.' },
      { heading: 'Give reviewers usable inputs', body: 'Include the decision question, site identity, current evidence, constraints, assumptions, deadline, desired output, and how their answer will be used. Preserve their stated limitations.' },
      { heading: 'Integrate without overruling', body: 'Track whether professional outputs agree, conflict, depend on later work, or change the project. Return conflicts to the responsible reviewers rather than choosing the most convenient answer.' },
      { heading: 'Route use-specific approvals', body: 'For commercial premises, identify whether the proposed activity triggers a trade licence or fire, pollution, lift, airport, environment, or other no-objection approval. Record the triggering fact, competent authority, application or certificate, validity, conditions, and renewal owner. Also verify AP RERA project disclosures when the development is within scope.' },
    ],
    practice: {
      title: 'Route a mixed-risk scenario',
      steps: ['Extract ten questions from a sample proposal.', 'Assign each to a role or authority with rationale.', 'Prepare one complete referral brief.'],
      deliverable: 'A routing matrix and referral pack suitable for reviewer acceptance.',
    },
    knowledgeCheck: {
      prompt: 'A drainage consultant and planning adviser give conflicting constraints. What should the coordinator do?',
      options: ['Choose the cheaper interpretation.', 'Document the conflict and return it to the relevant reviewers for resolution.', 'Delete one report.'],
      correctOption: 1,
      explanation: 'The coordinator maintains the decision trail but does not invent authority to resolve specialist conflicts.',
    },
    referenceIds: ['ap-cdma-charter', 'ap-dpms', 'ap-rera', 'ap-rera-rules'],
  }),

  'legal-scope': defineLesson('legal-scope', {
    overview: 'A property review begins with jurisdiction, client, purpose, questions, reliance, deadline, fee, exclusions, and professional authority stated in writing.',
    objectives: ['Define a review engagement.', 'Set reliance and communication limits.', 'Separate education and operations from legal advice.'],
    sections: [
      { heading: 'Identify client and decision', body: 'Confirm who the client is, who may instruct, the property or transaction, the exact decisions to support, relevant jurisdiction, and any other people who expect to rely on the work.' },
      { heading: 'Set scope and exclusions', body: 'List records and issues included, searches or inspections excluded, assumptions, cut-off date, delivery format, reviewer qualification, and what requires separate survey, tax, planning, engineering, or litigation advice.' },
      { heading: 'Control reliance and change', body: 'State intended recipient and purpose, confidentiality, distribution, update limits, and how new facts or expanded questions change timing, fee, conflicts review, and acceptance.' },
    ],
    practice: {
      title: 'Draft a review scope',
      steps: ['Write the client, matter, questions, and jurisdiction.', 'List evidence, exclusions, reliance, and cut-off.', 'Add change-control and escalation steps.'],
      deliverable: 'A review scope ready for qualified professional approval.',
    },
    knowledgeCheck: {
      prompt: 'A learner is asked whether a client should proceed with a disputed purchase. What is appropriate?',
      options: ['Give a final legal recommendation.', 'Explain the learning workflow and refer the live matter to a qualified legal professional.', 'Decide based on the sale price.'],
      correctOption: 1,
      explanation: 'Educational material and operational support must not be presented as personalised legal advice.',
    },
  }),
  'legal-conflict': defineLesson('legal-conflict', {
    overview: 'Identity and conflicts controls protect confidentiality, independence, and trust before substantive records are reviewed.',
    objectives: ['Capture conflict-search identities.', 'Evaluate authority and adverse relationships.', 'Escalate potential conflicts safely.'],
    sections: [
      { heading: 'Build the search set', body: 'Collect current and prior names, entities, representatives, family or business relationships where relevant, property identifiers, counterparties, lenders, agents, and materially connected matters.' },
      { heading: 'Protect confidentiality during checking', body: 'Use the minimum information needed in controlled systems and do not reveal one client or matter while checking another. A potential match should go to the authorised conflicts reviewer.' },
      { heading: 'Resolve before review', body: 'Record clear, potential, and unresolved results; evaluate consent or information-barrier rules only through the responsible professional process; and do not begin substantive work until acceptance is documented.' },
    ],
    practice: {
      title: 'Run a simulated conflict check',
      steps: ['Create the identity search set.', 'Evaluate exact and possible matches.', 'Write the hold, escalate, or accept record.'],
      deliverable: 'A confidential conflicts result with reviewer decision and timestamp.',
    },
    knowledgeCheck: {
      prompt: 'A possible name match appears in a prior adverse matter. What happens next?',
      options: ['Ignore it because names can repeat.', 'Pause substantive work and send the match to the authorised conflicts reviewer.', 'Tell the new client details of the prior matter.'],
      correctOption: 1,
      explanation: 'Potential matches require confidential professional resolution before the matter proceeds.',
    },
  }),
  'legal-review': defineLesson('legal-review', {
    overview: 'A record review trail connects every material proposition to a source, date, search, question, and reviewer decision.',
    objectives: ['Create a chronology and source map.', 'Test consistency across records.', 'Preserve unresolved issues and search limits.'],
    sections: [
      { heading: 'Build chronology and property identity', body: 'Extract instruments, parties, authority, dates, registration references, survey identifiers, extents, boundaries, interests, releases, and later changes. Keep original wording and source locations.' },
      { heading: 'Compare independent evidence', body: 'Reconcile title instruments, revenue or tax records, encumbrance searches, authority documents, survey evidence, court or notice material where in scope, and client statements. Do not treat absence in one source as proof of absence.' },
      { heading: 'Record the search boundary', body: 'Note databases, offices, periods, names, property references, dates, unavailable sources, and reliance limits. A reviewer must be able to tell what was and was not checked.' },
    ],
    practice: {
      title: 'Build a review trail',
      steps: ['Create the event chronology.', 'Link each material statement to a source.', 'Open issue entries for conflicts and search limits.'],
      deliverable: 'A chronology, source map, and issue log that another reviewer can audit.',
    },
    knowledgeCheck: {
      prompt: 'An encumbrance search shows no result for the searched period. What should the note say?',
      options: ['The property has no possible interests.', 'No result was found for the stated search parameters and date; limits remain.', 'Title is guaranteed.'],
      correctOption: 1,
      explanation: 'The conclusion must stay within the actual source, period, identifiers, and search limitations.',
    },
  }),
  'legal-write': defineLesson('legal-write', {
    overview: 'A useful review note separates instructions, facts, source-backed findings, unresolved issues, assumptions, limitations, and referrals in language the intended reader can understand.',
    objectives: ['Structure findings transparently.', 'Calibrate language to evidence.', 'Write actionable referrals and limits.'],
    sections: [
      { heading: 'Separate the layers', body: 'Use distinct sections for scope, documents reviewed, factual background, findings, open questions, risk implications, next actions, exclusions, and reliance. Readers should not confuse a client statement with a verified finding.' },
      { heading: 'Use calibrated language', body: 'Match certainty to evidence with phrases such as records reviewed indicate, could not be verified, appears inconsistent, or requires confirmation. Avoid guarantees and unexplained legal shorthand.' },
      { heading: 'Make referrals actionable', body: 'State the question, why it matters, the evidence to send, the appropriate professional or authority, and whether the matter should pause pending an answer.' },
    ],
    practice: {
      title: 'Write a limited findings note',
      steps: ['Draft findings from a sample source map.', 'Add limits and open questions.', 'Write three specific referrals with decision impact.'],
      deliverable: 'A plain-language findings note ready for professional review.',
    },
    knowledgeCheck: {
      prompt: 'Which phrase best reflects an incomplete source set?',
      options: ['Ownership is unquestionably clear.', 'Based on the listed records through the cut-off date, the issue remains unverified.', 'There can be no dispute.'],
      correctOption: 1,
      explanation: 'The wording connects the conclusion to its evidence and limits.',
    },
  }),
  'legal-assess': defineLesson('legal-assess', {
    overview: 'The supervised assessment tests governed review operations and professional boundaries using a fictional file. It does not authorise legal practice.',
    objectives: ['Complete a controlled review package.', 'Explain conflicts, sources, and referrals.', 'Demonstrate confidentiality and scope discipline.'],
    sections: [
      { heading: 'Required package', body: 'Submit engagement scope, identity and conflicts record, source manifest, chronology, review trail, issue log, draft findings, referral plan, version history, and a self-review against the rubric.' },
      { heading: 'Human assessment', body: 'An authorised reviewer evaluates material accuracy, source traceability, confidentiality, issue spotting, calibrated language, escalation, and whether the learner stayed within the assigned role.' },
      { heading: 'Recognition boundary', body: 'Completion can support an internal or Pattadar learning record after review. It is not a bar admission, advocate enrolment, legal licence, title opinion, or government credential.' },
    ],
    practice: {
      title: 'Complete the fictional matter',
      steps: ['Run scope and conflicts controls.', 'Build the review trail and findings note.', 'Defend two referrals in an assessor interview.'],
      deliverable: 'A fictional, privacy-safe review file mapped to every rubric criterion.',
    },
    knowledgeCheck: {
      prompt: 'What is the assessor primarily verifying?',
      options: ['That the learner can promise a transaction outcome.', 'That the learner can run the published workflow within professional boundaries.', 'That the learner owns property.'],
      correctOption: 1,
      explanation: 'The assessment covers process competence and boundaries, not statutory legal authority.',
    },
  }),

  'landscape-read': defineLesson('landscape-read', {
    overview: 'Routine site care starts by understanding access, apparent boundaries, slope, drainage, existing vegetation, neighbouring use, utilities, and visible hazards.',
    objectives: ['Complete a site-care baseline.', 'Protect boundaries and drainage.', 'Identify specialist or permission needs.'],
    sections: [
      { heading: 'Walk the site with permission', body: 'Confirm the work area and exclusions, then record access, gates, visible markers, fences, structures, slopes, channels, low spots, waste, vegetation, overhead or buried-service indicators, and neighbouring sensitivity.' },
      { heading: 'Do not alter uncertain boundaries', body: 'Fences, stones, hedges, and paths may not be legal boundaries. Keep machinery, planting, excavation, and waste placement away from disputed or unverified edges until the responsible owner or professional confirms them.' },
      { heading: 'Observe water before proposing work', body: 'Note where water enters, collects, flows, erodes, or leaves. Routine clearing can change drainage and affect neighbours, so material earthwork or drainage design requires appropriate review and permission.' },
    ],
    practice: {
      title: 'Create a site-care baseline',
      steps: ['Photograph and map access, markers, water, vegetation, and hazards.', 'Label uncertain or no-work areas.', 'List specialist and permission questions.'],
      deliverable: 'A dated baseline map and photo manifest before any work begins.',
    },
    knowledgeCheck: {
      prompt: 'A hedge appears to mark the property edge. Can a crew remove it?',
      options: ['Yes, because plants are temporary.', 'Not until authority, boundary, environmental, and scope questions are resolved.', 'Yes, if removal is faster.'],
      correctOption: 1,
      explanation: 'The hedge may have boundary, ownership, habitat, privacy, or drainage significance.',
    },
  }),
  'landscape-scope': defineLesson('landscape-scope', {
    overview: 'A good maintenance scope names tasks, quantities, standards, exclusions, risks, materials, evidence, timing, and change approval before work starts.',
    objectives: ['Define routine care precisely.', 'Separate specialist work.', 'Prepare transparent quantities and assumptions.'],
    sections: [
      { heading: 'Describe measurable work', body: 'State areas, frequencies, target heights or condition, debris handling, access hours, equipment limits, protected zones, and before-and-after evidence. Avoid vague promises such as "clean everything."' },
      { heading: 'Identify specialist triggers', body: 'Escalate large or unstable trees, electrical proximity, chemical use, protected species, retaining structures, significant excavation, drainage redesign, contaminated waste, steep terrain, and work requiring permits.' },
      { heading: 'Price assumptions visibly', body: 'Record measured or estimated area, crew time, travel, disposal, materials, equipment, taxes, contingency, exclusions, and conditions that require a revised quote. Obtain approval before expanding scope.' },
    ],
    practice: {
      title: 'Write a routine-care scope',
      steps: ['Turn a vague request into measurable tasks.', 'Mark specialist exclusions and safety controls.', 'Create quantities, assumptions, and change rules.'],
      deliverable: 'A consent-ready scope and estimate with no hidden task.',
    },
    knowledgeCheck: {
      prompt: 'A customer asks a routine crew to cut a large tree near power lines. What is the right response?',
      options: ['Add it informally to the job.', 'Exclude and route it to appropriately qualified professionals and utility controls.', 'Proceed using a longer ladder.'],
      correctOption: 1,
      explanation: 'The task exceeds routine site care and carries severe safety and authority risks.',
    },
  }),
  'landscape-plan': defineLesson('landscape-plan', {
    overview: 'The site-care plan coordinates current condition, priorities, task schedule, people, materials, safeguards, evidence, and review points.',
    objectives: ['Build a staged care plan.', 'Protect soil, water, access, and neighbours.', 'Define completion evidence and maintenance review.'],
    sections: [
      { heading: 'Prioritise stabilisation and access', body: 'Address immediate safety, controlled access, waste risks, erosion, blocked drainage, and vegetation affecting visibility before cosmetic work, while respecting the approved scope and specialist boundaries.' },
      { heading: 'Plan by zone and season', body: 'Divide the site into practical zones and account for rain, heat, plant cycles, water availability, fire risk, noise, dust, and neighbouring use. Avoid a one-time intervention that creates a larger recurring problem.' },
      { heading: 'Define acceptance and monitoring', body: 'Specify photos, quantities, disposal records, customer walk-through, exceptions, follow-up dates, and indicators that should trigger specialist review or a change in plan.' },
    ],
    practice: {
      title: 'Prepare a 90-day care plan',
      steps: ['Set priorities by zone and risk.', 'Schedule tasks, controls, and resources.', 'Define evidence, acceptance, and monitoring dates.'],
      deliverable: 'A 90-day plan linked to the baseline and approved scope.',
    },
    knowledgeCheck: {
      prompt: 'What should come before cosmetic planting on an eroding site?',
      options: ['A colour palette.', 'Qualified assessment and safe stabilisation of access, water, and soil risks.', 'More decorative gravel.'],
      correctOption: 1,
      explanation: 'The plan should address conditions that threaten safety or cause further damage first.',
    },
  }),
  'landscape-check': defineLesson('landscape-check', {
    overview: 'The assessment tests whether the learner can recognise routine work, stop unsafe work, make appropriate referrals, and produce a transparent site-care plan.',
    objectives: ['Apply the routine-versus-specialist boundary.', 'Use a task risk assessment.', 'Prepare a safe referral and handoff.'],
    sections: [
      { heading: 'Apply stop conditions', body: 'Stop for disputed authority, unstable trees or structures, electrical danger, hazardous waste, aggressive animals, severe weather, uncontrolled fire or chemical risk, significant excavation, injury, or any condition beyond the approved method.' },
      { heading: 'Make a useful referral', body: 'State the observed condition, location, evidence, immediate control, question, urgency, and suggested competent role. Do not diagnose beyond training.' },
      { heading: 'Demonstrate controlled closure', body: 'Show completed tasks, exceptions, waste or material records, before-and-after evidence, incidents, customer acceptance, and follow-up recommendations without claiming guarantees.' },
    ],
    practice: {
      title: 'Assess a mixed site-care scenario',
      steps: ['Classify each task as routine, controlled, specialist, or stop.', 'Write controls and two referrals.', 'Prepare the completion handoff.'],
      deliverable: 'A scenario assessment with rationale, evidence, and escalation trail.',
    },
    knowledgeCheck: {
      prompt: 'What is evidence of good judgment in site care?',
      options: ['Completing every requested task regardless of risk.', 'Knowing when to pause, protect the site, and route work to a competent person.', 'Avoiding written records.'],
      correctOption: 1,
      explanation: 'Safe scope control is a core skill, not a failure to provide service.',
    },
  }),

  'help-scope': defineLesson('help-scope', {
    overview: 'An on-demand visit should not begin until task, location, consent, price, timing, evidence, privacy, safety, and cancellation terms are understood.',
    objectives: ['Turn a request into a bounded work order.', 'Confirm transparent price and consent.', 'Detect unsafe or regulated requests.'],
    sections: [
      { heading: 'Define the task', body: 'Record the customer, property, requested action, purpose, exact deliverable, access contact, time window, inclusions, exclusions, and what success looks like. Avoid an open-ended request to "handle everything."' },
      { heading: 'Confirm price before dispatch', body: 'Show base fee, travel, time or quantity assumptions, taxes, add-ons, cancellation, refund, and the rule for customer-approved changes. Do not pressure the user with hidden urgency charges.' },
      { heading: 'Screen the request', body: 'Reject or escalate trespass, surveillance, document removal, confrontation, legal representation, hazardous work, identity misuse, or any request lacking credible authority and consent.' },
    ],
    practice: {
      title: 'Convert a chat request into a work order',
      steps: ['Extract task, purpose, property, and authority.', 'Write deliverable, evidence, exclusions, and price.', 'Run safety, privacy, and regulated-work screening.'],
      deliverable: 'A customer-confirmed work order ready for dispatch or escalation.',
    },
    knowledgeCheck: {
      prompt: 'A user asks a worker to enter a locked site and photograph occupants. What should happen?',
      options: ['Accept if the fee is high enough.', 'Decline or pause and escalate because authority, privacy, access, and safety are unresolved.', 'Ask the worker to be discreet.'],
      correctOption: 1,
      explanation: 'On-demand convenience never overrides consent, law, privacy, or worker safety.',
    },
  }),
  'help-arrive': defineLesson('help-arrive', {
    overview: 'Arrival verification and predictable status messages build trust without exposing more location or personal data than the assignment needs.',
    objectives: ['Verify worker, place, and task.', 'Communicate milestone-based status.', 'Handle failed access and changes safely.'],
    sections: [
      { heading: 'Verify before work', body: 'Match assignment ID, worker identity, property reference, safe arrival point, customer or site contact, access permission, current conditions, and approved scope. Use a privacy-safe arrival proof.' },
      { heading: 'Use clear status milestones', body: 'Send accepted, travelling, arrived, access confirmed, work started, issue found, customer decision needed, work complete, and evidence delivered only when true. Include time and next expected update.' },
      { heading: 'Control changes and failed access', body: 'Do not start extra work or incur material costs without recorded approval. For failed access, wait only within policy, document attempts, leave safely, and apply published cancellation rules.' },
    ],
    practice: {
      title: 'Run a dispatch simulation',
      steps: ['Send concise milestone messages.', 'Complete arrival verification.', 'Respond to one access failure and one scope-change request.'],
      deliverable: 'A timestamped status and decision log for the simulated visit.',
    },
    knowledgeCheck: {
      prompt: 'The customer asks for extra work after arrival. What should the worker do?',
      options: ['Complete it and disclose the price later.', 'Pause, document scope and price change, and obtain approval before proceeding.', 'Ignore the customer.'],
      correctOption: 1,
      explanation: 'Recorded change approval protects the customer, worker, and service operator.',
    },
  }),
  'help-field': defineLesson('help-field', {
    overview: 'The supervised field visit tests service conduct, safety, evidence, privacy, status updates, and task completion under a real or controlled assignment.',
    objectives: ['Follow the accepted work order.', 'Capture proportionate evidence.', 'Escalate incidents and customer decisions.'],
    sections: [
      { heading: 'Work from the approved checklist', body: 'Confirm each task, use required protective controls, protect property, avoid neighbouring impact, and mark completion or exception in real time. Never improvise regulated work.' },
      { heading: 'Capture evidence with purpose', body: 'Collect only the photos, measurements, signatures, receipts, or notes defined in the work order. Preserve originals and do not expose unrelated people or sensitive information.' },
      { heading: 'Communicate decisions, not noise', body: 'Update the customer when progress changes, a decision is needed, a risk appears, or timing changes materially. Keep messages factual and route conflict or specialist questions to support.' },
    ],
    practice: {
      title: 'Complete a supervised assignment',
      steps: ['Run arrival and safety checks.', 'Execute the task checklist with evidence.', 'Close or escalate every exception before departure.'],
      deliverable: 'A completed work order, evidence manifest, status log, and supervisor review.',
    },
    knowledgeCheck: {
      prompt: 'A worker discovers damage unrelated to the assigned task. What is appropriate?',
      options: ['Repair it without permission.', 'Record proportionate evidence, protect against immediate danger if trained, and ask for a customer or support decision.', 'Hide it to avoid delay.'],
      correctOption: 1,
      explanation: 'The worker should preserve safety and evidence while staying within approved scope.',
    },
  }),
  'help-close': defineLesson('help-close', {
    overview: 'A service closes only when task result, evidence, exceptions, incidents, price, customer communication, and retention status are reconciled.',
    objectives: ['Reconcile work and evidence.', 'Report incidents without concealment.', 'Create a clear customer handoff.'],
    sections: [
      { heading: 'Reconcile the work order', body: 'Mark each task complete, incomplete, changed, cancelled, or not applicable with a reason. Match evidence and charges to the approved scope and identify any refund or follow-up.' },
      { heading: 'Report incidents promptly', body: 'Record injuries, threats, access disputes, property damage, privacy exposure, lost items, data issues, or near misses with facts, time, location, immediate action, witnesses, and escalation owner.' },
      { heading: 'Close with the customer', body: 'Provide a plain summary, evidence access, exceptions, amount, next steps, correction or complaint route, retention window, and a way to confirm receipt without forcing a positive rating.' },
    ],
    practice: {
      title: 'Close a visit with one exception',
      steps: ['Reconcile tasks, evidence, and charges.', 'Complete the incident or exception record.', 'Write the customer handoff and internal follow-up.'],
      deliverable: 'An auditable closure package with no orphan task or unexplained charge.',
    },
    knowledgeCheck: {
      prompt: 'When is a quick-help visit operationally complete?',
      options: ['When the worker leaves the site.', 'When scope, evidence, exceptions, price, communication, and follow-up are reconciled.', 'When a photo is uploaded.'],
      correctOption: 1,
      explanation: 'Physical departure is only one milestone in a governed service lifecycle.',
    },
  }),

  'gov-consent': defineLesson('gov-consent', {
    overview: 'Pattadar services should use personal and property data only for a stated, lawful, understood purpose with the minimum necessary access and a visible audit trail.',
    objectives: ['Capture meaningful consent or another approved basis.', 'Enforce purpose limitation.', 'Handle revocation and sensitive data safely.'],
    sections: [
      { heading: 'Make the purpose understandable', body: 'Tell the user what service is requested, which data and records are needed, who will receive them, why, for how long, what is optional, and how to ask questions or withdraw where applicable.' },
      { heading: 'Limit collection and use', body: 'Do not collect an entire identity or property file when a smaller field set will do. A new purpose, recipient, model use, marketing use, or external disclosure requires the appropriate new approval and controls.' },
      { heading: 'Respect change and revocation', body: 'Record consent version and time, stop future optional processing when consent is withdrawn, preserve only what policy or law requires, notify downstream owners, and explain unavoidable consequences without retaliation.' },
    ],
    practice: {
      title: 'Map consent through a service',
      steps: ['List each data element and purpose.', 'Identify viewer, retention, and disclosure controls.', 'Simulate revocation halfway through the workflow.'],
      deliverable: 'A purpose-and-consent map with revocation actions and audit events.',
    },
    knowledgeCheck: {
      prompt: 'Can records collected for a survey be reused to train an AI model automatically?',
      options: ['Yes, because Pattadar already has the files.', 'Only under an approved basis, clear purpose, governance controls, and any required user choice.', 'Yes, if names are hidden manually.'],
      correctOption: 1,
      explanation: 'Possession for one service does not automatically authorise a materially different use.',
    },
    referenceIds: ['dpdp-act', 'dpdp-rules'],
  }),
  'gov-price': defineLesson('gov-price', {
    overview: 'Pricing governance ensures the user sees eligibility, included work, fees, taxes, add-ons, changes, cancellation, refunds, and payment status before making a decision.',
    objectives: ['Present a complete price.', 'Apply entitlements consistently.', 'Control changes, refunds, and staff overrides.'],
    sections: [
      { heading: 'Show the total decision', body: 'Present base service, quantities or assumptions, travel, urgency, third-party charges, taxes, discount, entitlement, payable total, expiry, and what is not included before confirmation.' },
      { heading: 'Make entitlements auditable', body: 'Apply membership, employer, scholarship, government, staff, campaign, or hardship benefits through versioned rules with eligibility evidence, start and end dates, funding owner, and non-discrimination review.' },
      { heading: 'Govern overrides and refunds', body: 'Require reason, permission level, amount limits, approval, user notice, ledger entry, and reversal path for manual adjustments. Never alter a paid amount without traceability.' },
    ],
    practice: {
      title: 'Audit a service quote',
      steps: ['Recalculate price from the rule version.', 'Test entitlement evidence and expiry.', 'Simulate one approved change and one refund.'],
      deliverable: 'A quote-to-ledger audit showing every price decision.',
    },
    knowledgeCheck: {
      prompt: 'A worker discovers extra travel after acceptance. What is the governed response?',
      options: ['Add the charge silently.', 'Apply the published rule or obtain an approved change before charging.', 'Ask for cash off-platform.'],
      correctOption: 1,
      explanation: 'Users must be able to understand and approve material price changes under published controls.',
    },
  }),
  'gov-workforce': defineLesson('gov-workforce', {
    overview: 'A worker may receive only the assignments supported by their active role, discipline, identity, training, credentials, service area, and current review state. Eligibility must be evaluated before allocation, not after a complaint.',
    objectives: ['Apply certification-before-allocation by discipline.', 'Handle credential expiry, refusal, and incomplete evidence consistently.', 'Separate a member address from approved work coverage.'],
    sections: [
      { heading: 'Build eligibility from minimum verified data', body: 'A workforce record needs a stable member identity, role, active discipline, contact and service status, training state, relevant credentials, verification evidence, expiry where applicable, and review owner. Collect only the personal data needed for employment, safety, payment, compliance, and assignment decisions, with controlled access and retention.' },
      { heading: 'Evaluate each discipline independently', body: 'Certification or qualification for one discipline must not unlock another. An expired, refused, revoked, unverifiable, or incomplete credential blocks only the affected regulated or policy-controlled work unless a broader safety or conduct hold applies. Preserve the evidence, reviewer, decision, date, reason, and next review instead of replacing the prior state.' },
      { heading: 'Separate home address from work coverage', body: 'A member address supports identity, employment, tax, payment, or emergency workflows under purpose limits. Assignment coverage is a separately approved set of locations, travel limits, availability, skills, and safety constraints. Never infer that someone may work everywhere near their home, or expose a private address to a customer as a service-area label.' },
    ],
    practice: {
      title: 'Run an allocation eligibility review',
      steps: ['Review a fictional worker with two disciplines, one current credential, and one expired credential.', 'Apply assignment, data-access, and coverage decisions to three service requests.', 'Write the evidence, reason, reviewer, effective time, and remediation for each decision.'],
      deliverable: 'A discipline-specific eligibility decision that can be reproduced from the workforce record.',
    },
    knowledgeCheck: {
      prompt: 'A field worker has valid site-photo training but an expired survey credential. What should allocation do?',
      options: ['Block every kind of work permanently.', 'Allow only work supported by current eligibility and block the affected survey discipline until the required credential is restored.', 'Ignore expiry because the worker has another certificate.'],
      correctOption: 1,
      explanation: 'Eligibility is discipline-specific and current. A separate active skill does not cure an expired requirement for regulated or controlled survey work.',
    },
    referenceIds: ['dpdp-act', 'dpdp-rules'],
  }),
  'gov-training': defineLesson('gov-training', {
    overview: 'Pattadar training controls connect service quality signals to a documented hold, retraining, company clearance, and verifiable certificate history. These thresholds are company policy controls, not government licences.',
    objectives: ['Apply the published low-rating retraining hold without hidden exceptions.', 'Record clearance and certificate provenance as immutable decisions.', 'Explain why course completion does not replace a statutory or professional licence.'],
    sections: [
      { heading: 'Apply the quality trigger consistently', body: 'Under the current Admin policy, a member with at least 100 ratings and an average below 3.0 enters a retraining-required hold. Preserve rating count, average, calculation time, rule version, affected disciplines, decision owner, user communication, and appeal or correction route. Never alter ratings or silently waive the threshold to fill an assignment.' },
      { heading: 'Require retraining and explicit clearance', body: 'A hold is not removed merely because content was opened or a quiz was attempted. Record assigned curriculum, attempts, assessment evidence, assessor, result, remediation, and the authorised company clearance decision with effective time. Allocation should consume the cleared eligibility state, not infer it from a learner checkbox.' },
      { heading: 'Preserve certificate provenance and legal boundaries', body: 'A production certificate needs learner identity, course and content version, assessment rubric, attempts, evidence references, authorised reviewer, issuance ID, issue and expiry or renewal terms, status, and revocation history. A Pattadar training certificate proves only the published learning outcome; it never substitutes for a government licence, bar enrolment, statutory registration, or other professional authority.' },
    ],
    practice: {
      title: 'Resolve a retraining-hold scenario',
      steps: ['Calculate whether a fictional rating history meets the published trigger and record the rule version.', 'Build the retraining, assessment, appeal, and clearance evidence trail.', 'Issue a sample learning record whose scope and professional limitations are explicit.'],
      deliverable: 'An auditable hold-to-clearance timeline and reproducible certificate record.',
    },
    knowledgeCheck: {
      prompt: 'A member completes every retraining module after entering a quality hold. Can allocation resume automatically?',
      options: ['Yes, opening every page is sufficient.', 'Only after the required assessment evidence and authorised company clearance are recorded under the published policy.', 'Yes, and the course also grants any government licence needed.'],
      correctOption: 1,
      explanation: 'Completion and clearance are distinct governed events, and neither creates statutory professional authority.',
    },
    referenceIds: ['dpdp-act', 'dpdp-rules'],
  }),
  'gov-evidence': defineLesson('gov-evidence', {
    overview: 'An audit record should explain who did what, when, under which authority and rule, using which evidence, and what changed, without becoming an uncontrolled copy of sensitive data.',
    objectives: ['Design traceable service events.', 'Protect evidence integrity and access.', 'Apply retention and correction rules.'],
    sections: [
      { heading: 'Record meaningful events', body: 'Capture actor, role, service and request IDs, event type, timestamp, source, reason, rule or content version, previous and new state, evidence reference, and correlation or idempotency key.' },
      { heading: 'Protect integrity and confidentiality', body: 'Use append-oriented events, controlled corrections, access logging, encryption, secure evidence storage, checksums where appropriate, and separation between metadata and highly sensitive content.' },
      { heading: 'Retain by purpose', body: 'Apply documented retention and legal-hold rules by record class. Expiry should delete or irreversibly anonymise eligible data while preserving the minimum audit evidence policy requires.' },
    ],
    practice: {
      title: 'Design an audit trail',
      steps: ['Map events for a service from request to closure.', 'Classify metadata and evidence sensitivity.', 'Add correction, retention, and access-review flows.'],
      deliverable: 'An event schema and evidence-retention map reviewed for privacy and operations.',
    },
    knowledgeCheck: {
      prompt: 'How should an incorrect audit event be handled?',
      options: ['Delete it without trace.', 'Add a controlled correction linked to the original under policy.', 'Edit the database row anonymously.'],
      correctOption: 1,
      explanation: 'A linked correction preserves both integrity and an understandable current state.',
    },
    referenceIds: ['dpdp-act', 'dpdp-rules'],
  }),
  'gov-escalate': defineLesson('gov-escalate', {
    overview: 'Escalation governance routes safety, legal, privacy, security, quality, conduct, payment, and conflict issues to accountable people with service-level expectations.',
    objectives: ['Classify incidents and conflicts.', 'Protect users while preserving facts.', 'Track escalation ownership and resolution.'],
    sections: [
      { heading: 'Triage by impact and urgency', body: 'Assess immediate safety, rights, money, privacy, evidence integrity, service continuity, vulnerable users, recurrence, and regulatory duties. Apply the most protective interim action that is authorised and proportionate.' },
      { heading: 'Manage conflicts of interest', body: 'Require disclosure of personal, financial, family, referral, vendor, customer, or property interests. Restrict assignment, decision, data access, or payment where impartiality could reasonably be questioned.' },
      { heading: 'Own resolution and communication', body: 'Assign severity, owner, due time, required specialists, user-update cadence, evidence, decisions, remediation, review, and closure criteria. Never close because the issue has gone quiet.' },
    ],
    practice: {
      title: 'Run an escalation table-top',
      steps: ['Classify a mixed safety and privacy incident.', 'Choose interim controls and owners.', 'Draft user updates, resolution evidence, and closure review.'],
      deliverable: 'A complete escalation timeline with decisions and accountable owners.',
    },
    knowledgeCheck: {
      prompt: 'An assigned worker discovers they are related to the seller. What should happen?',
      options: ['Continue and disclose later.', 'Pause relevant access or decisions, disclose through the conflict process, and reassign or approve controls.', 'Ask the worker to stay neutral without a record.'],
      correctOption: 1,
      explanation: 'A disclosed and governed conflict protects all parties and the credibility of the service.',
    },
  }),
  'gov-assess': defineLesson('gov-assess', {
    overview: 'The governed-service assessment tests end-to-end operation: consent, entitlement, price, assignment, evidence, communication, escalation, closure, and audit review.',
    objectives: ['Operate a complete governed scenario.', 'Explain control and escalation choices.', 'Identify gaps before certification.'],
    sections: [
      { heading: 'Scenario and evidence', body: 'The learner receives a fictional request with changing scope, an entitlement, sensitive records, field evidence, a possible conflict, and an incident. Every decision must link to the applicable rule and audit event.' },
      { heading: 'Assessment gates', body: 'Critical gates include valid purpose, transparent price, appropriate worker assignment, least-privilege access, evidence integrity, timely safety and privacy escalation, correct closure, and no unsupported professional claim.' },
      { heading: 'Credential governance', body: 'Production recognition requires a published rubric, identity assurance, human reviewer, attempt record, appeals path, expiry or renewal policy, and verifiable server-issued credential. Preview completion is not certification.' },
    ],
    practice: {
      title: 'Complete the governed-service simulation',
      steps: ['Operate the request through each lifecycle state.', 'Resolve the conflict and incident using published controls.', 'Submit an audit narrative and corrective-action review.'],
      deliverable: 'A fully traceable fictional service file mapped to the assessment rubric.',
    },
    knowledgeCheck: {
      prompt: 'What is required before a production skill credential is issued?',
      options: ['Clicking every module checkbox.', 'Published criteria, verified assessment evidence, authorised human approval, and a verifiable issuance record.', 'Paying the course fee only.'],
      correctOption: 1,
      explanation: 'A trustworthy credential needs governed assessment and issuance, not self-reported completion alone.',
    },
    referenceIds: ['dpdp-act', 'dpdp-rules'],
  }),
};
