importScripts('network-recorder.js');
const working=new Set();
const call=(target,method,params={})=>chrome.debugger.sendCommand(target,method,params);
function check(result){
  if(result?.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text||'游戏代码执行失败');
  return result?.result;
}
// Locate the existing game when the updated bundle no longer exports global Phaser.
// Inspect only the game's own DOM listener module and the public Game-constructor binding.
async function bindModuleGame(target){
  await call(target,'Debugger.enable');
  try{
    for(const selector of ['#zoom-ui','#game canvas']){
      const node=check(await call(target,'Runtime.evaluate',{expression:'document.querySelector('+JSON.stringify(selector)+')',objectGroup:'farm-helper'}));
      if(!node?.objectId)continue;
      const {listeners=[]}=await call(target,'DOMDebugger.getEventListeners',{objectId:node.objectId});
      for(const listener of listeners){
        if(!['click','webglcontextlost'].includes(listener.type)||!listener.scriptId)continue;
        const source=await call(target,'Debugger.getScriptSource',{scriptId:listener.scriptId});
        const names=[...new Set([...source.scriptSource.matchAll(/(?:var|let|const)\s+([\w$]+)\s*=\s*new\s+[\w$.]+\.Game\s*\(/g)].map(m=>m[1]))];
        if(!names.length)continue;
        const handler=listener.originalHandler||listener.handler;if(!handler?.objectId)continue;
        const properties=await call(target,'Runtime.getProperties',{objectId:handler.objectId,ownProperties:true});
        const scopes=properties.internalProperties?.find(p=>p.name==='[[Scopes]]')?.value;
        if(!scopes?.objectId)continue;
        const scopeList=await call(target,'Runtime.getProperties',{objectId:scopes.objectId,ownProperties:true});
        for(const entry of scopeList.result||[]){
          if(!entry.value?.objectId||!/^Module(?:\s|$)/.test(entry.value.description||''))continue;
          const module=await call(target,'Runtime.getProperties',{objectId:entry.value.objectId,ownProperties:true});
          for(const name of names){
            const candidate=module.result?.find(p=>p.name===name)?.value;
            if(!candidate?.objectId)continue;
            const bound=check(await call(target,'Runtime.callFunctionOn',{
              objectId:candidate.objectId,
              functionDeclaration:'function(){if(!this.canvas?.isConnected||!this.canvas.closest("#game")||this.canvas!==document.querySelector("#game canvas")||!this.scene?.scenes||!this.scene.scenes.some(s=>s.sys?.settings?.key==="farm"))return false;window.__farmGame=this;return true}',
              returnByValue:true,objectGroup:'farm-helper'
            }));
            if(bound?.value===true)return true;
          }
        }
      }
    }
    return false;
  }finally{await call(target,'Debugger.disable').catch(()=>{});}
}
async function perform(operation, tabOverride=null){
  if(!['start','remove'].includes(operation))throw Error('不支持的操作');
  if(globalThis.FarmManualRecorder?.isActive())throw Error('正在记录测试，请先停止记录');
  const tab=tabOverride||(await chrome.tabs.query({active:true,currentWindow:true}))[0];
  let url;try{url=new URL(tab?.url)}catch{throw Error('请先切到 Farming Season 游戏标签页')}
  if(url.protocol!=='https:'||url.hostname!=='farmingseason.io')throw Error('请先切到 farmingseason.io 游戏标签页');
  if(working.has(tab.id))throw Error('正在处理，请稍候');working.add(tab.id);
  const target={tabId:tab.id};let attached=false;
  try{
    await chrome.debugger.attach(target,'1.3');attached=true;
    const origin=check(await call(target,'Runtime.evaluate',{expression:'location.origin',returnByValue:true}));
    if(origin?.value!=='https://farmingseason.io')throw Error('页面已变化，已取消');
    if(operation==='remove'){
      check(await call(target,'Runtime.evaluate',{expression:'window.__farmLauncher?.remove();',returnByValue:true}));
      return {ok:true,message:'已移除助手，恢复正常游戏控制。'};
    }
    const state=check(await call(target,'Runtime.evaluate',{
      expression:'({existing:!!window.__farmLauncher,prototype:typeof Phaser!=="undefined"?Phaser.Game?.prototype:null})',objectGroup:'farm-helper'
    }));
    if(!state?.objectId)throw Error('游戏尚未加载，请等加载完成后重试');
    const properties=await call(target,'Runtime.getProperties',{objectId:state.objectId,ownProperties:true});
    const existing=properties.result.find(x=>x.name==='existing')?.value?.value;
    if(!existing){
      const prototype=properties.result.find(x=>x.name==='prototype')?.value;
      if(!prototype?.objectId){
        if(!await bindModuleGame(target))throw Error('未找到当前游戏实例，请等游戏加载完成后重试');
      }else{
      const found=await call(target,'Runtime.queryObjects',{prototypeObjectId:prototype.objectId,objectGroup:'farm-helper'});
      if(!found.objects?.objectId)throw Error('未找到游戏实例');
      const bound=check(await call(target,'Runtime.callFunctionOn',{
        objectId:found.objects.objectId,
        functionDeclaration:'function(){const games=this.filter(g=>g.canvas?.isConnected&&g.canvas?.closest("#game")&&g.scene);if(games.length!==1)throw Error("游戏实例数量不匹配，请等页面加载完成");window.__farmGame=games[0];return true}',
        returnByValue:true
      }));
      if(!bound?.value)throw Error('游戏绑定失败');
      }
    }
    const source=await (await fetch(chrome.runtime.getURL('launcher.js'))).text();
    check(await call(target,'Runtime.evaluate',{expression:source,returnByValue:true}));
    return {ok:true,message:'助手已开启。在田地、动物、作坊、日常页勾选功能；花金币需先设置预算。'};
  }finally{
    if(attached){await call(target,'Runtime.releaseObjectGroup',{objectGroup:'farm-helper'}).catch(()=>{});await chrome.debugger.detach(target).catch(()=>{});}
    working.delete(tab.id);
  }
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  const content=!!sender.tab;
  if(content){
    if(message.operation!=='auto-start'||sender.frameId!==0||!sender.url?.startsWith('https://farmingseason.io/'))return;
    (async()=>{
      if(globalThis.FarmManualRecorder?.isActive())return {ok:true,disabled:true};
      if((await chrome.storage.local.get('autoStart')).autoStart===false)return {ok:true,disabled:true};
      const tab=await chrome.tabs.get(sender.tab.id);
      // The content script proves this tab is on the permitted site; recheck again after attaching.
      return perform('start',{...tab,url:sender.url});
    })().then(reply).catch(error=>reply({ok:false,message:error.message}));
    return true;
  }
  (async()=>{
    if(message.operation?.startsWith('capture-')){
      const method={'capture-start':'start','capture-stop':'stop','capture-status':'status','capture-export':'export','capture-clear':'clear'}[message.operation];
      if(!method)throw Error('不支持的记录操作');return method==='start'?FarmManualRecorder.start({kind:message.kind||'manual-baseline'}):FarmManualRecorder[method]();
    }
    if(message.operation==='get-auto')return {ok:true,enabled:(await chrome.storage.local.get('autoStart')).autoStart!==false};
    if(message.operation==='set-auto'){
      if(typeof message.enabled!=='boolean')throw Error('设置无效');
      await chrome.storage.local.set({autoStart:message.enabled});return {ok:true};
    }
    if(message.operation==='start')await chrome.storage.local.set({autoStart:true});
    if(message.operation==='remove')await chrome.storage.local.set({autoStart:false});
    return perform(message.operation);
  })().then(reply).catch(error=>reply({ok:false,message:'操作失败：'+error.message+'。如已打开开发者工具，请先关闭再试。'}));
  return true;
});
