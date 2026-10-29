const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {workshopBoot}=require('./test-workshop.cjs');
const ctx={window:{__FS_CRAFT__:true,__FS_DAIRY__:true,__FS_CRAFT2__:['loom','press']}};
for(const f of ['farm-rules','workshop-rules','market-rules'])vm.runInNewContext(fs.readFileSync('src/'+f+'.js','utf8'),ctx);
const R=ctx.window.__farmRules,W=ctx.window.__farmWorkshop,M=ctx.window.__farmMarket;
function fixture(){
 const d={owner:'test',access:{open:true},now:Date.parse('2026-10-28T01:00:00Z'),price:{pay:.00032,charge:.00031,mult:1},farm:{owner:'test',level:4,tz:480,tokens:100000,today:{day:'2026-10-28',energy:100,harvestEarned:0},animals:[],fields:[],structures:[{id:'press',kind:'press',queue:[]}],silo:{feed:0,wheat:0,corn:0},pantry:{},harvestCarry:0}};
 const config={marketBuy:true,feedDays:1,workshopPrep:false,workshopStars:true,workshopEat:false};
 const board={owner:'test',day:'2026-10-28',orders:[{index:0,items:{egg:1},reward:0,done:true},{index:1,items:{flour:1},reward:0,done:true},{index:2,items:{bread:1},reward:0,done:true},{index:3,items:{juice:2},reward:2607,done:false}]};
 const quote=(item,price,qty=100)=>({id:item,item,price,qty,mine:false,exp:d.now+86400000});
 return {d,config,board,quote,plan:(q=[],state={})=>M.plan(d,config,board,q,state)};
}
let b=fixture();assert.equal(W.orderCount(),4);assert.equal(W.orderValue(b.d,b.board.orders[3]),2187);assert.equal(W.orderCap(b.d),6563,'four orders do not multiply the daily coin allowance');
const forecast=W.forecast('test-owner','2026-10-28');assert.equal(forecast.length,4);assert.deepEqual(JSON.parse(JSON.stringify(forecast[3].items)),{juice:2});assert.equal(forecast[3].stars,2);
ctx.window.__FS_CRAFT2__=['loom'];assert.equal(W.orderCount(),3);assert.equal(W.forecast('test-owner','2026-10-28').length,3);ctx.window.__FS_CRAFT2__=['loom','press'];
b=fixture();let demand=W.demands(b.d,b.board.orders,false);assert.equal(demand.need.juice,2);assert.equal(demand.need.fruit,4);assert.equal(demand.juiceBatches,2);
b.d.farm.structures[0].queue=[{r:'juice',until:b.d.now+2400000}];demand=W.demands(b.d,b.board.orders,false);assert.equal(demand.need.fruit,2);assert.equal(demand.juiceBatches,1,'already queued juice is not produced twice');
b=fixture();b.d.farm.pantry={fruit:4};let p=W.plan(b.d,b.config,b.board);assert.equal(p.jobs.find(j=>j.recipe==='juice').count,2,'stocked fruit works without an orchard');assert.equal(p.jobs.find(j=>j.recipe==='juice').finishAt,b.d.now+4800000);
b.d.farm.structures[0].queue=[{r:'juice',until:b.d.now-1}];p=W.plan(b.d,b.config,b.board);assert(p.jobs.some(j=>j.kind==='craft-take'&&j.arg==='press'));
b=fixture();b.d.farm.structures=[];b.d.farm.pantry={juice:2};p=W.plan(b.d,b.config,b.board);assert(p.jobs.some(j=>j.kind==='craft-order'&&j.index===3),'bought juice delivers without any new building');
b=fixture();b.d.farm.structures=[];b.board.orders[0].done=false;b.board.orders[0].reward=100;b.d.farm.pantry.egg=1;p=W.plan(b.d,b.config,b.board);assert(p.jobs.some(j=>j.index===0));assert.match(p.note,/压榨坊未建成/);
b.board.orders[1]={index:1,items:{milk:1},reward:100,done:false};p=W.plan(b.d,b.config,b.board);assert(!p.jobs.some(j=>j.kind==='craft-keep'&&j.route==='barn'),'missing ingredient building never creates a navigation loop');assert(p.jobs.some(j=>j.index===0));b.board.orders[1].done=true;
p=b.plan([b.quote('juice',10),b.quote('fruit',1)]);assert.equal(p.job.item,'juice','missing press cannot justify ingredient buys');assert.equal(p.orderIndex,3);assert.equal(p.selected.cost,20);
b=fixture();p=b.plan([b.quote('juice',100),b.quote('fruit',1)]);assert.equal(p.job.item,'fruit');assert.equal(p.selected.cost,4);assert.equal(p.selected.counts.juice,2);assert.equal(p.selected.energy,2);
b.d.farm.pantry.fruit=4;p=b.plan([b.quote('juice',10)]);assert.equal(p.job.item,'juice','processing energy is included even when fruit is stocked');
p=b.plan([b.quote('juice',100)]);assert.equal(p.job,null);assert.equal(M.productionJobs(b.d,p,[])[0].count,2);
b.d.farm.pantry.juice=2;p=b.plan([b.quote('juice',1),b.quote('fruit',1)]);assert.equal(p.job,null);assert.equal(p.selected.counts.juice,0,'finished stock has priority');
b=fixture();b.d.now=W.orderReset(b.d)-1800000;b.d.farm.today.day=R.calendar(b.d.farm,b.d.now).day;p=b.plan([b.quote('juice',100),b.quote('fruit',1)]);assert.equal(p.job.item,'juice','forty-minute recipe must fit before reset');
b=fixture();b.d.farm.structures[0].queue=[{r:'juice',until:b.d.now+2400000},{r:'juice',until:b.d.now+4800000}];p=b.plan([b.quote('juice',10)]);assert.equal(p.job,null,'queued final goods cover the real order');
b=fixture();b.board.orders[3].reward=0;assert.equal(b.plan([b.quote('juice',1)]).job,null);assert.equal(W.plan(b.d,{...b.config,workshopStars:false},b.board).jobs.length,0);b.d.farm.pantry.fruit=4;assert(W.plan(b.d,b.config,b.board).jobs.some(j=>j.recipe==='juice'),'stars can use stocked materials');
b=fixture();const ledger={marketSpent:0};M.initialize(b.d,ledger);p=b.plan([b.quote('juice',10)],ledger);M.charge(b.d,ledger,p.job);const restored=JSON.parse(JSON.stringify(ledger));M.initialize(b.d,restored);assert.equal(restored.orderCosts['2026-10-28#3'].cash,10);assert.equal(restored.activeMarketOrder.index,3);b.d.farm.orders={day:'2026-10-28',done:[3]};assert.equal(M.reconcile(b.d,restored),true);
// A full cash cap must not prevent keeping genuine fruit for an order. Berries
// stay outside that pantry and cannot masquerade as free juice ingredients.
b=fixture();b.d.farm.keep={fruit:true};b.d.farm.today.harvestEarned=26250;b.d.farm.harvestCarry=26250*7;b.d.farm.structures.push({id:'orch',kind:'orchard',slots:[{tree:'apple',lastHarvestAt:b.d.now-86400001},{tree:'blueberry',lastHarvestAt:b.d.now-43200001}]});
assert(R.orchardPlan(b.d)[0].value>0,'berries still count as a cash harvest');p=W.plan(b.d,b.config,b.board);const fruitJob=p.jobs.find(j=>j.kind==='craft-fruit');assert.equal(fruitJob.action,'harvest-tree');assert.equal(fruitJob.arg,0);assert.equal(fruitJob.before.length,1);assert.equal(fruitJob.value,0);assert.equal(R.pendingDone(fruitJob,b.d),false);b.d.farm.structures[1].slots[0].lastHarvestAt=b.d.now;assert.equal(R.pendingDone(fruitJob,b.d),true);
b.d.farm.structures[1].slots=[{tree:'lemon',lastHarvestAt:b.d.now-86400001},{tree:'orange',lastHarvestAt:b.d.now-86400001}];assert.equal(R.orchardPlan(b.d)[0].value,0);p=W.plan(b.d,b.config,b.board);assert.equal(p.jobs.find(j=>j.kind==='craft-fruit').action,'harvest-orchard');
// Fixed fixtures checked against the audited public order algorithm, including
// juice in the first three random slots and the independent fixed fourth slot.
const expectedToday=[{milk:1},{cloth:1,cheese:1},{juice:3,cheese:2},{juice:2}];
const expectedTomorrow=[{egg:3},{cloth:1,butter:2},{egg:6,milk:3},{juice:2}];
assert.deepEqual(JSON.parse(JSON.stringify(W.forecast('test-owner','2026-10-28').map(o=>o.items))),expectedToday);
assert.deepEqual(JSON.parse(JSON.stringify(W.forecast('test-owner','2026-10-29').map(o=>o.items))),expectedTomorrow);
b=fixture();b.d.owner=b.d.farm.owner=b.board.owner='test-owner';b.board.orders=expectedToday.map((items,index)=>({index,items,done:index<3,reward:0}));b.d.farm.orders={day:b.board.day,done:[0,1,2]};b.d.farm.pantry.juice=2;
p=W.plan(b.d,{...b.config,workshopPrep:true},b.board);assert.equal(p.prep.error,undefined);assert.equal(p.prep.orders.length,4);assert.equal(p.prep.need.fruit,4);assert.equal(p.prep.covered,false,'today juice is reserved and not reused for tomorrow');assert(!p.jobs.some(j=>j.prep&&j.kind==='craft-order'));
b.d.farm.structures.push({id:'reserve-orchard',kind:'orchard',slots:[]});p=W.plan(b.d,{...b.config,workshopPrep:true},b.board);assert(p.jobs.some(j=>j.kind==='craft-keep'&&j.arg==='fruit'&&j.keep),'future juice keeps fruit before the order resets');
b.d.farm.structures=b.d.farm.structures.filter(s=>s.kind!=='press');p=W.plan(b.d,{...b.config,workshopPrep:true},b.board);assert(!p.jobs.some(j=>j.kind==='craft-keep'&&j.arg==='fruit'),'missing press does not create an impossible fruit task');
ctx.window.__FS_CRAFT2__=['loom','press','jamKitchen'];assert.throws(()=>W.forecast('test-owner','2026-10-29'),/开放范围/);ctx.window.__FS_CRAFT2__=['loom','press'];
(async()=>{
 const orders=[{index:0,items:{egg:1},reward:100},{index:1,items:{flour:1},reward:0},{index:2,items:{bread:1},reward:0},{index:3,items:{juice:2},reward:2607}];
 let x=await workshopBoot(undefined,orders);
 // Only copy the feature flags; the fixture retains its own module instances.
 x.context.window.__FS_CRAFT__=true;x.context.window.__FS_DAIRY__=true;x.context.window.__FS_CRAFT2__=['loom','press'];x.d.farm.orders.done=[0,1,2];x.d.farm.pantry={juice:2};x.api.configure('workshopEat',false);x.api.configure('workshopPrep',false);x.api.set('workshop',true);await x.step(8);assert.equal(x.clicks.filter(s=>s==='order-fill:3').length,1,'fourth delivery uses its native button exactly once');assert.equal(x.api.status().pending,null);x.api.remove();
 for(const [raw,building]of [['juice',null],['果汁','press'],['juice','orchard']]){
  x=await workshopBoot(undefined,orders.map(o=>o.index===3?{...o,items:{[raw]:2}}:o));Object.assign(x.context.window,{__FS_CRAFT__:true,__FS_DAIRY__:true,__FS_CRAFT2__:['loom','press']});x.d.farm.pantry={egg:1};x.d.farm.orders.done=[1,2];if(building)x.d.farm.structures.push({id:building,kind:building,queue:[],slots:[]});x.api.configure('workshopEat',false);x.api.configure('workshopPrep',false);x.api.set('workshop',true);await x.step(8);assert(x.clicks.includes('order-fill:0'),'missing orchard and press must not block a stocked order');assert(!/布局变化|未知订单/.test(x.api.status().message));const opens=x.clicks.filter(v=>v==='orders').length;await x.step(24);assert.equal(x.clicks.filter(v=>v==='orders').length,opens,'missing buildings do not reopen the order panel repeatedly');assert.equal(x.api.status().needsReview,false);x.api.remove();
 }
 // A farm with neither building can buy profitable finished juice and submit
 // the fourth order. Each actual native buy confirms before the next one.
 x=await workshopBoot(undefined,orders);Object.assign(x.context.window,{__FS_CRAFT__:true,__FS_DAIRY__:true,__FS_CRAFT2__:['loom','press']});x.d.farm.orders.done=[0,1,2];x.d.farm.pantry={};
 const marketQuery=x.doc.querySelectorAll.bind(x.doc),select=x.doc.querySelector.bind(x.doc),get=x.context.fetch;
 const market=x.el(),filter=x.action('market-item',()=>{},'juice');filter.classList.contains=k=>k==='on';
 const buy=x.action('market-buy',()=>{x.d.farm.pantry.juice=(x.d.farm.pantry.juice||0)+1;x.d.farm.tokens-=10},'juice-offer:1');buy.closest=()=>({querySelector:()=>({textContent:'10'})});
 x.doc.querySelector=s=>s==='#panel .mkt-list'&&x.panel()==='market'?market:select(s);
 x.doc.querySelectorAll=s=>{const a=s.match(/data-action="([^"]+)"/)?.[1];if(s.startsWith('#panel')){if(x.panel()==='shop'&&a==='shop')return[x.action('shop',()=>x.setPanel('market'),'market')];if(x.panel()==='market'&&a==='market-item')return[filter];if(x.panel()==='market'&&a==='market-buy')return[buy]}return marketQuery(s)};
 x.context.fetch=async(u,o)=>u==='/api/farm/market'?{ok:true,json:async()=>({listings:[{id:'juice-offer',item:'juice',price:10,qty:100,mine:false,exp:x.d.now+86400000}]})}:get(u,o);
 x.api.configure('workshopEat',false);x.api.configure('workshopPrep',false);x.api.configure('marketBuy',true);x.api.set('workshop',true);await x.step(20);assert.equal(x.clicks.filter(v=>v==='market-buy:juice-offer:1').length,2);assert.equal(x.clicks.filter(v=>v==='order-fill:3').length,1);assert.equal(x.d.farm.tokens,99980);assert(!x.clicks.some(v=>/build|plant-tree/.test(v)));x.api.remove();
 // End-to-end native actions: keep fruit, pick only apple, queue juice, take
 // the completed juice, then fill index 3. No build/tree-purchase actions exist.
 x=await workshopBoot(undefined,orders);Object.assign(x.context.window,{__FS_CRAFT__:true,__FS_DAIRY__:true,__FS_CRAFT2__:['loom','press']});x.d.farm.orders.done=[0,1,2];x.d.farm.pantry={};x.d.farm.keep={};
 const press={id:'press',kind:'press',queue:[]},orch={id:'orch',kind:'orchard',slots:[{tree:'apple',lastHarvestAt:x.d.now-86400001},{tree:'orange',lastHarvestAt:x.d.now-86400001},{tree:'blueberry',lastHarvestAt:x.d.now-43200001},{tree:'lemon',lastHarvestAt:x.d.now-86400001},{tree:'apple',lastHarvestAt:x.d.now-86400001}]};x.d.farm.structures.push(press,orch);
 const base=x.doc.querySelectorAll.bind(x.doc);x.doc.querySelectorAll=s=>{const action=s.match(/data-action="([^"]+)"/)?.[1];if(s.startsWith('#panel')){
  if(x.panel()==='fields'&&action==='orchard')return[x.action('orchard',()=>x.setPanel('orchard'),'orch')];
  if(x.panel()==='orchard'&&action==='keep-toggle')return[x.action('keep-toggle',()=>x.d.farm.keep.fruit=!x.d.farm.keep.fruit,'fruit')];
  if(x.panel()==='orchard'&&action==='harvest-tree')return orch.slots.map((t,i)=>x.action('harvest-tree',()=>{assert.notEqual(i,2,'never use a berry as fruit');t.lastHarvestAt=x.d.now;x.d.farm.pantry.fruit=(x.d.farm.pantry.fruit||0)+1},String(i)));
  if(x.panel()==='shop'&&action==='rwa-open')return[x.action('rwa-open',()=>x.setPanel('press'),'press')];
  if(x.panel()==='press'&&action==='craft-start')return[x.action('craft-start',()=>{x.d.farm.pantry.fruit-=4;press.queue=[{r:'juice',until:x.d.now+2400000},{r:'juice',until:x.d.now+4800000}]},'juice:2')];
  if(x.panel()==='press'&&action==='craft-collect')return[x.action('craft-collect',()=>{press.queue=[];x.d.farm.pantry.juice=2},'press')];
 }return base(s)};
 x.api.configure('workshopEat',false);x.api.configure('workshopPrep',false);x.api.set('workshop',true);await x.step(32);assert(x.clicks.includes('keep-toggle:fruit'));assert.equal(x.clicks.filter(s=>s==='craft-start:juice:2').length,1);assert.equal(press.queue.length,2);await x.step(1,4800000);await x.step(12);assert(x.clicks.includes('craft-collect:press'));assert(x.clicks.includes('order-fill:3'));assert(!x.clicks.some(s=>/build|plant-tree/.test(s)));x.api.remove();
 console.log('PASS: 4th order, juice pricing/queue/recipe, missing-building independence, stock/finished-vs-fruit costs, no star purchases, index-3 ledger persistence, berry isolation, native fruit-to-juice-to-order execution');
})().catch(e=>{console.error(e);process.exitCode=1});
