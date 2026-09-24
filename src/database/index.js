import Database from 'better-sqlite3';
import { success, error as logError } from '../utils/logger.js';
import { runMigrations } from './migrations.js';

/**
 * Database класс для работы с SQLite
 */
export class DatabaseManager {
  constructor(dbPath = process.env.DB_FILE || 'afkbot.db') {
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

    // Запускаем миграции
    runMigrations(this.db);
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
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications, theme, secret_theme_activated, channel_notifications, cheater_own_notifications, cheater_others_notifications)
       VALUES (?, ?, 
               COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
               COALESCE((SELECT achievement_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT theme FROM user_settings WHERE user_id = ?), 'standard'),
               COALESCE((SELECT secret_theme_activated FROM user_settings WHERE user_id = ?), 0),
               COALESCE((SELECT channel_notifications FROM user_settings WHERE user_id = ?), 0),
               COALESCE((SELECT cheater_own_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT cheater_others_notifications FROM user_settings WHERE user_id = ?), 0))`
    ).run(userId, enabled ? 1 : 0, userId, userId, userId, userId, userId, userId, userId);
  }

  getUserTimeout(userId) {
    const result = this.prepare('SELECT afk_timeout FROM user_settings WHERE user_id = ?').get(userId);
    return result ? result.afk_timeout : 15;
  }

  setUserTimeout(userId, timeout) {
    this.prepare(
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications, theme, secret_theme_activated, channel_notifications, cheater_own_notifications, cheater_others_notifications)
       VALUES (?, 
               COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), 
               ?,
               COALESCE((SELECT achievement_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT theme FROM user_settings WHERE user_id = ?), 'standard'),
               COALESCE((SELECT secret_theme_activated FROM user_settings WHERE user_id = ?), 0),
               COALESCE((SELECT channel_notifications FROM user_settings WHERE user_id = ?), 0),
               COALESCE((SELECT cheater_own_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT cheater_others_notifications FROM user_settings WHERE user_id = ?), 0))`
    ).run(userId, userId, timeout, userId, userId, userId, userId, userId, userId);
  }

  getUserAchievementNotificationSetting(userId) {
    const result = this.prepare('SELECT achievement_notifications FROM user_settings WHERE user_id = ?').get(userId);
    return result ? Boolean(result.achievement_notifications) : true;
  }

  setUserAchievementNotificationSetting(userId, enabled) {
    this.prepare(
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications, theme, secret_theme_activated, channel_notifications, cheater_own_notifications, cheater_others_notifications)
       VALUES (?, 
               COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), 
               COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
               ?,
               COALESCE((SELECT theme FROM user_settings WHERE user_id = ?), 'standard'),
               COALESCE((SELECT secret_theme_activated FROM user_settings WHERE user_id = ?), 0),
               COALESCE((SELECT channel_notifications FROM user_settings WHERE user_id = ?), 0),
               COALESCE((SELECT cheater_own_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT cheater_others_notifications FROM user_settings WHERE user_id = ?), 0))`
    ).run(userId, userId, userId, enabled ? 1 : 0, userId, userId, userId, userId, userId);
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
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications, theme, secret_theme_activated, channel_notifications, cheater_own_notifications, cheater_others_notifications) 
       VALUES (?, 
               COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), 
               COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
               COALESCE((SELECT achievement_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT theme FROM user_settings WHERE user_id = ?), 'standard'),
               COALESCE((SELECT secret_theme_activated FROM user_settings WHERE user_id = ?), 0),
               ?,
               COALESCE((SELECT cheater_own_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT cheater_others_notifications FROM user_settings WHERE user_id = ?), 0))`
    ).run(userId, userId, userId, userId, userId, userId, numValue, userId, userId);
  }

  getUserCheaterOwnNotificationSetting(userId) {
    const result = this.prepare('SELECT cheater_own_notifications FROM user_settings WHERE user_id = ?').get(userId);
    return result ? Boolean(result.cheater_own_notifications) : true;
  }

  setUserCheaterOwnNotificationSetting(userId, enabled) {
    this.prepare(
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications, theme, secret_theme_activated, channel_notifications, cheater_own_notifications, cheater_others_notifications)
       VALUES (?, 
               COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), 
               COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
               COALESCE((SELECT achievement_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT theme FROM user_settings WHERE user_id = ?), 'standard'),
               COALESCE((SELECT secret_theme_activated FROM user_settings WHERE user_id = ?), 0),
               COALESCE((SELECT channel_notifications FROM user_settings WHERE user_id = ?), 0),
               ?,
               COALESCE((SELECT cheater_others_notifications FROM user_settings WHERE user_id = ?), 0))`
    ).run(userId, userId, userId, userId, userId, userId, userId, enabled ? 1 : 0, userId);
  }

  getUserCheaterOthersNotificationSetting(userId) {
    const result = this.prepare('SELECT cheater_others_notifications FROM user_settings WHERE user_id = ?').get(userId);
    return result ? Boolean(result.cheater_others_notifications) : false;
  }

  getUsersSubscribedToOthersCheaterNotifications() {
    return this.prepare(
      `SELECT us.user_id, tu.telegram_chat_id 
       FROM user_settings us
       JOIN telegram_users tu ON us.user_id = tu.user_id
       WHERE us.cheater_others_notifications = 1 AND tu.started_bot = 1`
    ).all();
  }

  setUserCheaterOthersNotificationSetting(userId, enabled) {
    this.prepare(
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications, theme, secret_theme_activated, channel_notifications, cheater_own_notifications, cheater_others_notifications)
       VALUES (?, 
               COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), 
               COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
               COALESCE((SELECT achievement_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT theme FROM user_settings WHERE user_id = ?), 'standard'),
               COALESCE((SELECT secret_theme_activated FROM user_settings WHERE user_id = ?), 0),
               COALESCE((SELECT channel_notifications FROM user_settings WHERE user_id = ?), 0),
               COALESCE((SELECT cheater_own_notifications FROM user_settings WHERE user_id = ?), 1),
               ?)`
    ).run(userId, userId, userId, userId, userId, userId, userId, userId, enabled ? 1 : 0);
  }

  getUserCheaterNickNotificationSetting(userId) {
    const result = this.prepare('SELECT cheater_nick_notifications FROM user_settings WHERE user_id = ?').get(userId);
    return result ? Boolean(result.cheater_nick_notifications) : false;
  }

  setUserCheaterNickNotificationSetting(userId, enabled) {
    this.prepare(
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications, theme, secret_theme_activated, channel_notifications, cheater_own_notifications, cheater_others_notifications, cheater_nick_notifications)
       VALUES (?, 
               COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), 
               COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
               COALESCE((SELECT achievement_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT theme FROM user_settings WHERE user_id = ?), 'standard'),
               COALESCE((SELECT secret_theme_activated FROM user_settings WHERE user_id = ?), 0),
               COALESCE((SELECT channel_notifications FROM user_settings WHERE user_id = ?), 0),
               COALESCE((SELECT cheater_own_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT cheater_others_notifications FROM user_settings WHERE user_id = ?), 0),
               ?)`
    ).run(userId, userId, userId, userId, userId, userId, userId, userId, userId, enabled ? 1 : 0);
  }

  getUsersSubscribedToNickNotifications() {
    return this.prepare(
      `SELECT us.user_id, tu.telegram_chat_id 
       FROM user_settings us
       JOIN telegram_users tu ON us.user_id = tu.user_id
       WHERE us.cheater_nick_notifications = 1 AND tu.started_bot = 1`
    ).all();
  }

  // ===== BOT NOTIFICATION SETTINGS =====

  getUserBotOwnNotificationSetting(userId) {
    const result = this.prepare('SELECT bot_own_notifications FROM user_settings WHERE user_id = ?').get(userId);
    return result ? Boolean(result.bot_own_notifications) : true;
  }

  setUserBotOwnNotificationSetting(userId, enabled) {
    this.prepare('UPDATE user_settings SET bot_own_notifications = ? WHERE user_id = ?')
      .run(enabled ? 1 : 0, userId);
  }

  getUserBotOthersNotificationSetting(userId) {
    const result = this.prepare('SELECT bot_others_notifications FROM user_settings WHERE user_id = ?').get(userId);
    return result ? Boolean(result.bot_others_notifications) : false;
  }

  setUserBotOthersNotificationSetting(userId, enabled) {
    this.prepare('UPDATE user_settings SET bot_others_notifications = ? WHERE user_id = ?')
      .run(enabled ? 1 : 0, userId);
  }

  getUserBotNickNotificationSetting(userId) {
    const result = this.prepare('SELECT bot_nick_notifications FROM user_settings WHERE user_id = ?').get(userId);
    return result ? Boolean(result.bot_nick_notifications) : false;
  }

  setUserBotNickNotificationSetting(userId, enabled) {
    this.prepare('UPDATE user_settings SET bot_nick_notifications = ? WHERE user_id = ?')
      .run(enabled ? 1 : 0, userId);
  }

  getUsersSubscribedToOthersBotNotifications() {
    return this.prepare(
      `SELECT us.user_id, tu.telegram_chat_id 
       FROM user_settings us
       JOIN telegram_users tu ON us.user_id = tu.user_id
       WHERE us.bot_others_notifications = 1 AND tu.started_bot = 1`
    ).all();
  }

  getUsersSubscribedToBotNickNotifications() {
    return this.prepare(
      `SELECT us.user_id, tu.telegram_chat_id 
       FROM user_settings us
       JOIN telegram_users tu ON us.user_id = tu.user_id
       WHERE us.bot_nick_notifications = 1 AND tu.started_bot = 1`
    ).all();
  }

  // ===== GENERIC CHECK METHODS (cheater/bot) =====

  upsertCheck(profile, type = 'cheater') {
    return this.prepare(
      `INSERT INTO cheater_checks 
       (steam_id, persona_name, avatar_url, profile_url, original_vanity_url, vac_banned, number_of_vac_bans, 
        number_of_game_bans, days_since_last_ban, community_banned, economy_ban, 
        checked_by_discord_id, checked_by_username, report_source, reported_by_name, reported_by_url, type, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(steam_id) DO UPDATE SET
        persona_name = excluded.persona_name,
        avatar_url = excluded.avatar_url,
        profile_url = excluded.profile_url,
        vac_banned = excluded.vac_banned,
        number_of_vac_bans = excluded.number_of_vac_bans,
        number_of_game_bans = excluded.number_of_game_bans,
        days_since_last_ban = excluded.days_since_last_ban,
        community_banned = excluded.community_banned,
        economy_ban = excluded.economy_ban,
        original_vanity_url = COALESCE(excluded.original_vanity_url, cheater_checks.original_vanity_url),
        report_source = COALESCE(excluded.report_source, cheater_checks.report_source),
        reported_by_name = COALESCE(excluded.reported_by_name, cheater_checks.reported_by_name),
        reported_by_url = COALESCE(excluded.reported_by_url, cheater_checks.reported_by_url),
        type = excluded.type`
    ).run(
      profile.steamId,
      profile.personaName || null,
      profile.avatarUrl || null,
      profile.profileUrl,
      profile.originalVanityUrl || null,
      profile.vacBanned ? 1 : 0,
      profile.numberOfVacBans || 0,
      profile.numberOfGameBans || 0,
      profile.daysSinceLastBan || 0,
      profile.communityBanned ? 1 : 0,
      profile.economyBan || 'none',
      profile.checkedByDiscordId || null,
      profile.checkedByUsername || null,
      profile.reportSource || 'web',
      profile.reportedByName || null,
      profile.reportedByUrl || null,
      type
    );
  }

  getChecks({ limit = 50, offset = 0, filter = 'all', type = 'cheater' } = {}) {
    let sql = `SELECT cc.*, COALESCE(us.username, cc.checked_by_username) as checked_by_username 
               FROM cheater_checks cc 
               LEFT JOIN user_stats us ON cc.checked_by_discord_id = us.user_id`;
    const params = [];

    const conditions = ['cc.type = ?'];
    params.push(type);

    if (filter === 'banned') {
      conditions.push('(cc.vac_banned = 1 OR cc.number_of_game_bans > 0 OR cc.community_banned = 1 OR cc.economy_ban != \'none\')');
    } else if (filter === 'clean') {
      conditions.push('(cc.vac_banned = 0 AND cc.number_of_game_bans = 0 AND cc.community_banned = 0 AND cc.economy_ban = \'none\')');
    } else if (filter === 'steam_wall') {
      conditions.push('cc.report_source = \'steam_wall\'');
    }

    sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY COALESCE(cc.updated_at, cc.checked_at) DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.db.prepare(sql).all(...params);
  }

  getChecksCount(filter = 'all', type = 'cheater') {
    let sql = 'SELECT COUNT(*) as count FROM cheater_checks WHERE type = ?';
    const params = [type];

    if (filter === 'banned') {
      sql += ' AND (vac_banned = 1 OR number_of_game_bans > 0 OR community_banned = 1 OR economy_ban != \'none\')';
    } else if (filter === 'clean') {
      sql += ' AND (vac_banned = 0 AND number_of_game_bans = 0 AND community_banned = 0 AND economy_ban = \'none\')';
    } else if (filter === 'steam_wall') {
      sql += ' AND report_source = \'steam_wall\'';
    }

    const result = this.db.prepare(sql).get(...params);
    return result.count;
  }

  getBannedChecks(limit = 10, type = 'cheater') {
    return this.prepare(
      `SELECT * FROM cheater_checks 
       WHERE type = ? AND (vac_banned = 1 OR number_of_game_bans > 0 OR community_banned = 1 OR economy_ban != 'none')
       ORDER BY checked_at DESC LIMIT ?`
    ).all(type, limit);
  }

  deleteCheck(steamId) {
    return this.prepare('DELETE FROM cheater_checks WHERE steam_id = ?').run(steamId);
  }

  getCheckBySteamId(steamId) {
    return this.prepare(
      `SELECT cc.*, COALESCE(us.username, cc.checked_by_username) as checked_by_username 
       FROM cheater_checks cc 
       LEFT JOIN user_stats us ON cc.checked_by_discord_id = us.user_id 
       WHERE cc.steam_id = ?`
    ).get(steamId);
  }

  markBanUpdated(steamId, reason = null) {
    return this.prepare(
      'UPDATE cheater_checks SET updated_at = CURRENT_TIMESTAMP, update_reason = ? WHERE steam_id = ?'
    ).run(reason, steamId);
  }

  getLastView(userId, type = 'cheater') {
    const row = this.prepare('SELECT viewed_at FROM cheater_last_view WHERE user_id = ? AND type = ?').get(userId, type);
    return row ? row.viewed_at : null;
  }

  markLastView(userId, type = 'cheater') {
    return this.prepare(
      'INSERT OR REPLACE INTO cheater_last_view (user_id, type, viewed_at) VALUES (?, ?, ?)'
    ).run(userId, type, Date.now());
  }

  isFavorite(userId, steamId, type = 'cheater') {
    const row = this.prepare(
      'SELECT 1 FROM cheater_favorites WHERE user_id = ? AND steam_id = ? AND type = ?'
    ).get(userId, steamId, type);
    return !!row;
  }

  addFavorite(userId, steamId, type = 'cheater') {
    return this.prepare(
      'INSERT OR IGNORE INTO cheater_favorites (user_id, steam_id, type, created_at) VALUES (?, ?, ?, ?)'
    ).run(userId, steamId, type, Date.now());
  }

  removeFavorite(userId, steamId, type = 'cheater') {
    this.prepare('DELETE FROM cheater_favorites WHERE user_id = ? AND steam_id = ? AND type = ?').run(userId, steamId, type);
    this.prepare('DELETE FROM cheater_notes WHERE user_id = ? AND steam_id = ? AND type = ?').run(userId, steamId, type);
  }

  toggleFavorite(userId, steamId, type = 'cheater') {
    const exists = this.isFavorite(userId, steamId, type);
    if (exists) {
      this.removeFavorite(userId, steamId, type);
      return { isFavorite: false, notesDeleted: true };
    }
    this.addFavorite(userId, steamId, type);
    return { isFavorite: true, notesDeleted: false };
  }

  getFavoriteSteamIds(userId, type = 'cheater') {
    return this.prepare('SELECT steam_id FROM cheater_favorites WHERE user_id = ? AND type = ?')
      .all(userId, type)
      .map(r => r.steam_id);
  }

  getNotes(userId, steamId, type = 'cheater') {
    return this.prepare(
      'SELECT id, user_id, steam_id, text, created_at, updated_at FROM cheater_notes WHERE user_id = ? AND steam_id = ? AND type = ? ORDER BY created_at ASC'
    ).all(userId, steamId, type);
  }

  addNote(userId, steamId, text, type = 'cheater') {
    const now = Date.now();
    return this.prepare(
      'INSERT INTO cheater_notes (user_id, steam_id, type, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, steamId, type, text, now, now);
  }

  updateNote(noteId, userId, text) {
    return this.prepare(
      'UPDATE cheater_notes SET text = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).run(text, Date.now(), noteId, userId);
  }

  deleteNote(noteId, userId) {
    return this.prepare('DELETE FROM cheater_notes WHERE id = ? AND user_id = ?').run(noteId, userId);
  }

  getCheckerStats(discordId, type = 'cheater') {
    const total = this.db.prepare(
      'SELECT COUNT(*) as count FROM cheater_checks WHERE checked_by_discord_id = ? AND type = ?'
    ).get(discordId, type);
    const banned = this.db.prepare(
      `SELECT COUNT(*) as count FROM cheater_checks 
       WHERE checked_by_discord_id = ? AND type = ?
       AND (vac_banned = 1 OR number_of_game_bans > 0 OR community_banned = 1 OR economy_ban != 'none')`
    ).get(discordId, type);
    return {
      totalChecked: total ? total.count : 0,
      bannedFound: banned ? banned.count : 0
    };
  }

  getUserCombinedStats(discordId) {
    const rows = this.db.prepare(
      `SELECT type, COUNT(*) as total,
        SUM(CASE WHEN vac_banned = 1 OR number_of_game_bans > 0 OR community_banned = 1 OR economy_ban != 'none' THEN 1 ELSE 0 END) as banned
       FROM cheater_checks
       WHERE checked_by_discord_id = ?
       GROUP BY type`
    ).all(discordId);
    const result = { cheater: { totalChecked: 0, bannedFound: 0 }, bot: { totalChecked: 0, bannedFound: 0 } };
    for (const row of rows) {
      if (result[row.type]) {
        result[row.type].totalChecked = row.total;
        result[row.type].bannedFound = row.banned;
      }
    }
    return result;
  }

  addNameHistory(steamId, personaName, type = 'cheater') {
    return this.prepare(
      'INSERT INTO cheater_name_history (steam_id, persona_name, type) VALUES (?, ?, ?)'
    ).run(steamId, personaName, type);
  }

  getNameHistory(steamId, type = 'cheater') {
    return this.prepare(
      'SELECT * FROM cheater_name_history WHERE steam_id = ? AND type = ? ORDER BY changed_at DESC'
    ).all(steamId, type);
  }

  getNameHistoryCount(steamId, type = 'cheater') {
    const row = this.prepare(
      'SELECT COUNT(*) as count FROM cheater_name_history WHERE steam_id = ? AND type = ?'
    ).get(steamId, type);
    return row ? row.count : 0;
  }

  getNotesCount(userId, steamId, type = 'cheater') {
    const row = this.prepare(
      'SELECT COUNT(*) as count FROM cheater_notes WHERE user_id = ? AND steam_id = ? AND type = ?'
    ).get(userId, steamId, type);
    return row ? row.count : 0;
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
    // Помечаем как удаленное в user_achievements
    this.prepare(
      'UPDATE user_achievements SET manually_deleted = 1 WHERE user_id = ? AND achievement_id = ?'
    ).run(userId, achievementId);
    
    // Если это специальное достижение, удаляем его из таблицы achievements
    const specialAch = this.prepare(
      'SELECT type FROM achievements WHERE achievement_id = ? AND user_id = ?'
    ).get(achievementId, userId);
    
    if (specialAch && specialAch.type === 'special') {
      this.prepare(
        'DELETE FROM achievements WHERE achievement_id = ? AND user_id = ?'
      ).run(achievementId, userId);
    }
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

  // ===== CHEATER CHECKS =====

  // Wrappers for backward compatibility (delegate to generic methods)
  upsertCheaterCheck(profile) { return this.upsertCheck(profile, 'cheater'); }
  getCheaterChecks(opts) { return this.getChecks({ ...opts, type: 'cheater' }); }
  getCheaterChecksCount(filter) { return this.getChecksCount(filter, 'cheater'); }
  getBannedProfiles(limit) { return this.getBannedChecks(limit, 'cheater'); }
  deleteCheaterCheck(steamId) { return this.deleteCheck(steamId); }
  getCheaterCheckBySteamId(steamId) { return this.getCheckBySteamId(steamId); }
  markCheaterBanUpdated(steamId, reason) { return this.markBanUpdated(steamId, reason); }
  getCheaterLastView(userId) { return this.getLastView(userId, 'cheater'); }
  markCheaterLastView(userId) { return this.markLastView(userId, 'cheater'); }
  isCheaterFavorite(userId, steamId) { return this.isFavorite(userId, steamId, 'cheater'); }
  addCheaterFavorite(userId, steamId) { return this.addFavorite(userId, steamId, 'cheater'); }
  removeCheaterFavorite(userId, steamId) { return this.removeFavorite(userId, steamId, 'cheater'); }
  toggleCheaterFavorite(userId, steamId) { return this.toggleFavorite(userId, steamId, 'cheater'); }
  getCheaterFavoriteSteamIds(userId) { return this.getFavoriteSteamIds(userId, 'cheater'); }
  getCheaterFavoritesCount(userId, steamId) { return this.getNotesCount(userId, steamId, 'cheater'); }
  getCheaterNotes(userId, steamId) { return this.getNotes(userId, steamId, 'cheater'); }
  addCheaterNote(userId, steamId, text) { return this.addNote(userId, steamId, text, 'cheater'); }
  updateCheaterNote(noteId, userId, text) { return this.updateNote(noteId, userId, text); }
  deleteCheaterNote(noteId, userId) { return this.deleteNote(noteId, userId); }
  getUserCheaterStats(discordId) { return this.getCheckerStats(discordId, 'cheater'); }
  addCheaterNameHistory(steamId, personaName) { return this.addNameHistory(steamId, personaName, 'cheater'); }
  getCheaterNameHistory(steamId) { return this.getNameHistory(steamId, 'cheater'); }
  getCheaterNameHistoryCount(steamId) { return this.getNameHistoryCount(steamId, 'cheater'); }

  // ===== STEAM DATA =====

  setSteamId(userId, steamId) {
    this.prepare('UPDATE user_stats SET steam_id = ? WHERE user_id = ?').run(steamId, userId);
  }

  getSteamId(userId) {
    const result = this.prepare('SELECT steam_id FROM user_stats WHERE user_id = ?').get(userId);
    return result?.steam_id ?? null;
  }

  updateUserSteamCache(userId, cacheJson, timestamp) {
    this.prepare('UPDATE user_stats SET steam_cache = ?, steam_cache_updated = ? WHERE user_id = ?').run(cacheJson, timestamp, userId);
  }

  updateCheaterSteamCache(steamId, cacheJson, timestamp) {
    this.prepare('UPDATE cheater_checks SET steam_cache = ?, steam_cache_updated = ? WHERE steam_id = ?').run(cacheJson, timestamp, steamId);
  }

  getUserSteamCache(userId) {
    const result = this.prepare('SELECT steam_cache, steam_cache_updated FROM user_stats WHERE user_id = ?').get(userId);
    return result ?? null;
  }

  getCheaterSteamCache(steamId) {
    const result = this.prepare('SELECT steam_cache, steam_cache_updated FROM cheater_checks WHERE steam_id = ?').get(steamId);
    return result ?? null;
  }

  getProfilesWithoutSteamCache() {
    return this.prepare(
      'SELECT steam_id FROM cheater_checks WHERE steam_cache IS NULL OR steam_cache = \'\''
    ).all();
  }

  // ===== BUG REPORTS =====

  createBugReport(userId, username, bugText) {
    console.log(`[DB] createBugReport вызван: userId=${userId}, username=${username}`);
    const stmt = this.prepare(
      'INSERT INTO bug_reports (user_id, username, bug_text) VALUES (?, ?, ?)'
    );
    const info = stmt.run(userId, username, bugText);
    console.log(`[DB] createBugReport результат: lastInsertRowid=${info.lastInsertRowid}, changes=${info.changes}`);
    return info.lastInsertRowid;
  }

  getBugReports(status = null) {
    if (status) {
      return this.prepare(
        'SELECT * FROM bug_reports WHERE status = ? ORDER BY created_at DESC'
      ).all(status);
    }
    return this.prepare('SELECT * FROM bug_reports ORDER BY created_at DESC').all();
  }

  getBugReportsByUser(userId) {
    return this.prepare(
      'SELECT * FROM bug_reports WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
  }

  updateBugReportStatus(id, status) {
    return this.prepare(
      'UPDATE bug_reports SET status = ? WHERE id = ?'
    ).run(status, id);
  }

  deleteBugReport(id) {
    return this.prepare('DELETE FROM bug_reports WHERE id = ?').run(id);
  }

  getBugReportCount(status = 'new') {
    const result = this.prepare(
      'SELECT COUNT(*) as count FROM bug_reports WHERE status = ?'
    ).get(status);
    return result.count;
  }

  getBugReportById(id) {
    return this.prepare('SELECT * FROM bug_reports WHERE id = ?').get(id);
  }

  // ===== USER BLOCKLIST =====

  getUserBlocklist(userId) {
    return this.prepare('SELECT blocked_user_id FROM user_blocklist WHERE user_id = ?').all(userId);
  }

  addToBlocklist(userId, blockedUserId) {
    this.prepare('INSERT OR IGNORE INTO user_blocklist (user_id, blocked_user_id) VALUES (?, ?)').run(userId, blockedUserId);
  }

  removeFromBlocklist(userId, blockedUserId) {
    this.prepare('DELETE FROM user_blocklist WHERE user_id = ? AND blocked_user_id = ?').run(userId, blockedUserId);
  }

  // ===== BAN CHECK LOG =====

  saveBanCheckResult(type, result, durationSeconds) {
    this.prepare(
      'INSERT INTO ban_check_log (type, timestamp, total_checked, updated, notified, notified_others, duration_seconds, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(type, result.timestamp, result.totalChecked || 0, result.updated || 0, result.notified || 0, result.notifiedOthers || 0, durationSeconds || 0, result.error || null);
  }

  getLastBanCheck(type) {
    const row = this.prepare(
      'SELECT * FROM ban_check_log WHERE type = ? ORDER BY id DESC LIMIT 1'
    ).get(type);
    if (!row) return null;
    return {
      timestamp: row.timestamp,
      totalChecked: row.total_checked,
      updated: row.updated,
      notified: row.notified,
      notifiedOthers: row.notified_others || 0,
      durationSeconds: row.duration_seconds,
      error: row.error,
    };
  }

  // ===== BAN CHECK SETTINGS =====

  getBanCheckTime() {
    const row = this.prepare("SELECT value FROM ban_check_settings WHERE key = 'check_time'").get();
    return row ? row.value : '04:30';
  }

  setBanCheckTime(time) {
    this.prepare("INSERT OR REPLACE INTO ban_check_settings (key, value) VALUES ('check_time', ?)").run(time);
  }

  // ===== CHEAT WATCHER QUEUE =====

  addCheatWatcherComment(steamId, commentText) {
    return this.prepare(
      'INSERT INTO cheat_watcher_queue (steam_id, comment_text) VALUES (?, ?)'
    ).run(steamId, commentText);
  }

  getPendingCheatWatcherComments() {
    return this.prepare(
      `SELECT * FROM cheat_watcher_queue WHERE status = 'pending' ORDER BY created_at ASC`
    ).all();
  }

  markCheatWatcherCommentPosted(id) {
    return this.prepare(
      "UPDATE cheat_watcher_queue SET status = 'done', posted_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(id);
  }

  markCheatWatcherCommentError(id, errorMessage) {
    return this.prepare(
      "UPDATE cheat_watcher_queue SET status = 'error', error_message = ? WHERE id = ?"
    ).run(errorMessage, id);
  }

  // ===== STEAM WALL REPORTS (rate limiting) =====

  addSteamWallReport(reporterSteamId, targetSteamId) {
    return this.prepare(
      'INSERT INTO steam_wall_reports (reporter_steam_id, target_steam_id) VALUES (?, ?)'
    ).run(reporterSteamId, targetSteamId);
  }

  getSteamWallReportCount(reporterSteamId, windowMs = 30 * 60 * 1000) {
    const since = new Date(Date.now() - windowMs).toISOString();
    const row = this.prepare(
      'SELECT COUNT(*) as count FROM steam_wall_reports WHERE reporter_steam_id = ? AND created_at > ?'
    ).get(reporterSteamId, since);
    return row ? row.count : 0;
  }

  getCheatWatcherQueueStats() {
    const pending = this.prepare(
      "SELECT COUNT(*) as count FROM cheat_watcher_queue WHERE status = 'pending'"
    ).get();
    const done = this.prepare(
      "SELECT COUNT(*) as count FROM cheat_watcher_queue WHERE status = 'done'"
    ).get();
    const errors = this.prepare(
      "SELECT COUNT(*) as count FROM cheat_watcher_queue WHERE status = 'error'"
    ).get();
    return { pending: pending.count, done: done.count, errors: errors.count };
  }

  // ===== ANNOUNCEMENTS =====

  createAnnouncement(title, text, sentToTelegram, sentToDiscord, showOnSite) {
    return this.prepare(
      'INSERT INTO announcements (title, text, sent_to_telegram, sent_to_discord, show_on_site, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(title, text, sentToTelegram ? 1 : 0, sentToDiscord ? 1 : 0, showOnSite ? 1 : 0, Date.now());
  }

  getActiveAnnouncement(userId) {
    // Получить последнее объявление с show_on_site=1, которое пользователь не закрывал
    return this.prepare(
      `SELECT a.* FROM announcements a
       WHERE a.show_on_site = 1
         AND a.id NOT IN (SELECT announcement_id FROM announcement_dismissals WHERE user_id = ?)
       ORDER BY a.created_at DESC LIMIT 1`
    ).get(userId);
  }

  dismissAnnouncement(announcementId, userId) {
    return this.prepare(
      'INSERT OR IGNORE INTO announcement_dismissals (announcement_id, user_id, dismissed_at) VALUES (?, ?, ?)'
    ).run(announcementId, userId, Date.now());
  }

  getAnnouncementDismissCount(announcementId) {
    const row = this.prepare(
      'SELECT COUNT(*) as count FROM announcement_dismissals WHERE announcement_id = ?'
    ).get(announcementId);
    return row ? row.count : 0;
  }

  getAnnouncementsWithDismissCount() {
    return this.prepare(
      `SELECT a.*, 
        (SELECT COUNT(*) FROM announcement_dismissals WHERE announcement_id = a.id) as dismiss_count
       FROM announcements a ORDER BY a.created_at DESC LIMIT 20`
    ).all();
  }

  close() {
    this.db.close();
  }
}
