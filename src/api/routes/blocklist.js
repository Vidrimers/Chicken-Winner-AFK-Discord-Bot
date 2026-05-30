import { Router } from 'express';

export function createBlocklistRouter(db, telegram) {
  const router = Router();

  // GET /api/blocklist/:userId — получить чёрный список пользователя
  router.get('/:userId', (req, res) => {
    const { userId } = req.params;
    const blocklist = db.getUserBlocklist(userId);
    res.json(blocklist.map(b => b.blocked_user_id));
  });

  // POST /api/blocklist/:userId — добавить в чёрный список
  router.post('/:userId', async (req, res) => {
    const { userId } = req.params;
    const { blockedUserId } = req.body;
    if (!blockedUserId) return res.status(400).json({ error: 'blockedUserId required' });
    if (!userId || userId === 'null' || userId === 'undefined') {
      return res.status(400).json({ error: 'Некорректный userId' });
    }

    db.addToBlocklist(userId, blockedUserId);
    console.log(`[Blocklist] Добавлен: user=${userId} blocked=${blockedUserId}`);

    // Уведомление админу в Telegram
    if (telegram && telegram.sendBlocklistAddNotification) {
      try {
        // Получаем имена из user_stats (если есть)
        const adderStats = db.prepare('SELECT username FROM user_stats WHERE user_id = ?').get(userId);
        const blockedStats = db.prepare('SELECT username FROM user_stats WHERE user_id = ?').get(blockedUserId);
        const adderName = adderStats?.username || userId;
        const blockedName = blockedStats?.username || blockedUserId;

        await telegram.sendBlocklistAddNotification(adderName, userId, blockedName, blockedUserId);
      } catch (err) {
        console.error('[Blocklist] Ошибка отправки уведомления в Telegram:', err.message);
      }
    }

    res.json({ success: true });
  });

  // DELETE /api/blocklist/:userId/:blockedUserId — удалить из чёрного списка
  router.delete('/:userId/:blockedUserId', (req, res) => {
    const { userId, blockedUserId } = req.params;
    if (!userId || userId === 'null' || userId === 'undefined') {
      return res.status(400).json({ error: 'Некорректный userId' });
    }
    db.removeFromBlocklist(userId, blockedUserId);
    console.log(`[Blocklist] Удалён: user=${userId} blocked=${blockedUserId}`);
    res.json({ success: true });
  });

  return router;
}
