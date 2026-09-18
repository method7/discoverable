/**
 * Being found, and being honest about it.
 *
 * The parts of search, share and crawler work that are the same whatever built
 * the site. Extracted because two method7 sites had grown eight implementations
 * of four jobs and they had drifted: IndexNow was submitting every URL on every
 * deploy here while the other repository had already hit that, fixed it, and
 * learned the follow-on problem about date precision. The fix only travelled
 * because somebody remembered the other repository existed.
 *
 * What a package buys is not fewer lines. It is that a fix found once is fixed
 * everywhere.
 *
 * Deliberately absent: rendering, the facts themselves, and any copy. See the
 * README for why the last one is not an oversight.
 */
export * from './facts.js';
export * from './graph.js';
export * from './llms.js';
export * from './imageSize.js';
export * from './lastModified.js';
export * from './validate.js';
export * from './indexnow.js';
//# sourceMappingURL=index.d.ts.map