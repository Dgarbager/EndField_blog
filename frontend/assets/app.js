(function initArchive() {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const terminal=$('#view-terminal'),archive=$('#view-archive'),chassis=$('.ef-hero-terminal');
  const list=$('#js-post-list'),heading=$('#archive-heading'),motion=matchMedia('(prefers-reduced-motion: reduce)');
  const names={ALL:'全部归档日志',...Object.fromEntries(['SEC_01','SEC_02','SEC_03'].map(sector=>[sector,sector+' '+document.querySelector(`[data-sector="${sector}"] .ef-sector-name`).textContent]))};
  const limit=10,pad=n=>String(n).padStart(2,'0');
  let state={view:'terminal',sector:'ALL',page:1,tag:'',random:''},lastHash=null,routeId=0,requestId=0,booted=false;
  let telemetry={total_docs:0,sectors:{}},jobs=new Map();
  const date=value=>value ? value.slice(0,10).replaceAll('-','.') : '暂无上传';
  function status(text,error=false){$('#feed-status').textContent=text;$('#feed-status').classList.toggle('is-error',error);}
  function stopDecode(){jobs.forEach(({id,text},element)=>{cancelAnimationFrame(id);element.textContent=text;});jobs.clear();}
  function decode(element,text,delay=0){
    element.textContent=text;if(motion.matches)return;
    const start=performance.now()+delay;
    function tick(now){
      const progress=Math.max(0,Math.min(1,(now-start)/450)),locked=Math.floor(progress*text.length);
      element.textContent=Array.from(text,(char,i)=>i<locked||!/[A-Z0-9]/i.test(char)?char:'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random()*36)]).join('');
      if(progress<1)jobs.set(element,{id:requestAnimationFrame(tick),text});else{element.textContent=text;jobs.delete(element);}
    }
    jobs.set(element,{id:requestAnimationFrame(tick),text});
  }
  async function loadTelemetry(){
    try{
      telemetry=await BlogAPI.request('/api/telemetry');
      $('#stat-total-docs').textContent=telemetry.total_docs;$('#mini-total-docs').textContent=telemetry.total_docs;
      $('#filter-all-count').textContent=telemetry.total_docs;
      const words=telemetry.total_words;
      $('#stat-total-words').textContent=words>=1000?(words/1000).toFixed(1):words;$('#stat-word-unit').textContent=words>=1000?'K':'';
      $('#stat-last-update').textContent=telemetry.last_update||'暂无上传';$('#mini-last-update').textContent=telemetry.last_update||'暂无上传';
      for(let i=1;i<=3;i++)$(`#sec-0${i}-count`).textContent=telemetry.sectors[`SEC_0${i}`]||0;
      $('#data-status').textContent='ARCHIVE DATA // 已连接数据库';
      $('#data-status').classList.remove('is-error');
    }catch(error){$('#data-status').textContent='ARCHIVE DATA // '+error.message;$('#data-status').classList.add('is-error');}
  }
  function parse(){
    const [path,query='']=location.hash.split('?'),match=/^#archive(?:-(SEC_0[1-3]))?$/.exec(path);
    if(!match)return {view:'terminal',sector:'ALL',page:1,tag:'',random:''};
    const params=new URLSearchParams(query),page=Number(params.get('page'));
    return {view:'archive',sector:match[1]||'ALL',page:Number.isSafeInteger(page)&&page>0?page:1,tag:params.get('tag')||'',random:params.get('random')||''};
  }
  function hash(next){
    if(next.view==='terminal')return '';
    const params=new URLSearchParams();if(next.page>1)params.set('page',next.page);if(next.tag)params.set('tag',next.tag);if(next.random)params.set('random',next.random);
    const query=params.toString();return '#archive'+(next.sector==='ALL'?'':'-'+next.sector)+(query?'?'+query:'');
  }
  function navigate(next,replace=false){
    const value=hash(next),url=location.pathname+location.search+value;
    if(replace)history.replaceState(null,'',url);else if(location.hash!==value)history.pushState(null,'',url);
    apply(true);
  }
  function cardFor(post,index){
    const card=LingxiCards.create(post,{index,sectorNames:names,selectedTag:state.tag,
      onSector:sector=>navigate({...state,sector,page:1,tag:'',random:''},true),
      onTag:tag=>navigate({...state,tag:state.tag===tag?'':tag,page:1,random:''},true)});
    if(state.view==='archive'){card.classList.add('is-entering');decode(card.querySelector('.ef-spine-num'),pad(post.id),index*50);}
    return card;
  }
  async function loadPosts(){
    const ticket=++requestId,selected={...state};
    list.setAttribute('aria-busy','true');status('正在检索归档…');$('#feed-retry').hidden=true;
    try{
      const query=new URLSearchParams({sector:selected.sector,page:selected.page,limit,tag:selected.tag});
      const data=await BlogAPI.request('/api/posts?'+query);
      if(ticket!==requestId)return;
      stopDecode();state.page=data.page;list.replaceChildren(...data.items.map(cardFor));
      $('[data-page="prev"]').disabled=data.page===1;$('[data-page="next"]').disabled=data.page===data.pages;
      $('.ef-page-status').textContent=`PAGE_INDEX // ${pad(data.page)} OF ${pad(data.pages)}`;
      const pages=new Set([1,data.pages,data.page-1,data.page,data.page+1]);const numbers=$('#ef-page-numbers');numbers.replaceChildren();let previous=0;
      [...pages].filter(x=>x>=1&&x<=data.pages).sort((a,b)=>a-b).forEach(page=>{
        if(previous&&page-previous>1){const dots=document.createElement('span');dots.textContent='…';numbers.append(dots);}previous=page;
        const button=document.createElement('button');button.type='button';button.className='ef-page-num'+(page===data.page?' active':'');button.textContent=pad(page);button.dataset.page=page;button.setAttribute('aria-label',`第 ${page} 页`);if(page===data.page)button.setAttribute('aria-current','page');numbers.append(button);
      });
      $('.ef-feed-count').textContent=`[ SHOWING ${pad(data.total?(data.page-1)*limit+1:0)}–${pad(Math.min(data.page*limit,data.total))} OF ${pad(data.total)} ]`+(state.tag?' / #'+state.tag:'');
      $('#ef-feed-empty').hidden=data.total>0;status(data.total?'归档索引已同步':'暂无文章，发布第一篇后会显示在这里。');
      if(state.view==='archive'){
        history.replaceState(null,'',location.pathname+location.search+hash(state));lastHash=location.hash;
        const random=document.getElementById('log-'+state.random);if(random){random.classList.add('ef-random-highlight');random.scrollIntoView({behavior:motion.matches?'instant':'smooth',block:'center'});}
      }
    }catch(error){if(ticket!==requestId)return;list.replaceChildren();$('#ef-feed-empty').hidden=true;status(error.message,true);$('#feed-retry').hidden=false;$('.ef-feed-count').textContent='[ INDEX_UNAVAILABLE ]';}
    finally{if(ticket===requestId)list.setAttribute('aria-busy','false');}
  }
  function controls(){
    document.querySelectorAll('[data-filter]').forEach(button=>{const active=button.dataset.filter===state.sector;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    $('#js-current-sector-label').textContent='// '+names[state.sector];$('#ef-clear-filter').hidden=!state.tag;
  }
  async function apply(force=false,initial=false){
    if(!force&&lastHash===location.hash)return;lastHash=location.hash;const ticket=++routeId,next=parse();
    const leaving=document.body.dataset.activeView==='terminal'&&next.view==='archive'&&!initial;
    terminal.inert=true;archive.inert=true;chassis.classList.remove('is-closing');
    if(leaving&&!motion.matches){document.dispatchEvent(new CustomEvent('ef:boot-stop'));chassis.classList.add('is-closing');await new Promise(resolve=>setTimeout(resolve,180));}
    if(ticket!==routeId)return;
    state=next;chassis.classList.remove('is-closing');const reading=state.view==='archive';
    terminal.hidden=reading;archive.hidden=!reading;terminal.inert=reading;archive.inert=!reading;terminal.classList.toggle('is-active',!reading);archive.classList.toggle('is-active',reading);document.body.dataset.activeView=state.view;scrollTo({top:0,behavior:'instant'});
    controls();
    if(reading){document.dispatchEvent(new CustomEvent('ef:boot-stop'));heading.focus({preventScroll:true});await loadPosts();}
    else{stopDecode();requestId++;$('.js-enter-archive').focus({preventScroll:true});if(!booted){booted=true;document.dispatchEvent(new CustomEvent('ef:boot-request'));}}
  }
  document.querySelectorAll('.js-enter-archive').forEach(button=>button.addEventListener('click',()=>navigate({view:'archive',sector:button.dataset.sector||'ALL',page:1,tag:'',random:''})));
  $('#js-back-terminal').addEventListener('click',()=>navigate({view:'terminal'}));
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>navigate({...state,sector:button.dataset.filter,page:1,tag:'',random:''},true)));
  $('#ef-clear-filter').addEventListener('click',()=>navigate({...state,page:1,tag:'',random:''},true));
  $('.ef-pagination').addEventListener('click',event=>{const button=event.target.closest('button[data-page]');if(!button||button.disabled)return;const page=button.dataset.page==='prev'?state.page-1:button.dataset.page==='next'?state.page+1:Number(button.dataset.page);navigate({...state,page,random:''},true);});
  $('.js-random-post').addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{const totals=await BlogAPI.request('/api/telemetry');if(!totals.total_docs){$('#data-status').textContent='归档库还没有文章，先发布第一篇吧。';return;}
      const index=Math.floor(Math.random()*totals.total_docs),data=await BlogAPI.request(`/api/posts?limit=1&page=${index+1}`);
      navigate({view:'archive',sector:'ALL',page:Math.floor(index/limit)+1,tag:'',random:String(data.items[0].id)});
    }catch(error){$('#data-status').textContent=error.message;}finally{button.disabled=false;}
  });
  $('#feed-retry').addEventListener('click',()=>{loadTelemetry();loadPosts();});
  addEventListener('popstate',()=>apply());addEventListener('hashchange',()=>apply());
  motion.addEventListener('change',()=>{if(motion.matches)stopDecode();});
  loadTelemetry();apply(true,true);
  if(state.view==='terminal')loadPosts();
})();
