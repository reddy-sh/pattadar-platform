import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { courses, campuses } from '../src/data/catalog';
import { officialReferencesById } from '../src/data/officialReferences';
import { recordGuidePath, recordGuides, recordGuidesForState, recordVideoUrl } from '../src/data/recordGuides';
import { stateLearningGuideByCode } from '../src/data/stateGuideContent';
import { publishedStateLandRecordProfiles } from '../src/data/stateLandRecords';
import {
  buildStateDirectoryStructuredData,
  buildStateGuideStructuredData,
  canonicalUrl,
  universitySiteUrl,
} from '../src/seo/stateSeo';

const outputDirectory = resolve(process.cwd(), process.argv[2] ?? 'public');
const isDistribution = outputDirectory.endsWith('/dist');

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function jsonLd(value: Record<string, unknown>[]): string {
  return value
    .map((entry) => `<script type="application/ld+json">${JSON.stringify(entry).replace(/</g, '\\u003c')}</script>`)
    .join('\n    ');
}

function metadata(title: string, description: string, path: string, structuredData: Record<string, unknown>[]): string {
  const url = canonicalUrl(path);
  return [
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    '<meta property="og:type" content="article" />',
    '<meta property="og:site_name" content="Pattadar University" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    '<meta name="twitter:card" content="summary" />',
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    jsonLd(structuredData),
  ].join('\n    ');
}

function renderStateSnapshot(code: (typeof publishedStateLandRecordProfiles)[number]['code']): string {
  const profile = publishedStateLandRecordProfiles.find((item) => item.code === code)!;
  const guide = stateLearningGuideByCode(code);
  return `<div id="root">
    <main class="page-shell state-guide-page seo-snapshot">
      <article>
        <p>Pattadar University India jurisdiction library</p>
        <h1>${escapeHtml(profile.name)} land records</h1>
        <p>${escapeHtml(guide.answerSummary)}</p>
        <p><strong>Primary starting record:</strong> ${escapeHtml(profile.primaryRecordLabel)}</p>
        <p><strong>Coverage note:</strong> ${escapeHtml(profile.coverageNote)}</p>
        <section>
          <h2>Key ${escapeHtml(profile.name)} land records</h2>
          ${guide.recordExplainers.map((record) => `<h3>${escapeHtml(record.name)}</h3><p>${escapeHtml(record.purpose)} ${escapeHtml(record.verify)}</p>`).join('')}
        </section>
        <section>
          <h2>Official access and review</h2>
          <ol>${guide.accessSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
        </section>
        <section>
          <h2>Mutation, survey, registration, and local context</h2>
          ${guide.topics.map((topic) => `<h3>${escapeHtml(topic.question)}</h3><p>${escapeHtml(topic.answer)}</p>`).join('')}
        </section>
        <section>
          <h2>${escapeHtml(profile.name)} land-record questions</h2>
          ${guide.faqs.map((faq) => `<h3>${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p>`).join('')}
        </section>
        <section>
          <h2>Official government sources</h2>
          <ul>${profile.officialLinks.map((source) => `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.label)}</a> - ${escapeHtml(source.authority)}</li>`).join('')}</ul>
          <p>Last human source review: ${escapeHtml(guide.reviewedOn)}</p>
        </section>
      </article>
    </main>
  </div>`;
}

function renderDirectorySnapshot(): string {
  return `<div id="root">
    <main class="page-shell state-directory-page seo-snapshot">
      <h1>Andhra Pradesh and Telangana land-record guides</h1>
      <p>Government-sourced learning guides for the two reviewed launch states.</p>
      <ul>${publishedStateLandRecordProfiles.map((profile) => `<li><a href="/states/${escapeHtml(profile.slug)}">${escapeHtml(profile.name)} land records</a> - ${escapeHtml(profile.primaryRecordLabel)}</li>`).join('')}</ul>
    </main>
  </div>`;
}

