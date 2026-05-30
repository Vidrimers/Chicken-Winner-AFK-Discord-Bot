import { Router } from 'express';

export function createBlocklistRouter(db, telegram, discordClient) {
  const router = Router();

  // Вспомогательная функция: получить имя пользователя из БД или Discord
  async function resolveUsername(userId) {
    const stats = db.prepare('SELECT username FROM user_stats WHERE user_id = ?').get(userId);
    if (stats?.username) return stats.username;

    // Fallback: ищем в кэше Guild
    if (discordClient) {
      try {
        const guild = discordClient.guilds.cache.first();
        if (guild) {
          const member = guild.members.cache.get(userId)
            || await guild.members.fetch(userId).catch(() => null);
          if (member) return member.displayName || member.user.username;
        }
      } catch (_) {}
    }

    return null; // имя не найдено — вернём null, вызывающий подставит ID
  }

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
        const adderName = (await resolveUsername(userId)) || userId;
        const blockedName = (await resolveUsername(blockedUserId)) || blockedUserId;

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
