/* Independent visible-button selection; never needs a debugger or game instance. */
(() => {
  window.__farmCombatPerks?.remove();
  let signature='',since=0,delay=0,clicked=false,choices=0,message='等待升级卡片';
  const visible=e=>!!e&&!e.hidden&&!!e.getClientRects().length&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
  function reset(){signature='';since=0;delay=0;clicked=false}
  function rank(b){
    const t=b.textContent.toLowerCase(),id=b.dataset.perk;
    if(id==='haste'||/attack (frequency|speed)|attack.*(faster|more often)|攻击频率|攻速/.test(t))return 1;
    if(id==='blade'||/hit damage|命中伤害|攻击伤害/.test(t))return 2;
    if(id==='reach'||/attack (range|reach)|sword.*(range|reach)|攻击范围|挥刀范围/.test(t))return 3;
    if(id==='swift'||/movement speed|移动速度/.test(t))return 4;
    if(id==='crit'||/critical|crit chance|crit damage|暴击/.test(t))return 5;
    if(id==='storm'||/storm|大招|风暴/.test(t))return 6;
    if(id==='magnet'||/pull loot|pickup range|拾取.*范围/.test(t))return 7;
    if(id==='thorns'||/thorns|反伤|荆棘/.test(t))return 8;
    if(id==='guard'||/max.*(health|hp)|armor|heal|regenerat|最大生命|生命上限|回血|护甲/.test(t))return 9;
    return null;
  }
  function tick(){
    const overlay=[...document.querySelectorAll('#modal,[role="dialog"],.cf-turnstile,iframe[src*="challenges.cloudflare.com"]')].some(visible);
    if(window.__farmManualCapture||window.__farmVersionGuard?.isBlocked()||!window.__farmCombat?.status?.().enabled||!window.__farmCombat?.status?.().perks||window.__farmCombat?.status?.().manualPaused||document.hidden||!document.hasFocus()||overlay||window.__farmVerification?.isBlocked?.()){reset();message='自动选卡暂停';return}
    const root=document.getElementById('battle-ui'),screen=root?.querySelector('.bui-screen');
    const cards=visible(root)&&visible(screen)?[...root.querySelectorAll('button.perk[data-perk]')].filter(b=>visible(b)&&!b.disabled):[];
    if(!cards.length){reset();message='等待升级卡片';return}
    const sig=screen.innerText;
    if(signature!==sig){signature=sig;since=performance.now();delay=1100+Math.random()*2400;clicked=false}
    if(clicked)return;
    const remaining=delay-(performance.now()-since);
    if(remaining>0){message='等待 '+(remaining/1000).toFixed(1)+' 秒后选择升级';return}
    const valid=cards.filter(b=>!b.querySelector('.dots')||b.querySelector('.dots i.next'));
    if(!valid.length){message='没有可确认的升级选项';return}
    const score=b=>Math.max(0,...[...b.textContent.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m=>Number(m[1])));
    if(cards.every(b=>rank(b)!==null))valid.sort((a,b)=>rank(a)-rank(b)||score(b)-score(a));
    const b=valid[0];if(!visible(b)||!b.isConnected||b.disabled){reset();return}
    clicked=true;choices++;message='已选升级：'+(b.querySelector('b')?.textContent||b.dataset.perk);
    window.__farmActivity?.add('battle',message);b.click();
  }
  const timer=setInterval(tick,100);
  window.__farmCombatPerks={status:()=>({choices,message,waiting:!!signature&&!clicked}),remove:()=>{clearInterval(timer);delete window.__farmCombatPerks}};
})();
