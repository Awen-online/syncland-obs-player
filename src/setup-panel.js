import { isDemo } from './api.js';
import { remoteAudio } from './playback.js';
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
  const playerDone = !isDemo();
  const overlayDone = remoteAudio();

  const el = document.createElement('div');
  el.id = 'sp-setup';
  el.className = 'sp-setup-backdrop';
  el.innerHTML = `
    <div class="sp-setup" role="dialog" aria-modal="true" aria-labelledby="sp-setup-h">
      <div class="sp-setup-head">
        <h2 id="sp-setup-h">Set up Sync.Land in OBS</h2>
        <button class="sp-setup-x" id="sp-setup-x" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="sp-setup-body">

        <p class="sp-note sp-note-first">Two things: the <b>player</b> (your controls, only you see it)
           and the <b>overlay</b> (the credit your viewers see).</p>

        <div class="sp-step">
          <div class="sp-step-n">1</div>
          <div class="sp-step-c">
            <h3>Player ${playerDone ? '<span class="sp-tick">&#10003; Connected</span>' : ''}</h3>
            ${playerDone
              ? '<p>Your playlists are loaded.</p>'
              : `<p>Get your player link at <a href="https://sync.land/stream/" target="_blank">sync.land/stream</a>.
                 In OBS, click <b>Docks</b>, then <b>Custom Browser Docks</b>, paste it and click <b>Apply</b>.</p>
                 <p class="sp-note">A Dock, not a Source. Added as a Source, the player shows on your stream and can&rsquo;t be clicked.</p>`}
          </div>
        </div>

        <div class="sp-step">
          <div class="sp-step-n">2</div>
          <div class="sp-step-c">
            <h3>Overlay ${overlayDone ? '<span class="sp-tick">&#10003; On</span>' : ''}</h3>
            ${overlayDone
              ? '<p>Music and credit go to your stream.</p>'
              : `<p>In OBS, click <b>+</b> under <b>Sources</b>, choose <b>Browser</b>. Paste this link, click <b>OK</b>,
                 then press <b>Ctrl+F</b> (<b>Cmd+F</b> on a Mac) to fit it to your screen.</p>
                 ${row('Overlay link', OVERLAY_URL)}`}
          </div>
        </div>

        <div class="sp-step">
          <div class="sp-step-n">3</div>
          <div class="sp-step-c">
            <h3>Press play</h3>
            <p>The credit shows on your stream while music plays, and hides when you pause.</p>
          </div>
        </div>

        <details class="sp-more">
          <summary>Overlay position and style</summary>
          <div class="sp-more-body">
            ${VARIANTS.map(([l, v]) => row(l, v)).join('')}
            <p class="sp-note">You can also tint it to match your scene by adding
               <code>&amp;accent=F0914D</code> with any hex, no <code>#</code>.</p>
          </div>
        </details>

        <details class="sp-more">
          <summary>Not working?</summary>
          <div class="sp-more-body">
            <p class="sp-note"><b>&ldquo;Demo playlist&rdquo; in the player:</b> it is not connected. OBS keeps its own settings, separate from your web browser, so paste your player link into OBS, not a browser tab.</p>
            <p class="sp-note"><b>No credit on stream:</b> check the overlay is in the scene you are streaming, above your game or camera, and press Ctrl+F on it. It only shows while a track plays.</p>
            <p class="sp-note"><b>Both must be in the same OBS:</b> the player tells the overlay what is playing through the browser they share.</p>
            <p class="sp-note">More at <a href="https://www.sync.land/help/" target="_blank">sync.land/help</a>.</p>
          </div>
        </details>
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
