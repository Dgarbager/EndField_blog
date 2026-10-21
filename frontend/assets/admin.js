(function initAdmin(){
  'use strict';
  const $=selector=>document.querySelector(selector),form=$('#post-form'),editor=$('#content-md');
  let id=null,revision=0,savedRevision=0,authenticated=false,uploads=0,saving=false,request=0,page=1,pages=1,previewTimer;
  const dirty=()=>revision!==savedRevision;
  const message=(selector,text,error=false)=>{const el=$(selector);el.textContent=text;el.classList.toggle('is-error',error);};
  const controls=()=>{for(const selector of ['#publish','#new-post','#ef-logout-btn','#ef-password-btn','#archive-type','#sector'])$(selector).disabled=saving||uploads>0;};
  function changed(){revision++;clearTimeout(previewTimer);previewTimer=setTimeout(preview,180);}
  function preview(){LingxiMarkdown.render($('#markdown-preview'),editor.value);}
  let passwordConfigured=true, gateMode='login';
  let legacyToken='';
  try{legacyToken=localStorage.getItem('ef_admin_token')||'';localStorage.removeItem('ef_admin_token');localStorage.removeItem('ef_admin_session_token');}catch(_){}
  function gateModeTo(mode){
    gateMode=mode;$('#ef-login-form').hidden=mode!=='login';$('#ef-setup-form').hidden=mode!=='setup';
    $('#ef-gate-tabs').hidden=passwordConfigured;
    $('#ef-show-login').classList.toggle('active',mode==='login');$('#ef-show-setup').classList.toggle('active',mode==='setup');
    $('#ef-login-title').textContent=mode==='setup'?'设定管理员密码':'终端权限认证';
    $('#ef-login-description').textContent=mode==='setup'?'先验证原管理口令，再设定你自己的密码。':(new URLSearchParams(location.search).get('next')==='private'?'输入管理员密码，解锁零号档案。':'输入管理员密码，解锁归档编辑台。');
  }
  function showGate(text=''){
    authenticated=false;$('#ef-login-view').hidden=false;$('#ef-editor-view').hidden=true;
    managerTicket++;$('#managed-posts').replaceChildren();
    for(const selector of ['#ef-auth-badge','#ef-password-btn','#ef-logout-btn'])$(selector).hidden=true;
    if($('#ef-password-dialog').open)$('#ef-password-dialog').close();
    gateModeTo(passwordConfigured?'login':'setup');message('#ef-login-error',text,Boolean(text));controls();
  }
  function showWorkspace(){
    const target=new URLSearchParams(location.search);
    if(target.get('next')==='private'){
      const post=target.get('post');location.replace(/^\d+$/.test(post||'')?'./post.html?id='+post+'&archive=private':'./private.html');return;
    }
    authenticated=true;$('#ef-login-view').hidden=true;$('#ef-editor-view').hidden=false;
    for(const selector of ['#ef-auth-badge','#ef-password-btn','#ef-logout-btn'])$(selector).hidden=false;
    $('#ef-pass-input').value='';$('#ef-setup-token').value='';$('#ef-new-password').value='';$('#ef-confirm-password').value='';
    message('#ef-login-error','');controls();loadManager();
  }
  async function refreshAuth(){
    $('#ef-auth-retry').hidden=true;message('#ef-login-error','');
    try{
      const config=await BlogAPI.request('/api/admin/auth/status');passwordConfigured=config.password_configured;
      if(!passwordConfigured&&legacyToken){$('#ef-setup-token').value=legacyToken;legacyToken='';}
      try{await BlogAPI.request('/api/admin/session');showWorkspace();}
      catch(error){if(error.status!==401)throw error;showGate();if(!passwordConfigured&&!config.setup_available)message('#ef-login-error','服务器需先配置 ADMIN_TOKEN 以授权首次设定密码',true);}
    }catch(error){showGate(error.message);$('#ef-auth-retry').hidden=false;}
  }
  $('#ef-show-login').addEventListener('click',()=>gateModeTo('login'));
  $('#ef-show-setup').addEventListener('click',()=>gateModeTo('setup'));
  $('#ef-auth-retry').addEventListener('click',refreshAuth);
  $('#ef-login-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;message('#ef-login-error','正在验证…');
    try{await BlogAPI.request('/api/admin/login',{method:'POST',body:JSON.stringify({password:$('#ef-pass-input').value})});passwordConfigured=true;showWorkspace();}
    catch(error){message('#ef-login-error',error.message,true);}finally{button.disabled=false;}
  });
  $('#ef-setup-form').addEventListener('submit',async event=>{
    event.preventDefault();const password=$('#ef-new-password').value;
    if(password!==$('#ef-confirm-password').value){message('#ef-login-error','两次输入的密码不一致',true);return;}
    const button=event.currentTarget.querySelector('button');button.disabled=true;message('#ef-login-error','正在设定密码…');
    try{await BlogAPI.request('/api/admin/setup',{method:'POST',body:JSON.stringify({setup_token:$('#ef-setup-token').value.trim(),new_password:password})});passwordConfigured=true;showWorkspace();}
    catch(error){message('#ef-login-error',error.message,true);if(error.status===409){passwordConfigured=true;gateModeTo('login');}}
    finally{button.disabled=false;}
  });
  async function ensureAuth(){
    if(!authenticated){showGate('请先登录');return false;}
    try{await BlogAPI.request('/api/admin/session',{admin:true});return true;}
    catch(error){showGate(error.status===401?'登录已过期，重新登录后可继续编辑。':error.message);return false;}
  }
  document.addEventListener('ef:session-expired',()=>showGate('登录已失效，重新登录后可继续编辑。'));
  $('#ef-logout-btn').addEventListener('click',async()=>{
    if(!canLeave())return;
    try{await BlogAPI.request('/api/admin/logout',{method:'POST'});request++;reset();showGate();}
    catch(error){message('#save-status','退出失败：'+error.message,true);}
  });
  $('#ef-password-btn').addEventListener('click',()=>{$('#ef-password-form').reset();message('#ef-password-error','');$('#ef-password-dialog').showModal();});
  $('#ef-password-close').addEventListener('click',()=>$('#ef-password-dialog').close());
  $('#ef-password-dialog').addEventListener('close',()=>$('#ef-password-form').reset());
  $('#ef-password-form').addEventListener('submit',async event=>{
    event.preventDefault();const password=$('#ef-change-password').value;
    if(password!==$('#ef-change-confirm').value){message('#ef-password-error','两次输入的新密码不一致',true);return;}
    const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;message('#ef-password-error','正在更新密码…');
    try{await BlogAPI.request('/api/admin/password',{admin:true,method:'PUT',body:JSON.stringify({current_password:$('#ef-current-password').value,new_password:password})});$('#ef-password-dialog').close();message('#save-status','密码已修改，其他设备的登录已失效。当前设备继续保持登录。');}
    catch(error){message('#ef-password-error',error.message,true);}finally{button.disabled=false;}
  });
  function syncArchiveType(){const privateArchive=$('#archive-type').value==='private';$('#public-sector-field').hidden=privateArchive;}
  $('#archive-type').addEventListener('change',syncArchiveType);
  form.addEventListener('input',changed);
  function reset(){
    form.reset();syncArchiveType();id=null;revision=0;savedRevision=0;$('#editor-heading').textContent='NEW_LOG // 新建归档';$('#publish').textContent='发布归档 ↗';message('#save-status','');message('#upload-status','');preview();
  }
  function canLeave(){if(saving||uploads){message('#save-status','请等待保存或图片上传完成',true);return false;}return !dirty()||confirm('当前有未保存修改，确定放弃吗？');}
  $('#new-post').addEventListener('click',()=>{if(canLeave()){request++;reset();$('#title').focus();}});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving||uploads||!form.reportValidity())return;if(!await ensureAuth())return;
    const sent=revision,payload={title:$('#title').value,sector:$('#archive-type').value==='private'?'SEC_04':$('#sector').value,excerpt:$('#excerpt').value,content_md:editor.value,tags:$('#tags-input').value,cover_url:$('#cover-url').value,is_pinned:$('#is-pinned').checked};
    saving=true;controls();message('#save-status','正在保存归档…');
    try{
      const post=await LingxiProgress.request({url:id?'/api/admin/posts/'+id:'/api/admin/posts',method:id?'PUT':'POST',body:payload,taskName:'ARCHIVE_COMMIT // 发布归档',successMessage:'归档已成功写入服务器'});
      id=post.id;if(revision===sent)savedRevision=revision;
      $('#editor-heading').textContent='EDIT_LOG // '+String(id).padStart(2,'0');$('#publish').textContent='保存修改 ↗';
      message('#save-status',revision===sent?(post.sector==='SEC_04'?'已保存至零号档案，仅管理员可见。':'已保存，文章已在前台发布。'):'已保存提交时的版本，编辑区仍有新修改待保存。');
      const link=document.createElement('a');link.href='./post.html?id='+id+(post.sector==='SEC_04'?'&archive=private':'');link.target='_blank';link.rel='noopener';link.textContent=' 查看文章 ↗';$('#save-status').append(link);
      await loadManager();
    }catch(error){if(error.status===401)authenticated=false;message('#save-status',error.message,true);}
    finally{saving=false;controls();}
  });
  async function editPost(postId){
    if(!canLeave())return;const ticket=++request;message('#save-status','正在读取文章…');
    try{
      const post=await BlogAPI.request('/api/admin/posts/'+postId,{admin:true});if(ticket!==request)return;
      id=post.id;$('#title').value=post.title;$('#archive-type').value=post.sector==='SEC_04'?'private':'public';$('#sector').value=post.sector==='SEC_04'?'SEC_01':post.sector;syncArchiveType();$('#excerpt').value=post.excerpt;$('#tags-input').value=post.tags;$('#cover-url').value=post.cover_url;$('#is-pinned').checked=Boolean(post.is_pinned);editor.value=post.content_md;
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
      const data=await BlogAPI.request('/api/admin/posts?'+new URLSearchParams({page,limit:10,q:$('#manage-query').value}),{admin:true});if(ticket!==managerTicket)return;
      page=data.page;pages=data.pages;$('#manage-prev').disabled=page===1;$('#manage-next').disabled=page===pages;$('#manage-page').textContent=`${page} / ${pages} · 共 ${data.total} 篇`;
      const container=$('#managed-posts');container.replaceChildren();
      for(const post of data.items){
        const row=document.createElement('div');row.className='managed-row';
        const info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('span');title.textContent=post.title;meta.textContent=`${post.sector==='SEC_04'?'零号档案 · 仅管理员可见':post.sector+' · 公开档案'} · ${post.updated_at.slice(0,10)} · ${post.word_count} 字`+(post.is_pinned?' · 置顶':'');info.append(title,meta);
        const actions=document.createElement('div');for(const [label,handler] of [['编辑',()=>editPost(post.id)],['删除',()=>removePost(post)]]){const button=document.createElement('button');button.type='button';button.className='ef-filter-chip';button.textContent=label;button.addEventListener('click',handler);actions.append(button);}
        const view=document.createElement('a');view.href='./post.html?id='+post.id+(post.sector==='SEC_04'?'&archive=private':'');view.textContent='阅读 ↗';view.target='_blank';view.rel='noopener';actions.append(view);row.append(info,actions);container.append(row);
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
      const data=await LingxiProgress.request({url:'/api/admin/upload?archive='+$('#archive-type').value,body,taskName:cover?'COVER_UPLOAD // 封面上传':'IMAGE_UPLOAD // 影像上传',successMessage:'图片已成功保存'});
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
  const editId=new URLSearchParams(location.search).get('id');preview();syncArchiveType();refreshAuth().then(()=>{if(authenticated&&/^\d+$/.test(editId||''))editPost(Number(editId));});
})();
