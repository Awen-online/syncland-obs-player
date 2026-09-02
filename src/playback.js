import { listPlaylists, getTrackClearance, logPlay, isStub, clearToken, clearLastPlaylist } from './api.js';
import { publishNowPlaying, sendAudio, onAudio } from './nowplaying.js';

/**
 * The single owner of playback.
 *
 * This used to live inside the player screen, which meant `go('playlists')`
 * called $app.replaceChildren() and tore the UI down while `new Audio()` —
 * never in the DOM, never paused by the back handler — kept playing with
 * nothing attached to it. Hoisting it to a module singleton makes that
 * impossible: the audio element outlives every screen, and the persistent
 * bar is always wired to it.
 *
 * Screens and the bar both `subscribe()` and render from `state`.
 */

const listeners = new Set();

export const state = {
  playlistId: null,
  playlist:   null,
  tracks:     [],
  index:      0,
  playing:    false,
  clearance:  null,
  verify:     null,   // 'pending' | 'verified' | 'blocked' | 'error'
  status:     null,   // { kind: 'err'|'info', text }
  loading:    false,
  position:   0,
  duration:   0,
};

const audio = new Audio();
audio.preload = 'auto';
// Deliberately NOT set here. crossOrigin changes how every media request is
// validated, and it is only needed when the Web Audio graph is in play. It is
// applied in ensureGraph(), before the graph is built, and only then.
export function getAudio() { return audio; }

let stubTimer = null;

/* ── Remote audio device ──────────────────────────────────────────────
 * When an overlay Browser Source is alive it owns the audio, because OBS
 * gives a Source a real mixer channel and gives a dock nothing. The dock then
 * plays nothing locally and drives the overlay instead. If the overlay goes
 * away, we fall back to local playback so the dock still works standalone. */
let overlaySeen = 0;
export function remoteAudio() { return (Date.now() - overlaySeen) < 5000; }

onAudio((m) => {
  if (!m || !m.type) return;
  if (m.type === 'hb' || m.type === 'hello') {
    const wasRemote = remoteAudio();
    overlaySeen = Date.now();
    if (!wasRemote) {
      // An overlay just appeared: hand the audio over mid-song.
      if (audio && !audio.paused) { audio.pause(); }
      const t = currentTrack();
      if (t && state.clearance && state.clearance.stream_url) {
        sendAudio({ type: 'load', url: state.clearance.stream_url,
                    volume: liveTarget(), play: state.playing });
      }
      emit();
    }
    return;
  }
  if (m.type === 'state') {
    state.position = m.position || 0;
    state.duration = m.duration || 0;
    if (m.kind === 'ended') { step(+1); return; }
    if (m.kind === 'error') {
      setStatus('err', `Playback failed - ${m.error || 'the overlay could not play that file'}.`);
      state.playing = false;
    }
    emit();
  }
});

/* ── Loudness normalisation ───────────────────────────────────────────
 * The catalogue is mastered all over the place, so the fader means something
 * different on every track. The stored `_waveform_peaks` cannot help: every
 * track is peak-normalised to exactly 1.0 and the RMS spread across 40 songs
 * was only 2.8 dB, which is crest factor, not loudness.
 *
 * So we measure. The element feeds a Web Audio graph:
 *
 *   audio -> normGain -> limiter -> destination
 *                   \-> analyser (measurement tap)
 *
 * `audio.volume` still applies upstream of the graph, so all the fade, duck
 * and fader logic is untouched — normGain only corrects for the master.
 *
 * This is RMS, not true LUFS: no K-weighting, no gating. It lands tracks
 * within a few dB of each other, which is the practical goal; it is not a
 * broadcast-compliant measurement and should not be described as one.
 */
let actx = null, srcNode = null, normGain = null, limiter = null, analyser = null;
let measBuf = null, measSum = 0, measCount = 0, measSong = null, measDone = false;
const GAIN_KEY = 'syncland_gain_';
const MEAS_FRAMES = 260;          // ~4s of rAF samples before we commit
const GAIN_MIN = 0.25, GAIN_MAX = 4;

