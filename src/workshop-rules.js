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
  async function readBudget(owner,now,signal,force=false){
    const day=new Date(now).toISOString().slice(0,10),key=owner+'#'+day,t=performance.now();
    if(!force&&budgetCache?.key===key&&t-budgetCache.at<30000)return {budget:budgetCache.budget,ageMs:t-budgetCache.at};
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
  function orderValue(d,order){
    const q=R.quote(d);return Math.round(Object.entries(order.items).reduce((n,[k,count])=>{if(!values[k]||!Number.isSafeInteger(count)||count<1)throw Error('订单计价规则无法确认');return n+Math.max(1,Math.round(q.pay(values[k])*q.l.mult))*count},0)*1.5);
  }
  function syncBoard(board,d,globalLeft){
    let available=budgetLeft(d,globalLeft);const immediate=available;
    const done=d.farm.orders?.day===board.day?d.farm.orders.done||[]:[];
    for(const o of board.orders){o.baseReward??=o.reward;o.baseReward=Math.min(o.baseReward,orderValue(d,o));o.done=done.includes(o.index);o.reward=o.done?0:Math.min(o.baseReward,available);o.availableReward=o.done?0:Math.min(o.baseReward,immediate);available-=o.reward}
    return board;
  }
  const reward=o=>Number.isFinite(o.availableReward)?o.availableReward:o.reward;
  function allowedOrders(orders,config){return (orders||[]).filter(o=>o.forecast||config.workshopStars!==false||reward(o)>0).map(o=>({...o,reward:reward(o)}))}
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
    const p=demands(d,allowedOrders(board.orders,config),config.workshopEat,config._prepCredits),neededEggs=Math.max(0,p.need.egg-stock(f,'egg')),neededMilk=Math.max(0,p.need.milk-stock(f,'milk')),neededWool=Math.max(0,p.need.wool-stock(f,'wool'));
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
    const note=[...new Set(notices)].join('；')|| (neededWool?'还需 '+neededWool+' 份羊毛；保留后自动收取':neededMilk?'还需 '+neededMilk+' 份牛奶；保留后自动收取':neededEggs?'还需 '+neededEggs+' 个鸡蛋；保留后自动收取':p.wheat>wheatAvailable?'小麦不足，先保留 '+feedWheat(d,config.feedDays)+' 份作饲料':Object.values(p.queues.out).some(Boolean)?'作坊加工中，成品完成后收取':p.orders.length?(config.workshopStars===false?'按今日金币订单安排生产':'按今日订单安排生产（含星星订单）'):config.workshopStars===false&&board.orders.some(o=>!o.done&&!(reward(o)>0))?'纯星星订单已跳过':'今日订单已完成');
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
      next={day,orders:forecast(f.owner,day).map(o=>({...o,forecast:true}))};
    }catch(e){return {...today,prep:{error:e.message},note:today.note+'；次日备货暂停：'+e.message}}
    const current=demands(d,allowedOrders(board.orders,config),config.workshopEat),pantry={...f.pantry};
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
    const directBread=allowedOrders(board.orders,config).filter(o=>!o.done).reduce((n,o)=>n+(o.items.bread||0),0)+next.orders.reduce((n,o)=>n+(o.items.bread||0),0);
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
  window.__farmWorkshop={recipes,stock,week,orderDay,orderReset,orderCap,budgetLeft,orderValue,syncBoard,reward,allowedOrders,readBudget,invalidateBudget,forecast,queued,feedWheat,demands,plan,pendingDone};
})();
