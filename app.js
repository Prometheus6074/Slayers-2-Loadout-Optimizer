const ST=DATA.stats,D=ST.length,I={};ST.forEach((k,i)=>I[k]=i);
const BOOL=new Set(['Sun Immunity','Cold Immunity']),HI=ST.map(k=>k==='Illumination');
const TM=[1,1.15,1.3],RM=[1,1.05,1.1,1.2,1.3,1.4,1.55,1.7,1.9,2,3];
/* the game's own rarity colours (ReplicatedStorage > CAM > Global > Rarities > Colors); Impossible is black in game, so it follows the page text colour here */
const RC=['#dfe6cc','#dfe6cc','#7fd677','#4fb9ff','#d94dd9','#ffca2c','#a10000','var(--ink)','#a68cff'],RN=['','Common','Uncommon','Rare','Epic','Legendary','Mythic','Impossible','Limited'],
  RO={Common:1,UnCommon:2,Uncommon:2,Rare:3,Epic:4,Legendary:5,Mythic:6,Impossible:7,Limited:8,'Impossible Limited':9};/* rarity order, rarest last */
const $=id=>document.getElementById(id);
const byName=Object.fromEntries(DATA.items.map(i=>[i.n,i]));
const OWN_KEY='ouwland-owned:'+DATA.owned.reduce((h,n)=>{for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))>>>0;return h},7);
let ownedSet=new Set(DATA.owned);
try{const sv=JSON.parse(localStorage.getItem(OWN_KEY));if(Array.isArray(sv))ownedSet=new Set(sv)}catch(e){}
const saveOwned=()=>{try{localStorage.setItem(OWN_KEY,JSON.stringify([...ownedSet]))}catch(e){}};
/* items the user left out of the calculation (kept separate from "owned") */
const EX_KEY='ouwland-excluded';
let exSet=new Set();
try{const sv=JSON.parse(localStorage.getItem(EX_KEY));if(Array.isArray(sv))exSet=new Set(sv)}catch(e){}
const saveEx=()=>{try{localStorage.setItem(EX_KEY,JSON.stringify([...exSet]))}catch(e){}};
const nz=(id,d)=>{const v=parseFloat($(id).value);return isNaN(v)?d:v};
for(let i=0;i<=10;i++)$('refine').add(new Option('+'+i,i,false,i===7));
$('wts').innerHTML=ST.map(k=>`<label>${k}<input type="number" min="0" step="any" value="0" data-w="${k}"></label>`).join('');
function vec(it,tier,rl){
  const v=new Array(D).fill(0),tm=it.g?TM[tier-1]:1;
  for(const k in it.s){let x=it.s[k];
    if(!BOOL.has(k)){x*=tm;if(it.rf&&rl>0&&it.rf.st.includes(k)){const sh=it.rf.sh[k];x*=sh===undefined?1+(RM[rl]-1)/2:1+(RM[rl]-1)*sh}}
    v[I[k]]=x}
  return v}
function total(vs){const T=new Array(D).fill(0);for(const v of vs)for(let d=0;d<D;d++)T[d]=HI[d]?Math.max(T[d],v[d]):T[d]+v[d];return T}
/* titles: 3 boost slots (their buffs) + the collection bonus of every unlocked title (always on) */
const TT=DATA.titles||[],TSLOTS=3,tById=Object.fromEntries(TT.map(t=>[t.i,t]));
const TOWN_KEY='ouwland-titles-unlocked';
let TOWN=new Set(DATA.titlesOwned||[]);
try{const sv=JSON.parse(localStorage.getItem(TOWN_KEY));if(Array.isArray(sv))TOWN=new Set(sv.filter(i=>tById[i]))}catch(e){}
const saveTown=()=>{try{localStorage.setItem(TOWN_KEY,JSON.stringify([...TOWN]))}catch(e){}};
/* excluded entries: item names, or 't:'+title id for titles; drop ones the data no longer has */
for(const n of [...exSet])if(!(n.startsWith('t:')?tById[n.slice(2)]:byName[n]))exSet.delete(n);
const TR={Common:1,Rare:3,Epic:4,Legendary:5,Mythic:6,Impossible:7,'Impossible Limited':7};
const tvec=o=>{const v=new Array(D).fill(0);for(const k in o)if(I[k]!==undefined)v[I[k]]=o[k];return v};
const tadd=(a,b)=>{const o={...a};for(const k in b)o[k]=(o[k]||0)+b[k];return o};
const collVec=()=>total(TT.filter(t=>TOWN.has(t.i)).map(t=>tvec(t.cb)));
/* loadouts: what is "equipped" for the comparison column. Starts as the save's current set (Loadout 1) + an empty Loadout 2 */
const LO_KEY='ouwland-loadouts';
let LO={sel:0,list:[{name:'Loadout 1',items:DATA.cur.map(c=>({n:c.n,t:c.t,rf:c.rf})),titles:[...(DATA.curTitles||[])]},{name:'Loadout 2',items:[],titles:[]}]};
try{const sv=JSON.parse(localStorage.getItem(LO_KEY));
  if(sv&&Array.isArray(sv.list)&&sv.list.length>=2){
    LO={sel:Math.min(Math.max(+sv.sel||0,0),sv.list.length-1),list:sv.list.map(l=>({name:String(l.name||'').slice(0,24),
      items:(l.items||[]).filter(c=>byName[c.n]).map(c=>({n:c.n,t:+c.t||1,rf:+c.rf||0})),titles:(l.titles||[]).filter(i=>tById[i])}))}}}catch(e){}
