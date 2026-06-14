/**
 * FACEIT API Service
 * Получение профиля и статистики CS2 с FACEIT по Steam ID
 */

const FACEIT_API_BASE = 'https://open.faceit.com/data/v4';

/**
 * Получить статистику FACEIT по Steam ID
 * @param {string} steamId — SteamID64
 * @returns {Promise<Object|null>} FaceitStatsResult или null если нет ключа / игрок не найден
 */
export async function fetchFaceitStats(steamId) {
  const apiKey = process.env.FACEIT_API_KEY;

  // Graceful degradation — ключа нет
  if (!apiKey) return null;

  try {
    // Запрос 1: найти игрока по Steam ID
    const playerRes = await fetch(
      `${FACEIT_API_BASE}/players?game=cs2&game_player_id=${steamId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (playerRes.status === 404) return null; // Не зарегистрирован на FACEIT
    if (!playerRes.ok) return null;            // Другие ошибки — не ломаем

    const player = await playerRes.json();
    const playerId = player.player_id;
    const cs2Data  = player.games?.cs2;

    // Вычисляем наличие активного бана
    const isBanned = Array.isArray(player.bans) && player.bans.some(b => {
      if (!b.ends_at) return true;                     // Перманентный бан
      return new Date(b.ends_at) > new Date();         // Временный, ещё активен
    });

    // Запрос 2: статистика CS2 (только если запрос 1 успешен)
    let matches = 0;
    let winRate = 0;

    const statsRes = await fetch(
      `${FACEIT_API_BASE}/players/${playerId}/stats/cs2`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (statsRes.ok) {
      const statsJson = await statsRes.json();
      const lifetime = statsJson.lifetime;
      matches = parseInt(lifetime?.['Matches'] ?? '0', 10);
      winRate = parseFloat(lifetime?.['Win Rate %'] ?? '0');
    }
    // При ошибке запроса 2 — fallback { matches: 0, winRate: 0 } уже установлен выше

    return {
      playerId,
      nickname: player.nickname,
      level:    cs2Data?.skill_level ?? null,
      elo:      cs2Data?.faceit_elo  ?? null,
      matches,
      winRate,
      isBanned,
    };
  } catch (err) {
    return null; // Сеть недоступна или любая другая ошибка — не ломаем
  }
}