function renderRecordLibrarySnapshot(profile: (typeof publishedStateLandRecordProfiles)[number]): string {
  const records = profile.code === 'AP' || profile.code === 'TS' ? recordGuidesForState(profile.code) : [];
  return `<div id="root"><main class="page-shell record-library-page seo-snapshot">
    <h1>${escapeHtml(profile.name)} record learning videos</h1>
    <p>Original narrated teaching graphics, fictional field examples, transcripts, and government sources.</p>
    <ul>${records.map((record) => `<li><a href="${recordGuidePath(record)}">${escapeHtml(record.title)}</a> - ${escapeHtml(record.summary)}</li>`).join('')}</ul>
  </main></div>`;
}

function renderRecordSnapshot(record: (typeof recordGuides)[number]): string {
  const sources = officialReferencesById(record.sourceIds);
  return `<div id="root"><main class="page-shell record-detail-page seo-snapshot">
    <h1>${escapeHtml(record.title)}</h1>
    <p>${escapeHtml(record.summary)}</p>
    <p>Fictional training example. Not a government record.</p>
    <section><h2>Key fields and checks</h2>${record.fields.map((field) =>
      `<h3>${escapeHtml(field.label)}</h3><p>Example: ${escapeHtml(field.example)}. ${escapeHtml(field.meaning)} ${escapeHtml(field.verify)}</p>`).join('')}</section>
    <section><h2>Limits</h2><p>${escapeHtml(record.limit)}</p></section>
    <section><h2>Government sources</h2><ul>${sources.map((source) =>
      `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a> - ${escapeHtml(source.authority)}</li>`).join('')}</ul></section>
  </main></div>`;
}

function recordSchema(record: (typeof recordGuides)[number]): Record<string, unknown>[] {
  const pageUrl = canonicalUrl(recordGuidePath(record));
  const stateName = record.stateCode === 'AP' ? 'Andhra Pradesh' : 'Telangana';
  return [{
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: `${record.title} explained`,
    description: record.summary,
    url: pageUrl,
    inLanguage: 'en-IN',
    educationalLevel: 'Beginner',
    learningResourceType: 'Visual lesson and field guide',
    about: `${stateName} land records`,
    citation: officialReferencesById(record.sourceIds).map((source) => source.url),
    video: {
      '@type': 'VideoObject',
      name: `${record.title} visual lesson`,
      description: `Original narrated fictional example explaining ${record.title} in ${stateName}.`,
      thumbnailUrl: canonicalUrl(recordVideoUrl(record, 'jpg')),
      contentUrl: canonicalUrl(recordVideoUrl(record, 'mp4')),
      uploadDate: '2026-10-01',
      inLanguage: 'en-IN',
    },
  }];
}

function injectPage(
  template: string,
  title: string,
  description: string,
  path: string,
  structuredData: Record<string, unknown>[],
  snapshot: string,
): string {
  return template
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta\s+name="description"[\s\S]*?content="[^"]*"[\s\S]*?\/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace('</head>', `    ${metadata(title, description, path, structuredData)}\n  </head>`)
    .replace('<div id="root"></div>', snapshot);
}

