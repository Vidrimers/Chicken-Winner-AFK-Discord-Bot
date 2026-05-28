import { Router } from 'express';
import { log, error as logError } from '../../utils/logger.js';
import { USER_IDS, TELEGRAM_CONFIG } from '../../config.js';

/**
 * Роуты для системы багрепортов
 */
export function createBugReportsRouter(db, telegram) {
  const router = Router();

  /**
   * POST /api/bug-report — отправить багрепорт
   */
  router.post('/bug-report', async (req, res) => {
    try {
      const { userId, username, bugText } = req.body;

      if (!userId || !username || !bugText) {
        return res.status(400).json({ error: 'Все поля обязательны' });
      }

      if (bugText.length > 2000) {
        return res.status(400).json({ error: 'Текст слишком длинный (макс. 2000 символов)' });
      }

      const id = db.createBugReport(userId, username, bugText);
      log(`🐛 Новый багрепорт #${id} от ${username} (${userId})`);

      // Отправляем уведомление админу в Telegram
      if (telegram && telegram.sendTelegramReport) {
        const message =
          `🐛 <b>Новый багрепорт #${id}</b>\n\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📝 Текст: ${bugText.substring(0, 500)}${bugText.length > 500 ? '...' : ''}\n` +
          `📅 Время: ${new Date().toLocaleString('ru-RU')}`;

        await telegram.sendTelegramReport(message);
      }

      res.json({ success: true, id });
    } catch (error) {
      logError(`Ошибка создания багрепорта: ${error.message}`);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  /**
   * GET /api/bug-reports — получить все багрепорты (только админ)
   */
  router.get('/bug-reports', (req, res) => {
    try {
      const requestUserId = req.headers['x-user-id'];
      if (requestUserId !== USER_IDS.ADMIN_USER_ID) {
        return res.status(403).json({ error: 'Доступ запрещён' });
      }

      const { status } = req.query;
      const reports = db.getBugReports(status || null);
      res.json(reports);
    } catch (error) {
      logError(`Ошибка получения багрепортов: ${error.message}`);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  /**
   * GET /api/bug-reports/count — количество новых багрепортов (для бейджа)
   */
  router.get('/bug-reports/count', (req, res) => {
    try {
      const count = db.getBugReportCount('new');
      res.json({ count });
    } catch (error) {
      logError(`Ошибка получения количества багрепортов: ${error.message}`);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  /**
   * GET /api/bug-reports/my/:userId — багрепорты пользователя
   */
  router.get('/bug-reports/my/:userId', (req, res) => {
    try {
      const { userId } = req.params;
      const reports = db.getBugReportsByUser(userId);
      res.json(reports);
    } catch (error) {
      logError(`Ошибка получения багрепортов пользователя: ${error.message}`);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  /**
   * PUT /api/bug-reports/:id/status — изменить статус (только админ)
   */
  router.put('/bug-reports/:id/status', async (req, res) => {
    try {
      const requestUserId = req.headers['x-user-id'];
      if (requestUserId !== USER_IDS.ADMIN_USER_ID) {
        return res.status(403).json({ error: 'Доступ запрещён' });
      }

      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['new', 'in_progress', 'resolved', 'rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Недопустимый статус' });
      }

      db.updateBugReportStatus(id, status);
      log(`🐛 Багрепорт #${id} — статус изменён на: ${status}`);

      // Отправляем уведомление пользователю в Telegram
      const report = db.getBugReportById(id);
      if (report && telegram && telegram.sendTelegramMessageToUser) {
        const telegramChatId = db.getTelegramChatId(report.user_id);
        if (telegramChatId) {
          const statusTexts = {
            new: '🆕 Новый',
            in_progress: '🔄 В работе',
            resolved: '✅ Решено',
            rejected: '❌ Отклонено'
          };
          const userMessage =
            `🐛 <b>Статус вашего багрепорта #${id} изменён</b>\n\n` +
            `📝 ${report.bug_text.substring(0, 100)}${report.bug_text.length > 100 ? '...' : ''}\n\n` +
            `📊 Новый статус: ${statusTexts[status] || status}`;

          await telegram.sendTelegramMessageToUser(telegramChatId, userMessage);
        }
      }

      res.json({ success: true });
    } catch (error) {
      logError(`Ошибка обновления статуса багрепорта: ${error.message}`);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  /**
   * DELETE /api/bug-reports/:id — удалить багрепорт (только админ)
   */
  router.delete('/bug-reports/:id', (req, res) => {
    try {
      const requestUserId = req.headers['x-user-id'];
      if (requestUserId !== USER_IDS.ADMIN_USER_ID) {
        return res.status(403).json({ error: 'Доступ запрещён' });
      }

      const { id } = req.params;
      db.deleteBugReport(id);
      log(`🐛 Багрепорт #${id} удалён`);
      res.json({ success: true });
    } catch (error) {
      logError(`Ошибка удаления багрепорта: ${error.message}`);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  return router;
}
