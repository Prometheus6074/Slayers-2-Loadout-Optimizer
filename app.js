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
$('wts').innerHTML=ST.map(k=>`<label>${k}<input type="number" min="0" step="any" value="0" data-w="${k}"></label>`).join('');
function vec(it,tier,rl){
  const v=new Array(D).fill(0),tm=it.g?TM[tier-1]:1;
  for(const k in it.s){let x=it.s[k];
    if(!BOOL.has(k)){x*=tm;if(it.rf&&rl>0&&it.rf.st.includes(k)){const sh=it.rf.sh[k];x*=sh===undefined?1+(RM[rl]-1)/2:1+(RM[rl]-1)*sh}}
    v[I[k]]=x}
  return v}
/* tier and refine of every item. Edited on My items. Starts from the save; items the save has no record of count as tier 3 and +7 */
const TR_KEY='ouwland-tier-refine',isW=i=>i.k==='Toolbar';
let trS={};
try{const sv=JSON.parse(localStorage.getItem(TR_KEY));if(sv&&typeof sv==='object'&&!Array.isArray(sv))trS=sv}catch(e){}
const saveTr=()=>{try{localStorage.setItem(TR_KEY,JSON.stringify(trS))}catch(e){}};
const trOf=it=>{const s0=(DATA.tr||{})[it.n]||{},u=trS[it.n]||{};
  return{t:it.g?Math.min(3,Math.max(1,+(u.t??s0.t??3)||3)):1,rf:it.rf?Math.min(10,Math.max(0,+(u.rf??s0.rf??7)||0)):0}};
const itv=it=>{const r=trOf(it);return vec(it,r.t,r.rf)};
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
/* runes: every rune you own lives on My items. Each one rolls its own stats, so they are typed in: HP + the kind's fixed stat + the substats its rarity allows.
   With "Include runes" on, the optimizer picks the best 3 of them */
const RUD=DATA.runes,RU_KEY='ouwland-runes-owned',RU_OLD='ouwland-runes',RSLOTS=RUD.slots;
const ruPct=k=>/Factor|Regen|Crit/.test(k)&&!/^Max|Block Points/.test(k);
const ruRange=(k,rar)=>{const sc=RUD.rar[rar].scale,top=RUD.tops[k]*sc,low=(RUD.lows[k]??RUD.tops[k]/3)*sc;
  if(RUD.whole.includes(k)){const hi=Math.max(1,Math.round(top));return[Math.min(Math.max(Math.round(low),1),hi),hi]}
  return[Math.round(low*1000)/1000,Math.round(top*1000)/1000]};
const ruShow=(k,x)=>ruPct(k)?Math.round(x*1000)/10:x;
const ruNum=(k,t)=>{const v=parseFloat(t);return isNaN(v)?0:(ruPct(k)?v/100:v)};
const ruOpts=r=>{const K=RUD.kinds[r.kind];return[...RUD.pool,...(K.own?[K.own]:[])].filter((k,i,a)=>I[k]!==undefined&&a.indexOf(k)===i&&k!==RUD.main&&k!==K.fixed)};
function ruNormalize(r){const K=RUD.kinds[r.kind];if(!K.rar.includes(r.rar))r.rar=K.rar[K.rar.length-1];
  const n=RUD.rar[r.rar].lines;r.subs=r.subs.slice(0,n);while(r.subs.length<n)r.subs.push({s:'',v:''});
  const ok=ruOpts(r),seen=new Set();r.subs.forEach(x=>{if(!ok.includes(x.s)||seen.has(x.s))x.s='';if(x.s)seen.add(x.s)})}
const ruName=r=>RUD.rar[r.rar].n+' '+r.kind+' Rune';
const ruId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const ruMake=(o={})=>{const r={id:String(o.id||ruId()),kind:RUD.kinds[o.kind]?o.kind:'Carapace',rar:+o.rar||6,hp:String(o.hp??''),fx:String(o.fx??''),
  subs:(Array.isArray(o.subs)?o.subs:[]).map(x=>({s:String(x&&x.s||''),v:String((x&&x.v)??'')}))};ruNormalize(r);return r};
const ruVec=r=>{const v=new Array(D).fill(0),K=RUD.kinds[r.kind],add=(k,t)=>{if(I[k]!==undefined)v[I[k]]+=ruNum(k,t)};
  add(RUD.main,r.hp);add(K.fixed,r.fx);r.subs.forEach(x=>{if(x.s)add(x.s,x.v)});return v};
let RUNES=[],RU_ON=false;
const ruSave=()=>{try{localStorage.setItem(RU_KEY,JSON.stringify({v:2,on:RU_ON,list:RUNES}))}catch(e){}};
const ruById=id=>RUNES.find(r=>r.id===id);
(function ruLoad(){
  try{const sv=JSON.parse(localStorage.getItem(RU_KEY));if(sv&&Array.isArray(sv.list)){RU_ON=!!sv.on;RUNES=sv.list.filter(o=>o&&RUD.kinds[o.kind]).map(ruMake);return}}catch(e){}
  /* runes typed into the old 3-slot panel carry over once: every slot that has something in it becomes an owned rune */
  try{const sv=JSON.parse(localStorage.getItem(RU_OLD));if(sv&&Array.isArray(sv.list)){RU_ON=!!sv.on;
    RUNES=sv.list.filter(o=>o&&RUD.kinds[o.kind]).map(o=>ruMake({...o,id:''})).filter(r=>r.hp!==''||r.fx!==''||r.subs.some(x=>x.s&&x.v!==''));ruSave()}}catch(e){}
})();
/* loadouts: what is "equipped" for the comparison column. Starts as the save's current set (Loadout 1) + an empty Loadout 2 */
const LO_KEY='ouwland-loadouts';
let LO={sel:0,list:[{name:'Loadout 1',items:DATA.cur.map(c=>({n:c.n,t:c.t,rf:c.rf})),titles:[...(DATA.curTitles||[])],runes:[]},{name:'Loadout 2',items:[],titles:[],runes:[]}]};
try{const sv=JSON.parse(localStorage.getItem(LO_KEY));
  if(sv&&Array.isArray(sv.list)&&sv.list.length>=2){
    LO={sel:Math.min(Math.max(+sv.sel||0,0),sv.list.length-1),list:sv.list.map(l=>({name:String(l.name||'').slice(0,24),
      items:(l.items||[]).filter(c=>byName[c.n]).map(c=>({n:c.n,t:+c.t||1,rf:+c.rf||0})),titles:(l.titles||[]).filter(i=>tById[i]),runes:(Array.isArray(l.runes)?l.runes:[]).map(String).filter(ruById)}))}}}catch(e){}
