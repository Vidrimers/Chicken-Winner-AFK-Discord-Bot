import Database from 'better-sqlite3';
import { success, error as logError } from '../utils/logger.js';

export class GamesDatabase {
  constructor(dbPath = process.env.GAMES_DB_FILE || 'games.db') {
    this.db = new Database(dbPath);
    this.statements = new Map();
    success(`База данных игр подключена: ${dbPath}`);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        hgid INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        alt_title TEXT,
        hg_link TEXT,
        description TEXT,
        release_date TEXT,
        poster TEXT,
        screenshots TEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        game_slug TEXT NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, game_slug)
      );

      CREATE TABLE IF NOT EXISTS game_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_slug TEXT NOT NULL,
        region TEXT NOT NULL,
        currency TEXT NOT NULL,
        price REAL,
        old_price REAL,
        discount INTEGER DEFAULT 0,
        platform TEXT,
        store_name TEXT,
        store_url TEXT,
        last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_slug, region, currency, platform, store_name)
      );

      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_slug TEXT NOT NULL,
        price REAL NOT NULL,
        currency TEXT NOT NULL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_notifications (
        user_id TEXT PRIMARY KEY,
        price_changes_enabled INTEGER DEFAULT 0,
        notify_discord INTEGER DEFAULT 0,
        notify_telegram INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS game_price_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_favorites_game ON favorites(game_slug);
      CREATE INDEX IF NOT EXISTS idx_game_prices_slug ON game_prices(game_slug);
      CREATE INDEX IF NOT EXISTS idx_price_history_slug ON price_history(game_slug);
      CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(recorded_at);
    `);
  }

  prepare(sql) {
    if (!this.statements.has(sql)) {
      this.statements.set(sql, this.db.prepare(sql));
    }
    return this.statements.get(sql);
  }

  transaction(fn) {
    return this.db.transaction(fn);
  }

  // ===== GAMES =====

  getGameBySlug(slug) {
    return this.prepare('SELECT * FROM games WHERE slug = ?').get(slug);
  }

  searchGames(query, limit = 50) {
    return this.prepare(
      'SELECT * FROM games WHERE title LIKE ? OR alt_title LIKE ? LIMIT ?'
    ).all(`%${query}%`, `%${query}%`, limit);
  }

  upsertGame(game) {
    this.prepare(`
      INSERT INTO games (hgid, title, slug, alt_title, hg_link, release_date, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        alt_title = excluded.alt_title,
        hg_link = excluded.hg_link,
        release_date = excluded.release_date,
        last_updated = CURRENT_TIMESTAMP
    `).run(game.HGID, game.title, game.slug, game.alt_title || null, game.hg_link || null, game.release_date || null);
  }

  upsertManyGames(games) {
    const insert = this.prepare(`
      INSERT INTO games (hgid, title, slug, alt_title, hg_link, release_date, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        alt_title = excluded.alt_title,
        hg_link = excluded.hg_link,
        release_date = excluded.release_date,
        last_updated = CURRENT_TIMESTAMP
    `);

    const transaction = this.transaction((items) => {
      for (const game of items) {
        insert.run(game.HGID, game.title, game.slug, game.alt_title || null, game.hg_link || null, game.release_date || null);
      }
    });

    transaction(games);
  }

  updateGameInfo(slug, data) {
    this.prepare(`
      UPDATE games SET
        description = ?,
        poster = ?,
        screenshots = ?,
        last_updated = CURRENT_TIMESTAMP
      WHERE slug = ?
    `).run(data.description || null, data.poster || null, data.screenshots || null, slug);
  }

  getGamesWithoutDetails(limit = 100) {
    return this.prepare(
      'SELECT slug FROM games WHERE description IS NULL AND last_updated < datetime("now", "-7 days") LIMIT ?'
    ).all(limit);
  }

  // ===== FAVORITES =====

  addFavorite(userId, gameSlug) {
    this.prepare(
      'INSERT OR IGNORE INTO favorites (user_id, game_slug) VALUES (?, ?)'
    ).run(userId, gameSlug);
  }

  removeFavorite(userId, gameSlug) {
    this.prepare('DELETE FROM favorites WHERE user_id = ? AND game_slug = ?').run(userId, gameSlug);
  }

  isFavorite(userId, gameSlug) {
    const result = this.prepare(
      'SELECT 1 FROM favorites WHERE user_id = ? AND game_slug = ?'
    ).get(userId, gameSlug);
    return !!result;
  }

  getUserFavorites(userId) {
    return this.prepare(
      `SELECT f.game_slug as slug, f.added_at, g.title, g.hg_link, g.poster
       FROM favorites f
       LEFT JOIN games g ON f.game_slug = g.slug
       WHERE f.user_id = ?
       ORDER BY f.added_at DESC`
    ).all(userId);
  }

  getFavoriteSlugs() {
    return this.prepare(
      'SELECT DISTINCT game_slug FROM favorites'
    ).all().map(r => r.game_slug);
  }

  getFavoritesCountBySlug() {
    return this.prepare(
      `SELECT game_slug, COUNT(*) as cnt
       FROM favorites
       GROUP BY game_slug
       ORDER BY cnt DESC
       LIMIT 20`
    ).all();
  }

  // ===== GAME PRICES =====

  upsertGamePrices(gameSlug, prices) {
    const upsert = this.prepare(`
      INSERT INTO game_prices (game_slug, region, currency, price, old_price, discount, platform, store_name, store_url, last_checked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(game_slug, region, currency, platform, store_name) DO UPDATE SET
        price = excluded.price,
        old_price = excluded.old_price,
        discount = excluded.discount,
        store_url = excluded.store_url,
        last_checked = CURRENT_TIMESTAMP
    `);

    const transaction = this.transaction((items) => {
      for (const p of items) {
        upsert.run(gameSlug, p.region, p.currency, p.price, p.old_price || null, p.discount || 0, p.platform, p.store_name || null, p.store_url || null);
      }
    });

    transaction(prices);
  }

  getCachedPrices(gameSlug) {
    return this.prepare(
      'SELECT * FROM game_prices WHERE game_slug = ? AND last_checked > datetime("now", "-1 hour")'
    ).all(gameSlug);
  }

  getOldPrices(gameSlug) {
    return this.prepare(
      'SELECT price, currency, recorded_at FROM price_history WHERE game_slug = ? ORDER BY recorded_at ASC'
    ).all(gameSlug);
  }

  // ===== PRICE HISTORY =====

  addPriceHistory(gameSlug, price, currency) {
    this.prepare(
      'INSERT INTO price_history (game_slug, price, currency) VALUES (?, ?, ?)'
    ).run(gameSlug, price, currency);
  }

  addPriceHistoryBulk(entries) {
    const insert = this.prepare(
      'INSERT INTO price_history (game_slug, price, currency) VALUES (?, ?, ?)'
    );

    const transaction = this.transaction((items) => {
      for (const e of items) {
        insert.run(e.game_slug, e.price, e.currency);
      }
    });

    transaction(entries);
  }

  cleanOldPriceHistory(days = 90) {
    this.prepare(
      `DELETE FROM price_history WHERE recorded_at < datetime("now", "-${days} days")`
    ).run();
  }

  // ===== USER NOTIFICATIONS =====

  getNotificationSettings(userId) {
    return this.prepare(
      'SELECT * FROM user_notifications WHERE user_id = ?'
    ).get(userId) || { price_changes_enabled: 0, notify_discord: 0, notify_telegram: 0 };
  }

  setNotificationSettings(userId, settings) {
    this.prepare(`
      INSERT INTO user_notifications (user_id, price_changes_enabled, notify_discord, notify_telegram)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        price_changes_enabled = excluded.price_changes_enabled,
        notify_discord = excluded.notify_discord,
        notify_telegram = excluded.notify_telegram
    `).run(userId, settings.price_changes_enabled ? 1 : 0, settings.notify_discord ? 1 : 0, settings.notify_telegram ? 1 : 0);
  }

  getUsersWithNotifications() {
    return this.prepare(
      `SELECT un.user_id, un.notify_discord, un.notify_telegram, tu.telegram_chat_id
       FROM user_notifications un
       LEFT JOIN telegram_users tu ON un.user_id = tu.user_id
       WHERE un.price_changes_enabled = 1`
    ).all();
  }

  // ===== GAME PRICE SETTINGS =====

  getSetting(key, defaultValue = null) {
    const row = this.prepare('SELECT value FROM game_price_settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  }

  setSetting(key, value) {
    this.prepare(
      'INSERT INTO game_price_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, String(value));
  }

  getPriceCheckInterval() {
    const val = this.getSetting('price_check_interval_hours', '6');
    return parseInt(val, 10) || 6;
  }

  setPriceCheckInterval(hours) {
    this.setSetting('price_check_interval_hours', String(hours));
  }

  close() {
    this.db.close();
  }
}
