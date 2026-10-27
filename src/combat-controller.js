/* Page-local input adapter. Uses existing Phaser keys and scene skill entry points. */
(() => {
  window.__farmBattleInput?.remove();
  const names={ArrowLeft:'LEFT',ArrowRight:'RIGHT',ArrowUp:'UP',ArrowDown:'DOWN'};
  const held=new Map();
  let lease=null;
  function event(){return {timeStamp:performance.now(),altKey:false,ctrlKey:false,shiftKey:false,metaKey:false,location:0}}
  function release(){
    clearTimeout(lease);lease=null;
    for(const key of held.keys())try{key.onUp(event())}catch{}
    held.clear();
  }
  function apply(scene,action){
    if(window.__farmManualCapture||window.__farmVersionGuard?.isBlocked('battle')||scene.mode!=='play'||scene.paused||scene.hero?.dead||!(scene.run?.active||scene.tut)){release();return {casts:0,dodges:0}}
    const wanted=new Set(action.keys.filter(k=>names[k]).map(k=>scene.keys?.[names[k]]));
    if(wanted.has(undefined)||[...wanted].some(k=>typeof k.onDown!=='function'||typeof k.onUp!=='function'))throw Error('游戏输入结构已变化，请关闭自动战斗');
    for(const key of held.keys())if(!wanted.has(key)){key.onUp(event());held.delete(key)}
    for(const key of wanted)if(!held.has(key)){
      // Do not take ownership of a key already held by the player.
      if(key.isDown)continue;
      held.set(key,true);key.onDown(event());
    }
    clearTimeout(lease);lease=setTimeout(release,350);
    let casts=0,dodges=0;
    if(action.keys.includes('KeyE')){
      if(typeof scene.doStorm!=='function')throw Error('风暴入口已变化');
      const before=scene.hero.stormT;scene.doStorm();casts=before<0&&scene.hero.stormT>=0?1:0;
    }else if(action.keys.includes('Space')){
      if(typeof scene.doDodge!=='function')throw Error('闪避入口已变化');
      const before=scene.hero.dodgeT;scene.doDodge();dodges=before<0&&scene.hero.dodgeT>=0?1:0;
    }
    return {casts,dodges};
  }
  window.__farmBattleInput={apply,release,remove:()=>{release();delete window.__farmBattleInput}};
})();
