/**
 * Rich Message: Автоответчик Steam (steam-wall)
 */

import { buildButtonRow } from '../rich-message.js';

/**
 * Сгенерировать HTML меню автоответчика для Rich Message
 * @param {object} s — { isActive, hasToken, siteUrl }
 * @returns {string} HTML
 */
export function buildSteamWallRichHtml(s) {
  const activeText = s.isActive ? '✅ Включён' : '❌ Выключен';
  const tokenText = s.hasToken ? '✅ Токен есть' : '❌ Нет токена';

  return `<h2>🤖 Автоответчик Steam</h2>
<p>Управление ботом, который отвечает на комментарии в стене вашего профиля.</p>

${buildButtonRow([[`🤖 Бот: ${activeText}`, 'sw_toggle', s.isActive ? 'success' : 'danger']])}
${buildButtonRow([[`🔑 Токен: ${tokenText}`, 'sw_token_info', s.hasToken ? 'success' : 'danger']])}
${buildButtonRow([
  ['💬 Фразы', 'sw_phrases', 'link'],
  ['👥 Пользователи', 'sw_targets', 'link']
])}
${buildButtonRow([['📋 Последние ответы', 'sw_logs', 'link']])}
${s.siteUrl ? buildButtonRow([[`🌐 Настроить на сайте`, 'sw_open_site', 'link']]) : ''}
${buildButtonRow([['◀️ Назад', 'back_to_menu', 'link']], 'center')}`;
}

/**
 * Inline keyboard: автоответчик (fallback)
 */
export function buildSteamWallInlineKeyboard(s) {
  const activeText = s.isActive ? '✅ Включён' : '❌ Выключен';
  const tokenText = s.hasToken ? '✅ Токен есть' : '❌ Нет токена';

  return {
    inline_keyboard: [
      [{ text: `🤖 Бот: ${activeText}`, callback_data: 'sw_toggle' }],
      [{ text: `🔑 Токен: ${tokenText}`, callback_data: 'sw_token_info' }],
      [
        { text: '💬 Фразы', callback_data: 'sw_phrases' },
        { text: '👥 Пользователи', callback_data: 'sw_targets' }
      ],
      [{ text: '📋 Последние ответы', callback_data: 'sw_logs' }],
      [{ text: '🌐 Настроить на сайте', url: `${s.siteUrl}/steam-wall.html` }],
      [{ text: '◀️ Назад', callback_data: 'back_to_menu' }]
    ]
  };
}