function cachedGain(songId) {
  const v = parseFloat(localStorage.getItem(GAIN_KEY + songId));
  return isFinite(v) ? v : null;
}
function cacheGain(songId, g) {
  try { localStorage.setItem(GAIN_KEY + songId, String(g)); } catch (e) {}
}

let graphTried = false;
function ensureGraph() {
  if (actx || graphTried || !settings.normalize) return;
  graphTried = true;                 // createMediaElementSource() is once-only
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // Must be set before the element has a resolved resource, or the graph
    // gets a tainted stream and outputs silence.
    if (audio.crossOrigin !== 'anonymous') {
      audio.crossOrigin = 'anonymous';
      if (audio.src) { const t = audio.currentTime; audio.load(); audio.currentTime = t || 0; }
    }
    actx     = new AC();
    srcNode  = actx.createMediaElementSource(audio);
    normGain = actx.createGain();
    limiter  = actx.createDynamicsCompressor();
    // A limiter, not a compressor: catch overs so a corrected track can never
    // clip, and otherwise stay out of the way.
    limiter.threshold.value = -1.5;
    limiter.knee.value      = 0;
    limiter.ratio.value     = 20;
    limiter.attack.value    = 0.003;
    limiter.release.value   = 0.25;
    analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    measBuf = new Float32Array(analyser.fftSize);

    srcNode.connect(normGain);
    normGain.connect(analyser);
    normGain.connect(limiter);
    limiter.connect(actx.destination);
  } catch (e) {
    // Once createMediaElementSource() has run, the element no longer feeds the
    // speakers directly — it feeds the graph. Bailing out here without a route
    // to destination is silence, and a half-built graph was almost certainly
    // the "no supported sources" report. Wire whatever exists straight out.
    try {
      if (srcNode && actx) { srcNode.disconnect(); srcNode.connect(actx.destination); }
    } catch (e2) { /* nothing more we can do */ }
    normGain = null; analyser = null; limiter = null;
  }
}

/** Called on every track load. Applies a cached gain or starts measuring. */
function primeNormalisation(songId) {
  measSong = songId; measSum = 0; measCount = 0; measDone = false;
  if (!settings.normalize) { if (normGain) normGain.gain.value = 1; return; }
  ensureGraph();
  if (!normGain) return;
  const g = cachedGain(songId);
  if (g) { normGain.gain.value = g; measDone = true; }
  else   { normGain.gain.value = 1; }
}

function measureTick() {
  if (!analyser || measDone || !state.playing) return;
  analyser.getFloatTimeDomainData(measBuf);
  let sq = 0;
  for (let i = 0; i < measBuf.length; i++) { sq += measBuf[i] * measBuf[i]; }
  const rms = Math.sqrt(sq / measBuf.length);
  if (rms > 0.0005) { measSum += rms; measCount++; }   // ignore silence/intros
  if (measCount >= MEAS_FRAMES) {
    const avg = measSum / measCount;
    let g = settings.targetRms / Math.max(avg, 0.0005);
    g = Math.max(GAIN_MIN, Math.min(GAIN_MAX, g));
    // Ramp rather than jump; a step change mid-track is audible.
    try { normGain.gain.linearRampToValueAtTime(g, actx.currentTime + 1.5); }
    catch (e) { normGain.gain.value = g; }
    if (measSong) cacheGain(measSong, g);
    measDone = true;
  }
}

/** Gain currently applied, for display. */
export function currentNormGain() { return normGain ? normGain.gain.value : 1; }
export function normalisationActive() { return !!(actx && normGain && settings.normalize); }


/**
 * Volume model.
 *
 * `userVolume` is the level the fader is set to — the target every fade
 * returns to. `audio.volume` is the live value and gets ramped underneath it,
 * so a fade or a duck never loses where the user actually set the fader.
 */
