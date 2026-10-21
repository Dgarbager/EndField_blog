(function initReader(){
  'use strict';const $=selector=>document.querySelector(selector);
  const names={SEC_01:'智能与探索者',SEC_02:'先锋维修纪实',SEC_03:'光学映像留存',SEC_04:'零号档案'},privateArchive=new URLSearchParams(location.search).get('archive')==='private';
  const readerUrl=id=>'./post.html?id='+id+(privateArchive?'&archive=private':'');
  let requestId=0;
  async function load(){
    const ticket=++requestId;
    const id=new URLSearchParams(location.search).get('id');$('#post-retry').hidden=true;$('#post-article').hidden=true;$('#post-status').hidden=false;
    if(!/^\d+$/.test(id||'')){ $('#post-status').textContent='缺少有效的文章编号。';return;}
    $('#post-status').textContent='正在读取归档…';
    try{
      const post=await BlogAPI.request((privateArchive?'/api/admin/private/posts/':'/api/posts/')+id,{admin:privateArchive});
      if(ticket!==requestId)return;
      document.title=post.title+' · 灵犀日志归档库';$('#post-title').textContent=post.title;
      $('#post-category').textContent='■ '+post.sector+' // '+names[post.sector];$('#post-category').href=privateArchive?'./private.html':'./#archive-'+post.sector;
      if(privateArchive){const home=$('.content-brand');home.href='./private.html';home.textContent='↖ ZERO_ARCHIVE // 返回零号档案';}
      $('#post-meta').textContent=`LOG_ID // ${String(post.id).padStart(2,'0')} · 发布 ${post.created_at.slice(0,10)} · 更新 ${post.updated_at.slice(0,10)} · ${post.word_count} 字 · 阅读约 ${post.read_time} 分钟`;
      $('#post-tags').replaceChildren();for(const tag of post.tags.split(',').filter(Boolean)){const link=document.createElement('a');link.className='ef-tag-item';link.textContent='#'+tag;link.href=(privateArchive?'./private.html?tag=':'./#archive?tag=')+encodeURIComponent(tag);$('#post-tags').append(link);}
      LingxiMarkdown.render($('#post-content'),post.content_md,$('#post-toc'));
      const navigation=$('#post-neighbors');navigation.replaceChildren();
      for(const [label,item] of [['← 上一篇',post.prev_post],['下一篇 →',post.next_post]]){const block=document.createElement('div');if(item){const link=document.createElement('a');link.href=readerUrl(item.id);const small=document.createElement('span'),title=document.createElement('strong');small.textContent=label;title.textContent=item.title;link.append(small,title);block.append(link);}navigation.append(block);}
      $('#post-status').hidden=true;$('#post-article').hidden=false;
      if(location.hash){const target=document.getElementById(location.hash.slice(1));target?.scrollIntoView();}
    }catch(error){if(privateArchive&&error.status===401){location.replace('./admin.html?next=private&post='+id);return;}$('#post-status').textContent=error.message;$('#post-status').classList.add('is-error');$('#post-retry').hidden=error.status!==404;}
  }
  $('#post-retry').addEventListener('click',load);
  if(privateArchive){
    const robots=document.createElement('meta');robots.name='robots';robots.content='noindex,nofollow,noarchive';document.head.append(robots);
    const hide=()=>{requestId++;$('#post-article').hidden=true;$('#post-content').replaceChildren();$('#post-title').textContent='';$('#post-meta').textContent='';$('#post-tags').replaceChildren();$('#post-neighbors').replaceChildren();$('#post-toc').replaceChildren();document.title='零号档案';};
    addEventListener('pagehide',hide);addEventListener('pageshow',load);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();else load();});
  }else load();
})();
