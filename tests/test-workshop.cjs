const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {boot}=require('./test-farm-automation.cjs');
const ctx={window:{}};
for(const file of ['farm-rules.js','workshop-rules.js'])vm.runInNewContext(fs.readFileSync('src/'+file,'utf8'),ctx);
const W=ctx.window.__farmWorkshop,R=ctx.window.__farmRules;
const make=()=>({owner:'test',access:{open:true},now:Date.parse('2026-10-23T03:00:00Z'),price:{pay:.0004,charge:.0004},farm:{owner:'test',level:4,tz:480,tokens:100000,today:{day:'2026-10-23',energy:30,harvestEarned:21000,breadEnergy:0},fields:[],animals:[],structures:[{id:'m',kind:'mill'},{id:'b',kind:'bakery'},{id:'base-coop',kind:'coop'}],pantry:{},silo:{wheat:30,corn:30,feed:0},harvestCarry:0}});
const fixture=[{index:0,items:{egg:3},reward:945,done:false},{index:1,items:{bread:6,flour:5},reward:1989,done:false},{index:2,items:{egg:6,bread:8},reward:3285,done:false}];
const config={feedDays:2,workshopEat:true};
let d=make(),board={owner:'test',day:'2026-10-23',orders:fixture};
let p=W.demands(d,fixture,true);assert.equal(p.need.egg,14);assert.equal(p.wheat,10);assert.equal(p.breadBatches,5);
d.farm.keep={egg:false};p=W.plan(d,config,board);assert.equal(p.jobs[0].kind,'craft-keep');assert.equal(p.jobs.find(j=>j.kind==='craft-start').count,8);
d.farm.animals=[{id:'a',kind:'chicken',productReady:true}];d.farm.structures.push({id:'c',kind:'coop'});d.farm.silo.wheat=1;d.farm.silo.feed=0;
p=W.plan(d,config,board);assert.equal(p.jobs.some(j=>j.kind==='craft-start'),false); // Feed wheat is protected.
d.farm.keep.egg=true;p=W.plan(d,config,board);assert.equal(p.jobs.some(j=>j.kind==='craft-eggs'),true);
d=make();d.farm.pantry={egg:30,flour:10,bread:0};p=W.plan(d,config,board);assert.equal(p.jobs.find(j=>j.recipe==='bread').count,5); // Reserve 5 direct flour and 9 direct eggs.
d.farm.structures[1].queue=Array.from({length:5},(_,i)=>({r:'bread',until:d.now+(i+1)*1800000}));p=W.demands(d,fixture,true);assert.equal(p.breadBatches,0);assert.equal(p.wheat,0);
d.farm.structures[1].queue[0].until=d.now-1;assert.equal(W.plan(d,config,board).jobs.some(j=>j.kind==='craft-take'),true);
d=make();d.farm.pantry={egg:30,flour:10,bread:20};p=W.plan(d,config,board);assert.equal(p.eatAvailable,4);assert.equal(p.jobs.filter(j=>j.kind==='craft-order').length,3);
const noPay=fixture.map(o=>({...o,reward:0}));p=W.plan(d,{...config,workshopEat:false},{...board,orders:noPay});assert.equal(p.jobs.filter(j=>j.kind==='craft-order').length,3); // Star-only orders still deliver.
const clipped=fixture.map(o=>({...o,reward:1}));assert.equal(W.demands(d,clipped,false).orders.length,3); // Small rewards are tasks too.
const doneOnly=fixture.map(o=>({...o,done:true}));assert.equal(W.demands(d,doneOnly,false).orders.length,0);
const zeroMissing=W.plan(make(),{...config,workshopEat:false},{...board,orders:noPay});assert.ok(zeroMissing.jobs.some(j=>j.kind==='craft-start'));assert.ok(zeroMissing.jobs.some(j=>j.kind==='craft-keep')); // Produce missing materials even without coins.
assert.equal(W.demands(d,[{index:0,items:{unknown:1},reward:0,done:false}],false).orders.length,0);
assert.equal(W.plan(d,config,{...board,day:'2026-10-22'}).jobs.length,0);
assert.equal(W.pendingDone({kind:'craft-eat',day:'2026-10-23',before:0,count:2},d),false);d.farm.today.breadEnergy=10;assert.equal(W.pendingDone({kind:'craft-eat',day:'2026-10-23',before:0,count:2},d),true);
d.farm.orders={day:'2026-10-23',done:[1]};assert.equal(W.pendingDone({kind:'craft-order',day:'2026-10-23',index:1},d),true);
d.farm.fields=[{id:'f',crop:null}];d.farm.silo.wheat=0;assert.equal(R.chooseCrop(d,{crop:'turnip',smart:true,feedDays:2,workshopWheat:10},{workshop:true}).crop,'wheat');

