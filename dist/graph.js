import {} from './facts.js';
export const organisationId = (origin) => `${origin}/#organization`;
export const websiteId = (origin) => `${origin}/#website`;
export const personId = (origin) => `${origin}/#person`;
/**
 * Undefined properties are dropped rather than emitted as null.
 *
 * A JSON-LD consumer reading `"legalName": null` has been told the site has no
 * legal name, which is a different and worse claim than saying nothing.
 */
const compact = (node) => Object.fromEntries(Object.entries(node).filter(([, value]) => {
    if (value === undefined)
        return false;
    return !(Array.isArray(value) && value.length === 0);
}));
const organisationNode = (facts, options) => {
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
        identifier: org.registration === undefined
            ? undefined
            : {
                '@type': 'PropertyValue',
                propertyID: org.registration.scheme,
                value: org.registration.number,
            },
        address: org.address === undefined
            ? undefined
            : compact({
                '@type': 'PostalAddress',
                // Absent unless the site opted in. See the note in facts.ts.
                streetAddress: org.address.street,
                addressLocality: org.address.locality,
                addressRegion: org.address.region,
                postalCode: org.address.postalCode,
                addressCountry: org.address.country,
            }),
        sameAs: [...org.sameAs],
        telephone: org.telephone,
        contactPoint: compact({
            '@type': 'ContactPoint',
            contactType: 'enquiries',
            email: org.email,
            telephone: org.telephone,
            availableLanguage: facts.locale,
        }),
        founder: facts.person === undefined ? undefined : { '@id': personId(facts.origin) },
        ...(options.extend?.organisation ?? {}),
    });
};
const personNode = (facts, options) => {
    const { person } = facts;
    if (person === undefined)
        return undefined;
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
const websiteNode = (facts, options) => compact({
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
export const buildGraph = (facts, options = {}) => {
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
export const buildStructuredData = (facts, options = {}) => ({
    '@context': 'https://schema.org',
    '@graph': buildGraph(facts, options),
});
//# sourceMappingURL=graph.js.map