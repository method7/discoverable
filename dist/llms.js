import { claimsOf } from './facts.js';
/** `- label: value`, skipped entirely when there is no value. */
const line = (label, value) => value === undefined || value === '' ? undefined : `- ${label}: ${value}`;
/** `- [title](url): notes`, the shape the specification asks for. */
const linkLine = (link) => `- [${link.title}](${link.url})${link.notes === undefined ? '' : `: ${link.notes}`}`;
/**
 * A URL as something a reader can say out loud.
 *
 * `https://www.linkedin.com/in/method7` is a fine link and a poor link *title*.
 * Naming the host is what makes a list of five profiles readable, and the
 * address is still there in the target.
 */
const hostOf = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    }
    catch {
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
const attributionSection = (facts) => {
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
        .filter((part) => part !== undefined)
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
                .filter((part) => part !== undefined)
                .join(', ')),
        line('Enquiries', org.email),
        line('Telephone', org.telephone),
    ]
        .filter((entry) => entry !== undefined)
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
    const links = [
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
const render = (section) => {
    const prose = section.body?.trim() ?? '';
    const links = (section.links ?? []).map(linkLine).join('\n');
    if (prose === '')
        return links === '' ? `## ${section.heading}` : `## ${section.heading}\n\n${links}`;
    if (links === '')
        return `## ${section.heading}\n\n${prose}`;
    const continuesAList = /(^|\n)\s*[-*+]\s[^\n]*$/.test(prose);
    return `## ${section.heading}\n\n${prose}${continuesAList ? '\n' : '\n\n'}${links}`;
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
export const buildLlmsTxt = (facts, options) => {
    const attribution = attributionSection(facts);
    const own = options.sections ?? [];
    const sections = options.attribution === 'first' ? [attribution, ...own] : [...own, attribution];
    const blockquote = options.summary
        .trim()
        .split('\n')
        .map((part) => `> ${part}`.trimEnd())
        .join('\n');
    const body = sections.map(render).join('\n\n');
    return `# ${facts.name}\n\n${blockquote}\n\n${body}\n`;
};
/**
 * What the file must mention, so a test can check the generator kept it.
 *
 * The same claims the page has to show and the graph has to assert. Three
 * consumers of one declaration, which is the whole arrangement: a fact added to
 * the site appears in all three without anybody maintaining a list.
 */
export const llmsMustMention = (facts) => claimsOf(facts);
//# sourceMappingURL=llms.js.map