const saveLo=()=>{try{localStorage.setItem(LO_KEY,JSON.stringify(LO))}catch(e){}};
const loName=i=>LO.list[i].name.trim()||'Loadout '+(i+1);
/* skill tree (tab "Skill Tree"): the level of every node, starting from the save. A node only counts while what it hangs off is unlocked */
const SK_KEY='ouwland-skilltree',TB=TREE.b,tBy=Object.fromEntries(TB.map(b=>[b.id,b])),R6=x=>Math.round(x*1e6)/1e6;
let SK={};
TB.forEach(b=>SK[b.id]=Math.min(b.st.length,Math.max(0,+TREE.save[b.id]||0)));
try{const sv=JSON.parse(localStorage.getItem(SK_KEY));if(sv&&typeof sv==='object'&&!Array.isArray(sv))TB.forEach(b=>{if(sv[b.id]!==undefined)SK[b.id]=Math.min(b.st.length,Math.max(0,Math.round(+sv[b.id])||0))})}catch(e){}
const skSave=()=>{try{localStorage.setItem(SK_KEY,JSON.stringify(SK))}catch(e){}};
const skNeeds=b=>{const r=[];if(b.par)r.push({id:b.par,at:b.at});if(b.j)r.push({id:b.j.id,at:b.j.at});return r};/* the branch it hangs off at a level, plus a second branch for a few nodes */
const skOk=b=>skNeeds(b).every(q=>SK[q.id]>=q.at);
function skFix(){for(let ch=true;ch;){ch=false;TB.forEach(b=>{if(SK[b.id]>0&&!skOk(b)){SK[b.id]=0;ch=true}})}}/* drop nodes that lost what they need; repeats because that can chain */
skFix();
function skStats(){const o={};TB.forEach(b=>{for(let i=0;i<SK[b.id];i++){const s=b.st[i].s;for(const k in s)o[k]=(o[k]||0)+s[k]}});for(const k in o)o[k]=R6(o[k]);return o}
const SKFOLD=['Additional Damage','Crit Chance','Crit Damage Factor','Max Health'];/* these four are folded into the four base fields; every other tree stat is added to each set */
function skBase(){const o=skStats(),B0=TREE.base;
  return{base:R6(B0.hit+(o['Additional Damage']||0)),cc:R6(B0.crit+(o['Crit Chance']||0)),cb:R6(B0.critBonus+(o['Crit Damage Factor']||0)),hp:R6(B0.hp+(o['Max Health']||0))}}
function skVecs(){const o=skStats(),fd=new Array(D).fill(0),rv=new Array(D).fill(0);
  for(const k in o){if(I[k]===undefined)continue;(SKFOLD.includes(k)?fd:rv)[I[k]]=o[k]}
  return{fd,rv}}
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
function params(){const a=skBase();return{hs:hitSizes(),base:a.base,cc:a.cc,cb:a.cb,hp:a.hp,goal:$('goal').value,
  w:ST.map(k=>Math.max(0,parseFloat(document.querySelector(`[data-w="${k}"]`).value)||0))}}
function scorer(p){return p.goal==='custom'?T=>T.reduce((a,x,d)=>a+x*p.w[d],0):T=>metrics(T,p)[p.goal]}
function solve(C,f,S,oneCat,fs,base,TQ,lb,RQ){
  base=base||new Array(D).fill(0);TQ=TQ||0;RQ=RQ||0;
  const N=C.length,gp=c=>c.R?2:c.T?1:0,KS=[5,TSLOTS,Math.max(1,RQ)];/* group 0 = items, 1 = titles, 2 = runes */
  C.forEach(c=>c.sc=f(total([base,c.v])));C.sort((a,b)=>b.sc-a.sc);
  /* per group: best values per stat in each suffix, and how many candidates are left */
  const mk=g=>{const t=new Array(N+1);t[N]=ST.map(()=>[]);
    for(let i=N-1;i>=0;i--)t[i]=gp(C[i])===g?t[i+1].map((a,d)=>{const b=a.slice(),x=C[i].v[d];if(x>0){b.push(x);b.sort((p,q)=>q-p);if(b.length>KS[g])b.pop()}return b}):t[i+1];
    return t};
  const tops=[0,1,2].map(mk),cnt=[0,1,2].map(g=>{const a=new Array(N+1).fill(0);for(let i=N-1;i>=0;i--)a[i]=a[i+1]+(gp(C[i])===g?1:0);return a});
  const ub=(T,i,r)=>{const U=T.slice();for(let d=0;d<D;d++)for(let g=0;g<3;g++){const t=tops[g][i][d];if(HI[d]){if(t.length&&t[0]>U[d])U[d]=t[0]}else for(let q=0;q<r[g]&&q<t.length;q++)U[d]+=t[q]}return f(U)};
  let best=lb===undefined?-1:lb,bs=null,nodes=0,cut=false;const used=new Set();
  const keys=c=>{const k=[];if(oneCat)k.push('c:'+c.k);if(c.x)k.push(c.x);return k};
  if(fs)keys(fs).forEach(k=>used.add(k));
  const set=fs?[fs]:[],r=[S-(fs?1:0),TQ,RQ];/* r = slots still to fill in each group */
  (function dfs(i,T){
    if(!r[0]&&!r[1]&&!r[2]){const s=f(T);if(s>best){best=s;bs=set.slice()}return}
    for(let j=i;j<N;j++){
      if(cnt[0][j]<r[0]||cnt[1][j]<r[1]||cnt[2][j]<r[2])break;
      if(++nodes>3e6){cut=true;return}
      if(ub(T,j,r)<=best+1e-12)break;
      const c=C[j],g=gp(c);
      if(g){if(!r[g])continue;r[g]--;set.push(c);dfs(j+1,total([T,c.v]));set.pop();r[g]++}
      else{if(!r[0])continue;const ks=keys(c);if(ks.some(k=>used.has(k)))continue;
        ks.forEach(k=>used.add(k));r[0]--;set.push(c);dfs(j+1,total([T,c.v]));set.pop();r[0]++;ks.forEach(k=>used.delete(k))}
      if(cut)return}
  })(0,total(fs?[base,fs.v]:[base]));
  return{set:bs,cut}}
