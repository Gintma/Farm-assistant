/* Compare bounded, available market supply with the ordinary recipe graph. */
(() => {
  const R=window.__farmRules,W=window.__farmWorkshop;
  const names={bread:'面包',flour:'面粉',egg:'鸡蛋',wheat:'小麦',milk:'牛奶',butter:'黄油',cheese:'奶酪',wool:'羊毛',cloth:'布料'};
  const items=Object.keys(names),outputs=['bread','flour','butter','cheese','cloth'];
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
  function solve(d,config,target,stock,quotes,budget,deadline){
    const f=d.farm,by={},memo={},energyUnit=R.quote(d).energy10/10;
    for(const k of items){by[k]=quotes.filter(x=>x.item===k&&x.exp>d.now&&x.price<=config['marketMax_'+k]).sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id));memo[k]=new Map()}
    const purchase=(k,count)=>{
      count=Math.max(0,count);if(memo[k].has(count))return memo[k].get(count);
      let left=count,cost=0;const buys=[];
      for(const row of by[k]){const n=Math.min(left,row.qty);if(n){buys.push({...row,count:n});cost+=n*row.price;left-=n}if(!left)break}
      const result=left?null:{cost,buys};memo[k].set(count,result);return result;
    };
    const buildings={};for(const k of ['mill','bakery','dairy','loom']){const b=f.structures.find(s=>s.kind===k&&R.built(s,d.now));if(b)buildings[k]={b,start:Math.max(d.now,...(b.queue||[]).map(q=>q.until)),slots:Math.max(0,8-(b.queue||[]).filter(q=>q.until>d.now).length)}}
    const max=(recipe,need)=>{const r=W.recipes[recipe],b=buildings[r.building],closed=window.__FS_CRAFT__===false||['butter','cheese'].includes(recipe)&&window.__FS_DAIRY__===false||recipe==='cloth'&&window.__FS_CRAFT2__===false;return !b||closed?0:Math.max(0,Math.min(Math.ceil(Math.max(0,need-stock[recipe])/r.count),b.slots,Math.floor((deadline-60000-b.start)/r.ms),Math.floor((200-stock[recipe])/r.count)))};
    const limits={bread:max('bread',target.bread),butter:max('butter',target.butter),cheese:max('cheese',target.cheese),cloth:max('cloth',target.cloth)};
    let best=null;
    // Outputs are chosen first; their inputs are then reserved together. This
    // avoids counting the same milk, egg or flour for two different uses.
    for(let bread=0;bread<=limits.bread;bread++)for(let flour=0;flour<=max('flour',target.flour+bread);flour++)for(let butter=0;butter<=limits.butter;butter++)for(let cheese=0;cheese<=limits.cheese;cheese++)for(let cloth=0;cloth<=limits.cloth;cloth++){
      if(butter+cheese>(buildings.dairy?.slots||0))continue;
      const millEnd=(buildings.mill?.start||d.now)+flour*600000;
      const bakeryEnd=Math.max(buildings.bakery?.start||d.now,flour?millEnd:d.now)+bread*1800000;
      const dairyEnd=(buildings.dairy?.start||d.now)+butter*3600000+cheese*7200000;
      const loomEnd=(buildings.loom?.start||d.now)+cloth*7200000;
      if(bread&&bakeryEnd>deadline-60000||butter+cheese&&dairyEnd>deadline-60000||cloth&&loomEnd>deadline-60000)continue;
      const required={...target,flour:target.flour+bread,egg:target.egg+bread,milk:target.milk+butter+2*cheese,wool:target.wool+2*cloth,wheat:target.wheat+flour};
      const counts={bread,flour,butter,cheese,cloth};let cost=0;const buys=[];
      for(const k of items){const n=Math.max(0,required[k]-stock[k]-(counts[k]||0)*(W.recipes[k]?.count||1)),offer=purchase(k,n);if(!offer){cost=Infinity;break}cost+=offer.cost;if(cost>budget){cost=Infinity;break}buys.push(...offer.buys)}
      if(!Number.isFinite(cost))continue;
      const energy=Object.values(counts).filter(Boolean).length*2,score=cost+energy*energyUnit,finish=Math.max(d.now,flour?millEnd:0,bread?bakeryEnd:0,butter+cheese?dairyEnd:0,cloth?loomEnd:0);
      if(!best||score<best.score||score===best.score&&(cost<best.cost||cost===best.cost&&finish<best.finish))best={cost,energy,score,finish,buys,counts};
    }
    return best;
  }
  function plan(d,config,board,workshop,quotes,spent=0){
    if(!config.marketBuy)return null;
    const empty=note=>({job:null,holdCraft:false,note});
    if(!(config.marketBudget>0)||!items.some(k=>config['marketMax_'+k]>0))return empty('市场补料未设置预算或单价上限');
    if(!board||board.owner!==d.farm.owner||board.day!==W.orderDay(d))return empty('市场补料等待核对今日订单');
    const budget=Math.max(0,Math.min(config.marketBudget-spent,d.farm.tokens));
    if(!budget)return empty('今日市场预算已用完，或余额不足');
    const deadline=W.orderReset(d),target=targets(board.orders),stock=inventory(d,deadline);
    // Grain held for animal feed is not sold or silently consumed by a purchase plan.
    stock.wheat=Math.max(0,stock.wheat-W.feedWheat(d,config.feedDays));
    let selected=solve(d,config,target,stock,quotes,budget,deadline),prep=false,chosenTarget=target;
    const covered=items.every(k=>stock[k]>=target[k]);
    if(covered&&config.workshopPrep&&workshop?.prep&&!workshop.prep.error){
      const nextTarget=targets(workshop.prep.orders),left={...stock};for(const k of items)left[k]=Math.max(0,left[k]-target[k]);
      selected=solve(d,config,nextTarget,left,quotes,budget,deadline);prep=true;chosenTarget=nextTarget;
    }
    if(!selected)return empty('可用报价、预算或加工时间不足；等待库存或市场变化');
    const context={target:chosenTarget,reserve:prep?target:{},feedReserve:W.feedWheat(d,config.feedDays),prep};
    if(!selected.buys.length)return {...context,...empty('现有库存及队列可完成'+(prep?'次日备货':'今日订单')+'；预计加工 '+selected.energy+' 能量'),selected};
    // Prefer finished goods first. Each original Buy 1 click is confirmed before
    // re-reading demand and prices; never submit an unconfirmed purchase twice.
    selected.buys.sort((a,b)=>outputs.includes(b.item)-outputs.includes(a.item)||a.price-b.price);
    const buy=selected.buys[0];
    const job={kind:'craft-buy',route:'market',action:'market-buy',arg:buy.id+':1',listingId:buy.id,item:buy.item,count:1,unit:buy.price,cost:buy.price,before:W.stock(d.farm,buy.item),tokensBefore:d.farm.tokens,energy:0,value:0,prep};
    return {...context,job,selected,holdCraft:true,note:(prep?'次日备货':'今日订单')+'最低估算方案：采购 '+selected.cost+' 金币，加工 '+selected.energy+' 能量；先买'+names[buy.item]+'（每份 '+buy.price+'）'};
  }
  function productionJobs(d,result,existing){
    if(!result?.selected||result.holdCraft)return [];
    const f=d.farm,available={};for(const k of items)available[k]=Math.max(0,W.stock(f,k)-(result.reserve[k]||0)-(result.target[k]||0));
    available.wheat=Math.max(0,available.wheat-result.feedReserve);
    const counts=result.selected.counts,jobs=[],extra=!Object.values(counts).some(Boolean);
    for(const recipe of ['flour','bread','butter','cheese','cloth']){
      const r=W.recipes[recipe],s=f.structures.find(b=>b.kind===r.building&&R.built(b,d.now));if(!s)continue;
      // Once order stock is covered, spare inventory may still make the usual
      // energy bread. Never buy its ingredients or take reserved order stock.
      const spare=extra&&['flour','bread'].includes(recipe)?existing.find(j=>j.kind==='craft-start'&&j.recipe===recipe&&!j.prep):null;
      let n=counts[recipe]||spare?.count||0;for(const [k,v]of Object.entries(r.inputs))n=Math.min(n,Math.floor(available[k]/v));
      if(!n)continue;for(const [k,v]of Object.entries(r.inputs))available[k]-=n*v;
      jobs.push({kind:'craft-start',route:'rwa',id:s.id,action:'craft-start',arg:recipe+':'+n,recipe,count:n,finishAt:result.selected.finish,before:JSON.stringify(s.queue||[]),energy:2,value:0,prep:spare?false:result.prep});
    }
    return jobs;
  }
  function pendingDone(p,d){return p.kind==='craft-buy'&&W.stock(d.farm,p.item)>=p.before+p.count&&d.farm.tokens<=p.tokensBefore-p.cost}
  window.__farmMarket={names,items,listings,targets,solve,plan,productionJobs,pendingDone};
})();
