/**
 * Display helpers for addresses and hashes. Display only: these never change the
 * canonical value used in URLs or API calls.
 */

/** Shorten the middle of a long identifier: `0x1234…cdef`. Short values are returned unchanged. */
export function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * Defang a URL so it cannot be clicked or auto-linked: `https://evil.example/x`
 * becomes `hxxps://evil[.]example/x`. Used for URLs taken from untrusted reports.
 */
export function defangUrl(value: string): string {
  return value.replace(/^http(s?):\/\//i, (_m, s: string) => `hxxp${s}://`).replace(/\./g, '[.]');
}

/** Decodes a route segment; malformed percent-encoding yields the raw value (then fails validation). */
export function safeDecodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
