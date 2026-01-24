import { Router } from 'express';
import { log, error as logError } from '../../utils/logger.js';
import { formatTime } from '../../utils/time.js';

/**
 * Роуты для админ-панели
 */
export function createAdminRouter(db, discordClient, telegram) {
  const router = Router();

  /**
   * GET /api/admin/users
   * Получить список всех пользователей
   */
  router.get('/users', (req, res) => {
    try {
      const stmt = db.prepare(`
        SELECT user_id, username, total_sessions, total_voice_time, rank_points
        FROM user_stats
        ORDER BY username ASC
      `);
      const users = stmt.all();
      res.json(users);
    } catch (error) {
      logError(`Ошибка при получении пользователей: ${error.message}`);
      res.status(500).json({ error: 'Ошибка при получении пользователей' });
    }
  });

  /**
   * POST /api/admin/create-achievement
   * Создать специальное достижение
   */
  router.post('/create-achievement', async (req, res) => {
    const { emoji, name, description, type, userId, specialDate, color } = req.body;

    if (!emoji || !name || !description || !type || !userId) {
      return res.status(400).json({ error: 'Отсутствуют обязательные поля' });
    }

    if (type !== 'special') {
      return res.status(400).json({ error: 'Тип должен быть "special"' });
    }

    try {
      const achievementId = 'special_' + Date.now() + '_' + Math.random().toString(36).substring(7);
      
      db.initUserStats(userId, 'Special Achievement User');

      db.prepare(
        `INSERT INTO achievements (achievement_id, user_id, emoji, name, description, type, color, special_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(achievementId, userId, emoji, name, description, type, color, specialDate || null);

      const unlockedTime = specialDate || new Date().toISOString();
      db.prepare(
        `INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
         VALUES (?, ?, ?)`
      ).run(userId, achievementId, unlockedTime);

      log(`✅ Специальное достижение создано: ${name} для ${userId}`);

      if (telegram) {
        const user = await discordClient.users.fetch(userId).catch(() => null);
        const username = user ? user.username : 'Неизвестный пользователь';
        
        await telegram.sendSpecialAchievement(
          username,
          userId,
          emoji,
          name,
          description,
          color,
          unlockedTime
        );
      }

      res.json({
        success: true,
        achievementId: achievementId,
        message: 'Специальное достижение успешно создано',
      });
    } catch (error) {
      logError(`Ошибка при создании достижения: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/admin/delete-achievement
   * Удалить достижение у пользователя
   */
  router.post('/delete-achievement', async (req, res) => {
    const { userId, achievementId } = req.body;

    if (!userId || !achievementId) {
      return res.status(400).json({ error: 'Отсутствуют обязательные поля' });
    }

    try {
      db.deleteAchievement(userId, achievementId);
      log(`🗑️ Достижение ${achievementId} удалено у пользователя ${userId}`);

      if (telegram) {
        const user = await discordClient.users.fetch(userId).catch(() => null);
        const username = user ? user.username : 'Неизвестный пользователь';
        
        await telegram.sendAchievementDelete(username, userId, achievementId);
      }

      res.json({
        success: true,
        message: 'Достижение успешно удалено',
      });
    } catch (error) {
      logError(`Ошибка при удалении достижения: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/admin/edit-achievement
   * Редактировать специальное достижение
   */
  router.post('/edit-achievement', async (req, res) => {
    const { achievementId, emoji, name, description, color } = req.body;

    if (!achievementId || !emoji || !name || !description) {
      return res.status(400).json({ error: 'Отсутствуют обязательные поля' });
    }

    try {
      db.prepare(
        `UPDATE achievements 
         SET emoji = ?, name = ?, description = ?, color = ?
         WHERE achievement_id = ?`
      ).run(emoji, name, description, color, achievementId);

      log(`✏️ Достижение ${achievementId} отредактировано`);

      res.json({
        success: true,
        message: 'Достижение успешно отредактировано',
      });
    } catch (error) {
      logError(`Ошибка при редактировании достижения: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/admin/delete-user
   * Удалить пользователя
   */
  router.post('/delete-user', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    try {
      const user = await discordClient.users.fetch(userId).catch(() => null);
      const username = user ? user.username : 'Неизвестный пользователь';

      db.deleteUser(userId);
      log(`🗑️ Пользователь ${username} (${userId}) удален из базы данных`);

      if (telegram) {
        await telegram.sendUserDelete(username, userId);
      }

      res.json({
        success: true,
        message: `Пользователь ${username} успешно удален`,
      });
    } catch (error) {
      logError(`Ошибка при удалении пользователя: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/admin/backup-database
   * Создать бэкап базы данных
   */
  router.post('/backup-database', async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const backupDir = './backup';
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const backupPath = path.join(backupDir, `afkbot-backup-${timestamp}.db`);

      fs.copyFileSync('./afkbot.db', backupPath);

      log(`💾 Бэкап базы данных создан: ${backupPath}`);

      res.json({
        success: true,
        message: 'Бэкап успешно создан',
        filename: `afkbot-backup-${timestamp}.db`,
      });
    } catch (error) {
      logError(`Ошибка при создании бэкапа: ${error.message}`);
      res.status(500).json({ error: 'Failed to create backup' });
    }
  });

  /**
   * POST /api/admin/update-names
   * Обновить имена пользователей
   */
  router.post('/update-names', async (req, res) => {
    try {
      log('🔄 Обновление имен пользователей...');

      const guild = discordClient.guilds.cache.first();
      if (!guild) {
        return res.status(500).json({ error: 'Guild not found' });
      }

      const allUsers = db.prepare('SELECT user_id, username FROM user_stats').all();
      let updatedCount = 0;

      for (const user of allUsers) {
        try {
          const member = await guild.members.fetch(user.user_id).catch(() => null);
          if (member) {
            const newName = member.displayName || member.user.username;
            if (newName !== user.username) {
              db.prepare('UPDATE user_stats SET username = ? WHERE user_id = ?').run(
                newName,
                user.user_id
              );
              updatedCount++;
            }
          }
        } catch (err) {
          // Пропускаем пользователей которых не удалось найти
        }
      }

      log(`✅ Обновлено имен: ${updatedCount}`);

      res.json({
        success: true,
        message: `Обновлено ${updatedCount} имен`,
        updatedCount,
      });
    } catch (error) {
      logError(`Ошибка при обновлении имен: ${error.message}`);
      res.status(500).json({ error: 'Failed to update names' });
    }
  });

  /**
   * POST /api/admin/download-avatars
   * Загрузить аватарки пользователей
   */
  router.post('/download-avatars', async (req, res) => {
    try {
      log('📥 Загрузка аватарок...');

      const guild = discordClient.guilds.cache.first();
      if (!guild) {
        return res.status(500).json({ error: 'Guild not found' });
      }

      const allUsers = db.prepare('SELECT user_id FROM user_stats').all();
      let downloadedCount = 0;

      for (const user of allUsers) {
        try {
          const member = await guild.members.fetch(user.user_id).catch(() => null);
          if (member) {
            const avatarUrl = member.user.displayAvatarURL({ format: 'png', size: 128 });
            const localPath = await downloadAvatar(user.user_id, avatarUrl);
            
            if (localPath !== '/avatars/nopic.png') {
              db.prepare('UPDATE user_stats SET avatar_url = ? WHERE user_id = ?').run(
                localPath,
                user.user_id
              );
              downloadedCount++;
            }
          }
        } catch (err) {
          // Пропускаем
        }
      }

      log(`✅ Загружено аватарок: ${downloadedCount}`);

      res.json({
        success: true,
        message: `Загружено ${downloadedCount} аватарок`,
        downloadedCount,
      });
    } catch (error) {
      logError(`Ошибка при загрузке аватарок: ${error.message}`);
      res.status(500).json({ error: 'Failed to download avatars' });
    }
  });

  return router;
}

/**
 * Скачать аватар
 */
async function downloadAvatar(userId, avatarUrl) {
  try {
    if (!avatarUrl || avatarUrl.includes('nopic.png') || avatarUrl.startsWith('/avatars/')) {
      return '/avatars/nopic.png';
    }

    const fs = await import('fs');
    const path = await import('path');
    const https = await import('https');

    const avatarsDir = './avatars';
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    const localPath = path.join(avatarsDir, `${userId}.png`);

    return new Promise((resolve) => {
      https.get(avatarUrl, (response) => {
        const fileStream = fs.createWriteStream(localPath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(`/avatars/${userId}.png`);
        });
      }).on('error', () => {
        resolve('/avatars/nopic.png');
      });
    });
  } catch (err) {
    return '/avatars/nopic.png';
  }
}
