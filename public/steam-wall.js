/**
 * Steam Wall Auto-Answer — клиентская логика
 */

let currentUserId = null;
let phrases = [];
let targets = [];
let editingPhraseId = null;
let editingTargetId = null;

// ===== ИНИЦИАЛИЗАЦИЯ =====

document.addEventListener('DOMContentLoaded', async () => {
  currentUserId = localStorage.getItem('afkBotUserId');
  if (!currentUserId) {
    showAuthWarning();
    return;
  }

  hideAuthWarning();
  showAllSections();
  await loadStatus();
  await loadSettings();
  await loadPhrases();
  await loadTargets();
  await loadLogs();
  bindEvents();
});

// ===== UI HELPERS =====

function showAuthWarning() {
  document.getElementById('authWarning').style.display = 'block';
  document.getElementById('botControlSection').style.display = 'none';
  document.getElementById('tokenSection').style.display = 'none';
  document.getElementById('settingsSection').style.display = 'none';
  document.getElementById('phrasesSection').style.display = 'none';
  document.getElementById('searchSection').style.display = 'none';
  document.getElementById('targetsSection').style.display = 'none';
  document.getElementById('logsSection').style.display = 'none';
}

function hideAuthWarning() {
  document.getElementById('authWarning').style.display = 'none';
}

function showAllSections() {
  document.getElementById('botControlSection').style.display = 'flex';
  document.getElementById('tokenSection').style.display = 'block';
  document.getElementById('settingsSection').style.display = 'block';
  document.getElementById('phrasesSection').style.display = 'block';
  document.getElementById('searchSection').style.display = 'block';
  document.getElementById('targetsSection').style.display = 'block';
  document.getElementById('logsSection').style.display = 'block';
}

function updateBotStatus(running) {
  const dot = document.getElementById('botStatusDot');
  const text = document.getElementById('botStatusText');
  const startBtn = document.getElementById('startBotBtn');
  const stopBtn = document.getElementById('stopBotBtn');

  if (running) {
    dot.className = 'bot-status-dot active';
    text.textContent = 'Бот работает';
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
  } else {
    dot.className = 'bot-status-dot inactive';
    text.textContent = 'Бот остановлен';
    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
  }
}

// ===== API CALLS =====

async function apiCall(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    return await response.json();
  } catch (err) {
    console.error('API error:', err);
    return { error: 'Ошибка сети' };
  }
}

async function loadStatus() {
  const data = await apiCall('/api/steam-wall/status');
  if (data.error) return;
  updateBotStatus(data.running);
  if (data.hasToken) {
    document.getElementById('tokenInput').placeholder = '••••••••••••••••';
  }
}

async function loadSettings() {
  const data = await apiCall('/api/steam-wall/settings');
  if (data.error) return;

  document.getElementById('skipFriendsToggle').checked = data.skipFriends;
}

async function loadPhrases() {
  const data = await apiCall('/api/steam-wall/phrases');
  phrases = Array.isArray(data) ? data : [];
  renderPhrases();
}

async function loadTargets() {
  const data = await apiCall('/api/steam-wall/targets');
  targets = Array.isArray(data) ? data : [];
  renderTargets();
}

async function loadLogs() {
  const data = await apiCall('/api/steam-wall/logs?limit=30');
  renderLogs(Array.isArray(data) ? data : []);
}

// ===== RENDER =====

function renderPhrases() {
  const container = document.getElementById('phrasesList');
  if (phrases.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💬</div><div class="empty-state-text">Нет фраз. Добавьте первую!</div></div>';
    return;
  }

  container.innerHTML = phrases.map(p => `
    <div class="phrase-item" data-id="${p.id}">
      <span class="phrase-text">${escapeHtml(p.text)}</span>
      <div class="phrase-actions">
        <button class="btn-icon btn-edit" onclick="editPhrase(${p.id})" title="Редактировать">✏️</button>
        <button class="btn-icon btn-delete" onclick="deletePhrase(${p.id})" title="Удалить">🗑️</button>
      </div>
    </div>
  `).join('');
}

