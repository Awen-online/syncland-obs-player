/**
 * Sync.Land OBS Player — app root.
 *
 * Handles:
 *   1. Overlay vs full-dock mode detection (query param `mode=overlay`)
 *   2. PAT presence check → route to auth screen or main app
 *   3. Screen swapping (no router library — keep bundle tight)
 */

import { loadToken } from './api.js';
import { renderPatScreen }       from './screens/pat-screen.js';
import { renderPlaylistPicker }  from './screens/playlist-picker.js';
import { renderPlayer }          from './screens/player.js';
import { renderOverlay }         from './overlay-mode.js';

// -------------------------------------------------------------------------
// Route from URL: mode=overlay is the OBS Browser Source path
// -------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const OVERLAY_MODE = params.get('mode') === 'overlay';

if (OVERLAY_MODE) document.body.classList.add('overlay-mode');

// -------------------------------------------------------------------------
// Bootstrap
// -------------------------------------------------------------------------
const $app = document.getElementById('app');

// A token in the URL (?token=xxx) trumps whatever's in localStorage — useful
// when adding as an OBS Browser Source that needs to auto-auth.
const urlToken = params.get('token');
if (urlToken) {
  localStorage.setItem('syncland_obs_player_pat', urlToken);
  // Strip the token from the URL so it isn't in browser history / logs.
  history.replaceState({}, '', location.pathname + (OVERLAY_MODE ? '?mode=overlay' : ''));
}

// -------------------------------------------------------------------------
// Screen router — the "screens" object drives what renders next.
// -------------------------------------------------------------------------
const screens = {
  auth:     () => renderPatScreen($app, { onSignIn: () => go('playlists') }),
  playlists: () => renderPlaylistPicker($app, {
    onPick: (playlistId) => go('player', { playlistId }),
    onSignOut: () => go('auth'),
  }),
  player: (opts) => renderPlayer($app, {
    playlistId: opts.playlistId,
    onBack:     () => go('playlists'),
    onSignOut:  () => go('auth'),
  }),
  overlay: () => renderOverlay($app),
};

function go(name, opts = {}) {
  $app.replaceChildren();
  screens[name](opts);
}

// -------------------------------------------------------------------------
// Initial route
// -------------------------------------------------------------------------
if (OVERLAY_MODE) {
  go('overlay');
} else if (loadToken()) {
  go('playlists');
} else {
  go('auth');
}
