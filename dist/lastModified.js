import { execFileSync } from 'node:child_process';
/**
 * When a page's source last actually changed, from git.
 *
 * `lastmod` is only worth emitting if it is true. Google states it ignores the
 * value across a whole site once it finds it unreliable, so stamping every page
 * with the build time is worse than saying nothing: it claims the entire site
 * changed on every deploy, and it did not.
 *
 * ── Seconds, not a date ───────────────────────────────────────────────────
 *
 * This is the part both sites got wrong before they got it right, and it is
 * worth stating because the failure is silent. Truncated to `YYYY-MM-DD`, every
 * deploy after the first one in a day looks identical to it. IndexNow submits
 * the difference between the live sitemap and the new one, so four deploys on
 * one day produced one submission and three "nothing changed", and the real
 * edits went unannounced.
 *
 * ── Normalised to UTC, not passed through ─────────────────────────────────
 *
 * `%cI` carries the committer's own offset. A commit made at 09:00+01:00 sorts
 * before one made at 23:00-05:00 that happened five hours later, and anything
 * comparing these as strings — a sitemap diff, a newest-of-these calculation —
 * gets the wrong answer. Forcing Z makes lexicographic order match
 * chronological order.
 *
 * ── Fails to null rather than to now ──────────────────────────────────────
 *
 * A shallow clone has no history for a file, and the honest answer then is
 * nothing. Emitting today's date because git was unhelpful is exactly the
 * unreliable field the first paragraph is about, so callers should omit the
 * element rather than invent one. CI must check out with `fetch-depth: 0`.
 */
/**
 * One `git log` per file, however many routes ask for it.
 *
 * Shared files are the reason this is worth having: a layout or a design token
 * is a dependency of every page, so a site with ten routes asking "when did
 * this and the four things it is built from last change" spawns fifty processes
 * to answer four questions.
 */
const cache = new Map();
/** Only for tests, and for a long-running process that has pulled since. */
export const forgetCommitDates = () => cache.clear();
const commitDate = (file, cwd) => {
    // Keyed by both, because the same relative path means different files in two
    // repositories and a monorepo build may ask about several.
    const key = `${cwd}\u0000${file}`;
    const cached = cache.get(key);
    if (cached !== undefined)
        return cached;
    let result = null;
    try {
        const raw = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        result = raw === '' ? null : raw;
    }
    catch {
        // No git, not a repository, or a file with no history in a shallow clone.
        result = null;
    }
    cache.set(key, result);
    return result;
};
/**
 * The newest commit across these files, as a UTC ISO instant, or null.
 *
 * Takes a list because a page is rarely one file. A route rendered from a data
 * module does not change when its own template sits still, so it should declare
 * what it is built from and take the newest of those dates.
 */
export const lastModified = (files, options = {}) => {
    const cwd = options.cwd ?? process.cwd();
    const dates = files
        .map((file) => commitDate(file, cwd))
        .filter((date) => date !== null)
        .map((date) => new Date(date))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());
    return dates.at(-1)?.toISOString() ?? null;
};
//# sourceMappingURL=lastModified.js.map