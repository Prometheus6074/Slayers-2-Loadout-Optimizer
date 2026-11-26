const ST=DATA.stats,D=ST.length,I={};ST.forEach((k,i)=>I[k]=i);
const BOOL=new Set(['Sun Immunity','Cold Immunity']),HI=ST.map(k=>k==='Illumination');
const TM=[1,1.15,1.3],RM=[1,1.05,1.1,1.2,1.3,1.4,1.55,1.7,1.9,2,3];
const RC=['#8c8fa3','#8c8fa3','#4fae6b','#4f8fd6','#a06be0','#e08a3c','#e8c46a','#ef6a6a'];
const $=id=>document.getElementById(id);
const byName=Object.fromEntries(DATA.items.map(i=>[i.n,i]));
const OWN_KEY='ouwland-owned:'+DATA.owned.reduce((h,n)=>{for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))>>>0;return h},7);
let ownedSet=new Set(DATA.owned);
try{const sv=JSON.parse(localStorage.getItem(OWN_KEY));if(Array.isArray(sv))ownedSet=new Set(sv)}catch(e){}
const saveOwned=()=>{try{localStorage.setItem(OWN_KEY,JSON.stringify([...ownedSet]))}catch(e){}};
/* items the user left out of the calculation (kept separate from "owned") */
const EX_KEY='ouwland-excluded';
let exSet=new Set();
try{const sv=JSON.parse(localStorage.getItem(EX_KEY));if(Array.isArray(sv))exSet=new Set(sv.filter(n=>byName[n]))}catch(e){}
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
function solve(C,f,S,oneCat,fs){
  const N=C.length;
  C.forEach(c=>c.sc=f(total([c.v])));C.sort((a,b)=>b.sc-a.sc);
  const top=new Array(N+1);top[N]=ST.map(()=>[]);
  for(let i=N-1;i>=0;i--)top[i]=top[i+1].map((a,d)=>{const b=a.slice(),x=C[i].v[d];if(x>0){b.push(x);b.sort((p,q)=>q-p);if(b.length>5)b.pop()}return b});
  const ub=(T,i,r)=>{const U=T.slice();for(let d=0;d<D;d++){const t=top[i][d];if(HI[d]){if(t.length&&t[0]>U[d])U[d]=t[0]}else for(let q=0;q<r&&q<t.length;q++)U[d]+=t[q]}return f(U)};
  let best=-1,bs=null,nodes=0,cut=false;const used=new Set();
  const keys=c=>{const k=[];if(oneCat)k.push('c:'+c.k);if(c.x)k.push(c.x);return k};
  if(fs)keys(fs).forEach(k=>used.add(k));
  (function dfs(i,set,T){
    const r=S-set.length;
    if(!r){const s=f(T);if(s>best){best=s;bs=set.slice()}return}
    for(let j=i;j<=N-r;j++){
      if(++nodes>3e6){cut=true;return}
      if(ub(T,j,r)<=best+1e-12)break;
      const c=C[j],ks=keys(c);if(ks.some(k=>used.has(k)))continue;
      ks.forEach(k=>used.add(k));set.push(c);dfs(j+1,set,total([T,c.v]));
      set.pop();ks.forEach(k=>used.delete(k));if(cut)return}
  })(0,fs?[fs]:[],fs?total([fs.v]):new Array(D).fill(0));
  return{set:bs,cut}}
