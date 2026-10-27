const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const rules=fs.readFileSync('src/farm-rules.js','utf8'),engine=fs.readFileSync('src/farm-automation.js','utf8');
async function boot(sharedStore=new Map(),versionGuard=null){
 let ms=0,panel='animals',modal=false,queue=[],verification=false,failStore=false,fetches=0,hold=null;
 const start=Date.parse('2026-10-23T01:00:00Z'),clicks=[],events={},intervals=[];
 const el=(tag='div')=>({tagName:tag.toUpperCase(),style:{},dataset:{},children:[],hidden:false,disabled:false,isConnected:true,value:'',textContent:'',append(...xs){for(const x of xs)if(x&&typeof x==='object'){x.parentElement=this;x.isConnected=true}this.children.push(...xs)},remove(){this.isConnected=false},setAttribute(k,v){this[k]=v},getAttribute(k){return this[k]??null},classList:{contains:()=>true,add(){}},getClientRects(){return this.hidden?[]:[{}]},contains(t){return t===this||this.children.some(x=>x?.contains?.(t))},closest(){return null},blur(){}});
 const d={owner:'test-owner',access:{open:true},now:start,price:{pay:.00032,charge:.00031,mult:1},farm:{owner:'test-owner',level:4,tz:480,tokens:100000,farmers:1,today:{day:'2026-10-23',energy:100,harvestEarned:0,bought:0},silo:{feed:20,wheat:0,corn:0},fields:[],animals:Array.from({length:10},(_,i)=>({id:'a'+i,kind:'chicken',meals:1,fedWindows:[],productReady:false,lastFedAt:start-3600000})),structures:[{id:'c',kind:'coop'},{id:'s',kind:'silo'}],harvestCarry:0,passiveSince:start,passiveBank:0}};
 const nav=arg=>{const e=el('button');e.dataset={action:'dock',arg};e.click=()=>{panel=arg;clicks.push('nav:'+arg)};return e};
 const navs=['fields','animals','shop','more'].map(nav),gameButtons={};
 const action=(name,fn,arg)=>{const e=el('button');e.dataset={action:name,...arg===undefined?{}:{arg}};e.click=()=>{clicks.push(name+(arg?':'+arg:''));fn?.()};return e};
 gameButtons['feed-all']=action('feed-all',()=>{queue=[{type:'feed'}]});gameButtons['collect-all']=action('collect-all',()=>{queue=[{type:'collect'}]});gameButtons['harvest-all']=action('harvest-all',()=>{queue=[{type:'harvest'}]});gameButtons['plant-all-open']=action('plant-all-open');
 gameButtons.energy=action('energy',()=>{d.farm.today.energy+=10;d.farm.today.bought+=10;d.farm.tokens-=305},'10');gameButtons.energy.textContent='购买 · 305';
 const body=el(),panelEl=el('aside');panelEl['aria-hidden']='false';
 const doc={hidden:false,activeElement:null,body,createElement:el,createTextNode:s=>s,addEventListener:(k,v)=>events[k]=v,removeEventListener:k=>delete events[k],getElementById:id=>id==='panel'?panelEl:id==='modal'&&modal?el():null,
 querySelectorAll:selector=>{
   const actionName=selector.match(/data-action="([^"]+)"/)?.[1];
   if(selector.startsWith('#dock'))return navs.filter(x=>x.dataset.action===actionName);
   if(selector.startsWith('#hud'))return [];
   if(selector.startsWith('#panel')){
    const allowed=panel==='animals'?['feed-all','collect-all']:panel==='fields'?['harvest-all','plant-all-open']:panel==='more'?['energy']:[];
    return allowed.includes(actionName)?[gameButtons[actionName]]:[];
   }return [];
 }};
 const win={addEventListener:(k,v)=>events[k]=v,removeEventListener:k=>delete events[k],__farmVerification:{isBlocked:()=>verification},__farmGame:{scene:{scenes:[{sys:{isActive:()=>true},worker:{pending:()=>queue}}]}}};
 if(versionGuard)win.__farmVersionGuard=versionGuard;
 const storage={getItem:k=>sharedStore.get(k)??null,setItem:(k,v)=>{if(failStore)throw Error('blocked');sharedStore.set(k,v)}};
 const context={window:win,document:doc,navigator:{locks:{request:async(name,opts,fn)=>fn({name})}},localStorage:storage,getComputedStyle:()=>({visibility:'visible'}),performance:{now:()=>ms},AbortController,
 fetch:async()=>{fetches++;if(hold)await hold;d.now=start+ms;return{ok:true,json:async()=>structuredClone(d)}},setInterval:fn=>(intervals.push(fn),intervals.length),clearInterval(){},setTimeout:()=>1,clearTimeout(){}};
 vm.runInNewContext(fs.readFileSync('src/activity-store.js','utf8'),context);vm.runInNewContext(rules,context);vm.runInNewContext(fs.readFileSync('src/workshop-rules.js','utf8'),context);vm.runInNewContext(fs.readFileSync('src/market-rules.js','utf8'),context);vm.runInNewContext(engine,context);const flush=()=>new Promise(setImmediate);await flush();
 const api=win.__farmAutomation;
 return{api,d,doc,events,clicks,context,el,action,setPanel:v=>panel=v,panel:()=>panel,store:sharedStore,flush,gameButtons,step:async(n=1,delta=5000)=>{for(let i=0;i<n;i++){ms+=delta;intervals.forEach(fn=>fn());await flush()}},queue:v=>queue=v,verify:v=>verification=v,modal:v=>modal=v,failStore:v=>failStore=v,reads:()=>fetches,hold:v=>hold=v};
}
if(require.main===module)(async()=>{
 let b=await boot();assert.equal(b.clicks.length,0);await b.step(2);assert.equal(b.reads(),1); // No polling when all features are off.
 b.api.set('feed',true);await b.step();assert.deepEqual(b.clicks,['feed-all']);await b.step(3);assert.equal(b.clicks.length,1); // No repeated jobs while queue/state remain unfinished.
 b.d.farm.animals.forEach(a=>a.fedWindows=['2026-10-23S']);b.queue([]);await b.step();assert.equal(b.api.status().pending,null);b.api.remove();
 b=await boot();b.d.farm.silo.feed=0;b.api.set('feed',true);await b.step();assert.equal(b.clicks.length,0);b.api.configure('feedGold',true);b.api.configure('feedBudget',1);await b.step();assert.equal(b.clicks.length,0);b.api.configure('feedBudget',1000);await b.step();assert.equal(b.clicks.at(-1),'feed-all');b.api.remove();
 b=await boot();b.d.farm.today.energy=0;b.api.set('feed',true);b.api.set('energy',true);await b.step(2);assert.equal(b.clicks.length,0);b.api.configure('energyBudget',500);await b.step(2);assert.equal(b.clicks.at(-1),'energy:10');await b.step(2);assert.equal(b.clicks.filter(x=>x==='energy:10').length,1);assert.equal(b.clicks.at(-1),'feed-all');b.api.remove();
 b=await boot();b.api.set('feed',true);b.verify(true);const reads=b.reads();await b.step();assert.equal(b.reads(),reads);assert.equal(b.clicks.length,0);b.verify(false);b.modal(true);await b.step();assert.equal(b.clicks.length,0);b.modal(false);b.doc.hidden=true;await b.step();assert.equal(b.clicks.length,0);b.doc.hidden=false;b.events.pointerdown({isTrusted:true,target:{closest:()=>null}});await b.step();assert.equal(b.clicks.length,0);await b.step(3);assert.equal(b.clicks.at(-1),'feed-all');b.api.remove();
 b=await boot();b.api.set('feed',true);await b.step();const saved=b.store;b.api.remove();const restored=await boot(saved);await restored.step(3);assert.equal(restored.clicks.length,0);assert.equal(restored.api.status().pending.kind,'feed');restored.api.remove();
 b=await boot();b.api.set('feed',true);b.failStore(true);await b.step();assert.equal(b.clicks.length,0);assert.equal(b.api.status().storageOK,false);b.api.remove();
 b=await boot();b.api.set('feed',true);await b.step();await b.step(13,15000);assert.equal(b.api.status().needsReview,true);assert.equal(b.clicks.length,1);b.events.keydown({isTrusted:true,code:'Escape',target:{closest:()=>null}});assert.equal(b.api.status().flags.feed,false);assert.equal(b.api.status().flags.energy,false);b.api.remove();
 b=await boot();for(const key of ['collect','orchard','income','mine','oil'])b.api.set(key,true);b.d.farm.animals[0].productReady=true;b.d.farm.passiveSince=b.d.now-7200000;b.d.farm.structures.push({id:'o',kind:'orchard',slots:[{tree:'orange',lastHarvestAt:b.d.now-86400001}]},{id:'m',kind:'mine',mineAt:b.d.now-43200001},{id:'oil',kind:'oilwell'});let plan=b.api.preview(b.d);assert.deepEqual(Array.from(plan.jobs,j=>j.kind),['collect','orchard','income','mine','oil']);b.d.farm.today.harvestEarned=26250;b.d.farm.harvestCarry=26250*7;plan=b.api.preview(b.d);assert.ok(!plan.jobs.some(j=>['collect','orchard'].includes(j.kind)));b.api.remove();
 b=await boot();b.d.farm.silo.feed=0;b.d.farm.today.feedSpent=990;b.api.set('feed',true);b.api.configure('feedGold',true);b.api.configure('feedBudget',1000);await b.step();assert.equal(b.clicks.length,0);b.api.remove();
 b=await boot();assert.equal(b.api.configure('reserve',-1),false);assert.equal(b.api.configure('energyBudget',NaN),false);assert.equal(b.api.configure('feedDays',8),false);assert.equal(b.api.configure('crop','unknown'),false);b.api.remove();
 b=await boot();b.api.set('workshop',true);b.api.set('feed',true);const persisted=b.store;b.api.remove();b=await boot(persisted);assert.equal(b.api.status().flags.workshop,true);assert.equal(b.api.status().flags.feed,true);b.events.keydown({isTrusted:true,code:'Escape',target:{closest:()=>null}});b.api.remove();b=await boot(persisted);assert.equal(b.api.status().flags.workshop,false);assert.equal(b.api.status().flags.feed,false);b.api.remove();
 b=await boot();assert.equal(b.api.status().config.workshopPrep,true);assert.equal(b.api.configure('workshopPrep',false),true);const prepStore=b.store;b.api.remove();b=await boot(prepStore);assert.equal(b.api.status().config.workshopPrep,false);assert.equal(b.api.configure('workshopPrep','yes'),false);b.api.remove();
 // Editing blocks submissions and pending timeout accounting without taking over the game mode.
 for(const mode of ['move','place','erase','inspect-new-mode']){
  b=await boot();const scene=b.context.window.__farmGame.scene.scenes[0];scene.mode={type:mode};b.api.set('feed',true);await b.step(4);assert.equal(b.clicks.length,0);assert.equal(b.api.status().pending,null);assert.match(b.api.status().message,/移动或放置/);assert.equal(scene.mode.type,mode);scene.mode={type:'normal'};await b.step();assert.equal(b.clicks.at(-1),'feed-all');b.api.remove();
 }
 b=await boot();b.api.set('feed',true);await b.step();b.context.window.__farmGame.scene.scenes[0].mode={type:'move'};await b.step(20,15000);assert.equal(b.clicks.length,1);assert.equal(b.api.status().needsReview,false);assert.equal(b.api.status().pending.activeMs,0);b.context.window.__farmGame.scene.scenes[0].mode={type:'normal'};b.d.farm.animals.forEach(a=>a.fedWindows=['2026-10-23S']);b.queue([]);await b.step();assert.equal(b.api.status().pending,null);assert.equal(b.api.status().flags.feed,true);b.api.remove();
 console.log('PASS: opt-in; one queue; feed budget; energy budget and small-pack only; no duplicates; pending survives reinstall; verification/modal/manual/background guards; fail-closed storage; timeout/Esc; invalid input');
})().catch(e=>{console.error(e);process.exitCode=1});

module.exports={boot};
