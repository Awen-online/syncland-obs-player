import { listPlaylists, clearToken, saveLastPlaylist } from '../api.js';

export function renderPlaylistPicker($app, { onPick, onSignOut }) {
  $app.innerHTML = `
    <header class="sp-header">
      <div class="sp-logo">♪</div>
      <div class="sp-brand">Sync.Land <small>OBS Player</small></div>
      <div style="flex:1 1 auto;"></div>
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
      <span>v${'0.1.0'} · scaffold</span>
      <span><a href="https://sync.land/account/" target="_blank">Manage on sync.land</a></span>
    </footer>
  `;

  $app.querySelector('#pp-signout').addEventListener('click', () => {
    clearToken();
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
    $list.innerHTML = `<div class="sp-status err">Couldn't load playlists — ${escapeHtml(e.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
