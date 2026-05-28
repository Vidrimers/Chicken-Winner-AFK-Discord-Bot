/**
 * Steam API Service
 * Взаимодействие со Steam Web API: resolve vanity URL, получение банов и профилей
 */

import { parseSteamUrl } from './urlParser.js';
import { STEAM_CONFIG } from '../config.js';

const STEAM_API_BASE = 'https://api.steampowered.com';
const DELAY_BETWEEN_REQUESTS = 1500; // 1.5 секунды между запросами
const RETRY_DELAY = 5000; // 5 секунд при 429
const BATCH_SIZE = 100; // Максимум ID в одном запросе

/**
 * Утилита задержки
 * @param {number} ms — миллисекунды
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Выполнить fetch-запрос с retry при 429
 * @param {string} url — URL запроса
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url) {
  const response = await fetch(url);

  if (response.status === 429) {
    await delay(RETRY_DELAY);
    const retryResponse = await fetch(url);
    if (!retryResponse.ok) {
      throw new Error(`Steam API error: ${retryResponse.status}`);
    }
    return retryResponse;
  }

  if (response.status === 403) {
    throw new Error('INVALID_API_KEY');
  }

  if (!response.ok) {
    throw new Error(`Steam API error: ${response.status}`);
  }

  return response;
}

/**
 * Разрешить vanity URL в SteamID64
 * @param {string} vanityName
 * @returns {Promise<string>} steamId64
 * @throws {Error} если профиль не найден
 */
export async function resolveVanityUrl(vanityName) {
  const url = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_CONFIG.STEAM_API_KEY}&vanityurl=${encodeURIComponent(vanityName)}`;

  const response = await fetchWithRetry(url);
  const data = await response.json();

  if (data.response.success !== 1) {
    throw new Error(`VANITY_NOT_FOUND:${vanityName}`);
  }

  return data.response.steamid;
}

/**
 * Получить данные о банах для массива SteamID64
 * @param {string[]} steamIds — до 100 ID
 * @returns {Promise<Object[]>} массив ban-объектов
 */
export async function getPlayerBans(steamIds) {
  const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerBans/v1/?key=${STEAM_CONFIG.STEAM_API_KEY}&steamids=${steamIds.join(',')}`;

  const response = await fetchWithRetry(url);
  const data = await response.json();

  return data.players || [];
}

/**
 * Получить сводку профилей (имя, аватар)
 * @param {string[]} steamIds — до 100 ID
 * @returns {Promise<Object[]>} массив summary-объектов
 */
export async function getPlayerSummaries(steamIds) {
  const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_CONFIG.STEAM_API_KEY}&steamids=${steamIds.join(',')}`;

  const response = await fetchWithRetry(url);
  const data = await response.json();

  return data.response?.players || [];
}

/**
 * Полная проверка массива URL: парсинг → resolve → bans + summaries → merge
 * @param {string[]} urls
 * @returns {Promise<{ results: Object[], errors: string[] }>}
 */
export async function checkProfiles(urls) {
  const results = [];
  const errors = [];
  const resolvedIds = []; // { steamId, originalUrl }

  // 1. Парсинг всех URL и разделение на vanity/steamid64
  const vanityUrls = [];
  for (const url of urls) {
    const parsed = parseSteamUrl(url);
    if (!parsed) {
      errors.push(`Невалидный Steam URL: ${url}`);
      continue;
    }

    if (parsed.type === 'steamid64') {
      resolvedIds.push({ steamId: parsed.value, originalUrl: url });
    } else if (parsed.type === 'vanity') {
      vanityUrls.push({ vanityName: parsed.value, originalUrl: url });
    }
  }

  // 2. Resolve vanity URLs с задержкой 1.5s между запросами
  let isFirstRequest = true;
  for (const { vanityName, originalUrl } of vanityUrls) {
    try {
      if (!isFirstRequest) {
        await delay(DELAY_BETWEEN_REQUESTS);
      }
      isFirstRequest = false;
      const steamId = await resolveVanityUrl(vanityName);
      resolvedIds.push({ steamId, originalUrl });
    } catch (err) {
      if (err.message.startsWith('VANITY_NOT_FOUND:')) {
        const name = err.message.split(':')[1];
        errors.push(`Не удалось разрешить vanity URL: ${name}`);
      } else if (err.message === 'INVALID_API_KEY') {
        errors.push('Ошибка конфигурации сервера');
      } else {
        errors.push('Steam API временно недоступен');
      }
    }
  }

  if (resolvedIds.length === 0) {
    return { results, errors };
  }

  const steamIds = resolvedIds.map(r => r.steamId);

  // 3. Batch getPlayerBans (до 100 ID за раз)
  let allBans = [];
  for (let i = 0; i < steamIds.length; i += BATCH_SIZE) {
    const batch = steamIds.slice(i, i + BATCH_SIZE);
    try {
      await delay(DELAY_BETWEEN_REQUESTS);
      const bans = await getPlayerBans(batch);
      allBans = allBans.concat(bans);
    } catch (err) {
      if (err.message === 'INVALID_API_KEY') {
        errors.push('Ошибка конфигурации сервера');
      } else {
        errors.push('Steam API временно недоступен');
      }
      return { results, errors };
    }
  }

  // 4. Batch getPlayerSummaries (до 100 ID за раз)
  let allSummaries = [];
  for (let i = 0; i < steamIds.length; i += BATCH_SIZE) {
    const batch = steamIds.slice(i, i + BATCH_SIZE);
    try {
      await delay(DELAY_BETWEEN_REQUESTS);
      const summaries = await getPlayerSummaries(batch);
      allSummaries = allSummaries.concat(summaries);
    } catch (err) {
      if (err.message === 'INVALID_API_KEY') {
        errors.push('Ошибка конфигурации сервера');
      } else {
        errors.push('Steam API временно недоступен');
      }
      return { results, errors };
    }
  }

  // 5. Merge results
  for (const { steamId } of resolvedIds) {
    const ban = allBans.find(b => b.SteamId === steamId);
    const summary = allSummaries.find(s => s.steamid === steamId);

    results.push({
      steamId,
      personaName: summary?.personaname || 'Unknown',
      avatarUrl: summary?.avatarfull || '',
      profileUrl: summary?.profileurl || `https://steamcommunity.com/profiles/${steamId}`,
      vacBanned: ban?.VACBanned || false,
      numberOfVacBans: ban?.NumberOfVACBans || 0,
      numberOfGameBans: ban?.NumberOfGameBans || 0,
      daysSinceLastBan: ban?.DaysSinceLastBan || 0,
      communityBanned: ban?.CommunityBanned || false,
      economyBan: ban?.EconomyBan || 'none',
    });
  }

  return { results, errors };
}
