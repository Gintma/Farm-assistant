/* Opt-in CDP Network observation. Never intercepts requests or changes game statistics. */
(() => {
  const KEY='farmManualCapture',MAX=300,TTL=30*60*1000,helperVersion=chrome.runtime.getManifest().version;
  let session=null,attached=false,stopping=false,starting=false,timer=null,queue=Promise.resolve();
  const requests=new Map(),runs=new Map();
  const recovered=(async()=>{
    const saved=(await chrome.storage.session.get(KEY))[KEY];
    if(saved?.active){saved.active=false;saved.stoppedAt=Date.now();saved.reason=saved.kind==='assistant-test'?'后台重启，记录已中断；助手开关未改变':'后台重启，记录已中断；自动开关仍关闭';await chrome.storage.session.set({[KEY]:saved});await chrome.debugger.detach({tabId:saved.tabId}).catch(()=>{})}
  })();
  const command=(method,params={})=>chrome.debugger.sendCommand({tabId:session.tabId},method,params);
  const text=s=>String(s).slice(0,500).replace(/0x[a-f0-9]{20,}/gi,'[地址已脱敏]').replace(/eyJ[\w.-]{30,}/g,'[令牌已脱敏]');
  function value(v,depth=0){
    if(depth>5)return '[深度上限]';
    if(v===null||typeof v==='boolean'||typeof v==='number')return v;
    if(typeof v==='string')return text(v);
    if(Array.isArray(v))return v.slice(0,50).map(x=>value(x,depth+1));
    if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).slice(0,80).filter(([k])=>!/(cookie|authorization|signature|password|secret|wallet|owner|address|token|nonce|permit|proof|captcha|turnstile)/i.test(k)).map(([k,x])=>[k,value(x,depth+1)]));
    return undefined;
  }
  const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o&&Object.hasOwn(o,k)).map(k=>[k,value(o[k])]));
  function runLabel(run){if(run==null)return null;if(!runs.has(String(run)))runs.set(String(run),'run-'+(runs.size+1));return runs.get(String(run))}
  function requestBody(path,raw){
    let b;try{b=JSON.parse(raw||'{}')}catch{return {unavailable:'不是可解析的 JSON；未保留原文'}}
    if(path==='/api/farm/ops')return {ops:Array.isArray(b.ops)?b.ops.slice(0,25).map(o=>pick(o,['op','args','px'])):[],...pick(b,['px'])};
    const out=pick(b,['quick','wave','kills','earned','seconds','died','stats','px']);
    if(Object.hasOwn(b,'run'))out.run=runLabel(b.run);
    return out;
  }
  function responseBody(raw){
    let b;try{b=JSON.parse(raw)}catch{return {unavailable:'响应不是 JSON；未保留原文'}}
    const out=pick(b,['ok','msg','error','gained','earned','count','results','room','quick']);
    if(Object.hasOwn(b,'run'))out.run=runLabel(b.run);
    if(b.farm)out.farm={...pick(b.farm,['level','today','battle','silo','pantry']),balance:typeof b.farm.tokens==='number'?b.farm.tokens:undefined};
    return out;
  }
  function persist(){return chrome.storage.session.set({[KEY]:session})}
  async function status(){
    await recovered;
    const saved=session||(await chrome.storage.session.get(KEY))[KEY];
    return {ok:true,active:!!session?.active,kind:saved?.kind||null,count:saved?.records?.length||0,reason:saved?.reason||'',startedAt:saved?.startedAt,stoppedAt:saved?.stoppedAt};
  }
  async function stop(reason='手动结束记录'){
    if(stopping)return status();stopping=true;
    try{
      if(session){session.active=false;session.reason=reason;session.stoppedAt=Date.now();for(const row of requests.values())row.responsePendingAtStop=true;await persist().catch(()=>{});
        // Only the manual baseline owns a pause flag; assistant recording is observational.
        if(attached&&session.kind==='manual-baseline')await command('Runtime.evaluate',{expression:'delete window.__farmManualCapture',returnByValue:true}).catch(()=>{});
        if(attached)await chrome.debugger.detach({tabId:session.tabId}).catch(()=>{});
      }
    }finally{attached=false;clearTimeout(timer);requests.clear();runs.clear();stopping=false}
    return status();
  }
  async function start(options={}){
    if(starting)throw Error('正在启动记录，请稍候');
    starting=true;try{return await begin(options)}finally{starting=false}
  }
  async function begin({kind='manual-baseline'}={}){
    await recovered;
    if(!['manual-baseline','assistant-test'].includes(kind))throw Error('测试类型无效');
    if(session?.active)throw Error('记录已经开启，请先完成本次测试');
    const tab=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
    if(!tab||new URL(tab.url).origin!=='https://farmingseason.io')throw Error('请先切到游戏页面');
    await chrome.debugger.attach({tabId:tab.id},'1.3');
    session={schema:1,kind,tabId:tab.id,active:false,startedAt:Date.now(),records:[],notes:['只记录允许的同站游戏操作接口；不保存请求头、Cookie、钱包地址、签名或会话令牌。','请求和响应按字段白名单保留；不是原始完整 HAR，也不能揭示服务器内部判定规则。',kind==='assistant-test'?'助手测试：不改变任何自动开关或游戏统计；类型为用户选定标签，不代表每个动作均由助手执行。':'手动对照：开始时关闭自动开关，结束后保持关闭。']};attached=true;
    try{
      const expression=kind==='assistant-test'?`(() => {
        if(location.origin!=='https://farmingseason.io')throw Error('页面已变化');
        const version=window.__farmLauncher?.status?.().version;
        if(version!==${JSON.stringify(helperVersion)})throw Error('请先开启新版助手');
        if(window.__farmManualCapture)throw Error('页面仍处于手动测试暂停，请先刷新并开启新版助手');
        return {version,battleEnabled:!!window.__farmCombat?.status?.().enabled,farmFlags:window.__farmAutomation?.status?.().flags||{}};
      })()`:`(() => {
        if(location.origin!=='https://farmingseason.io')throw Error('页面已变化');
        if(window.__farmLauncher?.status?.().version!==${JSON.stringify(helperVersion)})throw Error('请先开启新版助手');
        const a=window.__farmAutomation,s=a?.status?.();
        if(s?.pending||(window.__farmGame||window.temp1)?.scene?.scenes?.some(s=>s.worker?.pending?.()?.length))throw Error('请等现有农活完成后再开始记录');
        window.__farmManualCapture=true;window.__farmCombat?.set('enabled',false);
        for(const k of Object.keys(s?.flags||{}))a.set(k,false);
        a?.pauseForVersion?.();return true;
      })()`;
      const result=await command('Runtime.evaluate',{expression,returnByValue:true});
      const accepted=kind==='assistant-test'?result.result?.value?.version===helperVersion:result.result?.value===true;
      if(result.exceptionDetails||!accepted)throw Error(result.exceptionDetails?.exception?.description||'无法确认测试状态');
      if(kind==='assistant-test')session.automationAtStart=result.result.value;
      await command('Network.enable',{maxTotalBufferSize:2097152,maxResourceBufferSize:262144,maxPostDataSize:65536});
      session.active=true;await persist();timer=setTimeout(()=>{void stop('已到30分钟上限')},TTL);
      return {...await status(),message:kind==='assistant-test'?'助手测试记录已开始，原有自动开关保持不变。请自行开启需要测试的功能、手动开局；完成后停止并导出。':'手动测试记录已开始，所有自动开关已关闭。请手动操作；完成后停止并导出。顶部调试提示在记录期间保留。'};
    }catch(e){await stop('启动失败');throw e}
  }
  async function event(source,method,p){
    if(!session?.active||source.tabId!==session.tabId||stopping)return;
    if(Date.now()-session.startedAt>=TTL){await stop('已到30分钟上限');return}
    if(method==='Network.requestWillBeSent'){
      let u;try{u=new URL(p.request.url)}catch{return}
      if(p.redirectResponse&&requests.has(p.requestId)){await stop('操作接口发生重定向，记录结束');return}
      if(p.type==='Document'){await stop('页面已导航，结束本次记录');return}
      if(u.origin!=='https://farmingseason.io'||p.request.method!=='POST'||!/^\/api\/farm\/(ops|battle\/(start|end))$/.test(u.pathname))return;
      if(session.records.length>=MAX){await stop('已到300条记录上限');return}
      if(p.redirectResponse){await stop('操作接口发生重定向，记录结束');return}
      let keys=[];try{keys=Object.keys(JSON.parse(p.request.postData||'{}')).slice(0,80)}catch{}
      const row={id:session.records.length+1,at:Date.now(),path:u.pathname,method:'POST',requestKeys:keys,request:requestBody(u.pathname,p.request.postData),requestBodyAvailable:typeof p.request.postData==='string',response:null};
      session.records.push(row);requests.set(p.requestId,row);await persist();
    }else if(method==='Network.responseReceived'){
      const row=requests.get(p.requestId);if(!row)return;
      row.status=p.response.status;row.mimeType=p.response.mimeType;await persist();
    }else if(method==='Network.loadingFinished'){
      const row=requests.get(p.requestId);if(!row)return;
      requests.delete(p.requestId);row.durationMs=Date.now()-row.at;
      if(p.encodedDataLength>262144)row.response={unavailable:'响应超过256KB，未读取正文'};
      else try{
        const data=await command('Network.getResponseBody',{requestId:p.requestId});
        row.response=data.base64Encoded?{unavailable:'二进制响应未读取'}:responseBody(data.body);
      }catch{row.response={unavailable:'浏览器未保留响应正文'}}
      await persist();
    }else if(method==='Network.loadingFailed'){
      const row=requests.get(p.requestId);if(!row)return;
      requests.delete(p.requestId);row.error=text(p.errorText);await persist();
    }
  }
  chrome.debugger.onEvent.addListener((...args)=>{queue=queue.then(()=>event(...args)).catch(()=>stop('记录异常，已停止'))});
  chrome.debugger.onDetach.addListener(source=>{if(session?.active&&source.tabId===session.tabId){attached=false;void stop(session.kind==='assistant-test'?'调试连接已断开，记录结束；助手开关未改变':'调试连接已断开；自动开关仍关闭，需要恢复时请刷新游戏')}});
  globalThis.FarmManualRecorder={start,stop:()=>queue.then(()=>stop()),status,export:async()=>{
    if(session?.active)throw Error('请先停止记录再导出');
    return {ok:true,data:session||(await chrome.storage.session.get(KEY))[KEY]||null};
  },clear:async()=>{if(session?.active||starting)throw Error('请先停止记录');session=null;await chrome.storage.session.remove(KEY);return {ok:true}},isActive:()=>!!session?.active||starting};
})();
