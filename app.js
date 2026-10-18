const CONFIG={API_BASE:'/api'};
const $=id=>document.getElementById(id);
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const TIME=10,TITLES={crowned:'Crowned Sovereign',duke:'Duke of Games',knight:'Knight of the Realm',squire:'Squire',peasant:'Peasant'};
const NOTES={crowned:'You wear the crown.',duke:'A noble showing.',knight:'You have earned your spurs.',squire:'Train harder, noble squire.',peasant:'Every ruler starts somewhere.'};
const store={get:k=>{try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},del:k=>{try{localStorage.removeItem(k)}catch(e){}}};
const $$=c=>'$'+(c/100).toFixed(2);
let token=store.get('ctg-token'),acct=null;
// Bot check: invisible for real players. The server tells us the public site key; if none, the check is off.
let botOn=false,botWidget=null,botWait=null;
const botReady=(async()=>{try{
  const c=await(await fetch(CONFIG.API_BASE+'/config')).json();if(!c.turnstileSiteKey)return;
  await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.onload=ok;s.onerror=no;document.head.appendChild(s)});
  botWidget=turnstile.render('#tsbox',{sitekey:c.turnstileSiteKey,execution:'execute',appearance:'interaction-only',callback:t=>{if(botWait)botWait(t)},'before-interactive-callback':()=>$('tsbox').classList.add('tsshow'),'after-interactive-callback':()=>$('tsbox').classList.remove('tsshow'),'error-callback':()=>{$('tsbox').classList.remove('tsshow');if(botWait)botWait('')},'timeout-callback':()=>{if(botWait)botWait('')}});botOn=true;
}catch(e){}})();
function botToken(){return new Promise(res=>{
  if(!botOn){res('');return}
  const t=setTimeout(()=>{botWait=null;$('tsbox').classList.remove('tsshow');res('')},60000);
  botWait=v=>{clearTimeout(t);botWait=null;res(v)};
  turnstile.reset(botWidget);turnstile.execute(botWidget);
})}
async function post(p,b){
  if((p==='/start'&&b.contest)||p==='/signin'||(p==='/claim'&&!token)){await botReady;if(botOn)b={...b,ts:await botToken()}}
  let r;try{r=await fetch(CONFIG.API_BASE+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...b})})}catch(e){throw{code:'network'}}
  const j=await r.json().catch(()=>null);if(!r.ok||!j){if(r.status===401&&token){token=null;acct=null;store.del('ctg-token');paint()}throw{code:(j&&j.error)||(r.status===404?'noserver':'error'),status:r.status}}return j}
const api={
  start:c=>post('/start',{contest:!!c}),next:s=>post('/next',{session:s}),answer:(s,n,ch)=>post('/answer',{session:s,n,choice:ch}),finish:s=>post('/finish',{session:s}),signout:()=>post('/signout',{}),
  claim:(s,e)=>post('/claim',{session:s,email:e}),verify:(s,e,c)=>post('/verify',{session:s,email:e,code:c}),
  signin:e=>post('/signin',{email:e}),signinVerify:(e,c)=>post('/signin/verify',{email:e,code:c}),me:()=>post('/me',{}),
  cashout:(m,h)=>post('/cashout',{method:m,handle:h}),status:()=>fetch(CONFIG.API_BASE+'/contest/status').then(r=>r.json())
};

const SECTIONS=['home','verify','quiz','end','check','rules'];
function show(id){SECTIONS.forEach(s=>$(s).classList.toggle('hide',s!==id));window.scrollTo(0,0);if(id==='check')paintCheck()}
const validEmail=e=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const MSG={bot_check_failed:'We could not confirm you are human. Please try again. If it keeps happening, turn off strict privacy or ad-blocking settings for this site.',invalid_code:'That code is not right. Check your email and try again.',network:'We cannot reach the game server right now. Check your connection and try again in a minute.',noserver:'The game server is not connected yet. Please try again soon.',rate_limited:'Too many attempts from this connection. Please wait a while and try again.',signin_required:'Please sign in with your email first.',no_contest:'The Weekly Contest is not open right now. It runs Tuesdays at 9:00 PM Eastern.',no_entries:'You have already played this contest and have no extra play entries left.',bad_cashapp:'Enter your Cash App $cashtag, like $yourname.',bad_venmo:'Enter your Venmo username, like @yourname.',bad_method:'Choose Cash App or Venmo.',no_balance:'You have no winnings to cash out yet.',duplicate:'That cash-out was already requested.',bad_email:'Please use a real, permanent email address. Temporary inboxes are not allowed.',handle_taken:'That Cash App or Venmo account is already linked to another player account.',busy:'The server is busy. Please try again in a moment.',contest_closed:'The contest closed before this game finished, so it could not be scored.',session_expired:'That game timed out. Please start a new one.',bad_state:'That game is no longer active. Please start a new one.',error:'Something went wrong. Please try again.'};
const errText=e=>MSG[e&&e.code]||MSG.error;

