(function(){
  'use strict';const $=selector=>document.querySelector(selector);
  let page=1,pages=1,tag=new URLSearchParams(location.search).get('tag')||'',ticket=0;
  function login(){location.replace('./admin.html?next=private');}
  function hide(){ticket++;$('#private-workspace').hidden=true;$('#private-posts').replaceChildren();$('#private-logout').hidden=true;}
  async function load(){
    const current=++ticket;$('#private-retry').hidden=true;$('#private-status').hidden=false;$('#private-status').textContent='正在读取零号档案…';
    try{
      const data=await BlogAPI.request('/api/admin/private/posts?'+new URLSearchParams({page,limit:10,tag,q:$('#private-query').value}),{admin:true});
      if(current!==ticket)return;page=data.page;pages=data.pages;
      $('#private-posts').replaceChildren(...data.items.map((post,index)=>LingxiCards.create(post,{index,privateArchive:true,selectedTag:tag,onTag:value=>{tag=tag===value?'':value;page=1;load();}})));
      $('#private-total').textContent=`${data.total} DOCS // PRIVATE`;$('#private-page').textContent=`${page} / ${pages}`;$('#private-prev').disabled=page<=1;$('#private-next').disabled=page>=pages;$('#private-clear').hidden=!tag;
      $('#private-empty').hidden=data.total>0;$('#private-status').hidden=true;$('#private-workspace').hidden=false;$('#private-logout').hidden=false;
    }catch(error){if(error.status===401){hide();login();return;}$('#private-status').textContent=error.message;$('#private-retry').hidden=false;}
  }
  document.addEventListener('ef:session-expired',()=>{hide();login();});
  $('#private-search').addEventListener('submit',event=>{event.preventDefault();page=1;load();});
  $('#private-clear').addEventListener('click',()=>{tag='';page=1;load();});$('#private-retry').addEventListener('click',load);
  $('#private-prev').addEventListener('click',()=>{if(page>1){page--;load();}});$('#private-next').addEventListener('click',()=>{if(page<pages){page++;load();}});
  $('#private-logout').addEventListener('click',async()=>{try{await BlogAPI.request('/api/admin/logout',{method:'POST'});hide();location.replace('./');}catch(error){$('#private-status').hidden=false;$('#private-status').textContent=error.message;}});
  // Back/forward cache must never restore readable content after logout in another page.
  addEventListener('pagehide',hide);addEventListener('pageshow',load);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();else load();});
})();
