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
    // Показываем кнопку багрепорта
    const bugBtn = document.getElementById('bugReportFloatingBtn');
    if (bugBtn) bugBtn.style.display = 'block';
  }
}

// ===== ЗАГРУЗКА ПРОФИЛЕЙ =====

/**
 * Загрузка сохранённых профилей из БД
 */
async function loadProfiles() {
  try {
    // Загружаем забаненных и чистых отдельно чтобы не терять профили из-за лимита
    const [bannedRes, cleanRes] = await Promise.all([
      fetch('/api/cheater-checker/profiles?limit=1000&filter=banned'),
      fetch('/api/cheater-checker/profiles?limit=1000&filter=clean'),
    ]);
    const bannedData = await bannedRes.json();
    const cleanData = await cleanRes.json();

    allBannedProfiles = bannedData.profiles || [];
    allCleanProfiles = cleanData.profiles || [];
    profiles = [...allBannedProfiles, ...allCleanProfiles];

    bannedPage = 1;
    cleanPage = 1;

    renderBannedPage();
    renderCleanPage();
    updateCounters();
  } catch (err) {
    console.error('❌ Ошибка загрузки профилей:', err);
  }
}

/**
 * Отрисовка профилей в двух колонках с пагинацией
 */
const PAGE_SIZE = 5;
let bannedPage = 1;
let cleanPage = 1;
let allBannedProfiles = [];
let allCleanProfiles = [];

function renderProfiles(profilesList) {
  allBannedProfiles = profilesList.filter(p => isBannedProfile(p));
  allCleanProfiles = profilesList.filter(p => !isBannedProfile(p));
  
  bannedPage = 1;
  cleanPage = 1;
  
  renderBannedPage();
  renderCleanPage();
  updateCounters();
}

function renderBannedPage() {
  const container = document.getElementById('bannedCards');
  container.innerHTML = '';
  
  const start = (bannedPage - 1) * PAGE_SIZE;
  const toShow = allBannedProfiles.slice(start, start + PAGE_SIZE);
  toShow.forEach(profile => {
    container.insertAdjacentHTML('beforeend', createProfileCard(profile, true));
  });
  
  renderPagination('banned', allBannedProfiles.length, bannedPage);
  bindCardEvents();
}

function renderCleanPage() {
  const container = document.getElementById('cleanCards');
  container.innerHTML = '';
  
  const start = (cleanPage - 1) * PAGE_SIZE;
  const toShow = allCleanProfiles.slice(start, start + PAGE_SIZE);
  toShow.forEach(profile => {
    container.insertAdjacentHTML('beforeend', createProfileCard(profile, false));
  });
  
  renderPagination('clean', allCleanProfiles.length, cleanPage);
  bindCardEvents();
}

function renderPagination(type, total, currentPage) {
  const container = document.getElementById(`${type}Pagination`);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  // Строим список страниц с многоточием
  // Всегда показываем: первую, последнюю, текущую и по 2 соседа с каждой стороны
  const delta = 2;
  const pages = [];
  
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - delta && i <= currentPage + delta)
    ) {
      pages.push(i);
    }
  }
  
  // Вставляем многоточие между несмежными страницами
  const pagesWithEllipsis = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) {
      pagesWithEllipsis.push('...');
    }
    pagesWithEllipsis.push(pages[i]);
  }
  
  let html = '';
  
  // Стрелка назад
  html += `<button class="arrow" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage('${type}', ${currentPage - 1})">←</button>`;
  
  // Номера страниц с многоточием
  for (const page of pagesWithEllipsis) {
    if (page === '...') {
      html += `<span class="pagination-ellipsis">…</span>`;
    } else {
      html += `<button class="${page === currentPage ? 'active' : ''}" onclick="goToPage('${type}', ${page})">${page}</button>`;
    }
  }
  
  // Стрелка вперёд
  html += `<button class="arrow" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage('${type}', ${currentPage + 1})">→</button>`;
  
  container.innerHTML = html;
}

function goToPage(type, page) {
  if (type === 'banned') {
    bannedPage = page;
    renderBannedPage();
  } else {
    cleanPage = page;
    renderCleanPage();
  }
}

function updateCounters() {
  document.getElementById('bannedCount').textContent = `(${allBannedProfiles.length})`;
  document.getElementById('cleanCount').textContent = `(${allCleanProfiles.length})`;
}

/**
 * Мгновенный поиск по нику или SteamID
 */
