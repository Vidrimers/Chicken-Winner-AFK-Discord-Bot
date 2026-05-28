/**
 * Чекер читеров — клиентская логика
 * Одиночная/массовая проверка Steam-профилей, отображение результатов
 */

// Глобальное состояние
let CONFIG = { ADMIN_USER_ID: '' };
let currentUserId = null;
let currentUsername = null;
let profiles = [];

// ===== ИНИЦИАЛИЗАЦИЯ =====

document.addEventListener('DOMContentLoaded', async () => {
  // Загружаем конфигурацию
  await loadConfig();

  // Получаем данные пользователя из localStorage
  currentUserId = localStorage.getItem('afkBotUserId') || null;
  currentUsername = localStorage.getItem('afkBotUsername') || null;

  // Если нет username, пробуем получить из сессии
  if (currentUserId && !currentUsername) {
    await fetchUsername();
  }

  // Загружаем тему пользователя
  await loadUserTheme();

  // Проверяем авторизацию
  updateAuthState();

  // Загружаем сохранённые профили
  await loadProfiles();

  // Привязываем обработчики
  bindEvents();
});

/**
 * Загрузка конфигурации с сервера
 */
async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    CONFIG = await response.json();
  } catch (err) {
    console.error('❌ Ошибка загрузки конфигурации:', err);
  }
}

/**
 * Получение username из сессии
 */
async function fetchUsername() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    if (data.username) {
      currentUsername = data.username;
    }
  } catch (err) {
    // Игнорируем — username не критичен
  }
}

/**
 * Загрузка и применение темы пользователя
 */
async function loadUserTheme() {
  if (!currentUserId) return;

  try {
    const response = await fetch(`/api/stats/${currentUserId}`);
    if (response.ok) {
      const data = await response.json();
      // Загружаем тему
      const theme = data.settings?.theme || 'standard';
      document.body.setAttribute('data-theme', theme);
      // Загружаем username из статистики пользователя
      if (data.stats?.username && data.stats.username !== 'Web User') {
        currentUsername = data.stats.username;
      }
    }
  } catch (err) {
    // Игнорируем — тема по умолчанию останется
  }
}

/**
 * Обновление UI в зависимости от авторизации
 */
function updateAuthState() {
  const inputSection = document.getElementById('inputSection');
  const authWarning = document.getElementById('authWarning');

  if (!currentUserId) {
    // Не авторизован — скрываем кнопки проверки
    inputSection.style.display = 'none';
    authWarning.style.display = 'block';
  } else {
    inputSection.style.display = 'flex';
    authWarning.style.display = 'none';
  }
}

// ===== ЗАГРУЗКА ПРОФИЛЕЙ =====

/**
 * Загрузка сохранённых профилей из БД
 */
async function loadProfiles() {
  try {
    const response = await fetch('/api/cheater-checker/profiles?limit=50&filter=all');
    const data = await response.json();
    profiles = data.profiles || [];
    renderProfiles(profiles);
  } catch (err) {
    console.error('❌ Ошибка загрузки профилей:', err);
  }
}

/**
 * Отрисовка профилей в двух колонках
 */
function renderProfiles(profilesList) {
  const bannedContainer = document.getElementById('bannedCards');
  const cleanContainer = document.getElementById('cleanCards');

  bannedContainer.innerHTML = '';
  cleanContainer.innerHTML = '';

  profilesList.forEach(profile => {
    const isBanned = isBannedProfile(profile);
    const cardHtml = createProfileCard(profile, isBanned);

    if (isBanned) {
      bannedContainer.insertAdjacentHTML('beforeend', cardHtml);
    } else {
      cleanContainer.insertAdjacentHTML('beforeend', cardHtml);
    }
  });

  // Привязываем обработчики к новым карточкам
  bindCardEvents();
}

/**
 * Определение: забанен ли профиль
 */
function isBannedProfile(profile) {
  return (
    profile.vac_banned === 1 ||
    profile.vac_banned === true ||
    profile.number_of_game_bans > 0 ||
    profile.community_banned === 1 ||
    profile.community_banned === true ||
    (profile.economy_ban && profile.economy_ban !== 'none')
  );
}

/**
 * Создание HTML карточки профиля
 */
