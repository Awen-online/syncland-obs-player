/**
 * Where am I running?
 *
 * OBS injects `window.obsstudio` into both Custom Browser Docks and Browser
 * Sources, so the page can tell OBS from a normal browser tab and stop making
 * the user guess which window they are supposed to be looking at.
 *
 * The UA check is a fallback for older builds that shipped the UA marker
 * before the JS bridge.
 */
export function isOBS() {
  if (typeof window === 'undefined') return false;
  if (window.obsstudio) return true;
  return /\bOBS\b/i.test(navigator.userAgent || '');
}

/** Version string when OBS exposes it, else ''. */
export function obsVersion() {
  try { return (window.obsstudio && window.obsstudio.pluginVersion) || ''; }
  catch (e) { return ''; }
}

/**
 * A Browser Source gets resized to the source's dimensions and has no
 * chrome; a Dock is a panel in the OBS UI. There is no official flag, so we
 * infer: overlay mode is only ever loaded as a Source, and that is the only
 * distinction the UI actually needs.
 */
export function surface() {
  const overlay = new URLSearchParams(location.search).get('mode') === 'overlay';
  if (!isOBS()) return overlay ? 'browser-overlay' : 'browser';
  return overlay ? 'obs-source' : 'obs-dock';
}

/**
 * The brand block in every screen header.
 *
 * In a browser it is a link home. The dock is a standalone app that never
 * boots WordPress, so it has no site chrome and no way back: anyone who
 * followed the Dock link in the main menu, or came from the launch post,
 * landed somewhere they could only leave with the back button.
 *
 * In OBS it stays inert markup. There the dock IS the destination, and a
 * link would navigate the panel away from the player with no way to return.
 */
export function brandHeader() {
  const logo  = '<img class="sp-logo" src="https://www.sync.land/wp-content/uploads/2024/06/cropped-SyncLand-Logo-optimized-192x192.png" alt="Sync.Land" width="28" height="28">';
  const brand = '<div class="sp-brand">Sync.Land <small>OBS Player</small></div>';
  return isOBS()
    ? logo + brand
    : `<a class="sp-home" href="https://www.sync.land/" title="Back to sync.land">${logo}${brand}</a>`;
}
