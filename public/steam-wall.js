/**
 * Steam Wall Auto-Answer — клиентская логика
 */

let currentUserId = null;
let phrases = [];
let targets = [];
let editingPhraseId = null;
let editingTargetId = null;

// ===== КАСТОМНЫЕ МОДАЛКИ =====

function showToast(message, type = 'success') {
  const existing = document.querySelector('.sw-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `sw-toast sw-toast-${type}`;
  toast.innerHTML = `
    <svg class="icon icon-inline"><use href="#icon-${type === 'success' ? 'check' : 'warning'}"></use></svg>
    ${escapeHtml(message)}
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('sw-toast-show'));
  setTimeout(() => {
    toast.classList.remove('sw-toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showConfirm(message) {
  return new Promise((resolve) => {
    document.body.classList.add('modal-open');
    const overlay = document.createElement('div');
    overlay.className = 'sw-modal-overlay active';
    overlay.innerHTML = `
      <div class="sw-modal" style="max-width: 380px; text-align: center;">
        <div style="margin-bottom: 16px;">
          <svg class="icon" style="width: 2.5em; height: 2.5em; color: #ff9800;"><use href="#icon-warning"></use></svg>
        </div>
        <p style="color: #ccc; margin: 0 0 24px 0; font-size: 1rem;">${escapeHtml(message)}</p>
        <div class="sw-modal-actions" style="justify-content: center; border-top: none; padding-top: 0; margin-top: 0;">
          <button class="btn btn-secondary" id="confirmCancel">Отмена</button>
          <button class="btn btn-danger" id="confirmOk">Удалить</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = () => {
      overlay.remove();
      document.body.classList.remove('modal-open');
    };

    overlay.querySelector('#confirmCancel').addEventListener('click', () => {
      cleanup();
      resolve(false);
    });
    overlay.querySelector('#confirmOk').addEventListener('click', () => {
      cleanup();
      resolve(true);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });
  });
}

// ===== ИНИЦИАЛИЗАЦИЯ =====

