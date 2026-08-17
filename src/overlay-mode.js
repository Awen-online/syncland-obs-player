import { readNowPlaying, subscribeNowPlaying, sendAudio, onAudio } from './nowplaying.js';
import { applyTheme, subscribeTheme, THEMES } from './theme.js';

/**
 * Overlay mode — an OBS Browser Source lower third.
 *
 * Purely reactive: it renders whatever the dock publishes and never touches
 * the API, so the Browser Source URL carries no token. Transparent
 * background so OBS composites it straight over the scene.
 *
 * URL options (all optional):
 *   ?mode=overlay            required, selects this mode
 *   &pos=bl|br|tl|tc|bc|tr   corner / edge, default bl (bottom-left)
 *   &compact=1               title + artist only, no cover, no licence chip
 *   &hold=0                  keep showing when paused (default hides)
 *   &accent=E237B2           override the accent hex, no leading #
 */
export function renderOverlay($app) {
  const q       = new URLSearchParams(location.search);
  const pos     = (q.get('pos') || 'bl').toLowerCase();
  const compact = q.get('compact') === '1';
  const hold    = q.get('hold') === '0' ? false : q.get('hold') === '1';
  const accent  = (q.get('accent') || '').replace(/[^0-9a-f]/gi, '');

  document.body.classList.add('overlay-mode', `ov-${pos}`);

  // A ?theme= on the Browser Source URL pins the overlay; otherwise it follows
  // whatever the dock is set to, live.
  const pinnedTheme = THEMES.some((t) => t.id === q.get('theme')) ? q.get('theme') : null;
  if (!pinnedTheme) { subscribeTheme((t) => applyTheme(t, false)); }
  // The <html> element keeps the app background, and CSS only cleared body and
  // #app — so OBS painted a solid #0e0e1a rectangle over the whole scene.
  // Set it inline on both so no stylesheet ordering can put it back.
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  if (compact) document.body.classList.add('ov-compact');
  if (accent) document.documentElement.style.setProperty('--sp-pink', `#${accent}`);

  $app.innerHTML = `
    <div class="sp-ov" id="ov">
      <img class="sp-ov-art" id="ov-art" alt="">
      <div class="sp-ov-body">
        <div class="sp-ov-eyebrow">
          <span class="sp-ov-pip"></span><span id="ov-eyebrow">On air</span>
        </div>
        <div class="sp-ov-title" id="ov-title"></div>
        <div class="sp-ov-artist" id="ov-artist"></div>
        <div class="sp-ov-attr" id="ov-attr"></div>
      </div>
      <div class="sp-ov-brand" id="ov-brand">
        <img src="https://www.sync.land/wp-content/uploads/2024/06/cropped-SyncLand-Logo-optimized-192x192.png" alt="">
        <span>sync<b>.</b>land</span>
      </div>
    </div>`;

  const $ov     = $app.querySelector('#ov');
  const $art    = $app.querySelector('#ov-art');
  const $title  = $app.querySelector('#ov-title');
  const $artist = $app.querySelector('#ov-artist');
  const $attr   = $app.querySelector('#ov-attr');
  const $brand  = $app.querySelector('#ov-brand');
  const $eyeb   = $app.querySelector('#ov-eyebrow');

  // Idle state. Without this a working-but-waiting overlay and a completely
  // broken one both render nothing, which is exactly the failure mode that
  // makes this thing impossible to debug on a stream deck at 2am.
  const debug = q.get('debug') === '1';
  const $wait = document.createElement('div');
  $wait.className = 'sp-ov-wait';
  $wait.textContent = 'Sync.Land overlay ready \u2014 waiting for the dock';
  $app.appendChild($wait);
  let waitTimer = null;
  function showWait() {
    $wait.style.display = '';
    clearTimeout(waitTimer);
    if (!debug) waitTimer = setTimeout(() => { $wait.style.display = 'none'; }, 25000);
  }
  function hideWait() { clearTimeout(waitTimer); $wait.style.display = 'none'; }
  showWait();

  let initial = readNowPlaying();
  if (initial && initial.at && (Date.now() - initial.at) > 12 * 3600 * 1000) {
    initial = null;   // yesterday's track is not "now playing"
  }
  if (debug) {
    console.info('[syncland-overlay] initial localStorage state:', initial);
    console.info('[syncland-overlay] BroadcastChannel supported:', typeof BroadcastChannel !== 'undefined');
  }
  /* ── Audio device ──────────────────────────────────────────────────
   * This element is inside a Browser Source, so OBS gives it a real mixer
   * channel with a fader, filters and monitoring. The dock cannot do that:
   * a dock is interface, and its sound goes straight to the desktop device.
   * We only obey the dock; we never decide what plays. */
  const oaudio = new Audio();
  oaudio.preload = 'auto';
  let lastUrl = '';

  onAudio((m) => {
    if (!m || !m.type) return;
    if (m.type === 'load') {
      if (m.url && m.url !== lastUrl) { lastUrl = m.url; oaudio.src = m.url; oaudio.load(); }
      if (typeof m.volume === 'number') oaudio.volume = m.volume;
      if (m.play) { oaudio.play().catch((e) => report('error', String(e && e.message || e))); }
    } else if (m.type === 'play')   { oaudio.play().catch((e) => report('error', String(e && e.message || e))); }
    else if (m.type === 'pause')    { oaudio.pause(); }
    else if (m.type === 'volume')   { if (typeof m.value === 'number') oaudio.volume = m.value; }
    else if (m.type === 'seek')     { if (isFinite(m.value)) { try { oaudio.currentTime = m.value; } catch (e) {} } }
    else if (m.type === 'stop')     { oaudio.pause(); try { oaudio.removeAttribute('src'); oaudio.load(); } catch (e) {} lastUrl = ''; }
  });

  function report(kind, extra) {
    sendAudio({
      type: 'state', kind,
      position: oaudio.currentTime || 0,
      duration: isFinite(oaudio.duration) ? oaudio.duration : 0,
      playing: !oaudio.paused,
      error: kind === 'error' ? (extra || 'playback error') : null,
    });
  }
  oaudio.addEventListener('timeupdate', () => report('tick'));
  oaudio.addEventListener('ended',      () => report('ended'));
  oaudio.addEventListener('error',      () => report('error',
    oaudio.error ? ('media error ' + oaudio.error.code) : 'media error'));
  oaudio.addEventListener('playing',    () => report('tick'));
  oaudio.addEventListener('pause',      () => report('tick'));

  // Presence beacon. The dock stays silent only while it can see this.
  sendAudio({ type: 'hello' });
  setInterval(() => sendAudio({ type: 'hb' }), 1500);

  render(initial);
  subscribeNowPlaying((s) => { if (debug) console.info('[syncland-overlay] update:', s); render(s); });

  function render(s) {
    if (!s || !s.title) { showWait(); return hide(); }
    if (s.playing === false && !hold) { hideWait(); return hide(); }

    $title.textContent  = s.title || '';
    $artist.textContent = s.artist || '';
    $eyeb.textContent   = s.playing === false ? 'Paused' : 'On air';

    // Attribution is the whole point of the overlay: it is how a stream stays
    // compliant with the licence the dock just verified.
    $attr.textContent = s.attribution_required ? (s.attribution_text || '') : '';
    $attr.style.display = $attr.textContent ? '' : 'none';

    if (!compact && s.cover_url) {
      $art.src = s.cover_url;
      $art.style.display = '';
    } else {
      $art.removeAttribute('src');
      $art.style.display = 'none';
    }

    // The tier name used to sit here. On stream the useful, and legally
    // meaningful, string is the attribution line above — the licence label
    // told a viewer nothing. This is the mark instead.
    $brand.style.display = '';

    hideWait();
    $ov.classList.add('visible');
  }

  function hide() { $ov.classList.remove('visible'); }
}
