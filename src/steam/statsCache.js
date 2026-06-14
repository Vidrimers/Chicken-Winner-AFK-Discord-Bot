/**
 * Steam Stats Cache
 * TTL-кэш статистики CS2 и FACEIT в БД (1 час).
 * Единая точка входа для получения актуальных данных.
 */

import { fetchSteamStats } from './steamStats.js';
import { fetchFaceitStats } from './faceitApi.js';

const CACHE_TTL_SECONDS = 3600; // 1 час

/**
 * Получить статистику с кэшированием.
 * Если кэш свежий (< 1 часа) — возвращает из БД.
 * Если устарел или отсутствует — делает запросы к API и обновляет кэш.
 *
 * @param {string} steamId            — SteamID64
 * @param {DatabaseManager} db        — экземпляр DatabaseManager
 * @param {'user_stats'|'cheater_checks'} table — таблица для кэша
 * @param {string} recordId           — user_id (для user_stats) или steam_id (для cheater_checks)
 * @returns {Promise<Object>} { cs2, faceit, cachedAt, fromCache }
 */
export async function getCachedStats(steamId, db, table, recordId) {
  const now = Math.floor(Date.now() / 1000);

  // Читаем кэш из нужной таблицы
  const cached = table === 'user_stats'
    ? db.getUserSteamCache(recordId)
    : db.getCheaterSteamCache(steamId);

  if (cached?.steam_cache && cached.steam_cache_updated) {
    const age = now - cached.steam_cache_updated;
    if (age < CACHE_TTL_SECONDS) {
      return { ...JSON.parse(cached.steam_cache), fromCache: true };
    }
  }

  return refreshStats(steamId, db, table, recordId);
}

/**
 * Принудительно обновить кэш (игнорирует TTL).
 * Вызывает Steam и FACEIT API параллельно через Promise.allSettled.
 *
 * @param {string} steamId
 * @param {DatabaseManager} db
 * @param {'user_stats'|'cheater_checks'} table
 * @param {string} recordId
 * @returns {Promise<Object>} { cs2, faceit, cachedAt, fromCache: false }
 */
export async function refreshStats(steamId, db, table, recordId) {
  const now = Math.floor(Date.now() / 1000);

  // Параллельные запросы — независимы друг от друга
  const [cs2Result, faceitResult] = await Promise.allSettled([
    fetchSteamStats(steamId),
    fetchFaceitStats(steamId),
  ]);

  const cs2 = cs2Result.status === 'fulfilled'
    ? cs2Result.value
    : { private: false, noData: false, networkError: true };

  const faceit = faceitResult.status === 'fulfilled'
    ? faceitResult.value
    : null;

  const payload = { cs2, faceit, cachedAt: now };
  const cacheJson = JSON.stringify(payload);

  // Сохраняем в нужную таблицу
  if (table === 'user_stats') {
    db.updateUserSteamCache(recordId, cacheJson, now);
  } else {
    db.updateCheaterSteamCache(steamId, cacheJson, now);
  }

  return { ...payload, fromCache: false };
}
