const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync('src/version-guard.js','utf8'),origin='https://farmingseason.io';
const game=n=>origin+'/assets/game-'+n+'.js',helper=n=>origin+'/assets/vt323-latin-400-normal-'+n+'.js';
function build(n='aaaaaaaa',v='one',extra=''){
 return new Map([[game(n),'import {a} from "./vt323-latin-400-normal-'+n+'.js";import "./custom.js";const x=1;'+extra],[helper(n),'var e=e=>/^(data|blob):|\\?/.test(e)?e:`${e}?v='+v+'`;export {e as a};'],[origin+'/assets/custom.js','export const rules=1;']]);
}
async function boot({store=new Map(),files=build(),loaded=game('aaaaaaaa'),page=1,review=()=>false}={}){
 let current=files,root=[...files.keys()][0],ticks=[],listeners={},releases=0,compatBlocked=false;const calls=[];
 const element=tag=>({tagName:tag,children:[],style:{},textContent:'',hidden:false,setAttribute(){},append(...xs){this.children.push(...xs)},insertBefore(n,ref){const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,n)},contains(){return false},focus(){},remove(){this.removed=true}});
 const document={hidden:false,querySelectorAll:()=>[{src:loaded}],createElement:element,addEventListener:(k,v)=>listeners[k]=v,removeEventListener(){}};
 const window={__farmBattleInput:{release:()=>releases++},__farmCompatibility:{equivalent:(a,b)=>review(a,b),isBlocked:scope=>compatBlocked&&scope==='market',status:()=>({storageOK:true,issues:compatBlocked?[{scope:'market',label:'市场采购',reason:'报价格式变化'}]:[]}),subscribe:f=>{listeners.compat=f;return()=>{}}},addEventListener:(k,v)=>listeners[k]=v,removeEventListener(){}};
 const context={window,document,location:new URL(origin+'/'),performance:{timeOrigin:page,getEntriesByType:()=>[]},crypto:webcrypto,TextEncoder,TextDecoder,URL,AbortController,setTimeout:()=>1,clearTimeout(){},setInterval:f=>(ticks.push(f),ticks.length),clearInterval(){},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},DOMParser:class{parseFromString(){return {querySelectorAll:()=>[{getAttribute:k=>k==='src'?root:null}]}}},fetch:async url=>{calls.push(url);if(url===origin+'/')return {ok:true,text:async()=>'<script></script>'};const s=current.get(url);if(s===undefined)throw Error('not found '+url);return {ok:true,headers:{get:()=> 'text/javascript'},arrayBuffer:async()=>new TextEncoder().encode(s).buffer}}};
 vm.runInNewContext(source,context);const api=window.__farmVersionGuard;await api.check();
 return {api,store,calls,element,window,document,update:next=>{current=next;root=[...next.keys()][0]},review:f=>review=f,compat:v=>{compatBlocked=v;listeners.compat()},releaseCount:()=>releases};
}
(async()=>{
 let b=await boot();assert(b.api.isBlocked('farm'));assert.equal(b.api.status().phase,'review');assert.equal(b.api.status().refreshRequired,false);assert(await b.api.approve());assert(!b.api.isBlocked('farm'));
 const approved=JSON.parse(b.store.get('farm-helper.game-version.v1')).approved;assert.equal(approved.files.length,3);
 const cached=build('bbbbbbbb','two');b.update(cached);assert(await b.api.check());assert.equal(b.api.status().cacheOnly,true);assert(!b.api.status().refreshRequired,'audited cache-only changes need not refresh a still-compatible page');assert.equal(JSON.parse(b.store.get('farm-helper.game-version.v1')).approved.fingerprint,approved.fingerprint,'raw baseline is preserved');
 b.update(build('cccccccc','three','const additionalLogic=1;'));assert.equal(await b.api.check(),false);assert(b.api.isBlocked('farm'));assert.equal(b.api.status().refreshRequired,true);assert.equal(await b.api.approve(),false,'same stale page cannot approve new logic');assert(b.releaseCount()>0);
 const pendingStore=b.store;b.api.remove();b=await boot({store:pendingStore,files:build('cccccccc','three','const additionalLogic=1;'),loaded:game('cccccccc'),page:2});assert.equal(b.api.status().refreshRequired,false);assert(await b.api.approve());assert(!b.api.isBlocked('farm'));
 b.compat(true);assert(!b.api.isBlocked('farm'));assert(b.api.isBlocked('market'));
 const panel=b.element('div'),title=b.element('div'),body=b.element('div'),mini=b.element('div');panel.append(title,body,mini);b.api.mount({panel,title,body,mini,isCollapsed:()=>false});assert.equal(body.inert,false,'scoped protocol issue leaves unrelated controls usable');assert.equal(body.hidden,false);assert(panel.children.some(n=>n.id==='farm-compatibility-notice'&&!n.hidden));b.api.remove();
 // An explicitly reviewed cosmetic pair can release a pending update without
 // approving unrelated files. The raw catalog matcher has separate tests.
 b=await boot();await b.api.approve();const oldFiles=JSON.parse(b.store.get('farm-helper.game-version.v1')).approved.files;
 const cosmetic=build('dddddddd','four','const reviewedCopy="withdrawal help";');b.update(cosmetic);await b.api.check();assert(b.api.isBlocked('farm'));
 b.review((a,r)=>a.files.length===r.files.length&&a.files.every(f=>f.url.endsWith('custom.js')?r.files.some(n=>n.url===f.url&&n.hash===f.hash):oldFiles.some(n=>n.url===f.url&&n.hash===f.hash)));
 assert(await b.api.check());assert.equal(b.api.status().textOnly,true);const record=JSON.parse(b.store.get('farm-helper.game-version.v1'));assert.equal(record.approved.reviewedLogicals.length,1);assert.equal(record.pending,null);
 b.review(()=>false);b.update(build('eeeeeeee','five','const reviewedCopy="withdrawal help";'));assert(await b.api.check());assert.equal(b.api.status().cacheOnly,true,'future cache rollover retains an already reviewed logical digest');
 const changed=build('ffffffff','six','const reviewedCopy="withdrawal help";');changed.set(origin+'/assets/custom.js','export const rules=2;');b.update(changed);assert.equal(await b.api.check(),false,'changed economic rules are not a cache update');b.api.remove();
 console.log('PASS: first baseline confirmation, cache-only pass, unknown logic pause and stale-page restriction, scoped notice, audited cosmetic migration and subsequent cache rollover');
})().catch(e=>{console.error(e);process.exitCode=1});
