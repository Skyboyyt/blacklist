// Applies a stored explicit theme before first paint (no flash of the wrong theme).
// Loaded synchronously from <head> with the CSP nonce. "system" = no attribute.
// Keep the key in sync with src/lib/theme/theme.ts.
(function () {
  try {
    var t = window.localStorage.getItem('bl-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch {
    /* storage unavailable: fall back to the system preference */
  }
})();
