/**
 * Утилиты для логирования
 */

function getTimestamp() {
  return new Date().toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function log(message, ...args) {
  console.log(`[${getTimestamp()}] ${message}`, ...args);
}

export function error(message, ...args) {
  console.error(`[${getTimestamp()}] ❌ ${message}`, ...args);
}

export function warn(message, ...args) {
  console.warn(`[${getTimestamp()}] ⚠️ ${message}`, ...args);
}

export function info(message, ...args) {
  console.info(`[${getTimestamp()}] ℹ️ ${message}`, ...args);
}

export function success(message, ...args) {
  console.log(`[${getTimestamp()}] ✅ ${message}`, ...args);
}
