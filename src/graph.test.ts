import { describe, expect, it } from 'vitest';
import { claimsOf, parseFacts } from './facts';
import { buildGraph, buildStructuredData, organisationId, personId } from './graph';

/**
 * The graph, and its agreement with the claims.
 *
 * Most of these are ordinary shape assertions. The one that earns its place is
 * `every factual assertion is something claimsOf requires`, because that is the
 * property the two modules exist to hold between them: if the graph gains a
 * fact the claims do not cover, the validator will never ask a page to show it,
 * and the site can quietly start telling machines something it does not tell
 * readers.
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
    sameAs: ['https://www.linkedin.com/company/acme'],
  },
  person: {
    name: 'Simon Tregunna',
    jobTitle: 'Founder and CTO',
    url: 'https://method7.co.uk',
    sameAs: ['https://www.linkedin.com/in/method7'],
  },
});

const node = (graph: Record<string, unknown>[], type: string) =>
  graph.find((n) => n['@type'] === type);

describe('the graph agrees with the claims', () => {
  /**
   * Every value the graph asserts as a fact about a real person or company must
   * be something `claimsOf` requires a page to show.
   *
   * Listed explicitly rather than walked, because the point is that adding a
   * claim-bearing field to `graph.ts` and not to `claimsOf` should break this
   * test. A generic walk would have to guess which strings are claims, and
   * would silently accept the new one.
   */
  it('asserts nothing factual that the claims do not cover', () => {
    const graph = buildGraph(FACTS);
    const org = node(graph, 'Organization') as Record<string, any>;
    const person = node(graph, 'Person') as Record<string, any>;

    const asserted = [
      org.legalName,
      org.identifier.value,
      org.address.addressLocality,
      org.contactPoint.email,
      person.name,
      person.jobTitle,
    ];

    const claims = claimsOf(FACTS);
    for (const value of asserted) expect(claims).toContain(value);

    // And the other direction, so a claim nobody emits does not sit unused:
    // every claim this facts object produces is asserted somewhere above.
    expect([...asserted].sort()).toEqual([...claims].sort());
  });

  it('keeps agreeing when a fact is added', () => {
    const withoutNumber = parseFacts({
      name: 'Acme',
      origin: 'https://example.test',
      description: 'A company that makes things.',
      organisation: { legalName: 'Acme Ltd', email: 'hello@example.test' },
    });

    const org = node(buildGraph(withoutNumber), 'Organization') as Record<string, unknown>;

    expect(org.identifier).toBeUndefined();
    expect(claimsOf(withoutNumber)).not.toContain('12345678');
  });
});

describe('the organisation', () => {
  it('names the register rather than emitting a bare number', () => {
    // "12345678" on its own is a string nobody can look up.
    const org = node(buildGraph(FACTS), 'Organization') as Record<string, any>;

    expect(org.identifier['@type']).toBe('PropertyValue');
    expect(org.identifier.propertyID).toBe('UK Companies House company number');
  });

  it('carries a town and a country and no street', () => {
    const org = node(buildGraph(FACTS), 'Organization') as Record<string, any>;

    expect(org.address.addressLocality).toBe('Salisbury');
    expect(org.address.addressCountry).toBe('GB');
    expect(Object.keys(org.address)).not.toContain('streetAddress');
  });

  it('can be a more specific type when that is true', () => {
    // A consultancy is a ProfessionalService, and the specific type is what
    // lets a search engine show the right kind of result.
    const graph = buildGraph(FACTS, { organisationType: 'ProfessionalService' });

    expect(node(graph, 'ProfessionalService')).toBeDefined();
    expect(node(graph, 'Organization')).toBeUndefined();
  });

  it('points at the founder by id rather than describing them twice', () => {
    const org = node(buildGraph(FACTS), 'Organization') as Record<string, any>;
    expect(org.founder).toEqual({ '@id': personId(FACTS.origin) });
  });
});

describe('the person', () => {
  it('is absent for a site with nobody named behind it', () => {
    const facts = parseFacts({
      name: 'Acme',
      origin: 'https://example.test',
      description: 'A company that makes things.',
      organisation: { legalName: 'Acme Ltd', email: 'hello@example.test' },
    });
    const graph = buildGraph(facts);

    expect(node(graph, 'Person')).toBeUndefined();
    // And the organisation does not claim a founder it cannot point at.
    expect((node(graph, 'Organization') as Record<string, unknown>).founder).toBeUndefined();
  });

  it('carries sameAs, which is the reason it exists', () => {
    const person = node(buildGraph(FACTS), 'Person') as Record<string, any>;
    expect(person.sameAs).toEqual(['https://www.linkedin.com/in/method7']);
  });

  it('works for the organisation, by id', () => {
    const person = node(buildGraph(FACTS), 'Person') as Record<string, any>;
    expect(person.worksFor).toEqual({ '@id': organisationId(FACTS.origin) });
  });
});

describe('what a site adds itself', () => {
  it('appends extra nodes to the same graph', () => {
    // A FAQPage needs questions somebody wrote, and is nobody's to derive.
    const graph = buildGraph(FACTS, { extra: [{ '@type': 'FAQPage', mainEntity: [] }] });
    expect(node(graph, 'FAQPage')).toBeDefined();
  });

  it('gives them ids to point at rather than contents to repeat', () => {
    const graph = buildGraph(FACTS, {
      extra: [{ '@type': 'MobileApplication', author: { '@id': organisationId(FACTS.origin) } }],
    });
    const app = node(graph, 'MobileApplication') as Record<string, any>;

    expect(app.author['@id']).toBe(organisationId(FACTS.origin));
    expect(graph.some((n) => n['@id'] === app.author['@id'])).toBe(true);
  });
});

describe('serialising', () => {
  it('wraps the graph in a context, ready for a script tag', () => {
    const document = buildStructuredData(FACTS);

    expect(document['@context']).toBe('https://schema.org');
    expect(Array.isArray(document['@graph'])).toBe(true);
  });

  it('emits no nulls, because a null is a claim of absence', () => {
    // "legalName": null tells a consumer the site has no legal name, which is
    // worse than saying nothing at all.
    expect(JSON.stringify(buildStructuredData(FACTS))).not.toContain('null');
  });
});