const fmt=(k,v)=>{if(BOOL.has(k))return'Yes';if(/Factor|Regen|Crit/.test(k)&&!/^Max|Block Points/.test(k)){const x=Math.round(v*1000)/10;return(x>0?'+':'')+x+'%'}return String(Math.round(v*100)/100)};
const n2=(x,d=1)=>(Math.round(x*10**d)/10**d).toLocaleString('en',{maximumFractionDigits:d});
const GOALS={exp:['Damage per hit (with crits)',v=>n2(v,2)],hit:['Hit damage',v=>n2(v,2)],crit:['Crit hit damage',v=>n2(v,2)],hp:['Max HP',v=>n2(v,0)],def:['Defense (hits you can take, any hit size)',v=>n2(v,2)],sta:['Max stamina',v=>n2(v,0)],spd:['Movement speed',v=>'×'+n2(v,3)],custom:['Custom score',v=>n2(v,2)]};
function run(){
  last=null;
  const p=params(),f=scorer(p);
  for(const[id,sh]of[['f-hp',['def']],['f-cus',['custom']]])$(id).classList.toggle('hide',!sh.includes(p.goal));/* base damage / crit / HP come from the Skill Tree, so only the Defense and custom-weight fields ever show */
  $('f-rng').classList.toggle('hide',p.goal!=='def');
  let base0=DATA.items.filter(i=>!isW(i)),wb0=DATA.items.filter(i=>isW(i)&&(!i.rq||!DATA.race||i.rq.includes(DATA.race)));
  if(exSet.size){base0=base0.filter(i=>!exSet.has(i.n));wb0=wb0.filter(i=>!exSet.has(i.n))}
  const items=$('owned').checked?base0.filter(i=>ownedSet.has(i.n)):base0;
  let C=items.map(i=>({...i,v:itv(i)})),fi=null,L=[];
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
  /* toolbar weapon: one choice outside the 5 item slots, picked by hand or by the calculation */
  const wOn=$('wpn').checked,wAuto=wOn&&$('wcalc').checked,wsel=$('wsel'),wv=i=>({...i,v:itv(i)}),
    wl=wOn?($('owned').checked?wb0.filter(i=>ownedSet.has(i.n)):wb0).slice().sort((a,b)=>b.r-a.r||a.n.localeCompare(b.n)):[];
  $('l-wcalc').classList.toggle('hide',!wOn);$('l-wsel').classList.toggle('hide',!wOn||wAuto);
  let fw=null;
  if(wOn){const sig=wl.map(i=>i.n).join('|');
    if(sig!==wsel.dataset.sig){const keep=wsel.value;wsel.dataset.sig=sig;wsel.innerHTML='';
      wl.forEach(i=>wsel.add(new Option(i.n+' · '+i.c,i.n)));
      if(!wl.length)wsel.add(new Option('No weapon matches the filters',''));
      if(wl.some(i=>i.n===keep))wsel.value=keep}
    if(!wAuto){const x=wl.find(i=>i.n===wsel.value);fw=x?wv(x):null}}
  const pruneW=a=>a.filter((x,i)=>!a.some((y,j)=>j!==i&&y.v.every((q,d)=>q>=x.v[d])&&(y.v.some((q,d)=>q>x.v[d])||j<i)));
  const tOn=$('tit').checked,rOn=$('runes-on').checked,SKV=skVecs(),BASE=total([tOn?collVec():new Array(D).fill(0),SKV.rv]);let TP=[],RP=[];
  $('l-town').classList.toggle('hide',!tOn);
  if(tOn){const own=$('town').checked;
    const cand=TT.filter(t=>Object.keys(t.b).length&&!exSet.has('t:'+t.i)&&(!own||TOWN.has(t.i))).map(t=>({T:1,i:t.i,n:t.n,k:'Title',r:TR[t.r]||1,rar:t.r,lock:!TOWN.has(t.i),v:tvec(TOWN.has(t.i)?t.b:tadd(t.b,t.cb))}));
    TP=cand}
  if(rOn)RP=RUNES.map(r=>({R:1,id:r.id,n:ruName(r),k:'Rune',r:r.rar,rune:r,v:ruVec(r)})).filter(c=>c.v.some(x=>x>0));
  /* titles and runes have a few slots and no category rules, so a candidate that enough others match or beat on every stat the goal reads can never be needed
     (a stat counts as read when adding some of it to the base, or to a well stocked base, changes the score) */
  {const all=[...TP,...RP,...C],mx=new Array(D).fill(0),top=new Array(D).fill(0);
    all.forEach(c=>c.v.forEach((x,d)=>{if(x>mx[d])mx[d]=x}));
    for(let d=0;d<D;d++)top[d]=[...C,...TP,...RP].map(c=>c.v[d]).sort((a,b)=>b-a).slice(0,5).reduce((a,x)=>a+x,0);
    const rich=total([BASE,top]),f0=f(BASE),f1=f(rich),rel=mx.map((m,d)=>{if(!m)return false;
      const up=(B,v)=>{const U=B.slice();U[d]+=m;return f(U)>v+1e-9*(1+Math.abs(v))};return up(BASE,f0)||up(rich,f1)});
    const thin=(cand,K)=>cand.filter((a,x)=>cand.filter((b,y)=>y!==x&&rel.every((r,d)=>!r||b.v[d]>=a.v[d])&&(rel.some((r,d)=>r&&b.v[d]>a.v[d])||y<x)).length<K);
    TP=thin(TP,TSLOTS);RP=thin(RP,RSLOTS);
    /* items (with one item per category on): an item is never needed when another item of its category, that clashes with no more than it does, matches or beats it on every stat the goal reads. Lanterns are kept for the lantern choice */
    if(oc)C=C.filter((a,x)=>a.s.Illumination>0||!C.some((b,y)=>y!==x&&b.k===a.k&&(!b.x||b.x===a.x)&&rel.every((r,d)=>!r||b.v[d]>=a.v[d])&&(rel.some((r,d)=>r&&b.v[d]>a.v[d])||y<x)));
    /* the rune slots are filled as one unit: every trio of the remaining runes, keeping only trios no other trio beats on every stat the goal reads */
    if(RP.length){const k=Math.min(RSLOTS,RP.length),tr=[],rd=rel.map((r,d)=>r?d:-1).filter(d=>d>=0);
      (function mk(from,acc){if(acc.length===k){const v=total(acc.map(c=>c.v));tr.push({R:1,id:acc.map(c=>c.id).join('+'),parts:acc,v,k:'Rune',z:rd.reduce((a,d)=>a+v[d],0)});return}
        for(let j=from;j<RP.length;j++)mk(j+1,acc.concat(RP[j]))})(0,[]);
      tr.sort((a,b)=>b.z-a.z);const sky=[];
      tr.forEach(a=>{if(!sky.some(b=>rd.every(d=>b.v[d]>=a.v[d])))sky.push(a)});
      RP=sky}}
  /* B = what is already counted (titles, the weapon); lb = a score the search has to beat */
  const pick=(pool,one,B,lb)=>{let r={set:null};for(let S=5;S>0&&!r.set;S--)r=solve(pool.concat(TP,RP),f,S,oc,one,B||BASE,Math.min(TSLOTS,TP.length),lb,RP.length?1:0);return r};
  const lanternSearch=(B,lb)=>{
    if(auto&&L.length){
      let res={set:null},bs=lb===undefined?-Infinity:lb,cut=false;
      for(const l of L){const one=C.find(c=>c.n===l.n);if(!one)continue;
        const r=pick(C.filter(c=>c!==one),one,B,bs>-Infinity?bs:undefined);cut=cut||r.cut;
        if(r.set){const sc=f(total([B,...r.set.map(c=>c.v)]));if(sc>bs+1e-12){bs=sc;res=r}}}
      res.cut=cut;return res}
    return pick(C,fi,B,lb)};
  /* with a weapon: try each one (those another weapon beats on every stat are skipped) and keep the best result */
  const weaponSearch=(ws,search)=>{let res={set:null},wb=null,bs=-Infinity,cut=false;
    ws.slice().sort((a,b)=>f(total([BASE,b.v]))-f(total([BASE,a.v]))).forEach(w=>{const B=total([BASE,w.v]),r=search(B,bs>-Infinity?bs:undefined);cut=cut||r.cut;
      if(r.set){const sc=f(total([B,...r.set.map(c=>c.v)]));if(sc>bs+1e-12){bs=sc;res=r;wb=w}}});
    res.cut=cut;return{res,wb}};
  const wcands=wOn?(wAuto?pruneW(wl.map(wv)):(fw?[fw]:[])):[];
  let res,wch=null;
  if(wcands.length){const x=weaponSearch(wcands,lanternSearch);res=x.res;wch=x.wb}
  else res=lanternSearch(BASE);
  const out=$('out');
  if(!res.set){out.innerHTML='<div class="empty">No items match these filters.</div>';$('o-res').innerHTML='';$('o-body').classList.remove('has-res');syncLoBar();return}
  const set=res.set.filter(c=>!c.T&&!c.R).sort((a,b)=>a.c.localeCompare(b.c)||a.k.localeCompare(b.k)),tis=res.set.filter(c=>c.T).sort((a,b)=>a.n.localeCompare(b.n)),rus=res.set.filter(c=>c.R).flatMap(c=>c.parts).sort((a,b)=>b.r-a.r||a.n.localeCompare(b.n));
  last={set:set.slice(),tis:tis.slice(),rus:rus.slice(),wch};
  const lo=LO.list[LO.sel],cur=lo.items.filter(c=>wOn||!isW(byName[c.n])).map(c=>vec(byName[c.n],c.t,c.rf)),
    ctv=tOn?lo.titles.map(i=>tById[i]).map(t=>tvec(TOWN.has(t.i)?t.b:tadd(t.b,t.cb))):[],crv=rOn?(lo.runes||[]).map(ruById).filter(Boolean).map(ruVec):[],emp=!cur.length&&!ctv.length&&!crv.length;
  const T=total([BASE,...set.map(c=>c.v),...tis.map(c=>c.v),...rus.map(c=>c.v),...(wch?[wch.v]:[])]),TC=total([BASE,...cur,...ctv,...crv]);
  const g=GOALS[p.goal];
  const sc=f(T);
  const qx=k=>`<label class="qx"><input type="checkbox" data-qx="${esc(k).replace(/"/g,'&quot;')}">Exclude</label>`;
  /* each card carries its own stats (stats are read at the tier and refine chosen on the left) */
  const cst=c=>{if(c.T){const t=tById[c.i];return stList(t.b)+(Object.keys(t.cb).some(k=>t.cb[k])?`<h4 class="c-lbl">Collection bonus</h4>${stList(t.cb)}`:'')}
    const o={};ST.forEach((k,d)=>{if(c.v[d])o[k]=c.v[d]});return stList(o)};
  const otile=(c,key,on,pic)=>`<div class="row r${c.r}${on?' on':''}${pic===null?' tt':''}" style="--rc:${RC[c.r]||RC[1]}">${pic===null?'':`<span class="pic">${pic}</span>`}<span class="nm">${esc(c.n)}</span>${cst(c)}${key==null?'':qx(key)}</div>`;
  if(lastEx&&!exSet.has(lastEx.k))lastEx=null;
  const exNote=lastEx?`<p class="hint exnote">Excluded <b>${esc(lastEx.name)}</b> from the calculation. <button type="button" class="btn" data-undo>Undo</button></p>`:'';
  const card=c=>otile(c,c.n,ownedSet.has(c.n),ico(c));
  const tcard=c=>otile(c,'t:'+c.i,!c.lock,null);
  /* Titles (3 cards) and the Weapon (1 card) sit side by side, lined up with the item grid above; they stack when the panel is too narrow (see .tw-row in style.css) */
  const tsec=tOn?`<section class="tw-t"><h2 class="sub">Titles</h2>${tis.length?`<div class="slots cat-grid">${tis.map(tcard).join('')}</div>`:'<p class="hint">No title adds anything for this goal.</p>'}</section>`:'';
  const wsec=wch?`<section class="tw-w"><h2 class="sub">Weapon</h2><div class="slots cat-grid">${card(wch)}</div></section>`:'';
  const rcard=c=>otile(c,null,true,ruImg(c.rune.kind));
  const rsec=rOn?`<h2 class="sub">Runes</h2>${rus.length?`<div class="slots cat-grid">${rus.map(rcard).join('')}</div>`:`<p class="hint">${RUNES.length?'No rune adds anything for this goal.':'You have no runes yet. Add the ones you own on My items.'}</p>`}`:'';
  const twrow=tsec||wsec?`<div class="tw-row${tsec&&wsec&&tis.length?' side n'+tis.length:''}">${tsec}${wsec}</div>`:'';
  const dl=(t,c)=>`<em class="num ${c}">(${t})</em>`;
  const li=(l,v,d,key,ic)=>`<li class="${key?'key':''}"><span class="rn">${ic||''}${l}</span><span class="rv"><b class="num">${v}</b>${d}</span></li>`;
  const sd=(k,v)=>{const s=fmt(k,v);return BOOL.has(k)||/^[+-]/.test(s)?s:'+'+s};
  const TD=T.map((x,d)=>x+SKV.fd[d]),TCD=TC.map((x,d)=>x+SKV.fd[d]);/* totals shown include the tree stats that sit in the base fields */
  const sr=ST.map((k,d)=>[k,d]).filter(([k,d])=>TD[d]||(!emp&&TCD[d])).map(([k,d])=>li(esc(k),fmt(k,TD[d]),emp||TD[d]===TCD[d]?'':dl(sd(k,TD[d]-TCD[d]),TD[d]>TCD[d]?'up':'dn'),false,`<span class="si">${DATA.si&&DATA.si[k]?`<img src="icons/${DATA.si[k]}.png" alt="" onerror="this.remove()">`:''}</span>`)).join('');
  out.innerHTML=`<div class="head"><h2>Best ${set.length} for ${g[0].toLowerCase()}</h2><button type="button" class="btn pri" id="lo-equip" title="Equip suggested set to ${attr(loName(LO.sel))}">Equip to ${esc(loName(LO.sel))}</button></div>
  ${exNote}${res.cut?'<p class="warn">Search hit its time limit, so this may not be the exact best set.</p>':''}
  <div class="slots cat-grid">${set.map(card).join('')}</div>
  ${twrow}
  ${rsec}`;
  $('o-res').innerHTML=`<h2 class="sub">Stat totals</h2><ul class="rs">${sr}</ul>`;
  $('o-body').classList.add('has-res');syncLoBar()}
