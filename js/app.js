// Avatar list - modern diverse names
const AVATARS = [
  'alex.svg','emma.svg','noah.svg','sophia.svg','liam.svg','olivia.svg','ethan.svg','ava.svg','mason.svg','mia.svg',
  'lucas.svg','luna.svg','oliver.svg','aria.svg','james.svg','zoe.svg','leo.svg','lily.svg','max.svg','grace.svg'
];

const MODES = ['Standart','Acımasız','Çift Taraf','Parti','Hızlı'];
const PLAYER_LIMITS = [2,3,4,5,6,7,8,9,10];
let createAvatar = AVATARS[0];
let joinAvatar = AVATARS[1];
let selectedMode = 'Standart';
let selectedMaxPlayers = 4;
const $ = (id) => document.getElementById(id);
const t = (key, vars) => window.PlayUnoI18n?.t(key, vars) || key;
const modeLabel = (mode) => window.PlayUnoI18n?.modeLabel(mode) || mode;

function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(window.__playUnoToast);
  window.__playUnoToast = setTimeout(() => el.classList.add('hidden'), 3200);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function avatarMarkup(avatar, selected = false, type = 'create') {
  const seed = String(avatar).replace(/\.svg$/i, '');
  // Using 'big-smile' style - simple, cute, diverse
  const url = `https://api.dicebear.com/7.x/big-smile/svg?seed=${encodeURIComponent(seed)}`;
  return `<button type="button" class="avatar-option ${selected ? 'selected' : ''}" data-avatar="${escapeHtml(avatar)}" data-avatar-type="${type}" aria-label="Choose avatar"><img src="${url}" alt="${seed}" draggable="false"><span class="avatar-check"><i class="fa-solid fa-check"></i></span></button>`;
}

function fillAvatars(containerId, type) {
  const box = $(containerId);
  if (!box) return;
  const current = type === 'create' ? createAvatar : joinAvatar;
  box.innerHTML = AVATARS.map((avatar) => avatarMarkup(avatar, avatar === current, type)).join('');
  box.querySelectorAll('.avatar-option').forEach((button) => {
    button.addEventListener('click', () => {
      box.querySelectorAll('.avatar-option').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      if (type === 'create') createAvatar = button.dataset.avatar;
      else joinAvatar = button.dataset.avatar;
      PlayUnoAudio?.play('check', 0.35);
    });
  });
}

function updateCapacityPreview() {
  const select = $('createMaxPlayers');
  const preview = $('capacityPreview');
  if (!select || !preview) return;
  const count = Number(select.value) || 4;
  preview.innerHTML = `<img src="assets/icons/users.svg" alt=""><span>${t('capacity',{n:count})}</span>`;
}

function fillPlayerLimits() {
  const select = $('createMaxPlayers');
  if (!select) return;
  select.innerHTML = PLAYER_LIMITS.map((count) => `<option value="${count}">${count} ${t('players')}</option>`).join('');
  select.value = String(selectedMaxPlayers);
  updateCapacityPreview();
}

function openCreateModal(mode = 'Standart') {
  selectedMode = MODES.includes(mode) ? mode : 'Standart';
  selectedMaxPlayers = Number(localStorage.getItem('playuno_max_players')) || 4;
  const select = $('createMode');
  select.innerHTML = MODES.map((item) => `<option value="${escapeHtml(item)}" ${item === selectedMode ? 'selected' : ''}>${escapeHtml(modeLabel(item))}</option>`).join('');
  fillPlayerLimits();
  $('createName').value = localStorage.getItem('playuno_name') || '';
  fillAvatars('createAvatars', 'create');
  $('createModal').classList.remove('hidden');
  PlayUnoAudio?.play('click', 0.28);
  setTimeout(() => $('createName').focus(), 30);
}

function openJoinModal() {
  const params = new URLSearchParams(location.search);
  $('joinCode').value = params.get('room') || '';
  $('joinName').value = localStorage.getItem('playuno_name') || '';
  fillAvatars('joinAvatars', 'join');
  $('joinModal').classList.remove('hidden');
  PlayUnoAudio?.play('click', 0.28);
  setTimeout(() => $('joinCode').focus(), 30);
}

