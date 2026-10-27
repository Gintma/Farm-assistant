/* Farming Season helper 1.20.2: original combat mechanics and unified controls. */
(() => {
  if(location.hostname!=='farmingseason.io')throw Error('请只在 Farming Season 游戏页启动');
  const temp1=window.__farmGame||window.temp1;
  if(!temp1?.scene?.scenes)throw Error('未找到游戏实例，请使用扩展启动');
  if(window.__farmLauncher?.status?.().version==='1.20.2')return '助手已开启，保留当前所有开关';
  const handoff={farm:window.__farmAutoFarm?.status?.(),automation:window.__farmAutomation?.status?.(),layout:window.__farmLayout?.status?.()};
  if(handoff.farm?.pending)throw Error('旧版农活尚未完成，请等队列完成后再次开启新版助手');
  window.__farmLauncher?.remove();
  // Migration only: undo legacy patches left on an already-open page, never reinstall them.
  window.__farmGoalStop?.remove();window.__farmStorm?.remove();window.__farmPerks?.remove();
  window.__farmDodge?.restore();window.__farmSeek?.restore();window.__farmInvincible?.restore();
  window.__farmHandoff=handoff;
  function cleanup(){
    window.__farmCombatReturn?.remove();window.__farmCombatGoal?.remove();window.__farmCombat?.remove();window.__farmEarnings?.remove();window.__farmVerification?.remove();window.__farmCompact?.remove();window.__farmActivity?.remove();window.__farmAutomation?.remove();window.__farmAutoFarm?.remove();window.__farmVersionGuard?.remove();
  }
  window.__farmLauncher={status:()=>({installed:true,version:'1.20.2',farmReady:!!window.__farmAutomation}),remove:()=>{cleanup();delete window.__farmLauncher}};
  try{
/* Pure planning over read-only snapshots. Inputs are regular direction/Space/E keys. */
(() => {
  const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}
  function threats(frame){
    const zones=[];
    for(const e of frame.enemies||[]){
      if(!finite(e)||e.state==='enter')continue;
      if(e.name==='minotaur'&&e.state==='charge'&&e.t<1.15){
        const d=e.chargeDir||{},length=Math.hypot(d.x||0,d.y||0);
        if(length>.1){const dx=d.x/length,dy=d.y/length,range=250*(1.15-Math.max(.7,e.t));zones.push({kind:'charge',a:{x:e.x,y:e.y},b:{x:e.x+dx*range,y:e.y+dy*range},radius:(e.radius||18)+12,eta:Math.max(0,.7-e.t),message:'侧移躲避牛头人冲锋'})}
      }
      if(e.brain==='ghost'&&e.state==='appear'&&finite(e.lock))zones.push({kind:'circle',x:e.lock.x,y:e.lock.y,radius:(e.radius||12)+25,eta:Math.max(0,.6-e.t),message:'避开幽灵即将显形的位置'});
      if(e.hitDone)continue;
      if(e.brain==='archer'&&e.state==='windup'&&finite(e.lock)){
        const dx=e.lock.x-e.x,dy=e.lock.y-(e.y-8),len=Math.hypot(dx,dy)||1,range=Math.min(190,len+50);
        zones.push({kind:'charge',a:{x:e.x,y:e.y-8},b:{x:e.x+dx/len*range,y:e.y-8+dy/len*range},radius:13,eta:Math.max(0,.74-e.t),message:'离开弓箭手瞄准线'});
      }
      if(e.name==='minotaur'&&e.state==='windup')zones.push({kind:'ellipse',x:e.x,y:e.y,rx:65,ry:42,eta:Math.max(0,.9-e.t),message:'远离牛头人砸地范围'});
      else if(e.boss&&!['minotaur','ratking'].includes(e.name)&&e.state==='windup')zones.push({kind:'circle',x:e.x,y:e.y,radius:85,eta:.3,message:'未知 Boss 蓄力，先远离'});
      else if(e.state==='fuse')zones.push({kind:'circle',x:e.x,y:e.y-4,radius:48,eta:Math.max(0,.65-e.t),source:'bomber',message:'撤离已点燃的炸弹兵'});
      else if(e.state==='windup'&&['melee','flyer','ghost'].includes(e.brain))zones.push({kind:'circle',x:e.x,y:e.y,radius:(e.radius||12)+23,source:'melee',eta:Math.max(0,(e.brain==='flyer'?.34:e.brain==='ghost'?.36:.4)-e.t),message:'躲避近战蓄力攻击'});
    }
    for(const h of frame.hazards||[])if(finite(h))zones.push({...h,source:h.kind,kind:'circle',radius:(h.radius||18)+10,eta:Number.isFinite(h.eta)?h.eta:.5,message:h.kind==='split'?'后撤避开史莱姆分裂':'避开鼠王炮击落点'});
    return zones;
  }
  function zoneMargin(p,z){
    if(z.kind==='charge')return segmentDistance(p,z.a,z.b)-z.radius;
    if(z.kind==='ellipse')return (Math.hypot((p.x-z.x)/z.rx,(p.y-z.y)/z.ry)-1)*Math.min(z.rx,z.ry);
    return Math.hypot(p.x-z.x,p.y-z.y)-z.radius;
  }
  // A continuous rectangle below the entrance, with enough space to step sideways/back.
  function rallyArea(bounds={x0:42,y0:164,x1:694,y1:462}){
    const mid=(bounds.x0+bounds.x1)/2;
    return {x0:Math.max(bounds.x0+24,mid-110),x1:Math.min(bounds.x1-24,mid+110),y0:bounds.y0+70,y1:Math.min(bounds.y1-24,bounds.y0+110)};
  }
  function safeRally(frame,p){
    if(!finite(p))return false;const a=rallyArea(frame.bounds);
    if(p.x<a.x0||p.x>a.x1||p.y<a.y0||p.y>a.y1)return false;
    if(threats(frame).some(z=>zoneMargin(p,z)<24))return false;
    if((frame.enemies||[]).some(e=>finite(e)&&distance(p,e)<(e.radius||12)+50))return false;
    return !(frame.projectiles||[]).some(q=>finite(q)&&segmentDistance(p,q,{x:q.x+(q.vx||0)*.7,y:q.y+(q.vy||0)*.7})<35);
  }
  function pickRally(frame,random=Math.random){
    const a=rallyArea(frame.bounds);for(let i=0;i<24;i++){
      const p={x:a.x0+random()*(a.x1-a.x0),y:a.y0+random()*(a.y1-a.y0)};
      if(safeRally(frame,p))return p;
    }return null; // No safe candidate: ordinary hazard avoidance still runs; retry next observation.
  }
  function plan(frame,{skills=true,ready={},previousDirection=[],directionAgeMs=Infinity,preferredTarget=null,stuck=null,rallyPoint=null}={}){
    const h=frame?.player;
    if(!finite(h)||h.dead||!Number.isFinite(h.hp)||h.hp<=0)return {keys:[],message:'角色已死亡或状态不可用'};
    if(h.attacking||h.busy)stuck=null;
    const speed=Number.isFinite(h.speed)?h.speed:92,reach=Number.isFinite(h.reach)?h.reach:30;
    if(frame.tutorial?.step===0)return {keys:[h.x<600?'ArrowRight':'ArrowLeft'],message:'教程：练习方向键移动'};
    if(frame.tutorial?.step===2)return {keys:skills&&ready.dodge&&!h.busy?['ArrowRight','Space']:[],message:'教程：等待并练习闪避'};
    const enemies=(frame.enemies||[]).filter(finite);
    const hpRatio=Number.isFinite(h.maxHp)&&h.maxHp>0?Math.max(0,Math.min(1,h.hp/h.maxHp)):.5;
    const caution=Math.max(0,Math.min(1,(.85-hpRatio)/.6));
    const riskScale=1.3+caution*.6,riskLevel='survive';
    const projectiles=(frame.projectiles||[]).filter(p=>finite(p)&&Number.isFinite(p.vx)&&Number.isFinite(p.vy));
    const zones=threats(frame);
    const bounds=frame.bounds||{x0:42,y0:164,x1:694,y1:462};
    const damage=Number.isFinite(h.damage)&&h.damage>0?h.damage:3;
    const attackEvery=Number.isFinite(h.attackEvery)&&h.attackEvery>0?h.attackEvery:.42;
    const cleanup=frame.phase==='clear';
    const targets=enemies.filter(e=>e.hittable!==false&&e.state!=='fuse'&&e.state!=='enter'&&(!Number.isFinite(e.hp)||e.hp>0)).map(e=>{
      const d=distance(h,e),knownHp=Number.isFinite(e.hp)&&e.hp>0,hits=knownHp?Math.ceil(e.hp/damage):3;
      const gap=Math.max(0,d-reach-(e.radius||12)+4),finish=knownHp&&hits<=2&&gap<55;
      const travel=gap/Math.max(1,speed),fight=Math.min(6,hits)*attackEvery;
      const score=travel*45+fight*16-(finish?38:0)-(!cleanup&&['archer','caster'].includes(e.brain)?10:0);
      return {...e,d,hits,knownHp,finish,score};
    }).sort((a,b)=>a.score-b.score);
    const bestTarget=targets[0],preferred=preferredTarget==null?null:targets.find(e=>e.id===preferredTarget);
    const attackTarget=preferred&&bestTarget&&preferred.score<=bestTarget.score+10?preferred:bestTarget;
    const area=rallyArea(bounds),gatePoint=finite(rallyPoint)?rallyPoint:{x:(area.x0+area.x1)/2,y:(area.y0+area.y1)/2};
    const entrants=enemies.filter(e=>e.state==='enter').map(e=>({...e,x:gatePoint.x,y:gatePoint.y,d:distance(h,gatePoint),positionOnly:true}));
    const rally=!enemies.length&&['clear','break'].includes(frame.phase)?{...gatePoint,name:'gate',id:null,positionOnly:true,rally:true,d:distance(h,gatePoint)}:null;
    const target=attackTarget||entrants[0]||rally;
    const nearbyDanger=zones.filter(z=>zoneMargin(h,z)<(z.source==='bomber'?24:z.alert??12));
    const incoming=projectiles.filter(p=>{
      const dx=h.x-p.x,dy=h.y-6-p.y,v2=p.vx*p.vx+p.vy*p.vy;if(!v2)return false;
      const t=(dx*p.vx+dy*p.vy)/v2;
      return t>=0&&t<.65&&Math.hypot(p.x+p.vx*t-h.x,p.y+p.vy*t-(h.y-6))<18;
    });
    const rushing=enemies.some(e=>e.state!=='enter'&&['baby','babyb'].includes(e.name)&&distance(h,e)<(e.radius||5)+38);
    const crowded=enemies.filter(e=>e.state!=='enter'&&distance(h,e)<(e.radius||12)+38).length>=3;
    const danger=nearbyDanger.length>0||incoming.length>0||rushing||crowded;
    const babyOnly=rushing&&!incoming.length&&!crowded&&!nearbyDanger.some(z=>z.source!=='split');
    // Auto attacks can begin on the next game frame and slow walking immediately.
    const mayAttack=targets.some(e=>e.d<=reach*1.3+(e.radius||12)+6)&&(!Number.isFinite(h.attackCd)||h.attackCd<=.12);
    const moveSpeed=speed*(h.stormT>=0 ? .6 : (h.attacking||mayAttack) ? .55 : 1);
    const clamp=p=>({x:Math.max(bounds.x0,Math.min(bounds.x1,p.x)),y:Math.max(bounds.y0,Math.min(bounds.y1,p.y))});
    if(!target&&!danger)return {keys:[],intent:enemies.some(e=>e.phased||e.state==='appear')?'track':'idle',message:enemies.some(e=>e.phased||e.state==='appear')?'已跟踪隐身怪，等待进入可攻击状态':'等待敌人',threats:zones.length};
    const hold=target&&!target.positionOnly&&!danger&&target.d<=reach+(target.radius||12)-4&&!stuck;
    const travelReady=skills&&ready.dodge&&!h.busy&&!h.attacking&&!danger&&target&&(!target.positionOnly||target.rally)&&target.d>Math.max(110,reach+(target.radius||12)+80)&&!stuck;
    function travelSafe(vx,vy){
      if(!travelReady||(!vx&&!vy))return false;
      const end={x:h.x+vx*64,y:h.y+vy*64};
      if(end.x<bounds.x0+6||end.x>bounds.x1-6||end.y<bounds.y0+6||end.y>bounds.y1-6)return false;
      if(distance(end,target)<reach+(target.radius||12)+12||distance(end,target)>=target.d-20)return false;
      for(const e of enemies){
        if(e.boss&&distance(h,e)<200)return false;
        if(distance(h,e)<(e.radius||12)+55)return false;
        const future={x:e.x+(e.vx||0)*.24,y:e.y+(e.vy||0)*.24};
        if(Math.min(segmentDistance(e,h,end),segmentDistance(future,h,end))<(e.radius||12)+24)return false;
      }
      for(const q of projectiles){
        if(distance(h,q)<240)return false;
        const future={x:q.x+q.vx*.6,y:q.y+q.vy*.6};
        if(segmentDistance(q,h,end)<30||segmentDistance(future,h,end)<30)return false;
      }
      for(const z of zones)for(const d of [0,16,32,48,64])if(zoneMargin({x:h.x+vx*d,y:h.y+vy*d},z)<24)return false;
      return true;
    }
    const directions=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2],[-Math.SQRT1_2,Math.SQRT1_2],[-Math.SQRT1_2,-Math.SQRT1_2]];
    let best=null;const candidates=[];
    for(const [vx,vy]of directions)for(const dodge of ([false,...(skills&&ready.dodge&&!h.busy&&(danger||travelSafe(vx,vy))&&(vx||vy)?[true]:[])])){
      const rawPosition=t=>{
        if(h.dodgeT>=0&&finite(h.dodgeV)){
          const active=Math.min(t,Math.max(0,.24-h.dodgeT)),after=Math.max(0,t-active);
          return {x:h.x+h.dodgeV.x*active+vx*moveSpeed*after,y:h.y+h.dodgeV.y*active+vy*moveSpeed*after};
        }
        const travel=dodge?64*Math.min(1,t/.24)+moveSpeed*Math.max(0,t-.24):moveSpeed*t;
        return {x:h.x+vx*travel,y:h.y+vy*travel};
      };
      const position=t=>clamp(rawPosition(t));
      let cost=dodge?18:0,safety=0;const risk=value=>{cost+=value;safety+=value};
      if(hold&&(!vx&&!vy))cost-=12;
      if(target?.rally&&target.d<=8&&!danger&&!vx&&!vy)cost-=15;
      if(stuck&&!danger){
        const sx=Number(stuck.keys?.includes('ArrowRight'))-Number(stuck.keys?.includes('ArrowLeft'));
        const sy=Number(stuck.keys?.includes('ArrowDown'))-Number(stuck.keys?.includes('ArrowUp'));
        const dot=(vx*sx+vy*sy)/(Math.hypot(sx,sy)||1);
        if(dot>.7)cost+=90;
        if(!vx&&!vy&&target&&target.d>reach+(target.radius||12))cost+=25;
      }
      // Small direction hysteresis only in calm situations; hazards always take priority.
      if(!danger&&previousDirection.length&&directionAgeMs<240){
        const px=Number(previousDirection.includes('ArrowRight'))-Number(previousDirection.includes('ArrowLeft'));
        const py=Number(previousDirection.includes('ArrowDown'))-Number(previousDirection.includes('ArrowUp'));
        const len=Math.hypot(px,py)||1;
        cost+=(Math.abs(vx-px/len)+Math.abs(vy-py/len))*5*(1-Math.max(0,directionAgeMs)/240);
      }
      for(const t of [.12,.25,.45]){
        const p=position(t);
        // Do not escape an entrant's landing point by retreating further into its spawn lane.
        if(entrants.length&&Math.abs(p.x-(bounds.x0+bounds.x1)/2)<58&&p.y<bounds.y0+70)risk((bounds.y0+70-p.y)*6);
        // Predict the game's actual wall clamp, without an extra forbidden edge strip.
        cost+=distance(p,rawPosition(t))*.04;
        for(const e of enemies){
          if(e.state==='enter'){
            // Reserve space for the transition to active combat at the landing point.
            const landing=finite(e.lock)?e.lock:e;
            risk(Math.max(0,(e.radius||12)+26-distance(p,landing))*18);continue;
          }
          const chase=['runner','hopper'].includes(e.brain)||['chase','move'].includes(e.state);
          const dx=h.x-e.x,dy=h.y-e.y,len=Math.hypot(dx,dy)||1;
          const enemySpeed=Number.isFinite(e.speed)?e.speed*(e.brain==='hopper'?1.8:1):0;
          const future=chase?{x:e.x+dx/len*Math.min(len,enemySpeed*t),y:e.y+dy/len*Math.min(len,enemySpeed*t)}:{x:e.x+(e.vx||0)*t,y:e.y+(e.vy||0)*t};
          const baby=['baby','babyb'].includes(e.name);
          const safe=(e.radius||12)+(baby?14:14+6*caution);
          // Compare simultaneous positions. Including the initial overlap makes every escape
          // look equally unsafe and used to spend dodge even when walking was sufficient.
          const margin=distance(p,future);
          if(!(dodge&&t<.24))risk(Math.max(0,safe-margin)*(baby?30:18)*riskScale);

        }
        for(const q of projectiles){
          const end={x:q.x+q.vx*t,y:q.y+q.vy*t};
          const margin=distance({x:p.x,y:p.y-6},end)-(q.kind==='fireball'?15:13);
          if(!(dodge&&t<.24))risk(Math.max(0,12-margin)*18*riskScale);
        }
      }
      // Leave the firing line rather than rolling along an incoming projectile's path.
      for(const q of incoming){
        const end={x:q.x+q.vx*.8,y:q.y+q.vy*.8};
        const p=position(.45);p.y-=6;
        risk(Math.max(0,24-segmentDistance(p,q,end))*3*riskScale);
      }
      for(const z of zones){
        const t=z.source==='bomber'?z.eta:Math.min(.65,Math.max(.15,z.eta)),p=position(t),margin=zoneMargin(p,z);
        if(z.source==='bomber'){
          // Do not assume an early dodge still protects when the fuse actually expires.
          const protectedAtBlast=(dodge&&z.eta<.22)||(h.dodgeT>=0&&z.eta<Math.max(0,.22-h.dodgeT));
          risk(Math.max(0,16-margin)*(protectedAtBlast?3:35)*riskScale);
          if(margin<0&&!protectedAtBlast)risk(2500*riskScale);
        }else if(!(dodge&&z.eta<.24&&z.kind!=='charge'))risk(Math.max(0,(z.margin??15)-margin)*26*(z.weight??1)*riskScale);
      }
      if(target){
        const p=position(.3),d=distance(p,target),desired=target.positionOnly?8:Math.max(8,reach+(target.radius||12)-6);
        // Approach live entrants within the legal map; ordinary attacks still wait for their active state.
        cost+=(target.positionOnly?Math.max(0,d-desired):Math.abs(d-desired))*.85;if(d>desired)cost+=d*.1;
      }
      if(!target)cost+=Math.hypot(vx,vy);
      candidates.push({vx,vy,dodge,cost,safety});
    }
    const walking=candidates.filter(c=>!c.dodge),safeWalking=walking.filter(c=>c.safety<1);
    // Walk before spending a dodge on baby contact alone, when a safe walking route exists.
    const pool=babyOnly&&safeWalking.length?safeWalking:candidates;
    best=pool.reduce((a,b)=>!a||b.cost<a.cost?b:a,null);
    const keys=[];
    if(Math.abs(best.vx)>.2)keys.push(best.vx>0?'ArrowRight':'ArrowLeft');
    if(Math.abs(best.vy)>.2)keys.push(best.vy>0?'ArrowDown':'ArrowUp');
    const inStorm=targets.filter(e=>e.d<(h.stormRadius||58)+(e.radius||12)-4);
    const storm=skills&&ready.storm&&!h.busy&&inStorm.length>0&&(danger||inStorm.length>=2||inStorm.some(e=>e.boss||e.knownHp&&e.hits>=3));
    // Preserve the escape path that was evaluated with a dodge; storm changes movement speed.
    if(best.dodge)keys.push('Space');else if(storm)keys.push('KeyE');
    const intent=best.dodge?(danger?'evade':'travel'):storm?'storm':stuck&&!danger?'recover':hold?(best.vx||best.vy?'skirmish':'attack'):target?.rally?'rally':target?.positionOnly?'intercept':cleanup?'cleanup':'approach';
    const boss=nearbyDanger.find(z=>/牛头人|鼠王/.test(z.message));
    const names={minotaur:'牛头人',ratking:'鼠王',slime:'史莱姆',slimeb:'蓝史莱姆',baby:'小史莱姆',babyb:'蓝色小史莱姆',archer:'弓箭手',wizard:'巫师',bomber:'自爆怪',goblin:'哥布林',ghost:'幽灵',bat:'蝙蝠',skeleton:'骷髅',rat:'老鼠'};
    return {keys,intent,riskLevel,target:target?.name||'',targetId:target?.id??null,threats:zones.length,message:boss?.message||nearbyDanger[0]?.message||(intent==='travel'?'路线安全，闪避接近目标':intent==='recover'?'移动受阻，换方向脱困':intent==='attack'?'目标在攻击范围，稳住输出':intent==='skirmish'?'调整近身距离，保持输出':intent==='cleanup'?'波末清场，接近剩余敌人':intent==='intercept'?'门口安全范围接应，避开出生通道':intent==='rally'?(target.d<=8?'已在安全等待区，准备下一波':'本波已清场，前往随机安全位置'):incoming.length?'侧移避开箭矢或火球':rushing?'拉开距离，避让小史莱姆':target?'接近目标：'+(names[target.name]||target.name):'远离危险区域'),danger};
  }
  const api={plan,threats,zoneMargin,rallyArea,safeRally,pickRally};if(typeof module!=='undefined')module.exports=api;else globalThis.FarmBattlePlanner=api;
})();

