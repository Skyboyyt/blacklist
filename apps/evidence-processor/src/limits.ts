// ADR 0004 §1: images only, with these limits. Shared by the sanitizer and the transfer code.
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
export const MAX_SIDE = 12_000;
export const DECODE_TIMEOUT_SECONDS = 20;
export const TRANSFER_TIMEOUT_MS = 30_000;
export const PROCESSOR_VERSION = 'sanitizer-1';

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export type RejectionReason =
  | 'too_large'
  | 'unsupported_type'
  | 'animated'
  | 'too_many_pixels'
  | 'decode_failed'
  | 'source_unavailable'
  | 'upload_failed';
