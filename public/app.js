const $ = (s) => document.querySelector(s);
const nameInput = $('#nameInput'), codeInput=$('#codeInput'), home=$('#home'), game=$('#game'), homeMsg=$('#homeMsg');
const createBtn=$('#createBtn'), joinBtn=$('#joinBtn'), roomCodeEl=$('#roomCode'), playersEl=$('#players'), statusEl=$('#status');
const choicesEl=$('#choices'), lockBtn=$('#lockBtn'), countdownEl=$('#countdown'), resultEl=$('#result'), againBtn=$('#againBtn');

const SESSION_KEY = 'rpsFitnessSessionV1';
let ws = null;
let playerId = crypto.randomUUID();
let myName = '';
let roomCode = '';
let selected = null;
let selectedRound = null;
let state = null;
let countdownTimer = null;
let renderedRound = null;
let reconnectTimer = null;
let intentionalDisconnect = false;

function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!saved || !saved.playerId || !saved.myName || !saved.roomCode) return false;
    playerId = saved.playerId;
    myName = saved.myName;
    roomCode = saved.roomCode;
    selected = saved.selected || null;
    selectedRound = Number.isInteger(saved.selectedRound) ? saved.selectedRound : null;
    nameInput.value = myName;
    codeInput.value = roomCode;
    return true;
  } catch {
    return false;
  }
}

function saveSession() {
  if (!playerId || !myName || !roomCode) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    playerId,
    myName,
    roomCode,
    selected,
    selectedRound,
  }));
}

function clearSavedChoice() {
  selected = null;
  selectedRound = null;
  saveSession();
}

function startFreshIdentity() {
  playerId = crypto.randomUUID();
  selected = null;
  selectedRound = null;
  renderedRound = null;
}

createBtn.addEventListener('click', async()=>{
  myName=nameInput.value.trim(); if(!myName) return msg('Enter your name first.');
  createBtn.disabled=true;
  startFreshIdentity();
  try{
    const r=await fetch('/api/create',{method:'POST'});
    if(!r.ok) throw new Error('Create failed');
    const j=await r.json();
    roomCode=j.roomCode;
    saveSession();
    connect();
  }catch{
    msg('Could not create room.');
    createBtn.disabled=false;
  }
});

joinBtn.addEventListener('click',()=>{
  myName=nameInput.value.trim();
  const nextRoom=codeInput.value.trim().toUpperCase();
  if(!myName) return msg('Enter your name first.');
  if(!/^[A-Z0-9]{6}$/.test(nextRoom)) return msg('Enter the 6 character room code.');

  // Joining from the home screen is treated as a fresh seat unless this is
  // already the exact saved session restored after a refresh.
  if (nextRoom !== roomCode || !localStorage.getItem(SESSION_KEY)) startFreshIdentity();
  roomCode=nextRoom;
  saveSession();
  connect();
});

function msg(t){ homeMsg.textContent=t; }

function connect(){
  if(!roomCode || !myName || !playerId) return;
  intentionalDisconnect = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${proto}://${location.host}/api/room/${roomCode}`);

  ws.addEventListener('open',()=>{
    ws.send(JSON.stringify({type:'join',playerId,name:myName}));
  });

  ws.addEventListener('message',(e)=>{
    const m=JSON.parse(e.data);
    if(m.type==='error'){
      msg(m.message);
      home.classList.remove('hidden');
      game.classList.add('hidden');
      return;
    }
    if(m.type==='state'){
      state=m.data;

      // A choice only belongs to the round in which it was made.
      if (selectedRound !== null && selectedRound !== state.round) {
        selected = null;
        selectedRound = null;
      }
      renderedRound = state.round;
      saveSession();
      render();
    }
  });

  ws.addEventListener('close',()=>{
    ws = null;
    if (!intentionalDisconnect && roomCode && myName) {
      reconnectTimer = setTimeout(connect, 1000);
    }
  });

  ws.addEventListener('error',()=>{
    msg('Connection interrupted. Reconnecting…');
  });
}

