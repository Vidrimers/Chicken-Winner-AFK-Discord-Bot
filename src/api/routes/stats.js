import { Router } from 'express';
import { log, error as logError } from '../../utils/logger.js';

/**
 * Роуты для статистики пользователей
 */
export function createStatsRouter(db, discordClient, telegram) {
  const router = Router();

  /**
   * GET /api/stats/:userId
   * Получить статистику пользователя
   */
  router.get('/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      
      // Проверяем был ли пользователь удален
      if (db.isUserDeleted(userId)) {
        return res.json({
          userDeleted: true,
          message: 'Пользователь был удален из базы данных',
        });
      }
      
      let stats = db.getUserStats(userId);

      // Если пользователя нет в БД, создаем его
      if (!stats) {
        log(`📝 Новый пользователь ${userId} зашел на сайт, создаем запись...`);

        try {
          const guild = discordClient.guilds.cache.first();
          if (guild) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
              const username = member.displayName || member.user.username;
              const discordAvatarUrl = member.user.displayAvatarURL({
                format: 'png',
                size: 128,
              });
              const localAvatarPath = await downloadAvatar(userId, discordAvatarUrl);

              db.initUserStats(userId, username, localAvatarPath);
              stats = db.getUserStats(userId);
              log(`✅ Создан пользователь ${username} (${userId}) с аватаркой`);
            } else {
              log(`⚠️ Пользователь ${userId} не найден на сервере Discord`);

              if (telegram) {
                await telegram.sendNotOnServerAttempt(userId, new Date().toLocaleString('ru-RU'));
              }

              return res.json({
                notOnServer: true,
                message: 'Пользователь не найден на Discord сервере',
              });
            }
          } else {
            db.initUserStats(userId, 'Web User', '/avatars/nopic.png');
            stats = db.getUserStats(userId);
          }
        } catch (error) {
          logError(`Ошибка при создании пользователя ${userId}: ${error.message}`);
          db.initUserStats(userId, 'Web User', '/avatars/nopic.png');
          stats = db.getUserStats(userId);
        }
      }

      const achievements = db.getUserAchievements(userId);
      const settings = {
        dmNotifications: db.getUserDMSetting(userId),
        afkTimeout: db.getUserTimeout(userId),
        achievementNotifications: db.getUserAchievementNotificationSetting(userId),
        theme: db.getUserTheme(userId),
        secretThemeActivated: db.getSecretThemeActivated(userId),
        channelNotifications: db.getUserChannelNotificationSetting(userId),
      };

      res.json({
        stats: stats || {},
        achievements,
        settings,
      });
    } catch (error) {
      logError(`Ошибка в API /api/stats: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/leaderboard
   * Получить топ пользователей
   */
  router.get('/leaderboard', (req, res) => {
    try {
      const topUsers = db.getTopUsers(20);
      res.json(topUsers);
    } catch (error) {
      logError(`Ошибка в API /api/leaderboard: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/online-status
   * Получить онлайн статусы пользователей
   */
  router.get('/online-status', (req, res) => {
    try {
      const guild = discordClient.guilds.cache.first();
      if (!guild) {
        return res.json({});
      }

      const onlineStatuses = {};
      guild.members.cache.forEach((member) => {
        if (member.presence?.status && member.presence.status !== 'offline') {
          onlineStatuses[member.id] = member.presence.status;
        }
      });

      res.json(onlineStatuses);
    } catch (error) {
      logError(`Ошибка при получении онлайн статусов: ${error.message}`);
      res.json({});
    }
  });

  /**
   * POST /api/visit/:userId
   * Отметить посещение веб-панели
   */
  router.post('/visit/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      
      db.initUserStats(userId, 'Web User');
      db.incrementUserStat(userId, 'web_visits');

      const stats = db.getUserStats(userId);
      if (stats && stats.web_visits === 1) {
        // Проверяем достижение за первое посещение
        const guild = discordClient.guilds.cache.first();
        if (guild) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            const username = member.displayName || member.user.username;
            // Здесь нужно вызвать achievements.checkAndUnlock
            // Но мы передадим это через параметр
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
      logError(`Ошибка в API /api/visit: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

/**
 * Скачать аватар пользователя
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
