/**
 * Themes.
 *
 * Applied as `data-theme` on <html> so every rule is a variable override and
 * no component needs to know a theme exists. The overlay accepts `?theme=` so
 * a Browser Source can be matched to a scene independently of the dock — they
 * are separate contexts and a streamer may well want a light lower third over
 * a dark control panel.
 */
export const THEMES = [
  { id: 'dark',     name: 'Dark',     hint: 'The default. Deep indigo.' },
  { id: 'light',    name: 'Light',    hint: 'For bright rooms and light scenes.' },
  { id: 'midnight', name: 'Midnight', hint: 'Near-black with a blue cast.' },
  { id: 'ember',    name: 'Ember',    hint: 'Warm, low and orange-led.' },
  { id: 'mono',     name: 'Mono',     hint: 'Neutral greys, colour only on accents.' },
];

const KEY = 'syncland_theme';

export function getTheme() {
  const t = localStorage.getItem(KEY);
  return THEMES.some((x) => x.id === t) ? t : 'dark';
}

let chan = null;
try { chan = new BroadcastChannel('syncland-theme'); } catch (e) {}

export function applyTheme(id, broadcast = true) {
  const t = THEMES.some((x) => x.id === id) ? id : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(KEY, t); } catch (e) {}
  // The overlay is a separate browsing context; without this it keeps whatever
  // theme it booted with until the source is refreshed.
  if (broadcast && chan) { try { chan.postMessage(t); } catch (e) {} }
  return t;
}

/** Live theme updates, for contexts that did not initiate the change. */
export function subscribeTheme(fn) {
  if (chan) chan.addEventListener('message', (e) => fn(e.data));
  window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) fn(e.newValue); });
}

/** Overlay: an explicit ?theme= wins, so the source is independent of the dock. */
export function applyThemeFromUrl() {
  const q = new URLSearchParams(location.search).get('theme');
  const t = THEMES.some((x) => x.id === q) ? q : getTheme();
  document.documentElement.setAttribute('data-theme', t);
  return t;
}