const saveLo=()=>{try{localStorage.setItem(LO_KEY,JSON.stringify(LO))}catch(e){}};
const loName=i=>LO.list[i].name.trim()||'Loadout '+(i+1);
let last=null,lastEx=null;/* the suggestion on screen, so "Equip" knows what to save */
function metrics(T,p){
  const g=n=>T[I[n]];
  const hit=(p.base+g('Additional Damage'))*(1+g('Additional Damage Factor'));
  const cp=Math.min(1,Math.max(0,p.cc+g('Crit Chance'))),m=1+p.cb+g('Crit Damage Factor');
  const hp=(p.hp+g('Max Health'))*(1+g('Max Health Factor'));
  const r=g('Damage Reduction Factor'),eff=r<=.4?r:.4+.2*(1-Math.exp(-(r-.4)/.2));
  let s=g('Movement Speed Factor');if(s>.25)s=.25+(s-.25)*.4;
  return{hit,crit:hit*m,exp:hit*(1+cp*(m-1)),hp,def:hp/Math.exp(p.hs.reduce((a,h)=>a+Math.log(Math.max(1,h-g('Damage Reduction'))*(1-eff)),0)/p.hs.length),sta:g('Max Stamina'),spd:1+Math.min(s,.4),cp,m}}
function hitSizes(){const lo=Math.max(1,nz('dlo',5)),hi=Math.max(lo,nz('dhi',500)),n=9;return Array.from({length:n},(_,i)=>lo*Math.pow(hi/lo,i/(n-1)))}
function params(){return{hs:hitSizes(),base:nz('base',3),cc:nz('cc',0)/100,cb:nz('cb',50)/100,hp:nz('hp',100),goal:$('goal').value,
  w:ST.map(k=>Math.max(0,parseFloat(document.querySelector(`[data-w="${k}"]`).value)||0))}}
function scorer(p){return p.goal==='custom'?T=>T.reduce((a,x,d)=>a+x*p.w[d],0):T=>metrics(T,p)[p.goal]}
function solve(C,f,S,oneCat,fs,base,TQ){
  base=base||new Array(D).fill(0);TQ=TQ||0;
  const N=C.length;
  C.forEach(c=>c.sc=f(total([base,c.v])));C.sort((a,b)=>b.sc-a.sc);
  /* per group (items / titles): best values per stat in each suffix, and how many candidates are left */
  const mk=(isT,K)=>{const t=new Array(N+1);t[N]=ST.map(()=>[]);
    for(let i=N-1;i>=0;i--)t[i]=(!!C[i].T===isT)?t[i+1].map((a,d)=>{const b=a.slice(),x=C[i].v[d];if(x>0){b.push(x);b.sort((p,q)=>q-p);if(b.length>K)b.pop()}return b}):t[i+1];
    return t};
  const topI=mk(false,5),topT=mk(true,TSLOTS),cI=new Array(N+1).fill(0),cT=new Array(N+1).fill(0);
  for(let i=N-1;i>=0;i--){cI[i]=cI[i+1]+(C[i].T?0:1);cT[i]=cT[i+1]+(C[i].T?1:0)}
  const ub=(T,i,rI,rT)=>{const U=T.slice();for(let d=0;d<D;d++)for(const[tp,r]of[[topI,rI],[topT,rT]]){const t=tp[i][d];if(HI[d]){if(t.length&&t[0]>U[d])U[d]=t[0]}else for(let q=0;q<r&&q<t.length;q++)U[d]+=t[q]}return f(U)};
  let best=-1,bs=null,nodes=0,cut=false;const used=new Set();
  const keys=c=>{const k=[];if(oneCat)k.push('c:'+c.k);if(c.x)k.push(c.x);return k};
  if(fs)keys(fs).forEach(k=>used.add(k));
  const set=fs?[fs]:[];
  (function dfs(i,rI,rT,T){
    if(!rI&&!rT){const s=f(T);if(s>best){best=s;bs=set.slice()}return}
    for(let j=i;j<N;j++){
      if(cI[j]<rI||cT[j]<rT)break;
      if(++nodes>3e6){cut=true;return}
      if(ub(T,j,rI,rT)<=best+1e-12)break;
      const c=C[j];
      if(c.T){if(!rT)continue;set.push(c);dfs(j+1,rI,rT-1,total([T,c.v]));set.pop()}
      else{if(!rI)continue;const ks=keys(c);if(ks.some(k=>used.has(k)))continue;
        ks.forEach(k=>used.add(k));set.push(c);dfs(j+1,rI-1,rT,total([T,c.v]));set.pop();ks.forEach(k=>used.delete(k))}
      if(cut)return}
  })(0,S-(fs?1:0),TQ,total(fs?[base,fs.v]:[base]));
  return{set:bs,cut}}
