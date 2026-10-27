const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {boot}=require('./test-farm-automation.cjs');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync('src/farm-rules.js','utf8'),ctx);const R=ctx.window.__farmRules;
const make=()=>({owner:'a',access:{open:true},now:Date.parse('2026-10-24T00:00:00Z'),price:{pay:.001,charge:.001},farm:{owner:'a',level:5,tz:480,tokens:10000,today:{day:'2026-10-24',harvestEarned:100000},fields:[],animals:[],structures:[{id:'p',kind:'pond'}],fishing:{rod:true,day:'2026-10-24',bait:0,bought:0,casts:0,total:80,caught:80}}});
let d=make(),p=R.fishingPlan(d);assert.equal(p.jobs[0].count,20);assert.equal(p.jobs[0].unit,47);assert.equal(p.jobs[0].cost,940);assert.equal(p.jobs[0].energy,0);
d.farm.fishing.bought=3;assert.equal(R.fishingPlan(d).jobs[0].count,17);
d.farm.fishing.bought=20;d.farm.fishing.bait=20;p=R.fishingPlan(d);assert.equal(p.jobs[0].kind,'fish-run');assert.equal(p.jobs[0].arg,'p|20');
d.farm.fishing.casts=13;d.farm.fishing.bait=100;assert.equal(R.fishingPlan(d).jobs[0].count,7);
d.farm.fishing.casts=20;assert.equal(R.fishingPlan(d).jobs.length,0);assert.match(R.fishingPlan(d).note,/今日已完成/);
d.farm.fishing.day='2026-10-23';p=R.fishingPlan(d);assert.equal(p.jobs[0].kind,'fish-bait');assert.equal(p.jobs[0].count,20); // Counts reset; carry-over bait remains.
d=make();d.farm.tokens=1;assert.equal(R.fishingPlan(d).jobs.length,0);assert.match(R.fishingPlan(d).note,/余额不足/);
d=make();d.farm.fishing.rod=false;assert.match(R.fishingPlan(d).note,/鱼竿/);assert.equal(R.fishingPlan(d).jobs.length,0);
d=make();d.farm.fishing.bought=NaN;assert.throws(()=>R.fishingPlan(d),/计数/);
d=make();d.farm.fishing.line={pondId:'p',at:d.now-10000,bite:d.now+20000};assert.equal(R.fishingPlan(d).jobs.length,0);d.farm.fishing.line.bite=d.now-1;p=R.fishingPlan(d);assert.equal(p.jobs[0].kind,'fish-reel');assert.equal(R.pendingDone({...p.jobs[0],day:'2026-10-24'},d),false);d.farm.fishing.caught++;assert.equal(R.pendingDone({...p.jobs[0],day:'2026-10-24'},d),true);
d=make();const buy={...R.fishingPlan(d).jobs[0],day:'2026-10-24'};assert.equal(R.pendingDone(buy,d),false);d.farm.fishing.bought=20;assert.equal(R.pendingDone(buy,d),true);d.farm.fishing.bait=20;const run={...R.fishingPlan(d).jobs[0],day:'2026-10-24'};assert.equal(R.pendingDone(run,d),false);d.farm.fishing.total++;assert.equal(R.pendingDone(run,d),true);
async function fishBoot(store){
 const b=await boot(store),query=b.doc.querySelectorAll.bind(b.doc);b.d.farm.fishing={rod:true,day:'2026-10-23',bait:0,bought:0,casts:0,total:0,caught:0};b.d.farm.structures.push({id:'p',kind:'pond'});
 const input=b.el('input');input.max='20';input.dispatchEvent=()=>{};b.context.Event=class{};
 b.doc.querySelector=s=>s.includes('pond.n')?input:null;
 const parent=b.el(),extra=[];const append=parent.append.bind(parent);parent.append=(...xs)=>{append(...xs);for(const x of xs)if(x.dataset?.action==='buy-bait'){x.click=()=>{b.clicks.push('buy-bait:'+x.dataset.arg);const n=Number(x.dataset.arg);b.d.farm.fishing.bought+=n;b.d.farm.fishing.bait+=n};extra.push(x)}};
 b.doc.querySelectorAll=s=>{
  const name=s.match(/data-action="([^"]+)"/)?.[1];
  if(s.startsWith('#panel')&&name==='rwa-open'&&b.panel()==='shop')return[b.action('rwa-open',()=>b.setPanel('pond'),'p')];
  if(s.startsWith('#panel')&&name==='buy-bait'&&b.panel()==='pond')return [...[5,10,20].map(n=>{const x=b.action('buy-bait',()=>{b.d.farm.fishing.bought+=n;b.d.farm.fishing.bait+=n;b.d.farm.tokens-=68*n},String(n));x.textContent='+'+n+' · '+68*n;x.disabled=n>20-b.d.farm.fishing.bought;x.classList.contains=()=>false;x.parentElement=parent;return x}),...extra];
  if(s.startsWith('#panel')&&name==='pond-fish-n'&&b.panel()==='pond'){const n=Math.min(b.d.farm.fishing.bait,20-b.d.farm.fishing.casts);input.max=String(n);const x=b.action('pond-fish-n',()=>{assert.equal(input.value,String(n));b.d.farm.fishing.casts++;b.d.farm.fishing.total++;b.d.farm.fishing.bait--;b.queue([{type:'fish-all'}])},'p|'+n);return n?[x]:[]}
  return query(s);
 };
 return b;
}
(async()=>{
 let b=await fishBoot();b.api.set('fishing',true);await b.step(8);assert.equal(b.clicks.filter(x=>x==='buy-bait:20').length,1);assert.equal(b.clicks.filter(x=>x==='pond-fish-n:p|20').length,1);await b.step(45);assert.equal(b.api.status().needsReview,false);assert.equal(b.clicks.filter(x=>x.startsWith('pond-fish-n')).length,1);b.queue([]);Object.assign(b.d.farm.fishing,{casts:20,bait:0,caught:20});await b.step(3);assert.equal(b.clicks.filter(x=>x.startsWith('buy-bait')).length,1);b.api.remove();
 b=await fishBoot();b.d.farm.fishing.bought=18;b.d.farm.fishing.bait=18;b.api.set('fishing',true);await b.step(7);assert.ok(b.clicks.includes('buy-bait:2'));assert.equal(b.d.farm.fishing.bought,20);b.api.remove();
 b=await fishBoot();b.api.set('fishing',true);b.verify(true);await b.step(5);assert.equal(b.clicks.length,0);b.verify(false);b.doc.hidden=true;await b.step(5);assert.equal(b.clicks.length,0);b.doc.hidden=false;b.events.keydown({isTrusted:true,code:'Escape',target:{closest:()=>null}});await b.step(5);assert.equal(b.api.status().flags.fishing,false);assert.equal(b.clicks.length,0);b.api.remove();
 b=await fishBoot();b.api.set('fishing',true);const saved=b.store;b.api.remove();b=await fishBoot(saved);assert.equal(b.api.status().flags.fishing,true);b.api.remove();
 console.log('PASS: exact 20 daily budget incl. manual buys, normal-button quote checks, partial top-up, one native batch, long-run progress without timeout/duplicates, daily rollover, carry-over bait, reel recovery, no rod auto-buy, balance/counter validation, captcha/background/Esc/persistence');
})().catch(e=>{console.error(e);process.exitCode=1});