function closeModal(id) {
  const modal = $(id);
  if (modal) modal.classList.add('hidden');
}

function parseRoomCode(raw) {
  let value = String(raw || '').trim();
  try {
    const url = new URL(value);
    const fromUrl = url.searchParams.get('room');
    if (fromUrl) value = fromUrl;
    else {
      const last = url.pathname.split('/').filter(Boolean).pop();
      if (last) value = last;
    }
  } catch {
    const match = value.match(/[?&]room=([^&#]+)/i);
    if (match) value = decodeURIComponent(match[1]);
  }
  return value.replace(/^#?UNO-/i, '').trim().toUpperCase();
}

async function requestJson(url, options = {}) {
  if (window.PlayUnoBackend) return window.PlayUnoBackend.call(url, options);
  
  // Supabase backend should be loaded, if we're here something is wrong
  throw new Error('Backend not loaded. Make sure sb-backend.js is included before app.js');
}

async function submitCreateRoom() {
  const button = $('createSubmitBtn');
  const name = $('createName').value.trim();
  const mode = $('createMode').value;
  const maxPlayers = Number($('createMaxPlayers').value);
  if (!name) { toast(t('missingName')); $('createName').focus(); return; }
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) { toast(t('selectPlayers')); return; }
  
  // Check if user is privileged
  const privileged = (window.PLAY_UNO_CONFIG && window.PLAY_UNO_CONFIG.PRIVILEGED_USERS) || [];
  const isPrivileged = privileged.some(u => String(u || '').toLowerCase() === name.toLowerCase());
  
  if (!isPrivileged) {
    // Show app download warning modal
    showAppRequiredModal(name);
    return;
  }
  
  button.disabled = true; button.textContent = t('creating');
  try {
    const data = await requestJson('/api/rooms', {method:'POST', body:JSON.stringify({name, avatar:createAvatar, mode, maxPlayers, lang:window.PlayUnoI18n?.getLang?.()||'en'})});
    localStorage.setItem('playuno_name', name);
    localStorage.setItem('playuno_max_players', String(maxPlayers));
    localStorage.setItem(`playuno_identity_${String(data.room.code).toUpperCase()}`, JSON.stringify(data.identity));
    PlayUnoAudio?.play('create', 0.45);
    location.href = `room/index.html?room=${encodeURIComponent(data.room.code)}`;
  } catch (error) { toast(error.message); PlayUnoAudio?.play('deny', 0.3); }
  finally { button.disabled = false; button.textContent = t('setupRoom'); }
}

function showAppRequiredModal(username) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-card" style="max-width: 420px;">
      <button class="modal-close" type="button" onclick="this.closest('.modal-backdrop').remove()">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <div class="modal-icon red">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <h3 style="font-weight: 700;">Desktop App Required for Voice Chat</h3>
      <p style="font-weight: 400;">You need the Play Uno Together desktop app to use voice chat.</p>
      <button class="btn modal-action" style="background: linear-gradient(135deg, #facc15 0%, #eab308 100%); color: #0f172a; font-weight: 600; border: none;" onclick="typeof downloadDesktopGame === 'function' && downloadDesktopGame(); this.closest('.modal-backdrop').remove();">
        <i class="fa-solid fa-download"></i>
        <span>Download Desktop</span>
      </button>
    </div>
  `;
  document.body.appendChild(modal);
  PlayUnoAudio?.play('deny', 0.3);
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

async function submitJoinRoom() {
  const button = $('joinSubmitBtn');
  const code = parseRoomCode($('joinCode').value);
  const name = $('joinName').value.trim();
  if (!code) { toast(t('enterRoom')); return; }
  if (!name) { toast(t('missingName')); $('joinName').focus(); return; }
  button.disabled = true; button.textContent = t('joining');
  try {
    const data = await requestJson(`/api/rooms/${encodeURIComponent(code)}/join`, {method:'POST',body:JSON.stringify({name,avatar:joinAvatar,lang:window.PlayUnoI18n?.getLang?.()||'en'})});
    localStorage.setItem('playuno_name', name);
    localStorage.setItem(`playuno_identity_${String(data.room.code).toUpperCase()}`, JSON.stringify(data.identity));
    PlayUnoAudio?.play('join', 0.45);
    location.href = `room/index.html?room=${encodeURIComponent(data.room.code)}`;
  } catch (error) { toast(error.message); PlayUnoAudio?.play('deny', 0.3); }
  finally { button.disabled = false; button.textContent = t('goRoom'); }
}

function downloadDesktopGame() {
  // Delegates to download.js for Dropbox/direct URL handling
  if (typeof window.downloadDesktopGame_handler === 'function') {
    PlayUnoAudio?.play('download', 0.45);
    window.downloadDesktopGame_handler();
    return true;
  }
  const url = String(window.PLAY_UNO_CONFIG?.DOWNLOAD_URL || '').trim();
  if (!url || url.includes('YOUR_FILE_LINK_HERE')) { toast(t('downloadConfig')); return false; }
  PlayUnoAudio?.play('download', 0.45);
  const a = document.createElement('a');
  a.href = url; a.rel = 'noopener noreferrer'; a.download = 'PlayUno-Setup.exe';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  return true;
}

function setTrailerSound() {
  const video = $('trailerVideo');
  if (!video) return;
  video.muted = !video.muted;
  const btn = $('trailerSoundBtn');
  if (btn) btn.innerHTML = video.muted ? `<i class="fa-solid fa-volume-xmark"></i> ${t('openSound')}` : `<i class="fa-solid fa-volume-high"></i> ${t('closeSound')}`;
  PlayUnoAudio?.play('click', 0.2);
}

function bootParticles() {
  const canvas = $('particleCanvas'); if (!canvas) return;
  const context = canvas.getContext('2d'); let width=0,height=0;
  const particles = Array.from({length:42},()=>({x:Math.random(),y:Math.random(),size:Math.random()*1.8+.5,speed:Math.random()*.00035+.00012,alpha:Math.random()*.35+.08}));
  function resize(){width=canvas.width=window.innerWidth;height=canvas.height=window.innerHeight;}
  function frame(){context.clearRect(0,0,width,height);for(const p of particles){p.y-=p.speed;if(p.y<-.02)p.y=1.02;context.fillStyle=`rgba(250,204,21,${p.alpha})`;context.beginPath();context.arc(p.x*width,p.y*height,p.size,0,Math.PI*2);context.fill();}requestAnimationFrame(frame);}
  resize(); window.addEventListener('resize',resize); frame();
}

function bindEvents() {
  $('headerDownloadBtn')?.addEventListener('click', downloadDesktopGame);
  $('heroDownloadBtn')?.addEventListener('click', downloadDesktopGame);
  $('headerCreateBtn')?.addEventListener('click', () => openCreateModal());
  $('heroCreateBtn')?.addEventListener('click', () => openCreateModal());
  $('heroJoinBtn')?.addEventListener('click', openJoinModal);
  $('trailerSoundBtn')?.addEventListener('click', setTrailerSound);
  document.querySelectorAll('.mode-card').forEach((card) => card.addEventListener('click', () => openCreateModal(card.dataset.mode)));
  $('createSubmitBtn')?.addEventListener('click', submitCreateRoom);
  $('joinSubmitBtn')?.addEventListener('click', submitJoinRoom);
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.close)));
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => {if(event.target===backdrop) backdrop.classList.add('hidden');}));
  $('createMode')?.addEventListener('change', (event) => {selectedMode=event.target.value; PlayUnoAudio?.play('check',.25);});
  $('createMaxPlayers')?.addEventListener('change', (event) => {selectedMaxPlayers=Number(event.target.value);updateCapacityPreview();PlayUnoAudio?.play('check',.25);});
  $('createName')?.addEventListener('keydown',(event)=>{if(event.key==='Enter')submitCreateRoom();});
  $('joinCode')?.addEventListener('keydown',(event)=>{if(event.key==='Enter')$('joinName').focus();});
  $('joinName')?.addEventListener('keydown',(event)=>{if(event.key==='Enter')submitJoinRoom();});
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape'){closeModal('createModal');closeModal('joinModal');}});
}

window.openCreateModal=openCreateModal; window.openJoinModal=openJoinModal; window.closeModal=closeModal; window.submitCreateRoom=submitCreateRoom; window.submitJoinRoom=submitJoinRoom; window.downloadDesktopGame=downloadDesktopGame;

document.addEventListener('playuno:language',()=>{
  fillAvatars('createAvatars','create'); fillAvatars('joinAvatars','join'); fillPlayerLimits();
  const select=$('createMode'); if(select){select.innerHTML=MODES.map(item=>`<option value="${escapeHtml(item)}">${escapeHtml(modeLabel(item))}</option>`).join('');select.value=selectedMode;}
});

function seededPulse(seed, min, max){
  const t=Date.now()/60000;
  const wave=Math.sin(t*0.7+seed)*0.5+Math.sin(t*1.3+seed*2)*0.5;
  return Math.round(min+(max-min)*((wave+1)/2));
}

function formatStat(n){
  return Number(n).toLocaleString('tr-TR');
}

function animateStat(el, target, suffix=''){
  if(!el)return;
  const from=Number(String(el.dataset.value||'0').replace(/\D/g,''))||0;
  const to=Number(target)||0;
  el.dataset.value=String(to);
  const start=performance.now();
  const dur=700;
  function frame(now){
    const p=Math.min(1,(now-start)/dur);
    const eased=1-Math.pow(1-p,3);
    const val=Math.round(from+(to-from)*eased);
    el.textContent=formatStat(val)+suffix;
    if(p<1)requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

async function refreshLiveStats(){
  // Supabase backend - use static simulated stats
  const start=performance.now();
  const hour=new Date().getHours();
  const hourBoost = hour>=18&&hour<=23 ? 1.18 : hour>=12&&hour<=17 ? 1.08 : hour>=0&&hour<=6 ? 0.72 : 1;
  const basePlayers = Math.round(18420 * hourBoost) + seededPulse(3, 80, 420);
  const baseRooms = Math.round(2140 * hourBoost) + seededPulse(7, 12, 90);

  const latency = 35 + Math.floor(Math.random() * 15);
  animateStat($('statPlayers'), basePlayers, '+');
  animateStat($('statRooms'), baseRooms, '');
  const le=$('statLatency');
  if(le){le.innerHTML=`&lt;${latency} <span style="font-size:20px">ms</span>`;}
}

function bootReveal(){
  const nodes=document.querySelectorAll('.reveal');
  if(!nodes.length)return;
  const io=new IntersectionObserver((entries)=>{
    entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');io.unobserve(e.target);}});
  },{threshold:0.12,rootMargin:'0px 0px -40px 0px'});
  nodes.forEach(n=>io.observe(n));
}

function bootMobileMenu(){
  const btn=$('mobileMenuBtn'), nav=$('mainNav');
  if(!btn||!nav)return;
  btn.addEventListener('click',()=>{
    const open=nav.classList.toggle('open');
    btn.setAttribute('aria-expanded',open?'true':'false');
    btn.innerHTML=open?'<i class="fa-solid fa-xmark"></i>':'<i class="fa-solid fa-bars"></i>';
    PlayUnoAudio?.play('click',0.2);
  });
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
    nav.classList.remove('open');
    btn.setAttribute('aria-expanded','false');
    btn.innerHTML='<i class="fa-solid fa-bars"></i>';
  }));
}

function hideLoader(){
  const el=$('pageLoader');
  if(!el)return;
  el.classList.add('done');
  setTimeout(()=>el.remove(),500);
}

document.addEventListener('DOMContentLoaded',()=>{
  fillAvatars('createAvatars','create'); fillAvatars('joinAvatars','join'); fillPlayerLimits();
  $('createMode').innerHTML=MODES.map(item=>`<option value="${escapeHtml(item)}">${escapeHtml(modeLabel(item))}</option>`).join(''); $('createMode').value=selectedMode;
  bindEvents(); PlayUnoAudio?.bind(); bootParticles(); bootReveal(); bootMobileMenu(); refreshLiveStats(); setInterval(refreshLiveStats,20000); hideLoader();
});

// download.js handles all download logic via window.downloadDesktopGame()
// See js/download.js and js/config.js for configuration.

