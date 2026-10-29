/* Browser keyboard automation. No direct key-state driving, skill calls or telemetry edits. */
(() => {
  window.__farmBattleInput?.remove();
  const allowed=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyE']);
  const names={ArrowLeft:'LEFT',ArrowRight:'RIGHT',ArrowUp:'UP',ArrowDown:'DOWN'};
  const pending=new Map(),expected=new Map(),observed=new Set(),owned=new WeakSet();
  let sequence=0,epoch=0,busy=false,desired=null,used=false,released=true,removed=false,lease=null,lastScene=null;
  let completed={casts:0,dodges:0,travelDodges:0};
  function owns(e){
    if(owned.has(e))return true;if(!e.isTrusted)return false;
    for(const [id,x]of expected){if(performance.now()>x.until){expected.delete(id);continue}if(x.code===e.code&&x.type===e.type){expected.delete(id);observed.add(id);owned.add(e);return true}}
    return false;
  }
  function expect(code,type,id){if(removed||!allowed.has(code)||!['keydown','keyup'].includes(type)||typeof id!=='string')return false;expected.set(id,{code,type,until:performance.now()+500});return true}
  function consume(id){expected.delete(id);const seen=observed.delete(id);return seen}
  function reply(e){
    if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='farm-input-result')return;
    const x=pending.get(e.data.id);if(!x)return;pending.delete(e.data.id);clearTimeout(x.timer);
    e.data.ok?x.resolve({paused:e.data.paused===true,message:e.data.message}):x.reject(Error(e.data.message||'自动键盘输入失败'));
  }
  function request(keys,stop=false){
    used=true;return new Promise((resolve,reject)=>{
      const id='keyboard-'+Date.now()+'-'+(++sequence),timer=setTimeout(()=>{pending.delete(id);reject(Error('浏览器输入连接超时，请重新开启助手'))},1500);
      pending.set(id,{resolve,reject,timer});
      try{window.postMessage({channel:'farm-input-request',id,keys,stop},location.origin)}catch(e){pending.delete(id);clearTimeout(timer);reject(e)}
    });
  }
  function fallback(){
    // Stop/fault cleanup only: clear stuck movement. This path never drives play or changes stats.
    try{lastScene?.input?.keyboard?.resetKeys?.()}catch{}
  }
  function release(){
    epoch++;desired=null;clearTimeout(lease);lease=null;expected.clear();observed.clear();completed={casts:0,dodges:0,travelDodges:0};
    if(!used||released)return Promise.resolve();released=true;fallback();
    return request([],true).catch(()=>{fallback()});
  }
  function prepare(){
    const s=lastScene,h=s?.hero,root=document.getElementById('battle-ui');
    const visible=e=>!!e&&!e.hidden&&!!e.getClientRects().length;
    if(removed||window.__farmManualCapture||window.__farmVersionGuard?.isBlocked('battle')||window.__farmVerification?.isBlocked?.()||!window.__farmCombat?.status?.().enabled||window.__farmCombat?.status?.().manualPaused||document.hidden||s?.mode!=='play'||s.paused||h?.dead||!(s.run?.active||s.tut)||!visible(root)||visible(root.querySelector('.bui-screen')))return false;
    if(document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]'))return false;
    if([...document.querySelectorAll('#modal,[role="dialog"],.cf-turnstile,iframe[src*="challenges.cloudflare.com"]')].some(visible))return false;
    const canvas=document.querySelector('#game canvas');if(!visible(canvas))return false;
    if(document.activeElement?.closest?.('#farm-compact-controls'))document.activeElement.blur();
    canvas.focus?.({preventScroll:true});return true;
  }
  async function pump(){
    if(busy||!desired||removed)return;
    const task=desired;desired=null;busy=true;const generation=epoch,s=task.scene;
    const before={dodges:s.run?.dodges||0,storm:s.hero.stormT};
    try{
      const result=await request(task.keys);
      if(!removed&&generation===epoch&&result.paused){window.__farmCombat?.pauseInput?.(result.message||'等待游戏恢复输入');return}
      if(!removed&&generation===epoch){const dodges=Math.max(0,(s.run?.dodges||0)-before.dodges);completed.dodges+=dodges;if(task.intent==='travel')completed.travelDodges+=dodges;if(task.keys.includes('KeyE')&&before.storm<0&&s.hero.stormT>=0)completed.casts++}
    }catch(error){
      if(!removed&&generation===epoch){fallback();window.__farmCombat?.fail?.(error.message)}
    }finally{busy=false;if(desired&&!removed)void pump()}
  }
  function apply(scene,action){
    if(removed||window.__farmManualCapture||window.__farmVersionGuard?.isBlocked('battle')||scene.mode!=='play'||scene.paused||scene.hero?.dead||!(scene.run?.active||scene.tut)){void release();return {casts:0,dodges:0,travelDodges:0}}
    const keys=action.keys;if(!Array.isArray(keys)||keys.some(k=>!allowed.has(k)))throw Error('游戏输入格式已变化');
    for(const code of keys.filter(k=>names[k]))if(typeof scene.keys?.[names[code]]?.isDown!=='boolean')throw Error('游戏键盘结构已变化，请关闭自动战斗');
    lastScene=scene;released=false;desired={scene,keys:[...keys],intent:action.intent};
    const result=completed;completed={casts:0,dodges:0,travelDodges:0};void pump();
    clearTimeout(lease);lease=setTimeout(()=>{void release()},350);return result;
  }
  window.addEventListener('message',reply);
  window.__farmBattleInput={apply,release,prepare,expect,consume,owns,status:()=>({transport:'browser-keyboard',busy,pending:pending.size}),remove:()=>{
    void release();removed=true;window.removeEventListener('message',reply);expected.clear();observed.clear();
    // Release was sent before removal; local movement is already cleared.
    for(const x of pending.values()){clearTimeout(x.timer);x.reject(Error('战斗输入已移除'))}pending.clear();delete window.__farmBattleInput;
  }};
})();
