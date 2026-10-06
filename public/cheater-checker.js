/**
 * Чекер читеров — клиентская логика
 * Одиночная/массовая проверка Steam-профилей, отображение результатов
 */

// Глобальное состояние
let CONFIG = { ADMIN_USER_ID: '' };
let currentUserId = null;
let currentUsername = null;
let profiles = [];
let lastViewedAt = null;
let currentView = 'cheater'; // 'cheater' или 'bot'

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
  updateAllLinksButtons();

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
    const typeParam = `&type=${currentView}`;
    const [bannedRes, cleanRes] = await Promise.all([
      fetch(`/api/cheater-checker/profiles?limit=1000&filter=banned${typeParam}`),
      fetch(`/api/cheater-checker/profiles?limit=1000&filter=clean${typeParam}`),
    ]);
    const bannedData = await bannedRes.json();
    const cleanData = await cleanRes.json();

    lastViewedAt = bannedData.lastViewedAt || cleanData.lastViewedAt || null;

    allBannedProfilesUnfiltered = bannedData.profiles || [];
    allCleanProfilesUnfiltered = cleanData.profiles || [];

    applyReportFilter();

    bannedPage = 1;
    cleanPage = 1;

    renderBannedPage();
    renderCleanPage();
    updateCounters();
    updateFavoritesCount();
    updateFilterCounts();
    updateAllLinksButtons();

    // Отмечаем что пользователь просмотрел страницу
    if (currentUserId) {
      fetch('/api/cheater-checker/mark-viewed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: currentView }),
      }).catch(() => {});
    }
  } catch (err) {
    console.error('❌ Ошибка загрузки профилей:', err);
  }
}

/**
 * Переключение вкладки Читеры/Боты
 */
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.header-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  currentReportFilter = 'all';
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'all');
  });
  // Сбрасываем видимость: обычные колонки показываем, группы связей скрываем
  document.getElementById('resultsGrid').style.display = '';
  document.getElementById('linksGroupsContainer').style.display = 'none';
  document.getElementById('linksPagination').innerHTML = '';
  document.getElementById('filterNotice').style.display = 'none';
  // Закрываем поиск при смене вкладки
  const searchSection = document.getElementById('searchSection');
  const searchToggleBtn = document.getElementById('searchToggleBtn');
  if (searchSection && searchSection.classList.contains('open')) {
    searchSection.classList.remove('open');
    searchToggleBtn.classList.remove('active');
    document.getElementById('profileSearchInput').value = '';
  }
  loadProfiles();
}

/**
 * Отрисовка профилей в двух колонках с пагинацией
 */
let PAGE_SIZE = parseInt(localStorage.getItem('cheaterCheckerPageSize') || '5', 10);
let bannedPage = 1;
let cleanPage = 1;
let allBannedProfiles = [];
let allCleanProfiles = [];
let allBannedProfilesUnfiltered = [];
let allCleanProfilesUnfiltered = [];
let currentReportFilter = 'all';

function renderProfiles(profilesList) {
  allBannedProfilesUnfiltered = profilesList.filter(p => isBannedProfile(p));
  allCleanProfilesUnfiltered = profilesList.filter(p => !isBannedProfile(p));

  applyReportFilter();

  bannedPage = 1;
  cleanPage = 1;

  renderBannedPage();
  renderCleanPage();
  updateCounters();
}

function setReportFilter(filter) {
  currentReportFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });

  // Плашка-пояснение фильтров
  const notice = document.getElementById('filterNotice');
  if (filter === 'favorites') {
    notice.textContent = '⭐ Избранное видите только вы';
    notice.style.display = 'block';
  } else if (filter === 'links') {
    notice.textContent = '🔗 Связи видят все пользователи';
    notice.style.display = 'block';
  } else {
    notice.style.display = 'none';
  }

  // Таб «Связи» — показываем группы, скрываем обычные колонки
  const resultsGrid = document.getElementById('resultsGrid');
  const linksContainer = document.getElementById('linksGroupsContainer');
  if (filter === 'links') {
    resultsGrid.style.display = 'none';
    linksContainer.style.display = 'block';
    linksPage = 1;
    renderLinksGroups();
    return;
  } else {
    resultsGrid.style.display = '';
    linksContainer.style.display = 'none';
    document.getElementById('linksPagination').innerHTML = '';
  }

  applyReportFilter();
  bannedPage = 1;
  cleanPage = 1;
  renderBannedPage();
  renderCleanPage();
  updateCounters();
}

function applyReportFilter() {
  if (currentReportFilter === 'steam_wall') {
    allBannedProfiles = allBannedProfilesUnfiltered.filter(p => (p.report_source || 'web') === 'steam_wall');
    allCleanProfiles = allCleanProfilesUnfiltered.filter(p => (p.report_source || 'web') === 'steam_wall');
  } else if (currentReportFilter === 'favorites') {
    allBannedProfiles = allBannedProfilesUnfiltered.filter(p => p.isFavorite);
    allCleanProfiles = allCleanProfilesUnfiltered.filter(p => p.isFavorite);
  } else {
    allBannedProfiles = [...allBannedProfilesUnfiltered];
    allCleanProfiles = [...allCleanProfilesUnfiltered];
  }
  profiles = [...allBannedProfiles, ...allCleanProfiles];
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

function renderExternalPage() {
  // removed — external filter handled by setReportFilter
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
  } else if (type === 'links') {
    linksPage = page;
    renderLinksGroupsPage();
  } else {
    cleanPage = page;
    renderCleanPage();
  }
}

function updateCounters() {
  document.getElementById('bannedCount').textContent = `(${allBannedProfiles.length})`;
  document.getElementById('cleanCount').textContent = `(${allCleanProfiles.length})`;
}

function updateFavoritesCount() {
  const count = allBannedProfilesUnfiltered.filter(p => p.isFavorite).length +
                allCleanProfilesUnfiltered.filter(p => p.isFavorite).length;
  const el = document.getElementById('favoritesCount');
  if (el) el.textContent = count > 0 ? `(${count})` : '';
}

function updateFilterCounts() {
  const all = allBannedProfilesUnfiltered.length + allCleanProfilesUnfiltered.length;
  const steamWall = allBannedProfilesUnfiltered.filter(p => (p.report_source || 'web') === 'steam_wall').length +
                    allCleanProfilesUnfiltered.filter(p => (p.report_source || 'web') === 'steam_wall').length;
  const allEl = document.getElementById('allCount');
  const swEl = document.getElementById('steamWallCount');
  if (allEl) allEl.textContent = all > 0 ? `(${all})` : '';
  if (swEl) swEl.textContent = steamWall > 0 ? `(${steamWall})` : '';
}

/**
 * Переключение строки поиска
 */
