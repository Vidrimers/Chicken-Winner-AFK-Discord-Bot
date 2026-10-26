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
    let wins = 0;
    let totalKills = 0;
    let totalDamage = 0;
    let totalRounds = 0;
    let entryRate = 0;
    let entrySuccessRate = 0;
    let oneV1WinRate = 0;
    let oneV2WinRate = 0;
    let flashSuccessRate = 0;
    let sniperKillRate = 0;

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
      avgKR = parseFloat(lifetime?.['ADR'] ?? '0');
      avgHS = parseFloat(lifetime?.['Average Headshots %'] ?? '0');
      currentWinStreak = parseInt(lifetime?.['Current Win Streak'] ?? '0', 10);
      longestWinStreak = parseInt(lifetime?.['Longest Win Streak'] ?? '0', 10);
      recentResults = Array.isArray(lifetime?.['Recent Results']) ? lifetime['Recent Results'] : (lifetime?.['Recent Results']?.split?.(',') ?? []);
      totalHeadshots = parseFloat(lifetime?.['Total Headshots %'] ?? '0');

      // Дополнительные поля
      wins = parseInt(lifetime?.['Wins'] ?? '0', 10);
      totalKills = parseInt(lifetime?.['Total Kills with extended stats'] ?? '0', 10);
      totalDamage = parseInt(lifetime?.['Total Damage'] ?? '0', 10);
      totalRounds = parseInt(lifetime?.['Total Rounds with extended stats'] ?? '0', 10);
      entryRate = parseFloat(lifetime?.['Entry Rate'] ?? '0');
      entrySuccessRate = parseFloat(lifetime?.['Entry Success Rate'] ?? '0');
      oneV1WinRate = parseFloat(lifetime?.['1v1 Win Rate'] ?? '0');
      oneV2WinRate = parseFloat(lifetime?.['1v2 Win Rate'] ?? '0');
      flashSuccessRate = parseFloat(lifetime?.['Flash Success Rate'] ?? '0');
      sniperKillRate = parseFloat(lifetime?.['Sniper Kill Rate'] ?? '0');
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
      wins,
      totalKills,
      totalDamage,
      totalRounds,
      entryRate,
      entrySuccessRate,
      oneV1WinRate,
      oneV2WinRate,
      flashSuccessRate,
      sniperKillRate,
    };
  } catch (err) {
    console.log(`[FACEIT] Error for ${steamId}: ${err.message}`);
    return null; // Сеть недоступна или любая другая ошибка — не ломаем
  }
}
