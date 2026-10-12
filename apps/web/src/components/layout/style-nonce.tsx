'use client';

import { setNonce } from 'get-nonce';

/**
 * Gives Radix's runtime <style> injection (scroll lock in dialogs) the per-request
 * CSP nonce, so production CSP can require a nonce for <style> elements instead of
 * allowing any inline style block. Renders nothing.
 */
export function StyleNonce({ nonce }: { readonly nonce: string | undefined }) {
  if (nonce && typeof window !== 'undefined') setNonce(nonce);
  return null;
}
