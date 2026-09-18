# @method7/discoverable

Being found, and being honest about it.

The parts of search, share and crawler work that are the same whatever built the
site: a schema for the facts, a builder for the structured data, `llms.txt`,
IndexNow, and a validator that reads the **built output** rather than the code
that produced it.

---

## Why this exists

Two method7 sites independently grew the same four things, and they drifted.

`delulu.energy` (Next) and `method7.co.uk` (Astro) each ended up with a facts
module, a JSON-LD emitter, an IndexNow submitter and a
last-modified-from-git helper. Four jobs, eight implementations, no shared line
between them.

That is not merely untidy. In September 2026, IndexNow on delulu.energy was
submitting **every URL on every deploy** — the one thing the protocol asks you
not to do, and with a daily scheduled deploy it would have claimed four pages
changed every morning, forever. method7.co.uk had already hit that, already
fixed it, and had already learned the follow-on problem: with `lastmod`
truncated to `YYYY-MM-DD`, the second deploy of a day looks identical to the
first, so real edits go unannounced.

None of that reached delulu until somebody happened to say "go and look at the
other repo".

**The fix a package buys you is not fewer lines. It is that a fix found once is
fixed everywhere.**

---

## The principle

> **Share the mechanism and the contract. Never the content.**

| | Here | In your site |
| --- | --- | --- |
| Facts | the schema | the values |
| Structured data | the graph builder | which nodes, and the copy in them |
| `llms.txt` | the builder | the sections and their words |
| IndexNow | all of it | the key |
| Design | contrast rules, palette-to-CSS | the hexes, the fonts, what each colour means |
| Copy | nothing | all of it |

The last row is the important one. A palette is good *because* one colour means
exactly one thing on that product. Generalise that and you keep the machinery
and lose the judgement, which was the only part worth having.

The same goes for what a site claims about itself. This package can carry the
shape of a company record. It cannot carry whether the claims in one are true,
and sharing the structure is an invitation to fill it in mechanically. Every
site says who it is in its own words.

---

## What is in it

### `siteFactsSchema` and `claimsOf`

One declaration of what a site says about itself. Everything else is derived
from it.

```ts
import { parseFacts, claimsOf } from '@method7/discoverable';

export const facts = parseFacts({
  name: 'Acme',
  origin: 'https://example.com',
  description: 'A company that makes things.',
  organisation: {
    legalName: 'Acme Ltd',
    email: 'hello@example.com',
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

claimsOf(facts);
// ['Acme Ltd', '12345678', 'Salisbury', 'hello@example.com',
//  'Simon Tregunna', 'Founder and CTO']
```

**The derivation is the point.** The validator used to be handed the strings to
check, and that is the joint where this kind of tool quietly stops working:
somebody adds a company number to the graph, forgets the list, and the check
goes on passing while covering one fewer thing than anybody believes. Here the
fact and the requirement are the same declaration, so a claim cannot be added
without the validator knowing to check it.

Not every field is a claim. A description is how a site introduces itself and a
canonical URL is plumbing, and requiring them as literal text would mean asking
a page to quote its own meta description at the reader. A company number is
different, and so is a registered locality, a contact address, and the name and
role of the human behind it. URLs are excluded too: a profile is asserted as an
`href`, and requiring the address in the rendered text would fail any page that
sensibly writes "LinkedIn" instead.

The address block takes a town and a country and no street, deliberately. A
registered address is public on the relevant register and usually belongs in a
privacy policy where naming the controller is a legal requirement; putting it in
structured data is a different act, and for a small company that line is
frequently somebody's home.

### `validateBuild(dir, facts)`

Reads HTML and XML off disk and returns findings. It knows nothing about any
framework, which is the entire design.

```ts
import { validateBuild } from '@method7/discoverable';
import { facts } from './facts';

const findings = validateBuild('dist', facts);

for (const f of findings) console.error(`${f.where}: ${f.problem}`);
if (findings.length > 0) process.exit(1);
```

