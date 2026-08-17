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
