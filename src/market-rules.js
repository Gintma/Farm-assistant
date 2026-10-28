/* Authorize purchases against one actual order, including its sunk costs. */
(() => {
  const R=window.__farmRules,W=window.__farmWorkshop;
  const names={fruit:'水果',juice:'果汁',bread:'面包',flour:'面粉',egg:'鸡蛋',wheat:'小麦',milk:'牛奶',butter:'黄油',cheese:'奶酪',wool:'羊毛',cloth:'布料'};
  const items=Object.keys(names),outputs=['bread','flour','butter','cheese','cloth','juice'];
  function listings(data){
    if(!Array.isArray(data?.listings))throw Error('市场报价格式变化，暂停购买');
    return data.listings.filter(x=>x&&items.includes(x.item)&&!x.mine&&typeof x.id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(x.id)&&Number.isSafeInteger(x.qty)&&x.qty>0&&Number.isSafeInteger(x.price)&&x.price>0&&Number.isFinite(x.exp));
  }
  function targets(orders){
    const out=Object.fromEntries(items.map(k=>[k,0]));
    for(const o of orders||[]){if(o.done)continue;for(const [k,n]of Object.entries(o.items||{})){if(!items.includes(k)||!Number.isSafeInteger(n)||n<1||n>100)throw Error('市场补料遇到未知订单');out[k]+=n}}
    return out;
  }
  function inventory(d,deadline){
    const f=d.farm,s=Object.fromEntries(items.map(k=>[k,W.stock(f,k)]));
    for(const b of f.structures)for(const q of b.queue||[])if(W.recipes[q.r]&&q.until<=deadline)s[q.r]+=W.recipes[q.r].count;
    return s;
  }
  function solve(d,target,stock,quotes,budget,deadline){
    const f=d.farm,by={},memo={},energyUnit=R.quote(d).energy10/10;
    for(const k of items){by[k]=quotes.filter(x=>x.item===k&&x.exp>d.now).sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id));memo[k]=new Map()}
    const purchase=(k,count)=>{
      count=Math.max(0,count);if(memo[k].has(count))return memo[k].get(count);
      let left=count,cost=0;const buys=[];
      for(const row of by[k]){const n=Math.min(left,row.qty);if(n){buys.push({...row,count:n});cost+=n*row.price;left-=n}if(!left)break}
      const result=left?null:{cost,buys};memo[k].set(count,result);return result;
    };
    const buildings={};for(const k of ['mill','bakery','dairy','loom','press']){const b=f.structures.find(s=>s.kind===k&&R.built(s,d.now));if(b)buildings[k]={b,start:Math.max(d.now,...(b.queue||[]).map(q=>q.until)),slots:Math.max(0,8-(b.queue||[]).filter(q=>q.until>d.now).length)}}
    const max=(recipe,need)=>{const r=W.recipes[recipe],b=buildings[r.building],closed=window.__FS_CRAFT__===false||['butter','cheese'].includes(recipe)&&window.__FS_DAIRY__===false||recipe==='cloth'&&window.__FS_CRAFT2__===false||recipe==='juice'&&!R.craftOpen('press');return !b||closed?0:Math.max(0,Math.min(Math.ceil(Math.max(0,need-stock[recipe])/r.count),b.slots,Math.floor((deadline-60000-b.start)/r.ms),Math.floor((200-stock[recipe])/r.count)))};
    const limits={bread:max('bread',target.bread),butter:max('butter',target.butter),cheese:max('cheese',target.cheese),cloth:max('cloth',target.cloth),juice:max('juice',target.juice)};
    let best=null;
    // Outputs are chosen first; their inputs are then reserved together. This
    // avoids counting the same milk, egg or flour for two different uses.
    for(let bread=0;bread<=limits.bread;bread++)for(let flour=0;flour<=max('flour',target.flour+bread);flour++)for(let butter=0;butter<=limits.butter;butter++)for(let cheese=0;cheese<=limits.cheese;cheese++)for(let cloth=0;cloth<=limits.cloth;cloth++)for(let juice=0;juice<=limits.juice;juice++){
      if(butter+cheese>(buildings.dairy?.slots||0))continue;
      const millEnd=(buildings.mill?.start||d.now)+flour*600000;
      const bakeryEnd=Math.max(buildings.bakery?.start||d.now,flour?millEnd:d.now)+bread*1800000;
      const dairyEnd=(buildings.dairy?.start||d.now)+butter*3600000+cheese*7200000;
      const loomEnd=(buildings.loom?.start||d.now)+cloth*7200000;
      const pressEnd=(buildings.press?.start||d.now)+juice*2400000;
      if(juice&&pressEnd>deadline-60000)continue;
      if(bread&&bakeryEnd>deadline-60000||butter+cheese&&dairyEnd>deadline-60000||cloth&&loomEnd>deadline-60000)continue;
      const required={...target,flour:target.flour+bread,egg:target.egg+bread,milk:target.milk+butter+2*cheese,wool:target.wool+2*cloth,wheat:target.wheat+flour,fruit:target.fruit+2*juice};
      const counts={bread,flour,butter,cheese,cloth,juice};let cost=0;const buys=[];
      for(const k of items){const n=Math.max(0,required[k]-stock[k]-(counts[k]||0)*(W.recipes[k]?.count||1)),offer=purchase(k,n);if(!offer){cost=Infinity;break}cost+=offer.cost;if(cost>budget){cost=Infinity;break}buys.push(...offer.buys)}
      if(!Number.isFinite(cost))continue;
      const energy=Object.values(counts).filter(Boolean).length*2,energyCost=energy*energyUnit,score=cost+energyCost,finish=Math.max(d.now,flour?millEnd:0,bread?bakeryEnd:0,butter+cheese?dairyEnd:0,cloth?loomEnd:0,juice?pressEnd:0);
      if(!best||score<best.score||score===best.score&&(cost<best.cost||cost===best.cost&&finish<best.finish))best={cost,energy,energyCost,score,finish,buys,counts};
    }
    return best;
  }
  const margin=.10;
  const signature=o=>JSON.stringify(Object.entries(o.items).sort(([a],[b])=>a.localeCompare(b)));
  const key=(day,index)=>day+'#'+index;
  const terms=d=>{const q=R.quote(d);return JSON.stringify([d.farm.level,d.price.pay,d.price.mult,q.bonus,q.nftCapBonus,q.nftYieldBonus,W.orderCount()])};
  function initialize(d,ledger){
    ledger.orderCosts??={};
    if(!ledger.orderCosts||typeof ledger.orderCosts!=='object'||Array.isArray(ledger.orderCosts))throw Error('订单成本记录异常，已暂停');
    for(const [k,c]of Object.entries(ledger.orderCosts))if(!/^\d{4}-\d{2}-\d{2}#[0-3]$/.test(k)||!c||typeof c.signature!=='string'||!Number.isSafeInteger(c.cash)||c.cash<0||!Number.isSafeInteger(c.energy)||c.energy<0||!Number.isFinite(c.energyCost)||c.energyCost<0)throw Error('订单成本记录异常，已暂停');
    const day=W.orderDay(d);
    if(!ledger.marketLegacy){const assigned=Object.entries(ledger.orderCosts).filter(([k])=>k.startsWith(day+'#')).reduce((n,[,c])=>n+c.cash,0);ledger.marketLegacy={day,cash:Math.max(0,(ledger.marketSpent||0)-assigned)}}
    if(typeof ledger.marketLegacy.day!=='string'||!Number.isSafeInteger(ledger.marketLegacy.cash)||ledger.marketLegacy.cash<0)throw Error('旧版采购记录异常，已暂停');
    const active=ledger.activeMarketOrder;
    if(active&&(!ledger.orderCosts[key(active.day,active.index)]||ledger.orderCosts[key(active.day,active.index)].signature!==active.signature))throw Error('订单投入记录不完整，已暂停');
    if(active&&(typeof active.day!=='string'||!Number.isInteger(active.index)||active.index<0||active.index>3||typeof active.signature!=='string'))throw Error('待完成订单记录异常，已暂停');
  }
  function reconcile(d,ledger){
    const day=W.orderDay(d),active=ledger.activeMarketOrder;let changed=false;
    if(active&&(active.day!==day||d.farm.orders?.day===day&&d.farm.orders.done?.includes(active.index))){ledger.activeMarketOrder=null;changed=true}
    for(const k of Object.keys(ledger.orderCosts))if(!k.startsWith(day+'#')){delete ledger.orderCosts[k];changed=true}
    if(ledger.marketLegacy.day!==day){ledger.marketLegacy={day,cash:0};changed=true}
    return changed;
  }
  function activeOrder(d,board,ledger){
    const a=ledger?.activeMarketOrder;if(!a||a.day!==W.orderDay(d)||!board||board.day!==a.day)return null;
    const order=board.orders.find(o=>o.index===a.index&&!o.done);
    return {...a,valid:!!order&&a.signature===signature(order)};
  }
  function charge(d,ledger,job){
    if(!job.orderKey)return;
    const a=ledger.activeMarketOrder;
    if(a&&(key(a.day,a.index)!==job.orderKey||a.signature!==job.orderSignature))throw Error('订单归属变化，已暂停');
    const row=ledger.orderCosts[job.orderKey]??={signature:job.orderSignature,cash:0,energy:0,energyCost:0};
    if(row.signature!==job.orderSignature)throw Error('订单内容变化，已暂停');
    if(job.kind==='craft-buy')row.cash+=job.cost;
    if(job.kind==='craft-start'){row.energy+=job.energy;row.energyCost+=job.energy*R.quote(d).energy10/10}
    ledger.activeMarketOrder={day:W.orderDay(d),index:job.orderIndex,signature:job.orderSignature};
  }
  function plan(d,config,board,quotes,state={}){
    if(!config.marketBuy)return null;
    const empty=(note,extra={})=>({job:null,holdCraft:false,note,...extra});
    if(!board||board.owner!==d.farm.owner||board.day!==W.orderDay(d))return empty('自动采购等待核对今日订单');
    const quote=R.quote(d);
    if(!quote.rewardMultKnown)return empty('奖励发放比例未确认，暂停采购');
    if(!Number.isFinite(d.farm.tokens)||d.farm.tokens<0||d.farm.tokens>Number.MAX_SAFE_INTEGER||!Number.isFinite(quote.energy10))return empty('余额或能量报价无法确认，暂停采购');
    const active=activeOrder(d,board,state);
    if(active&&!active.valid)return empty('已投入成本的订单内容变化，暂停采购',{active});
    const deadline=W.orderReset(d),stock=inventory(d,deadline),day=board.day;
    stock.wheat=Math.max(0,stock.wheat-W.feedWheat(d,config.feedDays));
    const evaluations=[];let best=null;
    for(const order of board.orders){
      if(order.done||order.forecast||active&&order.index!==active.index)continue;
      const reward=W.reward(order);
      if(!Number.isFinite(reward)||!(reward>0)){evaluations.push({index:order.index,reason:'仅星星，不采购'});continue}
      const orderKey=key(day,order.index),past=state.orderCosts?.[orderKey]||{cash:0,energy:0,energyCost:0};
      if(past.signature&&past.signature!==signature(order)){evaluations.push({index:order.index,reason:'订单内容变化，成本无法核对'});continue}
      const legacy=state.marketLegacy?.day===day?state.marketLegacy.cash:0;
      const spent=past.cash+past.energyCost+legacy;
      const target=targets([order]);
      // Existing final goods are credited first; all raw inputs and outputs are
      // reserved together by solve. No forecast reward authorizes a purchase.
      const selected=solve(d,target,stock,quotes,d.farm.tokens,deadline);
      const profitable=selected&&spent+selected.score<=reward*(1-margin)+1e-6;
      let use=selected;
      // Stock-only work may continue even when it does not earn 10% margin.
      // Its energy is still booked to this order before later purchases.
      if(!profitable)use=solve(d,target,stock,[],0,deadline);
      if(!use){evaluations.push({index:order.index,reward,cost:selected?spent+selected.score:null,net:selected?reward-spent-selected.score:null,reason:selected?'预计净增不足奖励的10%，不采购':'报价、余额或加工时间不足'});continue}
      const net=reward-spent-use.score;
      const candidate={selected:use,order,target,net,reward,past,legacy,profitable:!!profitable,active,orderKey,orderSignature:signature(order),orderIndex:order.index,feedReserve:W.feedWheat(d,config.feedDays)};
      evaluations.push({index:order.index,reward,cost:spent+use.score,net,reason:profitable?'保留至少10%余量':'仅用库存加工，不采购'});
      if(!best||active||candidate.profitable&&!best.profitable||candidate.profitable===best.profitable&&(net>best.net||net===best.net&&use.finish<best.selected.finish))best=candidate;
    }
    if(!best)return empty(active?'当前订单已投入成本，暂停追加采购；等待库存或奖励恢复':'暂无可盈利采购的今日订单；'+(config.workshopStars===false?'已跳过纯星星订单':'纯星星只用库存')+'；次日备货不采购',{active,evaluations});
    const {selected,order,reward,past,legacy,net}=best;
    const amount=n=>n.toLocaleString('zh-CN',{maximumFractionDigits:2});
    const summary='订单 #'+(order.index+1)+' · 预计可领 '+amount(reward)+' 金币\n已采购 '+amount(past.cash+legacy)+' · 还需采购 '+amount(selected.cost)+' · 加工能量折算 '+amount(past.energyCost+selected.energyCost)+' 金币\n预计净增 '+amount(net)+' 金币'+(best.profitable?' · 保留至少10%余量':' · 仅用库存，不采购');
    const short='订单 #'+(order.index+1)+' · 预计净增 '+amount(net)+' 金币';
    if(!selected.buys.length)return {...best,...empty(short+'；仅用库存和队列完成'),summary,evaluations};
    selected.buys.sort((a,b)=>outputs.includes(b.item)-outputs.includes(a.item)||a.price-b.price);
    const buy=selected.buys[0];
    const job={kind:'craft-buy',route:'market',action:'market-buy',arg:buy.id+':1',listingId:buy.id,item:buy.item,count:1,unit:buy.price,cost:buy.price,before:W.stock(d.farm,buy.item),tokensBefore:d.farm.tokens,energy:0,value:0,orderKey:best.orderKey,orderIndex:order.index,orderSignature:best.orderSignature};
    return {...best,job,holdCraft:true,note:short+'；先买'+names[buy.item]+'（每份 '+buy.price+'）',summary,evaluations};
  }
  function productionJobs(d,result,existing){
    if(!result?.selected||result.holdCraft)return [];
    const f=d.farm,available={};for(const k of items)available[k]=Math.max(0,W.stock(f,k)-(result.target[k]||0));
    available.wheat=Math.max(0,available.wheat-result.feedReserve);
    const counts=result.selected.counts,jobs=[],extra=!Object.values(counts).some(Boolean);
    for(const recipe of ['flour','bread','butter','cheese','cloth','juice']){
      const r=W.recipes[recipe],s=f.structures.find(b=>b.kind===r.building&&R.built(b,d.now));if(!s)continue;
      // Once order stock is covered, spare inventory may still make the usual
      // energy bread. Never buy its ingredients or take reserved order stock.
      const spare=extra&&['flour','bread'].includes(recipe)?existing.find(j=>j.kind==='craft-start'&&j.recipe===recipe&&!j.prep):null;
      const desired=counts[recipe]||spare?.count||0;let n=desired;for(const [k,v]of Object.entries(r.inputs))n=Math.min(n,Math.floor(available[k]/v));
      if(!n||!spare&&n<desired)continue;for(const [k,v]of Object.entries(r.inputs))available[k]-=n*v;
      jobs.push({kind:'craft-start',route:'rwa',id:s.id,action:'craft-start',arg:recipe+':'+n,recipe,count:n,finishAt:result.selected.finish,before:JSON.stringify(s.queue||[]),energy:2,value:0,prep:false,...(spare?{}:{orderKey:result.orderKey,orderIndex:result.orderIndex,orderSignature:result.orderSignature})});
    }
    return jobs;
  }
  function pendingDone(p,d){return p.kind==='craft-buy'&&W.stock(d.farm,p.item)>=p.before+p.count&&d.farm.tokens<=p.tokensBefore-p.cost}
  window.__farmMarket={names,items,listings,targets,solve,margin,signature,terms,initialize,reconcile,activeOrder,charge,plan,productionJobs,pendingDone};
})();