document.querySelectorAll('.choice').forEach(btn=>btn.addEventListener('click',()=>{
  const me=state?.players?.find(p=>p.id===playerId);
  if(!state || state.status!=='choosing' || me?.locked) return;
  selected=btn.dataset.choice;
  selectedRound=state.round;
  saveSession();
  syncChoiceUI();
  lockBtn.disabled=false;
  lockBtn.textContent='Lock it in 🔒';
}));

lockBtn.addEventListener('click',()=>{
  const me=state?.players?.find(p=>p.id===playerId);
  if(!selected || !ws || ws.readyState!==WebSocket.OPEN || me?.locked) return;
  selectedRound = state?.round ?? selectedRound;
  saveSession();
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

againBtn.addEventListener('click',()=>{
  if(!ws || ws.readyState!==WebSocket.OPEN) return;
  ws.send(JSON.stringify({type:'reset',playerId}));
});

function render(){
  home.classList.add('hidden');
  game.classList.remove('hidden');
  roomCodeEl.textContent=state.roomCode||roomCode;
  playersEl.innerHTML='';

  state.players.forEach((p,i)=>{
    if(i===1){
      const vs=document.createElement('div');
      vs.className='vs';
      vs.textContent='VS';
      playersEl.appendChild(vs);
    }
    const d=document.createElement('div');
    d.className='player';
    d.innerHTML=`<strong>${escapeHtml(p.name)}</strong><div class="badge">${p.locked?'Locked 🔒':'Ready'}</div>`;
    playersEl.appendChild(d);
  });

  if(state.players.length<2){
    statusEl.textContent='Waiting for your partner…';
    choicesEl.classList.add('hidden');
    lockBtn.classList.add('hidden');
    return;
  }

  if(state.status==='choosing'){
    clearCountdown();

    if (selectedRound !== state.round) {
      selected = null;
      selectedRound = null;
      saveSession();
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
    choicesEl.classList.add('hidden');
    lockBtn.classList.add('hidden');
    resultEl.classList.add('hidden');
    againBtn.classList.add('hidden');
    startCountdown();
  } else if(state.status==='revealed'){
    clearCountdown();
    countdownEl.classList.add('hidden');
    showResult();
  }
}

function startCountdown(){
  if(countdownTimer) return;
  countdownEl.classList.remove('hidden');
  let n=3;
  countdownEl.textContent=n;
  countdownTimer=setInterval(()=>{
    n--;
    countdownEl.textContent=n>0?n:'SHOOT! 🔥';
    if(n<0) clearCountdown();
  },800);
}

function clearCountdown(){
  if(countdownTimer){
    clearInterval(countdownTimer);
    countdownTimer=null;
  }
}

function showResult(){
  const me=state.players.find(p=>p.id===playerId);
  const other=state.players.find(p=>p.id!==playerId);
  const icon={rock:'🪨',paper:'📄',scissors:'✂️'};
  const heading=state.result.type==='tie'?'It’s a tie! 🤝':`${escapeHtml(state.result.winnerName)} wins! 👑`;
  resultEl.innerHTML=`<h2>${heading}</h2><p>${escapeHtml(state.result.message)}</p><div class="duel"><div><strong>${escapeHtml(me?.name||'You')}</strong><div class="pick">${icon[me?.choice]||''}</div><div>${cap(me?.choice||'')}</div></div><div class="vs">VS</div><div><strong>${escapeHtml(other?.name||'Partner')}</strong><div class="pick">${icon[other?.choice]||''}</div><div>${cap(other?.choice||'')}</div></div></div>`;
  resultEl.classList.remove('hidden');
  againBtn.classList.remove('hidden');
  choicesEl.classList.add('hidden');
  lockBtn.classList.add('hidden');
  statusEl.textContent=`Round ${state.round} result`;
}

function cap(v){ return v? v[0].toUpperCase()+v.slice(1):'' }
function escapeHtml(v){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

// Restore the player's seat after a page refresh and reconnect automatically.
if (loadSession()) {
  connect();
}
