from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
bot = root / 'src'
ext = root / 'extension'
version = '1.24.1'
modules = [
    'battle-planner.js', 'update-catalog.js', 'compatibility.js', 'version-guard.js', 'activity-store.js',
    'verification-guard.js', 'farm-rules.js', 'workshop-rules.js',
    'market-rules.js', 'farm-automation.js', 'earnings-progress.js', 'combat-controller.js',
    'combat-input.js', 'combat-goal.js', 'combat-perks.js', 'combat-return.js',
    'compact-panel.js', 'panel-layout.js',
]
distribution = [
    'manifest.json', 'background.js', 'debugger-session.js', 'keyboard-input.js', 'launcher.js', 'network-recorder.js',
    'popup.html', 'popup.js', 'auto-start.js', '安装说明.md',
]
head = '''/* Farming Season helper __HELPER_VERSION__: original combat mechanics and unified controls. */
(() => {
  if(location.hostname!=='farmingseason.io')throw Error('请只在 Farming Season 游戏页启动');
  const temp1=window.__farmGame||window.temp1;
  if(!temp1?.scene?.scenes)throw Error('未找到游戏实例，请使用扩展启动');
  if(window.__farmLauncher?.status?.().version==='__HELPER_VERSION__')return '助手已开启，保留当前所有开关';
  const handoff={farm:window.__farmAutoFarm?.status?.(),automation:window.__farmAutomation?.status?.(),layout:window.__farmLayout?.status?.()};
  if(handoff.farm?.pending)throw Error('旧版农活尚未完成，请等队列完成后再次开启新版助手');
  window.__farmLauncher?.remove();
  // Migration only: undo legacy patches left on an already-open page, never reinstall them.
  window.__farmGoalStop?.remove();window.__farmStorm?.remove();window.__farmPerks?.remove();
  window.__farmDodge?.restore();window.__farmSeek?.restore();window.__farmInvincible?.restore();
  window.__farmHandoff=handoff;
  function cleanup(){
    window.__farmCombatReturn?.remove();window.__farmCombatGoal?.remove();window.__farmCombat?.remove();window.__farmEarnings?.remove();window.__farmVerification?.remove();window.__farmCompact?.remove();window.__farmActivity?.remove();window.__farmAutomation?.remove();window.__farmAutoFarm?.remove();window.__farmVersionGuard?.remove();window.__farmCompatibility?.remove();delete window.__farmUpdateCatalog;
  }
  window.__farmLauncher={status:()=>({installed:true,version:'__HELPER_VERSION__',farmReady:!!window.__farmAutomation}),remove:()=>{cleanup();delete window.__farmLauncher}};
  try{
'''
tail = '''
  }catch(error){cleanup();delete window.__farmLauncher;delete window.__farmHandoff;throw error}
  delete window.__farmHandoff;
  return '助手 __HELPER_VERSION__ 已开启；请查看面板中的游戏代码检查状态';
})();
'''
(root / 'dist').mkdir(exist_ok=True)
source = (head + '\n'.join((bot / name).read_text() for name in modules) + tail).replace('__HELPER_VERSION__', version)
(root / 'dist/启动助手.js').write_text(source)
(ext / 'launcher.js').write_text(source)
manifest = json.loads((ext / 'manifest.json').read_text())
manifest['version'] = version
(ext / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with zipfile.ZipFile(root / 'dist/农耕战斗助手.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in distribution:
        archive.write(ext / name, 'farming-helper-extension/' + name)
print('Built', version)
