const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/combat-goal.js','utf8');
function boot({display='200 / 1,000 SEASON',active=false,fail=false,goalEnabled=true}={}){
 let now=10000,enabled=true,blocked=false,focused=true,modal=false,manualPaused=false,reads=0,retreats=0,removed=false;
 const element=(tag='div')=>({tagName:tag.toUpperCase(),matches(){return this.tagName==='INPUT'},hidden:false,textContent:'',style:{},children:[],getClientRects:()=>[{}],append(...xs){this.children.push(...xs)},setAttribute(){},remove(){removed=true},blur(){document.activeElement=null}});
 const lobby=element(),small=element();lobby.textContent=display;small.textContent='9:59 left';
 const root={...element(),querySelector:q=>q==='.bloot .row span'?lobby:q==='.bui-loot small'?small:null};
 const document={hidden:false,activeElement:null,hasFocus:()=>focused,getElementById:()=>root,querySelectorAll:()=>modal?[element()]:[],createElement:element};
 const scene={sys:{settings:{key:'battle'}},mode:active?'play':'lobby',paused:false,hero:{dead:false},run:{active,loot:0,pending:0},endRun(died){assert.equal(died,false);assert(!enabled,'automatic controls stop before retreat');retreats++;this.run.active=false;this.mode='over'}};
 const data={owner:'me',access:{open:true},farm:{owner:'me',today:{battleEarned:200}},now:1};
 const window={__farmGame:{scene:{scenes:[scene]}},__farmCombat:{status:()=>({enabled,manualPaused}),set:(k,v)=>enabled=v},__farmBattleInput:{release(){}},__farmVersionGuard:{isBlocked:()=>blocked},__farmEarnings:{model:d=>({battle:{cap:1000,earned:d.farm.today.battleEarned}})}};
 const intervals=[],ctx={window,document,Date:class extends Date{static now(){return now}},AbortController,getComputedStyle:()=>({display:'block',visibility:'visible'}),setInterval:f=>(intervals.push(f),1),clearInterval(){},setTimeout:()=>1,clearTimeout(){},fetch:async()=>{reads++;if(fail)throw Error('offline');return {ok:true,json:async()=>data}}};
 vm.runInNewContext(source,ctx);if(goalEnabled)window.__farmCombatGoal.setEnabled(true);
 return {api:window.__farmCombatGoal,window,document,scene,lobby,small,data,root,element,reads:()=>reads,retreats:()=>retreats,enabled:()=>enabled,flush:()=>new Promise(setImmediate),tick:()=>intervals[0](),advance:n=>now+=n,block:v=>blocked=v,focus:v=>focused=v,modal:v=>modal=v,manual:v=>manualPaused=v,enable:v=>enabled=v,begin(){scene.run={active:true,loot:0,pending:0};scene.mode='play';scene.paused=false;intervals[0]()}};
}
(async()=>{
 let b=boot();assert.equal(b.api.status().target,800);b.begin();b.scene.run.loot=400;b.tick();assert.equal(b.api.status().target,800,'target is remaining allowance at run start, not a shrinking threshold');
 b.scene.run.loot=799;b.scene.run.pending=.9999999;b.scene.run.floating=500;b.tick();assert.equal(b.retreats(),0,'do not count floating drops or round fractional pending up');
 b.scene.run.pending=1;b.tick();assert.equal(b.retreats(),1);assert(b.api.status().triggered);b.tick();assert.equal(b.retreats(),1,'single original settlement');assert(!b.enabled());
 b=boot();assert(b.api.setTarget('50'));b.begin();b.scene.run.loot=49;b.scene.run.pending=.9;b.tick();assert.equal(b.retreats(),0);b.scene.run.loot=50;b.tick();assert.equal(b.retreats(),1,'manual target is current-run earnings, not account daily total');
 for(const value of ['',null,-1,1.2,Infinity,'abc'])assert.equal(b.api.setTarget(value),false);
 b=boot({goalEnabled:false});assert.equal(b.api.status().enabled,false);b.begin();b.scene.run.loot=800;b.tick();assert.equal(b.retreats(),0,'goal off never retreats at the default target');b.api.setEnabled(true);assert.equal(b.retreats(),1,'enabling an already reached valid target acts without apply');
 for(const flag of ['block','modal','manual','hidden','editing','recording','goal-disabled','pause']){
  b=boot();b.api.setTarget(1);b.begin();b.scene.run.loot=1;
  if(flag==='block')b.block(true);if(flag==='focus')b.focus(false);if(flag==='modal')b.modal(true);if(flag==='manual')b.manual(true);if(flag==='hidden')b.document.hidden=true;if(flag==='editing')b.document.activeElement={matches:()=>true};if(flag==='recording')b.window.__farmManualCapture=true;if(flag==='goal-disabled')b.api.setEnabled(false);if(flag==='pause')b.scene.mode='pause';
  b.tick();assert.equal(b.retreats(),0,flag+' must prevent automatic retreat');
 }
 b=boot();b.api.setTarget(1);b.begin();b.focus(false);b.scene.run.loot=1;b.tick();assert.equal(b.retreats(),1,'visible unfocused page still exits at its target');
 b=boot();b.api.setTarget(1);b.begin();b.scene.run.loot=1;b.scene.mode='perk';b.scene.paused=true;b.tick();assert.equal(b.retreats(),1,'target can settle normally during upgrade choice without selecting another perk');
 b=boot({display:'1,000 / 1,000 SEASON'});assert.equal(b.api.status().target,0);assert.equal(b.retreats(),0,'no automatic starts or lobby settlement');b.begin();assert.equal(b.retreats(),1,'zero remaining allowance ends a manually started run');
 b=boot();b.api.setTarget(1);b.begin();b.scene.tut={};b.scene.run.loot=1;b.tick();assert.equal(b.retreats(),0,'tutorial does not settle');
 b=boot({display:'unavailable',active:true});await b.flush();assert.equal(b.reads(),1);assert.equal(b.api.status().target,800,'authenticated quota fallback works when quick HUD shows a timer');b.data.farm.today.battleEarned=600;b.advance(60000);b.tick();assert.equal(b.api.status().target,800);assert.equal(b.reads(),1,'freeze active target and avoid quota polling during battle');
 b=boot({display:'unavailable',active:true,fail:true});await b.flush();assert.equal(b.api.status().target,null);b.scene.run.loot=999;b.tick();assert.equal(b.retreats(),0,'unknown quota cannot cause guessed retreat');
 b=boot();b.begin();b.scene.run.loot=800;b.scene.endRun=()=>{throw Error('settlement unavailable')};b.tick();assert(!b.enabled());assert.equal(b.api.status().triggered,false);assert.match(b.api.status().message,/settlement unavailable/);b.tick();assert.match(b.api.status().message,/settlement unavailable/,'retain actionable error rather than overwrite it');
 b=boot({goalEnabled:false});const host=b.element();b.api.mount(host);const box=host.children[0],row=box.children[0],input=row.children[0].children[0],toggle=row.children[1];
 assert.equal(box.children.length,2,'one target row and one progress line, no apply/reset controls');assert.equal(toggle.textContent,'关闭');assert.equal(input.value,'800');
 b.document.activeElement=input;input.value='25';input.oninput();b.tick();assert.equal(input.value,'25');assert.equal(b.api.status().target,25,'valid input applies without a confirmation button');
 toggle.onclick();assert.equal(toggle.textContent,'开启');assert(b.api.status().enabled);b.begin();b.scene.run.loot=25;b.tick();assert.equal(b.retreats(),1);
 // Clearing or invalidating an enabled target must never reuse its previous valid value.
 b=boot();const parent=b.element();b.api.mount(parent);const field=parent.children[0].children[0].children[0].children[0];
 b.api.setTarget(5);b.begin();b.scene.run.loot=10;field.value='';field.oninput();b.tick();assert.equal(b.retreats(),0);assert.equal(b.api.status().target,null);assert.equal(field.value,'');
 field.value='1.5';field.oninput();field.blur();b.tick();assert.equal(b.retreats(),0);assert.equal(b.api.status().target,null,'invalid input suppresses the old target after blur');
 field.value='20';field.oninput();b.tick();assert.equal(b.api.status().target,20);assert.equal(b.retreats(),0);b.scene.run.loot=20;b.tick();assert.equal(b.retreats(),1,'corrected input resumes the armed goal');
 b=boot();b.api.setTarget(1);b.begin();b.enable(false);b.scene.run.loot=1;b.tick();assert.equal(b.retreats(),1,'target switch independently controls retreat during a manual battle');

 b=boot();b.begin();b.scene.run.loot=100;b.scene.run.active=false;b.scene.mode='lobby';b.lobby.textContent='300 / 1,000 SEASON';b.tick();assert.equal(b.api.status().earned,0);b.enable(true);b.begin();assert.equal(b.api.status().target,700,'next run recalculates default from latest daily cumulative');
 console.log('PASS: frozen per-run remaining allowance, independent target switch/live input, exact integer earnings, single original retreat, pause/version/manual/verification guards, upgrade screen, zero cap, tutorial, authenticated fallback and missing/error safety');
})().catch(e=>{console.error(e);process.exitCode=1});
