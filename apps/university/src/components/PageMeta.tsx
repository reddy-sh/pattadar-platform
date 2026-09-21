import { useEffect } from 'react';
import { canonicalUrl } from '../seo/stateSeo';

interface PageMetaProps {
  title: string;
  description: string;
  path: string;
  structuredData?: Record<string, unknown>[];
}

const marker = 'data-pattadar-page-meta';

function appendMeta(attribute: 'name' | 'property', key: string, content: string) {
  const element = document.createElement('meta');
  element.setAttribute(attribute, key);
  element.content = content;
  element.setAttribute(marker, 'true');
  document.head.append(element);
}

export function PageMeta({ title, description, path, structuredData = [] }: PageMetaProps) {
  useEffect(() => {
    document.head.querySelectorAll(`[${marker}]`).forEach((element) => element.remove());
    document.title = title;

    const existingDescription = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (existingDescription) existingDescription.content = description;
    else appendMeta('name', 'description', description);

    const url = canonicalUrl(path);
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = url;
    canonical.setAttribute(marker, 'true');
    document.head.append(canonical);

    appendMeta('property', 'og:type', 'article');
    appendMeta('property', 'og:site_name', 'Pattadar University');
    appendMeta('property', 'og:title', title);
    appendMeta('property', 'og:description', description);
    appendMeta('property', 'og:url', url);
    appendMeta('name', 'twitter:card', 'summary');
    appendMeta('name', 'twitter:title', title);
    appendMeta('name', 'twitter:description', description);

    for (const value of structuredData) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.text = JSON.stringify(value).replace(/</g, '\\u003c');
      script.setAttribute(marker, 'true');
      document.head.append(script);
    }

    return () => {
      document.head.querySelectorAll(`[${marker}]`).forEach((element) => element.remove());
      document.title = 'Pattadar University';
      const descriptionMeta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (descriptionMeta) {
        descriptionMeta.content = 'Learn Indian land records, property due diligence, field skills, and service careers with government-sourced Pattadar University guides and courses.';
      }
    };
  }, [description, path, structuredData, title]);

  return null;
}
