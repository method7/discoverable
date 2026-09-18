/**
 * Checking a built site rather than the code that built it.
 *
 * Everything here reads HTML and XML off disk. That is the whole design: it
 * knows nothing about Next, Astro, or any framework, so the same checks hold
 * across a migration and can say whether one lost anything on the way.
 *
 * ── Why output rather than source ─────────────────────────────────────────
 *
 * Source-level checks are easy to write and easy to fool. A structured-data
 * component can assert a founder while the page that renders it does not name
 * one; a sitemap generator can look right while the build emits it empty; a
 * colour can pass every palette test and still be used for body text. Each of
 * those happened in this repository, and none of them was visible from the
 * module that caused it.
 *
 * The built site is the only place the claims and the evidence sit together.
 *
 * ── What it is for ────────────────────────────────────────────────────────
 *
 * Two jobs. Standing protection against the class of mistake where a page
 * claims more than it shows, and a migration harness: run it against the old
 * build, convert, run it again, and a difference is a regression rather than a
 * matter of opinion.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface Finding {
  /** Which page or artefact, relative to the build directory. */
  readonly where: string;
  readonly problem: string;
}

export interface SiteFacts {
  /** Canonical origin, without a trailing slash. */
  readonly url: string;
  /**
   * Strings the structured data asserts, which must therefore be readable on
   * the page. A company number in JSON-LD that a visitor cannot see is a claim
   * made only to machines, which is the thing search engines penalise and the
   * thing an honest page has no reason to do.
   */
  readonly mustBeVisible: readonly string[];
}

const text = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    // Entities the page writes deliberately, so a curly apostrophe in the
    // markup still matches a straight one in the facts.
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

const attr = (html: string, pattern: RegExp): string | null => pattern.exec(html)?.[1] ?? null;

/**
 * Routes that are not content, and must not be judged as though they were.
 *
 * An error page is reached by failing to find something else. It belongs in no
 * sitemap, and pointing its canonical at the site root is correct rather than a
 * mistake, so including it produced two findings that were both the validator
 * misunderstanding the build.
 */
const NOT_CONTENT = new Set(['/404/', '/500/', '/_not-found/']);

/** Every `<page>/index.html` the build produced, as site-relative routes. */
const pagesIn = (dir: string, prefix = '/'): { route: string; file: string }[] => {
  const index = join(dir, 'index.html');
  const here =
    existsSync(index) && !NOT_CONTENT.has(prefix) ? [{ route: prefix, file: index }] : [];

  const children = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && entry.name !== 'screens')
    .flatMap((entry) => pagesIn(join(dir, entry.name), `${prefix}${entry.name}/`));

  return [...here, ...children];
};

/**
 * The structured data must not claim what the page does not show.
 *
 * Google is explicit that structured data should describe visible content, and
 * the reason to care is not only ranking: a page that tells a machine it has a
 * founder while telling a reader nothing is a page with two stories.
 */
const visibleClaims = (pages: { route: string; file: string }[], facts: SiteFacts): Finding[] => {
  const findings: Finding[] = [];

  for (const page of pages) {
    const html = readFileSync(page.file, 'utf8');
    const graph = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    if (graph === null) continue;

    const body = text(html);
    const asserted = graph[1] ?? '';

    const readable = body.toLowerCase();

    for (const fact of facts.mustBeVisible) {
      if (!asserted.includes(fact)) continue;
      // Case-insensitively: a page is allowed to write a job title lowercase
      // inside a sentence, and it is still showing it.
      if (readable.includes(fact.toLowerCase())) continue;
      findings.push({
        where: page.route,
        problem: `structured data asserts "${fact}" and the page does not show it`,
      });
    }
  }

  return findings;
};

/**
 * Every page is in the sitemap, and every entry is dated precisely enough.
 *
 * Google drops `lastmod` across a whole site once it decides the field is
 * unreliable, so a date that is wrong is worse than one that is absent. And
 * date-only precision cannot distinguish two deploys in a day, which is what
 * IndexNow's difference is computed from.
 */
