/**
 * Миграции базы данных
 */

export function runMigrations(db) {
  console.log('🔄 Запуск миграций базы данных...');

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