let rulesBack='home',pending=false,vmode='claim',email='',session='',cur=null,total=10,lastDone=false,score=0,t0=0,timer=null,locked=false,result=null,inContest=false,cstat={live:null},skew=0,afterSign='home';

/* ---- contest status + countdown ---- */
async function refreshStatus(){try{const s=await api.status();skew=s.now-Date.now();cstat=s}catch(e){}paintStatus()}
function paintStatus(){
  const now=Date.now()+skew,live=!!cstat.live&&cstat.endsAt>now;
  $('startc').classList.toggle('hide',!live);$('pbox').classList.toggle('live',live);
  if(live){const m=Math.max(0,Math.ceil((cstat.endsAt-now)/60000));$('cstatus').textContent=`The Weekly Contest is LIVE now. It closes at 10:00 PM Eastern (${m} min left).`}
  else if(cstat.nextStart){let d=cstat.nextStart-now;if(d<0)d=0;const dd=Math.floor(d/864e5),hh=Math.floor(d%864e5/36e5),mm=Math.floor(d%36e5/6e4);
    $('cstatus').textContent=`Next Weekly Contest: Tuesday 9:00 PM Eastern (${new Date(cstat.nextStart).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'})} your time), in ${dd?dd+'d ':''}${hh}h ${mm}m.`}
  else $('cstatus').textContent='';
}
setInterval(paintStatus,30000);setInterval(refreshStatus,120000);

/* ---- account ---- */
function paint(){
  $('acctbar').classList.toggle('hide',!acct);if(acct)$('abmail').textContent=acct.email;
  $('tocheck').textContent=acct?'My account':'Sign in or create account';
}
function setAcct(a){acct=a;paint()}
function paintCheck(){
  $('cerr').textContent='';$('caerr').textContent='';$('caok').textContent='';
  $('signform').classList.toggle('hide',!!acct);$('acct').classList.toggle('hide',!acct);
  if(!acct)return;
  $('aemail').textContent=acct.email;$('abal').textContent=$$(acct.balanceCents);$('apend').textContent=$$(acct.pendingCents);$('apaid').textContent=$$(acct.paidCents);$('aent').textContent=acct.entries;
  $('awins').textContent=acct.wins.length?'Recent wins: '+acct.wins.map(w=>`${w.cid} place ${w.rank} ${$$(w.cents)}`).join(' · '):'';
  $('cashout').disabled=acct.balanceCents<=0;$('cashout').textContent=acct.balanceCents>0?`Cash out ${$$(acct.balanceCents)}`:'Nothing to cash out yet';
}
$('cmethod').onchange=()=>{const v=$('cmethod').value==='venmo';$('chl').textContent=v?'Your Venmo username':'Your Cash App $cashtag';$('chandle').placeholder=v?'@yourname':'$yourcashtag'};
$('cashout').onclick=async()=>{
  $('caerr').textContent='';$('caok').textContent='';$('cashout').disabled=true;
  try{const r=await api.cashout($('cmethod').value,$('chandle').value);setAcct(r.account);paintCheck();$('caok').textContent='Cash-out requested. You will get an email when it is sent.'}
  catch(e){$('caerr').textContent=errText(e);paintCheck()}
};
async function loadMe(){if(!token)return;try{setAcct((await api.me()).account)}catch(e){}}

