(function initThemeSwitcher() {
  'use strict';
  const key = 'ef_blog_theme_mode';
  const colors = {night:'#111317',day:'#EBEEF2',wuling:'#10171A'};
  const root = document.documentElement;
  const buttons = Array.from(document.querySelectorAll('[data-set-theme]'));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const jobs = new Map();
  // Keep a canonical copy before the boot engine can scramble these labels.
  const feedbackNodes = Array.from(document.querySelectorAll('.ef-uid, .ef-topbar-left .ef-mono-label, .ef-infobar-sub'));
  const originals = new Map(feedbackNodes.map(node => [node, node.textContent]));

  function stopFeedback() {
    jobs.forEach((id,node) => {cancelAnimationFrame(id);node.textContent = originals.get(node);});
    jobs.clear();
  }
  function feedback() {
    stopFeedback();
    if (motion.matches || document.querySelector('.ef-hero-terminal.is-booting, .ef-hero-terminal.is-closing')) return;
    const archive = document.body.dataset.activeView === 'archive';
    const targets = feedbackNodes.filter(node => archive ? node.classList.contains('ef-infobar-sub') : !node.classList.contains('ef-infobar-sub'));
    const start = performance.now();
    const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    targets.forEach(node => {
      const text = originals.get(node);
      function tick(now) {
        const progress = Math.min(1, (now-start)/380);
        const locked = Math.floor(progress * text.length);
        node.textContent = Array.from(text, (char,index) => index < locked || !/[A-Z0-9]/i.test(char) ? char : glyphs[Math.floor(Math.random()*glyphs.length)]).join('');
        if (progress < 1) jobs.set(node,requestAnimationFrame(tick));
        else {node.textContent=text;jobs.delete(node);}
      }
      jobs.set(node,requestAnimationFrame(tick));
    });
  }
  function apply(theme, persist = false, animate = false) {
    const valid = Object.hasOwn(colors,theme) ? theme : 'night';
    root.dataset.theme=valid;
    document.getElementById('js-meta-theme-color').content=colors[valid];
    buttons.forEach(button => {
      const selected = button.dataset.setTheme === valid;
      button.classList.toggle('active',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    document.querySelectorAll('.ef-avatar, .ef-infobar-avatar').forEach(image => {image.src=`./assets/avatar-${valid}.svg`;});
    document.querySelectorAll('.ef-thumb-img[data-theme-illustration]').forEach(image => {image.src=`./assets/cnc-toolpath-${valid}.svg`;});
    const codeStyle = document.getElementById('code-theme');
    if (codeStyle) codeStyle.href = `./assets/vendor/highlight-${valid === 'day' ? 'day' : 'dark'}.css`;
    if (persist) {try {localStorage.setItem(key,valid);} catch (_) { /* Continue without persistence. */ }}
    if (animate) feedback();
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    if (root.dataset.theme !== button.dataset.setTheme) apply(button.dataset.setTheme,true,true);
  }));
  window.addEventListener('storage',event => {if (event.key===key || event.key===null) apply(event.newValue);});
  document.addEventListener('ef:boot-request',stopFeedback);
  document.addEventListener('ef:boot-stop',stopFeedback);
  document.addEventListener('visibilitychange',() => {if (document.hidden) stopFeedback();});
  motion.addEventListener('change',() => {if (motion.matches) stopFeedback();});
  apply(root.dataset.theme);
})();
