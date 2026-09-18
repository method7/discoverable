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
export const parseSitemap = (xml) => {
    const entries = new Map();
    for (const block of xml.matchAll(/<url>(.*?)<\/url>/gs)) {
        const body = block[1] ?? '';
        const loc = /<loc>([^<]+)<\/loc>/.exec(body)?.[1];
        if (loc === undefined)
            continue;
        entries.set(loc, /<lastmod>([^<]+)<\/lastmod>/.exec(body)?.[1] ?? '');
    }
    return entries;
};
/**
 * What changed, comparing what is about to be served with what was.
 *
 * Dates are compared as instants rather than as strings. They are written as
 * UTC by `build-progress.ts` so a string comparison would work today, and
 * relying on that would make this quietly wrong the first time somebody emitted
 * a local offset.
 */
export const changedUrls = (next, previous) => {
    const newer = (a, b) => {
        const left = Date.parse(a);
        const right = Date.parse(b);
        // An unparseable or absent date on either side means the only honest answer
        // is "cannot tell", and a page that might have changed is worth announcing.
        if (Number.isNaN(left) || Number.isNaN(right))
            return a !== b;
        return left > right;
    };
    return [...next.entries()]
        .filter(([url, lastmod]) => {
        const before = previous.get(url);
        if (before === undefined)
            return true;
        return newer(lastmod, before);
    })
        .map(([url]) => url);
};
//# sourceMappingURL=indexnow.js.map