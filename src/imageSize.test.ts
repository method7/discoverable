import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { imageSize } from './imageSize.js';

/**
 * Against bytes, because the whole module is a claim about byte offsets.
 *
 * Both sites carried a copy of this and neither tested it, which is how a
 * wrong offset would have survived: the only symptom is an `og:image:width`
 * that disagrees with the picture, and that is seen by somebody sharing the
 * page rather than by anybody running a build.
 *
 * The headers below are constructed rather than copied from real files, so the
 * test says what each format actually specifies instead of asserting that one
 * particular PNG is 1200 wide.
 */

const DIR = '/tmp/discoverable-imagesize-test';

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
});
afterEach(() => rmSync(DIR, { recursive: true, force: true }));

const write = (name: string, bytes: Buffer) => writeFileSync(`${DIR}/${name}`, bytes);

/** PNG: signature, then an IHDR chunk with width and height big-endian at 16. */
const png = (width: number, height: number): Buffer => {
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
};

/** WebP lossy: RIFF/WEBP/VP8 , 14-bit dimensions after the start code. */
const webpLossy = (width: number, height: number): Buffer => {
  const buf = Buffer.alloc(40);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf.writeUInt16LE(width & 0x3fff, 26);
  buf.writeUInt16LE(height & 0x3fff, 28);
  return buf;
};

/** WebP extended: canvas size minus one, 24-bit little-endian. */
const webpExtended = (width: number, height: number): Buffer => {
  const buf = Buffer.alloc(40);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  const w = width - 1;
  const h = height - 1;
  buf[24] = w & 0xff;
  buf[25] = (w >> 8) & 0xff;
  buf[26] = (w >> 16) & 0xff;
  buf[27] = h & 0xff;
  buf[28] = (h >> 8) & 0xff;
  buf[29] = (h >> 16) & 0xff;
  return buf;
};

/** JPEG: a segment to skip, then an SOF0 carrying height before width. */
const jpeg = (width: number, height: number): Buffer => {
  const parts = [Buffer.from([0xff, 0xd8])];

  // An APP0 segment, so the reader has to walk past something to find the SOF.
  const app0 = Buffer.alloc(20);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(18, 2);
  parts.push(app0);

  const sof = Buffer.alloc(12);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(10, 2);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  parts.push(sof);

  return Buffer.concat(parts);
};

describe('imageSize', () => {
  it('reads a PNG out of its IHDR chunk', () => {
    write('og.png', png(1200, 630));

    expect(imageSize('/og.png', DIR)).toEqual({ width: 1200, height: 630, mime: 'image/png' });
  });

  it('reads a lossy WebP', () => {
    write('poster.webp', webpLossy(1024, 1536));

    expect(imageSize('/poster.webp', DIR)).toEqual({
      width: 1024,
      height: 1536,
      mime: 'image/webp',
    });
  });

  it('reads an extended WebP, which stores its size minus one', () => {
    // The off-by-one is in the format, not in the reader, and it is the detail
    // most likely to be got wrong by somebody reimplementing this.
    write('wide.webp', webpExtended(2000, 1000));

    expect(imageSize('/wide.webp', DIR)).toEqual({
      width: 2000,
      height: 1000,
      mime: 'image/webp',
    });
  });

  it('walks a JPEG to the frame header, past segments that are not one', () => {
    // JPEG is the only one of the three where the answer is not at a fixed
    // offset, and the only one where height precedes width.
    write('photo.jpg', jpeg(800, 600));

    expect(imageSize('/photo.jpg', DIR)).toEqual({ width: 800, height: 600, mime: 'image/jpeg' });
  });

  it('returns null for a remote image, rather than guessing', () => {
    expect(imageSize('https://example.test/og.png', DIR)).toBeNull();
  });

  it('returns null for a file that is not there', () => {
    // The caller omits the tags. A declared size for an unreadable file is the
    // exact failure this module exists to prevent.
    expect(imageSize('/missing.png', DIR)).toBeNull();
  });

  it('returns null for a format it does not handle', () => {
    write('drawing.svg', Buffer.from('<svg width="100" height="100"/>'));

    expect(imageSize('/drawing.svg', DIR)).toBeNull();
  });
});