function toggleSearch() {
  const section = document.getElementById('searchSection');
  const btn = document.getElementById('searchToggleBtn');
  const input = document.getElementById('profileSearchInput');
  const clearBtn = document.getElementById('profileSearchClearBtn');

  const isOpen = section.classList.contains('open');

  if (isOpen) {
    // Закрываем: очищаем запрос и сбрасываем фильтр
    section.classList.remove('open');
    btn.classList.remove('active');
    input.value = '';
    toggleClearBtn(input, clearBtn);
    filterProfileCards('');
  } else {
    // Открываем с автофокусом
    section.classList.add('open');
    btn.classList.add('active');
    toggleClearBtn(input, clearBtn);
    setTimeout(() => input.focus(), 350);
  }
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
    (p.steam_id || '').includes(q) ||
    (p.reported_by_name || '').toLowerCase().includes(q)
  );
  const filteredClean = allCleanProfiles.filter(p => 
    (p.persona_name || '').toLowerCase().includes(q) || 
    (p.steam_id || '').includes(q) ||
    (p.reported_by_name || '').toLowerCase().includes(q)
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
 * Проверяет обновлён ли профиль с момента последнего просмотра
 */
function isProfileUpdated(profile) {
  if (!profile.updated_at || !lastViewedAt) return false;
  return new Date(profile.updated_at).getTime() > lastViewedAt;
}

/**
 * Форматирует дату обновления для бейджа
 */
function formatUpdatedAt(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Вычисляет сигналы подозрительности по данным steam_cache.
 * Возвращает массив объектов { icon, text }.
 *
 * @param {object|null} steamCache — объект { cs2, faceit } из profile.steam_cache (уже распарсенный)
 * @returns {Array<{icon: string, text: string}>}
 */
function computeSuspiciousSignals(steamCache) {
  const signals = [];

  if (!steamCache || !steamCache.cs2) return signals;

  const cs2 = steamCache.cs2;
  const faceit = steamCache.faceit || null;

  // 1. Приватный профиль — дальнейший анализ невозможен
  if (cs2.private) {
    signals.push({ icon: '⛔', text: 'Профиль приватный' });
    return signals;
  }

  // 2. Молодой аккаунт (< 1 года)
  if (cs2.accountCreatedYear !== null && cs2.accountCreatedYear !== undefined) {
    const currentYear = new Date().getFullYear();
    const accountAgeYears = currentYear - cs2.accountCreatedYear;
    if (accountAgeYears < 1) {
      signals.push({ icon: '⚠️', text: `Аккаунт создан в ${cs2.accountCreatedYear}` });
    }
  }

  // 3. Мало часов при высоком K/D
  if (cs2.hoursPlayed !== null && cs2.hoursPlayed !== undefined &&
      cs2.kd !== null && cs2.kd !== undefined) {
    if (cs2.hoursPlayed < 100 && cs2.kd > 2.0) {
      signals.push({ icon: '⚠️', text: `Мало часов (${cs2.hoursPlayed}) при высоком K/D (${cs2.kd})` });
    }
  }

  // 4. Бан на FACEIT
  if (faceit !== null && faceit.isBanned) {
    signals.push({ icon: '🔴', text: 'Бан на FACEIT' });
  }

  // 5. FACEIT уровень ≥ 8 при < 200 матчей в CS2
  if (faceit !== null && !faceit.isBanned &&
      faceit.level !== null && faceit.level !== undefined &&
      cs2.totalMatchesPlayed !== null && cs2.totalMatchesPlayed !== undefined) {
    if (faceit.level >= 8 && cs2.totalMatchesPlayed < 200) {
      signals.push({ icon: '⚠️', text: `FACEIT уровень ${faceit.level} при малом опыте` });
    }
  }

  return signals;
}

/**
 * Создание HTML карточки профиля
 */
function createProfileCard(profile, isBanned) {
  const statusClass = isBanned ? 'banned' : 'clean';
  const avatarUrl = profile.avatar_url || '/avatars/nopic.png';
  const personaName = escapeHtml(profile.persona_name || 'Unknown');
  const steamId = profile.steam_id;
  const profileUrl = profile.profile_url || `https://steamcommunity.com/profiles/${steamId}`;

  // Определяем источник и имя проверяющего
  const reportSource = profile.report_source || 'web';
  const isExternal = reportSource === 'steam_wall';

  // Для внешних репортов: проверяем читаемость имени, ссылка всегда через /profiles/steamId
  const reporterSteamId = (profile.reported_by_url || '').match(/profiles\/(\d{17})/)?.[1] || '';
  const reporterProfileUrl = reporterSteamId ? `https://steamcommunity.com/profiles/${reporterSteamId}` : '#';

  function isReadableName(name) {
    if (!name || typeof name !== 'string') return false;
    const cleaned = name.replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufdd0-\ufdef\ufffe\ufffe\uFEFF\u0000-\u001f]/g, '');
    if (cleaned.trim().length === 0) return false;
    // Если после очистки от спецсимволов осталось меньше 2 читаемых символов
    const readable = cleaned.match(/[\p{L}\p{N}]/gu);
    return readable && readable.length >= 2;
  }

  const checkerName = isExternal
    ? `<a href="${escapeHtml(reporterProfileUrl)}" target="_blank" style="color:#81c784;text-decoration:none;">${escapeHtml(isReadableName(profile.reported_by_name) ? profile.reported_by_name : reporterSteamId || 'External')}</a>`
    : escapeHtml(profile.checked_by_username || 'Unknown');
  const reportCount = profile.report_count || 0;
  const sourceBadge = isExternal
    ? `<span class="source-badge source-badge--external">📡 Steam Wall</span>${reportCount > 1 ? ` <span class="source-badge source-badge--reports">📊 ${reportCount} репорт${reportCount === 2 ? 'а' : reportCount < 5 ? 'а' : 'ов'}</span>` : ''}`
    : '';

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

  // Парсим steam_cache
  let steamCache = null;
  if (profile.steam_cache) {
    try {
      steamCache = JSON.parse(profile.steam_cache);
    } catch (e) {
      // Повреждённый кэш — игнорируем
    }
  }

  // Вычисляем сигналы подозрительности
  const signals = computeSuspiciousSignals(steamCache);
  const suspiciousBadge = signals.length > 0
    ? `<span class="suspicious-badge">⚠️ Подозрительно</span>`
    : '';

  // Бейдж обновления
  const updated = isProfileUpdated(profile);
  let updatedBadge = '';
  if (updated) {
    const reasonIcons = { ban: '🚫', nick: '✏️', url: '🔗' };
    const reasons = (profile.update_reason || '').split(',').filter(Boolean);
    const icons = reasons.length > 0
      ? reasons.map(r => reasonIcons[r] || '🔔').join(' ')
      : '🔔';
    updatedBadge = `<span class="updated-badge">${icons} Обновлён ${formatUpdatedAt(profile.updated_at)}</span>`;
  }

  // Сигналы в виде списка (отображаются в деталях)
  const signalsHtml = signals.length > 0
    ? `<div class="signals-section">
        ${signals.map(s => `<div class="signal-item">${s.icon} ${escapeHtml(s.text)}</div>`).join('')}
      </div>`
    : '';

  // CS2-секция в деталях
  const cs2Html = renderCs2Section(steamCache);

  // FACEIT-секция в деталях (только если faceit !== null)
  const faceitHtml = renderFaceitSection(steamCache);

  // Избранное и заметки
  const isFavorite = profile.isFavorite || false;
  const hasNotes = profile.notes && profile.notes.length > 0;
  const favBtn = currentUserId
    ? `<button class="card-fav-btn${isFavorite ? ' active' : ''}" data-steam-id="${steamId}" onclick="toggleFavorite('${steamId}', event)" title="Избранное">★</button>`
    : '';
  const pencilIcon = currentUserId && hasNotes
    ? `<span class="card-pencil" data-steam-id="${steamId}" title="Есть заметки"><svg class="icon" aria-hidden="true"><use href="#icon-edit"></use></svg></span>`
    : `<span class="card-pencil" data-steam-id="${steamId}" style="display:none"><svg class="icon" aria-hidden="true"><use href="#icon-edit"></use></svg></span>`;

  return `
    <div class="profile-card ${statusClass}" data-steam-id="${steamId}">
      <div class="card-header">
        <img class="card-avatar" src="${avatarUrl}" alt="Avatar" onerror="this.src='/avatars/nopic.png'" />
        <div class="card-info">
          <div class="card-checker">Проверил: ${checkerName} ${sourceBadge}</div>
          <div class="card-name" data-steam-id="${steamId}">
            <span class="expand-icon">▶</span>
            ${personaName}
            ${suspiciousBadge}
            ${updatedBadge}
          </div>
          <button class="name-history-btn${profile.name_history_count > 0 ? '' : ' name-history-btn--empty'}" onclick="${profile.name_history_count > 0 ? `showNameHistory('${steamId}', '${personaName}')` : ''}" title="Прошлые имена">📜 Прошлые имена${profile.name_history_count > 0 ? ` (${profile.name_history_count})` : ''}</button>
        </div>
        <div class="card-header-actions">
          ${pencilIcon}
          ${favBtn}
          ${deleteBtn}
        </div>
      </div>
      <div class="card-details">
        ${signalsHtml}
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
        ${cs2Html}
        ${faceitHtml}
        <div class="notes-section"></div>
        <div class="card-links-section" style="display:none"></div>
      </div>
      <div class="card-actions">
        <a href="${profileUrl}" target="_blank" rel="noopener" class="card-action-btn profile-link-btn"><svg class="icon" aria-hidden="true"><use href="#icon-link"></use></svg> Профиль</a>
        <button class="card-action-btn friends-btn" data-steam-id="${steamId}" onclick="openFriendsModal('${steamId}', event)" title="Друзья читера" style="display:${(profile.friends_count || 0) > 0 ? '' : 'none'}">
          <svg class="icon" aria-hidden="true"><use href="#icon-users"></use></svg> Друзья<span class="friends-count" data-count-for="${steamId}">${(profile.friends_count || 0) > 0 ? ` (${profile.friends_count})` : ''}</span>
        </button>
        <button class="card-action-btn friends-refresh-btn" data-steam-id="${steamId}" onclick="refreshFriends('${steamId}', event)" title="${profile.friends_last_refreshed_at ? 'Обновлено: ' + new Date(profile.friends_last_refreshed_at).toLocaleString('ru-RU') : 'Обновить список друзей'}">
          <svg class="icon" aria-hidden="true"><use href="#icon-refresh"></use></svg>
        </button>
        <button class="card-action-btn links-btn${(_linksCountMap[steamId] || 0) > 0 ? ' has-links' : ''}" data-steam-id="${steamId}" onclick="openLinksModal('${steamId}', event)" title="Связи между аккаунтами">
          <svg class="icon" aria-hidden="true"><use href="#icon-link"></use></svg>
        </button>
        ${publishBtn}
      </div>
    </div>
  `;
}

/**
 * Рендерит CS2-секцию внутри card-details.
 * Скрывает блок если нет кэша, профиль приватный или нет данных CS2.
 * Сигнал ⛔ при приватном профиле всё равно попадает в signals (шапка карточки).
 *
 * @param {object|null} steamCache
 * @returns {string}
 */
function renderCs2Section(steamCache) {
  if (!steamCache || !steamCache.cs2) return '';

  const cs2 = steamCache.cs2;

  // Приватный или нет данных — скрываем CS2-блок (сигнал уже в шапке)
  if (cs2.private || cs2.noData) return '';

  const fmt = (val, suffix = '') => (val !== null && val !== undefined) ? `${val}${suffix}` : '—';

  return `
    <div class="cs2-section">
      <div class="cs2-section-title">📊 CS2</div>
      <div class="detail-row">
        <span class="detail-label">Год аккаунта</span>
        <span class="detail-value">${fmt(cs2.accountCreatedYear)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Часов в CS2</span>
        <span class="detail-value">${fmt(cs2.hoursPlayed, ' ч')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Матчей</span>
        <span class="detail-value">${fmt(cs2.totalMatchesPlayed)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Побед</span>
        <span class="detail-value">${fmt(cs2.winRate, '%')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">K/D</span>
        <span class="detail-value">${fmt(cs2.kd)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">HS%</span>
        <span class="detail-value">${fmt(cs2.hsPercent, '%')}</span>
      </div>
    </div>
  `;
}

/**
 * Рендерит FACEIT-секцию внутри card-details.
 * Если faceit === null — возвращает '' (без заглушки).
 *
 * @param {object|null} steamCache
 * @returns {string}
 */
