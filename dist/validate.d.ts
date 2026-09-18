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
import { type SiteFacts } from './facts.js';
export interface Finding {
    /** Which page or artefact, relative to the build directory. */
    readonly where: string;
    readonly problem: string;
}
/**
 * Everything, against a built site.
 *
 * Returns findings rather than throwing, so a caller can print them all at once.
 * A migration wants the whole list, not the first thing that broke.
 */
export declare const validateBuild: (dir: string, facts: SiteFacts) => Finding[];
export declare const routesIn: (dir: string) => string[];
//# sourceMappingURL=validate.d.ts.map