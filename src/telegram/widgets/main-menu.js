/**
 * Rich Message: Главное меню
 */

import { buildButtonRow } from '../rich-message.js';

// Единый источник кнопок — генерируем и rich message, и inline keyboard
// Формат: [текст, callback_data, стиль для rich]
export const MENU_ROWS = [
  [['🎤 Кто в канале', 'menu_voice', 'primary'], ['👥 Кто онлайн', 'menu_online', 'primary']],
  [['🔍 Чекер читеров', 'menu_checker', 'primary'], ['🤖 Автоответчик', 'menu_steam_wall', 'link']],
  [['🐛 Багрепорт', 'menu_bugreport', 'link'], ['⚙️ Настройки', 'menu_settings', 'link']],
  [['📊 Steam/Faceit статистика', 'menu_stats', 'success']],
];

/**
 * Сгенерировать HTML виджет главного меню (Bot API 10.4)
 * @param {string} username
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
  .header { text-align: center; margin-bottom: 20px; }
  .title { font-size: 20px; font-weight: 700; color: var(--tg-theme-hint-color, #888); }
  .subtitle { font-size: 14px; color: var(--tg-theme-hint-color, #888); margin-top: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 14px 12px; border: none; border-radius: 12px;
    font-size: 14px; font-weight: 600; cursor: pointer;
    color: var(--tg-theme-button-text-color, #fff);
    background: var(--tg-theme-button-color, #667eea);
    transition: opacity 0.2s, transform 0.1s;
    -webkit-tap-highlight-color: transparent; user-select: none;
  }
  .btn:active { opacity: 0.8; transform: scale(0.97); }
  .btn.full { grid-column: 1 / -1; }
  .btn.secondary { background: var(--tg-theme-secondary-bg-color, #f0f0f0); color: var(--tg-theme-text-color, #000); }
  .btn .icon { font-size: 18px; line-height: 1; }
  .footer { text-align: center; margin-top: 16px; font-size: 12px; color: var(--tg-theme-hint-color, #888); opacity: 0.6; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">📱 Главное меню</div>
    <div class="subtitle">Привет, ${escapeHtml(username)}!</div>
  </div>
  <div class="grid">
    <button class="btn" onclick="TelegramWidget.request('menu_voice')"><span class="icon">🎤</span> Кто в канале</button>
    <button class="btn" onclick="TelegramWidget.request('menu_online')"><span class="icon">👥</span> Кто онлайн</button>
  </div>
  <div class="grid">
    <button class="btn full" onclick="TelegramWidget.request('menu_checker')"><span class="icon">🔍</span> Чекер читеров</button>
    <button class="btn secondary" onclick="TelegramWidget.request('menu_steam_wall')"><span class="icon">🤖</span> Автоответчик</button>
    <button class="btn secondary" onclick="TelegramWidget.request('menu_settings')"><span class="icon">⚙️</span> Настройки</button>
  </div>
  <div class="grid">
    <button class="btn full" onclick="TelegramWidget.request('menu_stats')"><span class="icon">📊</span> Steam/Faceit статистика</button>
    <button class="btn secondary" onclick="TelegramWidget.request('menu_bugreport')"><span class="icon">🐛</span> Багрепорт</button>
    <button class="btn secondary" onclick="TelegramWidget.request('open_site')"><span class="icon">🌐</span> Сайт</button>
  </div>
  <div class="footer">Выберите действие</div>
</body>
</html>`;
}

/**
 * Сгенерировать HTML главного меню для Rich Message
 * @param {string} username
 * @param {string} discordId — Discord ID для отображения
 * @param {string} siteUrl — URL сайта
 * @returns {string} HTML
 */
export function buildMainMenuRichHtml(username, discordId = '', siteUrl = '') {
  const rowsHtml = MENU_ROWS.map(row => buildButtonRow(row)).join('\n');
  const idLine = discordId ? `\n<code>${discordId}</code>` : '';
  const siteButton = siteUrl
    ? `\n<tg-button-row align="center"><tg-button type="url" url="${escapeHtml(siteUrl)}">🌐 Открыть сайт</tg-button></tg-button-row>`
    : '';

  return `<h2>📱 Главное меню</h2>
<p>Привет, <b>${escapeHtml(username)}</b>!${idLine}</p>
${rowsHtml}${siteButton}`;
}

/**
 * Сгенерировать inline_keyboard из MENU_ROWS (fallback)
 * @returns {object} InlineKeyboardMarkup
 */
export function buildMainMenuInlineKeyboard(siteUrl) {
  const rows = MENU_ROWS.map(row =>
    row.map(([text, data]) => ({ text, callback_data: data }))
  );
  rows.push([{ text: '🌐 Открыть сайт', url: siteUrl }]);
  return { inline_keyboard: rows };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
