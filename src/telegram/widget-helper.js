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

// Автоблокировка при отказе Telegram (INPUT_MEDIA_WIDGET_NOT_ALLOWED)
// Повторная попытка автоматически через 6 часов
let widgetBlockedUntil = 0;
const BLOCK_DURATION_MS = 6 * 60 * 60 * 1000; // 6 часов

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
 * @param {object} options — { allow_queries, public_data, chat_data, caption, reply_parameters, ... }
 * @returns {Promise<object|null>} результат или null при ошибке
 */
export async function sendWidget(token, chatId, html, options = {}) {
  // Автоблокировка: Telegram не разрешает виджеты — не делаем запрос
  if (Date.now() < widgetBlockedUntil) return null;

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
    if (options.public_data !== undefined) body.public_data = options.public_data;
    if (options.chat_data !== undefined) body.chat_data = options.chat_data;
    if (options.caption) body.caption = options.caption;
    if (options.reply_parameters) body.reply_parameters = options.reply_parameters;

    const res = await fetch(`${API_BASE}/bot${token}/sendWidget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!json.ok) {
      if (String(json.description).includes('INPUT_MEDIA_WIDGET_NOT_ALLOWED')) {
        widgetBlockedUntil = Date.now() + BLOCK_DURATION_MS;
        console.warn('[Widget] Telegram не разрешает виджеты, пауза 6 часов');
      } else {
        console.error(`[Widget] sendWidget ошибка: ${json.description}`);
      }
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
 * @param {string} data — строка с данными (до 1024 байт)
 * @returns {Promise<boolean>}
 */
export async function answerWidgetQuery(token, widgetQueryId, data = '') {
  try {
    const body = { widget_query_id: widgetQueryId };
    if (data) body.data = data;
    const res = await fetch(`${API_BASE}/bot${token}/answerWidgetQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return json.ok;
  } catch (err) {
    console.error(`[Widget] answerWidgetQuery exception: ${err.message}`);
    return false;
  }
}

/**
 * Обновить состояние виджета (chat_data / public_data)
 * HTML виджета неизменяем — меняется только состояние
 * @param {string} token
 * @param {number|string} chatId
 * @param {number} messageId
 * @param {object} state — { chat_data?, public_data? } (пустое = оставить как есть)
 * @returns {Promise<boolean>}
 */
export async function editMessageWidgetData(token, chatId, messageId, state = {}) {
  try {
    const body = {
      chat_id: chatId,
      message_id: messageId,
    };
    if (state.chat_data !== undefined) body.chat_data = state.chat_data;
    if (state.public_data !== undefined) body.public_data = state.public_data;

    const res = await fetch(`${API_BASE}/bot${token}/editMessageWidgetData`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return json.ok;
  } catch (err) {
    console.error(`[Widget] editMessageWidgetData exception: ${err.message}`);
    return false;
  }
}
