import sharp from 'sharp';
import {
  DECODE_TIMEOUT_SECONDS,
  MAX_INPUT_BYTES,
  MAX_PIXELS,
  MAX_SIDE,
  type ImageFormat,
  type RejectionReason,
} from './limits.ts';

// libvips can read many formats (SVG, TIFF, HEIF, GIF, PDF loaders...). The magic-byte
// check runs first so that only the PNG, JPEG and WebP loaders ever see hostile input.
sharp.cache(false);
sharp.concurrency(1);

export type Sanitized =
  | { ok: true; format: ImageFormat; bytes: Uint8Array<ArrayBuffer>; width: number; height: number }
  | { ok: false; reason: RejectionReason };

export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b))
    return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Decode, check, re-encode with no metadata. Any doubt rejects (fail closed). */
export async function sanitize(input: Uint8Array): Promise<Sanitized> {
  if (input.length > MAX_INPUT_BYTES) return { ok: false, reason: 'too_large' };
  const format = detectFormat(input);
  if (!format) return { ok: false, reason: 'unsupported_type' };
  const options = { limitInputPixels: MAX_PIXELS, failOn: 'warning', sequentialRead: true } as const;
  try {
    const meta = await sharp(input, options).metadata();
    if (meta.format !== format) return { ok: false, reason: 'unsupported_type' };
    if ((meta.pages ?? 1) !== 1) return { ok: false, reason: 'animated' };
    const { width, height } = meta;
    if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS)
      return { ok: false, reason: 'too_many_pixels' };
    // rotate() applies the EXIF orientation to the pixels; no metadata is written out.
    const pipeline = sharp(input, options).timeout({ seconds: DECODE_TIMEOUT_SECONDS }).rotate();
    const encoded =
      format === 'png'
        ? pipeline.png()
        : format === 'jpeg'
          ? pipeline.jpeg({ quality: 90, mozjpeg: true })
          : pipeline.webp({ quality: 90 });
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    return { ok: true, format, bytes: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    return { ok: false, reason: 'decode_failed' };
  }
}
