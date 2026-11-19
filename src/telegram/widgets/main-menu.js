/**
 * Виджет: Главное меню
 */

/**
 * Сгенерировать HTML главного меню
 * @param {string} username — имя пользователя
 * @returns {string} HTML
 */
export function buildMainMenuWidget(username) {
  return `<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--tg-theme-bg-color, #fff);
    color: var(--tg-theme-text-color, #000);
    padding: 16px;
    min-height: 100vh;
  }
  .header {
    text-align: center;
    margin-bottom: 20px;
  }
  .title {
    font-size: 20px;
    font-weight: 700;
    color: var(--tg-theme-hint-color, #888);
  }
  .subtitle {
    font-size: 14px;
    color: var(--tg-theme-hint-color, #888);
    margin-top: 4px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
  }
  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 12px;
    border: none;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    color: var(--tg-theme-button-text-color, #fff);
    background: var(--tg-theme-button-color, #667eea);
    transition: opacity 0.2s, transform 0.1s;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  .btn:active {
    opacity: 0.8;
    transform: scale(0.97);
  }
  .btn.full {
    grid-column: 1 / -1;
  }
  .btn.accent {
    background: var(--tg-theme-button-color, #667eea);
  }
  .btn.secondary {
    background: var(--tg-theme-secondary-bg-color, #f0f0f0);
    color: var(--tg-theme-text-color, #000);
  }
  .btn .icon {
    font-size: 18px;
    line-height: 1;
  }
  .divider {
    height: 1px;
    background: var(--tg-theme-hint-color, #e0e0e0);
    margin: 14px 0;
    opacity: 0.3;
  }
  .footer {
    text-align: center;
    margin-top: 16px;
    font-size: 12px;
    color: var(--tg-theme-hint-color, #888);
    opacity: 0.6;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="title">📱 Главное меню</div>
    <div class="subtitle">Привет, ${escapeHtml(username)}!</div>
  </div>

  <div class="grid">
    <button class="btn accent" onclick="TelegramWidget.request('menu_voice')">
      <span class="icon">🎤</span> Кто в канале
    </button>
    <button class="btn accent" onclick="TelegramWidget.request('menu_online')">
      <span class="icon">👥</span> Кто онлайн
    </button>
  </div>

  <div class="grid">
    <button class="btn accent full" onclick="TelegramWidget.request('menu_checker')">
      <span class="icon">🔍</span> Чекер читеров
    </button>
    <button class="btn secondary" onclick="TelegramWidget.request('menu_steam_wall')">
      <span class="icon">🤖</span> Автоответчик
    </button>
    <button class="btn secondary" onclick="TelegramWidget.request('menu_settings')">
      <span class="icon">⚙️</span> Настройки
    </button>
  </div>

  <div class="grid">
    <button class="btn accent full" onclick="TelegramWidget.request('menu_stats')">
      <span class="icon">📊</span> Steam/Faceit статистика
    </button>
    <button class="btn secondary" onclick="TelegramWidget.request('menu_bugreport')">
      <span class="icon">🐛</span> Багрепорт
    </button>
    <button class="btn secondary" onclick="TelegramWidget.request('open_site')">
      <span class="icon">🌐</span> Сайт
    </button>
  </div>

  <div class="footer">Выберите действие</div>
</body>
</html>`;
}

/**
 * Экранирование HTML
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
