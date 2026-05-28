/**
 * Парсер Steam URL
 * Извлекает тип ссылки (vanity/steamid64) и значение из различных форматов Steam-профилей
 */

// Regex для валидации vanity name (буквы, цифры, подчёркивания, дефисы)
const VANITY_REGEX = /^[a-zA-Z0-9_-]+$/;

// Regex для валидации SteamID64 (ровно 17 цифр)
const STEAMID64_REGEX = /^\d{17}$/;

/**
 * Парсит Steam URL и возвращает тип + значение
 * @param {string} url — ссылка на Steam-профиль
 * @returns {{ type: 'vanity' | 'steamid64', value: string } | null}
 */
export function parseSteamUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Убираем пробелы по краям
  let trimmed = url.trim();

  // Убираем trailing slash
  if (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }

  // Проверяем что URL начинается с http:// или https://
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  // Проверяем домен steamcommunity.com
  let path;
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== 'steamcommunity.com') {
      return null;
    }
    path = parsed.pathname;
  } catch {
    return null;
  }

  // Убираем trailing slash из path
  if (path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  // Парсим /id/USERNAME
  const vanityMatch = path.match(/^\/id\/(.+)$/);
  if (vanityMatch) {
    const value = vanityMatch[1];
    if (VANITY_REGEX.test(value)) {
      return { type: 'vanity', value };
    }
    return null;
  }

  // Парсим /profiles/STEAMID64
  const profileMatch = path.match(/^\/profiles\/(.+)$/);
  if (profileMatch) {
    const value = profileMatch[1];
    if (STEAMID64_REGEX.test(value)) {
      return { type: 'steamid64', value };
    }
    return null;
  }

  return null;
}
