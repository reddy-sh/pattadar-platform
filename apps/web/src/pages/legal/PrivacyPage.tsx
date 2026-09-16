import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import Typography from '@mui/material/Typography';
import { LegalLayout } from './LegalLayout';

const sections = {
  en: [
    ['What you put in Pattadar', 'We process the account details, property records, document scans, photographs, family information and service requests that you choose to provide. Information about another person should be added only with their permission or other appropriate authority. If you act for a child, you must be their parent or authorised guardian.'],
    ['What the information is used for', 'Your information is used to organise your records, show your portfolio, read documents when requested, manage work requests and maintain the security and reliability of the service. You can record and change your processing choices in your account settings. A change does not undo a document already processed or a message already sent.'],
    ['Document reading and service messages', 'When you ask for an AI reading, the document is sent to the configured AI provider, currently Anthropic. This processing may occur outside India. Review the extracted fields before filing them. Service messages use the configured email, SMS or WhatsApp provider; a message marked as recorded or simulated has not been sent.'],
    ['Storage and access', 'Pattadar uses AWS for its cloud infrastructure and sign-in service. The infrastructure is configured for the Mumbai region. Access to your records is tied to your authenticated account. Security and operational logs help investigate failures and unauthorised access.'],
    ['Sharing with another person', 'Sharing creates access to the files and boundary information you select. Anyone with an active recipient link can use that access until it expires or you revoke it. Revocation prevents further access through Pattadar; it cannot recall copies someone has already downloaded.'],
    ['Your records and choices', 'You can correct records in the app, download an account export and file manifest, and request deletion from account settings. Deletion requires a recent sign-in and is processed in tracked stages across records, file versions, assistant data and the sign-in account. A request is complete only when the required stages succeed.'],
    ['Retention and deletion', 'Records remain available while you use the service until you delete them or request account deletion. Backups follow their configured retention and may retain earlier copies until they expire. Security or transaction records that need to be retained are handled separately from your active account. A deletion receipt reports the processing state.'],
    ['Questions and requests', 'Contact grievance@pattadar.com about access, correction, deletion, consent or a privacy concern. Include the request reference when one is available; do not email a password or a full identity-document number.'],
  ],
  te: [
    ['మీరు అందించే సమాచారం', 'మీరు అందించే ఖాతా వివరాలు, ఆస్తి రికార్డులు, పత్రాలు, ఫోటోలు, కుటుంబ సమాచారం, సేవా అభ్యర్థనలను పట్టాదార్ ఉపయోగిస్తుంది. మరొకరి సమాచారాన్ని వారి అనుమతితో లేదా తగిన అధికారంతో మాత్రమే జోడించండి. పిల్లల తరఫున వ్యవహరించడానికి తల్లిదండ్రి లేదా అధీకృత సంరక్షకుడు అయి ఉండాలి.'],
    ['సమాచారాన్ని ఎందుకు ఉపయోగిస్తాము', 'రికార్డులను క్రమబద్ధీకరించడానికి, ఆస్తులను చూపడానికి, మీరు కోరిన పత్రాలను చదవడానికి, సేవా పనులను నిర్వహించడానికి, ఖాతా భద్రత కోసం సమాచారాన్ని ఉపయోగిస్తాము. ఖాతా సెట్టింగుల్లో మీ ఎంపికలను నమోదు చేయవచ్చు, మార్చవచ్చు. ఇప్పటికే చదివిన పత్రాన్ని లేదా పంపిన సందేశాన్ని ఈ మార్పు వెనక్కి తీసుకురాదు.'],
    ['పత్రాలు చదవడం, సేవా సందేశాలు', 'మీరు AI పఠనాన్ని కోరినప్పుడు పత్రం అమర్చిన AI సేవకు పంపబడుతుంది; ప్రస్తుతం అది Anthropic. ఈ ప్రక్రియ భారతదేశం వెలుపల జరగవచ్చు. ఫలితాలను రికార్డులో చేర్చే ముందు పరిశీలించండి. సేవా సందేశాలు అమర్చిన ఈమెయిల్, SMS లేదా WhatsApp సేవ ద్వారా వెళ్తాయి. నమూనా లేదా నమోదు చేసిన సందేశం పంపబడినట్లు కాదు.'],
    ['నిల్వ, ప్రవేశం', 'క్లౌడ్ నిల్వ, సైన్-ఇన్ కోసం పట్టాదార్ AWS ఉపయోగిస్తుంది. మౌలిక సదుపాయాలు ముంబై ప్రాంతానికి అమర్చబడ్డాయి. మీ రికార్డుల ప్రవేశం ధృవీకరించిన ఖాతాతో అనుసంధానించబడుతుంది. లోపాలు, అనధికార ప్రవేశాన్ని పరిశీలించడానికి భద్రతా నమోదులు ఉపయోగపడతాయి.'],
    ['ఇతరులతో పంచుకోవడం', 'మీరు ఎంచుకున్న పత్రాలు, హద్దుల సమాచారానికే లింక్ ప్రవేశం ఇస్తుంది. క్రియాశీల లింక్ ఉన్నవారు గడువు ముగిసే వరకు లేదా మీరు రద్దు చేసే వరకు ఉపయోగించవచ్చు. రద్దు చేసినా వారు ఇప్పటికే డౌన్‌లోడ్ చేసిన ప్రతులను వెనక్కి తీసుకోలేము.'],
    ['మీ రికార్డులు, ఎంపికలు', 'యాప్‌లో రికార్డులను సరిచేయవచ్చు. ఖాతా సమాచారం, ఫైళ్ల జాబితాను డౌన్‌లోడ్ చేయవచ్చు. ఖాతా తొలగింపును అభ్యర్థించవచ్చు. ఇటీవల సైన్-ఇన్ చేసి ఉండాలి. రికార్డులు, ఫైల్ సంస్కరణలు, సహాయకుడి సమాచారం, సైన్-ఇన్ ఖాతా దశలవారీగా తొలగించబడతాయి. అవసరమైన దశలన్నీ విజయవంతమైతేనే అభ్యర్థన పూర్తవుతుంది.'],
    ['నిల్వ కాలం, తొలగింపు', 'మీరు తొలగించే వరకు లేదా ఖాతా తొలగింపును కోరే వరకు రికార్డులు అందుబాటులో ఉంటాయి. బ్యాకప్ ప్రతులు అమర్చిన నిల్వ కాలం ముగిసే వరకు ఉండవచ్చు. నిలుపుకోవాల్సిన భద్రతా లేదా లావాదేవీ నమోదులు క్రియాశీల ఖాతా నుండి వేరుగా నిర్వహించబడతాయి. అభ్యర్థన రసీదులో స్థితిని చూడవచ్చు.'],
    ['సందేహాలు, అభ్యర్థనలు', 'ప్రవేశం, సవరణ, తొలగింపు, సమ్మతి లేదా గోప్యత సమస్యల కోసం grievance@pattadar.com కు రాయండి. అభ్యర్థన సంఖ్య ఉంటే చేర్చండి. పాస్‌వర్డ్ లేదా పూర్తి గుర్తింపు పత్ర సంఖ్యను ఈమెయిల్ చేయవద్దు.'],
  ],
};
export function PrivacyPage() {
  const [lang,setLang]=useState<'en'|'te'>('en');
  return <LegalLayout>
    <Typography variant="h4" component="h1">{lang==='en'?'Privacy notice':'గోప్యతా ప్రకటన'}</Typography>
    <p>12/09/2026 · <button onClick={()=>setLang(lang==='en'?'te':'en')}>{lang==='en'?'తెలుగులో చదవండి':'Read in English'}</button></p>
    <div lang={lang}>{sections[lang].map(([title,text])=><section key={title} style={{marginBlock:'1.5rem'}}><Typography component="h2" variant="h6">{title}</Typography><Typography>{text}</Typography></section>)}</div>
    <RouterLink to="/app/account">{lang==='en'?'Manage my data and choices':'నా సమాచారం, ఎంపికలు'}</RouterLink>
  </LegalLayout>;
}
