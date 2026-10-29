/* Read combat snapshots and drive original page-local input; never replace combat methods. */
(() => {
  window.__farmCombat?.remove();
  const mortarTracks=new Map(),motion=new WeakMap(),ids=new WeakMap();
  let lastScene=null,slimes=new Map(),splitZones=[],nextId=1,manualUntil=0;
  let options={enabled:false,skills:false,perks:false},state={phase:'idle',message:'请手动进入战斗后开启自动战斗',casts:0,dodges:0,choices:0,travelDodges:0,unsticks:0};
  try{localStorage.removeItem('farm-helper.combat-mode')}catch{}
  let rallyPoint=null,rallyWave=null;
  let previousDirection=[],directionAt=0,targetId=null,targetUntil=0,progress=null,escape=null,runRef=null;
  const skillAt={storm:0,dodge:0},manualKeys=new Set();
  let manualPointer=false;
  const visible=e=>!!e&&!e.hidden&&!!e.getClientRects().length&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
  function release(){window.__farmBattleInput?.release();previousDirection=[];directionAt=0;targetId=null;targetUntil=0;progress=null;escape=null}
  function wait(message){release();state={...state,phase:'waiting',message}}
  function set(key,value){
    if(key!=='enabled')return;
    const enabled=!!value;options={...options,enabled,skills:enabled,perks:enabled};
    if(!enabled){release();state={...state,phase:'idle',message:'自动战斗已关闭'}}
  }
  function manual(e){
    if(!e.isTrusted||window.__farmBattleInput?.owns?.(e))return;
    if(e.type==='keydown'&&e.code==='Escape'){set('enabled',false);return}
    if(['keydown','pointerdown'].includes(e.type)&&e.target?.closest?.('#farm-compact-controls'))return;
    if(e.type==='keyup'&&!manualKeys.has(e.code))return;
    if(['pointerup','pointercancel'].includes(e.type)&&!manualPointer)return;
    if(e.type==='keydown')manualKeys.add(e.code);
    if(e.type==='keyup')manualKeys.delete(e.code);
    if(e.type==='pointerdown')manualPointer=true;
    if(e.type==='pointerup'||e.type==='pointercancel')manualPointer=false;
    if(e.type==='pointerdown'||e.type==='keydown'){manualUntil=Date.now()+2000;wait('手动操作优先，稍后继续')}
    if(['keyup','pointerup','pointercancel'].includes(e.type))manualUntil=Date.now()+2000;
  }
  // The game resets Phaser keys on blur. Release our ownership too so the
  // next visible tick can press them again, without pausing automation.
  function blur(){manualKeys.clear();manualPointer=false;release()}
  function hide(){blur();wait('页面已隐藏，暂停自动战斗')}
  function visibility(){if(document.hidden)hide()}
  window.addEventListener('keydown',manual,true);window.addEventListener('keyup',manual,true);
  window.addEventListener('pointerdown',manual,true);window.addEventListener('pointerup',manual,true);window.addEventListener('pointercancel',manual,true);window.addEventListener('blur',blur);window.addEventListener('pagehide',hide);
  document.addEventListener('visibilitychange',visibility);
  function blocked(){
    if(window.__farmManualCapture)return '手动测试记录中，自动战斗已暂停';
    if(window.__farmVersionGuard?.isBlocked('battle'))return '游戏版本保护：自动战斗已暂停';
    if(document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]'))return '正在编辑设置，暂停战斗输入';
    if(document.hidden)return '页面已隐藏，暂停自动战斗';
    if(Date.now()<manualUntil||manualKeys.size||manualPointer)return '手动操作优先，稍后继续';
    if(window.__farmVerification?.isBlocked?.()||[...document.querySelectorAll('#modal,[role="dialog"],.cf-turnstile,iframe[src*="challenges.cloudflare.com"]')].some(visible))return '弹窗或验证打开，暂停自动战斗';
    const root=document.getElementById('battle-ui');
    if(!visible(root)||!visible(document.querySelector('#game canvas')))return '等待手动进入战斗';
    if(visible(root.querySelector('.bui-screen'))||!visible(root.querySelector('.bui-top')))return '等待升级选择、继续或结算';
    return '';
  }
  function observe(){
    if(!options.enabled)return;
    try{
      const reason=blocked();if(reason){wait(reason);return}
      const started=performance.now();
      const s=(window.__farmGame||window.temp1)?.scene?.scenes?.find(s=>s.sys?.settings?.key==='battle'),h=s?.hero;
      if(!h||!Number.isFinite(h.x)||!Number.isFinite(h.y))throw Error('战斗状态尚未就绪');
      if(s.mode!=='play'||s.paused||!(s.run?.active||s.tut)||h.dead){wait('战斗暂停或已结束');return}
      if(lastScene!==s||runRef!==s.run){release();mortarTracks.clear();slimes.clear();splitZones=[];lastScene=s;runRef=s.run;rallyPoint=null;rallyWave=null;skillAt.storm=0;skillAt.dodge=0;state={...state,casts:0,dodges:0,travelDodges:0,unsticks:0}}
      const now=Date.now();
      for(const [e,p]of slimes)if(!e.alive){splitZones.push({x:p.x,y:p.y,radius:30,kind:'split',until:now+700});slimes.delete(e)}
      splitZones=splitZones.filter(z=>z.until>now);
      for(const e of s.enemies||[])if(e.alive&&['slime','slimeb'].includes(e.rule?.id))slimes.set(e,{x:e.x,y:e.y});
      for(const o of s.children?.list||[])if(o.active&&o.texture?.key==='b_mortar'&&!mortarTracks.has(o))mortarTracks.set(o,{x:o.x,y:o.y+6,at:now});
      for(const [o,m]of mortarTracks)if(now-m.at>1250)mortarTracks.delete(o);
      const frame={at:Date.now(),mode:s.mode,wave:s.wave,phase:s.director?.phase,active:!!s.run?.active||!!s.tut,paused:!!s.paused,tutorial:s.tut?{step:s.tut.step}:null,
        player:{x:h.x,y:h.y,dead:!!h.dead,hp:h.hp,maxHp:h.stats?.maxHp,speed:h.stats?.speed,reach:h.stats?.reach,damage:h.stats?.damage,attackEvery:h.stats?.attackEvery,stormRadius:h.stats?.stormRadius,attacking:h.atkT>=0,attackCd:h.atkCd,busy:h.dodgeT>=0||h.stormT>=0,dodgeT:h.dodgeT,stormT:h.stormT,dodgeV:{x:h.dodgeV?.x||0,y:h.dodgeV?.y||0}},
        enemies:(s.enemies||[]).filter(e=>e.alive).slice(0,160).map(e=>{
          const old=motion.get(e),dt=old?(now-old.at)/1000:0;
          const vx=dt>.01&&dt<.3?(e.x-old.x)/dt:0,vy=dt>.01&&dt<.3?(e.y-old.y)/dt:0;
          motion.set(e,{x:e.x,y:e.y,at:now});
          if(!ids.has(e))ids.set(e,nextId++);
          return {id:ids.get(e),hp:e.hp,maxHp:e.maxHp,x:e.x,y:e.y,vx,vy,speed:e.speed,name:e.rule?.id||'unknown',brain:e.rule?.brain||'unknown',radius:e.rule?.radius||12,state:e.state,t:e.t,hitDone:!!e.hitDone,phased:!!e.phased,hittable:!!e.hittable,boss:!!e.isBoss,nextMove:e.nextMove,chargeDir:{x:e.chargeDir?.x||0,y:e.chargeDir?.y||0},lock:{x:e.lock?.x||0,y:e.lock?.y||0}}}),
        projectiles:(s.projs||[]).filter(p=>p.sprite?.active).slice(0,200).map(p=>({x:p.sprite.x,y:p.sprite.y,vx:p.vx,vy:p.vy,kind:p.kind,from:p.from,boss:['minotaur','ratking'].includes(p.from)||(s.enemies||[]).some(e=>e.isBoss&&e.rule?.id===p.from)})),
        hazards:[...mortarTracks.values()].slice(0,30).map(m=>({x:m.x,y:m.y,radius:18,kind:'mortar',eta:Math.max(0,(1080-now+m.at)/1000)})).concat(splitZones.map(z=>({...z,eta:.2}))),
        bounds:{x0:42,y0:164,x1:694,y1:462}};
      const root=document.getElementById('battle-ui');
      const ready={storm:!!root.querySelector('.skill.storm')?.classList.contains('ready')&&now-skillAt.storm>=120,dodge:!!root.querySelector('.skill.dodge')?.classList.contains('ready')&&(!Number.isFinite(h.dodgeCd)||h.dodgeCd<=0)&&now-skillAt.dodge>=120};
      if(escape&&now>=escape.until)escape=null;
      if(previousDirection.length&&h.dodgeT<0&&h.stormT<0&&h.atkT<0&&!(h.hurtT>=0)){
        if(!progress)progress={x:h.x,y:h.y,at:now,keys:[...previousDirection]};
        else if(now-progress.at>=750){
          if(!escape&&Math.hypot(h.x-progress.x,h.y-progress.y)<3){
            escape={keys:progress.keys,until:now+1200};state.unsticks++;window.__farmBattleInput.release();targetId=null;targetUntil=0;
          }
          progress={x:h.x,y:h.y,at:now,keys:[...previousDirection]};
        }
      }else progress=null;
      if(rallyWave!==s.wave){rallyPoint=null;rallyWave=s.wave}
      if(!rallyPoint||!window.FarmBattlePlanner.safeRally(frame,rallyPoint))rallyPoint=window.FarmBattlePlanner.pickRally(frame);
      const action=window.FarmBattlePlanner.plan(frame,{skills:true,ready,previousDirection,directionAgeMs:now-directionAt,preferredTarget:now<targetUntil?targetId:null,stuck:escape,rallyPoint});
      const direction=action.keys.filter(k=>k.startsWith('Arrow'));
      if(direction.join()!==previousDirection.join()){previousDirection=direction;directionAt=now}
      if(action.targetId!==targetId){targetId=action.targetId;targetUntil=now+600}
      const result=window.__farmBattleInput.apply(s,action);
      if(action.keys.includes('KeyE'))skillAt.storm=now;
      if(action.keys.includes('Space'))skillAt.dodge=now;
      const seconds=Number.isFinite(s.run?.seconds)?s.run.seconds:0,kills=Number.isFinite(s.run?.kills)?s.run.kills:0;
      state={...state,phase:'running',message:action.message,target:action.target||'',enemies:frame.enemies.length,entering:frame.enemies.filter(e=>e.state==='enter').length,hiddenEnemies:frame.enemies.filter(e=>e.phased||e.state==='appear').length,attackable:frame.enemies.filter(e=>e.hittable&&e.state!=='enter').length,projectiles:frame.projectiles.length,recognized:true,frameMs:Math.round(performance.now()-started),casts:state.casts+result.casts,dodges:state.dodges+result.dodges,travelDodges:state.travelDodges+(result.travelDodges??(action.intent==='travel'?result.dodges:0)),intent:action.intent,riskLevel:action.riskLevel,killsPerMinute:seconds>=15?Math.round(kills*60/seconds):null,hits:s.run?.hits??0,threats:action.threats||0,hp:h.hp,wave:s.wave};
    }catch(error){set('enabled',false);state={...state,phase:'error',message:error.message}}
  }
  // Match the game's exported stats.sig.keys without writing its telemetry.
  function keyCount(){
    const scene=(window.__farmGame||window.temp1)?.scene?.scenes?.find(s=>s.sys?.settings?.key==='battle');
    const downs=scene?.run?.sig?.kd;
    return scene?.mode!=='lobby'&&Array.isArray(downs)?downs.length:null;
  }
  const timer=setInterval(observe,60);
  window.__farmCombat={set,fail:message=>{set('enabled',false);state={...state,phase:'error',message}},status:()=>({...options,...state,keyCount:keyCount(),inputTransport:window.__farmBattleInput?.status?.().transport,goldGoal:window.__farmCombatGoal?.status?.(),manualPaused:Date.now()<manualUntil||manualKeys.size>0||manualPointer,choices:window.__farmCombatPerks?.status?.().choices??state.choices,perkMessage:window.__farmCombatPerks?.status?.().message,selecting:options.enabled&&window.__farmCombatPerks?.status?.().waiting}),remove:()=>{
    set('enabled',false);clearInterval(timer);mortarTracks.clear();window.__farmCombatPerks?.remove();
    window.removeEventListener('keydown',manual,true);window.removeEventListener('keyup',manual,true);window.removeEventListener('pointerdown',manual,true);window.removeEventListener('pointerup',manual,true);window.removeEventListener('pointercancel',manual,true);window.removeEventListener('blur',blur);window.removeEventListener('pagehide',hide);document.removeEventListener('visibilitychange',visibility);
    window.__farmBattleInput?.remove();delete window.__farmCombat;
  }};
})();
