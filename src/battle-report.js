/* Latest settlement only. Observe fetch without rewriting or replaying it. */
(() => {
  window.__farmBattleReport?.remove();
  const KEY='farm-helper.battle-report.latest.v1',LIMIT=262144,PATH='/api/farm/battle/end';
  const original=window.fetch||fetch;
  let latest=null,sequence=0,removed=false,ui=null,storageOK=true;
  const privateKey=/(cookie|authorization|signature|password|secret|wallet|owner|address|token|nonce|permit|proof|captcha|turnstile)/i;
  const cleanText=s=>String(s).slice(0,1000).replace(/0x[a-f0-9]{20,}/gi,'[地址已脱敏]').replace(/eyJ[\w.-]{30,}/g,'[令牌已脱敏]');
  function clean(value,depth=0){
    if(depth>8)return '[深度上限]';
    if(value===null||typeof value==='boolean'||typeof value==='number')return value;
    if(typeof value==='string')return cleanText(value);
    if(Array.isArray(value))return value.slice(0,2000).map(x=>clean(x,depth+1));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,200).filter(([key])=>!privateKey.test(key)).map(([key,x])=>[key,/^(run|runId)$/i.test(key)?'[局标识已脱敏]':clean(x,depth+1)]));
    return null;
  }
  const unavailable=message=>({unavailable:message});
  function parse(raw){
    if(typeof raw!=='string')return unavailable('请求体不是可读取的 JSON 文本');
    if(raw.length>LIMIT)return unavailable('正文超过256KB，未保留');
    try{return clean(JSON.parse(raw))}catch{return unavailable('正文不是可解析的 JSON，未保留原文')}
  }
  async function read(copy){
    if(Number(copy.headers?.get?.('content-length'))>LIMIT)return unavailable('正文超过256KB，未读取');
    if(!copy.body?.getReader)return parse(await copy.text());
    const reader=copy.body.getReader(),decoder=new TextDecoder();let size=0,text='';
    try{
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>LIMIT){void reader.cancel().catch(()=>{});return unavailable('正文超过256KB，未保留')}text+=decoder.decode(part.value,{stream:true})}
      return parse(text+decoder.decode());
    }finally{reader.releaseLock()}
  }
  function persist(){
    try{sessionStorage.setItem(KEY,JSON.stringify(latest));storageOK=true}catch{storageOK=false}
    paint();
  }
  try{
    const raw=sessionStorage.getItem(KEY);
    if(raw&&raw.length<=LIMIT*3){const saved=JSON.parse(raw);if(saved?.schema===1&&saved.kind==='battle-settlement'&&saved.path===PATH&&Number.isFinite(saved.at))latest=clean(saved)}
  }catch{storageOK=false}
  function current(id){return !removed&&id===sequence}
  function observe(input,init){
    let body=null,metadata=null;
    try{
      const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
      const method=String(init?.method||input?.method||'GET').toUpperCase();
      if(url.origin===location.origin&&url.pathname===PATH&&method==='POST'){
        metadata={schema:1,kind:'battle-settlement',helperVersion:window.__farmLauncher?.status?.().version||'unknown',at:Date.now(),path:PATH,method,
          notes:['仅保留最新一次结算上报；新的上报覆盖旧记录。','请求来自本页fetch调用的正文副本；未修改、重放或额外发送游戏操作。网络失败与服务器拒绝也会保留，不能仅凭发起请求认定结算成功。','不保存请求头、Cookie或身份凭据；局标识已脱敏。响应仅保留结算结果字段，不保留农场账号快照。','正文最多256KB；过长文本、数组或深层字段会截断，不支持的格式会标注不可读取。'],request:null,response:null,responsePending:true,state:'pending'};
        if(typeof init?.body==='string')body=Promise.resolve(init.body).then(parse);
        else if(init?.body!=null)body=Promise.resolve(unavailable('请求体格式不受支持，未读取'));
        else if(typeof input?.clone==='function'){const copy=input.clone();body=Promise.resolve().then(()=>read(copy)).catch(()=>unavailable('请求正文不可读取'))}
        else body=Promise.resolve(unavailable('请求正文不可读取'));
      }
    }catch{if(metadata)body=Promise.resolve(unavailable('请求正文不可读取'))} // Observation must never prevent the game's fetch.
    let pending;
    try{pending=Reflect.apply(original,this,arguments)}catch(error){if(metadata&&!removed){latest={...metadata,state:'failed',responsePending:false,error:cleanText(error.message)};const id=++sequence;persist();void body?.then(data=>{if(current(id)){latest.request=data;persist()}})}throw error}
    if(!metadata||removed)return pending;
    const id=++sequence;latest=metadata;persist();
    void body.then(data=>{if(current(id)){latest.request=data;persist()}}).catch(()=>{});
    void Promise.resolve(pending).then(res=>{
      if(!current(id))return;
      latest.status=res.status;latest.state='responded';latest.responseAt=Date.now();persist();
      if(typeof res.clone!=='function'){latest.response=unavailable('响应正文不可读取');latest.responsePending=false;persist();return}
      let copy;try{copy=res.clone()}catch{latest.response=unavailable('响应正文不可读取');latest.responsePending=false;persist();return}
      void read(copy).then(data=>{
        if(!current(id))return;
        // Keep result fields only. Avoid persisting the full account/farm snapshot.
        latest.responsePending=false;latest.response=data?.unavailable?data:Object.fromEntries(['ok','msg','error','gained','earned','count','results','room','quick'].filter(key=>data&&Object.hasOwn(data,key)).map(key=>[key,data[key]]));persist();
      }).catch(()=>{if(current(id)){latest.response=unavailable('响应正文不可读取');latest.responsePending=false;persist()}});
    }).catch(error=>{if(current(id)){latest.state='failed';latest.responsePending=false;latest.error=cleanText(error.message);persist()}});
    return pending;
  }
  window.fetch=observe;
  function status(){return {available:!!latest?.request,at:latest?.at??null,state:latest?.state||'empty',status:latest?.status??null,storageOK}}
  function data(){return latest?JSON.parse(JSON.stringify(latest)):null}
  function download(){
    if(!latest?.request)return false;
    const url=URL.createObjectURL(new Blob([JSON.stringify(latest,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='farming-battle-settlement-'+new Date(latest.at).toISOString().replace(/[:.]/g,'-')+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);return true;
  }
  function paint(){
    if(!ui)return;const s=status();ui.button.disabled=!s.available;
    if(!latest){ui.note.textContent='结算后可导出 · 只保留最新一次';return}
    const time=new Date(latest.at).toLocaleTimeString('zh-CN',{hour12:false});
    ui.note.textContent=time+' · '+(s.state==='pending'?'等待服务器响应':s.state==='failed'?'上报失败':s.status===null?'已保存':'响应 '+s.status)+(storageOK?'':' · 仅本页内存保存');
  }
  function mount(parent){
    ui?.box.remove();const box=document.createElement('section'),button=document.createElement('button'),note=document.createElement('p');
    box.className='fh-report';button.type='button';button.className='fh-recheck';button.textContent='导出最新结算';note.className='fh-note';
    button.onclick=()=>{try{download()}catch{note.textContent='导出失败，请重试'}};box.append(button,note);parent.append(box);ui={box,button,note};paint();
  }
  window.__farmBattleReport={status,data,download,mount,remove:()=>{removed=true;if(window.fetch===observe)window.fetch=original;ui?.box.remove();ui=null;delete window.__farmBattleReport}};
})();
