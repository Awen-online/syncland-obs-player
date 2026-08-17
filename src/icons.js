/**
 * Inline SVG icons.
 *
 * Drawn rather than set in a font: emoji speakers render inconsistently across
 * platforms and OBS's embedded Chromium, and the mute control was previously a
 * bare ● which told nobody anything. These inherit currentColor so they theme
 * for free.
 */
export function speakerIcon(muted) {
  const body = '<path d="M4 7.5h2.6L10 4.6v10.8L6.6 12.5H4A1 1 0 0 1 3 11.5v-3a1 1 0 0 1 1-1z" fill="currentColor"/>';
  return muted
    // speaker with an X: unambiguous, and legible at 14px
    ? `<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">${body}
         <path d="M13 7.5l4 5M17 7.5l-4 5" stroke="currentColor" stroke-width="1.7"
               stroke-linecap="round" fill="none"/></svg>`
    : `<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">${body}
         <path d="M12.6 7.2a4 4 0 0 1 0 5.6M14.8 5.3a7 7 0 0 1 0 9.4" stroke="currentColor"
               stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>`;
}
