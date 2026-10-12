/**
 * Steam API Routes
 * Привязка Steam ID к профилю пользователя и получение CS2/FACEIT статистики
 */

import { Router } from 'express';
import { getCachedStats } from '../../steam/statsCache.js';
import { requireAuth, requireOwnership } from '../middleware/auth.js';

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
  router.post('/:discordId/steam', requireAuth, requireOwnership, async (req, res) => {
    const { discordId } = req.params;
    const { steamId } = req.body;

    // 1. Аутентификация — есть ли идентификатор пользователя?
    if (!req.authenticatedUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // 2. Валидация Steam ID
    if (!steamId || !isValidSteamId(steamId)) {
      return res.status(400).json({
        error: 'Невалидный Steam ID. Ожидается 17-значный числовой идентификатор, начинающийся с 765611'
      });
    }

    // 3. Бизнес-логика
    db.setSteamId(discordId, steamId);
    return res.json({ success: true });
  });

  /**
   * DELETE /api/users/:discordId/steam
   * Отвязать Steam ID от профиля пользователя
   */
  router.delete('/:discordId/steam', requireAuth, requireOwnership, async (req, res) => {
    const { discordId } = req.params;

    db.setSteamId(discordId, null);
    return res.json({ success: true });
  });

  /**
   * GET /api/users/:discordId/steam-stats
   * Получить CS2 и FACEIT статистику пользователя (с кэшированием)
   * Только для авторизованных участников — гостям связка Discord→Steam не светим.
   */
  router.get('/:discordId/steam-stats', requireAuth, async (req, res) => {
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
