import { saveToken, whoAmI, isStub } from '../api.js';
import { brandHeader } from '../obs.js';

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
        <div class="sp-eyebrow">Sign in</div>
        <h1 class="sp-h1">Connect your Sync.Land account</h1>
        <p class="sp-lead">
          Paste a Personal Access Token to connect. You can generate one at
          <a href="https://sync.land/account/tokens/" target="_blank">sync.land/account/tokens/</a>.
          Tokens grant read-only access to your playlists and per-track license clearance.
        </p>
      </div>

      <div class="sp-card">
        <div class="sp-field">
          <label for="pat-input">Personal Access Token</label>
          <input type="password" id="pat-input" autocomplete="off"
                 placeholder="sk_syncland_..." />
        </div>
        <div id="pat-status" style="margin: 10px 0 0;"></div>
        <div style="display:flex; gap:10px; margin-top: 14px;">
          <button class="sp-btn" id="pat-connect">Connect</button>
        </div>
        ${isStub() ? '<p style="margin: 14px 0 0; color: var(--sp-text-muted); font-size: 12px;">Stub mode: any non-empty token is accepted. Backend endpoints coming next.</p>' : ''}
      </div>

      <div style="color: var(--sp-text-muted); font-size: 12px; line-height: 1.6;">
        <strong style="color: var(--sp-text-soft);">Privacy:</strong> your PAT is stored only in this browser's local storage,
        scoped to this dock. Nothing is synced to Sync.Land or third parties.
        Revoke a token any time on the account page.
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
    const pat = $input.value.trim();
    if (!pat) {
      renderStatus($status, 'err', 'Paste a token first.');
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
      renderStatus($status, 'err', `That token didn't work - ${e.message}`);
    }
  });

  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $connect.click();
  });
}

function renderStatus($el, kind, msg) {
  $el.innerHTML = `<div class="sp-status ${kind}">${msg}</div>`;
}
