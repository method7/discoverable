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

The address block defaults to a town and a country and no street. A registered
address is public on the relevant register and usually belongs in a privacy
policy where naming the controller is a legal requirement; putting it in
structured data is a different act, and for a small company that line is
frequently somebody's home.

But that is a default, and the second consumer proved it should be. A studio
with a Google Business Profile publishes its street on purpose: local search
matches on it, and withholding it costs the site the thing it is optimising for.
So `street`, `postalCode` and `telephone` are all optional, all absent unless a
site opts in, and all treated as claims once present — a page that gives an
address to machines and not to readers is the thing this exists to catch.

`legalName` is optional too, for the same reason and against the same consumer:
it is a trading name with no registered company, and a field that forces a site
to invent a legal person is worse than an absent one.

### `buildGraph(facts, options?)`

The structured data, from the same declaration.

```ts
import { buildStructuredData, organisationId } from '@method7/discoverable';
import { facts } from './facts';

const data = buildStructuredData(facts, {
  organisationType: 'ProfessionalService',   // when that is true
  extra: [                                   // what the schema cannot derive
    { '@type': 'FAQPage', mainEntity: questions },
  ],
});
```

Three nodes come out of the facts: the organisation, the person behind it, and
the website. They cross-reference by `@id` rather than describing each other
inline, so the relationship between a founder and a company is one fact stated
once instead of two that can disagree.

Everything else is yours. A `FAQPage` needs questions somebody wrote, a `HowTo`
needs steps in a product's own vocabulary, a `MobileApplication` needs a release
state. None is derivable from a company record, and a package that modelled them
would be modelling one site's content and calling it a standard. `extra` joins
them to the same graph with the same `@id`s available to point at.

`extend` does the same job for the three derived nodes, and it is the joint the
first consumer needed:

```ts
buildStructuredData(facts, {
  extend: {
    organisation: { logo: `${facts.origin}/icon.png`, slogan, knowsAbout },
    person: { mainEntityOfPage: `${facts.origin}/about/` },
  },
});
```

delulu.energy's Organization already asserted a logo, a share image, a slogan and
what the company knows about, and its Person named the page principally about
them. Adopting a shared builder without somewhere to put those would have meant
dropping five true statements to fit a schema, and a shared builder that costs a
site facts it was already publishing is not worth adopting.

The merge wins over the derived properties, which is what makes it useful and
what makes it sharp. Overriding `legalName` there puts the graph and `claimsOf`
into disagreement, and the validator would then be checking the page against a
claim the page no longer makes. There is a test asserting that edge is exactly
where this says it is.

**The graph and the claims are held together by a test.** `claimsOf` says what a
page must show; `buildGraph` makes the assertion that demands it. If the graph
gains a claim-bearing field and the claims do not, the test fails — because
otherwise the validator would never ask a page to show it, and the site could
quietly start telling machines something it does not tell readers.

Two smaller decisions worth knowing: a company number is emitted as a
`PropertyValue` naming its register, because `identifier: "12345678"` is a
string nobody can look up; and nothing is emitted as `null`, because
`"legalName": null` tells a consumer the site has no legal name, which is worse
than saying nothing.

### `buildLlmsTxt(facts, options)`

`llms.txt` is a markdown file at the root saying plainly what a site is, so a
model does not have to infer it from navigation and marketing copy. "What is
this and why does it exist" is the question an assistant is actually asked, and
a feature list is a poor answer to it.

```ts
import { buildLlmsTxt } from '@method7/discoverable';
import { facts } from './facts';

writeFileSync('public/llms.txt', buildLlmsTxt(facts, {
  summary: 'Acme makes things. It is early, and it says so.',
  sections: [{ heading: 'What it does', body: '...' }],
}));
```

A section carries prose, a list of links, or both:

```ts
{ heading: 'Policies', links: [
  { title: 'Privacy', url: `${facts.origin}/privacy/`, notes: 'what is collected, and for how long' },
  { title: 'Terms', url: `${facts.origin}/terms/` },
]}
```

**The links are the half that is easy to get wrong.** Both sites wrote their URLs
bare inside sentences, which reads perfectly well to a person, and an audit
reported one of the files as containing no links at all. It was right:
`https://example.com/privacy/` in prose is a string, and the entire audience for
this file parses markdown. `validateBuild` checks for an H1 and at least one
markdown link now, because nothing did.

You bring the summary and the sections. It brings the frame and a **derived**
"Who makes it" block: the founder and their role, the company and its number,
where it is, how to reach it, every profile link. That block is the reason this
is a function rather than a template string in each repository — it was a
template string, and every fact in it was a second copy of something the facts
module already owned, pinned by a test that would have stayed green while the
file went stale.

`llmsMustMention(facts)` returns what the output has to contain, so a repository
can assert its generator has not quietly dropped a fact.

**Write the generator's output to disk, and test the artefact against it.** The
file lives in `public/`, so editing it by hand looks like it worked: the file
changes, the dev server serves it, review passes, and the next build silently
overwrites it. That is not a hypothetical — it happened here, and it was
reported as shipped.

### `lastModified(files, options?)`

The newest commit across the files a page is built from, as a UTC ISO instant,
or `null`.

```ts
import { lastModified } from '@method7/discoverable';

lastModified(['src/pages/about.astro', 'src/lib/facts.ts'], { cwd: repoRoot });
// '2026-09-17T09:15:30.000Z'
```

Three decisions, each of which was a bug first:

- **Seconds, not a date.** Truncated to `YYYY-MM-DD`, every deploy after the
  first one in a day looks identical to it, so an IndexNow diff reports that
  nothing changed and the real edits go unannounced.
