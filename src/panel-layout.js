/* Compact pages; switching pages never changes feature switches. */
(() => {
  const previous=window.__farmLayout?.status()||window.__farmHandoff?.layout;window.__farmLayout?.remove();
  const panel=document.getElementById('farm-compact-controls');if(!panel)return;
  document.getElementById('farm-verification-notice')?.remove();
  const original=[...panel.children],originalStyle=panel.getAttribute('style');
  const title=original[0],farm=document.getElementById('farm-auto-controls');
  const rows=original.filter(n=>n!==title&&n!==farm&&n.querySelector?.('button[aria-pressed]'));
  const goal=original.find(n=>n.tagName==='FORM'),footer=original.at(-1);
  const detail=original.find(n=>n!==title&&n!==farm&&n!==goal&&n!==footer&&!rows.includes(n));
  if(!title||rows.length!==1||!goal)return;
  const style=document.createElement('style');style.id='farm-helper-layout-style';
  style.textContent=`
#farm-compact-controls{position:fixed;right:12px;top:168px;width:268px;max-width:calc(100vw - 24px);max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;padding:12px;background:#16271d;color:#e6eee6;border:1px solid #42604b;border-radius:8px;font:12px/1.5 'PingFang SC','Microsoft YaHei',sans-serif;box-shadow:0 4px 16px #10201440;z-index:2147483647}
#farm-compact-controls [hidden]{display:none!important}
#farm-compact-controls .fh-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;cursor:grab;touch-action:none;user-select:none}
#farm-compact-controls .fh-head.fh-dragging{cursor:grabbing}
#farm-compact-controls .fh-head:focus-visible{outline:2px solid #e7d29d;outline-offset:3px}
#farm-compact-controls .fh-head>div{margin:0!important;font-size:12px!important;font-weight:650}
#farm-compact-controls button{font-family:inherit;cursor:pointer}
#farm-compact-controls .fh-version{margin-left:7px;font-size:10px;font-weight:400;color:#a6bcae;white-space:nowrap}
#farm-compact-controls .fh-fold{padding:2px 0;border:0;background:none;color:#abc2af;font-size:11px}
#farm-compact-controls .fh-tabs{display:flex;gap:3px;padding-bottom:8px;margin-bottom:10px;border-bottom:1px solid #42604b}
#farm-compact-controls .fh-tab{flex:1;padding:5px 4px;border:0;border-radius:4px;background:none;color:#abc2af;font-size:12px}
#farm-compact-controls .fh-tab[aria-selected=true]{background:#c7dfb8;color:#213721;font-weight:600}
#farm-compact-controls .fh-option{display:flex!important;align-items:center;justify-content:flex-start!important;gap:7px!important;margin:10px 0 0!important;font-size:12px!important}
#farm-compact-controls input[type=checkbox]{margin:0;width:13px;height:13px;accent-color:#b9d4a9;flex:none}
#farm-compact-controls .fh-number{display:flex!important;align-items:center;justify-content:space-between!important;gap:10px;margin-top:9px!important;font-size:11px!important}
#farm-compact-controls input[type=number]{width:76px!important;box-sizing:border-box;padding:3px 5px;font-size:11px;line-height:1.5;font-family:inherit;color:#e6eee6;background:#20382a;border:1px solid #63846b;border-radius:4px}
#farm-compact-controls select{width:100%;margin-top:8px;min-height:29px;padding:4px 6px;background:#20382a;color:#e6eee6;border:1px solid #63846b;border-radius:4px;font-size:11px;font-family:inherit}
#farm-compact-controls .fh-note{margin:4px 0 10px;color:#abc2af;font-size:10px;overflow-wrap:anywhere}
#farm-compact-controls details{border-top:1px solid #42604b;margin-top:12px;padding-top:9px}
#farm-compact-controls summary{font-size:11px;color:#abc2af;cursor:pointer}
#farm-compact-controls .fh-empty{font-size:11px;color:#abc2af;padding:4px 0 10px}
#farm-compact-controls .fh-battle-controls[hidden]+.fh-stats{display:none}
#farm-compact-controls .fh-stats>div{border:0!important;padding:5px 0 0!important;margin:0!important;font-size:10px!important;color:#abc2af!important}
#farm-compact-controls .fh-task-state{border-top:1px solid #42604b;padding-top:8px;margin:12px 0 0;font-size:10px;color:#c7d9c9;overflow-wrap:anywhere}
#farm-compact-controls .fh-execution{margin-top:16px;padding:12px;background:#0d1b14;border:1px solid #304738;border-radius:7px;box-sizing:border-box}
#farm-compact-controls .fh-execution-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:#a3bca9}
#farm-compact-controls .fh-execution-label{letter-spacing:.04em}
#farm-compact-controls .fh-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 6px;border-radius:4px;background:#26382e;color:#c0d0c4;font-size:10px;line-height:1.5;white-space:nowrap}
#farm-compact-controls [data-status=running] .fh-badge{background:#293d24;color:#d5e8c2}
#farm-compact-controls [data-status=waiting] .fh-badge{background:#3b3422;color:#e7d49d}
#farm-compact-controls [data-status=error] .fh-badge{background:#442c25;color:#f0baa5}
#farm-compact-controls .fh-current{margin:10px 0 6px;color:#e3eee2;font-size:12px;line-height:1.5;font-weight:600;overflow-wrap:anywhere}
#farm-compact-controls .fh-dot{width:6px;height:6px;border-radius:50%;background:#a7b9ac;flex:none}
#farm-compact-controls [data-status=running] .fh-dot{background:#bed99f}
#farm-compact-controls [data-status=waiting] .fh-dot{background:#e2cc90}
#farm-compact-controls [data-status=error] .fh-dot{background:#eeae96}
#farm-compact-controls .fh-execution p{font-size:10px;line-height:1.6;margin:5px 0;color:#b8ccbc;overflow-wrap:anywhere}
#farm-compact-controls .fh-execution .fh-next{color:#dce9d8;margin-top:7px}
#farm-compact-controls .fh-execution details{border:0;margin-top:12px;padding-top:0}
#farm-compact-controls .fh-execution summary{color:#adc8b4;font-size:10px}
#farm-compact-controls .fh-execution .fh-materials{color:#91ad99;margin-top:8px}
#farm-compact-controls .fh-overview{display:grid;grid-template-columns:40px 1fr;gap:5px 8px;font-size:10px;margin:9px 0;color:#b8ccbc}
#farm-compact-controls .fh-overview dt{color:#deeadb}
#farm-compact-controls .fh-overview dd{margin:0;overflow-wrap:anywhere}
#farm-compact-controls .fh-log{max-height:142px;overflow:auto;margin:8px 0 0;padding:0;list-style:none;font-size:10px;color:#b8ccbc}
#farm-compact-controls .fh-log li{padding:4px 0;border-bottom:1px solid #2b4333;overflow-wrap:anywhere}
#farm-compact-controls .fh-log time{color:#8fa995;margin-right:6px;font-variant-numeric:tabular-nums}
#farm-compact-controls .fh-mini{font-size:10px;color:#c7d9c9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px}
#farm-compact-controls .fh-recheck{margin-top:6px;background:#c7dfb8;color:#213721;border:0;border-radius:4px;padding:4px 7px;font-size:11px}
#farm-compact-controls .fh-footer{margin-top:9px!important;font-size:10px!important;color:#abc2af!important}
#farm-compact-controls :is(button,input,select):focus-visible{outline:2px solid #e7d29d;outline-offset:2px}
#farm-compact-controls #farm-earnings-controls{font-size:11px;font-variant-numeric:tabular-nums}
#farm-compact-controls .fh-earnings-stamp{font-size:10px;color:#91ad99;margin:0 0 12px}
#farm-compact-controls .fh-earnings-group{margin:0}
#farm-compact-controls .fh-earnings-group h3{font-size:11px;font-weight:600;margin:0;color:#dbe7d7}
#farm-compact-controls .fh-earnings-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
#farm-compact-controls .fh-earnings-overall{font-size:10px;color:#abc2af}
#farm-compact-controls .fh-earnings-overall[data-full=true]{color:#b9d4a9}
#farm-compact-controls .fh-earnings-summary{display:grid;grid-template-columns:60px minmax(0,1fr) minmax(0,96px);align-items:baseline;gap:4px;padding:6px 0;color:#dbe7dc}
#farm-compact-controls .fh-earnings-summary>span:nth-child(2){text-align:right;font-variant-numeric:tabular-nums}
#farm-compact-controls .fh-earnings-summary>span:last-child{text-align:right;font-size:10px;color:#9db7a5;overflow-wrap:anywhere}
#farm-compact-controls .fh-earnings-summary[data-full=true]>span:last-child{color:#b9d4a9}
#farm-compact-controls .fh-earnings-summary[data-urgent=true]>span:last-child{color:#e2cc90}
#farm-compact-controls .fh-earnings-row{margin:0 0 8px}
#farm-compact-controls .fh-earnings-line{display:flex;justify-content:space-between;align-items:baseline;gap:8px;color:#c5d7c8;overflow-wrap:anywhere}
#farm-compact-controls .fh-earnings-line>span:last-child{text-align:right}
#farm-compact-controls .fh-earnings-note{font-size:10px;line-height:1.5;color:#9db7a5;margin:4px 0 0}
#farm-compact-controls .fh-earnings-reset{margin-top:8px;white-space:pre-line}
#farm-compact-controls .fh-earnings-stock{margin-top:16px}
#farm-compact-controls .fh-earnings-stock h3{margin-bottom:8px}
#farm-compact-controls .fh-earnings-bar{height:3px;border-radius:2px;background:#304b39;overflow:hidden;margin:0 0 4px}
#farm-compact-controls .fh-earnings-bar i{display:block;height:100%;width:0;background:#aacb92}
#farm-compact-controls .fh-earnings-details{border:0;margin:8px 0 0;padding:0}
#farm-compact-controls .fh-earnings-details>summary{font-size:10px;color:#9db7a5;cursor:pointer;padding:4px 0}
#farm-compact-controls .fh-earnings-details>div{padding:8px 0 4px}
#farm-compact-controls .fh-earnings-warning{font-size:10px;line-height:1.5;color:#e2cc90;margin:12px 0 0}
#farm-compact-controls .fh-execution-compact{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;margin-top:12px;border:1px solid #35513e;border-radius:6px;background:#0e2117;color:#bfd3c4;font-size:10px;text-align:left}
#farm-compact-controls .fh-execution-compact>span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#farm-compact-controls .fh-execution-compact::after{content:'展开';color:#91ad99;flex-shrink:0}
#farm-compact-controls .fh-execution-compact[aria-expanded=true]::after{content:'收起'}
#farm-compact-controls [hidden]{display:none!important}

`;
  document.head.append(style);panel.removeAttribute('style');
  const make=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el};
  const version=make('span');version.className='fh-version';const currentVersion=window.__farmLauncher?.status?.().version;version.textContent=currentVersion?'v'+currentVersion:'';version.setAttribute('aria-label',currentVersion?'助手版本 '+currentVersion:'');title.append(version);
  const head=make('div');head.className='fh-head';const fold=make('button');fold.className='fh-fold';fold.type='button';fold.setAttribute('aria-label','收起或展开助手');head.append(title,fold);
  const body=make('div'),tabs=make('div');tabs.className='fh-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','助手功能');
  const pages={},buttons={},labels={battle:'战斗',field:'田地',animal:'动物',workshop:'作坊',daily:'日常',earnings:'收益'};
  for(const [id,name]of Object.entries(labels)){
    const tab=make('button',name),page=make('div');tab.type='button';tab.className='fh-tab';tab.id='farm-helper-tab-'+id;tab.setAttribute('role','tab');page.id='farm-helper-'+id+'-page';page.setAttribute('role','tabpanel');page.setAttribute('aria-labelledby',tab.id);tab.setAttribute('aria-controls',page.id);pages[id]=page;buttons[id]=tab;tabs.append(tab);
  }
  const empty=make('div','状态读取模式需要通过扩展启动。');empty.className='fh-empty';
  const battle=make('div');battle.className='fh-battle-controls';const waveNote=make('p','保留正常受伤与死亡；状态不可用时暂停输入。页面可见时失焦继续；页面隐藏或游戏暂停时停止输入；Esc 关闭自动战斗；结算确认后无操作5秒回村庄。');waveNote.className='fh-note';battle.append(...rows,waveNote,goal);pages.battle.append(empty,battle);
  if(detail){const stats=make('details');stats.className='fh-stats';stats.append(make('summary','战斗状态'),detail);pages.battle.append(stats)}
  if(farm)pages.field.append(farm);
  const automation=window.__farmAutomation;
  if(automation){pages.animal.append(automation.sections.animal);pages.workshop.append(automation.sections.workshop);pages.daily.append(automation.sections.daily)}
  window.__farmEarnings?.mount(pages.earnings);
  footer.classList.add('fh-footer');const task=make('div'),mini=make('div');mini.className='fh-mini';body.append(tabs,...Object.values(pages),task,footer);panel.replaceChildren(head,body,mini);
  const execution=make('section');execution.className='fh-execution';execution.setAttribute('aria-label','助手执行状态');
  const statusHead=make('div');statusHead.className='fh-execution-head';statusHead.setAttribute('role','status');statusHead.setAttribute('aria-live','polite');
  const label=make('span','运行状态');label.className='fh-execution-label';const badge=make('span');badge.className='fh-badge';
  const dot=make('span');dot.className='fh-dot';dot.setAttribute('aria-hidden','true');const statusText=make('span');badge.append(dot,statusText);statusHead.append(label,badge);
  const current=make('div');current.className='fh-current';
  const reason=make('p'),materials=make('p'),next=make('p');materials.className='fh-materials';next.className='fh-next';
  const executionDetails=make('details'),executionSummary=make('summary','执行详情'),overview=make('dl'),log=make('ol');overview.className='fh-overview';log.className='fh-log';log.setAttribute('aria-label','最近执行记录');
  const logLabel=make('p','最近记录 · 最多 20 条，本次页面有效');executionDetails.append(executionSummary,overview,logLabel,log);
  execution.append(statusHead,current,reason,materials,next,executionDetails);
  const compactExecution=make('button'),compactText=make('span');compactExecution.type='button';compactExecution.className='fh-execution-compact';compactExecution.append(compactText);compactExecution.hidden=true;task.append(compactExecution,execution);
  let earningsExecutionExpanded=false;compactExecution.onclick=()=>{earningsExecutionExpanded=!earningsExecutionExpanded;render()};
  let lastView='',lastLog='',lastPhase='';
  let tab=previous?.tab||'field',collapsed=previous?.collapsed||false;
  let position=previous?.position,drag=null;
  if(!position)try{position=JSON.parse(localStorage.getItem('farm-helper.ui-position'))}catch{}
  if(!Number.isFinite(position?.x)||!Number.isFinite(position?.y))position={x:window.innerWidth-280,y:168};
  function place(next=position){
    const box=panel.getBoundingClientRect(),margin=8;
    position={x:Math.round(Math.max(margin,Math.min(next.x,window.innerWidth-box.width-margin))),y:Math.round(Math.max(margin,Math.min(next.y,window.innerHeight-box.height-margin)))};
    panel.style.left=position.x+'px';panel.style.right='auto';panel.style.top=position.y+'px';
  }
  function savePosition(){try{localStorage.setItem('farm-helper.ui-position',JSON.stringify(position))}catch{}}
  head.tabIndex=0;head.title='拖动移动；聚焦后方向键微调，Home 恢复默认位置';head.setAttribute('aria-label','移动农场助手：可拖动，或用方向键调整位置，Home 恢复默认');
  head.onpointerdown=e=>{
    if(e.button!==0||e.target.closest('button,input,select,textarea,a')||drag)return;
    e.preventDefault();e.stopPropagation();place();drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:{...position}};
    head.setPointerCapture(e.pointerId);head.classList.add('fh-dragging');
  };
  head.onpointermove=e=>{if(drag?.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();place({x:drag.start.x+e.clientX-drag.x,y:drag.start.y+e.clientY-drag.y})};
  function endDrag(e){if(drag?.id!==e.pointerId)return;e.stopPropagation();if(e.type==='pointercancel')place(drag.start);drag=null;head.classList.remove('fh-dragging');if(head.hasPointerCapture(e.pointerId))head.releasePointerCapture(e.pointerId);savePosition()}
  head.onpointerup=endDrag;head.onpointercancel=endDrag;head.onlostpointercapture=e=>{if(drag?.id===e.pointerId){drag=null;head.classList.remove('fh-dragging');savePosition()}};
  head.onkeydown=e=>{
    if(e.target!==head||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();const step=e.shiftKey?30:10;
    place(e.key==='Home'?{x:window.innerWidth-280,y:168}:{x:position.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),y:position.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)});savePosition();
  };
  const onResize=()=>place();window.addEventListener('resize',onResize);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>place()):null;observer?.observe(panel);
  if(!previous)try{tab=localStorage.getItem('farm-helper.ui-tab')||'field'}catch{}
  if(!(tab in pages))tab='field';
  const gameBattle=()=>{const root=document.getElementById('battle-ui');return !!root&&!root.hidden&&!!root.getClientRects().length&&getComputedStyle(root).display!=='none'};
  function show(id,save=true){if(id==='battle'&&!gameBattle())id='field';if(!(id in pages))return;if(tab!==id)earningsExecutionExpanded=false;tab=id;window.__farmEarnings?.setVisible(id==='earnings'&&!collapsed);for(const k of Object.keys(pages)){pages[k].hidden=k!==id;buttons[k].setAttribute('aria-selected',String(k===id));buttons[k].tabIndex=k===id?0:-1}place();if(save)try{localStorage.setItem('farm-helper.ui-tab',id)}catch{}}
  for(const id of Object.keys(pages))buttons[id].onclick=()=>show(id);
  tabs.onkeydown=e=>{const ids=Object.keys(pages).filter(id=>!buttons[id].hidden);if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();show(e.key==='Home'?ids[0]:e.key==='End'?ids.at(-1):ids[(ids.indexOf(tab)+(e.key==='ArrowRight'?1:ids.length-1))%ids.length]);buttons[tab].focus()}};
  function folding(){window.__farmEarnings?.setVisible(tab==='earnings'&&!collapsed);body.hidden=collapsed;mini.hidden=!collapsed;fold.textContent=collapsed?'展开':'收起';fold.setAttribute('aria-expanded',String(!collapsed));window.__farmVersionGuard?.paint();place()}
  fold.onclick=()=>{collapsed=!collapsed;folding()};
  let wasOnBattlePage=null,lastFarmTab=tab==='battle'?'field':tab;
  function render(){
    const onBattlePage=gameBattle();buttons.battle.hidden=!onBattlePage;
    if(onBattlePage&&wasOnBattlePage!==true)show('battle',false);
    if(!onBattlePage&&tab==='battle')show(lastFarmTab,false);
    if(!onBattlePage)lastFarmTab=tab;wasOnBattlePage=onBattlePage;
    const ready=!!window.__farmCombat;empty.hidden=ready;battle.hidden=!ready;
    let view=automation?.execution?.()||{status:'idle',title:'等待助手加载',reason:'',items:[],next:'',rows:[]};
    const visual=window.__farmCombat?.status?.();
    if(onBattlePage&&(visual?.enabled||visual?.selecting||(tab==='battle'&&(visual?.phase==='error'||visual?.goldGoal?.triggered)))){
      view={status:visual.selecting?'waiting':visual.phase==='error'?'error':visual.phase==='running'?'running':'waiting',title:'战斗 · 生存优先',reason:visual.selecting?visual.perkMessage:visual.message||'等待状态',items:['怪物 '+(visual.enemies||0)+'（入场 '+(visual.entering||0)+' · 隐身 '+(visual.hiddenEnemies||0)+'） · 弹道 '+(visual.projectiles||0),'风暴 '+(visual.casts||0)+' 次 · 闪避 '+(visual.dodges||0)+' 次 · 已选升级 '+(visual.choices||0)+' 次'],next:visual.selecting?'升级随机等待 1.1～3.5 秒，按原优先级选择':'正常受伤；请保持游戏页面可见，Esc 停止',rows:[{label:'状态',text:visual.recognized?'玩家状态正常 · 控制耗时 '+(visual.frameMs||0)+'ms':'等待有效状态'},{label:'策略',text:visual.riskLevel==='survive'?'优先生存':'等待判断'},{label:'效率',text:(visual.killsPerMinute==null?'统计中':visual.killsPerMinute+' 击杀/分')+' · 受击 '+(visual.hits||0)+' 次'},{label:'移动',text:'赶路闪避 '+(visual.travelDodges||0)+' 次 · 脱困 '+(visual.unsticks||0)+' 次'}]};
    }
    if(onBattlePage&&visual?.goldGoal){const g=visual.goldGoal;view.rows.push({label:'本局金币',text:g.earned+' / '+(g.target??'读取中')});if(g.triggered){view.status='idle';view.title='战斗目标已达成';view.reason=g.message;view.next='已停止自动战斗，不会自动再次开局'}}
    const returning=window.__farmCombatReturn?.status?.();
    if(onBattlePage&&returning&&['waiting','countdown','returning','cancelled','error'].includes(returning.phase))view={status:returning.phase==='error'?'error':returning.phase==='cancelled'?'paused':'waiting',title:'战斗结束',reason:returning.message,items:[],next:'操作后重新等待5秒；Esc 取消本局自动返回。回村庄后农务按原开关继续。',rows:[]};
    if(window.__farmVersionGuard?.isBlocked()){const v=window.__farmVersionGuard.status();view={status:'paused',title:'游戏版本保护',reason:v.message,items:[],next:v.detail,rows:[]}}
    const phase=view.status+':'+view.title+':'+view.reason.replace(/\d+/g,'#');
    if(phase!==lastPhase){if(['error','paused'].includes(view.status))window.__farmActivity?.add(view.status,view.reason);lastPhase=phase}
    const statusNames={running:'执行中',waiting:'等待',paused:'暂停',error:'异常',idle:'未开启'};
    const heading=(statusNames[view.status]||'等待')+' · '+view.title;
    const compact=tab==='earnings'&&view.status!=='error';
    compactExecution.hidden=!compact;compactExecution.setAttribute('aria-expanded',String(earningsExecutionExpanded));compactExecution.setAttribute('aria-label','运行状态：'+heading+'，'+(earningsExecutionExpanded?'收起详情':'展开详情'));compactText.textContent=heading;execution.hidden=compact&&!earningsExecutionExpanded;
    const signature=JSON.stringify(view);
    if(signature!==lastView){
      execution.dataset.status=view.status;statusText.textContent=statusNames[view.status]||'等待';current.textContent=view.title;reason.textContent=view.reason;materials.textContent=view.items.join('\n');materials.style.whiteSpace='pre-line';materials.hidden=!view.items.length;next.textContent=view.next;
      overview.replaceChildren(...view.rows.flatMap(row=>[make('dt',row.label),make('dd',row.text)]));
      mini.textContent=heading;mini.title=view.reason;lastView=signature;
    }
    const entries=window.__farmActivity?.entries()||[],logKey=JSON.stringify(entries);
    if(logKey!==lastLog){log.replaceChildren(...(entries.length?entries.map(entry=>{const li=make('li'),time=make('time',new Date(entry.at).toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}));li.append(time,document.createTextNode(entry.text));return li}):[make('li','暂无执行记录；只记录动作结果和重要状态变化。')]));lastLog=logKey}
    window.__farmVersionGuard?.paint();
  }
  function mountTask(state,recheck){state.hidden=true;if(state.parentElement!==task)task.append(state,recheck)}
  if(automation)mountTask(automation.state,automation.recheck);
  window.__farmVersionGuard?.mount({panel,title,body,mini,isCollapsed:()=>collapsed});
  const timer=setInterval(render,500);show(tab,false);folding();render();
  const oldRemove=window.__farmCompact.remove;
  function remove(){window.__farmEarnings?.setVisible(false);clearInterval(timer);observer?.disconnect();window.removeEventListener('resize',onResize);head.onpointerdown=head.onpointermove=head.onpointerup=head.onpointercancel=head.onlostpointercapture=head.onkeydown=null;drag=null;version.remove();style.remove();panel.replaceChildren(...original);if(originalStyle!==null)panel.setAttribute('style',originalStyle);else panel.removeAttribute('style');if(window.__farmCompact?.remove===combined)window.__farmCompact.remove=oldRemove;delete window.__farmLayout}
  function combined(){remove();oldRemove()}
  window.__farmCompact.remove=combined;window.__farmLayout={show,mountTask,status:()=>({tab,collapsed,position:{...position}}),remove};
  return '已分为战斗、田地、动物、作坊、日常、收益';
})();