async function write(relativePath: string, content: string) {
  const path = resolve(outputDirectory, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

const sitemapEntries = [
  { path: '/', lastmod: '2026-09-20' },
  { path: '/pathways', lastmod: '2026-09-29' },
  { path: '/credentials', lastmod: '2026-09-29' },
  { path: '/states', lastmod: '2026-09-20' },
  { path: '/locations', lastmod: '2026-09-30' },
  { path: '/learn', lastmod: '2026-09-20' },
  { path: '/opportunities', lastmod: '2026-09-20' },
  { path: '/compliance', lastmod: '2026-09-20' },
  ...courses.map((course) => ({ path: `/courses/${course.slug}`, lastmod: '2026-09-20' })),
  ...campuses.map((campus) => ({ path: `/locations/${campus.slug}`, lastmod: campus.slug === 'markapuram' ? '2026-09-30' : '2026-09-20' })),
  ...publishedStateLandRecordProfiles.map((profile) => ({ path: `/states/${profile.slug}`, lastmod: profile.reviewedOn })),
  ...publishedStateLandRecordProfiles.map((profile) => ({ path: `/states/${profile.slug}/records`, lastmod: '2026-10-01' })),
  ...recordGuides.map((record) => ({ path: recordGuidePath(record), lastmod: '2026-10-01' })),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.map((entry) => `  <url><loc>${canonicalUrl(entry.path)}</loc><lastmod>${entry.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;

const robots = `User-agent: *
Allow: /
Disallow: /account
Disallow: /auth/

Sitemap: ${universitySiteUrl}/sitemap.xml
`;

const llms = `# Pattadar University

Pattadar University is an educational property and land-record literacy product for India.

## Reviewed state guides

The initial jurisdiction library covers Andhra Pradesh and Telangana. Each reviewed guide explains local record names, official access, mutation, survey and map use, registration boundaries, evidence limits, and source-review status. External references are restricted to government domains.

- [Reviewed jurisdiction library](${universitySiteUrl}/states)
${publishedStateLandRecordProfiles.map((profile) => `- [${profile.name} land records](${universitySiteUrl}/states/${profile.slug})`).join('\n')}

## Record video libraries

${publishedStateLandRecordProfiles.map((profile) => `- [${profile.name} visual record lessons](${universitySiteUrl}/states/${profile.slug}/records)`).join('\n')}

## Important boundary

The guides are education, not title certificates, legal opinions, survey demarcations, or government services. Portal records must be reconciled with certified records, registration, mutation, survey, restrictions, and competent professional or authority review where needed.
`;

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  write('sitemap.xml', sitemap),
  write('robots.txt', robots),
  write('llms.txt', llms),
]);

if (isDistribution) {
  const template = await readFile(resolve(outputDirectory, 'index.html'), 'utf8');
  const directoryTitle = 'Andhra Pradesh and Telangana Land Records | Pattadar University';
  const directoryDescription = 'Government-sourced land-record learning guides for Andhra Pradesh and Telangana, including revenue records, mutation, maps, registration, and evidence limits.';

  await write(
    'states/index.html',
    injectPage(
      template,
      directoryTitle,
      directoryDescription,
      '/states',
      buildStateDirectoryStructuredData(),
      renderDirectorySnapshot(),
    ),
  );

  await Promise.all(publishedStateLandRecordProfiles.map(async (profile) => {
    const guide = stateLearningGuideByCode(profile.code);
    await write(
      `states/${profile.slug}/index.html`,
      injectPage(
        template,
        guide.seoTitle,
        guide.seoDescription,
        `/states/${profile.slug}`,
        buildStateGuideStructuredData(profile, guide),
        renderStateSnapshot(profile.code),
      ),
    );
    await write(
      `states/${profile.slug}/records/index.html`,
      injectPage(
        template,
        `${profile.name} record learning videos | Pattadar University`,
        `Original visual lessons on ${profile.name} land records, with fictional field examples and official sources.`,
        `/states/${profile.slug}/records`,
        [],
        renderRecordLibrarySnapshot(profile),
      ),
    );
  }));
  await Promise.all(recordGuides.map(async (record) => {
    const stateSlug = record.stateCode === 'AP' ? 'andhra-pradesh' : 'telangana';
    const stateName = record.stateCode === 'AP' ? 'Andhra Pradesh' : 'Telangana';
    await write(
      `states/${stateSlug}/records/${record.slug}/index.html`,
      injectPage(
        template,
        `${record.title} explained | ${stateName} | Pattadar University`,
        record.summary,
        recordGuidePath(record),
        recordSchema(record),
        renderRecordSnapshot(record),
      ),
    );
  }));
}

console.log(`Generated Pattadar University SEO assets in ${outputDirectory}`);