const fmt=(k,v)=>{if(BOOL.has(k))return'Yes';if(/Factor|Regen|Crit/.test(k)&&!/^Max|Block Points/.test(k)){const x=Math.round(v*1000)/10;return(x>0?'+':'')+x+'%'}return String(Math.round(v*100)/100)};
const n2=(x,d=1)=>(Math.round(x*10**d)/10**d).toLocaleString('en',{maximumFractionDigits:d});
const GOALS={exp:['Damage per hit (with crits)',v=>n2(v,2)],hit:['Hit damage',v=>n2(v,2)],crit:['Crit hit damage',v=>n2(v,2)],hp:['Max HP',v=>n2(v,0)],def:['Defense (hits you can take, any hit size)',v=>n2(v,2)],sta:['Max stamina',v=>n2(v,0)],spd:['Movement speed',v=>'×'+n2(v,3)],custom:['Custom score',v=>n2(v,2)]};
function run(){
  const p=params(),f=scorer(p),tier=+$('tier').value,rl=+$('refine').value;
  for(const[id,sh]of[['f-dmg',['exp','hit','crit']],['f-hp',['hp','def']],['f-cus',['custom']]])$(id).classList.toggle('hide',!sh.includes(p.goal));
  $('f-rng').classList.toggle('hide',p.goal!=='def');
  let items=DATA.items;
  if($('owned').checked)items=items.filter(i=>ownedSet.has(i.n));
  if($('noevt').checked)items=items.filter(i=>i.fl!=='unobtainable');
  if(exSet.size)items=items.filter(i=>!exSet.has(i.n));
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
  const pick=(pool,one)=>{let r={set:null};for(let S=5;S>0&&!r.set;S--)r=solve(pool.slice(),f,S,oc,one);return r};
  let res;
  if(auto&&L.length){
    res={set:null};let bs=-Infinity,cut=false;
    for(const l of L){const one=C.find(c=>c.n===l.n);if(!one)continue;
      const r=pick(C.filter(c=>c!==one),one);cut=cut||r.cut;
      if(r.set){const sc=f(total(r.set.map(c=>c.v)));if(sc>bs+1e-12){bs=sc;res=r}}}
    res.cut=cut}
  else res=pick(C,fi);
  const out=$('out');
  if(!res.set){out.innerHTML='<div class="empty">No items match these filters.</div>';return}
  const set=res.set.sort((a,b)=>a.c.localeCompare(b.c)||a.k.localeCompare(b.k));
  const T=total(set.map(c=>c.v)),cur=DATA.cur.map(c=>vec(byName[c.n],c.t,c.rf)),TC=total(cur);
  const M=metrics(T,p),MC=metrics(TC,p),g=GOALS[p.goal];
  const sc=f(T),scc=f(TC),dl=scc?(sc/scc-1)*100:0;
  const card=c=>`<div class="slot" style="--rc:${RC[c.r]||RC[1]}"><span class="k">${c.k}</span><h3>${c.n}</h3>
  <div class="tags">${c.cl?`<span class="tag">${c.cl}</span>`:''}${c.ser?`<span class="tag set">${c.ser} set</span>`:''}${ownedSet.has(c.n)?'<span class="tag own">owned</span>':''}${c.fl?`<span class="tag">${c.fl}</span>`:''}</div>
  <ul class="st">${ST.filter((k,d)=>c.v[d]).map(k=>`<li><span>${k}</span><span class="num">${fmt(k,c.v[I[k]])}</span></li>`).join('')}</ul></div>`;
  const dm=[['hit','Hit damage'],['crit','Crit hit'],['exp','Per hit with crits'],['hp','Max HP'],['def','Defense (any hit size)'],['sta','Max stamina'],['spd','Movement speed']];
  const row=(l,a,b,fm,key)=>{const d=b?(a/b-1)*100:0;return`<tr class="${key?'key':''}"><td>${l}</td><td class="num">${fm(a)}</td><td class="num">${fm(b)}</td><td class="num ${d>0.05?'up':d<-0.05?'dn':''}">${Math.abs(d)<0.05?'0%':(d>0?'+':'')+n2(d,1)+'%'}</td></tr>`};
  const sr=ST.map((k,d)=>[k,d]).filter(([k,d])=>T[d]||TC[d]).map(([k,d])=>`<tr><td>${k}</td><td class="num">${fmt(k,T[d])}</td><td class="num">${fmt(k,TC[d])}</td><td class="num ${T[d]>TC[d]?'up':T[d]<TC[d]?'dn':''}">${T[d]===TC[d]?'':fmt(k,T[d]-TC[d])}</td></tr>`).join('');
  out.innerHTML=`<div class="head"><h2>Best ${set.length} for ${g[0].toLowerCase()}</h2><span class="score num">${g[1](sc)}</span></div>
  ${res.cut?'<p class="warn">Search hit its time limit, so this may not be the exact best set.</p>':''}
  <div class="slots">${set.map(card).join('')}</div>
  <div class="tw"><table><thead><tr><th>Result</th><th>Suggested</th><th>Equipped now</th><th>Change</th></tr></thead><tbody>
  ${dm.map(([k,l])=>row(l,M[k],MC[k],GOALS[k][1],k===p.goal)).join('')}
  ${p.goal==='custom'?row('Custom score',sc,scc,v=>n2(v,2),true):''}</tbody></table></div>
  <div class="tw" style="margin-top:12px"><table><thead><tr><th>Stat totals</th><th>Suggested</th><th>Equipped now</th><th>Change</th></tr></thead><tbody>${sr}</tbody></table></div>`}
