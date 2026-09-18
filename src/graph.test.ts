import { describe, expect, it } from 'vitest';
import { claimsOf, parseFacts } from './facts.js';
import { buildGraph, buildStructuredData, organisationId, personId } from './graph.js';

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

/**
 * The same, for assertions that read a property off it.
 *
 * `node()` can legitimately return nothing, which is what the presence tests
 * check. Anything reading through the result wants a failure that names the
 * missing node rather than a non-null assertion that reports a line number.
 */
const nodeOf = (graph: Record<string, unknown>[], type: string): Record<string, unknown> => {
  const found = node(graph, type);
  if (found === undefined) throw new Error(`no ${type} node in the graph`);
  return found;
};

/**
 * Read down into a node without pretending to know its type.
 *
 * JSON-LD is genuinely dynamic: a value is a string, an object or an array
 * depending on the property. Casting each access to `any` scattered the
 * looseness across every assertion; one helper keeps it in a single place and
 * makes the tests read as the paths they are checking.
 */
const at = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (current, key) => (current as Record<string, unknown> | undefined)?.[key],
    value,
  );

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
    const org = node(graph, 'Organization');
    const person = node(graph, 'Person');

    const asserted = [
      at(org, 'legalName'),
      at(org, 'identifier', 'value'),
      at(org, 'address', 'addressLocality'),
      at(org, 'contactPoint', 'email'),
      at(person, 'name'),
      at(person, 'jobTitle'),
    ] as string[];

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
    const org = node(buildGraph(FACTS), 'Organization');

    expect(at(org, 'identifier', '@type')).toBe('PropertyValue');
    expect(at(org, 'identifier', 'propertyID')).toBe('UK Companies House company number');
  });

  it('carries a town and a country and no street', () => {
    const org = node(buildGraph(FACTS), 'Organization');

    expect(at(org, 'address', 'addressLocality')).toBe('Salisbury');
    expect(at(org, 'address', 'addressCountry')).toBe('GB');
    expect(Object.keys(at(org, 'address') as object)).not.toContain('streetAddress');
  });

  it('can be a more specific type when that is true', () => {
    // A consultancy is a ProfessionalService, and the specific type is what
    // lets a search engine show the right kind of result.
    const graph = buildGraph(FACTS, { organisationType: 'ProfessionalService' });

    expect(node(graph, 'ProfessionalService')).toBeDefined();
    expect(node(graph, 'Organization')).toBeUndefined();
  });

  it('points at the founder by id rather than describing them twice', () => {
    const org = node(buildGraph(FACTS), 'Organization');
    expect(at(org, 'founder')).toEqual({ '@id': personId(FACTS.origin) });
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
    const person = node(buildGraph(FACTS), 'Person');
    expect(at(person, 'sameAs')).toEqual(['https://www.linkedin.com/in/method7']);
  });

  it('works for the organisation, by id', () => {
    const person = node(buildGraph(FACTS), 'Person');
    expect(at(person, 'worksFor')).toEqual({ '@id': organisationId(FACTS.origin) });
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
    const app = node(graph, 'MobileApplication');
    const author = at(app, 'author', '@id');

    expect(author).toBe(organisationId(FACTS.origin));
    expect(graph.some((n) => n['@id'] === author)).toBe(true);
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

describe('extending the derived nodes', () => {
  /**
   * The joint the first consumer needed.
   *
   * delulu.energy's Organization asserted a logo, a share image, a slogan and
   * four subjects it knows about, and its Person named the page principally
   * about them. None of that is derivable from a company record, and adopting a
   * shared builder without somewhere to put it would have meant dropping five
   * true statements to fit a schema.
   */
  it('merges site-specific properties onto the organisation', () => {
    const graph = buildGraph(FACTS, {
      extend: {
        organisation: {
          logo: `${FACTS.origin}/icon.png`,
          slogan: 'Real people. Real life.',
          knowsAbout: ['social discovery'],
        },
      },
    });

    const org = nodeOf(graph, 'Organization');

    expect(org['logo']).toBe(`${FACTS.origin}/icon.png`);
    expect(org['slogan']).toBe('Real people. Real life.');
    expect(org['knowsAbout']).toEqual(['social discovery']);
  });

  it('keeps everything the facts derive alongside them', () => {
    // An extension that quietly replaced the node would be a worse version of
    // writing the graph by hand.
    const graph = buildGraph(FACTS, { extend: { organisation: { logo: '/icon.png' } } });
    const org = nodeOf(graph, 'Organization');

    expect(org['legalName']).toBe(FACTS.organisation.legalName);
    expect(org['identifier']).toBeDefined();
    expect(org['founder']).toEqual({ '@id': personId(FACTS.origin) });
  });

  it('extends the person and the website too', () => {
    const graph = buildGraph(FACTS, {
      extend: {
        person: { mainEntityOfPage: `${FACTS.origin}/about/` },
        website: { potentialAction: { '@type': 'SearchAction' } },
      },
    });

    expect(nodeOf(graph, 'Person')['mainEntityOfPage']).toBe(`${FACTS.origin}/about/`);
    expect(nodeOf(graph, 'WebSite')['potentialAction']).toBeDefined();
  });

  it('still emits no nulls, because an extension can carry undefined too', () => {
    // `compact` runs after the merge rather than before it, which is the only
    // ordering that holds. A site spreading an optional value in would
    // otherwise reintroduce exactly the null the builder exists to avoid.
    const document = buildStructuredData(FACTS, {
      extend: { organisation: { logo: undefined, award: [] } },
    });

    expect(JSON.stringify(document)).not.toContain('null');
    expect(nodeOf(document['@graph'] as Record<string, unknown>[], 'Organization')).not.toHaveProperty(
      'award',
    );
  });

  it('lets a site overwrite a derived claim, which is the risk it carries', () => {
    /**
     * Documented rather than prevented. The merge has to win for the feature to
     * be useful, so this asserts the sharp edge exists and is where it is said
     * to be: a site that overrides `legalName` here puts the graph and
     * `claimsOf` into disagreement, and the validator then checks the page
     * against a claim the page no longer makes.
     */
    const graph = buildGraph(FACTS, { extend: { organisation: { legalName: 'Something Else' } } });

    expect(nodeOf(graph, 'Organization')['legalName']).toBe('Something Else');
    expect(claimsOf(FACTS)).toContain(FACTS.organisation.legalName);
  });
});

describe('the fields the second consumer publishes', () => {
  const LOCAL = parseFacts({
    name: 'Method7',
    origin: 'https://www.method7.co.uk',
    description: 'A software studio in Salisbury.',
    organisation: {
      email: 'info@method7.co.uk',
      telephone: '+44 7971 389430',
      address: {
        street: '110 Milford Hill',
        locality: 'Salisbury',
        region: 'Wiltshire',
        postalCode: 'SP1 2QL',
        country: 'GB',
      },
    },
    person: { name: 'Simon Tregunna', jobTitle: 'Senior full-stack engineer' },
  });

  it('emits a full postal address when the site gave one', () => {
    // A local business is found on the street and the postcode. This is the
    // half of a listing that local search actually matches against.
    const address = nodeOf(buildGraph(LOCAL), 'Organization')['address'] as Record<string, unknown>;

    expect(address['streetAddress']).toBe('110 Milford Hill');
    expect(address['postalCode']).toBe('SP1 2QL');
    expect(address['addressLocality']).toBe('Salisbury');
  });

  it('omits the street entirely when the site did not', () => {
    const address = nodeOf(buildGraph(FACTS), 'Organization')['address'] as Record<string, unknown>;

    expect(address).not.toHaveProperty('streetAddress');
    expect(address).not.toHaveProperty('postalCode');
    expect(address['addressLocality']).toBe('Salisbury');
  });

  it('puts the telephone on the organisation and on the contact point', () => {
    // Both, because consumers read one or the other and neither is wrong.
    const org = nodeOf(buildGraph(LOCAL), 'Organization');
    const contact = org['contactPoint'] as Record<string, unknown>;

    expect(org['telephone']).toBe('+44 7971 389430');
    expect(contact['telephone']).toBe('+44 7971 389430');
  });

  it('leaves the contact point valid when there is no telephone', () => {
    const contact = nodeOf(buildGraph(FACTS), 'Organization')['contactPoint'] as Record<
      string,
      unknown
    >;

    expect(contact['email']).toBe(FACTS.organisation.email);
    expect(contact).not.toHaveProperty('telephone');
  });

  it('omits legalName rather than emitting nothing under it', () => {
    const org = nodeOf(buildGraph(LOCAL), 'Organization');

    expect(org).not.toHaveProperty('legalName');
    expect(org['name']).toBe('Method7');
    expect(JSON.stringify(buildStructuredData(LOCAL))).not.toContain('null');
  });
});
