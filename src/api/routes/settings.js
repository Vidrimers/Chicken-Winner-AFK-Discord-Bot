import { Router } from 'express';
import { log, error as logError } from '../../utils/logger.js';
import { formatTime } from '../../utils/time.js';

/**
 * Роуты для настроек пользователей
 */
export function createSettingsRouter(db, discordClient, achievements, telegram, notificationService) {
  const router = Router();

  /**
   * POST /api/settings/:userId
   * Сохранить настройки пользователя
   */
  router.post('/:userId', async (req, res) => {
    const userId = req.params.userId;
    const {
      dmNotifications,
      afkTimeout,
      achievementNotifications,
      theme,
      channelNotifications,
      settingName, // Имя изменённой настройки
    } = req.body;

    try {
      db.initUserStats(userId, 'Web User');

      const currentDM = db.getUserDMSetting(userId);
      const currentTimeout = db.getUserTimeout(userId);
      let settingsChanged = false;
      let changedSettingText = ''; // Текст изменённой настройки

      if (dmNotifications !== undefined && dmNotifications !== currentDM) {
        db.setUserDMSetting(userId, dmNotifications);
        settingsChanged = true;
        changedSettingText = `📩 ЛС уведомления: ${dmNotifications ? '✅ включены' : '❌ отключены'}`;
      }

      if (
        afkTimeout !== undefined &&
        [10, 15, 30, 45].includes(afkTimeout) &&
        afkTimeout !== currentTimeout
      ) {
        db.setUserTimeout(userId, afkTimeout);
        settingsChanged = true;
        const timeoutDisplay = afkTimeout < 15 ? `${afkTimeout} секунд` : `${afkTimeout} минут`;
        changedSettingText = `⏱️ Таймер AFK: ${timeoutDisplay}`;
      }

      if (achievementNotifications !== undefined) {
        const currentAchievementNotifications = db.getUserAchievementNotificationSetting(userId);
        if (achievementNotifications !== currentAchievementNotifications) {
          db.setUserAchievementNotificationSetting(userId, achievementNotifications);
          settingsChanged = true;
          changedSettingText = `🏆 Уведомления о достижениях: ${achievementNotifications ? '✅ включены' : '❌ отключены'}`;
        }
      }

      if (theme !== undefined) {
        db.exec(`UPDATE user_settings SET theme = '${theme}' WHERE user_id = '${userId}'`);
        
        const themeNames = {
          standard: '🎨 Стандарт',
          metal: '⚙️ Металл',
          discord: '💬 Дискорд',
          steam: '🎮 Стим',
          'die-my-darling': '💀 Die My Darling',
        };
        changedSettingText = `🎨 Тема оформления: ${themeNames[theme] || theme}`;
        
        // Если выбрана секретная тема, активируем флаг
        if (theme === 'die-my-darling') {
          const result = db.prepare(
            'SELECT secret_theme_activated FROM user_settings WHERE user_id = ?'
          ).get(userId);
          
          // Активируем только если еще не активирована
          if (!result || !result.secret_theme_activated) {
            db.prepare(
              'UPDATE user_settings SET secret_theme_activated = 1 WHERE user_id = ?'
            ).run(userId);
            
            log(`🎉 Секретная тема активирована для userId: ${userId}`);
            
            // Создаем достижение
            try {
              const guild = discordClient.guilds.cache.first();
              let username = 'Неизвестный пользователь';
              
              if (guild) {
                try {
                  const member = await guild.members.fetch(userId);
                  username = member.displayName || member.user.username;
                } catch (err) {
                  const user = await discordClient.users.fetch(userId).catch(() => null);
                  username = user ? user.username : 'Неизвестный пользователь';
                }
              }
              
              const achievementId = 'secret_theme_' + Date.now() + '_' + Math.random().toString(36).substring(7);
              const nowMoscowISO = new Date().toISOString();
              
              db.prepare(
                `INSERT INTO achievements (achievement_id, user_id, emoji, name, description, type, color, special_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              ).run(
                achievementId,
                userId,
                '🎨',
                'Секретная тема',
                'Открыл секретную тему',
                'special',
                '#8b0000',
                nowMoscowISO
              );
              
              db.prepare(
                `INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
                 VALUES (?, ?, ?)`
              ).run(userId, achievementId, nowMoscowISO);
              
              // Отправляем уведомление в Telegram
              if (telegram) {
                await telegram.sendSpecialAchievement(
                  username,
                  userId,
                  '🎨',
                  'Секретная тема',
                  'Открыл секретную тему',
                  '#8b0000',
                  nowMoscowISO,
                  db
                );
              }

              // Отправляем уведомление в Discord канал
              if (notificationService) {
                await notificationService.sendSpecialAchievementToDiscordChannel(
                  userId,
                  username,
                  '🎨',
                  'Секретная тема',
                  'Открыл секретную тему'
                );
              }
            } catch (achievementError) {
              logError(`Ошибка при создании достижения: ${achievementError.message}`);
            }
          }
        }
        
        settingsChanged = true;
      }

      if (channelNotifications !== undefined) {
        const currentChannelNotifications = db.getUserChannelNotificationSetting(userId);
        if (channelNotifications !== currentChannelNotifications) {
          db.setUserChannelNotificationSetting(userId, channelNotifications);
          settingsChanged = true;
          changedSettingText = `🔔 Уведомления "Кто в канале": ${channelNotifications ? '✅ включены' : '❌ отключены'}`;
        }
      }

      if (settingsChanged) {
        db.incrementUserStat(userId, 'settings_changes');

        try {
          const user = await discordClient.users.fetch(userId).catch(() => null);
          const username = user ? user.username : 'Неизвестный пользователь';

          const stats = db.getUserStats(userId);
          if (stats && stats.settings_changes === 1) {
            await achievements.checkAndUnlock(userId, username, 'first_settings');
          }

          await achievements.checkAll(userId, username);

          // Отправляем уведомление только об изменённой настройке
          if (telegram && changedSettingText) {
            await telegram.sendSettingsChange(username, userId, changedSettingText);
          }
        } catch (error) {
          logError(`Ошибка при проверке достижений через веб-панель: ${error.message}`);
        }
      }

      res.json({ success: true });
    } catch (error) {
      logError(`Ошибка при сохранении настроек: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /activate-secret-theme/:userId
   * Активировать секретную тему
   */
  router.post('/activate-secret-theme/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
      const result = db.prepare(
        'SELECT secret_theme_activated FROM user_settings WHERE user_id = ?'
      ).get(userId);

      if (result && result.secret_theme_activated) {
        return res.json({ success: true, alreadyActivated: true });
      }

      db.prepare(
        `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications, theme, secret_theme_activated)
         VALUES (?, 
                 COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1),
                 COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
                 COALESCE((SELECT achievement_notifications FROM user_settings WHERE user_id = ?), 1),
                 COALESCE((SELECT theme FROM user_settings WHERE user_id = ?), 'standard'),
                 1)`
      ).run(userId, userId, userId, userId, userId);

      log(`🎉 Секретная тема активирована для userId: ${userId}`);

      try {
        const guild = discordClient.guilds.cache.first();
        let username = 'Неизвестный пользователь';
        
        if (guild) {
          try {
            const member = await guild.members.fetch(userId);
            username = member.displayName || member.user.username;
          } catch (err) {
            const user = await discordClient.users.fetch(userId).catch(() => null);
            username = user ? user.username : 'Неизвестный пользователь';
          }
        }

        const achievementId = 'secret_theme_' + Date.now() + '_' + Math.random().toString(36).substring(7);
        const nowMoscowISO = new Date().toISOString();

        db.prepare(
          `INSERT INTO achievements (achievement_id, user_id, emoji, name, description, type, color, special_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          achievementId,
          userId,
          '🎨',
          'Секретная тема',
          'Открыл секретную тему',
          'special',
          '#8b0000',
          nowMoscowISO
        );

        db.prepare(
          `INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
           VALUES (?, ?, ?)`
        ).run(userId, achievementId, nowMoscowISO);

        // Отправляем уведомление в Telegram
        if (telegram) {
          await telegram.sendSpecialAchievement(
            username,
            userId,
            '🎨',
            'Секретная тема',
            'Открыл секретную тему',
            '#8b0000',
            nowMoscowISO,
            db
          );
        }

        // Отправляем уведомление в Discord канал
        if (notificationService) {
          await notificationService.sendSpecialAchievementToDiscordChannel(
            userId,
            username,
            '🎨',
            'Секретная тема',
            'Открыл секретную тему'
          );
        }
      } catch (achievementError) {
        logError(`Ошибка при создании достижения: ${achievementError.message}`);
      }

      res.json({ success: true, alreadyActivated: false });
    } catch (error) {
      logError(`Ошибка при активации секретной темы: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
