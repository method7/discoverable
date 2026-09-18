import { type SiteFacts } from './facts.js';
/**
 * `llms.txt`, for the readers that are not people.
 *
 * The convention is a markdown file at the root stating plainly what a site is,
 * so a model does not have to infer it from navigation and marketing copy. It
 * matters more than it looks: "what is this and why does it exist" is the
 * question an assistant is actually asked, and a feature list is a poor answer
 * to it.
 *
 * ── What this builds and what it does not ────────────────────────────────
 *
 * The frame and the facts. A title, the summary, the sections a site writes,
 * and — derived, not typed — who makes it and how to reach them.
 *
 * That last part is the reason this is here rather than being a template string
 * in each repository. It was a template string in delulu.energy, and every fact
 * in it was a second copy of something `site.ts` already owned: the founder,
 * the job title, three profile URLs, the company, its number, the contact
 * address. A test pinned those literals, so changing the canonical copy would
 * have left the file stale and the test green.
 *
 * Everything else is the site's own words, because a package cannot know what a
 * product is for.
 */
/**
 * One entry in a section's link list.
 *
 * The format the specification is actually about: `- [name](url): notes`.
 */
export interface LlmsLink {
    readonly title: string;
    readonly url: string;
    /** What is at the other end, in a clause. */
    readonly notes?: string;
}
export interface LlmsSection {
    /** Rendered as `## heading`. */
    readonly heading: string;
    /** Markdown prose. Written by the site, in its own voice. */
    readonly body?: string;
    /**
     * Where to go for more, as markdown links.
     *
     * This is the half of `llms.txt` that is not prose, and the half the
     * specification is strictest about: a section is meant to carry a list of
     * links, each a real markdown hyperlink, optionally with a note after a colon.
     *
     * It is also the half the first two implementations of this file got wrong.
     * Both wrote their URLs bare, inside sentences, because that reads perfectly
     * well to a person. An audit reported the file as containing no links at all,
     * which was accurate: `https://example.com/privacy/` in prose is a string, and
     * a consumer parsing markdown finds nothing to follow.
     */
    readonly links?: readonly LlmsLink[];
    /**
     * Markdown after the links, for a note that closes the list rather than
     * introducing it.
     *
     * `body` comes first because most sections explain themselves and then point
     * somewhere. This is the other shape: the second consumer lists its case
     * studies and then adds one line covering the client work that has no page to
     * link to, which belongs at the end of that list and read as a heading for it
     * when rendered at the top.
     */
    readonly footnote?: string;
}
export interface LlmsOptions {
    /**
     * The opening summary, rendered as a blockquote.
     *
     * What the thing is, in a few sentences, with no pitch in it. This is the
     * paragraph most likely to be quoted back verbatim, so it should survive
     * being read on its own with no page around it.
     */
    readonly summary: string;
    /**
     * Markdown between the summary and the first heading.
     *
     * The format allows it — sections of any kind except headings sit there — and
     * it is where a site puts the two or three paragraphs that qualify the
     * one-line summary without earning a heading of their own. The second
     * consumer had exactly that and there was nowhere to put it: folding the
     * paragraphs into the blockquote would have said they were all the summary,
     * and giving them a heading would have invented a section.
     */
    readonly details?: string;
    /** The site's own sections, in the order they should appear. */
    readonly sections?: readonly LlmsSection[];
    /**
     * Where the "who makes it" block goes.
     *
     * Last by default. A model summarising a page reads the top most carefully,
     * and what the product is matters more than who built it — except on a site
     * whose whole point is the person, where `'first'` is right.
     */
    readonly attribution?: 'first' | 'last';
}
/**
 * The whole file.
 *
 * Returned as a string rather than written, so the caller decides where it goes
 * and a test can compare the generator's output against the committed artefact.
 * That is not hypothetical tidiness: `llms.txt` lives in `public/`, so editing
 * the artefact looks like it worked — the file changes, the dev server serves
 * it, review passes — and the next build silently overwrites it.
 */
export declare const buildLlmsTxt: (facts: SiteFacts, options: LlmsOptions) => string;
/**
 * What the file must mention, so a test can check the generator kept it.
 *
 * The same claims the page has to show and the graph has to assert. Three
 * consumers of one declaration, which is the whole arrangement: a fact added to
 * the site appears in all three without anybody maintaining a list.
 */
export declare const llmsMustMention: (facts: SiteFacts) => string[];
//# sourceMappingURL=llms.d.ts.map