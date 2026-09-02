/**
 * Sync.Land REST API wrapper.
 *
 * Reads its base URL from VITE_SYNCLAND_API (set in .env.local for dev), falls
 * back to production. All calls attach the streamer's Personal Access Token
 * as a Bearer credential.
 *
 * When the backend endpoints don't yet exist (v0.1 scaffold), the store
 * uses the `stubMode` flag to return canned responses so the UI is testable
 * end-to-end without a live backend. Flip to false once /streamer/* ships.
 */

// Production ALWAYS talks to sync.land. The override is honoured only under
// the dev server, because Vite ranks .env.local above .env.production — so a
// developer's local file silently shipped `http://sync.local/...` into the
// deployed bundle, and the dock could never reach prod. Gating on
// import.meta.env.DEV makes that class of mistake impossible rather than
// relying on remembering to move a file before building.
const PROD_API = 'https://sync.land/wp-json/FML/v1';
const API_BASE =
  (import.meta.env && import.meta.env.DEV && import.meta.env.VITE_SYNCLAND_API)
    ? import.meta.env.VITE_SYNCLAND_API
    : PROD_API;

// Stubs default off — the backend is live. Set `?stub=1` in the URL, or
// VITE_STUB_MODE=1 in .env.local, to force stubs during dev without a token.
const urlStub = typeof location !== 'undefined' && new URLSearchParams(location.search).get('stub') === '1';
const envStub = !!(import.meta.env && import.meta.env.VITE_STUB_MODE === '1');
let stubMode  = urlStub || envStub;

export function setStubMode(on) { stubMode = !!on; }
export function isStub() { return stubMode; }

// -------------------------------------------------------------------------
// PAT storage (localStorage keyed to the dock so multiple docks on one
// machine can hold different tokens — future feature)
// -------------------------------------------------------------------------
const TOKEN_KEY   = 'syncland_obs_player_pat';
const PLAYLIST_KEY = 'syncland_obs_player_last_playlist';

export function saveToken(pat) { localStorage.setItem(TOKEN_KEY, pat); }
export function loadToken()   { return localStorage.getItem(TOKEN_KEY) || ''; }
export function clearToken()   { localStorage.removeItem(TOKEN_KEY); }
export function saveLastPlaylist(id) { localStorage.setItem(PLAYLIST_KEY, String(id)); }
export function clearLastPlaylist()   { localStorage.removeItem(PLAYLIST_KEY); }
export function loadLastPlaylist()    { return localStorage.getItem(PLAYLIST_KEY) || ''; }

