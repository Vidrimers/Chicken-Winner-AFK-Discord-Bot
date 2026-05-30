import { DISCORD_CONFIG, SERVER_CONFIG, STEAM_CONFIG } from '../config.js';
import { formatDuration } from '../utils/time.js';
import { log } from '../utils/logger.js';
import { ACHIEVEMENTS } from '../achievements/definitions.js';
import { VacHandler } from './vac-handler.js';

/**
 * Класс для обработки сообщений
 */
export class MessageHandler {
  constructor(db, achievements, telegram, discordClient) {
    this.db = db;
    this.achievements = achievements;
    this.telegram = telegram;
    this.vacHandler = new VacHandler(db, discordClient, telegram);
  }

  /**
   * Обработать сообщение
   */
  async handle(message) {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();
    const userId = message.author.id;

    // Инициализируем пользователя
    await this.initUser(userId, message);

    // Увеличиваем счетчик сообщений
    this.db.incrementUserStat(userId, 'messages_sent');

    // Проверяем достижение "Первые буквы"
    const stats = this.db.getUserStats(userId);
    if (stats && stats.messages_sent === 1) {
      const username = await this.getUsername(userId, message);
      await this.achievements.checkAndUnlock(userId, username, 'first_message');
    }

    // Проверяем ответ на упоминание
    if (message.reference) {
      await this.checkMentionResponse(userId, message);
    }

    // Проверяем достижения
    const username = await this.getUsername(userId, message);
    await this.achievements.checkAll(userId, username);

    // Обрабатываем команды
    await this.handleCommands(message, content, userId, username);
  }

  /**
   * Инициализировать пользователя
   */
  async initUser(userId, message) {
    const existingUser = this.db.getUserStats(userId);
    let username = message.author.username;
    let localAvatarPath = '/avatars/nopic.png';

    if (message.guild) {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member) {
        username = member.displayName || member.user.username;

        const needsAvatar = !existingUser || 
                           !existingUser.avatar_url || 
                           existingUser.avatar_url.includes('nopic.png');

        if (needsAvatar) {
          const discordAvatarUrl = member.user.displayAvatarURL({
            format: 'png',
            size: 128,
          });
          localAvatarPath = await this.downloadAvatar(userId, discordAvatarUrl);
        }
      }
    }

    const needsAvatar = !existingUser || 
                       !existingUser.avatar_url || 
                       existingUser.avatar_url.includes('nopic.png');
    