/* Public front-end fingerprint guard. Never executes downloaded code or changes game data. */
(() => {
  window.__farmVersionGuard?.remove();
  const storageKey='farm-helper.game-version.v1',intervalMs=300000,pageId=String(performance.timeOrigin);
  let record={approved:null,pending:null},storageError=false,removed=false,busy=false,flight=null,controller=null,lastTry=0,ui=null,generation=0;
  let state={blocked:true,phase:'checking',message:'正在检查游戏版本…',detail:'核对入口与关联代码，完成前暂停全部自动功能',files:0,checkedAt:0,refreshRequired:false,cacheOnly:false};
  let candidate=null;
  function read(){
    try{
      const value=JSON.parse(localStorage.getItem(storageKey)||'null');
      const a=value?.approved;
      if(a&&(a.cacheFilter!==undefined&&a.cacheFilter!==1||a.logical!==undefined&&!/^[a-f0-9]{64}$/.test(a.logical)||['cacheRoots','cacheFiles'].some(k=>a[k]!==undefined&&(!Array.isArray(a[k])||a[k].length>512||a[k].some(u=>!asset(u))))))throw Error('缓存版本记录异常');
      if(value&&(value.schema!==1||value.approved&&(!Array.isArray(value.approved.files)||!value.approved.files.length||!Array.isArray(value.approved.roots)||!value.approved.roots.length||! /^[a-f0-9]{64}$/.test(value.approved.fingerprint)||value.approved.files.some(f=>!asset(f.url)||! /^[a-f0-9]{64}$/.test(f.hash)))||value.pending&&(!['update','error'].includes(value.pending.kind)||value.pending.kind==='update'&&typeof value.pending.pageId!=='string')))throw Error('版本记录格式异常');
      record=value||{schema:1,approved:null,pending:null};storageError=false;
    }catch{storageError=true;throw Error('无法读取版本记录，请检查浏览器存储')}
  }
  function save(next){try{localStorage.setItem(storageKey,JSON.stringify(next));record=next;storageError=false}catch{storageError=true;throw Error('无法保存版本确认，自动操作保持暂停')}}
  function pause(){window.__farmBattleInput?.release();window.__farmAutomation?.pauseForVersion?.();window.__farmEarnings?.pauseForVersion?.()}
  function update(values){if(removed)return;const was=state.blocked;state={...state,...values};if(state.blocked&&!was)pause();if(was&&!state.blocked)void window.__farmAutomation?.refresh?.();paint()}
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
    const request=async url=>{
      const response=await fetch(url,{credentials:'same-origin',cache:url===location.origin+'/'?'no-store':'no-cache',redirect:'error',signal});
      if(!response.ok)throw Error('版本文件读取失败（'+response.status+'）');return response;
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
    if(removed)return false;if(busy)return flight;
    busy=true;lastTry=Date.now();candidate=null;const revision=generation;
    update({phase:'checking',message:'正在检查游戏版本…',detail:'读取入口与关联代码',files:0,cacheOnly:false});
    controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),90000);
    flight=(async()=>{
      try{
        read();const result=await scan(controller.signal);if(removed||revision!==generation)return false;
        candidate=result;const rawChanged=record.approved?.fingerprint!==result.fingerprint;
        const cacheOnly=!!record.approved&&rawChanged&&record.approved.cacheFilter===1&&record.approved.logical===result.logical;
        const changed=rawChanged&&!cacheOnly;
        if(record.approved&&changed)markChanged();
        const refreshRequired=(cacheOnly? !result.equivalentPage:result.stale)||record.pending?.kind==='update'&&record.pending.pageId===pageId;
        if(confirmFingerprint){
          if(refreshRequired)throw Error('请先刷新游戏，再确认当前加载的版本');
          if(confirmFingerprint!==result.fingerprint){update({blocked:true,phase:'review',refreshRequired:false,message:'代码再次变化，请重新检查后确认',detail:'本次没有保存确认'});return false}
          save({schema:1,approved:{fingerprint:result.fingerprint,roots:result.roots,files:result.files,cacheFilter:1,logical:result.logical,at:Date.now()},pending:null});
        }else if(!record.approved||changed||record.pending?.kind==='update'||refreshRequired){
          const old=new Map((record.approved?.files||[]).map(f=>[f.url,f.hash]));
          const count=result.files.filter(f=>old.get(f.url)!==f.hash).length;
          update({blocked:true,phase:'review',refreshRequired,message:record.approved?'游戏代码有更新，等待确认':'首次启用，请确认当前游戏版本',detail:refreshRequired?'请结束当前操作并刷新游戏，再检查与确认':record.approved?'检测到 '+count+' 个新增或变化文件；确认兼容后可解除暂停':'已检查 '+result.files.length+' 个代码文件，确认后建立版本基准',checkedAt:Date.now()});return false;
        }else if(cacheOnly){
          const a=record.approved;
          const cacheRoots=[...new Set([...(a.cacheRoots||[]),...result.roots])].slice(-64);
          const cacheFiles=[...new Set([...(a.cacheFiles||[]),...result.files.map(f=>f.url)])].slice(-512);
          if(record.pending||JSON.stringify(cacheRoots)!==JSON.stringify(a.cacheRoots)||JSON.stringify(cacheFiles)!==JSON.stringify(a.cacheFiles))save({...record,approved:{...a,cacheRoots,cacheFiles},pending:null});
        }else if(record.pending||record.approved.cacheFilter!==1||record.approved.logical!==result.logical){
          // Old baselines gain the new digest only after their original raw hashes match exactly.
          save({...record,approved:{...record.approved,cacheFilter:1,logical:result.logical},pending:null});
        }
        update({blocked:false,phase:'ready',refreshRequired:false,cacheOnly,message:'版本检查通过',detail:cacheOnly?'仅资源缓存版本变化，实际代码一致，已自动忽略':'关键前端代码与已确认版本一致',checkedAt:Date.now()});return true;
      }catch(error){
        if(!removed&&revision===generation){
          if(!storageError&&record.pending?.kind!=='update')try{save({...record,pending:{kind:'error',at:Date.now()}})}catch{}
          update({blocked:true,phase:'error',message:'无法确认游戏版本，已暂停',detail:error.name==='AbortError'?'检查超时，请检查网络后重试':error.message,refreshRequired:false});
        }return false;
      }finally{clearTimeout(timeout);controller=null;busy=false;if(!removed)paint()}
    })();return flight;
  }
  async function approve(){if(busy||state.phase!=='review'||state.refreshRequired||!candidate)return false;const fp=candidate.fingerprint;return check(fp)}
  function mount({panel,title,body,mini,isCollapsed}){
    if(ui)unmount();
    const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e};
    const badge=make('span');badge.style.cssText='font-size:10px;font-weight:400;margin-left:6px;color:#d9c38e';title.append(badge);
    const mask=make('section');mask.id='farm-version-mask';mask.setAttribute('aria-label','游戏版本保护');
    mask.style.cssText='box-sizing:border-box;min-height:176px;padding:24px 12px;display:flex;flex-direction:column;justify-content:center;gap:10px;background:#0d1b14;border:1px solid #49604b;border-radius:6px;font-size:11px;line-height:1.65;overflow-wrap:anywhere';
    const heading=make('strong'),detail=make('p'),actions=make('div');heading.style.fontSize='12px';heading.setAttribute('role','status');heading.setAttribute('aria-live','polite');detail.style.cssText='margin:0;color:#b9cbbd;white-space:pre-line';actions.style.cssText='display:flex;flex-wrap:wrap;gap:7px';
    const retry=make('button','重新检测'),confirm=make('button','确认兼容，解除暂停');
    for(const b of [retry,confirm]){b.type='button';b.style.cssText='font:inherit;padding:5px 8px;border:1px solid #708c69;border-radius:4px;background:#c7dfb8;color:#213721;cursor:pointer'}
    retry.onclick=()=>void check();confirm.onclick=()=>void approve();actions.append(retry,confirm);mask.append(heading,detail,actions);panel.insertBefore(mask,body);
    ui={badge,mask,heading,detail,retry,confirm,body,mini,isCollapsed};paint();
  }
  function paint(){
    if(!ui||removed)return;
    const {badge,mask,heading,detail,retry,confirm,body,mini,isCollapsed}=ui,collapsed=isCollapsed();
    body.inert=state.blocked;body.hidden=collapsed||state.blocked;mask.hidden=collapsed||!state.blocked;
    heading.textContent=state.message;detail.textContent=state.detail;
    retry.disabled=busy;confirm.disabled=busy||state.refreshRequired||state.phase!=='review';confirm.hidden=state.phase!=='review'||state.refreshRequired;
    badge.textContent=state.phase==='checking'?'检测中':state.blocked?'已暂停':state.cacheOnly?'缓存更新已忽略':'版本正常';badge.title=state.blocked?state.message:state.detail;
    if(state.blocked&&collapsed){mini.textContent=state.message;mini.title=state.detail}
    if(state.blocked&&body.contains(document.activeElement))retry.focus();
  }
  function unmount(){if(!ui)return;ui.body.inert=false;ui.mask.remove();ui.badge.remove();ui=null}
  function foreground(){if(!document.hidden&&Date.now()-lastTry>=30000)void check()}
  function sync(e){if(e.key!==storageKey)return;generation++;controller?.abort();update({blocked:true,message:'版本确认记录变化，重新检查'});if(flight&&busy)void flight.finally(()=>{if(!removed)void check()});else void check()}
  const timer=setInterval(()=>{if(!document.hidden&&Date.now()-lastTry>=intervalMs)void check()},15000);
  document.addEventListener('visibilitychange',foreground);window.addEventListener('storage',sync);
  window.__farmVersionGuard={isBlocked:()=>state.blocked,status:()=>({...state,busy}),check,approve,mount,paint,remove:()=>{removed=true;controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',foreground);window.removeEventListener('storage',sync);unmount();delete window.__farmVersionGuard}};
  void check();
})();

/* In-memory execution history. No credentials, requests or combat hit streams. */
(() => {
  if(window.__farmActivity)return;
  const entries=[];
  const labels={feed:'喂养动物',collect:'收动物产出',orchard:'采摘果园',income:'领取村庄收入',mine:'收取矿车',oil:'抽取石油',harvest:'收获田地',plant:'补种田地',energy:'购买能量','fish-bait':'购买鱼饵','fish-run':'开始连续钓鱼','fish-reel':'收竿','craft-start':'作坊加工','craft-take':'收取作坊成品','craft-order':'交付订单','craft-keep':'调整产物保留','craft-wool':'收取作坊羊毛','craft-milk':'收取作坊牛奶','craft-eggs':'收取鸡蛋','craft-eat':'面包补能量'};
  function describe(job){if(!job)return '';let name=labels[job.kind]||'农务';if(job.kind==='craft-start')name=({flour:'磨粉',bread:'烤面包',butter:'制作黄油',cheese:'制作奶酪',cloth:'织布'}[job.recipe]||'作坊加工')+' '+job.count+' 批';if(job.kind==='craft-keep')name+=' · '+({egg:'鸡蛋',milk:'牛奶',wool:'羊毛'}[job.arg]||'产物')+(job.keep?'保留':'出售');if(job.kind==='fish-bait')name+=' '+job.count+' 个';if(job.kind==='fish-run')name+=' '+job.count+' 次';if(job.kind==='plant')name+=' · '+(window.__farmRules?.crops[job.crop]?.name||job.crop);if(job.kind==='craft-order')name+=' #'+(job.index+1);if(job.kind==='craft-eat')name+=' '+job.count+' 个';if(job.prep)name+=' · 次日备货';return name}
  function add(type,text){const last=entries[0];if(last?.type===type&&last.text===text)return;entries.unshift({at:Date.now(),type,text});entries.splice(20)}
  window.__farmActivity={describe,add,entries:()=>entries.map(e=>({...e})),remove:()=>{delete window.__farmActivity}};
})();