function filterProfileCards(query) {
  const q = query.toLowerCase().trim();
  
  if (!q) {
    renderBannedPage();
    renderCleanPage();
    updateCounters();
    return;
  }
  
  const filteredBanned = allBannedProfiles.filter(p => 
    (p.persona_name || '').toLowerCase().includes(q) || 
    (p.steam_id || '').includes(q)
  );
  const filteredClean = allCleanProfiles.filter(p => 
    (p.persona_name || '').toLowerCase().includes(q) || 
    (p.steam_id || '').includes(q)
  );
  
  const bannedContainer = document.getElementById('bannedCards');
  const cleanContainer = document.getElementById('cleanCards');
  
  bannedContainer.innerHTML = '';
  filteredBanned.forEach(p => bannedContainer.insertAdjacentHTML('beforeend', createProfileCard(p, true)));
  
  cleanContainer.innerHTML = '';
  filteredClean.forEach(p => cleanContainer.insertAdjacentHTML('beforeend', createProfileCard(p, false)));
  
  // Скрываем пагинацию при поиске
  document.getElementById('bannedPagination').innerHTML = '';
  document.getElementById('cleanPagination').innerHTML = '';
  
  document.getElementById('bannedCount').textContent = `(${filteredBanned.length})`;
  document.getElementById('cleanCount').textContent = `(${filteredClean.length})`;
  
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
    ? `<button class="card-action-btn discord-publish-btn" data-steam-id="${steamId}"><svg class="icon" aria-hidden="true"><use href="#icon-discord"></use></svg> Дискорд</button>`
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
        <a href="${profileUrl}" target="_blank" rel="noopener" class="card-action-btn profile-link-btn"><svg class="icon" aria-hidden="true"><use href="#icon-link"></use></svg> Профиль</a>
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
        document.body.style.overflow = '';
      }
    });
  });

  // Делегирование событий для карточек профилей
  bindCardDelegation();

  // Инпуты с крестиком и авто-очисткой
  initClearableInput('steamUrlInput', 'steamUrlClearBtn');
  initClearableInput('profileSearchInput', 'profileSearchClearBtn', (val) => filterProfileCards(val));
}

/**
 * Привязка обработчиков к карточкам (после рендера)
 */
/**
 * Привязка обработчиков через делегирование событий (вызывается ОДИН раз)
 */
function bindCardEvents() {
  // Эта функция теперь пустая — делегирование настроено в bindEvents() однократно
}

/**
 * Делегирование событий для карточек (вызывается один раз в bindEvents)
 */
