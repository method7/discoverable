import { z } from 'zod';

/**
 * What a site says about itself, declared once.
 *
 * This is the contract the whole package is built around. A site fills it in,
 * and everything else here is derived from it: the structured data a page
 * emits, and therefore what that page must be able to show.
 *
 * ── Why the claims are derived rather than listed ─────────────────────────
 *
 * The first version of the validator took the strings to check as an argument,
 * and that is the joint where this kind of tool quietly stops working. Somebody
 * adds a company number to the graph, forgets the list, and the check goes on
 * passing while covering one fewer thing than anybody believes.
 *
 * One declaration answers both questions instead. `claimsOf` returns exactly
 * what a page has to be able to show, computed from the same fields the graph
 * is built from, so a claim cannot be added without the validator knowing to
 * check it.
 *
 * ── Why not every field is a claim ────────────────────────────────────────
 *
 * A description is how a site introduces itself and a canonical URL is
 * plumbing. Neither is an assertion about a legal person, and requiring them to
 * appear as literal text would mean requiring a page to quote its own meta
 * description at the reader.
 *
 * A company number is different. So is a registered locality, a contact
 * address, and the name and role of the human behind it. Those are claims about
 * somebody real, they are the reason a sceptical reader believes the rest, and
 * a page that will tell a machine but not a visitor is a page with two stories.
 */

/** No trailing slash, so `${url}${route}` is never `//`. */
const origin = z
  .url()
  .refine((value) => !value.endsWith('/'), { message: 'Drop the trailing slash from url.' });

/**
 * Where a company is registered, named by scheme rather than assumed.
 *
 * "Company number" means something different in every jurisdiction, and a bare
 * number in structured data is a string nobody can look up. Naming the register
 * is what makes it checkable.
 */
const registration = z.object({
  /** e.g. "UK Companies House company number". */
  scheme: z.string().min(1),
  number: z.string().min(1),
});

/**
 * Where the organisation is. Town and country are required; the street is not.
 *
 * The default is deliberately coarse. A registered address is public on the
 * relevant register and usually belongs in a privacy policy, where naming the
 * controller is a legal requirement. Putting it in structured data is a
 * different act: it syndicates the line into knowledge panels and assistant
 * answers, and for a small company that address is frequently somebody's home.
 * A locality and a country carry the whole signal most sites want, which is
 * that this is a real organisation in a real place.
 *
 * But that is a default, not a rule, and the second consumer proved it. A
 * studio with a Google Business Profile publishes its street on purpose:
 * local search matches on it, the listing already carries it, and withholding
 * it costs the site the thing it is optimising for. The first consumer, a
 * consumer app, withholds the *same* address for the reason above.
 *
 * So both are expressible, and neither is the package's decision to make. Set
 * `street` only where somebody has decided it should be public.
 */
const address = z.object({
  locality: z.string().min(1),
  region: z.string().min(1).optional(),
  /** Opt in. See above: absent is the default for good reasons. */
  street: z.string().min(1).optional(),
  postalCode: z.string().min(1).optional(),
  /** ISO 3166-1 alpha-2. */
  country: z.string().length(2),
});

const organisation = z.object({
  /**
   * The entity that can hold copyright and answer a data request.
   *
   * Optional, because not every site has one. It was required, and the second
   * consumer is a trading name with no registered company behind it, which
   * would have had to invent a legal person to satisfy a schema. A field that
   * forces a site to state something untrue is worse than an absent field.
   */
  legalName: z.string().min(1).optional(),
  registration: registration.optional(),
  address: address.optional(),
  email: z.email(),
  /**
   * Published on purpose, or absent.
   *
   * A number somebody can ring is one of the strongest signals that an
   * organisation is real, and it is exactly the sort of thing a local search
   * result shows. It is also a direct line to a person, so like the street it
   * is opt-in rather than assumed.
   */
  telephone: z.string().min(1).optional(),
  /** Profiles that resolve to this organisation, not to the people in it. */
  sameAs: z.array(z.url()).default([]),
});

/**
 * The human, as something a machine can follow rather than a byline.
 *
 * `sameAs` is the load-bearing field and the reason this block exists at all. A
 * name is an island. A name with links that resolve to the same person
 * elsewhere is what lets a search engine or a founder-discovery platform decide
 * that this Simon Tregunna and the one on LinkedIn are one person, and without
 * it every mention of them is unconnected to every other.
 */
const person = z.object({
  name: z.string().min(1),
  jobTitle: z.string().min(1),
  url: z.url().optional(),
  sameAs: z.array(z.url()).default([]),
});

export const siteFactsSchema = z.object({
  name: z.string().min(1),
  origin,
  /** Under 155 characters, so a search result does not truncate it. */
  description: z.string().min(1).max(155),
  locale: z.string().min(2).default('en-GB'),

  organisation,
  /** Absent for a site with no named individual behind it. */
  person: person.optional(),

  /**
   * Anything else a page must show, for a site with claims this schema does not
   * model.
   *
   * An escape hatch, and one worth keeping small. Reaching for it often means a
   * field belongs in the schema, where it would be derived for every site
   * instead of remembered by one.
   */
  alsoVisible: z.array(z.string().min(1)).default([]),
});

export type SiteFacts = z.infer<typeof siteFactsSchema>;
export type SiteFactsInput = z.input<typeof siteFactsSchema>;

/**
 * Parse and fail loudly.
 *
 * A malformed facts module should stop a build rather than produce a site that
 * is subtly wrong about who runs it.
 */
export const parseFacts = (input: unknown): SiteFacts => siteFactsSchema.parse(input);

/**
 * Everything a page must be able to show, because the structured data says it.
 *
 * URLs are excluded on purpose. A profile link is asserted as an `href`, and
 * requiring the literal string in the rendered text would fail any page that
 * sensibly writes "LinkedIn" instead of the address. The visible-claims check
 * is about facts a reader can weigh, not about how a link is labelled.
 */
export const claimsOf = (facts: SiteFacts): string[] => {
  const claims = [
    facts.organisation.legalName,
    facts.organisation.registration?.number,
    facts.organisation.address?.locality,
    facts.organisation.address?.street,
    facts.organisation.address?.postalCode,
    facts.organisation.email,
    facts.organisation.telephone,
    facts.person?.name,
    facts.person?.jobTitle,
    ...facts.alsoVisible,
  ];

  return [...new Set(claims.filter((claim): claim is string => claim !== undefined))];
};
