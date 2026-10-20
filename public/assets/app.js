(function initDualView() {
  'use strict';
  const terminalView = document.getElementById('view-terminal');
  const archiveView = document.getElementById('view-archive');
  const chassis = document.querySelector('.ef-hero-terminal');
  const heading = document.getElementById('archive-heading');
  const sectorLabel = document.getElementById('js-current-sector-label');
  const cards = Array.from(document.querySelectorAll('.ef-post-card'));
  const chips = Array.from(document.querySelectorAll('[data-filter]'));
  const dialog = document.getElementById('ef-log-preview');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const names = { ALL: '全部归档日志', SEC_01: 'SEC_01 算法与智能控制', SEC_02: 'SEC_02 系统工程与造物', SEC_03: 'SEC_03 网络与终端架构', SEC_04: 'SEC_04 光学影像归档' };
  const pad = number => String(number).padStart(2, '0');
  const pageSize = 3;
  const jobs = new Map();
  let state = { view: 'terminal', sector: 'ALL', page: 1, tag: '', random: '' };
  let generation = 0, lastHash = null, highlightTimer = 0, booted = false;

  function stopDecoding() {
    jobs.forEach(({id, text}, el) => { cancelAnimationFrame(id); el.textContent = text; });
    jobs.clear();
  }
  function decode(el, text, delay = 0) {
    el.textContent = text;
    if (motion.matches) return;
    const start = performance.now() + delay;
    const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    function tick(now) {
      const progress = Math.max(0, Math.min(1, (now - start) / 450));
      const locked = Math.floor(progress * text.length);
      el.textContent = Array.from(text, (char, index) => index < locked || !/[A-Z0-9]/i.test(char) ? char : glyphs[Math.floor(Math.random() * glyphs.length)]).join('');
      if (progress < 1) jobs.set(el, {id: requestAnimationFrame(tick), text});
      else { el.textContent = text; jobs.delete(el); }
    }
    jobs.set(el, {id: requestAnimationFrame(tick), text});
  }
  cards.forEach(card => {
    const title = card.querySelector('.ef-post-title a');
    card.dataset.log = title.getAttribute('href').split('/').pop();
    card.id = `log-${card.dataset.log}`;
    title.href = `#archive?post=${encodeURIComponent(card.dataset.log)}`;
    card.querySelectorAll('.ef-post-title a, .ef-post-thumb').forEach(link => {
      link.href = title.href;
      link.addEventListener('click', event => { event.preventDefault(); openPost(card); });
    });
    card.querySelectorAll('.ef-tag-item').forEach(element => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = element.className;
      button.textContent = element.textContent; button.dataset.tag = element.textContent.trim();
      button.setAttribute('aria-label', `筛选标签 ${element.textContent}`);
      element.replaceWith(button);
      button.addEventListener('click', () => navigate({...state, page:1, tag: state.tag === button.dataset.tag ? '' : button.dataset.tag, random:''}, true));
    });
  });
  const getTags = card => Array.from(card.querySelectorAll('[data-tag]'), node => node.dataset.tag);

  function parseRoute() {
    const [path, query = ''] = location.hash.split('?');
    const match = /^#archive(?:-(SEC_0[1-4]))?$/.exec(path);
    if (!match) return {view:'terminal', sector:'ALL', page:1, tag:'', random:''};
    const params = new URLSearchParams(query);
    const requestedPage = Number(params.get('page'));
    return {view:'archive', sector:match[1] || 'ALL', page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, tag:params.get('tag') || '', random:params.get('random') || '', post:params.get('post') || ''};
  }
  function makeHash(next) {
    if (next.view === 'terminal') return '';
    const suffix = next.sector === 'ALL' ? '' : `-${next.sector}`;
    const params = new URLSearchParams();
    if (next.page > 1) params.set('page', next.page);
    if (next.tag) params.set('tag', next.tag);
    if (next.random) params.set('random', next.random);
    const query = params.toString();
    return `#archive${suffix}${query ? '?' + query : ''}`;
  }
  function navigate(next, replace = false) {
    const hash = makeHash(next);
    const url = location.pathname + location.search + hash;
    if (replace) history.replaceState(null, '', url);
    else if (location.hash !== hash) history.pushState(null, '', url);
    applyRoute(true);
  }
  function renderArticles() {
    stopDecoding(); clearTimeout(highlightTimer);
    cards.forEach(card => {card.classList.remove('ef-random-highlight', 'is-entering');});
    const filtered = cards.filter(card => (state.sector === 'ALL' || card.dataset.category === state.sector) && (!state.tag || getTags(card).includes(state.tag)));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.page = Math.max(1, Math.min(state.page, pages));
    const visible = filtered.slice((state.page - 1) * pageSize, state.page * pageSize);
    cards.forEach(card => {card.hidden = !visible.includes(card);});
    visible.forEach((card, index) => {
      card.style.setProperty('--post-index', index);
      void card.offsetWidth;
      card.classList.add('is-entering');
      decode(card.querySelector('.ef-spine-num'), pad((state.page - 1) * pageSize + index + 1), index * 60);
    });
    chips.forEach(chip => {
      const active = chip.dataset.filter === state.sector;
      chip.classList.toggle('active', active); chip.setAttribute('aria-pressed', String(active));
    });
    decode(sectorLabel, `// ${names[state.sector]}`);
    const first = filtered.length ? (state.page - 1) * pageSize + 1 : 0;
    document.querySelector('.ef-feed-count').textContent = `[ SHOWING ${pad(first)}–${pad(Math.min(state.page * pageSize, filtered.length))} OF ${pad(filtered.length)} ]` + (state.tag ? ` / ${state.tag}` : '');
    document.getElementById('ef-feed-empty').hidden = filtered.length > 0;
    document.getElementById('ef-clear-filter').hidden = !state.tag;
    document.querySelector('.ef-page-status').textContent = `PAGE_INDEX // ${pad(state.page)} OF ${pad(pages)}`;
    const previous = document.querySelector('[data-page="prev"]');
    const next = document.querySelector('[data-page="next"]');
    previous.disabled = state.page === 1; next.disabled = state.page === pages;
    const numbers = document.getElementById('ef-page-numbers'); numbers.replaceChildren();
    for (let page = 1; page <= pages; page++) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'ef-page-num';
      button.dataset.page = page; button.textContent = pad(page); button.setAttribute('aria-label', `第 ${page} 页`);
      if (page === state.page) {button.classList.add('active'); button.setAttribute('aria-current','page');}
      numbers.append(button);
    }
    cards.forEach(card => card.querySelectorAll('[data-tag]').forEach(button => {
      const active = button.dataset.tag === state.tag; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }));
    // Normalize invalid page parameters, keeping refresh and browser history deterministic.
    const canonical = makeHash(state);
    if (!state.post && location.hash !== canonical) history.replaceState(null, '', location.pathname + location.search + canonical);
    lastHash = location.hash;
    const randomCard = visible.find(card => card.dataset.log === state.random);
    if (randomCard) {
      randomCard.classList.add('ef-random-highlight');
      randomCard.scrollIntoView({behavior:motion.matches ? 'instant' : 'smooth', block:'center'});
      highlightTimer = setTimeout(() => randomCard.classList.remove('ef-random-highlight'), 1600);
    }
    if (state.post) {const card = cards.find(item => item.dataset.log === state.post); if (card) openPost(card);}
  }
  async function applyRoute(force = false, initial = false) {
    if (!force && lastHash === location.hash) return;
    lastHash = location.hash;
    const ticket = ++generation;
    const next = parseRoute();
    if (dialog.open) dialog.close();
    const leavingTerminal = document.body.dataset.activeView === 'terminal' && next.view === 'archive' && !initial;
    terminalView.inert = true; archiveView.inert = true;
    chassis.classList.remove('is-closing');
    if (leavingTerminal && !motion.matches) {
      document.dispatchEvent(new CustomEvent('ef:boot-stop'));
      chassis.classList.add('is-closing');
      await new Promise(resolve => setTimeout(resolve, 180));
    }
    if (ticket !== generation) return;
    chassis.classList.remove('is-closing');
    state = next;
    const archive = state.view === 'archive';
    terminalView.hidden = archive; archiveView.hidden = !archive;
    terminalView.classList.toggle('is-active', !archive); archiveView.classList.toggle('is-active', archive);
    terminalView.inert = archive; archiveView.inert = !archive;
    document.body.dataset.activeView = state.view;
    window.scrollTo({top:0,behavior:'instant'});
    if (archive) {
      document.dispatchEvent(new CustomEvent('ef:boot-stop'));
      renderArticles();
      heading.focus({preventScroll:true});
    } else {
      stopDecoding();
      document.querySelector('.js-enter-archive').focus({preventScroll:true});
      if (!booted) {booted = true; document.dispatchEvent(new CustomEvent('ef:boot-request'));}
    }
  }
  function openPost(card) {
    document.getElementById('ef-log-title').textContent = card.querySelector('.ef-post-title').textContent.trim();
    document.getElementById('ef-log-meta').textContent = [card.querySelector('.ef-post-cat').textContent.trim(), ...Array.from(card.querySelectorAll('.ef-post-telemetry span:not(.ef-divider)'), el => el.textContent.trim())].join(' · ');
    document.getElementById('ef-log-excerpt').textContent = card.querySelector('.ef-post-excerpt').textContent.trim();
    if (!dialog.open) dialog.showModal();
  }
  document.getElementById('ef-close-log').addEventListener('click', () => dialog.close());
  document.querySelectorAll('.js-enter-archive').forEach(button => button.addEventListener('click', () => navigate({view:'archive',sector:button.dataset.sector || 'ALL',page:1,tag:'',random:''})));
  document.getElementById('js-back-terminal').addEventListener('click', () => navigate({view:'terminal'}));
  chips.forEach(chip => chip.addEventListener('click', () => navigate({...state,sector:chip.dataset.filter,page:1,tag:'',random:''},true)));
  document.getElementById('ef-clear-filter').addEventListener('click', () => navigate({...state,page:1,tag:'',random:''},true));
  document.querySelector('.ef-pagination').addEventListener('click', event => {
    const button = event.target.closest('button[data-page]'); if (!button || button.disabled) return;
    const page = button.dataset.page === 'prev' ? state.page - 1 : button.dataset.page === 'next' ? state.page + 1 : Number(button.dataset.page);
    navigate({...state,page,random:''},true);
  });
  document.querySelector('.js-random-post').addEventListener('click', () => {
    const index = Math.floor(Math.random() * cards.length);
    navigate({view:'archive',sector:'ALL',page:Math.floor(index/pageSize)+1,tag:'',random:cards[index].dataset.log});
  });
  window.addEventListener('popstate', () => applyRoute());
  window.addEventListener('hashchange', () => applyRoute());
  motion.addEventListener('change', () => {if (motion.matches) stopDecoding();});
  applyRoute(true,true);
})();
