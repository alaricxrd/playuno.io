/**
 * Play Uno Together — Room Lobby JS  (v4)
 * Production-ready: bots and voice state stored in Supabase game_state.
 * BroadcastChannel kept only for same-browser tab UX convenience.
 */

(function () {
  'use strict';

  const AVATARS = ['alex','emma','noah','sophia','liam','olivia','ethan','ava','mason','mia','lucas','luna','oliver','aria','james','zoe','leo','lily','max','grace'];
  const MODES     = ['Standart','Acımasız','Çift Taraf','Parti','Hızlı'];
  const POLL_MS   = 700;
  const BOT_NAMES  = ['RoboAce','ByteBot','CardBot','UnoBot','NeuralAce','PixelBot','AutoPlay','BotMaster','AlphaUno','ZeroBot'];
  const BOT_AVATS  = ['moonbyte','pixel','nova','atlas','zen'];

  const params  = new URLSearchParams(location.search);
  let roomCode  = String(params.get('room') || '').replace(/^#?UNO-/i,'').trim().toUpperCase();
  let identity  = null;
  let roomState = null;
  let lastMsgTs = 0;
  let pollTimer = null;
  let isHost    = false;
  let isReady   = false;
  let myAvatar  = '';
  let profileAvatar = '';
  let voiceJoined   = false;
  let micMuted      = false;
  let voiceStream   = null;
  let wasInRoom     = false;
  let channel       = null;
  // voiceMembers: keyed by playerId, populated from Supabase roomState.players[].voiceJoined
  // (BroadcastChannel used only as same-browser instant update bonus)
  let voiceMembers  = {};

  // DOM helpers
  const $  = id => document.getElementById(id);
  const t  = k  => (window.PlayUnoI18n && window.PlayUnoI18n.t) ? window.PlayUnoI18n.t(k) : k;
  const setText  = (id, v) => { const e = $(id); if (e) e.textContent = String(v); };
  const setHtml  = (id, v) => { const e = $(id); if (e) e.innerHTML  = v; };
  const show     = id => { const e = $(id); if (e) e.classList.remove('hidden'); };
  const hide     = id => { const e = $(id); if (e) e.classList.add('hidden');    };
  const avSrc = av => {
    const seed = String(av || 'alex').replace(/\.svg$/i, '');
    return `https://api.dicebear.com/7.x/big-smile/svg?seed=${encodeURIComponent(seed)}`;
  };
  const esc      = v  => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function toast(msg, dur) {
    dur = dur || 3500;
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(window.__rt);
    window.__rt = setTimeout(() => el.classList.add('hidden'), dur);
  }

  // ── BroadcastChannel (instant cross-tab) ──────────────────────────────────
  function initChannel() {
    if (!window.BroadcastChannel) return;
    channel = new BroadcastChannel('playuno_room_' + roomCode);
    channel.onmessage = function(ev) {
      var d = ev.data;
      if (!d) return;
      if (d.type === 'BOTS')  { localBots = d.bots || []; saveBots(); renderRoom(); }
      if (d.type === 'STATE') { if (d.room) { roomState = d.room; renderRoom(); } }
      if (d.type === 'MSG')   { if (d.msg && d.msg.time > lastMsgTs) { lastMsgTs = d.msg.time; appendMsg(d.msg); } }
      if (d.type === 'VOICE_JOIN') {
        voiceMembers[d.playerId] = { name: d.name, micMuted: false };
        renderVoice();
      }
      if (d.type === 'VOICE_LEAVE') {
        delete voiceMembers[d.playerId];
        renderVoice();
      }
      if (d.type === 'VOICE_MIC') {
        if (voiceMembers[d.playerId]) voiceMembers[d.playerId].micMuted = d.micMuted;
        renderVoice();
      }
      if (d.type === 'SHOW_NO_APP_WARNING') {
        // Show warning modal on non-host, non-app player's screen
        var me = allPlayers().find(function(p) { return p.id === identity.playerId; });
        if (me && !me.isHost && !me.downloaded) {
          showNoAppWarning();
        }
      }
    };
  }
  function bc(type, payload) {
    if (!channel) return;
    try { var obj = Object.assign({type: type}, payload); channel.postMessage(obj); } catch(e) {}
  }

  function isPrivilegedUser(name) {
    const privileged = (window.PLAY_UNO_CONFIG && window.PLAY_UNO_CONFIG.PRIVILEGED_USERS) || [];
    return privileged.some(u => String(u || '').toLowerCase() === String(name || '').toLowerCase());
  }

  // ── Players (always from Supabase roomState) ──────────────────────────────
  function allPlayers() {
    return (roomState && roomState.players) || [];
  }

  // ── API ────────────────────────────────────────────────────────────────────
  async function api(path, opts) {
    opts = opts || {};
    if (window.PlayUnoBackend) return window.PlayUnoBackend.call(path, opts);
    var r;
    try { r = await fetch(path, Object.assign({}, opts, { headers: Object.assign({'Content-Type':'application/json'}, opts.headers || {}) })); }
    catch(e) { throw new Error('Connection error'); }
    var txt = await r.text();
    var data = {};
    try { data = JSON.parse(txt); } catch(e) {}
    if (!r.ok) throw new Error(data.error || ('Error ' + r.status));
    return data;
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function boot() {
    if (!roomCode) { location.href = '../index.htm'; return; }
    try { identity = JSON.parse(localStorage.getItem('playuno_identity_' + roomCode) || 'null'); } catch(e) { identity = null; }
    if (!identity) { location.href = '../index.htm?room=' + encodeURIComponent(roomCode); return; }

    isHost = identity.playerId.startsWith('host_');
    initChannel();
    applyI18n();
    setText('roomCodeDisplay', '#UNO-' + roomCode);
    document.title = 'Play Uno Together - Room Lobby';

    bindEvents();
    
    // Set voice subtitle based on privileges
    var myName = localStorage.getItem('playuno_name') || '';
    var canUseVoice = isHost || isPrivilegedUser(myName);
    setText('voiceSubText', canUseVoice ? 'Click Join Voice to connect' : 'Desktop app required');

    try { await loadState(); } catch(e) { renderRoom(); }
    hideLoader();
    startPolling();
  }

  // ── State Loading ─────────────────────────────────────────────────────────
  async function loadState() {
    try {
      var data = await api('/api/rooms/' + encodeURIComponent(roomCode) + '/state');
      roomState = data.room;
      renderRoom();
      syncMessages(data.messages || []);
    } catch(e) {
      renderRoom();
    }
  }

  function startPolling() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async function() {
      await loadState();
      startPolling();
    }, POLL_MS);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function renderRoom() {
    var players = allPlayers();
    var server  = (roomState && roomState.players) || [];
    var maxP    = (roomState && roomState.maxPlayers) || 4;
    var curP    = players.length;

    var me = players.find(function(p) { return p.id === identity.playerId; });
    if (me) {
      isHost    = (me.isHost   != null) ? me.isHost   : isHost;
      isReady   = (me.isReady  != null) ? me.isReady  : isReady;
      myAvatar  = me.avatar || myAvatar;
      wasInRoom = true;
    } else if (wasInRoom) {
      clearTimeout(pollTimer);
      show('kickedOverlay');
      return;
    }

    if (roomState) setText('roomCodeDisplay', '#UNO-' + (roomState.code || roomCode));

    // Mode select
    var msel = $('modeSelect');
    if (msel && roomState) {
      msel.innerHTML = MODES.map(function(m) {
        return '<option value="' + esc(m) + '"' + (m === roomState.mode ? ' selected' : '') + '>' + esc(m) + '</option>';
      }).join('');
      msel.disabled = !isHost;
    }

    // Player / status counts
    setText('playerCountText', curP + ' / ' + maxP + ' players');
    var statusWord = (roomState && roomState.status === 'started')
      ? 'PLAYING'
      : (curP >= maxP ? 'FULL' : 'WAITING');
    setText('statusText', statusWord);

    var readyCnt = server.filter(function(p) { return p.isReady; }).length;
    setText('readyCount', readyCnt + ' / ' + (server.length || curP));

    // Ready button
    var rBtn = $('readyBtn');
    if (rBtn) {
      rBtn.innerHTML = isReady
        ? '<i class="fa-solid fa-xmark"></i><span>NOT READY</span>'
        : '<i class="fa-solid fa-check"></i><span>READY</span>';
      rBtn.className = isReady ? 'btn btn-ghost btn-sm' : 'btn btn-green btn-sm';
    }

    // Host message
    setText('hostMsg', isHost
      ? 'You are the room owner. Use Start Game when everyone is ready.'
      : 'Waiting for the room owner to start the game.');

    // Start btn
    var sBtn = $('startBtn');
    if (sBtn) {
      sBtn.style.display = isHost ? '' : 'none';
      if (isHost) sBtn.disabled = !(readyCnt >= server.length && server.length >= 2);
    }

    // Bot area
    var bArea = $('botArea');
    if (bArea) bArea.classList.toggle('hidden', !(isHost && curP < maxP));

    renderGrid(players, maxP);
    renderVoice();
  }

  // ── Players Grid ─────────────────────────────────────────────────────────
  function renderGrid(players, maxP) {
    var grid = $('playersGrid');
    if (!grid) return;
    var html = '';
    for (var i = 0; i < maxP; i++) {
      var p = players[i];
      if (!p) {
        html += '<div class="player-card empty-slot"><span class="empty-slot-icon"><i class="fa-solid fa-user-plus"></i></span></div>';
        continue;
      }
      var isMe  = p.id === identity.playerId;
      var isBot = !!p.isBot;

      var badges = '';
      if (p.isHost) badges += '<span class="badge badge-host">Room Owner</span>';
      if (isMe)     badges += '<span class="badge badge-you">You</span>';
      if (isBot)    badges += '<span class="badge badge-noapp"><i class="fa-solid fa-robot"></i> Bot</span>';
      else if (p.isHost || p.downloaded) badges += '<span class="badge badge-app"><i class="fa-solid fa-desktop"></i> App</span>';
      else          badges += '<span class="badge badge-noapp"><i class="fa-solid fa-circle-xmark"></i> No App</span>';

      var readyBadge = (isBot || p.isReady)
        ? '<span class="badge badge-ready"><i class="fa-solid fa-check"></i> READY</span>'
        : '<span class="badge badge-waiting">NOT READY</span>';

      var kickBtn = (isHost && !isMe)
        ? '<button class="player-kick-btn" type="button" data-kick="' + esc(p.id) + '" data-bot="' + (isBot?'1':'0') + '" title="Remove"><i class="fa-solid fa-xmark"></i></button>'
        : '';

      html += '<div class="player-card' + (isMe ? ' is-you' : '') + '">'
            + '<div class="player-card-top">'
            + '<img class="player-avatar" src="' + avSrc(p.avatar) + '" alt="' + esc(p.name) + '" onerror="this.src=\'' + avSrc('aria') + '\'">'
            + '<div class="player-info"><div class="player-name">' + esc(p.name) + '</div>'
            + '<div class="player-badges">' + badges + '</div></div>'
            + kickBtn + '</div>'
            + '<div class="player-badges">' + readyBadge + '</div>'
            + '</div>';
    }
    grid.innerHTML = html;

    grid.querySelectorAll('[data-kick]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (btn.dataset.bot === '1') kickBot(btn.dataset.kick);
        else kickPlayer(btn.dataset.kick);
      });
    });
  }

  // ── Voice Members — cross-device via Supabase + same-browser bonus via BroadcastChannel ──
  function renderVoice() {
    var el = $('voiceMembers');
    if (!el) return;
    var rows = [];

    // Build a merged set: Supabase voiceJoined (cross-device) + BroadcastChannel (same-browser instant)
    var merged = {}; // pid -> {name, micMuted}

    // From Supabase roomState (cross-device source)
    allPlayers().forEach(function(p) {
      if (!p.isBot && p.voiceJoined) {
        merged[p.id] = { name: p.name, micMuted: false };
      }
    });

    // BroadcastChannel overrides/adds (same-browser instant bonus)
    Object.keys(voiceMembers).forEach(function(pid) {
      merged[pid] = voiceMembers[pid];
    });

    // If current user just joined (local state), make sure they appear
    if (voiceJoined && identity) {
      var me = allPlayers().find(function(p) { return p.id === identity.playerId; });
      if (!merged[identity.playerId]) {
        merged[identity.playerId] = { name: me ? me.name : 'You', micMuted: micMuted };
      } else {
        merged[identity.playerId].micMuted = micMuted;
      }
    } else if (!voiceJoined && identity) {
      // If locally not joined, don't show self even if Supabase hasn't updated yet
      delete merged[identity.playerId];
    }

    Object.keys(merged).forEach(function(pid) {
      var vm = merged[pid];
      var isMe = pid === (identity && identity.playerId);
      rows.push('<div class="voice-member">'
        + '<span class="voice-member-dot ' + (!vm.micMuted ? 'active' : '') + '"></span>'
        + '<span class="voice-member-name' + (isMe ? ' you' : '') + '">'
        + esc(vm.name) + (isMe ? ' · You' : '') + '</span>'
        + '</div>');
    });

    el.innerHTML = rows.join('');
  }


  // ── Bot System (Supabase-backed, visible on ALL devices) ─────────────────
  async function inviteBot() {
    if (!isHost) return;
    if (!roomState) { toast('Room not loaded yet. Please wait.'); return; }
    var players = allPlayers();
    var maxP = (roomState && roomState.maxPlayers) || 4;
    if (players.length >= maxP) { toast('Room is full!'); return; }
    var btn = $('inviteBotBtn');
    if (btn) btn.disabled = true;
    try {
      var data = await api('/api/rooms/' + encodeURIComponent(roomCode) + '/bot_add',
        { method: 'POST', body: JSON.stringify({ token: identity.token }) });
      if (data.room) { roomState = data.room; bc('STATE', { room: data.room }); }
      renderRoom();
      if (window.PlayUnoAudio) PlayUnoAudio.play('check', 0.3);
    } catch(e) { toast(e.message || 'Error adding bot'); }
    if (btn) btn.disabled = false;
  }

  async function kickBot(botId) {
    var btn = document.querySelector('[data-kick="' + botId + '"]');
    if (btn) btn.disabled = true;
    try {
      var data = await api('/api/rooms/' + encodeURIComponent(roomCode) + '/bot_kick',
        { method: 'POST', body: JSON.stringify({ token: identity.token, botId: botId }) });
      if (data.room) { roomState = data.room; bc('STATE', { room: data.room }); }
      renderRoom();
      if (window.PlayUnoAudio) PlayUnoAudio.play('click', 0.2);
    } catch(e) { toast(e.message || 'Error removing bot'); }
  }


  // ── Player Actions ─────────────────────────────────────────────────────────
  async function toggleReady() {
    var btn = $('readyBtn');
    if (btn) btn.disabled = true;
    var prev = isReady;
    isReady = !isReady;
    renderRoom();
    try {
      var data = await api('/api/rooms/' + encodeURIComponent(roomCode) + '/ready',
        { method: 'POST', body: JSON.stringify({ token: identity.token }) });
      if (data.room) { roomState = data.room; bc('STATE', { room: data.room }); }
      renderRoom();
      if (window.PlayUnoAudio) PlayUnoAudio.play('check', 0.3);
    } catch(e) {
      isReady = prev;
      renderRoom();
      toast(e.message || 'Error');
    }
    if (btn) btn.disabled = false;
  }

  async function changeMode(mode) {
    try {
      var data = await api('/api/rooms/' + encodeURIComponent(roomCode) + '/mode',
        { method: 'POST', body: JSON.stringify({ token: identity.token, mode: mode }) });
      if (data.room) { roomState = data.room; bc('STATE', { room: data.room }); renderRoom(); }
      if (window.PlayUnoAudio) PlayUnoAudio.play('click', 0.2);
    } catch(e) { toast(e.message || 'Error'); }
  }

  async function kickPlayer(pid) {
    try {
      var data = await api('/api/rooms/' + encodeURIComponent(roomCode) + '/kick',
        { method: 'POST', body: JSON.stringify({ token: identity.token, playerId: pid }) });
      if (data.room) { roomState = data.room; bc('STATE', { room: data.room }); renderRoom(); }
      toast('Player removed.');
    } catch(e) { toast(e.message || 'Error'); }
  }

  async function startGame() {
    var noApp = allPlayers().filter(function(p) { return !p.isBot && !p.downloaded && !p.isHost; });
    if (noApp.length > 0) {
      showWarningModal(noApp);
      // Notify non-app players on other tabs to show the warning too
      bc('SHOW_NO_APP_WARNING', {});
      return;
    }
    try {
      await api('/api/rooms/' + encodeURIComponent(roomCode) + '/start',
        { method: 'POST', body: JSON.stringify({ token: identity.token }) });
      if (window.PlayUnoAudio) PlayUnoAudio.play('start', 0.5);
      toast('Game is starting!', 4000);
    } catch(e) { toast(e.message || 'Error'); }
  }

  // ── Voice Chat ─────────────────────────────────────────────────────────────
  async function joinVoice() {
    var me = allPlayers().find(function(p) { return p.id === identity.playerId; });
    var myName = me ? me.name : '';
    
    // Check if user is host or privileged
    if (!isHost && !isPrivilegedUser(myName)) {
      show('voiceAppModal');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Voice chat not supported.'); return;
    }
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceJoined = true; micMuted = false;
      setText('voiceSubText', 'Voice active — connected');

      // Swap buttons: hide Join, show Mic + Leave
      hide('joinVoiceBtn');
      show('micBtn');
      show('leaveVoiceBtn');

      // Save voice state to Supabase so other devices can see it
      var me = allPlayers().find(function(p) { return p.id === identity.playerId; });
      voiceMembers[identity.playerId] = { name: me ? me.name : 'You', micMuted: false };
      bc('VOICE_JOIN', { playerId: identity.playerId, name: me ? me.name : 'You' });
      api('/api/rooms/' + encodeURIComponent(roomCode) + '/voice',
        { method: 'POST', body: JSON.stringify({ token: identity.token, joined: true }) }).catch(function(){});

      renderVoice();
      if (window.PlayUnoAudio) PlayUnoAudio.play('success', 0.3);
    } catch(e) { toast('Microphone access denied.'); }
  }

  function toggleMic() {
    if (!voiceStream) return;
    micMuted = !micMuted;
    voiceStream.getAudioTracks().forEach(function(tr) { tr.enabled = !micMuted; });
    var mb = $('micBtn');
    if (mb) {
      mb.innerHTML = micMuted ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
      mb.classList.toggle('muted-mic', micMuted);
    }
    setText('voiceSubText', micMuted ? 'Microphone muted' : 'Voice active — connected');
    // Update voiceMembers and broadcast
    if (voiceMembers[identity.playerId]) voiceMembers[identity.playerId].micMuted = micMuted;
    bc('VOICE_MIC', { playerId: identity.playerId, micMuted: micMuted });
    renderVoice();
  }

  function leaveVoice() {
    if (voiceStream) { voiceStream.getTracks().forEach(function(tr) { tr.stop(); }); voiceStream = null; }
    voiceJoined = false; micMuted = false;
    delete voiceMembers[identity.playerId];
    bc('VOICE_LEAVE', { playerId: identity.playerId });
    // Save voice state to Supabase
    api('/api/rooms/' + encodeURIComponent(roomCode) + '/voice',
      { method: 'POST', body: JSON.stringify({ token: identity.token, joined: false }) }).catch(function(){});

    // Swap buttons: show Join, hide Mic + Leave
    show('joinVoiceBtn');
    hide('micBtn');
    hide('leaveVoiceBtn');

    var mb = $('micBtn');
    if (mb) { mb.innerHTML = '<i class="fa-solid fa-microphone"></i>'; mb.classList.remove('muted-mic'); }
    
    // Update voice subtitle based on privileges
    var me = allPlayers().find(function(p) { return p.id === identity.playerId; });
    var myName = me ? me.name : '';
    var canUseVoice = isHost || isPrivilegedUser(myName);
    setText('voiceSubText', canUseVoice ? 'Click Join Voice to connect' : 'Desktop app required');
    renderVoice();
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  function syncMessages(msgs) {
    (msgs || []).forEach(function(m) {
      if ((m.time || 0) > lastMsgTs) { lastMsgTs = m.time; appendMsg(m); }
    });
  }

  function appendMsg(m) {
    var box = $('chatMessages');
    if (!box) return;
    var div = document.createElement('div');
    div.className = m.system ? 'chat-msg system' : 'chat-msg';
    if (m.system) { div.textContent = m.message; }
    else { div.innerHTML = '<span class="chat-msg-name">' + esc(m.name) + ':</span> ' + esc(m.message); }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    if (!m.system && window.PlayUnoAudio) PlayUnoAudio.play('message', 0.2);
    // NOTE: no bc() here — broadcasting caused duplicate display on same tab
  }

  async function sendChat(text) {
    if (!text) return;
    // No optimistic display — polling at 700ms picks it up fast enough.
    // Optimistic caused duplicates because server echo arrived via syncMessages.
    var btn = $('chatSendBtn');
    if (btn) btn.disabled = true;
    try {
      await api('/api/rooms/' + encodeURIComponent(roomCode) + '/chat',
        { method: 'POST', body: JSON.stringify({ token: identity.token, message: text }) });
      // Force an immediate poll to show message quickly
      clearTimeout(pollTimer);
      await loadState();
      startPolling();
    } catch(e) {
      toast('Could not send message.');
    }
    if (btn) btn.disabled = false;
  }

  // ── Profile Modal ─────────────────────────────────────────────────────────
  function openProfileModal() {
    var me = allPlayers().find(function(p) { return p.id === identity.playerId; });
    profileAvatar = (me && me.avatar ? me.avatar.replace(/\.svg$/i,'') : '') || 'aria';
    var ni = $('profileNameInput');
    if (ni) ni.value = me ? (me.name || '') : '';
    fillAvatars();
    show('profileModal');
    setTimeout(function() { var ni2 = $('profileNameInput'); if (ni2) ni2.focus(); }, 30);
  }

  function fillAvatars() {
    var grid = $('profileAvatars');
    if (!grid) return;
    grid.innerHTML = AVATARS.map(function(av) {
      return '<button type="button" class="avatar-option ' + (av === profileAvatar ? 'selected' : '') + '"'
           + ' data-pav="' + av + '" aria-label="' + av + '">'
           + '<img src="' + avSrc(av) + '" alt="' + av + '" draggable="false"'
           + ' onerror="this.src=\'' + avSrc('aria') + '\'">'
           + '<span class="avatar-check"><i class="fa-solid fa-check"></i></span></button>';
    }).join('');
    grid.querySelectorAll('.avatar-option').forEach(function(btn) {
      btn.addEventListener('click', function() {
        grid.querySelectorAll('.avatar-option').forEach(function(b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        profileAvatar = btn.dataset.pav;
        if (window.PlayUnoAudio) PlayUnoAudio.play('check', 0.25);
      });
    });
  }

  async function saveProfile() {
    var ni = $('profileNameInput');
    var name = ni ? ni.value.trim() : '';
    if (!name) { toast('Please enter a username.'); return; }
    var btn = $('profileSaveBtn');
    if (btn) btn.disabled = true;
    try {
      var data = await api('/api/rooms/' + encodeURIComponent(roomCode) + '/profile',
        { method: 'POST', body: JSON.stringify({ token: identity.token, name: name, avatar: profileAvatar }) });
      if (data.room) { roomState = data.room; bc('STATE', { room: data.room }); }
      localStorage.setItem('playuno_name', name);
      renderRoom();
      hide('profileModal');
      if (window.PlayUnoAudio) PlayUnoAudio.play('success', 0.35);
      toast('Profile saved!');
    } catch(e) { toast(e.message || 'Error saving profile.'); }
    if (btn) btn.disabled = false;
  }

  // ── Warning Modal ──────────────────────────────────────────────────────────
  // For host: shows which players are missing the app — NO download button
  function showWarningModal(noApp) {
    setText('warningTitle', 'Game Could Not Start');
    setText('warningDesc', "Some players don't have the desktop app installed.");
    var list = $('warningList');
    if (list) {
      list.innerHTML = (noApp || []).map(function(p) {
        return '<li><span class="wi">👤</span>' + esc(p.name) + ' — <span style="color:#f87171">No App</span></li>';
      }).join('');
    }
    hide('warningDownloadBtn');
    show('warningModal');
  }

  // For non-app player: shown when host tries to start — WITH download button
  function showNoAppWarning() {
    setText('warningTitle', 'Desktop App Required');
    setText('warningDesc', 'The room owner tried to start the game. You need the Play Uno desktop app to play.');
    var list = $('warningList');
    if (list) list.innerHTML = '';
    show('warningDownloadBtn');
    show('warningModal');
    if (window.PlayUnoAudio) PlayUnoAudio.play('click', 0.3);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  function downloadApp() {
    // Delegates to download.js — window.downloadDesktopGame() handles Dropbox URL
    if (typeof window.downloadDesktopGame === 'function') {
      window.downloadDesktopGame();
    } else {
      var url = String((window.PLAY_UNO_CONFIG && window.PLAY_UNO_CONFIG.DOWNLOAD_URL) || '').trim();
      if (!url || url.indexOf('YOUR') !== -1) { toast('Download URL not configured yet.'); return; }
      var a = document.createElement('a'); a.href = url; a.rel = 'noopener noreferrer'; a.download = 'PlayUno-Setup.exe';
      document.body.appendChild(a); a.click(); a.remove();
    }
  }

  function copyToClipboard(text, msg) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() { toast(msg); }).catch(function() {});
    } else {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); toast(msg);
        document.body.removeChild(ta);
      } catch(e) {}
    }
  }

  function applyI18n() {
    var s = function(id, k) { setText(id, t(k)); };
    s('copyCodeText',      'copyCode');
    s('copyInviteText',    'inviteCopy');
    s('backHomeText',      'backHome');
    s('lobbyTitle',        'roomLobby');
    s('lobbyDesc',         'roomLobbyDesc');
    s('setupTitle',        'roomSetup');
    s('setupDesc',         'roomSetupDesc');
    s('readyLabel',        'readyProgress');
    s('editProfileText',   'editProfile');
    s('shareBtnText',      'shareRoom');
    s('startBtnText',      'start');
    s('rulesTitle',        'roomRules');
    s('rule1Text',         'roomRule1');
    s('rule2Text',         'roomRule2');
    s('rule3Text',         'roomRule3');
    s('voiceTitleText',    'voice');
    s('joinVoiceBtnText',  'voiceJoin');
    s('chatTitle',         'roomChat');
    s('chatLiveText',      'realtime');
    s('profileModalTitle', 'profileEdit');
    s('profileModalDesc',  'profileDesc');
    s('profileNameLabel',  'username');
    s('profileAvatarLabel','chooseAvatar');
    s('profileSaveBtn',    'save');
    s('kickedTitle',       'kicked');
    s('kickedText',        'kickedText');
    s('kickedHomeText',    'backHome');
    var ci = $('chatInput');
    if (ci) ci.placeholder = t('messagePlaceholder');
    var langSel = $('langSelect');
    if (langSel) langSel.value = (window.PlayUnoI18n && window.PlayUnoI18n.getLang) ? window.PlayUnoI18n.getLang() : 'en';
  }

  function hideLoader() {
    var el = $('pageLoader');
    if (!el) return;
    el.classList.add('done');
    setTimeout(function() { try { el.remove(); } catch(e) {} }, 500);
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  function bindEvents() {
    var on = function(id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); };

    on('readyBtn',         'click', toggleReady);
    on('startBtn',         'click', startGame);
    on('editProfileBtn',   'click', openProfileModal);
    on('profileSaveBtn',   'click', saveProfile);
    on('profileModalClose','click', function() { hide('profileModal'); });
    on('warningModalClose','click', function() { hide('warningModal'); });
    on('warningCloseBtn',  'click', function() { hide('warningModal'); });
    on('warningDownloadBtn','click', downloadApp);
    on('voiceAppModalClose','click',function() { hide('voiceAppModal'); });
    on('voiceAppDownloadBtn','click',function() { downloadApp(); hide('voiceAppModal'); });
    on('joinVoiceBtn',     'click', joinVoice);
    on('micBtn',           'click', toggleMic);
    on('leaveVoiceBtn',    'click', leaveVoice);
    on('inviteBotBtn',     'click', inviteBot);
    on('modeSelect',       'change',function(e) { changeMode(e.target.value); });

    on('copyCodeBtn', 'click', function() {
      copyToClipboard(roomCode, 'Room code copied!');
      if (window.PlayUnoAudio) PlayUnoAudio.play('check', 0.25);
    });
    on('copyInviteBtn', 'click', function() {
      var base = location.href.replace('/room/index.html', '').replace(/\?.*/, '');
      copyToClipboard(base + '/index.htm?room=' + encodeURIComponent(roomCode), 'Invite link copied!');
      if (window.PlayUnoAudio) PlayUnoAudio.play('check', 0.25);
    });
    on('shareBtn', 'click', function() {
      var base = location.href.replace('/room/index.html', '').replace(/\?.*/, '');
      var url  = base + '/index.htm?room=' + encodeURIComponent(roomCode);
      if (navigator.share) navigator.share({ title:'Play Uno', text:'Join #UNO-'+roomCode, url:url }).catch(function(){});
      else copyToClipboard(url, 'Invite link copied!');
    });

    on('chatSendBtn', 'click', function() {
      var ci = $('chatInput');
      if (!ci) return;
      var txt = ci.value.trim();
      if (!txt) return;
      ci.value = '';
      sendChat(txt);
    });
    on('chatInput', 'keydown', function(e) {
      if (e.key === 'Enter') { var csb = $('chatSendBtn'); if (csb) csb.click(); }
    });

    document.querySelectorAll('.emoji-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ci = $('chatInput'); if (ci) { ci.value += btn.dataset.emoji; ci.focus(); }
      });
    });

    on('langSelect', 'change', function(e) {
      if (window.PlayUnoI18n && window.PlayUnoI18n.setLanguage) window.PlayUnoI18n.setLanguage(e.target.value);
    });

    ['profileModal','warningModal','voiceAppModal'].forEach(function(id) {
      var el = $(id);
      if (el) el.addEventListener('click', function(e) { if (e.target === el) hide(id); });
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { hide('profileModal'); hide('warningModal'); hide('voiceAppModal'); }
    });

    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) { clearTimeout(pollTimer); loadState().then(startPolling); }
    });

    window.addEventListener('beforeunload', function() {
      if (identity && navigator.sendBeacon) {
        var body = JSON.stringify({ token: identity.token });
        navigator.sendBeacon('/api/rooms/' + encodeURIComponent(roomCode) + '/leave',
          new Blob([body], { type:'application/json' }));
      }
    });

    document.addEventListener('playuno:language', function() {
      applyI18n();
      if (roomState) renderRoom();
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
