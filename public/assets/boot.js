(function initEndfieldTerminal() {
  'use strict';
  const terminal = document.querySelector('.ef-hero-terminal');
  if (!terminal) return;
  const launch = new Date('2025-09-01T00:00:00+08:00').getTime();
  const daysEl = document.getElementById('ef-uptime-days');
  const hmsEl = document.getElementById('ef-uptime-hms');
  const clockEls = document.querySelectorAll('.js-utc-clock');
  const miniDays = document.querySelectorAll('.js-mini-days');
  const status = document.getElementById('ef-boot-status');
  const replay = document.getElementById('ef-replay');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  let frame = 0;
  let booting = false;

  // Save text nodes so decoding never removes the nested Chinese subtitle.
  const specs = [
    ['.ef-topbar-left .ef-mono-label', 200, 550],
    ['.ef-uid', 200, 600],
    ['.ef-name', 240, 650],
    ['.ef-panel-title-bar span:first-child', 200, 600],
    ['.ef-sector-top span:first-child', 350, 360]
  ];
  const targets = specs.flatMap(([selector, delay, duration]) =>
    Array.from(document.querySelectorAll(selector)).flatMap((el, index) =>
      Array.from(el.childNodes).filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
        .map(node => ({ node, original: node.textContent, delay: delay + index * (selector === '.ef-spine-num' ? 90 : 60), duration }))
    )
  );
  const bars = terminal.querySelectorAll('.ef-segmented-bar i');
  bars.forEach((bar, index) => bar.style.setProperty('--bar-idx', index));
  terminal.querySelectorAll('.ef-sector-card').forEach((card, index) => card.style.setProperty('--card-idx', index));

  function updateTelemetry() {
    const now = new Date();
    const seconds = Math.floor(Math.max(0, now.getTime() - launch) / 1000);
    if (!booting) daysEl.textContent = pad(Math.floor(seconds / 86400), 3);
    hmsEl.textContent = `${pad(Math.floor(seconds / 3600) % 24)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
    clockEls.forEach(el => { el.textContent = `UTC+8 // ${formatter.format(now)}`; });
    miniDays.forEach(el => { el.textContent = pad(Math.floor(seconds / 86400), 3); });
  }

  function finish() {
    cancelAnimationFrame(frame);
    frame = 0;
    booting = false;
    terminal.classList.remove('is-booting');
    document.dispatchEvent(new CustomEvent('ef:boot-end'));
    targets.forEach(({node, original}) => { node.textContent = original; });
    updateTelemetry();
    status.textContent = motion.matches ? 'SYSTEM ONLINE // 已接入 · 减弱动态效果' : 'SYSTEM ONLINE // 系统接入完成';
  }

  function start() {
    cancelAnimationFrame(frame);
    terminal.classList.remove('is-booting');
    targets.forEach(({node, original}) => { node.textContent = original; });
    if (motion.matches) { finish(); return; }
    // Coordinates use layout dimensions, which are unaffected by the shutter animation.
    terminal.querySelectorAll('.ef-reticle').forEach(reticle => {
      const panel = reticle.offsetParent;
      reticle.style.setProperty('--lock-x', `${panel.clientWidth / 2 - reticle.offsetLeft - reticle.offsetWidth / 2}px`);
      reticle.style.setProperty('--lock-y', `${panel.clientHeight / 2 - reticle.offsetTop - reticle.offsetHeight / 2}px`);
    });
    void terminal.offsetWidth; // Restart CSS animations on repeated clicks.
    booting = true;
    daysEl.textContent = '000';
    status.textContent = 'BOOT SEQUENCE // 正在自检接入';
    terminal.classList.add('is-booting');
    document.dispatchEvent(new CustomEvent('ef:boot-start'));
    updateTelemetry();
    const startTime = performance.now();
    let lastDecode = -50;
    function tick(now) {
      const elapsed = now - startTime;
      if (elapsed - lastDecode >= 32) {
        lastDecode = elapsed;
        targets.forEach(({ node, original, delay, duration }) => {
          const progress = Math.max(0, Math.min(1, (elapsed - delay) / duration));
          const locked = Math.floor(Math.pow(progress, .85) * original.length);
          node.textContent = Array.from(original, (char, index) =>
            index < locked || !/[A-Z0-9]/i.test(char) ? char : glyphs[Math.floor(Math.random() * glyphs.length)]
          ).join('');
        });
      }
      const progress = Math.max(0, Math.min(1, (elapsed - 350) / 750));
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const days = Math.floor(Math.max(0, Date.now() - launch) / 86400000);
      daysEl.textContent = pad(Math.floor(days * eased), 3);
      if (elapsed < 1200) frame = requestAnimationFrame(tick);
      else finish();
    }
    frame = requestAnimationFrame(tick);
  }

  replay.addEventListener('click', start);
  motion.addEventListener('change', () => { if (motion.matches) finish(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && booting) finish();
    else if (!document.hidden) updateTelemetry();
  });
  // One clock interval for the page; replay never creates another timer.
  setInterval(updateTelemetry, 1000);
  document.addEventListener('ef:boot-request', start);
  document.addEventListener('ef:boot-stop', finish);
  updateTelemetry();
})();
