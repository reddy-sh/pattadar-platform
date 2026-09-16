import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import Typography from '@mui/material/Typography';
import { LegalLayout } from './LegalLayout';

const sections={
 en:[
  ['About the service','Pattadar helps you organise property records, documents and work requests. It is a private service. It does not issue government records, establish legal ownership or replace a survey or professional title review.'],
  ['Your account and records','Keep your sign-in details secure. Provide accurate information and upload only material you own or are authorised to use. You retain your rights in your documents; processing and sharing are used to provide the functions you request. Do not use the service to impersonate another person, access their records without authority or submit malicious files.'],
  ['Review before relying on a result','Document readings, maps and estimates can contain errors. Review extracted names, survey numbers, extents, boundaries and prices before saving, sharing or using them for a transaction. The source document and confirmed record remain important when correcting a reading.'],
  ['Sharing and service work','You choose what a recipient can access. Keep sensitive recipient links private and revoke them when no longer needed. A service request records the scope and progress of work; submitting a request alone does not mean a worker has accepted it or completed it. Review deliverables before accepting and filing them.'],
  ['Prices and payments','A simulated amount or a “Not charged” label does not represent a bank payment. When payment checkout is enabled, review the stated amount and provider mode before authorising it. A payment is confirmed only after provider verification. Cancellation and settlement status are shown on the service; recording a request does not prove an external refund has completed.'],
  ['Leaving the service','You can export your account data and request deletion from account settings. The deletion receipt shows progress and any outstanding stages. Download documents you wish to retain before requesting deletion. Access may be restricted to protect an account during a security investigation or while its deletion is being processed.'],
  ['Support','For a problem with your records, work request or account, contact grievance@pattadar.com and provide the relevant reference. These service descriptions should be read together with the privacy notice.'],
 ],
 te:[
  ['సేవ గురించి','పట్టాదార్ ఆస్తి రికార్డులు, పత్రాలు, సేవా అభ్యర్థనలను నిర్వహించడానికి సహాయపడే ప్రైవేట్ సేవ. ఇది ప్రభుత్వ పత్రాలను జారీ చేయదు, చట్టపరమైన యాజమాన్యాన్ని నిర్ణయించదు. సర్వే లేదా నిపుణుల టైటిల్ పరిశీలనకు ప్రత్యామ్నాయం కాదు.'],
  ['మీ ఖాతా, రికార్డులు','సైన్-ఇన్ వివరాలను భద్రంగా ఉంచండి. సరైన సమాచారం ఇవ్వండి. మీకు చెందిన లేదా ఉపయోగించడానికి అనుమతి ఉన్న పత్రాలను మాత్రమే జోడించండి. పత్రాలపై మీ హక్కులు మీవే. మరొకరి పేరుతో వ్యవహరించడం, అనుమతి లేకుండా వారి రికార్డులను చూడడం, హానికరమైన ఫైళ్లను పంపడం చేయవద్దు.'],
  ['ఫలితాలను పరిశీలించండి','పత్రాల పఠనం, మ్యాపులు, అంచనాల్లో తప్పులు ఉండవచ్చు. పేర్లు, సర్వే సంఖ్యలు, విస్తీర్ణం, హద్దులు, ధరలను సేవ్ చేయడానికి, పంచుకోవడానికి లేదా లావాదేవీలో ఉపయోగించడానికి ముందు పరిశీలించండి. మూల పత్రాన్ని ఆధారంగా తీసుకుని తప్పులను సరిచేయండి.'],
  ['పంచుకోవడం, సేవా పని','స్వీకర్తకు ఏ సమాచారం అందాలో మీరు ఎంచుకుంటారు. సున్నితమైన లింకులను భద్రంగా ఉంచి అవసరం తీరాక రద్దు చేయండి. అభ్యర్థన పంపడం మాత్రమే పని అంగీకరించబడిందని లేదా పూర్తయిందని అర్థం కాదు. వచ్చిన ఫలితాలను పరిశీలించిన తరువాతే అంగీకరించి రికార్డులో చేర్చండి.'],
  ['ధరలు, చెల్లింపులు','నమూనా మొత్తం లేదా “Not charged” గుర్తు బ్యాంకు చెల్లింపును సూచించదు. చెల్లింపు అందుబాటులో ఉన్నప్పుడు మొత్తం, సేవాదారు మోడ్‌ను చూసి అనుమతించండి. సేవాదారు ధృవీకరించిన తరువాతే చెల్లింపు నిర్ధారించబడుతుంది. రద్దు, పరిష్కార స్థితి సేవలో చూపబడుతుంది. అభ్యర్థన నమోదు కావడం మాత్రమే రీఫండ్ పూర్తయినట్లు కాదు.'],
  ['సేవ నుండి నిష్క్రమించడం','ఖాతా సెట్టింగుల్లో మీ సమాచారాన్ని ఎగుమతి చేయవచ్చు, తొలగింపును కోరవచ్చు. రసీదులో పురోగతి, మిగిలిన దశలు కనిపిస్తాయి. ఉంచుకోవాలనుకున్న పత్రాలను ముందుగా డౌన్‌లోడ్ చేయండి. భద్రతా పరిశీలన లేదా ఖాతా తొలగింపు జరుగుతున్నప్పుడు ప్రవేశం పరిమితం కావచ్చు.'],
  ['సహాయం','రికార్డులు, సేవా అభ్యర్థన లేదా ఖాతా సమస్యల కోసం సంబంధిత సంఖ్యతో grievance@pattadar.com కు రాయండి. గోప్యతా ప్రకటనను కూడా చదవండి.'],
 ]
};
export function TermsPage(){
 const[lang,setLang]=useState<'en'|'te'>('en');
 return <LegalLayout><Typography variant="h4" component="h1">{lang==='en'?'Terms of use':'వినియోగ నిబంధనలు'}</Typography><p>12/09/2026 · <button onClick={()=>setLang(lang==='en'?'te':'en')}>{lang==='en'?'తెలుగులో చదవండి':'Read in English'}</button></p><div lang={lang}>{sections[lang].map(([title,text])=><section key={title} style={{marginBlock:'1.5rem'}}><Typography variant="h6" component="h2">{title}</Typography><Typography>{text}</Typography></section>)}</div><RouterLink to="/privacy">{lang==='en'?'Privacy notice':'గోప్యతా ప్రకటన'}</RouterLink></LegalLayout>;
}