// -------------------------------------------------------------------------
// Low-level fetch wrapper
// -------------------------------------------------------------------------
async function request(path, opts = {}) {
  const token = loadToken();
  if (!token) { const err = new Error('No PAT - user needs to sign in first'); err.status = 401; err.isAuth = true; throw err; }
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, {
    ...opts,
    headers: {
      'Accept': 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      'Authorization': `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) {
    const text = await r.text();
    // Carry the status. Without it a caller can do nothing but print the raw
    // body, which is how a visitor with a dead token ended up reading
    // {"code":"rest_forbidden",...} instead of being asked to sign in.
    const err = new Error(`API ${r.status}: ${text.slice(0, 300)}`);
    err.status = r.status;
    err.isAuth = (r.status === 401 || r.status === 403);
    throw err;
  }
  return r.json();
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

export async function whoAmI() {
  if (stubMode) return { user_id: 8617, display_name: 'Creepzz (stub)', artist_ids: [11732] };
  return request('/streamer/me');
}

export async function listPlaylists() {
  if (stubMode) return stubPlaylists();
  return request('/streamer/playlists');
}

/**
 * The most recent clearance check, kept so the UI can *show* that a real
 * public-API call verified the licence. M4 acceptance criterion 3 is
 * "an external application is able to verify a sync license via public API",
 * and the evidence asked for is a link to the successful request plus a
 * screen recording — so the request itself has to be visible on camera,
 * not just its result.
 */
let lastVerification = null;
export function getLastVerification() { return lastVerification; }

export async function getTrackClearance(song_id) {
  const path = `/streamer/track/${song_id}/clearance`;
  const url  = `${API_BASE}${path}`;
  const t0   = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  if (stubMode) {
    const data = await stubClearance(song_id);
    lastVerification = { method: 'GET', url, status: 200, ms: 0,
                         at: new Date().toISOString(), stub: true, response: data };
    return data;
  }

  const token = loadToken();
  if (!token) { const err = new Error('No PAT - user needs to sign in first'); err.status = 401; err.isAuth = true; throw err; }
  const r = await fetch(url, {
    headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
  });
  const ms   = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* non-JSON body */ }

  lastVerification = { method: 'GET', url, status: r.status, ms,
                       at: new Date().toISOString(), stub: false,
                       response: data !== null ? data : text.slice(0, 400) };

  if (!r.ok) {
    const err = new Error(`API ${r.status}: ${text.slice(0, 300)}`);
    err.status = r.status;
    err.isAuth = (r.status === 401 || r.status === 403);
    throw err;
  }
  return data;
}

/**
 * Close a usage out: how much of the track was actually heard, and why it
 * stopped. Fire-and-forget, and uses sendBeacon when the page is going away
 * so a closing dock still reports the ending it already knows.
 */
export async function completePlay(usage_id, { seconds = 0, duration = 0, reason = 'stopped' } = {}) {
  if (!usage_id) return;
  if (stubMode) { console.info('[stub] completePlay', { usage_id, seconds, duration, reason }); return; }
  const url  = `${API_BASE}/streamer/usage/${usage_id}/complete`;
  const body = JSON.stringify({ seconds: Math.round(seconds), duration: Math.round(duration), reason });
  const token = loadToken();
  if (!token) return;
  try {
    await fetch(url, {
      method: 'POST',
      keepalive: true,          // survives the tab or dock closing mid-flight
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body,
    });
  } catch (e) { /* never let bookkeeping break playback */ }
}

export async function logPlay(song_id, seconds) {
  if (stubMode) {
    console.info('[stub] logPlay', { song_id, seconds });
    return { ok: true };
  }
  return request(`/streamer/track/${song_id}/played`, {
    method: 'POST',
    body: JSON.stringify({ seconds }),
  });
}

// -------------------------------------------------------------------------
// Stubs — keep the UI runnable while backend catches up
// -------------------------------------------------------------------------

function stubPlaylists() {
  return {
    ok: true,
    playlists: [
      { id: 1, name: 'Chill / stream focus',   track_count: 12, cover_url: '' },
      { id: 2, name: 'High-energy runs',       track_count: 18, cover_url: '' },
      { id: 3, name: 'Cardano ecosystem picks', track_count: 8,  cover_url: '' },
    ],
    tracks: {
      1: [
        { song_id: 11907, title: 'Island Vibe',      artist: 'Creepzz feat. Kosi Sia' },
        { song_id: 11903, title: 'Take Me Back',    artist: 'Creepzz x Jordan Grace feat. Kosi Sia' },
        { song_id: 11566, title: 'Turn Tail and Run', artist: 'Cullah' },
      ],
    },
  };
}

function stubClearance(song_id) {
  const catalog = {
    11907: { title: 'Island Vibe',  artist: 'Creepzz', slug: 'island-vibe' },
    11903: { title: 'Take Me Back', artist: 'Creepzz', slug: 'take-me-back' },
    11566: { title: 'Turn Tail and Run', artist: 'Cullah', slug: 'turn-tail-and-run' },
  };
  const meta = catalog[song_id] || { title: `Track #${song_id}`, artist: 'Unknown', slug: `song-${song_id}` };
  return {
    ok: true,
    can_stream: true,
    tier: 'SLFS-v1',
    tier_label: 'Free Sync License',
    attribution_required: true,
    attribution_text: `Music: ${meta.artist} via Sync.Land · sync.land/song/${meta.slug}`,
    stream_url: '', // no real audio in stub - player renders "stub mode" state
    reason_if_blocked: null,
    song: { id: song_id, title: meta.title, artist: meta.artist, slug: meta.slug },
  };
}
