/**
 * Rich Message: Багрепорт
 */

import { buildButtonRow } from '../rich-message.js';

/**
 * Сгенерировать HTML меню багрепорта для Rich Message
 * @returns {string} HTML
 */
export function buildBugReportRichHtml() {
  return `<h2>🐛 Багрепорт</h2>
<p>Выберите действие:</p>

${buildButtonRow([['📋 Мои багрепорты', 'bugreport_my', 'primary']])}
${buildButtonRow([['✍️ Написать багрепорт', 'bugreport_write', 'success']])}
${buildButtonRow([['◀️ Назад', 'back_to_menu', 'link']], 'center')}`;
}

/**
 * Inline keyboard: багрепорт (fallback)
 */
export function buildBugReportInlineKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📋 Мои багрепорты', callback_data: 'bugreport_my' }],
      [{ text: '✍️ Написать багрепорт', callback_data: 'bugreport_write' }],
      [{ text: '◀️ Назад', callback_data: 'back_to_menu' }]
    ]
  };
}
