import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetCommitDates, lastModified } from './lastModified.js';

/**
 * Against a real repository, built for the purpose.
 *
 * Mocking `git log` would test that the mock returns what the mock returns. The
 * two things worth being sure of — that the precision survives, and that a
 * committer's timezone cannot reorder commits — are both properties of what git
 * actually emits, so the only useful test makes commits.
 */

const REPO = '/tmp/discoverable-lastmodified-test';

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const at = (file: string) => `${REPO}/${file}`;

/** A commit at a stated instant, in a stated offset, so ordering can be checked. */
const commitAt = (file: string, contents: string, when: string) => {
  writeFileSync(at(file), contents);
  git('add', file);
  execFileSync('git', ['commit', '-q', '-m', `touch ${file}`], {
    cwd: REPO,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: when,
      GIT_COMMITTER_DATE: when,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.test',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.test',
    },
  });
};

beforeEach(() => {
  rmSync(REPO, { recursive: true, force: true });
  mkdirSync(REPO, { recursive: true });
  git('init', '-q', '-b', 'main');
  forgetCommitDates();
});

afterEach(() => {
  rmSync(REPO, { recursive: true, force: true });
  forgetCommitDates();
});

describe('lastModified', () => {
  it('keeps seconds, which is what lets two deploys in a day be told apart', () => {
    /**
     * The failure this precision exists for. Truncated to a date, the second
     * deploy of a day compares equal to the first, and an IndexNow diff
     * computed from the sitemap reports that nothing changed.
     */
    commitAt('page.md', 'one', '2026-09-17T09:15:30+00:00');

    const result = lastModified(['page.md'], { cwd: REPO });

    expect(result).toBe('2026-09-17T09:15:30.000Z');
    expect(result).not.toBe('2026-09-17');
  });

  it('takes the newest across the files a page is built from', () => {
    // A route rendered from a data module does not change when its own template
    // sits still, so it declares what it depends on and the newest wins.
    commitAt('template.astro', 'a', '2026-09-10T10:00:00+00:00');
    commitAt('data.ts', 'b', '2026-09-16T10:00:00+00:00');

    expect(lastModified(['template.astro', 'data.ts'], { cwd: REPO })).toBe(
      '2026-09-16T10:00:00.000Z',
    );
  });

  it('orders by instant, not by the committer’s clock', () => {
    /**
     * `%cI` carries the committer's own offset, so the same morning can be
     * written two ways that sort one way as text and the other way as time.
     *
     * These two are chosen so the answers disagree. 06:00+01:00 is 05:00Z;
     * 01:00-05:00 is 06:00Z, an hour later. Compared as strings the first one
     * wins, because "06" is after "01" and the offset is never read. The later
     * commit is the second.
     */
    commitAt('looks-later.md', 'a', '2026-09-17T06:00:00+01:00');
    commitAt('is-later.md', 'b', '2026-09-17T01:00:00-05:00');

    const newest = lastModified(['looks-later.md', 'is-later.md'], { cwd: REPO });

    expect(newest).toBe('2026-09-17T06:00:00.000Z');
    expect(newest).not.toBe('2026-09-17T05:00:00.000Z');
  });

  it('returns null for a file git has never seen', () => {
    // A shallow clone has no history, and inventing today's date is exactly the
    // unreliable lastmod the whole module exists to avoid.
    expect(lastModified(['never-committed.md'], { cwd: REPO })).toBeNull();
  });

  it('returns null outside a repository, rather than throwing', () => {
    expect(lastModified(['anything.md'], { cwd: '/tmp' })).toBeNull();
  });

  it('returns null when asked about nothing', () => {
    expect(lastModified([], { cwd: REPO })).toBeNull();
  });

  it('asks git once per file, however many pages depend on it', () => {
    // A layout is a dependency of every route. Ten routes asking about it and
    // their own template is fifty processes to answer eleven questions.
    commitAt('shared.css', 'a', '2026-09-17T10:00:00+00:00');

    const first = lastModified(['shared.css'], { cwd: REPO });
    rmSync(`${REPO}/shared.css`);
    const second = lastModified(['shared.css'], { cwd: REPO });

    // Deleted from disk and still answered, which it could only do from cache.
    expect(second).toBe(first);
  });
});
