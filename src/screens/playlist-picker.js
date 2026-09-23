import { listPlaylists, saveLastPlaylist, isDemo, saveToken, clearToken, whoAmI } from '../api.js';
import { signOut } from '../playback.js';
import { openSetupPanel } from '../setup-panel.js';
import { brandHeader, isOBS } from '../obs.js';

export function renderPlaylistPicker($app, { onPick, onSignOut }) {
  $app.innerHTML = `
    <header class="sp-header">
      ${brandHeader()}
      <div style="flex:1 1 auto;"></div>
      <button class="sp-btn sp-btn-secondary sp-obs-btn" id="obs-setup" style="padding:6px 12px; font-size:12px;">Add to OBS</button>
      <button class="sp-btn sp-btn-secondary" id="pp-signout" style="padding: 6px 12px; font-size: 12px;">${isDemo() ? 'Sign in' : 'Sign out'}</button>
    </header>
    <main class="sp-screen">
      <div>
        <div class="sp-eyebrow">${isDemo() ? 'Demo mode' : 'Choose a playlist'}</div>
        <h1 class="sp-h1">${isDemo() ? 'Try it now' : 'Your playlists'}</h1>
        <p class="sp-lead">${isDemo()
          ? 'This is a sample playlist you can play straight away, no account needed. Every track is license-checked before it plays and credits its artist on screen. Sign in to use your own playlists.'
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
  loadAndRender($app.querySelector('#pp-list'), onPick);
}

/**
 * Demo mode, said plainly, with the way out right here. Inside OBS this is the
 * only place a key can go: OBS keeps its own browser storage, so connecting in
 * a normal browser tab does nothing for this panel.
 */
function connectCard() {
  const where = isOBS()
    ? 'Paste your key here to load your own playlists. A key entered in your web browser does not reach OBS; OBS keeps its own storage, so it has to go in this panel.'
    : 'You are in a web browser. To play on stream, add the dock to OBS with your personal dock URL from sync.land/account/tokens/. It connects in the same step.';
  return `
    <div class="sp-card sp-connect">
      <div class="sp-connect-head"><span class="sp-connect-dot"></span><b>Not connected: playing the demo playlist</b></div>
      <p class="sp-connect-copy">${where}</p>
      <div class="sp-connect-row">
        <input type="password" id="pp-key" autocomplete="off" placeholder="sk_syncland_..." aria-label="Your Sync.Land key">
        <button class="sp-btn" id="pp-key-go" type="button">Connect</button>
      </div>
      <div id="pp-key-status"></div>
      <p class="sp-connect-foot">No key yet? Make one at <a href="https://sync.land/account/tokens/" target="_blank">sync.land/account/tokens/</a>.</p>
    </div>`;
}

function wireConnect($app, onDone) {
  const $in = $app.querySelector('#pp-key'), $go = $app.querySelector('#pp-key-go'), $st = $app.querySelector('#pp-key-status');
  if (!$in || !$go) return;
  const go = async () => {
    const pat = $in.value.trim();
    if (!pat) { $st.innerHTML = '<div class="sp-status err">Paste your key first.</div>'; return; }
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
      $st.innerHTML = '<div class="sp-status err">That key did not work. Check it was copied whole, or make a new one.</div>';
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
            Create one at <a href="https://sync.land/account/playlists/" target="_blank">sync.land/account/playlists/</a>, then reload.
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
        detail: { screen: 'auth', notice: 'Your access token is no longer valid. Sign in again to load your playlists.' },
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
