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

/** `- label: value`, skipped entirely when there is no value. */
const line = (label: string, value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : `- ${label}: ${value}`;

/** `- [title](url): notes`, the shape the specification asks for. */
const linkLine = (link: LlmsLink): string =>
  `- [${link.title}](${link.url})${link.notes === undefined ? '' : `: ${link.notes}`}`;

/**
 * A URL as something a reader can say out loud.
 *
 * `https://www.linkedin.com/in/method7` is a fine link and a poor link *title*.
 * Naming the host is what makes a list of five profiles readable, and the
 * address is still there in the target.
 */
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * Who makes this, derived from the facts.
 *
 * Every line here is a fact the structured data also asserts, which is what
 * keeps the two from disagreeing: both are built from one declaration, and
 * `claimsOf` means a page has to be able to show them too.
 */
const attributionSection = (facts: SiteFacts): LlmsSection => {
  const { organisation: org, person } = facts;

  /**
   * The company line, from whichever of the three parts exist.
   *
   * All of them are optional now: the second consumer is a trading name with no
   * registered company, so "Company: undefined" was a real possibility and the
   * line has to disappear rather than say that.
   */
  const registration = [
    org.legalName,
    org.registration === undefined
      ? undefined
      : `${org.registration.scheme} ${org.registration.number}`,
  ]
    .filter((part): part is string => part !== undefined)
    .join(', ');

  const place = org.address?.locality;

  /**
   * The facts, as prose lines. Everything here is also in the structured data.
   *
   * Only the two that are not addresses. A company number and a job title are
   * claims to be read; a profile is a place to go, and belongs in the link list
   * below so a consumer can follow it.
   */
  const body = [
    person === undefined ? undefined : line(person.jobTitle, person.name),
    /**
     * "Company: Acme Ltd, UK Companies House 12345678, based in Salisbury", or
     * just "Based in: Salisbury" when there is no company to name.
     *
     * Two lines rather than one with holes in it. With `legalName` and
     * `registration` both optional, the single line degraded to "Company: based
     * in Salisbury", which reads like a missing word rather than a site that
     * happens to be a trading name.
     */
    registration === ''
      ? line('Based in', place)
      : line('Company', [registration, place === undefined ? undefined : `based in ${place}`]
          .filter((part): part is string => part !== undefined)
          .join(', ')),
    line('Enquiries', org.email),
    line('Telephone', org.telephone),
  ]
    .filter((entry): entry is string => entry !== undefined)
    .join('\n');

  /**
   * The same identity, as links.
   *
   * `sameAs` is the load-bearing field in the structured data for exactly this
   * reason: a name is an island, and a name with addresses that resolve to the
   * same person elsewhere is what lets a consumer join them up. Writing them
   * bare in a sentence throws that away in a file whose entire audience parses
   * markdown.
   */
  const links: LlmsLink[] = [
    { title: facts.name, url: facts.origin, notes: 'the site itself' },
    ...(person === undefined
      ? []
      : person.sameAs.map((url) => ({ title: hostOf(url), url, notes: person.name }))),
    ...org.sameAs.map((url) => ({ title: hostOf(url), url, notes: facts.name })),
    { title: `Email ${facts.name}`, url: `mailto:${org.email}`, notes: 'enquiries' },
    ...(org.telephone === undefined
      ? []
      : [{ title: `Call ${facts.name}`, url: `tel:${org.telephone.replace(/[^+\d]/g, '')}` }]),
  ];

  return { heading: 'Who makes it', body, links };
};

/**
 * A heading, then prose, then links.
 *
 * The links join the prose's own list rather than starting a second one when
 * the prose already ends in one. A blank line between two lists is two lists to
 * a markdown parser, and a section like "Who makes it" — three facts, then five
 * places to go — is one list that happens to be built from two sources.
 */
/** A blank line between two blocks, unless the first ends mid-list. */
const joinBlocks = (before: string, after: string): string => {
  if (before === '') return after;
  if (after === '') return before;

  const listContinues =
    /(^|\n)\s*[-*+]\s[^\n]*$/.test(before) && /^\s*[-*+]\s/.test(after);
  return `${before}${listContinues ? '\n' : '\n\n'}${after}`;
};

const render = (section: LlmsSection): string => {
  const blocks = [
    section.body?.trim() ?? '',
    (section.links ?? []).map(linkLine).join('\n'),
    section.footnote?.trim() ?? '',
  ].filter((block) => block !== '');

  const content = blocks.reduce(joinBlocks, '');
  return content === '' ? `## ${section.heading}` : `## ${section.heading}\n\n${content}`;
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

  const body = sections.map(render).join('\n\n');

  const details = options.details?.trim();

  return [`# ${facts.name}`, blockquote, ...(details ? [details] : []), body].join('\n\n') + '\n';
};

/**
 * What the file must mention, so a test can check the generator kept it.
 *
 * The same claims the page has to show and the graph has to assert. Three
 * consumers of one declaration, which is the whole arrangement: a fact added to
 * the site appears in all three without anybody maintaining a list.
 */
export const llmsMustMention = (facts: SiteFacts): string[] => claimsOf(facts);
