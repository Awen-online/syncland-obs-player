import { saveToken, whoAmI, isStub } from '../api.js';
import { brandHeader } from '../obs.js';
import { extractKey } from './playlist-picker.js';

function escapeNotice(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function renderPatScreen($app, { onSignIn, notice } = {}) {
  $app.innerHTML = `
    <header class="sp-header">
      ${brandHeader()}
    </header>
    <main class="sp-screen">
      <div>
        ${notice ? `<div class="sp-status err" style="margin-bottom:16px;">${escapeNotice(notice)}</div>` : ''}
        <div class="sp-eyebrow">Connect</div>
        <h1 class="sp-h1">Connect your Sync.Land account</h1>
        <p class="sp-lead">
          Paste your player link from
          <a href="https://sync.land/stream/" target="_blank">sync.land/stream</a>.
          It lets this player read your playlists. It cannot buy anything or change your account.
        </p>
      </div>

      <div class="sp-card">
        <div class="sp-field">
          <label for="pat-input">Your player link</label>
          <input type="text" id="pat-input" autocomplete="off" spellcheck="false"
                 placeholder="Paste your player link" />
        </div>
        <div id="pat-status" style="margin: 10px 0 0;"></div>
        <div style="display:flex; gap:10px; margin-top: 14px;">
          <button class="sp-btn" id="pat-connect">Connect</button>
        </div>
        ${isStub() ? '<p style="margin: 14px 0 0; color: var(--sp-text-muted); font-size: 12px;">Stub mode: any non-empty token is accepted. Backend endpoints coming next.</p>' : ''}
      </div>

      <div style="color: var(--sp-text-muted); font-size: 12px; line-height: 1.6;">
        <strong style="color: var(--sp-text-soft);">Private:</strong> your link is kept only in this player. Turn it off any time at sync.land/stream.
      </div>
    </main>
    <footer class="sp-footer">
      <span>v0.2.0</span>
      <span><a href="https://sync.land/free-sync-license/" target="_blank">SLFS-v1</a></span>
    </footer>
  `;

  const $input   = $app.querySelector('#pat-input');
  const $status  = $app.querySelector('#pat-status');
  const $connect = $app.querySelector('#pat-connect');

  $input.focus();

  $connect.addEventListener('click', async () => {
    const pat = extractKey($input.value);
    if (!pat) {
      renderStatus($status, 'err', 'Paste your player link first.');
      return;
    }
    $connect.disabled = true;
    renderStatus($status, 'info', 'Verifying…');
    saveToken(pat);
    try {
      const me = await whoAmI();
      renderStatus($status, 'ok', `Signed in as ${me.display_name}. Loading playlists…`);
      setTimeout(() => onSignIn(), 500);
    } catch (e) {
      $connect.disabled = false;
      renderStatus($status, 'err', 'That link did not work. Copy it again from sync.land/stream, or make a new one there.');
    }
  });

  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $connect.click();
  });
}

function renderStatus($el, kind, msg) {
  $el.innerHTML = `<div class="sp-status ${kind}">${msg}</div>`;
}