const SETTINGS_KEY = 'syncland_playback_settings';
export const settings = Object.assign({
  fade: true,       // fade in/out on play, pause and track change
  fadeMs: 2000,     // ramp length
  duckLevel: 0.2,   // level the duck button drops to
  duckMs: 350,      // ducking is fast on the way down, it is a talk-over
  // Off by default. This routes audio through a Web Audio graph, and a
  // half-built graph takes the sound with it — which is exactly what happened
  // on 2026-08-17. Opt in from Settings once you have confirmed it behaves.
  normalize: false,
  targetRms: 0.10,  // ~-20 dBFS: a sane bed level under speech
}, readSettings());

function readSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
export function saveSettings(patch) {
  Object.assign(settings, patch || {});
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  emit();
}

let userVolume = (() => {
  const v = parseFloat(localStorage.getItem('syncland_volume'));
  return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.85;
})();
let ducked = false;
let rampId = null;

audio.volume = userVolume;

export function isDucked() { return ducked; }
export function getUserVolume() { return userVolume; }

/** Smooth, cancellable ramp. rAF so it never fights the audio thread. */
export function rampTo(target, ms) {
  cancelAnimationFrame(rampId);
  target = Math.max(0, Math.min(1, target));
  if (!ms || ms < 16) { audio.volume = target; emit(); return Promise.resolve(); }
  const from = audio.volume;
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      // equal-power-ish curve; a linear ramp sounds like it lurches at the end
      audio.volume = from + (target - from) * (k * k * (3 - 2 * k));
      if (k < 1) { rampId = requestAnimationFrame(tick); }
      else { audio.volume = target; emit(); resolve(); }
    };
    rampId = requestAnimationFrame(tick);
  });
}

function liveTarget() { return ducked ? userVolume * settings.duckLevel : userVolume; }

/** Talk-over: drop fast, come back at the fade length. */
export function toggleDuck() {
  ducked = !ducked;
  if (remoteAudio()) { sendAudio({ type: 'volume', value: liveTarget() }); emit(); return; }
  rampTo(liveTarget(), ducked ? settings.duckMs : Math.max(settings.duckMs, settings.fadeMs / 2));
  emit();
}


function emit() { listeners.forEach((fn) => { try { fn(state); } catch (e) {} }); }
export function subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }

export function currentTrack() { return state.tracks[state.index] || null; }

function setStatus(kind, text) { state.status = text ? { kind, text } : null; emit(); }

audio.addEventListener('timeupdate', () => {
  measureTick();
  state.position = audio.currentTime || 0;
  state.duration = audio.duration || 0;
  emit();
});
audio.addEventListener('ended', () => step(+1));

// ?diag=1 surfaces the media element's real state. Guessing at this from a
// one-line error message has cost three rounds already.
const DIAG = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('diag') === '1';
if (DIAG) {
  ['loadstart','loadedmetadata','canplay','stalled','waiting','error','emptied','suspend']
    .forEach((n) => audio.addEventListener(n, () => {
      console.info('[syncland-audio]', n, {
        readyState: audio.readyState, networkState: audio.networkState,
        src: (audio.currentSrc || audio.getAttribute('src') || '(none)').slice(-60),
        crossOrigin: audio.crossOrigin, graph: !!actx,
        err: audio.error ? audio.error.code : null,
      });
    }));
}
export function diagnostics() {
  return {
    src: audio.currentSrc || audio.getAttribute('src') || '(none)',
    readyState: audio.readyState, networkState: audio.networkState,
    crossOrigin: audio.crossOrigin || '(unset)',
    graphBuilt: !!actx, normalize: settings.normalize,
    error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
    clearanceUrl: (state.clearance && state.clearance.stream_url) || '(none)',
  };
}
audio.addEventListener('error', () => {
  const c = audio.error && audio.error.code;
  if (!c) return;
  const why = c === 4
    ? 'the browser could not play that file'
    : c === 2 ? 'a network error interrupted it' : 'the audio failed to decode';
  setStatus('err', `Playback failed - ${why}.`);
  state.playing = false;
  emit();
});

