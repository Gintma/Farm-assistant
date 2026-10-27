const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('src/combat-perks.js','utf8');
function boot(random=.375){
 let now=0,focused=true,verification=false,overlay=false,perks=true;const intervals=[],chosen=[];
 const el=(extra={})=>({hidden:false,isConnected:true,getClientRects:()=>[{}],...extra});
 const card=(id,text)=>el({dataset:{perk:id},textContent:text,querySelector:s=>s==='b'?{textContent:id}:null,click:()=>chosen.push(id)});
 let cards=[card('blade','Hit damage +15%'),card('haste','Attack 10% more often'),card('reach','Attack reach +12%')];
 const screen=el({innerText:'Wave 1 cleared'}),root=el({querySelector:()=>screen,querySelectorAll:()=>cards});
 const document={hidden:false,hasFocus:()=>focused,getElementById:()=>root,querySelectorAll:()=>overlay?[el()]:[]};
 // No game instance/debugger is needed for visible upgrade selection.
 const window={__farmCombat:{status:()=>({enabled:perks,perks})},__farmVerification:{isBlocked:()=>verification}};
 vm.runInNewContext(code,{window,document,Math:Object.assign(Object.create(Math),{random:()=>random}),getComputedStyle:()=>({display:'block',visibility:'visible'}),performance:{now:()=>now},setInterval:f=>(intervals.push(f),1),clearInterval(){}});
 return {chosen,card,document,screen,window,tick:t=>{now=t;intervals[0]()},focus:v=>focused=v,verify:v=>verification=v,overlay:v=>overlay=v,perks:v=>perks=v,cards:v=>cards=v};
}
let b=boot();b.tick(0);b.tick(1999);assert.equal(b.chosen.length,0);b.tick(2000);assert.deepEqual(b.chosen,['haste'],'normal button clicked with unified battle switch');b.tick(9000);assert.equal(b.chosen.length,1,'no duplicate click');
b=boot();b.tick(0);b.focus(false);b.tick(1500);assert.equal(b.chosen.length,0);b.tick(2000);assert.equal(b.chosen.length,1,'visible unfocused page selects without resetting its delay');
b=boot();b.document.hidden=true;b.tick(0);b.tick(4000);assert.equal(b.chosen.length,0,'hidden page never selects');b.document.hidden=false;b.tick(5000);b.tick(7000);assert.equal(b.chosen.length,1,'visible page resumes after a fresh delay');
b=boot();b.cards([b.card('unknown','New effect'),b.card('haste','Attack more often')]);b.tick(0);b.tick(2000);assert.deepEqual(b.chosen,['unknown']);
for(const block of ['verify','overlay']){b=boot();b.tick(0);b[block](true);b.tick(3000);assert.equal(b.chosen.length,0);b[block](false);b.tick(4000);b.tick(5999);assert.equal(b.chosen.length,0);b.tick(6000);assert.equal(b.chosen.length,1)}
b=boot();b.perks(false);b.tick(0);b.tick(3000);assert.equal(b.chosen.length,0);b.perks(true);b.tick(4000);b.tick(6000);assert.equal(b.chosen.length,1);
console.log('PASS: unified selection without game/debugger; random delay (fixed test random); priority; unknown first; no duplicates; unfocused continuation and hidden/verification/modal/toggle reset');
b=boot();let versionBlocked=true;b.window.__farmVersionGuard={isBlocked:()=>versionBlocked};b.tick(0);b.tick(3000);assert.equal(b.chosen.length,0);versionBlocked=false;b.tick(4000);b.tick(6000);assert.equal(b.chosen.length,1);
console.log('PASS: version pause blocks upgrade selection and restarts the 2 second wait on resume');

for(const [random,delay] of [[0,1100],[.999999,3499.9976]]){
 const b=boot(random);b.tick(0);b.tick(delay-1);assert.equal(b.chosen.length,0);b.tick(delay+1);assert.equal(b.chosen.length,1);
}
b=boot();b.window.__farmManualCapture=true;b.tick(0);b.tick(4000);assert.equal(b.chosen.length,0,'manual recording cannot choose upgrades');
console.log('PASS: random delay endpoints, one draw per screen and no selection during manual recording');
