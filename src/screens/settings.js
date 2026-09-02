import { settings, saveSettings, getVolume, setVolume,
         currentNormGain, normalisationActive, remoteAudio, signOut } from '../playback.js';
import { openSetupPanel } from '../setup-panel.js';
import { isOBS, obsVersion, surface } from '../obs.js';
import { THEMES, getTheme, applyTheme } from '../theme.js';

/**
 * Playback settings.
 *
 * These started as a popover hanging off the player bar, which was the wrong
 * home twice over: an OBS dock is a narrow panel with no room to spare, and
 * fade behaviour is something you set once per show rather than reach for
 * mid-stream. A screen also leaves room to explain what each control does.
 *
 * Playback is a singleton, so opening this never interrupts audio.
 */
export function renderSettings($app, { onBack }) {
  const inObs = isOBS();

  $app.innerHTML = `
    <header class="sp-header">
      <img class="sp-logo" src="https://www.sync.land/wp-content/uploads/2024/06/cropped-SyncLand-Logo-optimized-192x192.png" alt="Sync.Land" width="28" height="28">
      <div class="sp-brand">Sync.Land <small>OBS Player</small></div>
      <div style="flex:1 1 auto;"></div>
      <button class="sp-btn sp-btn-secondary" id="st-back" style="padding:6px 12px;font-size:12px;">← Back</button>
    </header>
    <main class="sp-screen">
      <div class="sp-eyebrow">Settings</div>
      <h1 class="sp-h1">Playback</h1>

      <section class="sp-set">
        <label class="sp-set-row">
          <div class="sp-set-copy">
            <b>Fade in and out</b>
            <span>Ease the music up and down on play, pause and track change instead of cutting.</span>
          </div>
          <input type="checkbox" id="st-fade" class="sp-switch">
        </label>

        <div class="sp-set-row col" id="st-fade-len">
          <div class="sp-set-copy">
            <b>Fade length <em id="st-ms-val"></em></b>
            <span>How long the ramp takes. Two seconds suits most talk formats.</span>
          </div>
          <input type="range" id="st-ms" min="250" max="8000" step="250">
        </div>
      </section>

      <h2 class="sp-set-h2">Audio routing</h2>
      <section class="sp-set">
        <div class="sp-set-row">
          <div class="sp-set-copy">
            <b id="st-route-b">Checking...</b>
            <span id="st-route-s"></span>
          </div>
          <span class="sp-set-tag" id="st-route">...</span>
        </div>
      </section>

      <h2 class="sp-set-h2">Loudness</h2>
      <section class="sp-set">
        <label class="sp-set-row">
          <div class="sp-set-copy">
            <b>Even out track loudness</b>
            <span>Measures each track as it plays and trims it toward a common level, so the fader
                  means the same thing on every song. A limiter catches peaks so a corrected track
                  can never clip.</span>
          </div>
          <input type="checkbox" id="st-norm" class="sp-switch">
        </label>
        <div class="sp-set-row col" id="st-target-row">
          <div class="sp-set-copy">
            <b>Target level <em id="st-target-val"></em></b>
            <span>Lower sits further under speech. Around -20 dBFS suits a music bed.</span>
          </div>
          <input type="range" id="st-target" min="0.04" max="0.20" step="0.005">
        </div>
        <div class="sp-set-row">
          <div class="sp-set-copy">
            <b>Applied to this track <em id="st-gain-val">-</em></b>
            <span id="st-gain-note">Measured over the first few seconds, then remembered per track.</span>
          </div>
          <button class="sp-btn sp-btn-secondary" id="st-gain-reset" style="padding:7px 14px;font-size:12.5px;">Forget all</button>
        </div>
      </section>

      <h2 class="sp-set-h2">Appearance</h2>
      <section class="sp-set">
        <div class="sp-set-row col">
          <div class="sp-set-copy">
            <b>Theme</b>
            <span>Applies to the dock and, unless the overlay URL says otherwise, the on-stream overlay too.</span>
          </div>
          <div class="sp-themes" id="st-themes">
            ${THEMES.map((t) => `
              <button class="sp-theme" data-theme="${t.id}" title="${t.hint}">
                <span class="sw" data-sw="${t.id}"><i></i></span>
                <span class="lb">${t.name}</span>
              </button>`).join('')}
          </div>
        </div>
        <div class="sp-set-row">
          <div class="sp-set-copy">
            <b>Overlay theme override</b>
            <span>Add <code>&amp;theme=light</code> to the Browser Source URL to theme the overlay separately from this panel.</span>
          </div>
        </div>
      </section>

      <h2 class="sp-set-h2">Ducking</h2>
      <section class="sp-set">
        <div class="sp-set-row col">
          <div class="sp-set-copy">
            <b>Duck level <em id="st-duck-val"></em></b>
            <span>Where the music sits while you talk over it. Press <kbd>D</kbd> in the dock to duck.</span>
          </div>
          <input type="range" id="st-duck" min="0" max="0.8" step="0.05">
        </div>
        <div class="sp-set-row col">
          <div class="sp-set-copy">
            <b>Duck speed <em id="st-duckms-val"></em></b>
            <span>Ducking drops fast on purpose. Coming back uses the fade length.</span>
          </div>
          <input type="range" id="st-duckms" min="80" max="1500" step="20">
        </div>
      </section>

      <h2 class="sp-set-h2">Output</h2>
      <section class="sp-set">
        <div class="sp-set-row col">
          <div class="sp-set-copy">
            <b>Volume <em id="st-vol-val"></em></b>
            <span>Also on the bar. Fades and ducks return to this level.</span>
          </div>
          <input type="range" id="st-vol" min="0" max="1" step="0.01">
        </div>
      </section>

      <h2 class="sp-set-h2">This window</h2>
      <section class="sp-set">
        <div class="sp-set-row">
          <div class="sp-set-copy">
            <b>${inObs ? 'Running inside OBS' : 'Running in a web browser'}</b>
            <span>${inObs
              ? `Detected via the OBS browser bridge${obsVersion() ? ', plugin ' + obsVersion() : ''}. This panel is never captured - only the overlay source is.`
              : 'Playback and the on-stream overlay only work once this is added to OBS as a dock.'}</span>
          </div>
          <span class="sp-set-tag ${inObs ? 'ok' : 'warn'}">${surface()}</span>
        </div>
        <div class="sp-set-row">
          <div class="sp-set-copy">
            <b>Overlay and dock setup</b>
            <span>URLs to paste into OBS, with copy buttons.</span>
          </div>
          <button class="sp-btn sp-btn-secondary" id="st-obs" style="padding:7px 14px;font-size:12.5px;">Open</button>
        </div>
        <div class="sp-set-row">
          <div class="sp-set-copy">
            <b>Sign out</b>
            <span>Forgets the access token stored in this browser.</span>
          </div>
          <button class="sp-btn sp-btn-secondary" id="st-out" style="padding:7px 14px;font-size:12.5px;">Sign out</button>
        </div>
      </section>
    </main>`;

  const $ = (s) => $app.querySelector(s);
  const fade = $('#st-fade'), ms = $('#st-ms'), duck = $('#st-duck');
  const duckms = $('#st-duckms'), vol = $('#st-vol');
  const norm = $('#st-norm'), target = $('#st-target');

  function sync() {
    fade.checked = !!settings.fade;
    ms.value = settings.fadeMs;
    duck.value = settings.duckLevel;
    duckms.value = settings.duckMs;
    vol.value = getVolume();
    $('#st-ms-val').textContent = (settings.fadeMs / 1000).toFixed(2).replace(/0$/, '') + 's';
    $('#st-duck-val').textContent = Math.round(settings.duckLevel * 100) + '%';
    $('#st-duckms-val').textContent = settings.duckMs + 'ms';
    $('#st-vol-val').textContent = Math.round(getVolume() * 100) + '%';
    $('#st-fade-len').style.opacity = settings.fade ? '1' : '.45';
    norm.checked = !!settings.normalize;
    target.value = settings.targetRms;
    $('#st-target-val').textContent =
      (20 * Math.log10(settings.targetRms)).toFixed(1) + ' dBFS';
    $('#st-target-row').style.opacity = settings.normalize ? '1' : '.45';
    const viaOverlay = remoteAudio();
    $('#st-route').textContent = viaOverlay ? 'OBS mixer' : 'desktop audio';
    $('#st-route').className = 'sp-set-tag ' + (viaOverlay ? 'ok' : 'warn');
    $('#st-route-b').textContent = viaOverlay
      ? 'Playing through the overlay source'
      : 'Playing through this dock';
    $('#st-route-s').textContent = viaOverlay
      ? 'Audio is on an OBS mixer channel, so it has its own fader, filters and monitoring, and is separate from your desktop sound.'
      : 'A dock is OBS interface, not a source, so its sound goes to your system output and only reaches the stream via Desktop Audio capture. Add the overlay Browser Source to move it onto the mixer.';

    const g = currentNormGain();
    $('#st-gain-val').textContent = normalisationActive()
      ? (g === 1 ? 'measuring…' : (20 * Math.log10(g) >= 0 ? '+' : '') + (20 * Math.log10(g)).toFixed(1) + ' dB')
      : 'off';
  }

  norm.addEventListener('change', () => { saveSettings({ normalize: norm.checked }); sync(); });
  target.addEventListener('input', () => { saveSettings({ targetRms: +target.value }); sync(); });
  $('#st-gain-reset').addEventListener('click', (e) => {
    Object.keys(localStorage).filter((k) => k.indexOf('syncland_gain_') === 0)
      .forEach((k) => localStorage.removeItem(k));
    e.currentTarget.textContent = 'Cleared';
    setTimeout(() => { e.currentTarget.textContent = 'Forget all'; }, 1600);
  });
  const gainPoll = setInterval(sync, 1000);
  window.addEventListener('beforeunload', () => clearInterval(gainPoll));

  fade.addEventListener('change', () => { saveSettings({ fade: fade.checked }); sync(); });
  ms.addEventListener('input',   () => { saveSettings({ fadeMs: +ms.value }); sync(); });
  duck.addEventListener('input', () => { saveSettings({ duckLevel: +duck.value }); sync(); });
  duckms.addEventListener('input', () => { saveSettings({ duckMs: +duckms.value }); sync(); });
  vol.addEventListener('input',  () => { setVolume(+vol.value); sync(); });

  // swatches painted from the real palettes, not hand-picked hexes
  const SW = {
    dark:     ['#0e0e1a', '#1f1f33', '#E237B2'],
    light:    ['#F4F3F8', '#FFFFFF', '#C21E93'],
    midnight: ['#070B18', '#101A33', '#6E8BFF'],
    ember:    ['#170D08', '#26170F', '#F0914D'],
    mono:     ['#111113', '#1D1D21', '#A9A9B4'],
  };
  function paintThemes() {
    const cur = getTheme();
    $app.querySelectorAll('.sp-theme').forEach((b) => {
      const id = b.dataset.theme, c = SW[id] || SW.dark;
      const sw = b.querySelector('.sw');
      sw.style.background = `linear-gradient(135deg, ${c[0]} 0 58%, ${c[1]} 58% 100%)`;
      sw.querySelector('i').style.background = c[2];
      b.classList.toggle('on', id === cur);
    });
  }
  $app.querySelectorAll('.sp-theme').forEach((b) => {
    b.addEventListener('click', () => { applyTheme(b.dataset.theme); paintThemes(); });
  });
  paintThemes();

  $('#st-back').addEventListener('click', onBack);
  $('#st-obs').addEventListener('click', openSetupPanel);
  $('#st-out').addEventListener('click', () => {
    signOut();
    window.location.reload();
  });

  sync();
}
