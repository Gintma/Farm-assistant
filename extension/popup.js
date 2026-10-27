const status=document.getElementById('status');
const auto=document.getElementById('auto');
chrome.runtime.sendMessage({operation:'get-auto'}).then(result=>auto.checked=!!result?.enabled).catch(()=>{});
auto.onchange=async()=>{try{const result=await chrome.runtime.sendMessage({operation:'set-auto',enabled:auto.checked});status.textContent=result?.ok?(auto.checked?'已启用刷新后自动显示':'已关闭自动显示'):result?.message||'设置失败'}catch(e){status.textContent=e.message}};
for(const operation of ['start','remove'])document.getElementById(operation).onclick=async()=>{
  const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  status.textContent=operation==='start'?'正在加载……':'正在移除……';
  try{const result=await chrome.runtime.sendMessage({operation});status.textContent=result?.ok?result.message:result?.message||'启动失败，请重试';if(result?.ok)auto.checked=operation==='start';}
  catch(e){status.textContent='操作失败：'+e.message}
  finally{buttons.forEach(b=>b.disabled=false);void refreshCapture()}
};

const captureStatus=document.getElementById('capture-status');
async function refreshCapture(){
  const r=await chrome.runtime.sendMessage({operation:'capture-status'});
  const kind=r.kind==='assistant-test'?'助手测试':r.kind==='manual-baseline'?'手动对照':'';
  captureStatus.textContent=(r.active?'正在记录':'未在记录')+(kind?' · '+kind:'')+' · '+(r.count||0)+' 条'+(r.reason?' · '+r.reason:'');
  document.getElementById('capture-start').disabled=!!r.active;
  document.getElementById('capture-assistant').disabled=!!r.active;
  document.getElementById('capture-stop').disabled=!r.active;
  document.getElementById('capture-export').disabled=!!r.active||!r.count;
  document.getElementById('capture-clear').disabled=!!r.active;
}
let captureBusy=false;
for(const name of ['start','assistant','stop','export','clear'])document.getElementById('capture-'+name).onclick=async()=>{
  if(captureBusy)return;captureBusy=true;
  try{
    const r=await chrome.runtime.sendMessage({operation:'capture-'+(name==='assistant'?'start':name),...(['start','assistant'].includes(name)?{kind:name==='assistant'?'assistant-test':'manual-baseline'}:{})});
    if(!r?.ok)throw Error(r?.message||'记录操作失败');
    if(name==='export'&&r.data){
      const url=URL.createObjectURL(new Blob([JSON.stringify(r.data,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='farming-'+(r.data.kind==='assistant-test'?'assistant-test':'manual-baseline')+'-'+new Date(r.data.startedAt).toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }
    await refreshCapture();if(r.message)captureStatus.textContent=r.message;
  }catch(e){captureStatus.textContent=e.message}
  finally{captureBusy=false}
};
void refreshCapture();
