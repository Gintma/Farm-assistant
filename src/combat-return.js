/* Return through the visible game button only after a confirmed result and idle time. */
(() => {
  window.__farmCombatReturn?.remove();
  let run=null,seen=false,cancelled=false,clicked=false,idleSince=null,lastInput=performance.now();
  let state={phase:'idle',message:'战斗结算后空闲5秒自动回村庄',remaining:null};
  const keys=new Set();let pointer=false,returnRoot=null,clickedAt=0;
  const visible=e=>!!e&&e.isConnected&&!e.hidden&&!!e.getClientRects().length&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
  const scene=()=>(window.__farmGame||window.temp1)?.scene?.scenes?.find(s=>s.sys?.settings?.key==='battle');
  function resetWait(message){idleSince=null;state={phase:'waiting',message,remaining:null}}
  function manual(e){
    if(!e.isTrusted)return;
    lastInput=performance.now();idleSince=null;
    if(e.type==='keydown'){keys.add(e.code);if(e.code==='Escape'&&run)cancelled=true}
    if(e.type==='keyup')keys.delete(e.code);
    if(e.type==='pointerdown')pointer=true;
    if(e.type==='pointerup'||e.type==='pointercancel')pointer=false;
  }
  function blur(){keys.clear();pointer=false}
  function visibility(){idleSince=null;lastInput=performance.now();if(document.hidden)blur()}
  const inputs=['keydown','keyup','pointerdown','pointerup','pointercancel','pointermove','wheel','input','change'];
  for(const type of inputs)window.addEventListener(type,manual,true);
  window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
  function tick(){
    if(clicked&&state.phase==='returning'){
      if(!visible(returnRoot)){state={phase:'returned',message:'已回村庄，农务按原开关继续',remaining:null};window.__farmActivity?.add('battle',state.message)}
      else if(performance.now()-clickedAt>=3000)state={phase:'error',message:'回村庄未生效，请手动返回',remaining:null};
      return;
    }
    const s=scene();
    if(!s||s.run!==run){run=s?.run??null;seen=false;cancelled=false;clicked=false;idleSince=null;state={phase:'idle',message:'战斗结算后空闲5秒自动回村庄',remaining:null}}
    if(!s||!run)return;
    if(run.active){if(!s.tut)seen=true;idleSince=null;return}
    if(!seen||s.tut||s.mode!=='over')return;
    if(cancelled){state={phase:'cancelled',message:'已取消本局自动回村庄，请手动返回',remaining:null};return}
    if(clicked)return;
    const root=document.getElementById('battle-ui');
    if(!visible(root)){idleSince=null;return}
    if(window.__farmManualCapture||window.__farmVersionGuard?.isBlocked()||window.__farmVerification?.isBlocked?.()||document.hidden){resetWait('等待页面可见、版本检查和验证完成');return}
    if(keys.size||pointer||document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')||[...document.querySelectorAll('#modal,[role="dialog"],.cf-turnstile,iframe[src*="challenges.cloudflare.com"]')].some(visible)){resetWait('手动操作或弹窗中，稍后重新计时');return}
    const summary=root.querySelector('.bui-screen .bstats');
    const home=root.querySelector('.bui-screen button[data-action="go-home"]');
    // The game renders these only after its battle/end response supplies the
    // leaderboard/cup result. A summary by itself appears before that response.
    const confirmed=['rank','cuprank'].some(k=>{const e=root.querySelector('[data-b="'+k+'"]');return visible(e)&&!!e.textContent.trim()});
    if(!visible(summary)||!visible(home)||home.disabled||!confirmed){resetWait('等待游戏收到服务器结算结果，暂不自动返回');return}
    const now=performance.now();if(idleSince===null)idleSince=Math.max(now,lastInput);
    const remaining=Math.max(0,Math.ceil((5000-(now-idleSince))/1000));
    state={phase:'countdown',message:'无操作 '+remaining+' 秒后回村庄',remaining};
    if(remaining)return;
    clicked=true;window.__farmCombat?.set('enabled',false);window.__farmBattleInput?.release();
    try{
      returnRoot=root;clickedAt=performance.now();state={phase:'returning',message:'正在回村庄',remaining:null};
      home.click();
    }catch{state={phase:'error',message:'回村庄失败，请手动返回',remaining:null}}
  }
  const timer=setInterval(tick,100);
  window.__farmCombatReturn={status:()=>({...state}),remove:()=>{
    clearInterval(timer);for(const type of inputs)window.removeEventListener(type,manual,true);
    window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);
    delete window.__farmCombatReturn;
  }};
})();
