/* Theme BGM controller. APlayer is kept on one track so a failed file cannot
   trigger its automatic playlist skipping into another theme. */
(function expose(root, factory) {
  'use strict';
  const create = factory();
  if (typeof module === 'object' && module.exports) module.exports = create;
  else root.createEndfieldMusic = create;
})(typeof window === 'object' ? window : this, function factory() {
  'use strict';
  return function createMusic({driver, tracks, initialTheme = 'night', saved = {}, volume = .65,
    onStatus = () => {}, onMemory = () => {}, clock = {
      now: () => performance.now(), frame: fn => requestAnimationFrame(fn),
      cancel: id => cancelAnimationFrame(id), delay: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id)
    }}) {
    let theme = initialTheme, loaded = null, ready = false, intent = false;
    let phase = 'idle', generation = 0, frame = null, timeout = null, disposed = false;
    let level = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : .65;
    const memory = Object.fromEntries(Object.keys(tracks).map(key => [key,
      Number.isFinite(saved[key]) && saved[key] >= 0 ? saved[key] : 0]));
    const audio = driver.audio;
    function status(next) { phase = next; onStatus(next, theme); }
    function remember() {
      if (loaded && ready && Number.isFinite(audio.currentTime)) memory[loaded] = Math.max(0, audio.currentTime);
      onMemory({...memory});
    }
    function cancel() {
      generation++;
      if (frame !== null) clock.cancel(frame);
      if (timeout !== null) clock.clear(timeout);
      frame = timeout = null;
    }
    function fade(to, duration, complete) {
      if (frame !== null) clock.cancel(frame);
      const version = generation, start = clock.now(), from = driver.volume();
      function tick(now) {
        if (disposed || version !== generation) return;
        const progress = Math.min(1, (now - start) / duration);
        driver.volume(from + (to - from) * progress);
        if (progress < 1) frame = clock.frame(tick);
        else { frame = null; if (complete) complete(); }
      }
      frame = clock.frame(tick);
    }
    function fail() {
      if (disposed || !loaded) return;
      cancel(); intent = false; status('error'); driver.pause(); driver.volume(level);
    }
    function playCurrent() {
      const version = generation;
      let result;
      try { result = driver.play(); }
      catch (_) { fail(); return; }
      Promise.resolve(result).then(() => {
        if (disposed || generation !== version || !intent) return;
        if (timeout !== null) clock.clear(timeout);
        timeout = null;
        if (ready) { status('playing'); fade(level, 550); }
      }).catch(error => {
        if (disposed || generation !== version || !intent) return;
        cancel(); intent = false; status(error?.name === 'NotAllowedError' ? 'blocked' : 'error');
        driver.pause(); driver.volume(level);
      });
    }
    function awaitAudio() {
      if (timeout !== null) clock.clear(timeout);
      timeout = clock.delay(fail, 15000);
    }
    function load() {
      status('loading'); ready = false; driver.pause();
      loaded = theme; driver.volume(intent ? 0 : level);
      driver.load(tracks[theme]);
      if (!intent) status('standby');
      else { awaitAudio(); playCurrent(); }
    }
    function metadata() {
      if (disposed || !loaded || loaded !== theme || audio.readyState < 1 || (driver.isCurrent && !driver.isCurrent(tracks[loaded]))) return;
      ready = true;
      const seconds = memory[loaded] || 0;
      const duration = audio.duration;
      try { driver.seek(Number.isFinite(duration) && seconds < duration ? seconds : 0); }
      catch (_) { /* A later canplay event can restore a not-yet-seekable stream. */ }
      if (intent && !audio.paused) { status('playing'); fade(level, 550); }
    }
    function canplay() {
      if (!ready) metadata();
      if (ready && intent && !audio.paused) {
        if (timeout !== null) clock.clear(timeout);
        timeout = null; status('playing');
      }
    }
    function nativePause() {
      if (phase === 'playing' || phase === 'fading') pause();
    }
    function ended() { if (loaded) { memory[loaded] = 0; onMemory({...memory}); } }
    function switchTheme(next) {
      if (disposed || !Object.hasOwn(tracks, next)) return;
      if (next === theme && loaded === next && phase !== 'error' && phase !== 'blocked') return;
      remember(); const continuePlaying = intent || !audio.paused;
      cancel(); theme = next; intent = continuePlaying;
      if (!tracks[next].available) {
        status('missing'); driver.pause(); loaded = null; ready = false; intent = false; driver.volume(level); return;
      }
      if (continuePlaying && loaded && !audio.paused) { status('fading'); fade(0, 420, load); }
      else load();
    }
    function pause() {
      if (disposed) return;
      remember(); cancel(); intent = false; status(tracks[theme].available ? 'paused' : 'missing');
      driver.pause(); driver.volume(level);
      // If paused during fade-out, finish the visual theme switch without playing.
      if (loaded !== theme && tracks[theme].available) load();
    }
    function play() {
      if (disposed || !tracks[theme].available) return;
      if (loaded !== theme || phase === 'error') { cancel(); intent = true; load(); return; }
      cancel(); intent = true; driver.volume(ready ? level : 0); status('loading'); awaitAudio(); playCurrent();
    }
    function setVolume(value) {
      if (!Number.isFinite(value)) return;
      level = Math.max(0, Math.min(1, value));
      if (phase === 'fading') return;
      if (frame !== null) { clock.cancel(frame); frame = null; }
      driver.volume(level);
    }
    const listeners = {loadedmetadata: metadata, canplay, error: fail, pause: nativePause, ended};
    Object.entries(listeners).forEach(([event, handler]) => audio.addEventListener(event, handler));
    switchTheme(initialTheme);
    return {switchTheme, play, pause, remember, setVolume,
      toggle: () => intent || !audio.paused ? pause() : play(),
      getState: () => ({theme, loaded, phase, volume: level, playing: intent, memory: {...memory}}),
      destroy() { remember(); cancel(); disposed = true; driver.pause();
        Object.entries(listeners).forEach(([event, handler]) => audio.removeEventListener(event, handler)); }
    };
  };
});