const fmt=(k,v)=>{if(BOOL.has(k))return'Yes';if(/Factor|Regen|Crit/.test(k)&&!/^Max|Block Points/.test(k)){const x=Math.round(v*1000)/10;return(x>0?'+':'')+x+'%'}return String(Math.round(v*100)/100)};
const n2=(x,d=1)=>(Math.round(x*10**d)/10**d).toLocaleString('en',{maximumFractionDigits:d});
const GOALS={exp:['Damage per hit (with crits)',v=>n2(v,2)],hit:['Hit damage',v=>n2(v,2)],crit:['Crit hit damage',v=>n2(v,2)],hp:['Max HP',v=>n2(v,0)],def:['Defense (hits you can take, any hit size)',v=>n2(v,2)],sta:['Max stamina',v=>n2(v,0)],spd:['Movement speed',v=>'×'+n2(v,3)],custom:['Custom score',v=>n2(v,2)]};
function run(){
  last=null;
  const p=params(),f=scorer(p),tier=+$('tier').value,rl=+$('refine').value;
  for(const[id,sh]of[['f-dmg',['exp','hit','crit']],['f-hp',['hp','def']],['f-cus',['custom']]])$(id).classList.toggle('hide',!sh.includes(p.goal));
  $('f-rng').classList.toggle('hide',p.goal!=='def');
  let base0=DATA.items;
  if($('noevt').checked)base0=base0.filter(i=>i.fl!=='unobtainable');
  if(exSet.size)base0=base0.filter(i=>!exSet.has(i.n));
  const items=$('owned').checked?base0.filter(i=>ownedSet.has(i.n)):base0;
  let C=items.map(i=>({...i,v:vec(i,tier,rl)})),fi=null,L=[];
  const on=$('lant').checked,auto=on&&$('lcalc').checked,sel=$('lantern'),oc=$('onecat').checked;
  $('l-calc').classList.toggle('hide',!on);$('l-lant').classList.toggle('hide',!on||auto);
  if(on){
    L=items.filter(i=>i.s.Illumination>0).sort((a,b)=>b.s.Illumination-a.s.Illumination||a.n.localeCompare(b.n));
    const sig=L.map(i=>i.n).join('|');
    if(sig!==sel.dataset.sig){const keep=sel.value;sel.dataset.sig=sig;sel.innerHTML='';
      L.forEach(i=>sel.add(new Option(i.n+' · '+i.k+' · light '+i.s.Illumination,i.n)));
      if(!L.length)sel.add(new Option('No lantern matches the filters',''));
      if(L.some(i=>i.n===keep))sel.value=keep}
    if(!auto){fi=C.find(c=>c.n===sel.value)||null;if(fi)C=C.filter(c=>c!==fi)}}
  const tOn=$('tit').checked,BASE=tOn?collVec():new Array(D).fill(0);let TP=[];
  $('l-town').classList.toggle('hide',!tOn);
  if(tOn){const own=$('town').checked;
    const cand=TT.filter(t=>Object.keys(t.b).length&&!exSet.has('t:'+t.i)&&(!own||TOWN.has(t.i))).map(t=>({T:1,i:t.i,n:t.n,k:'Title',r:TR[t.r]||1,rar:t.r,lock:!TOWN.has(t.i),v:tvec(TOWN.has(t.i)?t.b:tadd(t.b,t.cb))}));
    /* a title that 3 or more others match or beat on every stat can never be needed */
    TP=cand.filter((a,x)=>cand.filter((b,y)=>y!==x&&b.v.every((q,d)=>q>=a.v[d])&&(b.v.some((q,d)=>q>a.v[d])||y<x)).length<TSLOTS)}
  const pick=(pool,one)=>{let r={set:null};for(let S=5;S>0&&!r.set;S--)r=solve(pool.concat(TP),f,S,oc,one,BASE,Math.min(TSLOTS,TP.length));return r};
  let res;
  if(auto&&L.length){
    res={set:null};let bs=-Infinity,cut=false;
    for(const l of L){const one=C.find(c=>c.n===l.n);if(!one)continue;
      const r=pick(C.filter(c=>c!==one),one);cut=cut||r.cut;
      if(r.set){const sc=f(total([BASE,...r.set.map(c=>c.v)]));if(sc>bs+1e-12){bs=sc;res=r}}}
    res.cut=cut}
  else res=pick(C,fi);
  const out=$('out');
  if(!res.set){out.innerHTML='<div class="empty">No items match these filters.</div>';syncLoBar();return}
  const set=res.set.filter(c=>!c.T).sort((a,b)=>a.c.localeCompare(b.c)||a.k.localeCompare(b.k)),tis=res.set.filter(c=>c.T).sort((a,b)=>a.n.localeCompare(b.n));
  last={set:set.slice(),tis:tis.slice(),tier,rl};
  const lo=LO.list[LO.sel],cur=lo.items.map(c=>vec(byName[c.n],c.t,c.rf)),
    ctv=tOn?lo.titles.map(i=>tById[i]).map(t=>tvec(TOWN.has(t.i)?t.b:tadd(t.b,t.cb))):[],emp=!cur.length&&!ctv.length;
  const T=total([BASE,...set.map(c=>c.v),...tis.map(c=>c.v)]),TC=total([BASE,...cur,...ctv]);
  const M=metrics(T,p),MC=metrics(TC,p),g=GOALS[p.goal];
  const sc=f(T),scc=f(TC);
  /* what each piece adds: the score with it vs. the same set without it */
  const gainOf=new Map();
  res.set.forEach(c=>{const o=f(total([BASE,...res.set.filter(x=>x!==c).map(x=>x.v)]));gainOf.set(c,o>0?sc/o-1:null)});
  const gn=c=>{const g=gainOf.get(c);return g==null?'':`<span class="gain" title="How much this piece adds to the score">${g>=0?'+':''}${n2(g*100,1)}% score</span>`};
  const otile=(c,key,on,gain,pic)=>`<button type="button" class="row r${c.r}${on?' on':''}${pic===null?' tt':''}" data-o="${EI[key]}" style="--rc:${RC[c.r]||RC[1]}" aria-pressed="false">${pic===null?'':`<span class="pic">${pic}</span>`}<span class="nm">${esc(c.n)}</span>${gain}</button>`;
  /* upgrade finder: pieces of the best set you don't own yet (if \"Only items I own\" is on, search again with every item) */
  let ups=[],upNote='';
  if(!auto){
    let usrc=res.set,full=sc;
    if($('owned').checked){const C2=base0.map(i=>({...i,v:vec(i,tier,rl)})).filter(c=>!fi||c.n!==fi.n),r2=pick(C2,fi);
      if(r2.set){usrc=r2.set;full=f(total([BASE,...usrc.map(c=>c.v)]))}}
    ups=usrc.filter(c=>!c.T&&!ownedSet.has(c.n)).map(c=>{const o=f(total([BASE,...usrc.filter(x=>x!==c).map(x=>x.v)]));return{...c,g:o>0?full/o-1:null}}).sort((a,b)=>(b.g||0)-(a.g||0));
    upNote=$('owned').checked?`Your best owned set scores ${g[1](sc)}. With these items the best possible set scores ${g[1](full)} (${full>=sc?'+':''}${n2((sc?full/sc-1:0)*100,1)}%).`:'These pieces of the best set are not in your owned items yet.'}
  const pr=o=>o?Object.keys(o).map(k=>k+' ×'+o[k]).join(', '):'';
  const upsec=ups.length?`<h2 class="sub">Upgrades to get</h2><p class="hint">${upNote}</p><div class="slots cat-grid">${ups.map(u=>otile(u,u.n,false,u.g==null?'':`<span class="gain">${u.g>=0?'+':''}${n2(u.g*100,1)}% to best set</span>`,ico(u))).join('')}</div>`:'';
  const qx=k=>`<label class="qx"><input type="checkbox" data-qx="${esc(k).replace(/"/g,'&quot;')}">Exclude</label>`;
  if(lastEx&&!exSet.has(lastEx.k))lastEx=null;
  const exNote=lastEx?`<p class="hint exnote">Excluded <b>${esc(lastEx.name)}</b> from the calculation. <button type="button" class="btn" data-undo>Undo</button></p>`:'';
  const card=c=>otile(c,c.n,ownedSet.has(c.n),gn(c),ico(c));
  const tcard=c=>otile(c,'t:'+c.i,!c.lock,gn(c),null);
  const tsec=tOn?`<h2 class="sub">Titles</h2>${tis.length?`<div class="slots cat-grid">${tis.map(tcard).join('')}</div>`:'<p class="hint">No title adds anything for this goal.</p>'}`:'';
  const dm=[['hit','Hit damage'],['crit','Crit hit'],['exp','Per hit with crits'],['hp','Max HP'],['def','Defense (any hit size)'],['sta','Max stamina'],['spd','Movement speed']];
  const row=(l,a,b,fm,key)=>{const d=b?(a/b-1)*100:0;return`<tr class="${key?'key':''}"><td>${l}</td><td class="num">${fm(a)}</td><td class="num">${emp?'—':fm(b)}</td><td class="num ${emp?'':d>0.05?'up':d<-0.05?'dn':''}">${emp?'':Math.abs(d)<0.05?'0%':(d>0?'+':'')+n2(d,1)+'%'}</td></tr>`};
  const sr=ST.map((k,d)=>[k,d]).filter(([k,d])=>T[d]||(!emp&&TC[d])).map(([k,d])=>`<tr><td>${k}</td><td class="num">${fmt(k,T[d])}</td><td class="num">${emp?'—':fmt(k,TC[d])}</td><td class="num ${emp?'':T[d]>TC[d]?'up':T[d]<TC[d]?'dn':''}">${emp||T[d]===TC[d]?'':fmt(k,T[d]-TC[d])}</td></tr>`).join('');
  const eqh=`Equipped · ${esc(loName(LO.sel))}`;
  out.innerHTML=`<div class="head"><h2>Best ${set.length} for ${g[0].toLowerCase()}</h2><span class="score num">${g[1](sc)}</span></div>
  ${exNote}${res.cut?'<p class="warn">Search hit its time limit, so this may not be the exact best set.</p>':''}
  <div class="slots cat-grid">${set.map(card).join('')}</div>
  ${tsec}
  ${upsec}
  <div class="tw"><table><thead><tr><th>Result</th><th>Suggested</th><th>${eqh}</th><th>Change</th></tr></thead><tbody>
  ${dm.map(([k,l])=>row(l,M[k],MC[k],GOALS[k][1],k===p.goal)).join('')}
  ${p.goal==='custom'?row('Custom score',sc,scc,v=>n2(v,2),true):''}</tbody></table></div>
  <div class="tw" style="margin-top:12px"><table><thead><tr><th>Stat totals</th><th>Suggested</th><th>${eqh}</th><th>Change</th></tr></thead><tbody>${sr}</tbody></table></div>`;markSel();syncLoBar()}
