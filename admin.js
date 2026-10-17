(()=>{
const $=id=>document.getElementById(id);
let key=sessionStorage.getItem('ctg-admin')||'';
async function call(method,path,body){
  const r=await fetch('/api/admin'+path,{method,headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const j=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(r.status===403?'Wrong key':r.status===429?'Too many failed attempts. Try again later.':(j&&j.error)||('Error '+r.status));
  return j;
}
function el(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e}
async function loadStatus(){
  const s=await call('GET','/status'),box=$('status');box.textContent='';
  [['Email',s.mail],['Owner email set',s.ownerEmail?'yes':'NO'],['Safe concurrent writes',s.atomicWrites?'working':'NOT WORKING: update @netlify/blobs'],['Contest questions',s.contestQuestions],['Practice questions',s.practiceQuestions]]
    .forEach(([k,v])=>{const r=el('div',null,'row');r.append(el('span',k),el('b',String(v)));box.append(r)});
}
async function loadCashouts(){
  const {cashouts}=await call('GET','/cashouts'),box=$('cashouts');box.textContent='';
  if(!cashouts.length){box.append(el('p','No requests yet.','mute'));return}
  cashouts.forEach(c=>{
    const card=el('div',null,'card'+(c.status==='pending'?' pending':'')),top=el('div',null,'row');
    top.append(el('b',`${c.amount} via ${c.method==='venmo'?'Venmo':'Cash App'}: ${c.handle}`));
    if(c.status==='pending'){const b=el('button','Mark paid');b.onclick=async()=>{if(!confirm(`Mark ${c.amount} to ${c.handle} as paid? This emails the player.`))return;b.disabled=true;try{await call('POST','/cashouts/paid',{ref:c.ref});await loadCashouts()}catch(e){alert(e.message);b.disabled=false}};top.append(b)}
    else top.append(el('span','paid','mute'));
    card.append(top,el('div',`${c.email} · requested ${c.requested}`,'mute'));box.append(card);
  });
}
async function loadContest(){
  const q=$('cid').value.trim(),d=await call('GET','/contest'+(q?'?cid='+encodeURIComponent(q):'')),box=$('contest');box.textContent='';
  if(!d.cid){box.append(el('p','No contest results yet.','mute'));return}
  box.append(el('p',`Contest ${d.cid} · ${d.settled?'winnings credited':'not settled yet'} · total ${(d.totalCents/100).toFixed(2)} USD`,'mute'));
  d.results.forEach(r=>{
    const card=el('div',null,'card'),top=el('div',null,'row');
    top.append(el('b',`#${r.rank} ${r.email}`),el('span',`${r.score} pts · ${r.prize}`));
    card.append(top,el('div',`${r.right}/10 right · avg answer ${r.avgMs==null?'?':(r.avgMs/1000).toFixed(1)+'s'} · fastest ${r.minMs==null?'?':(r.minMs/1000).toFixed(1)+'s'}`,'mute'));
    r.flags.forEach(f=>card.append(el('div','Review: '+f,'flag')));box.append(card);
  });
}
async function enter(){
  try{await loadStatus();sessionStorage.setItem('ctg-admin',key);$('login').hidden=true;$('panel').hidden=false;await Promise.all([loadCashouts(),loadContest()])}
  catch(e){$('lerr').textContent=e.message;$('login').hidden=false;$('panel').hidden=true;sessionStorage.removeItem('ctg-admin')}
}
$('go').onclick=()=>{key=$('key').value.trim();$('key').value='';enter()};
$('key').addEventListener('keydown',e=>{if(e.key==='Enter')$('go').click()});
$('load').onclick=()=>loadContest().catch(e=>alert(e.message));
$('out').onclick=()=>{key='';sessionStorage.removeItem('ctg-admin');location.reload()};
if(key)enter();
})();