let tm;document.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(run,120)});

const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const dot=it=>`<span style="color:${RC[it.r]||RC[1]}" aria-hidden="true">●</span>`;
let dirty=true,view='opt',exOnly=false;
const ownAgain=()=>{clearTimeout(tm);tm=setTimeout(run,120)};
const rerun=()=>{view==='opt'?ownAgain():dirty=true};
/* My items page: one section per category */
const CATS=[...new Set(DATA.items.map(i=>i.c))];
const rowHtml=i=>{const it=DATA.items[i],tags=[it.k!==it.c?it.k:'',it.cl,it.fl].filter(Boolean).join(' · ');
  return`<div class="row" data-i="${i}"><label class="own"><input type="checkbox" data-p="${i}">${dot(it)}<span class="nm">${esc(it.n)}</span><span class="k">${esc(tags)}</span></label><label class="ex" title="Do not include in calculation"><input type="checkbox" data-x="${i}">Exclude</label></div>`};
$('items-cats').innerHTML=CATS.map(c=>{const ix=DATA.items.map((_,i)=>i).filter(i=>DATA.items[i].c===c);
  return`<section class="cat" data-c="${esc(c)}"><div class="cat-head"><h2>${esc(c)}<span class="num" data-cc></span></h2><div class="cat-btns"><button type="button" class="btn" data-a="on">Tick shown</button><button type="button" class="btn" data-a="off">Untick shown</button></div></div><div class="cat-grid">${ix.map(rowHtml).join('')}</div></section>`}).join('');
$('pg-chips').innerHTML='<button type="button" class="btn hide" id="pg-exchip" aria-pressed="false" data-exchip title="Show only items left out of the calculation">Unincluded <span class="num" id="pg-exnum"></span></button>'+CATS.map(c=>`<button type="button" class="btn" data-chip="${esc(c)}">${esc(c)} <span class="num"></span></button>`).join('');
const pgRows=[];document.querySelectorAll('#items-cats .row').forEach(l=>{pgRows[+l.dataset.i]=l});
const pgSecs=[...document.querySelectorAll('#items-cats .cat')];
function syncOwn(){
  const tot=DATA.items.filter(i=>ownedSet.has(i.n)).length;
  $('pg-total').textContent=tot+' of '+DATA.items.length+' owned';
  pgRows.forEach((r,i)=>{const o=ownedSet.has(DATA.items[i].n);r.querySelector('[data-p]').checked=o;r.classList.toggle('on',o)});
  pgSecs.forEach(sec=>{const ix=[...sec.querySelectorAll('.row')].map(l=>+l.dataset.i),o=ix.filter(i=>ownedSet.has(DATA.items[i].n)).length;
    sec.querySelector('[data-cc]').textContent=o+' of '+ix.length+' owned';
    document.querySelector(`#pg-chips [data-chip="${sec.dataset.c}"] .num`).textContent=o+'/'+ix.length})}
function syncEx(){
  const n=exSet.size;
  if(!n)exOnly=false;
  pgRows.forEach((r,i)=>{const x=exSet.has(DATA.items[i].n);r.querySelector('[data-x]').checked=x;r.classList.toggle('ex-on',x)});
  $('nav-badge').textContent=n;$('nav-badge').classList.toggle('hide',!n);
  $('nav-items').setAttribute('aria-label',n?'My items, '+n+' left out of the calculation':'My items');
  $('pg-exnum').textContent=n;$('pg-exchip').classList.toggle('hide',!n);
  $('pg-exchip').classList.toggle('active',exOnly);$('pg-exchip').setAttribute('aria-pressed',exOnly);
  $('pg-exclear').classList.toggle('hide',!n)}
