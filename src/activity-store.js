/* In-memory execution history. No credentials, requests or combat hit streams. */
(() => {
  if(window.__farmActivity)return;
  const entries=[];
  const labels={feed:'喂养动物',collect:'收动物产出',orchard:'采摘果园',income:'领取村庄收入',mine:'收取矿车',oil:'抽取石油',harvest:'收获田地',plant:'补种田地',energy:'购买能量','fish-bait':'购买鱼饵','fish-run':'抛竿钓鱼','fish-reel':'收竿','craft-buy':'市场采购','craft-start':'作坊加工','craft-take':'收取作坊成品','craft-order':'交付订单','craft-keep':'调整产物保留','craft-wool':'收取作坊羊毛','craft-milk':'收取作坊牛奶','craft-eggs':'收取鸡蛋','craft-eat':'面包补能量'};
  function describe(job){if(!job)return '';let name=labels[job.kind]||'农务';if(job.kind==='craft-buy')name+=' · '+(window.__farmMarket?.names[job.item]||job.item)+' '+job.count+' 份 · '+job.cost+' 金币';if(job.kind==='craft-start')name=({flour:'磨粉',bread:'烤面包',butter:'制作黄油',cheese:'制作奶酪',cloth:'织布'}[job.recipe]||'作坊加工')+' '+job.count+' 批';if(job.kind==='craft-keep')name+=' · '+({egg:'鸡蛋',milk:'牛奶',wool:'羊毛'}[job.arg]||'产物')+(job.keep?'保留':'出售');if(job.kind==='fish-bait')name+=' '+job.count+' 个';if(job.kind==='fish-run')name+=' '+job.count+' 次';if(job.kind==='plant')name+=' · '+(window.__farmRules?.crops[job.crop]?.name||job.crop);if(job.kind==='craft-order')name+=' #'+(job.index+1);if(job.kind==='craft-eat')name+=' '+job.count+' 个';if(job.prep)name+=' · 次日备货';return name}
  function add(type,text){const last=entries[0];if(last?.type===type&&last.text===text)return;entries.unshift({at:Date.now(),type,text});entries.splice(20)}
  window.__farmActivity={describe,add,entries:()=>entries.map(e=>({...e})),remove:()=>{delete window.__farmActivity}};
})();
