(function initProgress(){
  'use strict';
  const $=selector=>document.querySelector(selector),modal=$('#ef-progress-modal');
  let queue=Promise.resolve();
  function formatBytes(value){return value>=1024*1024?(value/1024/1024).toFixed(2)+' MB':(value/1024).toFixed(1)+' KB';}
  function perform({url,method='POST',body,taskName='DATA_TRANSMISSION',successMessage='数据已保存'}) {
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest(),fill=$('#ef-progress-fill'),track=$('#ef-progress-track'),close=$('#ef-modal-close');
      let busy=true,finished=false,completeError=null;
      fill.className='ef-progress-fill';fill.style.width='0%';$('#ef-modal-pct').textContent='0%';
      track.setAttribute('aria-valuenow','0');track.setAttribute('aria-valuetext','等待传输');
      $('#ef-modal-task').textContent='TASK // '+taskName;$('#ef-modal-msg').textContent='正在向服务器传输数据…';$('#ef-modal-detail').textContent='PAYLOAD // WAITING';close.hidden=true;
      if(!modal.open)modal.showModal();
      modal.oncancel=event=>{if(busy)event.preventDefault();};
      modal.onclose=()=>{if(completeError){const error=completeError;completeError=null;reject(error);}};
      close.onclick=()=>modal.close();
      function fail(error){
        if(finished)return;finished=true;busy=false;completeError=error;
        fill.classList.add('is-error');$('#ef-modal-msg').textContent=error.message;
        $('#ef-modal-detail').textContent=error.status===401?'SESSION // 请重新登录':'STATUS // 未确认写入成功';
        track.setAttribute('aria-valuetext','传输失败');close.hidden=false;close.focus();
      }
      xhr.open(method,url,true);xhr.withCredentials=true;xhr.timeout=300000;
      const multipart=body instanceof FormData;if(!multipart)xhr.setRequestHeader('Content-Type','application/json');
      xhr.upload.onprogress=event=>{
        if(finished)return;
        if(event.lengthComputable){
          const percent=Math.round(event.loaded/event.total*100);fill.style.width=percent+'%';$('#ef-modal-pct').textContent=percent+'%';track.setAttribute('aria-valuenow',String(percent));
          $('#ef-modal-detail').textContent=`PAYLOAD // ${formatBytes(event.loaded)} / ${formatBytes(event.total)}`;
          if(percent===100){$('#ef-modal-msg').textContent='传输完成，等待服务器确认写入…';track.setAttribute('aria-valuetext','已传输，等待服务器确认');}
        }else{$('#ef-modal-pct').textContent='传输中';track.removeAttribute('aria-valuenow');$('#ef-modal-detail').textContent='PAYLOAD // '+formatBytes(event.loaded);}
      };
      xhr.onload=()=>{
        let result;try{result=xhr.responseText?JSON.parse(xhr.responseText):null;}catch(_){fail(new Error('服务器返回格式异常，未能确认写入结果，请检查归档后重试'));return;}
        if(xhr.status<200||xhr.status>=300){BlogAPI.expired(true,xhr.status);fail(BlogAPI.errorFrom(result,xhr.status));return;}
        if(finished)return;finished=true;fill.style.width='100%';fill.classList.add('is-success');$('#ef-modal-pct').textContent='100%';
        track.setAttribute('aria-valuenow','100');track.setAttribute('aria-valuetext','服务器已确认写入');$('#ef-modal-msg').textContent='✓ '+successMessage;$('#ef-modal-detail').textContent='STATUS // COMMIT_SUCCESS';
        setTimeout(()=>{busy=false;modal.close();resolve(result);},750);
      };
      xhr.onerror=()=>fail(new Error('网络连接中断，未能确认保存结果；请先检查归档再重试'));
      xhr.ontimeout=()=>fail(new Error('请求超时，未能确认保存结果；请先检查归档再重试'));
      xhr.onabort=()=>fail(new Error('传输已中止'));
      try{xhr.send(multipart?body:JSON.stringify(body));}catch(error){fail(error);}
    });
  }
  function requestWithProgress(options){const task=queue.then(()=>perform(options));queue=task.catch(()=>{});return task;}
  window.LingxiProgress=Object.freeze({request:requestWithProgress});
})();