/** Everything the OBS overlay needs, so it holds no token and calls nothing. */
function publish() {
  const t = currentTrack();
  if (!t || !state.clearance || !state.clearance.can_stream) { publishNowPlaying(null); return; }
  publishNowPlaying({
    title:   t.title,
    artist:  t.artist,
    cover_url: (state.clearance.song && state.clearance.song.cover_url) || t.cover_url || '',
    tier_label: state.clearance.tier_label || '',
    attribution_required: !!state.clearance.attribution_required,
    attribution_text: state.clearance.attribution_text || '',
    playing: state.playing,
  });
}

export async function loadPlaylist(playlistId) {
  const pid = Number(playlistId);
  if (Number(state.playlistId) === pid && state.tracks.length) {
    if (state.status) { state.status = null; emit(); }   // drop a stale notice
    return;
  }

  // Do NOT stop first. The old order killed the audio, then fetched, so any
  // failure left you with silence AND an error banner — and switching
  // playlists always produced an audible gap even when it succeeded.
  // Fetch, validate, and only then hand over.
  state.loading = true; state.status = null; emit();

  try {
    const resp = await listPlaylists();

    // WordPress hands ids back as numeric strings often enough that a strict
    // === against a Number silently reports "playlist not found".
    const pl = (resp.playlists || []).find((p) => Number(p.id) === pid) || null;
    const tr = (resp.tracks && (resp.tracks[pid] || resp.tracks[String(pid)])) || [];

    state.loading = false;

    if (!pl) {
      setStatus('err', 'That playlist could not be loaded. Still playing the previous one.');
      return;                       // whatever is playing keeps playing
    }
    if (!tr.length) {
      setStatus('info', 'This playlist has no tracks yet.');
      return;                       // ditto
    }

    // Hand over. Carry the transport state so a switch mid-show stays playing.
    const wasPlaying = state.playing;
    stop();
    state.playlistId = pid;
    state.playlist   = pl;
    state.tracks     = tr;
    state.index      = 0;
    state.playing    = wasPlaying;
    emit();
    await loadCurrentTrack();
  } catch (e) {
    state.loading = false;
    setStatus('err', `Could not load playlist - ${e.message}`);
  }
}

export async function loadCurrentTrack() {
  const t = currentTrack();
  if (!t) return;
  state.clearance = null;
  state.verify = 'pending';
  state.status = null;
  emit();

  try {
    state.clearance = await getTrackClearance(t.song_id);
  } catch (e) {
    state.verify = 'error';
    setStatus('err', `License check failed - ${e.message}`);
    publishNowPlaying(null);
    return;
  }

  if (!state.clearance.can_stream) {
    state.verify = 'blocked';
    publishNowPlaying(null);
    setStatus('err', `Skipping - this track can't stream (${state.clearance.reason_if_blocked || 'no_license'}).`);
    setTimeout(() => step(+1), 1500);
    return;
  }

  state.verify = 'verified';
  if (remoteAudio()) {
    // The overlay is the speaker. Never load it locally too, or the track
    // plays twice, slightly out of phase.
    sendAudio({ type: 'load', url: state.clearance.stream_url || '',
                volume: liveTarget(), play: state.playing });
  } else {
    primeNormalisation(t.song_id);
    if (state.clearance.stream_url) {
      audio.src = state.clearance.stream_url;
      audio.load();
    }
  }
  publish();
  emit();

  // Keep playing across a track change once the user has started.
  if (state.playing && !remoteAudio()) {
    if (state.clearance.stream_url) {
      try {
        if (settings.fade) { audio.volume = 0; }
        await audio.play();
        if (settings.fade) { rampTo(liveTarget(), settings.fadeMs); }
        else { audio.volume = liveTarget(); }
      } catch (e) { state.playing = false; }
    } else if (isStub()) { armStub(); }
    publish(); emit();
  }
}

function armStub() {
  clearTimeout(stubTimer);
  stubTimer = setTimeout(() => step(+1), 25000);
}

