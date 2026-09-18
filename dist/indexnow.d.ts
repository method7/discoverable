/**
 * Reading a sitemap, and deciding what changed since the last one.
 *
 * The two halves of IndexNow worth sharing. Deciding what to submit is the part
 * that is the same on every site; posting it is four lines and belongs wherever
 * the deploy runs.
 *
 * Splitting them is not ceremony. A module that POSTs to a live endpoint has to
 * be trusted not to do so when a test imports it, and the guard that buys is
 * easy to get wrong. Pure functions here, side effects in the consumer.
 */
/** url to lastmod, with an empty string for an entry that carries none. */
export declare const parseSitemap: (xml: string) => Map<string, string>;
/**
 * What changed, comparing what is about to be served with what was.
 *
 * Dates are compared as instants rather than as strings. They are written as
 * UTC by `build-progress.ts` so a string comparison would work today, and
 * relying on that would make this quietly wrong the first time somebody emitted
 * a local offset.
 */
export declare const changedUrls: (next: Map<string, string>, previous: Map<string, string>) => string[];
//# sourceMappingURL=indexnow.d.ts.map