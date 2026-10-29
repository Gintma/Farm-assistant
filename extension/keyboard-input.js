/* Browser-dispatched automation input. Never changes game telemetry or combat methods. */
(() => {
  const states=new Map();let sequence=0;
  const codes={ArrowLeft:['ArrowLeft',37],ArrowRight:['ArrowRight',39],ArrowUp:['ArrowUp',38],ArrowDown:['ArrowDown',40],Space:[' ',32],KeyE:['e',69]};
  const call=(id,method,params={})=>chrome.debugger.sendCommand({tabId:id},method,params);
  function value(result){if(result?.exceptionDetails)throw Error('无法确认战斗输入状态');return result?.result?.value}
  function get(id){if(!states.has(id))states.set(id,{held:new Set(),queue:Promise.resolve(),timer:null,attached:false,epoch:0,failed:false});return states.get(id)}
  function serial(s,fn){const job=s.queue.catch(()=>{}).then(fn);s.queue=job.catch(()=>{});return job}
  async function key(id,code,down,valid=()=>true){
    const type=down?'keydown':'keyup';
    // Only our own manual-takeover handlers use this correlation. The event is
    // delivered unchanged to the game, with its browser-provided properties.
    const token='native-'+(++sequence);
    const accepted=value(await call(id,'Runtime.evaluate',{expression:'location.origin==="https://farmingseason.io"&&window.__farmBattleInput?.expect('+JSON.stringify(code)+','+JSON.stringify(type)+','+JSON.stringify(token)+')',returnByValue:true}));
    if(down&&(accepted!==true||!valid())){await call(id,'Runtime.evaluate',{expression:'window.__farmBattleInput?.consume('+JSON.stringify(token)+')',returnByValue:true}).catch(()=>{});throw Error('输入已停止或页面已变化')}
    await call(id,'Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key:codes[code][0],code,windowsVirtualKeyCode:codes[code][1],autoRepeat:false});
    const seen=value(await call(id,'Runtime.evaluate',{expression:'window.__farmBattleInput?.consume('+JSON.stringify(token)+')',returnByValue:true}));
    if(seen!==true)throw Error('浏览器键盘事件未送达游戏页，自动战斗已停止');
  }
  async function clear(id,s){
    clearTimeout(s.timer);s.timer=null;let failure;
    for(const code of [...s.held]){try{await key(id,code,false)}catch(e){failure=e}finally{s.held.delete(code)}}
    if(s.attached){s.attached=false;await FarmDebugger.release(id,'keyboard')}
    if(failure)throw failure;
  }
  async function send(tabId,keys,stop=false,sourceUrl=null){
    if(!Array.isArray(keys)||keys.length>6||new Set(keys).size!==keys.length||keys.some(k=>!Object.hasOwn(codes,k))||keys.includes('Space')&&keys.includes('KeyE'))throw Error('战斗输入格式无效');
    if(typeof stop!=='boolean'||stop&&keys.length)throw Error('战斗输入格式无效');
    const s=get(tabId);if(stop)s.epoch++;const epoch=s.epoch;return serial(s,async()=>{
      if(stop){await clear(tabId,s);s.failed=false;return {ok:true}}
      if(epoch!==s.epoch)return {ok:true};
      try{
        if(s.failed)throw Error('调试连接已断开，请重新开启自动战斗');
        const valid=()=>epoch===s.epoch&&!s.failed;
        const tab=await chrome.tabs.get(tabId);
        if(!tab.active||new URL(tab.url||sourceUrl).origin!=='https://farmingseason.io')throw Error('游戏标签页不可输入');
        await FarmDebugger.acquire(tabId,'keyboard');s.attached=true;
        const version=chrome.runtime.getManifest().version;
        const ready=value(await call(tabId,'Runtime.evaluate',{expression:'location.origin==="https://farmingseason.io"&&window.__farmLauncher?.status?.().version==='+JSON.stringify(version)+'&&window.__farmBattleInput?.prepare?.()===true',returnByValue:true}));
        if(!ready)throw Error('游戏暂停、页面隐藏或正在手动操作，已停止自动键盘输入');
        const wanted=new Set(keys.filter(k=>k.startsWith('Arrow')));
        for(const code of [...s.held])if(!wanted.has(code)){await key(tabId,code,false);s.held.delete(code)}
        for(const code of wanted)if(!s.held.has(code)){s.held.add(code);await key(tabId,code,true,valid)}
        for(const code of keys.filter(k=>!k.startsWith('Arrow'))){s.held.add(code);await key(tabId,code,true,valid);await key(tabId,code,false);s.held.delete(code)}
        clearTimeout(s.timer);s.timer=setTimeout(()=>{s.epoch++;void serial(s,()=>clear(tabId,s)).catch(()=>{})},400);
        return {ok:true};
      }catch(error){await clear(tabId,s).catch(()=>{});throw error}
    });
  }
  chrome.debugger.onDetach.addListener(source=>{const s=states.get(source.tabId);if(s){clearTimeout(s.timer);if(s.attached)s.failed=true;s.epoch++;s.attached=false;s.held.clear()}});
  chrome.tabs.onRemoved.addListener(id=>{const s=states.get(id);if(s)clearTimeout(s.timer);states.delete(id)});
  globalThis.FarmKeyboard={send};
})();