function renderFaceitSection(steamCache) {
  if (!steamCache || !steamCache.faceit) return '';

  const faceit = steamCache.faceit;
  const fmt = (val, suffix = '') => (val !== null && val !== undefined) ? `${val}${suffix}` : '—';
  const banBadge = faceit.isBanned ? ' <span class="faceit-ban-badge">🔴 Забанен</span>' : '';

  return `
    <div class="faceit-section">
      <div class="faceit-section-title">🎮 FACEIT${banBadge}</div>
      <div class="detail-row">
        <span class="detail-label">Уровень</span>
        <span class="detail-value faceit-level faceit-level-${faceit.level || 0}">${fmt(faceit.level)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">ELO</span>
        <span class="detail-value">${fmt(faceit.elo)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Матчей</span>
        <span class="detail-value">${fmt(faceit.matches)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Побед</span>
        <span class="detail-value">${faceit.winRate !== null && faceit.winRate !== undefined ? faceit.winRate + '%' : '—'}</span>
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

  // Статистика
  document.getElementById('statsBtn').addEventListener('click', openStatsModal);
  document.getElementById('statsCloseBtn').addEventListener('click', closeStatsModal);

  // Диалог подтверждения
  document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirmDialog);

  // Модалка конфликта типов
  document.getElementById('typeConflictMoveBtn').addEventListener('click', confirmTypeConflictMove);
  document.getElementById('typeConflictCancelBtn').addEventListener('click', closeTypeConflictModal);

  // Кнопка перемещения профилей (только админ)
  if (currentUserId && CONFIG.ADMIN_USER_ID && String(currentUserId) === String(CONFIG.ADMIN_USER_ID)) {
    const moveBtn = document.getElementById('moveBtn');
    if (moveBtn) {
      moveBtn.style.display = 'flex';
      moveBtn.addEventListener('click', openMoveProfilesModal);
    }
  }

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
  initClearableInput('moveSearchInput', 'moveSearchClearBtn', (val) => filterMoveProfiles(val));
  initClearableInput('linksSearchInput', 'linksSearchClearBtn', (val) => filterLinksProfiles(val));
  initClearableInput('friendsSearchInput', 'friendsSearchClearBtn', (val) => filterFriends(val));

  // Селектор количества на страницу
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  if (pageSizeSelect) {
    pageSizeSelect.value = PAGE_SIZE;
    pageSizeSelect.addEventListener('change', (e) => {
      PAGE_SIZE = parseInt(e.target.value, 10);
      localStorage.setItem('cheaterCheckerPageSize', PAGE_SIZE);
      bannedPage = 1;
      cleanPage = 1;
      renderBannedPage();
      renderCleanPage();
      // Если активен таб «Связи» — перерисовываем группы с новым размером
      if (currentReportFilter === 'links') {
        linksPage = 1;
        renderLinksGroupsPage();
      }
    });
  }
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
  if (window._cardDelegationBound) return;
  window._cardDelegationBound = true;

  document.addEventListener('click', (e) => {
    const card = e.target.closest('.profile-card');
    if (!card || !card.contains(e.target)) return;

    // Кнопки внутри карточки — не раскрываем
    if (e.target.closest('a, button, input, .notes-section, .card-links-section')) {
      const publishBtn = e.target.closest('.discord-publish-btn');
      if (publishBtn) {
        e.stopImmediatePropagation();
        publishToDiscord(publishBtn.dataset.steamId);
        return;
      }
      const deleteBtn = e.target.closest('.card-delete-btn');
      if (deleteBtn) {
        e.stopImmediatePropagation();
        showConfirmDialog(deleteBtn.dataset.steamId, deleteBtn.dataset.name);
        return;
      }
      return;
    }

    e.stopImmediatePropagation();

    const steamId = card.dataset.steamId;
    const details = card.querySelector('.card-details');
    const nameEl = card.querySelector('.card-name');
    if (!details) return;

    // Toggle: если открыта — закрываем, если закрыта — открываем
    const wasOpen = details.classList.contains('visible');

    // Закрываем все открытые
    document.querySelectorAll('.card-details.visible').forEach(d => {
      d.classList.remove('visible');
      const n = d.closest('.profile-card')?.querySelector('.card-name');
      if (n) n.classList.remove('expanded');
    });

    if (!wasOpen) {
      details.classList.add('visible');
      if (nameEl) nameEl.classList.add('expanded');
      renderNotes(steamId, card);
      if (!card.closest('#linksGroupsContainer')) {
        renderCardLinks(steamId, card);
      }
    }
  }, true);
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
        type: currentView,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showNotification(data.error || 'Ошибка проверки', 'error');
      return;
    }

    // Добавляем только новые результаты (исключаем дубликаты и конфликты типов)
    const duplicateSteamIds = (data.duplicates || []).map(d => d.steamId);
    const conflictSteamIds = (data.typeConflicts || []).map(d => d.steamId);
    const excludedIds = [...duplicateSteamIds, ...conflictSteamIds];
    const newResults = (data.results || []).filter(r => !excludedIds.includes(r.steamId));

    if (newResults.length > 0) {
      addResultCards(newResults);
      input.value = '';
    }

    // Показываем уведомление о дубликатах
    if (data.duplicates && data.duplicates.length > 0) {
      const myDups = data.duplicates.filter(d => d.alreadyAddedByDiscordId === currentUserId);
      const otherDups = data.duplicates.filter(d => d.alreadyAddedByDiscordId !== currentUserId);
      
      let msg = '';
      if (myDups.length > 0) {
        const names = myDups.map(d => d.personaName || d.steamId).join(', ');
        msg += `Ты уже добавлял: ${names}. `;
      }
      if (otherDups.length > 0) {
        const names = otherDups.map(d => `${d.personaName || d.steamId} (добавил: ${d.alreadyAddedBy})`).join(', ');
        msg += `Уже в базе: ${names}`;
      }
      showNotification(msg.trim(), 'warning');
      if (newResults.length === 0) input.value = '';
    } else if (newResults.length > 0) {
      showNotification('Проверка завершена', 'success');
    }

    // Конфликт типов — показываем модалку перемещения
    if (data.typeConflicts && data.typeConflicts.length > 0) {
      showTypeConflictModal(data.typeConflicts, data.typeConflicts[0].targetType);
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

  const adminSteamId = String(CONFIG?.ADMIN_STEAM_ID || '').trim();
  if (adminSteamId && urls.some((u) => u && u.includes(adminSteamId))) {
    showNotification('Ты сильно-то не охуевай там, малютка', 'error');
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
        type: currentView,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showNotification(data.error || 'Ошибка проверки', 'error');
      return;
    }

    // Добавляем только новые результаты (исключаем дубликаты и конфликты типов)
    const duplicateSteamIds = (data.duplicates || []).map(d => d.steamId);
    const conflictSteamIds = (data.typeConflicts || []).map(d => d.steamId);
    const excludedIds = [...duplicateSteamIds, ...conflictSteamIds];
    const newResults = (data.results || []).filter(r => !excludedIds.includes(r.steamId));

    if (newResults.length > 0) {
      addResultCards(newResults);
    }

    // Уведомления
    if (data.duplicates && data.duplicates.length > 0) {
      const myDups = data.duplicates.filter(d => d.alreadyAddedByDiscordId === currentUserId);
      const otherDups = data.duplicates.filter(d => d.alreadyAddedByDiscordId !== currentUserId);
      
      let msg = `Проверено: ${data.results.length}. `;
      if (myDups.length > 0) {
        const names = myDups.map(d => d.personaName || d.steamId).join(', ');
        msg += `Ты уже добавлял: ${names}. `;
      }
      if (otherDups.length > 0) {
        const names = otherDups.map(d => `${d.personaName || d.steamId} (добавил: ${d.alreadyAddedBy})`).join(', ');
        msg += `Уже в базе: ${names}`;
      }
      showNotification(msg.trim(), 'warning');
    } else if (newResults.length > 0) {
      showNotification(`Проверено профилей: ${newResults.length}`, 'success');
    }

    // Конфликт типов — показываем модалку перемещения
    if (data.typeConflicts && data.typeConflicts.length > 0) {
      showTypeConflictModal(data.typeConflicts, data.typeConflicts[0].targetType);
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

// ===== КОНФЛИКТ ТИПОВ (перемещение читер ↔ бот) =====

let _pendingTypeConflicts = [];

function showTypeConflictModal(conflicts, targetType) {
  _pendingTypeConflicts = conflicts;
  const modal = document.getElementById('typeConflictModal');
  const text = document.getElementById('typeConflictText');
  const list = document.getElementById('typeConflictList');

  const targetLabel = targetType === 'bot' ? 'боты' : 'читеры';
  const sourceLabel = targetType === 'bot' ? 'читер' : 'бот';

  if (conflicts.length === 1) {
    const c = conflicts[0];
    text.textContent = `Профиль «${c.personaName || c.steamId}» уже добавлен как ${sourceLabel}. Переместить в ${targetLabel}?`;
  } else {
    text.textContent = `Найдено ${conflicts.length} профилей, уже добавленных как ${sourceLabel === 'читер' ? 'читеры' : 'боты'}. Переместить в ${targetLabel}?`;
  }

  list.innerHTML = conflicts.map(c =>
    `<div>• ${escapeHtml(c.personaName || c.steamId)} (добавил: ${escapeHtml(c.alreadyAddedBy || 'Unknown')})</div>`
  ).join('');

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeTypeConflictModal() {
  document.getElementById('typeConflictModal').style.display = 'none';
  document.body.style.overflow = '';
  _pendingTypeConflicts = [];
}

async function confirmTypeConflictMove() {
  const conflicts = _pendingTypeConflicts;
  if (!conflicts.length) return closeTypeConflictModal();

  const targetType = conflicts[0].targetType;
  closeTypeConflictModal();
  showLoading(true);

  let moved = 0, failed = 0;
  for (const c of conflicts) {
    try {
      const res = await fetch('/api/cheater-checker/move-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steamId: c.steamId,
          targetType,
          movedByDiscordId: currentUserId,
          movedByUsername: currentUsername,
        }),
      });
      const data = await res.json();
      if (data.success) moved++;
      else failed++;
    } catch {
      failed++;
    }
  }

  showLoading(false);
  if (moved > 0) {
    showNotification(`Перемещено профилей: ${moved}${failed > 0 ? `, ошибок: ${failed}` : ''}`, 'success');
    loadProfiles();
  } else {
    showNotification('Не удалось переместить профили', 'error');
  }
}

// ===== СВЯЗИ МЕЖДУ АККАУНТАМИ =====

function pluralAccounts(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'аккаунт';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'аккаунта';
  return 'аккаунтов';
}

const LINKS_PER_PAGE = 10;
let _linksSteamId = null;        // steamId карточки, для которой открыта модалка
let _linksSearchQuery = '';
let _linksProfilesCache = null;  // все профили (читеры + боты)
let _linksModalTab = 'all';      // фильтр таба: all / cheater / bot
let _linksCache = {};            // steamId → [linkedSteamIds]
let _linksGroupsData = [];       // вычисленные группы для пагинации
let linksPage = 1;
let _linksCountMap = {};         // steamId → количество связей (кэш для has-links)
let _linksGroupNames = {};       // groupKey → { name, renamed_by, renamed_at }
let _allLinksCache = null;       // кэш всех связей (сбрасывается при изменении)

async function openLinksModal(steamId, event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  _linksSteamId = steamId;
  _linksSearchQuery = '';
  _linksModalTab = 'all';
  document.getElementById('linksModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.querySelectorAll('#linksModalTabs .header-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.linksTab === 'all');
  });
  document.getElementById('linksSearchSection').classList.remove('open');
  document.getElementById('linksSearchToggleBtn').classList.remove('active');
  document.getElementById('linksInfoSection').classList.remove('open');
  document.getElementById('linksInfoToggleBtn').classList.remove('active');
  document.getElementById('linksSearchInput').value = '';
  toggleClearBtn(document.getElementById('linksSearchInput'), document.getElementById('linksSearchClearBtn'));
  await loadLinksProfiles();
}

function closeLinksModal() {
  document.getElementById('linksModal').style.display = 'none';
  document.body.style.overflow = '';
  _linksSteamId = null;
}

function toggleLinksSearch() {
  const section = document.getElementById('linksSearchSection');
  const btn = document.getElementById('linksSearchToggleBtn');
  const input = document.getElementById('linksSearchInput');
  const clearBtn = document.getElementById('linksSearchClearBtn');
  const isOpen = section.classList.contains('open');
  if (isOpen) {
    section.classList.remove('open');
    btn.classList.remove('active');
    input.value = '';
    toggleClearBtn(input, clearBtn);
    _linksSearchQuery = '';
    renderLinksProfilesList(0);
  } else {
    // Закрываем info, если открыт
    document.getElementById('linksInfoSection').classList.remove('open');
    document.getElementById('linksInfoToggleBtn').classList.remove('active');
    section.classList.add('open');
    btn.classList.add('active');
    toggleClearBtn(input, clearBtn);
    setTimeout(() => input.focus(), 350);
  }
}

function toggleLinksInfo() {
  const section = document.getElementById('linksInfoSection');
  const btn = document.getElementById('linksInfoToggleBtn');
  const isOpen = section.classList.contains('open');
  if (isOpen) {
    section.classList.remove('open');
    btn.classList.remove('active');
  } else {
    // Закрываем поиск, если открыт
    const searchSection = document.getElementById('linksSearchSection');
    const searchBtn = document.getElementById('linksSearchToggleBtn');
    searchSection.classList.remove('open');
    searchBtn.classList.remove('active');
    const input = document.getElementById('linksSearchInput');
    input.value = '';
    toggleClearBtn(input, document.getElementById('linksSearchClearBtn'));
    _linksSearchQuery = '';
    renderLinksProfilesList(0);

    section.classList.add('open');
    btn.classList.add('active');
  }
}

function filterLinksProfiles(query) {
  _linksSearchQuery = query.toLowerCase().trim();
  toggleClearBtn(document.getElementById('linksSearchInput'), document.getElementById('linksSearchClearBtn'));
  renderLinksProfilesList(0);
}

async function loadLinksProfiles() {
  const container = document.getElementById('linksProfilesList');
  container.innerHTML = '<p style="text-align:center;opacity:0.5;font-size:13px;padding:20px 0">Загрузка...</p>';

  try {
    if (!_linksProfilesCache) {
      const [cheaterRes, botRes] = await Promise.all([
        fetch('/api/cheater-checker/profiles?limit=2000&type=cheater'),
        fetch('/api/cheater-checker/profiles?limit=2000&type=bot'),
      ]);
      const cheaterData = await cheaterRes.json();
      const botData = await botRes.json();
      _linksProfilesCache = [...(cheaterData.profiles || []), ...(botData.profiles || [])];
    }

    // Загружаем связи для текущего профиля
    if (_linksSteamId && !_linksCache[_linksSteamId]) {
      const res = await fetch(`/api/cheater-checker/links/${_linksSteamId}`);
      const data = await res.json();
      _linksCache[_linksSteamId] = new Set(data.linkedIds || []);
    }

    renderLinksProfilesList(0);
  } catch {
    container.innerHTML = '<p style="text-align:center;opacity:0.5;font-size:13px;padding:20px 0">Ошибка загрузки</p>';
  }
}

function switchLinksModalTab(tab) {
  _linksModalTab = tab;
  document.querySelectorAll('#linksModalTabs .header-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.linksTab === tab);
  });
  renderLinksProfilesList(0);
}

function renderLinksProfilesList(page) {
  let list = (_linksProfilesCache || []).filter(p => p.steam_id !== _linksSteamId);

  // Фильтр по табу
  if (_linksModalTab !== 'all') {
    list = list.filter(p => p.type === _linksModalTab);
  }

  if (_linksSearchQuery) {
    const q = _linksSearchQuery;
    list = list.filter(p =>
      (p.persona_name || '').toLowerCase().includes(q) ||
      (p.steam_id || '').includes(q)
    );
  }

  const linkedSet = _linksCache[_linksSteamId] || new Set();
  const container = document.getElementById('linksProfilesList');
  const pag = document.getElementById('linksModalPagination');

  if (!list.length) {
    container.innerHTML = '<p style="text-align:center;opacity:0.5;font-size:13px;padding:20px 0">Профилей нет</p>';
    pag.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(list.length / LINKS_PER_PAGE);
  const start = page * LINKS_PER_PAGE;
  const pageItems = list.slice(start, start + LINKS_PER_PAGE);

  container.innerHTML = pageItems.map(p => `
    <label class="move-profile-item">
      <input type="checkbox" ${linkedSet.has(p.steam_id) ? 'checked' : ''} onchange="toggleLink('${_linksSteamId}', '${p.steam_id}', this.checked)">
      <div class="move-profile-info">
        <div class="move-profile-name">${escapeHtml(p.persona_name || p.steam_id)}</div>
        <div class="move-profile-meta">${p.type === 'bot' ? '🤖 Бот' : '🔴 Читер'} • ${escapeHtml(p.checked_by_username || 'Unknown')}</div>
      </div>
    </label>
  `).join('');

  if (totalPages > 1) {
    let pagHtml = '';
    pagHtml += `<button class="stats-ach-arrow" ${page === 0 ? 'disabled' : ''} onclick="renderLinksProfilesList(${page - 1})">←</button>`;
    pagHtml += `<span class="stats-ach-page">${page + 1} / ${totalPages}</span>`;
    pagHtml += `<button class="stats-ach-arrow" ${page >= totalPages - 1 ? 'disabled' : ''} onclick="renderLinksProfilesList(${page + 1})">→</button>`;
    pag.innerHTML = pagHtml;
  } else {
    pag.innerHTML = '';
  }
}

async function toggleLink(steamId1, steamId2, isChecked) {
  try {
    if (isChecked) {
      await fetch('/api/cheater-checker/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId1, steamId2, createdBy: currentUsername || currentUserId }),
      });
      if (_linksCache[steamId1]) _linksCache[steamId1].add(steamId2);
      _linksCountMap[steamId1] = (_linksCountMap[steamId1] || 0) + 1;
      _linksCountMap[steamId2] = (_linksCountMap[steamId2] || 0) + 1;
      _allLinksCache = null; // сбрасываем кэш связей
    } else {
      await fetch('/api/cheater-checker/links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId1, steamId2 }),
      });
      if (_linksCache[steamId1]) _linksCache[steamId1].delete(steamId2);
      _linksCountMap[steamId1] = Math.max(0, (_linksCountMap[steamId1] || 1) - 1);
      _linksCountMap[steamId2] = Math.max(0, (_linksCountMap[steamId2] || 1) - 1);
      _allLinksCache = null; // сбрасываем кэш связей
    }
    // Обновляем кнопки на обоих аккаунтах
    updateLinksButtonState(steamId1);
    updateLinksButtonState(steamId2);

    // Если активен таб «Связи» — перерисовываем группы
    if (currentReportFilter === 'links') {
      renderLinksGroups();
    }
  } catch (err) {
    console.error('Ошибка связи:', err);
    showNotification('Ошибка при обновлении связи', 'error');
  }
}

async function updateLinksButtonState(steamId) {
  try {
    const res = await fetch(`/api/cheater-checker/links/${steamId}`);
    const data = await res.json();
    const count = (data.linkedIds || []).length;
    _linksCache[steamId] = new Set(data.linkedIds || []);
    const btn = document.querySelector(`.links-btn[data-steam-id="${steamId}"]`);
    if (btn) {
      btn.classList.toggle('has-links', count > 0);
    }
  } catch {}
}

// Таб «Связи» — группы-блоки
async function renderLinksGroups() {
  const container = document.getElementById('linksGroupsContainer');
  container.innerHTML = '<p style="text-align:center;opacity:0.5;font-size:13px;padding:40px 0">Загрузка связей...</p>';

  try {
    const [linksRes, cheaterRes, botRes] = await Promise.all([
      fetch('/api/cheater-checker/links'),
      fetch('/api/cheater-checker/profiles?limit=2000&type=cheater'),
      fetch('/api/cheater-checker/profiles?limit=2000&type=bot'),
    ]);
    const linksData = await linksRes.json();
    const cheaterData = await cheaterRes.json();
    const botData = await botRes.json();

    const allProfiles = [...(cheaterData.profiles || []), ...(botData.profiles || [])];
    const profileMap = {};
    allProfiles.forEach(p => { profileMap[p.steam_id] = p; });
    _linksProfilesCache = allProfiles; // заполняем кэш для renderCardLinks

    const links = linksData.links || [];
    if (!links.length) {
      container.innerHTML = '<p style="text-align:center;opacity:0.5;font-size:13px;padding:40px 0">Связей пока нет</p>';
      document.getElementById('linksPagination').innerHTML = '';
      return;
    }

    // Группируем по group_id (стабильный ID из БД)
    const groupMap = {};
    links.forEach(l => {
      const gid = l.group_id || ('fallback_' + l.steam_id_a);
      if (!groupMap[gid]) groupMap[gid] = { members: new Set(), links: [] };
      groupMap[gid].members.add(l.steam_id_a);
      groupMap[gid].members.add(l.steam_id_b);
      groupMap[gid].links.push(l);
    });

    const groups = Object.entries(groupMap).map(([gid, data]) => ({
      groupId: gid,
      group: [...data.members],
      links: data.links,
      profileMap,
    }));

    groups.sort((a, b) => b.group.length - a.group.length);
    _linksGroupsData = groups;

    await loadGroupNames();
    renderLinksGroupsPage();
  } catch {
    container.innerHTML = '<p style="text-align:center;opacity:0.5;font-size:13px;padding:40px 0">Ошибка загрузки</p>';
  }
}

function renderLinksGroupsPage() {
  const container = document.getElementById('linksGroupsContainer');
  const groups = _linksGroupsData;

  const totalPages = Math.ceil(groups.length / PAGE_SIZE);
  if (linksPage > totalPages) linksPage = totalPages || 1;

  const start = (linksPage - 1) * PAGE_SIZE;
  const pageGroups = groups.slice(start, start + PAGE_SIZE);

  container.innerHTML = pageGroups.map((entry, i) => {
    const { group, links, profileMap, groupId } = entry;
    const idx = start + i;

    const cards = group.map(id => {
      const p = profileMap[id];
      if (!p) return '';
      const isBanned = (p.vac_banned || p.number_of_game_bans > 0 || p.community_banned || (p.economy_ban && p.economy_ban !== 'none'));
      return createProfileCard(p, isBanned);
    }).join('');

    // Имя группы
    const groupInfo = _linksGroupNames[groupId];
    const displayName = groupInfo?.name || `Группа ${idx + 1}`;
    const renamedMeta = groupInfo?.renamed_by
      ? `<div class="link-group-meta">Переименовал: ${escapeHtml(groupInfo.renamed_by)}${groupInfo.renamed_at ? ' • ' + new Date(groupInfo.renamed_at * 1000).toLocaleDateString('ru-RU') : ''}</div>`
      : '';

    // Связи создал (дедупликация по имени)
    const groupSet = new Set(group);
    const groupLinks = links.filter(l => groupSet.has(l.steam_id_a) && groupSet.has(l.steam_id_b));
    const creatorSet = new Set();
    const linkInfos = [];
    groupLinks.forEach(l => {
      const creator = l.created_by_name || l.created_by || 'Unknown';
      const date = l.created_at ? new Date(l.created_at * 1000).toLocaleDateString('ru-RU') : '';
      const key = creator + '|' + date;
      if (!creatorSet.has(key)) {
        creatorSet.add(key);
        linkInfos.push(`${escapeHtml(creator)}${date ? ' • ' + date : ''}`);
      }
    });

    return `
      <div class="link-group">
        <div class="link-group-header">
          <span class="link-group-name" onclick="startRenameGroup('${groupId}', this)" title="Нажмите для переименования">🔗 ${escapeHtml(displayName)}</span> — ${group.length} ${pluralAccounts(group.length)}
          ${renamedMeta}
          ${linkInfos.length ? `<div class="link-group-meta">Связи создал: ${linkInfos.join(' | ')}</div>` : ''}
        </div>
        <div class="link-group-cards">${cards}</div>
      </div>
    `;
  }).join('');

  renderPagination('links', groups.length, linksPage);
  updateAllLinksButtons();
}

function startRenameGroup(groupKey, el) {
  const current = el.textContent.replace('🔗 ', '').trim();
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.className = 'link-group-name-input';
  input.maxLength = 64;
  el.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    const newName = input.value.trim();
    if (save && newName && newName !== current) {
      try {
        await fetch('/api/cheater-checker/links/group-name', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupKey, name: newName, renamedBy: currentUsername || currentUserId }),
        });
        _linksGroupNames[groupKey] = { name: newName, renamed_by: currentUsername || currentUserId, renamed_at: Math.floor(Date.now() / 1000) };
      } catch {
        showNotification('Ошибка при переименовании', 'error');
      }
    }
    renderLinksGroups();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

async function loadGroupNames() {
  try {
    const res = await fetch('/api/cheater-checker/links/group-names');
    const data = await res.json();
    _linksGroupNames = {};
    (data.names || []).forEach(n => {
      _linksGroupNames[n.group_key] = { name: n.name, renamed_by: n.renamed_by, renamed_at: n.renamed_at };
    });
  } catch {}
}

function goToLinksPage(page) {
  linksPage = page;
  renderLinksGroupsPage();
}

// Обновление кнопок «Связи» на всех карточках после загрузки профилей
async function updateAllLinksButtons() {
  try {
    const res = await fetch('/api/cheater-checker/links');
    const data = await res.json();
    const links = data.links || [];
    const countMap = {};
    links.forEach(l => {
      countMap[l.steam_id_a] = (countMap[l.steam_id_a] || 0) + 1;
      countMap[l.steam_id_b] = (countMap[l.steam_id_b] || 0) + 1;
    });
    _linksCountMap = countMap;
    document.querySelectorAll('.links-btn[data-steam-id]').forEach(btn => {
      const sid = btn.dataset.steamId;
      btn.classList.toggle('has-links', (countMap[sid] || 0) > 0);
    });
  } catch {}
}

// Секция связей в раскрытой карточке
async function renderCardLinks(steamId, cardEl) {
  const container = cardEl ? cardEl.querySelector('.card-links-section') : document.querySelector(`.profile-card[data-steam-id="${steamId}"] .card-links-section`);
  if (!container) return;

  try {
    // Используем кэш связей, загружаем только если его нет
    if (!_allLinksCache) {
      const res = await fetch('/api/cheater-checker/links');
      const data = await res.json();
      _allLinksCache = data.links || [];
    }
    const allLinks = _allLinksCache;

    // BFS от steamId — находим всю компоненту связности
    const adj = {};
    allLinks.forEach(l => {
      if (!adj[l.steam_id_a]) adj[l.steam_id_a] = [];
      if (!adj[l.steam_id_b]) adj[l.steam_id_b] = [];
      adj[l.steam_id_a].push(l.steam_id_b);
      adj[l.steam_id_b].push(l.steam_id_a);
    });

    const visited = new Set([steamId]);
    const stack = [steamId];
    const groupMembers = [];
    while (stack.length) {
      const cur = stack.pop();
      groupMembers.push(cur);
      for (const n of (adj[cur] || [])) {
        if (!visited.has(n)) {
          visited.add(n);
          stack.push(n);
        }
      }
    }

    // Убираем сам профиль
    const linkedIds = groupMembers.filter(id => id !== steamId);

    if (!linkedIds.length) {
      container.style.display = 'none';
      return;
    }

    // Имена из кэша
    const items = linkedIds.map(id => {
      const p = (_linksProfilesCache || []).find(x => x.steam_id === id);
      return {
        steamId: id,
        name: p ? (p.persona_name || id) : id,
        profileUrl: p?.profile_url || `https://steamcommunity.com/profiles/${id}`,
      };
    });

    container.innerHTML = `
      <div class="card-links-section-title">🔗 Связанные аккаунты (${items.length})</div>
      <div class="card-links-list">
        ${items.map(item => `
          <div class="card-links-item">
            <svg class="icon" style="width:14px;height:14px;flex-shrink:0"><use href="#icon-link"></use></svg>
            <a href="${escapeHtml(item.profileUrl)}" target="_blank" rel="noopener" class="card-links-name">${escapeHtml(item.name)}</a>
          </div>
        `).join('')}
      </div>
    `;
    container.style.display = 'block';
  } catch {
    container.style.display = 'none';
  }
}

