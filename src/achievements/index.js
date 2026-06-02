import { ACHIEVEMENTS } from './definitions.js';
import { success, error as logError } from '../utils/logger.js';

/**
 * Система достижений
 */
export class AchievementSystem {
  constructor(db, notificationService) {
    this.db = db;
    this.notifications = notificationService;
    this.definitions = ACHIEVEMENTS;
    success('Система достижений инициализирована');
  }

  /**
   * Проверить и разблокировать достижение
   */
  async checkAndUnlock(userId, username, achievementId) {
    try {
      // Проверяем есть ли уже достижение
      if (this.db.hasAchievement(userId, achievementId)) {
        return false;
      }

      const achievement = this.definitions[achievementId];
      if (!achievement) {
        logError(`Достижение ${achievementId} не найдено`);
        return false;
      }

      // Разблокируем достижение
      const unlocked = this.db.unlockAchievement(userId, achievementId);
      if (!unlocked) {
        return false;
      }

      // Обновляем очки
      this.db.incrementUserStat(userId, 'rank_points', achievement.points);

      // Отправляем уведомления
      await this.sendNotifications(userId, username, achievement);

      success(`Достижение ${achievement.name} разблокировано для ${username}`);
      return true;
    } catch (err) {
      logError(`Ошибка разблокировки достижения: ${err.message}`);
      return false;
    }
  }

  /**
   * Проверить все достижения пользователя
   */
  async checkAll(userId, username) {
    const stats = this.db.getUserStats(userId);
    if (!stats) {
      return;
    }

    // Подгружаем статистику cheater-checker и мержим в stats
    const cheaterStats = this.db.getUserCheaterStats(userId);
    stats.totalChecked = cheaterStats.totalChecked || 0;
    stats.bannedFound = cheaterStats.bannedFound || 0;

    for (const [id, achievement] of Object.entries(this.definitions)) {
      // Пропускаем специальные достижения
      if (id === 'best_admin' || id === 'no_afk_week') {
        continue;
      }

      // Проверяем условие
      if (achievement.condition && achievement.condition(stats)) {
        await this.checkAndUnlock(userId, username, id);
      }
    }
  }

  /**
   * Отправить уведомления о достижении
   */
  async sendNotifications(userId, username, achievement) {
    // Отправляем в Discord (если включены уведомления)
    await this.notifications.sendDiscordDM(userId, achievement);

    // Отправляем в Telegram
    await this.notifications.sendTelegram(username, achievement);

    // Отправляем в канал Discord
    await this.notifications.sendDiscordChannel(userId, username, achievement);
  }
}
