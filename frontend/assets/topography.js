(function initTopography(){
  'use strict';
  const backdrop=document.querySelector('.ef-topography');
  if(!backdrop)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const pointer=matchMedia('(hover: hover) and (pointer: fine)');
  let targetX=0,targetY=0,currentX=0,currentY=0,frame=0,lastTime=0;
  const allowed=()=>!reduced.matches&&pointer.matches&&!document.hidden;
  function paint(){
    backdrop.style.setProperty('--ef-topo-x',currentX.toFixed(2)+'px');
    backdrop.style.setProperty('--ef-topo-y',currentY.toFixed(2)+'px');
  }
  function reset(){
    cancelAnimationFrame(frame);frame=0;lastTime=0;
    targetX=targetY=currentX=currentY=0;paint();
  }
  function render(now){
    frame=0;
    if(!allowed()){reset();return;}
    const elapsed=lastTime?Math.min(48,now-lastTime):16;
    lastTime=now;
    const damping=1-Math.exp(-elapsed/180);
    currentX+=(targetX-currentX)*damping;currentY+=(targetY-currentY)*damping;
    if(Math.abs(targetX-currentX)<.02&&Math.abs(targetY-currentY)<.02){
      currentX=targetX;currentY=targetY;paint();lastTime=0;return;
    }
    paint();frame=requestAnimationFrame(render);
  }
  function schedule(){if(allowed()&&!frame)frame=requestAnimationFrame(render);}
  function visibility(){
    backdrop.dataset.paused=String(document.hidden);
    if(!allowed())reset();
  }
  window.addEventListener('pointermove',event=>{
    if(!allowed()||event.pointerType==='touch')return;
    targetX=(event.clientX/innerWidth-.5)*24;
    targetY=(event.clientY/innerHeight-.5)*24;schedule();
  },{passive:true});
  window.addEventListener('pointerout',event=>{
    if(!event.relatedTarget){targetX=targetY=0;schedule();}
  },{passive:true});
  window.addEventListener('blur',reset);
  window.addEventListener('pagehide',()=>{backdrop.dataset.paused='true';reset();});
  window.addEventListener('pageshow',visibility);
  document.addEventListener('visibilitychange',visibility);
  reduced.addEventListener('change',visibility);pointer.addEventListener('change',visibility);
  visibility();
})();