function createProfileCard(profile, isBanned) {
  const statusClass = isBanned ? 'banned' : 'clean';
  const avatarUrl = profile.avatar_url || '/avatars/nopic.png';
  const personaName = escapeHtml(profile.persona_name || 'Unknown');
  const checkerName = escapeHtml(profile.checked_by_username || 'Unknown');
  const steamId = profile.steam_id;
  const profileUrl = profile.profile_url || `https://steamcommunity.com/profiles/${steamId}`;

  // Кнопка удаления (только для админа)
  const deleteBtn = (currentUserId === CONFIG.ADMIN_USER_ID)
    ? `<button class="card-delete-btn" data-steam-id="${steamId}" data-name="${personaName}" title="Удалить">✕</button>`
    : '';

  // Детали бана
  const vacBanned = profile.vac_banned ? 'Да' : 'Нет';
  const vacBansCount = profile.number_of_vac_bans || 0;
  const gameBans = profile.number_of_game_bans || 0;
  const daysSince = profile.days_since_last_ban || 0;
  const communityBanned = profile.community_banned ? 'Да' : 'Нет';
  const economyBan = (profile.economy_ban && profile.economy_ban !== 'none') ? profile.economy_ban : 'Нет';

  // Кнопка публикации в Discord (только для админа или того, кто добавил)
  const checkedByDiscordId = profile.checked_by_discord_id || '';
  const canPublish = (currentUserId === CONFIG.ADMIN_USER_ID) || (currentUserId === checkedByDiscordId);
  const publishBtn = canPublish
    ? `<button class="card-action-btn discord-publish-btn" data-steam-id="${steamId}">📢 Дискорд</button>`
    : '';

  return `
    <div class="profile-card ${statusClass}" data-steam-id="${steamId}">
      <div class="card-header">
        <img class="card-avatar" src="${avatarUrl}" alt="Avatar" onerror="this.src='/avatars/nopic.png'" />
        <div class="card-info">
          <div class="card-checker">Проверил: ${checkerName}</div>
          <div class="card-name" data-steam-id="${steamId}">
            <span class="expand-icon">▶</span>
            ${personaName}
          </div>
        </div>
        ${deleteBtn}
      </div>
      <div class="card-details" id="details-${steamId}">
        <div class="detail-row">
          <span class="detail-label">VAC-бан</span>
          <span class="detail-value ${profile.vac_banned ? 'danger' : 'safe'}">${vacBanned}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Кол-во VAC-банов</span>
          <span class="detail-value ${vacBansCount > 0 ? 'danger' : 'safe'}">${vacBansCount}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Игровые баны</span>
          <span class="detail-value ${gameBans > 0 ? 'danger' : 'safe'}">${gameBans}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Дней с последнего бана</span>
          <span class="detail-value">${daysSince > 0 ? daysSince : '—'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Коммьюнити-бан</span>
          <span class="detail-value ${profile.community_banned ? 'danger' : 'safe'}">${communityBanned}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Торговый бан</span>
          <span class="detail-value ${economyBan !== 'Нет' ? 'danger' : 'safe'}">${economyBan}</span>
        </div>
      </div>
      <div class="card-actions">
        <a href="${profileUrl}" target="_blank" rel="noopener" class="card-action-btn profile-link-btn">🔗 Профиль</a>
        ${publishBtn}
      </div>
    </div>
  `;
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====

/**
 * Привязка основных обработчиков
 */
function bindEvents() {
  // Одиночная проверка
  document.getElementById('checkBtn').addEventListener('click', handleSingleCheck);
  document.getElementById('steamUrlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSingleCheck();
  });

  // Массовая проверка
  document.getElementById('massCheckBtn').addEventListener('click', openMassCheckModal);
  document.getElementById('massCheckCloseBtn').addEventListener('click', closeMassCheckModal);
  document.getElementById('startMassCheckBtn').addEventListener('click', handleMassCheck);
  document.getElementById('massTextarea').addEventListener('input', updateUrlCounter);

  // Информационная модалка
  document.getElementById('infoBtn').addEventListener('click', openInfoModal);
  document.getElementById('infoCloseBtn').addEventListener('click', closeInfoModal);

  // Диалог подтверждения
  document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirmDialog);

  // Закрытие модалок по клику на overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.style.display = 'none';
      }
    });
  });
}

/**
 * Привязка обработчиков к карточкам (после рендера)
 */
