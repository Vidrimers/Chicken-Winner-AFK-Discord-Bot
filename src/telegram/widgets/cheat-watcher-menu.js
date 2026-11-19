/**
 * Rich Message: CheatWatcher (admin)
 */

import { buildButtonRow } from '../rich-message.js';

/**
 * Сгенерировать HTML CheatWatcher для Rich Message
 * @param {object} s — { isConnected, steamId, hasToken }
 * @returns {string} HTML
 */
export function buildCheatWatcherRichHtml(s) {
  if (s.isConnected) {
    return `<h2>🔍 CheatWatcher</h2>
<p>✅ Уже подключён</p>
<p>SteamID: <code>${s.steamId || '—'}</code></p>
<p>Для переподключения используйте кнопку ниже.</p>
${buildButtonRow([['🔄 Переподключить', 'cw_qr_reconnect', 'primary']], 'center')}
${buildButtonRow([['◀️ Назад', 'back_to_menu', 'link']], 'center')}`;
  }

  const statusText = s.hasToken ? 'Токен установлен, не подключён' : 'Не настроен';

  return `<h2>🔍 CheatWatcher</h2>
<p>Статус: ${statusText}</p>
<p>Подключите аккаунт TheCheatWatcher для публикации комментариев в профилях читеров.</p>
${buildButtonRow([['📱 Подключить через QR', 'cw_qr_start', 'primary']], 'center')}
${buildButtonRow([['◀️ Назад', 'back_to_menu', 'link']], 'center')}`;
}

/**
 * Inline keyboard: CheatWatcher (fallback)
 */
export function buildCheatWatcherInlineKeyboard(s) {
  if (s.isConnected) {
    return {
      inline_keyboard: [
        [{ text: '🔄 Переподключить', callback_data: 'cw_qr_reconnect' }],
        [{ text: '◀️ Назад', callback_data: 'back_to_menu' }]
      ]
    };
  }

  return {
    inline_keyboard: [
      [{ text: '📱 Подключить через QR', callback_data: 'cw_qr_start' }],
      [{ text: '◀️ Назад', callback_data: 'back_to_menu' }]
    ]
  };
}
