import { claimsOf, type SiteFacts } from './facts.js';

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

export interface LlmsSection {
  /** Rendered as `## heading`. */
  readonly heading: string;
  /** Markdown. Written by the site, in its own voice. */
  readonly body: string;
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

/** `- label: value`, skipped entirely when there is no value. */
const line = (label: string, value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : `- ${label}: ${value}`;

/**
 * Who makes this, derived from the facts.
 *
 * Every line here is a fact the structured data also asserts, which is what
 * keeps the two from disagreeing: both are built from one declaration, and
 * `claimsOf` means a page has to be able to show them too.
 */
const attributionSection = (facts: SiteFacts): LlmsSection => {
  const { organisation: org, person } = facts;

  const registration =
    org.registration === undefined
      ? org.legalName
      : `${org.legalName}, ${org.registration.scheme} ${org.registration.number}`;

  const place = org.address === undefined ? undefined : `based in ${org.address.locality}`;

  const body = [
    person === undefined ? undefined : line(person.jobTitle, person.name),
    person === undefined || person.sameAs.length === 0
      ? undefined
      : line(`${person.name} elsewhere`, person.sameAs.join(', ')),
    line('Company', [registration, place].filter(Boolean).join(', ')),
    org.sameAs.length === 0 ? undefined : line(`${facts.name} elsewhere`, org.sameAs.join(', ')),
    line('Enquiries', org.email),
    line('Website', facts.origin),
  ]
    .filter((entry): entry is string => entry !== undefined)
    .join('\n');

  return { heading: 'Who makes it', body };
};

/**
 * The whole file.
 *
 * Returned as a string rather than written, so the caller decides where it goes
 * and a test can compare the generator's output against the committed artefact.
 * That is not hypothetical tidiness: `llms.txt` lives in `public/`, so editing
 * the artefact looks like it worked — the file changes, the dev server serves
 * it, review passes — and the next build silently overwrites it.
 */
export const buildLlmsTxt = (facts: SiteFacts, options: LlmsOptions): string => {
  const attribution = attributionSection(facts);
  const own = options.sections ?? [];

  const sections =
    options.attribution === 'first' ? [attribution, ...own] : [...own, attribution];

  const blockquote = options.summary
    .trim()
    .split('\n')
    .map((part) => `> ${part}`.trimEnd())
    .join('\n');

  const body = sections
    .map((section) => `## ${section.heading}\n\n${section.body.trim()}`)
    .join('\n\n');

  return `# ${facts.name}\n\n${blockquote}\n\n${body}\n`;
};

/**
 * What the file must mention, so a test can check the generator kept it.
 *
 * The same claims the page has to show and the graph has to assert. Three
 * consumers of one declaration, which is the whole arrangement: a fact added to
 * the site appears in all three without anybody maintaining a list.
 */
export const llmsMustMention = (facts: SiteFacts): string[] => claimsOf(facts);
