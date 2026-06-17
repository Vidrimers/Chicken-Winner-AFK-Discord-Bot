import { Router } from 'express';
import { log, error as logError } from '../../utils/logger.js';

/**
 * Роуты для авторизации через Discord ID + Telegram-код
 */
export function createAuthRouter(db, telegram) {
  const router = Router();

  /**
   * POST /api/auth/request-login
   * Запрос на вход: проверяем есть ли TG, если да — отправляем код
   * Body: { userId: string }
   * Response:
   *   { requiresCode: false }                  — TG не привязан, вход без кода
   *   { requiresCode: true }                   — код отправлен в TG
   *   { error: string }                        — ошибка
   */
  router.post('/request-login', async (req, res) => {
    const { userId } = req.body;

    if (!userId || typeof userId !== 'string' || !/^\d{17,20}$/.test(userId)) {
      return res.status(400).json({ error: 'Некорректный Discord ID' });
    }

    try {
      // Проверяем есть ли привязанный Telegram
      const telegramUser = db.prepare(
        'SELECT telegram_chat_id FROM telegram_users WHERE user_id = ? AND started_bot = 1'
      ).get(userId);

      if (!telegramUser || !telegramUser.telegram_chat_id) {
        // TG не привязан — вход без кода, сразу устанавливаем сессию
        req.session.userId = userId;
        req.session.save();
        return res.json({ requiresCode: false });
      }

      // Генерируем 6-значный код
      const code = generateLoginCode(db, userId);

      // Отправляем код в Telegram
      const message =
        `🔐 <b>Код для входа на сайт</b>\n\n` +
        `Ваш код: <code>${code}</code>\n\n` +
        `⏱ Действителен 5 минут\n` +
        `⚠️ Никому не сообщайте этот код`;

      await telegram.sendTelegramMessageToUser(telegramUser.telegram_chat_id, message);

      log(`🔐 Код входа отправлен в TG для userId: ${userId}`);

      return res.json({ requiresCode: true });
    } catch (error) {
      logError(`Ошибка при запросе входа: ${error.message}`);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  /**
   * POST /api/auth/verify-login
   * Проверка кода из Telegram
   * Body: { userId: string, code: string }
   * Response:
   *   { success: true }   — код верный
   *   { error: string }   — ошибка
   */
  router.post('/verify-login', (req, res) => {
    const { userId, code } = req.body;

    if (!userId || typeof userId !== 'string' || !/^\d{17,20}$/.test(userId)) {
      return res.status(400).json({ error: 'Некорректный Discord ID' });
    }

    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Некорректный код' });
    }

    try {
      const now = new Date().toISOString();
      const record = db.prepare(
        'SELECT user_id, expires_at, used FROM login_codes WHERE code = ? AND user_id = ?'
      ).get(code, userId);

      if (!record) {
        return res.status(400).json({ error: 'Неверный код' });
      }

      if (record.used) {
        return res.status(400).json({ error: 'Код уже использован' });
      }

      if (record.expires_at < now) {
        return res.status(400).json({ error: 'Код истёк' });
      }

      // Помечаем код как использованный
      db.prepare('UPDATE login_codes SET used = 1 WHERE code = ?').run(code);

      // Устанавливаем сессию
      req.session.userId = userId;
      req.session.save();

      log(`✅ Успешный вход через TG-код для userId: ${userId}`);

      return res.json({ success: true });
    } catch (error) {
      logError(`Ошибка при проверке кода входа: ${error.message}`);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  return router;
}

/**
 * Генерация 6-значного кода для входа (TTL 5 минут)
 */
function generateLoginCode(db, userId) {
  // Удаляем старые неиспользованные коды этого пользователя
  db.prepare('DELETE FROM login_codes WHERE user_id = ? AND used = 0').run(userId);

  let code;
  let attempts = 0;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    attempts++;
    if (attempts > 100) throw new Error('Не удалось сгенерировать уникальный код');
  } while (db.prepare('SELECT code FROM login_codes WHERE code = ?').get(code));

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO login_codes (code, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(code, userId, expiresAt);

  return code;
}
