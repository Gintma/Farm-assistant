const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync('src/farm-rules.js','utf8'),ctx);const R=ctx.window.__farmRules;
const make=()=>({owner:'test',access:{open:true},now:Date.parse('2026-10-23T03:59:00Z'),price:{pay:.00032,charge:.00031},farm:{owner:'test',level:4,tz:480,tokens:100000,today:{day:'2026-10-23',energy:100,harvestEarned:0,feedSpent:0},silo:{feed:0,wheat:0,corn:0},fields:[],animals:[],structures:[],harvestCarry:0}});
let d=make();assert.equal(R.calendar(d.farm,d.now).meal,'2026-10-23S');d.now+=60000;assert.equal(R.calendar(d.farm,d.now).meal,'2026-10-23A');d.now=Date.parse('2026-10-23T16:00:00Z');d.farm.today.day='2026-10-24';assert.equal(R.calendar(d.farm,d.now).day,'2026-10-24');
d=make();for(let i=0;i<3;i++)d.farm.structures.push({id:'c'+i,kind:'coop'});for(let i=0;i<30;i++)d.farm.animals.push({id:'a'+i,kind:'chicken',fedWindows:[],meals:1,productReady:true});d.farm.silo.feed=60;
let p=R.feedPlan(d);assert.equal(p.energy,6);assert.equal(p.coins,0);assert.equal(p.bags,60);d.farm.structures[0].fedWindow='2026-10-23S';assert.equal(R.feedPlan(d).energy,4);
d.farm.structures.push({id:'silo',kind:'silo'});d.farm.silo={feed:0,wheat:6,corn:6};assert.equal(R.feedPlan(d).coins,0);d.farm.silo.corn=0;assert.ok(R.feedPlan(d).coins>0);
assert.equal(R.collectPlan(d).energy,6);d.farm.structures[0].collectDay='2026-10-23';assert.equal(R.collectPlan(d).energy,4);
const q=R.quote(d);d.farm.harvestCarry=q.base*7;d.farm.today.harvestEarned=q.cap;assert.equal(R.quote(d).room,0);d.farm.today.feedSpent=500;assert.equal(R.quote(d).remaining,500); // Paid feed expands cap; buying energy does not.
d=make();d.farm.structures=[{id:'o',kind:'orchard',slots:[{tree:'orange',lastHarvestAt:d.now-86400001},{tree:'lemon',lastHarvestAt:d.now-86400001}]}];assert.equal(R.orchardPlan(d)[0].ready.length,2);
d.farm.fields=[{id:'blank',crop:null}];d.farm.today.harvestEarned=R.quote(d).cap;const config={crop:'turnip',smart:true,feedDays:2};assert.equal(R.chooseCrop(d,config,{}).crop,null);
d.farm.animals=[{id:'a',kind:'chicken',meals:1,fedWindows:[]}];assert.equal(R.chooseCrop(d,config,{}).crop,'wheat');d.farm.silo.feed=8;assert.equal(R.chooseCrop(d,config,{}).crop,null);
d.farm.today.harvestEarned=0;assert.equal(R.chooseCrop(d,config,{}).crop,'turnip');d.farm.harvestCarry=R.quote(d).base;assert.equal(R.chooseCrop(d,config,{}).crop,'turnip');
d=make();d.farm.fields=[{id:'a',crop:'turnip',plantedAt:100}];const pending={kind:'harvest',before:[{id:'a',crop:'turnip',plantedAt:100}]};assert.equal(R.pendingDone(pending,d),false);d.farm.fields[0].crop=null;assert.equal(R.pendingDone(pending,d),true);
d.farm.today.bought=10;assert.equal(R.pendingDone({kind:'energy',before:100,bought:0},d),true);d.price.pay=0;assert.throws(()=>R.quote(d));
// NFT cap expansion is separate from yield, bank bonus, feed reimbursement and carry storage.
d=make();d.price={pay:.0005,charge:.0005};d.farm.nft={on:true,lockDays:28};
let nq=R.quote(d);assert.equal(nq.cap,21000);assert.equal(nq.base,16800);assert.equal(nq.nftCapBonus,1.25);assert.equal(nq.nftYieldBonus,1.15);assert.equal(nq.value(.016),Math.floor(Math.round(32*2.1)*1.15));
d.farm.today.harvestEarned=16800;d.farm.fields=[{id:'blank',crop:null}];assert.equal(R.chooseCrop(d,{crop:'radish',smart:false,feedDays:1},{}).crop,'radish'); // Old base cap must not stop planting.
d.farm.bank={bonusOn:true,lockBonus:.2};d.farm.today.feedSpent=100;nq=R.quote(d);assert.equal(nq.cap,25300);assert.equal(nq.base*7,141120);assert.equal(nq.bonus,1.2);assert.equal(nq.harvestBonus,1.2*1.15);
for(const [days,yieldBonus] of [[7,1.05],[14,1.1],[28,1.15]]){d.farm.nft.lockDays=days;assert.equal(R.quote(d).nftYieldBonus,yieldBonus);assert.equal(R.quote(d).cap,25300)}
d.farm.nft={on:false,lockDays:28};assert.equal(R.quote(d).cap,20260);assert.equal(R.quote(d).nftYieldBonus,1);
d.farm.nft={on:true,token:123,lockDays:0};assert.equal(R.quote(d).cap,20260);assert.equal(R.quote(d).nftYieldBonus,1);
d.farm.nft={on:true,lockDays:28};d.farm.animals=[{id:'c',kind:'cow',productReady:true}];d.farm.structures=[{id:'barn',kind:'barn'}];assert.equal(R.collectPlan(d).value,R.quote(d).value(.16));
console.log('PASS: farm-local meals/day rollover; per-building energy; silo auto-mix and paid-feed quotes; cap/carry protection; grain stock; production reservation; completion markers');

