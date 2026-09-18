import { describe, expect, it } from 'vitest';
import { parseFacts } from './facts.js';
import { buildLlmsTxt, llmsMustMention } from './llms.js';

/**
 * `llms.txt`, and the facts reaching it without being retyped.
 *
 * The bug this exists to prevent is specific. In delulu.energy the file was a
 * template string, and every fact in its "who makes it" block was a second copy
 * of something the canonical facts module already owned. A test pinned those
 * literals, so changing the source of truth would have left the file stale and
 * the test green.
 */

const FACTS = parseFacts({
  name: 'Acme',
  origin: 'https://example.test',
  description: 'A company that makes things.',
  organisation: {
    legalName: 'Acme Ltd',
    email: 'hello@example.test',
    registration: { scheme: 'UK Companies House company number', number: '12345678' },
    address: { locality: 'Salisbury', region: 'Wiltshire', country: 'GB' },
    sameAs: ['https://www.instagram.com/acme'],
  },
  person: {
    name: 'Simon Tregunna',
    jobTitle: 'Founder and CTO',
    sameAs: ['https://www.linkedin.com/in/method7'],
  },
});

const OPTIONS = {
  summary: 'Acme makes things.\nIt has done since a while ago.',
  sections: [{ heading: 'What it is not', body: '- Not a bank.' }],
};

describe('the shape of the file', () => {
  it('opens with the name and a blockquoted summary', () => {
    const text = buildLlmsTxt(FACTS, OPTIONS);

    expect(text.startsWith('# Acme\n')).toBe(true);
    expect(text).toContain('> Acme makes things.\n> It has done since a while ago.');
  });

  it('renders the site’s own sections as headings', () => {
    expect(buildLlmsTxt(FACTS, OPTIONS)).toContain('## What it is not\n\n- Not a bank.');
  });

  it('works for a site with nothing but a summary', () => {
    const text = buildLlmsTxt(FACTS, { summary: 'Acme.' });
    expect(text).toContain('## Who makes it');
  });
});

describe('who makes it, derived rather than typed', () => {
  it('mentions every fact the claims require', () => {
    /**
     * The property that matters. Three consumers now read one declaration: the
     * page must show these, the graph must assert them, and this file must
     * mention them. A fact added to the site reaches all three with nobody
     * maintaining a list.
     */
    const text = buildLlmsTxt(FACTS, OPTIONS);

    for (const claim of llmsMustMention(FACTS)) expect(text).toContain(claim);
  });

  it('names the register beside the number', () => {
    // A bare "12345678" is a string nobody can look up.
    expect(buildLlmsTxt(FACTS, OPTIONS)).toContain(
      'Acme Ltd, UK Companies House company number 12345678, based in Salisbury',
    );
  });

  it('separates the person’s profiles from the company’s', () => {
    // They are different entities and collapsing them is what makes a crawler
    // treat a founder and their company as one thing with five links. The note
    // after each link is what says which is which, now that both are links.
    const text = buildLlmsTxt(FACTS, OPTIONS);

    expect(text).toContain('[linkedin.com](https://www.linkedin.com/in/method7): Simon Tregunna');
    expect(text).toContain('[instagram.com](https://www.instagram.com/acme): Acme');
  });

  it('omits a line rather than emitting an empty one', () => {
    const facts = parseFacts({
      name: 'Acme',
      origin: 'https://example.test',
      description: 'A company that makes things.',
      organisation: { legalName: 'Acme Ltd', email: 'hello@example.test' },
    });
    const text = buildLlmsTxt(facts, { summary: 'Acme.' });

    expect(text).toContain('- Company: Acme Ltd');
    expect(text).not.toContain('elsewhere:');
    expect(text).not.toContain('undefined');
  });

  it('goes last by default, and first when the person is the point', () => {
    const last = buildLlmsTxt(FACTS, OPTIONS);
    const first = buildLlmsTxt(FACTS, { ...OPTIONS, attribution: 'first' });

    expect(last.indexOf('## Who makes it')).toBeGreaterThan(last.indexOf('## What it is not'));
    expect(first.indexOf('## Who makes it')).toBeLessThan(first.indexOf('## What it is not'));
  });
});

