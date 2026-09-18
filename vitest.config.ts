import { defineConfig } from 'vitest/config';

/**
 * Plain Node, no environment.
 *
 * Everything here reads files and compares strings. A jsdom environment would
 * suggest this package knows about browsers, and the entire point is that it
 * does not: it checks output, so it is the same whatever produced it.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
