(function(){
  'use strict';
  const names={SEC_01:'智能与探索者',SEC_02:'先锋维修纪实',SEC_03:'光学映像留存',SEC_04:'零号档案'};
  function create(post,{index=0,privateArchive=false,sectorNames=names,onSector,onTag,selectedTag=''}={}){
    const card=document.createElement('article');card.className='ef-post-card'+(post.is_pinned?' is-pinned':'');card.dataset.category=post.sector;card.id='log-'+post.id;card.style.setProperty('--post-index',index);
    card.innerHTML='<div class="ef-post-spine"><span class="ef-mono-label ef-spine-label">LOG_ID</span><span class="ef-spine-num"></span><span class="ef-spine-deco" aria-hidden="true"></span></div><div class="ef-post-body"><div class="ef-post-meta-top ef-mono-label"><button type="button" class="ef-post-cat"></button><div class="ef-post-telemetry"><span class="post-date"></span><span>|</span><span class="post-words"></span></div></div><h3 class="ef-post-title"><a></a></h3><p class="ef-post-excerpt"></p><div class="ef-post-footer ef-mono-label"><div class="ef-post-tags"></div><span class="ef-read-time"></span></div></div>';
    const url='./post.html?id='+post.id+(privateArchive?'&archive=private':'');
    const title=card.querySelector('.ef-post-title a');title.href=url;title.textContent=post.title;
    const category=card.querySelector('.ef-post-cat');category.textContent='■ '+(sectorNames[post.sector]||post.sector);
    if(onSector)category.addEventListener('click',()=>onSector(post.sector));else category.disabled=true;
    card.querySelector('.post-date').textContent='TS // '+post.created_at.slice(0,10).replaceAll('-','.');card.querySelector('.post-words').textContent='WORDS // '+post.word_count.toLocaleString();
    card.querySelector('.ef-post-excerpt').textContent=post.excerpt;card.querySelector('.ef-read-time').textContent='EST_READ // '+String(post.read_time).padStart(2,'0')+' MIN';
    card.querySelector('.ef-spine-num').textContent=String(post.id).padStart(2,'0');
    if(post.is_pinned){const pin=card.querySelector('.ef-spine-deco');pin.className='ef-pin-badge';pin.textContent='PINNED';pin.removeAttribute('aria-hidden');}
    for(const tag of post.tags.split(',').filter(Boolean)){
      const button=document.createElement('button');button.className='ef-tag-item';button.type='button';button.textContent='#'+tag;button.setAttribute('aria-pressed',String(selectedTag===tag));
      if(onTag)button.addEventListener('click',()=>onTag(tag));else button.disabled=true;card.querySelector('.ef-post-tags').append(button);
    }
    if(post.cover_url){
      const link=document.createElement('a');link.className='ef-post-thumb';link.href=url;link.tabIndex=-1;link.setAttribute('aria-hidden','true');
      link.innerHTML='<div class="ef-thumb-frame"><img class="ef-thumb-img" alt="" loading="lazy"><span class="ef-thumb-coord ef-mono-label">CAM // ARCHIVE</span><span class="ef-thumb-action ef-mono-label">ACCESS_LOG ↗</span></div>';
      const img=link.querySelector('img');img.src=post.cover_url;img.addEventListener('error',()=>link.remove(),{once:true});card.append(link);
    }
    return card;
  }
  window.LingxiCards=Object.freeze({create,names});
})();
