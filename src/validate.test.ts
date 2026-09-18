import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseFacts } from './facts.js';
import { validateBuild, routesIn } from './validate.js';

/**
 * The validator, checked against builds made on purpose to be wrong.
 *
 * A checker nobody has watched fail is a checker that returns an empty array
 * for the wrong reason. Every case here constructs the defect it is meant to
 * catch, because the two findings this tool produced on its first real run were
 * both false positives, and only building the failures deliberately showed
 * which of them were its fault.
 */

const ROOT = join('/tmp', 'delulu-validate-test');

/**
 * A real facts object rather than a bag of strings.
 *
 * Parsed rather than cast, so these tests also assert the schema accepts the
 * shape a site would actually write, and the claims they check are the ones
 * `claimsOf` derives rather than a list kept in step by hand.
 */
const FACTS = parseFacts({
  name: 'Acme',
  origin: 'https://example.test',
  description: 'A company that makes things.',
  organisation: {
    legalName: 'Acme Ltd',
    registration: { scheme: 'UK Companies House company number', number: '12345678' },
    email: 'hello@example.test',
  },
});

const page = (options: { graph?: string; body?: string; canonical?: string; og?: boolean }) => `
<!doctype html><html><head>
<link rel="canonical" href="${options.canonical ?? 'https://example.test/'}"/>
${options.og === false ? '' : '<meta property="og:image" content="https://example.test/og.png"/><meta property="og:image:width" content="1200"/>'}
${options.graph === undefined ? '' : `<script type="application/ld+json">${options.graph}</script>`}
</head><body>${options.body ?? ''}</body></html>`;

const build = (files: Record<string, string>) => {
  rmSync(ROOT, { recursive: true, force: true });
  for (const [path, contents] of Object.entries(files)) {
    const full = join(ROOT, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, contents);
  }
  return ROOT;
};

/** The shape of a build with nothing wrong with it. */
const sound = (extra: Record<string, string> = {}) =>
  build({
    'index.html': page({ graph: '{"name":"Acme Ltd"}', body: 'Made by Acme Ltd.' }),
    'robots.txt': 'User-agent: *',
    // An H1 and at least one markdown link. The first version of this fixture
    // was `# Acme`, which passed because the only check was "not empty" — the
    // fixture for a sound build carried the very defect an audit later found in
    // a real one.
    'llms.txt': '# Acme\n\n## Pages\n\n- [Home](https://example.test/): the site\n',
    'og.png': 'not really a png, but not empty',
    'sitemap.xml':
      '<urlset><url><loc>https://example.test/</loc><lastmod>2026-09-18T10:00:00.000Z</lastmod></url></urlset>',
    ...extra,
  });

afterEach(() => rmSync(ROOT, { recursive: true, force: true }));

describe('a sound build', () => {
  it('produces no findings, so a pass means something', () => {
    expect(validateBuild(sound(), FACTS)).toEqual([]);
  });

  it('finds the pages, and ignores error pages', () => {
    // A 404 belongs in no sitemap and its canonical points at the root, both
    // correctly. Judging it produced two findings that were the validator
    // misreading the build rather than the build being wrong.
    const dir = sound({ '404/index.html': page({ canonical: 'https://example.test/' }) });
    expect(routesIn(dir)).toEqual(['/']);
  });
});

describe('claims the page does not support', () => {
  it('catches structured data asserting what is not visible', () => {
    const dir = sound({
      'index.html': page({ graph: '{"identifier":"12345678"}', body: 'Made by Acme Ltd.' }),
    });

    expect(validateBuild(dir, FACTS)).toEqual([
      { where: '/', problem: 'structured data asserts "12345678" and the page does not show it' },
    ]);
  });

  it('allows a fact written in a different case', () => {
    // A footer may say "acme ltd" inside a sentence and still be showing it.
    const dir = sound({
      'index.html': page({ graph: '{"name":"Acme Ltd"}', body: 'made by acme ltd' }),
    });

    expect(validateBuild(dir, FACTS)).toEqual([]);
  });

  it('ignores a fact the structured data does not claim', () => {
    // The rule is "do not claim more than you show", not "show everything".
    const dir = sound({ 'index.html': page({ graph: '{}', body: 'Nothing in particular.' }) });
    expect(validateBuild(dir, FACTS)).toEqual([]);
  });
});

describe('the sitemap', () => {
  it('catches a page that was built and not listed', () => {
    const dir = sound({
      'about/index.html': page({ canonical: 'https://example.test/about/', body: 'Acme Ltd' }),
    });

    expect(validateBuild(dir, FACTS)).toContainEqual({
      where: 'sitemap.xml',
      problem: 'https://example.test/about/ was built but is not listed',
    });
  });

  it('catches a date-only lastmod, which cannot tell two deploys apart', () => {
    const dir = sound({
      'sitemap.xml': '<urlset><url><loc>https://example.test/</loc><lastmod>2026-09-18</lastmod></url></urlset>',
    });

    expect(validateBuild(dir, FACTS)[0]?.problem).toContain('date-only lastmod');
  });

  it('catches an entry with no date at all', () => {
    const dir = sound({ 'sitemap.xml': '<urlset><url><loc>https://example.test/</loc></url></urlset>' });
    expect(validateBuild(dir, FACTS)[0]?.problem).toContain('has no lastmod');
  });
});

