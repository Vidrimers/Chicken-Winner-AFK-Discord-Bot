/**
 * Telegram Widget Helper
 * Работа с HTML Widgets (Bot API 10.4) напрямую через HTTP API.
 * node-telegram-bot-api не поддерживает виджеты — вызываем вручную.
 */

import zlib from 'zlib';

const API_BASE = 'https://api.telegram.org';

// Лимиты
const MAX_HTML_BYTES = 32768;
const MAX_COMPRESSED_BYTES = 4096;

/**
 * Проверить размер HTML виджета
 * @param {string} html
 * @returns {{ valid: boolean, htmlSize: number, compressedSize: number, errors: string[] }}
 */
export function checkWidgetSize(html) {
  const errors = [];
  const buf = Buffer.from(html, 'utf-8');
  const compressed = zlib.deflateSync(buf, { level: 9 });

  if (buf.length > MAX_HTML_BYTES) {
    errors.push(`HTML: ${buf.length} байт (макс. ${MAX_HTML_BYTES})`);
  }
  if (compressed.length > MAX_COMPRESSED_BYTES) {
    errors.push(`Zlib: ${compressed.length} байт (макс. ${MAX_COMPRESSED_BYTES})`);
  }

  return {
    valid: errors.length === 0,
    htmlSize: buf.length,
    compressedSize: compressed.length,
    errors,
  };
}

/**
 * Отправить HTML виджет
 * @param {string} token — токен бота
 * @param {number|string} chatId
 * @param {string} html — HTML виджета
 * @param {object} options — { allow_queries, data, ... }
 * @returns {Promise<object|null>} результат или null при ошибке
 */
export async function sendWidget(token, chatId, html, options = {}) {
  // Проверяем размер
  const sizeCheck = checkWidgetSize(html);
  if (!sizeCheck.valid) {
    console.error(`[Widget] Размер превышен: ${sizeCheck.errors.join(', ')}`);
    return null;
  }

  try {
    const body = {
      chat_id: chatId,
      html,
      allow_queries: options.allow_queries !== false,
    };
    if (options.data) body.data = options.data;
    if (options.reply_to_message_id) body.reply_to_message_id = options.reply_to_message_id;

    const res = await fetch(`${API_BASE}/bot${token}/sendWidget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!json.ok) {
      console.error(`[Widget] sendWidget ошибка: ${json.description}`);
      return null;
    }

    console.log(`[Widget] Отправлен виджет в chat_id: ${chatId}`);
    return json.result;
  } catch (err) {
    console.error(`[Widget] sendWidget exception: ${err.message}`);
    return null;
  }
}

/**
 * Ответить на запрос виджета
 * @param {string} token
 * @param {string} widgetQueryId
 * @param {object} data — данные для обновления виджета
 * @returns {Promise<boolean>}
 */
export async function answerWidgetQuery(token, widgetQueryId, data = {}) {
  try {
    const res = await fetch(`${API_BASE}/bot${token}/answerWidgetQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widget_query_id: widgetQueryId, ...data }),
    });
    const json = await res.json();
    return json.ok;
  } catch (err) {
    console.error(`[Widget] answerWidgetQuery exception: ${err.message}`);
    return false;
  }
}

/**
 * Обновить данные виджета в сообщении
 * @param {string} token
 * @param {number|string} chatId
 * @param {number} messageId
 * @param {string} html — новый HTML
 * @param {object} data — данные
 * @returns {Promise<boolean>}
 */
export async function editMessageWidgetData(token, chatId, messageId, html, data = {}) {
  const sizeCheck = checkWidgetSize(html);
  if (!sizeCheck.valid) {
    console.error(`[Widget] editMessageWidgetData размер: ${sizeCheck.errors.join(', ')}`);
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/bot${token}/editMessageWidgetData`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, html, ...data }),
    });
    const json = await res.json();
    return json.ok;
  } catch (err) {
    console.error(`[Widget] editMessageWidgetData exception: ${err.message}`);
    return false;
  }
}

/**
 * Обработать widget_query апдейт (вызывать ДО диспетчера библиотеки)
 * @param {object} update
 * @param {Function} handler — async (widgetQuery, html) => { html, data }
 * @returns {Promise<boolean>} true если обработан
 */
export async function handleWidgetQuery(update, handler) {
  if (!update.widget_query) return false;

  const wq = update.widget_query;
  try {
    const result = await handler(wq);
    return true;
  } catch (err) {
    console.error(`[Widget] handleWidgetQuery error: ${err.message}`);
    return false;
  }
}
