import { z } from 'zod';
export declare const siteFactsSchema: z.ZodObject<{
    name: z.ZodString;
    origin: z.ZodURL;
    description: z.ZodString;
    locale: z.ZodDefault<z.ZodString>;
    organisation: z.ZodObject<{
        legalName: z.ZodOptional<z.ZodString>;
        registration: z.ZodOptional<z.ZodObject<{
            scheme: z.ZodString;
            number: z.ZodString;
        }, z.core.$strip>>;
        address: z.ZodOptional<z.ZodObject<{
            locality: z.ZodString;
            region: z.ZodOptional<z.ZodString>;
            street: z.ZodOptional<z.ZodString>;
            postalCode: z.ZodOptional<z.ZodString>;
            country: z.ZodString;
        }, z.core.$strip>>;
        email: z.ZodEmail;
        telephone: z.ZodOptional<z.ZodString>;
        sameAs: z.ZodDefault<z.ZodArray<z.ZodURL>>;
    }, z.core.$strip>;
    person: z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
        jobTitle: z.ZodString;
        url: z.ZodOptional<z.ZodURL>;
        sameAs: z.ZodDefault<z.ZodArray<z.ZodURL>>;
    }, z.core.$strip>>;
    alsoVisible: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type SiteFacts = z.infer<typeof siteFactsSchema>;
export type SiteFactsInput = z.input<typeof siteFactsSchema>;
/**
 * Parse and fail loudly.
 *
 * A malformed facts module should stop a build rather than produce a site that
 * is subtly wrong about who runs it.
 */
export declare const parseFacts: (input: unknown) => SiteFacts;
/**
 * Everything a page must be able to show, because the structured data says it.
 *
 * URLs are excluded on purpose. A profile link is asserted as an `href`, and
 * requiring the literal string in the rendered text would fail any page that
 * sensibly writes "LinkedIn" instead of the address. The visible-claims check
 * is about facts a reader can weigh, not about how a link is labelled.
 */
export declare const claimsOf: (facts: SiteFacts) => string[];
//# sourceMappingURL=facts.d.ts.map