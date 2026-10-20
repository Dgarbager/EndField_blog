(function () {
  'use strict';
  let memoryToken = null;
  function setToken(token) { memoryToken = token; try { if(token) localStorage.setItem('ef_admin_token',token); else localStorage.removeItem('ef_admin_token'); } catch (_) {} }
  async function request(path, options = {}) {
    const {admin = false, ...fetchOptions} = options;
    const headers = new Headers(fetchOptions.headers || {});
    if (admin) {
      let token = memoryToken || '';
      if(memoryToken === null) {try { token = localStorage.getItem('ef_admin_token') || ''; } catch (_) {}}
      if (!token) throw new Error('请先连接管理口令');
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) headers.set('Content-Type','application/json');
    let response;
    try {response = await fetch(path, {...fetchOptions,headers,cache:'no-store'});} catch (_) {throw new Error('连接失败，请检查网络或后端服务');}
    if (!response.ok) {
      let message = `请求失败（${response.status}）`;
      try {
        const body = await response.json();
        message = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map(x => x.msg).join('；') : message;
      } catch (_) {}
      const error = new Error(message); error.status = response.status; throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  window.BlogAPI = Object.freeze({request,setToken});
})();
