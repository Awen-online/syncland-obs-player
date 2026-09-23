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

// The personal dock URL from sync.land/account/tokens/ carries the key after
// the #, which browsers never send to the server, so it stays out of access
// logs. It exists because OBS keeps its own browser storage: a key pasted into
// the dock in Chrome never reaches the dock inside OBS, and the first outside
// streamer sat in demo mode on stream day because of exactly that. With the key
// in the URL, adding the dock IS connecting it. OBS keeps the URL it was given,
// so the key is re-read on every load; we only tidy the visible address.
const hashKey = new URLSearchParams(location.hash.replace(/^#/, '')).get('key');
if (hashKey && /^sk_syncland_[A-Za-z0-9_-]{8,}$/.test(hashKey)) {
  localStorage.setItem('syncland_obs_player_pat', hashKey);
  history.replaceState({}, '', location.pathname + location.search);
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
} else {
  // No token is no longer a wall. Without one the dock loads the public demo
  // playlist, so a stranger who pasted this URL into OBS hears music instead of
  // a sign-in screen. The PAT screen stays reachable from the header button.
  mountPlayerBar();
  mountSurfaceBanner();
  go('playlists');
  watchForSourceMisuse();
}

/**
 * The player page added as a Browser Source instead of a Dock. It then shows
 * on stream, can't be clicked, and the streamer has no controls. OBS gives no
 * flag for "dock" vs "source", but only sources receive the source visibility
 * events, and a source renders at a canvas size no one drags a dock to.
 */
function watchForSourceMisuse() {
  if (!isOBS()) return;
  if (localStorage.getItem('syncland_is_dock') === '1') return;
  const canvas = [[1920, 1080], [1280, 720], [2560, 1440], [3840, 2160], [800, 600]];
  const w = window.innerWidth, h = window.innerHeight;
  let shown = false;
  const show = () => { if (!shown) { shown = true; mountWrongPlace(); } };
  if (canvas.some(([cw, ch]) => cw === w && ch === h)) show();
  window.addEventListener('obsSourceVisibleChanged', show);
  window.addEventListener('obsSourceActiveChanged', show);
}

function mountWrongPlace() {
  const el = document.createElement('div');
  el.className = 'sp-wrong';
  el.innerHTML = `
    <div class="sp-wrong-card">
      <div class="sp-eyebrow">This is in the wrong place</div>
      <h1 class="sp-h1">The player is a Dock, not a Source</h1>
      <p class="sp-lead">This page has been added as a Browser Source, so it shows on your stream and you can&rsquo;t reach its controls. Two changes fix it:</p>
      <ol class="sp-wrong-steps">
        <li><b>Remove this source</b>, then in OBS open <b>Docks &rarr; Custom Browser Docks</b> and paste your dock URL there. Get it from <b>sync.land/account/tokens/</b>; it connects your playlists in the same step.</li>
        <li>For the credit your viewers see, add a <b>Browser Source</b> with <code>https://sync.land/dock/?mode=overlay</code> at 1920 &times; 1080.</li>
      </ol>
      <button class="sp-btn sp-btn-secondary" id="sp-wrong-x" type="button">This is a dock, hide this</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#sp-wrong-x').addEventListener('click', () => {
    localStorage.setItem('syncland_is_dock', '1');
    el.remove();
  });
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
  // Two different jobs. Inside OBS this is a quiet confirmation, so it stays a
  // thin bar. In a browser the reader has something to DO before the thing
  // works at all, and an underlined text link was not carrying that: it read
  // as a footnote next to the sentence explaining the limitation.
  el.className = inObs ? 'sp-surface ok' : 'sp-surface sp-surface--cta';
  el.innerHTML = inObs
    ? `<span class="sp-surface-dot"></span><b>Running inside OBS.</b>
       <span>This panel is your private control room and is never captured.</span>
       <button class="sp-surface-link" id="sfc-help">Overlay setup</button>
       <button class="sp-surface-x" id="sfc-x" aria-label="Dismiss">&times;</button>`
    : `<div class="sp-surface-body">
         <div class="sp-surface-head">
           <span class="sp-surface-dot"></span>
           <b>Add the dock to OBS to play music on stream</b>
         </div>
         <p class="sp-surface-copy">
           You are in a web browser, which is fine for browsing your catalogue.
           Playback and the on-stream attribution overlay only work once this is
           added to OBS Studio. It takes about a minute.
         </p>
       </div>
       <div class="sp-surface-actions">
         <button class="sp-btn sp-surface-cta" id="sfc-help">Show me how &rarr;</button>
       </div>
       <button class="sp-surface-x" id="sfc-x" aria-label="Dismiss">&times;</button>`;
  document.body.prepend(el);
  el.querySelector('#sfc-help').addEventListener('click', openSetupPanel);
  el.querySelector('#sfc-x').addEventListener('click', () => {
    localStorage.setItem('syncland_surface_banner_dismissed', '1');
    el.remove();
  });
}