/* Wait for the user to complete verification. Never click or solve a challenge. */
(() => {
  if(window.__farmVerification)return '验证等待已安装';
  let blocked=false,clearSince=null,episodes=0,removed=false,audio=null,notice;
  const visible=el=>{
    if(!el?.isConnected||el.hidden||!el.getClientRects().length)return false;
    for(let n=el;n&&n!==document;n=n.parentElement){
      const s=getComputedStyle(n);
      if(n.hidden||n.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;
    }
    return true;
  };
  function detected(){
    // A loaded widget alone is not a challenge: it must be visible and unverified.
    const widget=[...document.querySelectorAll('iframe[src*="challenges.cloudflare.com"],iframe[title*="Cloudflare"],iframe[title*="cloudflare"],.cf-turnstile')].filter(visible);
    for(const el of widget){
      const scope=el.closest('.cf-turnstile')||el.parentElement;
      const token=scope?.querySelector('input[name="cf-turnstile-response"]');
      if(!token?.value?.trim())return true;
    }
    return [...document.querySelectorAll('[role="dialog"],#modal,#cf-challenge-running,.cf-challenge,[id^="cf-chl-"]')].some(el=>
      visible(el)&&/你是真正的农夫吗|Verify you are human|确认您是真人|验证您是真人|验证你是真人|Checking your browser|Just a moment/i.test(el.textContent||''));
  }
  function sound(){
    try{
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      audio??=new C();if(audio.state!=='running')return;
      const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=660;g.gain.value=.08;
      o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.22);
    }catch{}
  }
  function unlock(e){
    if(!e.isTrusted)return;
    try{const C=window.AudioContext||window.webkitAudioContext;if(C){audio??=new C();if(audio.state==='suspended')void audio.resume().catch(()=>{})}}catch{}
  }
  function render(){
    const panel=document.getElementById('farm-compact-controls')||document.getElementById('farm-auto-standalone');
    if(!panel)return;
    if(!notice){notice=document.createElement('div');notice.id='farm-verification-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.style.cssText='font:11px/1.5 system-ui;color:#f3d397;border:1px solid #a58a51;background:#332e20;padding:7px 8px;border-radius:4px;margin:0 0 10px';}
    // Outside the collapsible body, and reattach when the panel is rebuilt.
    if(notice.parentElement!==panel)panel.prepend(notice);
    notice.hidden=!blocked;
    const text='等待人工验证 · 自动操作已暂停\n请完成游戏验证，通过后自动继续';
    if(blocked&&notice.textContent!==text){notice.textContent=text;notice.style.whiteSpace='pre-line'}
  }
  function check(){
    if(removed)return false;
    if(detected()){
      clearSince=null;
      if(!blocked){blocked=true;episodes++;sound()}
    }else if(blocked){
      // Hidden pages and brief DOM transitions are not proof of completion.
      if(document.hidden)clearSince=null;
      else if(clearSince===null)clearSince=performance.now();
      else if(performance.now()-clearSince>=3000){blocked=false;clearSince=null}
    }
    render();return blocked;
  }
  document.addEventListener('pointerdown',unlock,true);document.addEventListener('keydown',unlock,true);
  const timer=setInterval(check,500);
  window.__farmVerification={isBlocked:check,status:()=>({blocked,episodes,message:blocked?'等待人工验证':'验证检测正常'}),remove:()=>{
    removed=true;clearInterval(timer);notice?.remove();document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('keydown',unlock,true);audio?.close().catch(()=>{});delete window.__farmVerification;
  }};
  check();return '验证检测已开启，需由你手动完成验证';
})();

/* Read-only planning. Prices and time always come from the authenticated farm snapshot. */
(() => {
  const cropRows=[['radish','萝卜',30,.016],['turnip','芜菁',30,.016],['carrot','胡萝卜',30,.016],['onion','洋葱',60,.018],['red_onion','红洋葱',60,.018],['garlic','大蒜',60,.018],['wheat','小麦',120,.02],['corn','玉米',120,.02],['potato','土豆',120,.02],['cucumber','黄瓜',120,.02],['tomato','番茄',240,.023],['red_pepper','红椒',240,.023],['yellow_pepper','黄椒',240,.023],['green_pepper','青椒',240,.023],['cabbage','卷心菜',480,.027],['cauliflower','花菜',480,.027],['chili','辣椒',480,.027],['aubergine','茄子',720,.03],['strawberry','草莓',720,.03],['pumpkin','南瓜',1440,.036]];
  const crops=Object.fromEntries(cropRows.map(([id,name,min,value])=>[id,{id,name,ms:min*60000,value,min}]));
  const animals={chicken:{building:'coop',bags:2,meal:.01,days:1,capacity:6},cow:{building:'barn',bags:8,meal:.04,days:1,capacity:3},sheep:{building:'sheepPen',bags:5,meal:.025,days:3,capacity:4},pig:{building:'pigPen',bags:10,meal:.05,days:7,capacity:2}};
  const trees={apple:{ms:86400000,value:.05},lemon:{ms:86400000,value:.055},orange:{ms:86400000,value:.055},blueberry:{ms:43200000,value:.025},raspberry:{ms:43200000,value:.025},blackberry:{ms:43200000,value:.025}};
  const levels=[null,{mult:1,harvest:.7,passive:.25},{mult:1.6,harvest:1.64,passive:.58},{mult:1.75,harvest:3.74,passive:1.33},{mult:2.1,harvest:8.4,passive:3},{mult:2.4,harvest:18.66,passive:6.67}];
  const built=(s,now)=>!s.buildUntil||s.buildUntil<=now;
  function calendar(f,now){
    if(!Number.isFinite(f.tz)||Math.abs(f.tz)>840)throw Error('无法确认农场时区');
    const d=new Date(now+f.tz*60000),day=d.toISOString().slice(0,10),hour=d.getUTCHours();
    const nextMidnight=Date.parse(day+'T00:00:00Z')+86400000-f.tz*60000;
    return {day,meal:day+(hour<12?'S':'A'),hour,nextMidnight};
  }
  function quote(d){
    const f=d.farm,l=levels[f.level];if(!l||!Number.isFinite(d.price?.pay)||!Number.isFinite(d.price?.charge)||!(d.price.pay>0)||!(d.price.charge>0))throw Error('等级或实时价格无法确认');
    if(!Number.isFinite(f.today.harvestEarned)||f.today.harvestEarned<0||!Number.isFinite(f.tokens)||f.tokens<0||f.harvestCarry!==undefined&&(!Number.isFinite(f.harvestCarry)||f.harvestCarry<0))throw Error('收益或余额数据无法确认');
    const cal=calendar(f,d.now);if(f.today.day!==cal.day)throw Error('等待服务器跨日结算');
    const bonus=f.bank?.bonusOn?1+(f.bank.lockBonus||0):1;
    // The server's effective NFT state is authoritative; owning a token alone is not enough.
    const nftDays=f.nft?.on?f.nft.lockDays??0:0;
    const nftCapBonus=nftDays>=7?1.25:1,nftYieldBonus=1+({7:.05,14:.1,28:.15}[nftDays]||0);
    const harvestBonus=bonus*nftYieldBonus;
    const pay=v=>Math.round(v/d.price.pay),charge=v=>Math.round(v/d.price.charge);
    const base=pay(l.harvest)*bonus,cap=base*nftCapBonus+(f.today.feedSpent||0);
    const carry=Math.max(0,f.harvestCarry||0),remaining=Math.max(0,cap-f.today.harvestEarned);
    const value=v=>Math.floor(Math.round(pay(v)*l.mult)*harvestBonus);
    return {cal,l,bonus,nftCapBonus,nftYieldBonus,harvestBonus,pay,charge,base,cap,carry,remaining,room:remaining+Math.max(0,base*7-carry),value,energy10:charge(.0045*l.mult*10)};
  }
  function building(f,a){
    const rule=animals[a.kind];if(!rule)return null;
    const ss=f.structures.filter(s=>s.kind===rule.building).sort((a,b)=>(a.buildUntil||0)-(b.buildUntil||0));
    const index=f.animals.filter(x=>x.kind===a.kind).findIndex(x=>x.id===a.id);
    const capacity=Math.floor(rule.capacity*[1,1.25,1.5,1.75,2][f.level-1]);
    return ss[Math.min(ss.length-1,Math.floor(index/capacity))]||null;
  }
  function feedPlan(d){
    const f=d.farm,q=quote(d),hungry=f.animals.filter(a=>!a.fedWindows?.includes(q.cal.meal));
    let bags=f.silo?.feed||0,grain=Math.min(f.silo?.wheat||0,f.silo?.corn||0),coins=0,needed=0;
    const hasSilo=f.structures.some(s=>s.kind==='silo'&&built(s,d.now));
    const buildings=new Map();
    for(const a of hungry){
      const r=animals[a.kind],b=building(f,a);if(!r||!b)throw Error('未知动物或缺少动物建筑');
      if(!built(b,d.now))throw Error('动物建筑施工中');
      buildings.set(b.id,b);if((a.meals??1)===0)continue;
      needed+=r.bags;
      if(bags<r.bags&&hasSilo){const n=Math.ceil((r.bags-bags)/10);if(grain>=n){grain-=n;bags+=n*10}}
      if(bags>=r.bags)bags-=r.bags;else coins+=q.charge(r.meal);
    }
    return {hungry,coins,bags:needed,energy:[...buildings.values()].filter(b=>b.fedWindow!==q.cal.meal).length*2,meal:q.cal.meal};
  }
  function collectPlan(d){
    const f=d.farm,q=quote(d),ready=f.animals.filter(a=>a.productReady),bs=new Map();let value=0;
    const kept={};
    for(const a of ready){const r=animals[a.kind],b=building(f,a);if(!r||!b)throw Error('未知动物或建筑');bs.set(b.id,b);const item={chicken:'egg',cow:'milk',sheep:'wool'}[a.kind];if(item&&f.keep?.[item]&&(f.pantry?.[item]||0)+(kept[item]||0)<200){kept[item]=(kept[item]||0)+1;continue}value+=q.value(r.meal*4*r.days)}
    return {ready,value,energy:[...bs.values()].filter(b=>b.collectDay!==q.cal.day).length*2};
  }
  function orchardPlan(d){return d.farm.structures.filter(s=>s.kind==='orchard'&&built(s,d.now)).map(s=>{
    const ready=(s.slots||[]).map((x,i)=>({...x,i})).filter(x=>trees[x.tree]&&d.now-x.lastHarvestAt>=trees[x.tree].ms);
    const value=ready.reduce((n,x)=>n+quote(d).value(trees[x.tree].value),0);return {id:s.id,ready,value};
  }).filter(x=>x.ready.length)}
  function futureValue(d,flags){
    const f=d.farm,q=quote(d);let total=0;
    if(flags.collect)total+=collectPlan(d).value;
    if(flags.orchard)for(const s of f.structures.filter(s=>s.kind==='orchard'))for(const x of s.slots||[]){const t=trees[x.tree];if(t&&x.lastHarvestAt+t.ms<q.cal.nextMidnight)total+=q.value(t.value)}
    for(const x of f.fields){const c=crops[x.crop];if(c&&!['wheat','corn'].includes(x.crop)&&x.plantedAt+c.ms<q.cal.nextMidnight)total+=q.value(c.value)}
    return total;
  }
  function chooseCrop(d,config,flags,lastGrain='corn'){
    const f=d.farm,q=quote(d);
    if(!crops[config.crop])throw Error('未知作物');
    if(flags.workshop&&config.workshopWheat>0){
      const need=window.__farmWorkshop.feedWheat(d,config.feedDays)+config.workshopWheat;
      const wheat=(f.silo?.wheat||0)+f.fields.filter(x=>x.crop==='wheat').length;
      if(wheat<need)return {crop:'wheat',message:'补足作坊小麦，另留动物饲料'};
    }
    const needsCash=q.remaining>q.carry+futureValue(d,flags)+1;
    if(!config.smart&&!q.remaining||config.smart&&!needsCash){
      const need=f.animals.reduce((n,a)=>n+(animals[a.kind]?.bags||0)*2,0);
      const inventory=(f.silo?.feed||0)+Math.min((f.silo?.wheat||0)+f.fields.filter(x=>x.crop==='wheat').length,(f.silo?.corn||0)+f.fields.filter(x=>x.crop==='corn').length)*10;
      if(config.smart&&(need===0||inventory>=need*config.feedDays))return {crop:null,message:'预计产出已覆盖今日额度，粮食充足，等待下一天'};
      const wheat=(f.silo?.wheat||0)+f.fields.filter(x=>x.crop==='wheat').length,corn=(f.silo?.corn||0)+f.fields.filter(x=>x.crop==='corn').length;
      return {crop:wheat<corn?'wheat':corn<wheat?'corn':lastGrain==='corn'?'wheat':'corn',message:'补充玉米和小麦'};
    }
    return {crop:config.crop,message:'补足今日收获额度'};
  }
  // Server counters, not a local click count, enforce the daily 20-bait/cast limits.
  function fishingPlan(d){
    const f=d.farm,q=quote(d),fish=f.fishing;
    const empty={jobs:[],note:'需先在钓鱼池购买鱼竿'};
    const pond=f.structures.find(s=>s.kind==='pond'&&(!fish?.line||s.id===fish.line.pondId));
    if(!pond)return {jobs:[],note:'需先建造钓鱼池'};
    if(!built(pond,d.now))return {jobs:[],note:'钓鱼池建造中'};
    if(!fish?.rod)return empty;
    const sameDay=fish.day===q.cal.day,bought=sameDay?fish.bought:0,casts=sameDay?fish.casts:0;
    if(![bought,casts,fish.bait,fish.total,fish.caught].every(n=>Number.isSafeInteger(n)&&n>=0)||bought>20||casts>20)throw Error('钓鱼计数无法确认，暂停钓鱼');
    const unit=Math.max(1,q.charge(.25*levels[Math.max(3,f.level)].harvest/20*.2));
    const base={route:'rwa',id:pond.id,energy:0,value:0};
    const progress='今日已购 '+bought+'/20 · 已抛竿 '+casts+'/20 · 鱼饵 '+fish.bait;
    if(fish.line){
      if(!Number.isFinite(fish.line.bite))throw Error('鱼竿状态无法确认');
      if(d.now<fish.line.bite)return {jobs:[],note:progress+' · 等待上钩'};
      return {jobs:[{...base,kind:'fish-reel',action:'pond-fish',arg:pond.id,before:fish.caught,lineAt:fish.line.at}],note:progress+' · 收起已上钩的鱼'};
    }
    if(bought<20){const count=20-bought,cost=unit*count;
      return {jobs:f.tokens>=cost?[{...base,kind:'fish-bait',action:'buy-bait',arg:String(count),count,cost,unit,before:bought}]:[],note:progress+' · 补买 '+count+' 个约 '+cost+' 金币'+(f.tokens<cost?'，余额不足':'')};
    }
    const count=Math.min(fish.bait,20-casts);
    return {jobs:count?[{...base,kind:'fish-run',action:'pond-fish-n',arg:pond.id+'|'+count,count,before:casts,beforeTotal:fish.total,beforeCaught:fish.caught}]:[],note:progress+(casts>=20?' · 今日已完成':count?' · 待连续钓完 '+count+' 次':' · 鱼饵不足，今日购买已满')};
  }
  function fishingPendingDone(p,d){
    if(!p.kind?.startsWith('fish-'))return false;
    if(p.day!==calendar(d.farm,d.now).day)return true;
    const f=d.farm.fishing;if(!f)return false;
    if(p.kind==='fish-bait')return f.day===p.day&&f.bought>=p.before+p.count;
    // Batch submission is confirmed on the first cast; the game's worker owns the remaining run.
    if(p.kind==='fish-run')return f.total>p.beforeTotal||f.caught>p.beforeCaught||(f.day===p.day&&f.casts>p.before);
    if(p.kind==='fish-reel')return f.caught>p.before;
    return false;
  }
  function pendingDone(p,d){
    const f=d.farm;
    if(fishingPendingDone(p,d))return true;
    if(p.kind==='feed')return p.ids.every(id=>{const a=f.animals.find(a=>a.id===id),before=p.before?.find(x=>x.id===id);return !a||a.fedWindows?.includes(p.meal)||(before&&a.lastFedAt>before.lastFedAt)});
    if(p.kind==='collect')return p.ids.every(id=>!f.animals.find(a=>a.id===id)?.productReady);
    if(['harvest','plant'].includes(p.kind))return p.before.every(b=>{const x=f.fields.find(x=>x.id===b.id);return !x||(p.kind==='harvest'?x.crop!==b.crop||x.plantedAt!==b.plantedAt:!!x.crop&&(x.crop!==b.crop||x.plantedAt!==b.plantedAt))});
    if(p.kind==='orchard'){const s=f.structures.find(s=>s.id===p.id);return !s||p.before.every(x=>(s.slots?.[x.i]?.lastHarvestAt||0)>x.lastHarvestAt)}
    if(p.kind==='mine')return (f.structures.find(s=>s.id===p.id)?.mineAt||0)>p.before;
    if(p.kind==='oil')return f.structures.find(s=>s.id===p.id)?.collectDay>=p.day;
    if(p.kind==='income')return f.passiveSince>p.before;
    if(p.kind==='energy')return f.today.energy>=p.before+10||(f.today.bought||0)>=p.bought+10;
    return false;
  }
  window.__farmRules={crops,cropRows,trees,animals,levels,built,calendar,quote,building,feedPlan,collectPlan,orchardPlan,futureValue,chooseCrop,fishingPlan,pendingDone};
})();

/* Today's visible orders are authoritative. Forecasts are used only for next-day stock. */
(() => {
  const R=window.__farmRules;
  const recipes={flour:{building:'mill',inputs:{wheat:1},count:1,ms:600000},bread:{building:'bakery',inputs:{flour:1,egg:1},count:4,ms:1800000},butter:{building:'dairy',inputs:{milk:1},count:1,ms:3600000},cheese:{building:'dairy',inputs:{milk:2},count:1,ms:7200000},cloth:{building:'loom',inputs:{wool:2},count:1,ms:7200000}};
  const values={egg:.04,flour:.024,bread:.0225,wheat:.02,milk:.16,butter:.19,cheese:.38,wool:.3,cloth:.75};
  const names={egg:'鸡蛋',milk:'牛奶',wheat:'小麦',mill:'磨坊',bakery:'面包房',dairy:'乳品坊',loom:'织布坊',flour:'面粉',bread:'面包',butter:'黄油',cheese:'奶酪',wool:'羊毛',cloth:'布料'};
  const stock=(f,key)=>Math.max(0,Math.floor((key==='wheat'?f.silo:f.pantry)?.[key]||0));
  const orderPool=[['flour',[3,5,8]],['bread',[4,6,8]],['egg',[3,4,6]],['milk',[1,2,3]],['butter',[1,2,3]],['cheese',[1,1,2]],['cloth',[1,1,2]]];
  function forecast(owner,day){
    if(typeof owner!=='string'||!owner||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('账号或订单日期无法确认');
    const craft2=window.__FS_CRAFT2__;
    if(window.__FS_CRAFT__!==true||typeof window.__FS_DAIRY__!=='boolean'||!(craft2===false||Array.isArray(craft2)&&craft2.every(k=>k==='loom')))throw Error('作坊开放范围变化，暂停预测备货');
    const pool=orderPool.filter(([k])=>!['milk','butter','cheese'].includes(k)||window.__FS_DAIRY__).filter(([k])=>k!=='cloth'||Array.isArray(craft2)&&craft2.includes('loom'));
    let seed=2166136261;for(const c of owner.toLowerCase()+'#orders#'+day){seed^=c.charCodeAt(0);seed=Math.imul(seed,16777619)>>>0}
    const random=()=>{seed^=seed<<13;seed>>>=0;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;return seed/4294967296};
    return Array.from({length:3},(_,index)=>{const choices=pool.slice(),items={};for(let n=0;n<Math.min(index+1,2);n++){const [k,counts]=choices.splice(Math.floor(random()*choices.length),1)[0];items[k]=counts[index]}return {index,items,reward:0,done:false}});
  }
  const itemKey=items=>JSON.stringify(Object.entries(items).sort(([a],[b])=>a.localeCompare(b)));
  const summarize=orders=>orders.map(o=>'#'+(o.index+1)+' '+Object.entries(o.items).map(([k,n])=>(names[k]||k)+'×'+n).join('、')).join('；');
  let budgetCache=null,budgetFlight=null,budgetGeneration=0;
  function invalidateBudget(owner){if(!owner||budgetCache?.owner===owner||budgetFlight?.owner===owner){budgetCache=null;budgetFlight=null;budgetGeneration++}}
  async function readBudget(owner,now,signal){
    const day=new Date(now).toISOString().slice(0,10),key=owner+'#'+day,t=performance.now();
    if(budgetCache?.key===key&&t-budgetCache.at<30000)return {budget:budgetCache.budget,ageMs:t-budgetCache.at};
    if(budgetFlight?.key===key)return budgetFlight.promise;
    const generation=budgetGeneration,flight={key,owner};
    flight.promise=(async()=>{
      const r=await fetch('/api/farm/order',{credentials:'same-origin',cache:'no-store',signal});if(!r.ok)throw Error('订单预算读取失败');
      const d=await r.json();if(!Number.isFinite(d.budget?.left)||d.budget.left<0)throw Error('无法确认订单预算');
      if(generation!==budgetGeneration)throw Error('订单预算已变化，等待重读');
      budgetCache={key,owner,budget:d.budget,at:performance.now()};return {budget:d.budget,ageMs:0};
    })().finally(()=>{if(budgetFlight===flight)budgetFlight=null});
    budgetFlight=flight;return flight.promise;
  }
  function week(now){const date=new Date(now),days=(date.getUTCDay()+6)%7;return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-days)).toISOString().slice(0,10)}
  const orderDay=d=>{const utc=new Date(d.now).toISOString().slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(d.farm.orders?.day||'')&&d.farm.orders.day>utc?d.farm.orders.day:utc};
  const orderReset=d=>(Math.floor(d.now/86400000)+1)*86400000;
  const orderCap=d=>Math.floor(R.quote(d).pay(R.quote(d).l.harvest*.25));
  function budgetLeft(d,globalLeft){const spent=d.farm.orders?.day===orderDay(d)?d.farm.orders.dayTokens||0:0;return Math.max(0,Math.min(globalLeft,orderCap(d)-spent))}
  function syncBoard(board,d,globalLeft){
    let available=budgetLeft(d,globalLeft);
    const done=d.farm.orders?.day===board.day?d.farm.orders.done||[]:[];
    for(const o of board.orders){o.baseReward??=o.reward;o.done=done.includes(o.index);o.reward=o.done?0:Math.min(o.baseReward,available);available-=o.reward}
    return board;
  }
  function queued(f,now,credits=null){
    const out={flour:0,bread:0,butter:0,cheese:0,cloth:0},ready=[];
    for(const s of f.structures.filter(s=>['mill','bakery','dairy','loom'].includes(s.kind)&&R.built(s,now))){
      const done=[];
      for(const batch of s.queue||[]){const r=recipes[batch.r];if(!r||r.building!==s.kind)throw Error('作坊配方变化，暂停检查');out[batch.r]+=credits?.get(batch)??r.count;if(batch.until<=now)done.push(batch)}
      if(done.some(batch=>stock(f,batch.r)+recipes[batch.r].count<=200))ready.push({kind:'craft-take',route:'rwa',id:s.id,action:'craft-collect',arg:s.kind,building:s.kind,before:JSON.stringify(s.queue||[]),energy:0,value:0});
    }
    return {out,ready};
  }
  function feedWheat(d,days){
    const bags=d.farm.animals.reduce((n,a)=>n+(R.animals[a.kind]?.bags||0)*2,0)*days;
    return Math.max(0,Math.ceil((bags-(d.farm.silo?.feed||0))/10));
  }
  function demands(d,orders,autoEat,credits=null){
    const f=d.farm,need={egg:0,milk:0,flour:0,bread:0,butter:0,cheese:0,wool:0,cloth:0};
    R.quote(d); // Validate the authenticated price/day even though demands do not use the quote.
    // Every unfinished supported order is a task, including star-only rewards.
    const eligible=(orders||[]).filter(o=>!o.done&&Number.isFinite(o.reward)&&o.reward>=0&&Object.keys(o.items).length>0&&Object.entries(o.items).every(([k,n])=>values[k]&&Number.isSafeInteger(n)&&n>0));
    for(const o of eligible)for(const [k,n]of Object.entries(o.items))need[k]+=n;
    const eat=autoEat?Math.min(4,Math.max(0,Math.floor((20-(f.today.breadEnergy||0))/5))):0;
    need.bread+=eat;
    const queues=queued(f,d.now,credits),breadMissing=Math.max(0,need.bread-stock(f,'bread')-queues.out.bread),breadBatches=Math.ceil(breadMissing/4);
    need.egg+=breadBatches;need.flour+=breadBatches;
    const dairyBatches={};for(const key of ['butter','cheese']){dairyBatches[key]=Math.max(0,need[key]-stock(f,key)-queues.out[key]);if(f.structures.some(s=>s.kind==='dairy'&&R.built(s,d.now)))need.milk+=dairyBatches[key]*recipes[key].inputs.milk;}
    const clothBatches=Math.max(0,need.cloth-stock(f,'cloth')-queues.out.cloth);
    if(f.level>=3&&f.structures.some(s=>s.kind==='loom'&&R.built(s,d.now)))need.wool+=clothBatches*recipes.cloth.inputs.wool;
    const wheat=Math.max(0,need.flour-stock(f,'flour')-queues.out.flour);
    return {need,orders:eligible,eat,breadBatches,dairyBatches,clothBatches,wheat,queues};
  }
  function planToday(d,config,board){
    const f=d.farm,jobs=[];
    if(f.level<2)return {jobs,note:'市政厅 2 级解锁作坊',wheat:0};
    if(!board||board.day!==orderDay(d)||board.owner!==f.owner)return {jobs,note:'读取今日订单后安排生产',wheat:0};
    const p=demands(d,board.orders,config.workshopEat,config._prepCredits),neededEggs=Math.max(0,p.need.egg-stock(f,'egg')),neededMilk=Math.max(0,p.need.milk-stock(f,'milk')),neededWool=Math.max(0,p.need.wool-stock(f,'wool'));
    const notices=[],lines=[],scheduled=new Map();
    const make=(recipe,n)=>{const r=recipes[recipe],s=f.structures.find(s=>s.kind===r.building&&R.built(s,d.now));if(!n)return;if(!s){notices.push('未建'+names[r.building]+'，等待建造或备齐成品');return;}
      const prior=scheduled.get(s.id)||{until:Math.max(d.now,...(s.queue||[]).map(x=>x.until)),count:0};
      const start=prior.until;
      const beforeReset=Math.max(0,Math.floor(((config._prep?orderReset(d)+86400000:orderReset(d))-60000-start)/r.ms));
      const count=Math.min(8-(s.queue||[]).filter(x=>x.until>d.now).length-prior.count,n,beforeReset,Math.floor((200-stock(f,recipe)-p.queues.out[recipe])/r.count));
      if(beforeReset<n)notices.push(names[recipe]+'在今日刷新前最多可完成 '+beforeReset+' 批');
      if(count>0){scheduled.set(s.id,{until:start+count*r.ms,count:prior.count+count});jobs.push({kind:'craft-start',route:'rwa',id:s.id,action:'craft-start',arg:recipe+':'+count,recipe,count,finishAt:start+count*r.ms,before:JSON.stringify(s.queue||[]),energy:2,value:0});}
    };
    // Keep changes precede ordinary animal collection, so order ingredients are not sold accidentally.
    for(const [item,needed,route]of [['egg',neededEggs,'coop'],['milk',neededMilk,'barn'],...(f.level>=3?[['wool',neededWool,'sheepPen']]:[])])if((item!=='wool'||f.structures.some(s=>s.kind==='sheepPen'&&R.built(s,d.now)))&&!!f.keep?.[item]!==(needed>0))jobs.push({kind:'craft-keep',route,action:'keep-toggle',arg:item,keep:needed>0,energy:0,value:0});
    jobs.push(...p.queues.ready);
    for(const o of p.orders)if(Object.entries(o.items).every(([k,n])=>stock(f,k)>=n))jobs.push({kind:'craft-order',route:'orders',action:'order-fill',arg:String(o.index),index:o.index,day:board.day,items:o.items,reward:o.reward,energy:0,value:0});
    for(const [kind,item,route]of [['chicken','egg','coop'],['cow','milk','barn'],['sheep','wool','sheepPen']]){
      const ready=f.animals.filter(a=>a.kind===kind&&a.productReady);
      if(p.need[item]>stock(f,item)&&f.keep?.[item]&&ready.length){
        const subset={...d,farm:{...f,animals:f.animals.filter(a=>a.kind===kind)}};
        jobs.push({kind:{chicken:'craft-eggs',cow:'craft-milk',sheep:'craft-wool'}[kind],route,action:'collect',arg:kind,ids:ready.map(a=>a.id),energy:R.collectPlan(subset).energy,value:0});
      }
    }
    const wheatAvailable=Math.max(0,stock(f,'wheat')-feedWheat(d,config.feedDays));
    make('flour',Math.min(p.wheat,wheatAvailable));
    // Direct flour orders retain their portion before the bakery consumes flour.
    const directFlour=p.orders.reduce((n,o)=>n+(o.items.flour||0),0),directEgg=p.orders.reduce((n,o)=>n+(o.items.egg||0),0);
    make('bread',Math.min(p.breadBatches,Math.max(0,stock(f,'flour')-directFlour),Math.max(0,stock(f,'egg')-directEgg)));
    // Both milk recipes share one queue. Reserve direct-order milk before either recipe.
    const directMilk=p.orders.reduce((n,o)=>n+(o.items.milk||0),0);
    let milkAvailable=Math.max(0,stock(f,'milk')-directMilk);
    for(const key of config._prep?['cheese','butter']:['butter','cheese']){
      const n=Math.min(p.dairyBatches[key],Math.floor(milkAvailable/recipes[key].inputs.milk));
      if(p.dairyBatches[key]&&!f.structures.some(s=>s.kind==='dairy'&&R.built(s,d.now)))notices.push('未建乳品坊，乳品加工等待；其他作坊继续');
      if(n){make(key,n);const job=jobs.find(j=>j.recipe===key);milkAvailable-=(job?.count||0)*recipes[key].inputs.milk;}
    }
    const directWool=p.orders.reduce((n,o)=>n+(o.items.wool||0),0);
    if(p.clothBatches){
      if(f.level<3)notices.push('市政厅 3 级解锁织布坊');
      else if(!f.structures.some(s=>s.kind==='loom'&&R.built(s,d.now)))notices.push('织布坊未建成，布料加工等待；其他作坊继续');
      else make('cloth',Math.min(p.clothBatches,Math.floor(Math.max(0,stock(f,'wool')-directWool)/2)));
    }
    for(const kind of ['mill','bakery','dairy','loom']){
      const s=f.structures.find(s=>s.kind===kind),queue=s?.queue||[],active=queue.filter(x=>x.until>d.now),ready=queue.length-active.length;
      let text=kind==='loom'&&f.level<3?'市政厅 3 级解锁':!s?'未建造':!R.built(s,d.now)?'建造中':ready?'有 '+ready+' 批成品待收':active.length?names[active[0].r]+'加工中 · 下批约 '+Math.max(1,Math.ceil((Math.min(...active.map(x=>x.until))-d.now)/60000))+' 分钟':kind==='dairy'&&neededMilk?'缺牛奶 '+neededMilk+' 份 · 按订单保留':kind==='loom'&&neededWool?'缺羊毛 '+neededWool+' 份 · 按订单保留':kind==='bakery'&&p.breadBatches?'等待面粉或鸡蛋':'暂无待加工需求';
      const start=jobs.find(j=>j.recipe&&recipes[j.recipe].building===kind);if(start&&!queue.length)text='待制作'+names[start.recipe]+' '+start.count+' 批';
      lines.push({label:names[kind],text});
    }
    const eatAvailable=Math.min(p.eat,Math.max(0,stock(f,'bread')-p.orders.reduce((n,o)=>n+(o.items.bread||0),0)));
    const note=[...new Set(notices)].join('；')|| (neededWool?'还需 '+neededWool+' 份羊毛；保留后自动收取':neededMilk?'还需 '+neededMilk+' 份牛奶；保留后自动收取':neededEggs?'还需 '+neededEggs+' 个鸡蛋；保留后自动收取':p.wheat>wheatAvailable?'小麦不足，先保留 '+feedWheat(d,config.feedDays)+' 份作饲料':Object.values(p.queues.out).some(Boolean)?'作坊加工中，成品完成后收取':p.orders.length?'按今日全部订单安排生产（含星星订单）':'今日订单已完成');
    return {jobs,note,lines,wheat:p.wheat,orders:p.orders,eatAvailable};
  }

  function plan(d,config,board){
    const today=planToday(d,config,board),f=d.farm;
    if(!config.workshopPrep||!board||board.day!==orderDay(d)||board.owner!==f.owner||f.level<2)return today;
    let next;
    try{
      if(orderDay(d)!==new Date(d.now).toISOString().slice(0,10))throw Error('服务器订单日期待同步');
      const expected=forecast(f.owner,board.day);
      if(board.orders.length!==3||expected.some((o,i)=>board.orders[i]?.index!==i||itemKey(board.orders[i].items)!==itemKey(o.items)))throw Error('实际订单与预测规则不一致');
      const day=new Date(orderReset(d)).toISOString().slice(0,10);
      next={day,orders:forecast(f.owner,day)};
    }catch(e){return {...today,prep:{error:e.message},note:today.note+'；次日备货暂停：'+e.message}}
    const current=demands(d,board.orders,config.workshopEat),pantry={...f.pantry};
    for(const k of Object.keys(current.need))pantry[k]=Math.max(0,stock(f,k)-current.need[k]);
    const credits=new Map(),left={};
    for(const k of Object.keys(current.need))left[k]=Math.max(0,current.need[k]-stock(f,k));
    for(const s of f.structures.filter(s=>R.built(s,d.now)))for(const batch of s.queue||[]){
      const r=recipes[batch.r];if(!r)continue;
      const used=Math.min(left[batch.r]||0,r.count);left[batch.r]-=used;credits.set(batch,r.count-used);
    }
    const virtual={...d,farm:{...f,pantry,silo:{...f.silo,wheat:Math.max(0,stock(f,'wheat')-current.wheat)}}};
    const futureBoard={...board,orders:next.orders};
    const future=planToday(virtual,{...config,workshopPrep:false,workshopEat:false,_prep:true,_prepCredits:credits},futureBoard);
    const futureNeed=demands(virtual,next.orders,false,credits);
    const keep=[];
    for(const [item,route]of [['egg','coop'],['milk','barn'],['wool','sheepPen']]){
      if(item==='wool'&&f.level<3||!f.structures.some(s=>s.kind===route&&R.built(s,d.now)))continue;
      const needed=current.need[item]>stock(f,item)||futureNeed.need[item]>stock(virtual.farm,item);
      if(!!f.keep?.[item]!==needed)keep.push({kind:'craft-keep',route,action:'keep-toggle',arg:item,keep:needed,energy:0,value:0});
    }
    const busyToday={mill:current.wheat>0,bakery:current.breadBatches>0,dairy:Object.values(current.dairyBatches).some(n=>n>0),loom:current.clothBatches>0};
    const currentJobs=today.jobs.filter(j=>j.kind!=='craft-keep');
    const preparation=future.jobs.filter(j=>j.kind==='craft-start'&&!busyToday[recipes[j.recipe].building]||['craft-eggs','craft-milk','craft-wool'].includes(j.kind)&&!currentJobs.some(x=>x.kind===j.kind)).map(j=>({...j,prep:true}));
    preparation.sort((a,b)=>(recipes[b.recipe]?.ms||0)-(recipes[a.recipe]?.ms||0));
    const directBread=board.orders.filter(o=>!o.done).reduce((n,o)=>n+(o.items.bread||0),0)+next.orders.reduce((n,o)=>n+(o.items.bread||0),0);
    const late=preparation.some(j=>j.finishAt>orderReset(d))||Object.keys(futureNeed.need).some(k=>{
      const missing=Math.max(0,futureNeed.need[k]-stock(virtual.farm,k));
      let onTime=0,total=0;for(const s of f.structures)for(const b of s.queue||[])if(b.r===k){const n=credits.get(b)||0;total+=n;if(b.until<=orderReset(d))onTime+=n}
      return missing>onTime&&total>onTime;
    });
    const covered=Object.entries(futureNeed.need).every(([k,n])=>stock(virtual.farm,k)+(futureNeed.queues.out[k]||0)>=n);
    const shortages=Object.entries(futureNeed.need).map(([k,n])=>({item:k,count:Math.max(0,n-stock(virtual.farm,k)-(futureNeed.queues.out[k]||0))})).filter(x=>x.count>0);
    const prep={...next,summary:summarize(next.orders),need:futureNeed.need,shortages,covered,late,waiting:future.note};
    const lines=today.lines.map(line=>{
      const kind={磨坊:'mill',面包房:'bakery',乳品坊:'dairy',织布坊:'loom'}[line.label];
      const relevant=Object.entries(recipes).some(([key,r])=>r.building===kind&&futureNeed.need[key]>0);
      const other=future.lines.find(x=>x.label===line.label);
      return !busyToday[kind]&&relevant&&other?{...line,text:'次日备货 · '+other.text}:line;
    });
    return {...today,lines,jobs:[...currentJobs.filter(j=>j.kind==='craft-order'),...keep,...currentJobs.filter(j=>j.kind!=='craft-order'),...preparation],wheat:current.wheat+future.wheat,eatAvailable:Math.min(today.eatAvailable,Math.max(0,stock(f,'bread')-directBread)),prep,note:today.note+'；次日备货：'+(covered?'库存及队列已覆盖':future.note)+(late?'；部分加工预计晚于刷新完成':'')};
  }

  function pendingDone(p,d){
    const f=d.farm;
    if(p.kind==='craft-keep')return !!f.keep?.[p.arg||'egg']===p.keep;
    if(['craft-eggs','craft-milk','craft-wool'].includes(p.kind))return p.ids.every(id=>!f.animals.find(a=>a.id===id)?.productReady);
    if(p.kind==='craft-order')return f.orders?.day===p.day&&f.orders.done?.includes(p.index);
    if(p.kind==='craft-eat')return f.today.day===p.day&&(f.today.breadEnergy||0)>=p.before+p.count*5;
    if(p.kind==='craft-start'||p.kind==='craft-take'){const s=f.structures.find(s=>s.id===p.id);return !!s&&JSON.stringify(s.queue||[])!==p.before}
    return false;
  }
  window.__farmWorkshop={recipes,stock,week,orderDay,orderReset,orderCap,budgetLeft,syncBoard,readBudget,invalidateBudget,forecast,queued,feedWheat,demands,plan,pendingDone};
})();

