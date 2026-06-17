/**
 * Steam API Routes
 * Привязка Steam ID к профилю пользователя и получение CS2/FACEIT статистики
 */

import { Router } from 'express';
import { getCachedStats } from '../../steam/statsCache.js';

/**
 * Валидация Steam ID: 17 цифр, начинается с 765611
 * @param {string} id
 * @returns {boolean}
 */
function isValidSteamId(id) {
  return typeof id === 'string' && /^\d{17}$/.test(id) && id.startsWith('765611');
}

/**
 * Создать роутер для Steam-эндпоинтов
 * @param {DatabaseManager} db
 * @returns {Router}
 */
export function createSteamRouter(db) {
  const router = Router();

  /**
   * POST /api/users/:discordId/steam
   * Привязать Steam ID к профилю пользователя
   * Body: { steamId: "76561198..." }
   */
  router.post('/:discordId/steam', async (req, res) => {
    const { discordId } = req.params;
    const { steamId, userId: bodyUserId } = req.body;

    // Получаем userId из сессии или из тела запроса (fallback для системы без OAuth)
    const sessionUserId = req.session?.userId || bodyUserId || null;

    // 1. Аутентификация — есть ли идентификатор пользователя?
    if (!sessionUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // 2. Авторизация — это твой профиль?
    if (sessionUserId !== discordId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // 3. Валидация Steam ID
    if (!steamId || !isValidSteamId(steamId)) {
      return res.status(400).json({
        error: 'Невалидный Steam ID. Ожидается 17-значный числовой идентификатор, начинающийся с 765611'
      });
    }

    // 4. Бизнес-логика
    db.setSteamId(discordId, steamId);
    return res.json({ success: true });
  });

  /**
   * DELETE /api/users/:discordId/steam
   * Отвязать Steam ID от профиля пользователя
   */
  router.delete('/:discordId/steam', async (req, res) => {
    const { discordId } = req.params;
    const sessionUserId = req.session?.userId || req.body?.userId || null;

    if (!sessionUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (sessionUserId !== discordId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    db.setSteamId(discordId, null);
    return res.json({ success: true });
  });

  /**
   * GET /api/users/:discordId/steam-stats
   * Получить CS2 и FACEIT статистику пользователя (с кэшированием)
   */
  router.get('/:discordId/steam-stats', async (req, res) => {
    const { discordId } = req.params;

    try {
      const steamId = db.getSteamId(discordId);

      if (!steamId) {
        return res.json({ steamLinked: false });
      }

      const result = await getCachedStats(steamId, db, 'user_stats', discordId);
      return res.json({ steamLinked: true, steamId, ...result });
    } catch (err) {
      console.error('[SteamRouter] Ошибка получения статистики:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
