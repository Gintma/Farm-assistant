/* Read-only compatibility contracts. Observe fetch; never rewrite or replay actions. */
(() => {
  window.__farmCompatibility?.remove();
  const key='farm-helper.compatibility.v1',catalog=window.__farmUpdateCatalog||{},listeners=new Set();
  let issues={},storageOK=true,removed=false;const passes=new Map();
  const names={farm:'农务',battle:'战斗',workshop:'作坊',market:'市场采购',account:'账号数据',all:'全部功能'};
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved){if(saved.schema!==1||!Array.isArray(saved.issues)||saved.issues.length>20)throw Error();for(const i of saved.issues){if(!i||typeof i.id!=='string'||i.id.length>100||!Object.hasOwn(names,i.scope)||typeof i.reason!=='string'||i.reason.length>240)throw Error();issues[i.id]={id:i.id,scope:i.scope,reason:i.reason}}}}catch{storageOK=false}
  function changed(){try{localStorage.setItem(key,JSON.stringify({schema:1,issues:Object.values(issues)}))}catch{storageOK=false}for(const fn of listeners)try{fn()}catch{}}
  function fail(id,scope,reason){passes.delete(id);if(issues[id]?.reason===reason&&issues[id]?.scope===scope)return;issues[id]={id,scope,reason};changed()}
  function good(id){if(!issues[id])return;const n=(passes.get(id)||0)+1;passes.set(id,n);if(n>=2){delete issues[id];passes.delete(id);changed()}}
  function isBlocked(scope='all'){
    if(!storageOK)return true;
    return Object.values(issues).some(i=>i.scope==='all'||i.scope===scope||i.scope==='account'&&['farm','earnings','battle'].includes(scope)||i.scope==='farm'&&scope==='earnings');
  }
  function status(){return {storageOK,issues:Object.values(issues).map(i=>({...i,label:names[i.scope]}))}}
  function equivalent(approved,result){
    if(!approved?.files?.length||!result.files?.length||approved.files.length!==result.files.length)return false;
    const identity=f=>{const rule=catalog[f.hash],path=new URL(f.url).pathname;
      if(rule?.kind==='game'&&/^\/assets\/game-[\w-]{8}\.js$/.test(path)||rule?.kind==='cache'&&/^\/assets\/vt323-latin-400-normal-[\w-]{8}\.js$/.test(path))return 'audited:'+rule.family;
      return f.url+'#'+f.hash;
    };
    const describe=v=>{const files=v.files.map(identity).sort();if(new Set(files).size!==files.length)return null;const lookup=new Map(v.files.map(f=>[f.url,identity(f)]));const roots=v.roots.map(u=>lookup.get(u)||u).sort();return JSON.stringify({files,roots})};
    const before=describe(approved);return before!==null&&before===describe(result);
  }
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),num=v=>typeof v==='number'&&Number.isFinite(v);
  function request(path,body){
    const scope=path.includes('/battle/')?'battle':path.includes('/market/')?'market':path.endsWith('/order')?'workshop':'farm',id='request:'+path;
    let data;try{data=typeof body==='string'&&body.length<=1048576?JSON.parse(body):null}catch{}
    if(!object(data)){fail(id,scope,'操作请求不再是可确认的 JSON 对象');return}
    let allowed,required;
    if(path.endsWith('/market/buy')){allowed=['id','qty','px'];required=typeof data.id==='string'&&num(data.qty)&&Number.isInteger(data.qty)&&data.qty>0}
    else if(path.endsWith('/order')){allowed=['i','px'];required=Number.isInteger(data.i)&&data.i>=0&&data.i<3}
    else if(path.endsWith('/battle/start')){allowed=['quick','px'];required=data.quick===undefined||typeof data.quick==='boolean'}
    else if(path.endsWith('/battle/end')){allowed=['run','wave','kills','earned','seconds','died','stats','dbg','px'];required=typeof data.run==='string'&&['wave','kills','earned','seconds'].every(k=>num(data[k]))&&typeof data.died==='boolean'&&object(data.stats)&&(data.dbg===undefined||object(data.dbg));
      if(required&&Object.keys(data.stats).some(k=>!['hits','dodges','tamper','sig'].includes(k))){fail(id,scope,'战斗统计字段发生变化');return}}
    else if(path.endsWith('/ops')){allowed=['ops','px'];required=Array.isArray(data.ops)&&data.ops.length<=25&&data.ops.every(o=>object(o)&&typeof o.op==='string'&&Array.isArray(o.args)&&Object.keys(o).every(k=>['op','args','px'].includes(k)))}
    else return;
    if(!required||Object.keys(data).some(k=>!allowed.includes(k))||data.px!==undefined&&(!object(data.px)||!num(data.px.pay)||!num(data.px.charge)||data.px.mult!==undefined&&!num(data.px.mult))){fail(id,scope,'操作请求的字段或类型变化，等待核对');return}good(id);
  }
  function response(path,data,method='GET'){
    const scope=path.includes('/battle/')?'battle':path.includes('/market')?'market':path.endsWith('/order')?'workshop':'farm',id='response:'+path;
    if(path==='/api/farm/order'&&method!=='GET')return; // Action acknowledgement cannot validate the GET contract.
    if(!object(data)){fail(id,scope,'响应结构变化：预期 JSON 对象');return}
    if(data.ok===false){passes.delete(id);return;} // Ordinary business rejection is not a schema update.
    if(path==='/api/farm'){
      if(!object(data.farm)||!object(data.access)||typeof data.owner!=='string'||data.owner!==data.farm.owner||data.access.open!==true){fail('session','all','账号或访问状态需要重新确认');return}
      good('session');
      const f=data.farm;
      if(!num(data.now)||!object(data.price)||!num(data.price.pay)||!num(data.price.charge)||data.price.mult!==undefined&&!num(data.price.mult)||!object(f.today)||!['energy','harvestEarned'].every(k=>num(f.today[k]))||!num(f.tokens)||!['fields','animals','structures'].every(k=>Array.isArray(f[k]))){fail(id,'account','农场响应关键字段或类型发生变化');return}
    }else if(path==='/api/farm/order'&&method==='GET'&&(!object(data.budget)||!num(data.budget.left)||data.budget.left<0)){fail(id,'workshop','订单预算结构发生变化');return}
    else if(path==='/api/farm/market'&&(!Array.isArray(data.listings)||data.listings.some(x=>!object(x)||typeof x.id!=='string'||typeof x.item!=='string'||!num(x.qty)||!num(x.price)))){fail(id,'market','市场报价结构发生变化');return}
    else if(path==='/api/farm/battle/start'&&(typeof data.run!=='string'||data.room!==undefined&&!num(data.room))){fail(id,'battle','战斗开局响应结构发生变化');return}
    good(id);
  }
  const paths=new Set(['/api/farm','/api/farm/ops','/api/farm/order','/api/farm/market','/api/farm/market/buy','/api/farm/battle/start','/api/farm/battle/end']);
  const original=window.fetch||fetch;
  function observed(input,init){
    const pending=Reflect.apply(original,this,arguments);
    try{
      const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href),method=String(init?.method||input?.method||'GET').toUpperCase();
      if(url.origin!==location.origin||!paths.has(url.pathname))return pending;
      const path=url.pathname;
      if(method==='POST')request(path,init?.body);
      void Promise.resolve(pending).then(res=>{
        if(removed)return;if(res.status===401){fail('session','all','登录状态失效，请重新登录');return}
        if(!res.ok||typeof res.clone!=='function')return;
        // Read a bounded clone only. Never consume the game's response stream.
        if(Number(res.headers?.get?.('content-length'))>1048576)return;const copy=res.clone();void copy.text().then(text=>{if(removed||text.length>1048576)return;let data;try{data=JSON.parse(text)}catch{return}response(path,data,method)}).catch(()=>{});
      }).catch(()=>{});
    }catch{}
    return pending;
  }
  window.fetch=observed;
  async function recheck(){
    const needed=new Set(Object.values(issues).map(i=>i.scope));
    const urls=[...(needed.has('all')||needed.has('account')||needed.has('farm')?['/api/farm']:[]),...(needed.has('workshop')?['/api/farm/order']:[]),...(needed.has('market')?['/api/farm/market']:[])];
    // Two read-only samples can clear a transient response fault. No POST,
    // battle start, purchase, replay or protocol-baseline learning takes place.
    for(let n=0;n<2;n++)for(const url of urls)try{await observed(url,{credentials:'same-origin',cache:'no-store'})}catch{}
  }
  window.__farmCompatibility={equivalent,isBlocked,status,request,response,recheck,fail,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},remove:()=>{removed=true;if(window.fetch===observed)window.fetch=original;listeners.clear();delete window.__farmCompatibility}};
})();