/* All farm jobs share one queue. Writes use visible controls and the game's normal action handler. */
(() => {
  if(window.__farmAutomation)return '农务队列已安装';
  const R=window.__farmRules,W=window.__farmWorkshop;if(!R||!W)throw Error('缺少农务规则');
  const flags={fields:false,feed:false,collect:false,orchard:false,mine:false,oil:false,income:false,fishing:false,energy:false,workshop:false};
  let config={crop:'radish',reserve:10,smart:true,feedDays:2,feedGold:false,feedBudget:0,energyBudget:0,workshopEat:true,workshopPrep:true};
  try{const c=JSON.parse(localStorage.getItem('farm-helper.auto-farm-config'));if(R.crops[c?.crop])config.crop=c.crop;if(Number.isInteger(c?.reserve)&&c.reserve>=0&&c.reserve<=100)config.reserve=c.reserve}catch{}
  const handoff=window.__farmHandoff;if(handoff?.farm){config.crop=R.crops[handoff.farm.crop]?handoff.farm.crop:config.crop;config.reserve=handoff.farm.reserve??config.reserve;flags.fields=!!handoff.farm.enabled}
  if(handoff?.automation?.flags)for(const key of Object.keys(flags))if(key in handoff.automation.flags)flags[key]=!!handoff.automation.flags[key];
  const changedFlags=new Set();
  let removed=false,busy=false,epoch=0,lastRead=-Infinity,backoff=0,manualUntil=0,lastGrain='corn';
  let snapshotAt=-Infinity,snapshot=null,owner=null,ledger=null,leaseOwner=null,leasePending=false,leaseRelease=null,storageOK=true;
  let route=null,activeMark=null,needsReview=false,message='选择需要的自动功能',controller=null;
  let pending=null,host=null,sections={},controls={},notes={},requestCount=0,viewOnly=false;
  let board=null,orderBudget=null,budgetAt=-Infinity,workshopFault=null,workshopRetry=0;
  let lastPlan={jobs:[],hint:{}};
  const activity=window.__farmActivity;
  const prefix='farm-helper.farm-v2.';
  const visible=e=>!!e&&e.isConnected&&!e.hidden&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const panelOpen=()=>{const p=document.getElementById('panel');return visible(p)&&p.getAttribute('aria-hidden')!=='true'&&p.classList.contains('open')};
  const gameButton=(action,arg,root='#panel')=>{
    const es=[...document.querySelectorAll(root+' button[data-action="'+action+'"]')];
    return es.find(e=>(arg===undefined||e.dataset.arg===String(arg))&&visible(e))||null;
  };
  function write(key,data){try{localStorage.setItem(prefix+owner+'.'+key,JSON.stringify(data));return true}catch{storageOK=false;message='无法保存任务与预算，已暂停';return false}}
  const saveLedger=()=>write('ledger',ledger);
  function saveFlags(){if(owner)write('switches',flags)}
  function saveConfig(){if(owner)write('options',config);try{localStorage.setItem('farm-helper.auto-farm-config',JSON.stringify({crop:config.crop,reserve:config.reserve,lastGrain}))}catch{storageOK=false}}
  function loadOwner(d){
    const next=d.farm.owner;if(owner&&owner!==next)throw Error('账号已切换，请重新启动助手');
    if(owner)return;
    owner=next;
    try{
      const opts=JSON.parse(localStorage.getItem(prefix+owner+'.options')||'null');
      const savedFlags=JSON.parse(localStorage.getItem(prefix+owner+'.switches')||'null');
      if(savedFlags&&!handoff?.automation)for(const key of Object.keys(flags))if(!changedFlags.has(key)&&typeof savedFlags[key]==='boolean')flags[key]=savedFlags[key];
      if(opts){const initial=config;config={...config};for(const [key,value]of Object.entries(opts))assignOption(key,value);if(handoff?.farm){config.crop=initial.crop;config.reserve=initial.reserve}}
      ledger=JSON.parse(localStorage.getItem(prefix+owner+'.ledger')||'null');
    }catch{throw Error('无法读取已保存任务，请检查浏览器存储')}
    ledger??={day:R.calendar(d.farm,d.now).day,energySpent:0,pending:null};
    if(typeof ledger.day!=='string'||!Number.isFinite(ledger.energySpent)||ledger.energySpent<0||ledger.pending&&!['feed','collect','harvest','plant','orchard','mine','oil','income','energy','craft-start','craft-take','craft-order','craft-keep','craft-eggs','craft-milk','craft-wool','craft-eat','fish-bait','fish-run','fish-reel'].includes(ledger.pending.kind))throw Error('保存的任务数据异常，请检查后再启动');
    pending=ledger.pending;
    saveFlags();
    syncControls();
  }
  async function acquireLease(){
    if(leaseOwner===owner)return true;
    if(!navigator.locks?.request){message='浏览器无法锁定单个助手，暂停避免重复操作';return false}
    if(leasePending)return false;
    leasePending=true;
    return new Promise(resolve=>{
      void navigator.locks.request('farm-helper-actions:'+owner,{ifAvailable:true},async lock=>{
        if(!lock){message='等待其他标签页释放助手';resolve(false);return}
        if(!Object.values(flags).some(Boolean)&&!pending){resolve(false);return}
        leaseOwner=owner;resolve(true);
        await new Promise(done=>leaseRelease=done);leaseOwner=null;
      }).catch(()=>{message='无法锁定当前助手';resolve(false)}).finally(()=>leasePending=false);
    });
  }
  function releaseIfIdle(){if(!Object.values(flags).some(Boolean)&&!pending){leaseRelease?.();leaseRelease=null}}
  function pauseReason(){
    if(window.__farmManualCapture)return '手动测试记录中，全部自动农务已暂停';
    if(window.__farmVersionGuard?.isBlocked())return '游戏版本保护：全部自动功能已暂停';
    if(window.__farmVerification?.isBlocked())return '等待人工验证，所有农务已暂停';
    if(document.hidden)return '切回游戏后继续';
    if(!visible(gameButton('dock','fields','#dock')))return '等待回到自己的农场';
    const battle=document.getElementById('battle-ui'),modal=document.getElementById('modal');
    if(visible(battle)||visible(modal))return '战斗或弹窗中，等待继续';
    if(performance.now()<manualUntil)return '手动操作优先，稍后继续';
    const active=document.activeElement;
    if(active?.closest?.('input,textarea,select,[contenteditable="true"]')&&!Object.values(sections).some(s=>s.contains(active)))return '等待输入完成';
    return null;
  }
  function workerState(){
    const game=window.__farmGame||window.temp1;
    const scene=game?.scene?.scenes.find(s=>s.worker&&s.sys?.isActive?.());
    if(!scene||typeof scene.worker.pending!=='function')return null;
    const jobs=scene.worker.pending();return Array.isArray(jobs)?jobs:null;
  }
  function reserveFeed(d){
    if(!flags.feed)return config.reserve;
    const q=R.quote(d),bs=new Map();for(const a of d.farm.animals){const b=R.building(d.farm,a);if(b)bs.set(b.id,b)}
    return Math.max(config.reserve,[...bs.values()].reduce((n,b)=>n+(b.fedWindow!==q.cal.meal?2:0)+(q.cal.hour<12?2:0),0));
  }
  function candidates(d){
    const f=d.farm,q=R.quote(d),jobs=[];const hint={};
    if(flags.feed){
      const p=R.feedPlan(d);hint.feed=p.hungry.length?'本餐 '+p.hungry.length+' 只待喂 · 需 '+p.bags+' 袋'+(p.coins?' · 预计 '+p.coins+' 金币':''):'本餐已喂饱';
      if(p.hungry.length){
        if(p.coins&&(!config.feedGold||config.feedBudget<=0))hint.feed+='；未允许金币买饲料';
        else if(p.coins&&Math.ceil(p.coins*1.15)+p.hungry.length+Math.max(0,f.today.feedSpent||0)>config.feedBudget)hint.feed+='；超出今日金币限额';
        else{
          const production=p.hungry.reduce((n,a)=>{const r=R.animals[a.kind];return n+q.value(r.meal*2)},0);
          jobs.push({kind:'feed',route:'animals',action:'feed-all',energy:p.energy,value:Math.max(0,production-p.coins),spend:p.coins,ids:p.hungry.map(a=>a.id),before:p.hungry.map(a=>({id:a.id,lastFedAt:a.lastFedAt})),meal:p.meal});
        }
      }
    }
    let workshopPlan=null;
    if(flags.workshop){try{workshopPlan=W.plan(d,config,board);hint.workshop=workshopFault||workshopPlan.note;jobs.push(...workshopPlan.jobs)}catch(error){hint.workshop=error.message}}
    if(flags.collect){const p=R.collectPlan(d);hint.collect=p.ready.length?p.ready.length+' 份产品待收':'等待动物产出';if(p.ready.length){if(flags.workshop&&(!board||board.day!==W.orderDay(d)||board.owner!==f.owner))hint.collect='等作坊确认鸡蛋、牛奶和羊毛用途';else if(p.value>0&&p.value+2>q.room)hint.collect='暂存空间不足，暂停收集';else jobs.push({kind:'collect',route:'animals',action:'collect-all',energy:p.energy,value:Math.min(p.value,q.remaining),ids:p.ready.map(a=>a.id)})}}
    if(flags.orchard){const ps=R.orchardPlan(d);hint.orchard=ps.length?ps.length+' 座果园可采摘':'等待水果成熟';for(const p of ps){if(p.value>0&&p.value+2>q.room){hint.orchard='暂存空间不足，暂停采摘';continue}jobs.push({kind:'orchard',route:'orchard',id:p.id,action:p.ready.length>1?'harvest-orchard':'harvest-tree',arg:p.ready[0].i,before:p.ready.map(x=>({i:x.i,lastHarvestAt:x.lastHarvestAt})),energy:2,value:Math.min(p.value,q.remaining)})}}
    if(flags.income){const daily=q.pay(q.l.passive)*q.bonus,amount=Math.min(daily*2,(f.passiveBank||0)+daily*Math.max(0,d.now-f.passiveSince)/86400000);hint.income='约每小时领取，避免满仓';if(amount>=Math.max(1,daily/24))jobs.push({kind:'income',action:'claim',root:'#hud',energy:0,value:Math.floor(amount),before:f.passiveSince})}
    if(flags.mine){hint.mine='等两车一起收，减少能量消耗';for(const s of f.structures.filter(s=>s.kind==='mine'&&R.built(s,d.now))){const start=Math.max(s.mineAt||s.buildUntil||0,s.buildUntil||0);if(d.now-start>=43200000)jobs.push({kind:'mine',route:'rwa',id:s.id,action:'rwa-mine',arg:s.id,before:s.mineAt||0,energy:2,value:0})}}
    if(flags.oil){hint.oil='每天抽取一次，保留石油库存';for(const s of f.structures.filter(s=>s.kind==='oilwell'&&R.built(s,d.now)&&s.collectDay!==q.cal.day))jobs.push({kind:'oil',route:'rwa',id:s.id,action:'rwa-fuel',arg:s.id,day:q.cal.day,energy:2,value:0})}
    if(flags.fishing){try{const p=R.fishingPlan(d);hint.fishing=p.note;jobs.push(...p.jobs)}catch(error){hint.fishing=error.message}}
    if(flags.fields){
      const usable=f.fields.filter(x=>R.built(x,d.now)),ripe=usable.filter(x=>R.crops[x.crop]&&d.now-x.plantedAt>=R.crops[x.crop].ms),blank=usable.filter(x=>!x.crop);
      const next=usable.filter(x=>R.crops[x.crop]&&d.now-x.plantedAt<R.crops[x.crop].ms).map(x=>x.plantedAt+R.crops[x.crop].ms-d.now);
      if(ripe.length){
        const siloSpace=Math.round(7*q.l.harvest/.02)-((f.silo?.wheat||0)+(f.silo?.corn||0));
        let grainSlots=Math.max(0,siloSpace),value=0;
        for(const x of ripe){if(['wheat','corn'].includes(x.crop)&&grainSlots>0)grainSlots--;else value+=q.value(R.crops[x.crop].value)}
        if(next.some(t=>t<=60000))hint.fields='等待附近一批一起成熟';
        else if(value>0&&value+2>q.room)hint.fields='暂存空间不足，暂停收获';
        else jobs.push({kind:'harvest',route:'fields',action:'harvest-all',energy:2,value:Math.min(value,q.remaining),before:ripe.map(x=>({id:x.id,crop:x.crop,plantedAt:x.plantedAt}))});
      }else if(blank.length){
        const extraWheat=workshopPlan?.wheat||0;
        const choice=R.chooseCrop(d,{...config,workshopWheat:extraWheat},flags,lastGrain);hint.fields=choice.message;
        if(choice.crop){const c=R.crops[choice.crop],batchValue=blank.length*q.value(c.value),cash=!['corn','wheat'].includes(c.id);
          if(cash&&batchValue+2>q.room)hint.fields='本批产出可能超过暂存空间，暂停播种';
          else jobs.push({kind:'plant',route:'fields',action:'plant-all',arg:c.id,crop:c.id,energy:2,value:cash&&d.now+c.ms<q.cal.nextMidnight?Math.min(batchValue,Math.max(0,q.remaining-q.carry-R.futureValue(d,flags))):0,before:blank.map(x=>({id:x.id,crop:x.crop,plantedAt:x.plantedAt}))});
        }
      }else hint.fields='等待作物成熟';
    }
    if(flags.workshop&&config.workshopEat&&workshopPlan?.eatAvailable){
      const next=jobs.find(j=>j.energy>0),reserve=reserveFeed(d);
      const missing=Math.max(0,(next?.energy||0)+reserve-f.today.energy);
      const count=Math.min(workshopPlan.eatAvailable,Math.ceil(missing/5));
      const bakery=f.structures.find(s=>s.kind==='bakery'&&R.built(s,d.now));
      if(count&&next&&bakery)jobs.unshift({kind:'craft-eat',route:'rwa',id:bakery.id,action:'eat-bread',arg:String(count),count,before:f.today.breadEnergy||0,energy:0,value:0});
    }
    return {jobs,hint};
  }
  function click(el){if(window.__farmVersionGuard?.isBlocked())return false;if(!visible(el)||el.disabled)return false;el.click();return true}
  function openDock(arg){route.steps++;return click(gameButton('dock',arg,'#dock'))}
  function navigate(job){
    const key=job.route+':'+(job.id||'');if(!route||route.key!==key)route={key,steps:0,detail:false};
    if(route.steps>6){message='游戏按钮变化或页面未打开，请手动检查';return false}
    if(job.root)return !!gameButton(job.action,job.arg,job.root);
    if(job.route==='animals'){
      if(panelOpen()&&gameButton('feed-all')&&gameButton('collect-all'))return true;
      openDock('animals');return false;
    }
    if(['coop','barn','sheepPen'].includes(job.route)){
      const animal={coop:['egg','chicken'],barn:['milk','cow'],sheepPen:['wool','sheep']}[job.route];
      if(panelOpen()&&gameButton('keep-toggle',animal[0])&&gameButton('collect',animal[1]))return true;
      if(panelOpen()&&click(gameButton('building',job.route))){route.steps++;return false}
      openDock('animals');return false;
    }
    if(job.route==='orders'){
      if(panelOpen()&&document.querySelector('#panel .orders'))return true;
      if(panelOpen()&&click(gameButton('orders'))){route.steps++;return false}
      openDock('more');return false;
    }
    if(job.route==='fields'){
      if(panelOpen()&&gameButton('harvest-all')){
        if(job.kind==='plant'&&!gameButton('plant-all',job.crop)){if(click(gameButton('plant-all-open')))route.steps++;return false}
        return true;
      }
      openDock('fields');return false;
    }
    if(job.route==='orchard'){
      if(route.detail&&panelOpen()&&gameButton(job.action,job.arg))return true;
      if(panelOpen()&&click(gameButton('orchard',job.id))){route.detail=true;route.steps++;return false}
      route.detail=false;openDock('fields');return false;
    }
    if(job.route==='rwa'){
      if(panelOpen()&&(gameButton(job.action,job.arg??job.id)||job.kind==='fish-bait'&&gameButton('buy-bait')||job.kind==='fish-run'&&gameButton('pond-fish-n')||job.kind==='craft-start'&&gameButton('craft-start',job.recipe+':1')||job.kind==='craft-eat'&&gameButton('eat-bread')))return true;
      if(panelOpen()&&click(gameButton('rwa-open',job.id))){route.steps++;return false}
      if(panelOpen()&&click(gameButton('shop','build'))){route.steps++;return false}
      openDock('shop');return false;
    }
    if(job.route==='energy'){
      if(panelOpen()&&gameButton('energy','10'))return true;
      openDock('more');return false;
    }
    return false;
  }
  function readOrders(d){
    const root=document.querySelector('#panel .orders');if(!visible(root))return null;
    const rows=[...root.querySelectorAll('.order')];if(rows.length!==3)throw Error('订单布局变化，请手动检查');
    let available=W.budgetLeft(d,orderBudget?.left??0);
    const orders=rows.map((row,index)=>{
      const items={};for(const el of row.querySelectorAll('.ord-item')){
        const text=el.textContent.toLowerCase(),matches=[['egg',/egg|鸡蛋/],['flour',/flour|面粉/],['bread',/bread|loaf|loaves|面包/],['milk',/milk|牛奶/],['butter',/butter|黄油/],['cheese',/cheese|奶酪|干酪/],['wool',/wool|羊毛/],['cloth',/cloth|布料|织物/]].filter(([,re])=>re.test(text));
        const amount=el.querySelector('small')?.textContent.match(/\/\s*([\d,]+)/);
        if(matches.length!==1||!amount)throw Error('出现未知订单物品，作坊暂停');
        const key=matches[0][0],count=Number(amount[1].replaceAll(',',''));if(items[key]||!Number.isSafeInteger(count)||count<=0)throw Error('订单数量无法确认');items[key]=count;
      }
      if(!Object.keys(items).length)throw Error('订单物品无法读取');
      const payout=row.querySelector('.ord-side b')?.textContent||'';
      const token=payout.match(/\+\s*([\d,]+)/),reward=token?Number(token[1].replaceAll(',','')):0;
      const done=row.classList.contains('done'),button=row.querySelector('button[data-action="order-fill"]');
      if(!done&&button?.dataset.arg!==String(index))throw Error('订单序号无法确认');
      const allocated=done?0:Math.min(reward,available);available-=allocated;
      return {index,items,baseReward:reward,reward:allocated,done};
    });
    return {owner:d.farm.owner,day:W.orderDay(d),at:d.now,orders};
  }
  function prepareFishingButton(job){
    if(job.kind==='fish-run'){
      const input=document.querySelector('#panel input[data-draft="pond.n"]');
      if(!visible(input)||input.disabled||Number(input.max)<job.count)return false;
      input.value=String(job.count);input.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    }
    if(job.kind!=='fish-bait'||gameButton('buy-bait',job.arg))return true;
    const original=gameButton('buy-bait');if(!original||job.count<1||job.count>20)return false;
    const button=el('button','补购 '+job.count+' 鱼饵 · '+job.cost);button.type='button';button.className='btn small fh-workshop-action';button.dataset.action='buy-bait';button.dataset.arg=job.arg;original.parentElement.append(button);return true;
  }
  function prepareWorkshopButton(job){
    if(!['craft-start','craft-eat'].includes(job.kind)||gameButton(job.action,job.arg))return;
    const original=gameButton(job.action,job.kind==='craft-start'?job.recipe+':1':undefined);
    if(!original||original.disabled)return;
    const max=Math.max(...[...document.querySelectorAll('#panel button[data-action="'+job.action+'"]')].filter(visible).map(b=>Number(b.dataset.arg?.split(':').at(-1))||0));
    if(job.count<1||job.count>max||job.count>(job.kind==='craft-start'?8:4))return;
    // Add an explicit quantity control; it goes through the game's ordinary click handler.
    const button=el('button',job.kind==='craft-start'?'助手制作 '+job.count+' 批':'助手吃 '+job.count+' 个');
    button.type='button';button.className='btn small fh-workshop-action';button.dataset.action=job.action;button.dataset.arg=job.arg;original.parentElement.append(button);
  }
  function dayLedger(d){
    const day=R.calendar(d.farm,d.now).day;
    if(ledger.day!==day){ledger.day=day;ledger.energySpent=0;ledger.feedSpent=0;saveLedger()}
  }
  function storePending(job,d,reserved=0){
    pending={...job,at:d.now,activeMs:0,day:job.day||R.calendar(d.farm,d.now).day,reserved};
    ledger.pending=pending;
    if(job.kind==='energy')ledger.energySpent+=reserved;
    if(!saveLedger()){pending=null;return false}return true;
  }
  function submit(job,d){
    if(window.__farmVersionGuard?.isBlocked())return false;
    if(pauseReason()||leaseOwner!==owner||!storageOK||viewOnly||!flags[job.kind.startsWith('fish-')?'fishing':job.kind.startsWith('craft-')?'workshop':job.kind==='harvest'||job.kind==='plant'?'fields':job.kind==='orchard'?'orchard':job.kind==='income'?'income':job.kind])return false;
    if(job.kind==='craft-order'){
      const currentBoard=readOrders(d),current=currentBoard?.orders.find(o=>o.index===job.index);
      if(!current||current.done||JSON.stringify(current.items)!==JSON.stringify(job.items)){board=currentBoard;message='订单奖励或内容变化，重新核对';return false}
    }
    if(!prepareFishingButton(job))return false;
    prepareWorkshopButton(job);
    const el=gameButton(job.action,job.arg,job.root||'#panel');if(!el||el.disabled)return false;
    let reserved=0;
    if(job.kind==='feed'&&job.spend){reserved=Math.ceil(job.spend*1.15)+job.ids.length;if(!config.feedGold||reserved+(d.farm.today.feedSpent||0)>config.feedBudget||d.farm.tokens<reserved){message='金币饲料超出预算或余额不足';return false}}
    if(job.kind==='fish-bait'){
      const quotes=[...document.querySelectorAll('#panel button[data-action="buy-bait"]')].filter(b=>!b.classList.contains('fh-workshop-action')&&visible(b)).map(b=>({count:Number(b.dataset.arg),cost:Number((b.textContent.match(/[\d,]+(?:\.\d+)?/g)||[]).at(-1)?.replaceAll(',',''))}));
      const good=quotes.some(x=>x.count>0&&Math.abs(x.cost/x.count-job.unit)<.01);
      if(!good||d.farm.tokens<job.cost){message='鱼饵报价变化或余额不足，等待重新核对';return false}
      reserved=job.cost;
    }
    if(job.kind==='energy'){
      const shown=Number((el.textContent.match(/[\d,]+(?:\.\d+)?/g)||[]).at(-1)?.replaceAll(',',''));
      const expected=R.quote(d).energy10;
      if(!(shown>0)||Math.abs(shown-expected)>1){message='能量报价尚未同步，等待下一次检查';return false}
      reserved=Math.ceil(shown*1.15);
      if(!flags.energy||config.energyBudget<=0||ledger.energySpent+reserved>config.energyBudget||d.farm.tokens<reserved){message='能量购买超过每日预算或余额不足';return false}
    }
    if(!storePending(job,d,reserved))return false;
    requestCount++;
    if(!click(el)){pending=null;ledger.pending=null;saveLedger();return false}
    activity?.add('submitted','已提交：'+activity.describe(job));
    if(job.kind==='craft-order'){budgetAt=-Infinity;W.invalidateBudget(owner)}
    route=null;activeMark=performance.now();
    message=job.kind==='energy'?'已购买一小包能量，等待确认':'已提交'+({feed:'喂食',collect:'动物收集',orchard:'果园采摘',income:'村庄领取',mine:'矿车收取',oil:'抽油',harvest:'批量收获',plant:'批量播种','craft-start':'作坊加工','craft-take':'成品收取','craft-order':'订单交付','craft-keep':'产物保留设置','craft-eggs':'鸡蛋收取','craft-milk':'牛奶收取','fish-bait':'鱼饵购买','fish-run':'连续钓鱼','fish-reel':'收竿','craft-eat':'面包补能量'}[job.kind]||'农活')+'，等待游戏完成';
    return true;
  }
  async function tick(force=false){
    if(removed||busy||(!force&&!Object.values(flags).some(Boolean)&&!pending))return;
    const reason=pauseReason();if(reason){message=reason;activeMark=null;render();return}
    if(performance.now()<backoff||performance.now()-lastRead<5000)return;
    busy=true;lastRead=performance.now();const generation=epoch;
    controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),10000);
    try{
      const response=await fetch('/api/farm',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('读取失败 '+response.status);
      const d=await response.json(),f=d.farm;
      if(!f||!Array.isArray(f.fields)||!Array.isArray(f.animals)||!Array.isArray(f.structures)||!Number.isFinite(f.today?.energy)||!Number.isFinite(d.now)||d.owner!==f.owner||d.access?.open!==true)throw Error('农场数据或访问状态不匹配');
      if(removed||generation!==epoch||pauseReason())return;
      R.quote(d);snapshot=d;snapshotAt=performance.now();loadOwner(d);dayLedger(d);
      if(!Object.values(flags).some(Boolean)&&!pending){releaseIfIdle();message='选择需要的自动功能';return}
      if(!storageOK||!await acquireLease())return;
      if(pending){
        if(R.pendingDone(pending,d)||W.pendingDone(pending,d)){
          activity?.add('done','游戏已确认：'+activity.describe(pending));
          if(pending.kind==='plant'&&['corn','wheat'].includes(pending.crop)){lastGrain=pending.crop;saveConfig()}
          pending=null;ledger.pending=null;needsReview=false;activeMark=null;saveLedger();releaseIfIdle();
        }else{
          const now=performance.now();pending.activeMs+=(activeMark===null?0:Math.min(15000,Math.max(0,now-activeMark)));activeMark=now;ledger.pending=pending;saveLedger();
          if(pending.activeMs>180000){needsReview=true;message='任务 3 分钟未确认；请检查游戏队列，再点重新检查'}
          else message='等待已提交农活完成，不重复下单';return;
        }
      }
      if(needsReview){message='等待手动检查农活队列';return}
      const queued=workerState();if(queued===null){message='无法确认农夫队列，请等待游戏加载';return}if(queued.length){if(flags.fishing&&f.fishing){const progress=R.fishingPlan(d).note;if(notes.fishing)notes.fishing.textContent=progress;message=f.fishing.line?'正在钓鱼 · '+progress:'农夫还有 '+queued.length+' 项任务，等待完成'}else message='农夫还有 '+queued.length+' 项任务，等待完成';return}
      const workers=Math.max(1,Number(f.farmers)||1),building=f.structures.concat(f.fields).filter(s=>s.buildStart<=d.now&&s.buildUntil>d.now).length;
      if(building>=workers){message='所有农夫都在施工，暂不排新农活';return}
      if(board&&(board.owner!==f.owner||board.day!==W.orderDay(d)))board=null;
      const urgentFeed=flags.feed&&R.feedPlan(d).hungry.length>0;
      if(flags.workshop&&!urgentFeed&&d.now>=workshopRetry){try{
          if(d.now-budgetAt>=30000||Number.isFinite(budgetAt)&&new Date(budgetAt).toISOString().slice(0,10)!==new Date(d.now).toISOString().slice(0,10)){
            const result=await W.readBudget(owner,d.now,controller.signal);
            if(removed||generation!==epoch||pauseReason())return;
            orderBudget=result.budget;budgetAt=d.now-result.ageMs;
          }
        if(!board){
          if(!navigate({route:'orders'})){message='打开订单板，核对今日需求与奖励';return}
          board=readOrders(d);if(!board){message='等待订单板加载';return}route=null;workshopFault=null;
        }
        W.syncBoard(board,d,orderBudget.left);
      }catch(error){board=null;route=null;workshopFault=error.message;workshopRetry=d.now+30000}}
      const {jobs,hint}=candidates(d);lastPlan={jobs,hint};for(const [k,v]of Object.entries(hint))if(notes[k])notes[k].textContent=v;
      let waiting=null;
      for(const job of jobs){
        const q=R.quote(d),protectedEnergy=['feed','collect','income'].includes(job.kind)?0:reserveFeed(d);
        if(f.today.energy<job.energy){
          const packs=Math.ceil((job.energy-f.today.energy)/10),fullCost=Math.ceil(q.energy10*1.15)*packs;
          if(flags.energy&&job.value>fullCost&&ledger.energySpent+fullCost<=config.energyBudget){
            const buy={kind:'energy',route:'energy',action:'energy',arg:'10',before:f.today.energy,bought:f.today.bought||0,energy:0,value:job.value};
            if(navigate(buy))submit(buy,d);else message='打开能量小包，检查价格和预算';return;
          }
          waiting='能量不足：本项需 '+job.energy+'，等待补充';continue;
        }
        if(job.energy&&job.kind!=='feed'&&job.kind!=='collect'&&!['craft-eggs','craft-milk'].includes(job.kind)&&f.today.energy<job.energy+protectedEnergy){waiting='为待喂动物保留能量，暂停其他农活';continue}
        if(!navigate(job)){message='打开'+({animals:'动物',fields:'田地',orchard:'果园',rwa:'矿油'}[job.route]||'游戏')+'面板';return}
        if(submit(job,d))return;
        waiting=message||'等待游戏按钮可用';
      }
      message=waiting||(flags.workshop&&workshopFault)||'等待作物、动物或下一项农活';
    }catch(error){if(!removed&&generation===epoch){message=error.name==='AbortError'?'读取超时，稍后重试':error.message;activity?.add('error',message);backoff=performance.now()+30000;activeMark=null}}
    finally{clearTimeout(timeout);controller=null;busy=false;if(!removed)render()}
  }
  function assignOption(key,value){
    if(key==='crop'){if(!R.crops[value])return false}
    else if(['smart','feedGold','workshopEat','workshopPrep'].includes(key)){if(typeof value!=='boolean')return false}
    else if(['reserve','feedDays','feedBudget','energyBudget'].includes(key)){
      const bounds={reserve:[0,100],feedDays:[1,7],feedBudget:[0,1000000],energyBudget:[0,1000000]}[key];
      if(!Number.isSafeInteger(Number(value))||Number(value)<bounds[0]||Number(value)>bounds[1])return false;value=Number(value);
    }else return false;
    config[key]=value;return true;
  }
  function configure(key,value){if(!assignOption(key,value))return false;epoch++;route=null;saveConfig();syncControls();render();return true}
  function set(key,value){
    if(!(key in flags))return false;flags[key]=!!value;epoch++;route=null;if(key==='workshop'){board=null;budgetAt=-Infinity;workshopFault=null;workshopRetry=0}
    changedFlags.add(key);saveFlags();
    activity?.add('setting',({fields:'田地',feed:'动物喂养',collect:'动物收集',orchard:'果园',mine:'矿车',oil:'石油',income:'村庄收入',energy:'能量补购',workshop:'作坊订单',fishing:'每日钓鱼'}[key]||key)+(flags[key]?'已开启':'已关闭'));
    if(!Object.values(flags).some(Boolean)){controller?.abort();releaseIfIdle()}
    message=flags[key]?'等待检查农务':'已暂停后续自动操作';syncControls();render();return true;
  }
  function onManual(e){if(!e.isTrusted||Object.values(sections).some(s=>s.contains(e.target))||e.target?.closest?.('#farm-compact-controls'))return;manualUntil=performance.now()+15000;route=null;activeMark=null}
  function onKey(e){onManual(e);if(e.isTrusted&&e.code==='Escape'){for(const key of Object.keys(flags)){flags[key]=false;changedFlags.add(key)}saveFlags();activity?.add('setting','Esc 已停止自动农务');epoch++;route=null;controller?.abort();releaseIfIdle();syncControls();message='已停止自动农务；已提交任务由游戏继续处理';render()}}
  document.addEventListener('pointerdown',onManual,true);window.addEventListener('keydown',onKey,true);
  const el=(tag,text)=>{const x=document.createElement(tag);if(text)x.textContent=text;return x};
  function check(parent,text,key,option=false){const label=el('label'),input=el('input');input.type='checkbox';input.dataset.setting=key;label.className='fh-option';label.append(input,document.createTextNode(text));parent.append(label);controls[key]={input,option};input.onchange=()=>{const value=input.checked;option?configure(key,value):set(key,value);input.blur()};return input}
  function number(parent,text,key,min,max){const label=el('label',text),input=el('input');label.className='fh-number';input.type='number';input.min=String(min);input.max=String(max);input.step='1';input.setAttribute('aria-label',text);label.append(input);parent.append(label);controls[key]={input,option:true};input.onchange=()=>{if(!configure(key,Number(input.value)))input.value=String(config[key]);input.blur()};return input}
  function note(parent,key,text){const n=el('p',text);n.className='fh-note';parent.append(n);if(key)notes[key]=n;return n}
  const field=el('section');field.id='farm-auto-controls';sections.field=field;
  check(field,'自动收菜并补种','fields');
  const select=el('select');select.setAttribute('aria-label','自动种植作物');for(const [id,name,minutes]of R.cropRows){const o=el('option',name+' · '+(minutes<60?minutes+' 分钟':minutes/60+' 小时'));o.value=id;select.append(o)}field.append(select);controls.crop={input:select,option:true};select.onchange=()=>{configure('crop',select.value);select.blur()};
  check(field,'按今日额度安排种植','smart',true);number(field,'粮食备足天数','feedDays',1,7);number(field,'保留能量','reserve',0,100);
  note(field,'fields','额度将满时补玉米/小麦；粮食充足则暂停');check(field,'果园自动采摘','orchard');note(field,'orchard','整园成熟果实一起收取');
  const animal=el('section');animal.id='farm-animal-controls';sections.animal=animal;
  check(animal,'自动喂饱动物','feed');note(animal,'feed','每个餐段检查，优先使用粮仓饲料');
  check(animal,'自动收集动物产品','collect');note(animal,'collect','先确认暂存空间，再批量收取');
  const feedDetails=el('details'),fs=el('summary','金币饲料设置');feedDetails.append(fs);check(feedDetails,'允许金币购买饲料','feedGold',true);number(feedDetails,'每日金币喂养限额','feedBudget',0,1000000);note(feedDetails,null,'包含当天手动金币喂养；0 表示禁止花金币。只用游戏自动补饲料，不去玩家市场购买。');animal.append(feedDetails);
  const daily=el('section');daily.id='farm-daily-controls';sections.daily=daily;
  for(const [key,label,text]of [['income','自动领取村庄收入','约每小时领取，避免满仓'],['mine','自动收取矿车','两车一起收；不出售金银'],['oil','自动抽取石油','每天一次；不出售石油']]){check(daily,label,key);note(daily,key,text)}
  check(daily,'每天买满20鱼饵并连续钓完','fishing');note(daily,'fishing','含当天手动购买；按游戏报价花金币。满额后鱼进鱼箱，不自动卖鱼或切饲料。');
  const ed=el('details'),es=el('summary','能量补购设置');ed.append(es);check(ed,'允许自动购买能量','energy');number(ed,'每日能量购买限额','energyBudget',0,1000000);note(ed,null,'只补 10 点小包；需有可估算的新增收益。未开启或限额为 0 时不购买。');daily.append(ed);
  const workshop=el('section');workshop.id='farm-workshop-controls';sections.workshop=workshop;
  check(workshop,'自动作坊与全部订单','workshop');
  note(workshop,null,'按订单保留鸡蛋、牛奶和羊毛，制作面粉、面包、黄油、奶酪和布料并收取成品；仅奖励星星的订单也完成。');
  check(workshop,'提前备次日订单','workshopPrep',true);
  const prepDetails=el('details'),prepSummary=el('summary','次日备货计划');prepDetails.append(prepSummary);workshop.append(prepDetails);
  const prepInfo=note(prepDetails,null,'开启作坊后核对今日规则，按次日预测备货；刷新后以实际订单为准。');prepInfo.style.whiteSpace='pre-line';
  check(workshop,'缺能量时吃多余面包','workshopEat',true);
  note(workshop,null,'每天最多吃 4 个；先留今天和次日订单所需面包。只用库存，不去市场买料。');
  note(workshop,'workshop','开启后读取今日订单，尽量合批生产');
  const workshopLines={};for(const [key,label]of [['mill','磨坊'],['bakery','面包房'],['dairy','乳品坊'],['loom','织布坊']]){workshopLines[key]=note(workshop,null,label+' · 等待读取');workshopLines[key].setAttribute('aria-label',label+'运行状态');}
  note(workshop,null,'小麦优先保留动物饲料。缺粮时需开启田地补种；喂养仍由动物页控制。暂停后已排加工继续，鸡蛋、牛奶和羊毛保留设置保持最后状态。');
  const state=el('p');state.id='farm-task-state';state.className='fh-task-state';state.setAttribute('role','status');state.setAttribute('aria-live','polite');
  const recheck=el('button','重新检查');recheck.type='button';recheck.className='fh-recheck';recheck.onclick=()=>{needsReview=false;if(pending)pending.activeMs=0;backoff=0;lastRead=-Infinity;activeMark=null;void tick(true)};
  function syncControls(){for(const [key,{input,option}]of Object.entries(controls)){if(document.activeElement===input)continue;if(input.type==='checkbox')input.checked=option?config[key]:flags[key];else input.value=String(config[key])}}
  function render(){syncControls();prepDetails.hidden=!config.workshopPrep;prepSummary.textContent='次日备货计划';prepInfo.textContent='读取今日订单后计算次日备货';if(snapshot&&flags.workshop&&board){try{const plan=W.plan(snapshot,config,board);prepInfo.textContent=plan.prep?.error?'次日备货暂停：'+plan.prep.error:plan.prep?plan.prep.day+' 08:00（北京时间）预计：'+plan.prep.summary.replaceAll('；','\n')+'\n'+(plan.prep.shortages.length?'还缺：'+plan.prep.shortages.map(x=>({egg:'鸡蛋',milk:'牛奶',wool:'羊毛',flour:'面粉',bread:'面包',butter:'黄油',cheese:'奶酪',cloth:'布料'}[x.item]||x.item)+'×'+x.count).join('、'):'库存和队列已覆盖')+(plan.prep.late?'；部分加工预计晚于刷新完成。':'。'):'读取今日订单后计算次日备货';prepSummary.textContent='次日备货 · '+(plan.prep?.error?'需核对':plan.prep?.late?'部分晚于刷新':plan.prep?.covered?'库存及队列已覆盖':'按缺口准备');for(const line of plan.lines||[]){const key={磨坊:'mill',面包房:'bakery',乳品坊:'dairy',织布坊:'loom'}[line.label];workshopLines[key].textContent=line.label+' · '+line.text;}}catch{}}state.textContent=message;recheck.hidden=!needsReview;window.__farmLayout?.mountTask?.(state,recheck)}
  function execution(){
    const now=performance.now(),enabled=Object.entries(flags).filter(([,v])=>v).map(([k])=>k),pause=pauseReason();
    const status=!storageOK||needsReview||now<backoff||workshopFault?'error':pause?'paused':pending?'running':enabled.length?'waiting':'idle';
    const f=snapshot?.farm,items=[],rows=[];
    if(f){
      items.push('能量 '+f.today.energy+' · 已提交 '+requestCount+' 次');
      if(flags.fishing){try{items.push(R.fishingPlan(snapshot).note)}catch{}}
      if(flags.workshop&&board){try{
        const p=W.demands(snapshot,board.orders,config.workshopEat);
        items.push('牛奶 '+W.stock(f,'milk')+'（需 '+p.need.milk+'） · 黄油 '+W.stock(f,'butter')+'（需 '+p.need.butter+'） · 奶酪 '+W.stock(f,'cheese')+'（需 '+p.need.cheese+'）');
        items.push('鸡蛋 '+W.stock(f,'egg')+'（需 '+p.need.egg+'） · 面粉 '+W.stock(f,'flour')+'（需 '+p.need.flour+'） · 面包 '+W.stock(f,'bread')+'（需 '+p.need.bread+'）');
        if(f.level>=3)items.push('羊毛 '+W.stock(f,'wool')+'（需 '+p.need.wool+'） · 布料 '+W.stock(f,'cloth')+'（需 '+p.need.cloth+'）');
      }catch{}}
      if(flags.workshop&&board){try{const plan=W.plan(snapshot,config,board);rows.push(...plan.lines);if(plan.prep)rows.push({label:'次日备货',text:plan.prep.error||plan.prep.day+' · '+plan.prep.summary+(plan.prep.covered?' · 已备齐或在队列中':plan.prep.late?' · 部分晚于刷新完成':' · 按缺口准备')})}catch{}}
    }
    const names={fields:'田地',feed:'喂养',collect:'收集',orchard:'果园',income:'村庄',mine:'矿车',oil:'石油',workshop:'作坊',fishing:'钓鱼'};
    for(const [key,text]of Object.entries(lastPlan.hint))if(flags[key])rows.push({label:names[key]||key,text});
    const next=lastPlan.jobs.find(j=>!pending||j.kind!==pending.kind);
    let nextText=next?'下一步：'+(activity?.describe(next)||next.kind):flags.workshop?(lastPlan.hint.workshop||'等待订单所需材料'):'等待下一批成熟或下一餐';
    if(pause)nextText=now<manualUntil?'手动操作结束后约 '+Math.max(1,Math.ceil((manualUntil-now)/1000))+' 秒继续':'条件恢复后继续原任务';
    if(now<backoff)nextText='约 '+Math.max(1,Math.ceil((backoff-now)/1000))+' 秒后重试';
    if(!enabled.length&&!pending)nextText='在各页开启需要的功能';
    let title=pending?(activity?.describe(pending)||'任务执行中'):status==='idle'?'自动农务未开启':status==='paused'?'农务已暂停':status==='error'?'需要关注':'农务巡检';
    const reviewReason=needsReview?'已提交的'+(activity?.describe(pending)||'农活')+'超过 3 分钟未确认；为避免重复操作，已暂停后续任务':null;
    const errorReason=!storageOK?'无法保存任务与预算，已暂停':reviewReason|| (now<backoff?message:null)||workshopFault;
    let reason=errorReason||pause||message;
    if(status==='error'){
      title=needsReview?'任务待确认：'+(activity?.describe(pending)||'农活'):'需要关注';
      if(pause)rows.push({label:'当前暂停',text:pause});
      if(needsReview)nextText='核对游戏中的实际结果后，点“重新检查”；不会自动重复提交';
    }
    if(status==='waiting'&&!lastPlan.jobs.length){
      const cropTimes=flags.fields&&f?f.fields.filter(x=>R.crops[x.crop]).map(x=>x.plantedAt+R.crops[x.crop].ms-snapshot.now).filter(t=>t>0):[];
      if(cropTimes.length){title='等待作物成熟';const minutes=Math.max(1,Math.ceil(Math.min(...cropTimes)/60000));nextText='下批作物约 '+(minutes>=60?Math.floor(minutes/60)+' 小时 '+minutes%60+' 分钟':minutes+' 分钟')+'后可收';reason='当前没有可立即执行的农务'}
if(flags.workshop&&lastPlan.hint.workshop){reason=lastPlan.hint.workshop;title=/羊毛/.test(reason)?'等待羊毛':/牛奶/.test(reason)?'等待牛奶':/鸡蛋/.test(reason)?'等待鸡蛋':/小麦/.test(reason)?'等待小麦':/加工/.test(reason)?'作坊加工中':title}
    }
    return {status,title,reason,items,next:nextText,rows,enabled:enabled.length,age:snapshot?Math.max(0,Math.floor((now-lastRead)/1000)):null};
  }
  function mount(parent){if(parent){parent.append(field);host?.remove();host=null}else if(!field.isConnected){host=el('aside');host.id='farm-auto-standalone';host.style.cssText='position:fixed;right:12px;top:168px;width:252px;z-index:2147483647;padding:12px;background:#16271d;color:#e6eee6;font:12px/1.5 system-ui';host.append(field,state);document.body.append(host)}}
  const timer=setInterval(()=>void tick(),5000);
  window.__farmAutomation={pauseForVersion:()=>{epoch++;controller?.abort();activeMark=null;route=null;message='游戏版本保护：全部自动功能已暂停';render()},readSnapshot:()=>({data:snapshot,ageMs:performance.now()-snapshotAt,budget:orderBudget,budgetAgeMs:snapshot?Math.max(0,snapshot.now-budgetAt)+performance.now()-snapshotAt:Infinity}),set,configure,sections,state,recheck,mount,execution,refresh:()=>tick(true),status:()=>({flags:{...flags},config:{...config},message,pending:pending?{...pending}:null,needsReview,requests:requestCount,owner,storageOK}),preview:d=>candidates(d),
    remove:()=>{removed=true;epoch++;clearInterval(timer);controller?.abort();leaseRelease?.();document.removeEventListener('pointerdown',onManual,true);window.removeEventListener('keydown',onKey,true);document.querySelectorAll('.fh-workshop-action').forEach(b=>b.remove());Object.values(sections).forEach(s=>s.remove());state.remove();recheck.remove();host?.remove();delete window.__farmAutomation;delete window.__farmAutoFarm;delete window.__farmRules;delete window.__farmWorkshop}};
  window.__farmAutoFarm={set:v=>set('fields',v),configure:(id,reserve=config.reserve)=>{if(!R.crops[id]||!Number.isInteger(Number(reserve))||Number(reserve)<0||Number(reserve)>100)return false;assignOption('crop',id);assignOption('reserve',Number(reserve));saveConfig();syncControls();return true},mount,status:()=>({enabled:flags.fields,crop:config.crop,reserve:config.reserve,message,pending:pending?.kind??null,requests:requestCount}),remove:()=>window.__farmAutomation?.remove()};
  mount(document.getElementById('farm-compact-controls'));syncControls();render();void tick(true);
  return '统一农务队列已安装；勾选所需功能后运行';
})();