// ===== МАССОВОЕ ПЕРЕМЕЩЕНИЕ ПРОФИЛЕЙ =====

const MOVE_PER_PAGE = 10;
let _moveModalTab = 'cheater';
let _moveSelected = new Set();
let _moveProfilesCache = {};
let _moveSearchQuery = '';

function openMoveProfilesModal() {
  _moveModalTab = 'cheater';
  _moveSelected.clear();
  _moveProfilesCache = {};
  _moveSearchQuery = '';
  document.getElementById('moveProfilesModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.getElementById('moveSearchSection').classList.remove('open');
  document.getElementById('moveSearchToggleBtn').classList.remove('active');
  document.getElementById('moveSearchInput').value = '';
  toggleClearBtn(document.getElementById('moveSearchInput'), document.getElementById('moveSearchClearBtn'));
  updateMoveModalTabs();
  loadMoveProfilesList();
}

function closeMoveProfilesModal() {
  document.getElementById('moveProfilesModal').style.display = 'none';
  document.body.style.overflow = '';
  _moveSelected.clear();
  _moveProfilesCache = {};
  _moveSearchQuery = '';
}

function toggleMoveSearch() {
  const section = document.getElementById('moveSearchSection');
  const btn = document.getElementById('moveSearchToggleBtn');
  const input = document.getElementById('moveSearchInput');
  const clearBtn = document.getElementById('moveSearchClearBtn');

  const isOpen = section.classList.contains('open');

  if (isOpen) {
    section.classList.remove('open');
    btn.classList.remove('active');
    input.value = '';
    toggleClearBtn(input, clearBtn);
    _moveSearchQuery = '';
    renderMoveProfilesList(0);
  } else {
    section.classList.add('open');
    btn.classList.add('active');
    toggleClearBtn(input, clearBtn);
    setTimeout(() => input.focus(), 350);
  }
}

function filterMoveProfiles(query) {
  _moveSearchQuery = query.toLowerCase().trim();
  toggleClearBtn(document.getElementById('moveSearchInput'), document.getElementById('moveSearchClearBtn'));
  renderMoveProfilesList(0);
}

function switchMoveModalTab(tab) {
  _moveModalTab = tab;
  _moveSelected.clear();
  _moveSearchQuery = '';
  document.getElementById('moveSearchInput').value = '';
  toggleClearBtn(document.getElementById('moveSearchInput'), document.getElementById('moveSearchClearBtn'));
  updateMoveModalTabs();
  loadMoveProfilesList();
}

function updateMoveModalTabs() {
  document.querySelectorAll('#moveModalTabs .header-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.moveTab === _moveModalTab);
  });
  const btn = document.getElementById('moveConfirmBtn');
  btn.textContent = _moveModalTab === 'cheater' ? 'Переместить в Боты' : 'Переместить в Читеры';
}

