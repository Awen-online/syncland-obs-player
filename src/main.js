/**
 * Sync.Land OBS Player — app root.
 *
 * Handles:
 *   1. Overlay vs full-dock mode detection (query param `mode=overlay`)
 *   2. PAT presence check → route to auth screen or main app
 *   3. Screen swapping (no router library — keep bundle tight)
 */

import { loadToken, isDemo } from './api.js';
import { remoteAudio } from './playback.js';
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

// A player link (sync.land/dock/#key=...) from sync.land/stream carries the key
// after the #, which browsers never send to the server, so it stays out of
// access logs. OBS keeps its own browser storage: a key saved in Chrome never
// reaches the player inside OBS, and the first outside streamer went live in
// demo mode because of exactly that. So inside OBS the link connects on load
// (OBS keeps the URL it was given and re-reads it on every start), while in a
// normal browser it stops and says where the link belongs instead.
let linkInBrowser = '';
const hashKey = new URLSearchParams(location.hash.replace(/^#/, '')).get('key');
if (hashKey && /^sk_syncland_[A-Za-z0-9_-]{8,}$/.test(hashKey)) {
  if (isOBS()) {
    localStorage.setItem('syncland_obs_player_pat', hashKey);
  } else {
    linkInBrowser = location.origin + location.pathname + '#key=' + hashKey;
  }
  history.replaceState({}, '', location.pathname + location.search);
}
// Pasting a player link into a tab that already shows the player changes only
// the # part, which does not reload the page; reload so the check above runs.
window.addEventListener('hashchange', () => {
  if (/key=sk_syncland_/.test(location.hash)) location.reload();
});

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
} else if (linkInBrowser) {
  mountLinkInBrowser(linkInBrowser);
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
  const canvas = [[1920, 1080], [1280, 720], [2560, 1440], [3840, 2160]];
  const w = window.innerWidth, h = window.innerHeight;
  let shown = false;
  const show = () => { if (!shown) { shown = true; mountWrongPlace(); } };
  if (canvas.some(([cw, ch]) => cw === w && ch === h)) show();
  window.addEventListener('obsSourceVisibleChanged', show);
  window.addEventListener('obsSourceActiveChanged', show);
}

function mountWrongPlace() {
  // Short, because it is on stream, and no button: a Source cannot be clicked.
  const el = document.createElement('div');
  el.className = 'sp-wrong';
  el.innerHTML = `
    <div class="sp-wrong-card">
      <h1 class="sp-h1">Sync.Land: this belongs in a different spot</h1>
      <p class="sp-lead">This is the player, and it was added as a Source, so it shows on your stream.
        Remove this source, then add the player under <b>Docks &rarr; Custom Browser Docks</b>.</p>
      <p class="sp-lead">Steps: <b>sync.land/stream</b></p>
      <p class="sp-dim"><button class="sp-sl-link" id="sp-wrong-x" type="button">This is a dock, hide this</button></p>
    </div>`;
  document.body.appendChild(el);
  // Clickable in a dock (a false alarm), inert in a Source, which is the point.
  el.querySelector('#sp-wrong-x').addEventListener('click', () => {
    localStorage.setItem('syncland_is_dock', '1');
    el.remove();
  });
}

/**
 * The line at the top of the player.
 *
 * Inside OBS it is a live status the streamer can act on: connected or demo,
 * overlay on or missing (the overlay heartbeats every 1.5 s). In a web browser
 * it says what this page is and where the real setup lives.
 */
function mountSurfaceBanner() {
  if (OVERLAY_MODE) return;
  const el = document.createElement('div');
  if (isOBS()) {
    el.className = 'sp-status-line';
    document.body.prepend(el);
    const paint = () => {
      const demo = isDemo(), ov = remoteAudio();
      el.innerHTML =
        `<span class="sp-sl ${demo ? 'warn' : 'ok'}"><span class="sp-sl-dot"></span>${demo
          ? '<b>Demo playlist.</b> Not connected to your account. <button class="sp-sl-link" data-act="connect">Connect</button>'
          : '<b>Connected.</b> Your playlists are loaded.'}</span>` +
        `<span class="sp-sl ${ov ? 'ok' : 'warn'}"><span class="sp-sl-dot"></span>${ov
          ? '<b>Overlay: on.</b> Music and credit go to your stream.'
          : '<b>Overlay: not added.</b> Viewers won&rsquo;t see the credit. <button class="sp-sl-link" data-act="setup">How</button>'}</span>`;
    };
    paint();
    setInterval(paint, 2000);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'setup') openSetupPanel();
      if (b.dataset.act === 'connect') {
        const k = document.getElementById('pp-key');
        if (k) { k.focus(); k.scrollIntoView({ block: 'center' }); } else { go('playlists'); }
      }
    });
    return;
  }
  if (localStorage.getItem('syncland_surface_banner_dismissed') === '1') return;
  el.className = 'sp-surface sp-surface--cta';
  el.innerHTML = `<div class="sp-surface-body">
       <div class="sp-surface-head"><span class="sp-surface-dot"></span><b>This is the Sync.Land player for OBS</b></div>
       <p class="sp-surface-copy">You can try the demo here. To play music on your stream, set it up in OBS. It takes about two minutes.</p>
     </div>
     <div class="sp-surface-actions"><a class="sp-btn sp-surface-cta" href="https://sync.land/stream/" target="_blank">Set up OBS &rarr;</a></div>
     <button class="sp-surface-x" id="sfc-x" aria-label="Dismiss">&times;</button>`;
  document.body.prepend(el);
  el.querySelector('#sfc-x').addEventListener('click', () => {
    localStorage.setItem('syncland_surface_banner_dismissed', '1');
    el.remove();
  });
}

/** A player link opened in a normal browser: say where it goes, and let them copy it again. */
function mountLinkInBrowser(link) {
  $app.innerHTML = `
    <main class="sp-screen sp-inbrowser">
      <div class="sp-eyebrow">Almost there</div>
      <h1 class="sp-h1">This link goes in OBS, not your browser</h1>
      <p class="sp-lead">Your browser and OBS keep separate settings, so the player only connects when OBS opens this link.</p>
      <div><button class="sp-btn" id="lib-copy" type="button">Copy my link again</button></div>
      <ol class="sp-inbrowser-steps">
        <li>In OBS, click <b>Docks</b> in the top menu.</li>
        <li>Click <b>Custom Browser Docks</b>.</li>
        <li>Type <b>Sync.Land</b>, paste the link, click <b>Apply</b>.</li>
      </ol>
      <p class="sp-dim">Just looking around? <button class="sp-sl-link" id="lib-here" type="button">Use it in this browser</button></p>
    </main>`;
  const $copy = document.getElementById('lib-copy');
  $copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(link); $copy.textContent = 'Copied. Now paste it in OBS'; }
    catch (e) { $copy.textContent = 'Copy failed. Get it again at sync.land/stream'; }
  });
  document.getElementById('lib-here').addEventListener('click', () => {
    const k = new URLSearchParams(link.split('#')[1] || '').get('key');
    if (k) localStorage.setItem('syncland_obs_player_pat', k);
    location.reload();
  });
}
