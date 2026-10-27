/* One confirmed helper task at a time; observe actual game workers before dispatch. */
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
  let lastPlan={jobs:[],hint:{}},lastWorkers=null;
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
  function workerState(d){
    const game=window.__farmGame||window.temp1;
    const scene=game?.scene?.scenes.find(s=>s.worker&&s.sys?.isActive?.());
    const group=scene?.worker;
    if(!group||typeof group.pending!=='function')return null;
    try{
      const jobs=group.pending();if(!Array.isArray(jobs))return null;
      if(Array.isArray(group.workers)){
        // Read the same active worker count and per-worker predicates used by
        // the game. Construction can suspend a worker with ordinary jobs queued.
        const count=Number(d.farm.farmers??1),max=[1,2,3,4,6][d.farm.level-1];
        if(!Number.isInteger(count)||count<1||!max)return null;
        const total=window.__FS_FARMERS__===false?1:Math.min(count,max);
        if(group.workers.length<total)return null;
        let idle=0,building=0;const collected=[];
        for(const worker of group.workers.slice(0,total)){
          if(!worker||typeof worker.pending!=='function'||typeof worker.shouldBuild!=='function'||typeof worker.isBusy!=='boolean'||typeof worker.isBuilding!=='boolean'||typeof worker.isFishing!=='boolean')return null;
          const queue=worker.pending(),willBuild=worker.shouldBuild();
          if(!Array.isArray(queue)||typeof willBuild!=='boolean')return null;
          collected.push(...queue);
          const constructing=worker.isBuilding||willBuild;
          if(constructing)building++;
          else if(!worker.isBusy&&!worker.isFishing&&!queue.length)idle++;
        }
        if(collected.length!==jobs.length)return null;
        return {jobs,total,idle,building,busy:total-idle-building,detailed:true};
      }
      // Legacy single-worker shape: retain the conservative queue guard.
      if(Number(d.farm.farmers??1)!==1)return null;
      const total=1;
      const building=Math.min(1,d.farm.structures.concat(d.farm.fields).filter(s=>s.buildStart<=d.now&&s.buildUntil>d.now).length);
      return {jobs,total,idle:jobs.length?0:Math.max(0,total-building),building,busy:jobs.length?1:0,detailed:false};
    }catch{return null}
  }
  function queueConflict(job,jobs){
    if(!jobs.length)return false;
    const known=['harvest','plant','feed','collect','tree-harvest','tree-plant','orchard-all','mine','fuel','fish','reel','fish-all'];
    if(jobs.some(j=>!j||!known.includes(j.type)))return true;
    const types=new Set(jobs.map(j=>j.type));
    // Batch buttons act on whole resource groups. Do not adopt another worker's
    // queued targets into our completion marker, or change their retained items.
    if(types.has('harvest')||types.has('plant'))return true;
    if(['feed','collect','fish','reel','fish-all'].some(t=>types.has(t))&&['feed','collect','craft-eggs','craft-milk','craft-wool','craft-keep','craft-start','craft-order','craft-eat','fish-bait','fish-run','fish-reel','energy'].includes(job.kind))return true;
    if(['orchard-all','tree-harvest','tree-plant'].some(t=>types.has(t))&&['orchard','craft-keep','craft-start','craft-order','energy'].includes(job.kind))return true;
    if(job.kind==='mine'&&types.has('mine')||job.kind==='oil'&&types.has('fuel'))return true;
    return false;
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
          const production=p.hungry.reduce((n,a)=>{const r=R.animals[a.kind];return n+q.animalValue(r.meal*2)},0);
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
      const quote=R.quote(d);
      if(!quote.rewardMultKnown){message='奖励发放比例未确认，暂不自动购买能量';return false}
      const expected=quote.energy10;
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
      const workers=workerState(d);lastWorkers=workers?{total:workers.total,idle:workers.idle,building:workers.building,busy:workers.busy,queued:workers.jobs.length,detailed:workers.detailed}:null;
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
      if(!workers){message='无法确认每位农夫状态，请等待游戏加载';return}
      if(!workers.idle){
        if(workers.building>=workers.total)message='所有农夫都在施工，等待空闲农夫';
        else if(flags.fishing&&f.fishing)message='农夫忙碌 · '+R.fishingPlan(d).note;
        else message='农夫忙碌 · '+workers.jobs.length+' 项农务等待完成';
        return;
      }
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
        if(queueConflict(job,workers.jobs)){waiting='其他农夫已有相关任务排队，等待完成，避免重复提交';continue}
        const q=R.quote(d),protectedEnergy=['feed','collect','income'].includes(job.kind)?0:reserveFeed(d);
        if(f.today.energy<job.energy){
          const packs=Math.ceil((job.energy-f.today.energy)/10),fullCost=Math.ceil(q.energy10*1.15)*packs;
          if(flags.energy&&q.rewardMultKnown&&job.value>fullCost&&ledger.energySpent+fullCost<=config.energyBudget){
            const buy={kind:'energy',route:'energy',action:'energy',arg:'10',before:f.today.energy,bought:f.today.bought||0,energy:0,value:job.value};
            if(navigate(buy))submit(buy,d);else message='打开能量小包，检查价格和预算';return;
          }
          waiting=!q.rewardMultKnown&&flags.energy?'奖励发放比例未确认，暂不自动购买能量':'能量不足：本项需 '+job.energy+'，等待补充';continue;
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
    if(lastWorkers)rows.push({label:'农夫',text:lastWorkers.total+' 人 · 施工 '+lastWorkers.building+' · 农务忙碌 '+lastWorkers.busy+' · 空闲 '+lastWorkers.idle+' · 排队 '+lastWorkers.queued+' 项'});
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
    if(status==='waiting'&&lastWorkers&&lastWorkers.idle===0){title='等待空闲农夫';reason=message;nextText='有农夫空闲后重新安排农活；不清空或搬动已有队列'}
    return {status,title,reason,items,next:nextText,rows,enabled:enabled.length,age:snapshot?Math.max(0,Math.floor((now-lastRead)/1000)):null};
  }
  function mount(parent){if(parent){parent.append(field);host?.remove();host=null}else if(!field.isConnected){host=el('aside');host.id='farm-auto-standalone';host.style.cssText='position:fixed;right:12px;top:168px;width:252px;z-index:2147483647;padding:12px;background:#16271d;color:#e6eee6;font:12px/1.5 system-ui';host.append(field,state);document.body.append(host)}}
  const timer=setInterval(()=>void tick(),5000);
  window.__farmAutomation={pauseForVersion:()=>{epoch++;controller?.abort();activeMark=null;route=null;message='游戏版本保护：全部自动功能已暂停';render()},readSnapshot:()=>({data:snapshot,ageMs:performance.now()-snapshotAt,budget:orderBudget,budgetAgeMs:snapshot?Math.max(0,snapshot.now-budgetAt)+performance.now()-snapshotAt:Infinity}),set,configure,sections,state,recheck,mount,execution,refresh:()=>tick(true),status:()=>({flags:{...flags},config:{...config},message,pending:pending?{...pending}:null,needsReview,requests:requestCount,owner,storageOK,workers:lastWorkers?{...lastWorkers}:null}),preview:d=>candidates(d),
    remove:()=>{removed=true;epoch++;clearInterval(timer);controller?.abort();leaseRelease?.();document.removeEventListener('pointerdown',onManual,true);window.removeEventListener('keydown',onKey,true);document.querySelectorAll('.fh-workshop-action').forEach(b=>b.remove());Object.values(sections).forEach(s=>s.remove());state.remove();recheck.remove();host?.remove();delete window.__farmAutomation;delete window.__farmAutoFarm;delete window.__farmRules;delete window.__farmWorkshop}};
  window.__farmAutoFarm={set:v=>set('fields',v),configure:(id,reserve=config.reserve)=>{if(!R.crops[id]||!Number.isInteger(Number(reserve))||Number(reserve)<0||Number(reserve)>100)return false;assignOption('crop',id);assignOption('reserve',Number(reserve));saveConfig();syncControls();return true},mount,status:()=>({enabled:flags.fields,crop:config.crop,reserve:config.reserve,message,pending:pending?.kind??null,requests:requestCount}),remove:()=>window.__farmAutomation?.remove()};
  mount(document.getElementById('farm-compact-controls'));syncControls();render();void tick(true);
  return '统一农务队列已安装；勾选所需功能后运行';
})();
