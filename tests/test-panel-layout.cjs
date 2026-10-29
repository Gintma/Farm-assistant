const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function boot(){
 const timers=[],store=new Map(),visible=[];let folded=false,view={status:'waiting',title:'等待牛奶',reason:'还需6份牛奶',items:['牛奶 0（需6）','鸡蛋 2（需0）'],next:'下批作物约1分钟后可收',rows:[]};
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.attrs={};this.hidden=false;this.className='';this.textContent='';this.classList={add:k=>{this.className+=' '+k},remove:k=>{this.className=this.className.split(' ').filter(x=>x!==k).join(' ')},contains:k=>this.className.split(' ').includes(k)}}
  append(...nodes){for(const n of nodes){if(n?.parentElement)n.parentElement.children=n.parentElement.children.filter(x=>x!==n);if(n&&typeof n==='object')n.parentElement=this;this.children.push(n)}}
  replaceChildren(...nodes){for(const n of this.children)if(n&&typeof n==='object')n.parentElement=null;this.children=[];this.append(...nodes)}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null}
  setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]??null}removeAttribute(k){delete this.attrs[k]}
  querySelector(){return this.isCombatRow?{}:null}getClientRects(){return this.hidden?[]:[{}]}getBoundingClientRect(){return {width:268,height:400}}focus(){}
 }
 const el=t=>new Element(t),panel=el('aside'),title=el('div'),combat=el('div'),goal=el('form'),farm=el('div'),detail=el('div'),footer=el('p');combat.isCombatRow=true;goal.isCombatRow=true;panel.id='farm-compact-controls';farm.id='farm-auto-controls';title.textContent='农场助手';panel.append(title,combat,goal,farm,detail,footer);
 const battleRoot=el('div');battleRoot.hidden=true;
 const nodes=n=>[n,...n.children.filter(x=>x&&typeof x==='object').flatMap(nodes)];const document={head:el('head'),createElement:el,createTextNode:t=>t,getElementById:id=>id==='battle-ui'?battleRoot:nodes(panel).find(n=>n.id===id)||null};
 const window={innerWidth:1200,innerHeight:800,__farmLauncher:{status:()=>({version:'1.21.0'})},__farmCompact:{remove(){}},__farmAutomation:{sections:{animal:el('section'),workshop:el('section'),daily:el('section')},state:el('p'),recheck:el('button'),execution:()=>view},__farmEarnings:{mount:p=>p.append(el('section')),setVisible:v=>visible.push(v)},addEventListener(){},removeEventListener(){}};
 const context={window,document,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},setInterval:f=>(timers.push(f),timers.length),clearInterval(){},getComputedStyle:()=>({display:'block'})};vm.runInNewContext(fs.readFileSync('src/panel-layout.js','utf8'),context);
 return {api:window.__farmLayout,window,battleRoot,panel,nodes,view,visible,store,render:()=>timers.forEach(f=>f()),setView:v=>view=v};
}
const b=boot(),all=()=>b.nodes(b.panel),find=cls=>all().find(n=>n.classList.contains(cls));
const head=find('fh-head'),body=find('fh-body'),tabs=find('fh-tabs'),scroll=find('fh-scroll');assert.equal(head.parentElement,b.panel);assert.equal(tabs.parentElement,body);assert.equal(scroll.parentElement,body);assert(!b.nodes(scroll).includes(head));assert(!b.nodes(scroll).includes(tabs),'navigation stays outside scrolling content');
const materials=find('fh-materials');assert.equal(materials.parentElement.tagName,'DETAILS');assert(!materials.parentElement.open,'material counters are collapsed by default');assert.equal(find('fh-current').textContent,'等待牛奶');assert.equal(find('fh-next').textContent,'下批作物约1分钟后可收');assert.notEqual(find('fh-current').parentElement,materials.parentElement);
b.api.show('earnings');b.render();assert.equal(find('fh-execution').hidden,true);assert.equal(find('fh-execution-compact').hidden,false);assert.equal(find('fh-execution-compact').attrs['aria-expanded'],'false');find('fh-execution-compact').onclick();assert.equal(find('fh-execution').hidden,false);assert.equal(find('fh-execution-compact').attrs['aria-expanded'],'true');
b.setView({...b.view,status:'error',reason:'读取失败502'});b.render();assert.equal(find('fh-execution').hidden,false);assert.equal(find('fh-execution-compact').hidden,true,'errors stay visible');
b.api.show('animal');assert.equal(b.api.status().tab,'animal');assert.equal(b.store.get('farm-helper.ui-tab'),'animal');const fold=find('fh-fold');fold.onclick();assert.equal(body.hidden,true);assert.equal(fold.attrs['aria-expanded'],'false');fold.onclick();assert.equal(body.hidden,false);
const prior=b.api.status().position;head.onkeydown({key:'ArrowLeft',target:head,preventDefault(){},stopPropagation(){}});assert.equal(b.api.status().position.x,prior.x-10);b.api.remove();assert(!b.nodes(b.panel).some(n=>n.classList.contains('fh-head')));
console.log('PASS: fixed header/tabs outside scroll, collapsed material details, earnings status disclosure, visible errors, tab persistence, collapse/keyboard positioning and cleanup');

const d=boot(),findD=cls=>d.nodes(d.panel).find(n=>n.classList.contains(cls));
d.battleRoot.hidden=false;d.window.__farmCombat={status:()=>({enabled:false})};d.render();
assert.equal(findD('fh-battle-controls').hidden,false);assert.equal(findD('fh-stats').hidden,false);
d.window.__farmBattleReport={status:()=>({available:true})};d.battleRoot.hidden=true;d.render();
assert.equal(d.nodes(d.panel).find(n=>n.id==='farm-helper-tab-battle').hidden,false,'latest report keeps the battle tab accessible after returning to village');
d.api.show('battle');d.render();assert.equal(d.api.status().tab,'battle');assert.equal(d.nodes(d.panel).find(n=>n.id==='farm-helper-battle-page').hidden,false);
assert.equal(findD('fh-battle-controls').hidden,true);assert.equal(findD('fh-stats').hidden,true,'village report access does not show battle controls or stale combat stats');
d.window.__farmBattleReport.status=()=>({available:false});d.api.show('field');d.render();assert.equal(d.nodes(d.panel).find(n=>n.id==='farm-helper-tab-battle').hidden,true);
d.api.remove();console.log('PASS: latest settlement remains exportable in village with combat controls hidden');
