import { describe, expect, it } from 'vitest';
import { parseFacts } from './facts';
import { buildLlmsTxt, llmsMustMention } from './llms';

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
    // treat a founder and their company as one thing with five links.
    const text = buildLlmsTxt(FACTS, OPTIONS);

    expect(text).toContain('Simon Tregunna elsewhere: https://www.linkedin.com/in/method7');
    expect(text).toContain('Acme elsewhere: https://www.instagram.com/acme');
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
