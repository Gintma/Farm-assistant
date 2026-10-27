/* Read-only earnings page. No actions, account writes or window navigation. */
(() => {
  if(window.__farmEarnings)return;
  const R=window.__farmRules,W=window.__farmWorkshop;
  const dayMs=86400000,battleLimits=[0,.55,1.28,2.93,6.6,14.67];
  const number=n=>Number.isFinite(n)?n.toLocaleString('zh-CN',{maximumFractionDigits:0}):'等待数据';
  const duration=ms=>{if(!Number.isFinite(ms))return '等待数据';const m=Math.max(1,Math.ceil(ms/60000));return m>=60?Math.floor(m/60)+'小时'+(m%60?m%60+'分':''):m+'分钟'};
  const meter=(earned,cap)=>({earned,cap,left:Math.max(0,cap-earned),pct:cap>0?Math.min(100,Math.max(0,earned/cap*100)):0});
  function model(d,now=d.now,budget=null,live=null){
    const f=d.farm,q=R.quote(d),cal=R.calendar(f,now),sameDay=cal.day===f.today.day;
    const today=R.calendar(f,d.now);
    const villageDaily=q.pay(q.l.passive)*q.bonus,villageCap=villageDaily*2;
    const villageStored=Number.isFinite(f.passiveSince)?Math.min(villageCap,Math.max(0,(f.passiveBank||0)+villageDaily*Math.max(0,now-f.passiveSince)/dayMs)):null;
    const battleCap=q.pay(battleLimits[f.level]),battleEarned=f.today.battleEarned;
    const active=live&&Number.isFinite(live.earned)&&live.cap>0;
    const harvest=sameDay?meter(f.today.harvestEarned,q.cap):null;
    const battle=sameDay&&(active||Number.isFinite(battleEarned))?meter(active?live.earned:battleEarned,active?live.cap:battleCap):null;
    const orders=f.orders?meter(f.orders.day===W.orderDay({...d,now})?f.orders.dayTokens||0:0,W.orderCap(d)):null;
    const mine=f.structures.find(s=>s.kind==='mine'),oil=f.structures.find(s=>s.kind==='oilwell');
    let mining={text:'未建矿场'};
    if(mine){
      if(!R.built(mine,now))mining={text:'建设中 · '+duration(mine.buildUntil-now)};
      else{
        const end=mine.buildUntil||0;let start=mine.mineAt??end;
        if(start>now||(end<start&&Number.isFinite(mine.buildStart)&&Math.abs(start-(mine.buildStart+14400000))<1000))start=end;
        start=Math.max(start,end);
        if(start>0){const elapsed=Math.max(0,now-start),carts=Math.min(2,Math.floor(elapsed/21600000));mining={text:carts+' / 2 车 · '+(carts===2?'已满，暂停生产':'下车约 '+duration(21600000-elapsed%21600000)),carts}}
        else mining={text:'等待矿场生产时间'};
      }
    }
    const oilText=!oil?'未建油井':!R.built(oil,now)?'建设中 · '+duration(oil.buildUntil-now):oil.collectDay===cal.day?'今日已抽取 · '+duration(cal.nextMidnight-now)+'后重置':'今日可抽取';
    const goods=f.goods,inventory=goods?['gold','silver','oil'].map((k,i)=>['金','银','油'][i]+' '+(Number.isFinite(goods[k])?goods[k].toLocaleString('zh-CN',{maximumFractionDigits:2}):'—')).join(' · '):'资源库存：等待数据';
    return {harvest,battle,rewardMult:q.rewardMult,rewardMultKnown:q.rewardMultKnown,carry:f.harvestCarry||0,carryCap:q.base*7,feedSpent:f.today.feedSpent||0,nftCapBonus:q.nftCapBonus,nftYieldBonus:q.nftYieldBonus,reset:cal.nextMidnight,sameDay,
      village:{stored:villageStored,cap:villageCap,hourly:villageDaily/24,fullIn:Number.isFinite(villageStored)&&villageDaily>0?(villageCap-villageStored)/villageDaily*dayMs:null},
      mining,oilText,inventory,orders,budget,orderReset:W.orderReset({...d,now}),
      day:today.day};
  }
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
  const root=el('section');root.id='farm-earnings-controls';root.setAttribute('aria-label','收益进度');
  const stamp=el('p','打开此页后读取收益数据');stamp.className='fh-earnings-stamp';root.append(stamp);
  const payoutLine=el('p','奖励发放比例：等待服务器数据');payoutLine.className='fh-earnings-note';root.append(payoutLine);
  const today=el('section'),todayHead=el('div'),todayTitle=el('h3','今日额度'),overall=el('span'),todayBody=el('div'),resetLine=el('p');
  today.className='fh-earnings-group';todayHead.className='fh-earnings-heading';overall.className='fh-earnings-overall';resetLine.className='fh-earnings-note fh-earnings-reset';todayHead.append(todayTitle,overall);today.append(todayHead,todayBody,resetLine);root.append(today);
  function disclosure(label){const box=el('details'),summary=el('summary',label),body=el('div');box.className='fh-earnings-details';box.append(summary,body);return {box,body}}
  const quota=disclosure('查看额度明细');root.append(quota.box);
  const stockSection=el('section'),stockHeading=el('h3','待收库存'),stockBody=el('div');stockSection.className='fh-earnings-group fh-earnings-stock';stockSection.append(stockHeading,stockBody);root.append(stockSection);
  const resources=disclosure('资源库存与生产时间');root.append(resources.box);
  const budgetNotice=el('p');budgetNotice.className='fh-earnings-warning';budgetNotice.hidden=true;root.append(budgetNotice);
  let shown=false,removed=false,busy=false,data=null,receivedAt=-Infinity,lastTry=-Infinity,budget=null,budgetAt=-Infinity,error='',budgetError='',controller=null,lastView='';
  function textLine(parent,label,value,sub){const row=el('div');row.className='fh-earnings-row';const line=el('div');line.className='fh-earnings-line';line.append(el('span',label),el('span',value));row.append(line);if(sub){const n=el('p',sub);n.className='fh-earnings-note';row.append(n)}parent.append(row)}
  function summaryRow(parent,label,amount,state,full=false){const row=el('div');row.className='fh-earnings-summary';row.dataset.full=String(full);row.append(el('span',label),el('span',amount),el('span',state));parent.append(row);return row}
  function progress(parent,label,value){
    const full=!!value&&value.cap>0&&value.left===0;
    summaryRow(parent,label,value?number(value.earned):'—',!value?'读取中':full?'✓ 已满':'还可得 '+number(value.left),full);
    if(!value||full)return;
    const bar=el('div');bar.className='fh-earnings-bar';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label',label+'今日额度');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');
    bar.setAttribute('aria-valuenow',String(Math.floor(value.pct)));bar.setAttribute('aria-valuetext',number(value.earned)+' / '+number(value.cap)+'，还可得 '+number(value.left));
    const fill=el('i');fill.style.width=value.pct+'%';bar.append(fill);parent.append(bar);
  }
  function render(){
    if(!shown||removed)return;
    const age=performance.now()-receivedAt,now=data?data.now+Math.max(0,age):Date.now();
    const scene=(window.__farmGame||window.temp1)?.scene?.scenes.find(s=>s.sys.settings.key==='battle');
    const goal=scene?.run?.active&&!scene.tut?window.__farmCombatGoal?.status?.():null;
    const live=Number.isFinite(goal?.cap)&&Number.isFinite(goal?.dailyBeforeRun)&&Number.isFinite(goal?.earned)?{cap:goal.cap,earned:goal.dailyBeforeRun+goal.earned}:null;
    let view=null;try{if(data)view=model(data,now,budget&&new Date(now-Math.max(0,performance.now()-budgetAt)).toISOString().slice(0,10)===new Date(now).toISOString().slice(0,10)?budget:null,live)}catch{}
    payoutLine.textContent=!view?'奖励发放比例：等待服务器数据':view.rewardMultKnown?'当前奖励发放比例 '+(view.rewardMult*100).toLocaleString('zh-CN',{maximumFractionDigits:2})+'% · 已计入收益与基础额度':'发放比例未返回 · 暂按100%估算，暂停自动购买能量';
    const ageText=Number.isFinite(age)?age<60000?'刚刚更新':Math.floor(age/60000)+'分钟前更新':'等待数据';
    const status=window.__farmVerification?.isBlocked()?'等待人工验证，暂停读取':document.hidden?'页面在后台，暂停读取':error?'读取失败，保留上次数据':view&&!view.sameDay?'跨日了，等待重新读取':age>=60000&&data?'数据已过期':'额度自动更新';
    stamp.textContent=status==='额度自动更新'?ageText:status+' · '+ageText;
    const key=JSON.stringify({view,budgetError});if(key===lastView)return;lastView=key;
    todayBody.replaceChildren();quota.body.replaceChildren();stockBody.replaceChildren();resources.body.replaceChildren();
    const metrics=[['收获',view?.harvest],['战斗',view?.battle],['作坊订单',view?.orders]];
    const complete=metrics.every(([,v])=>v&&v.cap>0&&v.left===0);
    overall.textContent=complete?'均已满额':metrics.some(([,v])=>!v)?'等待读取':'尚有可获额度';overall.dataset.full=String(complete);
    for(const [label,value]of metrics){progress(todayBody,label,value);textLine(quota.body,label,value?number(value.earned)+' / '+number(value.cap):'等待数据')}
    const periods=el('p','收获、战斗按农场当地午夜重置；订单按 UTC 00:00（北京时间08:00）刷新。');periods.className='fh-earnings-note';quota.body.append(periods);
    resetLine.textContent=view?'收获/战斗 '+duration(view.reset-now)+'后重置\n作坊订单 '+duration(view.orderReset-now)+'后重置':'等待农场日期';
    if(view){
      textLine(quota.body,'结转库存',number(view.carry)+' / '+number(view.carryCap));
      if(view.nftCapBonus>1)textLine(quota.body,'NFT质押收获额度','+'+Math.round((view.nftCapBonus-1)*100)+'%');
      if(view.nftYieldBonus>1)textLine(quota.body,'NFT质押产出加成','+'+Math.round((view.nftYieldBonus-1)*100)+'%');
      if(view.feedSpent>0)textLine(quota.body,'饲料增加额度','+'+number(view.feedSpent));
    }
    const shared=el('p','收获额度由作物、果园、动物及钓鱼共用。奖励发放比例不降低购买价格；计价或比例变化会调整当前上限，已得超过上限不表示仍可继续领取。');shared.className='fh-earnings-note';quota.body.append(shared);
    const v=view?.village;
    const villageRow=summaryRow(stockBody,'村庄收入',v?number(v.stored):'—',v?v.fullIn===0?'满仓待领':'持续累积':'读取中');if(villageRow&&v?.fullIn===0)villageRow.dataset.urgent='true';
    const carts=view?.mining.carts;
    const mineRow=summaryRow(stockBody,'矿场',Number.isFinite(carts)?carts+'/2车':'—',Number.isFinite(carts)?carts===2?'已满待收':carts===1?'等两车收取':'采集中':view?.mining.text||'读取中');if(mineRow&&carts===2)mineRow.dataset.urgent='true';
    summaryRow(stockBody,'油井','',view?.oilText.split(' · ')[0]||'读取中');
    textLine(resources.body,'村庄仓库',v?number(v.stored)+' / '+number(v.cap):'等待数据',v?'约 +'+number(v.hourly)+'/小时 · '+(v.fullIn===0?'已满仓，停止累积':duration(v.fullIn)+'后满仓'):null);
    textLine(resources.body,'矿场',view?.mining.text||'等待数据');textLine(resources.body,'油井',view?.oilText||'等待数据');
    const inventory=el('p',view?view.inventory+'（矿油额度独立）':'等待资源数据');inventory.className='fh-earnings-note';resources.body.append(inventory);
    const globalBudget=view?.budget;
    textLine(quota.body,'全服每日订单预算',globalBudget?.left===0?'已耗尽，仅星星':Number.isFinite(globalBudget?.left)?'剩余 '+number(globalBudget.left):'等待数据',budgetError||null);
    budgetNotice.hidden=globalBudget?.left!==0&&!budgetError;
    budgetNotice.textContent=globalBudget?.left===0?'全服订单金币预算已耗尽；订单仍可获得星星。':budgetError;

  }
  function syncCached(){
    const cached=window.__farmAutomation?.readSnapshot?.();
    if(cached?.data&&cached.ageMs<performance.now()-receivedAt){data=cached.data;receivedAt=performance.now()-cached.ageMs;error=''}
    if(cached?.budget&&cached.budgetAgeMs<performance.now()-budgetAt){budget=cached.budget;budgetAt=performance.now()-cached.budgetAgeMs;budgetError=''}
  }
  async function refresh(){
    if(!shown||removed)return;syncCached();render();
    if(window.__farmVersionGuard?.isBlocked()||busy||document.hidden||window.__farmVerification?.isBlocked())return;
    const t=performance.now();if(t-lastTry<30000)return;
    const farmDue=!data||t-receivedAt>=30000,budgetDue=!budget||t-budgetAt>=30000;
    if(!farmDue&&!budgetDue)return;
    busy=true;lastTry=t;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),10000);
    try{
      if(farmDue){
        const response=await fetch('/api/farm',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('农场读取失败');
        const d=await response.json();
        if(!d.farm||d.owner!==d.farm.owner||d.access?.open!==true||!Array.isArray(d.farm.structures)||!Number.isFinite(d.now))throw Error('等待本人农场数据');
        R.quote(d);if(removed)return;
        if(data&&data.owner!==d.owner){budget=null;budgetAt=-Infinity}
        data=d;receivedAt=performance.now();error='';
      }
      if(budgetDue){
        try{
          const result=await W.readBudget(data.owner,data.now+Math.max(0,performance.now()-receivedAt),controller.signal);
          if(removed)return;budget=result.budget;budgetAt=performance.now()-result.ageMs;budgetError='';
        }catch{budgetError='预算读取失败，稍后重试'}
      }
    }catch(e){error=e.message}
    finally{clearTimeout(timeout);busy=false;render()}
  }
  const timer=setInterval(()=>void refresh(),5000);
  window.__farmEarnings={pauseForVersion:()=>controller?.abort(),model,mount:parent=>parent.append(root),setVisible:v=>{shown=!!v;if(shown)void refresh()},status:()=>({shown,ageMs:performance.now()-receivedAt,error,budgetError}),
    remove:()=>{removed=true;clearInterval(timer);controller?.abort();root.remove();delete window.__farmEarnings}};
})();