let tm;document.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(run,120)});

const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
/* item picture from icons/<id>.png (made by tools/download_icons.py); removed again if the file is missing */
const ico=it=>it&&it.ic?`<img class="ic" src="icons/${it.ic}.png" alt="" loading="lazy" onerror="this.remove()">`:'';
const dot=it=>`<span style="color:${RC[it.r]||RC[1]}" aria-hidden="true">●</span>`;
let dirty=true,view='opt',exOnly=false;
const ownAgain=()=>{clearTimeout(tm);tm=setTimeout(run,120)};
const rerun=()=>{view==='opt'?ownAgain():dirty=true};
/* My items page: one section per item category plus one for titles. ENT = every row on the page (items first, then titles) */
const ENT=[...DATA.items.map(it=>({T:0,it,key:it.n,cat:it.c})),...TT.map(t=>({T:1,it:t,key:'t:'+t.i,cat:'Titles'}))];
const EI=Object.fromEntries(ENT.map((e,i)=>[e.key,i]));/* entry index by item name or 't:'+title id */
const isOwn=e=>e.T?TOWN.has(e.it.i):ownedSet.has(e.it.n);
const CATS=[...new Set(ENT.map(e=>e.cat))];
let curCat=CATS[0],sel=-1,selO=-1,dT=3,dR=0;/* sel / selO = item open in the detail window on My items / on the optimizer *//* sel = item shown in the detail window; dT / dR = tier and refine shown there *//* My items shows one category at a time; searching or filtering shows matches from all of them */
const bf=o=>Object.keys(o).map(k=>k+' '+fmt(k,o[k])).join(', ');
const rowHtml=i=>{const e=ENT[i],it=e.it,r=e.T?(TR[it.r]||1):it.r;
  return`<button type="button" class="row r${r}${e.T?' tt':''}" data-i="${i}" style="--rc:${RC[r]||RC[1]}" aria-pressed="false">${e.T?'':`<span class="pic">${ico(it)}</span>`}<span class="nm">${esc(it.n)}</span></button>`};
