/**
 * "Add to OBS" panel.
 *
 * Rendered as a fixed dialog rather than a router screen on purpose: a screen
 * swap would tear down the player and stop playback, and the moment you most
 * want these instructions is while something is playing and you are trying to
 * get the overlay on screen.
 *
 * Every value a user has to retype is behind a copy button. Nothing here
 * contains a token — the overlay is driven by the dock over a shared browser
 * origin, so its URL is safe to paste anywhere.
 */

const DOCK_URL    = 'https://sync.land/dock/';
const OVERLAY_URL = 'https://sync.land/dock/?mode=overlay';

const VARIANTS = [
  ['Bottom left (default)', OVERLAY_URL],
  ['Bottom centre',         OVERLAY_URL + '&pos=bc'],
  ['Bottom right',          OVERLAY_URL + '&pos=br'],
  ['Top left',              OVERLAY_URL + '&pos=tl'],
  ['Compact bar, no art',   OVERLAY_URL + '&pos=bc&compact=1'],
  ['Stay visible on pause', OVERLAY_URL + '&hold=1'],
];

function row(label, value) {
  return `
    <div class="sp-cp">
      <div class="sp-cp-label">${label}</div>
      <div class="sp-cp-row">
        <code class="sp-cp-val">${value}</code>
        <button class="sp-cp-btn" type="button" data-copy="${value}">Copy</button>
      </div>
    </div>`;
}

export function openSetupPanel() {
  if (document.getElementById('sp-setup')) return;

  const el = document.createElement('div');
  el.id = 'sp-setup';
  el.className = 'sp-setup-backdrop';
  el.innerHTML = `
    <div class="sp-setup" role="dialog" aria-modal="true" aria-labelledby="sp-setup-h">
      <div class="sp-setup-head">
        <h2 id="sp-setup-h">Add Sync.Land to OBS</h2>
        <button class="sp-setup-x" id="sp-setup-x" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="sp-setup-body">

        <div class="sp-step">
          <div class="sp-step-n">1</div>
          <div class="sp-step-c">
            <h3>The player, as a dock</h3>
            <p>In OBS: <b>Docks &rarr; Custom Browser Docks</b>. Give it a name, paste the URL, press Apply.</p>
            ${row('Dock URL', DOCK_URL)}
          </div>
        </div>

        <div class="sp-step">
          <div class="sp-step-n">2</div>
          <div class="sp-step-c">
            <h3>The attribution overlay, as a source</h3>
            <p>In OBS: <b>Sources &rarr; + &rarr; Browser</b>. Paste the URL and set the size to match your canvas,
               usually <b>1920 &times; 1080</b>.</p>
            ${row('Overlay URL', OVERLAY_URL)}
            <p class="sp-note"><b>Untick both</b> &ldquo;Shutdown source when not visible&rdquo; and
               &ldquo;Refresh browser when scene becomes active&rdquo;. Left on, the overlay forgets
               what is playing every time you change scene.</p>
          </div>
        </div>

        <div class="sp-step">
          <div class="sp-step-n">3</div>
          <div class="sp-step-c">
            <h3>Press play</h3>
            <p>The overlay fades in with the track, its licence, and the attribution line required by that licence.
               It hides when you pause.</p>
          </div>
        </div>

        <details class="sp-more">
          <summary>Other positions and styles</summary>
          <div class="sp-more-body">
            ${VARIANTS.map(([l, v]) => row(l, v)).join('')}
            <p class="sp-note">You can also tint it to match your scene by adding
               <code>&amp;accent=F0914D</code> with any hex, no <code>#</code>.</p>
          </div>
        </details>

        <p class="sp-note sp-note-last">Both must run in the <b>same OBS instance</b> &mdash; the dock tells the
           overlay what is playing through the browser they share. A browser window outside OBS will not drive it.</p>
      </div>
    </div>`;

  document.body.appendChild(el);

  const close = () => el.remove();
  el.querySelector('#sp-setup-x').addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('.sp-cp-btn');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied';
      btn.classList.add('done');
    } catch (err) {
      btn.textContent = 'Copy failed';
    }
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1600);
  });
}