export async function togglePlay() {
  if (!state.clearance || !state.clearance.can_stream) return;
  if (state.playing) {
    clearTimeout(stubTimer);
    state.playing = false;
    emit();
    if (remoteAudio()) { sendAudio({ type: 'pause' }); publish(); return; }
    // Ramp down first so a pause never clips; only then actually pause.
    if (settings.fade) { await rampTo(0, settings.fadeMs); }
    audio.pause();
  } else if (remoteAudio()) {
    sendAudio({ type: 'play' });
    state.playing = true;
    const rt = currentTrack();
    if (rt) logPlay(rt.song_id, 0).catch(() => {});
    publish(); emit();
    return;
  } else {
    if (state.clearance.stream_url) {
      try {
        // stop() strips the src; if anything re-entered before the reload
        // finished, put it back rather than calling play() on an empty element.
        if (!audio.currentSrc && !audio.getAttribute('src')) {
          audio.src = state.clearance.stream_url;
          audio.load();
        }
        ensureGraph();
        if (actx && actx.state === 'suspended') { await actx.resume(); }
        if (settings.fade) { audio.volume = 0; }
        await audio.play();
        if (settings.fade) { rampTo(liveTarget(), settings.fadeMs); }
        else { audio.volume = liveTarget(); }
      }
      catch (e) { setStatus('err', `Playback failed - ${e.message}`); return; }
    } else if (isStub()) {
      setStatus('info', 'Stub playback - simulating a 25s track…');
      armStub();
    }
    state.playing = true;
    const t = currentTrack();
    if (t) logPlay(t.song_id, 0).catch(() => {});
  }
  publish();
  emit();
}

export function step(delta) {
  if (!state.tracks.length) return;
  clearTimeout(stubTimer);
  state.index = (state.index + delta + state.tracks.length) % state.tracks.length;
  emit();
  loadCurrentTrack();
}

export function seek(seconds) {
  const d = state.duration || audio.duration || 0;
  const v = Math.max(0, Math.min(seconds, d || seconds));
  if (remoteAudio()) { sendAudio({ type: 'seek', value: v }); state.position = v; emit(); return; }
  if (audio.duration) { audio.currentTime = v; }
}

export function setVolume(v) {
  userVolume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('syncland_volume', String(userVolume)); } catch (e) {}
  cancelAnimationFrame(rampId);          // a fader move beats an in-flight fade
  audio.volume = liveTarget();
  if (remoteAudio()) sendAudio({ type: 'volume', value: liveTarget() });
  emit();
}
export function getVolume() { return userVolume; }

/** Full stop — used when signing out or leaving the playlist entirely. */
export function stop() {
  clearTimeout(stubTimer);
  cancelAnimationFrame(rampId);
  if (remoteAudio()) sendAudio({ type: 'stop' });
  audio.pause();
  audio.volume = liveTarget();
  try { audio.removeAttribute('src'); audio.load(); } catch (e) {}
  state.playing = false;
  state.clearance = null;
  state.verify = null;
  publishNowPlaying(null);
  emit();
}

/**
 * Sign out, and actually leave nothing behind.
 *
 * Dropping the token was never enough. The queue stayed loaded, the last
 * playlist was still in localStorage so the next sign-in silently restored
 * someone else's selection, and — the one that matters on air — the overlay
 * kept rendering the previous track's attribution, because nothing told it to
 * stop. A signed-out dock was still publishing a licensed track's credit to
 * the stream.
 *
 * stop() covers the playback side: it pauses, drops the src, clears the
 * clearance and verification state, and publishes a null now-playing, which
 * both clears the overlay's stored state and broadcasts the clear to any
 * overlay window already open.
 *
 * Playback preferences (volume, per-song gain, normalisation, theme) are
 * deliberately kept. They belong to this machine, not to the account.
 */
export function signOut() {
  stop();
  clearToken();
  clearLastPlaylist();
}

export function fmtTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
