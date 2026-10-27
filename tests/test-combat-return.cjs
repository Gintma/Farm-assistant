const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('src/combat-return.js','utf8');
function boot(){
  let now=0,clicks=0,modal=false,version=false,verified=true,enabled=true,removed=false,asyncHome=false;
  const listeners={},timers=[],logs=[],el=(extra={})=>({isConnected:true,hidden:false,textContent:'',getClientRects:()=>[{}],...extra});
  const rank=el({hidden:true,textContent:''}),summary=el(),home=el({disabled:false,click(){clicks++;if(!asyncHome)root.hidden=true}});
  const root=el({querySelector:q=>q.includes('bstats')?summary:q.includes('go-home')?home:q==='[data-b="rank"]'?rank:null});
  const scene={sys:{settings:{key:'battle'}},run:{active:true},mode:'play',tut:null};
  const add=(name,f)=>(listeners[name]??=[]).push(f),remove=(name,f)=>listeners[name]=(listeners[name]||[]).filter(x=>x!==f);
  const document={hidden:false,activeElement:null,getElementById:()=>root,querySelectorAll:()=>modal?[el()]:[],addEventListener:add,removeEventListener:remove};
  const window={__farmGame:{scene:{scenes:[scene]}},__farmCombat:{set(k,v){enabled=v}},__farmBattleInput:{release(){}},__farmActivity:{add(...args){logs.push(args)}},__farmVersionGuard:{isBlocked:()=>version},__farmVerification:{isBlocked:()=>!verified},addEventListener:add,removeEventListener:remove};
  vm.runInNewContext(code,{window,document,performance:{now:()=>now},getComputedStyle:()=>({display:'block',visibility:'visible'}),setInterval:f=>(timers.push(f),1),clearInterval(){removed=true}});
  const tick=t=>{now=t;timers[0]()};
  const fire=(type,extra={})=>{for(const f of [...listeners[type]||[]])f({type,isTrusted:true,...extra})};
  return {window,document,scene,rank,summary,home,root,logs,listeners,tick,fire,clicks:()=>clicks,enabled:()=>enabled,removed:()=>removed,modal:v=>modal=v,version:v=>version=v,verify:v=>verified=v,async:v=>asyncHome=v,end(){scene.run.active=false;scene.mode='over'},confirm(){rank.hidden=false;rank.textContent='Weekly rank #10'},status:()=>window.__farmCombatReturn.status()};
}
let b=boot();b.tick(0);b.end();b.tick(100);b.tick(20000);assert.equal(b.clicks(),0,'summary alone must not count as server confirmation');b.confirm();b.tick(21000);b.tick(25999);assert.equal(b.clicks(),0);b.tick(26000);assert.equal(b.clicks(),1);assert(!b.enabled());b.tick(26100);assert.equal(b.status().phase,'returned');assert.equal(b.logs.length,1);b.tick(40000);assert.equal(b.clicks(),1,'no repeated click');

for(const type of ['pointermove','wheel','input','change','keydown','pointerdown']){
 b=boot();b.tick(0);b.end();b.confirm();b.tick(100);b.tick(4000);b.fire(type,{code:'ArrowUp'});b.tick(4100);b.tick(10000);
 if(type==='keydown'||type==='pointerdown'){assert.equal(b.clicks(),0,'held input blocks return');b.fire(type==='keydown'?'keyup':'pointerup',{code:'ArrowUp'});b.tick(10100);b.tick(15099);assert.equal(b.clicks(),0);b.tick(15100)}
 else {assert.equal(b.clicks(),1,'interaction restarts 5 second idle period')}
 assert.equal(b.clicks(),1);
}
b=boot();b.tick(0);b.end();b.confirm();b.tick(100);b.tick(4000);b.fire('pointermove',{isTrusted:false});b.tick(5100);assert.equal(b.clicks(),1,'synthetic events do not represent manual activity');

for(const gate of ['modal','version','verify','hidden','capture','editing']){
 b=boot();b.tick(0);b.end();b.confirm();b.tick(100);
 if(gate==='hidden')b.document.hidden=true;else if(gate==='capture')b.window.__farmManualCapture=true;else if(gate==='editing')b.document.activeElement={matches:()=>true};else b[gate](gate!=='verify');
 b.tick(6000);assert.equal(b.clicks(),0,gate);
 b.document.hidden=false;b.document.activeElement=null;b.window.__farmManualCapture=false;b.modal(false);b.version(false);b.verify(true);
 b.tick(7000);b.tick(11999);assert.equal(b.clicks(),0,'resume starts a fresh countdown');b.tick(12000);assert.equal(b.clicks(),1);
}
b=boot();b.tick(0);b.end();b.confirm();b.tick(100);b.fire('keydown',{code:'Escape'});b.fire('keyup',{code:'Escape'});b.tick(20000);assert.equal(b.clicks(),0);assert.equal(b.status().phase,'cancelled');
b=boot();b.end();b.confirm();b.tick(0);b.tick(10000);assert.equal(b.clicks(),0,'old result without observing this run cannot auto-return');
b=boot();b.scene.tut={};b.tick(0);b.end();b.confirm();b.tick(100);b.tick(10000);assert.equal(b.clicks(),0,'tutorial excluded');
b=boot();b.tick(0);b.end();b.confirm();b.tick(100);b.scene.run={active:true};b.scene.mode='play';b.tick(6000);assert.equal(b.clicks(),0,'new battle cancels previous countdown');
b=boot();b.async(true);b.tick(0);b.end();b.confirm();b.tick(100);b.tick(5100);assert.equal(b.status().phase,'returning');b.root.hidden=true;b.tick(5500);assert.equal(b.status().phase,'returned','async page transition is verified on later ticks');
b=boot();b.async(true);b.tick(0);b.end();b.confirm();b.tick(100);b.tick(5100);b.tick(8200);assert.equal(b.status().phase,'error');b.tick(20000);assert.equal(b.clicks(),1,'failed navigation does not spam clicks');
b.window.__farmCombatReturn.remove();assert(b.removed());assert(!b.window.__farmCombatReturn);assert(Object.values(b.listeners).every(a=>!a.length),'cleanup removes all listeners');
console.log('PASS: confirmed settlement, 5s idle/reset/held input, hidden/modal/version/verification/edit guards, Escape, run identity, tutorial, original navigation, async verification and cleanup');
