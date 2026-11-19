/**
 * Rich Message: Кто в канале / Кто онлайн
 */

import { buildButtonRow } from '../rich-message.js';

/**
 * Сгенерировать HTML "Кто в канале" для Rich Message
 * @param {string} message — HTML сообщения от хендлера
 * @returns {string} HTML
 */
export function buildVoiceActivityRichHtml(message) {
  return `<h2>🎤 Кто в канале</h2>
${message}`;
}

/**
 * Сгенерировать HTML "Кто онлайн" для Rich Message
 * @param {string} message — HTML сообщения от хендлера
 * @param {Array} members — [{ id, name }] онлайн-пользователи
 * @param {number} page — текущая страница
 * @param {number} totalPages — всего страниц
 * @param {number} pageSize — размер страницы
 * @returns {string} HTML
 */
export function buildOnlineUsersRichHtml(message, members, page, totalPages, pageSize) {
  let html = `<h2>👥 Кто онлайн</h2>
${message}\n`;

  if (members.length > 0) {
    const start = page * pageSize;
    const pageMembers = members.slice(start, start + pageSize);

    // Кнопки пользователей по 2 в ряд
    for (let i = 0; i < pageMembers.length; i += 2) {
      const row = pageMembers.slice(i, i + 2).map(m => [
        `💬 ${m.name}`, `on:${m.id}`, 'link'
      ]);
      html += buildButtonRow(row) + '\n';
    }

    // Навигация
    const navButtons = [];
    if (page > 0) navButtons.push(['◀️', `onp:${page - 1}`, 'link']);
    if (page < totalPages - 1) navButtons.push(['▶️', `onp:${page + 1}`, 'link']);
    if (navButtons.length) html += buildButtonRow(navButtons) + '\n';
  }

  html += buildButtonRow([['◀️ Назад', 'back_to_menu', 'link']], 'center');
  return html;
}

/**
 * Inline keyboard: онлайн-пользователи (fallback)
 */
export function buildOnlineUsersInlineKeyboard(members, page, totalPages, pageSize) {
  const rows = [];
  const start = page * pageSize;
  const pageMembers = members.slice(start, start + pageSize);

  for (const m of pageMembers) {
    rows.push([{ text: `💬 ${m.name}`, callback_data: `on:${m.id}` }]);
  }

  const navRow = [];
  if (page > 0) navRow.push({ text: '◀️', callback_data: `onp:${page - 1}` });
  if (page < totalPages - 1) navRow.push({ text: '▶️', callback_data: `onp:${page + 1}` });
  if (navRow.length) rows.push(navRow);

  rows.push([{ text: '◀️ Назад', callback_data: 'back_to_menu' }]);
  return { inline_keyboard: rows };
}