/* Read-only earnings page. No actions, account writes or window navigation. */
(() => {
  if(window.__farmEarnings)return;
  const R=window.__farmRules,W=window.__farmWorkshop;
  const dayMs=86400000,battleLimits=[0,.55,1.28,2.93,6.6,14.67];
  const number=n=>Number.isFinite(n)?n.toLocaleString('zh-CN',{maximumFractionDigits:0}):'等待数据';
  const duration=ms=>{if(!Number.isFinite(ms))return '等待数据';const m=Math.max(1,Math.ceil(ms/60000));return m>=60?Math.floor(m/60)+'小时'+(m%60?m%60+'分':''):m+'分钟'};
  const meter=(earned,cap)=>({earned,cap,left:Math.max(0,cap-earned),pct:cap>0?Math.min(100,Math.max(0,earned/cap*100)):0});
  function model(d,now=d.now,budget=null,live=null){
    const f=d.farm,q=R.quote(d),cal=R.calendar(f,now),sameDay=cal.day===f.today.day;
    const today=R.calendar(f,d.now);
    const villageDaily=q.pay(q.l.passive)*q.bonus,villageCap=villageDaily*2;
    const villageStored=Number.isFinite(f.passiveSince)?Math.min(villageCap,Math.max(0,(f.passiveBank||0)+villageDaily*Math.max(0,now-f.passiveSince)/dayMs)):null;
    const battleCap=q.pay(battleLimits[f.level]),battleEarned=f.today.battleEarned;
    const active=live&&Number.isFinite(live.earned)&&live.cap>0;
    const harvest=sameDay?meter(f.today.harvestEarned,q.cap):null;
    const battle=sameDay&&(active||Number.isFinite(battleEarned))?meter(active?live.earned:battleEarned,active?live.cap:battleCap):null;
    const orders=f.orders?meter(f.orders.day===W.orderDay({...d,now})?f.orders.dayTokens||0:0,W.orderCap(d)):null;
    const mine=f.structures.find(s=>s.kind==='mine'),oil=f.structures.find(s=>s.kind==='oilwell');
    let mining={text:'未建矿场'};
    if(mine){
      if(!R.built(mine,now))mining={text:'建设中 · '+duration(mine.buildUntil-now)};
      else{
        const end=mine.buildUntil||0;let start=mine.mineAt??end;
        if(start>now||(end<start&&Number.isFinite(mine.buildStart)&&Math.abs(start-(mine.buildStart+14400000))<1000))start=end;
        start=Math.max(start,end);
        if(start>0){const elapsed=Math.max(0,now-start),carts=Math.min(2,Math.floor(elapsed/21600000));mining={text:carts+' / 2 车 · '+(carts===2?'已满，暂停生产':'下车约 '+duration(21600000-elapsed%21600000)),carts}}
        else mining={text:'等待矿场生产时间'};
      }
    }
    const oilText=!oil?'未建油井':!R.built(oil,now)?'建设中 · '+duration(oil.buildUntil-now):oil.collectDay===cal.day?'今日已抽取 · '+duration(cal.nextMidnight-now)+'后重置':'今日可抽取';
    const goods=f.goods,inventory=goods?['gold','silver','oil'].map((k,i)=>['金','银','油'][i]+' '+(Number.isFinite(goods[k])?goods[k].toLocaleString('zh-CN',{maximumFractionDigits:2}):'—')).join(' · '):'资源库存：等待数据';
    return {harvest,battle,carry:f.harvestCarry||0,carryCap:q.base*7,feedSpent:f.today.feedSpent||0,nftCapBonus:q.nftCapBonus,nftYieldBonus:q.nftYieldBonus,reset:cal.nextMidnight,sameDay,
      village:{stored:villageStored,cap:villageCap,hourly:villageDaily/24,fullIn:Number.isFinite(villageStored)&&villageDaily>0?(villageCap-villageStored)/villageDaily*dayMs:null},
      mining,oilText,inventory,orders,budget,orderReset:W.orderReset({...d,now}),
      day:today.day};
  }
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
  const root=el('section');root.id='farm-earnings-controls';root.setAttribute('aria-label','收益进度');
  const stamp=el('p','打开此页后读取收益数据');stamp.className='fh-earnings-stamp';root.append(stamp);
  const today=el('section'),todayHead=el('div'),todayTitle=el('h3','今日额度'),overall=el('span'),todayBody=el('div'),resetLine=el('p');
  today.className='fh-earnings-group';todayHead.className='fh-earnings-heading';overall.className='fh-earnings-overall';resetLine.className='fh-earnings-note fh-earnings-reset';todayHead.append(todayTitle,overall);today.append(todayHead,todayBody,resetLine);root.append(today);
  function disclosure(label){const box=el('details'),summary=el('summary',label),body=el('div');box.className='fh-earnings-details';box.append(summary,body);return {box,body}}
  const quota=disclosure('查看额度明细');root.append(quota.box);
  const stockSection=el('section'),stockHeading=el('h3','待收库存'),stockBody=el('div');stockSection.className='fh-earnings-group fh-earnings-stock';stockSection.append(stockHeading,stockBody);root.append(stockSection);
  const resources=disclosure('资源库存与生产时间');root.append(resources.box);
  const budgetNotice=el('p');budgetNotice.className='fh-earnings-warning';budgetNotice.hidden=true;root.append(budgetNotice);
  let shown=false,removed=false,busy=false,data=null,receivedAt=-Infinity,lastTry=-Infinity,budget=null,budgetAt=-Infinity,error='',budgetError='',controller=null,lastView='';
  function textLine(parent,label,value,sub){const row=el('div');row.className='fh-earnings-row';const line=el('div');line.className='fh-earnings-line';line.append(el('span',label),el('span',value));row.append(line);if(sub){const n=el('p',sub);n.className='fh-earnings-note';row.append(n)}parent.append(row)}
  function summaryRow(parent,label,amount,state,full=false){const row=el('div');row.className='fh-earnings-summary';row.dataset.full=String(full);row.append(el('span',label),el('span',amount),el('span',state));parent.append(row);return row}
  function progress(parent,label,value){
    const full=!!value&&value.cap>0&&value.left===0;
    summaryRow(parent,label,value?number(value.earned):'—',!value?'读取中':full?'✓ 已满':'还可得 '+number(value.left),full);
    if(!value||full)return;
    const bar=el('div');bar.className='fh-earnings-bar';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label',label+'今日额度');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');
    bar.setAttribute('aria-valuenow',String(Math.floor(value.pct)));bar.setAttribute('aria-valuetext',number(value.earned)+' / '+number(value.cap)+'，还可得 '+number(value.left));
    const fill=el('i');fill.style.width=value.pct+'%';bar.append(fill);parent.append(bar);
  }
  function render(){
    if(!shown||removed)return;
    const age=performance.now()-receivedAt,now=data?data.now+Math.max(0,age):Date.now();
    const scene=(window.__farmGame||window.temp1)?.scene?.scenes.find(s=>s.sys.settings.key==='battle');
    const goal=scene?.run?.active&&!scene.tut?window.__farmCombatGoal?.status?.():null;
    const live=Number.isFinite(goal?.cap)&&Number.isFinite(goal?.dailyBeforeRun)&&Number.isFinite(goal?.earned)?{cap:goal.cap,earned:goal.dailyBeforeRun+goal.earned}:null;
    let view=null;try{if(data)view=model(data,now,budget&&new Date(now-Math.max(0,performance.now()-budgetAt)).toISOString().slice(0,10)===new Date(now).toISOString().slice(0,10)?budget:null,live)}catch{}
    const ageText=Number.isFinite(age)?age<60000?'刚刚更新':Math.floor(age/60000)+'分钟前更新':'等待数据';
    const status=window.__farmVerification?.isBlocked()?'等待人工验证，暂停读取':document.hidden?'页面在后台，暂停读取':error?'读取失败，保留上次数据':view&&!view.sameDay?'跨日了，等待重新读取':age>=60000&&data?'数据已过期':'额度自动更新';
    stamp.textContent=status==='额度自动更新'?ageText:status+' · '+ageText;
    const key=JSON.stringify({view,budgetError});if(key===lastView)return;lastView=key;
    todayBody.replaceChildren();quota.body.replaceChildren();stockBody.replaceChildren();resources.body.replaceChildren();
    const metrics=[['收获',view?.harvest],['战斗',view?.battle],['作坊订单',view?.orders]];
    const complete=metrics.every(([,v])=>v&&v.cap>0&&v.left===0);
    overall.textContent=complete?'均已满额':metrics.some(([,v])=>!v)?'等待读取':'尚有可获额度';overall.dataset.full=String(complete);
    for(const [label,value]of metrics){progress(todayBody,label,value);textLine(quota.body,label,value?number(value.earned)+' / '+number(value.cap):'等待数据')}
    const periods=el('p','收获、战斗按农场当地午夜重置；订单按 UTC 00:00（北京时间08:00）刷新。');periods.className='fh-earnings-note';quota.body.append(periods);
    resetLine.textContent=view?'收获/战斗 '+duration(view.reset-now)+'后重置\n作坊订单 '+duration(view.orderReset-now)+'后重置':'等待农场日期';
    if(view){
      textLine(quota.body,'结转库存',number(view.carry)+' / '+number(view.carryCap));
      if(view.nftCapBonus>1)textLine(quota.body,'NFT质押收获额度','+'+Math.round((view.nftCapBonus-1)*100)+'%');
      if(view.nftYieldBonus>1)textLine(quota.body,'NFT质押产出加成','+'+Math.round((view.nftYieldBonus-1)*100)+'%');
      if(view.feedSpent>0)textLine(quota.body,'饲料增加额度','+'+number(view.feedSpent));
    }
    const shared=el('p','收获额度由作物、果园、动物及钓鱼共用。计价变化会调整当前上限，已得超过上限不表示仍可继续领取。');shared.className='fh-earnings-note';quota.body.append(shared);
    const v=view?.village;
    const villageRow=summaryRow(stockBody,'村庄收入',v?number(v.stored):'—',v?v.fullIn===0?'满仓待领':'持续累积':'读取中');if(villageRow&&v?.fullIn===0)villageRow.dataset.urgent='true';
    const carts=view?.mining.carts;
    const mineRow=summaryRow(stockBody,'矿场',Number.isFinite(carts)?carts+'/2车':'—',Number.isFinite(carts)?carts===2?'已满待收':carts===1?'等两车收取':'采集中':view?.mining.text||'读取中');if(mineRow&&carts===2)mineRow.dataset.urgent='true';
    summaryRow(stockBody,'油井','',view?.oilText.split(' · ')[0]||'读取中');
    textLine(resources.body,'村庄仓库',v?number(v.stored)+' / '+number(v.cap):'等待数据',v?'约 +'+number(v.hourly)+'/小时 · '+(v.fullIn===0?'已满仓，停止累积':duration(v.fullIn)+'后满仓'):null);
    textLine(resources.body,'矿场',view?.mining.text||'等待数据');textLine(resources.body,'油井',view?.oilText||'等待数据');
    const inventory=el('p',view?view.inventory+'（矿油额度独立）':'等待资源数据');inventory.className='fh-earnings-note';resources.body.append(inventory);
    const globalBudget=view?.budget;
    textLine(quota.body,'全服每日订单预算',globalBudget?.left===0?'已耗尽，仅星星':Number.isFinite(globalBudget?.left)?'剩余 '+number(globalBudget.left):'等待数据',budgetError||null);
    budgetNotice.hidden=globalBudget?.left!==0&&!budgetError;
    budgetNotice.textContent=globalBudget?.left===0?'全服订单金币预算已耗尽；订单仍可获得星星。':budgetError;

  }
  function syncCached(){
    const cached=window.__farmAutomation?.readSnapshot?.();
    if(cached?.data&&cached.ageMs<performance.now()-receivedAt){data=cached.data;receivedAt=performance.now()-cached.ageMs;error=''}
    if(cached?.budget&&cached.budgetAgeMs<performance.now()-budgetAt){budget=cached.budget;budgetAt=performance.now()-cached.budgetAgeMs;budgetError=''}
  }
  async function refresh(){
    if(!shown||removed)return;syncCached();render();
    if(window.__farmVersionGuard?.isBlocked()||busy||document.hidden||window.__farmVerification?.isBlocked())return;
    const t=performance.now();if(t-lastTry<30000)return;
    const farmDue=!data||t-receivedAt>=30000,budgetDue=!budget||t-budgetAt>=30000;
    if(!farmDue&&!budgetDue)return;
    busy=true;lastTry=t;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),10000);
    try{
      if(farmDue){
        const response=await fetch('/api/farm',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('农场读取失败');
        const d=await response.json();
        if(!d.farm||d.owner!==d.farm.owner||d.access?.open!==true||!Array.isArray(d.farm.structures)||!Number.isFinite(d.now))throw Error('等待本人农场数据');
        R.quote(d);if(removed)return;
        if(data&&data.owner!==d.owner){budget=null;budgetAt=-Infinity}
        data=d;receivedAt=performance.now();error='';
      }
      if(budgetDue){
        try{
          const result=await W.readBudget(data.owner,data.now+Math.max(0,performance.now()-receivedAt),controller.signal);
          if(removed)return;budget=result.budget;budgetAt=performance.now()-result.ageMs;budgetError='';
        }catch{budgetError='预算读取失败，稍后重试'}
      }
    }catch(e){error=e.message}
    finally{clearTimeout(timeout);busy=false;render()}
  }
  const timer=setInterval(()=>void refresh(),5000);
  window.__farmEarnings={pauseForVersion:()=>controller?.abort(),model,mount:parent=>parent.append(root),setVisible:v=>{shown=!!v;if(shown)void refresh()},status:()=>({shown,ageMs:performance.now()-receivedAt,error,budgetError}),
    remove:()=>{removed=true;clearInterval(timer);controller?.abort();root.remove();delete window.__farmEarnings}};
})();

