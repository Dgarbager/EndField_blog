(function initReader(){
  'use strict';const $=selector=>document.querySelector(selector);
  const names={SEC_01:'算法与智能控制',SEC_02:'系统工程与造物',SEC_03:'网络与终端架构',SEC_04:'光学影像归档'};
  async function load(){
    const id=new URLSearchParams(location.search).get('id');$('#post-retry').hidden=true;$('#post-article').hidden=true;$('#post-status').hidden=false;
    if(!/^\d+$/.test(id||'')){ $('#post-status').textContent='缺少有效的文章编号。';return;}
    $('#post-status').textContent='正在读取归档…';
    try{
      const post=await BlogAPI.request('/api/posts/'+id);
      document.title=post.title+' · 灵犀日志归档库';$('#post-title').textContent=post.title;
      $('#post-category').textContent='■ '+post.sector+' // '+names[post.sector];$('#post-category').href='./#archive-'+post.sector;
      $('#post-meta').textContent=`LOG_ID // ${String(post.id).padStart(2,'0')} · 发布 ${post.created_at.slice(0,10)} · 更新 ${post.updated_at.slice(0,10)} · ${post.word_count} 字 · 阅读约 ${post.read_time} 分钟`;
      $('#post-tags').replaceChildren();for(const tag of post.tags.split(',').filter(Boolean)){const link=document.createElement('a');link.className='ef-tag-item';link.textContent='#'+tag;link.href='./#archive?tag='+encodeURIComponent(tag);$('#post-tags').append(link);}
      LingxiMarkdown.render($('#post-content'),post.content_md,$('#post-toc'));
      const navigation=$('#post-neighbors');navigation.replaceChildren();
      for(const [label,item] of [['← 上一篇',post.prev_post],['下一篇 →',post.next_post]]){const block=document.createElement('div');if(item){const link=document.createElement('a');link.href='./post.html?id='+item.id;const small=document.createElement('span'),title=document.createElement('strong');small.textContent=label;title.textContent=item.title;link.append(small,title);block.append(link);}navigation.append(block);}
      $('#post-status').hidden=true;$('#post-article').hidden=false;
      if(location.hash){const target=document.getElementById(location.hash.slice(1));target?.scrollIntoView();}
    }catch(error){$('#post-status').textContent=error.message;$('#post-status').classList.add('is-error');$('#post-retry').hidden=error.status!==404;}
  }
  $('#post-retry').addEventListener('click',load);load();
})();