It checks that:

- **every fact the JSON-LD asserts is readable on the page.** Structured data
  that claims more than the page shows is what search engines penalise, and a
  page that tells a machine it has a founder while telling a reader nothing is a
  page with two stories.
- **the sitemap covers every route**, with a `lastmod` precise enough to tell
  two deploys in one day apart. Google drops the field across a whole site once
  it decides it is unreliable, so a wrong date is worse than none.
- **the declared share card exists and is described.** A stale
  `og:image:width` survives every test in a repository and is seen only by
  somebody sharing the page.
- **canonical agrees with the sitemap.**
- **`robots.txt`, `sitemap.xml` and `llms.txt` are present and not empty.**

Error pages are excluded: a 404 belongs in no sitemap and correctly points its
canonical at the root.

#### Why output and not source

Source-level checks are easy to write and easy to fool. A structured-data
component can assert a founder while the page renders none. A generator can look
correct while the build emits an empty file. A colour can pass every palette
test and still be used for body text.

All three of those happened in one repository inside two days, and **not one of
them was visible from the module that caused it.** The built site is the only
place the claims and the evidence sit together.

Run it against the old build, migrate, run it again. A difference is a
regression rather than a matter of opinion.

### `parseSitemap(xml)` and `changedUrls(next, previous)`

IndexNow's useful half. Submit the **difference** between the sitemap that was
live a moment ago and the one just built, never the whole thing.

No state file is needed, because the live site is the state: fetch the sitemap
before the upload, compare after. A URL qualifies if it is new, or if its
`lastmod` is newer than the copy that was serving.

Only Bing's family is worth calling. Google removed its sitemap ping endpoint in
2023, so Search Console and a verification file are the mechanism there. One
POST reaches Bing, Yandex, Seznam and Naver, and Bing is what sits behind
ChatGPT search and DuckDuckGo.

---

## Use it

```bash
pnpm add @method7/discoverable
pnpm verify   # typecheck, lint, test
```

Node 22 or later. One runtime dependency, `zod`, for the schema. No framework
dependency of any kind, which is the part worth keeping: everything here reads
output or transforms data, so it should never need to know what rendered the
page.

---

## Not in here, on purpose

- **Rendering.** Emitting a `<script type="application/ld+json">` tag is four
  lines and differs per framework. The graph is portable; the tag is not.
- **Your facts.** They live in your repository, in one module, and this consumes
  them.
- **Copy.** See the principle.
- **A palette.** Contrast *rules* belong here eventually. Colours do not.

---

## Status

Early. Extracted from `delulu.energy` in September 2026, where every part of it
was load-bearing before it was lifted. That is deliberate: a framework extracted
from a working application beats one designed in a vacuum, because every piece
has had to survive a real site at least once.

**Roadmap, in order:**

1. ~~**A Zod schema for the facts**, with the validator's requirements derived
   from it.~~ **Done.** `siteFactsSchema` and `claimsOf`.
2. **The JSON-LD graph builder.** The other half of the same loop: the graph
   must emit exactly what `claimsOf` requires, and a test should assert it does,
   so the two cannot drift. Facts in, `@graph` out, node types as options.
3. **`llms.txt` and git `lastmod`**, both already pure in their home repos.
4. **Consumed by `delulu.energy`** during its move to Astro.
5. **Consumed by `method7.co.uk`.** This is the test. The second consumer is
   what proves generality, and the package should be expected to change when it
   lands.
6. **A static site template** that starts from this, so a new client site gets
   the whole arrangement on day one.

The template is the point of all of it. This package is the half that should
keep improving after a site ships; the template is the half every site rewrites
anyway. Getting that boundary wrong is the main way these efforts fail: too much
in the template and a bug like the IndexNow one happens again in six sites at
once, too much in the package and every new site spends its first day fighting
opinions it did not ask for.
