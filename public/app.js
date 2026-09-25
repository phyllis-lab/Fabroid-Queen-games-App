const $ = (s) => document.querySelector(s);
const nameInput = $('#nameInput'), codeInput=$('#codeInput'), home=$('#home'), game=$('#game'), homeMsg=$('#homeMsg');
const createBtn=$('#createBtn'), joinBtn=$('#joinBtn'), roomCodeEl=$('#roomCode'), playersEl=$('#players'), statusEl=$('#status');
const choicesEl=$('#choices'), lockBtn=$('#lockBtn'), countdownEl=$('#countdown'), resultEl=$('#result'), againBtn=$('#againBtn');

let ws, playerId = crypto.randomUUID(), myName='', roomCode='', selected=null, state=null, countdownTimer=null, renderedRound=null;

createBtn.addEventListener('click', async()=>{
  myName=nameInput.value.trim(); if(!myName) return msg('Enter your name first.');
  createBtn.disabled=true;
  try{
    const r=await fetch('/api/create',{method:'POST'}); const j=await r.json(); roomCode=j.roomCode; connect();
  }catch{ msg('Could not create room.'); createBtn.disabled=false; }
});
joinBtn.addEventListener('click',()=>{
  myName=nameInput.value.trim(); roomCode=codeInput.value.trim().toUpperCase();
  if(!myName) return msg('Enter your name first.');
  if(!/^[A-Z0-9]{6}$/.test(roomCode)) return msg('Enter the 6 character room code.');
  connect();
});
function msg(t){ homeMsg.textContent=t; }
function connect(){
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${proto}://${location.host}/api/room/${roomCode}`);
  ws.addEventListener('open',()=>ws.send(JSON.stringify({type:'join',playerId,name:myName})));
  ws.addEventListener('message',(e)=>{
    const m=JSON.parse(e.data);
    if(m.type==='error'){ msg(m.message); return; }
    if(m.type==='state'){ state=m.data; render(); }
  });
  ws.addEventListener('error',()=>msg('Connection error. Try again.'));
}

document.querySelectorAll('.choice').forEach(btn=>btn.addEventListener('click',()=>{
  const me=state?.players?.find(p=>p.id===playerId);
  if(!state || state.status!=='choosing' || me?.locked) return;
  selected=btn.dataset.choice;
  syncChoiceUI();
  lockBtn.disabled=false;
  lockBtn.textContent='Lock it in 🔒';
}));

lockBtn.addEventListener('click',()=>{
  const me=state?.players?.find(p=>p.id===playerId);
  if(!selected || !ws || ws.readyState!==WebSocket.OPEN || me?.locked) return;
  lockBtn.disabled=true;
  lockBtn.textContent='Locking…';
  // WebSocket messages are processed in order: save the choice first, then lock it.
  ws.send(JSON.stringify({type:'choose',playerId,choice:selected}));
  ws.send(JSON.stringify({type:'lock',playerId}));
});

function syncChoiceUI(){
  document.querySelectorAll('.choice').forEach(btn=>{
    const isSelected=btn.dataset.choice===selected;
    btn.classList.toggle('selected',isSelected);
    btn.setAttribute('aria-pressed',isSelected?'true':'false');
  });
}
againBtn.addEventListener('click',()=>ws.send(JSON.stringify({type:'reset',playerId})));

function render(){
  home.classList.add('hidden'); game.classList.remove('hidden'); roomCodeEl.textContent=state.roomCode||roomCode;
  playersEl.innerHTML='';
  state.players.forEach((p,i)=>{
    if(i===1){ const vs=document.createElement('div'); vs.className='vs'; vs.textContent='VS'; playersEl.appendChild(vs); }
    const d=document.createElement('div'); d.className='player'; d.innerHTML=`<strong>${escapeHtml(p.name)}</strong><div class="badge">${p.locked?'Locked 🔒':'Ready'}</div>`; playersEl.appendChild(d);
  });
  if(state.players.length<2){ statusEl.textContent='Waiting for your partner…'; choicesEl.classList.add('hidden'); lockBtn.classList.add('hidden'); return; }
  if(state.status==='choosing'){
    clearCountdown();
    if(renderedRound!==state.round){
      selected=null;
      renderedRound=state.round;
    }
    const me=state.players.find(p=>p.id===playerId);
    const amLocked=!!me?.locked;
    syncChoiceUI();
    document.querySelectorAll('.choice').forEach(btn=>btn.disabled=amLocked);
    statusEl.textContent=amLocked
      ? `Round ${state.round}: locked in 🔒 Waiting for your partner…`
      : `Round ${state.round}: choose secretly 👀`;
    choicesEl.classList.remove('hidden');
    lockBtn.classList.remove('hidden');
    lockBtn.disabled=amLocked || !selected;
    lockBtn.textContent=amLocked ? 'Locked in 🔒' : 'Lock it in 🔒';
    resultEl.classList.add('hidden');
    againBtn.classList.add('hidden');
    countdownEl.classList.add('hidden');
  } else if(state.status==='countdown'){
    choicesEl.classList.add('hidden'); lockBtn.classList.add('hidden'); resultEl.classList.add('hidden'); againBtn.classList.add('hidden'); startCountdown();
  } else if(state.status==='revealed'){
    clearCountdown(); countdownEl.classList.add('hidden'); showResult();
  }
}
function startCountdown(){
  if(countdownTimer) return;
  countdownEl.classList.remove('hidden'); let n=3; countdownEl.textContent=n;
  countdownTimer=setInterval(()=>{ n--; countdownEl.textContent=n>0?n:'SHOOT! 🔥'; if(n<0) clearCountdown(); },800);
}
function clearCountdown(){ if(countdownTimer){ clearInterval(countdownTimer); countdownTimer=null; } }
function showResult(){
  const me=state.players.find(p=>p.id===playerId); const other=state.players.find(p=>p.id!==playerId);
  const icon={rock:'🪨',paper:'📄',scissors:'✂️'};
  let heading=state.result.type==='tie'?'It’s a tie! 🤝':`${escapeHtml(state.result.winnerName)} wins! 👑`;
  resultEl.innerHTML=`<h2>${heading}</h2><p>${escapeHtml(state.result.message)}</p><div class="duel"><div><strong>${escapeHtml(me?.name||'You')}</strong><div class="pick">${icon[me?.choice]||''}</div><div>${cap(me?.choice||'')}</div></div><div class="vs">VS</div><div><strong>${escapeHtml(other?.name||'Partner')}</strong><div class="pick">${icon[other?.choice]||''}</div><div>${cap(other?.choice||'')}</div></div></div>`;
  resultEl.classList.remove('hidden'); againBtn.classList.remove('hidden'); choicesEl.classList.add('hidden'); lockBtn.classList.add('hidden'); statusEl.textContent=`Round ${state.round} result`;
}
function cap(v){ return v? v[0].toUpperCase()+v.slice(1):'' }
function escapeHtml(v){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
