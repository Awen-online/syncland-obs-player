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

const API_BASE =
  (import.meta.env && import.meta.env.VITE_SYNCLAND_API) ||
  'https://sync.land/wp-json/FML/v1';

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
export function loadLastPlaylist()    { return localStorage.getItem(PLAYLIST_KEY) || ''; }

// -------------------------------------------------------------------------
// Low-level fetch wrapper
// -------------------------------------------------------------------------
async function request(path, opts = {}) {
  const token = loadToken();
  if (!token) throw new Error('No PAT — user needs to sign in first');
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
    throw new Error(`API ${r.status}: ${text.slice(0, 300)}`);
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

export async function getTrackClearance(song_id) {
  if (stubMode) return stubClearance(song_id);
  return request(`/streamer/track/${song_id}/clearance`);
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
    attribution_text: `Music: ${meta.artist} — via Sync.Land — sync.land/song/${meta.slug}`,
    stream_url: '', // no real audio in stub — player renders "stub mode" state
    reason_if_blocked: null,
    song: { id: song_id, title: meta.title, artist: meta.artist, slug: meta.slug },
  };
}
