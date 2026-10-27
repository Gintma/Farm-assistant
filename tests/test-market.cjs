const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {boot}=require('./test-farm-automation.cjs');
const ctx={window:{}};for(const file of ['farm-rules','workshop-rules','market-rules'])vm.runInNewContext(fs.readFileSync('src/'+file+'.js','utf8'),ctx);
const {__farmRules:R,__farmWorkshop:W,__farmMarket:M}=ctx.window;
function fixture(){
 const d={owner:'test',access:{open:true},now:Date.parse('2026-10-23T01:00:00Z'),price:{pay:.00032,charge:.00031,mult:1},farm:{owner:'test',level:4,tz:480,tokens:100000,today:{day:'2026-10-23',energy:100,harvestEarned:0},animals:[],fields:[],structures:['mill','bakery','dairy','loom'].map(k=>({id:k,kind:k,queue:[]})),silo:{feed:0,wheat:0,corn:0},pantry:{},harvestCarry:0}};
 const config={marketBuy:true,marketBudget:100000,feedDays:1,workshopPrep:false,...Object.fromEntries(M.items.map(k=>['marketMax_'+k,10000]))};
 const board={owner:'test',day:'2026-10-23',orders:[{index:0,items:{bread:4},done:false,reward:0}]};
 const quote=(item,price,qty=100,id=item)=>({id,item,price,qty,mine:false,exp:d.now+86400000});
 return {d,config,board,quote,plan(quotes=[],spent=0,workshop={}){return M.plan(d,config,board,workshop,quotes,spent)}};
}
let b=fixture(),p=b.plan([b.quote('bread',10),b.quote('wheat',100),b.quote('egg',20),b.quote('flour',80)]);
assert.equal(p.job.item,'bread','cheap finished bread wins over wheat and flour chains');assert.equal(p.selected.cost,40);assert.equal(p.selected.energy,0);assert.equal(p.job.count,1);
b=fixture();p=b.plan([b.quote('bread',100),b.quote('wheat',1),b.quote('egg',1),b.quote('flour',100)]);assert.equal(p.selected.counts.bread,1);assert.equal(p.selected.counts.flour,1);assert.equal(p.selected.cost,2);assert.deepEqual(Array.from(p.selected.buys,x=>x.item).sort(),['egg','wheat']);
b=fixture();p=b.plan([b.quote('bread',100),b.quote('wheat',100),b.quote('egg',1),b.quote('flour',20)]);assert.equal(p.selected.counts.flour,0);assert.equal(p.selected.counts.bread,1);assert.equal(p.selected.cost,21);
b=fixture();b.d.farm.pantry.bread=3;p=b.plan([b.quote('bread',10)]);assert.equal(p.selected.cost,10,'only the actual shortfall is purchased');b.d.farm.pantry.bread=4;assert.equal(b.plan([b.quote('bread',10)]).job,null,'existing finished inventory wins without purchasing');
b=fixture();b.d.farm.pantry={flour:1,egg:1};p=b.plan([b.quote('bread',100)]);assert.equal(p.job,null);assert.equal(p.selected.counts.bread,1,'usable stocked ingredients can finish an order without cash');
b=fixture();b.board.orders[0].items={flour:1,bread:4};b.d.farm.pantry={flour:1,egg:1};p=b.plan([b.quote('flour',1),b.quote('bread',100)]);assert.equal(p.selected.cost,1,'direct flour and bread cannot consume the same flour');
b=fixture();b.board.orders[0].items={butter:1,cheese:1};b.d.farm.pantry.milk=2;b.config.marketMax_milk=0;p=b.plan([b.quote('milk',1),b.quote('butter',100),b.quote('cheese',300)]);assert.equal(p.job.item,'butter');assert.equal(p.selected.counts.cheese,1);assert.equal(p.selected.counts.butter,0,'milk is reserved jointly for both dairy recipes');
b=fixture();b.d.farm.structures=[];p=b.plan([b.quote('bread',20),b.quote('wheat',1),b.quote('egg',1)]);assert.equal(p.job.item,'bread','unbuilt production cannot justify ingredient purchases');
b=fixture();b.d.now=W.orderReset(b.d)-120000;b.d.farm.today.day=R.calendar(b.d.farm,b.d.now).day;p=b.plan([b.quote('bread',20),b.quote('wheat',1),b.quote('egg',1)]);assert.equal(p.job.item,'bread','processing that misses reset cannot justify buying ingredients');
b=fixture();b.d.farm.structures.find(s=>s.kind==='bakery').queue=Array.from({length:8},()=>({r:'bread',until:W.orderReset(b.d)+1000}));p=b.plan([b.quote('bread',20),b.quote('wheat',1),b.quote('egg',1)]);assert.equal(p.job.item,'bread','full queue excludes new batches');
b=fixture();b.d.farm.structures.find(s=>s.kind==='bakery').queue=[{r:'bread',until:b.d.now+1800000}];assert.equal(b.plan([b.quote('bread',20)]).job,null,'already queued output is not bought again');
b=fixture();assert.equal(b.plan([b.quote('bread',10,3)]).job,null,'do not start a plan whose full required quantity is unavailable');p=b.plan([b.quote('bread',10,2,'cheap'),b.quote('bread',20,2,'next')]);assert.equal(p.selected.cost,60,'price tiers and finite supply are included');
b=fixture();b.config.marketMax_bread=9;assert.equal(b.plan([b.quote('bread',10)]).job,null);b.config.marketMax_bread=10;b.config.marketBudget=39;assert.equal(b.plan([b.quote('bread',10)]).job,null);b.config.marketBudget=40;assert.equal(b.plan([b.quote('bread',10)]).selected.cost,40);assert.equal(b.plan([b.quote('bread',10)],1).job,null);b.d.farm.tokens=39;assert.equal(b.plan([b.quote('bread',10)]).job,null);
b=fixture();let quotes=M.listings({listings:[b.quote('bread',10,100,'ok'),{...b.quote('bread',1),mine:true},{...b.quote('bread',1),id:'bad:1'},{...b.quote('bread',1),price:-1}]});assert.equal(quotes.length,1);assert.throws(()=>M.listings({}));assert.equal(b.plan([{...b.quote('bread',10),exp:b.d.now}]).job,null);
b=fixture();b.config.marketBuy=false;assert.equal(b.plan([b.quote('bread',1)]),null);b.config.marketBuy=true;b.config.marketBudget=0;assert.equal(b.plan([b.quote('bread',1)]).job,null);b.config.marketBudget=1000;b.board.owner='someone-else';assert.equal(b.plan([b.quote('bread',1)]).job,null);
b=fixture();p=b.plan([b.quote('bread',10)]);assert.equal(M.pendingDone(p.job,b.d),false);b.d.farm.pantry.bread=1;assert.equal(M.pendingDone(p.job,b.d),false,'stock increase alone is not a confirmed buy');b.d.farm.tokens-=10;assert.equal(M.pendingDone(p.job,b.d),true);
b=fixture();b.board.orders[0].done=true;b.config.workshopPrep=true;let prep={prep:{orders:[{items:{bread:4}}]}};p=b.plan([b.quote('bread',10)],0,prep);assert.equal(p.job.prep,true);assert.equal(b.plan([b.quote('bread',10)],0,{prep:{error:'mismatch',orders:prep.prep.orders}}).job,null,'unverified forecasts do not purchase');

