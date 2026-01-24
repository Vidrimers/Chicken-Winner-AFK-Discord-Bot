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

  console.log('✅ Миграции завершены');
}
