import { Router } from 'express';
import { log, error as logError } from '../../utils/logger.js';

/**
 * Роуты для интеграции с Telegram
 */
export function createTelegramRouter(db, telegramService) {
  const router = Router();

  /**
   * POST /api/telegram-link/generate/:userId
   * Сгенерировать код для связывания с Telegram
   */
  router.post('/generate/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
      const code = generateLinkCode(db, userId);
      res.json({
        success: true,
        code: code,
        expiresIn: 900, // 15 минут
      });
    } catch (error) {
      logError(`Ошибка при генерации кода: ${error.message}`);
      res.status(500).json({ error: 'Failed to generate link code' });
    }
  });

  /**
   * GET /api/telegram-link/status/:userId
   * Проверить статус связи с Telegram
   */
  router.get('/status/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
      const status = db.getTelegramLinkStatus(userId);
      res.json(status);
    } catch (error) {
      logError(`Ошибка при проверке статуса: ${error.message}`);
      res.status(500).json({ error: 'Failed to check link status' });
    }
  });

  /**
   * DELETE /api/telegram-link/unlink/:userId
   * Отвязать Telegram аккаунт
   */
  router.delete('/unlink/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
      // Получаем информацию перед удалением
      const telegramUser = db.prepare(
        'SELECT telegram_chat_id FROM telegram_users WHERE user_id = ?'
      ).get(userId);
      
      const userStats = db.prepare(
        'SELECT username FROM user_stats WHERE user_id = ?'
      ).get(userId);
      
      const username = userStats ? userStats.username : 'Неизвестный пользователь';
      const chatId = telegramUser ? telegramUser.telegram_chat_id : 'N/A';

      // Удаляем связь
      db.prepare('DELETE FROM telegram_users WHERE user_id = ?').run(userId);
      db.setUserChannelNotificationSetting(userId, false);

      log(`🔓 Telegram аккаунт отвязан для userId: ${userId}`);

      // Отправляем уведомление админу
      if (telegramService) {
        await telegramService.sendReport(
          `🔓 <b>Telegram аккаунт отвязан</b>\n\n` +
          `👤 Discord: ${username}\n` +
          `🆔 Discord ID: <code>${userId}</code>\n` +
          `💬 Telegram Chat ID: <code>${chatId}</code>\n` +
          `📅 Время: ${new Date().toLocaleString('ru-RU')}`
        );
      }

      res.json({
        success: true,
        message: 'Telegram аккаунт успешно отвязан',
      });
    } catch (error) {
      logError(`Ошибка при отвязке Telegram: ${error.message}`);
      res.status(500).json({ error: 'Failed to unlink Telegram account' });
    }
  });

  return router;
}

/**
 * Генерация 6-значного кода для связывания
 */
function generateLinkCode(db, userId) {
  // Удаляем старые неиспользованные коды
  db.prepare('DELETE FROM telegram_link_codes WHERE user_id = ? AND used = 0').run(userId);

  let code;
  let attempts = 0;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    attempts++;
    if (attempts > 100) {
      throw new Error('Не удалось сгенерировать уникальный код');
    }
  } while (db.prepare('SELECT code FROM telegram_link_codes WHERE code = ?').get(code));

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(code, userId, expiresAt);

  return code;
}

/**
 * Использовать код для связывания
 */
export function useLinkCode(db, code, telegramChatId) {
  const now = new Date().toISOString();
  const result = db.prepare(
    'SELECT user_id, expires_at, used FROM telegram_link_codes WHERE code = ?'
  ).get(code);

  if (!result) {
    return { success: false, error: 'Код не найден' };
  }

  if (result.used) {
    return { success: false, error: 'Код уже использован' };
  }

  if (result.expires_at < now) {
    return { success: false, error: 'Код истёк' };
  }

  db.prepare('UPDATE telegram_link_codes SET used = 1 WHERE code = ?').run(code);

  db.prepare(
    `INSERT OR REPLACE INTO telegram_users (user_id, telegram_chat_id, started_bot, created_at)
     VALUES (?, ?, 1, COALESCE((SELECT created_at FROM telegram_users WHERE user_id = ?), CURRENT_TIMESTAMP))`
  ).run(result.user_id, telegramChatId, result.user_id);

  return { success: true, userId: result.user_id };
}