async function loadMoveProfilesList() {
  const container = document.getElementById('moveProfilesList');
  const pag = document.getElementById('moveProfilesPagination');
  container.innerHTML = '<p style="text-align:center;opacity:0.5;font-size:13px;padding:20px 0">Загрузка...</p>';
  pag.innerHTML = '';

  if (_moveProfilesCache[_moveModalTab]) {
    renderMoveProfilesList(0);
    return;
  }

  try {
    const res = await fetch(`/api/cheater-checker/profiles?limit=1000&offset=0&type=${_moveModalTab}`);
    const data = await res.json();
    _moveProfilesCache[_moveModalTab] = data.profiles || data.results || data || [];
    renderMoveProfilesList(0);
  } catch {
    container.innerHTML = '<p style="text-align:center;opacity:0.5;font-size:13px;padding:20px 0">Ошибка загрузки</p>';
  }
}

function renderMoveProfilesList(page) {
  let list = _moveProfilesCache[_moveModalTab] || [];

  // Поиск по нику, SteamID или имени добавившего
  if (_moveSearchQuery) {
    const q = _moveSearchQuery;
    list = list.filter(p =>
      (p.persona_name || '').toLowerCase().includes(q) ||
      (p.steam_id || '').includes(q) ||
      (p.checked_by_username || '').toLowerCase().includes(q)
    );
  }

  const container = document.getElementById('moveProfilesList');
  const pag = document.getElementById('moveProfilesPagination');

  if (!list.length) {
    container.innerHTML = '<p style="text-align:center;opacity:0.5;font-size:13px;padding:20px 0">Профилей нет</p>';
    pag.innerHTML = '';
    updateMoveSelectedCount();
    return;
  }

  const totalPages = Math.ceil(list.length / MOVE_PER_PAGE);
  const start = page * MOVE_PER_PAGE;
  const pageItems = list.slice(start, start + MOVE_PER_PAGE);

  container.innerHTML = pageItems.map(p => `
    <label class="move-profile-item">
      <input type="checkbox" ${_moveSelected.has(p.steam_id) ? 'checked' : ''} onchange="toggleMoveSelect('${p.steam_id}', this.checked)">
      <div class="move-profile-info">
        <div class="move-profile-name">${escapeHtml(p.persona_name || p.steam_id)}</div>
        <div class="move-profile-meta">${escapeHtml(p.checked_by_username || 'Unknown')} • ${new Date(p.checked_at).toLocaleDateString('ru-RU')}</div>
      </div>
    </label>
  `).join('');

  if (totalPages > 1) {
    let pagHtml = '';
    pagHtml += `<button class="stats-ach-arrow" ${page === 0 ? 'disabled' : ''} onclick="renderMoveProfilesList(${page - 1})">←</button>`;
    pagHtml += `<span class="stats-ach-page">${page + 1} / ${totalPages}</span>`;
    pagHtml += `<button class="stats-ach-arrow" ${page >= totalPages - 1 ? 'disabled' : ''} onclick="renderMoveProfilesList(${page + 1})">→</button>`;
    pag.innerHTML = pagHtml;
  } else {
    pag.innerHTML = '';
  }

  updateMoveSelectedCount();
}

