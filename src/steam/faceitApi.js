/**
 * FACEIT API Service
 * Получение профиля и статистики CS2 с FACEIT по Steam ID
 */

const FACEIT_API_BASE = 'https://open.faceit.com/data/v4';

// Заголовки для обхода Cloudflare bot protection
const CF_HEADERS = {
  'Authorization': '',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://www.faceit.com/',
  'Origin': 'https://www.faceit.com',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

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
    const headers = { ...CF_HEADERS, Authorization: `Bearer ${apiKey}` };

    // Запрос 1: найти игрока по Steam ID
    const playerRes = await fetch(
      `${FACEIT_API_BASE}/players?game=cs2&game_player_id=${steamId}`,
      { headers }
    );

    console.log(`[FACEIT] playerRes status: ${playerRes.status} for ${steamId}`);

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
    let avgKD = 0;
    let avgKR = 0;
    let avgHS = 0;
    let currentWinStreak = 0;
    let longestWinStreak = 0;
    let recentResults = [];
    let totalHeadshots = 0;

    const statsRes = await fetch(
      `${FACEIT_API_BASE}/players/${playerId}/stats/cs2`,
      { headers }
    );

    if (statsRes.ok) {
      const statsJson = await statsRes.json();
      const lifetime = statsJson.lifetime;
      matches = parseInt(lifetime?.['Matches'] ?? '0', 10);
      winRate = parseFloat(lifetime?.['Win Rate %'] ?? '0');
      avgKD = parseFloat(lifetime?.['Average K/D Ratio'] ?? '0');
      avgKR = parseFloat(lifetime?.['ADR'] ?? '0'); // K/R отсутствует в API — используем ADR
      avgHS = parseFloat(lifetime?.['Average Headshots %'] ?? '0');
      currentWinStreak = parseInt(lifetime?.['Current Win Streak'] ?? '0', 10);
      longestWinStreak = parseInt(lifetime?.['Longest Win Streak'] ?? '0', 10);
      recentResults = Array.isArray(lifetime?.['Recent Results']) ? lifetime['Recent Results'] : (lifetime?.['Recent Results']?.split?.(',') ?? []);
      totalHeadshots = parseFloat(lifetime?.['Total Headshots %'] ?? '0'); // Это КОЛИЧЕСТВО, не %
    }

    return {
      playerId,
      nickname: player.nickname,
      level:    cs2Data?.skill_level ?? null,
      elo:      cs2Data?.faceit_elo  ?? null,
      matches,
      winRate,
      isBanned,
      country: player.country || null,
      avgKD,
      avgKR,
      avgHS,
      currentWinStreak,
      longestWinStreak,
      recentResults,
      totalHeadshots,
    };
  } catch (err) {
    console.log(`[FACEIT] Error for ${steamId}: ${err.message}`);
    return null; // Сеть недоступна или любая другая ошибка — не ломаем
  }
}