/* Page-local input adapter. Uses existing Phaser keys and scene skill entry points. */
(() => {
  window.__farmBattleInput?.remove();
  const names={ArrowLeft:'LEFT',ArrowRight:'RIGHT',ArrowUp:'UP',ArrowDown:'DOWN'};
  const held=new Map();
  let lease=null;
  function event(){return {timeStamp:performance.now(),altKey:false,ctrlKey:false,shiftKey:false,metaKey:false,location:0}}
  function release(){
    clearTimeout(lease);lease=null;
    for(const key of held.keys())try{key.onUp(event())}catch{}
    held.clear();
  }
  function apply(scene,action){
    if(window.__farmManualCapture||window.__farmVersionGuard?.isBlocked()||scene.mode!=='play'||scene.paused||scene.hero?.dead||!(scene.run?.active||scene.tut)){release();return {casts:0,dodges:0}}
    const wanted=new Set(action.keys.filter(k=>names[k]).map(k=>scene.keys?.[names[k]]));
    if(wanted.has(undefined)||[...wanted].some(k=>typeof k.onDown!=='function'||typeof k.onUp!=='function'))throw Error('游戏输入结构已变化，请关闭自动战斗');
    for(const key of held.keys())if(!wanted.has(key)){key.onUp(event());held.delete(key)}
    for(const key of wanted)if(!held.has(key)){
      // Do not take ownership of a key already held by the player.
      if(key.isDown)continue;
      held.set(key,true);key.onDown(event());
    }
    clearTimeout(lease);lease=setTimeout(release,350);
    let casts=0,dodges=0;
    if(action.keys.includes('KeyE')){
      if(typeof scene.doStorm!=='function')throw Error('风暴入口已变化');
      const before=scene.hero.stormT;scene.doStorm();casts=before<0&&scene.hero.stormT>=0?1:0;
    }else if(action.keys.includes('Space')){
      if(typeof scene.doDodge!=='function')throw Error('闪避入口已变化');
      const before=scene.hero.dodgeT;scene.doDodge();dodges=before<0&&scene.hero.dodgeT>=0?1:0;
    }
    return {casts,dodges};
  }
  window.__farmBattleInput={apply,release,remove:()=>{release();delete window.__farmBattleInput}};
})();

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
    if(!e.isTrusted)return;
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
    if(window.__farmVersionGuard?.isBlocked())return '游戏版本保护：自动战斗已暂停';
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
      state={...state,phase:'running',message:action.message,target:action.target||'',enemies:frame.enemies.length,entering:frame.enemies.filter(e=>e.state==='enter').length,hiddenEnemies:frame.enemies.filter(e=>e.phased||e.state==='appear').length,attackable:frame.enemies.filter(e=>e.hittable&&e.state!=='enter').length,projectiles:frame.projectiles.length,recognized:true,frameMs:Math.round(performance.now()-started),casts:state.casts+result.casts,dodges:state.dodges+result.dodges,travelDodges:state.travelDodges+(action.intent==='travel'?result.dodges:0),intent:action.intent,riskLevel:action.riskLevel,killsPerMinute:seconds>=15?Math.round(kills*60/seconds):null,hits:s.run?.hits??0,threats:action.threats||0,hp:h.hp,wave:s.wave};
    }catch(error){set('enabled',false);state={...state,phase:'error',message:error.message}}
  }
  const timer=setInterval(observe,60);
  window.__farmCombat={set,status:()=>({...options,...state,goldGoal:window.__farmCombatGoal?.status?.(),manualPaused:Date.now()<manualUntil||manualKeys.size>0||manualPointer,choices:window.__farmCombatPerks?.status?.().choices??state.choices,perkMessage:window.__farmCombatPerks?.status?.().message,selecting:options.enabled&&window.__farmCombatPerks?.status?.().waiting}),remove:()=>{
    set('enabled',false);clearInterval(timer);mortarTracks.clear();window.__farmCombatPerks?.remove();
    window.removeEventListener('keydown',manual,true);window.removeEventListener('keyup',manual,true);window.removeEventListener('pointerdown',manual,true);window.removeEventListener('pointerup',manual,true);window.removeEventListener('pointercancel',manual,true);window.removeEventListener('blur',blur);window.removeEventListener('pagehide',hide);document.removeEventListener('visibilitychange',visibility);
    window.__farmBattleInput?.remove();delete window.__farmCombat;
  }};
})();

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
    if(window.__farmManualCapture||window.__farmVersionGuard?.isBlocked()||window.__farmVerification?.isBlocked?.())return true;
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
    ui.source.textContent=manualTarget===null?'默认：今日战斗上限 − 本局开始前今日累计；开局后固定本局目标。':'手动目标；点击“恢复默认”重新按今日剩余额度计算。';
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

