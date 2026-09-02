import { listPlaylists, saveLastPlaylist } from '../api.js';
import { signOut } from '../playback.js';
import { openSetupPanel } from '../setup-panel.js';
import { brandHeader } from '../obs.js';

export function renderPlaylistPicker($app, { onPick, onSignOut }) {
  $app.innerHTML = `
    <header class="sp-header">
      ${brandHeader()}
      <div style="flex:1 1 auto;"></div>
      <button class="sp-btn sp-btn-secondary sp-obs-btn" id="obs-setup" style="padding:6px 12px; font-size:12px;">Add to OBS</button>
      <button class="sp-btn sp-btn-secondary" id="pp-signout" style="padding: 6px 12px; font-size: 12px;">Sign out</button>
    </header>
    <main class="sp-screen">
      <div>
        <div class="sp-eyebrow">Choose a playlist</div>
        <h1 class="sp-h1">Your playlists</h1>
        <p class="sp-lead">Pick one to load into the player. Every track will be license-checked before it plays.</p>
      </div>

      <div id="pp-list"><div class="sp-status info">Loading…</div></div>
    </main>
    <footer class="sp-footer">
      <span>v0.2.0</span>
      <span><a href="https://sync.land/account/" target="_blank">Manage on sync.land</a></span>
    </footer>
  `;

  $app.querySelector('#obs-setup').addEventListener('click', openSetupPanel);
  $app.querySelector('#pp-signout').addEventListener('click', () => {
    signOut();
    onSignOut();
  });

  loadAndRender($app.querySelector('#pp-list'), onPick);
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