// Never substitute forecasts or workshop reserves for paid harvest progress.
ctx.window.__farmWorkshop={feedWheat:()=>12};
for(const level of [1,2,3,4,5,6,7])for(const mult of [.05,.5,1])for(const smart of [false,true])for(const nft of [false,true]){
 d=make();d.farm.level=level;d.price.mult=mult;d.farm.nft={on:nft,lockDays:28};d.farm.harvestCarry=R.quote(d).base*7;d.farm.fields=[{id:'f',crop:'turnip',plantedAt:d.now-1800001}];d.farm.today.harvestEarned=R.quote(d).cap-1;
 const conf={crop:'turnip',smart,feedDays:1,workshopWheat:100};let choice=R.chooseCrop(d,conf,{workshop:true});assert.equal(choice.crop,'turnip');assert.match(choice.message,/今日收获未满/);
 for(const crop of ['wheat','corn'])assert.equal(R.chooseCrop(d,{...conf,crop},{workshop:true}).crop,crop);
 d.farm.today.harvestEarned=R.quote(d).cap;assert.equal(R.chooseCrop(d,conf,{workshop:true}).crop,'wheat');
 assert.equal(R.chooseCrop(d,{...conf,marketBuy:true,smart:true},{workshop:true}).crop,null,'market order sourcing does not force wheat planting');
}
d=make();d.price.mult=.05;d.farm.today.harvestEarned=R.quote(d).cap;assert.equal(R.chooseCrop(d,config,{}).crop,null);d.price.mult=1;assert.equal(R.chooseCrop(d,config,{}).crop,'turnip','restored payout cap resumes cash crops');

// Lv6/7 use Lv5 values/capacity without inventing an extra payout multiplier.
for(const level of [5,6,7]){
 d=make();d.price.mult=.238;d.farm.level=level;d.farm.structures=[{id:'barn-a',kind:'barn'},{id:'barn-b',kind:'barn'}];
 d.farm.animals=Array.from({length:12},(_,i)=>({id:'cow'+i,kind:'cow',productReady:true,fedWindows:[],meals:1}));
 const q=R.quote(d);assert.equal(q.l.battle,14.67);assert.equal(q.energy10,348);
 assert.equal(q.cap,Math.round(18.66/.00032*.238));assert.equal(R.building(d.farm,d.farm.animals[5]).id,'barn-a');assert.equal(R.building(d.farm,d.farm.animals[6]).id,'barn-b');
 assert.equal(R.feedPlan(d).energy,4);assert.equal(R.collectPlan(d).energy,4);assert.equal(R.collectPlan(d).value,12*q.animalValue(.16));
 assert.equal(q.l.farmers,({5:6,6:7,7:8})[level]);
}
d=make();d.farm.level=8;assert.throws(()=>R.quote(d),/等级/);
console.log('PASS: Lv6/7 payouts and energy match Lv5, cow capacity remains six per barn, multiple barns feed/collect and unknown levels stop');