describe('the format the specification actually asks for', () => {
  /**
   * The audit that prompted all of this said, of a file that passed every check
   * in this repository: "File does not appear to contain any links."
   *
   * It was right. Every URL was written bare inside a sentence, which reads
   * perfectly well to a person and leaves a consumer parsing markdown with
   * nothing to follow. `llms.txt` exists for consumers that parse markdown.
   */
  it('renders a section’s links as markdown, not as bare addresses', () => {
    const text = buildLlmsTxt(FACTS, {
      summary: 'A thing.',
      sections: [
        {
          heading: 'Policies',
          links: [
            { title: 'Privacy', url: 'https://example.test/privacy/', notes: 'what is collected' },
            { title: 'Terms', url: 'https://example.test/terms/' },
          ],
        },
      ],
    });

    expect(text).toContain('- [Privacy](https://example.test/privacy/): what is collected');
    expect(text).toContain('- [Terms](https://example.test/terms/)');
  });

  it('lets a section carry prose, links, or both', () => {
    const both = buildLlmsTxt(FACTS, {
      summary: 'A thing.',
      sections: [
        { heading: 'Both', body: 'Some prose.', links: [{ title: 'A', url: '/a/' }] },
        { heading: 'Prose only', body: 'Just words.' },
        { heading: 'Links only', links: [{ title: 'B', url: '/b/' }] },
      ],
    });

    expect(both).toContain('Some prose.\n\n- [A](/a/)');
    expect(both).toContain('## Prose only\n\nJust words.');
    expect(both).toContain('## Links only\n\n- [B](/b/)');
    // A heading with nothing under it would be a heading promising something.
    expect(both).not.toMatch(/## \w[^\n]*\n\n\n/);
  });

  it('puts the identity links in the attribution block as links', () => {
    // `sameAs` is the load-bearing field in the structured data because a name
    // with addresses that resolve to the same person elsewhere is what lets a
    // consumer join them up. Writing them bare throws that away here.
    const text = buildLlmsTxt(FACTS, { summary: 'A thing.' });

    for (const url of FACTS.person?.sameAs ?? []) {
      expect(text).toContain(`](${url})`);
    }
    expect(text).toContain(`](mailto:${FACTS.organisation.email})`);
    expect(text).toContain(`](${FACTS.origin})`);
  });

  it('titles a profile by its host rather than by its address', () => {
    // Five raw URLs in a list is not a list anybody reads. The address is still
    // the target.
    const text = buildLlmsTxt(FACTS, { summary: 'A thing.' });

    expect(text).toContain('[linkedin.com](https://www.linkedin.com/in/method7)');
  });

  it('has exactly one H1, because the format names one thing', () => {
    const text = buildLlmsTxt(FACTS, {
      summary: 'A thing.',
      sections: [{ heading: 'A section', body: 'Words.' }],
    });

    expect([...text.matchAll(/^# .+/gm)]).toHaveLength(1);
    expect(text.startsWith(`# ${FACTS.name}\n`)).toBe(true);
  });
});

describe('a section whose prose is already a list', () => {
  it('continues that list rather than starting a second one', () => {
    // A blank line between two lists is two lists to a markdown parser, and a
    // section that states three facts and then five places to go is one list
    // that happens to be built from two sources.
    const text = buildLlmsTxt(FACTS, {
      summary: 'A thing.',
      sections: [
        {
          heading: 'Details',
          body: '- Stage: early.\n- Terminology: Wave, Match.',
          links: [{ title: 'Logo', url: '/icon.png' }],
        },
      ],
    });

    expect(text).toContain('- Terminology: Wave, Match.\n- [Logo](/icon.png)');
  });

  it('still separates prose that is a paragraph', () => {
    const text = buildLlmsTxt(FACTS, {
      summary: 'A thing.',
      sections: [
        { heading: 'Policies', body: 'Some words.', links: [{ title: 'Terms', url: '/terms/' }] },
      ],
    });

    expect(text).toContain('Some words.\n\n- [Terms](/terms/)');
  });
});

describe('an organisation with no registered company', () => {
  const TRADING_NAME = parseFacts({
    name: 'Method7',
    origin: 'https://www.method7.co.uk',
    description: 'A software studio in Salisbury.',
    organisation: {
      email: 'info@method7.co.uk',
      telephone: '+44 7971 389430',
      address: { locality: 'Salisbury', country: 'GB' },
    },
    person: { name: 'Simon Tregunna', jobTitle: 'Senior full-stack engineer' },
  });

  it('says where it is rather than naming a company that does not exist', () => {
    // The single "Company:" line degraded to "Company: based in Salisbury" once
    // legalName became optional, which reads like a missing word.
    const text = buildLlmsTxt(TRADING_NAME, { summary: 'A studio.' });

    expect(text).toContain('- Based in: Salisbury');
    expect(text).not.toContain('- Company:');
  });

  it('still names the company when there is one', () => {
    expect(buildLlmsTxt(FACTS, { summary: 'A thing.' })).toContain('- Company: Acme Ltd');
  });

  it('offers the telephone as a tel: link, digits only', () => {
    const text = buildLlmsTxt(TRADING_NAME, { summary: 'A studio.' });

    expect(text).toContain('- Telephone: +44 7971 389430');
    expect(text).toContain('[Call Method7](tel:+447971389430)');
  });
});
