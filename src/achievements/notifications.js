import { formatTime } from '../utils/time.js';
import { log, error as logError } from '../utils/logger.js';
import { DISCORD_CONFIG, SERVER_CONFIG } from '../config.js';

/**
 * Сервис уведомлений о достижениях
 */
export class AchievementNotificationService {
  constructor(discordClient, telegramService, db) {
    this.client = discordClient;
    this.telegram = telegramService;
    this.db = db;
  }

  /**
   * Отправить уведомление в Discord ЛС
   */
  async sendDiscordDM(userId, achievement) {
    try {
      // Проверяем настройки уведомлений
      const notificationsEnabled = this.db.getUserAchievementNotificationSetting(userId);
      if (!notificationsEnabled) {
        return;
      }

      const member = this.client.users.cache.get(userId);
      if (!member) {
        return;
      }

      const messageText =
        `🏆 **Новое достижение!**\n\n` +
        `${achievement.name}\n` +
        `${achievement.description}\n` +
        `+${achievement.points} очков рейтинга! 🌟\n\n` +
        `💡 Посмотреть все достижения:\n` +
        `📱 В боте: \`.!. achievements\`\n` +
        `🌐 Веб-панель: http://${SERVER_CONFIG.IP}:${SERVER_CONFIG.PORT}/?userId=${userId}&autoLogin=true`;

      await member.send(messageText);
      log(`✅ ЛС отправлено пользователю ${member.username}`);
    } catch (err) {
      logError(`Не удалось отправить ЛС: ${err.message}`);
    }
  }

  /**
   * Отправить уведомление в Telegram
   */
  async sendTelegram(username, achievement) {
    try {
      if (!this.telegram || !this.telegram.sendAchievementNotification) {
        return;
      }

      await this.telegram.sendAchievementNotification(
        username,
        achievement.name,
        achievement.description,
        achievement.points
      );
      log(`✅ Telegram уведомление отправлено`);
    } catch (err) {
      logError(`Не удалось отправить Telegram: ${err.message}`);
    }
  }

  /**
   * Отправить уведомление в канал Discord
   */
  async sendDiscordChannel(userId, username, achievement) {
    try {
      const channel = this.client.channels.cache.get(DISCORD_CONFIG.ACHIEVEMENTS_CHANNEL_ID);
      if (!channel) {
        return;
      }

      const messageText =
        `🏆 **Новое достижение!**\n\n` +
        `👤 **Пользователь:** <@${userId}>\n` +
        `🎯 **Достижение:** ${achievement.name}\n` +
        `📝 **Описание:** ${achievement.description}\n` +
        `⭐ **Очки:** +${achievement.points}\n` +
        `📅 **Время:** ${formatTime(new Date())}`;

      await channel.send(messageText);
      log(`✅ Сообщение в канал отправлено`);
    } catch (err) {
      logError(`Не удалось отправить в канал: ${err.message}`);
    }
  }

  /**
   * Отправить уведомление о специальном достижении в канал Discord
   */
  async sendSpecialAchievementToDiscordChannel(userId, username, emoji, name, description) {
    try {
      const channel = this.client.channels.cache.get(DISCORD_CONFIG.ACHIEVEMENTS_CHANNEL_ID);
      if (!channel) {
        return;
      }

      const messageText =
        `🏆 **Новое специальное достижение!**\n\n` +
        `👤 **Пользователь:** <@${userId}>\n` +
        `🎯 **Достижение:** ${emoji} ${name}\n` +
        `📝 **Описание:** ${description}\n` +
        `📅 **Время:** ${formatTime(new Date())}`;

      await channel.send(messageText);
      log(`✅ Уведомление о специальном достижении отправлено в Discord канал`);
    } catch (err) {
      logError(`Не удалось отправить специальное достижение в канал: ${err.message}`);
    }
  }
}
