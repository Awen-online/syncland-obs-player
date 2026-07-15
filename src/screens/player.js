import { listPlaylists, getTrackClearance, logPlay, clearToken, isStub } from '../api.js';

/**
 * Player screen — plays through a playlist track-by-track, license-checking
 * each one before playback. Renders an attribution overlay when required.
 *
 * The audio element is kept simple: HTMLAudioElement + play/pause. When the
 * real API returns a signed stream_url, this just works. In stub mode, we
 * simulate a track with a synthetic silent buffer + a wall-clock advancer so
 * the UI behavior is testable without needing audio assets.
 */
export function renderPlayer($app, { playlistId, onBack, onSignOut }) {
  const state = {
    playlist: null,
    tracks:   [],
    index:    0,
    playing:  false,
    clearance: null,
    audio: new Audio(),
  };
  state.audio.preload = 'auto';

  $app.innerHTML = `
    <header class="sp-header">
      <div class="sp-logo">♪</div>
      <div class="sp-brand">Sync.Land <small>OBS Player</small></div>
      <div style="flex:1 1 auto;"></div>
      <button class="sp-btn sp-btn-secondary" id="pl-back"    style="padding:6px 12px; font-size:12px;">← Playlists</button>
    </header>
    <main class="sp-screen">
      <div id="pl-header">
        <div class="sp-eyebrow">Now playing</div>
        <h1 class="sp-h1" id="pl-playlist-name">Loading…</h1>
      </div>

      <div class="sp-player" id="pl-player" style="display:none;">
        <div class="sp-art" id="pl-art"></div>
        <div>
          <div class="sp-track-title" id="pl-title">—</div>
          <div class="sp-artist" id="pl-artist">—</div>
          <div class="sp-clearance" id="pl-clearance"></div>
          <div class="sp-controls">
            <button class="sp-icon-btn"      id="pl-prev"    title="Previous">⏮</button>
            <button class="sp-icon-btn play" id="pl-toggle"  title="Play / pause">▶</button>
            <button class="sp-icon-btn"      id="pl-next"    title="Next">⏭</button>
          </div>
        </div>
      </div>

      <div id="pl-attribution" style="margin-top: 8px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; color: var(--sp-text-muted);"></div>
      <div id="pl-status"></div>

      ${isStub() ? '<p style="color: var(--sp-text-muted); font-size: 12px; margin-top: 12px;">Stub mode: no actual audio. UI is driven by simulated track progression to validate the flow.</p>' : ''}
    </main>
    <footer class="sp-footer">
      <span>v0.1.0 · scaffold</span>
      <span><a href="https://sync.land/free-sync-license/" target="_blank">SLFS-v1</a></span>
    </footer>
  `;

  $app.querySelector('#pl-back').addEventListener('click', onBack);

  const $status = $app.querySelector('#pl-status');
  const $player = $app.querySelector('#pl-player');
  const $title  = $app.querySelector('#pl-title');
  const $artist = $app.querySelector('#pl-artist');
  const $clear  = $app.querySelector('#pl-clearance');
  const $attr   = $app.querySelector('#pl-attribution');
  const $toggle = $app.querySelector('#pl-toggle');
  const $prev   = $app.querySelector('#pl-prev');
  const $next   = $app.querySelector('#pl-next');
  const $name   = $app.querySelector('#pl-playlist-name');

  $toggle.addEventListener('click', () => togglePlay());
  $prev.addEventListener('click', () => step(-1));
  $next.addEventListener('click', () => step(+1));

  init();

  // ------------------------------------------------------------------
  async function init() {
    try {
      const resp = await listPlaylists();
      state.playlist = (resp.playlists || []).find((p) => p.id === playlistId);
      state.tracks   = (resp.tracks && resp.tracks[playlistId]) || [];
      if (!state.playlist) {
        renderStatus('err', 'Playlist not found. It may have been deleted.');
        return;
      }
      $name.textContent = state.playlist.name;
      if (!state.tracks.length) {
        renderStatus('info', 'This playlist has no tracks yet.');
        return;
      }
      $player.style.display = 'grid';
      await loadCurrentTrack();
    } catch (e) {
      renderStatus('err', `Could not load playlist — ${e.message}`);
    }
  }

  async function loadCurrentTrack() {
    const t = state.tracks[state.index];
    if (!t) return;
    const pos = `${state.index + 1} / ${state.tracks.length}`;
    const dur = t.duration ? ` · ${fmtDuration(t.duration)}` : '';
    $title.textContent  = t.title;
    $artist.textContent = `${t.artist}  —  ${pos}${dur}`;
    setArt(t.cover_url || '');
    $clear.innerHTML    = `<span class="sp-badge" style="background: rgba(255,255,255,0.06); color: var(--sp-text-muted); border: 1px solid rgba(255,255,255,0.12);">Checking…</span>`;
    $attr.textContent   = '';
    try {
      state.clearance = await getTrackClearance(t.song_id);
    } catch (e) {
      renderStatus('err', `License check failed — ${e.message}`);
      $clear.innerHTML = '<span class="sp-badge blocked">Blocked</span>';
      return;
    }
    // Prefer the clearance-response cover (higher-res, always current) over the list snapshot.
    if (state.clearance.song && state.clearance.song.cover_url) {
      setArt(state.clearance.song.cover_url);
    }
    if (!state.clearance.can_stream) {
      $clear.innerHTML = `<span class="sp-badge blocked">Blocked</span><span class="sp-badge" style="background: transparent; color: var(--sp-text-muted);">${state.clearance.reason_if_blocked || 'no_license'}</span>`;
      renderStatus('err', `Skipping — this track can't stream (${state.clearance.reason_if_blocked || 'no_license'}).`);
      setTimeout(() => step(+1), 1500);
      return;
    }
    const tierClass = state.clearance.tier === 'commercial' ? 'paid' : state.clearance.tier === 'custom' ? 'custom' : 'free';
    $clear.innerHTML = `<span class="sp-badge ${tierClass}">${state.clearance.tier_label}</span>` +
      (state.clearance.attribution_required ? `<span class="sp-badge" style="background:transparent; color:var(--sp-text-muted);">Attribution required</span>` : '');
    if (state.clearance.attribution_required) {
      $attr.textContent = state.clearance.attribution_text;
    }

    // Load audio (real URL when live; stubs return empty string)
    if (state.clearance.stream_url) {
      state.audio.src = state.clearance.stream_url;
      state.audio.load();
    }

    // Auto-advance when a real track ends
    state.audio.onended = () => step(+1);
  }

  async function togglePlay() {
    if (!state.clearance || !state.clearance.can_stream) return;
    if (state.playing) {
      state.audio.pause();
      state.playing = false;
      $toggle.textContent = '▶';
    } else {
      if (state.clearance.stream_url) {
        try {
          await state.audio.play();
        } catch (e) {
          renderStatus('err', `Playback failed — ${e.message}`);
          return;
        }
      } else if (isStub()) {
        // In stub mode we simulate a 25-second track and auto-advance.
        renderStatus('info', 'Stub playback — simulating 25s track…');
        setTimeout(() => { renderStatus('info', ''); step(+1); }, 25000);
      }
      state.playing = true;
      $toggle.textContent = '⏸';
      logPlay(state.tracks[state.index].song_id, 0).catch(() => {});
    }
  }

  function step(delta) {
    if (!state.tracks.length) return;
    state.audio.pause();
    state.playing = false;
    $toggle.textContent = '▶';
    state.index = (state.index + delta + state.tracks.length) % state.tracks.length;
    loadCurrentTrack();
  }

  function renderStatus(kind, msg) {
    $status.innerHTML = msg ? `<div class="sp-status ${kind}">${msg}</div>` : '';
  }

  function setArt(url) {
    const $art = $app.querySelector('#pl-art');
    if (!$art) return;
    if (url) {
      $art.innerHTML = `<img src="${url}" alt="" loading="lazy" onerror="this.remove()">`;
    } else {
      $art.innerHTML = '';
    }
  }

  function fmtDuration(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }
}
