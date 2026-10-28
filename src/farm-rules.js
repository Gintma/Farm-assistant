/* Read-only planning. Prices and time always come from the authenticated farm snapshot. */
(() => {
  const cropRows=[['radish','萝卜',30,.016],['turnip','芜菁',30,.016],['carrot','胡萝卜',30,.016],['onion','洋葱',60,.018],['red_onion','红洋葱',60,.018],['garlic','大蒜',60,.018],['wheat','小麦',120,.02],['corn','玉米',120,.02],['potato','土豆',120,.02],['cucumber','黄瓜',120,.02],['tomato','番茄',240,.023],['red_pepper','红椒',240,.023],['yellow_pepper','黄椒',240,.023],['green_pepper','青椒',240,.023],['cabbage','卷心菜',480,.027],['cauliflower','花菜',480,.027],['chili','辣椒',480,.027],['aubergine','茄子',720,.03],['strawberry','草莓',720,.03],['pumpkin','南瓜',1440,.036]];
  const crops=Object.fromEntries(cropRows.map(([id,name,min,value])=>[id,{id,name,ms:min*60000,value,min}]));
  const animals={chicken:{building:'coop',bags:2,meal:.01,days:1,capacity:6},cow:{building:'barn',bags:8,meal:.04,days:1,capacity:3},sheep:{building:'sheepPen',bags:5,meal:.025,days:3,capacity:4},pig:{building:'pigPen',bags:10,meal:.05,days:7,capacity:2}};
  const trees={apple:{ms:86400000,value:.05},lemon:{ms:86400000,value:.055},orange:{ms:86400000,value:.055},blueberry:{ms:43200000,value:.025},raspberry:{ms:43200000,value:.025},blackberry:{ms:43200000,value:.025}};
  const levels=[null,{mult:1,harvest:.7,passive:.25},{mult:1.6,harvest:1.64,passive:.58},{mult:1.75,harvest:3.74,passive:1.33},{mult:2.1,harvest:8.4,passive:3},{mult:2.4,harvest:18.66,passive:6.67}];
  const craftOpen=kind=>window.__FS_CRAFT__===true&&(window.__FS_CRAFT2__===true||Array.isArray(window.__FS_CRAFT2__)&&window.__FS_CRAFT2__.includes(kind));
  const isFruit=id=>['apple','lemon','orange'].includes(id);
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
    // Mirror the game's positive payout multiplier and 5%..100% frontend bounds.
    // A missing field keeps legacy estimates, but cannot justify energy spending.
    const rewardMultKnown=d.price.mult!==undefined;
    const reportedMult=Number(d.price.mult);
    if(rewardMultKnown&&(!Number.isFinite(reportedMult)||reportedMult<=0))throw Error('奖励发放比例无效，等待服务器更新');
    const rewardMult=rewardMultKnown?Math.min(1,Math.max(.05,reportedMult)):1;
    const pay=v=>Math.round(v/d.price.pay*rewardMult),charge=v=>Math.round(v/d.price.charge);
    const base=pay(l.harvest)*bonus,cap=base*nftCapBonus+(f.today.feedSpent||0);
    const carry=Math.max(0,f.harvestCarry||0),remaining=Math.max(0,cap-f.today.harvestEarned);
    const value=v=>Math.floor(pay(v)*l.mult*harvestBonus);
    const animalValue=v=>Math.floor(Math.round(pay(v)*l.mult)*harvestBonus);
    return {cal,l,bonus,nftCapBonus,nftYieldBonus,harvestBonus,rewardMult,rewardMultKnown,pay,charge,animalValue,base,cap,carry,remaining,room:remaining+Math.max(0,base*7-carry),value,energy10:charge(.0045*l.mult*10)};
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
    for(const a of ready){const r=animals[a.kind],b=building(f,a);if(!r||!b)throw Error('未知动物或建筑');bs.set(b.id,b);const item={chicken:'egg',cow:'milk',sheep:'wool'}[a.kind];if(item&&f.keep?.[item]&&(f.pantry?.[item]||0)+(kept[item]||0)<200){kept[item]=(kept[item]||0)+1;continue}value+=q.animalValue(r.meal*4*r.days)}
    return {ready,value,energy:[...bs.values()].filter(b=>b.collectDay!==q.cal.day).length*2};
  }
  function orchardPlan(d){const f=d.farm,q=quote(d);let stored=f.pantry?.fruit||0;return f.structures.filter(s=>s.kind==='orchard'&&built(s,d.now)).map(s=>{
    const ready=(s.slots||[]).map((x,i)=>({...x,i})).filter(x=>trees[x.tree]&&d.now-x.lastHarvestAt>=trees[x.tree].ms);
    const value=ready.reduce((n,x)=>{if(craftOpen('press')&&f.keep?.fruit&&isFruit(x.tree)&&stored<200){stored++;return n}return n+q.value(trees[x.tree].value)},0);return {id:s.id,ready,value};
  }).filter(x=>x.ready.length)}
  function futureValue(d,flags){
    const f=d.farm,q=quote(d);let total=0;
    if(flags.collect)total+=collectPlan(d).value;
    if(flags.orchard){let stored=f.pantry?.fruit||0;for(const s of f.structures.filter(s=>s.kind==='orchard'))for(const x of s.slots||[]){const t=trees[x.tree];if(t&&x.lastHarvestAt+t.ms<q.cal.nextMidnight){if(craftOpen('press')&&f.keep?.fruit&&isFruit(x.tree)&&stored<200)stored++;else total+=q.value(t.value)}}}
    for(const x of f.fields){const c=crops[x.crop];if(c&&!['wheat','corn'].includes(x.crop)&&x.plantedAt+c.ms<q.cal.nextMidnight)total+=q.value(c.value)}
    return total;
  }
  function chooseCrop(d,config,flags,lastGrain='corn'){
    const f=d.farm,q=quote(d);
    if(!crops[config.crop])throw Error('未知作物');
    const progress='已得 '+f.today.harvestEarned.toLocaleString('zh-CN',{maximumFractionDigits:2})+' / '+q.cap.toLocaleString('zh-CN',{maximumFractionDigits:2})+' 金币';
    // Uncollected produce, stored carry and tomorrow's raw materials do not
    // count as today's paid harvest. Only actual remaining allowance gates grain.
    if(q.remaining>1e-6){
      const grain=['wheat','corn'].includes(config.crop);
      return {crop:config.crop,message:(grain?'按你选择的粮食种植；今日收获尚未满额':'今日收获未满，优先种'+crops[config.crop].name)+'（'+progress+'）'};
    }
    if(flags.workshop&&!config.marketBuy&&config.workshopWheat>0){
      const need=window.__farmWorkshop.feedWheat(d,config.feedDays)+config.workshopWheat;
      const wheat=(f.silo?.wheat||0)+f.fields.filter(x=>x.crop==='wheat').length;
      if(wheat<need)return {crop:'wheat',message:'今日收获已满，补作坊小麦并保留动物饲料（'+progress+'）'};
    }
    const need=f.animals.reduce((n,a)=>n+(animals[a.kind]?.bags||0)*2,0);
    const inventory=(f.silo?.feed||0)+Math.min((f.silo?.wheat||0)+f.fields.filter(x=>x.crop==='wheat').length,(f.silo?.corn||0)+f.fields.filter(x=>x.crop==='corn').length)*10;
    if(config.smart&&(need===0||inventory>=need*config.feedDays))return {crop:null,message:'今日收获已满，粮食充足，等待下一天（'+progress+'）'};
    const wheat=(f.silo?.wheat||0)+f.fields.filter(x=>x.crop==='wheat').length,corn=(f.silo?.corn||0)+f.fields.filter(x=>x.crop==='corn').length;
    return {crop:wheat<corn?'wheat':corn<wheat?'corn':lastGrain==='corn'?'wheat':'corn',message:'今日收获已满，补充玉米和小麦（'+progress+'）'};
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
      const finishing=q.rewardMultKnown&&q.remaining<=0?' · 收获已满，仅完成本竿':'';
      if(d.now<fish.line.bite)return {jobs:[],note:progress+finishing+' · 等待上钩'};
      return {jobs:[{...base,kind:'fish-reel',action:'pond-fish',arg:pond.id,before:fish.caught,lineAt:fish.line.at}],note:progress+finishing+' · 收起已上钩的鱼'};
    }
    // Recover an existing line above, but never spend bait/coins once today's
    // shared harvest allowance is full or its payout multiplier is unknown.
    if(!q.rewardMultKnown)return {jobs:[],note:progress+' · 收获额度未确认，暂停购买与抛竿'};
    if(q.remaining<=0)return {jobs:[],note:progress+' · 今日收获已满，暂停钓鱼；鱼饵保留'};
    if(casts>=20)return {jobs:[],note:progress+' · 今日已完成'};
    if(fish.bait>0)return {jobs:[{...base,kind:'fish-run',action:'pond-fish',arg:pond.id,count:1,before:casts,beforeTotal:fish.total,beforeCaught:fish.caught}],note:progress+' · 逐竿钓鱼，收竿后重查额度'};
    if(bought<20){const count=Math.min(20-bought,20-casts),cost=unit*count;
      return {jobs:f.tokens>=cost?[{...base,kind:'fish-bait',action:'buy-bait',arg:String(count),count,cost,unit,before:bought}]:[],note:progress+' · 补买 '+count+' 个约 '+cost+' 金币'+(f.tokens<cost?'，余额不足':'')};
    }
    return {jobs:[],note:progress+' · 鱼饵不足，今日购买已满'};
  }
  function fishingPendingDone(p,d){
    if(!p.kind?.startsWith('fish-'))return false;
    if(p.day!==calendar(d.farm,d.now).day)return true;
    const f=d.farm.fishing;if(!f)return false;
    if(p.kind==='fish-bait')return f.day===p.day&&f.bought>=p.before+p.count;
    // New runs contain one cast. Legacy batches still confirm on the first cast;
    // their remaining work can only be stopped through the game's own button.
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
    if(p.kind==='orchard'||p.kind==='craft-fruit'){const s=f.structures.find(s=>s.id===p.id);return !s||p.before.every(x=>(s.slots?.[x.i]?.lastHarvestAt||0)>x.lastHarvestAt)}
    if(p.kind==='mine')return (f.structures.find(s=>s.id===p.id)?.mineAt||0)>p.before;
    if(p.kind==='oil')return f.structures.find(s=>s.id===p.id)?.collectDay>=p.day;
    if(p.kind==='income')return f.passiveSince>p.before;
    if(p.kind==='energy')return f.today.energy>=p.before+10||(f.today.bought||0)>=p.bought+10;
    return false;
  }
  window.__farmRules={craftOpen,isFruit,crops,cropRows,trees,animals,levels,built,calendar,quote,building,feedPlan,collectPlan,orchardPlan,futureValue,chooseCrop,fishingPlan,pendingDone};
})();