/* Independent visible-button selection; never needs a debugger or game instance. */
(() => {
  window.__farmCombatPerks?.remove();
  let signature='',since=0,delay=0,clicked=false,choices=0,message='等待升级卡片';
  const visible=e=>!!e&&!e.hidden&&!!e.getClientRects().length&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
  function reset(){signature='';since=0;delay=0;clicked=false}
  function rank(b){
    const t=b.textContent.toLowerCase(),id=b.dataset.perk;
    if(id==='haste'||/attack (frequency|speed)|attack.*(faster|more often)|攻击频率|攻速/.test(t))return 1;
    if(id==='blade'||/hit damage|命中伤害|攻击伤害/.test(t))return 2;
    if(id==='reach'||/attack (range|reach)|sword.*(range|reach)|攻击范围|挥刀范围/.test(t))return 3;
    if(id==='swift'||/movement speed|移动速度/.test(t))return 4;
    if(id==='crit'||/critical|crit chance|crit damage|暴击/.test(t))return 5;
    if(id==='storm'||/storm|大招|风暴/.test(t))return 6;
    if(id==='magnet'||/pull loot|pickup range|拾取.*范围/.test(t))return 7;
    if(id==='thorns'||/thorns|反伤|荆棘/.test(t))return 8;
    if(id==='guard'||/max.*(health|hp)|armor|heal|regenerat|最大生命|生命上限|回血|护甲/.test(t))return 9;
    return null;
  }
  function tick(){
    const overlay=[...document.querySelectorAll('#modal,[role="dialog"],.cf-turnstile,iframe[src*="challenges.cloudflare.com"]')].some(visible);
    if(window.__farmManualCapture||window.__farmVersionGuard?.isBlocked()||!window.__farmCombat?.status?.().enabled||!window.__farmCombat?.status?.().perks||window.__farmCombat?.status?.().manualPaused||document.hidden||overlay||window.__farmVerification?.isBlocked?.()){reset();message='自动选卡暂停';return}
    const root=document.getElementById('battle-ui'),screen=root?.querySelector('.bui-screen');
    const cards=visible(root)&&visible(screen)?[...root.querySelectorAll('button.perk[data-perk]')].filter(b=>visible(b)&&!b.disabled):[];
    if(!cards.length){reset();message='等待升级卡片';return}
    const sig=screen.innerText;
    if(signature!==sig){signature=sig;since=performance.now();delay=1100+Math.random()*2400;clicked=false}
    if(clicked)return;
    const remaining=delay-(performance.now()-since);
    if(remaining>0){message='等待 '+(remaining/1000).toFixed(1)+' 秒后选择升级';return}
    const valid=cards.filter(b=>!b.querySelector('.dots')||b.querySelector('.dots i.next'));
    if(!valid.length){message='没有可确认的升级选项';return}
    const score=b=>Math.max(0,...[...b.textContent.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m=>Number(m[1])));
    if(cards.every(b=>rank(b)!==null))valid.sort((a,b)=>rank(a)-rank(b)||score(b)-score(a));
    const b=valid[0];if(!visible(b)||!b.isConnected||b.disabled){reset();return}
    clicked=true;choices++;message='已选升级：'+(b.querySelector('b')?.textContent||b.dataset.perk);
    window.__farmActivity?.add('battle',message);b.click();
  }
  const timer=setInterval(tick,100);
  window.__farmCombatPerks={status:()=>({choices,message,waiting:!!signature&&!clicked}),remove:()=>{clearInterval(timer);delete window.__farmCombatPerks}};
})();

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

/* Shared compact shell; one switch controls the entire battle routine. */
(() => {
  window.__farmCompact?.remove();
  const panel=document.createElement('aside');panel.id='farm-compact-controls';
  const title=document.createElement('div');title.textContent='农场助手';panel.append(title);
  const rows=[];
  for(const [name,key]of [['自动战斗','enabled']]){
    const row=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');
    row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0';label.textContent=name;
    button.type='button';button.style.cssText='font:inherit;font-size:11px;border:1px solid #6c9479;border-radius:4px;padding:3px 10px;min-width:50px;cursor:pointer';
    button.setAttribute('aria-label',name);button.setAttribute('aria-pressed','false');button.onclick=()=>{window.__farmCombat?.set(key,!window.__farmCombat.status()[key]);render()};row.append(label,button);panel.append(row);rows.push({key,button});
  }
  window.__farmAutoFarm?.mount(panel);
  const info=document.createElement('form');info.onsubmit=e=>e.preventDefault();
  window.__farmCombatGoal?.mount(info);
  const note=document.createElement('div');note.style.cssText='font-size:10px;color:#bdd1c2;line-height:1.6';info.append(note);panel.append(info);
  const detail=document.createElement('div');detail.style.cssText='font-size:10px;color:#bdd1c2;overflow-wrap:anywhere';
  const footer=document.createElement('div');footer.textContent='Esc 停止自动操作';panel.append(detail,footer);document.body.append(panel);
  function render(){
    const s=window.__farmCombat?.status?.();
    for(const {key,button}of rows){const on=!!s?.[key];button.textContent=on?'开启':'关闭';button.style.background=on?'#badcc3':'#263c30';button.style.color=on?'#193222':'#c4d5c9';button.setAttribute('aria-pressed',String(on));button.disabled=!s}
    note.textContent='生存优先：危险先撤离，小史莱姆优先走位；安全赶路闪避。波末随机安全区域等待，升级等待 1.1～3.5 秒。手动开局，Esc 停止。';
    detail.textContent=(s?.selecting?s.perkMessage:s?.message||'等待扩展连接')+' · 目标 '+(s?.enemies??0)+' · 弹道 '+(s?.projectiles??0)+' · 风暴 '+(s?.casts??0)+' 次 · 闪避 '+(s?.dodges??0)+' 次 · 升级 '+(s?.choices??0)+' 次';
  }
  const timer=setInterval(render,250);render();
  window.__farmCompact={remove:()=>{clearInterval(timer);panel.remove();delete window.__farmCompact}};
})();

