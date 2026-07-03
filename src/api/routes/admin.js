import { Router } from 'express';
import { log, error as logError } from '../../utils/logger.js';
import { formatTime } from '../../utils/time.js';

/**
 * Роуты для админ-панели
 */
export function createAdminRouter(db, discordClient, telegram, notificationService) {
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

    log(`📝 Запрос на создание достижения: ${name} для ${userId}`);

    if (!emoji || !name || !description || !type || !userId) {
      logError('❌ Отсутствуют обязательные поля');
      return res.status(400).json({ error: 'Отсутствуют обязательные поля' });
    }

    if (type !== 'special') {
      logError('❌ Тип должен быть "special"');
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

      // Проверяем, нужно ли отправлять уведомления сейчас
      const shouldNotifyNow = !specialDate || new Date(specialDate) <= new Date();

      if (shouldNotifyNow) {
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

        // Отправляем уведомление в Telegram
        if (telegram) {
          await telegram.sendSpecialAchievement(
            username,
            userId,
            emoji,
            name,
            description,
            color,
            unlockedTime,
            db
          );
        }

        // Отправляем уведомление в Discord канал
        if (notificationService) {
          await notificationService.sendSpecialAchievementToDiscordChannel(
            userId,
            username,
            emoji,
            name,
            description
          );
        }
      } else {
        log(`⏰ Достижение запланировано на ${new Date(specialDate).toLocaleString('ru-RU')}, уведомления будут отправлены позже`);
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
      // Получаем информацию о достижении перед удалением
      let achievementName = achievementId;
      let achievementPoints = 0;

      // Проверяем обычные достижения
      const regularAchievements = {
        first_join: { name: '🎤 Малыш заговорил', points: 10 },
        first_afk: { name: '😴 Первый сон', points: 5 },
        first_message: { name: '💬 Первые буквы', points: 10 },
        first_settings: { name: '⚙️ Первые настройки', points: 10 },
        first_web_visit: { name: '🌐 Первый серфер', points: 15 },
        first_stream: { name: '📡 Первый стример', points: 20 },
        voice_starter: { name: '🎧 Алло, это я', points: 50 },
        voice_addict: { name: '🎧 Заболтал до сотки', points: 100 },
        voice_god: { name: '🎧 Звезда эфира', points: 1000 },
        chatty_beginner: { name: '💬 Разговорчивый новичок', points: 25 },
        chatty_user: { name: '💬 Болтун', points: 75 },
        flooter: { name: '💬 Флудер', points: 100 },
        linguist: { name: '💬 Лингвист', points: 150 },
        session_beginner: { name: '🎯 Начинающий участник', points: 15 },
        session_veteran: { name: '🎯 Опытный участник', points: 40 },
        session_master: { name: '🎯 Мастер сессий', points: 75 },
        frequent_guest: { name: '🎯 Частый гость', points: 150 },
        permanent_resident: { name: '🎯 Постоянный житель', points: 350 },
        session_lord: { name: '🎯 Властелин сессий', points: 1000 },
        afk_beginner: { name: '😴 AFK новичок', points: 10 },
        afk_veteran: { name: '😴 AFK ветеран', points: 50 },
        afk_master: { name: '😴 AFK Специалист', points: 100 },
        afk_time_lord: { name: '😴 AFK Повелитель времени', points: 1000 },
        no_afk_week: { name: '💪 Железная воля', points: 50 },
        mute_master: { name: '🎙️ Мастер тишины', points: 25 },
        long_session: { name: '⏰ Марафонец', points: 75 },
        voice_vegetable: { name: '🥦 Биомебель войса', points: 150 },
        settings_explorer: { name: '⚙️ Исследователь настроек', points: 30 },
        mention_responder: { name: '📢 Отзывчивый', points: 100 },
        stream_viewer_1: { name: '📺 Одним глазком', points: 10 },
        stream_viewer_2: { name: '📺 Зритель со стажем', points: 50 },
        stream_viewer_3: { name: '📺 Топовый зритель', points: 100 },
        stream_viewer_4: { name: '📺 Киберфанат', points: 200 },
        stream_viewer_5: { name: '📺 Бессмертный зритель', points: 500 },
        stream_viewer_6: { name: '📺 Легенда трансляций', points: 1000 }
      };

      if (regularAchievements[achievementId]) {
        achievementName = regularAchievements[achievementId].name;
        achievementPoints = regularAchievements[achievementId].points;
      } else {
        // Проверяем специальные достижения
        const specialAch = db.prepare(
          'SELECT emoji, name FROM achievements WHERE achievement_id = ?'
        ).get(achievementId);
        
        if (specialAch) {
          achievementName = `${specialAch.emoji} ${specialAch.name}`;
          achievementPoints = 0; // Специальные достижения не дают очков
        }
      }

      // Удаляем достижение
      db.deleteAchievement(userId, achievementId);
      log(`🗑️ Достижение ${achievementName} удалено у пользователя ${userId}`);

      // Отправляем уведомление в Telegram
      if (telegram) {
        const user = await discordClient.users.fetch(userId).catch(() => null);
        const username = user ? user.username : 'Неизвестный пользователь';
        
        await telegram.sendAchievementDeleteNotification(username, achievementName, achievementPoints);
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
        deletedUserId: userId, // Возвращаем ID для очистки на фронтенде
      });
    } catch (error) {
      logError(`Ошибка при удалении пользователя: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/admin/restore-user
   * Восстановить удаленного пользователя
   */
  router.post('/restore-user', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    try {
      // Удаляем из списка удаленных
      db.prepare('DELETE FROM deleted_users WHERE user_id = ?').run(userId);
      
      log(`🔄 Пользователь ${userId} восстановлен после удаления`);
      
      // Пытаемся обновить имя и аватарку сразу после восстановления
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
            
            // Загружаем аватарку
            const localAvatarPath = await downloadAvatar(userId, discordAvatarUrl);
            
            // Обновляем имя и аватарку если пользователь уже создан
            db.prepare('UPDATE user_stats SET username = ?, avatar_url = ? WHERE user_id = ?')
              .run(username, localAvatarPath, userId);
            
            log(`✅ Имя и аватарка восстановленного пользователя обновлены: ${username}`);
          }
        }
      } catch (updateError) {
        logError(`Ошибка обновления данных: ${updateError.message}`);
      }

      res.json({
        success: true,
        message: 'Пользователь восстановлен',
      });
    } catch (error) {
      logError(`Ошибка при восстановлении пользователя: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

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

  /**
   * POST /api/admin/backup-database
   * Создать бэкап обеих баз данных
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

      // Бэкап afkbot.db
      const afkbotPath = path.join(backupDir, `afkbot-backup-${timestamp}.db`);
      fs.copyFileSync(process.env.DB_FILE || 'afkbot.db', afkbotPath);

      // Бэкап games.db
      const gamesPath = path.join(backupDir, `games-backup-${timestamp}.db`);
      const gamesDbFile = process.env.GAMES_DB_FILE || 'games.db';
      if (fs.existsSync(gamesDbFile)) {
        fs.copyFileSync(gamesDbFile, gamesPath);
      }

      log(`💾 Бэкап создан: afkbot-backup-${timestamp}.db, games-backup-${timestamp}.db`);

      res.json({
        success: true,
        message: 'Бэкап успешно создан',
        files: [
          `afkbot-backup-${timestamp}.db`,
          fs.existsSync(gamesPath) ? `games-backup-${timestamp}.db` : null,
        ].filter(Boolean),
      });
    } catch (error) {
      logError(`Ошибка при создании бэкапа: ${error.message}`);
      res.status(500).json({ error: 'Failed to create backup' });
    }
  });

  /**
   * GET /api/admin/backups
   * Список бэкапов с метаданными
   */
  router.get('/backups', async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const backupDir = './backup';
      if (!fs.existsSync(backupDir)) {
        return res.json({ backups: [], totalSize: 0 });
      }

      const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      const backups = [];

      // Группируем по timestamp
      const grouped = {};
      for (const file of files) {
        const match = file.match(/^(afkbot|games)-backup-(.+)\.db$/);
        if (match) {
          const type = match[1];
          const timestamp = match[2];
          if (!grouped[timestamp]) grouped[timestamp] = { timestamp, files: [] };
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);
          grouped[timestamp].files.push({
            name: file,
            type,
            size: stats.size,
            createdAt: stats.birthtime,
          });
        }
      }

      let totalSize = 0;
      for (const group of Object.values(grouped)) {
        const groupSize = group.files.reduce((sum, f) => sum + f.size, 0);
        totalSize += groupSize;
        backups.push({
          timestamp: group.timestamp,
          files: group.files,
          totalSize: groupSize,
          date: group.files[0]?.createdAt,
        });
      }

      backups.sort((a, b) => new Date(b.date) - new Date(a.date));

      res.json({ backups, totalSize });
    } catch (error) {
      logError(`Ошибка получения списка бэкапов: ${error.message}`);
      res.status(500).json({ error: 'Failed to list backups' });
    }
  });

  /**
   * POST /api/admin/restore-database
   * Восстановить из бэкапа
   */
  router.post('/restore-database', async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const { timestamp } = req.body;
      if (!timestamp) {
        return res.status(400).json({ error: 'timestamp required' });
      }

      const backupDir = './backup';
      const afkbotBackup = path.join(backupDir, `afkbot-backup-${timestamp}.db`);
      const gamesBackup = path.join(backupDir, `games-backup-${timestamp}.db`);

      if (!fs.existsSync(afkbotBackup)) {
        return res.status(404).json({ error: 'Бэкап не найден' });
      }

      // Восстанавливаем afkbot.db
      fs.copyFileSync(afkbotBackup, process.env.DB_FILE || 'afkbot.db');

      // Восстанавливаем games.db если есть
      const gamesDbFile = process.env.GAMES_DB_FILE || 'games.db';
      if (fs.existsSync(gamesBackup)) {
        fs.copyFileSync(gamesBackup, gamesDbFile);
      }

      log(`💾 БД восстановлена из бэкапа: ${timestamp}`);

      res.json({ success: true, message: 'БД восстановлена. Перезапустите сервер.' });
    } catch (error) {
      logError(`Ошибка восстановления: ${error.message}`);
      res.status(500).json({ error: 'Failed to restore' });
    }
  });

  /**
   * DELETE /api/admin/backups/:filename
   * Удалить файл бэкапа
   */
  router.delete('/backups/:filename', async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const { filename } = req.params;
      // Безопасность: только .db файлы из папки backup
      if (!filename.endsWith('.db') || filename.includes('..')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      const filePath = path.join('./backup', filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Файл не найден' });
      }

      fs.unlinkSync(filePath);
      log(`💾 Бэкап удалён: ${filename}`);

      res.json({ success: true });
    } catch (error) {
      logError(`Ошибка удаления бэкапа: ${error.message}`);
      res.status(500).json({ error: 'Failed to delete' });
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
        updated: updatedCount,
        total: allUsers.length,
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
      let errorCount = 0;

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
          errorCount++;
        }
      }

      log(`✅ Загружено аватарок: ${downloadedCount}`);

      res.json({
        success: true,
        message: `Загружено ${downloadedCount} аватарок`,
        downloaded: downloadedCount,
        errors: errorCount,
        total: allUsers.length,
      });
    } catch (error) {
      logError(`Ошибка при загрузке аватарок: ${error.message}`);
      res.status(500).json({ error: 'Failed to download avatars' });
    }
  });

  /**
   * POST /api/admin/delete-user-messages
   * Удалить сообщения пользователя в Discord
   */
  router.post('/delete-user-messages', async (req, res) => {
    const { userId, hours, includeVoiceChats } = req.body;

    if (!userId || hours === undefined) {
      return res.status(400).json({ error: 'Отсутствуют обязательные поля' });
    }

    try {
      log(`🗑️ Удаление сообщений пользователя ${userId} за ${hours === 0 ? 'все время' : hours + ' часов'}${includeVoiceChats ? ' (включая голосовые каналы)' : ''}...`);

      const guild = discordClient.guilds.cache.first();
      if (!guild) {
        return res.status(500).json({ error: 'Guild not found' });
      }

      // Вычисляем временную метку
      const now = Date.now();
      const cutoffTime = hours === 0 ? 0 : now - (hours * 60 * 60 * 1000);

      let deletedCount = 0;
      const errorsList = [];
      const skippedChannels = [];

      // Получаем текстовые каналы и опционально голосовые
      let channels;
      if (includeVoiceChats) {
        // 0 = GUILD_TEXT, 2 = GUILD_VOICE
        channels = guild.channels.cache.filter(channel => channel.type === 0 || channel.type === 2);
        log(`  📊 Найдено каналов: ${channels.size} (текстовые + голосовые)`);
      } else {
        channels = guild.channels.cache.filter(channel => channel.type === 0); // 0 = GUILD_TEXT
        log(`  📊 Найдено текстовых каналов: ${channels.size}`);
      }

      for (const [channelId, channel] of channels) {
        try {
          const channelTypeEmoji = channel.type === 2 ? '🎤' : '📝';
          log(`  ${channelTypeEmoji} Проверка канала: ${channel.name}`);
          
          // Проверяем права на просмотр канала
          if (!channel.viewable) {
            const errorMsg = `Нет доступа к каналу`;
            errorsList.push(`#${channel.name}: ${errorMsg}`);
            logError(`  ⚠️ ${errorMsg}`);
            continue;
          }

          // Проверяем права на управление сообщениями
          const permissions = channel.permissionsFor(discordClient.user);
          if (!permissions || !permissions.has('ManageMessages')) {
            const errorMsg = `Нет прав на удаление сообщений`;
            errorsList.push(`#${channel.name}: ${errorMsg}`);
            logError(`  ⚠️ ${errorMsg}`);
            continue;
          }
          
          // Получаем сообщения пользователя
          let messages = await channel.messages.fetch({ limit: 100 });
          let userMessages = messages.filter(msg => 
            msg.author.id === userId && 
            (hours === 0 || msg.createdTimestamp >= cutoffTime)
          );

          if (userMessages.size === 0) {
            log(`  ℹ️ Нет сообщений пользователя в ${channel.name}`);
            continue;
          }

          // Удаляем сообщения
          let channelDeletedCount = 0;
          let channelErrorCount = 0;

          for (const [msgId, msg] of userMessages) {
            try {
              const messageAge = now - msg.createdTimestamp;
              const twoWeeks = 14 * 24 * 60 * 60 * 1000;

              if (messageAge > twoWeeks) {
                // Сообщение старше 2 недель - удаляем по одному
                await msg.delete();
                deletedCount++;
                channelDeletedCount++;
                // Задержка чтобы не превысить rate limit
                await new Promise(resolve => setTimeout(resolve, 1000));
              } else {
                // Сообщение новее 2 недель
                await msg.delete();
                deletedCount++;
                channelDeletedCount++;
              }
            } catch (err) {
              channelErrorCount++;
              const errorMsg = `Ошибка удаления сообщения: ${err.message}`;
              errorsList.push(`#${channel.name}: ${errorMsg}`);
              logError(`  ❌ ${errorMsg}`);
            }
          }

          log(`  ✅ Удалено ${channelDeletedCount}/${userMessages.size} сообщений в ${channel.name}${channelErrorCount > 0 ? ` (ошибок: ${channelErrorCount})` : ''}`);
        } catch (err) {
          const errorMsg = `Ошибка доступа к каналу: ${err.message}`;
          errorsList.push(`#${channel.name}: ${errorMsg}`);
          logError(`  ❌ ${errorMsg}`);
        }
      }

      log(`✅ Всего удалено сообщений: ${deletedCount}`);
      log(`📊 Проверено каналов: ${channels.size}`);
      log(`❌ Ошибок: ${errorsList.length}`);

      if (telegram) {
        const user = await discordClient.users.fetch(userId).catch(() => null);
        const username = user ? user.username : 'Неизвестный пользователь';
        
        const periodText = hours === 0 ? 'все сообщения' : `сообщения за ${hours} ч.`;
        await telegram.sendReport(
          `🗑️ <b>Удалены сообщения пользователя</b>\n\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📊 Период: ${periodText}\n` +
          `✅ Удалено: ${deletedCount} сообщений\n` +
          `❌ Ошибок: ${errorsList.length}\n` +
          `📅 Время: ${new Date().toLocaleString('ru-RU')}`
        );
      }

      res.json({
        success: true,
        message: `Удалено ${deletedCount} сообщений`,
        deletedCount,
        errorsList,
      });
    } catch (error) {
      logError(`Ошибка при удалении сообщений: ${error.message}`);
      res.status(500).json({ error: 'Ошибка при удалении сообщений' });
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
