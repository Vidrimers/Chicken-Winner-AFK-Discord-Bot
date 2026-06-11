import { Router } from 'express';
import { log, error } from '../../utils/logger.js';

// Кеш ников: steamid64 → { name, expires }
const nicknameCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

/**
 * Прокси к Steam API — для userscript Universal Eblan Marker
 * GET /api/steam/name/:steamid   → { steamid, name }
 * GET /api/steam/names?ids=id1,id2,...  → [{ steamid, name }, ...]
 */
export function createSteamProxyRouter() {
  const router = Router();

  // Валидация SteamID64 — только 17-значные числа начинающиеся на 7656
  function isValidSteamId(id) {
    return /^\d{17}$/.test(id) && id.startsWith('7656');
  }

  // Запрос к Steam API с кешем
  async function fetchNames(steamIds) {
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) throw new Error('STEAM_API_KEY не задан в .env');

    const now = Date.now();
    const toFetch = [];
    const result = {};

    // Проверяем кеш
    for (const id of steamIds) {
      const cached = nicknameCache.get(id);
      if (cached && cached.expires > now) {
        result[id] = cached.name;
      } else {
        toFetch.push(id);
      }
    }

    if (toFetch.length === 0) return result;

    // Steam API принимает до 100 id за раз
    const chunks = [];
    for (let i = 0; i < toFetch.length; i += 100) {
      chunks.push(toFetch.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${chunk.join(',')}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`Steam API ответил ${r.status}`);
      const data = await r.json();

      for (const player of data.response?.players || []) {
        result[player.steamid] = player.personaname;
        nicknameCache.set(player.steamid, {
          name: player.personaname,
          expires: now + CACHE_TTL,
        });
      }
    }

    return result;
  }

  // GET /api/steam/name/:steamid — один ник
  router.get('/name/:steamid', async (req, res) => {
    const { steamid } = req.params;

    if (!isValidSteamId(steamid)) {
      return res.status(400).json({ error: 'Некорректный SteamID64' });
    }

    try {
      const names = await fetchNames([steamid]);
      const name = names[steamid];
      if (!name) return res.status(404).json({ error: 'Профиль не найден или приватный' });
      res.json({ steamid, name });
    } catch (err) {
      error(`Steam proxy ошибка: ${err.message}`);
      res.status(500).json({ error: 'Ошибка Steam API' });
    }
  });

  // GET /api/steam/names?ids=id1,id2,... — несколько ников сразу
  router.get('/names', async (req, res) => {
    const raw = req.query.ids || '';
    const ids = raw.split(',').map(s => s.trim()).filter(Boolean);

    if (ids.length === 0) return res.status(400).json({ error: 'Не указаны ids' });
    if (ids.length > 100) return res.status(400).json({ error: 'Максимум 100 id за раз' });

    const invalid = ids.filter(id => !isValidSteamId(id));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Некорректные SteamID64: ${invalid.join(', ')}` });
    }

    try {
      const names = await fetchNames(ids);
      const result = ids.map(id => ({ steamid: id, name: names[id] || null }));
      res.json(result);
    } catch (err) {
      error(`Steam proxy ошибка: ${err.message}`);
      res.status(500).json({ error: 'Ошибка Steam API' });
    }
  });

  log('Steam proxy роут создан');
  return router;
}
