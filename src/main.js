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
import { renderSettings }        from './screens/settings.js';
import { renderOverlay }         from './overlay-mode.js';
import { mountPlayerBar }        from './player-bar.js';
import { isOBS, surface }        from './obs.js';
import { openSetupPanel }        from './setup-panel.js';
import { getTheme, applyTheme, applyThemeFromUrl } from './theme.js';

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
  auth:     (opts) => renderPatScreen($app, { onSignIn: () => go('playlists'), notice: opts && opts.notice }),
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
  settings: () => renderSettings($app, { onBack: () => go(lastScreen || 'playlists') }),
};

let lastScreen = null;
window.addEventListener('syncland:navigate', (e) => {
  const scr = e.detail && e.detail.screen;
  if (scr && screens[scr]) go(scr, e.detail.opts || { notice: e.detail.notice });
});

function go(name, opts = {}) {
  if (name !== 'settings') lastScreen = name;
  $app.replaceChildren();
  screens[name](opts);
}

// -------------------------------------------------------------------------
// Initial route
// -------------------------------------------------------------------------
// Tell the user where they are. A dock in a browser tab looks identical to a
// dock in OBS, and the whole product depends on knowing the difference.
document.body.classList.add('surface-' + surface());
// Theme before anything renders, so there is no flash of the wrong palette.
if (OVERLAY_MODE) { applyThemeFromUrl(); } else { applyTheme(getTheme()); }

if (OVERLAY_MODE) {
  go('overlay');
} else if (loadToken()) {
  mountPlayerBar();
  mountSurfaceBanner();
  go('playlists');
} else {
  mountSurfaceBanner();
  go('auth');
}

/**
 * One line at the top of the dock saying whether this is OBS or a browser.
 * Dismissible, remembered, and never shown in overlay mode.
 */
function mountSurfaceBanner() {
  if (OVERLAY_MODE) return;
  if (localStorage.getItem('syncland_surface_banner_dismissed') === '1') return;
  const inObs = isOBS();
  const el = document.createElement('div');
  el.className = 'sp-surface' + (inObs ? ' ok' : '');
  el.innerHTML = inObs
    ? `<span class="sp-surface-dot"></span><b>Running inside OBS.</b>
       <span>This panel is your private control room and is never captured.</span>
       <button class="sp-surface-link" id="sfc-help">Overlay setup</button>
       <button class="sp-surface-x" id="sfc-x" aria-label="Dismiss">&times;</button>`
    : `<span class="sp-surface-dot"></span><b>You are in a web browser.</b>
       <span>Fine for browsing, but playback and the on-stream overlay only work once this is added to OBS.</span>
       <button class="sp-surface-link" id="sfc-help">Show me how</button>
       <button class="sp-surface-x" id="sfc-x" aria-label="Dismiss">&times;</button>`;
  document.body.prepend(el);
  el.querySelector('#sfc-help').addEventListener('click', openSetupPanel);
  el.querySelector('#sfc-x').addEventListener('click', () => {
    localStorage.setItem('syncland_surface_banner_dismissed', '1');
    el.remove();
  });
}