/* the Optimizer recalculates when a field is committed (focus lost or Enter), not on every keystroke, so typing never lags */
let tm;document.addEventListener('change',()=>{clearTimeout(tm);tm=setTimeout(run,120)});

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
let curCat=CATS[0],sel=-1,dT=3,dR=0;/* sel = item shown in the detail window; dT / dR = tier and refine shown there *//* My items shows one category at a time; searching or filtering shows matches from all of them */
const bf=o=>Object.keys(o).map(k=>k+' '+fmt(k,o[k])).join(', ');
const rowHtml=i=>{const e=ENT[i],it=e.it,r=e.T?(TR[it.r]||1):it.r;
  return`<button type="button" class="row r${r}${e.T?' tt':''}" data-i="${i}" style="--rc:${RC[r]||RC[1]}" aria-pressed="false">${e.T?'':`<span class="pic">${ico(it)}</span>`}<span class="nm">${esc(it.n)}</span></button>`};
$('items-cats').innerHTML=CATS.map(c=>{const ix=ENT.map((_,i)=>i).filter(i=>ENT[i].cat===c);
  return`<section class="cat" data-c="${esc(c)}"><div class="cat-head"><h2>${esc(c)}<span class="num" data-cc></span></h2><div class="cat-btns"><button type="button" class="btn" data-a="on">Tick shown</button><button type="button" class="btn" data-a="off">Untick shown</button></div></div><div class="cat-grid">${ix.map(rowHtml).join('')}</div></section>`}).join('');
