/* Wait for the user to complete verification. Never click or solve a challenge. */
(() => {
  if(window.__farmVerification)return '验证等待已安装';
  let blocked=false,clearSince=null,episodes=0,removed=false,audio=null,notice;
  const visible=el=>{
    if(!el?.isConnected||el.hidden||!el.getClientRects().length)return false;
    for(let n=el;n&&n!==document;n=n.parentElement){
      const s=getComputedStyle(n);
      if(n.hidden||n.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;
    }
    return true;
  };
  function detected(){
    // A loaded widget alone is not a challenge: it must be visible and unverified.
    const widget=[...document.querySelectorAll('iframe[src*="challenges.cloudflare.com"],iframe[title*="Cloudflare"],iframe[title*="cloudflare"],.cf-turnstile')].filter(visible);
    for(const el of widget){
      const scope=el.closest('.cf-turnstile')||el.parentElement;
      const token=scope?.querySelector('input[name="cf-turnstile-response"]');
      if(!token?.value?.trim())return true;
    }
    return [...document.querySelectorAll('[role="dialog"],#modal,#cf-challenge-running,.cf-challenge,[id^="cf-chl-"]')].some(el=>
      visible(el)&&/你是真正的农夫吗|Verify you are human|确认您是真人|验证您是真人|验证你是真人|Checking your browser|Just a moment/i.test(el.textContent||''));
  }
  function sound(){
    try{
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      audio??=new C();if(audio.state!=='running')return;
      const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=660;g.gain.value=.08;
      o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.22);
    }catch{}
  }
  function unlock(e){
    if(!e.isTrusted)return;
    try{const C=window.AudioContext||window.webkitAudioContext;if(C){audio??=new C();if(audio.state==='suspended')void audio.resume().catch(()=>{})}}catch{}
  }
  function render(){
    const panel=document.getElementById('farm-compact-controls')||document.getElementById('farm-auto-standalone');
    if(!panel)return;
    if(!notice){notice=document.createElement('div');notice.id='farm-verification-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.style.cssText='font:11px/1.5 system-ui;color:#f3d397;border:1px solid #a58a51;background:#332e20;padding:7px 8px;border-radius:4px;margin:0 0 10px';}
    // Outside the collapsible body, and reattach when the panel is rebuilt.
    if(notice.parentElement!==panel)panel.prepend(notice);
    notice.hidden=!blocked;
    const text='等待人工验证 · 自动操作已暂停\n请完成游戏验证，通过后自动继续';
    if(blocked&&notice.textContent!==text){notice.textContent=text;notice.style.whiteSpace='pre-line'}
  }
  function check(){
    if(removed)return false;
    if(detected()){
      clearSince=null;
      if(!blocked){blocked=true;episodes++;sound()}
    }else if(blocked){
      // Hidden pages and brief DOM transitions are not proof of completion.
      if(document.hidden)clearSince=null;
      else if(clearSince===null)clearSince=performance.now();
      else if(performance.now()-clearSince>=3000){blocked=false;clearSince=null}
    }
    render();return blocked;
  }
  document.addEventListener('pointerdown',unlock,true);document.addEventListener('keydown',unlock,true);
  const timer=setInterval(check,500);
  window.__farmVerification={isBlocked:check,status:()=>({blocked,episodes,message:blocked?'等待人工验证':'验证检测正常'}),remove:()=>{
    removed=true;clearInterval(timer);notice?.remove();document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('keydown',unlock,true);audio?.close().catch(()=>{});delete window.__farmVerification;
  }};
  check();return '验证检测已开启，需由你手动完成验证';
})();
