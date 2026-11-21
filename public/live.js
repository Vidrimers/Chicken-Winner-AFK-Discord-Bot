// 🎮 Live-трекер CS2 — страница live.html
// Опрос /api/live/state раз в 2 секунды, состав собирается нарастающим итогом

const POLL_MS = 2000;
const TEAM_SCORE_MODES = ['casual', 'competitive', 'wingman'];

let tokenVisible = false;
let lastToken = '';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

function toast(text) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ===== Отрисовка =====

function renderAccess(access) {
  const items = [
    ['steam', 'Steam привязан', 'Привяжи Steam ID в настройках профиля'],
    ['telegram', 'Telegram привязан', 'Привяжи Telegram через бота'],
    ['member', 'Участник Discord-сервера', 'Вступи на наш Discord-сервер'],
  ];
  document.getElementById('accessList').innerHTML = items.map(([key, label, hint]) => {
    const ok = !!access[key];
    return `<div class="access-item">
      <span>${ok ? '✅' : '❌'}</span>
      <span>${esc(label)}</span>
      ${ok ? '' : `<span class="live-hint">— ${esc(hint)}</span>`}
    </div>`;
  }).join('');
}

function renderToken(token) {
  lastToken = token || '';
  const el = document.getElementById('tokenDisplay');
  el.textContent = tokenVisible && token ? token : '••••••••••••••••';
}

function renderMatch(match) {
  const section = document.getElementById('matchSection');
  if (!match) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  document.getElementById('mapName').textContent = match.map || '—';
  document.getElementById('modeName').textContent = match.mode || '—';
  document.getElementById('roundInfo').textContent = match.round != null ? match.round : '—';
  document.getElementById('phaseName').textContent = match.phase || '—';

  // Счёт команд показываем только там, где он есть (в arms race его нет)
  const scoreBox = document.getElementById('scoreBox');
  if (TEAM_SCORE_MODES.includes(String(match.mode || '').toLowerCase())) {
    scoreBox.style.display = '';
    document.getElementById('scoreValue').innerHTML =
      `<span class="score-ct">${match.scoreCt}</span> : <span class="score-t">${match.scoreT}</span>`;
  } else {
    scoreBox.style.display = 'none';
  }
}

function renderMe(me) {
  const row = document.getElementById('meRow');
  if (!me) {
    row.innerHTML = '<div class="live-hint">Данные игрока появятся, когда войдёшь в матч.</div>';
    return;
  }
  row.innerHTML = `
    <div><div class="live-label">Игрок</div><div class="live-value">${esc(me.name)}</div></div>
    <div><div class="live-label">Команда</div><div class="live-value team-${esc(me.team)}">${esc(me.team || '—')}</div></div>
    <div><div class="live-label">HP / Броня</div><div class="live-value">${esc(me.hp != null ? me.hp : '—')} / ${esc(me.armor != null ? me.armor : '—')}</div></div>
    <div><div class="live-label">Деньги</div><div class="live-value">$${esc(me.money != null ? me.money : '—')}</div></div>
    <div><div class="live-label">K / D / A</div><div class="live-value">${me.kills} / ${me.deaths} / ${me.assists}</div></div>
    <div><div class="live-label">Оружие</div><div class="live-value">${esc(me.weapon || '—')}</div></div>
    <div><div class="live-label">Состояние</div><div class="live-value">${me.hp === 0 ? '💀 мёртв' : '🟢 в игре'}</div></div>
  `;
}

