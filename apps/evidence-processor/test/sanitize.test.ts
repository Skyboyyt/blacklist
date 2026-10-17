import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { detectFormat, sanitize } from '../src/sanitize.ts';
import { MAX_INPUT_BYTES } from '../src/limits.ts';

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#c03030' } });

function riff(type: string, payload: Buffer) {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(payload.length);
  return Buffer.concat([Buffer.from(type), size, payload, Buffer.alloc(payload.length % 2)]);
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  // CRC is not checked before acTL detection; a zero CRC keeps the test small.
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
}

const u24 = (n: number) => Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]);

/** A two-frame animated WebP built by hand from a lossless 8x8 frame (sharp cannot write one from scratch). */
async function animatedWebp() {
  const still = await solid(8, 8).webp({ lossless: true }).toBuffer();
  const vp8l = still.subarray(12); // the VP8L chunk after the RIFF/WEBP header
  const frame = riff(
    'ANMF',
    Buffer.concat([u24(0), u24(0), u24(7), u24(7), u24(100), Buffer.from([0]), vp8l]),
  );
  const vp8x = riff('VP8X', Buffer.concat([Buffer.from([0x02, 0, 0, 0]), u24(7), u24(7)]));
  const anim = riff('ANIM', Buffer.from([0, 0, 0, 0, 0, 0]));
  const body = Buffer.concat([Buffer.from('WEBP'), vp8x, anim, frame, frame]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from('RIFF'), size, body]);
}

describe('sanitize', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    're-encodes a %s and keeps its format and size',
    async (format) => {
      const input = await solid(64, 32).toFormat(format).toBuffer();
      const result = await sanitize(input);
      expect(result).toMatchObject({ ok: true, format, width: 64, height: 32 });
      if (result.ok)
        expect(await sharp(result.bytes).metadata()).toMatchObject({ format, width: 64, height: 32 });
    },
  );

  it('strips EXIF (including GPS) and applies the orientation', async () => {
    const input = await solid(40, 20)
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Make: 'Phone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' } })
      .jpeg()
      .toBuffer();
    const before = await sharp(input).metadata();
    expect(before.exif?.includes(Buffer.from('Phone'))).toBe(true);
    expect(before.orientation).toBe(6);
    const result = await sanitize(input);
    if (!result.ok) throw new Error(result.reason);
    const meta = await sharp(result.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    // Orientation 6 means "rotate 90°", so the stored pixels are now 20 x 40.
    expect([result.width, result.height]).toEqual([20, 40]);
  });

  it('rejects types other than PNG, JPEG and WebP by their bytes, whatever they claim to be', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const gif = await solid(4, 4).gif().toBuffer();
    const tiff = await solid(4, 4).tiff().toBuffer();
    const html = Buffer.from('<!doctype html><p>hi</p>');
    for (const input of [svg, gif, tiff, html, Buffer.alloc(0)])
      expect(await sanitize(input)).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it('rejects a polyglot whose header says PNG but whose body is not a valid PNG', async () => {
    const png = await solid(8, 8).png().toBuffer();
    const forged = Buffer.concat([png.subarray(0, 8), Buffer.from('<html><script>x</script></html>')]);
    expect(await sanitize(forged)).toEqual({ ok: false, reason: 'decode_failed' });
  });

  it('rejects a truncated image instead of returning partial pixels', async () => {
    const jpeg = await solid(256, 256).jpeg().toBuffer();
    expect(await sanitize(jpeg.subarray(0, Math.floor(jpeg.length / 2)))).toEqual({
      ok: false,
      reason: 'decode_failed',
    });
  });

  it('rejects an animated WebP', async () => {
    const animated = await animatedWebp();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    expect(await sanitize(animated)).toEqual({ ok: false, reason: 'animated' });
  });

  it('rejects an animated PNG, which libvips would otherwise read as its first frame', async () => {
    const png = await solid(8, 8).png().toBuffer();
    const actl = chunk('acTL', Buffer.from([0, 0, 0, 2, 0, 0, 0, 0]));
    // Insert acTL right after the IHDR chunk (8-byte signature + 25-byte IHDR).
    const apng = Buffer.concat([png.subarray(0, 33), actl, png.subarray(33)]);
    expect((await sharp(apng).metadata()).format).toBe('png');
    expect(await sanitize(apng)).toEqual({ ok: false, reason: 'animated' });
  });

  it('rejects images over 12,000 px on a side or 40 megapixels (decompression bombs)', async () => {
    const wide = await solid(12_001, 1).png().toBuffer();
    expect(await sanitize(wide)).toEqual({ ok: false, reason: 'too_many_pixels' });
    // A tiny file that would decode to 100 megapixels.
    const bomb = await solid(10_000, 10_000).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(MAX_INPUT_BYTES);
    expect((await sanitize(bomb)).ok).toBe(false);
  });

  it('rejects input over 10 MiB before decoding', async () => {
    const png = await solid(8, 8).png().toBuffer();
    const big = Buffer.concat([png, Buffer.alloc(MAX_INPUT_BYTES)]);
    expect(await sanitize(big)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('detects formats from magic bytes only', () => {
    expect(detectFormat(Buffer.from('RIFF0000WEBPVP8 '))).toBe('webp');
    expect(detectFormat(Buffer.from('RIFF0000WAVEfmt '))).toBeNull();
    expect(detectFormat(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
