/**
 * Rich Message: Чекер читеров
 */

import { buildButtonRow } from '../rich-message.js';

/**
 * Сгенерировать HTML меню чекера для Rich Message
 * @param {boolean} isAdmin — показывать ли CheatWatcher
 * @returns {string} HTML
 */
export function buildCheckerRichHtml(isAdmin) {
  const adminButton = isAdmin
    ? buildButtonRow([['🔍 CheatWatcher', 'cw_qr_start', 'link']])
    : '';

  return `<h2>🔍 Чекер читеров</h2>
<p>Выберите действие:</p>

${buildButtonRow([['📋 Мои добавленные', 'checker_my_added', 'primary']])}
${buildButtonRow([['🔎 Проверить читера', 'checker_check', 'primary']])}
${buildButtonRow([['🤖 Добавить бота', 'checker_add_bot', 'success']])}
${adminButton}
${buildButtonRow([['◀️ Назад', 'back_to_menu', 'link']], 'center')}`;
}

/**
 * Inline keyboard: меню чекера (fallback)
 */
export function buildCheckerInlineKeyboard(isAdmin) {
  return {
    inline_keyboard: [
      [{ text: '📋 Мои добавленные', callback_data: 'checker_my_added' }],
      [{ text: '🔎 Проверить читера', callback_data: 'checker_check' }],
      [{ text: '🤖 Добавить бота', callback_data: 'checker_add_bot' }],
      ...(isAdmin ? [[{ text: '🔍 CheatWatcher', callback_data: 'cw_qr_start' }]] : []),
      [{ text: '◀️ Назад', callback_data: 'back_to_menu' }]
    ]
  };
}
