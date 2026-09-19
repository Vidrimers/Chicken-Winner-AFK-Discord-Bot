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
    const [bannedRes, cleanRes] = await Promise.all([
      fetch('/api/cheater-checker/profiles?limit=1000&filter=banned'),
      fetch('/api/cheater-checker/profiles?limit=1000&filter=clean'),
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

    // Отмечаем что пользователь просмотрел страницу
    if (currentUserId) {
      fetch('/api/cheater-checker/mark-viewed', { method: 'POST' }).catch(() => {});
    }
  } catch (err) {
    console.error('❌ Ошибка загрузки профилей:', err);
  }
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
  const checkerName = isExternal
    ? `<a href="${escapeHtml(profile.reported_by_url || '#')}" target="_blank" style="color:#81c784;text-decoration:none;">${escapeHtml(profile.reported_by_name || 'External')}</a>`
    : escapeHtml(profile.checked_by_username || 'Unknown');
  const sourceBadge = isExternal
    ? `<span class="source-badge source-badge--external">📡 Steam Wall</span>`
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
      <div class="card-details" id="details-${steamId}">
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
        <div class="notes-section" id="notes-${steamId}"></div>
      </div>
      <div class="card-actions">
        <a href="${profileUrl}" target="_blank" rel="noopener" class="card-action-btn profile-link-btn"><svg class="icon" aria-hidden="true"><use href="#icon-link"></use></svg> Профиль</a>
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
  // Делегируем клики на оба контейнера колонок
  ['bannedCards', 'cleanCards'].forEach(containerId => {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.addEventListener('click', (e) => {
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

      // Клик по ссылке/кнопке — не раскрываем карточку
      if (e.target.closest('a, button')) return;

      // Клик по карточке → раскрытие деталей
      const card = e.target.closest('.profile-card');
      if (card) {
        const steamId = card.dataset.steamId;
        const details = document.getElementById(`details-${steamId}`);
        const nameEl = card.querySelector('.card-name');
        if (details) {
          details.classList.toggle('visible');
          if (nameEl) nameEl.classList.toggle('expanded');
          // Рендерим заметки при раскрытии
          if (details.classList.contains('visible')) {
            renderNotes(steamId);
          }
        }
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

    // Обновляем состояние во всех массивах
    const updateProfile = (arr) => {
      const p = arr.find(x => x.steam_id === steamId);
      if (p) {
        p.isFavorite = data.isFavorite;
        if (data.notesDeleted) p.notes = [];
      }
    };
    updateProfile(allBannedProfilesUnfiltered);
    updateProfile(allCleanProfilesUnfiltered);
    updateProfile(allBannedProfiles);
    updateProfile(allCleanProfiles);

    // Обновляем звёздочку в DOM
    const star = document.querySelector(`.card-fav-btn[data-steam-id="${steamId}"]`);
    if (star) {
      star.classList.toggle('active', data.isFavorite);
    }

    // Скрываем карандаш если заметки удалены
    if (data.notesDeleted) {
      const pencil = document.querySelector(`.card-pencil[data-steam-id="${steamId}"]`);
      if (pencil) pencil.style.display = 'none';
      // Удаляем заметки из DOM
      const notesContainer = document.getElementById(`notes-${steamId}`);
      if (notesContainer) notesContainer.innerHTML = '';
    }

    showNotification(data.isFavorite ? 'Добавлено в избранное' : 'Удалено из избранного', 'success');
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

    // Обновляем профиль в массивах
    const updateProfile = (arr) => {
      const p = arr.find(x => x.steam_id === steamId);
      if (p) {
        p.notes = p.notes || [];
        p.notes.push({ id: data.noteId, text, created_at: Date.now(), updated_at: Date.now() });
        p.isFavorite = true;
      }
    };
    updateProfile(allBannedProfilesUnfiltered);
    updateProfile(allCleanProfilesUnfiltered);
    updateProfile(allBannedProfiles);
    updateProfile(allCleanProfiles);

    // Обновляем звёздочку (могла стать активной из-за авто-добавления)
    const star = document.querySelector(`.card-fav-btn[data-steam-id="${steamId}"]`);
    if (star) star.classList.add('active');

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
async function editNote(noteId, steamId) {
  const noteEl = document.querySelector(`.note-text[data-note-id="${noteId}"]`);
  if (!noteEl) return;

  const currentText = noteEl.textContent;
  const newText = prompt('Редактировать заметку:', currentText);
  if (newText === null || !newText.trim()) return;

  try {
    const res = await fetch(`/api/cheater-checker/notes/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      showNotification(data.error || 'Ошибка', 'error');
      return;
    }

    // Обновляем в массивах
    const updateProfile = (arr) => {
      const p = arr.find(x => x.steam_id === steamId);
      if (p && p.notes) {
        const note = p.notes.find(n => n.id === noteId);
        if (note) {
          note.text = newText.trim();
          note.updated_at = Date.now();
        }
      }
    };
    updateProfile(allBannedProfilesUnfiltered);
    updateProfile(allCleanProfilesUnfiltered);
    updateProfile(allBannedProfiles);
    updateProfile(allCleanProfiles);

    renderNotes(steamId);
    showNotification('Заметка обновлена', 'success');
  } catch (err) {
    showNotification('Ошибка соединения', 'error');
  }
}

/**
 * Удалить заметку
 */
async function deleteNote(noteId, steamId) {
  if (!confirm('Удалить заметку?')) return;

  try {
    const res = await fetch(`/api/cheater-checker/notes/${noteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      showNotification(data.error || 'Ошибка', 'error');
      return;
    }

    // Обновляем в массивах
    const updateProfile = (arr) => {
      const p = arr.find(x => x.steam_id === steamId);
      if (p && p.notes) {
        p.notes = p.notes.filter(n => n.id !== noteId);
      }
    };
    updateProfile(allBannedProfilesUnfiltered);
    updateProfile(allCleanProfilesUnfiltered);
    updateProfile(allBannedProfiles);
    updateProfile(allCleanProfiles);

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
function renderNotes(steamId) {
  const container = document.getElementById(`notes-${steamId}`);
  if (!container) return;

  const profile = [...allBannedProfilesUnfiltered, ...allCleanProfilesUnfiltered, ...allBannedProfiles, ...allCleanProfiles]
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
      <input type="text" class="note-input" id="note-input-${steamId}" placeholder="Добавить заметку..." onkeydown="if(event.key==='Enter')addNote('${steamId}')">
      <button class="note-save-btn" onclick="addNote('${steamId}')">Сохранить</button>
    </div>
  `;

  container.innerHTML = html;
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