document.addEventListener('DOMContentLoaded', async () => {
  // Получаем данные пользователя из localStorage (как в cheater-checker)
  currentUserId = localStorage.getItem('afkBotUserId') || null;

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

function addUserIdToUrl(url) {
  if (!currentUserId) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}userId=${currentUserId}`;
}

async function apiCall(url, options = {}) {
  try {
    url = addUserIdToUrl(url);
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
  updateTokenStatus(data.hasToken);
}

function updateTokenStatus(hasToken) {
  const statusEl = document.getElementById('tokenStatus');
  if (hasToken) {
    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      <div class="token-status-linked">
        <svg class="icon icon-inline"><use href="#icon-check"></use></svg>
        <span>Steam аккаунт привязан</span>
      </div>
    `;
  } else {
    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      <div class="token-status-unlinked">
        <svg class="icon icon-inline"><use href="#icon-warning"></use></svg>
        <span>Аккаунт не привязан — отсканируйте QR-код или вставьте токен</span>
      </div>
    `;
  }
}

async function loadSettings() {
  const data = await apiCall('/api/steam-wall/settings');
  if (data.error) return;

  document.getElementById('skipFriendsToggle').checked = data.skipFriends;
  document.getElementById('useGeneralPhrasesToggle').checked = data.useGeneralPhrases !== false;
  document.getElementById('useUserPhrasesToggle').checked = data.useUserPhrases !== false;
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
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg class="icon" style="width:3em;height:3em;opacity:0.5"><use href="#icon-chat"></use></svg></div><div class="empty-state-text">Нет фраз. Добавьте первую!</div></div>';
    return;
  }

  container.innerHTML = phrases.map(p => `
    <div class="phrase-item" data-id="${p.id}">
      <input type="text" class="phrase-edit-input" value="${escapeHtml(p.text)}" data-id="${p.id}" onchange="savePhraseInline(${p.id}, this.value)" />
      <div class="phrase-actions">
        <button class="btn-icon btn-delete" onclick="deletePhrase(${p.id})" title="Удалить"><svg class="icon icon-btn"><use href="#icon-delete"></use></svg></button>
      </div>
    </div>
  `).join('');
}

function renderTargets() {
  const container = document.getElementById('targetsGrid');
  if (targets.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg class="icon" style="width:3em;height:3em;opacity:0.5"><use href="#icon-users"></use></svg></div><div class="empty-state-text">Нет пользователей. Добавьте первого!</div></div>';
    return;
  }

  container.innerHTML = targets.map(t => {
    const phrasesList = t.phrases_json ? JSON.parse(t.phrases_json) : [];
    const avatarUrl = t.avatar_url || `https://avatars.akamai.steamstatic.com/${t.steam_id64}_full.jpg`;

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
          <button class="btn btn-secondary" onclick="editTarget(${t.id})"><svg class="icon icon-inline"><use href="#icon-edit"></use></svg> Редактировать</button>
          <button class="btn btn-danger" onclick="deleteTarget(${t.id})"><svg class="icon icon-inline"><use href="#icon-delete"></use></svg> Удалить</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderLogs(logs) {
  const container = document.getElementById('logsList');
  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg class="icon" style="width:3em;height:3em;opacity:0.5"><use href="#icon-clock"></use></svg></div><div class="empty-state-text">Пока нет ответов</div></div>';
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
  document.getElementById('startQrBtn').addEventListener('click', startQrLogin);
  document.getElementById('cancelQrBtn').addEventListener('click', cancelQrLogin);
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
    showToast('Ошибка: ' + data.error, 'error');
    return;
  }
  updateBotStatus(true);
}

async function stopBot() {
  const data = await apiCall('/api/steam-wall/stop', { method: 'POST' });
  if (data.error) {
    showToast('Ошибка: ' + data.error, 'error');
    return;
  }
  updateBotStatus(false);
}

// ===== TOKEN =====

async function saveToken() {
  const token = document.getElementById('tokenInput').value.trim();
  if (!token) {
    showToast('Введите refresh token', 'error');
    return;
  }

  const data = await apiCall('/api/steam-wall/token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

  if (data.error) {
    showToast('Ошибка: ' + data.error, 'error');
    return;
  }

  document.getElementById('tokenInput').value = '';
  document.getElementById('tokenInput').placeholder = '••••••••••••••••';
  showToast('Токен сохранён!');
  await loadStatus(); // Обновляем статус привязки
}

// ===== QR LOGIN =====

let qrPollTimer = null;

function generateQRSvg(url) {
  // Простой генератор QR-кода через API
  return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
}

async function startQrLogin() {
  const startBtn = document.getElementById('startQrBtn');
  const cancelBtn = document.getElementById('cancelQrBtn');
  const container = document.getElementById('qrCodeContainer');
  const status = document.getElementById('qrStatus');

  startBtn.style.display = 'none';
  status.textContent = '⏳ Создание QR-кода...';
  container.innerHTML = '';

  const data = await apiCall('/api/steam-wall/qr/start', { method: 'POST' });

  if (data.error) {
    status.textContent = '❌ ' + data.error;
    startBtn.style.display = 'inline-block';
    return;
  }

  // Показываем QR-код
  const img = document.createElement('img');
  img.src = generateQRSvg(data.qrChallengeUrl);
  img.alt = 'QR Code';
  img.style.borderRadius = '8px';
  img.style.background = 'white';
  img.style.padding = '10px';
  container.appendChild(img);

  status.textContent = '📱 Отсканируйте код через Steam на телефоне';
  cancelBtn.style.display = 'inline-block';

  // Запускаем.polling
  startQrPolling();
}

function startQrPolling() {
  if (qrPollTimer) clearInterval(qrPollTimer);
  qrPollTimer = setInterval(checkQrStatus, 2000);
}

async function checkQrStatus() {
  const data = await apiCall('/api/steam-wall/qr/status');
  const status = document.getElementById('qrStatus');

  if (data.status === 'authenticated') {
    stopQrPolling();
    status.textContent = '✅ Аккаунт привязан!';
    document.getElementById('qrCodeContainer').innerHTML = '';
    document.getElementById('cancelQrBtn').style.display = 'none';
    document.getElementById('startQrBtn').style.display = 'inline-block';
    document.getElementById('tokenInput').placeholder = '••••••••••••••••';
    showToast('Steam аккаунт успешно привязан!');
    await loadStatus(); // Обновляем статус привязки
  } else if (data.status === 'timeout') {
    stopQrPolling();
    status.textContent = '⏰ Время вышло. Попробуйте снова.';
    document.getElementById('qrCodeContainer').innerHTML = '';
    document.getElementById('cancelQrBtn').style.display = 'none';
    document.getElementById('startQrBtn').style.display = 'inline-block';
  } else if (data.status === 'error') {
    stopQrPolling();
    status.textContent = '❌ Ошибка. Попробуйте снова.';
    document.getElementById('cancelQrBtn').style.display = 'none';
    document.getElementById('startQrBtn').style.display = 'inline-block';
  } else if (data.status === 'none') {
    stopQrPolling();
  }
  // 'waiting' — продолжаем polling
}

function stopQrPolling() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }
}