/* Compact pages; switching pages never changes feature switches. */
(() => {
  const previous=window.__farmLayout?.status()||window.__farmHandoff?.layout;window.__farmLayout?.remove();
  const panel=document.getElementById('farm-compact-controls');if(!panel)return;
  document.getElementById('farm-verification-notice')?.remove();
  const original=[...panel.children],originalStyle=panel.getAttribute('style');
  const title=original[0],farm=document.getElementById('farm-auto-controls');
  const rows=original.filter(n=>n!==title&&n!==farm&&n.querySelector?.('button[aria-pressed]'));
  const goal=original.find(n=>n.tagName==='FORM'),footer=original.at(-1);
  const detail=original.find(n=>n!==title&&n!==farm&&n!==goal&&n!==footer&&!rows.includes(n));
  if(!title||rows.length!==1||!goal)return;
  const style=document.createElement('style');style.id='farm-helper-layout-style';
  style.textContent=`
#farm-compact-controls{position:fixed;right:12px;top:168px;width:268px;max-width:calc(100vw - 24px);max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;padding:12px;background:#16271d;color:#e6eee6;border:1px solid #42604b;border-radius:8px;font:12px/1.5 'PingFang SC','Microsoft YaHei',sans-serif;box-shadow:0 4px 16px #10201440;z-index:2147483647}
#farm-compact-controls [hidden]{display:none!important}
#farm-compact-controls .fh-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;cursor:grab;touch-action:none;user-select:none}
#farm-compact-controls .fh-head.fh-dragging{cursor:grabbing}
#farm-compact-controls .fh-head:focus-visible{outline:2px solid #e7d29d;outline-offset:3px}
#farm-compact-controls .fh-head>div{margin:0!important;font-size:12px!important;font-weight:650}
#farm-compact-controls button{font-family:inherit;cursor:pointer}
#farm-compact-controls .fh-version{margin-left:7px;font-size:10px;font-weight:400;color:#a6bcae;white-space:nowrap}
#farm-compact-controls .fh-fold{padding:2px 0;border:0;background:none;color:#abc2af;font-size:11px}
#farm-compact-controls .fh-tabs{display:flex;gap:3px;padding-bottom:8px;margin-bottom:10px;border-bottom:1px solid #42604b}
#farm-compact-controls .fh-tab{flex:1;padding:5px 4px;border:0;border-radius:4px;background:none;color:#abc2af;font-size:12px}
#farm-compact-controls .fh-tab[aria-selected=true]{background:#c7dfb8;color:#213721;font-weight:600}
#farm-compact-controls .fh-option{display:flex!important;align-items:center;justify-content:flex-start!important;gap:7px!important;margin:10px 0 0!important;font-size:12px!important}
#farm-compact-controls input[type=checkbox]{margin:0;width:13px;height:13px;accent-color:#b9d4a9;flex:none}
#farm-compact-controls .fh-number{display:flex!important;align-items:center;justify-content:space-between!important;gap:10px;margin-top:9px!important;font-size:11px!important}
#farm-compact-controls input[type=number]{width:76px!important;box-sizing:border-box;padding:3px 5px;font-size:11px;line-height:1.5;font-family:inherit;color:#e6eee6;background:#20382a;border:1px solid #63846b;border-radius:4px}
#farm-compact-controls select{width:100%;margin-top:8px;min-height:29px;padding:4px 6px;background:#20382a;color:#e6eee6;border:1px solid #63846b;border-radius:4px;font-size:11px;font-family:inherit}
#farm-compact-controls .fh-note{margin:4px 0 10px;color:#abc2af;font-size:10px;overflow-wrap:anywhere}
#farm-compact-controls details{border-top:1px solid #42604b;margin-top:12px;padding-top:9px}
#farm-compact-controls summary{font-size:11px;color:#abc2af;cursor:pointer}
#farm-compact-controls .fh-empty{font-size:11px;color:#abc2af;padding:4px 0 10px}
#farm-compact-controls .fh-battle-controls[hidden]+.fh-stats{display:none}
#farm-compact-controls .fh-stats>div{border:0!important;padding:5px 0 0!important;margin:0!important;font-size:10px!important;color:#abc2af!important}
#farm-compact-controls .fh-task-state{border-top:1px solid #42604b;padding-top:8px;margin:12px 0 0;font-size:10px;color:#c7d9c9;overflow-wrap:anywhere}
#farm-compact-controls .fh-execution{margin-top:16px;padding:12px;background:#0d1b14;border:1px solid #304738;border-radius:7px;box-sizing:border-box}
#farm-compact-controls .fh-execution-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:#a3bca9}
#farm-compact-controls .fh-execution-label{letter-spacing:.04em}
#farm-compact-controls .fh-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 6px;border-radius:4px;background:#26382e;color:#c0d0c4;font-size:10px;line-height:1.5;white-space:nowrap}
#farm-compact-controls [data-status=running] .fh-badge{background:#293d24;color:#d5e8c2}
#farm-compact-controls [data-status=waiting] .fh-badge{background:#3b3422;color:#e7d49d}
#farm-compact-controls [data-status=error] .fh-badge{background:#442c25;color:#f0baa5}
#farm-compact-controls .fh-current{margin:10px 0 6px;color:#e3eee2;font-size:12px;line-height:1.5;font-weight:600;overflow-wrap:anywhere}
#farm-compact-controls .fh-dot{width:6px;height:6px;border-radius:50%;background:#a7b9ac;flex:none}
#farm-compact-controls [data-status=running] .fh-dot{background:#bed99f}
#farm-compact-controls [data-status=waiting] .fh-dot{background:#e2cc90}
#farm-compact-controls [data-status=error] .fh-dot{background:#eeae96}
#farm-compact-controls .fh-execution p{font-size:10px;line-height:1.6;margin:5px 0;color:#b8ccbc;overflow-wrap:anywhere}
#farm-compact-controls .fh-execution .fh-next{color:#dce9d8;margin-top:7px}
#farm-compact-controls .fh-execution details{border:0;margin-top:12px;padding-top:0}
#farm-compact-controls .fh-execution summary{color:#adc8b4;font-size:10px}
#farm-compact-controls .fh-execution .fh-materials{color:#91ad99;margin-top:8px}
#farm-compact-controls .fh-overview{display:grid;grid-template-columns:40px 1fr;gap:5px 8px;font-size:10px;margin:9px 0;color:#b8ccbc}
#farm-compact-controls .fh-overview dt{color:#deeadb}
#farm-compact-controls .fh-overview dd{margin:0;overflow-wrap:anywhere}
#farm-compact-controls .fh-log{max-height:142px;overflow:auto;margin:8px 0 0;padding:0;list-style:none;font-size:10px;color:#b8ccbc}
#farm-compact-controls .fh-log li{padding:4px 0;border-bottom:1px solid #2b4333;overflow-wrap:anywhere}
#farm-compact-controls .fh-log time{color:#8fa995;margin-right:6px;font-variant-numeric:tabular-nums}
#farm-compact-controls .fh-mini{font-size:10px;color:#c7d9c9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px}
#farm-compact-controls .fh-recheck{margin-top:6px;background:#c7dfb8;color:#213721;border:0;border-radius:4px;padding:4px 7px;font-size:11px}
#farm-compact-controls .fh-footer{margin-top:9px!important;font-size:10px!important;color:#abc2af!important}
#farm-compact-controls :is(button,input,select):focus-visible{outline:2px solid #e7d29d;outline-offset:2px}
#farm-compact-controls #farm-earnings-controls{font-size:11px;font-variant-numeric:tabular-nums}
#farm-compact-controls .fh-earnings-stamp{font-size:10px;color:#91ad99;margin:0 0 12px}
#farm-compact-controls .fh-earnings-group{margin:0}
#farm-compact-controls .fh-earnings-group h3{font-size:11px;font-weight:600;margin:0;color:#dbe7d7}
#farm-compact-controls .fh-earnings-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
#farm-compact-controls .fh-earnings-overall{font-size:10px;color:#abc2af}
#farm-compact-controls .fh-earnings-overall[data-full=true]{color:#b9d4a9}
#farm-compact-controls .fh-earnings-summary{display:grid;grid-template-columns:60px minmax(0,1fr) minmax(0,96px);align-items:baseline;gap:4px;padding:6px 0;color:#dbe7dc}
#farm-compact-controls .fh-earnings-summary>span:nth-child(2){text-align:right;font-variant-numeric:tabular-nums}
#farm-compact-controls .fh-earnings-summary>span:last-child{text-align:right;font-size:10px;color:#9db7a5;overflow-wrap:anywhere}
#farm-compact-controls .fh-earnings-summary[data-full=true]>span:last-child{color:#b9d4a9}
#farm-compact-controls .fh-earnings-summary[data-urgent=true]>span:last-child{color:#e2cc90}
#farm-compact-controls .fh-earnings-row{margin:0 0 8px}
#farm-compact-controls .fh-earnings-line{display:flex;justify-content:space-between;align-items:baseline;gap:8px;color:#c5d7c8;overflow-wrap:anywhere}
#farm-compact-controls .fh-earnings-line>span:last-child{text-align:right}
#farm-compact-controls .fh-earnings-note{font-size:10px;line-height:1.5;color:#9db7a5;margin:4px 0 0}
#farm-compact-controls .fh-earnings-reset{margin-top:8px;white-space:pre-line}
#farm-compact-controls .fh-earnings-stock{margin-top:16px}
#farm-compact-controls .fh-earnings-stock h3{margin-bottom:8px}
#farm-compact-controls .fh-earnings-bar{height:3px;border-radius:2px;background:#304b39;overflow:hidden;margin:0 0 4px}
#farm-compact-controls .fh-earnings-bar i{display:block;height:100%;width:0;background:#aacb92}
#farm-compact-controls .fh-earnings-details{border:0;margin:8px 0 0;padding:0}
#farm-compact-controls .fh-earnings-details>summary{font-size:10px;color:#9db7a5;cursor:pointer;padding:4px 0}
#farm-compact-controls .fh-earnings-details>div{padding:8px 0 4px}
#farm-compact-controls .fh-earnings-warning{font-size:10px;line-height:1.5;color:#e2cc90;margin:12px 0 0}
#farm-compact-controls .fh-execution-compact{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;margin-top:12px;border:1px solid #35513e;border-radius:6px;background:#0e2117;color:#bfd3c4;font-size:10px;text-align:left}
#farm-compact-controls .fh-execution-compact>span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#farm-compact-controls .fh-execution-compact::after{content:'展开';color:#91ad99;flex-shrink:0}
#farm-compact-controls .fh-execution-compact[aria-expanded=true]::after{content:'收起'}
#farm-compact-controls [hidden]{display:none!important}

`;
  document.head.append(style);panel.removeAttribute('style');
  const make=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el};
  const version=make('span');version.className='fh-version';const currentVersion=window.__farmLauncher?.status?.().version;version.textContent=currentVersion?'v'+currentVersion:'';version.setAttribute('aria-label',currentVersion?'助手版本 '+currentVersion:'');title.append(version);
  const head=make('div');head.className='fh-head';const fold=make('button');fold.className='fh-fold';fold.type='button';fold.setAttribute('aria-label','收起或展开助手');head.append(title,fold);
  const body=make('div'),tabs=make('div');tabs.className='fh-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','助手功能');
  const pages={},buttons={},labels={battle:'战斗',field:'田地',animal:'动物',workshop:'作坊',daily:'日常',earnings:'收益'};
  for(const [id,name]of Object.entries(labels)){
    const tab=make('button',name),page=make('div');tab.type='button';tab.className='fh-tab';tab.id='farm-helper-tab-'+id;tab.setAttribute('role','tab');page.id='farm-helper-'+id+'-page';page.setAttribute('role','tabpanel');page.setAttribute('aria-labelledby',tab.id);tab.setAttribute('aria-controls',page.id);pages[id]=page;buttons[id]=tab;tabs.append(tab);
  }
  const empty=make('div','状态读取模式需要通过扩展启动。');empty.className='fh-empty';
  const battle=make('div');battle.className='fh-battle-controls';const waveNote=make('p','保留正常受伤与死亡；状态不可用时暂停输入。页面可见时失焦继续；页面隐藏或游戏暂停时停止输入；Esc 关闭自动战斗；结算确认后无操作5秒回村庄。');waveNote.className='fh-note';battle.append(...rows,waveNote,goal);pages.battle.append(empty,battle);
  if(detail){const stats=make('details');stats.className='fh-stats';stats.append(make('summary','战斗状态'),detail);pages.battle.append(stats)}
  if(farm)pages.field.append(farm);
  const automation=window.__farmAutomation;
  if(automation){pages.animal.append(automation.sections.animal);pages.workshop.append(automation.sections.workshop);pages.daily.append(automation.sections.daily)}
  window.__farmEarnings?.mount(pages.earnings);
  footer.classList.add('fh-footer');const task=make('div'),mini=make('div');mini.className='fh-mini';body.append(tabs,...Object.values(pages),task,footer);panel.replaceChildren(head,body,mini);
  const execution=make('section');execution.className='fh-execution';execution.setAttribute('aria-label','助手执行状态');
  const statusHead=make('div');statusHead.className='fh-execution-head';statusHead.setAttribute('role','status');statusHead.setAttribute('aria-live','polite');
  const label=make('span','运行状态');label.className='fh-execution-label';const badge=make('span');badge.className='fh-badge';
  const dot=make('span');dot.className='fh-dot';dot.setAttribute('aria-hidden','true');const statusText=make('span');badge.append(dot,statusText);statusHead.append(label,badge);
  const current=make('div');current.className='fh-current';
  const reason=make('p'),materials=make('p'),next=make('p');materials.className='fh-materials';next.className='fh-next';
  const executionDetails=make('details'),executionSummary=make('summary','执行详情'),overview=make('dl'),log=make('ol');overview.className='fh-overview';log.className='fh-log';log.setAttribute('aria-label','最近执行记录');
  const logLabel=make('p','最近记录 · 最多 20 条，本次页面有效');executionDetails.append(executionSummary,overview,logLabel,log);
  execution.append(statusHead,current,reason,materials,next,executionDetails);
  const compactExecution=make('button'),compactText=make('span');compactExecution.type='button';compactExecution.className='fh-execution-compact';compactExecution.append(compactText);compactExecution.hidden=true;task.append(compactExecution,execution);
  let earningsExecutionExpanded=false;compactExecution.onclick=()=>{earningsExecutionExpanded=!earningsExecutionExpanded;render()};
  let lastView='',lastLog='',lastPhase='';
  let tab=previous?.tab||'field',collapsed=previous?.collapsed||false;
  let position=previous?.position,drag=null;
  if(!position)try{position=JSON.parse(localStorage.getItem('farm-helper.ui-position'))}catch{}
  if(!Number.isFinite(position?.x)||!Number.isFinite(position?.y))position={x:window.innerWidth-280,y:168};
  function place(next=position){
    const box=panel.getBoundingClientRect(),margin=8;
    position={x:Math.round(Math.max(margin,Math.min(next.x,window.innerWidth-box.width-margin))),y:Math.round(Math.max(margin,Math.min(next.y,window.innerHeight-box.height-margin)))};
    panel.style.left=position.x+'px';panel.style.right='auto';panel.style.top=position.y+'px';
  }
  function savePosition(){try{localStorage.setItem('farm-helper.ui-position',JSON.stringify(position))}catch{}}
  head.tabIndex=0;head.title='拖动移动；聚焦后方向键微调，Home 恢复默认位置';head.setAttribute('aria-label','移动农场助手：可拖动，或用方向键调整位置，Home 恢复默认');
  head.onpointerdown=e=>{
    if(e.button!==0||e.target.closest('button,input,select,textarea,a')||drag)return;
    e.preventDefault();e.stopPropagation();place();drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:{...position}};
    head.setPointerCapture(e.pointerId);head.classList.add('fh-dragging');
  };
  head.onpointermove=e=>{if(drag?.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();place({x:drag.start.x+e.clientX-drag.x,y:drag.start.y+e.clientY-drag.y})};
  function endDrag(e){if(drag?.id!==e.pointerId)return;e.stopPropagation();if(e.type==='pointercancel')place(drag.start);drag=null;head.classList.remove('fh-dragging');if(head.hasPointerCapture(e.pointerId))head.releasePointerCapture(e.pointerId);savePosition()}
  head.onpointerup=endDrag;head.onpointercancel=endDrag;head.onlostpointercapture=e=>{if(drag?.id===e.pointerId){drag=null;head.classList.remove('fh-dragging');savePosition()}};
  head.onkeydown=e=>{
    if(e.target!==head||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();const step=e.shiftKey?30:10;
    place(e.key==='Home'?{x:window.innerWidth-280,y:168}:{x:position.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),y:position.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)});savePosition();
  };
  const onResize=()=>place();window.addEventListener('resize',onResize);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>place()):null;observer?.observe(panel);
  if(!previous)try{tab=localStorage.getItem('farm-helper.ui-tab')||'field'}catch{}
  if(!(tab in pages))tab='field';
  const gameBattle=()=>{const root=document.getElementById('battle-ui');return !!root&&!root.hidden&&!!root.getClientRects().length&&getComputedStyle(root).display!=='none'};
  function show(id,save=true){if(id==='battle'&&!gameBattle())id='field';if(!(id in pages))return;if(tab!==id)earningsExecutionExpanded=false;tab=id;window.__farmEarnings?.setVisible(id==='earnings'&&!collapsed);for(const k of Object.keys(pages)){pages[k].hidden=k!==id;buttons[k].setAttribute('aria-selected',String(k===id));buttons[k].tabIndex=k===id?0:-1}place();if(save)try{localStorage.setItem('farm-helper.ui-tab',id)}catch{}}
  for(const id of Object.keys(pages))buttons[id].onclick=()=>show(id);
  tabs.onkeydown=e=>{const ids=Object.keys(pages).filter(id=>!buttons[id].hidden);if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();show(e.key==='Home'?ids[0]:e.key==='End'?ids.at(-1):ids[(ids.indexOf(tab)+(e.key==='ArrowRight'?1:ids.length-1))%ids.length]);buttons[tab].focus()}};
  function folding(){window.__farmEarnings?.setVisible(tab==='earnings'&&!collapsed);body.hidden=collapsed;mini.hidden=!collapsed;fold.textContent=collapsed?'展开':'收起';fold.setAttribute('aria-expanded',String(!collapsed));window.__farmVersionGuard?.paint();place()}
  fold.onclick=()=>{collapsed=!collapsed;folding()};
  let wasOnBattlePage=null,lastFarmTab=tab==='battle'?'field':tab;
  function render(){
    const onBattlePage=gameBattle();buttons.battle.hidden=!onBattlePage;
    if(onBattlePage&&wasOnBattlePage!==true)show('battle',false);
    if(!onBattlePage&&tab==='battle')show(lastFarmTab,false);
    if(!onBattlePage)lastFarmTab=tab;wasOnBattlePage=onBattlePage;
    const ready=!!window.__farmCombat;empty.hidden=ready;battle.hidden=!ready;
    let view=automation?.execution?.()||{status:'idle',title:'等待助手加载',reason:'',items:[],next:'',rows:[]};
    const visual=window.__farmCombat?.status?.();
    if(onBattlePage&&(visual?.enabled||visual?.selecting||(tab==='battle'&&(visual?.phase==='error'||visual?.goldGoal?.triggered)))){
      view={status:visual.selecting?'waiting':visual.phase==='error'?'error':visual.phase==='running'?'running':'waiting',title:'战斗 · 生存优先',reason:visual.selecting?visual.perkMessage:visual.message||'等待状态',items:['怪物 '+(visual.enemies||0)+'（入场 '+(visual.entering||0)+' · 隐身 '+(visual.hiddenEnemies||0)+'） · 弹道 '+(visual.projectiles||0),'风暴 '+(visual.casts||0)+' 次 · 闪避 '+(visual.dodges||0)+' 次 · 已选升级 '+(visual.choices||0)+' 次'],next:visual.selecting?'升级随机等待 1.1～3.5 秒，按原优先级选择':'正常受伤；请保持游戏页面可见，Esc 停止',rows:[{label:'状态',text:visual.recognized?'玩家状态正常 · 控制耗时 '+(visual.frameMs||0)+'ms':'等待有效状态'},{label:'策略',text:visual.riskLevel==='survive'?'优先生存':'等待判断'},{label:'效率',text:(visual.killsPerMinute==null?'统计中':visual.killsPerMinute+' 击杀/分')+' · 受击 '+(visual.hits||0)+' 次'},{label:'移动',text:'赶路闪避 '+(visual.travelDodges||0)+' 次 · 脱困 '+(visual.unsticks||0)+' 次'}]};
    }
    if(onBattlePage&&visual?.goldGoal){const g=visual.goldGoal;view.rows.push({label:'本局金币',text:g.earned+' / '+(g.target??'读取中')});if(g.triggered){view.status='idle';view.title='战斗目标已达成';view.reason=g.message;view.next='已停止自动战斗，不会自动再次开局'}}
    const returning=window.__farmCombatReturn?.status?.();
    if(onBattlePage&&returning&&['waiting','countdown','returning','cancelled','error'].includes(returning.phase))view={status:returning.phase==='error'?'error':returning.phase==='cancelled'?'paused':'waiting',title:'战斗结束',reason:returning.message,items:[],next:'操作后重新等待5秒；Esc 取消本局自动返回。回村庄后农务按原开关继续。',rows:[]};
    if(window.__farmVersionGuard?.isBlocked()){const v=window.__farmVersionGuard.status();view={status:'paused',title:'游戏版本保护',reason:v.message,items:[],next:v.detail,rows:[]}}
    const phase=view.status+':'+view.title+':'+view.reason.replace(/\d+/g,'#');
    if(phase!==lastPhase){if(['error','paused'].includes(view.status))window.__farmActivity?.add(view.status,view.reason);lastPhase=phase}
    const statusNames={running:'执行中',waiting:'等待',paused:'暂停',error:'异常',idle:'未开启'};
    const heading=(statusNames[view.status]||'等待')+' · '+view.title;
    const compact=tab==='earnings'&&view.status!=='error';
    compactExecution.hidden=!compact;compactExecution.setAttribute('aria-expanded',String(earningsExecutionExpanded));compactExecution.setAttribute('aria-label','运行状态：'+heading+'，'+(earningsExecutionExpanded?'收起详情':'展开详情'));compactText.textContent=heading;execution.hidden=compact&&!earningsExecutionExpanded;
    const signature=JSON.stringify(view);
    if(signature!==lastView){
      execution.dataset.status=view.status;statusText.textContent=statusNames[view.status]||'等待';current.textContent=view.title;reason.textContent=view.reason;materials.textContent=view.items.join('\n');materials.style.whiteSpace='pre-line';materials.hidden=!view.items.length;next.textContent=view.next;
      overview.replaceChildren(...view.rows.flatMap(row=>[make('dt',row.label),make('dd',row.text)]));
      mini.textContent=heading;mini.title=view.reason;lastView=signature;
    }
    const entries=window.__farmActivity?.entries()||[],logKey=JSON.stringify(entries);
    if(logKey!==lastLog){log.replaceChildren(...(entries.length?entries.map(entry=>{const li=make('li'),time=make('time',new Date(entry.at).toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}));li.append(time,document.createTextNode(entry.text));return li}):[make('li','暂无执行记录；只记录动作结果和重要状态变化。')]));lastLog=logKey}
    window.__farmVersionGuard?.paint();
  }
  function mountTask(state,recheck){state.hidden=true;if(state.parentElement!==task)task.append(state,recheck)}
  if(automation)mountTask(automation.state,automation.recheck);
  window.__farmVersionGuard?.mount({panel,title,body,mini,isCollapsed:()=>collapsed});
  const timer=setInterval(render,500);show(tab,false);folding();render();
  const oldRemove=window.__farmCompact.remove;
  function remove(){window.__farmEarnings?.setVisible(false);clearInterval(timer);observer?.disconnect();window.removeEventListener('resize',onResize);head.onpointerdown=head.onpointermove=head.onpointerup=head.onpointercancel=head.onlostpointercapture=head.onkeydown=null;drag=null;version.remove();style.remove();panel.replaceChildren(...original);if(originalStyle!==null)panel.setAttribute('style',originalStyle);else panel.removeAttribute('style');if(window.__farmCompact?.remove===combined)window.__farmCompact.remove=oldRemove;delete window.__farmLayout}
  function combined(){remove();oldRemove()}
  window.__farmCompact.remove=combined;window.__farmLayout={show,mountTask,status:()=>({tab,collapsed,position:{...position}}),remove};
  return '已分为战斗、田地、动物、作坊、日常、收益';
})();

  }catch(error){cleanup();delete window.__farmLauncher;delete window.__farmHandoff;throw error}
  delete window.__farmHandoff;
  return '助手 1.20.2 已开启；请先完成面板内的游戏版本检查';
})();
