const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {workshopBoot}=require('./test-workshop.cjs');
const ctx={window:{__FS_CRAFT__:true,__FS_DAIRY__:true,__FS_CRAFT2__:['loom','press','jamKitchen']}};
for(const file of ['farm-rules','workshop-rules','market-rules'])vm.runInNewContext(fs.readFileSync('src/'+file+'.js','utf8'),ctx);
const R=ctx.window.__farmRules,W=ctx.window.__farmWorkshop,M=ctx.window.__farmMarket;
function fixture(){
 const d={owner:'test',access:{open:true},now:Date.parse('2026-10-31T01:00:00Z'),price:{pay:.00032,charge:.00031,mult:1},farm:{owner:'test',level:4,tz:480,tokens:100000,today:{day:'2026-10-31',energy:100,harvestEarned:0},animals:[],fields:[],structures:[{id:'jam',kind:'jamKitchen',queue:[]}],silo:{wheat:0,corn:0,feed:0},pantry:{},harvestCarry:0}};
 const config={marketBuy:true,feedDays:1,workshopPrep:false,workshopStars:true,workshopEat:false};
 const board={owner:'test',day:'2026-10-31',orders:[{index:0,items:{jam:2},reward:1000,done:false},{index:1,items:{egg:1},reward:100,done:true},{index:2,items:{bread:1},reward:0,done:true},{index:3,items:{juice:2},reward:0,done:true}]};
 const quote=(item,price)=>({id:item,item,price,qty:100,mine:false,exp:d.now+86400000});
 return {d,config,board,quote,plan:(quotes=[])=>M.plan(d,config,board,quotes,{})};
}
let b=fixture(),p=W.demands(b.d,b.board.orders,false);assert.equal(p.jamBatches,2);assert.equal(p.need.berries,6);assert.equal(p.need.fruit,0);
b.d.farm.pantry.berries=6;p=W.plan(b.d,b.config,b.board);assert.equal(p.jobs.find(j=>j.recipe==='jam').count,2);assert.equal(p.jobs.find(j=>j.recipe==='jam').finishAt,b.d.now+7200000);assert(p.lines.some(l=>l.label==='果酱厨房'));
b.d.farm.structures[0].queue=[{r:'jam',until:b.d.now+3600000},{r:'jam',until:b.d.now+7200000}];assert.equal(W.demands(b.d,b.board.orders,false).jamBatches,0,'queued jam is counted once');
b.d.farm.structures[0].queue[0].until=b.d.now-1;assert(W.plan(b.d,b.config,b.board).jobs.some(j=>j.kind==='craft-take'&&j.arg==='jamKitchen'));
b=fixture();b.d.farm.structures=[];b.board.orders[1].done=false;b.d.farm.pantry.egg=1;p=W.plan(b.d,b.config,b.board);assert(p.jobs.some(j=>j.kind==='craft-order'&&j.index===1));assert.match(p.note,/果酱厨房未建成/);assert(!p.jobs.some(j=>j.kind==='craft-keep'),'missing processors cannot create keep-navigation loops');
b.d.farm.pantry.jam=2;p=W.plan(b.d,b.config,b.board);assert(p.jobs.some(j=>j.kind==='craft-order'&&j.index===0),'stocked jam delivers without buildings');
b=fixture();p=b.plan([b.quote('jam',100),b.quote('berries',1)]);assert.equal(p.job.item,'berries');assert.equal(p.selected.counts.jam,2);assert.equal(p.selected.cost,6);assert.equal(p.selected.energy,2);
p=b.plan([b.quote('jam',10),b.quote('berries',1)]);assert.equal(p.job.item,'jam','finished jam wins when its cost is lower than raw inputs plus energy');
b.d.farm.pantry.berries=6;p=b.plan([b.quote('jam',100)]);assert.equal(p.job,null);assert.equal(M.productionJobs(b.d,p,[]).find(j=>j.recipe==='jam').count,2);
b.d.farm.pantry.jam=2;p=b.plan([b.quote('jam',1),b.quote('berries',1)]);assert.equal(p.job,null);assert.equal(p.selected.counts.jam,0,'finished stock has priority');
b=fixture();b.d.farm.structures=[];p=b.plan([b.quote('jam',10),b.quote('berries',1)]);assert.equal(p.job.item,'jam','no kitchen means no ingredient purchasing');
b=fixture();b.d.now=W.orderReset(b.d)-1800000;b.d.farm.today.day=R.calendar(b.d.farm,b.d.now).day;p=b.plan([b.quote('jam',100),b.quote('berries',1)]);assert.equal(p.job.item,'jam','one-hour batches must finish before order reset');
b=fixture();b.board.orders[0].reward=0;assert.equal(b.plan([b.quote('jam',1)]).job,null,'star-only orders never authorize purchases');b.d.farm.pantry.berries=6;assert(W.plan(b.d,b.config,b.board).jobs.some(j=>j.recipe==='jam'));assert(!W.plan(b.d,{...b.config,workshopStars:false},b.board).jobs.some(j=>j.recipe==='jam'));
// Fruit and berries occupy separate pantry counters; mixed ripe orchards are not bulk-picked for one ingredient.
b=fixture();b.d.farm.keep={fruit:true,berries:true};b.d.farm.today.harvestEarned=R.quote(b.d).cap;b.d.farm.harvestCarry=R.quote(b.d).base*7;
b.d.farm.structures.push({id:'orch',kind:'orchard',slots:[{tree:'apple',lastHarvestAt:b.d.now-86400001},{tree:'blueberry',lastHarvestAt:b.d.now-43200001}]});
assert.equal(R.orchardPlan(b.d)[0].value,0);p=W.plan(b.d,b.config,b.board);let pick=p.jobs.find(j=>j.kind==='craft-fruit');assert.equal(pick.item,'berries');assert.equal(pick.arg,1);assert.equal(pick.action,'harvest-tree');
b.d.farm.pantry.berries=200;assert(R.orchardPlan(b.d)[0].value>0,'full berry storage returns berry harvests to cash accounting');
ctx.window.__FS_CRAFT2__=['loom','press'];b.d.farm.pantry.berries=0;assert(R.orchardPlan(b.d)[0].value>0,'closed jam feature cannot make berries appear retainable');ctx.window.__FS_CRAFT2__=['loom','press','jamKitchen'];
const expected=[{juice:1},{butter:2,juice:2},{cheese:2,butter:3},{juice:2}];assert.deepEqual(JSON.parse(JSON.stringify(W.forecast('test-owner','2026-10-31').map(o=>o.items))),expected,'new pool keeps the audited random order ordering');
b=fixture();b.d.owner=b.d.farm.owner=b.board.owner='test-owner';b.board.orders=expected.map((items,index)=>({index,items,reward:0,done:true}));b.d.farm.orders={day:b.board.day,done:[0,1,2,3]};p=W.plan(b.d,{...b.config,workshopPrep:true},b.board);assert.equal(p.prep.error,undefined,'new flag does not stop next-day preparation');
b=fixture();b.d.now=Date.parse('2026-11-01T01:00:00Z');b.d.farm.today.day='2026-11-01';b.d.owner=b.d.farm.owner=b.board.owner='test-owner';b.board.day='2026-11-01';
b.board.orders=[{bread:4},{egg:4,cloth:1},{bread:8,flour:8},{juice:2}].map((items,index)=>({index,items,reward:0,done:true}));b.d.farm.orders={day:b.board.day,done:[0,1,2,3]};b.d.farm.structures.push({id:'orch',kind:'orchard',slots:[]});
p=W.plan(b.d,{...b.config,workshopPrep:true},b.board);assert.equal(p.prep.error,undefined);assert.deepEqual(JSON.parse(JSON.stringify(p.prep.orders.map(o=>o.items))),[{flour:3},{flour:5,butter:2},{cheese:2,jam:3},{juice:2}]);assert.equal(p.prep.need.berries,9);assert(p.jobs.some(j=>j.kind==='craft-keep'&&j.arg==='berries'&&j.keep),'tomorrow jam demand retains berries before reset');
b.d.farm.structures=b.d.farm.structures.filter(s=>s.kind!=='jamKitchen');p=W.plan(b.d,{...b.config,workshopPrep:true},b.board);assert(!p.jobs.some(j=>j.kind==='craft-keep'&&j.arg==='berries'),'missing kitchen does not create a prep navigation loop');
(async()=>{
 const orders=[{index:0,items:{jam:2},reward:1000},{index:1,items:{egg:1},reward:100},{index:2,items:{bread:1},reward:0},{index:3,items:{juice:2},reward:0}];
 for(const raw of ['jam','果酱']){
  const x=await workshopBoot(undefined,orders.map(o=>o.index===0?{...o,items:{[raw]:2}}:o));Object.assign(x.context.window,{__FS_CRAFT__:true,__FS_DAIRY__:true,__FS_CRAFT2__:['loom','press','jamKitchen']});
  x.d.farm.pantry={egg:1};x.d.farm.orders.done=[2,3];x.api.configure('workshopEat',false);x.api.configure('workshopPrep',false);x.api.set('workshop',true);await x.step(12);
  assert(x.clicks.includes('order-fill:1'),'a missing jam kitchen does not block another stocked order');assert(!/未知订单|布局变化/.test(x.api.status().message));assert(!x.api.status().needsReview);const opened=x.clicks.filter(v=>v==='orders').length;await x.step(15);assert.equal(x.clicks.filter(v=>v==='orders').length,opened);x.api.remove();
 }
 // Use the original UI flow: keep berries, pick bushes, cook two batches, collect, deliver.
 const x=await workshopBoot(undefined,orders);Object.assign(x.context.window,{__FS_CRAFT__:true,__FS_DAIRY__:true,__FS_CRAFT2__:['loom','press','jamKitchen']});
 x.d.farm.orders.done=[1,2,3];x.d.farm.pantry={};x.d.farm.keep={};
 const kitchen={id:'jk',kind:'jamKitchen',queue:[]},orch={id:'orch',kind:'orchard',slots:[{tree:'apple',lastHarvestAt:x.d.now-86400001},...Array.from({length:6},()=>({tree:'blueberry',lastHarvestAt:x.d.now-43200001}))]};x.d.farm.structures.push(kitchen,orch);
 const query=x.doc.querySelectorAll.bind(x.doc);x.doc.querySelectorAll=selector=>{const action=selector.match(/data-action="([^"]+)"/)?.[1];if(selector.startsWith('#panel')){
  if(x.panel()==='fields'&&action==='orchard')return[x.action('orchard',()=>x.setPanel('orchard'),'orch')];
  if(x.panel()==='orchard'&&action==='keep-toggle')return[x.action('keep-toggle',()=>x.d.farm.keep.berries=!x.d.farm.keep.berries,'berries')];
  if(x.panel()==='orchard'&&action==='harvest-tree')return orch.slots.map((tree,i)=>x.action('harvest-tree',()=>{assert(i>0,'never treat apples as berries');tree.lastHarvestAt=x.d.now;x.d.farm.pantry.berries=(x.d.farm.pantry.berries||0)+1},String(i)));
  if(x.panel()==='shop'&&action==='rwa-open')return[x.action('rwa-open',()=>x.setPanel('jamKitchen'),'jk')];
  if(x.panel()==='jamKitchen'&&action==='craft-start')return[x.action('craft-start',()=>{assert.equal(x.d.farm.pantry.berries,6);x.d.farm.pantry.berries=0;kitchen.queue=[{r:'jam',until:x.d.now+3600000},{r:'jam',until:x.d.now+7200000}]},'jam:2')];
  if(x.panel()==='jamKitchen'&&action==='craft-collect')return[x.action('craft-collect',()=>{kitchen.queue=[];x.d.farm.pantry.jam=2},'jamKitchen')];
 }return query(selector)};
 x.api.configure('workshopEat',false);x.api.configure('workshopPrep',false);x.api.set('workshop',true);await x.step(52);assert(x.clicks.includes('keep-toggle:berries'));assert.equal(x.clicks.filter(v=>v==='craft-start:jam:2').length,1);await x.step(1,7200000);await x.step(14);assert(x.clicks.includes('craft-collect:jamKitchen'));assert(x.clicks.includes('order-fill:0'));assert(!x.clicks.some(v=>/build|plant-tree/.test(v)));x.api.remove();
 console.log('PASS: jam orders/queues/recipe, separate berry storage, missing-building independence, raw-vs-finished profit planning, star rules, forecast flags and native keep/pick/cook/collect/deliver flow');
})().catch(e=>{console.error(e);process.exitCode=1});
