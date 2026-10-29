/* Per-run loot target. Read original state; leave through the game's original endRun. */
(() => {
  window.__farmCombatGoal?.remove();
  let quota=null,run=null,scene=null,target=null,manualTarget=null,attempted=false,triggered=false;
  let earned=0,message='等待读取今日战斗额度',removed=false,busy=false,controller=null,lastTry=-Infinity,ui=null;
  const valid=n=>Number.isSafeInteger(n)&&n>=0;
  const gameScene=()=>(window.__farmGame||window.temp1)?.scene?.scenes?.find(s=>s.sys?.settings?.key==='battle');
  const visible=e=>!!e&&!e.hidden&&!!e.getClientRects().length&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
  const gain=r=>valid(r?.loot)&&Number.isFinite(r?.pending)&&r.pending>=0?r.loot+Math.floor(r.pending):null;
  function setQuota(cap,total,source,forRun=null){
    if(!valid(cap)||cap<=0||!valid(total))return false;
    quota={cap,total,left:Math.max(0,cap-total),source,at:Date.now(),consumed:forRun};return true;
  }
  function readDisplay(s){
    if(!s||s.tut)return;
    const root=document.getElementById('battle-ui');if(!visible(root))return;
    const active=!!s.run?.active;
    const el=root.querySelector(active?'.bui-loot small':s.mode==='lobby'?'.bloot .row span':'.no-quota');
    const m=el?.textContent?.match(/([\d,，]+)\s*\/\s*([\d,，]+)/);if(!m)return;
    let total=Number(m[1].replace(/[,，]/g,'')),cap=Number(m[2].replace(/[,，]/g,''));
    if(active){const current=gain(s.run);if(current===null)return;total-=current}
    setQuota(cap,total,active?'游戏战斗面板':'游戏大厅面板',active?s.run:null);
  }
  function blocked(){
    if(window.__farmManualCapture||window.__farmVersionGuard?.isBlocked('battle')||window.__farmVerification?.isBlocked?.())return true;
    if(document.hidden)return true;
    if(document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]'))return true;
    if(window.__farmCombat?.status?.().manualPaused)return true;
    return [...document.querySelectorAll('#modal,[role="dialog"],.cf-turnstile,iframe[src*="challenges.cloudflare.com"]')].some(visible);
  }
  function sync(){
    const s=gameScene();
    if(s!==scene||s?.run!==run){
      scene=s;run=s?.run;target=null;attempted=false;triggered=false;earned=0;
      if(s?.run?.active)lastTry=-Infinity;
    }
    readDisplay(s);
    const amount=gain(run);if(amount!==null)earned=amount;
    if(!run?.active){if(s?.mode==='lobby')earned=0;target=manualTarget??(quota&&Date.now()-quota.at<60000?quota.left:null);return}
    if(manualTarget!==null)target=manualTarget;
    else if(target===null&&quota&&Date.now()-quota.at<60000&&(!quota.consumed||quota.consumed===run)){
      target=quota.left;quota.consumed=run;
    }
  }
  async function refresh(){
    if(removed||busy||blocked())return;
    const s=gameScene(),root=document.getElementById('battle-ui');
    if(!s||s.tut||!visible(root)||Date.now()-lastTry<15000)return;
    if(s.run?.active&&target!==null)return;
    if(!s.run?.active&&quota&&Date.now()-quota.at<30000)return;
    busy=true;lastTry=Date.now();controller=new AbortController();const requestedRun=s.run;
    const timeout=setTimeout(()=>controller?.abort(),8000);
    try{
      const response=await fetch('/api/farm',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('战斗额度读取失败');
      const d=await response.json();
      if(removed||s!==gameScene()||requestedRun!==s.run)return;
      if(!d.farm||d.owner!==d.farm.owner||d.access?.open!==true||!Number.isFinite(d.now)||!Number.isFinite(d.farm.today?.battleEarned))throw Error('无法确认本人战斗额度');
      const battle=window.__farmEarnings?.model(d,d.now)?.battle;
      if(!battle||!setQuota(battle.cap,battle.earned,'账号今日战斗额度',s.run?.active?s.run:null))throw Error('等待有效战斗额度');
      sync();
    }catch(e){if(!removed&&target===null)message=e.name==='AbortError'?'额度读取超时，可手动设置本局目标':e.message+'，可手动设置本局目标'}
    finally{clearTimeout(timeout);busy=false;controller=null;paint()}
  }
  function check(){
    if(removed)return;sync();
    if(!attempted&&target!==null)message='本局已获 '+earned+' / '+target+' 金币，达到后自动撤退结算';
    if(!attempted&&run?.active&&!scene.tut&&!scene.hero?.dead&&['play','perk'].includes(scene.mode)&&!(scene.mode==='play'&&scene.paused)&&!blocked()&&window.__farmCombat?.status?.().enabled&&target!==null&&gain(run)!==null&&earned>=target){
      attempted=true;window.__farmCombat.set('enabled',false);window.__farmBattleInput?.release();
      try{
        if(typeof scene.endRun!=='function')throw Error('游戏撤退入口不可用，请手动结束本局');
        scene.endRun(false);if(run.active)throw Error('撤退未生效，已关闭自动战斗，请手动结束本局');
        triggered=true;message='本局目标已达成，已撤退，等待游戏完成结算';
        window.__farmActivity?.add('battle',message+'（'+earned+' / '+target+'）');
      }catch(e){message=e.message}
    }
    paint();void refresh();
  }
  function setTarget(value){
    if(value===''||value===null||value===undefined||typeof value==='string'&&!value.trim())return false;
    const n=Number(value);if(!valid(n))return false;
    manualTarget=n;sync();paint();return true;
  }
  function useDailyDefault(){manualTarget=null;target=null;sync();lastTry=-Infinity;paint();void refresh()}
  function status(){return {target,earned,remaining:target===null?null:Math.max(0,target-earned),mode:manualTarget===null?'daily-remaining':'manual',triggered,attempted,message,cap:quota?.cap??null,dailyBeforeRun:quota?.total??null,source:quota?.source||''}}
  function paint(){
    if(!ui)return;
    if(!ui.dirty&&document.activeElement!==ui.input)ui.input.value=target===null?'':String(target);
    ui.input.placeholder=target===null?'读取额度中…':'';
    ui.progress.textContent=message;
    ui.source.textContent=manualTarget===null?'默认：今日剩余战斗额度':'已设置手动目标';
  }
  function mount(parent){
    const box=document.createElement('section'),label=document.createElement('label'),input=document.createElement('input'),actions=document.createElement('div'),apply=document.createElement('button'),reset=document.createElement('button'),progress=document.createElement('p'),source=document.createElement('p');
    box.style.cssText='margin:8px 0;font-size:11px';label.textContent='本局目标金币';input.type='number';input.min='0';input.step='1';input.setAttribute('aria-label','本局目标金币');input.style.cssText='box-sizing:border-box;width:100%;font:inherit;padding:5px;margin:5px 0';label.append(input);
    apply.type=reset.type='button';apply.textContent='应用';reset.textContent='恢复默认';actions.style.cssText='display:flex;gap:6px';actions.append(apply,reset);
    for(const button of [apply,reset])button.style.cssText='appearance:none;width:auto;min-width:64px;min-height:28px;padding:4px 10px;font:inherit;font-size:11px;line-height:1.5;color:#e6eee6;background:#243e2e;border:1px solid #63846b;border-radius:4px;cursor:pointer;text-shadow:none';
    apply.style.background='#365b43';
    progress.style.cssText=source.style.cssText='margin:5px 0;color:#bdd1c2;line-height:1.6';
    input.oninput=()=>{if(ui)ui.dirty=true};
    apply.onclick=()=>{if(setTarget(input.value)){ui.dirty=false;input.blur();apply.blur()}else progress.textContent='请输入大于或等于0的整数金币数'};
    reset.onclick=()=>{ui.dirty=false;useDailyDefault();input.blur();reset.blur()};
    box.append(label,actions,progress,source);parent.append(box);ui={box,input,progress,source,dirty:false};paint();
  }
  const timer=setInterval(check,100);
  window.__farmCombatGoal={setTarget,useDailyDefault,status,check,refresh,mount,remove:()=>{removed=true;clearInterval(timer);controller?.abort();ui?.box.remove();delete window.__farmCombatGoal}};
  check();
})();
