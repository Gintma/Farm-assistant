const assert=require('node:assert/strict');
const {boot}=require('./test-farm-automation.cjs');
async function setup(){
 const b=await boot();b.d.farm.farmers=2;b.context.window.__FS_FARMERS__=true;
 const worker=(building=false)=>({isBuilding:building,isBusy:building,isFishing:false,jobs:[],shouldBuild(){return this.isBuilding},pending(){return this.jobs}});
 const builder=worker(true),free=worker(),group={workers:[builder,free],pending(){return this.workers.flatMap(w=>w.pending())}};
 b.context.window.__farmGame.scene.scenes[0].worker=group;
 b.d.farm.structures.push({id:'construction',kind:'barn',buildStart:b.d.now-1000,buildUntil:b.d.now+86400000});
 b.d.farm.fields=[{id:'plot',crop:null,plantedAt:0}];b.setPanel('fields');
 b.api.configure('reserve',0);b.api.configure('smart',false);
 const plant=b.action('plant-all',()=>{free.isBusy=true;free.jobs=[{type:'plant',fieldId:'plot',crop:'radish'}]},'radish');
 b.gameButtons['harvest-all']=b.action('harvest-all',()=>{free.isBusy=true;free.jobs=[{type:'harvest',fieldId:'plot'}]});
 const query=b.doc.querySelectorAll.bind(b.doc);
 b.doc.querySelectorAll=s=>s.startsWith('#panel')&&s.includes('data-action="plant-all"')?[plant]:query(s);
 b.api.set('fields',true);
 return Object.assign(b,{builder,free,group});
}
(async()=>{
 let b=await setup();await b.step();assert.equal(b.clicks.at(-1),'plant-all:radish','second worker plants while first builds');assert.equal(b.api.status().workers.building,1);assert.equal(b.api.status().workers.idle,1);
 await b.step(4);assert.equal(b.clicks.filter(x=>x==='plant-all:radish').length,1,'pending helper task is never duplicated');b.api.remove();

 b=await setup();b.builder.jobs=[{type:'collect',animalId:'cow'}];await b.step();assert.equal(b.clicks.at(-1),'plant-all:radish','queued animal work suspended by construction must not block planting on an idle worker');assert.equal(b.builder.jobs.length,1,'existing game queue untouched');b.api.remove();

 b=await setup();b.d.farm.fields[0]={id:'plot',crop:'radish',plantedAt:b.d.now-1800001};await b.step();assert.equal(b.clicks.at(-1),'harvest-all','second worker harvests during construction');
 b.d.farm.fields[0].crop=null;b.free.jobs=[];b.free.isBusy=false;await b.step();assert.equal(b.clicks.at(-1),'plant-all:radish','plant follows confirmed harvest without waiting for construction');b.api.remove();

 b=await setup();b.free.isBuilding=true;b.free.isBusy=true;await b.step();assert.equal(b.clicks.length,0);assert.match(b.api.status().message,/所有农夫都在施工/);b.free.isBuilding=false;b.free.isBusy=false;await b.step();assert.equal(b.clicks.at(-1),'plant-all:radish','construction slot becoming free resumes work');b.api.remove();

 b=await setup();b.free.isBusy=true;b.free.jobs=[{type:'feed',animalId:'chicken'}];await b.step();assert.equal(b.clicks.length,0,'all workers busy blocks new jobs');b.api.remove();
 b=await setup();b.builder.jobs=[{type:'plant',fieldId:'plot'}];await b.step();assert.equal(b.clicks.length,0,'do not duplicate or adopt a batch already queued');b.api.remove();
 b=await setup();b.builder.jobs=[{type:'unknown'}];await b.step();assert.equal(b.clicks.length,0,'unknown queue cannot be bypassed');b.api.remove();
 b=await setup();b.group.workers.pop();await b.step();assert.equal(b.clicks.length,0,'wait while hired worker pool is still loading');assert.match(b.api.status().message,/无法确认/);b.api.remove();
 b=await setup();b.d.farm.farmers=1;b.group.workers=[b.builder];await b.step();assert.equal(b.clicks.length,0,'single farmer building cannot plant');b.api.remove();
 b=await setup();delete b.group.workers;await b.step();assert.equal(b.clicks.length,0,'unrecognized multi-worker pool must not assume a free slot');b.api.remove();
 b=await setup();b.free.isBusy=undefined;await b.step();assert.equal(b.clicks.length,0,'changed worker shape stops conservatively');b.api.remove();
 b=await setup();b.builder.shouldBuild=()=>{throw Error('changed')};await b.step();assert.equal(b.clicks.length,0,'unreadable construction status cannot dispatch');b.api.remove();
 b=await setup();b.d.farm.structures.push({id:'future',kind:'coop',buildStart:b.d.now+86400000,buildUntil:b.d.now+172800000});await b.step();assert.equal(b.clicks.at(-1),'plant-all:radish','future construction does not occupy the idle worker now');b.api.remove();
 console.log('PASS: idle second farmer plants/harvests during construction; suspended queues, dedup, confirmation, busy/unknown/single/loading guards and future builds');
})().catch(e=>{console.error(e);process.exitCode=1});