// The production runner follows the chosen path, protecting direct orders.
b=fixture();b.d.farm.pantry={flour:1,egg:1};p=b.plan([b.quote('bread',100)]);let jobs=M.productionJobs(b.d,p,[]);assert.equal(jobs[0].recipe,'bread');assert.equal(jobs[0].count,1);
b=fixture();b.board.orders[0].items={flour:1,bread:4};b.d.farm.pantry={flour:1,egg:1};b.d.farm.silo.wheat=1;p=b.plan([]);jobs=M.productionJobs(b.d,p,[]);assert.deepEqual(Array.from(jobs,j=>j.recipe),['flour'],'direct flour is reserved until the missing batch arrives');
b=fixture();p=b.plan([b.quote('bread',10)]);assert.equal(M.productionJobs(b.d,p,[]).length,0,'do not start a conflicting recipe while purchasing finished goods');
b=fixture();b.board.orders[0].done=true;b.config.workshopPrep=true;b.d.farm.pantry={flour:5,egg:1};p=b.plan([],0,{prep:{orders:[{items:{flour:5}}]}});const eatJob={kind:'craft-start',recipe:'bread',count:1,prep:false};assert.equal(M.productionJobs(b.d,p,[eatJob]).length,0,'energy bread cannot consume tomorrow flour reserve');b.d.farm.pantry.flour=6;p=b.plan([],0,{prep:{orders:[{items:{flour:5}}]}});assert.equal(M.productionJobs(b.d,p,[eatJob])[0].recipe,'bread','spare raw inventory can still make energy bread');
b=fixture();b.d.farm.structures.find(s=>s.kind==='dairy').queue=Array.from({length:7},()=>({r:'butter',until:b.d.now+3600000}));b.board.orders[0].items={butter:8,cheese:1};p=b.plan([b.quote('milk',1),b.quote('butter',100),b.quote('cheese',100)]);assert.ok(p.selected.counts.butter+p.selected.counts.cheese<=1,'both dairy recipes share the eight slots');
b=fixture();b.d.farm.pantry={egg:1};b.d.farm.silo.wheat=1;b.d.farm.animals=[{kind:'chicken'}];p=b.plan([b.quote('bread',100),b.quote('wheat',1)]);assert.ok(p.selected.buys.some(x=>x.item==='wheat'),'wheat reserved for animal feed cannot also be used by orders');

