/**
 * Steam CS2 Stats Service
 * Получение статистики CS2 и данных профиля из Steam Web API
 */

import { STEAM_CONFIG } from '../config.js';

const STEAM_API_BASE = 'https://api.steampowered.com';
const CS2_APP_ID = 730;
const RETRY_DELAY = 5000; // 5 секунд при 429

/**
 * Утилита задержки
 * @param {number} ms
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * fetch с retry при 429 (rate limit)
 * В отличие от steamApi.js — НЕ бросает при 403, возвращает response как есть
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url) {
  const response = await fetch(url);

  if (response.status === 429) {
    await delay(RETRY_DELAY);
    return fetch(url);
  }

  return response;
}

/**
 * Нулевые значения всех числовых полей статистики
 * @returns {Object}
 */
function nullStats() {
  return {
    totalKills: null,
    totalDeaths: null,
    totalMatchesPlayed: null,
    totalWins: null,
    totalTimePlayed: null,
    totalHsKills: null,
    hoursPlayed: null,
    kd: null,
    winRate: null,
    hsPercent: null,
  };
}

/**
 * Конвертирует массив [{name, value}, ...] в плоский объект
 * @param {Array<{name: string, value: number}>} arr
 * @returns {Object}
 */
function parseStatsArray(arr) {
  return arr.reduce((acc, s) => {
    acc[s.name] = s.value;
    return acc;
  }, {});
}

/**
 * Получить CS2-статистику и профиль игрока
 * @param {string} steamId — SteamID64
 * @returns {Promise<Object>} SteamStatsResult
 */
export async function fetchSteamStats(steamId) {
  const apiKey = STEAM_CONFIG.STEAM_API_KEY;

  // Запрос 1: CS2 статистика
  const statsUrl = `${STEAM_API_BASE}/ISteamUserStats/GetUserStatsForGame/v0002/`
    + `?key=${apiKey}&steamid=${steamId}&appid=${CS2_APP_ID}`;

  let statsData = null;
  let resultReason = null; // 'private' | 'noData' | 'networkError' | null (успех)

  try {
    const statsRes = await fetchWithRetry(statsUrl);

    if (statsRes.status === 403) {
      // Профиль приватный — Steam явно отказывает в доступе
      resultReason = 'private';
    } else if (statsRes.ok) {
      const json = await statsRes.json();
      if (!json.playerstats?.stats || json.playerstats.stats.length === 0) {
        // Профиль публичный, но данных CS2 нет (не играл)
        resultReason = 'noData';
      } else {
        statsData = parseStatsArray(json.playerstats.stats);
      }
    } else {
      resultReason = 'networkError';
    }
  } catch (err) {
    resultReason = 'networkError'; // Сеть недоступна — не ломаем
  }

  // Запрос 2: Профиль (timecreated) — выполняется ВСЕГДА, независимо от reason
  let accountCreatedYear = null;
  try {
    const summaryUrl = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/`
      + `?key=${apiKey}&steamids=${steamId}`;
    const summaryRes = await fetchWithRetry(summaryUrl);

    if (summaryRes.ok) {
      const json = await summaryRes.json();
      const player = json.response?.players?.[0];
      if (player?.timecreated) {
        accountCreatedYear = new Date(player.timecreated * 1000).getFullYear();
      }
    }
  } catch (err) {
    // timecreated необязателен — продолжаем без него
  }

  // Возвращаем с явным reason для дифференцированных сообщений на UI
  if (resultReason) {
    return {
      private: resultReason === 'private',
      noData: resultReason === 'noData',
      networkError: resultReason === 'networkError',
      accountCreatedYear,
      ...nullStats(),
    };
  }

  // Успешный результат — вычисляем производные
  const totalKills         = statsData['total_kills']          ?? null;
  const totalDeaths        = statsData['total_deaths']         ?? null;
  const totalMatchesPlayed = statsData['total_matches_played'] ?? null;
  const totalWins          = statsData['total_wins']           ?? null;
  const totalTimePlayed    = statsData['total_time_played']    ?? null;
  const totalHsKills       = statsData['total_kills_headshot'] ?? null;

  return {
    private: false,
    noData: false,
    networkError: false,
    accountCreatedYear,
    totalKills,
    totalDeaths,
    totalMatchesPlayed,
    totalWins,
    totalTimePlayed,
    totalHsKills,
    hoursPlayed: totalTimePlayed !== null
      ? Math.round(totalTimePlayed / 3600)
      : null,
    kd: (totalKills !== null && totalDeaths !== null && totalDeaths > 0)
      ? +(totalKills / totalDeaths).toFixed(2)
      : null,
    winRate: (totalWins !== null && totalMatchesPlayed !== null && totalMatchesPlayed > 0)
      ? +(totalWins / totalMatchesPlayed * 100).toFixed(1)
      : null,
    hsPercent: (totalHsKills !== null && totalKills !== null && totalKills > 0)
      ? +(totalHsKills / totalKills * 100).toFixed(1)
      : null,
  };
}