$('items-cats').innerHTML=CATS.map(c=>{const ix=ENT.map((_,i)=>i).filter(i=>ENT[i].cat===c);
  return`<section class="cat" data-c="${esc(c)}"><div class="cat-head"><h2>${esc(c)}<span class="num" data-cc></span></h2><div class="cat-btns"><button type="button" class="btn" data-a="on">Tick shown</button><button type="button" class="btn" data-a="off">Untick shown</button></div></div><div class="cat-grid">${ix.map(rowHtml).join('')}</div></section>`}).join('');
$('pg-chips').innerHTML='<button type="button" class="btn hide" id="pg-exchip" aria-pressed="false" data-exchip>Unincluded <span class="num" id="pg-exnum"></span></button>'+CATS.map(c=>`<button type="button" class="btn" data-chip="${esc(c)}">${esc(c)} <span class="num"></span></button>`).join('');
const pgRows=[];document.querySelectorAll('#items-cats .row').forEach(l=>{pgRows[+l.dataset.i]=l});
const pgSecs=[...document.querySelectorAll('#items-cats .cat')];
/* detail window: shown only while an item is selected, laid out like the game's item tooltip */
const gfmt=(k,v)=>{if(BOOL.has(k))return'Yes';if(/Factor|Regen/.test(k))return(Math.round((1+v)*10000)/10000)+'x';
  if(k==='Crit Chance'||k==='Crit Resistance'){const x=Math.round(v*1000)/10;return(x>0?'+':'')+x+'%'}const x=Math.round(v*100)/100;return(x>0?'+':'')+x};