function bindCardDelegation() {
  // Делегируем клики на оба контейнера колонок
  ['bannedCards', 'cleanCards'].forEach(containerId => {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.addEventListener('click', (e) => {
      // Клик по имени → раскрытие деталей
      const nameEl = e.target.closest('.card-name');
      if (nameEl) {
        const steamId = nameEl.dataset.steamId;
        const details = document.getElementById(`details-${steamId}`);
        if (details) {
          details.classList.toggle('visible');
          nameEl.classList.toggle('expanded');
        }
        return;
      }
      
      // Клик по кнопке "Дискорд"
      const publishBtn = e.target.closest('.discord-publish-btn');
      if (publishBtn) {
        publishToDiscord(publishBtn.dataset.steamId);
        return;
      }
      
      // Клик по кнопке удаления (admin)
      const deleteBtn = e.target.closest('.card-delete-btn');
      if (deleteBtn) {
        showConfirmDialog(deleteBtn.dataset.steamId, deleteBtn.dataset.name);
        return;
      }
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
        checkedByUsername: currentUsername && currentUsername !== 'Web User' ? currentUsername : (currentUserId || 'Unknown'),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showNotification(data.error || 'Ошибка проверки', 'error');
      return;
    }

    // Добавляем только новые результаты (исключаем дубликаты)
    const duplicateSteamIds = (data.duplicates || []).map(d => d.steamId);
    const newResults = (data.results || []).filter(r => !duplicateSteamIds.includes(r.steamId));

    if (newResults.length > 0) {
      addResultCards(newResults);
      input.value = '';
    }

    // Показываем уведомление о дубликатах
    if (data.duplicates && data.duplicates.length > 0) {
      const dupNames = data.duplicates.map(d => `${d.personaName || d.steamId} (добавил: ${d.alreadyAddedBy})`).join(', ');
      showNotification(`⚠️ Уже в базе: ${dupNames}`, 'warning');
      if (newResults.length === 0) input.value = '';
    } else if (newResults.length > 0) {
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
  document.body.style.overflow = 'hidden';
  document.getElementById('massTextarea').value = '';
  updateUrlCounter();
}

function closeMassCheckModal() {
  document.getElementById('massCheckModal').style.display = 'none';
  document.body.style.overflow = '';
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
        checkedByUsername: currentUsername && currentUsername !== 'Web User' ? currentUsername : (currentUserId || 'Unknown'),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showNotification(data.error || 'Ошибка проверки', 'error');
      return;
    }

    // Добавляем только новые результаты (исключаем дубликаты)
    const duplicateSteamIds = (data.duplicates || []).map(d => d.steamId);
    const newResults = (data.results || []).filter(r => !duplicateSteamIds.includes(r.steamId));

    if (newResults.length > 0) {
      addResultCards(newResults);
    }

    // Уведомления
    if (data.duplicates && data.duplicates.length > 0) {
      const dupNames = data.duplicates.map(d => `${d.personaName || d.steamId} (добавил: ${d.alreadyAddedBy})`).join(', ');
      showNotification(`Проверено: ${data.results.length}. Уже в базе: ${dupNames}`, 'warning');
    } else if (newResults.length > 0) {
      showNotification(`Проверено профилей: ${newResults.length}`, 'success');
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
  results.forEach(result => {
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
      checked_by_username: result.checkedByUsername && result.checkedByUsername !== 'Web User' ? result.checkedByUsername : (currentUsername && currentUsername !== 'Web User' ? currentUsername : currentUserId),
    };

    const isBanned = isBannedProfile(profile);

    // Удаляем из массивов если уже есть (обновление)
    allBannedProfiles = allBannedProfiles.filter(p => p.steam_id !== profile.steam_id);
    allCleanProfiles = allCleanProfiles.filter(p => p.steam_id !== profile.steam_id);

    // Добавляем в начало нужного массива
    if (isBanned) {
      allBannedProfiles.unshift(profile);
    } else {
      allCleanProfiles.unshift(profile);
    }
  });

  // Сбрасываем на первую страницу и перерисовываем
  bannedPage = 1;
  cleanPage = 1;
  renderBannedPage();
  renderCleanPage();
  updateCounters();
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
  document.body.style.overflow = 'hidden';
}

function closeInfoModal() {
  document.getElementById('infoModal').style.display = 'none';
  document.body.style.overflow = '';
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


// ===== БАГРЕПОРТ =====

function openBugReportModal() {
  document.getElementById('bugReportModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.getElementById('bugReportText').value = '';
}

function closeBugReportModal() {
  document.getElementById('bugReportModal').style.display = 'none';
  document.body.style.overflow = '';
}

async function sendBugReport() {
  if (!currentUserId) {
    showNotification('Войдите в систему для отправки багрепорта', 'error');
    return;
  }

  const text = document.getElementById('bugReportText').value.trim();
  if (!text) {
    showNotification('Опишите проблему', 'error');
    return;
  }

  try {
    const res = await fetch('/api/bug-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        username: currentUsername || currentUserId,
        bugText: text,
      }),
    });

    const data = await res.json();
    if (data.success) {
      closeBugReportModal();
      showNotification('✅ Багрепорт отправлен, спасибо!', 'success');
    } else {
      showNotification(data.error || 'Ошибка при отправке', 'error');
    }
  } catch (err) {
    showNotification('Ошибка соединения с сервером', 'error');
  }
}

// ===== ИНПУТЫ С КРЕСТИКОМ И АВТО-ОЧИСТКОЙ =====

/**
 * Инициализация инпута с кнопкой очистки и авто-очисткой при повторном вводе.
 * @param {string} inputId   - id инпута
 * @param {string} clearBtnId - id кнопки-крестика
 * @param {Function} [onClear] - колбэк при очистке (например, сброс фильтра)
 */
function initClearableInput(inputId, clearBtnId, onClear) {
  const input = document.getElementById(inputId);
  const clearBtn = document.getElementById(clearBtnId);
  if (!input || !clearBtn) return;

  // Показываем/скрываем крестик при вводе
  input.addEventListener('input', () => {
    toggleClearBtn(input, clearBtn);
  });

  // При получении фокуса — выделяем весь текст.
  // Браузер автоматически заменит выделение при вводе нового символа.
  input.addEventListener('focus', () => {
    if (input.value.length > 0) {
      // setTimeout нужен для Firefox и мобильных — select() без него игнорируется при клике мышью
      setTimeout(() => input.select(), 0);
    }
  });

  // Клик по крестику — очищаем поле
  clearBtn.addEventListener('click', () => {
    input.value = '';
    toggleClearBtn(input, clearBtn);
    if (onClear) onClear('');
    input.focus();
  });
}

/**
 * Показать/скрыть кнопку очистки в зависимости от значения инпута
 */
function toggleClearBtn(input, clearBtn) {
  if (input.value.length > 0) {
    clearBtn.classList.add('visible');
  } else {
    clearBtn.classList.remove('visible');
  }
}
