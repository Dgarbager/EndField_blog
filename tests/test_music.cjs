const {test} = require('node:test');
const assert = require('node:assert/strict');
const createMusic = require('../frontend/assets/music-engine.js');
const flush = () => new Promise(setImmediate);
function setup({missing = [], volume = .65, saved = {}} = {}) {
  let now = 0, next = 0;
  const frames = new Map(), timers = new Map(), loads = [], statuses = [];
  const audio = new EventTarget();
  Object.assign(audio, {paused: true, currentTime: 0, duration: NaN, readyState: 0});
  let level = volume, rejected = null, held = false;
  const clock = {now: () => now, frame: fn => { frames.set(++next, fn); return next; }, cancel: id => frames.delete(id),
    delay: (fn, ms) => { timers.set(++next, {fn, due: now + ms}); return next; }, clear: id => timers.delete(id)};
  const tracks = Object.fromEntries(['night', 'day', 'wuling'].map(theme => [theme, {name: theme, available: !missing.includes(theme)}]));
  const engine = createMusic({tracks, volume, saved, clock, onStatus: (state, theme) => statuses.push([state, theme]),
    driver: {audio, load: track => { loads.push(track.name); audio.currentTime = 0; audio.readyState = 0; audio.duration = NaN; },
      pause: () => { const wasPlaying = !audio.paused; audio.paused = true; if (wasPlaying) audio.dispatchEvent(new Event('pause')); },
      play: () => { if (rejected) return Promise.reject(rejected); audio.paused = false; return held ? new Promise(() => {}) : Promise.resolve(); },
      volume: value => value === undefined ? level : (level = value), seek: seconds => { audio.currentTime = seconds; }}});
  return {engine, audio, loads, statuses, level: () => level,
    reject(error) { rejected = error; }, holdPlay() { held = true; }, ready() { audio.readyState = 3; audio.duration = 180; audio.dispatchEvent(new Event('loadedmetadata')); audio.dispatchEvent(new Event('canplay')); },
    advance(ms) { now += ms; const current = [...frames.values()]; frames.clear(); current.forEach(fn => fn(now));
      for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); } }, frames, timers};
}
test('paused theme switches restore each track without auto-playing', () => {
  const env = setup({saved: {night: 85, day: 12}}); env.ready();
  assert.equal(env.audio.currentTime, 85); assert.equal(env.audio.paused, true);
  env.engine.switchTheme('day'); env.ready(); assert.equal(env.audio.currentTime, 12);
  env.audio.currentTime = 28; env.engine.switchTheme('night'); env.ready();
  assert.equal(env.audio.currentTime, 85); assert.equal(env.engine.getState().memory.day, 28); assert.equal(env.audio.paused, true);
});
test('playing theme transitions fade out then restore and fade in to the user volume', async () => {
  const env = setup({volume: .32, saved: {day: 41}}); env.ready(); env.engine.play(); await flush(); env.advance(550);
  env.audio.currentTime = 89; env.engine.switchTheme('day'); env.advance(210);
  assert.ok(env.level() < .32 && env.level() > 0); assert.deepEqual(env.loads, ['night']);
  env.advance(210); assert.deepEqual(env.loads, ['night', 'day']); env.ready(); await flush(); env.advance(550);
  assert.equal(env.audio.currentTime, 41); assert.equal(env.level(), .32); assert.equal(env.engine.getState().memory.night, 89);
});
test('rapid theme changes cancel earlier fade jobs and only load the final theme', async () => {
  const env = setup(); env.ready(); env.engine.play(); await flush(); env.advance(550);
  env.engine.switchTheme('day'); env.advance(100); env.engine.switchTheme('wuling'); env.advance(420);
  assert.deepEqual(env.loads, ['night', 'wuling']); env.ready(); await flush(); env.advance(550);
  assert.equal(env.engine.getState().theme, 'wuling'); assert.equal(env.engine.getState().phase, 'playing');
});
test('pausing while fading or waiting for metadata prevents later resumption', async () => {
  const env = setup(); env.ready(); env.engine.play(); await flush(); env.advance(550);
  env.engine.switchTheme('day'); env.advance(200); env.engine.pause(); env.ready(); await flush(); env.advance(20000);
  assert.equal(env.audio.paused, true); assert.equal(env.engine.getState().playing, false); assert.equal(env.frames.size, 0);
  env.engine.play(); await flush(); env.engine.switchTheme('wuling'); env.advance(420); env.engine.pause(); env.ready(); await flush(); env.advance(20000);
  assert.equal(env.audio.paused, true); assert.equal(env.engine.getState().playing, false);
});
test('muted volume stays zero after theme changes and missing tracks stop playback', async () => {
  const env = setup({volume: 0, missing: ['wuling']}); env.ready(); env.engine.play(); await flush(); env.advance(550);
  env.engine.switchTheme('day'); env.advance(420); env.ready(); await flush(); env.advance(550); assert.equal(env.level(), 0);
  env.engine.switchTheme('wuling'); assert.equal(env.engine.getState().phase, 'missing'); assert.equal(env.audio.paused, true);
  env.engine.switchTheme('night'); env.ready(); assert.equal(env.audio.paused, true);
});
test('blocked playback, errors and load timeouts never retry or start another track', async () => {
  const env = setup(); env.ready(); env.reject(Object.assign(new Error('blocked'), {name: 'NotAllowedError'}));
  env.engine.play(); await flush(); assert.equal(env.engine.getState().phase, 'blocked'); assert.equal(env.audio.paused, true);
  env.audio.dispatchEvent(new Event('error')); assert.equal(env.engine.getState().phase, 'error'); env.advance(20000); assert.deepEqual(env.loads, ['night']);
  const slow = setup(); slow.holdPlay();
  slow.engine.play(); slow.advance(15000); await flush(); assert.equal(slow.engine.getState().playing, false);
  env.engine.destroy(); assert.equal(env.frames.size, 0); assert.equal(env.timers.size, 0);
});
