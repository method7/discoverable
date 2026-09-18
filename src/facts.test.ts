import { describe, expect, it } from 'vitest';
import { claimsOf, parseFacts, siteFactsSchema } from './facts';

/**
 * The schema, and the claims derived from it.
 *
 * `claimsOf` is the joint this package exists to strengthen. The validator used
 * to be handed the strings to check, which meant a claim could be added to the
 * structured data and quietly never checked. These tests are mostly about that
 * one property: that the derivation covers what a page asserts, and nothing it
 * merely mentions.
 */

const minimal = {
  name: 'Acme',
  origin: 'https://example.test',
  description: 'A company that makes things.',
  organisation: { legalName: 'Acme Ltd', email: 'hello@example.test' },
};

describe('the schema', () => {
  it('fills in what a site should not have to state', () => {
    const facts = parseFacts(minimal);

    expect(facts.locale).toBe('en-GB');
    expect(facts.organisation.sameAs).toEqual([]);
    expect(facts.alsoVisible).toEqual([]);
  });

  it('refuses a trailing slash on the origin', () => {
    // Because every route is appended to it, and `//about/` is a different URL
    // from `/about/` to anything that compares strings, including the sitemap
    // check two files away.
    expect(() => parseFacts({ ...minimal, origin: 'https://example.test/' })).toThrow();
  });

  it('refuses a description that a search result would truncate', () => {
    expect(() => parseFacts({ ...minimal, description: 'x'.repeat(156) })).toThrow();
  });

  it('refuses a country that is not two letters', () => {
    const withAddress = (country: string) => ({
      ...minimal,
      organisation: { ...minimal.organisation, address: { locality: 'Salisbury', country } },
    });

    expect(() => parseFacts(withAddress('United Kingdom'))).toThrow();
    expect(parseFacts(withAddress('GB')).organisation.address?.country).toBe('GB');
  });

  it('allows a site with nobody named behind it', () => {
    expect(parseFacts(minimal).person).toBeUndefined();
  });

  it('is exported as a schema, so a consumer can extend rather than fork it', () => {
    expect(siteFactsSchema.safeParse(minimal).success).toBe(true);
  });
});

describe('claimsOf', () => {
  const full = parseFacts({
    ...minimal,
    organisation: {
      legalName: 'Acme Ltd',
      email: 'hello@example.test',
      registration: { scheme: 'UK Companies House company number', number: '12345678' },
      address: { locality: 'Salisbury', region: 'Wiltshire', country: 'GB' },
      sameAs: ['https://example.test/acme'],
    },
    person: {
      name: 'Simon Tregunna',
      jobTitle: 'Founder and CTO',
      url: 'https://method7.co.uk',
      sameAs: ['https://www.linkedin.com/in/method7'],
    },
  });

  it('requires every fact a reader would weigh', () => {
    expect(claimsOf(full)).toEqual(
      expect.arrayContaining([
        'Acme Ltd',
        '12345678',
        'Salisbury',
        'hello@example.test',
        'Simon Tregunna',
        'Founder and CTO',
      ]),
    );
  });

  it('does not require URLs to appear as text', () => {
    /**
     * A profile is asserted as an href. Requiring the address in the rendered
     * text would fail any page that sensibly writes "LinkedIn" instead, which
     * is every page worth reading.
     */
    const claims = claimsOf(full);

    expect(claims).not.toContain('https://www.linkedin.com/in/method7');
    expect(claims).not.toContain('https://method7.co.uk');
    expect(claims).not.toContain('https://example.test/acme');
  });

  it('does not require the description or the site name', () => {
    // Neither is an assertion about a legal person, and requiring the first
    // would mean a page quoting its own meta description at the reader.
    const claims = claimsOf(full);

    expect(claims).not.toContain('A company that makes things.');
    expect(claims).not.toContain('Acme');
  });

  it('asks for nothing a minimal site does not have', () => {
    expect(claimsOf(parseFacts(minimal))).toEqual(['Acme Ltd', 'hello@example.test']);
  });

  it('carries anything a site adds by hand', () => {
    const facts = parseFacts({ ...minimal, alsoVisible: ['Established 2015'] });
    expect(claimsOf(facts)).toContain('Established 2015');
  });

  it('says each thing once, however many fields hold it', () => {
    // A trading name that matches the legal name is ordinary, and asking the
    // validator to find it twice would report the same page twice.
    const facts = parseFacts({ ...minimal, alsoVisible: ['Acme Ltd'] });
    expect(claimsOf(facts).filter((c) => c === 'Acme Ltd')).toHaveLength(1);
  });

  it('grows when the facts grow, which is the whole point', () => {
    /**
     * The property that makes deriving worth it. Adding a company number to
     * the facts adds it to what a page must show, with nobody updating a list.
     * Before this, the validator was handed its strings and would go on passing
     * while covering one fewer thing than anybody believed.
     */
    const before = claimsOf(parseFacts(minimal));
    const after = claimsOf(
      parseFacts({
        ...minimal,
        organisation: {
          ...minimal.organisation,
          registration: { scheme: 'UK Companies House company number', number: '99999999' },
        },
      }),
    );

    expect(after).toHaveLength(before.length + 1);
    expect(after).toContain('99999999');
  });
});
