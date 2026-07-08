import Database from 'better-sqlite3';
import crypto from 'crypto';
import { log, success, error as logError } from '../utils/logger.js';

const ALGORITHM = 'aes-256-cbc';

function getEncryptionKey() {
  const key = process.env.STEAM_WALL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('STEAM_WALL_ENCRYPTION_KEY не задан в .env');
  }
  return Buffer.from(key, 'hex');
}

function encrypt(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  const key = getEncryptionKey();
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * База данных модуля Steam Wall Auto-Answer
 */
export class SteamWallDatabase {
  constructor(dbPath = process.env.STEAM_WALL_DB_FILE || 'steam-auto-answer.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
    success(`Steam Wall БД подключена: ${dbPath}`);
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sw_users (
        discord_id TEXT PRIMARY KEY,
        refresh_token TEXT,
        is_active INTEGER DEFAULT 0,
        skip_friends INTEGER DEFAULT 1,
        use_general_phrases INTEGER DEFAULT 1,
        use_user_phrases INTEGER DEFAULT 1,
        per_user_cooldown_min INTEGER DEFAULT 30,
        poll_interval_ms INTEGER DEFAULT 60000,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sw_phrases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        text TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (discord_id) REFERENCES sw_users(discord_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sw_target_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        steam_id64 TEXT NOT NULL,
        name TEXT,
        profile_url TEXT,
        avatar_url TEXT,
        phrases_json TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (discord_id) REFERENCES sw_users(discord_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sw_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        target_name TEXT,
        target_steam_id TEXT,
        reply_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (discord_id) REFERENCES sw_users(discord_id) ON DELETE CASCADE
      );
    `);

    // Миграция: добавляем новые колонки если их нет
    try {
      this.db.exec(`ALTER TABLE sw_users ADD COLUMN use_general_phrases INTEGER DEFAULT 1`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE sw_users ADD COLUMN use_user_phrases INTEGER DEFAULT 1`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE sw_target_users ADD COLUMN avatar_url TEXT`);
    } catch {}
  }

  prepare(sql) {
    return this.db.prepare(sql);
  }

  // ===== USERS =====

  getUser(discordId) {
    return this.prepare('SELECT * FROM sw_users WHERE discord_id = ?').get(discordId);
  }

  createUser(discordId) {
    this.prepare(
      'INSERT OR IGNORE INTO sw_users (discord_id) VALUES (?)'
    ).run(discordId);
  }

  setUserActive(discordId, active) {
    this.createUser(discordId);
    this.prepare(
      'UPDATE sw_users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?'
    ).run(active ? 1 : 0, discordId);
  }

  isUserActive(discordId) {
    const user = this.getUser(discordId);
    return user ? Boolean(user.is_active) : false;
  }

  setRefreshToken(discordId, token) {
    this.createUser(discordId);
    const encrypted = encrypt(token);
    this.prepare(
      'UPDATE sw_users SET refresh_token = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?'
    ).run(encrypted, discordId);
  }

  getRefreshToken(discordId) {
    const user = this.getUser(discordId);
    if (!user || !user.refresh_token) return null;
    try {
      return decrypt(user.refresh_token);
    } catch (err) {
      logError(`Ошибка дешифровки токена для ${discordId}: ${err.message}`);
      return null;
    }
  }

  hasRefreshToken(discordId) {
    const user = this.getUser(discordId);
    return user ? !!user.refresh_token : false;
  }

  updateSettings(discordId, settings) {
    this.createUser(discordId);
    const fields = [];
    const values = [];

    if (settings.skipFriends !== undefined) {
      fields.push('skip_friends = ?');
      values.push(settings.skipFriends ? 1 : 0);
    }
    if (settings.useGeneralPhrases !== undefined) {
      fields.push('use_general_phrases = ?');
      values.push(settings.useGeneralPhrases ? 1 : 0);
    }
    if (settings.useUserPhrases !== undefined) {
      fields.push('use_user_phrases = ?');
      values.push(settings.useUserPhrases ? 1 : 0);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(discordId);

    this.prepare(
      `UPDATE sw_users SET ${fields.join(', ')} WHERE discord_id = ?`
    ).run(...values);
  }

  getSettings(discordId) {
    this.createUser(discordId);
    const user = this.getUser(discordId);
    if (!user) return null;
    return {
      skipFriends: Boolean(user.skip_friends),
      useGeneralPhrases: Boolean(user.use_general_phrases),
      useUserPhrases: Boolean(user.use_user_phrases),
      perUserCooldownMin: user.per_user_cooldown_min,
      pollIntervalMs: user.poll_interval_ms,
      isActive: Boolean(user.is_active),
      hasToken: Boolean(user.refresh_token),
    };
  }

  getActiveUsers() {
    const users = this.prepare(
      'SELECT * FROM sw_users WHERE is_active = 1 AND refresh_token IS NOT NULL'
    ).all();
    log(`[SW DB] getActiveUsers: найдено ${users.length} активных`);
    if (users.length > 0) {
      users.forEach(u => log(`[SW DB]   - ${u.discord_id} (active=${u.is_active}, hasToken=${!!u.refresh_token})`));
    }
    return users;
  }

  deleteUser(discordId) {
    this.prepare('DELETE FROM sw_phrases WHERE discord_id = ?').run(discordId);
    this.prepare('DELETE FROM sw_target_users WHERE discord_id = ?').run(discordId);
    this.prepare('DELETE FROM sw_logs WHERE discord_id = ?').run(discordId);
    this.prepare('DELETE FROM sw_users WHERE discord_id = ?').run(discordId);
  }

  // ===== PHRASES =====

  getPhrases(discordId) {
    return this.prepare(
      'SELECT * FROM sw_phrases WHERE discord_id = ? ORDER BY created_at DESC'
    ).all(discordId);
  }

  addPhrase(discordId, text) {
    this.createUser(discordId);
    return this.prepare(
      'INSERT INTO sw_phrases (discord_id, text) VALUES (?, ?)'
    ).run(discordId, text);
  }

  updatePhrase(id, discordId, text) {
    return this.prepare(
      'UPDATE sw_phrases SET text = ? WHERE id = ? AND discord_id = ?'
    ).run(text, id, discordId);
  }

  deletePhrase(id, discordId) {
    return this.prepare(
      'DELETE FROM sw_phrases WHERE id = ? AND discord_id = ?'
    ).run(id, discordId);
  }

  getActivePhrases(discordId) {
    return this.prepare(
      'SELECT text FROM sw_phrases WHERE discord_id = ? AND is_active = 1'
    ).all(discordId).map(r => r.text);
  }

  // ===== TARGET USERS =====

  getTargetUsers(discordId) {
    return this.prepare(
      'SELECT * FROM sw_target_users WHERE discord_id = ? ORDER BY created_at DESC'
    ).all(discordId);
  }

  addTargetUser(discordId, steamId64, name, profileUrl, avatarUrl, phrases = []) {
    this.createUser(discordId);
    const phrasesJson = JSON.stringify(phrases);
    return this.prepare(
      'INSERT INTO sw_target_users (discord_id, steam_id64, name, profile_url, avatar_url, phrases_json) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(discordId, steamId64, name || null, profileUrl || null, avatarUrl || null, phrasesJson);
  }

  updateTargetUser(id, discordId, data) {
    const fields = [];
    const values = [];

    if (data.steamId64 !== undefined) {
      fields.push('steam_id64 = ?');
      values.push(data.steamId64);
    }
    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.profileUrl !== undefined) {
      fields.push('profile_url = ?');
      values.push(data.profileUrl);
    }
    if (data.phrases !== undefined) {
      fields.push('phrases_json = ?');
      values.push(JSON.stringify(data.phrases));
    }

    if (fields.length === 0) return;

    values.push(id, discordId);
    this.prepare(
      `UPDATE sw_target_users SET ${fields.join(', ')} WHERE id = ? AND discord_id = ?`
    ).run(...values);
  }

  deleteTargetUser(id, discordId) {
    return this.prepare(
      'DELETE FROM sw_target_users WHERE id = ? AND discord_id = ?'
    ).run(id, discordId);
  }

  getTargetUserBySteamId(discordId, steamId64) {
    return this.prepare(
      'SELECT * FROM sw_target_users WHERE discord_id = ? AND steam_id64 = ?'
    ).get(discordId, steamId64);
  }

  getTargetPhrases(discordId, steamId64) {
    const target = this.getTargetUserBySteamId(discordId, steamId64);
    if (!target || !target.phrases_json) return [];
    try {
      return JSON.parse(target.phrases_json);
    } catch {
      return [];
    }
  }

  // ===== LOGS =====

  addLog(discordId, targetName, targetSteamId, replyText) {
    this.prepare(
      'INSERT INTO sw_logs (discord_id, target_name, target_steam_id, reply_text) VALUES (?, ?, ?, ?)'
    ).run(discordId, targetName || null, targetSteamId || null, replyText);
  }

  getLogs(discordId, limit = 50) {
    return this.prepare(
      'SELECT * FROM sw_logs WHERE discord_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(discordId, limit);
  }

  getLogsCount(discordId) {
    const result = this.prepare(
      'SELECT COUNT(*) as count FROM sw_logs WHERE discord_id = ?'
    ).get(discordId);
    return result.count;
  }

  close() {
    this.db.close();
  }
}
