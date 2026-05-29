/**
 * Миграции базы данных
 */

export function runMigrations(db) {
  console.log('🔄 Запуск миграций базы данных...');

  // Добавляем колонку notified в user_achievements если её нет
  try {
    const tableInfo = db.prepare("PRAGMA table_info(user_achievements)").all();
    const hasNotified = tableInfo.some(col => col.name === 'notified');
    
    if (!hasNotified) {
      db.exec('ALTER TABLE user_achievements ADD COLUMN notified INTEGER DEFAULT 0');
      console.log('✅ Добавлена колонка notified в user_achievements');
      
      // Помечаем все существующие достижения как уже уведомленные
      // чтобы не отправлять уведомления о старых достижениях
      db.exec('UPDATE user_achievements SET notified = 1 WHERE notified = 0');
      console.log('✅ Все существующие достижения помечены как уведомленные');
    }
  } catch (error) {
    console.error(`❌ Ошибка добавления колонки notified: ${error.message}`);
  }

  // Индексы для оптимизации запросов
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_user_stats_rank ON user_stats(rank_points DESC)',
    'CREATE INDEX IF NOT EXISTS idx_achievements_user ON user_achievements(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_achievements_unlocked ON user_achievements(user_id, unlocked_at)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user ON voice_sessions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_duration ON voice_sessions(user_id, duration DESC)',
    'CREATE INDEX IF NOT EXISTS idx_telegram_users ON telegram_users(user_id)',
  ];

  indexes.forEach((sql) => {
    try {
      db.exec(sql);
    } catch (error) {
      console.error(`❌ Ошибка создания индекса: ${error.message}`);
    }
  });

  // Создание таблицы cheater_checks для хранения результатов проверок Steam-профилей
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cheater_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steam_id TEXT NOT NULL,
        persona_name TEXT,
        avatar_url TEXT,
        profile_url TEXT NOT NULL,
        vac_banned INTEGER DEFAULT 0,
        number_of_vac_bans INTEGER DEFAULT 0,
        number_of_game_bans INTEGER DEFAULT 0,
        days_since_last_ban INTEGER DEFAULT 0,
        community_banned INTEGER DEFAULT 0,
        economy_ban TEXT DEFAULT 'none',
        checked_by_discord_id TEXT NOT NULL,
        checked_by_username TEXT,
        checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(steam_id)
      )
    `);
    console.log('✅ Таблица cheater_checks создана/проверена');
  } catch (error) {
    console.error(`❌ Ошибка создания таблицы cheater_checks: ${error.message}`);
  }

  // Индексы для таблицы cheater_checks
  const cheaterCheckIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_cheater_checks_steam_id ON cheater_checks(steam_id)',
    'CREATE INDEX IF NOT EXISTS idx_cheater_checks_banned ON cheater_checks(vac_banned, number_of_game_bans, community_banned)',
    'CREATE INDEX IF NOT EXISTS idx_cheater_checks_date ON cheater_checks(checked_at DESC)',
  ];

  cheaterCheckIndexes.forEach((sql) => {
    try {
      db.exec(sql);
    } catch (error) {
      console.error(`❌ Ошибка создания индекса cheater_checks: ${error.message}`);
    }
  });

  // Создание таблицы bug_reports для системы багрепортов
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bug_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        bug_text TEXT NOT NULL,
        status TEXT DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Таблица bug_reports создана/проверена');
  } catch (error) {
    console.error(`❌ Ошибка создания таблицы bug_reports: ${error.message}`);
  }

  // Индексы для таблицы bug_reports
  const bugReportIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status)',
    'CREATE INDEX IF NOT EXISTS idx_bug_reports_user ON bug_reports(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_bug_reports_date ON bug_reports(created_at DESC)',
  ];

  bugReportIndexes.forEach((sql) => {
    try {
      db.exec(sql);
    } catch (error) {
      console.error(`❌ Ошибка создания индекса bug_reports: ${error.message}`);
    }
  });

  // Создание таблицы user_blocklist для чёрного списка в ТГ боте
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_blocklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        blocked_user_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, blocked_user_id)
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_blocklist_user ON user_blocklist(user_id)');
    console.log('✅ Таблица user_blocklist создана/проверена');
  } catch (error) {
    console.error(`❌ Ошибка создания таблицы user_blocklist: ${error.message}`);
  }

  console.log('✅ Миграции завершены');
}
