const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
// Play Áruház-képek (store/kepek): 8 képernyőkép + kiemelt grafika, bemutató adatokkal, a valódi app oldalából.
// Futtatás: cd tests && node ../tools/aruhaz-kepek.js <munkamappa> <csalitár.json (a csalifotókkal)>
const ROOT=require('path').resolve(__dirname,'..');
const OUT=ROOT+'/store/kepek',TMP=process.argv[2],PAGE='file://'+ROOT+'/app/src/main/assets/index.html';
const F=ROOT+'/app/src/main/assets/fonts/';
const b64=f=>fs.readFileSync(F+f).toString('base64');
const FONTS=`@font-face{font-family:Fraunces;font-weight:600;src:url(data:font/woff2;base64,${b64('fraunces-latin-ext-600-normal.woff2')}) format("woff2");unicode-range:U+0100-02AF}
@font-face{font-family:Fraunces;font-weight:600;src:url(data:font/woff2;base64,${b64('fraunces-latin-600-normal.woff2')}) format("woff2");unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Figtree;font-weight:500;src:url(data:font/woff2;base64,${b64('figtree-latin-ext-500-normal.woff2')}) format("woff2");unicode-range:U+0100-02AF}
@font-face{font-family:Figtree;font-weight:500;src:url(data:font/woff2;base64,${b64('figtree-latin-500-normal.woff2')}) format("woff2");unicode-range:U+0000-00FF,U+2000-206F}`;
// ---------- demo data ----------
const P={tisza:{name:'Tisza, Csongrád',lat:46.705,lng:20.142},maros:{name:'Holt-Maros',lat:46.215,lng:20.31},koros:{name:'Körös, Kunszentmárton',lat:46.84,lng:20.29},
  duna:{name:'Duna, Ráckeve',lat:47.16,lng:18.95},tolo:{name:'Tisza-tó, Poroszló',lat:47.64,lng:20.65}};
const SP=[['b','Balin'],['c','Csuka'],['s','Süllő'],['g','Sügér'],['h','Harcsa'],['d','Domolykó']];
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;const pick=a=>a[Math.floor(rnd()*a.length)];
const lures={b:['Wobbler 7 cm','Támolygó 18 g','Popper'],c:['Gumihal 10 cm','Körforgó #4','Wobbler 11 cm'],s:['Gumihal 8 cm','Twister'],g:['Körforgó #2','Twister'],h:['Wobbler 14 cm','Gumihal 15 cm'],d:['Popper','Körforgó #1']};
const size={b:[38,62],c:[48,82],s:[40,62],g:[16,28],h:[70,140],d:[24,40]};
function mk(id,sp,d,h,mi,place,o={}){const at=new Date(Date.UTC(2026,d[0]-1,d[1],h-2,mi));const [a,z]=size[sp];
  return{id,sp,at:at.toISOString(),y:2026,t:true,l:Math.round(a+rnd()*(z-a)),lure:pick(lures[sp]),place:P[place],kept:rnd()<.3,
    wx:{key:'x',temp:Math.round(10+rnd()*16),p:Math.round(1008+rnd()*14),dp:Math.round((rnd()*3-2)*10)/10,ws:Math.round(4+rnd()*16),wd:Math.round(rnd()*360),cc:Math.round(rnd()*100),code:pick([0,1,2,3]),rain:0},...o}}
const spring=[mk('a1','c',[1,11],10,20,'tisza'),mk('a2','c',[1,25],15,40,'koros'),mk('a3','c',[4,4],7,10,'maros'),mk('a4','g',[4,12],17,30,'maros'),
  mk('a5','c',[4,18],6,40,'tisza',{l:74,w:3.4}),mk('a6','g',[4,19],18,5,'koros'),mk('a7','c',[4,22],19,15,'maros')];
const year=[...spring];let k=0;
[[5,'b',8],[6,'b',7],[6,'h',2],[7,'b',5],[7,'s',3],[8,'b',6],[8,'d',3],[9,'s',4],[9,'c',3],[10,'c',4],[10,'s',3],[11,'c',3]].forEach(([m,sp,n])=>{
  for(let i=0;i<n;i++)year.push(mk('y'+(k++),sp,[m,1+Math.floor(rnd()*27)],pick([5,6,7,18,19,20]),Math.floor(rnd()*59),pick(Object.keys(P))))});
