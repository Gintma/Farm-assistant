/* Shared compact shell; one switch controls the entire battle routine. */
(() => {
  window.__farmCompact?.remove();
  const panel=document.createElement('aside');panel.id='farm-compact-controls';
  const title=document.createElement('div');title.textContent='农场助手';panel.append(title);
  const rows=[];
  for(const [name,key]of [['自动战斗','enabled']]){
    const row=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');
    row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0';label.textContent=name;
    button.type='button';button.style.cssText='font:inherit;font-size:11px;border:1px solid #6c9479;border-radius:4px;padding:3px 10px;min-width:50px;cursor:pointer';
    button.setAttribute('aria-label',name);button.setAttribute('aria-pressed','false');button.onclick=()=>{window.__farmCombat?.set(key,!window.__farmCombat.status()[key]);render()};row.append(label,button);panel.append(row);rows.push({key,button});
  }
  window.__farmAutoFarm?.mount(panel);
  const info=document.createElement('form');info.onsubmit=e=>e.preventDefault();
  window.__farmCombatGoal?.mount(info);
  const note=document.createElement('div');note.style.cssText='font-size:10px;color:#bdd1c2;line-height:1.6';info.append(note);panel.append(info);
  const detail=document.createElement('div');detail.style.cssText='font-size:10px;color:#bdd1c2;overflow-wrap:anywhere';
  const footer=document.createElement('div');footer.textContent='Esc 停止自动操作';panel.append(detail,footer);document.body.append(panel);
  function render(){
    const s=window.__farmCombat?.status?.();
    for(const {key,button}of rows){const on=!!s?.[key];button.textContent=on?'开启':'关闭';button.style.background=on?'#badcc3':'#263c30';button.style.color=on?'#193222':'#c4d5c9';button.setAttribute('aria-pressed',String(on));button.disabled=!s}
    note.textContent='生存优先：危险先撤离，小史莱姆优先走位；安全赶路闪避。波末随机安全区域等待，升级等待 1.1～3.5 秒。手动开局，Esc 停止。';
    detail.textContent=(s?.selecting?s.perkMessage:s?.message||'等待扩展连接')+' · 目标 '+(s?.enemies??0)+' · 弹道 '+(s?.projectiles??0)+' · 风暴 '+(s?.casts??0)+' 次 · 闪避 '+(s?.dodges??0)+' 次 · 升级 '+(s?.choices??0)+' 次';
  }
  const timer=setInterval(render,250);render();
  window.__farmCompact={remove:()=>{clearInterval(timer);panel.remove();delete window.__farmCompact}};
})();
