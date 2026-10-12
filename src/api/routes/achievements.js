import { Router } from 'express';
import { log, error as logError } from '../../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * Роуты для достижений
 */
export function createAchievementsRouter(db, telegram) {
  const router = Router();

  /**
   * GET /achievements
   * Получить все обычные достижения
   */
  router.get('/achievements', (req, res) => {
    try {
      // Возвращаем список всех обычных достижений из definitions
      // Это будет использоваться фронтендом для отображения
      res.json({ success: true });
    } catch (error) {
      logError(`Ошибка при получении достижений: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /special-achievements
   * Получить все специальные достижения.
   * Гостям user_id не отдаётся — только username для отображения.
   */
  router.get('/special-achievements', (req, res) => {
    try {
      const stmt = db.prepare(`
        SELECT DISTINCT a.achievement_id, a.emoji, a.name, a.description, a.type, a.color, a.special_date, a.user_id, ua.unlocked_at,
               COALESCE(us.username, 'Неизвестный') as username
        FROM achievements a
        LEFT JOIN user_achievements ua ON a.achievement_id = ua.achievement_id AND a.user_id = ua.user_id
        LEFT JOIN user_stats us ON a.user_id = us.user_id
        WHERE a.type = 'special'
        ORDER BY a.created_at DESC
      `);
      const specialAchievements = stmt.all();
      const isGuest = !req.session?.userId;
      const payload = specialAchievements.map(({ user_id: userId, ...rest }) => {
        if (isGuest) {
          return rest;
        }
        return { ...rest, user_id: userId };
      });
      res.json(payload);
    } catch (error) {
      logError(`Ошибка при получении специальных достижений: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /notify/profile-view
   * Уведомить о просмотре профиля.
   * Viewer берётся из сессии — из body подменить нельзя.
   */
  router.post('/notify/profile-view', requireAuth, async (req, res) => {
    try {
      const viewerId = req.authenticatedUserId;
      const viewerUsername = db.getUserStats(viewerId)?.username || viewerId;
      const { targetUserId, targetUsername } = req.body;

      if (!targetUserId) {
        return res.status(400).json({ error: 'targetUserId обязателен' });
      }

      const targetName = targetUsername
        || db.getUserStats(targetUserId)?.username
        || targetUserId;

      if (viewerId === targetUserId) {
        return res.json({ success: true });
      }

      log(`📬 ${viewerUsername} просмотрел профиль ${targetName}`);

      // Отправляем уведомление в Telegram
      if (telegram && telegram.sendProfileView) {
        await telegram.sendProfileView(viewerUsername, viewerId, targetName, targetUserId);
      }

      res.json({ success: true });
    } catch (error) {
      logError(`Ошибка в API /notify/profile-view: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
