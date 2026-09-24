import { listPlaylists, saveLastPlaylist, isDemo, saveToken, clearToken, whoAmI } from '../api.js';
import { signOut } from '../playback.js';
import { openSetupPanel } from '../setup-panel.js';
import { brandHeader, isOBS } from '../obs.js';

export function renderPlaylistPicker($app, { onPick, onSignOut }) {
  $app.innerHTML = `
    <header class="sp-header">
      ${brandHeader()}
      <div style="flex:1 1 auto;"></div>
      <button class="sp-btn sp-btn-secondary sp-obs-btn" id="obs-setup" style="padding:6px 12px; font-size:12px;">${isOBS() ? 'Setup' : 'Add to OBS'}</button>
      <button class="sp-btn sp-btn-secondary" id="pp-signout" style="padding: 6px 12px; font-size: 12px;">${isDemo() ? 'Connect' : 'Disconnect'}</button>
    </header>
    <main class="sp-screen">
      <div>
        <div class="sp-eyebrow">${isDemo() ? 'Demo mode' : 'Choose a playlist'}</div>
        <h1 class="sp-h1">${isDemo() ? 'Try it now' : 'Your playlists'}</h1>
        <p class="sp-lead">${isDemo()
          ? 'A sample playlist you can play straight away. Every track is licence-checked before it plays and credits its artist on screen. Connect your account to use your own playlists.'
          : 'Pick one to load into the player. Every track will be license-checked before it plays.'}</p>
      </div>

      ${isDemo() ? connectCard() : ''}
      <div id="pp-list"><div class="sp-status info">Loading…</div></div>
    </main>
    <footer class="sp-footer">
      <span>v0.2.0</span>
      <span><a href="https://sync.land/account/" target="_blank">Manage on sync.land</a></span>
    </footer>
  `;

  $app.querySelector('#obs-setup').addEventListener('click', openSetupPanel);
  // In demo mode the same button is the way IN, not out.
  $app.querySelector('#pp-signout').addEventListener('click', () => {
    if (isDemo()) { onSignOut(); return; }
    signOut();
    onSignOut();
  });

  if (isDemo()) wireConnect($app, () => renderPlaylistPicker($app, { onPick, onSignOut }));
  const $list = $app.querySelector('#pp-list');
  loadAndRender($list, onPick);
  // A playlist made on the site shows up here without a reload: an OBS dock has
  // no reload button. Stops once this screen is gone.
  const refresh = () => {
    if (!document.body.contains($list)) { cleanup(); return; }
    if (!isDemo()) loadAndRender($list, onPick);
  };
  const timer = setInterval(refresh, 60000);
  const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('focus', refresh);
  function cleanup() { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', refresh); }
}

/**
 * Demo mode, said plainly, with the way out right here. Inside OBS this is the
 * only place a key can go: OBS keeps its own browser storage, so connecting in
 * a normal browser tab does nothing for this panel.
 */
function connectCard() {
  return `
    <div class="sp-card sp-connect">
      <div class="sp-connect-head"><span class="sp-connect-dot"></span><b>Demo playlist. Not connected to your account.</b></div>
      <p class="sp-connect-copy">Paste your player link to use your own playlists.</p>
      <div class="sp-connect-row">
        <input type="text" id="pp-key" autocomplete="off" spellcheck="false" placeholder="Paste your player link" aria-label="Your player link">
        <button class="sp-btn" id="pp-key-go" type="button">Connect</button>
      </div>
      <div id="pp-key-status"></div>
      <p class="sp-connect-foot">No link yet? Get one at <a href="https://sync.land/stream/" target="_blank">sync.land/stream</a></p>
    </div>`;
}

/** Whatever was pasted (the whole link, the bare key, with spaces or line breaks), find the key in it. */
export function extractKey(raw) {
  const m = String(raw || '').replace(/\s+/g, '').match(/sk_syncland_[A-Za-z0-9_-]+/);
  return m ? m[0] : '';
}

function wireConnect($app, onDone) {
  const $in = $app.querySelector('#pp-key'), $go = $app.querySelector('#pp-key-go'), $st = $app.querySelector('#pp-key-status');
  if (!$in || !$go) return;
  const go = async () => {
    const pat = extractKey($in.value);
    if (!pat) { $st.innerHTML = '<div class="sp-status err">Paste your player link first.</div>'; return; }
    $go.disabled = true;
    $st.innerHTML = '<div class="sp-status info">Checking&hellip;</div>';
    saveToken(pat);
    try {
      const me = await whoAmI();
      $st.innerHTML = `<div class="sp-status ok">Connected as ${escapeHtml(me.display_name)}.</div>`;
      setTimeout(onDone, 500);
    } catch (e) {
      clearToken();
      $go.disabled = false;
      $st.innerHTML = '<div class="sp-status err">That link did not work. Copy it again from sync.land/stream, or make a new one there.</div>';
    }
  };
  $go.addEventListener('click', go);
  $in.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

async function loadAndRender($list, onPick) {
  try {
    const resp = await listPlaylists();
    if (!resp.playlists || !resp.playlists.length) {
      $list.innerHTML = `
        <div class="sp-card">
          <p style="margin: 0; color: var(--sp-text-soft);">You don't have any playlists yet.</p>
          <p style="margin: 10px 0 0; font-size: 13px; color: var(--sp-text-muted);">
            Make one at <a href="https://sync.land/account/playlists/" target="_blank">sync.land/account/playlists</a>. It shows up here on its own within a minute.
          </p>
        </div>
      `;
      return;
    }
    const html = resp.playlists.map((p) => `
      <li class="sp-list-item" data-id="${p.id}">
        <div class="sp-list-thumb" ${p.cover_url ? `style="background-image:url('${p.cover_url.replace(/'/g, "%27")}')"` : ''}></div>
        <div class="sp-list-body">
          <div class="sp-title">${escapeHtml(p.name)}</div>
          <div class="sp-meta">${p.track_count} track${p.track_count === 1 ? '' : 's'}</div>
        </div>
      </li>
    `).join('');
    $list.innerHTML = `<ul class="sp-list">${html}</ul>`;
    $list.querySelectorAll('.sp-list-item').forEach(($el) => {
      $el.addEventListener('click', () => {
        const id = Number($el.dataset.id);
        saveLastPlaylist(id);
        onPick(id);
      });
    });
  } catch (e) {
    // A token that is missing, revoked or expired is not an error to report,
    // it is a sign-in prompt. Anything else is a real fault worth naming, but
    // never by pasting a raw response body at someone.
    if (e && e.isAuth) {
      signOut();
      window.dispatchEvent(new CustomEvent('syncland:navigate', {
        detail: { screen: 'auth', notice: 'Your player link was turned off. Paste a new one from sync.land/stream to load your playlists.' },
      }));
      return;
    }
    $list.innerHTML = `
      <div class="sp-status err">Couldn&rsquo;t load your playlists. ${escapeHtml(friendly(e))}</div>
      <div style="margin-top:10px;"><button class="sp-btn sp-btn-secondary" id="pp-retry">Try again</button></div>
    `;
    const $retry = $list.querySelector('#pp-retry');
    if ($retry) $retry.addEventListener('click', () => loadAndRender($list, onPick));
  }
}

/** Plain-language cause, never the raw response body. */
function friendly(e) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'This machine appears to be offline.';
  if (e && e.status >= 500) return 'Sync.Land is not responding right now.';
  if (e && e.status) return `The server returned ${e.status}.`;
  return 'Check the connection and try again.';
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
