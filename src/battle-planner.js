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
    const active=enemies.filter(e=>e.state!=='enter'&&!e.phased);
    const local=active.filter(e=>distance(h,e)<140),ordinary=local.filter(e=>!e.boss);
    const mixedBoss=local.some(e=>e.boss)&&ordinary.length>=2;
    const mid=(bounds.x0+bounds.x1)/2;
    const atGate=e=>Math.abs(e.x-mid)<130&&e.y<bounds.y0+130;
    const gateActive=active.filter(atGate),gateEntering=enemies.filter(e=>e.state==='enter'&&atGate(e));
    const gateCrowded=gateActive.length>=4||gateEntering.length>=2&&gateActive.length>=2||gateActive.some(e=>e.boss)&&gateActive.some(e=>!e.boss);
    const gatePressure=gateCrowded&&Math.abs(h.x-mid)<150&&h.y<bounds.y0+150;
    const pressured=ordinary.length>=4||mixedBoss||gatePressure;
    const damage=Number.isFinite(h.damage)&&h.damage>0?h.damage:3;
    const attackEvery=Number.isFinite(h.attackEvery)&&h.attackEvery>0?h.attackEvery:.42;
    const cleanup=frame.phase==='clear';
    const targets=enemies.filter(e=>e.hittable!==false&&e.state!=='fuse'&&e.state!=='enter'&&(!Number.isFinite(e.hp)||e.hp>0)).map(e=>{
      const d=distance(h,e),knownHp=Number.isFinite(e.hp)&&e.hp>0,hits=knownHp?Math.ceil(e.hp/damage):3;
      const gap=Math.max(0,d-reach-(e.radius||12)+4),finish=knownHp&&hits<=2&&gap<55;
      const travel=gap/Math.max(1,speed),fight=Math.min(6,hits)*attackEvery;
      // Favor a reachable threat; do not chase a shooter through a boss/body wall.
      const blockers=active.filter(other=>other!==e&&segmentDistance(other,h,e)<(other.radius||12)+24);
      const routeCost=blockers.reduce((n,other)=>n+(other.boss?55:16),0);
      const ranged=['archer','caster'].includes(e.brain);
      const score=travel*45+fight*16+routeCost-(finish?38:0)-(!cleanup&&ranged?(mixedBoss?24:10):0)+(mixedBoss&&e.boss?28:0);
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
    const danger=nearbyDanger.length>0||incoming.length>0||rushing||crowded||pressured;
    const babyOnly=rushing&&!incoming.length&&!crowded&&!nearbyDanger.some(z=>z.source!=='split');
    // Auto attacks can begin on the next game frame and slow walking immediately.
    const mayAttack=targets.some(e=>e.d<=reach*1.3+(e.radius||12)+6)&&(!Number.isFinite(h.attackCd)||h.attackCd<=.12);
    const moveSpeed=speed*(h.stormT>=0 ? .6 : (h.attacking||mayAttack) ? .55 : 1);
    const clamp=p=>({x:Math.max(bounds.x0,Math.min(bounds.x1,p.x)),y:Math.max(bounds.y0,Math.min(bounds.y1,p.y))});
    if(!target&&!danger)return {keys:[],intent:enemies.some(e=>e.phased||e.state==='appear')?'track':'idle',message:enemies.some(e=>e.phased||e.state==='appear')?'已跟踪隐身怪，等待进入可攻击状态':'等待敌人',threats:zones.length};
    const hold=target&&!target.positionOnly&&!danger&&target.d<=reach+(target.radius||12)-4&&!stuck;
    const travelReady=hpRatio>.55&&!pressured&&!gateCrowded&&skills&&ready.dodge&&!h.busy&&!h.attacking&&!danger&&target&&(!target.positionOnly||target.rally)&&target.d>Math.max(110,reach+(target.radius||12)+80)&&!stuck;
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
        // Keep room to turn during mixed fights; the arena edges stay reachable.
        if(pressured){
          const edge=Math.min(p.x-bounds.x0,bounds.x1-p.x,p.y-bounds.y0,bounds.y1-p.y);
          cost+=Math.max(0,28-edge)*1.2;
        }
        if(gateCrowded&&Math.abs(p.x-mid)<100&&p.y<bounds.y0+115)risk((bounds.y0+115-p.y)*2);
        let bodies=0;
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
          if(!e.boss&&!e.phased&&distance(p,future)<80)bodies++;
          if(mixedBoss&&e.boss)risk(Math.max(0,(e.radius||18)+32-distance(p,future))*2*riskScale);
          const baby=['baby','babyb'].includes(e.name);
          const safe=(e.radius||12)+(baby?14:14+6*caution);
          // Compare simultaneous positions. Including the initial overlap makes every escape
          // look equally unsafe and used to spend dodge even when walking was sufficient.
          const margin=distance(p,future);
          if(!(dodge&&t<.24))risk(Math.max(0,safe-margin)*(baby?30:18)*riskScale);

        }
        if(pressured)risk(Math.max(0,bodies-2)*14*riskScale);
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
        cost+=(target.positionOnly?Math.max(0,d-desired):Math.abs(d-desired))*(pressured ? .35 : .85);if(d>desired)cost+=d*.1;
      }
      if(!target)cost+=Math.hypot(vx,vy);
      candidates.push({vx,vy,dodge,cost,safety});
    }
    const walking=candidates.filter(c=>!c.dodge),safeWalking=walking.filter(c=>c.safety<1);
    // Walk before spending a dodge on baby contact alone, when a safe walking route exists.
    const imminent=incoming.length>0||nearbyDanger.some(z=>z.source!=='split'&&z.eta<.35);
    const pool=safeWalking.length&&(babyOnly||pressured&&!imminent)?safeWalking:candidates;
    best=pool.reduce((a,b)=>!a||b.cost<a.cost?b:a,null);
    const keys=[];
    if(Math.abs(best.vx)>.2)keys.push(best.vx>0?'ArrowRight':'ArrowLeft');
    if(Math.abs(best.vy)>.2)keys.push(best.vy>0?'ArrowDown':'ArrowUp');
    const inStorm=targets.filter(e=>e.d<(h.stormRadius||58)+(e.radius||12)-4);
    // Starting storm slows walking. Never invalidate a full-speed escape we just chose.
    const canSlow=!danger||!best.vx&&!best.vy||moveSpeed<=speed*.6;
    const storm=canSlow&&skills&&ready.storm&&!h.busy&&inStorm.length>0&&(danger||inStorm.length>=2||inStorm.some(e=>e.boss||e.knownHp&&e.hits>=3));
    // Preserve the escape path that was evaluated with a dodge; storm changes movement speed.
    if(best.dodge)keys.push('Space');else if(storm)keys.push('KeyE');
    const intent=best.dodge?(danger?'evade':'travel'):storm?'storm':stuck&&!danger?'recover':pressured&&(best.vx||best.vy)?'reposition':hold?(best.vx||best.vy?'skirmish':'attack'):target?.rally?'rally':target?.positionOnly?'intercept':cleanup?'cleanup':'approach';
    const boss=nearbyDanger.find(z=>/牛头人|鼠王/.test(z.message));
    const names={minotaur:'牛头人',ratking:'鼠王',slime:'史莱姆',slimeb:'蓝史莱姆',baby:'小史莱姆',babyb:'蓝色小史莱姆',archer:'弓箭手',wizard:'巫师',bomber:'自爆怪',goblin:'哥布林',ghost:'幽灵',bat:'蝙蝠',skeleton:'骷髅',rat:'老鼠'};
    return {keys,intent,riskLevel,target:target?.name||'',targetId:target?.id??null,threats:zones.length,message:boss?.message||nearbyDanger[0]?.message||(intent==='evade'&&gatePressure?'闪避撤离拥挤门口':intent==='evade'&&mixedBoss?'闪避脱离Boss与怪群夹击':intent==='travel'?'路线安全，闪避接近目标':intent==='recover'?'移动受阻，换方向脱困':intent==='attack'?'目标在攻击范围，稳住输出':intent==='skirmish'?'调整近身距离，保持输出':intent==='reposition'?(gatePressure?'门口拥挤，向开阔区域调整':mixedBoss?'Boss与小怪混战，保持退路并处理近处威胁':'附近怪物密集，拉开距离并保留闪避'):intent==='cleanup'?'波末清场，接近剩余敌人':intent==='intercept'?'门口安全范围接应，避开出生通道':intent==='rally'?(target.d<=8?'已在安全等待区，准备下一波':'本波已清场，前往随机安全位置'):incoming.length?'侧移避开箭矢或火球':rushing?'拉开距离，避让小史莱姆':target?'接近目标：'+(names[target.name]||target.name):'远离危险区域'),danger};
  }
  const api={plan,threats,zoneMargin,rallyArea,safeRally,pickRally};if(typeof module!=='undefined')module.exports=api;else globalThis.FarmBattlePlanner=api;
})();
