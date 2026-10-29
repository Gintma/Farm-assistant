const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/battle-report.js','utf8'),PATH='/api/farm/battle/end';
const response=(data={ok:true},status=200)=>({status,clone:()=>({text:async()=>JSON.stringify(data)})});
const payload=n=>({run:'private-run-'+n,wave:10,kills:n,earned:20,seconds:600,died:false,stats:{hits:2,dodges:7,tamper:[],sig:{keys:289,ivSame:95,synth:0}},dbg:{drops:30,pending:0},px:{pay:.1,charge:.1}});
const options=n=>({method:'POST',headers:{Authorization:'private-auth'},body:JSON.stringify(payload(n))});
function boot({store=new Map(),deny=false,reply=response(),throwFetch=null}={}){
 let pending=Promise.resolve(reply),removed=false;const calls=[],links=[],blobs=[],revoked=[],timers=[];
 const original=function(...args){calls.push({self:this,args});if(throwFetch)throw throwFetch;return pending};
 const el=tag=>({tagName:tag.toUpperCase(),children:[],style:{},append(...x){this.children.push(...x)},remove(){removed=true},click(){links.push({href:this.href,download:this.download})}});
 const document={body:el('body'),createElement:el},window={fetch:original,__farmLauncher:{status:()=>({version:'test-version'})}};
 class FileURL extends URL{static createObjectURL(blob){blobs.push(blob);return 'blob:test-'+blobs.length}static revokeObjectURL(url){revoked.push(url)}}
 const context={window,document,fetch:original,location:new URL('https://farmingseason.io/'),URL:FileURL,Request,Response,Blob,TextDecoder,Date,setTimeout:f=>(timers.push(f),timers.length),sessionStorage:{getItem:k=>{if(deny)throw Error('denied');return store.get(k)||null},setItem:(k,v)=>{if(deny)throw Error('denied');store.set(k,v)}}};vm.createContext(context);vm.runInContext(source,context);
 return {api:window.__farmBattleReport,window,context,store,calls,original,document,el,links,blobs,revoked,timers,setReply:p=>pending=p,promise:()=>pending,flush:async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate)}};
}
(async()=>{
 let b=boot();assert.equal(b.api.status().available,false);assert.equal(b.api.download(),false);const mounted=b.el('section');b.api.mount(mounted);assert.equal(mounted.children[0].children[0].disabled,true);
 const op=options(200),bytes=op.body,self={};const result=b.window.fetch.call(self,PATH,op);
 assert.equal(result,b.promise(),'observation returns the exact game promise');assert.equal(b.calls[0].self,self);assert.equal(b.calls[0].args[1],op);assert.equal(op.body,bytes,'submitted body is unchanged');
await b.flush();let record=b.api.data();assert.equal(record.kind,'battle-settlement');assert.equal(record.request.kills,200);assert.equal(record.request.stats.sig.keys,289);assert.equal(record.request.stats.sig.ivSame,95);assert.equal(record.request.dbg.drops,30);assert.equal(record.request.run,'[局标识已脱敏]');assert.equal(record.response.ok,true);assert.equal(record.responsePending,false);assert.equal(mounted.children[0].children[0].disabled,false);assert.equal(record.status,200);assert.equal(record.helperVersion,'test-version');assert.equal(b.store.size,1);assert(!JSON.stringify([...b.store]).includes('private-auth'));assert(!JSON.stringify([...b.store]).includes('private-run'));
 const exported=b.api.data();exported.request.stats.sig.keys=999;assert.equal(b.api.data().request.stats.sig.keys,289,'export copies cannot mutate the stored record');
 assert(b.api.download());assert.match(b.links[0].download,/^farming-battle-settlement-.*\.json$/);assert.equal(JSON.parse(await b.blobs[0].text()).request.kills,200);b.timers.forEach(f=>f());assert.equal(b.revoked.length,1);
 b.window.fetch(PATH,options(201));await b.flush();assert.equal(b.api.data().request.kills,201);assert.equal(b.store.size,1,'new settlement overwrites the sole stored report');
 let c=boot({store:b.store});assert.equal(c.api.data().request.kills,201,'current-tab refresh restores only the latest report');
 // Unrelated traffic and credentials must not enter the report.
 const dirty=payload(202);dirty.wallet='0x'+'a'.repeat(40);dirty.token='do-not-save';dirty.stats.sig.signature='hidden';dirty.dbg.nested={authorization:'hidden',nonce:'hidden',ok:3};
 b.setReply(Promise.resolve(response({ok:false,error:'rejected',farm:{owner:'private-owner',tokens:9000},token:'private-token'},400)));b.window.fetch(PATH+'?private=query',{method:'POST',body:JSON.stringify(dirty)});await b.flush();record=b.api.data();assert.equal(record.status,400);assert.equal(record.state,'responded');assert.equal(record.response.ok,false);assert.equal(record.request.dbg.nested.ok,3);assert(!JSON.stringify(record).includes('do-not-save'));assert(!JSON.stringify(record).includes('hidden'));assert(!JSON.stringify(record).includes('private-owner'));assert(!('farm' in record.response));assert(!JSON.stringify(record).includes('private=query'));
 const before=JSON.stringify(b.api.data());for(const [url,init]of [[PATH,{method:'GET'}],['https://elsewhere.invalid'+PATH,options(1)],['/api/farm/ops',options(1)],['/api/wallet',options(1)]])b.window.fetch(url,init);await b.flush();assert.equal(JSON.stringify(b.api.data()),before);
 // A slow old response or retry cannot overwrite a newer submission.
 let done;const slow=new Promise(r=>done=r);b.setReply(slow);b.window.fetch(PATH,options(300));b.setReply(Promise.resolve(response({ok:true,earned:99})));b.window.fetch(PATH,options(301));await b.flush();done(response({ok:false,earned:1},500));await b.flush();assert.equal(b.api.data().request.kills,301);assert.equal(b.api.data().response.earned,99);
 // Request bodies are cloned before game fetch consumes them; response body is not consumed.
 b=boot({reply:new Response(JSON.stringify({ok:true,earned:8}))});const req=new Request('https://farmingseason.io'+PATH,options(400));const nativePromise=b.window.fetch(req);const requestBody=await req.json();assert.equal(requestBody.kills,400);assert.equal((await (await nativePromise).json()).earned,8);await b.flush();assert.equal(b.api.data().request.kills,400);assert.equal(b.api.data().response.earned,8);
 // Unsupported / invalid / oversized bodies are explicit, never a false previous result.
 b.window.fetch(PATH,{method:'POST',body:'not-json'});await b.flush();assert(b.api.data().request.unavailable);
 b.window.fetch(PATH,{method:'POST',body:new Blob(['private'])});await b.flush();assert(b.api.data().request.unavailable);
 b.window.fetch(PATH,{method:'POST',body:'x'.repeat(262145)});await b.flush();assert.match(b.api.data().request.unavailable,/256KB/);
 b=boot({reply:new Response('x'.repeat(262145))});await b.window.fetch(PATH,options(500));await b.flush();assert.match(b.api.data().response.unavailable,/256KB/);
 // Network failures and unreadable response clones stay distinct.
 b=boot();const failure=new Error('network down');b.setReply(Promise.reject(failure));const failed=b.window.fetch(PATH,options(600));await assert.rejects(failed,/network down/);await b.flush();assert.equal(b.api.data().state,'failed');assert.equal(b.api.data().error,'network down');
 b=boot({reply:{status:200,clone(){throw Error('clone unavailable')}}});b.window.fetch(PATH,options(601));await b.flush();assert.equal(b.api.data().state,'responded');assert(b.api.data().response.unavailable);
 b=boot({throwFetch:failure});assert.throws(()=>b.window.fetch(PATH,options(602)),e=>e===failure);await b.flush();assert.equal(b.api.data().state,'failed');assert.equal(b.api.data().request.kills,602);
 // Denied storage falls back to one in-memory result, without blocking any request.
 b=boot({deny:true});b.window.fetch(PATH,options(700));await b.flush();assert.equal(b.api.data().request.kills,700);assert.equal(b.api.status().storageOK,false);
 // Reinstallation/removal restores fetch and ignores stale async completions.
 b=boot();let later;const inFlight=new Promise(r=>later=r);b.setReply(inFlight);b.window.fetch(PATH,options(800));b.api.remove();assert.equal(b.window.fetch,b.original);later(response({ok:true}));await b.flush();assert.equal(b.store.size,1);
 vm.runInContext(source,b.context);assert.equal(b.window.__farmBattleReport.data().response,null,'removed observer did not persist late response');
 // The compatibility switch and settlement observer have independent lifecycles.
 b=boot();b.api.remove();const local=new Map();b.context.localStorage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)};
 vm.runInContext(fs.readFileSync('src/compatibility.js','utf8'),b.context);vm.runInContext(source,b.context);
 b.window.__farmCompatibility.setEnabled(false);b.window.fetch(PATH,options(900));await b.flush();assert.equal(b.window.__farmBattleReport.data().request.kills,900);assert.equal(b.calls.length,1,'one game submission, no replay or extra network request');
 b.window.__farmBattleReport.remove();b.window.__farmCompatibility.remove();assert.equal(b.window.fetch,b.original,'nested observers restore the original game fetch in cleanup order');
 console.log('PASS: latest-only settlement capture, unchanged fetch/request/response, stats/dbg export, redaction, bounded bodies, reload, race/failure handling, download and cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
