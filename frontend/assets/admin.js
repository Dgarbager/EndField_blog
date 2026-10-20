(function initAdmin(){
  'use strict';
  const $=selector=>document.querySelector(selector),form=$('#post-form'),editor=$('#content-md');
  let id=null,revision=0,savedRevision=0,authenticated=false,uploads=0,saving=false,request=0,page=1,pages=1,previewTimer;
  const dirty=()=>revision!==savedRevision;
  const message=(selector,text,error=false)=>{const el=$(selector);el.textContent=text;el.classList.toggle('is-error',error);};
  const controls=()=>{$('#publish').disabled=saving||uploads>0;$('#new-post').disabled=saving||uploads>0;};
  function changed(){revision++;clearTimeout(previewTimer);previewTimer=setTimeout(preview,180);}
  function preview(){LingxiMarkdown.render($('#markdown-preview'),editor.value);}
  function setToken(token){BlogAPI.setToken(token);}
  try{$('#admin-token').value=localStorage.getItem('ef_admin_token')||'';}catch(_){}
  async function connect(){
    const token=$('#admin-token').value.trim();if(!token){message('#auth-status','请输入管理口令',true);return false;}
    setToken(token);message('#auth-status','正在验证…');
    try{await BlogAPI.request('/api/admin/auth',{admin:true});authenticated=true;message('#auth-status','已连接。口令保存在当前浏览器，退出可清除。');return true;}
    catch(error){authenticated=false;setToken('');message('#auth-status',error.message,true);return false;}
  }
  async function ensureAuth(){if(authenticated)return true;return connect();}
  $('#auth-form').addEventListener('submit',async event=>{event.preventDefault();await connect();});
  $('#logout').addEventListener('click',()=>{authenticated=false;setToken('');$('#admin-token').value='';message('#auth-status','已退出并清除浏览器口令');});
  $('#admin-token').addEventListener('input',()=>{authenticated=false;});
  form.addEventListener('input',changed);
  function reset(){
    form.reset();id=null;revision=0;savedRevision=0;$('#editor-heading').textContent='NEW_LOG // 新建归档';$('#publish').textContent='发布归档 ↗';message('#save-status','');message('#upload-status','');preview();
  }
  function canLeave(){if(saving||uploads){message('#save-status','请等待保存或图片上传完成',true);return false;}return !dirty()||confirm('当前有未保存修改，确定放弃吗？');}
  $('#new-post').addEventListener('click',()=>{if(canLeave()){request++;reset();$('#title').focus();}});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving||uploads||!form.reportValidity())return;if(!await ensureAuth())return;
    const sent=revision,payload={title:$('#title').value,sector:$('#sector').value,excerpt:$('#excerpt').value,content_md:editor.value,tags:$('#tags-input').value,cover_url:$('#cover-url').value,is_pinned:$('#is-pinned').checked};
    saving=true;controls();message('#save-status','正在保存归档…');
    try{
      const post=await BlogAPI.request(id?'/api/admin/posts/'+id:'/api/admin/posts',{admin:true,method:id?'PUT':'POST',body:JSON.stringify(payload)});
      id=post.id;if(revision===sent)savedRevision=revision;
      $('#editor-heading').textContent='EDIT_LOG // '+String(id).padStart(2,'0');$('#publish').textContent='保存修改 ↗';
      message('#save-status',revision===sent?'已保存，文章已在前台发布。':'已保存提交时的版本，编辑区仍有新修改待保存。');
      const link=document.createElement('a');link.href='./post.html?id='+id;link.target='_blank';link.rel='noopener';link.textContent=' 查看文章 ↗';$('#save-status').append(link);
      await loadManager();
    }catch(error){if(error.status===401)authenticated=false;message('#save-status',error.message,true);}
    finally{saving=false;controls();}
  });
  async function editPost(postId){
    if(!canLeave())return;const ticket=++request;message('#save-status','正在读取文章…');
    try{
      const post=await BlogAPI.request('/api/posts/'+postId);if(ticket!==request)return;
      id=post.id;$('#title').value=post.title;$('#sector').value=post.sector;$('#excerpt').value=post.excerpt;$('#tags-input').value=post.tags;$('#cover-url').value=post.cover_url;$('#is-pinned').checked=Boolean(post.is_pinned);editor.value=post.content_md;
      revision=0;savedRevision=0;$('#editor-heading').textContent='EDIT_LOG // '+String(id).padStart(2,'0');$('#publish').textContent='保存修改 ↗';message('#save-status','文章已载入');preview();$('#editor-heading').scrollIntoView({block:'start'});$('#title').focus({preventScroll:true});
    }catch(error){message('#save-status',error.message,true);}
  }
  async function removePost(post){
    if(saving||uploads)return;if(!await ensureAuth())return;
    if(!confirm(`确定删除“${post.title}”？删除后无法在后台恢复。`))return;
    try{await BlogAPI.request('/api/admin/posts/'+post.id,{admin:true,method:'DELETE'});if(id===post.id)reset();message('#manage-status','文章已删除');await loadManager();}
    catch(error){message('#manage-status',error.message,true);}
  }
  let managerTicket=0;
  async function loadManager(){
    const ticket=++managerTicket;message('#manage-status','正在读取已发布归档…');
    try{
      const data=await BlogAPI.request('/api/posts?'+new URLSearchParams({page,limit:10,q:$('#manage-query').value}));if(ticket!==managerTicket)return;
      page=data.page;pages=data.pages;$('#manage-prev').disabled=page===1;$('#manage-next').disabled=page===pages;$('#manage-page').textContent=`${page} / ${pages} · 共 ${data.total} 篇`;
      const container=$('#managed-posts');container.replaceChildren();
      for(const post of data.items){
        const row=document.createElement('div');row.className='managed-row';
        const info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('span');title.textContent=post.title;meta.textContent=`${post.sector} · ${post.updated_at.slice(0,10)} · ${post.word_count} 字`+(post.is_pinned?' · 置顶':'');info.append(title,meta);
        const actions=document.createElement('div');for(const [label,handler] of [['编辑',()=>editPost(post.id)],['删除',()=>removePost(post)]]){const button=document.createElement('button');button.type='button';button.className='ef-filter-chip';button.textContent=label;button.addEventListener('click',handler);actions.append(button);}
        const view=document.createElement('a');view.href='./post.html?id='+post.id;view.textContent='阅读 ↗';view.target='_blank';view.rel='noopener';actions.append(view);row.append(info,actions);container.append(row);
      }
      message('#manage-status',data.total?'':'还没有归档，先发布第一篇吧。');
    }catch(error){if(ticket===managerTicket)message('#manage-status',error.message,true);}
  }
  $('#manage-search').addEventListener('submit',event=>{event.preventDefault();page=1;loadManager();});
  $('#manage-prev').addEventListener('click',()=>{if(page>1){page--;loadManager();}});$('#manage-next').addEventListener('click',()=>{if(page<pages){page++;loadManager();}});
  async function uploadImage(file,cover=false){
    if(!file||!await ensureAuth())return;
    if(file.size>16*1024*1024){message('#upload-status','图片最大16 MB',true);return;}
    const marker=`[图片上传中-${crypto.randomUUID()}]`;
    if(!cover){editor.setRangeText(marker,editor.selectionStart,editor.selectionEnd,'end');changed();}
    uploads++;controls();message('#upload-status',`正在上传图片（${uploads}）…`);
    try{
      const body=new FormData();body.append('file',file,file.name||'clipboard.png');
      const data=await BlogAPI.request('/api/admin/upload',{admin:true,method:'POST',body});
      if(cover){$('#cover-url').value=data.url;changed();}else{editor.value=editor.value.replace(marker,`![image](${data.url})`);changed();}
      message('#upload-status','图片已上传');preview();
    }catch(error){if(!cover){editor.value=editor.value.replace(marker,'');changed();}message('#upload-status',error.message,true);}
    finally{uploads--;controls();}
  }
  $('#insert-image').addEventListener('click',()=>$('#image-file').click());$('#cover-upload').addEventListener('click',()=>$('#cover-file').click());
  $('#image-file').addEventListener('change',event=>{uploadImage(event.target.files[0]);event.target.value='';});$('#cover-file').addEventListener('change',event=>{uploadImage(event.target.files[0],true);event.target.value='';});
  editor.addEventListener('paste',event=>{const images=Array.from(event.clipboardData?.items||[]).filter(item=>item.kind==='file'&&item.type.startsWith('image/'));if(images.length){event.preventDefault();images.forEach(item=>uploadImage(item.getAsFile()));}});
  editor.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();editor.classList.add('is-dragging');}});
  editor.addEventListener('dragleave',()=>editor.classList.remove('is-dragging'));
  editor.addEventListener('drop',event=>{editor.classList.remove('is-dragging');const files=Array.from(event.dataTransfer.files);if(files.length){event.preventDefault();files.forEach(file=>uploadImage(file));}});
  addEventListener('beforeunload',event=>{if(dirty()||uploads||saving){event.preventDefault();event.returnValue='';}});
  const editId=new URLSearchParams(location.search).get('id');preview();loadManager();if($('#admin-token').value)connect();if(/^\d+$/.test(editId||''))editPost(Number(editId));
})();
