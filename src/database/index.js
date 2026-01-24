import Database from 'better-sqlite3';
import { success, error as logError } from '../utils/logger.js';

/**
 * Database класс для работы с SQLite
 */
export class DatabaseManager {
  constructor(dbPath = 'afkbot.db') {
    this.db = new Database(dbPath);
    this.cache = new Map();
    this.statements = new Map();
    success(`База данных подключена: ${dbPath}`);
    
    // Создаем таблицу для отслеживания удаленных пользователей
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS deleted_users (
        user_id TEXT PRIMARY KEY,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Получить prepared statement с кэшированием
   */
  prepare(sql) {
    if (!this.statements.has(sql)) {
      this.statements.set(sql, this.db.prepare(sql));
    }
    return this.statements.get(sql);
  }

  /**
   * Выполнить SQL команду
   */
  exec(sql) {
    return this.db.exec(sql);
  }

  /**
   * Начать транзакцию
   */
  transaction(fn) {
    return this.db.transaction(fn);
  }

  // ===== USER STATS =====

  getUserStats(userId) {
    return this.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
  }

  initUserStats(userId, username, avatarUrl = null) {
    const existing = this.prepare('SELECT username, avatar_url FROM user_stats WHERE user_id = ?').get(userId);
    
    if (existing) {
      if (existing.username === 'Web User' && username && username !== 'Web User') {
        this.prepare('UPDATE user_stats SET username = ? WHERE user_id = ?').run(username, userId);
      }

      if (avatarUrl && avatarUrl !== '/avatars/nopic.png') {
        this.prepare('UPDATE user_stats SET avatar_url = ? WHERE user_id = ?').run(avatarUrl, userId);
      }
    } else {
      this.prepare('INSERT INTO user_stats (user_id, username, avatar_url) VALUES (?, ?, ?)').run(
        userId,
        username,
        avatarUrl || '/avatars/nopic.png'
      );
    }
  }

  updateUserStats(userId, field, value) {
    this.prepare(`UPDATE user_stats SET ${field} = ?, last_activity = CURRENT_TIMESTAMP WHERE user_id = ?`).run(
      value,
      userId
    );
  }

  incrementUserStat(userId, field, increment = 1) {
    this.prepare(
      `UPDATE user_stats SET ${field} = ${field} + ?, last_activity = CURRENT_TIMESTAMP WHERE user_id = ?`
    ).run(increment, userId);
  }

  getTopUsers(limit = 10) {
    return this.prepare(
      'SELECT * FROM user_stats ORDER BY rank_points DESC, total_voice_time DESC LIMIT ?'
    ).all(limit);
  }

  // ===== USER SETTINGS =====

  getUserDMSetting(userId) {
    const result = this.prepare('SELECT dm_notifications FROM user_settings WHERE user_id = ?').get(userId);
    return result ? Boolean(result.dm_notifications) : true;
  }

  setUserDMSetting(userId, enabled) {
    this.prepare(
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout) 
       VALUES (?, ?, COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15))`
    ).run(enabled ? 1 : 0, userId, userId);
  }

  getUserTimeout(userId) {
    const result = this.prepare('SELECT afk_timeout FROM user_settings WHERE user_id = ?').get(userId);
    return result ? result.afk_timeout : 15;
  }

  setUserTimeout(userId, timeout) {
    this.prepare(
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout) 
       VALUES (?, COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), ?)`
    ).run(userId, userId, timeout);
  }

  getUserAchievementNotificationSetting(userId) {
    const result = this.prepare('SELECT achievement_notifications FROM user_settings WHERE user_id = ?').get(userId);
    return result ? Boolean(result.achievement_notifications) : true;
  }

