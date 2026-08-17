/**
 * Now-playing bus between the dock and the overlay.
 *
 * In OBS the Custom Browser Dock and the Browser Source are separate browsing
 * contexts inside the same CEF instance, sharing an origin. So the dock can
 * simply publish what it is playing and the overlay can render it — which
 * means the overlay needs no token and no API calls of its own. That matters:
 * the Browser Source URL ends up on screen shares and in scene-collection
 * exports, so it must not carry a credential.
 *
 * Two transports, because neither is reliable alone:
 *   - BroadcastChannel: instant, but not persisted, so an overlay that loads
 *     after the dock started playing would show nothing.
 *   - localStorage: persists the last state for late joiners, and its
 *     `storage` event fires in *other* contexts (never the writer), which is
 *     exactly the direction we need.
 */

const KEY = 'syncland_now_playing';
const CH  = 'syncland-now-playing';

let channel = null;
try { channel = new BroadcastChannel(CH); } catch (e) { /* older CEF */ }

/**
 * @param {object|null} state null clears the overlay (stopped / nothing loaded)
 */
export function publishNowPlaying(state) {
  const payload = state ? { ...state, at: Date.now() } : null;
  try {
    if (payload) localStorage.setItem(KEY, JSON.stringify(payload));
    else localStorage.removeItem(KEY);
  } catch (e) { /* private mode */ }
  if (channel) { try { channel.postMessage(payload); } catch (e) {} }
}

/** Last published state, for an overlay that loads mid-stream. */
export function readNowPlaying() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/** @param {(state: object|null) => void} fn */
export function subscribeNowPlaying(fn) {
  if (channel) {
    channel.addEventListener('message', (e) => fn(e.data || null));
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    let v = null;
    try { v = e.newValue ? JSON.parse(e.newValue) : null; } catch (err) { v = null; }
    fn(v);
  });
}

/* ── Audio link: dock <-> overlay ─────────────────────────────────────
 * A Custom Browser Dock is OBS *interface*, so its audio goes to the system
 * output and never reaches the OBS mixer. A Browser Source's audio does. So
 * the overlay owns the audio element and the dock drives it remotely.
 *
 * The dock stays authoritative for what plays: it holds the queue and runs the
 * licence check. The overlay is a speaker with a screen attached.
 */
const ACH = 'syncland-audio';
let achan = null;
try { achan = new BroadcastChannel(ACH); } catch (e) {}

export function sendAudio(msg) {
  if (!achan) return false;
  try { achan.postMessage(msg); return true; } catch (e) { return false; }
}
export function onAudio(fn) {
  if (achan) achan.addEventListener('message', (e) => fn(e.data || {}));
}
export function audioLinkAvailable() { return !!achan; }