const stRow=(k,v)=>`<li><span class="si">${DATA.si&&DATA.si[k]?`<img src="icons/${DATA.si[k]}.png" alt="" onerror="this.remove()">`:''}</span><b>${gfmt(k,v)}</b> <i>(${esc(k)})</i></li>`;
const stList=o=>{const ks=Object.keys(o).filter(k=>o[k]);return ks.length?`<ul class="d-st">${ks.map(k=>stRow(k,o[k])).join('')}</ul>`:'<p class="hint">No stats.</p>'};
const opts=(a,v)=>a.map(x=>`<option value="${x[0]}"${x[0]===v?' selected':''}>${x[1]}</option>`).join('');
function selectItem(i){sel=i===sel?-1:i;if(sel>=0){dT=+$('tier').value||3;dR=+$('refine').value||0}renderDetail()}
const curSel=()=>view==='items'?sel:selO,curBox=()=>$(view==='items'?'i-detail':'o-detail');
function selectO(i){selO=i===selO?-1:i;if(selO>=0){dT=+$('tier').value||3;dR=+$('refine').value||0}renderDetail()}
function closeDetail(){if(view==='items')sel=-1;else selO=-1;renderDetail()}
function markSel(){document.querySelectorAll('#out [data-o]').forEach(b=>{const on=+b.dataset.o===selO;b.classList.toggle('sel',on);b.setAttribute('aria-pressed',on)})}
function syncDetail(){const s=curSel();if(s<0)return;const e=ENT[s],b=curBox(),p=b.querySelector('[data-dp]'),x=b.querySelector('[data-dx]');if(p)p.checked=isOwn(e);if(x)x.checked=exSet.has(e.key)}
function renderDetail(){
  const isI=view==='items',s=curSel(),box=curBox();
  if(isI)pgRows.forEach((r,i)=>{if(r){r.classList.toggle('sel',i===sel);r.setAttribute('aria-pressed',i===sel)}});else markSel();
  $(isI?'i-body':'o-body').classList.toggle('has-sel',s>=0);box.classList.toggle('hide',s<0);
  if(s<0){box.innerHTML='';return}
  const e=ENT[s],it=e.it,r=e.T?(TR[it.r]||1):it.r,rw=e.T?it.r:(RN[it.r]||'');let body;
  if(e.T)body=`<dl class="d-meta"><dt>Type</dt><dd>${esc(it.c)}</dd></dl><h4>Stats (when equipped)</h4>${stList(it.b)}<h4>Collection bonus</h4>${stList(it.cb)}`;
  else{const P=DATA.pass||{},pa=it.ser&&P.items?[P.items[it.ser],['Top','Bottom'].includes(it.k)?P.outfit[it.ser]:null].filter(Boolean):[];
    const rows=[it.g?['Tier',`<div class="rad" role="radiogroup" aria-label="Tier">${[1,2,3].map(x=>`<label><input type="radio" name="dt" value="${x}" data-dt${x===dT?' checked':''}>Tier ${x}</label>`).join('')}</div>`]:null,
      it.rf?['Refine',`<select data-dr aria-label="Refine level">${opts(Array.from({length:11},(_,x)=>[x,'+'+x]),dR)}</select>`]:null,
      it.cl?['Class',esc(it.cl)]:null,['Slot',esc(it.k)],it.ser?['Set',esc(it.ser)]:null,it.fl?['Availability',esc(it.fl)]:null,it.pr?['Cost',esc(Object.keys(it.pr).map(k=>k+' ×'+it.pr[k]).join(', '))]:null].filter(Boolean);
    body=`<dl class="d-meta">${rows.map(x=>`<dt>${x[0]}</dt><dd>${x[1]}</dd>`).join('')}</dl>
    ${pa.map(x=>`<div class="d-pas${dT<P.tier?' off':''}"><h4>Tier ${P.tier} Passive: ${esc(x.n)}${dT<P.tier?' <span class="hint">(inactive at tier '+dT+')</span>':''}</h4><p class="d-desc">${esc(x.d)}</p></div>`).join('')}
    <h4>Stats</h4>${(()=>{const v=vec(it,dT,dR),o={};ST.forEach((k,d)=>{if(v[d])o[k]=v[d]});return stList(o)})()}`}
  box.innerHTML=`<div class="d-head"><h3>${esc(it.n)}</h3><button type="button" class="btn" data-close>Close</button></div>
  <div class="d-rar" style="--rc:${RC[r]||RC[1]}">${esc(rw)}</div>
  <div class="d-sw"><label><input type="checkbox" data-dp>Owned</label><label><input type="checkbox" data-dx>Exclude from the calculation</label></div>
  ${it.d?`<p class="d-desc">${esc(it.d)}</p>`:''}${body}`;
  syncDetail()}
/* tile order: owned, then not owned, then excluded; inside each, rarest first, then A to Z */
function pgSort(){
  const fa=document.activeElement,key=i=>{const e=ENT[i];return[exSet.has(e.key)?2:isOwn(e)?0:1,-(e.T?RO[e.it.r]||1:e.it.r||1),e.it.n]};
  document.querySelectorAll('#items-cats .cat-grid').forEach(g=>{
    const rows=[...g.children].map(el=>({el,k:key(+el.dataset.i)}));
    const sorted=rows.slice().sort((a,b)=>a.k[0]-b.k[0]||a.k[1]-b.k[1]||a.k[2].localeCompare(b.k[2],'en'));
    if(sorted.some((r,x)=>r!==rows[x]))sorted.forEach(r=>g.appendChild(r.el))});
  if(fa&&fa.matches&&fa.matches('#items-cats .row'))fa.focus({preventScroll:true})}
