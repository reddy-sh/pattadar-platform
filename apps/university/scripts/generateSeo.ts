import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { courses, campuses } from '../src/data/catalog';
import { stateLearningGuideByCode } from '../src/data/stateGuideContent';
import { stateLandRecordProfiles } from '../src/data/stateLandRecords';
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

function renderStateSnapshot(code: (typeof stateLandRecordProfiles)[number]['code']): string {
  const profile = stateLandRecordProfiles.find((item) => item.code === code)!;
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
      <h1>India state and union territory land-record guides</h1>
      <p>Government-sourced learning guides for all 28 Indian states and 8 union territories.</p>
      <ul>${stateLandRecordProfiles.map((profile) => `<li><a href="/states/${escapeHtml(profile.slug)}">${escapeHtml(profile.name)} land records</a> - ${escapeHtml(profile.primaryRecordLabel)}</li>`).join('')}</ul>
    </main>
  </div>`;
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
  { path: '/states', lastmod: '2026-09-20' },
  { path: '/learn', lastmod: '2026-09-20' },
  { path: '/opportunities', lastmod: '2026-09-20' },
  { path: '/compliance', lastmod: '2026-09-20' },
  ...courses.map((course) => ({ path: `/courses/${course.slug}`, lastmod: '2026-09-20' })),
  ...campuses.map((campus) => ({ path: `/locations/${campus.slug}`, lastmod: '2026-09-20' })),
  ...stateLandRecordProfiles.map((profile) => ({ path: `/states/${profile.slug}`, lastmod: profile.reviewedOn })),
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

## State and union territory guides

The jurisdiction library covers all 28 states and 8 union territories. Each guide explains local record names, official access, mutation, survey and map use, registration boundaries, evidence limits, and source-review status. External references are restricted to government domains.

- [India jurisdiction library](${universitySiteUrl}/states)
${stateLandRecordProfiles.map((profile) => `- [${profile.name} land records](${universitySiteUrl}/states/${profile.slug})`).join('\n')}

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
  const directoryTitle = 'India Land Records by State and Union Territory | Pattadar University';
  const directoryDescription = 'Official land-record guides for all 28 Indian states and 8 union territories, including local record names, mutation, maps, registration, and evidence limits.';

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

  await Promise.all(stateLandRecordProfiles.map(async (profile) => {
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
  }));
}

console.log(`Generated Pattadar University SEO assets in ${outputDirectory}`);