function toggleMoveSelect(steamId, checked) {
  if (checked) _moveSelected.add(steamId);
  else _moveSelected.delete(steamId);
  updateMoveSelectedCount();
}

function updateMoveSelectedCount() {
  document.getElementById('moveSelectedCount').textContent = `Выбрано: ${_moveSelected.size}`;
}

async function confirmMoveProfiles() {
  if (_moveSelected.size === 0) {
    showNotification('Выберите хотя бы один профиль', 'warning');
    return;
  }

  const targetType = _moveModalTab === 'cheater' ? 'bot' : 'cheater';
  closeMoveProfilesModal();
  showLoading(true);

  let moved = 0, failed = 0;
  for (const steamId of _moveSelected) {
    try {
      const res = await fetch('/api/cheater-checker/move-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steamId,
          targetType,
          movedByDiscordId: currentUserId,
          movedByUsername: currentUsername,
        }),
      });
      const data = await res.json();
      if (data.success) moved++;
      else failed++;
    } catch {
      failed++;
    }
  }

  showLoading(false);
  if (moved > 0) {
    showNotification(`Перемещено профилей: ${moved}${failed > 0 ? `, ошибок: ${failed}` : ''}`, 'success');
    loadProfiles();
  } else {
    showNotification('Не удалось переместить профили', 'error');
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
      method: 'DELETE'
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Удаляем карточку из DOM
      const card = document.querySelector(`.profile-card[data-steam-id="${pendingDeleteSteamId}"]`);
      if (card) {
        card.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => card.remove(), 300);
      }

      // Удаляем из массивов
      allBannedProfiles = allBannedProfiles.filter(p => p.steam_id !== pendingDeleteSteamId);
      allCleanProfiles = allCleanProfiles.filter(p => p.steam_id !== pendingDeleteSteamId);
      allBannedProfilesUnfiltered = allBannedProfilesUnfiltered.filter(p => p.steam_id !== pendingDeleteSteamId);
      allCleanProfilesUnfiltered = allCleanProfilesUnfiltered.filter(p => p.steam_id !== pendingDeleteSteamId);

      // Обновляем счётчики
      updateCounters();
      updateFavoritesCount();
      updateFilterCounts();

      // Undo-уведомление
      const steamId = pendingDeleteSteamId;
      const undoData = data.undoData;
      showUndoNotification(`Удалено: ${escapeHtml(undoData?.profile?.persona_name || steamId)}`, () => undoDelete(steamId, undoData));
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

async function undoDelete(steamId, undoData) {
  try {
    const res = await fetch(`/api/cheater-checker/profiles/${steamId}/undo-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ undoData }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showNotification('Восстановлено', 'success');
      loadProfiles();
    } else {
      showNotification(data.error || 'Ошибка восстановления', 'error');
    }
  } catch {
    showNotification('Ошибка соединения', 'error');
  }
}

function showUndoNotification(text, onUndo) {
  const notification = document.getElementById('notification');
  const notificationText = document.getElementById('notificationText');
  if (!notification || !notificationText) return;

  notificationText.innerHTML = `${text} <button class="undo-btn" id="undoActionBtn">Отменить</button>`;
  notification.className = 'notification info';
  notification.style.display = 'block';

  requestAnimationFrame(() => notification.classList.add('show'));

  const undoBtn = document.getElementById('undoActionBtn');
  if (undoBtn) undoBtn.onclick = () => {
    notification.classList.remove('show');
    setTimeout(() => { notification.style.display = 'none'; }, 400);
    onUndo();
  };

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => { notification.style.display = 'none'; }, 400);
  }, 5000);
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

async function openStatsModal() {
  document.getElementById('statsModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const content = document.getElementById('statsContent');
  content.innerHTML = '<div class="stats-loading">Загрузка...</div>';

  try {
    const res = await fetch('/api/cheater-checker/stats');
    if (!res.ok) throw new Error('Ошибка загрузки');
    const stats = await res.json();

    const ch = stats.cheater || { totalChecked: 0, bannedFound: 0 };
    const bt = stats.bot || { totalChecked: 0, bannedFound: 0 };

    // Подготавливаем достижения
    const achievements = stats.achievements || [];
    const ACH = (typeof ACHIEVEMENTS !== 'undefined') ? ACHIEVEMENTS : {};
    const cheaterAch = [];
    const botAch = [];
    achievements.forEach(a => {
      const item = {
        id: a.id,
        name: ACH[a.id]?.name || a.id,
        desc: ACH[a.id]?.description || '',
        points: ACH[a.id]?.points || 0,
      };
      if (a.id.startsWith('bot_')) botAch.push(item);
      else cheaterAch.push(item);
    });

    content.innerHTML = `
      <div class="stats-section">
        <h3>🚨 Читеры</h3>
        <div class="stats-row"><span>Добавлено профилей:</span><span class="stats-value">${ch.totalChecked}</span></div>
        <div class="stats-row"><span>Получили ограничения:</span><span class="stats-value stats-danger">${ch.bannedFound}</span></div>
        <div class="stats-row"><span>Процент:</span><span class="stats-value">${ch.totalChecked > 0 ? Math.round(ch.bannedFound / ch.totalChecked * 100) : 0}%</span></div>
      </div>
      <div class="stats-section">
        <h3>🤖 Боты</h3>
        <div class="stats-row"><span>Добавлено профилей:</span><span class="stats-value">${bt.totalChecked}</span></div>
        <div class="stats-row"><span>Получили ограничения:</span><span class="stats-value stats-danger">${bt.bannedFound}</span></div>
        <div class="stats-row"><span>Процент:</span><span class="stats-value">${bt.totalChecked > 0 ? Math.round(bt.bannedFound / bt.totalChecked * 100) : 0}%</span></div>
      </div>
      <div class="stats-section stats-total">
        <h3>📈 Итого</h3>
        <div class="stats-row"><span>Всего добавлено:</span><span class="stats-value">${ch.totalChecked + bt.totalChecked}</span></div>
        <div class="stats-row"><span>Всего с ограничениями:</span><span class="stats-value stats-danger">${ch.bannedFound + bt.bannedFound}</span></div>
      </div>
      <div class="stats-section stats-achievements">
        <h3>🏆 Достижения по читерам</h3>
        <div id="statsAchGrid"></div>
        <div id="statsAchPagination" class="stats-ach-pagination"></div>
      </div>
      <div class="stats-section stats-achievements">
        <h3>🗑️ Достижения по ботам</h3>
        <div id="statsBotAchGrid"></div>
        <div id="statsBotAchPagination" class="stats-ach-pagination"></div>
      </div>
    `;

    renderStatsAchievements(cheaterAch, 0, 'statsAchGrid', 'statsAchPagination');
    renderStatsAchievements(botAch, 0, 'statsBotAchGrid', 'statsBotAchPagination');
  } catch (err) {
    content.innerHTML = '<div class="stats-loading" style="color:#f44336;">Ошибка загрузки статистики</div>';
  }
}

const STATS_ACH_PER_PAGE = 6;

function renderStatsAchievements(list, page, gridId, pagId) {
  const grid = document.getElementById(gridId);
  const pag = document.getElementById(pagId);
  if (!grid) return;

  if (!list.length) {
    grid.innerHTML = '<p class="stats-hint">Достижений пока нет</p>';
    if (pag) pag.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(list.length / STATS_ACH_PER_PAGE);
  const start = page * STATS_ACH_PER_PAGE;
  const pageItems = list.slice(start, start + STATS_ACH_PER_PAGE);

  grid.innerHTML = `<div class="stats-ach-grid">${pageItems.map(a => `
    <div class="stats-ach-card" title="${a.points} очков">
      <span class="stats-ach-points">+${a.points}</span>
      <div class="stats-ach-name">${escapeHtml(a.name)}</div>
      <div class="stats-ach-desc">${escapeHtml(a.desc)}</div>
    </div>
  `).join('')}</div>`;

  if (totalPages > 1) {
    let pagHtml = '';
    pagHtml += `<button class="stats-ach-arrow" ${page === 0 ? 'disabled' : ''} onclick="renderStatsAchievements(window._statsAchList_${gridId}, ${page - 1}, '${gridId}', '${pagId}')">←</button>`;
    pagHtml += `<span class="stats-ach-page">${page + 1} / ${totalPages}</span>`;
    pagHtml += `<button class="stats-ach-arrow" ${page >= totalPages - 1 ? 'disabled' : ''} onclick="renderStatsAchievements(window._statsAchList_${gridId}, ${page + 1}, '${gridId}', '${pagId}')">→</button>`;
    pag.innerHTML = pagHtml;
  } else {
    pag.innerHTML = '';
  }

  window['_statsAchList_' + gridId] = list;
}

function closeStatsModal() {
  document.getElementById('statsModal').style.display = 'none';
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

// ===== ИСТОРИЯ ИМЁН =====

async function showNameHistory(steamId, currentName) {
  try {
    const res = await fetch(`/api/cheater-checker/profiles/${steamId}/names`);
    if (!res.ok) {
      showNotification('Ошибка загрузки истории имён', 'error');
      return;
    }

    const history = await res.json();
    if (history.length === 0) return;

    // Удаляем старую модалку если есть
    const existingModal = document.getElementById('nameHistoryModal');
    if (existingModal) existingModal.remove();

    const PAGE_SIZE = 15;
    let displayed = 0;

    const modal = document.createElement('div');
    modal.id = 'nameHistoryModal';
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#1e1e2e;border-radius:16px;padding:24px;max-width:420px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h3 style="margin:0;color:#e0e0e0;font-size:16px;">📜 Прошлые имена — ${escapeHtml(currentName)}</h3>
          <button onclick="document.getElementById('nameHistoryModal').remove();document.body.style.overflow='';" style="background:none;border:none;color:rgba(255,255,255,0.5);font-size:24px;cursor:pointer;padding:0;line-height:1;">&times;</button>
        </div>
        <div id="nameHistoryList"></div>
        <div id="nameHistoryLoadMore" style="text-align:center;margin-top:12px;"></div>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
        document.body.style.overflow = '';
      }
    });

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    function renderPage() {
      const list = document.getElementById('nameHistoryList');
      const loadMore = document.getElementById('nameHistoryLoadMore');
      if (!list || !loadMore) return;

      const end = Math.min(displayed + PAGE_SIZE, history.length);
      for (let i = displayed; i < end; i++) {
        const item = history[i];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:6px;';
        row.innerHTML = `<span style="color:#e0e0e0;font-size:14px;">${escapeHtml(item.persona_name)}</span><span style="color:rgba(255,255,255,0.4);font-size:12px;">${formatUpdatedAt(item.changed_at)}</span>`;
        list.appendChild(row);
      }
      displayed = end;

      if (displayed < history.length) {
        const remaining = history.length - displayed;
        loadMore.innerHTML = `<button onclick="loadMoreNames_${steamId.replace(/\D/g, '')}()" style="background:rgba(102,126,234,0.15);border:1px solid rgba(102,126,234,0.3);color:#a0b0ff;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:13px;">Показать ещё (${remaining})</button>`;
      } else {
        loadMore.innerHTML = '';
      }
    }

    // Глобальная функция для кнопки "Показать ещё"
    const fnName = `loadMoreNames_${steamId.replace(/\D/g, '')}`;
    window[fnName] = renderPage;

    renderPage();
  } catch (err) {
    showNotification('Ошибка соединения с сервером', 'error');
  }
}

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

  // Проверяем начальное состояние
  toggleClearBtn(input, clearBtn);
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

// ===== ИЗБРАННОЕ И ЗАМЕТКИ =====

/**
 * Конвертирует URL в тексте в кликабельные ссылки
 */
function linkifyUrls(text) {
  const escaped = escapeHtml(text);
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  return escaped.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener" class="note-link">$1</a>');
}

/**
 * Toggle избранное для профиля
 */
async function toggleFavorite(steamId, event) {
  if (event) event.stopPropagation();
  if (!currentUserId) {
    showNotification('Войдите в систему', 'error');
    return;
  }

  const profile = [...allBannedProfilesUnfiltered, ...allCleanProfilesUnfiltered]
    .find(p => p.steam_id === steamId);
  const wasFavorite = profile?.isFavorite;

  // Если снимаем из избранное и есть заметки — предупреждаем
  if (wasFavorite && profile.notes && profile.notes.length > 0) {
    const confirmed = await showConfirmDialogCustom(
      `У этого профиля ${profile.notes.length} ${profile.notes.length === 1 ? 'заметка' : 'заметок'}. ` +
      `Удалить из избранного? Заметки будут удалены.`
    );
    if (!confirmed) return;
  }

  try {
    const res = await fetch(`/api/cheater-checker/favorites/${steamId}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showNotification(data.error || 'Ошибка', 'error');
      return;
    }

    // Обновляем в unfiltered (объекты shared по ссылке)
    [allBannedProfilesUnfiltered, allCleanProfilesUnfiltered].forEach(arr => {
      const p = arr.find(x => x.steam_id === steamId);
      if (p) {
        p.isFavorite = data.isFavorite;
        if (data.notesDeleted) p.notes = [];
      }
    });

    // Обновляем звёздочку в DOM (все копии — в основной сетке и в группах связей)
    document.querySelectorAll(`.card-fav-btn[data-steam-id="${steamId}"]`).forEach(star => {
      star.classList.toggle('active', data.isFavorite);
    });

    // Скрываем карандаш если заметки удалены
    if (data.notesDeleted) {
      const pencil = document.querySelector(`.card-pencil[data-steam-id="${steamId}"]`);
      if (pencil) pencil.style.display = 'none';
      // Удаляем заметки из DOM
      const notesContainer = document.getElementById(`notes-${steamId}`);
      if (notesContainer) notesContainer.innerHTML = '';
    }

    showNotification(data.isFavorite ? 'Добавлено в избранное' : 'Удалено из избранного', 'success');

    // Обновляем счётчик избранного
    updateFavoritesCount();
    updateFilterCounts();

    // Если сейчас вкладка "Избранное" — обновляем отфильтрованные массивы и перерисовываем
    if (currentReportFilter === 'favorites') {
      applyReportFilter();
      bannedPage = 1;
      cleanPage = 1;
      renderBannedPage();
      renderCleanPage();
      updateCounters();
    }
  } catch (err) {
    showNotification('Ошибка соединения', 'error');
  }
}