    this.db.initUserStats(userId, username, needsAvatar ? localAvatarPath : null);
  }

  /**
   * Получить имя пользователя
   */
  async getUsername(userId, message) {
    if (message.guild) {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member) {
        return member.displayName || member.user.username;
      }
    }
    return message.author.username;
  }

  /**
   * Проверить ответ на упоминание
   */
  async checkMentionResponse(userId, message) {
    try {
      const repliedTo = await message.channel.messages.fetch(message.reference.messageId);
      const userMentioned = repliedTo.mentions.has(userId) ||
                           repliedTo.content.includes(`<@${userId}>`) ||
                           repliedTo.content.includes(`<@!${userId}>`);

      if (userMentioned) {
        this.db.incrementUserStat(userId, 'mentions_responded');
        const username = await this.getUsername(userId, message);
        await this.achievements.checkAll(userId, username);
      }
    } catch (err) {
      log(`Не удалось проверить упоминание: ${err.message}`);
    }
  }

  /**
   * Обработать команды
   */
  async handleCommands(message, content, userId, username) {
    // Команда статистики
    if (content === '.1. stats' || content === '.1. статистика') {
      await this.handleStatsCommand(message, userId);
      return;
    }

    // Команда достижений
    if (content === '.1. achievements' || content === '.1. достижения') {
      await this.handleAchievementsCommand(message, userId);
      return;
    }

    // Команды настроек
    if (content === '.1. msg on' || content === '.1. лс вкл') {
      await this.handleMsgOnCommand(message, userId, username);
      return;
    }

    if (content === '.1. msg off' || content === '.1. лс выкл') {
      await this.handleMsgOffCommand(message, userId, username);
      return;
    }

    // Команды таймера
    if (content === '.1. time 15' || content === '.1. время 15') {
      await this.handleTimeCommand(message, userId, username, 15);
      return;
    }

    if (content === '.1. time 30' || content === '.1. время 30') {
      await this.handleTimeCommand(message, userId, username, 30);
      return;
    }

    if (content === '.1. time 45' || content === '.1. время 45') {
      await this.handleTimeCommand(message, userId, username, 45);
      return;
    }

    // VAC-чекер команды (только в указанном канале)
    if (message.channel.id === STEAM_CONFIG.VAC_WATCH_CHANNEL_ID) {
      // Справка по VAC-чекеру
      if (content === '.1. vac-help') {
        await this.vacHandler.handleHelpCommand(message);
        return;
      }

      // Проверка Steam URL
      if (content.startsWith('.1. https://steamcommunity.com/') || content.startsWith('.1. http://steamcommunity.com/')) {
        const url = message.content.trim().split(/\s+/).pop();
        await this.vacHandler.handleCheckCommand(message, url);
        return;
      }

      // Список забаненных .1. vac N
      if (content.startsWith('.1. vac ')) {
        const parts = content.split(' ');
        const count = parseInt(parts[parts.length - 1], 10);
        await this.vacHandler.handleVacListCommand(message, count);
        return;
      }
    }

    // Команда помощи
    if (content === '.1.' || content === '.1. help' || content === '.1. помощь') {
      await this.handleHelpCommand(message);
      return;
    }
  }

  /**
   * Команда статистики
   */
  async handleStatsCommand(message, userId) {
    const stats = this.db.getUserStats(userId);
    const achievements = this.db.getUserAchievements(userId);

    if (!stats) {
      await message.reply('📊 У вас пока нет статистики. Начните использовать голосовые каналы!');
      return;
    }

    const voiceTime = formatDuration(stats.total_voice_time || 0);
    const longestSession = formatDuration(stats.longest_session || 0);
    const afkTime = formatDuration(stats.total_afk_time || 0);
    const streamTime = formatDuration(stats.stream_channel_time || 0);

    await message.reply(`
📊 **Ваша статистика:**
🎤 Всего сессий: **${stats.total_sessions || 0}**
⏰ Время в голосовых: **${voiceTime}**
😴 Перемещений в AFK: **${stats.total_afk_moves || 0}**
💤 Время в AFK: **${afkTime}**
🎙️ Переключений микрофона: **${stats.total_mute_toggles || 0}**
📈 Самая длинная сессия: **${longestSession}**
⚙️ Изменений настроек: **${stats.settings_changes || 0}**
💬 Отправлено сообщений: **${stats.messages_sent || 0}**
📢 Ответов на упоминания: **${stats.mentions_responded || 0}**
📺 Время в канале Че смотрим?: **${streamTime}**
🌐 Посещений веб-панели: **${stats.web_visits || 0}**
📡 Включений трансляций: **${stats.total_streams || 0}**
⭐ Очки рейтинга: **${stats.rank_points || 0}**
🏆 Достижений: **${achievements.filter(a => a.achievement_id !== 'best_admin').length}/${Object.keys(ACHIEVEMENTS).filter(id => id !== 'best_admin').length}**

👤 **Твой ID:** \`${message.author.id}\`
🌐 **Подробная статистика:** http://${SERVER_CONFIG.IP}:${SERVER_CONFIG.PORT}
    `);
  }

  /**
   * Команда достижений
   */
  async handleAchievementsCommand(message, userId) {
    const achievements = this.db.getUserAchievements(userId);
    const totalAchievements = Object.keys(ACHIEVEMENTS).filter(id => id !== 'best_admin').length;
    const userAchievements = achievements.filter(a => a.achievement_id !== 'best_admin');

    let achievementText = `🏆 **Ваши достижения (${userAchievements.length}/${totalAchievements}):**\n\n`;

    if (userAchievements.length === 0) {
      achievementText += 'У вас пока нет достижений. Проводите больше времени в голосовых каналах!';
    } else {
      userAchievements.forEach((ach) => {
        const achievement = ACHIEVEMENTS[ach.achievement_id];
        if (achievement) {
          achievementText += `${achievement.name}\n${achievement.description}\n+${achievement.points} очков\n\n`;
        }
      });
    }

    await message.reply(achievementText);
  }

  /**
   * Команда включения ЛС
   */
  async handleMsgOnCommand(message, userId, username) {
    this.db.setUserDMSetting(userId, true);
    this.db.incrementUserStat(userId, 'settings_changes');
    await this.achievements.checkAll(userId, username);

    const stats = this.db.getUserStats(userId);
    if (stats && stats.settings_changes === 1) {
      await this.achievements.checkAndUnlock(userId, username, 'first_settings');
    }

    await message.reply('✅ ЛС уведомления о перемещении в токсичный канал **включены**');
    
    if (this.telegram) {
      await this.telegram.sendSettingsChange(
        username,
        userId,
        '📩 ЛС уведомления: ✅ ВКЛЮЧЕНЫ'
      );
    }
  }

  /**
   * Команда отключения ЛС
   */
  async handleMsgOffCommand(message, userId, username) {
    this.db.setUserDMSetting(userId, false);
    this.db.incrementUserStat(userId, 'settings_changes');
    await this.achievements.checkAll(userId, username);

    await message.reply('❌ ЛС уведомления о перемещении в токсичный канал **отключены**');
    
    if (this.telegram) {
      await this.telegram.sendSettingsChange(
        username,
        userId,
        '📩 ЛС уведомления: ❌ ОТКЛЮЧЕНЫ'
      );
    }
  }

  /**
   * Команда изменения таймера
   */
  async handleTimeCommand(message, userId, username, timeout) {
    this.db.setUserTimeout(userId, timeout);
    this.db.incrementUserStat(userId, 'settings_changes');
    await this.achievements.checkAll(userId, username);

    await message.reply(`⏱️ Таймер AFK установлен на **${timeout} минут**`);
    
    if (this.telegram) {
      await this.telegram.sendSettingsChange(
        username,
        userId,
        `⏱️ Таймер AFK: ${timeout} минут`
      );
    }
  }

  /**
   * Команда помощи
   */
  async handleHelpCommand(message) {
    await message.reply(`
📖 **Доступные команды:**

📊 **Статистика:**
\`.1. stats\` - Показать вашу статистику
\`.1. achievements\` - Показать ваши достижения

⚙️ **Настройки:**
\`.1. msg on\` - Включить ЛС уведомления
\`.1. msg off\` - Отключить ЛС уведомления
\`.1. time 15\` - Таймер AFK 15 минут
\`.1. time 30\` - Таймер AFK 30 минут
\`.1. time 45\` - Таймер AFK 45 минут

🔍 **VAC Чекер:**
\`.1. vac-help\` - Справка по чекеру читеров

🌐 **Веб-панель:** http://${SERVER_CONFIG.IP}:${SERVER_CONFIG.PORT}
    `);
  }

  /**
   * Скачать аватар
   */
  async downloadAvatar(userId, avatarUrl) {
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
}