function syncOwn(){
  const io=DATA.items.filter(i=>ownedSet.has(i.n)).length,to=TT.filter(t=>TOWN.has(t.i)).length;
  $('pg-total').textContent=io+' of '+DATA.items.length+' items owned · '+to+' of '+TT.length+' titles unlocked';
  pgRows.forEach((r,i)=>{const o=isOwn(ENT[i]);r.classList.toggle('on',o)});
  pgSecs.forEach(sec=>{const ix=[...sec.querySelectorAll('.row')].map(l=>+l.dataset.i),o=ix.filter(i=>isOwn(ENT[i])).length;
    sec.querySelector('[data-cc]').textContent=o+' of '+ix.length+(sec.dataset.c==='Titles'?' unlocked':' owned');
    document.querySelector(`#pg-chips [data-chip="${sec.dataset.c}"] .num`).textContent=o+'/'+ix.length});pgSort();syncDetail()}
function syncEx(){
  const n=exSet.size;
  if(!n)exOnly=false;
  pgRows.forEach((r,i)=>{const x=exSet.has(ENT[i].key);r.classList.toggle('ex-on',x)});
  $('nav-badge').textContent=n;$('nav-badge').classList.toggle('hide',!n);
  $('nav-items').setAttribute('aria-label',n?'My items, '+n+' left out of the calculation':'My items');
  $('pg-exnum').textContent=n;$('pg-exchip').classList.toggle('hide',!n);
  $('pg-exchip').classList.toggle('active',exOnly);$('pg-exchip').setAttribute('aria-pressed',exOnly);
  $('pg-exclear').classList.toggle('hide',!n);pgSort();syncDetail()}
function pgFilter(){
  const w=$('pg-q').value.trim().toLowerCase().split(/\s+/),f=$('pg-f').value;
  ENT.forEach((e,i)=>{const it=e.it,o=isOwn(e),
    t=(e.T?[it.n,'title',it.c,it.r,...Object.keys(it.b),...Object.keys(it.cb)]:[it.n,it.c,it.k,it.cl,it.fl,it.ser]).filter(Boolean).join(' ').toLowerCase();
    const ok=w.every(x=>t.includes(x))&&(f==='all'||(f==='yes')===o)&&(!exOnly||exSet.has(e.key));
    pgRows[i].classList.toggle('hide',!ok)});
  const srch=w.join('')!==''||f!=='all'||exOnly;
  pgSecs.forEach(sec=>sec.classList.toggle('hide',!sec.querySelector('.row:not(.hide)')||(!srch&&sec.dataset.c!==curCat)));
  document.querySelectorAll('#pg-chips [data-chip]').forEach(b=>b.classList.toggle('active',!srch&&b.dataset.chip===curCat));
  const shown=pgRows.filter(r=>r&&!r.classList.contains('hide')&&!r.closest('.cat').classList.contains('hide')).length;
  $('pg-empty').classList.toggle('hide',shown>0);$('pg-shown').textContent='· '+shown+' shown'}
function setMany(ixs,on){ixs.forEach(i=>{const e=ENT[i],set=e.T?TOWN:ownedSet,n=e.T?e.it.i:e.it.n;on?set.add(n):set.delete(n)});saveOwned();saveTown();syncOwn();rerun()}
function setEx(ixs,on){ixs.forEach(i=>{const k=ENT[i].key;on?exSet.add(k):exSet.delete(k)});saveEx();syncEx();pgFilter();rerun()}
function clearEx(){exSet.clear();saveEx();syncEx();pgFilter();rerun()}
function resetOwn(){ownedSet=new Set(DATA.owned);TOWN=new Set(DATA.titlesOwned||[]);try{localStorage.removeItem(OWN_KEY);localStorage.removeItem(TOWN_KEY)}catch(e){}syncOwn();pgFilter();rerun()}
const shownIx=(rows,root)=>rows.map((r,i)=>i).filter(i=>rows[i]&&!rows[i].classList.contains('hide')&&!rows[i].closest('.cat').classList.contains('hide')&&(!root||root.contains(rows[i])));
/* events */
$('items-page').addEventListener('input',e=>e.stopPropagation());
$('items-cats').addEventListener('click',e=>{const t=e.target.closest('.row');if(t)selectItem(+t.dataset.i)});
for(const id of['i-detail','o-detail']){const bx=$(id);
  bx.addEventListener('change',e=>{const t=e.target,s=curSel();if(s<0)return;
    if(t.matches('[data-dp]'))setMany([s],t.checked);else if(t.matches('[data-dx]'))setEx([s],t.checked);
    else if(t.matches('[data-dt]')){dT=+t.value;renderDetail();const c=bx.querySelector('[data-dt]:checked');if(c)c.focus()}else if(t.matches('[data-dr]')){dR=+t.value;renderDetail()}});
  bx.addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeDetail()})}
