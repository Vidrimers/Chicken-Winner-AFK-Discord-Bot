import { Router } from 'express';
import { log, error as logError } from '../../utils/logger.js';

/**
 * Роуты для достижений
 */
export function createAchievementsRouter(db) {
  const router = Router();

  /**
   * GET /api/achievements
   * Получить все обычные достижения
   */
  router.get('/', (req, res) => {
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
   * GET /api/special-achievements
   * Получить все специальные достижения
   */
  router.get('/special', (req, res) => {
    try {
      const stmt = db.prepare(`
        SELECT DISTINCT a.achievement_id, a.emoji, a.name, a.description, a.type, a.color, a.special_date, a.user_id, ua.unlocked_at
        FROM achievements a
        LEFT JOIN user_achievements ua ON a.achievement_id = ua.achievement_id AND a.user_id = ua.user_id
        WHERE a.type = 'special'
        ORDER BY a.created_at DESC
      `);
      const specialAchievements = stmt.all();
      res.json(specialAchievements);
    } catch (error) {
      logError(`Ошибка при получении специальных достижений: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/notify/profile-view
   * Уведомить о просмотре профиля
   */
  router.post('/notify/profile-view', async (req, res) => {
    try {
      const { viewerId, viewerUsername, targetUserId, targetUsername } = req.body;

      if (viewerId === targetUserId) {
        return res.json({ success: true });
      }

      // Здесь можно добавить логику уведомления через telegram
      log(`📬 ${viewerUsername} просмотрел профиль ${targetUsername}`);

      res.json({ success: true });
    } catch (error) {
      logError(`Ошибка в API /api/notify/profile-view: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