function renderPlayers(match, players, me) {
  const note = document.getElementById('rosterNote');
  const body = document.getElementById('playersBody');
  const empty = document.getElementById('playersEmpty');
  const table = document.getElementById('playersTable');

  if (match && match.rosterLive) {
    note.textContent = 'Состав получен (Spectate)';
    note.classList.add('on');
  } else {
    note.textContent = 'Список доступен только в режиме Spectate';
    note.classList.remove('on');
  }

  if (!players || !players.length) {
    body.innerHTML = '';
    table.style.display = 'none';
    empty.style.display = '';
    return;
  }
  table.style.display = '';
  empty.style.display = 'none';

  // Свои первыми, потом CT, потом T
  const mySid = me ? me.steamid : null;
  const order = { CT: 0, T: 1 };
  const sorted = [...players].sort((a, b) => {
    if (mySid) {
      const am = a.steamid === mySid ? 0 : 1;
      const bm = b.steamid === mySid ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    return (order[a.team] != null ? order[a.team] : 2) - (order[b.team] != null ? order[b.team] : 2);
  });

  sorted.forEach((p) => { if (p.name) playerNames[p.steamid] = p.name; });

  body.innerHTML = sorted.map((p) => {
    const isMe = mySid && p.steamid === mySid;
    const inDb = p.inDb
      ? `<span class="in-db-badge">🔴 В базе: ${p.inDb === 'bot' ? 'бот' : 'читер'}</span>`
      : '';
    return `<tr class="${isMe ? 'me' : ''}">
      <td><span class="player-name" onclick="openPreview('${esc(p.steamid)}')">${esc(p.name || '—')}</span>${isMe ? ' <small style="opacity:0.5">(ты)</small>' : ''}</td>
      <td class="team-${esc(p.team)}">${esc(p.team || '—')}</td>
      <td><span class="sid-cell" onclick="copySid('${esc(p.steamid)}', event)" title="Клик — копировать SteamID">${esc(p.steamid)}</span></td>
      <td>${p.kills || 0}/${p.deaths || 0}/${p.assists || 0}</td>
      <td>${inDb}</td>
      <td>
        <div class="row-actions">
          <button class="mini-btn" onclick="openPreview('${esc(p.steamid)}')">🔍 Проверить</button>
          <button class="mini-btn" onclick="queueAdd('${esc(p.steamid)}', 'cheater')">➕ Читеры</button>
          <button class="mini-btn" onclick="queueAdd('${esc(p.steamid)}', 'bot')">➕ Боты</button>
          <button class="mini-btn" onclick="openCsstat('${esc(p.steamid)}')">csstat</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function fetchState() {
  try {
    const r = await fetch('/api/live/state');
    if (r.status === 401) {
      window.location.href = '/cheater-checker.html';
      return;
    }
    const data = await r.json();
    if (data.error) return;

    renderAccess(data.access || {});
    if (!data.granted) {
      document.getElementById('accessSection').style.display = 'block';
      document.getElementById('setupSection').style.display = 'none';
      document.getElementById('matchSection').style.display = 'none';
      return;
    }
    document.getElementById('accessSection').style.display = 'none';
    document.getElementById('setupSection').style.display = 'block';

    // Индикатор связи с игрой
    const gsiEl = document.getElementById('gsiStatus');
    gsiEl.textContent = data.gsiAlive
      ? '🟢 GSI: пакеты от игры идут'
      : '🔴 GSI: пакетов нет — проверь конфиг и перезапуск игры';
    gsiEl.style.color = data.gsiAlive ? '#a5d6a7' : '#ff8a80';

    // Игра не на привязанном Steam-аккаунте
    const warn = document.getElementById('accountWarn');
    if (data.wrongAccount && data.playingSteamId) {
      warn.style.display = 'block';
      warn.innerHTML = `⚠️ Сейчас играешь не на привязанном Steam-аккаунте: <code>${esc(data.playingSteamId)}</code>`;
    } else {
      warn.style.display = 'none';
    }

    renderToken(data.token);
    renderMatch(data.match);
    renderMe(data.me);
    renderPlayers(data.match, data.players, data.me);
  } catch {
    // сеть моргнула — просто пропускаем тик
  }
}

// ===== Действия =====

function copySid(sid, event) {
  if (event) event.stopPropagation();
  const text = String(sid);
  const done = () => toast('SteamID скопирован');
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch { toast('Не удалось скопировать'); }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  } else {
    fallback();
  }
}

// csstat: steamcommunity.rip → редирект на csst.at; сразу открываем финальный адрес
function openCsstat(steamId) {
  window.open(`https://csst.at/profile/${encodeURIComponent(steamId)}`, '_blank');
}

// Парсинг профиля без сохранения в базу
async function openPreview(steamId) {
  const modal = document.getElementById('previewModal');
  const body = document.getElementById('previewBody');
  body.innerHTML = '<div class="live-hint">Загрузка профиля...</div>';
  modal.style.display = 'flex';
  try {
    const r = await fetch('/api/live/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steamId }),
    });
    const data = await r.json();
    if (!data.profile) {
      body.innerHTML = `<div class="live-hint">Не удалось получить профиль.${data.errors && data.errors.length ? ' ' + esc(data.errors.join('; ')) : ''}</div>`;
      return;
    }
    const p = data.profile;
    if (p.personaName) playerNames[p.steamId] = p.personaName;
    const vac = p.vacBanned
      ? `⚠️ VAC-бан (${p.numberOfVacBans || 0}), последний ${p.daysSinceLastBan || 0} дн. назад`
      : '✅ Без VAC-банов';
    const gameBans = p.numberOfGameBans > 0
      ? `⚠️ Банов в играх: ${p.numberOfGameBans}`
      : '✅ Без игровых банов';
    body.innerHTML = `
      <div class="live-row" style="margin-bottom:12px">
        <img src="${esc(p.avatarUrl || '/avatars/nopic.png')}" onerror="this.src='/avatars/nopic.png'" style="width:64px;height:64px;border-radius:10px">
        <div>
          <div class="live-value">${esc(p.personaName)}</div>
          <div class="live-hint">${esc(p.steamId)}</div>
          ${data.inDb ? `<div style="margin-top:4px"><span class="in-db-badge">🔴 В базе: ${data.inDb === 'bot' ? 'бот' : 'читер'}</span></div>` : ''}
        </div>
      </div>
      <div class="preview-grid">
        <div><div class="live-label">VAC</div><div class="live-value">${vac}</div></div>
        <div><div class="live-label">Игровые баны</div><div class="live-value">${gameBans}</div></div>
        <div><div class="live-label">Community</div><div class="live-value">${p.communityBanned ? '⚠️ Заблокирован' : '✅ Чист'}</div></div>
        <div><div class="live-label">Торговля</div><div class="live-value">${p.economyBan && p.economyBan !== 'none' ? '⚠️ ' + esc(p.economyBan) : '✅ Без ограничений'}</div></div>
      </div>
      <div class="row-actions" style="justify-content:flex-start;margin-top:12px">
        <button class="confirm-delete-btn" onclick="queueAdd('${esc(p.steamId)}', 'cheater')">➕ В читеры</button>
        <button class="confirm-cancel-btn" onclick="queueAdd('${esc(p.steamId)}', 'bot')">➕ В боты</button>
        <button class="mini-btn" onclick="openCsstat('${esc(p.steamId)}')">csstat</button>
        <a class="mini-btn" style="text-decoration:none" href="${esc(p.profileUrl || '#')}" target="_blank" rel="noopener">Steam</a>
      </div>
    `;
  } catch {
    body.innerHTML = '<div class="live-hint">Ошибка загрузки профиля.</div>';
  }
}

// ===== Очередь добавления в базу =====
// «➕» складывает игрока в очередь: добавление идёт постепенно (лимит /check — 5/мин),
// чтобы не словить rate limit и никого не упустить. Очередь хранится в localStorage
// и продолжает работу при следующем открытии страницы.

const QUEUE_KEY = 'afkBotLiveAddQueue';
let addQueue = [];
let queueBusy = false;
const queueSendTimes = [];
const playerNames = {};

function loadQueue() {
  try {
    addQueue = JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch {
    addQueue = [];
  }
  // Если страницу закрыли во время отправки — возвращаем в очередь
  addQueue.forEach((i) => { if (i.status === 'working') i.status = 'pending'; });
}

function saveQueue() {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(addQueue)); } catch {}
}

function queueAdd(steamId, type) {
  const sid = String(steamId);
  const exists = addQueue.some((i) =>
    i.steamId === sid && i.type === type && (i.status === 'pending' || i.status === 'working'));
  if (exists) {
    toast('Игрок уже в очереди');
    return;
  }
  addQueue.push({
    id: 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    steamId: sid,
    type,
    name: playerNames[sid] || '',
    status: 'pending',
  });
  saveQueue();
  renderQueue();
  processQueue();
  toast('Добавлено в очередь');
}

function retryQueueItem(id) {
  const item = addQueue.find((i) => i.id === id);
  if (!item) return;
  item.status = 'pending';
  delete item.error;
  saveQueue();
  renderQueue();
  processQueue();
}

function removeQueueItem(id) {
  addQueue = addQueue.filter((i) => i.id !== id);
  saveQueue();
  renderQueue();
}

function clearFinishedQueue() {
  addQueue = addQueue.filter((i) => i.status === 'pending' || i.status === 'working');
  saveQueue();
  renderQueue();
}

function renderQueue() {
  const section = document.getElementById('queueSection');
  const list = document.getElementById('queueList');
  if (!addQueue.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  const waiting = addQueue.filter((i) => i.status === 'pending' || i.status === 'working').length;
  const done = addQueue.filter((i) => i.status === 'done').length;
  const failed = addQueue.filter((i) => i.status === 'error').length;
  list.innerHTML = `
    <div class="live-hint" style="margin-bottom:8px">
      В очереди: ${waiting} · Добавлено: ${done} · Ошибок: ${failed} ·
      добавление постепенное (до 5 в минуту), чтобы не получить rate limit
    </div>
    ${addQueue.map((i) => `
      <div class="access-item">
        <span>${i.status === 'pending' ? '⏳' : i.status === 'working' ? '🔄' : i.status === 'done' ? '✅' : '❌'}</span>
        <span>${esc(i.name || i.steamId)}</span>
        <span class="live-hint">→ ${i.type === 'bot' ? 'Боты' : 'Читеры'}${i.error ? ' · ' + esc(i.error) : ''}${i.wasDuplicate ? ' · уже в базе' : ''}</span>
        ${i.status === 'error' ? `<button class="mini-btn" onclick="retryQueueItem('${i.id}')">Повторить</button>` : ''}
        <button class="mini-btn" onclick="removeQueueItem('${i.id}')">✕</button>
      </div>
    `).join('')}
    <div style="margin-top:8px">
      <button class="mini-btn" onclick="clearFinishedQueue()">Очистить завершённые</button>
    </div>
  `;
}

async function processQueue() {
  if (queueBusy) return;
  const next = addQueue.find((i) => i.status === 'pending');
  if (!next) {
    renderQueue();
    return;
  }

  // Плавный темп: не более 5 запросов в минуту (ограничение /check)
  const now = Date.now();
  while (queueSendTimes.length && now - queueSendTimes[0] > 60000) queueSendTimes.shift();
  if (queueSendTimes.length >= 5) {
    setTimeout(processQueue, 60000 - (now - queueSendTimes[0]) + 500);
    return;
  }

  queueBusy = true;
  next.status = 'working';
  saveQueue();
  renderQueue();
  queueSendTimes.push(Date.now());

  const label = next.type === 'bot' ? 'боты' : 'читеры';
  try {
    const r = await fetch('/api/cheater-checker/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [`https://steamcommunity.com/profiles/${next.steamId}/`],
        type: next.type,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      next.status = 'error';
      next.error = data.error || 'Ошибка добавления';
      toast(`❌ ${next.name || next.steamId}: ${next.error}`);
    } else if (data.typeConflicts && data.typeConflicts.length) {
      next.status = 'error';
      next.error = 'уже добавлен с другим типом';
      toast(`❌ ${next.name || next.steamId}: ${next.error}`);
    } else if (data.duplicates && data.duplicates.length) {
      next.status = 'done';
      next.wasDuplicate = true;
    } else if (data.results && data.results.length) {
      next.status = 'done';
      toast(`✅ ${next.name || next.steamId} добавлен в «${label}»`);
    } else {
      next.status = 'error';
      next.error = (data.errors && data.errors[0]) || 'Не удалось добавить';
      toast(`❌ ${next.name || next.steamId}: ${next.error}`);
    }
  } catch {
    next.status = 'error';
    next.error = 'Ошибка сети';
    toast(`❌ ${next.name || next.steamId}: ошибка сети`);
  }

  queueBusy = false;
  saveQueue();
  renderQueue();
  fetchState();
  setTimeout(processQueue, 700);
}

// ===== Тема пользователя (как в чекере) =====

async function loadUserTheme() {
  try {
    const s = await fetch('/api/session');
    const sj = await s.json();
    if (!sj || !sj.userId) return;
    const r = await fetch(`/api/stats/${sj.userId}`);
    if (r.ok) {
      const data = await r.json();
      const theme = data.settings?.theme || 'standard';
      document.body.setAttribute('data-theme', theme);
    }
  } catch {
    // тема из localStorage уже применена — молча остаёмся на ней
  }
}

// ===== Вкладки: Live / История матчей =====

function switchLiveView(view) {
  document.getElementById('viewLive').style.display = view === 'live' ? '' : 'none';
  document.getElementById('viewHistory').style.display = view === 'history' ? '' : 'none';
  document.querySelectorAll('.header-tab[data-live-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.liveView === view);
  });
}

// ===== Инициализация =====

document.getElementById('tokenToggle').addEventListener('click', () => {
  tokenVisible = !tokenVisible;
  document.getElementById('tokenToggle').textContent = tokenVisible ? 'Скрыть' : 'Показать';
  renderToken(lastToken);
});
document.getElementById('tokenDisplay').addEventListener('click', () => {
  document.getElementById('tokenToggle').click();
});

document.getElementById('previewClose').addEventListener('click', () => {
  document.getElementById('previewModal').style.display = 'none';
});
document.getElementById('previewModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

document.getElementById('infoBtn').addEventListener('click', () => {
  document.getElementById('infoModal').style.display = 'flex';
});
document.getElementById('infoClose').addEventListener('click', () => {
  document.getElementById('infoModal').style.display = 'none';
});
document.getElementById('infoModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

loadUserTheme();
loadQueue();
renderQueue();
processQueue();
fetchState();
setInterval(fetchState, POLL_MS);
