import { isStub, getLastVerification } from '../api.js';
import { openSetupPanel } from '../setup-panel.js';
import * as pb from '../playback.js';
import { speakerIcon } from '../icons.js';

/**
 * Player screen.
 *
 * Transport now lives in the persistent bar (player-bar.js) driven by the
 * playback singleton, so this screen is only: the playlist, its tracks, and
 * the licence verification panel. Navigating away no longer stops the music
 * or orphans an audio element.
 *
 * The verification panel stays here rather than in the bar because it is the
 * M4 evidence surface — it wants room to show the endpoint, status and body.
 */
export function renderPlayer($app, { playlistId, onBack }) {
  $app.innerHTML = `
    <header class="sp-header">
      <img class="sp-logo" src="https://www.sync.land/wp-content/uploads/2024/06/cropped-SyncLand-Logo-optimized-192x192.png" alt="Sync.Land" width="28" height="28">
      <div class="sp-brand">Sync.Land <small>OBS Player</small></div>
      <div style="flex:1 1 auto;"></div>
      <button class="sp-btn sp-btn-secondary sp-obs-btn" id="obs-setup" style="padding:6px 12px; font-size:12px;">Add to OBS</button>
      <button class="sp-btn sp-btn-secondary" id="pl-back" style="padding:6px 12px; font-size:12px;">← Playlists</button>
    </header>
    <main class="sp-screen">
      <div class="sp-eyebrow">Now playing</div>
      <h1 class="sp-h1" id="pl-playlist-name">Loading…</h1>

      <section class="sp-now" id="pl-now">
        <img class="sp-now-art" id="pl-art" alt="">
        <div class="sp-now-body">
          <div class="sp-now-title" id="pl-nowtitle">Nothing playing</div>
          <div class="sp-now-sub"   id="pl-nowsub">Pick a track below</div>
          <div class="sp-now-bar" id="pl-seek"><div class="sp-now-fill" id="pl-fill"></div></div>
          <div class="sp-now-time"><span id="pl-pos">0:00</span><span id="pl-dur">0:00</span></div>
          <div class="sp-now-row">
            <div class="sp-now-transport">
              <button class="sp-bar-btn" id="pl-prev" title="Previous">&#9198;</button>
              <button class="sp-bar-btn play" id="pl-toggle" title="Play / pause">&#9654;</button>
              <button class="sp-bar-btn" id="pl-next" title="Next">&#9197;</button>
            </div>
            <button class="sp-out-mute" id="pl-mute" title="Mute (M)" aria-label="Mute"></button>
            <input class="sp-out-fader" id="pl-vol" type="range" min="0" max="1" step="0.01" aria-label="Volume">
            <span class="sp-out-num" id="pl-volnum">85</span>
            <button class="sp-chip" id="pl-duck" title="Duck under speech (D)">Duck</button>
          </div>
        </div>
      </section>

      <section class="sp-verify" id="pl-verify" hidden>
        <div class="sp-verify-head">
          <span class="sp-verify-dot" id="pv-dot"></span>
          <span class="sp-verify-title" id="pv-title">Checking licence…</span>
          <span class="sp-verify-meta" id="pv-meta"></span>
        </div>
        <code class="sp-verify-url" id="pv-url"></code>
        <div class="sp-verify-license" id="pv-license"></div>
        <div class="sp-verify-sub" id="pv-sub"></div>
        <button class="sp-verify-copy" id="pv-copy" type="button">Copy verification receipt</button>
      </section>

      <div id="pl-attribution" style="margin-top:10px; font-family:ui-monospace,'SF Mono',Menlo,monospace; font-size:12px; color:var(--sp-text-muted);"></div>
      <div id="pl-status"></div>

      <ol class="sp-tracklist" id="pl-tracks"></ol>


      ${isStub() ? '<p style="color:var(--sp-text-muted);font-size:12px;margin-top:12px;">Stub mode: no real audio. Track progression is simulated to validate the flow.</p>' : ''}
    </main>`;

  const $ = (s) => $app.querySelector(s);
  const $name = $('#pl-playlist-name');
  const $attr = $('#pl-attribution');
  const $stat = $('#pl-status');
  const $list = $('#pl-tracks');
  const $verify = $('#pl-verify');
  const $pvDot = $('#pv-dot'), $pvTitle = $('#pv-title'), $pvMeta = $('#pv-meta');
  const $pvUrl = $('#pv-url'), $pvLic = $('#pv-license'), $pvSub = $('#pv-sub');

  const $vol = $('#pl-vol'), $volNum = $('#pl-volnum');
  const $art = $('#pl-art'), $nowTitle = $('#pl-nowtitle'), $nowSub = $('#pl-nowsub');
  const $toggle = $('#pl-toggle'), $seek = $('#pl-seek'), $fill = $('#pl-fill');
  const $pos = $('#pl-pos'), $dur = $('#pl-dur');

  $toggle.addEventListener('click', pb.togglePlay);
  $('#pl-prev').addEventListener('click', () => pb.step(-1));
  $('#pl-next').addEventListener('click', () => pb.step(+1));
  $seek.addEventListener('click', (e) => {
    if (!pb.state.duration) return;
    const r = $seek.getBoundingClientRect();
    pb.seek(((e.clientX - r.left) / r.width) * pb.state.duration);
  });
  const $mute = $('#pl-mute'), $duck = $('#pl-duck');

  // Same singleton the bar drives, so the two faders track each other.
  $vol.addEventListener('input', (e) => pb.setVolume(parseFloat(e.target.value)));
  let premute = null;
  $mute.addEventListener('click', () => {
    if (premute === null) { premute = pb.getVolume(); pb.setVolume(0); }
    else { pb.setVolume(premute); premute = null; }
  });
  $duck.addEventListener('click', pb.toggleDuck);

  $('#pl-back').addEventListener('click', onBack);
  $('#obs-setup').addEventListener('click', openSetupPanel);

  // The receipt is the artefact the M4 submission needs: one paste carrying
  // endpoint, status, timing and the full verdict body.
  $('#pv-copy').addEventListener('click', async (e) => {
    const v = getLastVerification();
    if (!v) return;
    const receipt = [
      `${v.method} ${v.url}`,
      `HTTP ${v.status} in ${v.ms}ms at ${v.at}${v.stub ? '  [STUB]' : ''}`,
      '',
      JSON.stringify(v.response, null, 2),
    ].join('\n');
    const btn = e.currentTarget;
    try { await navigator.clipboard.writeText(receipt); btn.textContent = 'Copied'; }
    catch (err) { btn.textContent = 'Copy failed'; }
    setTimeout(() => { btn.textContent = 'Copy verification receipt'; }, 1800);
  });

  pb.loadPlaylist(playlistId);

  const unsub = pb.subscribe((st) => {
    $name.textContent = st.playlist ? st.playlist.name : (st.loading ? 'Loading…' : 'Playlist');

    $stat.innerHTML = st.status
      ? `<div class="sp-status ${st.status.kind}">${st.status.text}</div>` : '';

    $attr.textContent = (st.clearance && st.clearance.attribution_required)
      ? (st.clearance.attribution_text || '') : '';

    const t = pb.currentTrack();
    $nowTitle.textContent = t ? t.title : 'Nothing playing';
    $nowSub.textContent = t
      ? `${t.artist} · ${st.index + 1} of ${st.tracks.length}`
      : 'Pick a track below';
    const cover = (st.clearance && st.clearance.song && st.clearance.song.cover_url)
      || (t && t.cover_url) || '';
    if (cover) { $art.src = cover; $art.style.visibility = 'visible'; }
    else { $art.removeAttribute('src'); $art.style.visibility = 'hidden'; }
    $toggle.textContent = st.playing ? '⏸' : '▶';
    $toggle.disabled = !(st.clearance && st.clearance.can_stream);
    $pos.textContent = pb.fmtTime(st.position);
    $dur.textContent = pb.fmtTime(st.duration);
    $fill.style.width = st.duration
      ? `${Math.min(100, (st.position / st.duration) * 100)}%` : '0%';

    const uv = pb.getVolume();
    if (document.activeElement !== $vol) $vol.value = uv;
    $volNum.textContent = Math.round(uv * 100);
    const isMuted = uv === 0;
    $mute.classList.toggle('muted', isMuted);
    $mute.innerHTML = speakerIcon(isMuted);
    $mute.title = isMuted ? 'Unmute (M)' : 'Mute (M)';
    $mute.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
    $mute.setAttribute('aria-pressed', String(isMuted));
    $duck.classList.toggle('on', pb.isDucked());
    $duck.textContent = pb.isDucked() ? 'Ducked' : 'Duck';

    renderVerify(st);
    renderList(st);
  });

  // Screens are replaced wholesale; drop the subscription with the DOM.
  const mo = new MutationObserver(() => {
    if (!document.body.contains($list)) { unsub(); mo.disconnect(); }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  function renderList(st) {
    if (!st.tracks.length) { $list.innerHTML = ''; return; }
    $list.innerHTML = st.tracks.map((t, i) => `
      <li class="sp-track${i === st.index ? ' current' : ''}" data-i="${i}">
        <span class="sp-track-n">${i === st.index && st.playing ? '♪' : i + 1}</span>
        <span class="sp-track-t">${escapeHtml(t.title)}</span>
        <span class="sp-track-a">${escapeHtml(t.artist || '')}</span>
      </li>`).join('');
    $list.querySelectorAll('.sp-track').forEach((li) => {
      li.addEventListener('click', () => {
        const i = Number(li.dataset.i);
        if (i === pb.state.index) { pb.togglePlay(); return; }
        pb.step(i - pb.state.index);
      });
    });
  }

  function renderVerify(st) {
    if (!st.verify) { $verify.hidden = true; return; }
    $verify.hidden = false;
    const v = getLastVerification();
    if (!v || st.verify === 'pending') {
      $pvDot.className = 'sp-verify-dot pending';
      $pvTitle.textContent = 'Checking licence…';
      $pvMeta.textContent = ''; $pvUrl.textContent = '';
      $pvLic.textContent = ''; $pvSub.textContent = '';
      return;
    }
    $pvUrl.textContent = `${v.method} ${v.url.replace(/^https?:\/\//, '')}`;
    $pvMeta.textContent = `HTTP ${v.status} · ${v.ms}ms${v.stub ? ' · stub' : ''}`;
    const c = v.response || {};
    const when = `verified ${new Date(v.at).toUTCString().replace('GMT', 'UTC')}`;
    if (st.verify === 'verified') {
      $pvDot.className = 'sp-verify-dot ok';
      $pvTitle.textContent = 'Licence verified';
      $pvLic.textContent = c.tier_label || c.tier || 'Licensed';
      $pvSub.textContent = [
        c.attribution_required ? 'attribution required' : 'no attribution required', when,
      ].join(' · ');
    } else if (st.verify === 'blocked') {
      $pvDot.className = 'sp-verify-dot blocked';
      $pvTitle.textContent = 'Not licensed for streaming';
      $pvLic.textContent = c.reason_if_blocked || 'no_license';
      $pvSub.textContent = when;
    } else {
      $pvDot.className = 'sp-verify-dot blocked';
      $pvTitle.textContent = 'Verification failed';
      $pvLic.textContent = `HTTP ${v.status}`;
      $pvSub.textContent = typeof v.response === 'string' ? v.response.slice(0, 120) : '';
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
