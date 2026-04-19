const socket = io();

// ── State ──────────────────────────────────────────────────────────────────
let currentUser = null;
let currentRoom = null;
let joinTarget   = null;

// ── View Router ───────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
}

// ── Auth ──────────────────────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

document.getElementById('btn-login').addEventListener('click', async () => {
  const name = document.getElementById('login-name').value.trim();
  const pw   = document.getElementById('login-pw').value;
  const err  = document.getElementById('login-error');
  err.textContent = '';
  const res = await api('/api/login', 'POST', { name, password: pw });
  if (res.error) { err.textContent = res.error; return; }
  currentUser = res.user;
  enterLobby();
});

document.getElementById('btn-register').addEventListener('click', async () => {
  const name = document.getElementById('reg-name').value.trim();
  const pw   = document.getElementById('reg-pw').value;
  const err  = document.getElementById('reg-error');
  err.textContent = '';
  const res = await api('/api/register', 'POST', { name, password: pw });
  if (res.error) { err.textContent = res.error; return; }
  currentUser = res.user;
  enterLobby();
});

['login-pw', 'reg-pw'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      id === 'login-pw'
        ? document.getElementById('btn-login').click()
        : document.getElementById('btn-register').click();
    }
  });
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await api('/api/logout', 'POST');
  currentUser = null;
  showView('auth');
});

// ── Lobby ─────────────────────────────────────────────────────────────────
async function enterLobby() {
  document.getElementById('nav-user').textContent = currentUser;
  await loadRooms();
  showView('lobby');
}

async function loadRooms() {
  const rooms = await api('/api/rooms');
  const list  = document.getElementById('rooms-list');
  if (!rooms.length) {
    list.innerHTML = '<div class="empty-state">No rooms yet.</div>';
    return;
  }
  list.innerHTML = rooms.map(r => `
    <div class="room-card" data-id="${r.id}" data-name="${r.name}">
      <div class="room-card-left">
        <div class="room-card-name">${escHtml(r.name)}</div>
        <div class="room-card-id">${r.id}</div>
        <div class="room-card-owner">by ${escHtml(r.owner)}</div>
      </div>
      <div class="room-card-arrow">›</div>
    </div>
  `).join('');
  list.querySelectorAll('.room-card').forEach(card => {
    card.addEventListener('click', () => openJoinModal(card.dataset.id, card.dataset.name));
  });
}

// ── Join Modal ─────────────────────────────────────────────────────────────
function openJoinModal(id, name) {
  joinTarget = { id, name };
  document.getElementById('modal-join-id').textContent = id;
  document.getElementById('join-pw').value = '';
  document.getElementById('join-error').textContent = '';
  document.getElementById('modal-join').classList.remove('hidden');
  setTimeout(() => document.getElementById('join-pw').focus(), 50);
}

document.getElementById('btn-join-cancel').addEventListener('click', () => {
  document.getElementById('modal-join').classList.add('hidden');
});

document.getElementById('btn-join-confirm').addEventListener('click', async () => {
  const pw  = document.getElementById('join-pw').value;
  const err = document.getElementById('join-error');
  err.textContent = '';
  const res = await api(`/api/rooms/${joinTarget.id}/join`, 'POST', { password: pw });
  if (res.error) { err.textContent = res.error; return; }
  document.getElementById('modal-join').classList.add('hidden');
  enterChat(res.id, res.name);
});

document.getElementById('join-pw').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join-confirm').click();
});

// ── Create Modal ───────────────────────────────────────────────────────────
document.getElementById('btn-open-create').addEventListener('click', () => {
  document.getElementById('create-name').value = '';
  document.getElementById('create-pw').value = '';
  document.getElementById('create-error').textContent = '';
  document.getElementById('modal-create').classList.remove('hidden');
  setTimeout(() => document.getElementById('create-name').focus(), 50);
});

document.getElementById('btn-create-cancel').addEventListener('click', () => {
  document.getElementById('modal-create').classList.add('hidden');
});

document.getElementById('btn-create-confirm').addEventListener('click', async () => {
  const name = document.getElementById('create-name').value.trim();
  const pw   = document.getElementById('create-pw').value;
  const err  = document.getElementById('create-error');
  err.textContent = '';
  const res = await api('/api/rooms', 'POST', { name, password: pw });
  if (res.error) { err.textContent = res.error; return; }
  document.getElementById('modal-create').classList.add('hidden');
  await loadRooms();
});

// ── Chat ───────────────────────────────────────────────────────────────────
async function enterChat(roomId, roomName) {
  currentRoom = roomId;
  document.getElementById('chat-room-name').textContent = roomName;
  document.getElementById('chat-room-id').textContent = roomId;
  document.getElementById('messages').innerHTML = '';

  const msgs = await api(`/api/rooms/${roomId}/messages`);
  msgs.forEach(m => renderMessage(m.user, m.text, m.ts));

  socket.emit('join', { room: roomId, user: currentUser });
  showView('chat');
  scrollToBottom();
  setTimeout(() => document.getElementById('msg-input').focus(), 100);
}

document.getElementById('btn-back').addEventListener('click', () => {
  socket.emit('leave', { room: currentRoom, user: currentUser });
  currentRoom = null;
  loadRooms();
  showView('lobby');
});

document.getElementById('btn-send').addEventListener('click', sendMessage);
document.getElementById('msg-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const input = document.getElementById('msg-input');
  const text  = input.value.trim();
  if (!text || !currentRoom) return;
  socket.emit('message', { room: currentRoom, text, user: currentUser });
  input.value = '';
}

socket.on('message', ({ user, text, ts }) => {
  if (document.getElementById('view-chat').classList.contains('active')) {
    renderMessage(user, text, ts);
    scrollToBottom();
  }
});

socket.on('system', ({ text }) => {
  if (!document.getElementById('view-chat').classList.contains('active')) return;
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg-system';
  div.textContent = text;
  msgs.appendChild(div);
  scrollToBottom();
});

function renderMessage(user, text, ts) {
  const msgs = document.getElementById('messages');
  const isOwn = user === currentUser;
  const d = new Date(ts * 1000);
  const time = d.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' }) + ' - ' + d.toLocaleDateString('de', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const div = document.createElement('div');
  div.className = 'msg' + (isOwn ? ' own' : '');
  div.innerHTML = `
    <div class="msg-header">
      <span class="msg-user">${escHtml(user)}</span>
      <span class="msg-time">${time}</span>
    </div>
    <div class="msg-text">${escHtml(text)}</div>
  `;
  msgs.appendChild(div);
}

function scrollToBottom() {
  const msgs = document.getElementById('messages');
  msgs.scrollTop = msgs.scrollHeight;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────
(async () => {
  const res = await api('/api/me');
  if (res.user) {
    currentUser = res.user;
    enterLobby();
  } else {
    showView('auth');
  }
})();
