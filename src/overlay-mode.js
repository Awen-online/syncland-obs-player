import { listPlaylists, getTrackClearance, loadLastPlaylist } from './api.js';

/**
 * Overlay mode — designed to be captured as an OBS Browser Source. Renders
 * only the attribution string with a subtle fade animation, transparent
 * background. No controls. Polls the streamer's active session (via the
 * primary dock, which broadcasts via localStorage) OR falls back to the
 * last-selected playlist.
 *
 * v0.1 scaffold: renders a static placeholder overlay from the first track
 * of the last-picked playlist. v0.2 will listen for a `syncland_now_playing`
 * localStorage event dispatched by the dock's player.js on each track load.
 */
export function renderOverlay($app) {
  $app.innerHTML = `<div class="sp-overlay" id="ov-attr">
    <div class="sp-overlay-eyebrow">On air · Sync.Land</div>
    <div class="sp-overlay-text" id="ov-text">Loading…</div>
  </div>`;

  const $overlay = $app.querySelector('#ov-attr');
  const $text    = $app.querySelector('#ov-text');

  bootstrap();

  // Listen for dock updates: whenever player.js sets a track, it stores the
  // attribution string here. Any origin change fires storage; only same-domain
  // works but that's fine for OBS which loads everything from one origin.
  window.addEventListener('storage', (e) => {
    if (e.key === 'syncland_now_playing') {
      const val = e.newValue || '';
      show(val);
    }
  });

  async function bootstrap() {
    const pl = Number(loadLastPlaylist());
    if (!pl) {
      hide();
      return;
    }
    try {
      const resp    = await listPlaylists();
      const tracks  = (resp.tracks && resp.tracks[pl]) || [];
      const first   = tracks[0];
      if (!first) { hide(); return; }
      const clr = await getTrackClearance(first.song_id);
      show(clr.attribution_required ? clr.attribution_text : '');
    } catch (e) {
      show('');
    }
  }

  function show(text) {
    if (!text) { hide(); return; }
    $text.textContent = text;
    $overlay.classList.add('visible');
  }
  function hide() { $overlay.classList.remove('visible'); }
}
