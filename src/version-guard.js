/* Public front-end fingerprint guard. Never executes downloaded code or changes game data. */
(() => {
  window.__farmVersionGuard?.remove();
  const storageKey='farm-helper.game-version.v1',preferenceKey='farm-helper.game-code-check.v1',intervalMs=300000,pageId=String(performance.timeOrigin);
  let record={approved:null,pending:null},storageError=false,removed=false,busy=false,flight=null,controller=null,lastTry=0,ui=null,generation=0;
  let state={blocked:true,phase:'checking',message:'正在检查游戏版本…',detail:'核对入口与关联代码，完成前暂停全部自动功能',files:0,checkedAt:0,refreshRequired:false,cacheOnly:false,textOnly:false};
  let candidate=null,enabled=readEnabled(),settingError='';
  function readEnabled(){try{return localStorage.getItem(preferenceKey)!=='off'}catch{return true}}
  function disabledState(){candidate=null;update({blocked:false,phase:'disabled',message:'游戏代码检查已关闭',detail:'忽略代码更新和接口兼容性检查；不会因此暂停助手',files:0,refreshRequired:false,cacheOnly:false,textOnly:false})}
  function applyEnabled(value){
    if(value===enabled){paint();return}
    enabled=value;generation++;const revision=generation;candidate=null;controller?.abort();window.__farmCompatibility?.setEnabled?.(enabled);
    if(!enabled){disabledState();return}
    update({blocked:true,phase:'checking',message:'正在检查游戏版本…',detail:'代码检查已开启，重新核对当前版本',refreshRequired:false,cacheOnly:false,textOnly:false});
    if(busy&&flight)void flight.finally(()=>{if(!removed&&enabled&&revision===generation)void check()});else void check();
  }
  function setEnabled(value){
    if(typeof value!=='boolean'||removed)return false;
    try{localStorage.setItem(preferenceKey,value?'on':'off');settingError=''}catch{settingError='无法保存检查设置，请检查浏览器存储';paint();return false}
    applyEnabled(value);return true;
  }
  function read(){
    try{
      const value=JSON.parse(localStorage.getItem(storageKey)||'null');
      const a=value?.approved;
      if(a?.reviewedLogicals!==undefined&&(!Array.isArray(a.reviewedLogicals)||a.reviewedLogicals.length>32||a.reviewedLogicals.some(x=>! /^[a-f0-9]{64}$/.test(x))))throw Error('兼容摘要记录异常');
      if(a&&(a.cacheFilter!==undefined&&a.cacheFilter!==1||a.logical!==undefined&&!/^[a-f0-9]{64}$/.test(a.logical)||['cacheRoots','cacheFiles'].some(k=>a[k]!==undefined&&(!Array.isArray(a[k])||a[k].length>512||a[k].some(u=>!asset(u))))))throw Error('缓存版本记录异常');
      if(value&&(value.schema!==1||value.approved&&(!Array.isArray(value.approved.files)||!value.approved.files.length||!Array.isArray(value.approved.roots)||!value.approved.roots.length||! /^[a-f0-9]{64}$/.test(value.approved.fingerprint)||value.approved.files.some(f=>!asset(f.url)||! /^[a-f0-9]{64}$/.test(f.hash)))||value.pending&&(!['update','error'].includes(value.pending.kind)||value.pending.kind==='update'&&typeof value.pending.pageId!=='string')))throw Error('版本记录格式异常');
      record=value||{schema:1,approved:null,pending:null};storageError=false;
    }catch{storageError=true;throw Error('无法读取版本记录，请检查浏览器存储')}
  }
  function save(next){try{localStorage.setItem(storageKey,JSON.stringify(next));record=next;storageError=false}catch{storageError=true;throw Error('无法保存版本确认，自动操作保持暂停')}}
  function pause(){window.__farmBattleInput?.release();window.__farmAutomation?.pauseForVersion?.();window.__farmEarnings?.pauseForVersion?.()}
  function update(values){if(removed||!enabled&&values.phase!=='disabled')return;const was=state.blocked;state={...state,...values};if(state.blocked&&!was)pause();if(was&&!state.blocked)void window.__farmAutomation?.refresh?.();paint()}
  function asset(value,base=location.href){
    try{const u=new URL(value,base);if(u.origin!==location.origin||!u.pathname.startsWith('/assets/')||! /\.m?js$/.test(u.pathname))return null;u.hash='';return u.href}catch{return null}
  }
  function loaded(){
    const urls=[...document.querySelectorAll('script[src],link[rel="modulepreload"][href]')].map(e=>e.src||e.href);
    for(const e of performance.getEntriesByType('resource'))if(['script','link'].includes(e.initiatorType))urls.push(e.name);
    return [...new Set(urls.map(u=>asset(u)).filter(Boolean))].sort();
  }
  const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  // Narrow exception for the verified resource URL wrapper. Never strip arbitrary ?v= strings.
  async function logicFingerprint(roots,files,sources){
    const entryRoots=roots.filter(u=>/^\/assets\/game-[\w-]{8}\.js$/.test(new URL(u).pathname)&&!new URL(u).search);
    const helpers=files.filter(f=>/^\/assets\/vt323-latin-400-normal-[\w-]{8}\.js$/.test(new URL(f.url).pathname)&&!new URL(f.url).search);
    const prefix='var e=e=>/^(data|blob):|\\?/.test(e)?e:`${e}?v=';
    const normalized=new Map(),keys=new Map();
    if(entryRoots.length===1&&helpers.length===1){
      const helper=helpers[0],source=sources.get(helper.url),version=source?.startsWith(prefix)&&source.slice(prefix.length).match(/^[A-Za-z0-9_-]{1,64}(?=`)/);
      if(version){
        normalized.set(helper.url,prefix+'CACHE_VERSION'+source.slice(prefix.length+version[0].length));
        keys.set(helper.url,location.origin+'/assets/RESOURCE_CACHE_HELPER.js');
        const entry=entryRoots[0],base=new URL(helper.url).pathname.split('/').pop(),entrySource=sources.get(entry);
        // Preserve the complete import syntax and everything outside this exact dependency filename.
        const ref=new RegExp('(\\bfrom\\s*["\'])\\./'+base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(["\'])','g');
        if(entrySource&&ref.test(entrySource)){
          ref.lastIndex=0;
          normalized.set(entry,entrySource.replace(ref,'$1./RESOURCE_CACHE_HELPER.js$2'));
          keys.set(entry,location.origin+'/assets/GAME_CACHE_ENTRY.js');
        }
      }
    }
    const list=await Promise.all(files.map(async f=>({url:keys.get(f.url)||f.url,hash:normalized.has(f.url)?await hash(new TextEncoder().encode(normalized.get(f.url))):f.hash})));
    list.sort((a,b)=>a.url.localeCompare(b.url));
    if(new Set(list.map(f=>f.url)).size!==list.length)throw Error('版本文件映射冲突，请人工核对');
    return hash(new TextEncoder().encode(JSON.stringify({roots:roots.map(u=>keys.get(u)||u).sort(),files:list})));
  }
  async function scan(signal){
    let bytesRead=0;const files=new Map(),sources=new Map(),seen=new Set(),queue=[];
    const enqueue=url=>{if(!seen.has(url)){if(seen.size>=160)throw Error('关联模块超过检查上限，需人工核对');seen.add(url);queue.push(url)}};
    const canceled=()=>{if(!enabled||signal.aborted){const e=Error('检查已取消');e.name='AbortError';throw e}};
    const request=async url=>{
      canceled();const response=await fetch(url,{credentials:'same-origin',cache:url===location.origin+'/'?'no-store':'no-cache',redirect:'error',signal});
      canceled();if(!response.ok)throw Error('版本文件读取失败（'+response.status+'）');return response;
    };
    const response=await request(location.origin+'/');
    const html=await response.text();
    const doc=new DOMParser().parseFromString(html,'text/html');
    const roots=[...new Set([...doc.querySelectorAll('script[src],link[rel="modulepreload"][href]')].map(e=>asset(e.getAttribute('src')||e.getAttribute('href'),location.origin+'/')).filter(Boolean))].sort();
    if(!roots.length)throw Error('未找到游戏入口脚本，可能是登录或验证页面');
    roots.forEach(enqueue);
    const rootChanged=record.approved&&JSON.stringify(roots)!==JSON.stringify(record.approved.roots);
    // Include runtime-loaded modules only while the current page uses the same entry build.
    const local=loaded(),entries=[...document.querySelectorAll('script[src]')].map(e=>asset(e.src)).filter(Boolean);
    const sameEntry=entries.length>0&&entries.every(u=>roots.includes(u));
    if(sameEntry&&!rootChanged)local.forEach(enqueue);
    while(queue.length){
      const batch=queue.splice(0,3);
      const results=await Promise.allSettled(batch.map(async url=>{
        const response=await request(url),type=response.headers.get('content-type')||'';
        if(/text\/html/i.test(type))throw Error('脚本地址返回了网页或验证内容');
        const bytes=await response.arrayBuffer();bytesRead+=bytes.byteLength;
        if(bytesRead>32*1024*1024)throw Error('代码总量超过检查上限，需人工核对');
        const digest=await hash(bytes),source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);files.set(url,{url,hash:digest});sources.set(url,source);
        for(const m of source.matchAll(/["'`]((?:\.{1,2}\/|\/?assets\/)[\w./@-]+\.m?js(?:\?[^"'`\s]*)?)["'`]/g)){
          const next=asset(m[1],m[1].startsWith('assets/')?location.origin+'/':url);if(next)enqueue(next);
        }
        update({files:files.size,detail:'已核对 '+files.size+' 个代码文件'});
      }));
      const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    }
    const list=[...files.values()].sort((a,b)=>a.url.localeCompare(b.url));
    const fingerprint=await hash(new TextEncoder().encode(JSON.stringify(list)));
    const logical=await logicFingerprint(roots,list,sources);
    const approved=record.approved;
    const trustedRoots=new Set([...roots,...(approved?.roots||[]),...(approved?.cacheRoots||[])]);
    const trustedFiles=new Set([...files.keys(),...(approved?.files||[]).map(f=>f.url),...(approved?.cacheFiles||[])]);
    const equivalentPage=entries.length>0&&entries.every(u=>trustedRoots.has(u))&&local.every(u=>trustedFiles.has(u));
    return {roots,files:list,fingerprint,logical,equivalentPage,stale:!sameEntry||local.some(u=>!files.has(u))};
  }
  function markChanged(){
    if(removed)return;
    if(record.pending?.kind!=='update')save({...record,pending:{kind:'update',at:Date.now(),pageId}});
    update({blocked:true,message:'发现游戏代码更新，全部自动功能已暂停'});
  }
  async function check(confirmFingerprint=null){
    if(removed||!enabled)return false;if(busy)return flight;
    busy=true;lastTry=Date.now();candidate=null;const revision=generation;
    update({phase:'checking',message:'正在检查游戏版本…',detail:'读取入口与关联代码',files:0,cacheOnly:false,textOnly:false});
    controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),90000);
    flight=(async()=>{
      try{
        read();const result=await scan(controller.signal);if(removed||revision!==generation)return false;
        candidate=result;const rawChanged=record.approved?.fingerprint!==result.fingerprint;
        const cacheOnly=!!record.approved&&rawChanged&&record.approved.cacheFilter===1&&[record.approved.logical,...(record.approved.reviewedLogicals||[])].includes(result.logical);
        const textOnly=!!record.approved&&rawChanged&&!cacheOnly&&!!window.__farmCompatibility?.equivalent(record.approved,result),safeOnly=cacheOnly||textOnly;
        const changed=rawChanged&&!safeOnly;
        if(record.approved&&changed)markChanged();
        const trustedReviewed=!!record.approved?.reviewedLogicals?.includes(result.logical);
        const refreshRequired=(safeOnly||trustedReviewed?!result.equivalentPage:result.stale)||record.pending?.kind==='update'&&record.pending.pageId===pageId&&!safeOnly;
        if(confirmFingerprint){
          if(refreshRequired)throw Error('请先刷新游戏，再确认当前加载的版本');
          if(confirmFingerprint!==result.fingerprint){update({blocked:true,phase:'review',refreshRequired:false,message:'代码再次变化，请重新检查后确认',detail:'本次没有保存确认'});return false}
          save({schema:1,approved:{fingerprint:result.fingerprint,roots:result.roots,files:result.files,cacheFilter:1,logical:result.logical,at:Date.now()},pending:null});
        }else if(!record.approved||changed||record.pending?.kind==='update'&&!safeOnly||refreshRequired){
          const old=new Map((record.approved?.files||[]).map(f=>[f.url,f.hash]));
          const count=result.files.filter(f=>old.get(f.url)!==f.hash).length;
          update({blocked:true,phase:'review',refreshRequired,message:record.approved?'游戏代码有更新，等待确认':'首次启用，请确认当前游戏版本',detail:refreshRequired?'请结束当前操作并刷新游戏，再检查与确认':record.approved?'检测到 '+count+' 个新增或变化文件，尚未归类；核对后确认兼容':'已检查 '+result.files.length+' 个代码文件，确认后建立版本基准',checkedAt:Date.now()});return false;
        }else if(safeOnly){
          const a=record.approved;
          const cacheRoots=[...new Set([...(a.cacheRoots||[]),...result.roots])].slice(-64);
          const cacheFiles=[...new Set([...(a.cacheFiles||[]),...result.files.map(f=>f.url)])].slice(-512);
          const reviewedLogicals=[...new Set([...(a.reviewedLogicals||[]),...(textOnly?[result.logical]:[])])].slice(-32);
          if(record.pending||JSON.stringify(cacheRoots)!==JSON.stringify(a.cacheRoots)||JSON.stringify(cacheFiles)!==JSON.stringify(a.cacheFiles)||JSON.stringify(reviewedLogicals)!==JSON.stringify(a.reviewedLogicals))save({...record,approved:{...a,cacheRoots,cacheFiles,reviewedLogicals},pending:null});
        }else if(record.pending||record.approved.cacheFilter!==1||record.approved.logical!==result.logical){
          // Old baselines gain the new digest only after their original raw hashes match exactly.
          save({...record,approved:{...record.approved,cacheFilter:1,logical:result.logical},pending:null});
        }
        update({blocked:false,phase:'ready',refreshRequired:false,cacheOnly,textOnly,message:'版本检查通过',detail:textOnly?'已核实为提现说明文案及缓存变化，自动放行':cacheOnly?'仅资源缓存版本变化，实际代码一致，已自动忽略':'关键前端代码与已确认版本一致',checkedAt:Date.now()});return true;
      }catch(error){
        if(!removed&&revision===generation){
          if(!storageError&&record.pending?.kind!=='update')try{save({...record,pending:{kind:'error',at:Date.now()}})}catch{}
          update({blocked:true,phase:'error',message:'无法确认游戏版本，已暂停',detail:error.name==='AbortError'?'检查超时，请检查网络后重试':error.message,refreshRequired:false});
        }return false;
      }finally{clearTimeout(timeout);controller=null;busy=false;if(!removed)paint()}
    })();return flight;
  }
  async function approve(){if(!enabled||busy||state.phase!=='review'||state.refreshRequired||!candidate)return false;const fp=candidate.fingerprint;return check(fp)}
  function mount({panel,title,body,mini,isCollapsed}){
    if(ui)unmount();
    const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e};
    const settings=make('div'),settingLabel=make('span','游戏代码检查'),toggle=make('button'),settingNote=make('span');settings.id='farm-game-code-check';settings.style.cssText='flex:none;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin:0 0 8px;font-size:11px;color:#abc2af';
    toggle.type='button';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','游戏代码检查');toggle.style.cssText='font:inherit;padding:3px 8px;border:1px solid #708c69;border-radius:4px;cursor:pointer';toggle.onclick=()=>setEnabled(!enabled);settingNote.setAttribute('role','status');settingNote.style.cssText='flex-basis:100%;color:#e2cc90;font-size:10px';settings.append(settingLabel,toggle,settingNote);panel.insertBefore(settings,body);
    const badge=make('span');badge.style.cssText='font-size:10px;font-weight:400;margin-left:6px;color:#d9c38e';title.append(badge);
    const mask=make('section');mask.id='farm-version-mask';mask.setAttribute('aria-label','游戏版本保护');
    mask.style.cssText='box-sizing:border-box;min-height:176px;padding:24px 12px;display:flex;flex-direction:column;justify-content:center;gap:10px;background:#0d1b14;border:1px solid #49604b;border-radius:6px;font-size:11px;line-height:1.65;overflow-wrap:anywhere';
    const heading=make('strong'),detail=make('p'),actions=make('div');heading.style.fontSize='12px';heading.setAttribute('role','status');heading.setAttribute('aria-live','polite');detail.style.cssText='margin:0;color:#b9cbbd;white-space:pre-line';actions.style.cssText='display:flex;flex-wrap:wrap;gap:7px';
    const retry=make('button','重新检测'),confirm=make('button','确认兼容，解除暂停');
    for(const b of [retry,confirm]){b.type='button';b.style.cssText='font:inherit;padding:5px 8px;border:1px solid #708c69;border-radius:4px;background:#c7dfb8;color:#213721;cursor:pointer'}
    retry.onclick=()=>void check();confirm.onclick=()=>void approve();actions.append(retry,confirm);mask.append(heading,detail,actions);panel.insertBefore(mask,body);
    const notice=make('details'),summary=make('summary'),list=make('p'),inspect=make('button','重新检查相关功能');notice.id='farm-compatibility-notice';notice.style.cssText='margin:0 0 10px;padding:8px;background:#302c1c;border:1px solid #76633b;border-radius:5px;font-size:11px;line-height:1.5;color:#e8d8af';list.style.cssText='margin:6px 0;white-space:pre-line';inspect.type='button';inspect.onclick=()=>void window.__farmCompatibility?.recheck();inspect.style.cssText=retry.style.cssText;notice.append(summary,list,inspect);panel.insertBefore(notice,body);
    ui={badge,mask,heading,detail,retry,confirm,body,mini,isCollapsed,notice,summary,list,settings,toggle,settingNote};paint();
  }
  function paint(){
    if(!ui||removed)return;
    const {badge,mask,heading,detail,retry,confirm,body,mini,isCollapsed}=ui,collapsed=isCollapsed();
    ui.settings.hidden=collapsed;ui.toggle.textContent=enabled?'已开启':'已关闭';ui.toggle.setAttribute('aria-checked',String(enabled));ui.toggle.style.background=enabled?'#c7dfb8':'#20382a';ui.toggle.style.color=enabled?'#213721':'#abc2af';ui.toggle.title=enabled?'点击关闭：忽略游戏更新与接口兼容性检查':'点击开启：立即重新检查当前游戏版本';ui.settingNote.hidden=!settingError;ui.settingNote.textContent=settingError;
    body.inert=enabled&&state.blocked;body.hidden=collapsed||enabled&&state.blocked;mask.hidden=collapsed||!enabled||!state.blocked;
    heading.textContent=state.message;detail.textContent=state.detail;
    retry.disabled=!enabled||busy;confirm.disabled=!enabled||busy||state.refreshRequired||state.phase!=='review';confirm.hidden=!enabled||state.phase!=='review'||state.refreshRequired;
    const compatibility=window.__farmCompatibility?.status(),faults=compatibility?.issues||[];
    ui.notice.hidden=!enabled||state.blocked||collapsed||compatibility?.storageOK!==false&&!faults.length;
    const stopped=compatibility?.storageOK===false||faults.some(x=>x.scope==='all');
    ui.summary.textContent=compatibility?.storageOK===false?'兼容记录不可用，自动操作暂停':stopped?'自动操作暂停，账号状态待确认':[...new Set(faults.map(x=>x.label))].join('、')+'暂停 · 其他兼容功能可继续';
    ui.list.textContent=faults.map(x=>x.label+'：'+x.reason).join('\n');
    badge.textContent=!enabled?'检查已关闭':state.phase==='checking'?'检测中':state.blocked?'已暂停':stopped?'自动暂停':faults.length?'部分暂停':state.textOnly?'文案更新已核对':state.cacheOnly?'缓存更新已忽略':'版本正常';badge.title=state.blocked?state.message:state.detail;
    if(state.blocked&&collapsed){mini.textContent=state.message;mini.title=state.detail}
    if(state.blocked&&body.contains(document.activeElement))retry.focus();
  }
  function unmount(){if(!ui)return;ui.body.inert=false;ui.mask.remove();ui.badge.remove();ui.notice.remove();ui.settings.remove();ui=null}
  function foreground(){if(enabled&&!document.hidden&&Date.now()-lastTry>=30000)void check()}
  function sync(e){if(e.key===preferenceKey||e.key===null){const before=enabled;applyEnabled(readEnabled());if(e.key===preferenceKey||!enabled||before!==enabled)return}if(!enabled||e.key!==storageKey&&e.key!==null)return;generation++;controller?.abort();update({blocked:true,message:'版本确认记录变化，重新检查'});if(flight&&busy)void flight.finally(()=>{if(!removed&&enabled)void check()});else void check()}
  const unsubscribe=window.__farmCompatibility?.subscribe(()=>{if(enabled&&window.__farmCompatibility.isBlocked('battle'))window.__farmBattleInput?.release();paint()});
  const timer=setInterval(()=>{if(enabled&&!document.hidden&&Date.now()-lastTry>=intervalMs)void check()},15000);
  document.addEventListener('visibilitychange',foreground);window.addEventListener('storage',sync);
  window.__farmVersionGuard={setEnabled,isBlocked:(scope='all')=>enabled&&(state.blocked||!!window.__farmCompatibility?.isBlocked(scope)),reason:(scope='all')=>!enabled?'':state.blocked?state.message:(window.__farmCompatibility?.status().issues.find(x=>x.scope===scope||x.scope==='all'||x.scope==='account'&&['farm','earnings','battle'].includes(scope))?.reason||'相关功能兼容性待核对'),status:()=>({...state,enabled,settingError,busy,compatibility:window.__farmCompatibility?.status()}),check,approve,mount,paint,remove:()=>{removed=true;unsubscribe?.();controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',foreground);window.removeEventListener('storage',sync);unmount();delete window.__farmVersionGuard}};
  window.__farmCompatibility?.setEnabled?.(enabled);if(enabled)void check();else disabledState();
})();
