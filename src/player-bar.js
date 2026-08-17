import {
  subscribe, state, currentTrack, togglePlay, step, seek,
  setVolume, getVolume, fmtTime, toggleDuck, isDucked,
} from './playback.js';
import { speakerIcon } from './icons.js';

/**
 * Persistent transport, pinned to the bottom of the dock.
 *
 * Mounted once by main.js and never torn down, so controls stay available
 * while you browse playlists and the audio can't be orphaned by a screen
 * swap. Mirrors the silhouette of sync.land's own sticky footer player so
 * the dock reads as the same product — without sharing its code, which is
 * PHP + AmplitudeJS + a WP session nonce and cannot run in a static SPA.
 */
export function mountPlayerBar() {
  if (document.getElementById('sp-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'sp-bar';
  bar.className = 'sp-bar';
  bar.innerHTML = `
    <div class="sp-bar-seek" id="pb-seek" role="slider" aria-label="Seek" tabindex="0">
      <div class="sp-bar-seek-fill" id="pb-fill"></div>
    </div>
    <div class="sp-bar-inner">
      <img class="sp-bar-art" id="pb-art" alt="">
      <div class="sp-bar-meta">
        <div class="sp-bar-title" id="pb-title">Nothing playing</div>
        <div class="sp-bar-sub"   id="pb-sub">Pick a playlist to start</div>
      </div>
      <div class="sp-bar-controls">
        <button class="sp-bar-btn" id="pb-prev" title="Previous" aria-label="Previous">⏮</button>
        <button class="sp-bar-btn play" id="pb-toggle" title="Play / pause" aria-label="Play">▶</button>
        <button class="sp-bar-btn" id="pb-next" title="Next" aria-label="Next">⏭</button>
      </div>
      <div class="sp-bar-time mono" id="pb-time">0:00</div>
      <div class="sp-bar-right">
        <span class="sp-bar-lic" id="pb-lic" title=""></span>
        <button class="sp-chip" id="pb-duck" title="Duck under speech (D)">Duck</button>
        <button class="sp-chip icon" id="pb-settings" title="Playback settings" aria-label="Playback settings">⚙</button>
        <div class="sp-vol">
          <button class="sp-vol-mute" id="pb-mute" title="Mute (M)" aria-label="Mute"></button>
          <input class="sp-bar-vol" id="pb-vol" type="range" min="0" max="1" step="0.01"
                 aria-label="Volume" value="${getVolume()}">
          <span class="sp-vol-num" id="pb-volnum">${Math.round(getVolume() * 100)}</span>
        </div>
      </div>
    </div>
`;
  document.body.appendChild(bar);
  document.body.classList.add('has-player-bar');

  const $ = (id) => bar.querySelector(id);
  const art = $('#pb-art'), title = $('#pb-title'), sub = $('#pb-sub');
  const toggle = $('#pb-toggle'), time = $('#pb-time'), lic = $('#pb-lic');
  const fill = $('#pb-fill'), seekEl = $('#pb-seek'), vol = $('#pb-vol');

  toggle.addEventListener('click', togglePlay);
  $('#pb-prev').addEventListener('click', () => step(-1));
  $('#pb-next').addEventListener('click', () => step(+1));
  vol.addEventListener('input', (e) => setVolume(parseFloat(e.target.value)));

  const duckBtn = $('#pb-duck'), muteBtn = $('#pb-mute');
  const volNum = $('#pb-volnum');

  let premute = null;
  function toggleMute() {
    if (premute === null) { premute = getVolume(); setVolume(0); }
    else { setVolume(premute); premute = null; }
  }
  muteBtn.addEventListener('click', toggleMute);
  duckBtn.addEventListener('click', toggleDuck);

  // The bar does not know the router; main.js listens for this.
  $('#pb-settings').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('syncland:navigate', { detail: { screen: 'settings' } }));
  });

  seekEl.addEventListener('click', (e) => {
    if (!state.duration) return;
    const r = seekEl.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * state.duration);
  });
  seekEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') seek(state.position + 5);
    if (e.key === 'ArrowLeft')  seek(state.position - 5);
  });

  // Space toggles playback unless the user is typing.
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); toggleDuck(); }
    else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleMute(); }
  });

  subscribe(() => {
    const t = currentTrack();
    const has = !!t;
    bar.classList.toggle('idle', !has);

    title.textContent = has ? t.title : 'Nothing playing';
    if (has) {
      const pos = `${state.index + 1} / ${state.tracks.length}`;
      sub.textContent = `${t.artist} · ${pos}`;
    } else {
      sub.textContent = 'Pick a playlist to start';
    }

    const cover = (state.clearance && state.clearance.song && state.clearance.song.cover_url)
      || (t && t.cover_url) || '';
    if (cover) { art.src = cover; art.style.visibility = 'visible'; }
    else { art.removeAttribute('src'); art.style.visibility = 'hidden'; }

    duckBtn.classList.toggle('on', isDucked());
    duckBtn.textContent = isDucked() ? 'Ducked' : 'Duck';
    const uv = getVolume();
    if (document.activeElement !== vol) vol.value = uv;
    volNum.textContent = Math.round(uv * 100);
    const isMuted = uv === 0;
    muteBtn.classList.toggle('muted', isMuted);
    muteBtn.innerHTML = speakerIcon(isMuted);
    muteBtn.title = isMuted ? 'Unmute (M)' : 'Mute (M)';
    muteBtn.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
    muteBtn.setAttribute('aria-pressed', String(isMuted));

    toggle.textContent = state.playing ? '⏸' : '▶';
    toggle.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    toggle.disabled = !(state.clearance && state.clearance.can_stream);

    time.textContent = state.duration
      ? `${fmtTime(state.position)} / ${fmtTime(state.duration)}`
      : fmtTime(state.position);
    fill.style.width = state.duration
      ? `${Math.min(100, (state.position / state.duration) * 100)}%` : '0%';

    // Licence state as a glyph only — the dock is a narrow panel and the full
    // tier name belongs in the verification panel, which has room for it.
    if (state.verify === 'verified' && state.clearance) {
      lic.textContent = '✓';
      lic.className = 'sp-bar-lic ok';
      lic.title = (state.clearance.tier_label || 'Licensed')
        + (state.clearance.attribution_required ? ' · attribution required' : '');
    } else if (state.verify === 'blocked') {
      lic.textContent = '✕'; lic.className = 'sp-bar-lic bad';
      lic.title = 'Not licensed for streaming';
    } else if (state.verify === 'error') {
      lic.textContent = '!'; lic.className = 'sp-bar-lic bad';
      lic.title = 'Licence check failed';
    } else if (state.verify === 'pending') {
      lic.textContent = '···'; lic.className = 'sp-bar-lic pending';
      lic.title = 'Checking licence';
    } else {
      lic.textContent = ''; lic.className = 'sp-bar-lic'; lic.title = '';
    }
  });
}
