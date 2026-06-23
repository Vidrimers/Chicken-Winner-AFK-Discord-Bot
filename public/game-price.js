(function () {
  'use strict';

  // ===== CONFIG =====
  const API_BASE = '/api/game-prices';
  const DEBOUNCE_MS = 400;
  const RECENT_KEY = 'gp_recent_games';
  const SETTINGS_KEY = 'gp_settings';
  const MAX_RECENT = 20;

  let currentUserId = null;
  let searchTimer = null;
  let favoriteSlugs = new Set();
  let currentGameSlug = null;
  let currentSubTab = 'popular';

  // ===== HELPERS =====
  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function getRecent() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    } catch {
      return [];
    }
  }

  function addRecent(slug, title, hg_link) {
    let recent = getRecent();
    recent = recent.filter((r) => r.slug !== slug);
    recent.unshift({ slug, title, hg_link });
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  }

  function showToast(text) {
    const toast = document.getElementById('gpToast');
    const toastText = document.getElementById('gpToastText');
    toastText.textContent = text;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2000);
  }

  function getUserId() {
    if (currentUserId) return currentUserId;
    try {
      const auth = localStorage.getItem('auth_user');
      if (auth) {
        const user = JSON.parse(auth);
        currentUserId = user.id || user.user_id;
      }
    } catch {}
    if (!currentUserId) {
      currentUserId = 'guest_' + Math.random().toString(36).slice(2, 10);
    }
    return currentUserId;
  }

  // ===== API =====
  async function apiGet(path) {
    const res = await fetch(API_BASE + path);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }

  async function apiDelete(path) {
    const res = await fetch(API_BASE + path, { method: 'DELETE' });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }

  // ===== FAVORITES =====
  async function loadFavorites() {
    try {
      const userId = getUserId();
      const data = await apiGet(`/favorites?user_id=${userId}`);
      favoriteSlugs = new Set(data.map((f) => f.game_slug));
      updateAllFavButtons();
    } catch {}
  }

  async function toggleFavorite(slug) {
    const userId = getUserId();
    if (favoriteSlugs.has(slug)) {
      await apiDelete(`/favorites/${slug}?user_id=${userId}`);
      favoriteSlugs.delete(slug);
      showToast('Удалено из избранного');
    } else {
      await apiPost('/favorites', { user_id: userId, game_slug: slug });
      favoriteSlugs.add(slug);
      showToast('Добавлено в избранное');
    }
    updateAllFavButtons();
  }

  function updateAllFavButtons() {
    document.querySelectorAll('.gp-fav-btn[data-slug]').forEach((btn) => {
      const slug = btn.dataset.slug;
      btn.classList.toggle('active', favoriteSlugs.has(slug));
    });
    const modalBtn = document.getElementById('gpModalFavBtn');
    if (modalBtn && currentGameSlug) {
      modalBtn.classList.toggle('active', favoriteSlugs.has(currentGameSlug));
    }
  }

  // ===== RENDER =====
  function renderGameCard(game) {
    const isFav = favoriteSlugs.has(game.slug);
    const minPrice = game._minPrice != null ? game._minPrice : null;

    const card = document.createElement('div');
    card.className = 'gp-game-card';
    card.dataset.slug = game.slug;
    card.innerHTML = `
      <button class="gp-fav-btn ${isFav ? 'active' : ''}" data-slug="${game.slug}" title="В избранное">★</button>
      <img class="gp-game-card-poster" src="${game.poster || '/avatars/nopic.png'}" alt="${game.title}" loading="lazy" />
      <div class="gp-game-card-info">
        <p class="gp-game-card-title">${game.title}</p>
        ${minPrice != null && minPrice < Infinity ? `<p class="gp-game-card-price">от ${minPrice} ₽</p>` : ''}
      </div>
    `;

    card.querySelector('.gp-fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(game.slug);
    });

    card.addEventListener('click', () => openGameModal(game.slug, game.title, game.hg_link));
    return card;
  }

  function renderGrid(container, games) {
    container.innerHTML = '';
    if (!games || games.length === 0) return;
    const fragment = document.createDocumentFragment();
    games.forEach((g) => fragment.appendChild(renderGameCard(g)));
    container.appendChild(fragment);
  }

  async function loadPosters(slugs) {
    if (!slugs || slugs.length === 0) return;
    try {
      const data = await apiGet(`/posters?slugs=${slugs.join(',')}`);
      for (const [slug, poster] of Object.entries(data)) {
        const imgs = document.querySelectorAll(`.gp-game-card[data-slug="${slug}"] .gp-game-card-poster`);
        imgs.forEach(img => { img.src = poster; });
      }
    } catch {}
  }

  function showSkeleton(show) {
    document.getElementById('gpSkeleton').style.display = show ? 'grid' : 'none';
  }

  function showEmpty(text) {
    const el = document.getElementById('gpEmptyState');
    document.getElementById('gpEmptyText').textContent = text;
    el.style.display = 'block';
  }

  function hideEmpty() {
    document.getElementById('gpEmptyState').style.display = 'none';
  }

  // ===== SEARCH =====
  async function doSearch(query) {
    const skeleton = document.getElementById('gpSkeleton');
    const subtabs = document.getElementById('gpSubtabs');
    const resultsSection = document.getElementById('gpResultsSection');

    if (!query || query.trim().length < 2) {
      skeleton.style.display = 'none';
      subtabs.style.display = 'flex';
      document.getElementById('subtab-popular').classList.toggle('active', currentSubTab === 'popular');
      document.getElementById('subtab-recent').classList.toggle('active', currentSubTab === 'recent');
      resultsSection.style.display = 'none';
      hideEmpty();
      return;
    }

    showSkeleton(true);
    subtabs.style.display = 'none';
    document.getElementById('subtab-popular').classList.remove('active');
    document.getElementById('subtab-recent').classList.remove('active');
    resultsSection.style.display = 'none';
    hideEmpty();

    try {
      const sort = document.getElementById('gpSort').value;
      const platform = document.getElementById('gpPlatform').value;
      let url = `/search?q=${encodeURIComponent(query)}`;
      if (sort) url += `&sort=${sort}`;
      if (platform) url += `&platform=${platform}`;

      const results = await apiGet(url);
      showSkeleton(false);

      if (results.length === 0) {
        showEmpty('Нет результатов поиска');
        return;
      }

      document.getElementById('gpResultsTitle').textContent = `Результаты (${results.length})`;
      renderGrid(document.getElementById('gpResultsGrid'), results);
      resultsSection.style.display = 'block';
      loadPosters(results.map(g => g.slug).filter(Boolean));
    } catch (err) {
      showSkeleton(false);
      showEmpty('Ошибка поиска');
    }
  }

  // ===== POPULAR =====
  async function loadPopular() {
    try {
      const games = await apiGet('/popular');
      if (games.length > 0) {
        renderGrid(document.getElementById('gpPopularGrid'), games);
        loadPosters(games.map(g => g.slug).filter(Boolean));
      }
    } catch {}
  }

  // ===== RECENT =====
  function loadRecent() {
    const recent = getRecent();
    const grid = document.getElementById('gpRecentGrid');
    const empty = document.getElementById('gpRecentEmpty');

    grid.innerHTML = '';
    if (recent.length === 0) {
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    const fragment = document.createDocumentFragment();
    recent.forEach((r) => {
      fragment.appendChild(renderGameCard({ slug: r.slug, title: r.title, hg_link: r.hg_link }));
    });
    grid.appendChild(fragment);
  }

  // ===== FAVORITES TAB =====
  async function loadFavoritesTab() {
    const grid = document.getElementById('gpFavoritesGrid');
    const empty = document.getElementById('gpFavEmptyState');

    try {
      const userId = getUserId();
      const favs = await apiGet(`/favorites?user_id=${userId}`);
      if (favs.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
      }
      empty.style.display = 'none';
      renderGrid(grid, favs);
      loadPosters(favs.map(f => f.slug).filter(Boolean));
    } catch {
      grid.innerHTML = '';
      empty.style.display = 'block';
    }
  }

  // ===== GAME MODAL =====
  async function openGameModal(slug, title, hgLink) {
    currentGameSlug = slug;
    const modal = document.getElementById('gpGameModal');
    const body = document.getElementById('gpModalBody');

    document.getElementById('gpModalTitle').textContent = title || slug;
    document.getElementById('gpModalPoster').src = '';
    document.getElementById('gpModalMeta').innerHTML = '';
    document.getElementById('gpModalScreenshots').innerHTML = '';
    document.getElementById('gpModalPrices').innerHTML = '<p style="opacity:0.5">Загрузка цен...</p>';
    document.getElementById('gpModalChart').innerHTML = '';
    const hgLinkRu = hgLink
      ? hgLink.replace('hot.game/en/', 'hot.game/ru-kz/').replace('hot.game/uk-ua/', 'hot.game/ru-kz/')
      : `https://hot.game/ru-kz/game/${slug}`;
    document.getElementById('gpModalHgLink').href = hgLinkRu;

    const favBtn = document.getElementById('gpModalFavBtn');
    favBtn.classList.toggle('active', favoriteSlugs.has(slug));
    favBtn.onclick = () => toggleFavorite(slug);

    document.getElementById('gpModalShareBtn').onclick = () => {
      const url = window.location.origin + '/game-price.html?game=' + slug;
      navigator.clipboard.writeText(url).then(() => showToast('Ссылка скопирована'));
    };

    modal.style.display = 'block';

    // Save to recent
    addRecent(slug, title, hgLink);

    // Load game data
    try {
      const currency = document.getElementById('gpCurrency').value;
      const game = await apiGet(`/game/${slug}?currency=${currency}`);

      document.getElementById('gpModalTitle').textContent = game.title || slug;
      if (game.poster) {
        document.getElementById('gpModalPoster').src = game.poster;
      }

      // Meta
      const meta = [];
      if (game.release_date) meta.push(`📅 ${game.release_date}`);
      if (game.alt_title) meta.push(`aka "${game.alt_title}"`);
      if (game.description) meta.push(game.description);
      document.getElementById('gpModalMeta').innerHTML = meta.join('<br>');

      // Screenshots
      if (game.screenshots && game.screenshots.length > 0) {
        const slider = document.getElementById('gpModalScreenshots');
        game.screenshots.forEach((src) => {
          const img = document.createElement('img');
          img.className = 'gp-screenshot';
          img.src = src;
          img.loading = 'lazy';
          slider.appendChild(img);
        });
      }

      // Prices
      if (game.prices && game.prices.length > 0) {
        const selectedRegion = document.getElementById('gpRegion').value;
        let prices = game.prices;

        if (selectedRegion && selectedRegion !== 'all') {
          const filtered = prices.filter((p) => p.region === selectedRegion);
          if (filtered.length > 0) prices = filtered;
        }

        const pricesHtml = prices
          .sort((a, b) => (a.price || 0) - (b.price || 0))
          .map(
            (p) => `
            <div class="gp-price-row">
              <span class="gp-price-platform">${p.platform || ''}</span>
              <span>
                <span class="gp-price-value">${p.price != null ? p.price + ' ' + (p.currency || '') : '—'}</span>
                ${p.discount > 0 ? `<span class="gp-price-discount">-${p.discount}%</span>` : ''}
              </span>
            </div>
          `
          )
          .join('');

        document.getElementById('gpModalPrices').innerHTML =
          `<p class="gp-prices-title">Цены</p>${pricesHtml}`;
      } else {
        document.getElementById('gpModalPrices').innerHTML = '<p style="opacity:0.5">Цены не найдены</p>';
      }

      // Price history chart
      if (game.priceHistory && game.priceHistory.length > 1) {
        renderChart(game.priceHistory);
      }
    } catch (err) {
      document.getElementById('gpModalPrices').innerHTML = '<p style="opacity:0.5">Ошибка загрузки</p>';
    }
  }

  function closeGameModal() {
    document.getElementById('gpGameModal').style.display = 'none';
    currentGameSlug = null;
    loadRecent();
  }

  // ===== CHART =====
  function renderChart(history) {
    const container = document.getElementById('gpModalChart');
    if (!history || history.length < 2) {
      container.innerHTML = '';
      return;
    }

    const prices = history.map((h) => h.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const w = 400;
    const h = 100;

    const points = history.map((p, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - ((p.price - min) / range) * h;
      return `${x},${y}`;
    });

    container.innerHTML = `
      <p class="gp-chart-title">История цен</p>
      <svg class="gp-chart-canvas" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <polyline fill="none" stroke="#667eea" stroke-width="2" points="${points.join(' ')}" />
      </svg>
    `;
  }

  // ===== TABS =====
  function initTabs() {
    document.querySelectorAll('.gp-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.gp-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.gp-tab-content').forEach((c) => c.classList.remove('active'));

        tab.classList.add('active');
        const target = document.getElementById('tab-' + tab.dataset.tab);
        if (target) target.classList.add('active');

        if (tab.dataset.tab === 'favorites') {
          loadFavoritesTab();
        }
      });
    });
  }

  // ===== SUB-TABS (Популярные / Недавно просмотренные) =====
  function initSubtabs() {
    document.querySelectorAll('.gp-subtab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.subtab;
        if (tab === currentSubTab) return;
        currentSubTab = tab;

        document.querySelectorAll('.gp-subtab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.gp-subtab-content').forEach((c) => c.classList.remove('active'));

        btn.classList.add('active');
        const target = document.getElementById('subtab-' + tab);
        if (target) target.classList.add('active');
      });
    });
  }

  // ===== SETTINGS =====
  function initSettings() {
    const settings = getSettings();
    const region = document.getElementById('gpRegion');
    const currency = document.getElementById('gpCurrency');

    if (settings.region) region.value = settings.region;
    if (settings.currency) currency.value = settings.currency;

    region.addEventListener('change', () => {
      saveSettings({ ...getSettings(), region: region.value });
    });
    currency.addEventListener('change', () => {
      saveSettings({ ...getSettings(), currency: currency.value });
    });
  }

  // ===== EVENT LISTENERS =====
  function init() {
    initTabs();
    initSubtabs();
    initSettings();
    loadFavorites();
    loadPopular();
    loadRecent();

    const searchInput = document.getElementById('gpSearchInput');
    const searchClear = document.getElementById('gpSearchClearBtn');
    const sortSelect = document.getElementById('gpSort');
    const platformSelect = document.getElementById('gpPlatform');

    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchClear.classList.toggle('visible', searchInput.value.length > 0);
      searchTimer = setTimeout(() => doSearch(searchInput.value), DEBOUNCE_MS);
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.classList.remove('visible');
      doSearch('');
      searchInput.focus();
    });

    sortSelect.addEventListener('change', () => doSearch(searchInput.value));
    platformSelect.addEventListener('change', () => doSearch(searchInput.value));

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeGameModal();
    });

    // URL params
    const params = new URLSearchParams(window.location.search);
    const gameParam = params.get('game');
    if (gameParam) {
      openGameModal(gameParam);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for onclick handlers
  window.openGameModal = openGameModal;
  window.closeGameModal = closeGameModal;
})();
