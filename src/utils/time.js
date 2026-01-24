/**
 * Утилиты для работы со временем
 */

/**
 * Форматирование времени в российском формате
 * @param {Date} date - Дата для форматирования
 * @returns {string} Отформатированная строка
 */
export function formatTime(date) {
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Получить текущее время в московском часовом поясе (UTC+3)
 * @returns {Date} Дата в московском времени
 */
export function getMoscowNow() {
  const now = new Date();
  const moscowOffset = 3 * 60 * 60 * 1000; // UTC+3 в миллисекундах
  return new Date(now.getTime() + moscowOffset);
}

/**
 * Получить ISO строку московского времени
 * @returns {string} ISO строка
 */
export function getMoscowNowISO() {
  return getMoscowNow().toISOString();
}

/**
 * Форматирование длительности в часы и минуты
 * @param {number} seconds - Количество секунд
 * @returns {string} Отформатированная строка (например "2ч 30м")
 */
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }
  return `${minutes}м`;
}
