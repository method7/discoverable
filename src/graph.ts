import { type SiteFacts } from './facts.js';

/**
 * The structured data, built from the facts rather than written out per site.
 *
 * This is the other half of the loop `claimsOf` opened. That function says what
 * a page must be able to show; this one emits the graph that makes the demand.
 * Both read the same declaration, and `graph.test.ts` asserts they agree, so
 * neither can gain a fact the other does not know about.
 *
 * ── What it emits, and what it deliberately leaves to the site ────────────
 *
 * Three nodes: the organisation, the website, and the person behind it. Those
 * are the ones every site has and the ones built entirely from facts.
 *
 * Everything else is the site's own. A `FAQPage` needs questions somebody
 * wrote, a `HowTo` needs steps in a product's own vocabulary, a
 * `MobileApplication` needs a release state, and an `offerCatalog` needs
 * services with prices. None of that is derivable from a company record, and a
 * package that tried to model it would end up modelling one site's content and
 * calling it a standard. `extra` is where they go, and they join the same
 * `@graph` with the same `@id`s available to point at.
 *
 * ── Why the nodes cross-reference by `@id` ───────────────────────────────
 *
 * A graph where the organisation names its founder inline and the person names
 * their employer inline is two descriptions of one relationship that can
 * disagree. Pointing both at an `@id` makes them one fact stated once, and lets
 * a consumer follow it in either direction.
 */

export interface GraphOptions {
  /**
   * A more specific schema.org type for the organisation.
   *
   * `Organization` suits most things. A consultancy is a `ProfessionalService`,
   * a shop is a `LocalBusiness`, and the more specific type is worth using when
   * it is true: it is what lets a search engine show the right kind of result.
   * It must be a subtype of `Organization`, which is the caller's business to
   * know.
   */
  readonly organisationType?: string;

  /**
   * Nodes the site builds itself, appended to the graph.
   *
   * Use `organisationId`, `websiteId` and `personId` to point at the nodes
   * above rather than repeating their contents.
   */
  readonly extra?: readonly Record<string, unknown>[];

  /**
   * Extra properties merged onto the three derived nodes.
   *
   * The facts schema carries what is true of every organisation. A logo, a
   * slogan, a list of what the company knows about, and the page that is
   * principally about the founder are all true of *this* one, and modelling
   * them here would be modelling one site's content and calling it a standard.
   *
   * This is the joint the first consumer needed. delulu.energy's graph asserted
   * `logo`, `image`, `slogan` and `knowsAbout` on its Organization and
   * `mainEntityOfPage` on its Person, and adopting the package without this
   * would have meant quietly dropping five true statements to fit a schema. A
   * shared builder that costs a site facts it was already publishing is not
   * worth adopting.
   *
   * Merged over the derived properties, so a site can also correct one. That is
   * deliberate and worth being careful with: overriding `legalName` here would
   * put the graph and `claimsOf` into disagreement, and the validator would
   * then be checking the page against a claim the page no longer makes.
   */
  readonly extend?: {
    readonly organisation?: Record<string, unknown>;
    readonly person?: Record<string, unknown>;
    readonly website?: Record<string, unknown>;
  };
}

export const organisationId = (origin: string): string => `${origin}/#organization`;
export const websiteId = (origin: string): string => `${origin}/#website`;
export const personId = (origin: string): string => `${origin}/#person`;

/**
 * Undefined properties are dropped rather than emitted as null.
 *
 * A JSON-LD consumer reading `"legalName": null` has been told the site has no
 * legal name, which is a different and worse claim than saying nothing.
 */
const compact = (node: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(node).filter(([, value]) => {
      if (value === undefined) return false;
      return !(Array.isArray(value) && value.length === 0);
    }),
  );

const organisationNode = (
  facts: SiteFacts,
  options: GraphOptions,
): Record<string, unknown> => {
  const { organisation: org } = facts;

  return compact({
    '@type': options.organisationType ?? 'Organization',
    '@id': organisationId(facts.origin),
    name: facts.name,
    legalName: org.legalName,
    url: facts.origin,
    description: facts.description,

    /**
     * Named by scheme, not emitted as a bare number.
     *
     * `identifier: "12345678"` tells a reader nothing they can act on.
     * A `PropertyValue` says which register to look it up in, which is the
     * difference between a claim and a checkable one.
     */
    identifier:
      org.registration === undefined
        ? undefined
        : {
            '@type': 'PropertyValue',
            propertyID: org.registration.scheme,
            value: org.registration.number,
          },

    address:
      org.address === undefined
        ? undefined
        : compact({
            '@type': 'PostalAddress',
            addressLocality: org.address.locality,
            addressRegion: org.address.region,
            addressCountry: org.address.country,
          }),

    sameAs: [...org.sameAs],

    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'enquiries',
      email: org.email,
      availableLanguage: facts.locale,
    },

    founder: facts.person === undefined ? undefined : { '@id': personId(facts.origin) },

    ...(options.extend?.organisation ?? {}),
  });
};

const personNode = (
  facts: SiteFacts,
  options: GraphOptions,
): Record<string, unknown> | undefined => {
  const { person } = facts;
  if (person === undefined) return undefined;

  return compact({
    '@type': 'Person',
    '@id': personId(facts.origin),
    name: person.name,
    jobTitle: person.jobTitle,
    url: person.url,
    /**
     * The load-bearing field, and the reason the person node exists.
     *
     * A name is an island. A name with links that resolve to the same person
     * elsewhere is what lets a search engine decide that this one and the one
     * on LinkedIn are the same human, and without it every mention is
     * unconnected to every other.
     */
    sameAs: [...person.sameAs],
    worksFor: { '@id': organisationId(facts.origin) },

    ...(options.extend?.person ?? {}),
  });
};

const websiteNode = (facts: SiteFacts, options: GraphOptions): Record<string, unknown> =>
  compact({
    '@type': 'WebSite',
    '@id': websiteId(facts.origin),
    url: facts.origin,
    name: facts.name,
    description: facts.description,
    publisher: { '@id': organisationId(facts.origin) },
    inLanguage: facts.locale,

    ...(options.extend?.website ?? {}),
  });

/** The `@graph` array. Rendering it into a script tag is the site's business. */
export const buildGraph = (
  facts: SiteFacts,
  options: GraphOptions = {},
): Record<string, unknown>[] => {
  const person = personNode(facts, options);

  return [
    organisationNode(facts, options),
    ...(person === undefined ? [] : [person]),
    websiteNode(facts, options),
    ...(options.extra ?? []),
  ];
};

/**
 * The whole document, ready to be serialised into a script tag.
 *
 * Separate from `buildGraph` so a site that wants to inspect or extend the
 * nodes can, without having to unwrap a context it did not ask for.
 */
export const buildStructuredData = (
  facts: SiteFacts,
  options: GraphOptions = {},
): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@graph': buildGraph(facts, options),
});
