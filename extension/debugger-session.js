/* Shared, tab-scoped debugger ownership. No input or game actions here. */
(() => {
  const sessions=new Map(),locks=new Map();
  function serial(id,fn){
    const run=(locks.get(id)||Promise.resolve()).catch(()=>{}).then(fn),tail=run.catch(()=>{});locks.set(id,tail);
    void tail.then(()=>{if(locks.get(id)===tail)locks.delete(id)});return run;
  }
  async function acquire(tabId,owner){return serial(tabId,async()=>{
    let s=sessions.get(tabId);if(s?.has(owner))return;
    if(!s){await chrome.debugger.attach({tabId},'1.3');s=new Set();sessions.set(tabId,s)}s.add(owner);
  })}
  async function release(tabId,owner){return serial(tabId,async()=>{
    const s=sessions.get(tabId);if(!s||!s.delete(owner)||s.size)return;
    sessions.delete(tabId);await chrome.debugger.detach({tabId}).catch(()=>{});
  })}
  async function recover(tabId){return serial(tabId,async()=>{if(!sessions.has(tabId))await chrome.debugger.detach({tabId}).catch(()=>{})})}
  chrome.debugger.onDetach.addListener(source=>sessions.delete(source.tabId));
  globalThis.FarmDebugger={acquire,release,recover};
})();