/**
 * Добавить заметку к профилю
 */
async function addNote(steamId) {
  if (!currentUserId) {
    showNotification('Войдите в систему', 'error');
    return;
  }

  const input = document.getElementById(`note-input-${steamId}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  try {
    const res = await fetch(`/api/cheater-checker/notes/${steamId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) {
      showNotification(data.error || 'Ошибка', 'error');
      return;
    }

    // Обновляем профиль в unfiltered (объекты shared по ссылке → filtered тоже обновятся)
    [allBannedProfilesUnfiltered, allCleanProfilesUnfiltered].forEach(arr => {
      const p = arr.find(x => x.steam_id === steamId);
      if (p) {
        p.notes = p.notes || [];
        p.notes.push({ id: data.noteId, text, created_at: Date.now(), updated_at: Date.now() });
        p.isFavorite = true;
      }
    });

    // Обновляем звёздочку (могла стать активной из-за авто-добавления)
    document.querySelectorAll(`.card-fav-btn[data-steam-id="${steamId}"]`).forEach(star => star.classList.add('active'));

    // Показываем карандаш
    const pencil = document.querySelector(`.card-pencil[data-steam-id="${steamId}"]`);
    if (pencil) pencil.style.display = 'inline-flex';

    // Очищаем инпут
    input.value = '';

    // Рендерим заметки
    renderNotes(steamId);
    showNotification('Заметка добавлена', 'success');
  } catch (err) {
    showNotification('Ошибка соединения', 'error');
  }
}

/**
 * Редактировать заметку
 */
function editNote(noteId, steamId) {
  const noteItem = document.querySelector(`.note-text[data-note-id="${noteId}"]`)?.closest('.note-item');
  if (!noteItem) return;

  const noteTextEl = noteItem.querySelector('.note-text');
  const currentText = noteTextEl.innerText;

  // Заменяем содержимое note-item на textarea
  noteItem.innerHTML = `
    <div class="note-edit-row">
      <textarea class="note-input note-textarea note-edit-input auto-resize">${escapeHtml(currentText)}</textarea>
      <div class="note-edit-buttons">
        <button class="note-save-btn" onclick="saveNoteEdit(${noteId}, '${steamId}')">Сохранить</button>
        <button class="note-cancel-btn" onclick="renderNotes('${steamId}')">Отмена</button>
      </div>
    </div>
  `;

  const textarea = noteItem.querySelector('.note-edit-input');
  initAutoResize(textarea);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNoteEdit(noteId, steamId); }
    if (e.key === 'Escape') renderNotes(steamId);
  });
}