function renderTargets() {
  const container = document.getElementById('targetsGrid');
  if (targets.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">Нет пользователей. Добавьте первого!</div></div>';
    return;
  }

  container.innerHTML = targets.map(t => {
    const phrasesList = t.phrases_json ? JSON.parse(t.phrases_json) : [];
    const avatarUrl = `https://avatars.akamai.steamstatic.com/${t.steam_id64}.jpg`;

    return `
      <div class="target-card" data-id="${t.id}" data-name="${escapeHtml(t.name || '')}" data-steamid="${t.steam_id64}">
        <div class="target-card-header">
          <img class="target-avatar" src="${avatarUrl}" alt="Avatar" onerror="this.src='/avatars/nopic.png'" />
          <div class="target-info">
            <div class="target-name">${escapeHtml(t.name || 'Без ника')}</div>
            <div class="target-steamid">${t.steam_id64}</div>
          </div>
        </div>
        ${phrasesList.length > 0 ? `
          <div class="target-phrases">
            <h4>Фразы:</h4>
            <div class="target-phrases-list">
              ${phrasesList.map(p => `<span class="target-phrase-tag">${escapeHtml(p)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        <div class="target-card-actions">
          <button class="btn btn-secondary" onclick="editTarget(${t.id})">✏️ Редактировать</button>
          <button class="btn btn-danger" onclick="deleteTarget(${t.id})">🗑️ Удалить</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderLogs(logs) {
  const container = document.getElementById('logsList');
  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">Пока нет ответов</div></div>';
    return;
  }

  container.innerHTML = logs.map(l => {
    const time = new Date(l.created_at).toLocaleString('ru-RU');
    return `
      <div class="log-item">
        <span class="log-time">${time}</span>
        <span class="log-target">${escapeHtml(l.target_name || l.target_steam_id || '?')}</span>
        <span class="log-reply">${escapeHtml(l.reply_text)}</span>
      </div>
    `;
  }).join('');
}

// ===== EVENTS =====

function bindEvents() {
  document.getElementById('startBotBtn').addEventListener('click', startBot);
  document.getElementById('stopBotBtn').addEventListener('click', stopBot);
  document.getElementById('saveTokenBtn').addEventListener('click', saveToken);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('addPhraseBtn').addEventListener('click', addPhrase);
  document.getElementById('newPhraseInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPhrase();
  });
  document.getElementById('addTargetBtn').addEventListener('click', addTarget);
  document.getElementById('searchInput').addEventListener('input', (e) => filterTargets(e.target.value));
  document.getElementById('searchClearBtn').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    filterTargets('');
  });

  // Модалка фразы
  document.getElementById('editPhraseCancel').addEventListener('click', closePhraseModal);
  document.getElementById('editPhraseSave').addEventListener('click', savePhraseEdit);

  // Модалка пользователя
  document.getElementById('editTargetCancel').addEventListener('click', closeTargetModal);
  document.getElementById('editTargetSave').addEventListener('click', saveTargetEdit);
}

// ===== BOT CONTROL =====

async function startBot() {
  const data = await apiCall('/api/steam-wall/start', { method: 'POST' });
  if (data.error) {
    alert('Ошибка: ' + data.error);
    return;
  }
  updateBotStatus(true);
}

async function stopBot() {
  const data = await apiCall('/api/steam-wall/stop', { method: 'POST' });
  if (data.error) {
    alert('Ошибка: ' + data.error);
    return;
  }
  updateBotStatus(false);
}

// ===== TOKEN =====

async function saveToken() {
  const token = document.getElementById('tokenInput').value.trim();
  if (!token) {
    alert('Введите refresh token');
    return;
  }

  const data = await apiCall('/api/steam-wall/token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

  if (data.error) {
    alert('Ошибка: ' + data.error);
    return;
  }

  document.getElementById('tokenInput').value = '';
  document.getElementById('tokenInput').placeholder = '••••••••••••••••';
  alert('Токен сохранён!');
}

// ===== SETTINGS =====

async function saveSettings() {
  const settings = {
    skipFriends: document.getElementById('skipFriendsToggle').checked,
  };

  const data = await apiCall('/api/steam-wall/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });

  if (data.error) {
    alert('Ошибка: ' + data.error);
    return;
  }

  alert('Настройки сохранены!');
}

// ===== PHRASES =====

async function addPhrase() {
  const input = document.getElementById('newPhraseInput');
  const text = input.value.trim();
  if (!text) return;

  const data = await apiCall('/api/steam-wall/phrases', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

  if (data.error) {
    alert('Ошибка: ' + data.error);
    return;
  }

  input.value = '';
  await loadPhrases();
}

function editPhrase(id) {
  const phrase = phrases.find(p => p.id === id);
  if (!phrase) return;

  editingPhraseId = id;
  document.getElementById('editPhraseText').value = phrase.text;
  document.getElementById('editPhraseModal').classList.add('active');
}

function closePhraseModal() {
  document.getElementById('editPhraseModal').classList.remove('active');
  editingPhraseId = null;
}

async function savePhraseEdit() {
  const text = document.getElementById('editPhraseText').value.trim();
  if (!text || !editingPhraseId) return;

  const data = await apiCall(`/api/steam-wall/phrases/${editingPhraseId}`, {
    method: 'PUT',
    body: JSON.stringify({ text }),
  });

  if (data.error) {
    alert('Ошибка: ' + data.error);
    return;
  }

  closePhraseModal();
  await loadPhrases();
}

async function deletePhrase(id) {
  if (!confirm('Удалить фразу?')) return;

  const data = await apiCall(`/api/steam-wall/phrases/${id}`, { method: 'DELETE' });
  if (data.error) {
    alert('Ошибка: ' + data.error);
    return;
  }

  await loadPhrases();
}

// ===== TARGETS =====

async function addTarget() {
  const steamInput = document.getElementById('targetSteamInput');
  const nameInput = document.getElementById('targetNameInput');
  const steamValue = steamInput.value.trim();
  const nameValue = nameInput.value.trim();

  if (!steamValue) {
    alert('Введите SteamID64 или ссылку');
    return;
  }

  const data = await apiCall('/api/steam-wall/targets', {
    method: 'POST',
    body: JSON.stringify({
      steamId64: steamValue,
      name: nameValue || null,
    }),
  });

  if (data.error) {
    alert('Ошибка: ' + data.error);
    return;
  }

  steamInput.value = '';
  nameInput.value = '';
  await loadTargets();
}

function editTarget(id) {
  const target = targets.find(t => t.id === id);
  if (!target) return;

  editingTargetId = id;
  document.getElementById('editTargetSteamId').value = target.steam_id64;
  document.getElementById('editTargetName').value = target.name || '';
  document.getElementById('editTargetUrl').value = target.profile_url || '';

  const phrasesList = target.phrases_json ? JSON.parse(target.phrases_json) : [];
  document.getElementById('editTargetPhrases').value = phrasesList.join('\n');

  document.getElementById('editTargetModal').classList.add('active');
}

function closeTargetModal() {
  document.getElementById('editTargetModal').classList.remove('active');
  editingTargetId = null;
}

async function saveTargetEdit() {
  if (!editingTargetId) return;

  const phrasesText = document.getElementById('editTargetPhrases').value;
  const phrasesList = phrasesText.split('\n').map(p => p.trim()).filter(Boolean);

  const data = await apiCall(`/api/steam-wall/targets/${editingTargetId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: document.getElementById('editTargetName').value.trim() || null,
      profileUrl: document.getElementById('editTargetUrl').value.trim() || null,
      phrases: phrasesList,
    }),
  });

  if (data.error) {
    alert('Ошибка: ' + data.error);
    return;
  }

  closeTargetModal();
  await loadTargets();
}

async function deleteTarget(id) {
  if (!confirm('Удалить пользователя?')) return;

  const data = await apiCall(`/api/steam-wall/targets/${id}`, { method: 'DELETE' });
  if (data.error) {
    alert('Ошибка: ' + data.error);
    return;
  }

  await loadTargets();
}

function filterTargets(query) {
  const cards = document.querySelectorAll('.target-card');
  const q = query.toLowerCase();

  cards.forEach(card => {
    const name = (card.dataset.name || '').toLowerCase();
    const steamid = (card.dataset.steamid || '').toLowerCase();
    const match = name.includes(q) || steamid.includes(q);
    card.style.display = match ? '' : 'none';
  });
}

// ===== HELPERS =====

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
