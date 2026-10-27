const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {boot}=require('./test-farm-automation.cjs');
const node=()=>({children:[],style:{},dataset:{},append(...xs){this.children.push(...xs)},setAttribute(){}});
const ctx={window:{},document:{createElement:node},setInterval:()=>1,clearInterval(){}};
for(const name of ['farm-rules','workshop-rules','earnings-progress'])vm.runInNewContext(fs.readFileSync('src/'+name+'.js','utf8'),ctx);
const R=ctx.window.__farmRules,W=ctx.window.__farmWorkshop,E=ctx.window.__farmEarnings;
const make=mult=>({owner:'fixture',access:{open:true},now:Date.parse('2026-10-27T02:00:00Z'),price:{pay:.00037,charge:.00031,mult},farm:{owner:'fixture',level:5,tz:480,tokens:123456,today:{day:'2026-10-27',harvestEarned:1000,battleEarned:500,feedSpent:123,energy:0},orders:{day:'2026-10-27',dayTokens:100},bank:{bonusOn:true,lockBonus:.2},nft:{on:true,lockDays:14},fields:[],animals:[],structures:[],silo:{feed:0,wheat:0,corn:0},passiveSince:Date.parse('2026-10-27T01:00:00Z'),passiveBank:77,harvestCarry:456}});
// Independent formulas follow public game conversion / crop / animal paths.
for(const mult of [1,.5,.137,.05,.001,2,'0.25']){
 const d=make(mult),rate=Math.min(1,Math.max(.05,Number(mult))),pay=v=>Math.round(v/.00037*rate),q=R.quote(d),m=E.model(d);
 assert.equal(q.rewardMult,rate);assert(q.rewardMultKnown);
 assert.equal(q.base,pay(18.66)*1.2);assert.equal(q.cap,pay(18.66)*1.2*1.25+123);
 assert.equal(m.battle.cap,pay(14.67));assert.equal(m.orders.cap,Math.floor(pay(18.66*.25)));
 assert.equal(m.village.hourly,pay(6.67)*1.2/24);assert(Math.abs(m.village.stored-(77+pay(6.67)*1.2/24))<1e-8);
 assert.equal(m.carry,456);assert.equal(m.carryCap,pay(18.66)*1.2*7);assert.equal(m.harvest.earned,1000);assert.equal(m.battle.earned,500);assert.equal(d.farm.tokens,123456,'do not discount existing balance');
 for(const value of [.016,.023,.055,.16,.3]){
   assert.equal(q.value(value),Math.floor(pay(value)*2.4*1.2*1.1),'crop/orchard rounding');
   assert.equal(q.animalValue(value),Math.floor(Math.round(pay(value)*2.4)*1.2*1.1),'animal rounding');
 }
 assert.equal(q.energy10,Math.round(.0045*2.4*10/.00031));assert.equal(q.charge(57),Math.round(57/.00031),'costs are not discounted');
 d.farm.animals=[{id:'cow',kind:'cow',productReady:true,fedWindows:[],meals:1}];d.farm.structures=[{id:'barn',kind:'barn'}];
 assert.equal(R.collectPlan(d).value,q.animalValue(.16));assert.equal(R.feedPlan(d).coins,Math.round(.04/.00031));
 const board={day:'2026-10-27',orders:[{index:0,items:{milk:1},reward:12}],owner:'fixture'};
 W.syncBoard(board,d,999999);assert.equal(board.orders[0].reward,12,'actual order-board reward must not be discounted twice');
}
// NFT ownership is optional. Only the server's active lock yields a bonus.
for(const level of [1,2,3,4,5])for(const nft of [undefined,{on:false,lockDays:28},{on:true,lockDays:0}]){
 const d=make(.5);d.farm.nft=nft;d.farm.level=level;delete d.farm.bank;
 const q=R.quote(d),m=E.model(d),pay=v=>Math.round(v/d.price.pay*.5);
 assert.equal(q.nftCapBonus,1);assert.equal(q.nftYieldBonus,1);
 assert.equal(m.harvest.cap,pay(R.levels[level].harvest)+123);assert.equal(q.value(.016),Math.floor(pay(.016)*R.levels[level].mult));
 assert.equal(m.battle.cap,pay([0,.55,1.28,2.93,6.6,14.67][level]));assert.equal(m.orders.cap,pay(R.levels[level].harvest*.25));
}
let d=make(.5),q=R.quote(d);d.farm.today.harvestEarned=q.cap+100;assert.equal(R.quote(d).remaining,0,'past earnings above a newly reduced cap are retained');assert.equal(R.quote(d).carry,456);
d=make(.5);const low=E.model(d).harvest.cap;d.price.mult=1;assert(E.model(d).harvest.cap>low,'each new snapshot updates estimates');
for(const mult of [0,-1,null,'invalid',Infinity,NaN])assert.throws(()=>R.quote(make(mult)),/发放比例/);
d=make(undefined);q=R.quote(d);assert.equal(q.rewardMult,1);assert.equal(q.rewardMultKnown,false,'missing multiplier is identified as estimated');
(async()=>{
 for(const [mult,expected]of [[1,true],[.05,false],[undefined,false]]){
  const b=await boot();b.d.price.mult=mult;b.d.farm.today.energy=0;b.api.set('feed',true);b.api.set('energy',true);b.api.configure('energyBudget',500);
  await b.step(3);assert.equal(b.clicks.includes('energy:10'),expected,'energy purchase must use scaled incremental rewards and known ratio: '+mult);b.api.remove();
 }
 console.log('PASS: payout rates/clamps/rounding, NFT/bank composition, raw spending, unchanged balances, dynamic caps, actual board rewards and conservative energy purchases');
})().catch(e=>{console.error(e);process.exitCode=1});
