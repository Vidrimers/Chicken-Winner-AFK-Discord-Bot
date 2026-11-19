/**
 * Rich Message: Главное меню
 */

import { buildButtonRow } from '../rich-message.js';

// Единый источник кнопок — генерируем и rich message, и inline keyboard
export const MENU_ROWS = [
  [['🎤 Кто в канале', 'menu_voice'], ['👥 Кто онлайн', 'menu_online']],
  [['🔍 Чекер читеров', 'menu_checker'], ['🤖 Автоответчик', 'menu_steam_wall']],
  [['🐛 Багрепорт', 'menu_bugreport'], ['⚙️ Настройки', 'menu_settings']],
  [['📊 Steam/Faceit статистика', 'menu_stats']],
];

/**
 * Сгенерировать HTML главного меню для Rich Message
 * @param {string} username
 * @returns {string} HTML
 */
export function buildMainMenuRichHtml(username) {
  const rowsHtml = MENU_ROWS.map(row => buildButtonRow(row)).join('\n');

  return `<h2>📱 Главное меню</h2>
<p>Привет, <b>${escapeHtml(username)}</b>!</p>
${rowsHtml}`;
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
