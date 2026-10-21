const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function environment(){
  const elements=new Map(),instances=[],timers=[],expired=[];
  for(const id of ['ef-progress-modal','ef-progress-fill','ef-progress-track','ef-modal-close','ef-modal-pct','ef-modal-task','ef-modal-msg','ef-modal-detail']){
    const classes=new Set();elements.set('#'+id,{style:{},attrs:{},hidden:false,textContent:'',open:false,
      classList:{add:name=>classes.add(name),contains:name=>classes.has(name)},
      set className(value){classes.clear();value.split(' ').forEach(x=>classes.add(x));},
      setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];},
      showModal(){this.open=true;},close(){this.open=false;this.onclose?.();},focus(){}});
  }
  class XHR{constructor(){this.upload={};this.headers={};instances.push(this);}open(method,url){this.method=method;this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}send(body){this.body=body;}}
  class Form{}
  const context={window:{},document:{querySelector:selector=>elements.get(selector)},XMLHttpRequest:XHR,FormData:Form,Promise,
    setTimeout:fn=>timers.push(fn),BlogAPI:{expired:(admin,status)=>expired.push(status),errorFrom:(body,status)=>Object.assign(new Error(body?.detail||'Request failed'),{status})}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../frontend/assets/progress.js'),'utf8'),context);
  return {request:context.window.LingxiProgress.request,elements,instances,timers,expired,Form};
}
const flush=()=>new Promise(setImmediate);
test('byte progress reaches 100 before server acknowledgement, success only after acknowledgement',async()=>{
  const env=environment(),pending=env.request({url:'/api/admin/posts',body:{title:'x'}});await flush();const xhr=env.instances[0];
  xhr.upload.onprogress({lengthComputable:true,loaded:25,total:100});assert.equal(env.elements.get('#ef-progress-fill').style.width,'25%');
  xhr.upload.onprogress({lengthComputable:true,loaded:100,total:100});assert.equal(env.elements.get('#ef-progress-fill').classList.contains('is-success'),false);
  assert.match(env.elements.get('#ef-modal-msg').textContent,/等待服务器/);
  xhr.status=201;xhr.responseText='{"id":12}';xhr.onload();assert.equal(env.elements.get('#ef-progress-fill').classList.contains('is-success'),true);
  assert.equal(env.elements.get('#ef-progress-modal').open,true);env.timers.shift()();assert.equal((await pending).id,12);
});
test('failed writes stay visible until dismissed and trigger session expiration handling',async()=>{
  const env=environment(),pending=env.request({url:'/api/admin/posts',body:{}});const result=pending.then(()=>null,error=>error);await flush();const xhr=env.instances[0];
  xhr.status=401;xhr.responseText='{"detail":"session expired"}';xhr.onload();assert.equal(env.elements.get('#ef-progress-modal').open,true);
  assert.equal(env.elements.get('#ef-modal-close').hidden,false);assert.equal(env.elements.get('#ef-progress-fill').classList.contains('is-success'),false);
  assert.deepEqual(env.expired,[401]);env.elements.get('#ef-progress-modal').close();assert.equal((await result).status,401);
});
test('multipart uploads are queued so HUDs cannot overwrite each other',async()=>{
  const env=environment(),file=new env.Form(),first=env.request({url:'/api/admin/upload',body:file}),second=env.request({url:'/api/admin/upload',body:file});await flush();
  assert.equal(env.instances.length,1);assert.equal(env.instances[0].body,file);assert.equal(env.instances[0].headers['Content-Type'],undefined);
  env.instances[0].status=201;env.instances[0].responseText='{"url":"/uploads/first.png"}';env.instances[0].onload();env.timers.shift()();await first;await flush();
  assert.equal(env.instances.length,2);env.instances[1].status=201;env.instances[1].responseText='{"url":"/uploads/second.png"}';env.instances[1].onload();env.timers.shift()();assert.equal((await second).url,'/uploads/second.png');
});
test('timeouts report uncertain write state and never claim success',async()=>{
  const env=environment(),pending=env.request({url:'/api/admin/posts',body:{}}),result=pending.then(()=>null,error=>error);await flush();env.instances[0].ontimeout();
  assert.match(env.elements.get('#ef-modal-msg').textContent,/未能确认保存/);assert.equal(env.elements.get('#ef-progress-fill').classList.contains('is-success'),false);
  env.elements.get('#ef-progress-modal').close();assert.match((await result).message,/超时/);
});