  setUserAchievementNotificationSetting(userId, enabled) {
    this.prepare(
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications) 
       VALUES (?, 
               COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), 
               COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
               ?)`
    ).run(userId, userId, userId, enabled ? 1 : 0);
  }

  getUserTheme(userId) {
    const result = this.prepare('SELECT theme FROM user_settings WHERE user_id = ?').get(userId);
    return result && result.theme ? result.theme : 'standard';
  }

  getSecretThemeActivated(userId) {
    const result = this.prepare('SELECT secret_theme_activated FROM user_settings WHERE user_id = ?').get(userId);
    return result ? Boolean(result.secret_theme_activated) : false;
  }

  getUserChannelNotificationSetting(userId) {
    const result = this.prepare('SELECT channel_notifications FROM user_settings WHERE user_id = ?').get(userId);
    return result ? Boolean(result.channel_notifications) : false;
  }

  setUserChannelNotificationSetting(userId, value) {
    const numValue = value ? 1 : 0;
    this.prepare(
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications, theme, secret_theme_activated, channel_notifications) 
       VALUES (?, 
               COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), 
               COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
               COALESCE((SELECT achievement_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT theme FROM user_settings WHERE user_id = ?), 'standard'),
               COALESCE((SELECT secret_theme_activated FROM user_settings WHERE user_id = ?), 0),
               ?)`
    ).run(userId, userId, userId, userId, userId, userId, numValue);
  }

  // ===== USER ACHIEVEMENTS =====

  getUserAchievements(userId) {
    const regularAchievements = this.prepare(
      `SELECT ua.*, a.emoji, a.name, a.description, a.type
       FROM user_achievements ua
       LEFT JOIN achievements a ON ua.achievement_id = a.achievement_id
       WHERE ua.user_id = ? AND ua.manually_deleted = 0 AND (a.type IS NULL OR a.type != 'special')`
    ).all(userId);

    const specialAchievements = this.prepare(
      `SELECT a.*, ua.unlocked_at
       FROM achievements a
       INNER JOIN user_achievements ua ON a.achievement_id = ua.achievement_id AND ua.user_id = ?
       WHERE a.type = 'special' AND ua.manually_deleted = 0`
    ).all(userId);

    return [...regularAchievements, ...specialAchievements];
  }

  unlockAchievement(userId, achievementId) {
    try {
      this.prepare(
        'INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)'
      ).run(userId, achievementId);
      return true;
    } catch (err) {
      logError(`Ошибка разблокировки достижения: ${err.message}`);
      return false;
    }
  }

  hasAchievement(userId, achievementId) {
    const result = this.prepare(
      'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?'
    ).get(userId, achievementId);
    return !!result;
  }

  deleteAchievement(userId, achievementId) {
    this.prepare(
      'UPDATE user_achievements SET manually_deleted = 1 WHERE user_id = ? AND achievement_id = ?'
    ).run(userId, achievementId);
  }

  // ===== TELEGRAM =====

  getTelegramChatId(userId) {
    const result = this.prepare(
      'SELECT telegram_chat_id FROM telegram_users WHERE user_id = ? AND started_bot = 1'
    ).get(userId);
    return result ? result.telegram_chat_id : null;
  }

  hasUserStartedTelegramBot(userId) {
    const result = this.prepare('SELECT started_bot FROM telegram_users WHERE user_id = ?').get(userId);
    return result ? Boolean(result.started_bot) : false;
  }

  getTelegramLinkStatus(userId) {
    const result = this.prepare(
      'SELECT telegram_chat_id, started_bot, created_at FROM telegram_users WHERE user_id = ?'
    ).get(userId);

    if (!result || !result.started_bot) {
      return { linked: false };
    }

    return {
      linked: true,
      telegramChatId: result.telegram_chat_id,
      linkedAt: result.created_at,
    };
  }

  // ===== VOICE SESSIONS =====

  createSession(userId, channelName, joinTime) {
    const result = this.prepare(
      'INSERT INTO voice_sessions (user_id, channel_name, join_time) VALUES (?, ?, ?) RETURNING id'
    ).get(userId, channelName, joinTime);
    return result.id;
  }

  endSession(sessionId, leaveTime, duration, wasAfkMoved = false) {
    this.prepare(
      'UPDATE voice_sessions SET leave_time = ?, duration = ?, was_afk_moved = ? WHERE id = ?'
    ).run(leaveTime, duration, wasAfkMoved ? 1 : 0, sessionId);
  }

  // ===== ADMIN =====

  deleteUser(userId) {
    const transaction = this.transaction(() => {
      this.prepare('DELETE FROM user_stats WHERE user_id = ?').run(userId);
      this.prepare('DELETE FROM user_achievements WHERE user_id = ?').run(userId);
      this.prepare('DELETE FROM voice_sessions WHERE user_id = ?').run(userId);
      this.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId);
      this.prepare('DELETE FROM telegram_users WHERE user_id = ?').run(userId);
      // Удаляем специальные достижения пользователя
      this.prepare("DELETE FROM achievements WHERE user_id = ? AND type = 'special'").run(userId);
      
      // Добавляем запись об удалении пользователя (чтобы не создавать его заново)
      this.prepare(
        `INSERT OR REPLACE INTO deleted_users (user_id, deleted_at) VALUES (?, CURRENT_TIMESTAMP)`
      ).run(userId);
    });

    transaction();
  }
  
  // Проверить был ли пользователь удален
  isUserDeleted(userId) {
    const result = this.prepare(
      'SELECT user_id FROM deleted_users WHERE user_id = ?'
    ).get(userId);
    return !!result;
  }

  // ===== ACHIEVEMENTS CHECKER =====

  getAllUsers() {
    return this.prepare('SELECT user_id, username FROM user_stats').all();
  }

  hadAfkInPeriod(userId, startDate) {
    const result = this.prepare(
      'SELECT COUNT(*) as count FROM voice_sessions WHERE user_id = ? AND was_afk_moved = 1 AND join_time >= ?'
    ).get(userId, startDate.toISOString());
    return result.count > 0;
  }

  wasOnlineInPeriod(userId, startDate) {
    const result = this.prepare(
      'SELECT COUNT(*) as count FROM voice_sessions WHERE user_id = ? AND join_time >= ?'
    ).get(userId, startDate.toISOString());
    return result.count > 0;
  }

  getSpecialAchievements() {
    return this.prepare(
      'SELECT achievement_id, name, description, special_date FROM achievements WHERE type = "special"'
    ).all();
  }

  close() {
    this.db.close();
  }
}
