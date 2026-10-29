const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function boot(){
 const listeners={detach:[],event:[],removed:[]},commands=[],attachments=[],detaches=[],timers=new Map(),stored={};let timerId=0,ready=true,compatible=true,seen=true,url='https://farmingseason.io/',active=true,failAttach=false,hold=null;
 const chrome={runtime:{getManifest:()=>({version:'test'})},tabs:{get:async id=>({id,url,active}),query:async()=>[{id:1,url}],onRemoved:{addListener:f=>listeners.removed.push(f)}},storage:{session:{get:async()=>({...stored}),set:async x=>Object.assign(stored,x),remove:async k=>delete stored[k]}},debugger:{
  attach:async target=>{if(failAttach)throw Error('occupied');attachments.push(target.tabId)},
  detach:async target=>{detaches.push(target.tabId);listeners.detach.forEach(f=>f(target))},
  onDetach:{addListener:f=>listeners.detach.push(f)},onEvent:{addListener:f=>listeners.event.push(f)},
  sendCommand:async(target,method,params={})=>{
   commands.push({tabId:target.tabId,method,params});
   if(method==='Runtime.evaluate'){
    if(params.expression.includes('.expect(')){if(hold)await hold;return {result:{value:true}}}
    if(params.expression.includes('.consume('))return {result:{value:seen}};
    if(params.expression.includes('.prepare'))return {result:{value:{compatible,ready}}};
    if(params.expression.includes('const version='))return {result:{value:{version:'test',battleEnabled:true,farmFlags:{}}}};
    return {result:{value:true}};
   }return {};
  }
 }};
 const ctx={chrome,console,URL,Date,Blob,Promise,setTimeout:f=>(timers.set(++timerId,f),timerId),clearTimeout:id=>timers.delete(id)};vm.createContext(ctx);
 for(const name of ['debugger-session','keyboard-input','network-recorder'])vm.runInContext(fs.readFileSync('extension/'+name+'.js','utf8'),ctx);
 const input=()=>commands.filter(c=>c.method==='Input.dispatchKeyEvent').map(c=>[c.tabId,c.params.type,c.params.code]);
 return {ctx,commands,attachments,detaches,timers,input,ready:v=>ready=v,compatible:v=>compatible=v,seen:v=>seen=v,url:v=>url=v,active:v=>active=v,failAttach:v=>failAttach=v,hold:v=>hold=v,detach:id=>listeners.detach.forEach(f=>f({tabId:id})),flush:()=>new Promise(setImmediate)};
}
(async()=>{
 let b=boot(),K=b.ctx.FarmKeyboard;
 await K.send(1,['ArrowRight']);await K.send(1,['ArrowRight']);assert.deepEqual(b.input(),[[1,'keyDown','ArrowRight']],'continuous held direction has no repeated downs');assert.deepEqual(b.attachments,[1]);
 await K.send(1,['ArrowUp','KeyE']);assert.deepEqual(b.input().slice(1),[[1,'keyUp','ArrowRight'],[1,'keyDown','ArrowUp'],[1,'keyDown','KeyE'],[1,'keyUp','KeyE']],'movement and skill share real browser key events');
 await K.send(1,[],true);assert.equal(b.input().at(-1)[2],'ArrowUp');assert.deepEqual(b.detaches,[1]);assert(b.commands.every(c=>c.method!=='Input.dispatchKeyEvent'||c.params.autoRepeat===false));
 // Recorder and battle share the connection without detaching one another.
 b=boot();K=b.ctx.FarmKeyboard;await K.send(1,['ArrowLeft']);await b.ctx.FarmManualRecorder.start({kind:'assistant-test'});assert.equal(b.attachments.length,1);
 await b.ctx.FarmManualRecorder.stop();assert.equal(b.detaches.length,0,'stopping recording cannot disconnect running input');await K.send(1,[],true);assert.equal(b.detaches.length,1);
 b=boot();K=b.ctx.FarmKeyboard;await b.ctx.FarmManualRecorder.start({kind:'assistant-test'});await K.send(1,['ArrowLeft']);await K.send(1,[],true);assert.equal(b.detaches.length,0,'stopping input cannot disconnect recording');await b.ctx.FarmManualRecorder.stop();assert.equal(b.detaches.length,1);
 // Stale-record recovery must not detach a newly acquired live keyboard owner.
 b=boot();await b.ctx.FarmKeyboard.send(1,['ArrowRight']);await b.ctx.FarmDebugger.recover(1);assert.equal(b.detaches.length,0);await b.ctx.FarmKeyboard.send(1,[],true);
 // Invisible/foreign/not-ready contexts and arbitrary keys cannot be driven.
 for(const configure of [b=>b.url('https://other.invalid/'),b=>b.compatible(false),b=>b.failAttach(true)]){
  b=boot();configure(b);await assert.rejects(()=>b.ctx.FarmKeyboard.send(1,['ArrowRight']));assert.equal(b.input().length,0);
 }
 // A normal game pause between planning and delivery must not become a fatal input error.
 b=boot();K=b.ctx.FarmKeyboard;await K.send(1,['ArrowRight']);b.ready(false);const paused=await K.send(1,['ArrowUp','Space']);
 assert.equal(paused.ok,true);assert.equal(paused.paused,true);assert.deepEqual(b.input(),[[1,'keyDown','ArrowRight'],[1,'keyUp','ArrowRight']],'pause releases held keys without sending the queued skill');
 b.ready(true);await K.send(1,['ArrowLeft']);assert.equal(b.input().at(-1)[2],'ArrowLeft','game readiness recovers without resetting the switch');await K.send(1,[],true);
 b=boot();b.active(false);assert.equal((await b.ctx.FarmKeyboard.send(1,['ArrowRight'])).paused,true);assert.equal(b.input().length,0);b.active(true);await b.ctx.FarmKeyboard.send(1,['ArrowRight']);assert.equal(b.input().length,1);await b.ctx.FarmKeyboard.send(1,[],true);
 b=boot();b.url(undefined);await b.ctx.FarmKeyboard.send(1,['ArrowRight'],false,'https://farmingseason.io/');assert.equal(b.input().length,1,'trusted content-script URL plus runtime origin check supports auto-start without extra tabs permission');await b.ctx.FarmKeyboard.send(1,[],true);
 for(const keys of [['Escape'],['KeyA'],['Space','KeyE'],['ArrowUp','ArrowUp'],["__proto__"]]){b=boot();await assert.rejects(()=>b.ctx.FarmKeyboard.send(1,keys));assert.equal(b.attachments.length,0)}
 b=boot();await b.ctx.FarmKeyboard.send(1,['ArrowRight']);b.seen(false);await assert.rejects(()=>b.ctx.FarmKeyboard.send(1,['ArrowLeft']));assert.equal(b.detaches.length,1,'unobserved delivery releases input and connection');
 b=boot();await b.ctx.FarmKeyboard.send(1,['ArrowRight']);for(const f of [...b.timers.values()])f();await b.flush();assert.equal(b.input().at(-1)[1],'keyUp');assert.equal(b.detaches.length,1,'background heartbeat releases movement');
 // Cancellation of an in-flight preparation never becomes a late key down.
 b=boot();let unlock;const wait=new Promise(r=>unlock=r);b.hold(wait);const moving=b.ctx.FarmKeyboard.send(1,['ArrowRight']);await b.flush();const stopping=b.ctx.FarmKeyboard.send(1,[],true);b.hold(null);unlock();await moving.catch(()=>{});await stopping;assert(!b.input().some(x=>x[1]==='keyDown'));
 // Expiring the lease during an awaited command cancels that command without a fatal shutdown.
 b=boot();K=b.ctx.FarmKeyboard;await K.send(1,['ArrowRight']);let resume;const stalled=new Promise(r=>resume=r);b.hold(stalled);const inFlight=K.send(1,['ArrowUp']);await b.flush();for(const f of [...b.timers.values()])f();b.hold(null);resume();
 assert.equal((await inFlight).paused,true);await b.flush();assert(!b.input().some(x=>x[1]==='keyDown'&&x[2]==='ArrowUp'));await K.send(1,['ArrowLeft']);await K.send(1,[],true);
 // The real content bridge must preserve pause information instead of dropping it.
 b=boot();b.ready(false);const replies=[],messageListeners=[],page={postMessage:data=>replies.push(data),addEventListener:(type,fn)=>{if(type==='message')messageListeners.push(fn)}};page.top=page;
 Object.assign(b.ctx,{window:page,location:{origin:'https://farmingseason.io'},document:{documentElement:{},addEventListener(){},removeEventListener(){}},MutationObserver:class{observe(){}disconnect(){}}});
 b.ctx.chrome.runtime.sendMessage=async message=>b.ctx.FarmKeyboard.send(1,message.keys,message.stop);
 vm.runInContext(fs.readFileSync('extension/auto-start.js','utf8'),b.ctx);
 await messageListeners[0]({source:page,origin:'https://farmingseason.io',data:{channel:'farm-input-request',id:'pause-test',keys:['ArrowRight']}});
 assert.equal(replies[0].ok,true);assert.equal(replies[0].paused,true);assert(replies[0].message);assert.equal(b.input().length,0);
 b=boot();await b.ctx.FarmKeyboard.send(1,['ArrowRight']);b.detach(1);await assert.rejects(()=>b.ctx.FarmKeyboard.send(1,['ArrowRight']),/连接已断开/);assert.equal(b.attachments.length,1,'manual debugger cancellation must not be immediately overridden');
 await b.ctx.FarmKeyboard.send(1,[],true);await b.ctx.FarmKeyboard.send(1,['ArrowRight']);assert.equal(b.attachments.length,2,'explicit stop/re-enable may reconnect');
 // A debugger cancellation during in-flight work is a real failure, never an auto-resumable pause.
 b=boot();K=b.ctx.FarmKeyboard;await K.send(1,['ArrowRight']);let continueInput;const blockedInput=new Promise(r=>continueInput=r);b.hold(blockedInput);const disrupted=K.send(1,['ArrowUp']);await b.flush();const queued=K.send(1,['ArrowLeft']);b.detach(1);b.hold(null);continueInput();
 const failures=await Promise.allSettled([disrupted,queued]);assert(failures.every(r=>r.status==='rejected'),'in-flight and queued requests preserve external disconnect failures');assert.equal(b.attachments.length,1);
 // Separate tabs never exchange held keys or releases.
 b=boot();await b.ctx.FarmKeyboard.send(1,['ArrowRight']);await b.ctx.FarmKeyboard.send(2,['ArrowLeft']);await b.ctx.FarmKeyboard.send(1,[],true);assert(!b.input().some(x=>x[0]===2&&x[1]==='keyUp'));await b.ctx.FarmKeyboard.send(2,[],true);
 assert(b.commands.filter(c=>c.method==='Runtime.evaluate').every(c=>!c.params.expression.includes('run.sig')&&!c.params.expression.includes('doDodge')&&!c.params.expression.includes('doStorm')),'transport never edits game statistics or calls skill methods');
 console.log('PASS: browser key event routing, held keys/skill pulses/releases, input-recorder shared ownership, tab/origin/readiness/key allowlists, delivery failure, watchdog, late-command cancellation, explicit reconnect and tab isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