/* ---- playing ---- */
async function begin(contest){
  $('herr').textContent='';inContest=!!contest;
  if(contest&&!acct){afterSign='contest';show('check');$('cerr').textContent='Sign in to play the Weekly Contest.';return}
  $('start').disabled=true;$('startc').disabled=true;
  try{const r=await api.start(contest);session=r.session;total=r.total;score=0;lastDone=false;show('quiz');ask(r)}
  catch(e){$('herr').textContent=errText(e);show('home');if(contest)refreshStatus()}
  $('start').disabled=false;$('startc').disabled=false;
}
function ask(q){
  locked=false;cur=q;
  $('prog').textContent=`Question ${q.n} of ${q.total}`;$('pts').textContent=inContest?'':`${score} pts`;
  $('qtext').textContent=q.q;$('next').classList.add('hide');
  const box=$('opts');box.innerHTML='';
  q.options.forEach((t,k)=>{const b=document.createElement('button');b.className='opt';b.textContent=t;b.dataset.k=k;b.onclick=()=>pick(b,k);box.appendChild(b)});
  $('tmsg').textContent='';t0=Date.now();tick();timer=setInterval(tick,100);
}
// The countdown bar is only a display. The server runs the real clock and decides what counts.
const left=()=>Math.max(0,TIME-(Date.now()-t0)/1000);
function tick(){const l=left();$('fill').style.width=(l/TIME*100)+'%';$('fill').classList.toggle('low',l<4);if(l<=0&&!locked)pick(null,null)}
function abortGame(e){$('qtext').textContent=errText(e);$('opts').innerHTML='';$('next').classList.add('hide');setTimeout(()=>{show('home');refreshStatus()},3500)}
async function pick(btn,k){
  if(locked)return;locked=true;clearInterval(timer);$('tmsg').textContent='';
  document.querySelectorAll('.opt').forEach(b=>b.disabled=true);
  let r;try{r=await api.answer(session,cur.n,k)}catch(e){abortGame(e);return}
  lastDone=r.done;
  if(r.locked){
    // Contest play: nothing is revealed until the contest is over.
    if(btn)btn.classList.add('picked');
    $('tmsg').textContent=r.timedOut?"Time's up! That question counts as wrong.":'Answer locked in. Your score is revealed at the end.';
  }else{
    score=r.score;
    document.querySelectorAll('.opt').forEach(b=>{if(+b.dataset.k===r.answerIndex)b.classList.add(r.timedOut?'reveal':'ok')});
    if(r.timedOut)$('tmsg').textContent="Time's up! No answer counts as wrong. The correct answer is outlined.";
    else if(btn&&!r.correct)btn.classList.add('no');
    $('pts').textContent=`${score} pts`;
  }
  $('next').textContent=lastDone?'See your verdict':'Next question';$('next').classList.remove('hide');$('next').focus();
}
function entriesMsg(g){
  if(g.reason==='ok')return `${g.granted} extra play ${g.granted>1?'entries':'entry'} added to your account.`;
  if(g.reason==='daily')return 'Your account has already earned entries today. You can earn entries from one play per day. Come back tomorrow.';
  if(g.reason==='claimed')return 'These entries were already saved.';
  return '';
}
async function finish(){
  try{result=await api.finish(session)}catch(e){$('qtext').textContent=errText(e);return}
  $('rank').textContent=TITLES[result.tier];$('final').textContent=`${result.right} of ${total} correct · ${result.score} points`;
  $('claim').classList.add('hide');$('err').textContent='';pending=false;
  $('againc').classList.add('hide');$('endhead').textContent=result.contest?'Contest result':'Your verdict';
  if(result.contest){
    await loadMe();
    $('msg').textContent=`Your best score this contest: ${result.best}. The contest closes at 10:00 PM Eastern. Prizes go to the top 25 and are added to your account automatically after it closes.`;
    const live=cstat.live&&cstat.endsAt>Date.now()+skew;
    if(acct&&acct.entries>0&&live){$('againc').textContent=`Play the contest again (${acct.entries} extra play ${acct.entries>1?'entries':'entry'} left)`;$('againc').classList.remove('hide')}
    $('practice').classList.remove('hide');show('end');return;
  }
  $('practice').classList.remove('hide');
  if(result.entries>0){
    $('msg').textContent=NOTES[result.tier];
    if(token){
      try{const g=await api.claim(session);if(g.account)setAcct(g.account);$('msg').textContent=NOTES[result.tier]+' '+entriesMsg(g)}catch(e){$('msg').textContent=NOTES[result.tier]+' '+errText(e)}
    }else{
      pending=true;$('practice').classList.add('hide');
      $('claimp').textContent=`You have earned ${result.entries} extra play ${result.entries>1?'entries':'entry'} for the Weekly Contest (Tuesday, 9:00 PM Eastern). Save them with your email. No cash is paid outside the contest.`;$('claim').classList.remove('hide');
    }
  }else $('msg').textContent=NOTES[result.tier]+' Score 6 or more to earn extra play entries. Cash is paid only in the Weekly Contest, Tuesdays at 9:00 PM Eastern.';
  show('end');
}
async function seal(){
  email=$('email').value.trim().toLowerCase();$('err').textContent='';
  if(!validEmail(email)){$('err').textContent='Enter a valid email address.';return}
  if(!$('agree').checked){$('err').textContent='Please confirm your age and agree to the rules.';return}
  $('seal').disabled=true;
  try{await api.claim(session,email);vmode='claim';$('vmail').textContent=email;show('verify')}
  catch(e){$('err').textContent=errText(e)}
  $('seal').disabled=false;
}
async function verify(){
  $('verr').textContent='';$('vgo').disabled=true;
  try{const c=$('vcode').value.trim();$('vcode').value='';
    if(vmode==='signin'){const r=await api.signinVerify(email,c);token=r.token;store.set('ctg-token',token);setAcct(r.account);const go=afterSign;afterSign='home';
      if(go==='contest'){await refreshStatus();begin(true)}else show('check')}
    else{const r=await api.verify(session,email,c);token=r.token;store.set('ctg-token',token);setAcct(r.account);pending=false;
      $('claim').classList.add('hide');$('practice').classList.remove('hide');$('msg').textContent=NOTES[result.tier]+' '+entriesMsg(r);show('end')}}
  catch(e){$('verr').textContent=errText(e)}
  $('vgo').disabled=false;
}
async function lookup(){
  const e=$('cmail').value.trim().toLowerCase();$('cerr').textContent='';
  if(!validEmail(e)){$('cerr').textContent='Enter a valid email address.';return}
  if(!$('agree2').checked){$('cerr').textContent='Please confirm your age and agree to the rules.';return}
  try{await api.signin(e);email=e;vmode='signin';$('vmail').textContent=e;show('verify')}
  catch(x){$('cerr').textContent=errText(x)}
}
$('start').onclick=()=>begin(false);$('practice').onclick=()=>begin(false);$('startc').onclick=()=>begin(true);$('againc').onclick=()=>begin(true);
$('seal').onclick=seal;$('vgo').onclick=verify;$('cgo').onclick=lookup;
$('next').onclick=async()=>{if(lastDone){finish();return}$('next').disabled=true;try{ask(await api.next(session))}catch(e){abortGame(e)}$('next').disabled=false};
['tocheck','toacct','toacct2'].forEach(id=>$(id).onclick=()=>{afterSign='home';show('check')});
$('signout').onclick=async()=>{try{await api.signout()}catch(e){}token=null;acct=null;store.del('ctg-token');paint();show('home')};
['tohome2'].forEach(id=>$(id).onclick=()=>show('home'));
$('torules').onclick=()=>{rulesBack='home';show('rules')};
$('torules2').onclick=e=>{e.preventDefault();rulesBack='end';show('rules')};
$('torules3').onclick=e=>{e.preventDefault();rulesBack='check';show('rules')};
$('rback').onclick=()=>show(rulesBack);
$('email').addEventListener('keydown',e=>{if(e.key==='Enter')seal()});
$('vcode').addEventListener('keydown',e=>{if(e.key==='Enter')verify()});
$('cmail').addEventListener('keydown',e=>{if(e.key==='Enter')lookup()});
window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue=''}});
paint();refreshStatus();loadMe();