- **Normalised to UTC.** `%cI` carries the committer's own offset, so
  `06:00+01:00` sorts after `01:00-05:00` as text and an hour before it in
  fact. Forcing `Z` makes lexicographic order match chronological order.
- **`null` rather than now.** A shallow clone has no history, and stamping the
  build time claims the whole site changed on every deploy. Google drops
  `lastmod` across an entire site once it decides the field is unreliable, so a
  confident wrong date is worse than an absent one. Omit the element. Check out
  with `fetch-depth: 0` in CI.

It takes a list because a page is rarely one file: a route rendered from a data
module does not change when its own template sits still. Results are cached per
file, because a layout is a dependency of every route and ten routes asking
about it and their own template is fifty processes to answer eleven questions.

`cwd` defaults to the process's directory, which is right for a script run from
a repository root and wrong the moment one is not — `git log` resolves paths
against its own directory, and a miss looks exactly like a file with no history.

### `imageSize(publicPath, publicDir)`

An image's real dimensions and type, read out of its header.

```ts
const facts = imageSize('/og.png', 'public');
// { width: 1200, height: 630, mime: 'image/png' }
```

Every scraper trusts `og:image:width`, `:height` and `:type` over the file, so a
figure that has drifted produces a preview that reserves the wrong space, crops,
or drops the image. Returns `null` for a remote image, an unreadable file or a
format it does not handle, and the caller omits the tags rather than stating
something untrue.

PNG, WebP (all three variants) and JPEG. Both sites had grown their own copy,
making the same decisions about the same three formats, and **neither had a
test** — which is how a wrong offset would have survived, since the only symptom
is seen by somebody sharing the page rather than by anybody running a build.

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
- **`robots.txt`, `sitemap.xml` and `llms.txt` are present and not empty**, and
  that `llms.txt` is the format it claims to be: exactly one H1, and at least one
  markdown link. Present-and-not-empty was the whole check until an audit
  reported a passing file as containing no links.

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
pnpm add github:method7/discoverable
```

A git dependency rather than a registry one, for now. The repository is public
and pnpm runs the package's `prepare` on install, so a clone builds itself to
`dist/` and there is nothing to publish and nothing to authenticate. Pin a
commit — `github:method7/discoverable#<sha>` — anywhere reproducibility matters
more than convenience.

```bash
pnpm verify   # typecheck, lint, test, build
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

Extracted from `delulu.energy` in September 2026, where every part of it was
load-bearing before it was lifted. That is deliberate: a framework extracted from
a working application beats one designed in a vacuum, because every piece has had
to survive a real site at least once.

Three sites use it now — a consumer app, a studio, and a judo club. Each of the
last two changed it, which is the useful part: the shape of a package is settled
by the consumers it did not anticipate.

**Roadmap, in order:**

1. ~~**A Zod schema for the facts**, with the validator's requirements derived
   from it.~~ **Done.** `siteFactsSchema` and `claimsOf`.
2. ~~**The JSON-LD graph builder.** The other half of the same loop: the graph
   must emit exactly what `claimsOf` requires, and a test should assert it does,
   so the two cannot drift.~~ **Done.** `buildGraph` and `buildStructuredData`.
3. ~~**`llms.txt` and git `lastmod`**, both already pure in their home
   repos.~~ **Done.** `buildLlmsTxt` and `lastModified`. Neither arrived
   unchanged: the attribution block is now derived from the facts rather than
   written out, and `lastModified` gained a `cwd` because both original callers
   happened to run from a repository root and neither had noticed it mattered.
4. ~~**Consumed by `delulu.energy`** during its move to Astro.~~ **Done.** It
   reads `facts.ts` for the graph, `llms.txt`, and the deploy's visible-claims
   check, and deleted its own IndexNow module. Three changes came back: `extend`,
   a `default` export condition, and `.js` on the relative imports. Adopting it
   found two defects in the consumer that nothing there could see — a meta
   description ten characters over the limit its own comment claimed, and an
   em-dash reaching the page from a delivery document.
5. ~~**Consumed by `method7.co.uk`.**~~ **Done, and it was the test.** The
   package held four opinions that were right once and wrong as a rule.
   `legalName` was required, and a trading name with no company behind it would
   have had to invent a legal person to satisfy it. The address had no street,
   on the good argument that for a small company it is frequently somebody's
   home — true as a default, wrong as a rule, because a studio with a Google
   Business Profile publishes its street on purpose and local search matches on
   it. `telephone` likewise. And `imageSize` came in from the other consumer,
   which had been measuring share images nobody else could. Adopting it found
   **22 pages asserting a job title no page displayed**, live for months.
6. ~~**A static site template**~~ **Done.** `method7/astro-site-template`, built
   from the two sites and then handed a third it knew nothing about: a judo club
   on a 2014 Bootstrap build. That one found the fifth opinion — `email` was
   required, and a required field invites the wrong repair. An `info@` address
   was invented to satisfy it, put on the page and into the structured data, and
   caught only by reading the old site's mail script. Optional now, with a
   refinement that an organisation must publish *something* to be reached by.

**Next:** publish to npm. Three consumers currently install from a tarball URL,
because npm cannot build a git dependency and will crash resolving one. That is
a workaround with a committed `dist/` holding it up, and it is the last thing
here that only works because somebody knows why it is like that.

The template is the point of all of it. This package is the half that should
keep improving after a site ships; the template is the half every site rewrites
anyway. Getting that boundary wrong is the main way these efforts fail: too much
in the template and a bug like the IndexNow one happens again in six sites at
once, too much in the package and every new site spends its first day fighting
opinions it did not ask for.