async function saveNoteEdit(noteId, steamId) {
  const textarea = document.querySelector('.note-edit-input');
  if (!textarea) return;
  const newText = textarea.value.trim();
  if (!newText) return;

  try {
    const res = await fetch(`/api/cheater-checker/notes/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText }),
    });
    const data = await res.json();
    if (!res.ok) {
      showNotification(data.error || 'Ошибка', 'error');
      return;
    }

    // Обновляем в unfiltered (объекты shared по ссылке)
    [allBannedProfilesUnfiltered, allCleanProfilesUnfiltered].forEach(arr => {
      const p = arr.find(x => x.steam_id === steamId);
      if (p && p.notes) {
        const note = p.notes.find(n => n.id === noteId);
        if (note) {
          note.text = newText;
          note.updated_at = Date.now();
        }
      }
    });

    renderNotes(steamId);
    showNotification('Заметка обновлена', 'success');
  } catch (err) {
    showNotification('Ошибка соединения', 'error');
  }
}

/**
 * Удалить заметку — inline подтверждение
 */
function deleteNote(noteId, steamId) {
  const noteItem = document.querySelector(`.note-text[data-note-id="${noteId}"]`)?.closest('.note-item');
  if (!noteItem) return;

  const noteActions = noteItem.querySelector('.note-actions');
  if (!noteActions) return;

  // Показываем inline-подтверждение
  noteActions.innerHTML = `
    <span class="note-delete-hint">Удалить?</span>
    <button class="note-action-btn note-delete-confirm" onclick="confirmDeleteNote(${noteId}, '${steamId}')" title="Да">✓</button>
    <button class="note-action-btn" onclick="renderNotes('${steamId}')" title="Отмена">✕</button>
  `;
}

/**
 * Подтверждение удаления заметки
 */
async function confirmDeleteNote(noteId, steamId) {

  try {
    const res = await fetch(`/api/cheater-checker/notes/${noteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      showNotification(data.error || 'Ошибка', 'error');
      return;
    }

    // Обновляем в unfiltered (объекты shared по ссылке)
    [allBannedProfilesUnfiltered, allCleanProfilesUnfiltered].forEach(arr => {
      const p = arr.find(x => x.steam_id === steamId);
      if (p && p.notes) {
        p.notes = p.notes.filter(n => n.id !== noteId);
      }
    });

    // Скрываем карандаш если заметок больше нет
    const profile = [...allBannedProfilesUnfiltered, ...allCleanProfilesUnfiltered]
      .find(p => p.steam_id === steamId);
    if (profile && (!profile.notes || profile.notes.length === 0)) {
      const pencil = document.querySelector(`.card-pencil[data-steam-id="${steamId}"]`);
      if (pencil) pencil.style.display = 'none';
    }

    renderNotes(steamId);
    showNotification('Заметка удалена', 'success');
  } catch (err) {
    showNotification('Ошибка соединения', 'error');
  }
}

/**
 * Рендерит заметки в контейнере карточки
 */
function renderNotes(steamId, cardEl) {
  const container = cardEl ? cardEl.querySelector('.notes-section') : document.querySelector(`.profile-card[data-steam-id="${steamId}"] .notes-section`);
  if (!container) return;

  const profile = [...allBannedProfilesUnfiltered, ...allCleanProfilesUnfiltered]
    .find(p => p.steam_id === steamId);
  const notes = profile?.notes || [];

  let html = '';

  // Список существующих заметок
  notes.forEach(note => {
    html += `
      <div class="note-item">
        <div class="note-content">
          <span class="note-text" data-note-id="${note.id}">${linkifyUrls(note.text)}</span>
          <span class="note-date">${new Date(note.created_at).toLocaleString('ru-RU')}</span>
        </div>
        <div class="note-actions">
          <button class="note-action-btn" onclick="editNote(${note.id}, '${steamId}')" title="Редактировать"><svg class="icon" aria-hidden="true"><use href="#icon-edit"></use></svg></button>
          <button class="note-action-btn note-delete-btn" onclick="deleteNote(${note.id}, '${steamId}')" title="Удалить">✕</button>
        </div>
      </div>
    `;
  });

  // Поле ввода для новой заметки
  html += `
    <div class="note-input-row">
      <textarea class="note-input note-textarea auto-resize" id="note-input-${steamId}" placeholder="Добавить заметку..." rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();addNote('${steamId}')}"></textarea>
      <button class="note-save-btn" onclick="addNote('${steamId}')">Сохранить</button>
    </div>
  `;

  container.innerHTML = html;

  // Автоувеличение textarea
  container.querySelectorAll('.auto-resize').forEach(initAutoResize);
}

/**
 * Кастомный confirm с промисом
 */
function showConfirmDialogCustom(message) {
  return new Promise(resolve => {
    const dialog = document.getElementById('confirmDialog');
    const text = document.getElementById('confirmText');
    const deleteBtn = document.getElementById('confirmDeleteBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    text.textContent = message;
    deleteBtn.textContent = 'Удалить';
    dialog.style.display = 'flex';

    const cleanup = () => {
      dialog.style.display = 'none';
      deleteBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    deleteBtn.onclick = () => { cleanup(); resolve(true); };
    cancelBtn.onclick = () => { cleanup(); resolve(false); };
  });
}

/**
 * Автоувеличение textarea при вводе/вставке
 */
function initAutoResize(textarea) {
  const resize = () => {
    textarea.style.height = 'auto';
    const maxH = parseInt(getComputedStyle(textarea).maxHeight, 10) || 150;
    textarea.style.height = Math.min(textarea.scrollHeight, maxH) + 'px';
  };
  textarea.addEventListener('input', resize);
  textarea.addEventListener('paste', () => setTimeout(resize, 0));
  resize();
}

// ===== ДРУЗЬЯ ЧИТЕРА =====

const FRIENDS_PER_PAGE = 7;
let _friendsList = [];
let _friendsPage = 1;
let _friendsSteamId = '';
let _friendsFilter = '';

async function openFriendsModal(steamId, event) {
  if (event) event.stopPropagation();
  _friendsSteamId = steamId;
  _friendsPage = 1;
  _friendsFilter = '';
  document.getElementById('friendsModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.getElementById('friendsList').innerHTML = '<div class="friends-loading">Загрузка...</div>';
  document.getElementById('friendsPagination').innerHTML = '';

  // Сбрасываем поиск
  const searchSection = document.getElementById('friendsSearchSection');
  const searchBtn = document.getElementById('friendsSearchToggleBtn');
  const searchInput = document.getElementById('friendsSearchInput');
  const searchClearBtn = document.getElementById('friendsSearchClearBtn');
  if (searchSection) searchSection.classList.remove('open');
  if (searchBtn) searchBtn.classList.remove('active');
  if (searchInput) { searchInput.value = ''; toggleClearBtn(searchInput, searchClearBtn); }

  try {
    const res = await fetch(`/api/cheater-checker/friends/${steamId}`);
    const data = await res.json();
    _friendsList = data.friends || [];
    renderFriendsPage();
  } catch (err) {
    document.getElementById('friendsList').innerHTML = '<div class="friends-loading" style="color:#f44336;">Ошибка загрузки</div>';
  }
}

function closeFriendsModal() {
  document.getElementById('friendsModal').style.display = 'none';
  document.body.style.overflow = '';
  // Сбрасываем поиск
  const searchSection = document.getElementById('friendsSearchSection');
  const searchBtn = document.getElementById('friendsSearchToggleBtn');
  const searchInput = document.getElementById('friendsSearchInput');
  if (searchSection) searchSection.classList.remove('open');
  if (searchBtn) searchBtn.classList.remove('active');
  if (searchInput) searchInput.value = '';
}

function toggleFriendsSearch() {
  const section = document.getElementById('friendsSearchSection');
  const btn = document.getElementById('friendsSearchToggleBtn');
  const input = document.getElementById('friendsSearchInput');
  const clearBtn = document.getElementById('friendsSearchClearBtn');
  const isOpen = section.classList.contains('open');

  if (isOpen) {
    section.classList.remove('open');
    btn.classList.remove('active');
    input.value = '';
    toggleClearBtn(input, clearBtn);
    _friendsFilter = '';
    _friendsPage = 1;
    renderFriendsPage();
  } else {
    section.classList.add('open');
    btn.classList.add('active');
    toggleClearBtn(input, clearBtn);
    setTimeout(() => input.focus(), 350);
  }
}

function filterFriends(query) {
  _friendsFilter = query.toLowerCase().trim();
  _friendsPage = 1;
  renderFriendsPage();
}

function renderFriendsPage() {
  const list = document.getElementById('friendsList');
  const pag = document.getElementById('friendsPagination');

  // Фильтрация
  let filtered = _friendsList;
  if (_friendsFilter) {
    filtered = _friendsList.filter(f =>
      (f.friend_persona_name || '').toLowerCase().includes(_friendsFilter) ||
      f.friend_steam_id.includes(_friendsFilter) ||
      (f.friend_custom_url || '').toLowerCase().includes(_friendsFilter)
    );
  }

  if (!filtered.length) {
    list.innerHTML = `<div class="friends-loading">${_friendsFilter ? 'Ничего не найдено' : 'Друзья не найдены или список приватный'}</div>`;
    pag.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filtered.length / FRIENDS_PER_PAGE);
  const start = (_friendsPage - 1) * FRIENDS_PER_PAGE;
  const pageItems = filtered.slice(start, start + FRIENDS_PER_PAGE);

  list.innerHTML = pageItems.map(f => {
    const realUrl = `https://steamcommunity.com/profiles/${f.friend_steam_id}`;
    const name = escapeHtml(f.friend_persona_name || f.friend_steam_id);
    const customUrl = f.friend_custom_url;
    let links = `<a href="${realUrl}" target="_blank" rel="noopener" class="friend-link">${realUrl}</a>`;
    if (customUrl) {
      const customFull = `https://steamcommunity.com/id/${customUrl}`;
      links = `<a href="${realUrl}" target="_blank" rel="noopener" class="friend-link">${realUrl}</a>\n<div class="friend-also">также: <a href="${customFull}" target="_blank" rel="noopener" class="friend-link friend-also-link">${customFull}</a></div>`;
    }
    const btnClass = f.isCheater ? 'friend-add-btn friend-add-done' : 'friend-add-btn';
    const btnTitle = f.isCheater ? 'Уже в списке' : 'Добавить в читеры';
    const btnIcon = f.isCheater ? '✓' : '+';
    return `<div class="friend-item"><div class="friend-name">${name}</div><div class="friend-links">${links}</div><button class="${btnClass}" title="${btnTitle}" data-steam-id="${f.friend_steam_id}" onclick="addFriendAsCheater('${f.friend_steam_id}', this, event)">${btnIcon}</button></div>`;
  }).join('');

  if (totalPages > 1) {
    let pagHtml = '';
    pagHtml += `<button class="friends-arrow" ${_friendsPage === 1 ? 'disabled' : ''} onclick="goFriendsPage(${_friendsPage - 1})">←</button>`;
    pagHtml += `<span class="friends-page-num">${_friendsPage} / ${totalPages}</span>`;
    pagHtml += `<button class="friends-arrow" ${_friendsPage >= totalPages ? 'disabled' : ''} onclick="goFriendsPage(${_friendsPage + 1})">→</button>`;
    pag.innerHTML = pagHtml;
  } else {
    pag.innerHTML = '';
  }
}

function goFriendsPage(page) {
  _friendsPage = page;
  renderFriendsPage();
}

async function addFriendAsCheater(steamId, btn, event) {
  if (event) event.stopPropagation();
  if (btn.classList.contains('friend-add-done')) return;

  const url = `https://steamcommunity.com/profiles/${steamId}`;
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const res = await fetch('/api/cheater-checker/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [url],
        checkedByDiscordId: currentUserId,
        checkedByUsername: currentUsername || currentUserId,
        type: 'cheater',
      }),
    });
    const data = await res.json();
    if (res.ok) {
      btn.classList.add('friend-add-done');
      btn.textContent = '✓';
      btn.title = 'Уже в списке';
      showNotification('Добавлено в читеры', 'success');
      // Обновляем список профилей
      loadProfiles();
    } else {
      btn.disabled = false;
      btn.textContent = '+';
      showNotification(data.error || 'Ошибка добавления', 'error');
    }
  } catch {
    btn.disabled = false;
    btn.textContent = '+';
    showNotification('Ошибка соединения', 'error');
  }
}

async function refreshFriends(steamId, event) {
  if (event) event.stopPropagation();
  const btn = document.querySelector(`.friends-refresh-btn[data-steam-id="${steamId}"]`);
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

  try {
    const res = await fetch(`/api/cheater-checker/friends/${steamId}/refresh`, { method: 'POST' });
    const data = await res.json();
    if (data.refreshed) {
      showNotification(`Обновлено: ${data.count} друзей`, 'success');
      // Обновляем tooltip только при успехе
      if (btn) btn.title = `Обновлено: ${new Date().toLocaleString('ru-RU')}`;
    } else {
      showNotification(data.message || 'Список не обновлён', 'error');
    }
    // Обновляем счётчик
    const countEl = document.querySelector(`.friends-count[data-count-for="${steamId}"]`);
    const friendsBtn = document.querySelector(`.friends-btn[data-steam-id="${steamId}"]`);
    if (countEl) {
      if (data.count > 0) {
        countEl.textContent = ` (${data.count})`;
        if (friendsBtn) friendsBtn.style.display = '';
      } else {
        countEl.textContent = '';
        if (friendsBtn) friendsBtn.style.display = 'none';
      }
    }
    // Если модалка открыта — перерисовываем
    if (document.getElementById('friendsModal').style.display !== 'none' && _friendsSteamId === steamId) {
      _friendsList = data.friends || [];
      _friendsPage = 1;
      renderFriendsPage();
    }
  } catch (err) {
    showNotification('Ошибка обновления', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

/**
 * Загружает количество друзей для карточек после рендера
 */
async function loadFriendsCounts() {
  const countEls = document.querySelectorAll('.friends-count');
  for (const el of countEls) {
    const steamId = el.dataset.countFor;
    if (!steamId) continue;
    try {
      const res = await fetch(`/api/cheater-checker/friends/${steamId}`);
      const data = await res.json();
      const btn = el.closest('.friends-btn');
      if (data.count > 0) {
        el.textContent = ` (${data.count})`;
        if (btn) btn.style.display = '';
      } else {
        el.textContent = '';
        if (btn) btn.style.display = 'none';
      }
    } catch { /* ignore */ }
  }
}
