(function initEndfieldMusic() {
  'use strict';
  const shell = document.getElementById('ef-music');
  if (!shell) return;
  const host = document.getElementById('ef-aplayer');
  const output = document.getElementById('ef-music-status');
  const retry = document.getElementById('ef-music-retry');
  const collapse = document.getElementById('ef-music-toggle');
  const slider = document.getElementById('ef-music-volume');
  const listButton = document.getElementById('ef-music-list-toggle');
  const list = document.getElementById('ef-music-tracks');
  const collapseGlyph = document.createElement('span');
  collapseGlyph.className = 'ef-music-toggle-glyph'; collapseGlyph.setAttribute('aria-hidden', 'true');
  collapseGlyph.textContent = '‹'; collapse.replaceChildren(collapseGlyph);
  const labels = {night: '极夜终端', day: '白昼工程', wuling: '武陵重工'};
  const version = document.currentScript ? new URL(document.currentScript.src).search : '';
  const configuration = window.EndfieldMusicConfig;
  let player = null, engine = null, catalog = {}, tracks = {}, lastSaved = 0, loading = false;
  function read(storage, key, fallback) {
    try { const raw = storage.getItem(key); return raw === null ? fallback : JSON.parse(raw); }
    catch (_) { return fallback; }
  }
  function write(storage, key, value) { try { storage.setItem(key, JSON.stringify(value)); } catch (_) { /* Optional persistence. */ } }
  // Storage itself can be blocked, before getItem is called.
  let local = null, session = null;
  try { local = window.localStorage; session = window.sessionStorage; } catch (_) { /* In-page operation still works. */ }
  let volume = read(local, 'ef_bgm_volume', .65);
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) volume = .65;
  let collapsed = read(local, 'ef_bgm_collapsed', window.matchMedia('(max-width: 600px)').matches);
  function currentTheme() { const theme = document.documentElement.dataset.theme; return Object.hasOwn(labels, theme) ? theme : 'night'; }
  function saveMemory(memory) { write(session, 'ef_bgm_progress', memory); }
  function placeholder(theme) {
    host.replaceChildren();
    const box = document.createElement('div'); box.className = 'ef-music-placeholder';
    const image = document.createElement('img'); image.src = configuration[theme].cover + version; image.alt = '';
    const text = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('small');
    title.textContent = labels[theme]; detail.textContent = '主题音乐待命'; text.append(title, detail); box.append(image, text); host.append(box);
    syncCollapsedContent();
  }
  function syncCollapsedContent() {
    shell.querySelectorAll('.ef-music-heading, .ef-music-footer, .aplayer-info, .ef-music-placeholder > div').forEach(node => {
      if (collapsed && node.contains(document.activeElement)) collapse.focus();
      node.inert = collapsed;
      node.setAttribute('aria-hidden', String(collapsed));
    });
  }
  function setCollapsed(value) {
    collapsed = Boolean(value); shell.classList.toggle('is-collapsed', collapsed);
    collapse.setAttribute('aria-expanded', String(!collapsed));
    collapse.setAttribute('aria-label', collapsed ? '展开音乐播放器' : '收起音乐播放器');
    syncCollapsedContent();
    if (collapsed) { list.hidden = true; listButton.setAttribute('aria-expanded', 'false'); }

  }
  function showStatus(state, theme) {
    const messages = {
      missing: '音乐待配置', standby: '点击封面播放', loading: '正在加载音乐…',
      playing: '正在播放', paused: '已暂停', fading: '主题切换中…',
      blocked: '请点击封面继续播放', error: '音频加载失败，请重试'
    };
    output.textContent = labels[theme] + ' · ' + (messages[state] || '音乐待命');
    shell.classList.toggle('is-unavailable', state === 'missing');
    retry.hidden = !['missing', 'error', 'blocked'].includes(state);
    retry.textContent = state === 'blocked' ? '播放' : '重试';
    slider.disabled = state === 'missing';
    const picture = host.querySelector('.aplayer-pic');
    if (picture) {
      picture.setAttribute('aria-label', (engine?.getState().playing ? '暂停' : '播放') + labels[theme] + '音乐');
      picture.setAttribute('aria-disabled', String(state === 'missing'));
      picture.tabIndex = state === 'missing' ? -1 : 0;
      if (state === 'missing') {
        picture.style.backgroundImage = `url("${configuration[theme].cover + version}")`;
        host.querySelector('.aplayer-title').textContent = configuration[theme].name;
        host.querySelector('.aplayer-author').textContent = ' - ' + configuration[theme].artist;
      }
    }
  }
  function enhanceControls() {
    const picture = host.querySelector('.aplayer-pic');
    picture.setAttribute('role', 'button'); picture.tabIndex = 0;
    picture.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); engine?.toggle(); }
    });
    const bar = host.querySelector('.aplayer-bar-wrap');
    bar.setAttribute('role', 'slider'); bar.tabIndex = 0;
    bar.setAttribute('aria-label', '音乐播放进度'); bar.setAttribute('aria-valuemin', '0');
    bar.addEventListener('keydown', event => {
      const duration = player.audio.duration;
      if (!Number.isFinite(duration)) return;
      let time = player.audio.currentTime;
      if (event.key === 'ArrowRight') time += 5;
      else if (event.key === 'ArrowLeft') time -= 5;
      else if (event.key === 'Home') time = 0;
      else if (event.key === 'End') time = Math.max(0, duration - .1);
      else return;
      event.preventDefault(); player.seek(Math.max(0, Math.min(duration, time))); engine?.remember();
    });
    player.audio.addEventListener('timeupdate', () => {
      const seconds = Math.floor(player.audio.currentTime || 0), duration = Math.floor(player.audio.duration || 0);
      bar.setAttribute('aria-valuemax', String(Number.isFinite(duration) ? duration : 0));
      bar.setAttribute('aria-valuenow', String(seconds));
      if (Date.now() - lastSaved > 5000) { lastSaved = Date.now(); engine?.remember(); }
    });
  }
  function initializePlayer(theme) {
    try {
      // APlayer 1.x reads its preference storage eagerly. Discard malformed JSON
      // for this component only, leaving the site's other preferences alone.
      const old = read(local, 'ef_bgm_aplayer', null);
      if (!old || typeof old !== 'object' || Array.isArray(old)) write(local, 'ef_bgm_aplayer', {});
      host.replaceChildren();
      player = new APlayer({container: host, fixed: false, mini: false, autoplay: false,
        loop: 'one', order: 'list', preload: 'metadata', volume, mutex: true, lrcType: 0,
        storageName: 'ef_bgm_aplayer', listFolded: true, theme: configuration[theme].theme,
        audio: [tracks[theme]]});
      const ap = player;
      ap.audio.hidden = true; ap.audio.setAttribute('aria-hidden', 'true'); host.append(ap.audio);
      const memory = read(session, 'ef_bgm_progress', {});
      engine = createEndfieldMusic({initialTheme: theme, tracks, volume,
        saved: memory && typeof memory === 'object' ? memory : {}, onMemory: saveMemory, onStatus: showStatus,
        driver: {audio: ap.audio, volume: value => value === undefined ? ap.volume() : ap.volume(value, true),
          load(track) { ap.list.clear(); ap.list.add(track); }, pause: () => ap.pause(),
          play: () => ap.audio.play(), seek: seconds => ap.seek(seconds),
          isCurrent: track => !ap.audio.currentSrc || ap.audio.currentSrc === new URL(track.url, location.href).href}});
      enhanceControls(); setCollapsed(collapsed); showStatus(engine.getState().phase, theme);
    } catch (_) {
      if (engine) engine.destroy(); engine = null;
      if (player) player.destroy(); player = null;
      placeholder(theme); output.textContent = '音乐播放器暂不可用，请重试'; retry.hidden = false;
    }
  }
  function syncTheme(theme = currentTheme()) {
    if (!Object.hasOwn(labels, theme)) return;
    document.getElementById('ef-music-heading').textContent = 'THEME_BGM // ' + labels[theme];
    list.querySelectorAll('[data-music-theme]').forEach(button => {
      if (button.dataset.musicTheme === theme) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    if (engine) engine.switchTheme(theme);
    else if (tracks[theme]?.available) initializePlayer(theme);
    else { placeholder(theme); showStatus('missing', theme); }
  }
  async function refreshCatalog() {
    if (loading) return;
    loading = true; retry.disabled = true;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/music', {signal: controller.signal, cache: 'no-store', credentials: 'omit'});
      if (!response.ok) throw new Error('catalog unavailable');
      catalog = (await response.json()).tracks;
      tracks = Object.fromEntries(Object.entries(configuration).map(([theme, info]) => [theme, {
        ...info, cover: info.cover + version, available: catalog?.[theme]?.available === true,
        url: catalog?.[theme]?.url || '/api/music/' + theme, type: 'normal'
      }]));
      list.replaceChildren();
      for (const [theme, track] of Object.entries(tracks)) {
        const row = document.createElement('li'), button = document.createElement('button');
        button.type = 'button'; button.dataset.musicTheme = theme;
        button.textContent = theme.toUpperCase() + ' // ' + labels[theme] + (track.available ? '' : ' · 待配置');
        row.append(button); list.append(row);
      }
      if (engine) { engine.destroy(); engine = null; player.destroy(); player = null; }
      syncTheme();
    } catch (_) {
      output.textContent = '音乐服务暂不可用'; retry.hidden = false;
      if (!player) placeholder(currentTheme());
    } finally { clearTimeout(timeout); loading = false; retry.disabled = false; }
  }
  collapse.addEventListener('click', () => { setCollapsed(!collapsed); write(local, 'ef_bgm_collapsed', collapsed); });
  listButton.addEventListener('click', () => { list.hidden = !list.hidden; listButton.setAttribute('aria-expanded', String(!list.hidden)); });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-music-theme]');
    if (!button) return;
    document.querySelector(`[data-set-theme="${button.dataset.musicTheme}"]`)?.click();
    list.hidden = true; listButton.setAttribute('aria-expanded', 'false'); listButton.focus();
  });
  shell.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !list.hidden) { list.hidden = true; listButton.setAttribute('aria-expanded', 'false'); listButton.focus(); }
  });
  // Capture once, including after a catalogue retry rebuilds APlayer.
  host.addEventListener('click', event => {
    if (event.target.closest('.aplayer-pic')) { event.preventDefault(); event.stopImmediatePropagation(); engine?.toggle(); }
  }, true);
  slider.value = String(Math.round(volume * 100));
  slider.addEventListener('input', () => {
    volume = Number(slider.value) / 100; engine?.setVolume(volume); write(local, 'ef_bgm_volume', volume);
  });
  retry.addEventListener('click', () => {
    if (engine?.getState().phase === 'blocked') engine.play();
    else refreshCatalog();
  });
  new MutationObserver(() => syncTheme()).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  document.addEventListener('visibilitychange', () => { if (document.hidden) engine?.remember(); });
  window.addEventListener('pagehide', () => { engine?.remember(); engine?.pause(); });
  window.switchEndfieldBgm = theme => syncTheme(String(theme).toLowerCase());
  shell.hidden = false; setCollapsed(collapsed);
  if (!window.APlayer || !window.createEndfieldMusic || !configuration) {
    output.textContent = '音乐播放器资源未加载'; return;
  }
  placeholder(currentTheme());
  refreshCatalog();
})();
