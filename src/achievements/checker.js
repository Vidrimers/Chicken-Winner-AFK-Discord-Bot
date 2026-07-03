import { getMoscowNow } from '../utils/time.js';
import { log } from '../utils/logger.js';

/**
 * Специальная логика проверки достижений
 */
export class AchievementChecker {
  constructor(db, achievementSystem) {
    this.db = db;
    this.achievements = achievementSystem;
  }

  /**
   * Проверить достижение "Неделя без AFK"
   * Вызывается каждый день в 00:00 по МСК
   */
  async checkNoAfkWeek() {
    log('🔍 Проверяем достижение "Неделя без AFK"...');

    const sevenDaysAgo = new Date(getMoscowNow().getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Получаем всех пользователей
    const allUsers = this.db.getAllUsers();

    for (const user of allUsers) {
      // Проверяем был ли AFK за последние 7 дней
      const hadAfk = this.db.hadAfkInPeriod(user.user_id, sevenDaysAgo);

      if (!hadAfk) {
        // Проверяем был ли онлайн хотя бы раз за неделю
        const wasOnline = this.db.wasOnlineInPeriod(user.user_id, sevenDaysAgo);

        if (wasOnline) {
          await this.achievements.checkAndUnlock(
            user.user_id,
            user.username || 'Unknown',
            'no_afk_week'
          );
        }
      }
    }

    log('✅ Проверка "Неделя без AFK" завершена');
  }

  /**
   * Проверить достижение "Лучший админ"
   * Вызывается вручную администратором
   */
  async grantBestAdmin(userId, username) {
    log(`🏆 Выдаем достижение "Лучший админ" пользователю ${username}`);
    
    await this.achievements.checkAndUnlock(userId, username, 'best_admin');
  }

  /**
   * Проверить специальные достижения (праздничные)
   * Вызывается при каждом действии пользователя
   */
  async checkSpecialAchievements(userId, username) {
    // Получаем все специальные достижения из БД
    const specialAchievements = this.db.getSpecialAchievements();
    const now = getMoscowNow();

    for (const achievement of specialAchievements) {
      // Проверяем дату
      if (achievement.special_date) {
        const specialDate = new Date(achievement.special_date);
        
        // Проверяем, наступила ли запланированная дата и время
        if (now >= specialDate) {
          // Проверяем есть ли уже это достижение
          if (!this.db.hasAchievement(userId, achievement.achievement_id)) {
            // Разблокируем
            const unlockedTime = now.toISOString();
            this.db.prepare(
              `INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
               VALUES (?, ?, ?)`
            ).run(userId, achievement.achievement_id, unlockedTime);
            
            // Отправляем уведомления
            await this.achievements.sendNotifications(userId, username, {
              name: achievement.name,
              description: achievement.description,
              points: 0 // Специальные достижения не дают очков
            });
          }
        }
      }
    }
  }
}