async function marketBoot(store=new Map()){
 const b=await boot(store),baseQuery=b.doc.querySelectorAll.bind(b.doc),baseFetch=b.context.fetch;
 b.d.farm.animals=[];b.d.farm.structures=b.d.farm.structures.filter(s=>s.kind!=='coop');b.d.farm.pantry={bread:0};b.d.farm.silo.feed=0;b.d.farm.orders={day:'2026-10-23',done:[1,2],dayTokens:0};b.d.farm.structures.push({id:'mill',kind:'mill'},{id:'bakery',kind:'bakery'});
 const W=b.context.window.__farmWorkshop;W.readBudget=async()=>({budget:{left:100000},ageMs:0});
 let fail=false,price=10,marketReads=0,domPrice=null;
 const ordersButton=b.action('orders',()=>b.setPanel('orders')),shopMarket=b.action('shop',()=>b.setPanel('market'),'market');
 const filter=b.action('market-item',()=>{},'bread');filter.classList.contains=k=>k==='on';
 const buy=b.action('market-buy',()=>{if(!fail){b.d.farm.pantry.bread++;b.d.farm.tokens-=price}},'offer:1');buy.closest=()=>({querySelector:()=>({textContent:String(domPrice??price)})});
 const orders=b.el();orders.querySelectorAll=()=>[0,1,2].map(index=>({classList:{contains:k=>k==='done'&&b.d.farm.orders.done.includes(index)},querySelectorAll:()=>[{textContent:'bread',querySelector:()=>({textContent:'0/4'})}],querySelector:s=>s==='.ord-side b'?{textContent:'+0 SEASON'}:{dataset:{arg:String(index)}}}));
 const list=b.el();b.doc.querySelector=s=>s==='#panel .orders'&&b.panel()==='orders'?orders:s==='#panel .mkt-list'&&b.panel()==='market'?list:null;
 b.doc.querySelectorAll=s=>{
  const a=s.match(/data-action="([^"]+)"/)?.[1];
  if(s.startsWith('#panel')){if(b.panel()==='more'&&a==='orders')return [ordersButton];if(b.panel()==='shop'&&a==='shop')return [shopMarket];if(b.panel()==='market'&&a==='market-item')return [filter];if(b.panel()==='market'&&a==='market-buy')return [buy]}
  return baseQuery(s);
 };
 b.context.fetch=async(url,opts)=>{if(url==='/api/farm/market'){marketReads++;return{ok:true,json:async()=>({listings:[{id:'offer',item:'bread',price,qty:100,mine:false,exp:b.d.now+86400000}]})}}return baseFetch(url,opts)};
 b.api.configure('marketBuy',true);b.api.configure('marketBudget',100);b.api.configure('marketMax_bread',20);b.api.configure('workshopPrep',false);b.api.configure('workshopEat',false);b.api.set('workshop',true);
 return Object.assign(b,{fail:v=>fail=v,price:v=>price=v,domPrice:v=>domPrice=v,marketReads:()=>marketReads,spent:()=>(JSON.parse(store.get('farm-helper.farm-v2.test-owner.ledger')||'{}').marketSpent||0)});
}
(async()=>{
 let b=await marketBoot();assert.equal(b.api.configure('marketMax_wheat',-1),false);assert.equal(b.api.configure('marketMax_unknown',1),false);assert.equal(b.api.configure('marketBudget',Infinity),false);
 await b.step(5);assert.equal(b.clicks.filter(x=>x==='market-buy:offer:1').length,1);assert.equal(b.api.status().pending.kind,'craft-buy');assert.equal(b.spent(),10);await b.step();assert.equal(b.clicks.filter(x=>x==='market-buy:offer:1').length,2,'confirmation allows exactly the next missing unit');await b.step(3);assert.equal(b.clicks.filter(x=>x==='market-buy:offer:1').length,4,'only the four missing bread are bought');assert.equal(b.spent(),40);assert.equal(b.api.status().pending,null);b.api.remove();
 b=await marketBoot();b.fail(true);await b.step(10);assert.equal(b.clicks.filter(x=>x==='market-buy:offer:1').length,1,'failed or ambiguous purchase must not repeat');assert.equal(b.spent(),10);const saved=b.store;b.api.remove();b=await marketBoot(saved);await b.step(8);assert.equal(b.clicks.filter(x=>x==='market-buy:offer:1').length,0,'unconfirmed purchase survives reinstall');assert.equal(b.spent(),10);b.api.remove();
 b=await marketBoot();b.domPrice(11);await b.step(10);assert.equal(b.clicks.filter(x=>x==='market-buy:offer:1').length,0,'DOM quote must match the authenticated market quote');assert.equal(b.spent(),0);b.api.remove();
 b=await marketBoot();b.verify(true);await b.step(10);assert.equal(b.clicks.length,0);assert.equal(b.marketReads(),0);b.verify(false);b.api.configure('marketBudget',0);await b.step(10);assert.equal(b.clicks.filter(x=>x==='market-buy:offer:1').length,0);assert.equal(b.marketReads(),0);b.api.remove();
 b=await marketBoot();b.fail(true);await b.step(5);await b.step(14,15000);assert.equal(b.api.status().needsReview,true);const walk=x=>[x,...(x.children||[]).filter(c=>c&&typeof c==='object').flatMap(walk)];const resolve=walk(b.api.sections.workshop).find(x=>x.textContent==='我已核对未成交，停止等待');assert.equal(resolve.hidden,false);resolve.onclick();assert.equal(b.api.status().pending,null);assert.equal(b.api.status().config.marketBuy,false);assert.equal(b.spent(),10,'manual failure resolution keeps the conservative budget charge');await b.step(3);assert.equal(b.clicks.filter(x=>x==='market-buy:offer:1').length,1);b.api.remove();
 b=await marketBoot();b.context.window.__farmVersionGuard={isBlocked:()=>true};await b.step(10);assert.equal(b.marketReads(),0);assert.equal(b.clicks.length,0);b.api.remove();
 b=await marketBoot();b.price(21);await b.step(10);assert.equal(b.clicks.filter(x=>x==='market-buy:offer:1').length,0,'price above the user ceiling cannot spend');b.api.remove();
 // Plant submission records the decision and that snapshot's actual allowance.
 b=await boot();b.d.farm.animals=[];b.d.farm.fields=[{id:'field',crop:null,plantedAt:0}];b.setPanel('fields');b.api.configure('reserve',0);b.api.configure('crop','turnip');
 const plant=b.action('plant-all',()=>b.queue([{type:'plant'}]),'turnip'),query=b.doc.querySelectorAll.bind(b.doc);b.doc.querySelectorAll=s=>s.includes('data-action="plant-all"')?[plant]:query(s);
 b.api.set('fields',true);await b.step();assert.equal(b.api.status().pending.crop,'turnip');assert.equal(b.api.status().pending.harvestBefore,0);assert.match(b.context.window.__farmActivity.entries()[0].text,/今日收获未满.*已得 0/);b.api.remove();
 console.log('PASS: finished/intermediate/raw cost choice; stock and shared ingredients; time/queue/capacity/supply constraints; budgets and ceilings; single-unit confirmed buys, price match, persistence and pause; harvest decision log');
})().catch(e=>{console.error(e);process.exitCode=1});
