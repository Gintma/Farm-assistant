/* Only this site's top-level game page requests startup. No game actions here. */
(() => {
  if(window.top!==window||location.origin!=='https://farmingseason.io')return;
  let attempts=0,finished=false,busy=false,timer;
  const observer=new MutationObserver(schedule);
  function stop(){finished=true;clearTimeout(timer);observer.disconnect();document.removeEventListener('visibilitychange',schedule)}
  function schedule(){if(!finished&&!busy&&!timer)timer=setTimeout(()=>{timer=null;void start()},1500)}
  async function start(){
    if(finished||busy||document.hidden)return;
    if(document.getElementById('farm-compact-controls')){stop();return}
    if(!document.querySelector('#game canvas')||!document.querySelector('#dock button[data-action="dock"]'))return;
    busy=true;
    try{
      const result=await chrome.runtime.sendMessage({operation:'auto-start'});
      if(result?.ok){stop();return}
    }catch{}
    finally{busy=false}
    if(++attempts<8)schedule();else stop();
  }
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',schedule);schedule();
})();

/* Narrow bridge: top-level same-origin page -> this extension's battle input only. */
(() => {
  if(window.top!==window||location.origin!=='https://farmingseason.io')return;
  window.addEventListener('message',async e=>{
    if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='farm-input-request')return;
    const {id,keys,stop=false}=e.data;if(typeof id!=='string'||id.length>80||!Array.isArray(keys)||keys.length>6)return;
    let result;try{result=await chrome.runtime.sendMessage({operation:'battle-input',keys,stop})}catch(error){result={ok:false,message:error.message}}
    window.postMessage({channel:'farm-input-result',id,ok:result?.ok===true,message:result?.message||''},location.origin);
  });
})();