async function cancelQrLogin() {
  await apiCall('/api/steam-wall/qr/cancel', { method: 'POST' });
  stopQrPolling();
  document.getElementById('qrCodeContainer').innerHTML = '';
  document.getElementById('qrStatus').textContent = '';
  document.getElementById('cancelQrBtn').style.display = 'none';
  document.getElementById('startQrBtn').style.display = 'inline-block';
}

// ===== SETTINGS =====

async function saveSettingsOnchange() {
  const settings = {
    skipFriends: document.getElementById('skipFriendsToggle').checked,
    useGeneralPhrases: document.getElementById('useGeneralPhrasesToggle').checked,
    useUserPhrases: document.getElementById('useUserPhrasesToggle').checked,
  };

  const data = await apiCall('/api/steam-wall/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });

  if (data.error) {
    showToast('Ошибка: ' + data.error, 'error');
    return;
  }

  showToast('Настройки сохранены!');
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
    showToast('Ошибка: ' + data.error, 'error');
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
  document.body.classList.add('modal-open');
}

function closePhraseModal() {
  document.getElementById('editPhraseModal').classList.remove('active');
  document.body.classList.remove('modal-open');
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
    showToast('Ошибка: ' + data.error, 'error');
    return;
  }

  closePhraseModal();
  await loadPhrases();
}

async function savePhraseInline(id, newText) {
  const text = newText.trim();
  if (!text) return;

  const data = await apiCall(`/api/steam-wall/phrases/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ text }),
  });

  if (data.error) {
    showToast('Ошибка: ' + data.error, 'error');
    await loadPhrases();
  } else {
    showToast('Фраза обновлена');
  }
}

async function deletePhrase(id) {
  const item = document.querySelector(`.phrase-item[data-id="${id}"]`);
  if (!item) return;

  // Показываем подтверждение внутри элемента
  const actions = item.querySelector('.phrase-actions');
  const originalHTML = actions.innerHTML;
  actions.innerHTML = `
    <span class="phrase-confirm-text">Удалить?</span>
    <button class="btn-icon btn-confirm-yes" onclick="confirmDeletePhrase(${id})" title="Да"><svg class="icon icon-btn"><use href="#icon-check"></use></svg></button>
    <button class="btn-icon btn-confirm-no" onclick="cancelDeletePhrase(${id})" title="Нет"><svg class="icon icon-btn"><use href="#icon-cross"></use></svg></button>
  `;
  item.dataset.originalActions = originalHTML;
}

function confirmDeletePhrase(id) {
  doDeletePhrase(id);
}

function cancelDeletePhrase(id) {
  const item = document.querySelector(`.phrase-item[data-id="${id}"]`);
  if (!item) return;
  const actions = item.querySelector('.phrase-actions');
  actions.innerHTML = item.dataset.originalActions || '';
}

async function doDeletePhrase(id) {
  const data = await apiCall(`/api/steam-wall/phrases/${id}`, { method: 'DELETE' });
  if (data.error) {
    showToast('Ошибка: ' + data.error, 'error');
    return;
  }
  showToast('Фраза удалена');
  await loadPhrases();
}

// ===== TARGETS =====

async function addTarget() {
  const steamInput = document.getElementById('targetSteamInput');
  const nameInput = document.getElementById('targetNameInput');
  const steamValue = steamInput.value.trim();
  const nameValue = nameInput.value.trim();

  if (!steamValue) {
    showToast('Введите SteamID64 или ссылку', 'error');
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
    showToast('Ошибка: ' + data.error, 'error');
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
  document.body.classList.add('modal-open');
  updateLineNumbers();
}

function updateLineNumbers() {
  const textarea = document.getElementById('editTargetPhrases');
  const lineNumbers = document.getElementById('lineNumbers');
  const lines = textarea.value.split('\n').length;
  lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
}

function syncScroll() {
  const textarea = document.getElementById('editTargetPhrases');
  const lineNumbers = document.getElementById('lineNumbers');
  lineNumbers.scrollTop = textarea.scrollTop;
}

function closeTargetModal() {
  document.getElementById('editTargetModal').classList.remove('active');
  document.body.classList.remove('modal-open');
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
    showToast('Ошибка: ' + data.error, 'error');
    return;
  }

  closeTargetModal();
  await loadTargets();
}

async function deleteTarget(id) {
  if (!await showConfirm('Удалить пользователя?')) return;

  const data = await apiCall(`/api/steam-wall/targets/${id}`, { method: 'DELETE' });
  if (data.error) {
    showToast('Ошибка: ' + data.error, 'error');
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