function pgFilter(){
  const w=$('pg-q').value.trim().toLowerCase().split(/\s+/),f=$('pg-f').value;let shown=0;
  DATA.items.forEach((it,i)=>{const o=ownedSet.has(it.n),t=[it.n,it.c,it.k,it.cl,it.fl,it.ser].filter(Boolean).join(' ').toLowerCase();
    const ok=w.every(x=>t.includes(x))&&(f==='all'||(f==='yes')===o)&&(!exOnly||exSet.has(it.n));
    pgRows[i].classList.toggle('hide',!ok);if(ok)shown++});
  pgSecs.forEach(sec=>sec.classList.toggle('hide',!sec.querySelector('.row:not(.hide)')));
  $('pg-empty').classList.toggle('hide',shown>0);$('pg-shown').textContent='· '+shown+' shown'}
function setMany(ixs,on){ixs.forEach(i=>{const n=DATA.items[i].n;on?ownedSet.add(n):ownedSet.delete(n)});saveOwned();syncOwn();rerun()}
function setEx(ixs,on){ixs.forEach(i=>{const n=DATA.items[i].n;on?exSet.add(n):exSet.delete(n)});saveEx();syncEx();pgFilter();rerun()}
function clearEx(){exSet.clear();saveEx();syncEx();pgFilter();rerun()}
function resetOwn(){ownedSet=new Set(DATA.owned);try{localStorage.removeItem(OWN_KEY)}catch(e){}syncOwn();pgFilter();rerun()}
const shownIx=(rows,root)=>rows.map((r,i)=>i).filter(i=>rows[i]&&!rows[i].classList.contains('hide')&&(!root||root.contains(rows[i])));
/* events */
$('items-page').addEventListener('input',e=>e.stopPropagation());
$('items-cats').addEventListener('change',e=>{const d=e.target.dataset;if(d.p!=null)setMany([+d.p],e.target.checked);else if(d.x!=null)setEx([+d.x],e.target.checked)});
$('items-cats').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b)setMany(shownIx(pgRows,b.closest('.cat')),b.dataset.a==='on')});
$('pg-chips').addEventListener('click',e=>{if(e.target.closest('[data-exchip]')){exOnly=!exOnly;syncEx();pgFilter();return}
  const b=e.target.closest('[data-chip]');if(!b)return;
  const sec=pgSecs.find(x=>x.dataset.c===b.dataset.chip);if(sec&&sec.scrollIntoView)sec.scrollIntoView({behavior:'smooth',block:'start'})});
$('pg-q').addEventListener('input',pgFilter);$('pg-q').addEventListener('keydown',e=>{if(e.key==='Enter')pgFilter()});
$('pg-go').onclick=pgFilter;$('pg-f').addEventListener('change',pgFilter);
$('pg-clear').onclick=()=>{$('pg-q').value='';$('pg-f').value='all';pgFilter();$('pg-q').focus()};
$('pg-all').onclick=()=>setMany(shownIx(pgRows),true);$('pg-none').onclick=()=>setMany(shownIx(pgRows),false);$('pg-reset').onclick=resetOwn;$('pg-exclear').onclick=clearEx;
/* page routing: #optimizer (default) and #my-items */
function route(){const pg=location.hash==='#my-items';view=pg?'items':'opt';
  document.querySelector('.wrap').classList.toggle('hide',pg);$('items-page').classList.toggle('hide',!pg);
  $('nav-opt').setAttribute('aria-current',pg?'false':'page');$('nav-items').setAttribute('aria-current',pg?'page':'false');
  if(!pg&&dirty){dirty=false;run()}}
window.addEventListener('hashchange',()=>{route();window.scrollTo(0,0)});
syncOwn();syncEx();pgFilter();route();
