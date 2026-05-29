import { Router } from 'express';

export function createBlocklistRouter(db) {
  const router = Router();

  // GET /api/blocklist/:userId — получить чёрный список пользователя
  router.get('/:userId', (req, res) => {
    const { userId } = req.params;
    const blocklist = db.getUserBlocklist(userId);
    res.json(blocklist.map(b => b.blocked_user_id));
  });

  // POST /api/blocklist/:userId — добавить в чёрный список
  router.post('/:userId', (req, res) => {
    const { userId } = req.params;
    const { blockedUserId } = req.body;
    if (!blockedUserId) return res.status(400).json({ error: 'blockedUserId required' });
    db.addToBlocklist(userId, blockedUserId);
    res.json({ success: true });
  });

  // DELETE /api/blocklist/:userId/:blockedUserId — удалить из чёрного списка
  router.delete('/:userId/:blockedUserId', (req, res) => {
    const { userId, blockedUserId } = req.params;
    db.removeFromBlocklist(userId, blockedUserId);
    res.json({ success: true });
  });

  return router;
}
