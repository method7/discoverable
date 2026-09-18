/** Only for tests, and for a long-running process that has pulled since. */
export declare const forgetCommitDates: () => void;
export interface LastModifiedOptions {
    /**
     * Where to run git.
     *
     * Defaults to the process's directory, which is right for a script run from a
     * repository root and wrong the moment one is not. `git log` resolves paths
     * against its own working directory, so asking about a file in another
     * checkout from here returns nothing at all — silently, and looking exactly
     * like a file with no history.
     */
    readonly cwd?: string;
}
/**
 * The newest commit across these files, as a UTC ISO instant, or null.
 *
 * Takes a list because a page is rarely one file. A route rendered from a data
 * module does not change when its own template sits still, so it should declare
 * what it is built from and take the newest of those dates.
 */
export declare const lastModified: (files: readonly string[], options?: LastModifiedOptions) => string | null;
//# sourceMappingURL=lastModified.d.ts.map