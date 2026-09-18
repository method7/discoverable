import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * @param publicPath root-relative path as the page writes it, e.g. `/og.png`
 * @param publicDir  the directory that path is relative to, usually `public`
 */
export const imageSize = (publicPath, publicDir) => {
    // A remote image has no header to read, and guessing one would be the exact
    // failure this exists to prevent.
    if (!publicPath.startsWith('/'))
        return null;
    let buf;
    try {
        buf = readFileSync(join(publicDir, publicPath));
    }
    catch {
        return null;
    }
    // PNG: IHDR is always the first chunk, dimensions big-endian at byte 16.
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), mime: 'image/png' };
    }
    // WebP: a RIFF container whose dimensions sit somewhere different in each of
    // the three variants.
    if (buf.length > 30 &&
        buf.toString('ascii', 0, 4) === 'RIFF' &&
        buf.toString('ascii', 8, 12) === 'WEBP') {
        const chunk = buf.toString('ascii', 12, 16);
        const mime = 'image/webp';
        // Lossy: 14-bit dimensions after the start code.
        if (chunk === 'VP8 ') {
            return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, mime };
        }
        // Lossless: 14 bits each, packed across four bytes, stored one less.
        if (chunk === 'VP8L') {
            const bits = buf.readUInt32LE(21);
            return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, mime };
        }
        // Extended: canvas size minus one, 24-bit little-endian.
        if (chunk === 'VP8X') {
            const width = buf[24] | (buf[25] << 8) | (buf[26] << 16);
            const height = buf[27] | (buf[28] << 8) | (buf[29] << 16);
            return { width: width + 1, height: height + 1, mime };
        }
        return null;
    }
    // JPEG: walk the segments to the start-of-frame, the only one carrying size.
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        let i = 2;
        while (i + 9 < buf.length) {
            if (buf[i] !== 0xff) {
                i++;
                continue;
            }
            const marker = buf[i + 1];
            // Any SOF marker except the three in that range that are not frames.
            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                return {
                    width: buf.readUInt16BE(i + 7),
                    height: buf.readUInt16BE(i + 5),
                    mime: 'image/jpeg',
                };
            }
            i += 2 + buf.readUInt16BE(i + 2);
        }
    }
    return null;
};
//# sourceMappingURL=imageSize.js.map