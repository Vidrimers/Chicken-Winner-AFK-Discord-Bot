/**
 * Telegram Rich Message Helper
 * Работа с Rich Messages (Bot API 10.3+) напрямую через HTTP API.
 * Кнопки <tg-button> внутри текста — средний вариант между виджетами и inline-клавиатурой.
 */

const API_BASE = 'https://api.telegram.org';

/**
 * Отправить Rich Message
 * @param {string} token
 * @param {number|string} chatId
 * @param {string} html — HTML rich message
 * @param {object} options — { caption, reply_markup }
 * @returns {Promise<boolean>} true если успешно
 */
export async function sendRichMessage(token, chatId, html, options = {}) {
  try {
    const body = {
      chat_id: chatId,
      rich_message: { html },
    };
    if (options.reply_markup) body.reply_markup = options.reply_markup;
    if (options.caption) body.caption = options.caption;

    const res = await fetch(`${API_BASE}/bot${token}/sendRichMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!json.ok) {
      console.error(`[RichMessage] Ошибка: ${json.description}`);
      return false;
    }

    console.log(`[RichMessage] Отправлено в chat_id: ${chatId}`);
    return true;
  } catch (err) {
    console.error(`[RichMessage] Exception: ${err.message}`);
    return false;
  }
}

/**
 * Сгенерировать <tg-button-row> из массива кнопок
 * @param {Array<[string, string, string?]>} buttons — [[текст, data, style?], ...]
 * @param {string} align — left|center|right
 * @returns {string} HTML
 */
export function buildButtonRow(buttons, align = 'center') {
  const btns = buttons.map(([text, data, style]) => {
    const styleAttr = style ? ` style="${style}"` : '';
    return `<tg-button type="callback_data" data="${escapeHtml(data)}"${styleAttr}>${escapeHtml(text)}</tg-button>`;
  }).join('');
  return `<tg-button-row align="${align}">${btns}</tg-button-row>`;
}

/**
 * Сгенерировать inline_keyboard из того же массива кнопок (fallback)
 * @param {Array<Array<[string, string, string?]>>} rows — [[ [текст, data, style?], ... ], ...]
 * @returns {object} InlineKeyboardMarkup
 */
export function buildInlineKeyboard(rows) {
  return {
    inline_keyboard: rows.map(row =>
      row.map(([text, data]) => ({ text, callback_data: data }))
    )
  };
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