function bindCardEvents() {
  // Раскрытие деталей по клику на имя
  document.querySelectorAll('.card-name').forEach(el => {
    el.addEventListener('click', () => {
      const steamId = el.dataset.steamId;
      const details = document.getElementById(`details-${steamId}`);
      if (details) {
        details.classList.toggle('visible');
        el.classList.toggle('expanded');
      }
    });
  });

  // Публикация в Discord
  document.querySelectorAll('.discord-publish-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      publishToDiscord(btn.dataset.steamId);
    });
  });

  // Удаление (admin)
  document.querySelectorAll('.card-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirmDialog(btn.dataset.steamId, btn.dataset.name);
    });
  });
}

// ===== ОДИНОЧНАЯ ПРОВЕРКА =====

/**
 * Обработка одиночной проверки
 */
async function handleSingleCheck() {
  const input = document.getElementById('steamUrlInput');
  const url = input.value.trim();

  if (!url) {
    showNotification('Введите ссылку на Steam-профиль', 'error');
    return;
  }

  // Базовая валидация
  if (!url.includes('steamcommunity.com')) {
    showNotification('Ссылка должна содержать steamcommunity.com', 'error');
    return;
  }

  showLoading(true);

  try {
    const response = await fetch('/api/cheater-checker/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [url],
        checkedByDiscordId: currentUserId,
        checkedByUsername: currentUsername || 'Web User',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showNotification(data.error || 'Ошибка проверки', 'error');
      return;
    }

    // Добавляем результаты
    if (data.results && data.results.length > 0) {
      addResultCards(data.results);
      input.value = '';
      showNotification('Проверка завершена', 'success');
    }

    // Показываем ошибки
    if (data.errors && data.errors.length > 0) {
      showNotification(data.errors.join('; '), 'error');
    }
  } catch (err) {
    console.error('❌ Ошибка проверки:', err);
    showNotification('Ошибка соединения с сервером', 'error');
  } finally {
    showLoading(false);
  }
}

// ===== МАССОВАЯ ПРОВЕРКА =====

function openMassCheckModal() {
  document.getElementById('massCheckModal').style.display = 'flex';
  document.getElementById('massTextarea').value = '';
  updateUrlCounter();
}

function closeMassCheckModal() {
  document.getElementById('massCheckModal').style.display = 'none';
}

/**
 * Обновление счётчика ссылок
 */
function updateUrlCounter() {
  const textarea = document.getElementById('massTextarea');
  const counter = document.getElementById('urlCounter');
  const counterParent = counter.parentElement;

  const lines = textarea.value.split('\n').filter(line => line.trim() !== '');
  counter.textContent = lines.length;

  if (lines.length > 20) {
    counterParent.classList.add('over-limit');
  } else {
    counterParent.classList.remove('over-limit');
  }
}

/**
 * Обработка массовой проверки
 */
async function handleMassCheck() {
  const textarea = document.getElementById('massTextarea');
  const urls = textarea.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '');

  if (urls.length === 0) {
    showNotification('Введите хотя бы одну ссылку', 'error');
    return;
  }

  if (urls.length > 20) {
    showNotification('Максимум 20 ссылок за один запрос', 'error');
    return;
  }

  closeMassCheckModal();
  showLoading(true);

  try {
    const response = await fetch('/api/cheater-checker/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls,
        checkedByDiscordId: currentUserId,
        checkedByUsername: currentUsername || 'Web User',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showNotification(data.error || 'Ошибка проверки', 'error');
      return;
    }

    if (data.results && data.results.length > 0) {
      addResultCards(data.results);
      showNotification(`Проверено профилей: ${data.results.length}`, 'success');
    }

    if (data.errors && data.errors.length > 0) {
      showNotification(`Ошибки: ${data.errors.join('; ')}`, 'error');
    }
  } catch (err) {
    console.error('❌ Ошибка массовой проверки:', err);
    showNotification('Ошибка соединения с сервером', 'error');
  } finally {
    showLoading(false);
  }
}

// ===== ДОБАВЛЕНИЕ РЕЗУЛЬТАТОВ =====

/**
 * Добавление новых карточек результатов (API формат → DB формат)
 */