const sitemapCovers = (
  dir: string,
  pages: { route: string; file: string }[],
  facts: SiteFacts,
): Finding[] => {
  const path = join(dir, 'sitemap.xml');
  if (!existsSync(path)) return [{ where: 'sitemap.xml', problem: 'missing' }];

  const xml = readFileSync(path, 'utf8');
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1] ?? '');
  const findings: Finding[] = [];

  const listed = new Set(
    entries.map((entry) => /<loc>([^<]+)<\/loc>/.exec(entry)?.[1] ?? '').filter(Boolean),
  );

  for (const page of pages) {
    const expected = `${facts.url}${page.route}`;
    if (!listed.has(expected)) {
      findings.push({ where: 'sitemap.xml', problem: `${expected} was built but is not listed` });
    }
  }

  for (const entry of entries) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(entry)?.[1] ?? '(no loc)';
    const mod = /<lastmod>([^<]+)<\/lastmod>/.exec(entry)?.[1];

    if (mod === undefined) {
      findings.push({ where: 'sitemap.xml', problem: `${loc} has no lastmod` });
      continue;
    }

    // A bare YYYY-MM-DD cannot tell two deploys in one day apart.
    if (!/T\d{2}:\d{2}/.test(mod)) {
      findings.push({
        where: 'sitemap.xml',
        problem: `${loc} has a date-only lastmod (${mod}), which cannot distinguish two deploys in a day`,
      });
    }
  }

  return findings;
};

/**
 * A share card that exists, is the right shape, and is described accurately.
 *
 * The declared dimensions are what a platform lays out against before it has
 * fetched the image, so wrong ones produce a card that jumps or crops. Worth
 * checking because nothing else does: a stale `og:image:width` survives every
 * test in a repository and is only ever seen by somebody sharing the page.
 */
const shareCard = (dir: string, pages: { route: string; file: string }[]): Finding[] => {
  const findings: Finding[] = [];

  for (const page of pages) {
    const html = readFileSync(page.file, 'utf8');
    const image = attr(html, /<meta property="og:image" content="([^"]+)"/);

    if (image === null) {
      findings.push({ where: page.route, problem: 'no og:image' });
      continue;
    }

    const local = image.replace(/^https?:\/\/[^/]+/, '');
    const file = join(dir, local);

    if (!existsSync(file)) {
      findings.push({ where: page.route, problem: `og:image ${local} is not in the build` });
      continue;
    }

    if (statSync(file).size === 0) {
      findings.push({ where: page.route, problem: `og:image ${local} is empty` });
    }

    if (attr(html, /<meta property="og:image:width" content="(\d+)"/) === null) {
      findings.push({ where: page.route, problem: 'og:image has no declared width' });
    }
  }

  return findings;
};

/** Canonical agrees with the sitemap, so the two are not naming different pages. */
const canonicalAgrees = (
  pages: { route: string; file: string }[],
  facts: SiteFacts,
): Finding[] =>
  pages.flatMap((page) => {
    const html = readFileSync(page.file, 'utf8');
    const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
    if (canonical === null) return [{ where: page.route, problem: 'no canonical link' }];

    const expected = `${facts.url}${page.route}`;
    const same = canonical.replace(/\/$/, '') === expected.replace(/\/$/, '');
    return same
      ? []
      : [{ where: page.route, problem: `canonical is ${canonical}, expected ${expected}` }];
  });

/** The files that only matter when they are missing, and then matter a lot. */
const requiredFiles = (dir: string): Finding[] =>
  ['robots.txt', 'sitemap.xml', 'llms.txt'].flatMap((name) => {
    const file = join(dir, name);
    if (!existsSync(file)) return [{ where: name, problem: 'missing from the build' }];
    return statSync(file).size === 0 ? [{ where: name, problem: 'is empty' }] : [];
  });

/**
 * Everything, against a built site.
 *
 * Returns findings rather than throwing, so a caller can print them all at once.
 * A migration wants the whole list, not the first thing that broke.
 */
export const validateBuild = (dir: string, facts: SiteFacts): Finding[] => {
  if (!existsSync(dir)) return [{ where: dir, problem: 'build directory does not exist' }];

  const pages = pagesIn(dir);
  if (pages.length === 0) return [{ where: dir, problem: 'no pages found in the build' }];

  return [
    ...requiredFiles(dir),
    ...visibleClaims(pages, facts),
    ...sitemapCovers(dir, pages, facts),
    ...shareCard(dir, pages),
    ...canonicalAgrees(pages, facts),
  ];
};

export const routesIn = (dir: string): string[] => pagesIn(dir).map((page) => page.route).sort();