$('out').addEventListener('click',e=>{const t=e.target.closest('[data-o]');if(t)selectO(+t.dataset.o)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&curSel()>=0)closeDetail()});
$('items-cats').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b)setMany(shownIx(pgRows,b.closest('.cat')),b.dataset.a==='on')});
$('pg-chips').addEventListener('click',e=>{if(e.target.closest('[data-exchip]')){exOnly=!exOnly;syncEx();pgFilter();return}
  const b=e.target.closest('[data-chip]');if(!b)return;
  curCat=b.dataset.chip;exOnly=false;$('pg-q').value='';$('pg-f').value='all';syncEx();pgFilter();window.scrollTo(0,0)});
$('pg-q').addEventListener('input',pgFilter);$('pg-q').addEventListener('keydown',e=>{if(e.key==='Enter')pgFilter()});
$('pg-go').onclick=pgFilter;$('pg-f').addEventListener('change',pgFilter);
$('pg-clear').onclick=()=>{$('pg-q').value='';$('pg-f').value='all';pgFilter();$('pg-q').focus()};
$('pg-all').onclick=()=>setMany(shownIx(pgRows),true);$('pg-none').onclick=()=>setMany(shownIx(pgRows),false);$('pg-reset').onclick=resetOwn;$('pg-exclear').onclick=clearEx;
/* quick exclude from the suggestion cards (plus undo) */
function quickEx(k){exSet.add(k);saveEx();lastEx={k,name:k.startsWith('t:')?tById[k.slice(2)].n:k};syncEx();pgFilter();clearTimeout(tm);run()}
$('out').addEventListener('change',e=>{const k=e.target.dataset&&e.target.dataset.qx;if(k!=null)quickEx(k)});
$('out').addEventListener('click',e=>{if(e.target.closest('[data-undo]')&&lastEx){exSet.delete(lastEx.k);lastEx=null;saveEx();syncEx();pgFilter();clearTimeout(tm);run()}});
/* loadout bar */
function renderLoBar(){
  const many=LO.list.length>2;
  $('lo-tabs').innerHTML=LO.list.map((l,i)=>`<span class="lo-tab${i===LO.sel?' on':''}"><button type="button" class="btn" data-lo="${i}" aria-pressed="${i===LO.sel}">${esc(loName(i))}</button>${many?`<button type="button" class="lo-x" data-lo-del="${i}" aria-label="Delete ${esc(loName(i))}">×</button>`:''}</span>`).join('');
  $('lo-name').value=LO.list[LO.sel].name;$('lo-name').placeholder='Loadout '+(LO.sel+1);
  syncLoBar()}
function syncLoBar(){
  $('lo-equip').disabled=!last;$('lo-equip').textContent='Equip suggested set to '+loName(LO.sel);}
function pickLo(i){LO.sel=i;saveLo();renderLoBar();clearTimeout(tm);run()}
$('lo-tabs').addEventListener('click',e=>{
  const x=e.target.closest('[data-lo-del]'),b=e.target.closest('[data-lo]');
  if(x){if(LO.list.length<=2)return;const i=+x.dataset.loDel;
    if(!confirm('Delete "'+loName(i)+'"?'))return;
    LO.list.splice(i,1);if(i<LO.sel)LO.sel--;LO.sel=Math.min(LO.sel,LO.list.length-1);saveLo();renderLoBar();clearTimeout(tm);run()}
  else if(b)pickLo(+b.dataset.lo)});
$('lo-add').onclick=()=>{let k=LO.list.length+1;while(LO.list.some(l=>l.name.trim()==='Loadout '+k))k++;
  LO.list.push({name:'Loadout '+k,items:[],titles:[]});pickLo(LO.list.length-1)};
$('lo-name').addEventListener('input',e=>{LO.list[LO.sel].name=e.target.value.slice(0,24);saveLo();
  const b=document.querySelector(`#lo-tabs [data-lo="${LO.sel}"]`);if(b)b.textContent=loName(LO.sel);syncLoBar()});
$('lo-equip').onclick=()=>{if(!last)return;const lo=LO.list[LO.sel];
  lo.items=last.set.map(c=>({n:c.n,t:last.tier,rf:last.rl}));lo.titles=last.tis.map(c=>c.i);saveLo();clearTimeout(tm);run()};
/* page routing: #optimizer (default) and #my-items */
function route(){const pg=location.hash==='#my-items';view=pg?'items':'opt';
  document.querySelector('.wrap').classList.toggle('hide',pg);$('items-page').classList.toggle('hide',!pg);
  $('nav-opt').setAttribute('aria-current',pg?'false':'page');$('nav-items').setAttribute('aria-current',pg?'page':'false');
  if(!pg&&dirty){dirty=false;run()}}
window.addEventListener('hashchange',()=>{route();window.scrollTo(0,0)});
syncOwn();syncEx();pgFilter();renderLoBar();route();