function addResultCards(results) {
  const bannedContainer = document.getElementById('bannedCards');
  const cleanContainer = document.getElementById('cleanCards');

  results.forEach(result => {
    // Конвертируем формат API в формат отображения
    const profile = {
      steam_id: result.steamId,
      persona_name: result.personaName,
      avatar_url: result.avatarUrl,
      profile_url: result.profileUrl,
      vac_banned: result.vacBanned ? 1 : 0,
      number_of_vac_bans: result.numberOfVacBans || 0,
      number_of_game_bans: result.numberOfGameBans || 0,
      days_since_last_ban: result.daysSinceLastBan || 0,
      community_banned: result.communityBanned ? 1 : 0,
      economy_ban: result.economyBan || 'none',
      checked_by_discord_id: result.checkedByDiscordId || currentUserId,
      checked_by_username: result.checkedByUsername || currentUsername || 'Web User',
    };

    // Удаляем старую карточку если есть (обновление)
    const existingCard = document.querySelector(`.profile-card[data-steam-id="${profile.steam_id}"]`);
    if (existingCard) {
      existingCard.remove();
    }

    const isBanned = isBannedProfile(profile);
    const cardHtml = createProfileCard(profile, isBanned);

    if (isBanned) {
      bannedContainer.insertAdjacentHTML('afterbegin', cardHtml);
    } else {
      cleanContainer.insertAdjacentHTML('afterbegin', cardHtml);
    }
  });

  // Перепривязываем обработчики
  bindCardEvents();
}

// ===== ПУБЛИКАЦИЯ В DISCORD =====

/**
 * Публикация профиля в Discord-ветку
 */
async function publishToDiscord(steamId) {
  try {
    const response = await fetch('/api/cheater-checker/publish-discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steamId }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showNotification('✅ Опубликовано в Discord', 'success');
    } else {
      showNotification(data.error || 'Ошибка публикации', 'error');
    }
  } catch (err) {
    console.error('❌ Ошибка публикации:', err);
    showNotification('Ошибка соединения с сервером', 'error');
  }
}

// ===== УДАЛЕНИЕ (ADMIN) =====

let pendingDeleteSteamId = null;

/**
 * Показать диалог подтверждения удаления
 */
function showConfirmDialog(steamId, personaName) {
  pendingDeleteSteamId = steamId;
  document.getElementById('confirmText').textContent = `Удалить запись о профиле ${personaName}?`;
  document.getElementById('confirmDialog').style.display = 'flex';

  // Привязываем обработчик удаления
  const deleteBtn = document.getElementById('confirmDeleteBtn');
  deleteBtn.onclick = () => confirmDelete();
}

function closeConfirmDialog() {
  document.getElementById('confirmDialog').style.display = 'none';
  pendingDeleteSteamId = null;
}

/**
 * Подтверждение удаления
 */
async function confirmDelete() {
  if (!pendingDeleteSteamId) return;

  try {
    const response = await fetch(`/api/cheater-checker/profiles/${pendingDeleteSteamId}`, {
      method: 'DELETE',
      headers: { 'x-user-id': currentUserId },
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Удаляем карточку из DOM
      const card = document.querySelector(`.profile-card[data-steam-id="${pendingDeleteSteamId}"]`);
      if (card) {
        card.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => card.remove(), 300);
      }
      showNotification('✅ Запись удалена', 'success');
    } else {
      showNotification(data.error || 'Ошибка удаления', 'error');
    }
  } catch (err) {
    console.error('❌ Ошибка удаления:', err);
    showNotification('Ошибка соединения с сервером', 'error');
  } finally {
    closeConfirmDialog();
  }
}

// ===== МОДАЛКИ =====

function openInfoModal() {
  document.getElementById('infoModal').style.display = 'flex';
}

function closeInfoModal() {
  document.getElementById('infoModal').style.display = 'none';
}

// ===== УТИЛИТЫ =====

/**
 * Показать/скрыть loading indicator
 */
function showLoading(show) {
  document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
}

/**
 * Показать уведомление
 */
function showNotification(text, type = 'info') {
  const notification = document.getElementById('notification');
  const notificationText = document.getElementById('notificationText');

  notificationText.textContent = text;
  notification.className = `notification ${type}`;
  notification.style.display = 'block';

  // Анимация появления
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });

  // Скрываем через 4 секунды
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.style.display = 'none';
    }, 400);
  }, 4000);
}

/**
 * Экранирование HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
