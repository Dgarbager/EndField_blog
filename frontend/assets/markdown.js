(function () {
  'use strict';
  const escape = text => text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const observers = new WeakMap();
  marked.use({gfm:true,breaks:false,extensions:[
    {name:'displayMath',level:'block',start:source => source.indexOf('$$'),
      tokenizer(source) {const match=/^\$\$\s*\n?([\s\S]+?)\n?\$\$(?:\n|$)/.exec(source);if(match)return {type:'displayMath',raw:match[0],text:match[1]};},
      renderer(token) {return `<div class="math-source math-display">${escape(token.text)}</div>`;}},
    {name:'inlineMath',level:'inline',start:source => source.indexOf('$'),
      tokenizer(source) {const match=/^\$(?!\$)((?:\\.|[^$\n])+?)\$(?!\$)/.exec(source);if(match)return {type:'inlineMath',raw:match[0],text:match[1]};},
      renderer(token) {return `<span class="math-source">${escape(token.text)}</span>`;}}
  ]});
  function render(container, source, toc = null) {
    observers.get(container)?.disconnect();
    container.innerHTML=DOMPurify.sanitize(marked.parse(source || ''),{USE_PROFILES:{html:true},FORBID_TAGS:['style','form','input','button','iframe'],FORBID_ATTR:['style']});
    container.querySelectorAll('.math-source').forEach(element => {
      try {katex.render(element.textContent,element,{displayMode:element.classList.contains('math-display'),throwOnError:false,trust:false,strict:'warn'});} catch (_) {element.classList.add('math-error');}
    });
    container.querySelectorAll('pre code').forEach(code => {
      hljs.highlightElement(code);
      const button=document.createElement('button');button.type='button';button.className='code-copy';button.textContent='COPY_CODE';
      button.addEventListener('click',async () => {
        try {await navigator.clipboard.writeText(code.textContent);button.textContent='已复制';setTimeout(()=>button.textContent='COPY_CODE',1600);}
        catch (_) {button.textContent='请选中代码复制';}
      });
      code.parentElement.append(button);
    });
    container.querySelectorAll('a[href]').forEach(link=>{
      if (link.origin!==location.origin && /^https?:$/.test(link.protocol)) {link.target='_blank';link.rel='noopener noreferrer';}
    });
    container.querySelectorAll('img').forEach(image=>{image.loading='lazy';image.decoding='async';});
    if(toc) {
      toc.replaceChildren();const headings=Array.from(container.querySelectorAll('h2,h3'));
      headings.forEach((heading,index)=>{
        heading.id=`section-${index+1}`;
        const link=document.createElement('a');link.href='#'+heading.id;link.textContent=heading.textContent;link.className=heading.tagName==='H3'?'toc-child':'';toc.append(link);
      });
      if(!headings.length){const text=document.createElement('p');text.textContent='本篇暂无分节目录';toc.append(text);}
      const observer=new IntersectionObserver(entries=>{
        const entry=entries.find(item=>item.isIntersecting);if(!entry)return;
        toc.querySelectorAll('a').forEach(link=>link.classList.toggle('active',link.hash==='#'+entry.target.id));
      },{rootMargin:'-10% 0px -65% 0px'});
      headings.forEach(heading=>observer.observe(heading));observers.set(container,observer);
    }
  }
  window.LingxiMarkdown=Object.freeze({render});
})();