async function workshopBoot(store,orderRows=fixture){
 const b=await boot(store),baseQuery=b.doc.querySelectorAll.bind(b.doc),baseFetch=b.context.fetch;
 let budget=100000,unknown=false;
 b.d.farm.keep={egg:false};b.d.farm.pantry={egg:30,flour:10,bread:20};b.d.farm.animals.forEach(a=>a.fedWindows=['2026-10-23S']);
 b.d.farm.orders={day:'2026-10-23',done:[],stars:0};b.d.farm.structures.push({id:'m',kind:'mill'},{id:'b',kind:'bakery'});
 const ordersButton=b.action('orders',()=>b.setPanel('orders'));
 const originalFill=b.action('order-fill',()=>{},'0');
 const rows=()=>orderRows.map((o,index)=>{
   const row=b.el(),done=b.d.farm.orders.done.includes(index);row.classList.contains=k=>k==='done'&&done;
   row.querySelector=sel=>sel==='.ord-side b'?{textContent:budget?`+${o.reward} SEASON`:'stars only'}:sel.includes('button')?{dataset:{arg:String(index)}}:null;
   row.querySelectorAll=()=>Object.entries(o.items).map(([key,n])=>({textContent:unknown?'未知物品':key,querySelector:()=>({textContent:`0/${n}`})}));return row;
 });
 const root=b.el();root.querySelectorAll=()=>rows();
 b.doc.querySelector=selector=>selector==='#panel .orders'&&b.panel()==='orders'?root:null;
 b.doc.querySelectorAll=selector=>{
   const name=selector.match(/data-action="([^"]+)"/)?.[1];
   if(selector.startsWith('#panel')&&name==='orders'&&b.panel()==='more')return [ordersButton];
   if(selector.startsWith('#panel')&&name==='order-fill'&&b.panel()==='orders')return orderRows.filter(o=>!b.d.farm.orders.done.includes(o.index)).map(o=>b.action('order-fill',()=>{b.d.farm.orders.done.push(o.index)},String(o.index)));
   return baseQuery(selector);
 };
 b.context.fetch=async url=>url==='/api/farm/order'?{ok:true,json:async()=>({budget:{left:budget,total:100000}})}:baseFetch(url);
 return {...b,budget:v=>budget=v,unknown:v=>unknown=v};
}
if(require.main===module)(async()=>{
 let b=await workshopBoot();assert.equal(b.api.status().flags.workshop,false);b.api.configure('workshopEat',false);b.api.set('workshop',true);await b.step(6);
 assert.ok(b.clicks.includes('order-fill:0'));assert.equal(b.clicks.filter(x=>x==='order-fill:0').length,1);assert.ok(b.api.status().pending||b.d.farm.orders.done.length);b.api.remove();
 b=await workshopBoot();b.budget(0);b.api.configure('workshopEat',false);b.api.set('workshop',true);await b.step(6);assert.ok(b.clicks.includes('order-fill:0'));assert.equal(b.clicks.filter(x=>x==='order-fill:0').length,1);assert.ok(!/暂停交单/.test(b.api.execution().reason));b.api.remove();
 b=await workshopBoot();b.budget(0);b.api.configure('workshopStars',false);b.api.configure('workshopEat',false);b.api.set('workshop',true);await b.step(6);assert.equal(b.clicks.some(x=>x.startsWith('order-fill')),false,'disabled pure-star orders are not submitted');b.api.configure('workshopStars',true);await b.step(3);assert.equal(b.clicks.includes('order-fill:0'),true,'enabling stars resumes the ordinary order button');b.api.remove();
 b=await workshopBoot();b.unknown(true);b.api.set('workshop',true);await b.step(6);assert.ok(!b.clicks.some(x=>x.startsWith('order-fill')));assert.match(b.api.status().message,/未知订单/);b.api.remove();
 b=await workshopBoot();b.api.set('workshop',true);b.verify(true);await b.step(4);assert.equal(b.clicks.length,0);b.api.remove();
 b=await workshopBoot();b.d.farm.pantry={};b.d.farm.keep.egg=true;b.d.farm.silo={wheat:0,corn:0,feed:0};b.api.set('workshop',true);await b.step(6);
 const opened=b.clicks.filter(x=>x==='orders').length;assert.equal(opened,1);b.setPanel('animals');await b.step(24);assert.equal(b.clicks.filter(x=>x==='orders').length,opened); // Two minutes of idle waiting must not reopen the board.
 b.api.remove();
 b=await workshopBoot(undefined,[{index:0,items:{milk:2},reward:1},{index:1,items:{butter:1},reward:0},{index:2,items:{cheese:1},reward:0}]);b.d.farm.pantry={milk:2,butter:1,cheese:1};b.api.configure('workshopEat',false);b.api.set('workshop',true);await b.step(6);assert.ok(b.clicks.includes('order-fill:0'));assert.doesNotMatch(b.api.status().message,/未知订单/);b.api.remove();
 for(const items of [{wool:3,cloth:2},{'羊毛':3,'布料':2}]){
 b=await workshopBoot(undefined,[{index:0,items,reward:0},{index:1,items:{bread:1},reward:0},{index:2,items:{egg:1},reward:0}]);
 b.d.farm.pantry={wool:3,cloth:2,bread:1,egg:1};b.api.configure('workshopEat',false);b.api.set('workshop',true);await b.step(6);
 assert.ok(b.clicks.includes('order-fill:0'));assert.doesNotMatch(b.api.status().message,/未知订单/);assert.ok(b.api.execution().items.some(x=>/羊毛/.test(x)));b.api.remove();
 }
 b=await workshopBoot(undefined,[{index:0,items:{cloth:1},reward:0},{index:1,items:{bread:1},reward:0},{index:2,items:{egg:1},reward:0}]);
 b.d.farm.orders.done=[1,2];b.d.farm.pantry={};b.d.farm.keep={};b.d.farm.silo.wheat=0;
 b.d.farm.animals=[{id:'sh1',kind:'sheep',productReady:true},{id:'sh2',kind:'sheep',productReady:true}];
 const loom={id:'l',kind:'loom',queue:[]};b.d.farm.structures.push(loom,{id:'sp',kind:'sheepPen'});
 const baseSelect=b.doc.querySelectorAll.bind(b.doc);
 const penButton=b.action('building',()=>b.setPanel('sheepPen'),'sheepPen');
 const keepButton=b.action('keep-toggle',()=>b.d.farm.keep.wool=!b.d.farm.keep.wool,'wool');
 const woolButton=b.action('collect',()=>{b.d.farm.animals.forEach(a=>a.productReady=false);b.d.farm.pantry.wool=2},'sheep');
 const loomButton=b.action('rwa-open',()=>b.setPanel('loom'),'l');
 const startButton=b.action('craft-start',()=>{b.d.farm.pantry.wool-=2;loom.queue=[{r:'cloth',until:b.d.now+7200000}]},'cloth:1');
 const takeButton=b.action('craft-collect',()=>{loom.queue=[];b.d.farm.pantry.cloth=1},'loom');
 b.doc.querySelectorAll=selector=>{
   const name=selector.match(/data-action="([^"]+)"/)?.[1];
   if(selector.startsWith('#panel')){
     if(b.panel()==='animals'&&name==='building')return [penButton];
     if(b.panel()==='sheepPen'&&name==='keep-toggle')return [keepButton];
     if(b.panel()==='sheepPen'&&name==='collect')return [woolButton];
     if(b.panel()==='shop'&&name==='rwa-open')return [loomButton];
     if(b.panel()==='loom'&&name==='craft-start')return [startButton];
     if(b.panel()==='loom'&&name==='craft-collect')return [takeButton];
   }
   return baseSelect(selector);
 };
 b.api.configure('workshopEat',false);b.api.set('workshop',true);await b.step(18);
 assert.ok(b.clicks.includes('keep-toggle:wool'));assert.equal(b.clicks.filter(x=>x==='collect:sheep').length,1);assert.equal(b.clicks.filter(x=>x==='craft-start:cloth:1').length,1);assert.equal(loom.queue.length,1);
 await b.step(1,7200000);await b.step(12);assert.equal(b.clicks.filter(x=>x==='craft-collect:loom').length,1);assert.ok(b.clicks.includes('order-fill:0'));assert.equal(b.clicks.filter(x=>x==='craft-start:cloth:1').length,1);b.api.remove();
 ctx.window.__FS_CRAFT__=true;ctx.window.__FS_DAIRY__=true;ctx.window.__FS_CRAFT2__=['loom'];
 b=await workshopBoot(undefined,W.forecast('test-owner','2026-10-23'));Object.assign(b.context.window,{__FS_CRAFT__:true,__FS_DAIRY__:true,__FS_CRAFT2__:['loom']});
 b.d.farm.orders.done=[0,1,2];b.api.configure('workshopEat',false);b.api.set('workshop',true);await b.step(6);
 assert.ok(b.api.execution().rows.some(r=>r.label==='次日备货'&&r.text.includes('2026-10-24')));assert.ok(!b.clicks.some(x=>x.startsWith('order-fill:')),'tomorrow previews never send speculative order submissions');b.api.remove();
 console.log('PASS: exact order requirements; reserve feed wheat and direct-order ingredients; queued output counted; no overproduction; star-only/partial-reward production and delivery; midnight isolation; markers; actual board parsing and normal-button delivery; verification pause');
})().catch(e=>{console.error(e);process.exitCode=1});

module.exports={workshopBoot};
