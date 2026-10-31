// Play Uno Together — Supabase backend (replaces api.php; works on static hosting like Netlify)
(function () {
  const SB_URL = 'https://xnfdawxqauswzjhdfuth.supabase.co/rest/v1/';
  const SB_KEY = 'sb_publishable_c7zmsOP97B0RF9Ni8kRLAQ_edESJvyl';
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const MODES = ['Standart', 'Acımasız', 'Çift Taraf', 'Parti', 'Hızlı'];
  const AVATARS = ['alex','emma','noah','sophia','liam','olivia','ethan','ava','mason','mia','lucas','luna','oliver','aria','james','zoe','leo','lily','max','grace'];
  const MIN_PLAYERS = 2, MAX_PLAYERS = 10;
  const now = () => new Date().toISOString();
  const rand = (n) => Array.from({ length: n }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  const enc = encodeURIComponent;

  class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
  const fail = (msg, status = 400) => { throw new ApiError(msg, status); };

  async function sb(table, { method = 'GET', query = '', body, prefer } = {}) {
    const headers = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    let res;
    try {
      res = await fetch(SB_URL + table + (query ? '?' + query : ''), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { fail('Could not connect to the server. Check your internet connection.', 0); }
    if (!res.ok) {
      let t = ''; try { t = await res.text(); } catch {}
      console.error('[PlayUnoTogether/Supabase]', method, table, res.status, t);
      fail('Server error (' + res.status + '). Please try again.', res.status);
    }
    if (res.status === 204) return null;
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }

  const stripSvg = (a) => String(a || '').replace(/\.svg$/i, '');
  const cleanAvatar = (a, fb = 'aria') => { const v = stripSvg(a); return AVATARS.includes(v) ? v : fb; };
  const cleanName = (v) => (String(v || '').trim().slice(0, 24) || 'Player');
  const normCode = (v) => String(v || '').replace(/^#?UNO-/i, '').trim().toUpperCase();
  
  // Check if username is in privileged list (case-insensitive)
  const isPrivilegedUser = (name) => {
    const privileged = (window.PLAY_UNO_CONFIG && window.PLAY_UNO_CONFIG.PRIVILEGED_USERS) || [];
    return privileged.some(u => String(u || '').toLowerCase() === String(name || '').toLowerCase());
  };

  async function getRoomRow(code) {
    const rows = await sb('unoplay_rooms', { query: 'select=*&code=eq.' + enc(code) + '&limit=1' });
    if (!rows || !rows.length) fail('This room no longer exists.', 404);
    return rows[0];
  }
  const getMembers = (code) => sb('unoplay_room_members', { query: 'select=*&room_code=eq.' + enc(code) + '&order=joined_at.asc' });
  const gs = (room) => (room.game_state && typeof room.game_state === 'object') ? room.game_state : {};

  function pubRoom(room, members) {
    const g = gs(room);
    const ready = g.ready || {}, dl = g.downloaded || {};
    const bots  = Array.isArray(g.bots) ? g.bots : [];
    const voiceMap = g.voice || {};
    const realPlayers = (members || []).map((m) => {
      const host = !!m.is_host || m.session_id === room.host_session;
      const privileged = isPrivilegedUser(m.display_name);
      return {
        id: m.session_id,
        name: m.display_name,
        avatar: cleanAvatar(m.avatar) + '.svg',
        isHost: host,
        isReady: !!ready[m.session_id],
        downloaded: host || privileged || !!dl[m.session_id],
        voiceJoined: !!voiceMap[m.session_id],
        isBot: false,
      };
    });
    const botPlayers = bots.map((b) => ({
      id: b.id,
      name: b.name,
      avatar: (b.avatar || 'moonbyte') + '.svg',
      isHost: false,
      isReady: true,
      downloaded: false,
      voiceJoined: false,
      isBot: true,
    }));
    return {
      code: room.code,
      mode: g.mode || 'Standart',
      status: room.status === 'playing' ? 'started' : 'waiting',
      hostId: room.host_session,
      maxPlayers: room.max_players || 4,
      players: [...realPlayers, ...botPlayers],
    };
  }

  async function patchRoom(code, fields) {
    return sb('unoplay_rooms', { method: 'PATCH', query: 'code=eq.' + enc(code), body: { ...fields, updated_at: now(), last_active_at: now() }, prefer: 'return=representation' });
  }
  async function patchState(room, mutate) {
    // re-read to reduce lost updates
    const fresh = await getRoomRow(room.code);
    const g = { ...gs(fresh) };
    mutate(g);
    const rows = await patchRoom(room.code, { game_state: g });
    return (rows && rows[0]) || { ...fresh, game_state: g };
  }
  async function addMessage(code, sessionId, name, avatar, message) {
    await sb('unoplay_messages', { method: 'POST', body: { room_code: code, session_id: sessionId, display_name: name, avatar: cleanAvatar(avatar), message }, prefer: 'return=minimal' });
  }
  const sys = (code, room, text) => addMessage(code, 'system', 'UnoPlay', 'aria', text);

  async function addMember(code, sid, name, avatar, isHost) {
    await sb('unoplay_room_members', { method: 'POST', body: { room_code: code, session_id: sid, display_name: name, avatar: cleanAvatar(avatar), is_host: isHost, joined_at: now(), last_seen_at: now() }, prefer: 'return=minimal' });
  }

  async function create(b) {
    const name = cleanName(b.name), avatar = cleanAvatar(b.avatar);
    const mode = MODES.includes(b.mode) ? b.mode : 'Standart';
    const max = parseInt(b.maxPlayers, 10) || 4;
    if (max < MIN_PLAYERS || max > MAX_PLAYERS) fail('Room capacity must be between 2 and 10 players.');
    const sid = 'host_' + rand(28);
    let room = null;
    for (let i = 0; i < 8 && !room; i++) {
      const code = rand(7);
      try {
        const rows = await sb('unoplay_rooms', {
          method: 'POST', prefer: 'return=representation',
          body: { code, host_session: sid, host_name: name, host_avatar: avatar, max_players: max, visibility: 'private', password_hash: '', status: 'lobby', game_state: { started: false, mode, ready: {}, downloaded: {} }, last_active_at: now(), updated_at: now() },
        });
        room = rows && rows[0];
      } catch (e) { if (i === 7) throw e; }
    }
    await addMember(room.code, sid, name, avatar, true);
    await sys(room.code, room, name + ' created the room.');
    return { room: pubRoom(room, await getMembers(room.code)), identity: { playerId: sid, token: sid } };
  }

  async function state(code) {
    const [room, members, msgs] = await Promise.all([
      getRoomRow(code), getMembers(code),
      sb('unoplay_messages', { query: 'select=*&room_code=eq.' + enc(code) + '&order=created_at.desc&limit=100' }),
    ]);
    const messages = (msgs || []).reverse().map((m) => {
      const system = m.session_id === 'system' || (m.display_name === 'UnoPlay' && /^host_/.test(m.session_id || '') && /started the game/i.test(m.message || ''));
      return { name: system ? 'Play Uno Together' : m.display_name, message: m.message, system, time: new Date(m.created_at).getTime() };
    });
    return { room: pubRoom(room, members), messages };
  }

  async function join(code, b) {
    const room = await getRoomRow(code);
    if (room.status === 'playing') fail('This room is no longer accepting new players.', 409);
    const members = await getMembers(code);
    if (members.length >= (room.max_players || 4)) fail('Room is full. This room was created for ' + room.max_players + ' players.', 409);
    const name = cleanName(b.name), avatar = cleanAvatar(b.avatar, 'atlas');
    const sid = 'guest_' + rand(28);
    await addMember(code, sid, name, avatar, false);
    await sys(code, room, name + ' joined the room.');
    return { room: pubRoom(room, await getMembers(code)), identity: { playerId: sid, token: sid } };
  }

  async function op(code, action, b) {
    const token = b.token || '';
    if (!token) fail('Invalid room identity.', 401);
    let room = await getRoomRow(code);
    let members = await getMembers(code);
    const me = members.find((m) => m.session_id === token);
    if (!me) fail('Invalid room identity.', 401);
    const isHost = !!me.is_host || room.host_session === token;
    sb('unoplay_room_members', { method: 'PATCH', query: 'id=eq.' + me.id, body: { last_seen_at: now() } }).catch(() => {});

    if (action === 'ready') {
      room = await patchState(room, (g) => { g.ready = { ...(g.ready || {}) }; g.ready[token] = !g.ready[token]; });
      return { room: pubRoom(room, members) };
    }
    if (action === 'mode') {
      if (!isHost) fail('Only the room owner can do this.', 403);
      if (!MODES.includes(b.mode)) fail('Invalid game mode.');
      room = await patchState(room, (g) => { g.mode = b.mode; });
      await sys(code, room, 'Game mode set to ' + b.mode + '.');
      return { room: pubRoom(room, members) };
    }
    if (action === 'profile') {
      const name = cleanName(b.name || me.display_name), avatar = cleanAvatar(b.avatar || me.avatar);
      await sb('unoplay_room_members', { method: 'PATCH', query: 'id=eq.' + me.id, body: { display_name: name, avatar } });
      if (isHost) await patchRoom(code, { host_name: name, host_avatar: avatar });
      return { room: pubRoom(room, await getMembers(code)) };
    }
    if (action === 'downloaded') {
      room = await patchState(room, (g) => { g.downloaded = { ...(g.downloaded || {}) }; g.downloaded[token] = true; });
      return { room: pubRoom(room, members) };
    }
    if (action === 'chat') {
      const message = String(b.message || '').trim().slice(0, 500);
      if (!message) fail('Message cannot be empty.');
      await addMessage(code, token, me.display_name, me.avatar, message);
      return { ok: true, message: { name: me.display_name, message, time: Date.now() } };
    }
    if (action === 'kick') {
      if (!isHost) fail('Only the room owner can do this.', 403);
      const target = members.find((m) => m.session_id === b.playerId && m.session_id !== token);
      if (!target) fail('Player not found.');
      await sb('unoplay_room_members', { method: 'DELETE', query: 'id=eq.' + target.id });
      await sys(code, room, target.display_name + ' was removed from the room.');
      return { room: pubRoom(room, await getMembers(code)) };
    }
    if (action === 'leave') {
      await sb('unoplay_room_members', { method: 'DELETE', query: 'id=eq.' + me.id });
      const rest = members.filter((m) => m.id !== me.id);
      if (rest.length && isHost) {
        const next = rest[0];
        await sb('unoplay_room_members', { method: 'PATCH', query: 'id=eq.' + next.id, body: { is_host: true } }).catch(() => {});
        await patchRoom(code, { host_session: next.session_id, host_name: next.display_name, host_avatar: cleanAvatar(next.avatar) }).catch(() => {});
      }
      if (rest.length) await sys(code, room, me.display_name + ' left the room.').catch(() => {});
      return { ok: true };
    }
    if (action === 'start') {
      if (!isHost) fail('Only the room owner can do this.', 403);
      const g = { ...gs(room), started: true };
      const rows = await patchRoom(code, { status: 'playing', game_state: g });
      room = (rows && rows[0]) || room;
      const text = 'The host started the game. Download the Play Uno Together desktop app to play.';
      await sys(code, room, text);
      return { ok: true, room: pubRoom(room, members), message: text };
    }
    if (action === 'bot_add') {
      if (!isHost) fail('Only the room owner can add bots.', 403);
      const total = members.length + (gs(room).bots || []).length;
      if (total >= (room.max_players || 4)) fail('Room is full.');
      const BOT_NAMES = ['RoboAce','ByteBot','CardBot','UnoBot','NeuralAce','PixelBot','AutoPlay','BotMaster','AlphaUno','ZeroBot'];
      const BOT_AVATS = ['moonbyte','pixel','nova','atlas','zen'];
      const botCount = (gs(room).bots || []).length;
      const bot = { id: 'bot_' + rand(12), name: BOT_NAMES[botCount % BOT_NAMES.length], avatar: BOT_AVATS[botCount % BOT_AVATS.length] };
      room = await patchState(room, (g) => { g.bots = [...(g.bots || []), bot]; });
      await sys(code, room, bot.name + ' joined the room as a bot.');
      return { room: pubRoom(room, members) };
    }
    if (action === 'bot_kick') {
      if (!isHost) fail('Only the room owner can remove bots.', 403);
      const botId = String(b.botId || '');
      let botName = '';
      room = await patchState(room, (g) => {
        const prev = g.bots || [];
        const target = prev.find((x) => x.id === botId);
        botName = target ? target.name : '';
        g.bots = prev.filter((x) => x.id !== botId);
      });
      if (botName) await sys(code, room, botName + ' was removed from the room.');
      return { room: pubRoom(room, members) };
    }
    if (action === 'voice') {
      const joined = b.joined === true;
      room = await patchState(room, (g) => { g.voice = { ...(g.voice || {}), [token]: joined }; });
      return { ok: true };
    }
    fail('Unknown action', 404);
  }

  async function call(url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    let b = {};
    try { b = options.body ? JSON.parse(options.body) : {}; } catch {}
    const path = String(url).split('?')[0];
    if (/\/health\/?$/.test(path)) return { ok: true, service: 'play-uno-supabase' };
    if (method === 'POST' && /\/api\/rooms\/?$/.test(path)) return create(b);
    const m = path.match(/\/api\/rooms\/([^/]+)(?:\/([^/]+))?/);
    if (!m) fail('Unknown action', 404);
    const code = normCode(decodeURIComponent(m[1]));
    const action = m[2] || 'state';
    if (!code) fail('Room code is required.');
    if (action === 'state') return state(code);
    if (action === 'join') return join(code, b);
    return op(code, action, b);
  }

  window.PlayUnoBackend = { call };
})();