const rec=year.find(c=>c.sp==='b');Object.assign(rec,{l:66,w:3.1,note:'Hajnali rablásnál, a kőszórás végén.',place:P.tisza,kept:false,lure:'Wobbler 7 cm'});
const species=SP.map(([id,name])=>({id,name}));
const LURES=process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3])).lures:[];
function waterMock(now,trend){const f=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const t=Array.from({length:15},(_,i)=>{const d=new Date(now);d.setDate(d.getDate()-7+i);return f(d)});
  return{fetched:now.getTime(),lat:46.253,lng:20.148,time:t,q:t.map((_,i)=>Math.round(trend(i)))}}
function wxMock(now){
  const hours=Array.from({length:24*8},(_,i)=>{const d=new Date(now);d.setMinutes(0,0,0);d.setHours(d.getHours()-24+i);return d});
  const f=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const H={time:hours.map(d=>f(d)+'T'+String(d.getHours()).padStart(2,'0')+':00'),temperature_2m:hours.map(d=>13+6*Math.sin((d.getHours()-9)/24*2*Math.PI)),
    pressure_msl:hours.map((_,i)=>1018-i*0.035),wind_speed_10m:hours.map((_,i)=>9+4*Math.sin(i/5)),wind_direction_10m:hours.map(()=>150),wind_gusts_10m:hours.map(()=>22),
    cloud_cover:hours.map((_,i)=>55+30*Math.sin(i/9)),weather_code:hours.map((_,i)=>[2,3,3,2,61,3,2,1][Math.floor(i/24)%8]),precipitation:hours.map((_,i)=>Math.floor(i/24)===4&&i%3===0?0.6:0),
    precipitation_probability:hours.map((_,i)=>Math.floor(i/24)===4?70:15+(i%20))};
  const days=Array.from({length:8},(_,i)=>{const d=new Date(now);d.setDate(d.getDate()-1+i);return f(d)});
  const D={time:days,weather_code:days.map((_,i)=>[2,3,2,3,61,2,1,0][i]),temperature_2m_max:days.map((_,i)=>[18,19,21,17,14,18,20,22][i]),temperature_2m_min:days.map(()=>8),
    precipitation_sum:days.map((_,i)=>i===4?4.2:0),precipitation_probability_max:days.map((_,i)=>i===4?80:20),wind_speed_10m_max:days.map(()=>16),wind_gusts_10m_max:days.map(()=>31),
    wind_direction_10m_dominant:days.map(()=>150),sunrise:days.map(d=>d+'T05:44'),sunset:days.map(d=>d+'T19:47')};
  return{fetched:now.getTime(),lat:46.253,lng:20.148,h:H,d:D};
}
(async()=>{
  const b=await chromium.launch();
  async function app(now,catches,theme='light',extra){
    const ctx=await b.newContext({viewport:{width:390,height:780},deviceScaleFactor:2.4,reducedMotion:'reduce',locale:'hu-HU',timezoneId:'Europe/Budapest'});
    const q=await ctx.newPage();q.on('pageerror',e=>console.log('ERR',e.message));await q.clock.setFixedTime(now);
    await q.addInitScript(({d,wx,theme,water,extra})=>{localStorage.setItem('fogasnaplo.theme',theme);localStorage.setItem('fogasnaplo.v1',JSON.stringify(d));localStorage.setItem('fogasnaplo.today',JSON.stringify(wx));localStorage.setItem('fogasnaplo.region','tisza');
      localStorage.setItem('fogasnaplo.welcome','1');localStorage.setItem('fogasnaplo.water',JSON.stringify(water));localStorage.setItem('fogasnaplo.bknudge',String(Date.now()+9e9));
      localStorage.setItem('fogasnaplo.vtk',JSON.stringify({'Tisza, Csongrád':'06-077','Holt-Maros':'06-042','Körös, Kunszentmárton':'16-108','Duna, Ráckeve':'13-020','Tisza-tó, Poroszló':'10-002'}));
      for(const k in extra)localStorage.setItem(k,extra[k]);if(extra.__bridge)eval(extra.__bridge)},
      {d:{species,catches,lures:LURES},wx:wxMock(now),theme,water:waterMock(now,i=>i<5?210:210-(i-5)*9),extra:arguments[3]||{}});
    await q.route('https://**',r=>r.abort());
    await q.goto(PAGE);await q.waitForTimeout(800);return{q,ctx};
  }
  const april=new Date('2026-04-24T15:10:00+02:00'),dec=new Date('2026-12-12T11:00:00+01:00');
  const top=async(q,sel,dy)=>{await q.evaluate(([sel,dy])=>{document.querySelector(sel).scrollIntoView();scrollBy(0,dy)},[sel,dy]);await q.waitForTimeout(250)};
  let {q,ctx}=await app(april,spring,'light',{'fogasnaplo.terv':JSON.stringify({sp:['b','s'],day:0,parts:['alkony']})});
  await top(q,'#today .today-top',-6);await q.screenshot({path:TMP+'/s1.png'});
  await q.evaluate(()=>document.querySelector('#list').closest('section').scrollIntoView());await q.evaluate(()=>scrollBy(0,-20));await q.waitForTimeout(200);
  await q.screenshot({path:TMP+'/s3.png'});await ctx.close();
  {const june=new Date('2026-06-12T17:40:00+02:00');
   ({q,ctx}=await app(june,year.filter(c=>c.at<'2026-06-12'),'light',{'fogasnaplo.terv':JSON.stringify({sp:['b','s'],day:0,parts:['alkony']})}));
   await top(q,'#planSec',-14);await q.screenshot({path:TMP+'/s2.png'});await ctx.close()}
  ({q,ctx}=await app(dec,year));
  await q.locator('.tabbar button[data-tab="list"]').click();await q.waitForTimeout(300);
  await q.evaluate(()=>{const c=[...document.querySelectorAll('.citem')].find(e=>e.textContent.includes('66 cm'));c.click()});await q.waitForTimeout(400);
  await q.screenshot({path:TMP+'/s4.png'});await q.evaluate(()=>window.__fnBack());
  await q.locator('.tabbar button[data-tab="stats"]').click();await q.waitForTimeout(400);
  await top(q,'#patSec',-16);await q.screenshot({path:TMP+'/s5.png'});
  await top(q,'#offSec',-16);await q.screenshot({path:TMP+'/s6.png'});
  await ctx.close();
  // Drive backup, dark (winter) theme, signed in
  ({q,ctx}=await app(dec,year,'dark',{'fogasnaplo.gdrive':JSON.stringify({state:'synced',ts:new Date('2026-12-12T10:42:00+01:00').getTime(),up:186,total:186,waiting:0}),
    __bridge:"window.FogasnaploAndroid={saveThumb(){return''},cleanup(){},getLocation(){},isNight(){return true},googleSignIn(){},driveSync(){},googleAccount(){return JSON.stringify({email:'horgasz@gmail.com',name:'Tiszai Horgász'})},zipToFolder(){},backupFolder(){return''},pickBackupFolder(){},setReminders(){}}"}));
  await q.locator('.tabbar button[data-tab="more"]').click();await q.waitForTimeout(300);
  await top(q,'#gAcct',-150);await q.screenshot({path:TMP+'/s7.png'});await ctx.close();
  // year story picture through the app's own share path
  {const c2=await b.newContext({viewport:{width:390,height:780},deviceScaleFactor:1,reducedMotion:'reduce',locale:'hu-HU',timezoneId:'Europe/Budapest'});const q2=await c2.newPage();await q2.clock.setFixedTime(dec);
   await q2.addInitScript(({d})=>{localStorage.setItem('fogasnaplo.theme','light');localStorage.setItem('fogasnaplo.welcome','1');localStorage.setItem('fogasnaplo.v1',JSON.stringify(d));window.FogasnaploAndroid={saveThumb(){return''},cleanup(){},getLocation(){},pickPhoto(){},shareImage(u){window.__card=u}}},{d:{species,catches:year}});
   await q2.route('https://**',r=>r.abort());await q2.goto(PAGE);await q2.waitForTimeout(600);
   await q2.locator('.tabbar button[data-tab="stats"]').click();await q2.waitForTimeout(300);await q2.locator('#yearCard .hero-go').click();await q2.waitForTimeout(1200);
   const card=await q2.evaluate(()=>window.__card);fs.writeFileSync(TMP+'/s8.jpg',Buffer.from(card.split(',')[1],'base64'));await c2.close()}
  // ---------- compositions ----------
  const caps=[['Jó horgászidő ma?','Légnyomás, szél, eső és a folyó vízállása, egy pillantásra.','s1.png'],
    ['Mivel horgássz ma?','A legjobb 3 csali a saját dobozodból, halra és napszakra.','s2.png'],
    ['Tilalmi idők, mindig frissen','Fogható, hamarosan tilos, tilalom: fajonként.','s3.png'],
    ['Minden fogás egy kártyán','Fotók, videók, méret, csali, hely, időjárás, víz.','s4.png'],
    ['Lásd, mi működik nálad','A saját mintáid: napszak, légnyomás, víz, hold.','s5.png'],
    ['A fogási napló kész','Az elvitt halak sorban, víztérkóddal, egy másolással.','s6.png'],
    ['Semmi nem vész el','Fotók és videók a saját Google Drive-odra.','s7.png'],
    ['Az éved a vízparton','Oszd meg az év halát.','s8.jpg']];
  const SCENE=`<svg class="scene" viewBox="0 0 360 210" preserveAspectRatio="xMidYMax slice"><path d="M0 140C50 112 96 104 146 122S250 84 360 110V210H0Z" fill="rgba(228,236,224,.10)"/><path d="M0 162C66 136 124 150 186 138S300 124 360 142V210H0Z" fill="rgba(228,236,224,.14)"/><path d="M0 186C58 170 112 190 172 180S282 168 360 182V210H0Z" fill="rgba(16,30,22,.35)"/></svg>`;
  const cp=await (await b.newContext({viewport:{width:1080,height:1920},deviceScaleFactor:1})).newPage();
  for(let i=0;i<caps.length;i++){const [t,sub,f]=caps[i];const img='data:image/'+(f.endsWith('jpg')?'jpeg':'png')+';base64,'+fs.readFileSync(TMP+'/'+f).toString('base64');
    await cp.setContent(`<html><head><style>${FONTS}
      body{margin:0;width:1080px;height:1920px;overflow:hidden;background:linear-gradient(165deg,#4a6b55 0%,#2f4a3a 50%,#22382b 100%);font-family:Figtree;position:relative}
      .scene{position:absolute;left:0;right:0;top:250px;width:100%;height:360px}
      .sun{position:absolute;right:96px;top:96px;width:120px;height:120px;border-radius:50%;background:#f0a46b;opacity:.92}
      h1{position:relative;margin:0;padding:120px 90px 0;font-family:Fraunces;font-weight:600;font-size:84px;line-height:1.02;letter-spacing:-1.5px;color:#f1f4ee;max-width:760px}
      p{position:relative;margin:22px 90px 0;font-size:40px;line-height:1.3;color:#dfe8da;max-width:820px}
      .ph{position:absolute;left:72px;right:72px;top:500px;height:1560px;border-radius:64px;background:#fdfbf7;padding:14px;box-shadow:0 40px 90px rgba(0,0,0,.45)}
      .ph img{display:block;width:100%;border-radius:52px}
    </style></head><body><div class="sun"></div>${SCENE}<h1>${t}</h1><p>${sub}</p><div class="ph"><img src="${img}"></div></body></html>`);
    await cp.waitForTimeout(250);await cp.screenshot({path:OUT+'/kepernyo-'+(i+1)+'.png'})}
  // feature graphic 1024x500
  await cp.setViewportSize({width:1024,height:500});
  const logo='data:image/png;base64,'+fs.readFileSync(ROOT+'/app/src/main/assets/logo.png').toString('base64');
  await cp.setContent(`<html><head><style>${FONTS}
    body{margin:0;width:1024px;height:500px;overflow:hidden;background:linear-gradient(160deg,#4a6b55 0%,#2f4a3a 55%,#22382b 100%);font-family:Figtree;position:relative;color:#f1f4ee}
    .scene{position:absolute;left:0;bottom:0;width:100%;height:330px}.sun{position:absolute;right:150px;top:84px;width:118px;height:118px;border-radius:50%;background:#f0a46b}
    .row{position:absolute;left:72px;top:96px;display:flex;align-items:center;gap:26px}.row img{width:112px;height:112px;border-radius:28px;background:#dce6d9;padding:8px;box-sizing:border-box}
    h1{margin:0;font-family:Fraunces;font-weight:600;font-size:116px;letter-spacing:-2px;line-height:1}
    p{position:absolute;left:72px;top:250px;margin:0;font-size:40px;color:#dfe8da}
    .chips{position:absolute;left:72px;top:328px;display:flex;gap:12px}.chips span{font-size:26px;padding:9px 20px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22)}
  </style></head><body><div class="sun"></div>${SCENE.replace('class="scene"','class="scene"')}<div class="row"><img src="${logo}"><h1>Kapás</h1></div>
  <p>Fogásnapló magyar horgászoknak</p><div class="chips"><span>Tilalmi idők</span><span>Horgászidő</span><span>Csaliajánló</span><span>Drive-mentés</span></div></body></html>`);
  await cp.waitForTimeout(250);await cp.screenshot({path:OUT+'/kiemelt-grafika.png'});
  await b.close();
})();
