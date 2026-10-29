const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function boot(){
 let now=10000,focused=true,modal=false,deliveryFailure=false;const timers=new Map(),intervals=[],listeners={},keysEvents=[];let tid=0;
 const listen=(name,fn)=>(listeners[name]??=[]).push(fn);
 const unlisten=(name,fn)=>listeners[name]=(listeners[name]||[]).filter(f=>f!==fn);
 const el=()=>({hidden:false,getClientRects:()=>[{}]});
 const screen=el();screen.hidden=true;const root={...el(),querySelector:s=>s==='.bui-screen'?screen:s==='.bui-top'?el():{...el(),classList:{contains:()=>true}}};
 const document={hidden:false,hasFocus:()=>focused,getElementById:()=>root,querySelector:()=>el(),querySelectorAll:()=>modal?[el()]:[],addEventListener:listen,removeEventListener:unlisten};
 const keys={};for(const name of ['LEFT','RIGHT','UP','DOWN'])keys[name]={isDown:false,onDown(){this.isDown=true;keysEvents.push(['down',name])},onUp(){this.isDown=false;keysEvents.push(['up',name])}};
 const originalKeys={...keys};
 const hero={x:368,y:310,hp:100,dead:false,dodgeT:-1,stormT:-1,atkT:-1,stats:Object.freeze({maxHp:100,speed:92,reach:30,stormRadius:58})};
 const scene={input:{keyboard:{resetKeys(){for(const key of Object.values(keys))key.isDown=false}}},sys:{settings:{key:'battle'}},keys,hero,mode:'play',paused:false,run:{active:true,dodges:0},wave:5,enemies:[Object.freeze({alive:true,hittable:true,x:490,y:310,speed:20,rule:Object.freeze({id:'slime',brain:'hopper',radius:12})})],projs:[],children:{list:[]},doDodge(){if(hero.dodgeT<0){hero.dodgeT=0;this.run.dodges++}},doStorm(){if(hero.stormT<0)hero.stormT=0}};
 for(const name of ['hurt','update','dodge','storm'])Object.defineProperty(hero,name,{value:()=>{throw Error('do not call or replace hero '+name)},writable:false});
 const originalDodge=scene.doDodge,originalStorm=scene.doStorm;
 const window={__farmGame:{scene:{scenes:[scene]}},addEventListener:listen,removeEventListener:unlisten};
 const nativeHeld=new Set();let nativeId=0;
 const emit=(code,down)=>{
  const id='native-test-'+(++nativeId),type=down?'keydown':'keyup';window.__farmBattleInput.expect(code,type,id);
  const e={type,code,isTrusted:true,repeat:false,target:null};for(const fn of listeners[type]||[])fn(e);
  const name={ArrowLeft:'LEFT',ArrowRight:'RIGHT',ArrowUp:'UP',ArrowDown:'DOWN'}[code];
  if(name){originalKeys[name].isDown=down;keysEvents.push([down?'down':'up',name])}
  if(down){if(scene.run.sig&&!Object.isFrozen(scene.run.sig))scene.run.sig.kd.push(now);if(code==='Space')scene.doDodge();if(code==='KeyE')scene.doStorm()}
  assert(window.__farmBattleInput.consume(id),'native input must be observed without being treated as manual takeover');
 };
 window.postMessage=message=>{
  if(message.channel!=='farm-input-request')return;
  setImmediate(()=>{
   let ok=true,messageText='';try{
    if(deliveryFailure&&!message.stop)throw Error('native dispatch failed');
    if(!message.stop&&!window.__farmBattleInput.prepare())throw Error('input blocked');
    const wanted=new Set(message.stop?[]:message.keys.filter(k=>k.startsWith('Arrow')));
    for(const code of [...nativeHeld])if(!wanted.has(code)){emit(code,false);nativeHeld.delete(code)}
    for(const code of wanted)if(!nativeHeld.has(code)){emit(code,true);nativeHeld.add(code)}
    for(const code of message.keys.filter(k=>!k.startsWith('Arrow'))){emit(code,true);emit(code,false)}
   }catch(e){ok=false;messageText=e.message}
   const e={source:window,origin:'https://farmingseason.io',data:{channel:'farm-input-result',id:message.id,ok,message:messageText}};for(const fn of listeners.message||[])fn(e);
  });
 };
 const scope={window,document,location:{origin:'https://farmingseason.io'},Math:Object.assign(Object.create(Math),{random:()=>.5}),getComputedStyle:()=>({display:'block',visibility:'visible'}),performance:{now:()=>now},Date:class extends Date{static now(){return now}},setInterval:f=>(intervals.push(f),intervals.length),clearInterval(){},setTimeout:f=>(timers.set(++tid,f),tid),clearTimeout:id=>timers.delete(id),console};scope.globalThis=window;vm.createContext(scope);
 for(const file of ['src/battle-planner.js','src/combat-controller.js','src/combat-input.js'])vm.runInContext(fs.readFileSync(file,'utf8'),scope);
 const fire=(type,code,target=null)=>{for(const fn of listeners[type]||[])fn({type,code,target,isTrusted:true})};
 const flush=()=>new Promise(setImmediate);
 return {deliveryFailure:v=>deliveryFailure=v,flush,window,document,scene,hero,keys,keysEvents,screen,timers,originalDodge,originalStorm,fire,tick:async()=>{intervals[0]();await flush();intervals[0]();await flush()},advance:n=>now+=n,focus:v=>focused=v,modal:v=>modal=v};
}
(async()=>{
let b=boot();b.window.__farmCombat.set('enabled',true);await b.tick();assert(b.keys.RIGHT.isDown);assert(b.window.__farmCombat.status().skills&&b.window.__farmCombat.status().perks,'one switch enables skills and perks');
let n=b.keysEvents.length;b.advance(60);await b.tick();assert.equal(b.keysEvents.length,n,'continuous movement does not release and repress unchanged direction');
b.window.__farmCombat.set('enabled',false);await b.flush();assert(!b.keys.RIGHT.isDown);assert(!b.window.__farmCombat.status().perks,'stop disables upgrades too');
b.window.__farmCombat.set('enabled',true);await b.tick();for(const f of [...b.timers.values()])f();await b.flush();assert(!b.keys.RIGHT.isDown,'heartbeat expiry releases movement');
await b.tick();b.screen.hidden=false;await b.tick();assert(!b.keys.RIGHT.isDown,'upgrade overlay releases movement');b.screen.hidden=true;await b.tick();assert(b.keys.RIGHT.isDown);
b.modal(true);await b.tick();assert(!b.keys.RIGHT.isDown,'modal pauses');b.modal(false);
b.fire('keydown','ArrowUp');b.advance(4000);await b.tick();assert(!b.keys.RIGHT.isDown,'held human key prevents takeover beyond 2 seconds');b.fire('keyup','ArrowUp');b.advance(1999);await b.tick();assert(!b.keys.RIGHT.isDown);b.advance(2);await b.tick();assert(b.keys.RIGHT.isDown,'takeover resumes 2 seconds after release');
b.fire('pointerdown',null);b.advance(4000);await b.tick();assert(!b.keys.RIGHT.isDown,'held pointer pauses');b.fire('pointerup',null,{closest:()=>true});b.advance(2100);await b.tick();assert(b.keys.RIGHT.isDown,'releasing over panel does not leave a stuck manual pause');
b.fire('blur');await b.flush();assert(!b.keys.RIGHT.isDown,'blur releases immediately');b.focus(false);await b.tick();assert(b.keys.RIGHT.isDown,'visible unfocused page resumes movement');assert.equal(b.window.__farmCombat.status().phase,'running');b.document.hidden=true;b.fire('visibilitychange');await b.flush();assert(!b.keys.RIGHT.isDown,'hidden page releases immediately');await b.tick();assert(!b.keys.RIGHT.isDown,'hidden page cannot move');b.document.hidden=false;await b.tick();assert(b.keys.RIGHT.isDown);b.scene.paused=true;await b.tick();assert(!b.keys.RIGHT.isDown,'game pause still blocks movement');b.scene.paused=false;await b.tick();b.fire('pagehide');await b.flush();assert(!b.keys.RIGHT.isDown,'navigation releases immediately');b.focus(true);await b.tick();
b.fire('keydown','Escape');await b.flush();assert(!b.keys.RIGHT.isDown);assert(!b.window.__farmCombat.status().enabled&&!b.window.__farmCombat.status().perks);
b.window.__farmCombat.set('enabled',true);await b.tick();b.scene.run.active=false;await b.tick();assert(!b.keys.RIGHT.isDown,'battle end releases input');
b.scene.run.active=true;b.hero.dead=true;await b.tick();assert(!b.keys.RIGHT.isDown,'death cannot keep movement');b.hero.dead=false;
const input=b.window.__farmBattleInput;
input.apply(b.scene,{keys:['ArrowRight','Space']});await b.flush();assert.equal(b.scene.run.dodges,1,'original scene dodge records statistics');input.apply(b.scene,{keys:['Space']});await b.flush();assert.equal(b.scene.run.dodges,1,'original cooldown blocks repeat dodge');
input.apply(b.scene,{keys:['KeyE']});await b.flush();assert.equal(b.hero.stormT,0);assert.equal(b.scene.doDodge,b.originalDodge);assert.equal(b.scene.doStorm,b.originalStorm);assert.equal(b.hero.hp,100,'input leaves HP unchanged');
b.window.__farmCombat.remove();await b.flush();assert(!b.keys.RIGHT.isDown);assert(!b.window.__farmCombat);assert(!b.window.__farmBattleInput);
console.log('PASS: page-local continuous input, unified switch, manual takeover, overlay/hidden/end/death release and visible blur continuation, heartbeat and original skill rules');

b=boot();b.window.__farmCombat.set('enabled',true);await b.tick();b.keys.RIGHT.onDown=null;b.scene.keys.RIGHT=undefined;await b.tick();assert.equal(b.window.__farmCombat.status().phase,'error');assert(!b.window.__farmCombat.status().enabled,'incompatible input structure stops instead of continuing');assert(b.keysEvents.some(e=>e[0]==='up'),'error releases previously owned key');
console.log('PASS: incompatible game input stops battle automation and releases held input');
b=boot();b.window.__farmCombat.set('enabled',true);await b.tick();let versionBlocked=true;b.window.__farmVersionGuard={isBlocked:()=>versionBlocked};b.window.__farmBattleInput.release();await b.tick();assert(!b.keys.RIGHT.isDown);assert(b.window.__farmCombat.status().enabled,'version pause preserves the battle switch');
b.window.__farmBattleInput.apply(b.scene,{keys:['ArrowRight','Space']});assert(!b.keys.RIGHT.isDown);assert.equal(b.scene.run.dodges,0,'direct skill input is gated too');versionBlocked=false;await b.tick();assert(b.keys.RIGHT.isDown);b.window.__farmCombat.remove();
console.log('PASS: version pause stops battle movement/skills while preserving the desired switch');
b=boot();b.window.__farmCombat.set('enabled',true);await b.tick();b.advance(60);await b.tick();b.advance(800);await b.tick();assert.equal(b.window.__farmCombat.status().unsticks,1,'actual lack of movement triggers replanning');assert.equal(b.window.__farmCombat.status().intent,'recover');b.window.__farmCombat.remove();
b=boot();b.hero.atkT=0;b.window.__farmCombat.set('enabled',true);await b.tick();b.advance(60);await b.tick();b.advance(800);await b.tick();assert.equal(b.window.__farmCombat.status().unsticks,0,'sword animation is not classified as a stuck movement');b.window.__farmCombat.remove();
b=boot();b.scene.enemies=[{alive:true,hittable:true,x:580,y:310,hp:20,maxHp:20,speed:20,rule:{id:'slime',brain:'hopper',radius:12}}];b.scene.run.seconds=60;b.scene.run.kills=120;b.scene.run.hits=2;b.window.__farmCombat.set('enabled',true);await b.tick();assert.equal(b.window.__farmCombat.status().travelDodges,1,'travel counter increments only on an accepted dodge');assert.equal(b.window.__farmCombat.status().killsPerMinute,120);assert.equal(b.window.__farmCombat.status().hits,2);b.advance(60);await b.tick();assert.equal(b.window.__farmCombat.status().travelDodges,1,'busy dodge cannot repeat');b.window.__farmCombat.remove();
console.log('PASS: observer stuck detection, attack-animation exclusion, successful travel-dodge counting and per-minute efficiency metrics');
b=boot();b.scene.enemies=[{alive:true,hittable:true,x:368,y:148,hp:10,rule:{id:'slime',brain:'hopper',radius:12},state:'enter',lock:{x:368,y:200}},{alive:true,hittable:false,phased:true,x:650,y:310,hp:10,rule:{id:'ghost',brain:'ghost',radius:12},state:'chase'}];b.window.__farmCombat.set('enabled',true);await b.tick();assert.equal(b.window.__farmCombat.status().enemies,2);assert.equal(b.window.__farmCombat.status().entering,1);assert.equal(b.window.__farmCombat.status().hiddenEnemies,1);assert.equal(b.window.__farmCombat.status().attackable,0);assert(b.keys.UP.isDown,'observer retains entering enemies for early positioning');b.scene.enemies=[];b.scene.director={phase:'break'};await b.tick();assert.equal(b.window.__farmCombat.status().intent,'rally');b.screen.hidden=false;await b.tick();assert(!b.keys.UP.isDown,'upgrade overlay pauses gate staging');b.screen.hidden=true;await b.tick();assert(b.keys.UP.isDown,'staging resumes after upgrade overlay closes');b.window.__farmCombat.remove();
console.log('PASS: observer counts entrants and phased ghosts; between-wave rally pauses for upgrade overlays');
b=boot();b.window.__farmCombat.set('enabled',true);await b.tick();b.window.__farmCombat.set('mode','race');assert.equal(b.window.__farmCombat.status().mode,undefined,'obsolete mode cannot be restored');b.window.__farmManualCapture=true;await b.tick();assert(!b.keys.RIGHT.isDown,'manual recording releases automatic movement');b.window.__farmBattleInput.apply(b.scene,{keys:['ArrowRight','Space']});assert(!b.keys.RIGHT.isDown);assert.equal(b.scene.run.dodges,0,'recording blocks skills even at adapter entry');b.window.__farmCombat.remove();
console.log('PASS: obsolete race preference ignored, manual recording blocks movement, skills and observation');

// The input adapter leaves new game-owned telemetry untouched.
b=boot();b.window.__farmCombat.set('enabled',true);const telemetry=({kd:[],taps:3,gp:0,tMean:200,tSd:35,tSame:0,ivMean:300,ivSd:60,ivSame:0,hMean:400,hSd:80,hid:1,wd:0,hl:0});b.scene.run.sig=telemetry;b.window.__farmBattleInput.apply(b.scene,{keys:['ArrowRight','Space']});await b.flush();assert.equal(b.scene.run.sig,telemetry);assert.equal(telemetry.kd.length,2,'game keyboard listeners count actual dispatched movement and skill events');assert.equal(b.scene.doDodge,b.originalDodge);assert.equal(b.scene.doStorm,b.originalStorm);b.window.__farmCombat.remove();
console.log('PASS: updated game telemetry is counted by game keyboard listeners, with no counter replacement');
b=boot();b.deliveryFailure(true);b.window.__farmCombat.set('enabled',true);await b.tick();assert.equal(b.window.__farmCombat.status().enabled,false);assert.equal(b.window.__farmCombat.status().phase,'error');assert.equal(b.scene.run.dodges,0);assert.equal(b.hero.stormT,-1);assert(!b.keys.RIGHT.isDown,'failed browser input clears movement without falling back to internal controls');b.window.__farmCombat.remove();
b=boot();b.document.activeElement={matches:()=>true};b.window.__farmCombat.set('enabled',true);await b.tick();assert.equal(b.keysEvents.length,0,'editing never receives automated arrow/skill events');b.window.__farmCombat.remove();
console.log('PASS: transport failure disables battle instead of internal fallback, and editing blocks keyboard automation');


b=boot();assert.equal(b.window.__farmCombat.status().keyCount,null,'missing telemetry is unknown, not zero');
const downs=[],sig={kd:downs};b.scene.run.sig=sig;
assert.equal(b.window.__farmCombat.status().keyCount,0,'empty run starts at zero even with automation off');
downs.push(100,200,300);assert.equal(b.window.__farmCombat.status().keyCount,3,'reads live game key-down samples during manual play');
assert.equal(b.scene.run.sig,sig);assert.equal(sig.kd,downs);assert.deepEqual(downs,[100,200,300]);assert(!('keys' in sig),'display must not add exported fields to live telemetry');
b.scene.mode='perk';assert.equal(b.window.__farmCombat.status().keyCount,3,'upgrade selection retains count');
b.scene.run.active=false;b.scene.mode='end';Object.freeze(downs);Object.freeze(sig);assert.equal(b.window.__farmCombat.status().keyCount,3,'final count stays readable without mutations');
b.scene.mode='lobby';assert.equal(b.window.__farmCombat.status().keyCount,null,'lobby does not display stale previous-run count');
b.scene.mode='play';b.scene.run={active:true,sig:{kd:[]}};assert.equal(b.window.__farmCombat.status().keyCount,0,'new run starts with its own samples');
b.scene.run.sig.kd=new Array(4000).fill(100);assert.equal(b.window.__farmCombat.status().keyCount,4000,'uses game sample length including its 4000-sample cap');
b.scene.run.sig.kd={length:42};assert.equal(b.window.__farmCombat.status().keyCount,null,'invalid telemetry stays unknown');
b.window.__farmCombat.remove();console.log('PASS: live read-only keys count follows manual play, upgrades, ending and run resets');

})().catch(e=>{console.error(e);process.exitCode=1});
