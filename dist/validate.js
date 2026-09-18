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
import { claimsOf } from './facts.js';
/**
 * The readable text of a page, for deciding whether a claim is visible.
 *
 * Two details here were wrong in both sites before this was a package, and are
 * fixed together because they fail the same way: by making the validator *more*
 * lenient than it reads, so a page that does not show a fact passes anyway.
 *
 * **Case-insensitive, and anchored on a word boundary.** `<SCRIPT>` is valid
 * HTML and a case-sensitive pattern leaves its contents in the text, so a claim
 * appearing only inside a script would count as shown. `\b` is the other half:
 * without it the pattern would also swallow a hypothetical `<scriptish>`.
 *
 * **Entities decoded in one pass, not three.** Chained replaces re-read their
 * own output, so `&amp;nbsp;` became `&nbsp;` and then a space — meaning a page
 * that literally displays the text "&nbsp;" was treated as displaying nothing
 * there. One pass over a single alternation cannot double-decode.
 */
const ENTITIES = {
    '&rsquo;': "'",
    '&#8217;': "'",
    '&amp;': '&',
    '&nbsp;': ' ',
};
const text = (html) => html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // Entities the page writes deliberately, so a curly apostrophe in the
    // markup still matches a straight one in the facts.
    .replace(/&(?:rsquo|amp|nbsp);|&#8217;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ');
const attr = (html, pattern) => pattern.exec(html)?.[1] ?? null;
/**
 * Routes that are not content, and must not be judged as though they were.
 *
 * An error page is reached by failing to find something else. It belongs in no
 * sitemap, and pointing its canonical at the site root is correct rather than a
 * mistake, so including it produced two findings that were both the validator
 * misunderstanding the build.
 */
const NOT_CONTENT = new Set(['/404/', '/500/', '/_not-found/']);
/**
 * A page that has asked not to be indexed.
 *
 * It belongs in no sitemap, and listing one asks a crawler to fetch a page that
 * then tells it to go away. The second consumer excludes its privacy and
 * thank-you pages by name for exactly this reason, and the validator reported
 * both as missing — a finding that was the validator misunderstanding the
 * build, which is the one kind of finding that teaches people to ignore it.
 */
const isNoindex = (html) => /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html) ||
    /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i.test(html);
/** Every `<page>/index.html` the build produced, as site-relative routes. */
const pagesIn = (dir, prefix = '/') => {
    const index = join(dir, 'index.html');
    const here = existsSync(index) && !NOT_CONTENT.has(prefix) ? [{ route: prefix, file: index }] : [];
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
const visibleClaims = (pages, facts) => {
    const findings = [];
    const claims = claimsOf(facts);
    for (const page of pages) {
        const html = readFileSync(page.file, 'utf8');
        const graph = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html);
        if (graph === null)
            continue;
        const body = text(html);
        const asserted = graph[1] ?? '';
        const readable = body.toLowerCase();
        for (const fact of claims) {
            if (!asserted.includes(fact))
                continue;
            // Case-insensitively: a page is allowed to write a job title lowercase
            // inside a sentence, and it is still showing it.
            if (readable.includes(fact.toLowerCase()))
                continue;
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
const sitemapCovers = (dir, pages, facts) => {
    const path = join(dir, 'sitemap.xml');
    if (!existsSync(path))
        return [{ where: 'sitemap.xml', problem: 'missing' }];
    const xml = readFileSync(path, 'utf8');
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1] ?? '');
    const findings = [];
    const listed = new Set(entries.map((entry) => /<loc>([^<]+)<\/loc>/.exec(entry)?.[1] ?? '').filter(Boolean));
    for (const page of pages) {
        // A noindex page is meant to be absent. See `isNoindex`.
        if (isNoindex(readFileSync(page.file, 'utf8')))
            continue;
        const expected = `${facts.origin}${page.route}`;
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
const shareCard = (dir, pages) => {
    const findings = [];
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
const canonicalAgrees = (pages, facts) => pages.flatMap((page) => {
    const html = readFileSync(page.file, 'utf8');
    const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
    if (canonical === null)
        return [{ where: page.route, problem: 'no canonical link' }];
    const expected = `${facts.origin}${page.route}`;
    const same = canonical.replace(/\/$/, '') === expected.replace(/\/$/, '');
    return same
        ? []
        : [{ where: page.route, problem: `canonical is ${canonical}, expected ${expected}` }];
});
/** The files that only matter when they are missing, and then matter a lot. */
const requiredFiles = (dir) => ['robots.txt', 'sitemap.xml', 'llms.txt'].flatMap((name) => {
    const file = join(dir, name);
    if (!existsSync(file))
        return [{ where: name, problem: 'missing from the build' }];
    return statSync(file).size === 0 ? [{ where: name, problem: 'is empty' }] : [];
});
/**
 * `llms.txt` is markdown with an H1 and links, not a text file with URLs in it.
 *
 * Present and non-empty was the whole check, and it passed a file that a
 * third-party audit then reported as containing no links at all. The audit was
 * right: the URLs were written bare inside sentences, which reads perfectly
 * well to a person and gives a consumer parsing markdown nothing to follow.
 *
 * The format asks for a single H1 naming the thing, and sections carrying lists
 * of markdown hyperlinks. Both are cheap to check and neither was checked,
 * which is how a file can be generated, tested against its generator, byte
 * compared, and still be wrong in the one way that matters to its only audience.
 */
const llmsFormat = (dir) => {
    const file = join(dir, 'llms.txt');
    if (!existsSync(file))
        return [];
    const text = readFileSync(file, 'utf8');
    const findings = [];
    const h1 = [...text.matchAll(/^# .+/gm)];
    if (h1.length === 0) {
        findings.push({ where: 'llms.txt', problem: 'has no H1 naming the site' });
    }
    else if (h1.length > 1) {
        findings.push({
            where: 'llms.txt',
            problem: `has ${h1.length} H1 headings; the format names one thing`,
        });
    }
    // `[title](target)`, with a target that is not empty. Deliberately permissive
    // about the scheme: a relative path and a mailto: are both real links.
    const links = [...text.matchAll(/\[[^\]]+\]\([^)\s]+\)/g)];
    if (links.length === 0) {
        findings.push({
            where: 'llms.txt',
            problem: 'contains no markdown links, so nothing in it can be followed',
        });
    }
    return findings;
};
/**
 * Everything, against a built site.
 *
 * Returns findings rather than throwing, so a caller can print them all at once.
 * A migration wants the whole list, not the first thing that broke.
 */
export const validateBuild = (dir, facts) => {
    if (!existsSync(dir))
        return [{ where: dir, problem: 'build directory does not exist' }];
    const pages = pagesIn(dir);
    if (pages.length === 0)
        return [{ where: dir, problem: 'no pages found in the build' }];
    return [
        ...requiredFiles(dir),
        ...llmsFormat(dir),
        ...visibleClaims(pages, facts),
        ...sitemapCovers(dir, pages, facts),
        ...shareCard(dir, pages),
        ...canonicalAgrees(pages, facts),
    ];
};
export const routesIn = (dir) => pagesIn(dir).map((page) => page.route).sort();
//# sourceMappingURL=validate.js.map