describe('the share card', () => {
  it('catches an og:image that is not in the build', () => {
    const dir = sound();
    rmSync(join(dir, 'og.png'));

    expect(validateBuild(dir, FACTS)).toContainEqual({
      where: '/',
      problem: 'og:image /og.png is not in the build',
    });
  });

  it('catches a page with no share card at all', () => {
    const dir = sound({ 'index.html': page({ og: false, body: 'Acme Ltd' }) });
    expect(validateBuild(dir, FACTS)).toContainEqual({ where: '/', problem: 'no og:image' });
  });
});

describe('what is simply missing', () => {
  it('catches an llms.txt with no links in it', () => {
    /**
     * The finding a third-party audit reported, against a file that passed
     * every check in this repository: "File does not appear to contain any
     * links."
     *
     * It was accurate. Every URL was written bare inside a sentence, which
     * reads perfectly well to a person and gives a consumer parsing markdown
     * nothing to follow, in a file whose entire audience parses markdown.
     */
    const dir = sound({
      'llms.txt': '# Acme\n\nEverything is at https://example.test/ and that is that.\n',
    });

    expect(validateBuild(dir, FACTS)).toContainEqual({
      where: 'llms.txt',
      problem: 'contains no markdown links, so nothing in it can be followed',
    });
  });

  it('accepts a relative link and a mailto:, which are both real links', () => {
    const dir = sound({
      'llms.txt': '# Acme\n\n- [About](/about/)\n- [Email](mailto:hello@example.test)\n',
    });

    expect(validateBuild(dir, FACTS).filter((f) => f.where === 'llms.txt')).toEqual([]);
  });

  it('catches an llms.txt with no H1, because the format names one thing', () => {
    const dir = sound({ 'llms.txt': '## Pages\n\n- [Home](https://example.test/)\n' });

    expect(validateBuild(dir, FACTS)).toContainEqual({
      where: 'llms.txt',
      problem: 'has no H1 naming the site',
    });
  });

  it('catches more than one H1, which names two things', () => {
    const dir = sound({
      'llms.txt': '# Acme\n\n- [Home](https://example.test/)\n\n# Acme Again\n',
    });

    expect(validateBuild(dir, FACTS)).toContainEqual({
      where: 'llms.txt',
      problem: 'has 2 H1 headings; the format names one thing',
    });
  });

  it('catches a missing llms.txt, which nothing else would notice', () => {
    const dir = sound();
    rmSync(join(dir, 'llms.txt'));

    expect(validateBuild(dir, FACTS)).toContainEqual({
      where: 'llms.txt',
      problem: 'missing from the build',
    });
  });

  it('refuses to pass a build directory that is not there', () => {
    // The failure that would otherwise read as success: nothing to check, so
    // nothing wrong.
    expect(validateBuild('/tmp/definitely-not-a-build', FACTS)).toHaveLength(1);
  });
});

describe('the loop between the schema and the build', () => {
  /**
   * The reason the claims are derived rather than passed in.
   *
   * Before this, the validator was handed the strings to check. Somebody could
   * add a company number to the structured data, forget the list, and the check
   * would go on passing while covering one fewer thing than anybody believed.
   * Here that is impossible: the fact and the requirement are the same
   * declaration.
   */
  it('requires a new fact to be visible without anybody updating a list', () => {
    const graph = '{"legalName":"Acme Ltd","identifier":"12345678"}';
    const body = 'Made by Acme Ltd.';
    const files = { 'index.html': page({ graph, body }) };

    const withoutNumber = parseFacts({
      name: 'Acme',
      origin: 'https://example.test',
      description: 'A company that makes things.',
      organisation: { legalName: 'Acme Ltd', email: 'hello@example.test' },
    });

    // Nothing asks for the number, so the page not showing it is not a finding.
    expect(validateBuild(sound(files), withoutNumber)).toEqual([]);

    const withNumber = parseFacts({
      name: 'Acme',
      origin: 'https://example.test',
      description: 'A company that makes things.',
      organisation: {
        legalName: 'Acme Ltd',
        email: 'hello@example.test',
        registration: { scheme: 'UK Companies House company number', number: '12345678' },
      },
    });

    // The same build, the same page, one more fact declared.
    expect(validateBuild(sound(files), withNumber)).toEqual([
      { where: '/', problem: 'structured data asserts "12345678" and the page does not show it' },
    ]);
  });
});
