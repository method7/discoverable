/**
 * An image's real dimensions and type, read out of its header at build time.
 *
 * Every scraper trusts `og:image:width`, `:height` and `:type` over the file
 * itself, so a declared figure that has drifted produces a preview that
 * reserves the wrong space, crops, or drops the image entirely. It is also the
 * sort of mistake nothing catches: a stale width survives every test in a
 * repository and is only ever seen by somebody sharing the page.
 *
 * The Next version of this measured one file, `og.png`, inside the progress
 * generator. That was enough while every page shared one card, and stopped
 * being enough the day /about/ started declaring its own poster: it announced
 * a hand-typed 1024×1536 and inherited nothing else, so the picture had no
 * stated type and no alt text. Measuring per page is the fix, and it costs a
 * file read.
 *
 * Only the three formats this site serves are handled. Anything else, or an
 * unreadable file, returns null and the caller omits the tags rather than
 * stating something untrue.
 *
 * Both sites grew their own copy of this, byte-for-byte the same decisions
 * about three file formats, which is what a shared package is for. Neither had
 * a test; this one does, against real bytes rather than a fixture somebody
 * wrote from the specification.
 */
export interface ImageFacts {
    readonly width: number;
    readonly height: number;
    readonly mime: string;
}
/**
 * @param publicPath root-relative path as the page writes it, e.g. `/og.png`
 * @param publicDir  the directory that path is relative to, usually `public`
 */
export declare const imageSize: (publicPath: string, publicDir: string) => ImageFacts | null;
//# sourceMappingURL=imageSize.d.ts.map