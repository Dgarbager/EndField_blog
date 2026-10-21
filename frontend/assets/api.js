(function () {
  'use strict';
  function errorFrom(response,status) {
    const detail=response?.detail;
    const message=typeof detail==='string'?detail:Array.isArray(detail)?detail.map(item=>item.msg).join('；'):`请求失败（${status}）`;
    const error=new Error(message);error.status=status;return error;
  }
  function expired(admin,status) {if(admin&&status===401)document.dispatchEvent(new CustomEvent('ef:session-expired'));}
  async function request(path,options={}) {
    const {admin=false,...fetchOptions}=options;
    const headers=new Headers(fetchOptions.headers||{});
    if(fetchOptions.body&&!(fetchOptions.body instanceof FormData))headers.set('Content-Type','application/json');
    let response;
    try{response=await fetch(path,{...fetchOptions,headers,credentials:'same-origin',cache:'no-store'});}catch(_){throw new Error('连接失败，请检查网络或后端服务');}
    if(!response.ok){let body;try{body=await response.json();}catch(_){}expired(admin,response.status);throw errorFrom(body,response.status);}
    return response.status===204?null:response.json();
  }
  window.BlogAPI=Object.freeze({request,errorFrom,expired});
})();
