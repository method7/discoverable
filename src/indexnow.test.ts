import { describe, expect, it } from 'vitest';
import { changedUrls, parseSitemap } from './indexnow';

/**
 * Submitting the difference, not the sitemap.
 *
 * Why submitting a difference matters is in the README. These cover the two
 * halves that can be wrong quietly: parsing a sitemap into url-to-lastmod, and
 * deciding what that means against the one that was live a moment ago.
 */

const sitemap = (entries: readonly (readonly [string, string])[]) =>
  `<?xml version="1.0"?><urlset>${entries
    .map(([loc, mod]) => `<url><loc>${loc}</loc>${mod === '' ? '' : `<lastmod>${mod}</lastmod>`}</url>`)
    .join('')}</urlset>`;

const A = 'https://delulu.energy/';
const B = 'https://delulu.energy/about/';

describe('parseSitemap', () => {
  it('reads every url and its lastmod', () => {
    const map = parseSitemap(sitemap([[A, '2026-09-17T10:00:00.000Z'], [B, '2026-09-16T10:00:00.000Z']]));

    expect(map.size).toBe(2);
    expect(map.get(A)).toBe('2026-09-17T10:00:00.000Z');
  });

  it('keeps a url that carries no date, rather than dropping it', () => {
    // A dateless entry is still a page. Dropping it would make it invisible to
    // the diff and it would never be announced.
    expect(parseSitemap(sitemap([[A, '']])).get(A)).toBe('');
  });

  it('is empty for something that is not a sitemap', () => {
    expect(parseSitemap('<html>404</html>').size).toBe(0);
  });
});

describe('changedUrls', () => {
  const previous = parseSitemap(sitemap([[A, '2026-09-17T10:00:00.000Z']]));

  it('says nothing changed when nothing changed', () => {
    // The case that matters most: the daily scheduled deploy, where the page is
    // rebuilt and nothing a reader would notice is different.
    expect(changedUrls(parseSitemap(sitemap([[A, '2026-09-17T10:00:00.000Z']])), previous)).toEqual([]);
  });

  it('finds a page whose date moved', () => {
    const next = parseSitemap(sitemap([[A, '2026-09-17T11:00:00.000Z']]));
    expect(changedUrls(next, previous)).toEqual([A]);
  });

  it('finds a page that is new', () => {
    const next = parseSitemap(sitemap([[A, '2026-09-17T10:00:00.000Z'], [B, '2026-09-17T11:00:00.000Z']]));
    expect(changedUrls(next, previous)).toEqual([B]);
  });

  it('tells two deploys in one day apart, which date-only stamps could not', () => {
    /**
     * The bug this whole change exists for. With `lastmod` truncated to
     * YYYY-MM-DD, the second, third and fourth deploy of a day all compare
     * equal to the first and the real edits go unannounced.
     */
    const morning = parseSitemap(sitemap([[A, '2026-09-17T09:00:00.000Z']]));
    const afternoon = parseSitemap(sitemap([[A, '2026-09-17T16:30:00.000Z']]));

    expect(changedUrls(afternoon, morning)).toEqual([A]);
  });

  it('does not announce a page whose date went backwards', () => {
    // A rollback is not a change worth telling anybody about, and claiming one
    // is the same abuse as claiming an unchanged page changed.
    const older = parseSitemap(sitemap([[A, '2026-09-16T10:00:00.000Z']]));
    expect(changedUrls(older, previous)).toEqual([]);
  });

  it('announces a page when either date cannot be read', () => {
    // "Cannot tell" has to fail towards announcing: a page that might have
    // changed is worth a ping, and silence would be the failure that hides.
    const next = parseSitemap(sitemap([[A, '']]));
    expect(changedUrls(next, previous)).toEqual([A]);
  });
});