$('pg-chips').innerHTML='<button type="button" class="btn hide" id="pg-exchip" aria-pressed="false" data-exchip>Unincluded <span class="num" id="pg-exnum"></span></button>'+[...CATS,'Runes'].map(c=>`<button type="button" class="btn" data-chip="${esc(c)}">${esc(c)} <span class="num"></span></button>`).join('');
const pgRows=[];document.querySelectorAll('#items-cats .row').forEach(l=>{pgRows[+l.dataset.i]=l});
const pgSecs=[...document.querySelectorAll('#items-cats .cat')];
/* detail window: shown only while an item is selected, laid out like the game's item tooltip */
const gfmt=(k,v)=>{if(BOOL.has(k))return'Yes';if(/Factor|Regen/.test(k))return(Math.round((1+v)*10000)/10000)+'x';
  if(k==='Crit Chance'||k==='Crit Resistance'){const x=Math.round(v*1000)/10;return(x>0?'+':'')+x+'%'}const x=Math.round(v*100)/100;return(x>0?'+':'')+x};
const stRow=(k,v)=>`<li><span class="si">${DATA.si&&DATA.si[k]?`<img src="icons/${DATA.si[k]}.png" alt="" onerror="this.remove()">`:''}</span><b>${gfmt(k,v)}</b> <i>(${esc(k)})</i></li>`;
const stList=o=>{const ks=Object.keys(o).filter(k=>o[k]);return ks.length?`<ul class="d-st">${ks.map(k=>stRow(k,o[k])).join('')}</ul>`:'<p class="hint">No stats.</p>'};
const opts=(a,v)=>a.map(x=>`<option value="${x[0]}"${x[0]===v?' selected':''}>${x[1]}</option>`).join('');
function selectItem(i){sel=i===sel?-1:i;if(sel>=0&&!ENT[sel].T){const r=trOf(ENT[sel].it);dT=r.t;dR=r.rf}renderDetail()}
function setTR(it,patch){trS[it.n]={...trOf(it),...patch};saveTr();rerun()}
const curSel=()=>view==='items'?sel:-1,curBox=()=>$('i-detail');
function closeDetail(){sel=-1;renderDetail()}
function syncDetail(){const s=curSel();if(s<0)return;const e=ENT[s],b=curBox(),p=b.querySelector('[data-dp]'),x=b.querySelector('[data-dx]');if(p)p.checked=isOwn(e);if(x)x.checked=exSet.has(e.key)}
function renderDetail(){
  const isI=view==='items',s=curSel(),box=curBox();
  if(isI)pgRows.forEach((r,i)=>{if(r){r.classList.toggle('sel',i===sel);r.setAttribute('aria-pressed',i===sel)}});
  $(isI?'i-body':'o-body').classList.toggle('has-sel',s>=0);box.classList.toggle('hide',s<0);
  if(s<0){box.innerHTML='';return}
  const e=ENT[s],it=e.it,r=e.T?(TR[it.r]||1):it.r,rw=e.T?it.r:(RN[it.r]||'');let body;
  if(e.T)body=`<dl class="d-meta"><dt>Type</dt><dd>${esc(it.c)}</dd></dl><h4>Stats (when equipped)</h4>${stList(it.b)}<h4>Collection bonus</h4>${stList(it.cb)}`;
  else{const P=DATA.pass||{},pa=it.ser&&P.items?[P.items[it.ser],['Top','Bottom'].includes(it.k)?P.outfit[it.ser]:null].filter(Boolean):[];
    const rows=[it.g?['Tier',`<div class="rad" role="radiogroup" aria-label="Tier">${[1,2,3].map(x=>`<label><input type="radio" name="dt" value="${x}" data-dt${x===dT?' checked':''}>Tier ${x}</label>`).join('')}</div>`]:null,
      it.rf?['Refine',`<select data-dr aria-label="Refine level">${opts(Array.from({length:11},(_,x)=>[x,'+'+x]),dR)}</select>`]:null,
      it.cl?['Class',esc(it.cl)]:null,['Slot',esc(it.k)],it.ser?['Set',esc(it.ser)]:null,it.rq||it.br||it.da?['Requires',esc([it.rq&&it.rq.join(' / '),it.br,it.da].filter(Boolean).join(' · '))]:null,it.fl?['Availability',esc(it.fl)]:null,it.pr?['Cost',esc(Object.keys(it.pr).map(k=>k+' ×'+it.pr[k]).join(', '))]:null].filter(Boolean);
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
  $('pg-total').textContent=ownText();
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
  const rn=ruFilter(w,f);$('ru-cat').classList.toggle('hide',srch?!rn:curCat!=='Runes');/* Runes show on their own chip, or among search results when they match */
  const shown=pgRows.filter(r=>r&&!r.classList.contains('hide')&&!r.closest('.cat').classList.contains('hide')).length+($('ru-cat').classList.contains('hide')?0:rn);
  $('pg-empty').classList.toggle('hide',shown>0||(!srch&&curCat==='Runes'));$('pg-shown').textContent='· '+shown+' shown'}
function setMany(ixs,on){ixs.forEach(i=>{const e=ENT[i],set=e.T?TOWN:ownedSet,n=e.T?e.it.i:e.it.n;on?set.add(n):set.delete(n)});saveOwned();saveTown();syncOwn();rerun()}
function setEx(ixs,on){ixs.forEach(i=>{const k=ENT[i].key;on?exSet.add(k):exSet.delete(k)});saveEx();syncEx();pgFilter();rerun()}
function clearEx(){exSet.clear();saveEx();syncEx();pgFilter();rerun()}
function resetOwn(){ownedSet=new Set(DATA.owned);TOWN=new Set(DATA.titlesOwned||[]);trS={};try{localStorage.removeItem(OWN_KEY);localStorage.removeItem(TOWN_KEY);localStorage.removeItem(TR_KEY)}catch(e){}if(sel>=0&&!ENT[sel].T){const r=trOf(ENT[sel].it);dT=r.t;dR=r.rf;renderDetail()}syncOwn();pgFilter();rerun()}
const shownIx=(rows,root)=>rows.map((r,i)=>i).filter(i=>rows[i]&&!rows[i].classList.contains('hide')&&!rows[i].closest('.cat').classList.contains('hide')&&(!root||root.contains(rows[i])));
/* events */
$('items-page').addEventListener('input',e=>e.stopPropagation());$('items-page').addEventListener('change',e=>e.stopPropagation());
$('items-cats').addEventListener('click',e=>{const t=e.target.closest('.row');if(t)selectItem(+t.dataset.i)});
for(const id of['i-detail']){const bx=$(id);
  bx.addEventListener('change',e=>{const t=e.target,s=curSel();if(s<0)return;
    if(t.matches('[data-dp]'))setMany([s],t.checked);else if(t.matches('[data-dx]'))setEx([s],t.checked);
    else if(t.matches('[data-dt]')){dT=+t.value;setTR(ENT[s].it,{t:dT});renderDetail();const c=bx.querySelector('[data-dt]:checked');if(c)c.focus()}else if(t.matches('[data-dr]')){dR=+t.value;setTR(ENT[s].it,{rf:dR});renderDetail()}});
  bx.addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeDetail()})}
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
let renaming=-1;/* index of the loadout being renamed inline, or -1 */
const attr=t=>esc(t).replace(/"/g,'&quot;');
function renderLoBar(){
  const many=LO.list.length>2;
  $('lo-tabs').innerHTML=LO.list.map((l,i)=>`<div class="lo-tab${i===LO.sel?' on':''}">${i===renaming
    ?`<input type="text" class="lo-edit" data-lo-edit="${i}" maxlength="24" autocomplete="off" value="${attr(l.name)}" placeholder="Loadout ${i+1}" aria-label="Rename ${attr(loName(i))}">`
    :`<button type="button" class="lo-pick" data-lo="${i}" aria-pressed="${i===LO.sel}">${esc(loName(i))}</button><span class="lo-opts"><button type="button" class="btn lo-ren" data-lo-ren="${i}">Rename</button>${many?`<button type="button" class="lo-x" data-lo-del="${i}" aria-label="Delete ${attr(loName(i))}">×</button>`:''}</span>`}</div>`).join('');
  $('lo-n').textContent=LO.list.length;
  const ed=$('lo-tabs').querySelector('[data-lo-edit]');if(ed){ed.focus();ed.select()}
  syncLoBar()}
function endRename(i,val){if(renaming!==i)return;renaming=-1;if(val!==null){LO.list[i].name=val.slice(0,24);saveLo()}renderLoBar()}
$('lo-tabs').addEventListener('input',e=>e.stopPropagation());$('lo-tabs').addEventListener('change',e=>e.stopPropagation());
$('lo-tabs').addEventListener('keydown',e=>{const t=e.target.closest('[data-lo-edit]');if(!t)return;
  if(e.key==='Enter')endRename(+t.dataset.loEdit,t.value);else if(e.key==='Escape')endRename(+t.dataset.loEdit,null)});
$('lo-tabs').addEventListener('focusout',e=>{const t=e.target.closest&&e.target.closest('[data-lo-edit]');if(t)endRename(+t.dataset.loEdit,t.value)});
function syncLoBar(){
  const b=$('lo-equip');if(!b)return;/* the button is drawn with the results */
  b.disabled=!last;b.textContent='Equip to '+loName(LO.sel);b.title='Equip suggested set to '+loName(LO.sel)}
function pickLo(i){LO.sel=i;saveLo();renderLoBar();clearTimeout(tm);run()}
$('lo-tabs').addEventListener('click',e=>{
  const x=e.target.closest('[data-lo-del]'),b=e.target.closest('[data-lo]'),r=e.target.closest('[data-lo-ren]');
  if(r){renaming=+r.dataset.loRen;renderLoBar();return}
  if(x){renaming=-1;if(LO.list.length<=2)return;const i=+x.dataset.loDel;
    if(!confirm('Delete "'+loName(i)+'"?'))return;
    LO.list.splice(i,1);if(i<LO.sel)LO.sel--;LO.sel=Math.min(LO.sel,LO.list.length-1);saveLo();renderLoBar();clearTimeout(tm);run()}
  else if(b)pickLo(+b.dataset.lo)});
$('lo-add').onclick=()=>{let k=LO.list.length+1;while(LO.list.some(l=>l.name.trim()==='Loadout '+k))k++;
  LO.list.push({name:'Loadout '+k,items:[],titles:[],runes:[]});pickLo(LO.list.length-1)};
$('out').addEventListener('click',e=>{if(!e.target.closest('#lo-equip')||!last)return;const lo=LO.list[LO.sel];
  lo.items=last.set.concat(last.wch?[last.wch]:[]).map(c=>{const r=trOf(c);return{n:c.n,t:r.t,rf:r.rf}});lo.titles=last.tis.map(c=>c.i);lo.runes=last.rus.map(c=>c.id);saveLo();clearTimeout(tm);run()});
/* Skill Tree page: a slider for every stat that has levels, a switch for every single node. Built once, then updated in place so dragging a slider is not interrupted */
const skBuilt={};
const skRoman=n=>['','I','II','III'][n]||'';
const skAmt=(b,x)=>b.pc?'+'+R6(Math.round(x*1000)/10)+'%':'+'+R6(Math.round(x*100)/100);
const skLvl=(b,n)=>b.st.slice(0,n).reduce((a,s)=>a+(s.s[Object.keys(b.st[0].s)[0]]||0),0);
const skGrps=()=>[...new Set(TB.map(b=>b.grp))];
function skCardHtml(b){
  const tog=b.st.length===1&&!b.asc,n=b.st.length,pic=`<span class="tr-pic"><b aria-hidden="true">${esc(b.n[0])}</b>${b.ic?`<img class="tr-ic" src="icons/${b.ic}.png" alt="" loading="lazy" onload="this.previousElementSibling.remove()" onerror="this.remove()">`:''}</span>`;
  /* one-level nodes: an On/Off switch in the header row, level with the skill name. Others: a thin grey line with a thin vertical mark for every step */
  const sw=tog?`<label class="row tr-sw"><span data-sw></span><input type="checkbox" data-sk="${attr(b.id)}" aria-label="${attr(b.n)}"></label>`:'';
  const rng=tog?'':`<div class="tr-rng"><span class="tr-ticks" aria-hidden="true">${Array.from({length:n+1},(_,k)=>`<i style="left:${k/n*100}%"></i>`).join('')}</span><input type="range" min="0" max="${n}" step="1" value="0" data-sk="${attr(b.id)}" aria-label="${attr(b.n)} level"></div>`;
  /* the unlock requirement is its own footer, pinned to the bottom of the card */
  return`<div class="tr-card" data-b="${attr(b.id)}"><div class="tr-top">${pic}<div class="tr-bd"><div class="tr-hd"><b class="tr-t" data-t></b><span class="tr-lv num" data-lv></span>${sw}</div><p class="tr-sub" data-sub></p>${rng}</div></div><p class="tr-need" data-need></p></div>`}
function skBuild(){
  const gs=skGrps();
  $('tree-page').innerHTML=`<div class="panel"><div class="head"><h2>Skill Tree</h2><span class="cat-btns"><button type="button" class="btn" id="sk-save">Reset to save</button><button type="button" class="btn" id="sk-clear">Clear all</button></span></div>
<ul class="tr-sum" id="sk-sum"></ul><p class="hint" id="sk-note"></p></div>`
   +gs.map(g=>`<section class="panel"><div class="head"><h2>${esc(tBy[g].n)}</h2></div><div class="tr-grid">${TB.filter(b=>b.grp===g).map(skCardHtml).join('')}</div></section>`).join('');
  document.querySelectorAll('#tree-page .tr-card').forEach(c=>skBuilt[c.dataset.b]=c)}
function skRefresh(){
  TB.forEach(b=>{const c=skBuilt[b.id],lv=SK[b.id],ok=skOk(b),n=b.st.length,tog=n===1&&!b.asc,inp=c.querySelector('[data-sk]');
    c.classList.toggle('on',lv>0);c.classList.toggle('lock',!ok);inp.disabled=!ok;
    if(tog){inp.checked=lv>0;c.querySelector('[data-t]').textContent=b.n;c.querySelector('[data-sub]').textContent=b.d;c.querySelector('[data-sw]').textContent=lv>0?'On':'Off';c.querySelector('[data-lv]').textContent=''}
    else{if(+inp.value!==lv)inp.value=lv;c.querySelector('[data-lv]').textContent='Lv '+lv+' / '+n;
      if(b.asc){c.querySelector('[data-t]').textContent=b.n+(lv?' '+skRoman(lv):'');c.querySelector('[data-sub]').textContent=b.d[Math.max(lv,1)-1]+' You can follow only one Ascension.'}
      else{c.querySelector('[data-t]').textContent=skAmt(b,skLvl(b,lv))+' '+b.t;c.querySelector('[data-sub]').textContent=b.n}}
    const need=skNeeds(b).map(q=>`<span class="${SK[q.id]>=q.at?'yes':'no'}">${esc(tBy[q.id].n)} Lv ${q.at}</span>`),g=b.st[Math.max(lv,1)-1].g;
    c.querySelector('[data-need]').innerHTML=(need.length?'Needs '+need.join(' + '):'')+(g?(need.length?' · ':'')+'<span class="mute">Character Lv '+g+'</span>':'')});
  const o=skBase(),sp=TB.reduce((a,b)=>a+b.st.slice(0,SK[b.id]).reduce((x,s)=>x+s.c,0),0);
  $('sk-sum').innerHTML=[['Base hit damage',R6(o.base)],['Base crit chance',R6(o.cc*100)+'%'],['Base crit bonus',R6(o.cb*100)+'%'],['Base max HP',R6(o.hp)],['Skill points spent',sp]]
    .map(([k,v])=>`<li><span>${k}</span> <b class="num">${v}</b></li>`).join('');
  $('sk-note').textContent='The Optimizer uses these as your base stats. Character level requirements are shown but not checked.'}
function skRender(){if(!$('sk-sum'))skBuild();skRefresh()}
$('tree-page').addEventListener('change',e=>e.stopPropagation());
$('tree-page').addEventListener('input',e=>{e.stopPropagation();const t=e.target,id=t.dataset&&t.dataset.sk;if(!id)return;
  const b=tBy[id];let v=t.type==='checkbox'?(t.checked?1:0):+t.value;if(!skOk(b))v=0;SK[id]=v;
  if(b.asc&&v>0)TB.forEach(o=>{if(o.asc&&o!==b)SK[o.id]=0});/* only one Ascension */
  skFix();skSave();skRefresh();rerun()});
$('tree-page').addEventListener('click',e=>{const a=e.target.closest('#sk-save'),z=e.target.closest('#sk-clear');if(!a&&!z)return;
  TB.forEach(b=>SK[b.id]=a?Math.min(b.st.length,TREE.save[b.id]||0):0);skFix();skSave();skRefresh();rerun()});
/* page routing: #optimizer (default), #my-items and #skill-tree */
function route(){const h=location.hash,pg=h==='#my-items',tr=h==='#skill-tree',op=!pg&&!tr;view=pg?'items':tr?'tree':'opt';
  document.querySelector('.wrap').classList.toggle('hide',!op);$('items-page').classList.toggle('hide',!pg);$('tree-page').classList.toggle('hide',!tr);
  [['nav-opt',op],['nav-items',pg],['nav-tree',tr]].forEach(([id,on])=>$(id).setAttribute('aria-current',on?'page':'false'));
  if(tr)skRender();
  if(op&&dirty){dirty=false;run()}}
window.addEventListener('hashchange',()=>{route();window.scrollTo(0,0)});
/* Runes on My items: a tile for every owned rune, an Add rune button, and a window to type a rune's stats in (styled like Genshin Optimizer's stat rows: icon + name, then the value) */
const siImg=k=>DATA.si&&DATA.si[k]?`<img src="icons/${DATA.si[k]}.png" alt="" onerror="this.remove()">`:'';
const ruImg=kind=>{const K=RUD.kinds[kind];return K&&K.ic?`<img class="ic" src="icons/${K.ic}.png" alt="" loading="lazy" onerror="this.remove()">`:''};
const ruRg=(k,rar)=>{const[x,y]=ruRange(k,rar);return ruShow(k,x)+' – '+ruShow(k,y)};
const ownText=()=>DATA.items.filter(i=>ownedSet.has(i.n)).length+' of '+DATA.items.length+' items owned · '+TT.filter(t=>TOWN.has(t.i)).length+' of '+TT.length+' titles unlocked · '+RUNES.length+' rune'+(RUNES.length===1?'':'s');
const ruTile=r=>{const v=ruVec(r),o={};ST.forEach((k,d)=>{if(v[d])o[k]=v[d]});
  const q=[ruName(r),r.kind,RUD.rar[r.rar].n,'rune',...Object.keys(o)].join(' ').toLowerCase();
  return`<button type="button" class="row rt r${r.rar} on" data-r="${attr(r.id)}" data-q="${attr(q)}" style="--rc:${RC[r.rar]||RC[1]}" title="Edit this rune"><span class="pic">${ruImg(r.kind)}</span><span class="nm">${esc(ruName(r))}</span>${stList(o)}</button>`};
function ruPage(){
  const rs=RUNES.slice().sort((a,b)=>b.rar-a.rar||a.kind.localeCompare(b.kind));
  $('ru-cat').innerHTML=`<div class="cat-head"><h2>Runes<span class="num">${RUNES.length} owned</span></h2><div class="cat-btns"><button type="button" class="btn pri" id="ru-add">Add rune</button></div></div>
  ${rs.length?`<div class="cat-grid">${rs.map(ruTile).join('')}</div>`:'<p class="empty">No runes yet. Press Add rune and type in the ones you own. With Include runes on in Settings, the Optimizer picks the best 3.</p>'}`;
  const c=document.querySelector('#pg-chips [data-chip="Runes"] .num');if(c)c.textContent=RUNES.length;
  $('pg-total').textContent=ownText();pgFilter()}
/* search / filter of the Runes section; returns how many rune tiles match */
function ruFilter(w,f){let n=0;$('ru-cat').querySelectorAll('[data-r]').forEach(t=>{const ok=f!=='no'&&!exOnly&&w.every(x=>t.dataset.q.includes(x));t.classList.toggle('hide',!ok);if(ok)n++});return n}
$('ru-cat').addEventListener('click',e=>{if(e.target.closest('#ru-add')){rdOpen('');return}const t=e.target.closest('[data-r]');if(t)rdOpen(t.dataset.r)});
/* the window: RD = {id: the rune's id, or '' while adding, r: a working copy that is only kept on Save} */
const rdlg=$('rune-dlg');let RD=null;
function rdRow(k,val,f,j,ops){
  const nm=`<span class="sr-ic">${k?siImg(k):''}</span><span class="sr-nm">${k?esc(k)+(ruPct(k)?' (%)':''):'Pick a substat'}</span>`,
    left=ops?`<label class="sr-n sel${k?'':' empty'}">${nm}<svg class="sr-cv" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg><select data-rd="ss" data-j="${j}" aria-label="Substat ${j+1}"><option value="">None</option>${ops.map(o=>`<option value="${attr(o)}"${o===k?' selected':''}>${esc(o)}</option>`).join('')}</select></label>`:`<div class="sr-n">${nm}</div>`;
  return`<div class="sr">${left}<input type="number" step="any" min="0" inputmode="decimal" value="${attr(val)}" placeholder="${k?ruRg(k,RD.r.rar):''}" aria-label="${attr(k||'Substat')} value" ${k?'':'disabled '}data-rd="${f}"${j===undefined?'':` data-j="${j}"`}></div>`}
function rdRender(){
  const r=RD.r,K=RUD.kinds[r.kind],ok=ruOpts(r);
  $('rd-body').style.setProperty('--rc',RC[r.rar]||RC[1]);
  $('rd-body').innerHTML=`<div class="dlg-head"><h2 id="rd-title">${RD.id?'Edit rune':'Add rune'}</h2><button type="button" class="icon-btn" data-rd-x aria-label="Close" title="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  <div class="rd-top"><span class="rd-pic">${ruImg(r.kind)}</span><div class="rd-id"><b class="rd-nm">${esc(ruName(r))}</b><span class="hint">${esc(K.passive)} passive</span></div></div>
  <fieldset><legend>Rune</legend><div class="rd-kinds">${Object.keys(RUD.kinds).map(k=>`<button type="button" class="rd-k${k===r.kind?' on':''}" data-rd-kind="${k}" aria-pressed="${k===r.kind}"><span class="rd-kp">${ruImg(k)}</span>${k}</button>`).join('')}</div></fieldset>
  <fieldset><legend>Rarity</legend><div class="rd-rar">${K.rar.map(x=>`<button type="button" class="rd-r${x===r.rar?' on':''}" data-rd-rar="${x}" aria-pressed="${x===r.rar}" style="--rc:${RC[x]||RC[1]}">${RUD.rar[x].n}</button>`).join('')}</div></fieldset>
  <fieldset><legend>Stats</legend><div class="sr-list">${rdRow(RUD.main,r.hp,'hp')}${rdRow(K.fixed,r.fx,'fx')}${r.subs.map((x,j)=>rdRow(x.s,x.v,'sv',j,ok.filter(k=>k===x.s||!r.subs.some(y=>y.s===k)))).join('')}</div>
  <p class="hint">Type the rune as it shows in game. The grey numbers inside each box are the lowest and highest roll for ${RUD.rar[r.rar].n}.</p></fieldset>
  <div class="dlg-foot rd-foot">${RD.id?'<button type="button" class="btn del" data-rd-del>Delete</button>':''}<span class="sp"></span><button type="button" class="btn" data-rd-x>Cancel</button><button type="button" class="btn pri" data-rd-save>${RD.id?'Save':'Add rune'}</button></div>`}
function rdOpen(id){const src=id&&ruById(id);RD={id:src?src.id:'',r:ruMake(src?JSON.parse(JSON.stringify(src)):{kind:'Carapace',rar:6})};rdRender();rdlg.showModal()}
function rdSave(){const r=RD.r;ruNormalize(r);const i=RUNES.findIndex(x=>x.id===r.id);if(i>=0)RUNES[i]=r;else RUNES.push(r);ruSave();rdlg.close();ruPage();rerun()}
function rdDelete(){if(!confirm('Delete '+ruName(RD.r)+'?'))return;const id=RD.r.id;RUNES=RUNES.filter(x=>x.id!==id);LO.list.forEach(l=>{l.runes=(l.runes||[]).filter(x=>x!==id)});saveLo();ruSave();rdlg.close();ruPage();rerun()}
rdlg.addEventListener('click',e=>{
  if(e.target===rdlg||e.target.closest('[data-rd-x]')){rdlg.close();return}
  const k=e.target.closest('[data-rd-kind]'),x=e.target.closest('[data-rd-rar]');
  if(k){const r=RD.r;if(r.kind!==k.dataset.rdKind){r.kind=k.dataset.rdKind;r.fx='';ruNormalize(r);rdRender()}return}
  if(x){RD.r.rar=+x.dataset.rdRar;ruNormalize(RD.r);rdRender();return}
  if(e.target.closest('[data-rd-save]'))rdSave();else if(e.target.closest('[data-rd-del]'))rdDelete()});
/* typing only fills the working copy: nothing is calculated or redrawn until Save, so the fields never lag */
rdlg.addEventListener('input',e=>{e.stopPropagation();const t=e.target,f=t.dataset&&t.dataset.rd;if(!f)return;const r=RD.r;
  if(f==='hp')r.hp=t.value;else if(f==='fx')r.fx=t.value;else if(f==='sv')r.subs[+t.dataset.j].v=t.value});
rdlg.addEventListener('change',e=>{e.stopPropagation();const t=e.target;
  if(t.dataset&&t.dataset.rd==='ss'){const x=RD.r.subs[+t.dataset.j];if(x.s!==t.value){x.s=t.value;x.v=''}ruNormalize(RD.r);rdRender()}});
rdlg.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input')){e.preventDefault();rdSave()}});
/* "Include runes" lives in Settings */
$('runes-on').checked=RU_ON;
$('runes-on').addEventListener('change',()=>{RU_ON=$('runes-on').checked;ruSave()});
/* settings modal: the rule switches live in a <dialog>; their ids and the "input" listener above are unchanged */
const setDlg=$('settings');
$('set-btn').onclick=()=>setDlg.showModal();
setDlg.addEventListener('click',e=>{if(e.target===setDlg||e.target.closest('[data-dlg-close]'))setDlg.close()});
syncOwn();syncEx();ruPage();renderLoBar();route();
