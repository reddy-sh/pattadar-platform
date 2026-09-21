import type { StateLandRecordProfile, StateLearningGuide } from '../domain/types';
import { stateLandRecordProfiles } from '../data/stateLandRecords';

export const universitySiteUrl = 'https://university.pattadar.com';

function absoluteUrl(path: string): string {
  return new URL(path, universitySiteUrl).toString();
}

export function buildStateGuideStructuredData(
  profile: StateLandRecordProfile,
  guide: StateLearningGuide,
): Record<string, unknown>[] {
  const pageUrl = absoluteUrl(`/states/${profile.slug}`);
  const citations = profile.officialLinks.map((source) => source.url);

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: guide.seoTitle.replace(' | Pattadar University', ''),
      description: guide.seoDescription,
      url: pageUrl,
      mainEntityOfPage: pageUrl,
      dateModified: guide.reviewedOn,
      datePublished: guide.reviewedOn,
      inLanguage: 'en-IN',
      educationalUse: 'Land-record literacy and property due diligence education',
      keywords: guide.searchTerms.join(', '),
      about: {
        '@type': 'AdministrativeArea',
        name: profile.name,
      },
      author: {
        '@type': 'Organization',
        name: 'Pattadar University',
        url: universitySiteUrl,
      },
      publisher: {
        '@type': 'Organization',
        name: 'Pattadar University',
        url: universitySiteUrl,
      },
      citation: citations,
      isBasedOn: citations,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: guide.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Pattadar University', item: universitySiteUrl },
        { '@type': 'ListItem', position: 2, name: 'State land-record guides', item: absoluteUrl('/states') },
        { '@type': 'ListItem', position: 3, name: profile.name, item: pageUrl },
      ],
    },
  ];
}

export function buildStateDirectoryStructuredData(): Record<string, unknown>[] {
  const pageUrl = absoluteUrl('/states');

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'India State and Union Territory Land-Record Guides',
      description: 'Government-sourced land-record learning guides for all 28 Indian states and 8 union territories.',
      url: pageUrl,
      inLanguage: 'en-IN',
      isPartOf: {
        '@type': 'WebSite',
        name: 'Pattadar University',
        url: universitySiteUrl,
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: stateLandRecordProfiles.length,
        itemListElement: stateLandRecordProfiles.map((profile, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: `${profile.name} land records`,
          url: absoluteUrl(`/states/${profile.slug}`),
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Pattadar University', item: universitySiteUrl },
        { '@type': 'ListItem', position: 2, name: 'State land-record guides', item: pageUrl },
      ],
    },
  ];
}

export function canonicalUrl(path: string): string {
  return absoluteUrl(path);
}
