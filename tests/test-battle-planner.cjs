const assert=require('node:assert/strict'),P=require('../src/battle-planner.js');
const base=()=>({phase:'wave',wave:5,player:{x:368,y:310,hp:100,maxHp:100,speed:92,reach:30,damage:3,attackEvery:.42,attackCd:0,dodgeT:-1,stormT:-1},enemies:[],projectiles:[],hazards:[],bounds:{x0:42,y0:164,x1:694,y1:462}});
const enemy=(id,x,y,more={})=>({id,x,y,hp:30,radius:12,name:'goblin',brain:'melee',state:'chase',speed:30,hittable:true,...more});
const options={ready:{dodge:true,storm:false}};
const velocity=keys=>{const x=+keys.includes('ArrowRight')-+keys.includes('ArrowLeft'),y=+keys.includes('ArrowDown')-+keys.includes('ArrowUp'),len=Math.hypot(x,y)||1;return {x:x/len,y:y/len}};
let f=base();f.enemies=[enemy(1,580,310)];let a=P.plan(f,options);assert.equal(a.intent,'travel');assert(a.keys.includes('Space'));
f.player.hp=40;a=P.plan(f,options);assert(a.keys.includes('ArrowRight'));assert(!a.keys.includes('Space'),'low-health safe travel keeps dodge available');
f=base();f.enemies=[enemy(1,400,310,{name:'baby',brain:'hopper',radius:5,hp:2,speed:50})];a=P.plan(f,options);assert(a.danger);assert(!a.keys.includes('Space'));assert(a.keys.includes('ArrowLeft'),'walk away from a baby instead of using escape cooldown');
f=base();f.player.hp=35;f.enemies=[enemy(1,380,310,{name:'bomber',state:'fuse',t:.55})];a=P.plan(f,options);assert(a.keys.includes('Space'),'reserving cooldown must never prevent emergency blast evasion');assert(a.keys.includes('ArrowLeft'));assert.match(a.message,/炸弹/);
// Short cooldown preservation is conditional on an actually safe walking route.
f=base();f.enemies=[enemy(1,430,270),enemy(2,440,310),enemy(3,430,350),enemy(4,470,310)];a=P.plan(f,options);assert(a.danger);assert(!a.keys.includes('Space'),'a dense group with an open walking exit does not consume dodge');assert(velocity(a.keys).x<=0,'leave the denser side instead of charging through the group');
f=base();f.player.y=215;f.enemies=[enemy(1,368,190,{boss:true,name:'minotaur',radius:18}),enemy(2,340,210),enemy(3,396,208),enemy(4,368,175,{name:'archer',brain:'archer'})];
a=P.plan(f,options);assert(a.keys.includes('ArrowDown'));assert(!a.keys.includes('ArrowUp'));assert.match(a.message,/门口/);
for(let i=0;i<24;i++){
 const step=P.plan(f,{skills:false}),v=velocity(step.keys);f.player.x+=v.x*92*.06;f.player.y+=v.y*92*.06;
 assert(f.player.y>=215,'walking retreat never goes deeper into a crowded birth corridor');
}assert(f.player.y>260,'a crowded gate does not hold the player at the top');
f=base();f.enemies=[enemy(1,410,310,{boss:true,name:'minotaur',hp:200,radius:18}),enemy(2,380,280),enemy(3,315,310,{name:'archer',brain:'archer'}),enemy(4,400,350)];a=P.plan(f,options);assert.equal(a.targetId,3,'reachable ranged threat can preempt a nearby healthy boss');assert(a.keys.includes('ArrowLeft'),'maintain an escape away from the boss side');
f=base();f.enemies=[enemy(1,410,310,{boss:true,name:'minotaur',radius:18}),enemy(2,470,310,{name:'archer',brain:'archer'}),enemy(3,300,310)];a=P.plan(f,options);assert.equal(a.targetId,3,'do not cross the boss to chase a distant shooter');
f=base();f.enemies=[enemy(1,404,310,{hp:3,state:'idle',speed:0})];a=P.plan(f,options);assert.deepEqual(a.keys,[],'ordinary safe melee still holds and attacks');
f=base();f.enemies=[enemy(1,400,310,{name:'ghost',brain:'ghost',state:'chase',phased:true,hittable:false})];assert.equal(P.plan(f,options).intent,'track');f.enemies[0]={...f.enemies[0],state:'appear',t:.3,lock:{x:368,y:310}};assert(P.plan(f,options).danger,'ghost reappearance stays in hazard prediction');
f=base();f.enemies=[enemy(1,368,148,{state:'enter',lock:{x:368,y:200}})];a=P.plan(f,options);assert.equal(a.intent,'intercept');assert(a.keys.includes('ArrowUp'));assert(!a.keys.includes('Space'));f.player.y=198;assert(P.plan(f,options).keys.includes('ArrowDown'),'ordinary entrant also reserves the landing corridor');
f=base();f.phase='break';const xs=[];
for(let i=0;i<10;i++){let random=[(i+.5)/10,.5];const point=P.pickRally(f,()=>random.shift()??.5);assert(P.safeRally(f,point));xs.push(point.x)}assert.equal(new Set(xs).size,10,'waiting points cover a continuous region');
const point={x:330,y:250};f.player={...f.player,...point};assert.deepEqual(P.plan(f,{rallyPoint:point}).keys,[]);f.hazards=[{x:368,y:254,radius:180,eta:.2}];assert.equal(P.pickRally(f,()=>.5),null,'never choose a known dangerous rally point');
f=base();f.player.x=150;f.player.y=250;f.enemies=[enemy(1,50,170)];a=P.plan(f,{skills:false});assert(a.keys.includes('ArrowLeft')&&a.keys.includes('ArrowUp'),'legal corners remain approachable');
f=base();f.enemies=[enemy(1,404,310,{hp:3,state:'idle',speed:0})];f.projectiles=[{x:310,y:304,vx:175,vy:0,kind:'arrow'}];a=P.plan(f,options);assert(a.danger);assert(a.keys.some(k=>k.startsWith('Arrow')),'incoming arrows override holding for an attack');
f=base();f.player.stormRadius=95;f.enemies=[enemy(1,430,310),enemy(2,368,390)];f.projectiles=[{x:310,y:304,vx:175,vy:0,kind:'arrow'}];a=P.plan(f,{ready:{dodge:false,storm:true}});assert(a.danger);assert(!a.keys.includes('KeyE'),'do not slow an evaluated walking escape by starting storm');
// Actual archer timings: early aim tracks until .5/.4s, release at .74/.6s.
const archer=()=>{const g=base();g.wave=9;g.enemies=[enemy(1,480,310,{hp:4,radius:7,speed:38,name:'archer',brain:'archer',state:'windup',t:.2,hitDone:false,lock:{x:368,y:306}})];return g};
const walkingOnly={ready:{dodge:false,storm:false}};
f=archer();a=P.plan(f,walkingOnly);assert.deepEqual(a.keys,['ArrowRight'],'close distance while the early aiming line is still tracking');
f.enemies[0].t=.65;a=P.plan(f,walkingOnly);assert(a.keys.includes('ArrowRight'),'locked aim should not force a purely sideways retreat');assert(a.keys.includes('ArrowUp')||a.keys.includes('ArrowDown'),'approach off the locked firing line');
// Independent time sampling checks that the chosen approach clears the actual arrow.
let v=velocity(a.keys),nearest=Infinity;const ar=f.enemies[0],delay=.74-ar.t,dx=ar.lock.x-ar.x,dy=ar.lock.y-(ar.y-8),length=Math.hypot(dx,dy);
for(let t=delay;t<=.9;t+=.001){const x=ar.x+dx/length*175*(t-delay),y=ar.y-8+dy/length*175*(t-delay);nearest=Math.min(nearest,Math.hypot(f.player.x+v.x*92*t-x,f.player.y-6+v.y*92*t-y))}assert(nearest>6,'diagonal approach avoids the game arrow hit radius');
f=archer();f.wave=10;f.enemies[0].t=.45;a=P.plan(f,walkingOnly);assert(a.keys.includes('ArrowUp')||a.keys.includes('ArrowDown'),'wave10 faster lock is already a shooting threat');assert(P.threats(f).some(z=>Math.abs(z.eta-.15)<1e-8),'wave10 release countdown uses .6, not .74');
f=archer();f.enemies[0].hitDone=true;f.enemies[0].t=.8;f.projectiles=[{x:350,y:304,vx:-175,vy:0,kind:'arrow'}];a=P.plan(f,walkingOnly);assert.deepEqual(a.keys,['ArrowRight'],'an already-passed arrow and cleared aim do not prevent closing');
f=archer();f.enemies[0].state='chase';f.enemies[0].x=580;f.projectiles=[{x:300,y:100,vx:175,vy:0,kind:'arrow'}];assert.equal(P.plan(f,options).intent,'travel','an unrelated nearby arrow cannot disable every travel dash');
f=archer();f.enemies[0].state='chase';f.projectiles=[{x:300,y:304,vx:175,vy:0,kind:'arrow'},{x:368,y:240,vx:0,vy:175,kind:'arrow'}];a=P.plan(f,walkingOnly);assert(a.danger);v=velocity(a.keys);nearest=Infinity;
for(let t=0;t<=.8;t+=.001)for(const q of f.projectiles)nearest=Math.min(nearest,Math.hypot(f.player.x+v.x*92*t-q.x-q.vx*t,f.player.y-6+v.y*92*t-q.y-q.vy*t));assert(nearest>6,'real crossing arrows still get a safe walking escape');
console.log('PASS: mixed boss/minion priorities, reachable shooters, crowded-gate retreat, low-HP/density travel reservations, emergency blast dodge, walking baby escape, ordinary attacks, ghost/entry tracking, continuous safe rally and corner access');

console.log('PASS: archer tracking/lock/release phases, wave10 timing, advancing off the firing line, passed/unrelated arrows and independent crossing-trajectory safety checks');
