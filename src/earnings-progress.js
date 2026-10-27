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
    const credit=f.fullRate??0,paid=f.today.fullRateBonus??0;
    const fullRate={visible:window.__FS_FULLRATE__===true||f.fullRate!==undefined||f.today.fullRateBonus!==undefined,enabled:window.__FS_FULLRATE__===true,creditUsd:Number.isFinite(credit)&&credit>=0?credit:null,todayBonus:sameDay&&Number.isFinite(paid)&&paid>=0?paid:null};
    return {fullRate,reinvestDiscount:window.__FS_REINVEST__===true?.2:0,recoveryMode:window.__FS_RECOVERY__===true&&q.rewardMultKnown&&q.rewardMult<.5,harvest,battle,rewardMult:q.rewardMult,rewardMultKnown:q.rewardMultKnown,carry:f.harvestCarry||0,carryCap:q.base*7,feedSpent:f.today.feedSpent||0,nftCapBonus:q.nftCapBonus,nftYieldBonus:q.nftYieldBonus,reset:cal.nextMidnight,sameDay,
      village:{stored:villageStored,cap:villageCap,hourly:villageDaily/24,fullIn:Number.isFinite(villageStored)&&villageDaily>0?(villageCap-villageStored)/villageDaily*dayMs:null},
      mining,oilText,inventory,orders,budget,orderReset:W.orderReset({...d,now}),
      day:today.day};
  }
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
  const root=el('section');root.id='farm-earnings-controls';root.setAttribute('aria-label','今日完成情况');
  const stamp=el('p');stamp.className='fh-earnings-stamp';stamp.setAttribute('role','status');stamp.hidden=true;root.append(stamp);
  const title=el('h3','今日完成情况');title.className='fh-completion-title';root.append(title);
  const todayBody=el('div');todayBody.className='fh-completion-list';root.append(todayBody);
  const reason=el('p');reason.className='fh-earnings-warning';reason.hidden=true;root.append(reason);
  const resetLine=el('p');resetLine.className='fh-earnings-note fh-earnings-reset';root.append(resetLine);
  const details=el('details'),summary=el('summary','额度明细'),detailBody=el('div');details.className='fh-earnings-details';details.append(summary,detailBody);root.append(details);
  let shown=false,removed=false,busy=false,data=null,receivedAt=-Infinity,lastTry=-Infinity,budget=null,budgetAt=-Infinity,error='',budgetError='',controller=null,lastView='';
  function row(parent,label,value,state=''){
    const line=el('div');line.className='fh-completion-row';line.dataset.state=state;line.append(el('span',label),el('span',value));parent.append(line);return line;
  }
  function render(){
    if(!shown||removed)return;
    const age=performance.now()-receivedAt,now=data?data.now+Math.max(0,age):Date.now();
    const scene=(window.__farmGame||window.temp1)?.scene?.scenes?.find(s=>s.sys?.settings?.key==='battle');
    const goal=scene?.run?.active&&!scene.tut?window.__farmCombatGoal?.status?.():null;
    const live=Number.isFinite(goal?.cap)&&Number.isFinite(goal?.dailyBeforeRun)&&Number.isFinite(goal?.earned)?{cap:goal.cap,earned:goal.dailyBeforeRun+goal.earned}:null;
    let view=null;try{if(data)view=model(data,now,budget&&performance.now()-budgetAt<60000&&new Date(now-Math.max(0,performance.now()-budgetAt)).toISOString().slice(0,10)===new Date(now).toISOString().slice(0,10)?budget:null,live)}catch{}
    const blocked=window.__farmVersionGuard?.isBlocked('earnings');
    const valid=!!view&&view.sameDay&&age<60000&&!error&&!blocked;
    const status=blocked?'兼容性待检查':window.__farmVerification?.isBlocked()?'等待人工验证':error?'读取失败，显示上次数据':view&&!view.sameDay?'跨日了，等待读取':data&&age>=60000?'数据已过期，等待读取':!view?'正在读取完成情况':'';
    stamp.hidden=!status;stamp.textContent=status;
    const key=JSON.stringify({view,valid,status,budgetError});if(key===lastView)return;lastView=key;
    todayBody.replaceChildren();detailBody.replaceChildren();
    for(const [label,value]of [['收获',view?.harvest],['战斗',view?.battle]]){
      const full=valid&&!!value&&value.left===0;
      row(todayBody,label,!valid||!value?'等待更新':full?'已满额':'尚未满额',full?'done':'waiting');
      row(detailBody,label,value?number(value.earned)+' / '+number(value.cap):'等待数据');
    }
    const count=data&&data.farm.orders?.day===W.orderDay({...data,now})&&Array.isArray(data.farm.orders.done)?new Set(data.farm.orders.done.filter(n=>Number.isInteger(n)&&n>=0&&n<3)).size:0;
    const allowance=view?.orders?.left,globalLeft=view?.budget?.left;
    const knownBudget=Number.isFinite(globalLeft)&&!budgetError;
    const stars=valid&&count<3&&(allowance===0||knownBudget&&globalLeft===0);
    const done=valid&&count===3;
    const orderState=!valid?'等待更新':data.farm.level<2?'市政厅2级开放':!view.orders?'等待读取':done?'已完成 3/3':stars?'已完成 '+count+'/3 · 仅星星':!knownBudget?'已完成 '+count+'/3 · 奖励待确认':'已完成 '+count+'/3';
    row(todayBody,'作坊订单',orderState,done?'done':stars?'limited':'waiting');
    reason.hidden=!(stars||budgetError);
    reason.textContent=stars?(allowance===0?'账号今日订单金币额度已用完。':'全服订单金币预算已耗尽。'):budgetError;
    resetLine.textContent=valid?'收获 / 战斗：'+duration(view.reset-now)+'后重置\n作坊订单：'+duration(view.orderReset-now)+'后重置':'刷新后显示重置时间';
    row(detailBody,'订单金币',view?.orders?number(view.orders.earned)+' / '+number(view.orders.cap):'等待数据');
    if(view?.orders){row(detailBody,'账号剩余额度',number(view.orders.left));row(detailBody,'当前可获上限',knownBudget?number(Math.min(view.orders.left,globalLeft)):'等待预算确认')}
    const note=el('p','订单当前可获上限同时受账号额度和全服预算限制；实际奖励以交付时为准。');note.className='fh-earnings-note';detailBody.append(note);
  }
  function syncCached(){
    const cached=window.__farmAutomation?.readSnapshot?.();
    if(cached?.data&&cached.ageMs<performance.now()-receivedAt){data=cached.data;receivedAt=performance.now()-cached.ageMs;error=''}
    if(cached?.budget&&cached.budgetAgeMs<performance.now()-budgetAt){budget=cached.budget;budgetAt=performance.now()-cached.budgetAgeMs;budgetError=''}
  }
  async function refresh(){
    if(!shown||removed)return;syncCached();render();
    if(window.__farmVersionGuard?.isBlocked('earnings')||busy||document.hidden||window.__farmVerification?.isBlocked())return;
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
      if(budgetDue&&data.farm.level>=2&&!window.__farmVersionGuard?.isBlocked('workshop')){
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
