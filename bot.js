import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import Database from "better-sqlite3";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import http from "http";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const SERVER_IP = process.env.SERVER_IP || "localhost";

// Инициализируем базу данных
const db = new Database("afkbot.db");

// Создаем таблицы
db.exec(`
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    dm_notifications BOOLEAN DEFAULT 1,
    afk_timeout INTEGER DEFAULT 15,
    achievement_notifications BOOLEAN DEFAULT 1
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_stats (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    total_afk_moves INTEGER DEFAULT 0,
    total_voice_time INTEGER DEFAULT 0,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    longest_session INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    total_mute_toggles INTEGER DEFAULT 0,
    rank_points INTEGER DEFAULT 0,
    total_afk_time INTEGER DEFAULT 0,
    settings_changes INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    mentions_responded INTEGER DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    achievement_id TEXT,
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    manually_deleted BOOLEAN DEFAULT 0,
    UNIQUE(user_id, achievement_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS voice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    channel_name TEXT,
    join_time DATETIME,
    leave_time DATETIME,
    duration INTEGER,
    was_afk_moved BOOLEAN DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    achievement_id TEXT UNIQUE,
    user_id TEXT,
    emoji TEXT,
    name TEXT,
    description TEXT,
    type TEXT DEFAULT 'special',
    preset TEXT,
    points INTEGER DEFAULT 0,
    color TEXT DEFAULT '#FFD700',
    special_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Добавляем колонки, если их нет (обратная совместимость)
try {
  db.exec(`ALTER TABLE user_stats ADD COLUMN total_afk_time INTEGER DEFAULT 0`);
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE user_stats ADD COLUMN settings_changes INTEGER DEFAULT 0`
  );
} catch (error) {}

try {
  db.exec(`ALTER TABLE user_stats ADD COLUMN messages_sent INTEGER DEFAULT 0`);
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE user_stats ADD COLUMN mentions_responded INTEGER DEFAULT 0`
  );
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE user_stats ADD COLUMN stream_channel_time INTEGER DEFAULT 0`
  );
} catch (error) {}

try {
  db.exec(`ALTER TABLE user_stats ADD COLUMN web_visits INTEGER DEFAULT 0`);
} catch (error) {}

try {
  db.exec(`ALTER TABLE user_stats ADD COLUMN total_streams INTEGER DEFAULT 0`);
} catch (error) {}

try {
  db.exec(`ALTER TABLE user_stats ADD COLUMN longest_session_date DATETIME`);
} catch (error) {}

try {
  db.exec(`
    UPDATE user_stats 
    SET longest_session_date = (
      SELECT leave_time 
      FROM voice_sessions 
      WHERE user_id = user_stats.user_id 
      AND duration = user_stats.longest_session
      ORDER BY leave_time DESC
      LIMIT 1
    )
    WHERE longest_session > 0 AND longest_session_date IS NULL
  `);
  console.log("✅ Миграция: заполнены корректные даты для longest_session");
} catch (error) {
  console.log(
    "ℹ️ Миграция longest_session_date уже выполнена или таблица voice_sessions пуста"
  );
}

try {
  db.exec(
    `ALTER TABLE user_settings ADD COLUMN achievement_notifications BOOLEAN DEFAULT 1`
  );
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE achievements ADD COLUMN notifications_sent BOOLEAN DEFAULT 0`
  );
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE user_achievements ADD COLUMN manually_deleted BOOLEAN DEFAULT 0`
  );
} catch (error) {}

const AFK_CHANNEL_ID = process.env.AFK_CHANNEL_ID;
const DEFAULT_TIMEOUT = 15;
const STREAM_CHANNEL_ID = process.env.STREAM_CHANNEL_ID;
const ACHIEVEMENTS_CHANNEL_ID = process.env.ACHIEVEMENTS_CHANNEL_ID;
const SPECIAL_USER_ID = process.env.SPECIAL_USER_ID;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const DEFAULT_TEST_USER_ID = process.env.DEFAULT_TEST_USER_ID;

// Telegram bot settings
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "137981675";
const TELEGRAM_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

// Хранилище для отслеживания (временные данные)
const userInactivityTimers = new Map();
const userOriginalChannels = new Map();
const userJoinTimes = new Map();
const userAFKStartTimes = new Map();
const userStreamJoinTimes = new Map();

// ===== РАСШИРЕННАЯ СИСТЕМА ДОСТИЖЕНИЙ =====
const ACHIEVEMENTS = {
  first_join: {
    id: "first_join",
    name: "🎤 Малыш заговорил",
    description: "Присоединился к голосовому каналу впервые",
    points: 10,
  },
  first_afk: {
    id: "first_afk",
    name: "😴 Первый сон",
    description: "Был перемещен в AFK впервые",
    points: 5,
  },
  first_message: {
    id: "first_message",
    name: "💬 Первые буквы",
    description: "Отправил первое сообщение в текстовом канале",
    points: 10,
  },
  first_settings: {
    id: "first_settings",
    name: "⚙️ Первые настройки",
    description: "Изменил настройки бота впервые",
    points: 10,
  },
  first_web_visit: {
    id: "first_web_visit",
    name: "🌐 Первый серфер",
    description: "Посетил веб-панель бота впервые",
    points: 15,
  },
  first_stream: {
    id: "first_stream",
    name: "📡 Первый стример",
    description: "Включил трансляцию впервые",
    points: 20,
  },
  voice_starter: {
    id: "voice_starter",
    name: "🎧 Алло, это я",
    description: "Провел 50+ часов в голосовых каналах",
    points: 50,
  },
  voice_addict: {
    id: "voice_addict",
    name: "🎧 Заболтал до сотки",
    description: "Провел 100+ часов в голосовых каналах",
    points: 100,
  },
  chatty_beginner: {
    id: "chatty_beginner",
    name: "💬 Разговорчивый новичок",
    description: "Отправил 200+ сообщений в текстовых каналах",
    points: 25,
  },
  session_beginner: {
    id: "session_beginner",
    name: "🎯 Начинающий участник",
    description: "Участвовал в 10+ голосовых сессиях",
    points: 15,
  },
  session_veteran: {
    id: "session_veteran",
    name: "🎯 Опытный участник",
    description: "Участвовал в 50+ голосовых сессиях",
    points: 40,
  },
  voice_god: {
    id: "voice_god",
    name: "🎧 Звезда эфира",
    description: "Провел 1000+ часов в голосовых каналах",
    points: 1000,
  },
  afk_beginner: {
    id: "afk_beginner",
    name: "😴 AFK новичок",
    description: "Перемещен в AFK 10 раз",
    points: 10,
  },
  afk_veteran: {
    id: "afk_veteran",
    name: "😴 AFK ветеран",
    description: "Перемещен в AFK 50 раз",
    points: 50,
  },
  afk_master: {
    id: "afk_master",
    name: "😴 AFK Специалист",
    description: "Перемещен в AFK 100 раз",
    points: 100,
  },
  afk_time_lord: {
    id: "afk_time_lord",
    name: "😴 AFK Повелитель времени",
    description: "Провел 1000+ часов в AFK канале",
    points: 1000,
  },
  no_afk_week: {
    id: "no_afk_week",
    name: "💪 Железная воля",
    description: "Неделя без перемещений в AFK",
    points: 50,
  },
  mute_master: {
    id: "mute_master",
    name: "🎙️ Мастер тишины",
    description: "Переключил микрофон 100 раз",
    points: 25,
  },
  long_session: {
    id: "long_session",
    name: "⏰ Марафонец",
    description: "Провел 12+ часов в одной сессии",
    points: 75,
  },
  settings_explorer: {
    id: "settings_explorer",
    name: "⚙️ Исследователь настроек",
    description: "Изменил настройки бота 20 раз",
    points: 30,
  },
  chatty_user: {
    id: "chatty_user",
    name: "💬 Болтун",
    description: "Отправил 500+ сообщений в текстовых каналах",
    points: 75,
  },
  flooter: {
    id: "flooter",
    name: "💬 Флудер",
    description: "Отправил 750+ сообщений в текстовых каналах",
    points: 100,
  },
  linguist: {
    id: "linguist",
    name: "💬 Лингвист",
    description: "Отправил 1000+ сообщений в текстовых каналах",
    points: 150,
  },
  session_master: {
    id: "session_master",
    name: "🎯 Мастер сессий",
    description: "Участвовал в 100+ голосовых сессиях",
    points: 75,
  },
  frequent_guest: {
    id: "frequent_guest",
    name: "🎯 Частый гость",
    description: "Участвовал в 200+ голосовых сессиях",
    points: 150,
  },
  permanent_resident: {
    id: "permanent_resident",
    name: "🎯 Постоянный житель",
    description: "Участвовал в 500+ голосовых сессиях",
    points: 350,
  },
  session_lord: {
    id: "session_lord",
    name: "🎯 Властелин сессий",
    description: "Участвовал в 1000+ голосовых сессиях",
    points: 1000,
  },
  mention_responder: {
    id: "mention_responder",
    name: "📢 Отзывчивый",
    description: "Ответил на 1000+ упоминаний",
    points: 100,
  },
  stream_viewer_1: {
    id: "stream_viewer_1",
    name: "📺 Одним глазком",
    description: "Провел 5+ часов в канале Че смотрим?",
    points: 10,
  },
  stream_viewer_2: {
    id: "stream_viewer_2",
    name: "📺 Зритель со стажем",
    description: "Провел 50+ часов в канале Че смотрим?",
    points: 50,
  },
  stream_viewer_3: {
    id: "stream_viewer_3",
    name: "📺 Топовый зритель",
    description: "Провел 100+ часов в канале Че смотрим?",
    points: 100,
  },
  stream_viewer_4: {
    id: "stream_viewer_4",
    name: "📺 Киберфанат",
    description: "Провел 200+ часов в канале Че смотрим?",
    points: 200,
  },
  stream_viewer_5: {
    id: "stream_viewer_5",
    name: "📺 Бессмертный зритель",
    description: "Провел 500+ часов в канале Че смотрим?",
    points: 500,
  },
  stream_viewer_6: {
    id: "stream_viewer_6",
    name: "📺 Легенда трансляций",
    description: "Провел 1000+ часов в канале Че смотрим?",
    points: 1000,
  },
  best_admin: {
    id: "best_admin",
    name: "👑 Kakashech - Лучший админ",
    description: "Лучший admin_ebaniy канала",
    points: 0,
  },
};

// ===== ФУНКЦИЯ: ПРОВЕРКА И ОТПРАВКА ПРОПУЩЕННЫХ УВЕДОМЛЕНИЙ =====
async function checkAndSendMissedAchievementNotifications() {
  try {
    console.log("🔎 Начало проверки пропущенных уведомлений о достижениях...");

    // Получаем текущее время в Московском часовом поясе
    const nowMoscowISO = getMoscowNowISO();

    console.log(`📅 Московское время (UTC+3): ${nowMoscowISO}`);

    // Получаем все специальные достижения с истекшей датой, для которых не отправлены уведомления
    // Используем московское время для сравнения
    const missedAchievements = db
      .prepare(
        `
      SELECT * FROM achievements 
      WHERE type = 'special' 
        AND special_date IS NOT NULL
        AND special_date <= ?
        AND (notifications_sent = 0 OR notifications_sent IS NULL)
    `
      )
      .all(nowMoscowISO);

    console.log(
      `🎯 Найдено достижений для отправки уведомлений: ${missedAchievements.length}`
    );

    if (missedAchievements.length === 0) {
      console.log("✅ Нет пропущенных уведомлений о достижениях");
      return;
    }

    console.log(
      `⏰ Найдено ${missedAchievements.length} пропущенных уведомлений о достижениях`
    );

    for (const achievement of missedAchievements) {
      try {
        console.log(
          `📤 Обработка достижения: ${achievement.name} для пользователя ${achievement.user_id}`
        );

        const user = await client.users
          .fetch(achievement.user_id)
          .catch((err) => {
            console.log(
              `⚠️ Не удалось получить пользователя ${achievement.user_id}: ${err.message}`
            );
            return null;
          });
        const username = user ? user.username : "Пользователь";

        // Отправляем ЛС пользователю
        if (user) {
          try {
            const dmMessage =
              `\n\n🏆 **Новое достижение!**\n\n` +
              `${achievement.emoji} **${achievement.name}**\n` +
              `${achievement.description}\n\n` +
              `🌐 Посмотреть в веб-панели: http://${SERVER_IP}:${PORT}/?userId=${achievement.user_id}&autoLogin=true`;

            await user.send(dmMessage);
            console.log(
              `✅ ЛС отправлено пользователю ${username} за достижение "${achievement.name}"`
            );
          } catch (dmError) {
            console.log(
              `❌ Не удалось отправить ЛС пользователю ${achievement.user_id}: ${dmError.message}`
            );
          }
        } else {
          console.log(
            `⚠️ Пользователь ${achievement.user_id} не найден в Discord`
          );
        }

        // Отправляем в канал Discord
        try {
          const channel = client.channels.cache.get(ACHIEVEMENTS_CHANNEL_ID);
          if (channel) {
            const channelMessage =
              `\n\n🏆 **Новое достижение!**\n\n` +
              `👤 **Пользователь:** <@${achievement.user_id}>\n` +
              `🎯 **Достижение:** ${achievement.emoji} ${achievement.name}\n` +
              `📝 **Описание:** ${achievement.description}\n` +
              `📅 **Время:** ${formatTime(new Date())}\n\n` +
              `🌐 **Посмотреть в веб-панели:** http://${SERVER_IP}:${PORT}/?userId=${achievement.user_id}&autoLogin=true`;

            await channel.send(channelMessage);
            console.log(
              `✅ Сообщение в канал отправлено за достижение "${achievement.name}"`
            );
          } else {
            console.log(
              `⚠️ Канал достижений (${ACHIEVEMENTS_CHANNEL_ID}) не найден`
            );
          }
        } catch (channelError) {
          console.log(
            `❌ Не удалось отправить уведомление в канал: ${channelError.message}`
          );
        }

        // Отправляем в Telegram
        try {
          let telegramMessage =
            `🏆 <b>Новое специальное достижение!</b>\n` +
            `👤 Пользователь: ${username}\n` +
            `🎯 Достижение: ${achievement.emoji} ${achievement.name}\n` +
            `📝 Описание: ${achievement.description}\n`;

          if (achievement.color) {
            telegramMessage += `🎨 Цвет: ${achievement.color}\n`;
          }

          telegramMessage += `✅ Доступно с: ${formatTime(
            new Date(achievement.special_date)
          )}\n`;
          telegramMessage += `📅 Отправлено: ${formatTime(new Date())}`;

          sendTelegramReport(telegramMessage);
          console.log(
            `✅ Telegram уведомление отправлено за достижение "${achievement.name}"`
          );
        } catch (telegramError) {
          console.log(
            `⚠️ Ошибка при отправке в Telegram: ${telegramError.message}`
          );
        }

        // Отмечаем что уведомления отправлены
        try {
          db.prepare(
            `UPDATE achievements SET notifications_sent = 1 WHERE achievement_id = ?`
          ).run(achievement.achievement_id);
          console.log(
            `✅ Флаг notifications_sent установлен для ${achievement.achievement_id}`
          );
        } catch (updateErr) {
          console.error(
            "❌ Ошибка при обновлении флага notifications_sent:",
            updateErr
          );
        }
      } catch (notificationError) {
        console.error(
          `❌ Ошибка при отправке пропущенного уведомления:`,
          notificationError
        );
      }
    }

    console.log("✅ Завершена проверка пропущенных уведомлений о достижениях");
  } catch (error) {
    console.error(
      "❌ Критическая ошибка при проверке пропущенных уведомлений:",
      error
    );
  }
}

// ===== ФУНКЦИЯ: ОТПРАВКА ОТЧЕТА В TELEGRAM =====
async function sendTelegramReport(message) {
  try {
    const response = await fetch(TELEGRAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      console.error(`❌ Ошибка отправки в Telegram: ${response.status}`);
    }
  } catch (error) {
    console.error("❌ Ошибка при отправке в Telegram:", error);
  }
}

// ===== ФУНКЦИЯ: ФОРМАТИРОВАНИЕ ВРЕМЕНИ =====
function formatTime(date) {
  return date.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Получить текущее время в московском часовом поясе (UTC+3)
function getMoscowNow() {
  const now = new Date();
  const moscowOffset = 3 * 60 * 60 * 1000; // UTC+3 в миллисекундах
  return new Date(now.getTime() + moscowOffset);
}

// Получить ISO строку москов​ского времени
function getMoscowNowISO() {
  return getMoscowNow().toISOString();
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }
  return `${minutes}м`;
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С БАЗОЙ ДАННЫХ =====
const getUserDMSetting = (userId) => {
  const stmt = db.prepare(
    "SELECT dm_notifications FROM user_settings WHERE user_id = ?"
  );
  const result = stmt.get(userId);
  return result ? Boolean(result.dm_notifications) : true;
};

const getUserTimeout = (userId) => {
  const stmt = db.prepare(
    "SELECT afk_timeout FROM user_settings WHERE user_id = ?"
  );
  const result = stmt.get(userId);
  return result ? result.afk_timeout : DEFAULT_TIMEOUT;
};

const setUserDMSetting = (userId, enabled) => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout) 
    VALUES (?, ?, COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), ?))
  `);
  stmt.run(userId, enabled ? 1 : 0, userId, DEFAULT_TIMEOUT);
};

const setUserTimeout = (userId, timeout) => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout) 
    VALUES (?, COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), ?)
  `);
  stmt.run(userId, userId, timeout);
};

// Функции для управления уведомлениями о достижениях
const getUserAchievementNotificationSetting = (userId) => {
  const stmt = db.prepare(
    "SELECT achievement_notifications FROM user_settings WHERE user_id = ?"
  );
  const result = stmt.get(userId);
  return result ? Boolean(result.achievement_notifications) : true;
};

const setUserAchievementNotificationSetting = (userId, enabled) => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications) 
    VALUES (?, 
            COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), 
            COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
            ?)
  `);
  stmt.run(userId, userId, userId, enabled ? 1 : 0);
};

// ===== ФУНКЦИИ СТАТИСТИКИ =====
const initUserStats = (userId, username) => {
  // Проверяем, существует ли уже пользователь
  const existingStmt = db.prepare(
    "SELECT username FROM user_stats WHERE user_id = ?"
  );
  const existing = existingStmt.get(userId);

  if (existing) {
    // Если пользователь существует и имя - это "Web User", обновляем на реальное
    if (
      existing.username === "Web User" &&
      username &&
      username !== "Web User"
    ) {
      const updateStmt = db.prepare(
        "UPDATE user_stats SET username = ? WHERE user_id = ?"
      );
      updateStmt.run(username, userId);
    }
  } else {
    // Если пользователя нет - создаем новую запись
    const stmt = db.prepare(`
      INSERT INTO user_stats (user_id, username) 
      VALUES (?, ?)
    `);
    stmt.run(userId, username);
  }
};

const updateUserStats = (userId, field, value) => {
  const stmt = db.prepare(`
    UPDATE user_stats SET ${field} = ?, last_activity = CURRENT_TIMESTAMP 
    WHERE user_id = ?
  `);
  stmt.run(value, userId);
};

const incrementUserStat = (userId, field, increment = 1) => {
  const stmt = db.prepare(`
    UPDATE user_stats SET ${field} = ${field} + ?, last_activity = CURRENT_TIMESTAMP 
    WHERE user_id = ?
  `);
  stmt.run(increment, userId);
};

const getUserStats = (userId) => {
  const stmt = db.prepare("SELECT * FROM user_stats WHERE user_id = ?");
  return stmt.get(userId);
};

const getTopUsers = (limit = 10) => {
  const stmt = db.prepare(`
    SELECT * FROM user_stats 
    ORDER BY rank_points DESC, total_voice_time DESC 
    LIMIT ?
  `);
  return stmt.all(limit);
};

// ===== ФУНКЦИИ ДОСТИЖЕНИЙ =====
const checkAndUnlockAchievement = async (userId, username, achievementId) => {
  // Проверяем, есть ли уже такое достижение
  const checkStmt = db.prepare(`
    SELECT * FROM user_achievements 
    WHERE user_id = ? AND achievement_id = ?
  `);
  const existing = checkStmt.get(userId, achievementId);

  // Если достижение уже разблокировано (и не удалено) - не добавляем снова
  if (existing && !existing.manually_deleted) {
    console.log(
      `⏭️ Достижение ${achievementId} уже есть у пользователя ${username}`
    );
    return false;
  }

  console.log(
    `✅ Добавляем новое достижение ${achievementId} пользователю ${username}`
  );

  // Если достижение было удалено (manually_deleted = 1), обновляем флаг и время
  // Иначе добавляем новое достижение
  if (existing && existing.manually_deleted) {
    console.log(`♻️ Восстанавливаем удаленное достижение ${achievementId}`);
    db.prepare(
      `
      UPDATE user_achievements 
      SET manually_deleted = 0, unlocked_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND achievement_id = ?
    `
    ).run(userId, achievementId);
  } else {
    const stmt = db.prepare(`
      INSERT INTO user_achievements (user_id, achievement_id, unlocked_at, manually_deleted) 
      VALUES (?, ?, CURRENT_TIMESTAMP, 0)
    `);
    stmt.run(userId, achievementId);
  }

  // Получаем достижение для отправки уведомлений
  const achievement = ACHIEVEMENTS[achievementId];
  console.log(
    `🔍 Ищем в ACHIEVEMENTS[${achievementId}]:`,
    achievement ? "✅ НАЙДЕНО" : "❌ НЕ НАЙДЕНО"
  );

  if (achievement) {
    console.log(
      `📤 Отправляем уведомления для достижения: ${achievement.name}`
    );

    // Всегда добавляем очки
    incrementUserStat(userId, "rank_points", achievement.points);

    // Отправляем уведомление (проверяем настройки)
    const member = client.users.cache.get(userId);
    const achievementNotificationsEnabled =
      getUserAchievementNotificationSetting(userId);

    console.log(
      `👤 Member: ${
        member ? member.username : "НЕ НАЙДЕН"
      }, Уведомления: ${achievementNotificationsEnabled}`
    );

    if (member && achievementNotificationsEnabled) {
      try {
        const messageText =
          `🏆 **Новое достижение!**\n\n` +
          `${achievement.name}\n` +
          `${achievement.description}\n` +
          `+${achievement.points} очков рейтинга! 🌟\n\n`;

        await member.send(
          messageText +
            `💡 Посмотреть все достижения:\n` +
            `📱 В боте: \`.!. achievements\`\n` +
            `🌐 Веб-панель: http://${SERVER_IP}:${PORT}/?userId=${userId}&autoLogin=true`
        );
        console.log(`✅ ЛС отправлено пользователю ${username}`);
      } catch (error) {
        console.log(
          `❌ Не удалось отправить уведомление о достижении пользователю ${username}: ${error.message}`
        );
      }
    }

    // Отправляем в Telegram
    const telegramText =
      `🏆 <b>Новое достижение!</b>\n` +
      `👤 Пользователь: ${username}\n` +
      `🎯 Достижение: ${achievement.name}\n` +
      `📝 Описание: ${achievement.description}\n` +
      `⭐ Очки: +${achievement.points}\n` +
      `📅 Время: ${formatTime(new Date())}`;

    sendTelegramReport(telegramText);
    console.log(`✅ Telegram отправлен`);

    // Отправляем уведомление в канал Discord
    try {
      const channel = client.channels.cache.get(ACHIEVEMENTS_CHANNEL_ID);
      console.log(
        `📢 Канал достижений: ${channel ? channel.name : "НЕ НАЙДЕН"}`
      );
      if (channel) {
        const discordText =
          `🏆 **Новое достижение!**\n\n` +
          `👤 **Пользователь:** <@${userId}> (${username})\n` +
          `🎯 **Достижение:** ${achievement.name}\n` +
          `📝 **Описание:** ${achievement.description}\n` +
          `⭐ **Очки:** +${achievement.points}\n` +
          `📅 **Время:** ${formatTime(new Date())}`;

        await channel.send(discordText);
        console.log(`✅ Сообщение в канал отправлено`);
      }
    } catch (error) {
      console.log(
        `❌ Не удалось отправить уведомление о достижении в канал: ${error.message}`
      );
    }

    return true;
  } else {
    console.log(`❌ Достижение ${achievementId} не найдено в ACHIEVEMENTS!`);
  }
  return false;
};

const getUserAchievements = (userId) => {
  // Получаем обычные достижения из user_achievements (исключаем удаленные)
  const stmt = db.prepare(`
    SELECT ua.*, ua.unlocked_at, NULL as emoji, NULL as name, NULL as description, NULL as color, NULL as type
    FROM user_achievements ua
    WHERE ua.user_id = ? AND (ua.manually_deleted = 0 OR ua.manually_deleted IS NULL)
    ORDER BY ua.unlocked_at DESC
  `);
  const regularAchievements = stmt.all(userId);

  // Получаем специальные достижения из таблицы achievements
  // ТОЛЬКО те, которые этот пользователь получил (есть в user_achievements и не удалены)
  const specialStmt = db.prepare(`
    SELECT a.achievement_id, a.emoji, a.name, a.description, a.color, a.special_date, a.type,
           ua.unlocked_at
    FROM achievements a
    INNER JOIN user_achievements ua ON a.achievement_id = ua.achievement_id AND ua.user_id = ?
    WHERE a.type = 'special' AND (ua.manually_deleted = 0 OR ua.manually_deleted IS NULL)
    ORDER BY ua.unlocked_at DESC
  `);
  const specialAchievements = specialStmt.all(userId);

  // Объединяем оба массива
  return [...regularAchievements, ...specialAchievements];
};

// ===== РАСШИРЕННЫЕ ПРОВЕРКИ ДОСТИЖЕНИЙ =====
const checkAchievements = async (userId, username) => {
  const stats = getUserStats(userId);
  if (!stats) return;

  // Голосовые достижения
  if (stats.total_voice_time >= 180000) {
    // 50 часов
    await checkAndUnlockAchievement(userId, username, "voice_starter");
  }

  if (stats.total_voice_time >= 360000) {
    // 100 часов
    await checkAndUnlockAchievement(userId, username, "voice_addict");
  }

  if (stats.total_voice_time >= 3600000) {
    // 1000 часов
    await checkAndUnlockAchievement(userId, username, "voice_god");
  }

  // AFK достижения
  if (stats.total_afk_moves >= 10) {
    await checkAndUnlockAchievement(userId, username, "afk_beginner");
  }

  if (stats.total_afk_moves >= 50) {
    await checkAndUnlockAchievement(userId, username, "afk_veteran");
  }

  if (stats.total_afk_moves >= 100) {
    await checkAndUnlockAchievement(userId, username, "afk_master");
  }

  // AFK время
  if (stats.total_afk_time >= 3600000) {
    // 1000 часов в AFK
    await checkAndUnlockAchievement(userId, username, "afk_time_lord");
  }

  // Длинная сессия
  if (stats.longest_session >= 43200) {
    // 12 часов
    await checkAndUnlockAchievement(userId, username, "long_session");
  }

  // Микрофон
  if (stats.total_mute_toggles >= 100) {
    await checkAndUnlockAchievement(userId, username, "mute_master");
  }

  // Первое изменение настроек
  if (stats.settings_changes >= 1) {
    await checkAndUnlockAchievement(userId, username, "first_settings");
  }

  // Настройки
  if (stats.settings_changes >= 20) {
    await checkAndUnlockAchievement(userId, username, "settings_explorer");
  }

  // Сообщения
  if (stats.messages_sent >= 200) {
    await checkAndUnlockAchievement(userId, username, "chatty_beginner");
  }

  if (stats.messages_sent >= 500) {
    await checkAndUnlockAchievement(userId, username, "chatty_user");
  }

  if (stats.messages_sent >= 750) {
    await checkAndUnlockAchievement(userId, username, "flooter");
  }

  if (stats.messages_sent >= 1000) {
    await checkAndUnlockAchievement(userId, username, "linguist");
  }

  // Первое сообщение
  if (stats.messages_sent >= 1) {
    await checkAndUnlockAchievement(userId, username, "first_message");
  }

  // Сессии
  if (stats.total_sessions >= 10) {
    await checkAndUnlockAchievement(userId, username, "session_beginner");
  }

  if (stats.total_sessions >= 50) {
    await checkAndUnlockAchievement(userId, username, "session_veteran");
  }

  if (stats.total_sessions >= 100) {
    await checkAndUnlockAchievement(userId, username, "session_master");
  }

  if (stats.total_sessions >= 200) {
    await checkAndUnlockAchievement(userId, username, "frequent_guest");
  }

  if (stats.total_sessions >= 500) {
    await checkAndUnlockAchievement(userId, username, "permanent_resident");
  }

  if (stats.total_sessions >= 1000) {
    await checkAndUnlockAchievement(userId, username, "session_lord");
  }

  // Упоминания
  if (stats.mentions_responded >= 1000) {
    await checkAndUnlockAchievement(userId, username, "mention_responder");
  }

  // Стрим-канал достижения
  if (stats.stream_channel_time >= 18000) {
    // 5 часов
    await checkAndUnlockAchievement(userId, username, "stream_viewer_1");
  }

  if (stats.stream_channel_time >= 180000) {
    // 50 часов
    await checkAndUnlockAchievement(userId, username, "stream_viewer_2");
  }

  if (stats.stream_channel_time >= 360000) {
    // 100 часов
    await checkAndUnlockAchievement(userId, username, "stream_viewer_3");
  }

  if (stats.stream_channel_time >= 720000) {
    // 200 часов
    await checkAndUnlockAchievement(userId, username, "stream_viewer_4");
  }

  if (stats.stream_channel_time >= 1800000) {
    // 500 часов
    await checkAndUnlockAchievement(userId, username, "stream_viewer_5");
  }

  if (stats.stream_channel_time >= 3600000) {
    // 1000 часов
    await checkAndUnlockAchievement(userId, username, "stream_viewer_6");
  }

  // Посещение веб-панели
  if (stats.web_visits >= 1) {
    await checkAndUnlockAchievement(userId, username, "first_web_visit");
  }

  // Первая трансляция
  if (stats.total_streams >= 1) {
    await checkAndUnlockAchievement(userId, username, "first_stream");
  }
};

const checkSpecialAchievement = async () => {
  const now = new Date();
  const targetDate = new Date(2025, 11, 7, 0, 5, 0); // 7 декабря 2025, 0:05
  const specialUserId = process.env.SPECIAL_USER_ID; // Kakashech

  // Проверяем, не наступило ли время (с точностью до минуты)
  if (
    now.getFullYear() === targetDate.getFullYear() &&
    now.getMonth() === targetDate.getMonth() &&
    now.getDate() === targetDate.getDate() &&
    now.getHours() === targetDate.getHours() &&
    now.getMinutes() === targetDate.getMinutes()
  ) {
    // Проверяем, не выдано ли уже это достижение
    const stmt = db.prepare(`
      SELECT * FROM user_achievements 
      WHERE user_id = ? AND achievement_id = ?
    `);
    const existingAchievement = stmt.get(specialUserId, "best_admin");

    if (!existingAchievement) {
      // Инициализируем пользователя, если нужно
      initUserStats(specialUserId, "Лучший админ");

      // Выдаем достижение
      const insertStmt = db.prepare(`
        INSERT INTO user_achievements (user_id, achievement_id) 
        VALUES (?, ?)
      `);
      insertStmt.run(specialUserId, "best_admin");

      // Отправляем личное сообщение
      try {
        const user = await client.users.fetch(specialUserId);
        if (user) {
          await user.send(
            "🎉 Поздравляем! Ты стал лучшим администратором канала! С днем рождения, малютка 👑"
          );

          console.log(
            `🎉 Специальное достижение "Лучший админ" выдано пользователю ${specialUserId}`
          );

          // Отправляем в Telegram
          sendTelegramReport(
            `👑 <b>Специальное достижение выдано!</b>\n` +
              `🎯 Достижение: Лучший админ\n` +
              `👤 Пользователь ID: <code>${specialUserId}</code>\n` +
              `🎂 Поздравление с днем рождения отправлено!\n` +
              `📅 Время: ${formatTime(new Date())}`
          );

          // Отправляем уведомление в канал Discord
          try {
            const channel = client.channels.cache.get(ACHIEVEMENTS_CHANNEL_ID);
            if (channel) {
              await channel.send(
                `🏆 **Новое достижение!**\n\n` +
                  `👤 **Пользователь:** <@${specialUserId}> (Лучший админ)\n` +
                  `🎯 **Достижение:** 👑 Kakashech - Лучший админ\n` +
                  `📝 **Описание:** Лучший admin_ebaniy канала\n` +
                  `📅 **Время:** ${formatTime(new Date())}\n` +
                  `🎂  **Поздравляем малютку с днем рождения**\n\n` +
                  `🌐 **Посмотреть это достижение можно в веб-панели:** http://${SERVER_IP}:${PORT}/?userId=${specialUserId}&autoLogin=true`
              );
            }
          } catch (channelError) {
            console.log(
              `Не удалось отправить уведомление о достижении best_admin в канал: ${channelError.message}`
            );
          }
        }
      } catch (error) {
        console.error("❌ Не удалось отправить поздравление:", error);
      }
    }
  }
};

// ===== ВЕБ-ПАНЕЛЬ =====
const app = express();
const PORT = process.env.PORT || 3000;

// Простая система сессии на основе памяти
const sessions = new Map();

// Middleware для работы с сессиями
function getSession(req) {
  const sessionId = req.headers.cookie?.split("sessionId=")[1]?.split(";")[0];
  return sessionId ? sessions.get(sessionId) : null;
}

function setSession(res, userId) {
  const sessionId =
    "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  sessions.set(sessionId, { userId, createdAt: Date.now() });
  res.setHeader(
    "Set-Cookie",
    `sessionId=${sessionId}; Path=/; Max-Age=86400; SameSite=Strict`
  );
  return sessionId;
}

function clearSession(res, req) {
  const sessionId = req.headers.cookie?.split("sessionId=")[1]?.split(";")[0];
  if (sessionId) sessions.delete(sessionId);
  res.setHeader("Set-Cookie", `sessionId=; Path=/; Max-Age=0`);
}

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// API маршруты
app.get("/api/stats/:userId", (req, res) => {
  try {
    const userId = req.params.userId;

    const stats = getUserStats(userId);

    const achievements = getUserAchievements(userId);

    const settings = {
      dmNotifications: getUserDMSetting(userId),
      afkTimeout: getUserTimeout(userId),
      achievementNotifications: getUserAchievementNotificationSetting(userId),
    };

    res.json({
      stats: stats || {},
      achievements,
      settings,
    });
  } catch (error) {
    console.error("❌ Ошибка в API /api/stats:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/leaderboard", (req, res) => {
  const topUsers = getTopUsers(20);
  res.json(topUsers);
});

// API endpoint для получения всех специальных достижений
app.get("/api/special-achievements", (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT DISTINCT achievement_id, emoji, name, description, type, color, special_date, user_id
      FROM achievements
      WHERE type = 'special'
      ORDER BY created_at DESC
    `);
    const specialAchievements = stmt.all();
    res.json(specialAchievements);
  } catch (error) {
    console.error("Ошибка при получении специальных достижений:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/settings/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { dmNotifications, afkTimeout, achievementNotifications } = req.body;

  try {
    // Инициализируем пользователя, если нужно
    initUserStats(userId, "Web User");

    // Получаем текущие настройки для сравнения
    const currentDM = getUserDMSetting(userId);
    const currentTimeout = getUserTimeout(userId);

    let settingsChanged = false;

    if (dmNotifications !== undefined && dmNotifications !== currentDM) {
      setUserDMSetting(userId, dmNotifications);
      settingsChanged = true;
    }

    if (
      afkTimeout !== undefined &&
      [10, 15, 30, 45].includes(afkTimeout) &&
      afkTimeout !== currentTimeout
    ) {
      setUserTimeout(userId, afkTimeout);
      settingsChanged = true;
    }

    // Проверяем настройки уведомлений о достижениях
    if (achievementNotifications !== undefined) {
      const currentAchievementNotifications =
        getUserAchievementNotificationSetting(userId);
      if (achievementNotifications !== currentAchievementNotifications) {
        setUserAchievementNotificationSetting(userId, achievementNotifications);
        settingsChanged = true;
      }
    }

    // Если настройки изменились - обновляем статистику
    if (settingsChanged) {
      incrementUserStat(userId, "settings_changes");

      // Получаем пользователя из Discord для проверки достижений
      try {
        const user = await client.users.fetch(userId).catch(() => null);
        const username = user ? user.username : "Неизвестный пользователь";

        // Проверяем достижение за первое изменение настроек
        const stats = getUserStats(userId);
        if (stats && stats.settings_changes === 1) {
          await checkAndUnlockAchievement(userId, username, "first_settings");
        }

        // Проверяем все остальные достижения
        await checkAchievements(userId, username);

        // Отправляем отчет в Telegram
        const dmStatus =
          dmNotifications !== undefined
            ? dmNotifications
              ? "✅ включены"
              : "❌ отключены"
            : currentDM
            ? "✅ включены"
            : "❌ отключены";

        const timeoutValue =
          afkTimeout !== undefined ? afkTimeout : currentTimeout;

        // Формируем правильное отображение времени
        let timeoutDisplay;
        if (timeoutValue < 15) {
          // Это секунды
          timeoutDisplay = timeoutValue + " секунд";
        } else {
          // Это минуты
          timeoutDisplay = timeoutValue + " минут";
        }

        const achievementStatus =
          achievementNotifications !== undefined
            ? achievementNotifications
              ? "✅ включены"
              : "❌ отключены"
            : getUserAchievementNotificationSetting(userId)
            ? "✅ включены"
            : "❌ отключены";

        sendTelegramReport(
          `🔔 <b>Пользователь изменил настройки через веб-панель</b>\n` +
            `👤 Пользователь: ${username}\n` +
            `🆔 ID: <code>${userId}</code>\n` +
            `📩 ЛС уведомления: ${dmStatus}\n` +
            `⏱️ Таймер AFK: ${timeoutDisplay}\n` +
            `🏆 Уведомления о достижениях: ${achievementStatus}\n` +
            `📅 Время: ${formatTime(new Date())}`
        );
      } catch (error) {
        console.error(
          "Ошибка при проверке достижений через веб-панель:",
          error
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка при сохранении настроек:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API для отслеживания посещений веб-панели
app.post("/api/visit/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    // Инициализируем пользователя, если нужно
    initUserStats(userId, "Web User");

    // Получаем текущую статистику
    const stats = getUserStats(userId);

    // Увеличиваем счетчик посещений
    incrementUserStat(userId, "web_visits");

    // Проверяем достижение за посещение веб-панели
    if (stats) {
      // Получаем пользователя из Discord
      const user = await client.users.fetch(userId).catch(() => null);
      const username = user ? user.username : "Неизвестный пользователь";

      // Пытаемся выдать первое посещение (если еще не получено, будет добавлено)
      await checkAndUnlockAchievement(userId, username, "first_web_visit");
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка при отслеживании посещения:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API endpoint для создания специального достижения (админ-панель)
app.post("/api/admin/create-achievement", async (req, res) => {
  console.log("🔵 API /create-achievement: Начало обработки запроса");
  console.log("📦 Body:", JSON.stringify(req.body).substring(0, 200));

  const { emoji, name, description, type, userId, specialDate, color } =
    req.body;

  console.log(
    `📝 Параметры: emoji=${emoji}, name=${name}, type=${type}, userId=${userId}, specialDate=${specialDate}`
  );

  // Проверяем обязательные поля
  if (!emoji || !name || !description || !type || !userId) {
    console.log("❌ Отсутствуют обязательные поля!");
    return res.status(400).json({ error: "Отсутствуют обязательные поля" });
  }

  try {
    console.log(
      `📝 API: Получен запрос на создание достижения: ${name} для пользователя ${userId}`
    );

    // Проверяем что тип = 'special'
    if (type !== "special") {
      return res.status(400).json({ error: "Тип должен быть 'special'" });
    }

    // Генерируем уникальный achievement_id
    const achievementId =
      "special_" + Date.now() + "_" + Math.random().toString(36).substring(7);
    console.log(`📝 ID достижения: ${achievementId}`);

    // Инициализируем пользователя если нужно
    initUserStats(userId, "Special Achievement User");
    console.log(`✅ Пользователь инициализирован`);

    // Вставляем достижение в БД
    try {
      db.prepare(
        `
        INSERT INTO achievements (achievement_id, user_id, emoji, name, description, type, color, special_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        achievementId,
        userId,
        emoji,
        name,
        description,
        type,
        color,
        specialDate || null
      );
    } catch (err) {
      console.error(`❌ Ошибка при добавлении в achievements:`, err);
      throw err;
    }
    console.log(`✅ Достижение добавлено в таблицу achievements`);

    // Добавляем достижение в user_achievements с временем разблокировки
    const unlockedTime = specialDate || new Date().toISOString();
    try {
      db.prepare(
        `
        INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
        VALUES (?, ?, ?)
      `
      ).run(userId, achievementId, unlockedTime);
    } catch (err) {
      console.error(`❌ Ошибка при добавлении в user_achievements:`, err);
    }

    // Если указана дата, планируем отправку уведомлений на это время
    if (specialDate) {
      // specialDate это строка в ISO формате: "2025-12-09T07:10"
      // Интерпретируем это как московское время
      const targetDateStr = specialDate;

      // Текущее время в UTC
      const now = new Date();
      const moscowOffset = 3 * 60 * 60 * 1000;
      const nowMoscow = new Date(now.getTime() + moscowOffset);

      // specialDate приходит как строка: "2025-12-09T08:40"
      // На БРАУЗЕРЕ пользователя это интерпретируется как локальное время его timezone
      // Когда отправляется на СЕРВЕР (Node.js в UTC), new Date() возвращает UTC время
      // Но сервер находится в UTC, поэтому число которое браузер отправил уже скорректировано!

      // Пример:
      // - Браузер в UTC+3 timezone (Moscow)
      // - Пользователь вводит "08:40"
      // - Браузер парсит как 08:40 в своем timezone
      // - JSON отправляет как "2025-12-09T08:40"
      // - На сервере new Date("2025-12-09T08:40") = уже корректное UTC время!

      const targetDateUTC = new Date(targetDateStr);

      // Это уже правильное UTC время, не нужно ничего вычитать/добавлять!
      const delayMs = targetDateUTC.getTime() - now.getTime();

      console.log('⏰ Планирование достижения "' + name + '":');
      console.log("   Дата/время из интерфейса: " + targetDateStr);
      console.log("   Текущее UTC: " + now.toISOString());
      console.log(
        "   Целевое UTC (уже корректное): " + targetDateUTC.toISOString()
      );
      console.log(
        "   Задержка (мс): " +
          delayMs +
          " = " +
          Math.round(delayMs / 60000) +
          " минут"
      );
      console.log(
        "   Будет ли setTimeout? " + (delayMs > 0 ? "ДА ✅" : "НЕТ ❌")
      );

      if (delayMs > 0) {
        // Откладываем отправку уведомлений на указанное время
        setTimeout(async () => {
          try {
            const user = await client.users.fetch(userId).catch(() => null);
            const username = user ? user.username : "Пользователь";

            // Отправляем ЛС пользователю
            if (user) {
              try {
                await user.send(
                  `🏆 **Новое достижение!**\n\n` +
                    `${emoji} **${name}**\n` +
                    `${description}\n\n` +
                    `🌐 Посмотреть в веб-панели: http://${SERVER_IP}:${PORT}/?userId=${userId}&autoLogin=true`
                );
              } catch (dmError) {
                console.log(
                  `Не удалось отправить ЛС пользователю ${userId}: ${dmError.message}`
                );
              }
            }

            // Отправляем в канал Discord
            try {
              const channel = client.channels.cache.get(
                ACHIEVEMENTS_CHANNEL_ID
              );
              if (channel) {
                await channel.send(
                  `🏆 **Новое достижение!**\n\n` +
                    `👤 **Пользователь:** <@${userId}>\n` +
                    `🎯 **Достижение:** ${emoji} ${name}\n` +
                    `📝 **Описание:** ${description}\n` +
                    `📅 **Время:** ${formatTime(new Date())}\n\n` +
                    `🌐 **Посмотреть в веб-панели:** http://${SERVER_IP}:${PORT}/?userId=${userId}&autoLogin=true`
                );
              }
            } catch (channelError) {
              console.log(
                `Не удалось отправить уведомление в канал: ${channelError.message}`
              );
            }

            // Отправляем в Telegram
            let telegramMessage =
              `🏆 <b>Новое специальное достижение!</b>\n` +
              `👤 Пользователь: ${username}\n` +
              `🎯 Достижение: ${emoji} ${name}\n` +
              `📝 Описание: ${description}\n`;

            if (color) {
              telegramMessage += `🎨 Цвет: ${color}\n`;
            }

            if (specialDate) {
              const scheduledTime = new Date(specialDate);
              const now = new Date();
              if (scheduledTime > now) {
                telegramMessage += `⏰ Планируется: ${formatTime(
                  scheduledTime
                )}\n`;
              } else {
                telegramMessage += `✅ Доступно с: ${formatTime(
                  scheduledTime
                )}\n`;
              }
            }

            telegramMessage += `📅 Создано: ${formatTime(new Date())}`;

            sendTelegramReport(telegramMessage);
          } catch (notificationError) {
            console.error(
              "Ошибка при отправке отложенного уведомления:",
              notificationError
            );
          }

          // Отмечаем что уведомления отправлены
          try {
            db.prepare(
              `UPDATE achievements SET notifications_sent = 1 WHERE achievement_id = ?`
            ).run(achievementId);
          } catch (err) {
            console.error(
              "Ошибка при обновлении флага notifications_sent:",
              err
            );
          }
        }, delayMs);

        console.log(
          '✅ Достижение "' +
            name +
            '" запланировано на ' +
            targetDateUTC.toLocaleString("ru-RU")
        );
      } else {
        // Если дата в прошлом или сейчас (delayMs <= 0)
        // Просто отмечаем что уведомления нужно было отправить
        // Они будут отправлены при следующей проверке пропущенных уведомлений
        console.log(
          `⚠️ Дата достижения "${name}" уже в прошлом (delayMs=${delayMs})`
        );
        console.log(`   Уведомления будут отправлены при проверке пропущенных`);

        // НЕ отправляем уведомления здесь! Пусть их отправит checkAndSendMissedAchievementNotifications()
      }
    }

    res.json({ success: true, achievementId });
  } catch (error) {
    console.error("❌❌❌ ОШИБКА КРИТИЧЕСКАЯ при создании достижения:");
    console.error("Тип ошибки:", error.constructor.name);
    console.error("Сообщение:", error.message);
    console.error("Stack:", error.stack);
    res.status(500).json({ error: "Ошибка при создании достижения" });
  }
});

// API endpoint для удаления достижения у пользователя
app.post("/api/admin/delete-achievement", async (req, res) => {
  const { userId, achievementId } = req.body;

  if (!userId || !achievementId) {
    return res.status(400).json({ error: "Отсутствуют обязательные поля" });
  }

  try {
    // Получаем информацию о достижении для вычисления очков
    const achievement = ACHIEVEMENTS[achievementId];

    // Если это специальное достижение, получаем его из БД
    let achievementName = achievement ? achievement.name : achievementId;
    let achievementPoints =
      achievement && achievement.points > 0 ? achievement.points : 0;

    if (!achievement) {
      // Пытаемся получить из таблицы achievements (спец. достижения)
      const specialAchievement = db
        .prepare(
          `
        SELECT name, points FROM achievements WHERE achievement_id = ? AND user_id = ?
      `
        )
        .get(achievementId, userId);

      if (specialAchievement) {
        achievementName = specialAchievement.name;
        achievementPoints = specialAchievement.points || 0;
      }
    }

    // Получаем информацию о пользователе для отчета
    const userStats = getUserStats(userId);
    let userName = "Неизвестный пользователь";
    if (userStats) {
      userName = userStats.username || "Пользователь ID: " + userId;
    }

    // Проверяем, есть ли запись о достижении в user_achievements
    const existingAchievement = db
      .prepare(
        `SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id = ?`
      )
      .get(userId, achievementId);

    if (existingAchievement) {
      // Помечаем достижение как вручную удаленное (флаг manually_deleted = 1)
      // Это позволит пользователю получить достижение снова по условиям
      db.prepare(
        `UPDATE user_achievements SET manually_deleted = 1 WHERE user_id = ? AND achievement_id = ?`
      ).run(userId, achievementId);
      console.log(
        `🗑️ Достижение ${achievementId} помечено как удаленное (manually_deleted = 1)`
      );

      // Если это обычное достижение (из ACHIEVEMENTS), вычитаем очки
      if (achievement && achievement.points > 0) {
        db.prepare(
          `UPDATE user_stats SET rank_points = MAX(0, rank_points - ?) WHERE user_id = ?`
        ).run(achievement.points, userId);
        console.log(`💔 Вычтено ${achievement.points} очков`);
      } else if (achievementPoints > 0) {
        // Если это спец. достижение с очками, тоже вычитаем
        db.prepare(
          `UPDATE user_stats SET rank_points = MAX(0, rank_points - ?) WHERE user_id = ?`
        ).run(achievementPoints, userId);
        console.log(`💔 Вычтено ${achievementPoints} очков`);
      }
    }

    // Также удаляем из таблицы achievements если это специальное достижение
    db.prepare(
      `DELETE FROM achievements WHERE user_id = ? AND achievement_id = ?`
    ).run(userId, achievementId);

    // Отправляем отчет в Telegram
    const achievementPointsText =
      achievementPoints > 0 ? `\n⭐ Очков удалено: -${achievementPoints}` : "";
    sendTelegramReport(
      `🗑️ <b>Достижение удалено!</b>\n` +
        `👤 Пользователь: ${userName}\n` +
        `🎯 Достижение: ${achievementName}\n` +
        `📅 Время: ${formatTime(new Date())}${achievementPointsText}\n` +
        `✅ Пользователь может получить его заново`
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении достижения:", error);
    res.status(500).json({ error: "Ошибка при удалении достижения" });
  }
});

// ===== УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ =====
app.post("/api/admin/delete-user", async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Отсутствует userId" });
  }

  try {
    // Получаем информацию о пользователе для отчета
    const userStats = getUserStats(userId);
    const userName = userStats
      ? userStats.username || "Пользователь ID: " + userId
      : "Пользователь ID: " + userId;

    // Удаляем пользователя из всех таблиц
    db.prepare("DELETE FROM user_stats WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_settings WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_achievements WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM voice_sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM achievements WHERE user_id = ?").run(userId);

    console.log(
      "🗑️ Пользователь " + userId + " (" + userName + ") полностью удален из БД"
    );

    // Отправляем уведомление в Telegram
    fetch(
      "https://api.telegram.org/bot" +
        process.env.TELEGRAM_BOT_TOKEN +
        "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text:
            "🗑️ <b>ПОЛЬЗОВАТЕЛЬ УДАЛЕН ИЗ БД</b>\n\n" +
            "ID: <code>" +
            userId +
            "</code>\n" +
            "Имя: " +
            userName +
            "\n" +
            "Время: " +
            new Date().toLocaleString("ru-RU"),
          parse_mode: "HTML",
        }),
      }
    ).catch((err) =>
      console.log("Ошибка отправки уведомления в Telegram:", err)
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении пользователя:", error);
    res.status(500).json({ error: "Ошибка при удалении пользователя" });
  }
});

// ===== ПОПЫТКА НЕСАНКЦИОНИРОВАННОГО ДОСТУПА =====
app.post("/api/unauthorized-access", async (req, res) => {
  const { attemptedId, timestamp } = req.body;

  try {
    // Отправляем уведомление в Telegram
    fetch(
      "https://api.telegram.org/bot" +
        process.env.TELEGRAM_BOT_TOKEN +
        "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text:
            "⚠️ <b>ПОПЫТКА НЕСАНКЦИОНИРОВАННОГО ДОСТУПА!</b>\n\n" +
            "Кто-то попытался зайти по прямому ADMIN_USER_ID: <code>" +
            attemptedId +
            "</code>\n" +
            "Время: " +
            timestamp,
          parse_mode: "HTML",
        }),
      }
    ).catch((err) =>
      console.log("Ошибка отправки уведомления в Telegram:", err)
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка при обработке попытки доступа:", error);
    res.status(500).json({ error: "Ошибка при обработке попытки доступа" });
  }
});

// ===== МАРШРУТЫ АВТОРИЗАЦИИ =====

// Вход через Discord
app.get("/auth/discord", (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = encodeURIComponent(
    process.env.DISCORD_REDIRECT_URI ||
      "http://localhost:3000/auth/discord/callback"
  );
  const scopes = encodeURIComponent("identify");
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}`;
  res.redirect(discordAuthUrl);
});

// Callback от Discord
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.redirect("/?error=no_code");
  }

  try {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri =
      process.env.DISCORD_REDIRECT_URI ||
      "http://localhost:3000/auth/discord/callback";

    // Обмениваем код на токен доступа
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      return res.redirect("/?error=token_exchange_failed");
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Получаем информацию о пользователе
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      return res.redirect("/?error=user_fetch_failed");
    }

    const userData = await userResponse.json();
    const userId = userData.id;
    const username = userData.username;

    // Инициализируем пользователя в базе данных
    initUserStats(userId, username);

    // Сохраняем сессию
    setSession(res, userId);

    // Перенаправляем просто на главную - сессия будет проверена там
    res.redirect("/");
  } catch (error) {
    console.error("❌ Ошибка при авторизации Discord:", error);
    res.redirect("/?error=auth_failed");
  }
});

// Выход из системы
app.get("/logout", (req, res) => {
  clearSession(res, req);
  res.redirect("/");
});

// Получить текущую сессию пользователя
app.get("/api/session", (req, res) => {
  const session = getSession(req);
  if (session) {
    res.json({ userId: session.userId });
  } else {
    res.json({ userId: null });
  }
});

// Главная страница
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>AFK Bot - Панель управления</title>
    <style>
        * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
            -webkit-tap-highlight-color: transparent;
        }
        
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            font-size: 16px;
            line-height: 1.4;
        }
        
        body.modal-open {
            overflow: hidden;
        }
        
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: white; 
            border-radius: 15px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        
        .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 30px; 
            text-align: center; 
        }
        
        .header h1 { 
            font-size: 2.5rem; 
            margin-bottom: 10px; 
        }
        
        .header p { 
            opacity: 0.9; 
            font-size: 1.1rem; 
        }
        
        .user-id-display { 
            background: rgba(255,255,255,0.1); 
            border-radius: 10px; 
            padding: 15px; 
            margin: 20px 0; 
            text-align: center; 
            display: none; 
        }
        
        .user-id-display h3 { 
            font-size: 1.2rem; 
            margin-bottom: 5px; 
            color: #fff;
        }
        
        .user-id-display .user-id { 
            font-family: 'Courier New', monospace; 
            font-size: 1.1rem; 
            background: rgba(255,255,255,0.2); 
            padding: 8px 15px; 
            border-radius: 20px; 
            display: inline-block;
            color: #fff;
            font-weight: bold;
        }
        
        .content { 
            padding: 30px; 
        }
        
        .user-search { 
            margin-bottom: 30px; 
            display: flex; 
            gap: 10px; 
            justify-content: center;
        }
        
        .user-search input { 
            padding: 12px 20px; 
            border: 2px solid #ddd; 
            border-radius: 25px; 
            font-size: 16px; 
            outline: none;
            transition: border-color 0.3s;
            text-align: center;
        }
        
        .user-search input:focus { 
            border-color: #667eea; 
        }
        
        .user-search button { 
            padding: 12px 25px; 
            background: #667eea; 
            color: white; 
            border: none; 
            border-radius: 25px; 
            cursor: pointer; 
            font-size: 16px;
            transition: background 0.3s;
        }
        
        .user-search button:hover { 
            background: #5a6fd8; 
        }
        
        .tabs { 
            display: flex; 
            margin-bottom: 30px; 
            border-bottom: 2px solid #eee;
        }
        
        .tab { 
            padding: 15px 25px; 
            cursor: pointer; 
            border-bottom: 3px solid transparent;
            transition: all 0.3s;
            font-weight: 500;
            flex: 1;
            text-align: center;
        }
        
        .tab.active { 
            border-bottom-color: #667eea; 
            color: #667eea;
        }
        
        .tab-content { 
            display: none; 
        }
        
        .tab-content.active { 
            display: block; 
        }
        
        .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px;
        }
        
        .stat-card { 
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); 
            color: white; 
            padding: 25px; 
            border-radius: 15px; 
            text-align: center;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            box-shadow: 0 0.3rem 1rem rgba(192, 192, 192, 0.1);
            background: #f093db;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        
        .stat-number { 
            font-size: 2.5rem; 
            font-weight: bold; 
            margin-bottom: 5px; 
        }
        
        .stat-label { 
            font-size: 1rem; 
            opacity: 0.9; 
        }
        
        .achievements { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
            gap: 15px;
        }
        
        .achievement { 
            background: #f8f9fa; 
            padding: 20px; 
            border-radius: 10px; 
            border-left: 5px solid #28a745;
            transition: transform 0.3s;
        }
        
        .achievement:hover { 
            transform: translateY(-3px); 
        }
        
        .achievement.locked { 
            border-left-color: #6c757d; 
            opacity: 0.6;
        }
        
        .leaderboard { 
            background: white; 
            border-radius: 10px; 
            overflow: hidden;
            box-shadow: 0 3px 10px rgba(0,0,0,0.1);
        }
        
        .leaderboard-item { 
            padding: 15px 20px; 
            border-bottom: 1px solid #eee; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            transition: all 0.3s;
            position: relative;
        }
        
        .leaderboard-item:hover {
            background: #f8f9fa;
            transform: translateX(5px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .leaderboard-item:hover::after {
            content: "👆 Жмакни, чтобы посмотреть достижения";
            position: absolute;
            left: 15%;
            top: 50%;
            transform: translateY(-50%);
            font-size: 12px;
            color: #667eea;
            background: white;
            padding: 5px 10px;
            border-radius: 15px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            z-index: 10;
            white-space: nowrap;
        }
        
        .rank { 
            font-weight: bold; 
            color: #667eea; 
            font-size: 1.2rem;
        }
        
        .settings-form { 
            background: #f8f9fa; 
            padding: 25px; 
            border-radius: 10px;
            text-align: center;
        }
        
        .form-group { 
            margin-bottom: 20px;
        }
        
        .form-group label { 
            display: block; 
            margin-bottom: 8px; 
            font-weight: 500;
        }
        
        .form-group select { 
            padding: 10px; 
            border: 1px solid #ddd; 
            border-radius: 5px;
            
        }
        
        .save-btn { 
            background: #28a745; 
            color: white; 
            padding: 12px 25px; 
            border: none; 
            border-radius: 5px; 
            cursor: pointer;
            font-size: 16px;
            transition: background 0.3s;
        }
        
        .save-btn:hover { 
            background: #218838; 
        }
        
        .loading { 
            text-align: center; 
            padding: 50px; 
            color: #666; 
        }
        
        .error { 
            color: #dc3545; 
            text-align: center; 
            padding: 20px; 
        }

        /* DESKTOP FIRST - Адаптация для планшетов */
        @media screen and (max-width: 1024px) {
            .container {
                margin: 0 10px;
            }
            
            .stats-grid {
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
            }
            
            .achievements {
                grid-template-columns: 1fr;
            }
        }

        /* Адаптация для маленьких планшетов */
        @media screen and (max-width: 768px) {
            body {
                padding: 10px;
                font-size: 14px;
            }
            
            .header {
                padding: 20px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .header p {
                font-size: 1rem;
            }
            
            .content {
                padding: 20px;
            }
            
            .user-search {
                flex-direction: column;
                align-items: center;
                gap: 15px;
            }
            
            .user-search input {
                width: 100%;
                max-width: 300px;
            }
            
            .user-search button {
                width: 100%;
                max-width: 200px;
                width: auto;
                max-width: 100%;
            }
            
            .tabs {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 5px;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }
            
            .tab {
                padding: 12px 15px;
                font-size: 0.9rem;
                white-space: nowrap;
            }
            
            .stats-grid {
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 10px;
            }
            
            .stat-card {
                padding: 20px 15px;
            }
            
            .stat-number {
                font-size: 2rem;
                word-break: break-word;
            }
            
            .stat-label {
                font-size: 0.85rem;
            }
            
            .achievement {
                padding: 15px;
            }
            
            .leaderboard-item {
                padding: 12px 15px;
                flex-direction: column;
                align-items: flex-start;
                gap: 5px;
            }
            
            .leaderboard-item:hover::after {
                content: "👆 Нажмите для достижений";
                font-size: 11px;
                right: 5px;
                padding: 3px 6px;
            }
            
            .settings-form {
                padding: 20px;
            }
            
            .save-btn {
                width: 100%;
            }
        }

        /* Адаптация для мобильных телефонов */
        @media screen and (max-width: 480px) {
            body {
                padding: 5px;
            }
            
            .container {
                border-radius: 10px;
                margin: 0;
            }
            
            .header {
                padding: 15px;
            }
            
            .header h1 {
                font-size: 1.6rem;
                margin-bottom: 8px;
            }
            
            .header p {
                font-size: 0.9rem;
            }
            
            .user-id-display {
                padding: 10px;
                margin: 15px 0;
            }
            
            .user-id-display h3 {
                font-size: 1rem;
            }
            
            .user-id-display .user-id {
                font-size: 0.9rem;
                padding: 6px 10px;
                word-break: break-all;
            }
            
            .content {
                padding: 15px;
            }
            
            .tabs {
                grid-template-columns: repeat(2, 1fr);
                gap: 2px;
            }
            
            .tab {
                padding: 10px 5px;
                font-size: 0.75rem;
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
            }
            
            .stat-card {
                padding: 15px 10px;
            }
            
            .stat-number {
                font-size: 1.5rem;
            }
            
            .stat-label {
                font-size: 0.75rem;
                line-height: 1.2;
            }
            
            .achievement {
                padding: 12px;
            }
            
            .achievement h3 {
                font-size: 0.9rem;
                margin-bottom: 6px;
            }
            
            .achievement p {
                font-size: 0.8rem;
                margin-bottom: 6px;
            }
            
            .achievement small {
                font-size: 0.7rem;
            }
            
            .leaderboard-item {
                padding: 10px;
                font-size: 0.85rem;
            }
            
            .leaderboard-item:hover::after {
                display: none; /* Убираем подсказку на мобильных */
            }
            
            .rank {
                font-size: 1rem;
            }
        }

        @media screen and (max-width: 400px) {
          
        #manualInputSection{
            flex-direction: column;
        }
        .SpecialAchievementForm-title{
        font-size: 17px;
        }
        .SpecialAchievementForm-group{
            flex-direction: column;
            gap: 15px;
            }
        #specialAchievementUserId{
        text-align: left !important;
        }
        }

        /* Адаптация для очень маленьких экранов */
        @media screen and (max-width: 360px) {
            .tabs {
                font-size: 0.7rem;
            }
            
            .tab {
                padding: 8px 3px;
            }
            
            .stats-grid {
                gap: 6px;
            }
            
            .stat-card {
                padding: 12px 8px;
                
            }
            
            .stat-number {
                font-size: 1.3rem;
            }
            
            .stat-label {
                font-size: 0.7rem;
            }
        }

        /* Модальное окно - адаптивное */
        .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 1000;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }
        
        .modal-content {
            background: white;
            border-radius: 15px;
            max-width: 800px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            position: relative;
        }
        
        .modal-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 15px 15px 0 0;
            text-align: center;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        
        .modal-header h2 {
            font-size: 1.5rem;
            margin-bottom: 10px;
        }
        
        .modal-header h3 {
            font-size: 1.2rem;
            margin-bottom: 8px;
        }
        
        .modal-header p {
            font-size: 0.9rem;
            opacity: 0.9;
        }
        
        .close-btn {
            position: absolute;
            top: 10px;
            right: 15px;
            background: rgba(255,255,255,0.2);
            color: white;
            border: none;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            cursor: pointer;
            font-size: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .modal-body {
            padding: 20px;
        }
        
        .modal-achievements {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
        }
        
        .modal-achievement {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 10px;
            border-left: 5px solid #28a745;
        }
        
        .special-achievement {
            background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
            color: #333;
            border-left: 5px solid #ff6b35;
            // box-shadow: 0 5px 15px rgba(255, 215, 0, 0.4);
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
            pointer-events: none;
        }
        
        .special-achievement > * {
            pointer-events: auto;
        }
        
        .special-achievement button {
            pointer-events: auto;
            position: relative;
            z-index: 10;
        }
        
        .special-achievement::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
            transition: all 0.6s ease;
            opacity: 0;
        }
        
        .special-achievement:hover {
            transform: translateY(-3px);
        }
        
        .special-achievement:hover::before {
            animation: shimmer 1.5s ease-in-out;
            opacity: 1;
        }
        
        @keyframes shimmer {
            0% {
                left: -100%;
            }
            100% {
                left: 100%;
            }
        }
        .special-achievement {
            // animation: specialGlow 3s ease-in-out infinite alternate;
        }
        
        @keyframes specialGlow {
            0% {
                box-shadow: 0 5px 15px rgba(255, 215, 0, 0.4);
            }
            100% {
                box-shadow: 0 8px 25px rgba(255, 215, 0, 0.7), 0 0 20px rgba(255, 215, 0, 0.3);
            }
        }
        
        .special-achievement:hover {
            animation: none; /* Останавливаем пульсацию при наведении */
            transform: translateY(-3px);
        }
        
        /* Стили для вкладок в модальном окне */
        .modal-tabs {
            display: flex;
            background: #f8f9fa;
            margin: 20px 0;
            overflow: hidden;
        }
        
        .modal-tab-button {
            flex: 1;
            padding: 12px 20px;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            color: #666;
            transition: all 0.3s ease;
        }
        
        .modal-tab-button:hover {
            background: rgba(102, 126, 234, 0.1);
            color: #667eea;
        }
        
        .modal-tab-button.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-weight: 600;
        }
        
        .modal-tab-content {
            min-height: 300px;
        }
        
        .modal .stats-grid .stat-item {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 10px;
            text-align: center;
            border-left: 4px solid #667eea;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        
        .modal .stats-grid .stat-value {
            font-size: 1.5rem;
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
        }
        
        .modal .stats-grid .stat-label {
            font-size: 0.9rem;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* Модальное окно - мобильная адаптация */
        @media screen and (max-width: 768px) {
            .modal {
                padding: 10px;
                align-items: flex-start;
            }
            
            .modal-content {
                max-width: 100%;
                margin-top: 20px;
            }
            
            .modal-header {
                padding: 15px;
            }
            
            .modal-header h2 {
                font-size: 1.3rem;
            }
            
            .modal-header h3 {
                font-size: 1.1rem;
            }
            
            .modal-body {
                padding: 15px;
            }
            
            .modal-achievements {
                grid-template-columns: 1fr;
                gap: 10px;
            }
            
            .modal-achievement {
                padding: 12px;
            }
        }

        @media screen and (max-width: 480px) {
            .modal {
                padding: 5px;
            }
            
            .modal-content {
                border-radius: 10px;
                margin-top: 10px;
            }
            
            .modal-header {
                padding: 12px;
                border-radius: 10px 10px 0 0;
            }
            
            .modal-header h2 {
                font-size: 1.1rem;
                margin-bottom: 6px;
            }
            
            .modal-header h3 {
                font-size: 1rem;
                margin-bottom: 5px;
            }
            
            .modal-header p {
                font-size: 0.8rem;
            }
            
            .close-btn {
                width: 25px;
                height: 25px;
                font-size: 16px;
                top: 8px;
                right: 8px;
            }
            
            .modal-body {
                padding: 10px;
            }
            
            .modal-achievement {
                padding: 10px;
            }
            
            .modal-achievement h4 {
                font-size: 0.9rem;
            }
            
            .modal-achievement p {
                font-size: 0.8rem;
            }
            
            .modal-achievement small {
                font-size: 0.75rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Chicken Winner AFK Bot</h1>
            
            <p>Статистика, рейтинг и достижения</p>
            
            <div class="user-id-display" id="userIdDisplay">
                <h3>👤 ID пользователя:</h3>
                <span class="user-id" id="currentUserId"></span>
            </div>
        </div>
        
        <div class="content">
            <div class="user-search">
                <div id="authSection" style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; align-items: center;">
                    <!-- <button id="loginBtn" onclick="loginWithDiscord()" style="flex: 1; min-width: 200px; padding: 10px 20px; background: #5865F2; color: white; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 14px;">🔐 Войти через Discord</button> -->
                    <div id="userInfoDisplay" style="display: none; flex: 1; min-width: 200px; padding: 10px 20px; background: #667eea; color: white; border-radius: 5px; font-weight: bold; font-size: 14px; text-align: center;">
                        👤 <span id="userUsername"></span>
                    </div>
                    <button id="logoutBtn" onclick="logout()" style="display: none; padding: 10px 20px; background: #ff4444; color: white; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 14px;">🚪 Выход</button>
                </div>
                
                <div id="manualInputSection" style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <input type="text" id="userIdInput" placeholder="Discord ID" style="flex: 1;">
                    <button onclick="loadUserData()" style="padding: 10px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 5px; cursor: pointer;">Загрузить</button>
                    <button id="clearBtn" onclick="clearSavedUserId()" style="display: none; padding: 10px 20px; background: #ff4444; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Выход</button>
                </div>
                
                <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <button id="createSpecialAchievementBtn" onclick="openCreateSpecialAchievementModal()" style="display: none; flex: 1; padding: 10px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-weight: bold; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">⭐ Создать спец. достижение</button>
                </div>
            </div>
            
            <!-- МОДАЛЬНОЕ ОКНО СОЗДАНИЯ СПЕЦИАЛЬНОГО ДОСТИЖЕНИЯ -->
            <div id="createSpecialAchievementModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000;">
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1a1a1a; border: 2px solid #a45eea; border-radius: 10px; padding: 20px; width: 90%; max-width: 600px; height: 80vh; overflow: auto; scrollbar-width: none;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 class="SpecialAchievementForm-title" style="color: white; margin: 0 auto;">⭐ Создать спец. достижение</h2>
                        <button onclick="closeCreateSpecialAchievementModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer;">&times;</button>
                    </div>
                    
                    <form id="createSpecialAchievementForm">
                        <div class="SpecialAchievementForm-group" style="display: flex;justify-content: space-evenly;margin-bottom: 15px;">
        <div style="display: flex;flex-direction: column;">
                            <label style="color: white; display: block; margin-bottom: 5px;text-align: center;">Эмодзи достижения:</label>
                            <input type="text" id="specialAchievementEmoji" maxlength="2" placeholder="🏆" style="width: 30%; padding: 8px; background: #0a0a0a; border: 1px solid #a45eea; color: white; border-radius: 5px; text-align: center;margin: 0 auto;" oninput="updateSpecialAchievementPreview()">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="color: white; display: block; margin-bottom: 5px;">Discord ID пользователя:</label>
                            <input type="text" id="specialAchievementUserId" placeholder="123456789" style="width: 100%; padding: 8px; background: #0a0a0a; border: 1px solid #a45eea; color: white; border-radius: 5px; text-align:center;">
                        </div>
    </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="color: white; display: block; margin-bottom: 5px;">Название достижения:</label>
                            <input type="text" id="specialAchievementName" placeholder="Название" style="width: 100%; padding: 8px; background: #0a0a0a; border: 1px solid #a45eea; color: white; border-radius: 5px;" oninput="updateSpecialAchievementPreview()">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="color: white;; display: block; margin-bottom: 5px;">Описание:</label>
                            <textarea id="specialAchievementDescription" placeholder="Описание достижения" style="width: 100%; padding: 8px; background: #0a0a0a; border: 1px solid #a45eea; color: white; border-radius: 5px; resize: vertical; min-height: 60px;"></textarea>
                        </div>
                        
                        
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <div>
                                <label style="color: white; display: block; margin-bottom: 5px;">Дата:</label>
                                <input type="date" id="specialAchievementDate" style="width: 100%; padding: 8px; background: #0a0a0a; border: 1px solid #a45eea; color: white; border-radius: 5px;">
                            </div>
                            <div>
                                <label style="color: white; display: block; margin-bottom: 5px;">Время:</label>
                                <input type="time" id="specialAchievementTime" style="width: 100%; padding: 8px; background: #0a0a0a; border: 1px solid #a45eea; color: white; border-radius: 5px;">
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="color: white; display: block; margin-bottom: 5px;">Цвет:</label>
                            <input type="color" id="specialAchievementColor" value="#a45eea" style="width: 100%; padding: 8px; background: #0a0a0a; border: 1px solid #a45eea; border-radius: 5px; cursor: pointer;" oninput="updateSpecialAchievementPreview()">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="color: white; display: block; margin-bottom: 5px;">Превью:</label>
                            <div id="specialAchievementPreview" style="padding: 10px; background: #0a0a0a; border: 1px solid #a45eea; border-radius: 5px;"></div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <button type="button" onclick="createSpecialAchievement()" style="padding: 10px; background-color: #a45eea; color: #000; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">Создать</button>
                            <button type="button" onclick="closeCreateSpecialAchievementModal()" style="padding: 10px; background-color: #555; color: #fff; border: none; border-radius: 5px; cursor: pointer;">Отмена</button>
                        </div>
                    </form>
                </div>
            </div>
            
            <div id="userContent" style="display: none;">
                <div class="tabs">
                    <div class="tab active" onclick="switchTab('stats')">📊 Статистика</div>
                    <div class="tab" onclick="switchTab('achievements')">🏆 Достижения</div>
                    <div class="tab" onclick="switchTab('settings')">⚙️ Настройки</div>
                    <div class="tab" onclick="switchTab('leaderboard')">🏅 Рейтинг</div>
                </div>
                
                <div id="stats" class="tab-content active">
                    <div class="stats-grid" id="statsGrid">
                        <!-- Статистика будет загружена здесь -->
                    </div>
                </div>
                
                <div id="achievements" class="tab-content">
                    <div class="achievements" id="achievementsList">
                        <!-- Достижения будут загружены здесь -->
                    </div>
                </div>
                
                <div id="settings" class="tab-content">
                    <div class="settings-form">
                        <div class="form-group">
                            <label>📩 ЛС уведомления:</label>
                            <select id="dmNotifications">
                                <option value="true">✅ Включены</option>
                                <option value="false">❌ Отключены</option>
                            </select>
                        </div>
                        
                                                <div class="form-group">
                            <label>⏰ Время до AFK:</label>
                            <select id="afkTimeout">
                                <option value="10" class="admin-option" style="display: none;">10 секунд</option>
                                <option value="15">15 минут</option>
                                <option value="30">30 минут</option>
                                <option value="45">45 минут</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>🏆 Уведомления о достижениях:</label>
                            <select id="achievementNotifications">
                                <option value="true">✅ Включены</option>
                                <option value="false">❌ Отключены</option>
                            </select>
                        </div>
                        
                        <button class="save-btn" onclick="saveSettings()">Сохранить настройки</button>
                    </div>
                </div>
                
                <div id="leaderboard" class="tab-content">
                    <div class="leaderboard" id="leaderboardList">
                        <!-- Рейтинг будет загружен здесь -->
                    </div>
                </div>
            </div>
            
            <div id="loading" class="loading">
                Введи свой Discord ID для загрузки данных, малютка...
            </div>
        </div>
    </div>

    <script>
        let currentUserId = null;
        const ADMIN_USER_ID = "${process.env.ADMIN_USER_ID}";
        const ADMIN_LOGIN = "${process.env.ADMIN_LOGIN}";

        // Функции для работы с авторизацией
        function loginWithDiscord() {
            window.location.href = '/auth/discord';
        }

        async function logout() {
            if (confirm('Вы уверены, что хотите выйти?')) {
                window.location.href = '/logout';
            }
        }

        // ===== ФУНКЦИИ ДЛЯ РАБОТЫ С localStorage =====
        function loadSavedUserId() {
            const savedUserId = localStorage.getItem('afkBotUserId');
            if (savedUserId) {
                console.log('💾 Загружаю сохраненный userId:', savedUserId);
                return savedUserId;
            }
            return null;
        }

        function clearSavedUserId() {
            localStorage.removeItem('afkBotUserId');
            console.log('🗑️ Сохраненный userId очищен');
            document.getElementById('userIdInput').value = '';
            location.reload();
        }

        async function checkAuthStatus() {
            try {
                const response = await fetch('/api/session');
                const data = await response.json();
                if (data.userId) {
                    currentUserId = data.userId;
                    // Сохраняем в localStorage
                    localStorage.setItem('afkBotUserId', data.userId);
                    // Не показываем никакие элементы авторизации
                    // Просто загружаем данные пользователя
                    setTimeout(() => loadUserDataAuto(data.userId), 100);
                    return true;
                } else {
                    // Если нет сессии, показываем только поле ввода ID
                    document.getElementById('userInfoDisplay').style.display = 'none';
                    document.getElementById('logoutBtn').style.display = 'none';
                    document.getElementById('userIdInput').style.display = 'block';
                    return false;
                }
            } catch (error) {
                console.log('Ошибка при проверке авторизации:', error);
                return false;
            }
        }

        async function loadUserDataAuto(userId) {
            console.log('🔵 loadUserDataAuto вызвана с userId:', userId);
            currentUserId = userId;
            // ✅ Сохраняем userId в localStorage
            localStorage.setItem('afkBotUserId', userId);
            document.getElementById('loading').style.display = 'block';
            document.getElementById('userContent').style.display = 'none';
            document.getElementById('userIdDisplay').style.display = 'none';
            // ✅ Вместо очистки, показываем ID в поле ввода
            document.getElementById('userIdInput').value = userId;
            
            try {
                const response = await fetch(\`/api/stats/\${userId}\`);
                console.log('📡 Response status:', response.status);
                if (!response.ok) {
                    throw new Error(\`HTTP error! status: \${response.status}\`);
                }
                const data = await response.json();
                console.log('✅ Данные получены:', data);
                
                // Не показываем элементы авторизации OAuth2
                // Только показываем данные пользователя
                const username = data.stats.username || 'Пользователь';
                document.getElementById('currentUserId').textContent = userId;
                
                try {
                    await fetch(\`/api/visit/\${userId}\`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    data.stats.web_visits = (data.stats.web_visits || 0) + 1;
                } catch (error) {
                    console.log('Не удалось отправить данные о посещении');
                }
                
                displayUserStats(data.stats);
                displayUserAchievements(data.achievements);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('userContent').style.display = 'block';
                document.getElementById('userIdDisplay').style.display = 'block';
                
                // ✅ Показываем кнопку выхода
                document.getElementById('clearBtn').style.display = 'block';
                
                if (currentUserId === ADMIN_USER_ID) {
                    document.getElementById('createSpecialAchievementBtn').style.display = 'block';
                    
                    // Показываем админ-опции для времени AFK
                    document.querySelectorAll('.admin-option').forEach(option => {
                        option.style.display = 'block';
                    });
                }
            } catch (error) {
                console.error('❌ Ошибка загрузки данных:', error);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('loading').textContent = '❌ Ошибка загрузки данных. Проверьте ID.';
            }
        }

        function deleteUserFromDB(userId, username) {
            event.stopPropagation();
            const confirmed = confirm('⚠️ Вы уверены что хотите полностью удалить пользователя "' + username + '" из базы данных?' + String.fromCharCode(10) + String.fromCharCode(10) + 'Это действие необратимо и удалит:' + String.fromCharCode(10) + '- Все статистики' + String.fromCharCode(10) + '- Все достижения' + String.fromCharCode(10) + '- Все сессии' + String.fromCharCode(10) + '- Все настройки');
            
            if (!confirmed) {
                return;
            }
            
            fetch('/api/admin/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    alert('✅ Пользователь "' + username + '" полностью удален из БД!');
                    loadLeaderboard();
                } else {
                    alert('❌ Ошибка: ' + (data.message || 'Не удалось удалить пользователя'));
                }
            })
            .catch(error => {
                console.error('Ошибка при удалении пользователя:', error);
                alert('❌ Ошибка при удалении пользователя');
            });
        }

        function switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
            
            if (tabName === 'leaderboard') {
                loadLeaderboard();
            }
        }

        async function loadUserData() {
            let userId = document.getElementById('userIdInput').value.trim();
            if (!userId) return;
            
            // ✅ Проверка: если введен ADMIN_LOGIN, заменяем на ADMIN_USER_ID
            if (userId === ADMIN_LOGIN) {
                userId = ADMIN_USER_ID;
                console.log('✅ Админ вошел по логину, используем ADMIN_USER_ID');
            } else if (userId === ADMIN_USER_ID) {
                // ❌ БЛОКИРОВКА: Прямой вход по ADMIN_USER_ID запрещен!
                alert('❌ Это же не твой ID, зайка, куда ты собрался?');
                
                // Отправляем уведомление в Telegram
                fetch('/api/unauthorized-access', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        attemptedId: ADMIN_USER_ID,
                        timestamp: new Date().toLocaleString('ru-RU')
                    })
                }).catch(err => console.log('Ошибка отправки уведомления'));
                
                return;
            }
            
            currentUserId = userId;
            // ✅ Сохраняем userId в localStorage
            localStorage.setItem('afkBotUserId', userId);
            document.getElementById('loading').style.display = 'block';
            document.getElementById('userContent').style.display = 'none';
            document.getElementById('userIdDisplay').style.display = 'none';
            
            try {
                const response = await fetch(\`/api/stats/\${userId}\`);
                if (!response.ok) {
                    throw new Error(\`HTTP error! status: \${response.status}\`);
                }
                const data = await response.json();
                console.log('Полученные данные:', data);

            // Отправляем посещение веб-панели
                try {
                    await fetch(\`/api/visit/\${userId}\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    // Увеличиваем счётчик посещений на 1
                    data.stats.web_visits = (data.stats.web_visits || 0) + 1;
                } catch (error) {
                    console.log('Не удалось отправить данные о посещении');
                }
                
                console.log('Вызываю displayUserStats...');
                displayUserStats(data.stats);
                console.log('Вызываю displayUserAchievements...');
                console.log('data.achievements перед вызовом:', data.achievements);
                displayUserAchievements(data.achievements);
                console.log('Вызываю displayUserSettings...');
                displayUserSettings(data.settings);
                
                document.getElementById('currentUserId').textContent = userId;
                document.getElementById('userIdDisplay').style.display = 'block';
                
                // ✅ Показываем кнопку выхода
                document.getElementById('clearBtn').style.display = 'block';
                
                // Показать кнопку создания спец. достижения для админа
                if (userId === ADMIN_USER_ID) {
                    document.getElementById('createSpecialAchievementBtn').style.display = 'inline-block';
                    
                    // Показываем админ-опции для времени AFK
                    document.querySelectorAll('.admin-option').forEach(option => {
                        option.style.display = 'block';
                    });
                } else {
                    document.getElementById('createSpecialAchievementBtn').style.display = 'none';
                }
                
                document.getElementById('loading').style.display = 'none';
                document.getElementById('userContent').style.display = 'block';
            } catch (error) {
                console.error('Ошибка при загрузке данных:', error);
                document.getElementById('loading').innerHTML = '<div class="error">Ошибка загрузки данных</div>';
                document.getElementById('userIdDisplay').style.display = 'none';
            }
        }

        function displayUserStats(stats) {
            const statsGrid = document.getElementById('statsGrid');
            const voiceHours = Math.floor((stats.total_voice_time || 0) / 3600);
            const voiceMinutes = Math.floor(((stats.total_voice_time || 0) % 3600) / 60);
            const afkHours = Math.floor((stats.total_afk_time || 0) / 3600);
            const afkMinutes = Math.floor(((stats.total_afk_time || 0) % 3600) / 60);
            const streamHours = Math.floor((stats.stream_channel_time || 0) / 3600);
            const streamMinutes = Math.floor(((stats.stream_channel_time || 0) % 3600) / 60);
            
            // Форматируем дату самой длинной сессии
            let longestSessionDate = '';
            if (stats.longest_session_date) {
                const date = new Date(stats.longest_session_date);
                longestSessionDate = '<br><span style="font-size:0.4em;">' + date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) + '</span>';
            }
            
            statsGrid.innerHTML = \`
                <div class="stat-card">
                    <div class="stat-number">\${stats.total_sessions || 0}</div>
                    <div class="stat-label">Всего сессий</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${voiceHours}ч \${voiceMinutes}м</div>
                    <div class="stat-label">Время в голосовых</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${stats.total_afk_moves || 0}</div>
                    <div class="stat-label">Перемещений в AFK</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${afkHours}ч \${afkMinutes}м</div>
                    <div class="stat-label">Время в AFK</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${stats.rank_points || 0}</div>
                    <div class="stat-label">Очки рейтинга</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" style="line-height: 1em;">\${Math.floor((stats.longest_session || 0) / 3600)}ч \${Math.floor(((stats.longest_session || 0) % 3600) / 60)}м\${longestSessionDate}</div>
                    <div class="stat-label">Самая длинная сессия</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${stats.total_mute_toggles || 0}</div>
                    <div class="stat-label">Переключений микрофона</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${stats.settings_changes || 0}</div>
                    <div class="stat-label">Изменений настроек</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${stats.messages_sent || 0}</div>
                    <div class="stat-label">Отправлено сообщений</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${stats.mentions_responded || 0}</div>
                    <div class="stat-label">Ответов на упоминания</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${streamHours}ч \${streamMinutes}м</div>
                    <div class="stat-label">Время в канале Че смотрим?</div>
                </div>
                                <div class="stat-card">
                    <div class="stat-number">\${stats.web_visits || 0}</div>
                    <div class="stat-label">Посещений веб-панели</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${stats.total_streams || 0}</div>
                    <div class="stat-label">Включений трансляций</div>
                </div>
            \`;
        }

        function displayUserAchievements(achievements) {
            const achievementsList = document.getElementById('achievementsList');
            const unlockedIds = achievements.map(a => a.achievement_id);
            
            const regularAchievements = {
                first_join: { name: '🎤 Малыш заговорил', description: 'Присоединился к голосовому каналу впервые', points: 10 },
                first_afk: { name: '😴 Первый сон', description: 'Был перемещен в AFK впервые', points: 5 },
                first_message: { name: '💬 Первые буквы', description: 'Отправил первое сообщение в текстовом канале', points: 10 },
                first_settings: { name: '⚙️ Первые настройки', description: 'Изменил настройки бота впервые', points: 10 },
                first_web_visit: { name: '🌐 Первый серфер', description: 'Посетил веб-панель бота впервые', points: 15 },
                first_stream: { name: '📡 Первый стример', description: 'Включил трансляцию впервые', points: 20 },
                voice_starter: { name: '🎧 Алло, это я', description: 'Провел 50+ часов в голосовых каналах', points: 50 },
                voice_addict: { name: '🎧 Заболтал до сотки', description: 'Провел 100+ часов в голосовых каналах', points: 100 },
                voice_god: { name: '🎧 Звезда эфира', description: 'Провел 1000+ часов в голосовых каналах', points: 1000 },
                chatty_beginner: { name: '💬 Разговорчивый новичок', description: 'Отправил 200+ сообщений в текстовых каналах', points: 25 },
                chatty_user: { name: '💬 Болтун', description: 'Отправил 500+ сообщений в текстовых каналах', points: 75 },
                flooter: { name: '💬 Флудер', description: 'Отправил 750+ сообщений в текстовых каналах', points: 100 },
                linguist: { name: '💬 Лингвист', description: 'Отправил 1000+ сообщений в текстовых каналах', points: 150 },
                session_beginner: { name: '🎯 Начинающий участник', description: 'Участвовал в 10+ голосовых сессиях', points: 15 },
                session_veteran: { name: '🎯 Опытный участник', description: 'Участвовал в 50+ голосовых сессиях', points: 40 },
                session_master: { name: '🎯 Мастер сессий', description: 'Участвовал в 100+ голосовых сессиях', points: 75 },
                frequent_guest: { name: '🎯 Частый гость', description: 'Участвовал в 200+ голосовых сессиях', points: 150 },
                permanent_resident: { name: '🎯 Постоянный житель', description: 'Участвовал в 500+ голосовых сессиях', points: 350 },
                session_lord: { name: '🎯 Властелин сессий', description: 'Участвовал в 1000+ голосовых сессиях', points: 1000 },
                afk_beginner: { name: '😴 AFK новичок', description: 'Перемещен в AFK 10 раз', points: 10 },
                afk_veteran: { name: '😴 AFK ветеран', description: 'Перемещен в AFK 50 раз', points: 50 },
                afk_master: { name: '😴 AFK Специалист', description: 'Перемещен в AFK 100 раз', points: 100 },
                afk_time_lord: { name: '😴 AFK Повелитель времени', description: 'Провел 1000+ часов в AFK канале', points: 1000 },
                no_afk_week: { name: '💪 Железная воля', description: 'Неделя без перемещений в AFK', points: 50 },
                mute_master: { name: '🎙️ Мастер тишины', description: 'Переключил микрофон 100 раз', points: 25 },
                long_session: { name: '⏰ Марафонец', description: 'Провел 12+ часов в одной сессии', points: 75 },
                settings_explorer: { name: '⚙️ Исследователь настроек', description: 'Изменил настройки бота 20 раз', points: 30 },
                mention_responder: { name: '📢 Отзывчивый', description: 'Ответил на 1000+ упоминаний', points: 100 },
                stream_viewer_1: { name: '📺 Одним глазком', description: 'Провел 5+ часов в канале Че смотрим?', points: 10 },
                stream_viewer_2: { name: '📺 Зритель со стажем', description: 'Провел 50+ часов в канале Че смотрим?', points: 50 },
                stream_viewer_3: { name: '📺 Топовый зритель', description: 'Провел 100+ часов в канале Че смотрим?', points: 100 },
                stream_viewer_4: { name: '📺 Киберфанат', description: 'Провел 200+ часов в канале Че смотрим?', points: 200 },
                stream_viewer_5: { name: '📺 Бессмертный зритель', description: 'Провел 500+ часов в канале Че смотрим?', points: 500 },
                stream_viewer_6: { name: '📺 Легенда трансляций', description: 'Провел 1000+ часов в канале Че смотрим?', points: 1000 }
            };
            
            const specialAchievements = {
                best_admin: { name: '👑 Kakashech - Лучший админ', description: 'Лучший admin_ebaniy канала', points: 0 }
            };
            
            let html = '';
            
            // Считаем только достижения которые есть в regularAchievements
            const unlockedRegular = achievements.filter(a => regularAchievements.hasOwnProperty(a.achievement_id));
            const totalRegular = Object.keys(regularAchievements).length;
            
            html += \`
                <div style="grid-column: 1 / -1; text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #667eea; margin-bottom: 10px;">🏆 Достижения (\${unlockedRegular.length}/\${totalRegular})</h2>
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 10px; display: inline-block;">
                        <strong>Прогресс: \${Math.round((unlockedRegular.length / totalRegular) * 100)}%</strong>
                        <div style="width: 200px; height: 8px; background: #ddd; border-radius: 4px; margin: 5px auto; overflow: hidden;">
                            <div style="width: \${(unlockedRegular.length / totalRegular) * 100}%; height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); transition: width 0.3s;"></div>
                        </div>
                    </div>
                </div>
            \`;
            
            // Создаем два массива: полученные и неполученные достижения
const unlockedAchievements = [];
const lockedAchievements = [];

for (const [id, achievement] of Object.entries(regularAchievements)) {
    const isUnlocked = unlockedIds.includes(id);
    const unlockedDate = isUnlocked ? achievements.find(a => a.achievement_id === id)?.unlocked_at : null;
    
    const achievementHtml = \`
        <div class="achievement \${isUnlocked ? '' : 'locked'}" data-achievement-id="\${id}">
            <h3>\${achievement.name} \${isUnlocked ? '✅' : '🔒'}</h3>
            <p>\${achievement.description}</p>
            <small>+\${achievement.points} очков\${isUnlocked ? ' • Получено: ' + new Date(unlockedDate).toLocaleDateString('ru-RU') : ''}</small>
        </div>
    \`;
    
    if (isUnlocked) {
        unlockedAchievements.push({ html: achievementHtml, date: new Date(unlockedDate) });
    } else {
        lockedAchievements.push(achievementHtml);
    }
}

// Сортируем полученные достижения по дате получения (новые первые)
unlockedAchievements.sort((a, b) => b.date - a.date);

// Добавляем сначала полученные, потом неполученные
unlockedAchievements.forEach(achievement => {
    html += achievement.html;
});

lockedAchievements.forEach(achievementHtml => {
    html += achievementHtml;
});
            
            // Получаем спец. достижения пользователя
            const isAdmin = currentUserId === ADMIN_USER_ID;
            
            // Для админа показываем ВСЕ спец. достижения (даже в будущем)
            // Для обычных пользователей показываем только те, у которых special_date уже наступило
            const now = new Date();
            
            let userSpecialAchievements = achievements.filter(a => {
                const isSpecial = (a.emoji && a.name && a.type === 'special') || a.achievement_id === 'best_admin';
                if (!isSpecial) return false;
                
                // Если админ - показываем все
                if (isAdmin) return true;
                
                // Если обычный пользователь - проверяем special_date
                if (!a.special_date) return true; // Если дата не установлена, показываем
                
                // На браузере new Date() работает в локальном timezone пользователя
                // Строка special_date уже содержит корректное время для браузера
                // Поэтому просто сравниваем как есть
                const achievementDate = new Date(a.special_date);
                return achievementDate <= now;
            });
            
            // Если админ, добавляем best_admin в список, даже если его нет в полученных
            if (isAdmin && !userSpecialAchievements.some(a => a.achievement_id === 'best_admin')) {
                userSpecialAchievements.push({
                    achievement_id: 'best_admin',
                    unlocked_at: null,
                    emoji: null,
                    name: null,
                    description: null,
                    color: null,
                    type: null
                });
            }
            
            if (userSpecialAchievements.length > 0 || isAdmin) {
                html += \`
                    <div style="grid-column: 1 / -1; margin-top: 40px; border-top: 3px solid #ffd700; padding-top: 30px;">
                        <h2 style="text-align: center; color: #ffd700; margin-bottom: 20px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
                            ⭐ Специальные достижения ⭐
                        </h2>
                    </div>
                \`;
            }
            
            // Показываем достижения пользователя
            userSpecialAchievements.forEach(achievement => {
                // Если это best_admin из БД (стандартное спец. достижение)
                if (achievement.achievement_id === 'best_admin' && !achievement.emoji) {
                    const bestAdminInfo = specialAchievements.best_admin;
                    const isUnlocked = achievement.unlocked_at !== null;
                    const deleteBtn = isAdmin ? \`<button onclick="deleteUserAchievement('\${currentUserId}', 'best_admin')" style="padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>\` : '';
                    
                    if (isUnlocked) {
                        // Показываем как полученное достижение
                        html += \`
                            <div class="achievement special-achievement" data-achievement-id="best_admin" style="
                                background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); 
                                color: #333; 
                                border-left: 5px solid #ff6b35;
                                // box-shadow: 0 5px 15px rgba(255, 215, 0, 0.4);
                                position: relative;
                                overflow: visible;
                            ">
                                <h3 style="color: #333; font-weight: bold;">\${bestAdminInfo.name} ✨</h3>
                                <p style="color: #555; margin: 10px 0;">\${bestAdminInfo.description}</p>
                                <small style="color: #666; font-weight: bold;">🎉 Получено: \${new Date(achievement.unlocked_at).toLocaleDateString('ru-RU')}</small>
                                \${deleteBtn}
                            </div>
                        \`;
                    } else {
                        // Показываем как не полученное достижение (для админа)
                        html += \`
                            <div class="achievement special-achievement" style="
                                background: linear-gradient(135deg, #66666622 0%, #99999911 100%); 
                                color: #333; 
                                border-left: 5px solid #999;
                                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                                opacity: 0.7;
                                position: relative;
                                overflow: visible;
                            ">
                                <h3 style="color: #999; font-weight: bold;">\${bestAdminInfo.name} 🔒</h3>
                                <p style="color: #777; margin: 10px 0;">\${bestAdminInfo.description}</p>
                                <small style="color: #888; font-weight: bold;">❌ Для ID: 232581042177966080</small>
                                \${deleteBtn}
                            </div>
                        \`;
                    }
                } else if (achievement.emoji) {
                    // Новые специальные достижения из БД с emoji
                    const deleteBtn = isAdmin ? \`<button onclick="deleteUserAchievement('\${currentUserId}', '\${achievement.achievement_id}')" style="margin-top: 8px; padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>\` : '';
                    
                    // Проверяем, получено ли достижение (special_date уже наступило)
                    const achievementDate = achievement.special_date ? new Date(achievement.special_date) : null;
                    const now = new Date();
                    
                    // На браузере new Date() работает в локальном timezone
                    // Просто сравниваем как есть
                    const isAchievementUnlocked = !achievementDate || achievementDate <= now;
                    
                    if (isAchievementUnlocked) {
                        // Показываем как полученное достижение
                        html += \`
                            <div class="achievement special-achievement" data-achievement-id="\${achievement.achievement_id}" style="
                                background: linear-gradient(135deg, \${achievement.color}22 0%, \${achievement.color}11 100%); 
                                color: #333; 
                                border-left: 5px solid \${achievement.color};
                                // box-shadow: 0 8px 25px rgba(255, 215, 0, 0.4);
                                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                                // transform: scale(1.02);
                                position: relative;
                                overflow: visible;
                            ">
                                <h3 style="color: \${achievement.color}; font-weight: bold;">\${achievement.emoji} \${achievement.name} ✨</h3>
                                <p style="color: #555; margin: 10px 0;">\${achievement.description}</p>
                                <small style="color: #666; font-weight: bold;">🎉 Получено: \${new Date(achievement.unlocked_at).toLocaleDateString('ru-RU')}</small>
                                \${deleteBtn}
                            </div>
                        \`;
                    } else {
                        // Показываем как закрытое достижение (планируется на будущее)
                        const scheduledDate = achievementDate.toLocaleDateString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                        html += \`
                            <div class="achievement special-achievement" style="
                                background: linear-gradient(135deg, #66666622 0%, #99999911 100%); 
                                color: #333; 
                                border-left: 5px solid #999;
                                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                                opacity: 0.7;
                                position: relative;
                                overflow: visible;
                            ">
                                <h3 style="color: #999; font-weight: bold;">\${achievement.emoji} \${achievement.name} 🔒</h3>
                                <p style="color: #777; margin: 10px 0;">\${achievement.description}</p>
                                <small style="color: #888; font-weight: bold;">⏰ Планируется: \${scheduledDate}</small>
                                \${deleteBtn}
                            </div>
                        \`;
                    }
                }
            });
            
            achievementsList.innerHTML = html;
            
            // Если админ - загружаем и показываем ВСЕ специальные достижения как неполученные
            if (isAdmin) {
                fetch('/api/special-achievements')
                    .then(r => r.json())
                    .then(allSpecial => {
                        const unlockedIds = userSpecialAchievements.map(a => a.achievement_id);
                        
                        // Фильтруем только неполученные
                        const unlockedOtherSpecial = allSpecial.filter(a => !unlockedIds.includes(a.achievement_id));
                        
                        if (unlockedOtherSpecial.length > 0) {
                            let addHtml = '';
                            unlockedOtherSpecial.forEach(achievement => {
                                addHtml += \`
                                    <div class="achievement special-achievement" style="
                                        background: linear-gradient(135deg, #66666622 0%, #99999911 100%); 
                                        color: #333; 
                                        border-left: 5px solid #999;
                                        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                                        opacity: 0.7;
                                        position: relative;
                                        overflow: hidden;
                                    ">
                                        <h3 style="color: #999; font-weight: bold;">\${achievement.emoji} \${achievement.name} 🔒</h3>
                                        <p style="color: #777; margin: 10px 0;">\${achievement.description}</p>
                                        <small style="color: #888; font-weight: bold;">👤 Для ID: \${achievement.user_id}</small>
                                    </div>
                                \`;
                            });
                            document.getElementById('achievementsList').innerHTML += addHtml;
                        }
                    })
                    .catch(err => console.error('Ошибка загрузки специальных достижений:', err));
            }

        }

                function displayUserSettings(settings) {
            document.getElementById('dmNotifications').value = settings.dmNotifications.toString();
            document.getElementById('afkTimeout').value = settings.afkTimeout.toString();
            document.getElementById('achievementNotifications').value = settings.achievementNotifications.toString();
        }

        async function loadLeaderboard() {
            try {
                const response = await fetch('/api/leaderboard');
                const leaderboard = await response.json();
                
                const leaderboardList = document.getElementById('leaderboardList');
                let html = '';
                
                leaderboard.forEach((user, index) => {
                    const hours = Math.floor(user.total_voice_time / 3600);
                    const minutes = Math.floor((user.total_voice_time % 3600) / 60);
                    const isAdmin = currentUserId === ADMIN_USER_ID;
                    const userId = user.user_id.replace(/"/g, '&quot;');
                    const userName = (user.username || 'Пользователь').replace(/"/g, '&quot;');
                    const deleteBtn = isAdmin ? '<button onclick="deleteUserFromDB(&#34;' + userId + '&#34;, &#34;' + userName + '&#34;)" style="margin-left: 10px; padding: 5px 10px; background: #ff4444; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>' : '';
                    
                    html += '<div class="leaderboard-item" onclick="showUserModal(&#34;' + userId + '&#34;, &#34;' + (user.username || 'Неизвестный пользователь').replace(/"/g, '&quot;') + '&#34;, ' + (index + 1) + ')" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center;">' +
                        '<div>' +
                            '<span class="rank">#' + (index + 1) + '</span>' +
                            '<strong>' + (user.username || 'Неизвестный пользователь') + '</strong>' +
                        '</div>' +
                        '<div style="display: flex; align-items: center;">' +
                            '<span>' + hours + 'ч ' + minutes + 'м</span>' +
                            '<small style="margin-left: 10px; color: #666;">(' + (user.rank_points || 0) + ' очков)</small>' +
                            deleteBtn +
                        '</div>' +
                    '</div>';
                });
                
                leaderboardList.innerHTML = html;
            } catch (error) {
                document.getElementById('leaderboardList').innerHTML = '<div class="error">Ошибка загрузки рейтинга</div>';
            }
        }

        async function showUserAchievements(userId, username, rank) {
            try {
                const response = await fetch(\`/api/stats/\${userId}\`);
                const data = await response.json();
                
                displayUserAchievementsModal(data.achievements, username, rank, data.stats);
            } catch (error) {
                alert('Ошибка загрузки достижений пользователя');
            }
        }

        // Новая функция для показа модального окна с вкладками
        async function showUserModal(userId, username, rank) {
            try {
                const response = await fetch(\`/api/stats/\${userId}\`);
                const data = await response.json();
                const isAdmin = currentUserId === ADMIN_USER_ID;
                
                displayUserModal(data, username, rank, userId, isAdmin);
            } catch (error) {
                alert('Ошибка загрузки данных пользователя');
            }
        }

        // Функция переключения вкладок в модальном окне
        function switchModalTab(tabName) {
            // Скрываем все вкладки
            document.querySelectorAll('.modal-tab-content').forEach(tab => {
                tab.style.display = 'none';
            });
            
            // Убираем активный класс у всех кнопок
            document.querySelectorAll('.modal-tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Показываем выбранную вкладку
            document.getElementById(\`modal-\${tabName}\`).style.display = 'block';
            
            // Активируем выбранную кнопку
            document.querySelector(\`[onclick="switchModalTab('\${tabName}')"]\`).classList.add('active');
        }

        function displayUserAchievementsModal(achievements, username, rank, stats) {
            const unlockedIds = achievements.map(a => a.achievement_id);
            
            const regularAchievements = {
                first_join: { name: '🎤 Малыш заговорил', description: 'Присоединился к голосовому каналу впервые', points: 10 },
                first_afk: { name: '😴 Первый сон', description: 'Был перемещен в AFK впервые', points: 5 },
                first_message: { name: '💬 Первые буквы', description: 'Отправил первое сообщение в текстовом канале', points: 10 },
                first_settings: { name: '⚙️ Первые настройки', description: 'Изменил настройки бота впервые', points: 10 },
                first_web_visit: { name: '🌐 Первый серфер', description: 'Посетил веб-панель бота впервые', points: 15 },
                first_stream: { name: '📡 Первый стример', description: 'Включил трансляцию впервые', points: 20 },
                voice_starter: { name: '🎧 Алло, это я', description: 'Провел 50+ часов в голосовых каналах', points: 50 },
                voice_addict: { name: '🎧 Заболтал до сотки', description: 'Провел 100+ часов в голосовых каналах', points: 100 },
                voice_god: { name: '🎧 Звезда эфира', description: 'Провел 1000+ часов в голосовых каналах', points: 1000 },
                chatty_beginner: { name: '💬 Разговорчивый новичок', description: 'Отправил 200+ сообщений в текстовых каналах', points: 25 },
                chatty_user: { name: '💬 Болтун', description: 'Отправил 500+ сообщений в текстовых каналах', points: 75 },
                flooter: { name: '💬 Флудер', description: 'Отправил 750+ сообщений в текстовых каналах', points: 100 },
                linguist: { name: '💬 Лингвист', description: 'Отправил 1000+ сообщений в текстовых каналах', points: 150 },
                session_beginner: { name: '🎯 Начинающий участник', description: 'Участвовал в 10+ голосовых сессиях', points: 15 },
                session_veteran: { name: '🎯 Опытный участник', description: 'Участвовал в 50+ голосовых сессиях', points: 40 },
                session_master: { name: '🎯 Мастер сессий', description: 'Участвовал в 100+ голосовых сессиях', points: 75 },
                frequent_guest: { name: '🎯 Частый гость', description: 'Участвовал в 200+ голосовых сессиях', points: 150 },
                permanent_resident: { name: '🎯 Постоянный житель', description: 'Участвовал в 500+ голосовых сессиях', points: 350 },
                session_lord: { name: '🎯 Властелин сессий', description: 'Участвовал в 1000+ голосовых сессиях', points: 1000 },
                afk_beginner: { name: '😴 AFK новичок', description: 'Перемещен в AFK 10 раз', points: 10 },
                afk_veteran: { name: '😴 AFK ветеран', description: 'Перемещен в AFK 50 раз', points: 50 },
                afk_master: { name: '😴 AFK Специалист', description: 'Перемещен в AFK 100 раз', points: 100 },
                afk_time_lord: { name: '😴 AFK Повелитель времени', description: 'Провел 1000+ часов в AFK канале', points: 1000 },
                no_afk_week: { name: '💪 Железная воля', description: 'Неделя без перемещений в AFK', points: 50 },
                mute_master: { name: '🎙️ Мастер тишины', description: 'Переключил микрофон 100 раз', points: 25 },
                long_session: { name: '⏰ Марафонец', description: 'Провел 12+ часов в одной сессии', points: 75 },
                settings_explorer: { name: '⚙️ Исследователь настроек', description: 'Изменил настройки бота 20 раз', points: 30 },
                mention_responder: { name: '📢 Отзывчивый', description: 'Ответил на 1000+ упоминаний', points: 100 },
                stream_viewer_1: { name: '📺 Одним глазком', description: 'Провел 5+ часов в канале Че смотрим?', points: 10 },
                stream_viewer_2: { name: '📺 Зритель со стажем', description: 'Провел 50+ часов в канале Че смотрим?', points: 50 },
                stream_viewer_3: { name: '📺 Топовый зритель', description: 'Провел 100+ часов в канале Че смотрим?', points: 100 },
                stream_viewer_4: { name: '📺 Киберфанат', description: 'Провел 200+ часов в канале Че смотрим?', points: 200 },
                stream_viewer_5: { name: '📺 Бессмертный зритель', description: 'Провел 500+ часов в канале Че смотрим?', points: 500 },
                stream_viewer_6: { name: '📺 Легенда трансляций', description: 'Провел 1000+ часов в канале Че смотрим?', points: 1000 }
            };
            
            const specialAchievements = {
                best_admin: { name: '👑 Kakashech - Лучший админ', description: 'Лучший admin_ebaniy канала', points: 0 }
            };
            
            // Прогресс считаем только для обычных достижений, исключая специальные
            const unlockedRegular = achievements.filter(a => {
                // Исключаем best_admin
                if (a.achievement_id === 'best_admin') return false;
                // Исключаем все остальные специальные достижения (у них есть emoji и type === 'special')
                if (a.emoji && a.type === 'special') return false;
                return true;
            });
            const totalRegular = Object.keys(regularAchievements).length;
            
            let modalHtml = \`
                <div class="modal" id="achievementsModal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2>🏆 Достижения пользователя</h2>
                            <h3>#\${rank} \${username}</h3>
                            <p>Достижений: \${unlockedRegular.length}/\${totalRegular} (\${Math.round((unlockedRegular.length / totalRegular) * 100)}%)</p>
                            <p>Очков рейтинга: \${stats.rank_points || 0}</p>
                            <button class="close-btn" onclick="closeModal()">×</button>
                        </div>
                        
                        <div class="modal-body">
                            <div class="modal-achievements">
            \`;
            
            // Создаем массив полученных достижений с датами
const modalUnlockedAchievements = [];

for (const [id, achievement] of Object.entries(regularAchievements)) {
    const isUnlocked = unlockedIds.includes(id);
    if (isUnlocked) {
        const unlockedDate = achievements.find(a => a.achievement_id === id)?.unlocked_at;
        modalUnlockedAchievements.push({
            html: \`
                <div class="modal-achievement">
                    <h4>\${achievement.name} ✅</h4>
                    <p style="margin: 8px 0; color: #666;">\${achievement.description}</p>
                    <small>+\${achievement.points} очков • Получено: \${new Date(unlockedDate).toLocaleDateString('ru-RU')}</small>
                </div>
            \`,
            date: new Date(unlockedDate)
        });
    }
}

// Сортируем по дате получения (новые первые)
modalUnlockedAchievements.sort((a, b) => b.date - a.date);

// Добавляем в HTML
modalUnlockedAchievements.forEach(achievement => {
    modalHtml += achievement.html;
});
            
            // Проверяем специальные достижения
            const now = new Date();
            
            const specialAchievementsFromDBFiltered = achievements.filter(a => {
                const isSpecial = a.emoji && a.name && a.type === 'special';
                if (!isSpecial) return false;
                
                // Проверяем special_date
                if (!a.special_date) return true; // Если дата не установлена, показываем
                
                // На браузере new Date() работает в локальном timezone
                // Просто сравниваем как есть
                const achievementDate = new Date(a.special_date);
                const now = new Date();
                return achievementDate <= now;
            });
            
            const hasSpecial = specialAchievementsFromDBFiltered.length > 0;
            
            if (hasSpecial) {
                modalHtml += \`
                    <div style="grid-column: 1 / -1; margin-top: 20px; border-top: 3px solid #ffd700; padding-top: 20px;">
                        <h3 style="text-align: center; color: #ffd700; margin-bottom: 15px;">⭐ Специальные достижения ⭐</h3>
                    </div>
                \`;
                
                specialAchievementsFromDBFiltered.forEach(achievement => {
                    modalHtml += \`
                        <div class="modal-achievement special-achievement">
                            <h4>\${achievement.emoji} \${achievement.name} ✨</h4>
                            <p style="margin: 8px 0; color: #555;">\${achievement.description}</p>
                            <small style="color: #666; font-weight: bold;">🎉 Получено: \${new Date(achievement.unlocked_at).toLocaleDateString('ru-RU')}</small>
                        </div>
                    \`;
                });
            }
            
            if (achievements.length === 0) {
                modalHtml += \`
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #666;">
                        <h3>😔 Достижений пока нет</h3>
                        <p>Этот пользователь еще не получил ни одного достижения</p>
                    </div>
                \`;
            }
            
            modalHtml += \`
                            </div>
                        </div>
                    </div>
                </div>
            \`;
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            document.body.classList.add('modal-open');
        }

        function closeModal() {
            const modal = document.getElementById('achievementsModal');
            if (modal) {
                modal.remove();
                document.body.classList.remove('modal-open');
            }
        }

        function deleteUserAchievement(userId, achievementId) {
            if (!confirm('Вы уверены, что хотите удалить это достижение у пользователя?')) {
                return;
            }
            
            fetch('/api/admin/delete-achievement', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: userId,
                    achievementId: achievementId
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    // Находим и удаляем элемент со страницы
                    const achievementElement = document.querySelector('[data-achievement-id="' + achievementId + '"]');
                    if (achievementElement) {
                        achievementElement.remove();
                    }
                    
                    // Перезагружаем данные пользователя если это текущий пользователь
                    if (userId === currentUserId) {
                        loadUserData();
                    }
                    
                    console.log('✅ Достижение успешно удалено!');
                } else {
                    alert('Ошибка при удалении достижения');
                }
            })
            .catch(error => {
                console.error('Ошибка:', error);
                alert('Ошибка при удалении достижения');
            });
        }

        function displayUserModal(data, username, rank, userId, isAdmin = false) {
            const achievements = data.achievements;
            const stats = data.stats;
            const unlockedIds = achievements.map(a => a.achievement_id);
            
            const regularAchievements = {
                first_join: { name: '🎤 Малыш заговорил', description: 'Присоединился к голосовому каналу впервые', points: 10 },
                first_afk: { name: '😴 Первый сон', description: 'Был перемещен в AFK впервые', points: 5 },
                first_message: { name: '💬 Первые буквы', description: 'Отправил первое сообщение в текстовом канале', points: 10 },
                first_settings: { name: '⚙️ Первые настройки', description: 'Изменил настройки бота впервые', points: 10 },
                first_web_visit: { name: '🌐 Первый серфер', description: 'Посетил веб-панель бота впервые', points: 15 },
                first_stream: { name: '📡 Первый стример', description: 'Включил трансляцию впервые', points: 20 },
                voice_starter: { name: '🎧 Алло, это я', description: 'Провел 50+ часов в голосовых каналах', points: 50 },
                voice_addict: { name: '🎧 Заболтал до сотки', description: 'Провел 100+ часов в голосовых каналах', points: 100 },
                voice_god: { name: '🎧 Звезда эфира', description: 'Провел 1000+ часов в голосовых каналах', points: 1000 },
                chatty_beginner: { name: '💬 Разговорчивый новичок', description: 'Отправил 200+ сообщений в текстовых каналах', points: 25 },
                chatty_user: { name: '💬 Болтун', description: 'Отправил 500+ сообщений в текстовых каналах', points: 75 },
                flooter: { name: '💬 Флудер', description: 'Отправил 750+ сообщений в текстовых каналах', points: 100 },
                linguist: { name: '💬 Лингвист', description: 'Отправил 1000+ сообщений в текстовых каналах', points: 150 },
                session_beginner: { name: '🎯 Начинающий участник', description: 'Участвовал в 10+ голосовых сессиях', points: 15 },
                session_veteran: { name: '🎯 Опытный участник', description: 'Участвовал в 50+ голосовых сессиях', points: 40 },
                session_master: { name: '🎯 Мастер сессий', description: 'Участвовал в 100+ голосовых сессиях', points: 75 },
                frequent_guest: { name: '🎯 Частый гость', description: 'Участвовал в 200+ голосовых сессиях', points: 150 },
                permanent_resident: { name: '🎯 Постоянный житель', description: 'Участвовал в 500+ голосовых сессиях', points: 350 },
                session_lord: { name: '🎯 Властелин сессий', description: 'Участвовал в 1000+ голосовых сессиях', points: 1000 },
                afk_beginner: { name: '😴 AFK новичок', description: 'Перемещен в AFK 10 раз', points: 10 },
                afk_veteran: { name: '😴 AFK ветеран', description: 'Перемещен в AFK 50 раз', points: 50 },
                afk_master: { name: '😴 AFK Специалист', description: 'Перемещен в AFK 100 раз', points: 100 },
                afk_time_lord: { name: '😴 AFK Повелитель времени', description: 'Провел 1000+ часов в AFK канале', points: 1000 },
                no_afk_week: { name: '💪 Железная воля', description: 'Неделя без перемещений в AFK', points: 50 },
                mute_master: { name: '🎙️ Мастер тишины', description: 'Переключил микрофон 100 раз', points: 25 },
                long_session: { name: '⏰ Марафонец', description: 'Провел 12+ часов в одной сессии', points: 75 },
                settings_explorer: { name: '⚙️ Исследователь настроек', description: 'Изменил настройки бота 20 раз', points: 30 },
                mention_responder: { name: '📢 Отзывчивый', description: 'Ответил на 1000+ упоминаний', points: 100 },
                stream_viewer_1: { name: '📺 Одним глазком', description: 'Провел 5+ часов в канале Че смотрим?', points: 10 },
                stream_viewer_2: { name: '📺 Зритель со стажем', description: 'Провел 50+ часов в канале Че смотрим?', points: 50 },
                stream_viewer_3: { name: '📺 Топовый зритель', description: 'Провел 100+ часов в канале Че смотрим?', points: 100 },
                stream_viewer_4: { name: '📺 Киберфанат', description: 'Провел 200+ часов в канале Че смотрим?', points: 200 },
                stream_viewer_5: { name: '📺 Бессмертный зритель', description: 'Провел 500+ часов в канале Че смотрим?', points: 500 },
                stream_viewer_6: { name: '📺 Легенда трансляций', description: 'Провел 1000+ часов в канале Че смотрим?', points: 1000 }
            };
            
            const specialAchievements = {
                best_admin: { name: '👑 Kakashech - Лучший админ', description: 'Лучший admin_ebaniy канала', points: 0 }
            };
            
            const unlockedRegular = achievements.filter(a => !specialAchievements.hasOwnProperty(a.achievement_id) && !a.emoji);
            const totalRegular = Object.keys(regularAchievements).length;
            
            let modalHtml = \`
                <div class="modal" id="achievementsModal">
                    <div class="modal-content" style="max-width: 800px; height: 80vh;overflow: auto;
  scrollbar-width: none;">
                        <div class="modal-header">
                            <h2>👤 Профиль пользователя</h2>
                            <h3>#\${rank} \${username}</h3>
                            <button class="close-btn" onclick="closeModal()">×</button>
                        </div>
                        
                        <div class="modal-tabs">
                            <button class="modal-tab-button active" onclick="switchModalTab('achievements')">🏆 Достижения</button>
                            <button class="modal-tab-button" onclick="switchModalTab('stats')">📊 Статистика</button>
                        </div>
                        
                        <div class="modal-body">
                            <!-- Вкладка достижений -->
                            <div id="modal-achievements" class="modal-tab-content">
                                <div style="text-align: center; margin-bottom: 20px;">
                                    <p>Достижений: \${unlockedRegular.length}/\${totalRegular} (\${Math.round((unlockedRegular.length / totalRegular) * 100)}%)</p>
                                    <p>Очков рейтинга: \${stats.rank_points || 0}</p>
                                </div>
                                <div class="modal-achievements">
            \`;
            
            // Достижения (используем тот же код что и в старой функции)
            const modalUnlockedAchievements = [];
            for (const [id, achievement] of Object.entries(regularAchievements)) {
                const isUnlocked = unlockedIds.includes(id);
                if (isUnlocked) {
                    const unlockedDate = achievements.find(a => a.achievement_id === id)?.unlocked_at;
                    const deleteBtn = isAdmin ? \`<button onclick="deleteUserAchievement('\${userId}', '\${id}')" style="margin-top: 8px; padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>\` : '';
                    modalUnlockedAchievements.push({
                        html: \`
                            <div class="modal-achievement">
                                <h4>\${achievement.name} ✅</h4>
                                <p style="margin: 8px 0; color: #666;">\${achievement.description}</p>
                                <small>+\${achievement.points} очков • Получено: \${new Date(unlockedDate).toLocaleDateString('ru-RU')}</small>
                                \${deleteBtn}
                            </div>
                        \`,
                        date: new Date(unlockedDate)
                    });
                }
            }
            
            modalUnlockedAchievements.sort((a, b) => b.date - a.date);
            modalUnlockedAchievements.forEach(achievement => {
                modalHtml += achievement.html;
            });
            
            // Специальные достижения берем только из полученных пользователем
            // Но только если их special_date уже наступило (или дата не установлена)
            const now = new Date();
            
            const unlockedSpecial = achievements.filter(a => {
                const isSpecial = a.emoji && a.name && a.type === 'special';
                if (!isSpecial) return false;
                
                // Проверяем special_date
                if (!a.special_date) return true; // Если дата не установлена, показываем
                
                // На браузере new Date() работает в локальном timezone
                // Просто сравниваем как есть
                const achievementDate = new Date(a.special_date);
                const now = new Date();
                return achievementDate <= now;
            });
            
            // Добавляем best_admin если пользователь его получил
            const bestAdminAchievement = achievements.find(a => a.achievement_id === 'best_admin');
            if (bestAdminAchievement) {
                unlockedSpecial.push({
                    emoji: '👑',
                    name: 'Kakashech - Лучший админ',
                    description: 'Лучший admin_ebaniy канала',
                    unlocked_at: bestAdminAchievement.unlocked_at,
                    type: 'special',
                    achievement_id: 'best_admin'
                });
            }
            
            if (unlockedSpecial.length > 0) {
                modalHtml += \`
                    <div style="grid-column: 1 / -1; margin-top: 20px; border-top: 3px solid #ffd700; padding-top: 20px;">
                        <h3 style="text-align: center; color: #ffd700; margin-bottom: 15px;">⭐ Специальные достижения ⭐</h3>
                    </div>
                \`;
                
                // Показываем полученные специальные достижения
                unlockedSpecial.forEach(achievement => {
                    // best_admin - исключение, используем исходные стили
                    if (achievement.name === 'Kakashech - Лучший админ') {
                        const deleteBtn = isAdmin ? \`<button onclick="deleteUserAchievement('\${userId}', 'best_admin')" style="margin-top: 8px; padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>\` : '';
                        modalHtml += \`
                            <div class="modal-achievement special-achievement" style="
                                background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); 
                                color: #333; 
                                border-left: 5px solid #ff6b35;
                                // box-shadow: 0 5px 15px rgba(255, 215, 0, 0.4);
                                position: relative;
                                overflow: visible;
                            ">
                                <h3 style="color: #333; font-weight: bold; margin: 0 0 10px 0;">\${achievement.emoji} \${achievement.name} ✨</h3>
                                <p style="margin: 8px 0; color: #555;">\${achievement.description}</p>
                                <small style="color: #666; font-weight: bold;">🎉 Получено: \${new Date(achievement.unlocked_at).toLocaleDateString('ru-RU')}</small>
                                \${deleteBtn}
                            </div>
                        \`;
                    } else {
                        // Остальные специальные достижения из БД
                        const color = achievement.color || '#FFD700';
                        const deleteBtn = isAdmin ? \`<button onclick="deleteUserAchievement('\${userId}', '\${achievement.achievement_id}')" style="margin-top: 8px; padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>\` : '';
                        modalHtml += \`
                            <div class="modal-achievement special-achievement" style="
                                background: linear-gradient(135deg, \${color}22 0%, \${color}11 100%);
                                color: #333;
                                border-left: 5px solid \${color};
                                // box-shadow: 0 8px 25px rgba(255, 215, 0, 0.4);
                                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                                transform: scale(1.02);
                                position: relative;
                                overflow: visible;
                            ">
                                <h3 style="color: \${color}; font-weight: bold; margin: 0 0 10px 0;">\${achievement.emoji} \${achievement.name} ✨</h3>
                                <p style="margin: 8px 0; color: #555;">\${achievement.description}</p>
                                <small style="color: #666; font-weight: bold;">🎉 Получено: \${new Date(achievement.unlocked_at).toLocaleDateString('ru-RU')}</small>
                                \${deleteBtn}
                            </div>
                        \`;
                    }
                });
            }
            
            if (achievements.length === 0) {
                modalHtml += \`
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #666;">
                        <h3>😔 Достижений пока нет</h3>
                        <p>Этот пользователь еще не получил ни одного достижения</p>
                    </div>
                \`;
            }
            
            // Закрываем вкладку достижений и добавляем вкладку статистики
            modalHtml += \`
                                </div>
                            </div>
                            
                            <!-- Вкладка статистики -->
                            <div id="modal-stats" class="modal-tab-content" style="display: none;">
                                <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                    <div class="stat-item">
                                        <div class="stat-value">\${stats.total_sessions || 0}</div>
                                        <div class="stat-label">Всего сессий</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${Math.floor((stats.total_voice_time || 0) / 3600)}ч \${Math.floor(((stats.total_voice_time || 0) % 3600) / 60)}м</div>
                                        <div class="stat-label">Время в голосовых</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${stats.total_afk_moves || 0}</div>
                                        <div class="stat-label">Перемещений в AFK</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${Math.floor((stats.total_afk_time || 0) / 3600)}ч \${Math.floor(((stats.total_afk_time || 0) % 3600) / 60)}м</div>
                                        <div class="stat-label">Время в AFK</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${stats.rank_points || 0}</div>
                                        <div class="stat-label">Очки рейтинга</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${Math.floor((stats.longest_session || 0) / 3600)}ч \${Math.floor(((stats.longest_session || 0) % 3600) / 60)}м\${stats.longest_session_date ? '<br><span style="font-size:0.55em;color:#999;">' + new Date(stats.longest_session_date).toLocaleDateString('ru-RU') + ' ' + new Date(stats.longest_session_date).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) + '</span>' : ''}</div>
                                        <div class="stat-label">Самая длинная сессия</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${stats.total_mute_toggles || 0}</div>
                                        <div class="stat-label">Переключений микрофона</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${stats.settings_changes || 0}</div>
                                        <div class="stat-label">Изменений настроек</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${stats.messages_sent || 0}</div>
                                        <div class="stat-label">Отправлено сообщений</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${stats.mentions_responded || 0}</div>
                                        <div class="stat-label">Ответов на упоминания</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${Math.floor((stats.stream_channel_time || 0) / 3600)}ч \${Math.floor(((stats.stream_channel_time || 0) % 3600) / 60)}м</div>
                                        <div class="stat-label">Время в канале Че смотрим?</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${stats.web_visits || 0}</div>
                                        <div class="stat-label">Посещений веб-панели</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">\${stats.total_streams || 0}</div>
                                        <div class="stat-label">Включений трансляций</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            \`;
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            document.body.classList.add('modal-open');
        }

        document.addEventListener('click', function(event) {
            const modal = document.getElementById('achievementsModal');
            const createModal = document.getElementById('createSpecialAchievementModal');
            
            if (modal && event.target === modal) {
                closeModal();
            }
            if (createModal && event.target === createModal) {
                closeCreateSpecialAchievementModal();
            }
        });

                async function saveSettings() {
            if (!currentUserId) return;
            
            const dmNotifications = document.getElementById('dmNotifications').value === 'true';
            const afkTimeout = parseInt(document.getElementById('afkTimeout').value);
            const achievementNotifications = document.getElementById('achievementNotifications').value === 'true';
            
            try {
                const response = await fetch(\`/api/settings/\${currentUserId}\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        dmNotifications,
                        afkTimeout,
                        achievementNotifications
                    })
                });
                
                if (response.ok) {
                    alert('Настройки сохранены!');
                } else {
                    alert('Ошибка сохранения настроек');
                }
            } catch (error) {
                alert('Ошибка сохранения настроек');
            }
        }

        // ===== ФУНКЦИИ СОЗДАНИЯ СПЕЦИАЛЬНОГО ДОСТИЖЕНИЯ =====
        function openCreateSpecialAchievementModal() {
            document.getElementById('createSpecialAchievementModal').style.display = 'block';
            document.body.classList.add('modal-open');
            updateSpecialAchievementPreview();
        }

        function closeCreateSpecialAchievementModal() {
            document.getElementById('createSpecialAchievementModal').style.display = 'none';
            document.body.classList.remove('modal-open');
        }

        function updateSpecialAchievementPreview() {
            const emoji = document.getElementById('specialAchievementEmoji').value || '🏆';
            const name = document.getElementById('specialAchievementName').value || 'Название';
            const color = document.getElementById('specialAchievementColor').value || '#FFD700';
            
            const preview = document.getElementById('specialAchievementPreview');
            const bgGradient = 'linear-gradient(135deg, ' + color + '22, ' + color + '11)';
            const borderColor = color;
            
            preview.innerHTML = '<div class="achievement-preview" style="background: ' + bgGradient + '; border-left: 4px solid ' + borderColor + ';">' +
                '<div style="font-size: 32px;">' + emoji + '</div>' +
                '<div style="color: ' + color + '; font-weight: bold;">' + name + '</div>' +
                '</div>';
        }

        async function createSpecialAchievement() {
            const emoji = document.getElementById('specialAchievementEmoji').value;
            const name = document.getElementById('specialAchievementName').value;
            const description = document.getElementById('specialAchievementDescription').value;
            const targetUserId = document.getElementById('specialAchievementUserId').value;
            const date = document.getElementById('specialAchievementDate').value;
            const time = document.getElementById('specialAchievementTime').value;
            const color = document.getElementById('specialAchievementColor').value;
            
            if (!emoji || !name || !description || !targetUserId || !date || !time || !color) {
                alert('Заполни все обязательные поля!');
                return;
            }

            try {
                // Пользователь вводит МОСКОВСКОЕ время
                // Просто отправляем как есть, без конвертации
                // На сервере будет интерпретировано как московское время
                
                const response = await fetch('/api/admin/create-achievement', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        emoji,
                        name,
                        description,
                        type: 'special',
                        userId: targetUserId,
                        specialDate: date + 'T' + time,  // "2025-12-09T23:35" (Moscow time)
                        color
                    })
                });

                if (response.ok) {
                    alert('Специальное достижение создано!');
                    closeCreateSpecialAchievementModal();
                    document.getElementById('createSpecialAchievementForm').reset();
                    updateSpecialAchievementPreview();
                } else {
                    const error = await response.json();
                    alert('Ошибка: ' + error.error);
                }
            } catch (error) {
                console.error('Ошибка при создании достижения:', error);
                alert('Ошибка при создании достижения');
            }
        }

        // Функция удаления достижения у пользователя
        async function deleteAchievementFromUser() {
            const userId = prompt('Введи Discord ID пользователя:');
            if (!userId) return;

            const achievementId = prompt('Введи ID достижения для удаления:');
            if (!achievementId) return;

            if (!confirm('Вы уверены? Это удалит достижение у пользователя.')) return;

            try {
                const response = await fetch('/api/admin/delete-achievement', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        userId,
                        achievementId
                    })
                });

                if (response.ok) {
                    alert('Достижение удалено!');
                } else {
                    const error = await response.json();
                    alert('Ошибка: ' + error.error);
                }
            } catch (error) {
                console.error('Ошибка при удалении достижения:', error);
                alert('Ошибка при удалении достижения');
            }
        }

        // Инициализация при загрузке страницы
        document.addEventListener('DOMContentLoaded', async () => {
            console.log('🟢 DOMContentLoaded сработал');
            
            // По умолчанию показываем только поле ввода ID
            document.getElementById('userInfoDisplay').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'none';
            document.getElementById('userIdInput').style.display = 'block';
            
            // Проверяем авторизацию и параметры URL
            const urlParams = new URLSearchParams(window.location.search);
            const autoLogin = urlParams.get('autoLogin');
            const userIdParam = urlParams.get('userId');
            
            console.log('📋 URL params - autoLogin:', autoLogin, 'userId:', userIdParam);
            
            if (autoLogin && userIdParam) {
                console.log('🔑 Запуск autoLogin с userId:', userIdParam);
                // Автоматический вход через Discord
                loadUserDataAuto(userIdParam);
            } else {
                // Проверяем активную сессию
                const authOk = await checkAuthStatus();
                
                // ✅ Если нет активной сессии, загружаем сохраненный userId
                if (!authOk) {
                    const savedUserId = loadSavedUserId();
                    if (savedUserId) {
                        console.log('📱 Автоматически загружаю сохраненного пользователя:', savedUserId);
                        setTimeout(() => loadUserDataAuto(savedUserId), 500);
                    }
                }
            }
        });

        loadLeaderboard();
    </script>
</body>
</html>
  `);
});

// Запуск веб-сервера
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Веб-панель запущена на порту ${PORT}`);
  console.log(`🏠 Локальный доступ: http://localhost:${PORT}`);
  console.log(`🌍 Внешний доступ: http://${SERVER_IP}:${PORT}`);
});

// ===== ОБРАБОТЧИК КОМАНД С ОТСЛЕЖИВАНИЕМ =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const userId = message.author.id;
  const username = message.author.username;

  // Инициализируем пользователя в статистике
  initUserStats(userId, username);

  // Увеличиваем счетчик сообщений
  incrementUserStat(userId, "messages_sent");

  // Проверяем достижение "Первые буквы"
  const stats = getUserStats(userId);
  if (stats && stats.messages_sent === 1) {
    await checkAndUnlockAchievement(userId, username, "first_message");
  }

  // Проверяем ответ на упоминание текущего пользователя
  // Если это ответ (reply) на сообщение, содержащее упоминание этого пользователя
  if (message.reference) {
    try {
      const repliedTo = await message.channel.messages.fetch(
        message.reference.messageId
      );
      // Проверяем, был ли упомянут текущий пользователь в том сообщении
      // Также проверяем, содержит ли исходное сообщение User ID в формате <@userId>
      const userMentioned =
        repliedTo.mentions.has(userId) ||
        repliedTo.content.includes(`<@${userId}>`) ||
        repliedTo.content.includes(`<@!${userId}>`);

      if (userMentioned) {
        incrementUserStat(userId, "mentions_responded");
        await checkAchievements(userId, username);
      }
    } catch (error) {
      console.log(
        "Не удалось получить сообщение для проверки упоминания:",
        error.message
      );
    }
  }

  // Проверяем достижения при отправке сообщений
  await checkAchievements(userId, username);

  // Команда для просмотра статистики
  if (content === ".!. stats" || content === ".!. статистика") {
    const stats = getUserStats(userId);
    const achievements = getUserAchievements(userId);

    if (!stats) {
      await message.reply(
        "📊 У вас пока нет статистики. Начните использовать голосовые каналы!"
      );
      return;
    }

    const voiceTime = formatDuration(stats.total_voice_time || 0);
    const longestSession = formatDuration(stats.longest_session || 0);
    const afkTime = formatDuration(stats.total_afk_time || 0);
    const streamTime = formatDuration(stats.stream_channel_time || 0);

    await message.reply(`
📊 **Ваша статистика:**
🎤 Всего сессий: **${stats.total_sessions || 0}**
⏰ Время в голосовых: **${voiceTime}**
😴 Перемещений в AFK: **${stats.total_afk_moves || 0}**
💤 Время в AFK: **${afkTime}**
🎙️ Переключений микрофона: **${stats.total_mute_toggles || 0}**
📈 Самая длинная сессия: **${longestSession}**
⚙️ Изменений настроек: **${stats.settings_changes || 0}**
💬 Отправлено сообщений: **${stats.messages_sent || 0}**
📢 Ответов на упоминания: **${stats.mentions_responded || 0}**
📺 Время в канале Че смотрим?: **${streamTime}**
🌐 Посещений веб-панели: **${stats.web_visits || 0}**
📡 Включений трансляций: **${stats.total_streams || 0}**
⭐ Очки рейтинга: **${stats.rank_points || 0}**
🏆 Достижений: **${
      achievements.filter((a) => a.achievement_id !== "best_admin").length
    }/${Object.keys(ACHIEVEMENTS).filter((id) => id !== "best_admin").length}**

👤 **Твой ID:** \`${message.author.id}\`
🌐 **Подробная статистика:** http://${SERVER_IP}:${PORT}/?userId=${
      message.author.id
    }&autoLogin=true
    `);
    return;
  }

  // Команда для просмотра достижений
  if (content === ".!. achievements" || content === ".!. достижения") {
    const achievements = getUserAchievements(userId);
    const totalAchievements = Object.keys(ACHIEVEMENTS).filter(
      (id) => id !== "best_admin"
    ).length;
    const userAchievements = achievements.filter(
      (a) => a.achievement_id !== "best_admin"
    );

    let achievementText = `🏆 **Ваши достижения (${userAchievements.length}/${totalAchievements}):**\n\n`;

    if (userAchievements.length === 0) {
      achievementText +=
        "У вас пока нет достижений. Проводите больше времени в голосовых каналах!";
    } else {
      userAchievements.forEach((ach) => {
        const achievement = ACHIEVEMENTS[ach.achievement_id];
        if (achievement) {
          achievementText += `${achievement.name}\n${achievement.description}\n+${achievement.points} очков\n\n`;
        }
      });
    }

    await message.reply(achievementText);
    return;
  }

  // Остальные команды с отслеживанием изменений настроек...
  if (content === ".!. msg on" || content === ".!. лс вкл") {
    setUserDMSetting(message.author.id, true);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    // Проверяем достижение за первое изменение настроек
    const stats = getUserStats(userId);
    if (stats && stats.settings_changes === 1) {
      await checkAndUnlockAchievement(userId, username, "first_settings");
    }

    await message.reply(
      "✅ ЛС уведомления о перемещении в токсичный канал **включены**"
    );
    sendTelegramReport(
      `🔔 <b>Пользователь изменил настройки</b>\n` +
        `👤 Пользователь: ${message.author.username}\n` +
        `🆔 ID: <code>${message.author.id}</code>\n` +
        `📩 ЛС уведомления: ✅ ВКЛЮЧЕНЫ\n` +
        `📅 Время: ${formatTime(new Date())}`
    );
    return;
  }

  if (content === ".!. msg off" || content === ".!. лс выкл") {
    setUserDMSetting(message.author.id, false);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply(
      "❌ ЛС уведомления о перемещении в токсичный канал **отключены**"
    );
    sendTelegramReport(
      `🔔 <b>Пользователь изменил настройки</b>\n` +
        `👤 Пользователь: ${message.author.username}\n` +
        `🆔 ID: <code>${message.author.id}</code>\n` +
        `📩 ЛС уведомления: ❌ ОТКЛЮЧЕНЫ\n` +
        `📅 Время: ${formatTime(new Date())}`
    );
    return;
  }

  if (content === ".!. time 15" || content === ".!. время 15") {
    setUserTimeout(message.author.id, 15);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply(
      "⏰ Время до перемещения в AFK установлено: **15 минут**"
    );
    const dmEnabled = getUserDMSetting(message.author.id);
    sendTelegramReport(
      `⏰ <b>Пользователь изменил настройки</b>\n` +
        `👤 Пользователь: ${message.author.username}\n` +
        `🆔 ID: <code>${message.author.id}</code>\n` +
        `⏱️ Таймер AFK: 15 минут\n` +
        `📩 ЛС уведомления: ${dmEnabled ? "✅ включены" : "❌ отключены"}\n` +
        `📅 Время: ${formatTime(new Date())}`
    );
    return;
  }

  if (content === ".!. time 30" || content === ".!. время 30") {
    setUserTimeout(message.author.id, 30);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply(
      "⏰ Время до перемещения в AFK установлено: **30 минут**"
    );
    const dmEnabled = getUserDMSetting(message.author.id);
    sendTelegramReport(
      `⏰ <b>Пользователь изменил настройки</b>\n` +
        `👤 Пользователь: ${message.author.username}\n` +
        `🆔 ID: <code>${message.author.id}</code>\n` +
        `⏱️ Таймер AFK: 30 минут\n` +
        `📩 ЛС уведомления: ${dmEnabled ? "✅ включены" : "❌ отключены"}\n` +
        `📅 Время: ${formatTime(new Date())}`
    );
    return;
  }

  if (content === ".!. time 45" || content === ".!. время 45") {
    setUserTimeout(message.author.id, 45);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply(
      "⏰ Время до перемещения в AFK установлено: **45 минут**"
    );
    const dmEnabled = getUserDMSetting(message.author.id);
    sendTelegramReport(
      `⏰ <b>Пользователь изменил настройки</b>\n` +
        `👤 Пользователь: ${message.author.username}\n` +
        `🆔 ID: <code>${message.author.id}</code>\n` +
        `⏱️ Таймер AFK: 45 минут\n` +
        `📩 ЛС уведомления: ${dmEnabled ? "✅ включены" : "❌ отключены"}\n` +
        `📅 Время: ${formatTime(new Date())}`
    );
    return;
  }

  if (content === ".!. status" || content === ".!. статус") {
    const dmEnabled = getUserDMSetting(message.author.id);
    const timeout = getUserTimeout(message.author.id);
    const dmStatus = dmEnabled ? "**включены** ✅" : "**отключены** ❌";

    await message.reply(
      `🔔 **Твои настройки AFK бота:**
ЛС уведомления: ${dmStatus}
Время до AFK: **${timeout} минут** ⏰

**Команды для изменения:**
\`.!. msg on/off\` - включить/отключить уведомления
\`.!. time 15/30/45\` - установить время до AFK
\`.!. stats\` - посмотреть статистику
\`.!. achievements\` - посмотреть достижения

👤 **Твой ID:** \`${message.author.id}\`
🌐 **Веб-панель:** http://${SERVER_IP}:${PORT}/?userId=${message.author.id}&autoLogin=true`
    );

    sendTelegramReport(
      `📊 <b>Пользователь проверил статус настроек</b>\n` +
        `👤 Пользователь: ${message.author.username}\n` +
        `🆔 ID: <code>${message.author.id}</code>\n` +
        `⏱️ Текущий таймер: ${timeout} минут\n` +
        `📩 ЛС уведомления: ${dmEnabled ? "✅ включены" : "❌ отключены"}\n` +
        `📅 Время: ${formatTime(new Date())}`
    );
    return;
  }

  // Команды управления уведомлениями о достижениях
  if (content === ".!. ach on" || content === ".!. достижения вкл") {
    setUserAchievementNotificationSetting(message.author.id, true);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply("🏆✅ Уведомления о достижениях **включены**");

    sendTelegramReport(
      `🔔 <b>Пользователь изменил настройки</b>\n` +
        `👤 Пользователь: ${message.author.username}\n` +
        `🆔 ID: <code>${message.author.id}</code>\n` +
        `🏆 Уведомления о достижениях: ✅ ВКЛЮЧЕНЫ\n` +
        `📅 Время: ${formatTime(new Date())}`
    );
    return;
  }

  if (content === ".!. ach off" || content === ".!. достижения выкл") {
    setUserAchievementNotificationSetting(message.author.id, false);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply("🏆❌ Уведомления о достижениях **отключены**");

    sendTelegramReport(
      `🔔 <b>Пользователь изменил настройки</b>\n` +
        `👤 Пользователь: ${message.author.username}\n` +
        `🆔 ID: <code>${message.author.id}</code>\n` +
        `🏆 Уведомления о достижениях: ❌ ОТКЛЮЧЕНЫ\n` +
        `📅 Время: ${formatTime(new Date())}`
    );
    return;
  }

  if (content === ".!." || content === ".!.") {
    await message.reply(`
<:12:1424527747413184613> **Команды AFK бота:**
\`.!. msg on/off или .!. лс вкл/выкл\` - включить/отключить ЛС уведомления
\`.!. time 15/30/45 или .!. время 15/30/45\` - установить время до AFK
\`.!. ach on/off или .!. достижения вкл/выкл\` - уведомления о достижениях
\`.!. status или .!. статус\` - проверить настройки
\`.!. stats или .!. статистика\` - посмотреть статистику
\`.!. achievements или .!. достижения\` - посмотреть достижения
\`.!.\` - показать эту справку

<:25:1424527771669106750> **Как работает бот:**
• При отключении микрофона запускается таймер (15/30/45 минут)
• По истечению времени ты перемещаешься в токсичный канал
• При включении микрофона ты возвращаешься в исходный канал
• Зарабатывай очки рейтинга и открывай достижения!

👤 **Твой ID:** \`${message.author.id}\`
🌐 **Веб-панель:** http://${SERVER_IP}:${PORT}/?userId=${message.author.id}&autoLogin=true
    `);

    sendTelegramReport(
      `❓ <b>Пользователь запросил справку</b>\n` +
        `👤 Пользователь: ${message.author.username}\n` +
        `🆔 ID: <code>${message.author.id}</code>\n` +
        `📅 Время: ${formatTime(new Date())}`
    );
    return;
  }

  // Команда для просмотра достижений конкретного пользователя (для админа)
  if (
    content.startsWith(".!. showachievements") &&
    message.author.id === ADMIN_USER_ID
  ) {
    const targetUserId = content.split(" ")[1] || DEFAULT_TEST_USER_ID;

    try {
      const achievements = getUserAchievements(targetUserId);
      const stats = getUserStats(targetUserId);

      if (achievements.length === 0) {
        await message.reply(
          `❌ У пользователя \`${targetUserId}\` нет достижений`
        );
        return;
      }

      let achievementText =
        `🏆 **Достижения пользователя** \`${targetUserId}\`:\n` +
        `⭐ **Очки рейтинга:** ${stats?.rank_points || 0}\n\n`;

      achievements.forEach((ach) => {
        const achievement = ACHIEVEMENTS[ach.achievement_id];
        if (achievement) {
          const date = new Date(ach.unlocked_at).toLocaleDateString("ru-RU");
          achievementText += `• \`${ach.achievement_id}\` - ${achievement.name} (+${achievement.points}) - ${date}\n`;
        }
      });

      await message.reply(achievementText);
    } catch (error) {
      await message.reply("❌ Ошибка: " + error.message);
    }
    return;
  }

  // Команда для сброса всех достижений (для админа)
  if (
    content.startsWith(".!. resetachievements") &&
    message.author.id === ADMIN_USER_ID
  ) {
    const targetUserId = content.split(" ")[1] || DEFAULT_TEST_USER_ID;

    try {
      // Удаляем все достижения пользователя
      const stmt = db.prepare(
        "DELETE FROM user_achievements WHERE user_id = ?"
      );
      const result = stmt.run(targetUserId);

      // Обнуляем очки рейтинга
      const resetPointsStmt = db.prepare(
        "UPDATE user_stats SET rank_points = 0 WHERE user_id = ?"
      );
      resetPointsStmt.run(targetUserId);

      await message.reply(
        `✅ **Достижения сброшены для пользователя:** \`${targetUserId}\`\n` +
          `🗑️ Удалено достижений: **${result.changes}**\n` +
          `⭐ Очки рейтинга обнулены`
      );

      console.log(`🗑️ Сброшены достижения для пользователя ${targetUserId}`);

      sendTelegramReport(
        `🗑️ <b>Достижения сброшены администратором</b>\n` +
          `👤 Администратор: ${message.author.username}\n` +
          `🎯 Для пользователя ID: <code>${targetUserId}</code>\n` +
          `📊 Удалено достижений: ${result.changes}\n` +
          `📅 Время: ${formatTime(new Date())}`
      );
    } catch (error) {
      await message.reply("❌ Ошибка при сбросе достижений: " + error.message);
      console.error("Ошибка сброса достижений:", error);
    }
    return;
  }

  // Команда для сброса конкретного достижения (для админа)
  if (
    content.startsWith(".!. resetachievement") &&
    message.author.id === ADMIN_USER_ID
  ) {
    const parts = content.split(" ");
    const achievementId = parts[1];
    const targetUserId = parts[2] || DEFAULT_TEST_USER_ID;

    if (!achievementId) {
      await message.reply(
        `❌ Укажите ID достижения\nПример: \`.!. resetachievement first_join ${DEFAULT_TEST_USER_ID}\``
      );
      return;
    }

    // Проверяем, что ID достижения существует
    if (!ACHIEVEMENTS[achievementId]) {
      await message.reply(
        `❌ Достижение \`${achievementId}\` не существует!\n\n` +
          `📋 **Доступные достижения:**\n` +
          `${Object.keys(ACHIEVEMENTS)
            .filter((id) => id !== "best_admin")
            .map((id) => `• \`${id}\``)
            .join("\n")}\n\n` +
          `💡 **Правильное использование:**\n` +
          `\`.!. resetachievement ACHIEVEMENT_ID USER_ID\`\n` +
          `**Пример:** \`.!. resetachievement first_web_visit ${DEFAULT_TEST_USER_ID}\``
      );
      return;
    }

    if (
      content === ".!. checksettings" &&
      message.author.id === ADMIN_USER_ID
    ) {
      const targetUserId = content.split(" ")[1] || message.author.id;
      const stats = getUserStats(targetUserId);

      if (!stats) {
        await message.reply(
          `❌ Пользователь \`${targetUserId}\` не найден в статистике`
        );
        return;
      }

      await message.reply(
        `🔧 **Статистика настроек для** \`${targetUserId}\`:\n` +
          `⚙️ Изменений настроек: **${stats.settings_changes || 0}**\n` +
          `📩 ЛС уведомления: **${
            getUserDMSetting(targetUserId) ? "включены" : "отключены"
          }**\n` +
          `⏰ Таймер AFK: **${getUserTimeout(targetUserId)} минут**\n` +
          `🏆 До достижения "Исследователь": **${Math.max(
            0,
            20 - (stats.settings_changes || 0)
          )} изменений**`
      );
      return;
    }

    try {
      const stmt = db.prepare(
        "DELETE FROM user_achievements WHERE user_id = ? AND achievement_id = ?"
      );
      const result = stmt.run(targetUserId, achievementId);

      // Вычитаем очки за это достижение
      const achievement = ACHIEVEMENTS[achievementId];
      if (achievement && achievement.points > 0) {
        incrementUserStat(targetUserId, "rank_points", -achievement.points);
      }

      if (result.changes > 0) {
        await message.reply(
          `✅ **Достижение сброшено:**\n` +
            `🎯 Достижение: \`${achievementId}\`\n` +
            `👤 Пользователь: \`${targetUserId}\`\n` +
            `⭐ Очков вычтено: ${achievement?.points || 0}`
        );
      } else {
        await message.reply(
          `❌ Достижение \`${achievementId}\` не найдено у пользователя \`${targetUserId}\``
        );
      }
    } catch (error) {
      await message.reply("❌ Ошибка: " + error.message);
    }
    return;
  }

  // ДОБАВИТЬ ЭТУ КОМАНДУ (только для тестирования):
  if (content === ".!. checkspecial" && message.author.id === ADMIN_USER_ID) {
    await checkSpecialAchievement();
    await message.reply("✅ Проверка специального достижения выполнена");
    return;
  }
});

// ===== ЧАСТЬ 6: ОБРАБОТЧИКИ СОБЫТИЙ И ЗАПУСК БОТА =====

client.on("clientReady", () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
  console.log(`📝 AFK канал ID: ${AFK_CHANNEL_ID}`);
  console.log(`⏱️ Таймер неактивности по умолчанию: ${DEFAULT_TIMEOUT} минут`);
  console.log(`💾 База данных: afkbot.db`);
  console.log(`📱 Telegram отчеты: включены`);
  console.log(`🌐 Веб-панель: http://${SERVER_IP}:${PORT}`);

  sendTelegramReport(
    `🚀 <b>AFK Bot запущен</b>\n` +
      `📅 Время: ${formatTime(new Date())}\n` +
      `🤖 Бот: ${client.user.tag}\n` +
      `🌐 Веб-панель: http://${SERVER_IP}:${PORT}`
  );

  client.guilds.cache.forEach((guild) => {
    const afkChannel = guild.channels.cache.get(AFK_CHANNEL_ID);
    if (afkChannel) {
      console.log(
        `✅ AFK канал найден: ${afkChannel.name} в гильдии ${guild.name}`
      );
    } else {
      console.log(`❌ AFK канал не найден в гильдии ${guild.name}`);
    }
  });
  // Запускаем проверку специального достижения каждую минуту
  setInterval(checkSpecialAchievement, 60000);
  console.log("⏰ Запущена проверка специального достижения");

  // Проверяем пропущенные уведомления о достижениях при запуске (с задержкой)
  setTimeout(() => {
    console.log("🔍 Проверка пропущенных уведомлений о достижениях...");
    try {
      checkAndSendMissedAchievementNotifications();
      console.log("✅ Проверка завершена");
    } catch (error) {
      console.error("❌ Ошибка при проверке пропущенных уведомлений:", error);
    }
  }, 3000); // Задержка 3 секунды чтобы Discord полностью инициализировался

  // Также проверяем каждые 30 секунд (более частая проверка)
  setInterval(() => {
    try {
      checkAndSendMissedAchievementNotifications();
    } catch (error) {
      console.error(
        "❌ Ошибка при периодической проверке пропущенных уведомлений:",
        error
      );
    }
  }, 30000);
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const member = newState.member;
    const userId = member.id;
    const username = member.user.username;

    if (member.user.bot) return;

    // Инициализируем пользователя в статистике
    initUserStats(userId, username);

    // Проверяем выход из AFK канала и обновляем время в AFK
    if (
      oldState.channel?.id === AFK_CHANNEL_ID &&
      newState.channel?.id !== AFK_CHANNEL_ID
    ) {
      const afkStartTime = userAFKStartTimes.get(userId);
      if (afkStartTime) {
        const afkDuration = Math.floor((Date.now() - afkStartTime) / 1000);
        incrementUserStat(userId, "total_afk_time", afkDuration);
        userAFKStartTimes.delete(userId);

        // Проверяем достижения за время в AFK
        await checkAchievements(userId, username);
      }
    }

    // ===== ПОЛЬЗОВАТЕЛЬ ПРИСОЕДИНИЛСЯ К ГОЛОСОВОМУ КАНАЛУ =====
    if (!oldState.channel && newState.channel) {
      const joinTime = new Date();
      userJoinTimes.set(userId, joinTime.getTime());

      console.log(`🎤 ${username} присоединился к ${newState.channel.name}`);

      // Обновляем статистику
      incrementUserStat(userId, "total_sessions");

      // ✅ Проверяем если пользователь зашел сразу в AFK канал
      if (newState.channel.id === AFK_CHANNEL_ID) {
        // Это значит он зашел в AFK сам (без таймера)
        // Увеличиваем счетчик AFK перемещений
        incrementUserStat(userId, "total_afk_moves");

        // Записываем время начала AFK
        userAFKStartTimes.set(userId, Date.now());

        console.log(`😴 ${username} зашел в AFK канал сам`);
      }

      // Отслеживаем время в стрим-канале
      if (newState.channel.id === STREAM_CHANNEL_ID) {
        userStreamJoinTimes.set(userId, Date.now());
      }

      // Проверяем достижение "Первый шаг"
      const stats = getUserStats(userId);
      if (stats && stats.total_sessions === 1) {
        await checkAndUnlockAchievement(userId, username, "first_join");
      }

      await checkAchievements(userId, username);

      sendTelegramReport(
        `🎤 <b>Пользователь зашел в канал</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${newState.channel.name}\n` +
          `📅 Время захода: ${formatTime(joinTime)}`
      );

      if (newState.selfMute) {
        startInactivityTimer(member, newState.guild);
      }
      return;
    }

    // ===== ПОЛЬЗОВАТЕЛЬ ПОКИНУЛ ГОЛОСОВОЙ КАНАЛ =====
    if (oldState.channel && !newState.channel) {
      console.log(`👋 ${username} покинул голосовой канал`);

      // ✅ Проверяем если он был в AFK канале и добавляем AFK время
      if (oldState.channel.id === AFK_CHANNEL_ID) {
        const afkStartTime = userAFKStartTimes.get(userId);
        if (afkStartTime) {
          const afkDuration = Math.floor((Date.now() - afkStartTime) / 1000);
          incrementUserStat(userId, "total_afk_time", afkDuration);
          console.log(
            `⏱️ AFK время добавлено при выходе: ${formatDuration(afkDuration)}`
          );
        }
      }

      // Обновляем статистику времени в голосовых каналах
      const joinTime = userJoinTimes.get(userId);
      if (joinTime) {
        const sessionDuration = Math.floor((Date.now() - joinTime) / 1000);
        incrementUserStat(userId, "total_voice_time", sessionDuration);

        // Обновляем самую длинную сессию
        const currentStats = getUserStats(userId);
        if (
          currentStats &&
          sessionDuration > (currentStats.longest_session || 0)
        ) {
          updateUserStats(userId, "longest_session", sessionDuration);
          // Обновляем дату самой длинной сессии
          const stmt = db.prepare(`
            UPDATE user_stats SET longest_session_date = CURRENT_TIMESTAMP
            WHERE user_id = ?
          `);
          stmt.run(userId);
        }

        // Проверяем достижения
        await checkAchievements(userId, username);
      }

      // Обновляем время в стрим-канале
      const streamJoinTime = userStreamJoinTimes.get(userId);
      if (streamJoinTime && oldState.channel.id === STREAM_CHANNEL_ID) {
        const streamDuration = Math.floor((Date.now() - streamJoinTime) / 1000);
        incrementUserStat(userId, "stream_channel_time", streamDuration);
        userStreamJoinTimes.delete(userId);

        // Проверяем достижения стрим-канала
        await checkAchievements(userId, username);
      }

      sendTelegramReport(
        `👋 <b>Пользователь покинул канал</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${oldState.channel.name}\n` +
          `📅 Время: ${formatTime(new Date())}`
      );

      clearInactivityTimer(userId);
      userJoinTimes.delete(userId);
      userOriginalChannels.delete(userId);
      userAFKStartTimes.delete(userId);
      userStreamJoinTimes.delete(userId);
      return;
    }

    // ===== ПОЛЬЗОВАТЕЛЬ ПЕРЕМЕСТИЛСЯ ИЗ КАНАЛА В КАНАЛ =====
    if (
      oldState.channel &&
      newState.channel &&
      oldState.channel.id !== newState.channel.id
    ) {
      console.log(
        `🔄 ${username} переместился из ${oldState.channel.name} в ${newState.channel.name}`
      );

      // ✅ Учитываем AFK время при переходе ИЗ AFK в другой канал
      if (oldState.channel.id === AFK_CHANNEL_ID) {
        const afkStartTime = userAFKStartTimes.get(userId);
        if (afkStartTime) {
          const afkDuration = Math.floor((Date.now() - afkStartTime) / 1000);
          incrementUserStat(userId, "total_afk_time", afkDuration);
          userAFKStartTimes.delete(userId);
          console.log(
            `⏱️ AFK время добавлено при переходе: ${formatDuration(
              afkDuration
            )}`
          );
        }
      }

      // ✅ Если новый канал это AFK - начинаем отсчет
      if (newState.channel.id === AFK_CHANNEL_ID) {
        // Это значит он переместился в AFK сам (без таймера)
        incrementUserStat(userId, "total_afk_moves");
        userAFKStartTimes.set(userId, Date.now());
        console.log(`😴 ${username} переместился в AFK канал сам`);
      } else {
        // Если переходит в другой канал (не AFK), удаляем отсчет
        userAFKStartTimes.delete(userId);
      }

      sendTelegramReport(
        `🔄 <b>Пользователь переместился между каналами</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Из канала: ${oldState.channel.name}\n` +
          `📺 В канал: ${newState.channel.name}\n` +
          `📅 Время: ${formatTime(new Date())}`
      );

      // Обновляем время присоединения для нового канала
      userJoinTimes.set(userId, new Date().getTime());

      // Обрабатываем переход в/из стрим-канала
      const streamJoinTime = userStreamJoinTimes.get(userId);

      // Если покидает стрим-канал
      if (streamJoinTime && oldState.channel.id === STREAM_CHANNEL_ID) {
        const streamDuration = Math.floor((Date.now() - streamJoinTime) / 1000);
        incrementUserStat(userId, "stream_channel_time", streamDuration);
        userStreamJoinTimes.delete(userId);
        await checkAchievements(userId, username);
      }

      // Если заходит в стрим-канал
      if (newState.channel.id === STREAM_CHANNEL_ID) {
        userStreamJoinTimes.set(userId, Date.now());
      }

      if (newState.selfMute) {
        clearInactivityTimer(userId);
        startInactivityTimer(member, newState.guild);
      } else {
        clearInactivityTimer(userId);
      }
      return;
    }

    // ===== ПОЛЬЗОВАТЕЛЬ ОТКЛЮЧИЛ МИКРОФОН =====
    if (newState.selfMute && !oldState.selfMute) {
      const userTimeout = getUserTimeout(userId);
      const dmEnabled = getUserDMSetting(userId);

      // Формируем правильное отображение времени
      let timeoutDisplay;
      if (userTimeout < 15) {
        // Это секунды
        timeoutDisplay = userTimeout + " секунд";
      } else {
        // Это минуты
        timeoutDisplay = userTimeout + " минут";
      }

      console.log(`🎙️❌ ${username} отключил микрофон`);
      clearInactivityTimer(userId);
      startInactivityTimer(member, newState.guild);

      // Обновляем статистику
      incrementUserStat(userId, "total_mute_toggles");
      await checkAchievements(userId, username);

      sendTelegramReport(
        `🎙️❌ <b>Пользователь отключил микрофон</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${newState.channel.name}\n` +
          `⏱️ Запущен таймер на: ${timeoutDisplay}\n` +
          `📩 ЛС уведомления: ${dmEnabled ? "✅ включены" : "❌ отключены"}\n` +
          `📅 Время: ${formatTime(new Date())}`
      );

      if (dmEnabled) {
        await member
          .send(
            `🎙️❌ Похоже ты решил побыть AFK, раз отключил микрофон, через ${timeoutDisplay} ты окажешься в токсичном канале, подумай об этом\n\n💡 Чтобы отключить эти уведомления, напиши \`.!.\` на сервере`
          )
          .catch(() => {
            console.log(`❌ Не удалось отправить ЛС пользователю ${username}`);
          });
      }
      return;
    }

    // ===== ПОЛЬЗОВАТЕЛЬ ВКЛЮЧИЛ ТРАНСЛЯЦИЮ =====
    if (newState.streaming && !oldState.streaming) {
      console.log(`📡 ${username} включил трансляцию`);

      // Обновляем статистику
      incrementUserStat(userId, "total_streams");

      // Проверяем достижение "Первый стример"
      const streamStats = getUserStats(userId);
      if (streamStats && streamStats.total_streams === 1) {
        await checkAndUnlockAchievement(userId, username, "first_stream");
      }

      await checkAchievements(userId, username);

      sendTelegramReport(
        `📡 <b>Пользователь включил трансляцию</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${newState.channel.name}\n` +
          `📅 Время: ${formatTime(new Date())}`
      );

      return;
    }

    // ===== ПОЛЬЗОВАТЕЛЬ ОТКЛЮЧИЛ ТРАНСЛЯЦИЮ =====
    if (!newState.streaming && oldState.streaming) {
      console.log(`📡❌ ${username} отключил трансляцию`);

      sendTelegramReport(
        `📡❌ <b>Пользователь отключил трансляцию</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${newState.channel.name}\n` +
          `📅 Время: ${formatTime(new Date())}`
      );

      return;
    }

    // ===== ПОЛЬЗОВАТЕЛЬ ВКЛЮЧИЛ МИКРОФОН =====
    if (!newState.selfMute && oldState.selfMute) {
      console.log(`🎙️✅ ${username} включил микрофон`);
      clearInactivityTimer(userId);

      // Обновляем статистику
      incrementUserStat(userId, "total_mute_toggles");
      await checkAchievements(userId, username);

      sendTelegramReport(
        `🎙️✅ <b>Пользователь включил микрофон</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${newState.channel.name}\n` +
          `🛑 Таймер остановлен\n` +
          `📅 Время: ${formatTime(new Date())}`
      );

      const originalChannelId = userOriginalChannels.get(userId);
      if (originalChannelId && newState.channel?.id === AFK_CHANNEL_ID) {
        const originalChannel =
          newState.guild.channels.cache.get(originalChannelId);
        if (originalChannel?.type === 2) {
          await newState.setChannel(originalChannel);
          console.log(`✅ ${username} возвращен в ${originalChannel.name}`);

          sendTelegramReport(
            `↩️ <b>Пользователь возвращен из AFK</b>\n` +
              `👤 Пользователь: ${username}\n` +
              `📺 Из канала: 😡 Токсичный канал\n` +
              `📺 В канал: ${originalChannel.name}\n` +
              `📅 Время: ${formatTime(new Date())}`
          );

          userOriginalChannels.delete(userId);
        }
      }
      return;
    }

    if (newState.selfDeaf && !oldState.selfDeaf) {
      console.log(`🔇 ${username} приглушил себя`);
      return;
    }

    if (!newState.selfDeaf && oldState.selfDeaf) {
      console.log(`🔊 ${username} включил звук`);
      return;
    }
  } catch (error) {
    console.error("❌ Ошибка в voiceStateUpdate:", error);
  }
});

// ===== ФУНКЦИЯ: ЗАПУСК ТАЙМЕРА НЕАКТИВНОСТИ С ОТСЛЕЖИВАНИЕМ AFK ВРЕМЕНИ =====
function startInactivityTimer(member, guild) {
  const userId = member.id;
  const username = member.user.username;
  const userTimeout = getUserTimeout(userId);

  // Если значение меньше 15, то это секунды (админ опции: 10, 60), иначе минуты
  let timeoutMs;
  let timeoutDisplay;

  if (userTimeout < 15) {
    // Это секунды
    timeoutMs = userTimeout * 1000;
    timeoutDisplay = userTimeout + " секунд";
  } else {
    // Это минуты
    timeoutMs = userTimeout * 60 * 1000;
    timeoutDisplay = userTimeout + " минут";
  }
  console.log(`⏰ Таймер неактивности для ${username}: ${timeoutDisplay}`);
  console.log(`🔍 Поиск AFK канала с ID: ${AFK_CHANNEL_ID}`);

  const AFK_CHANNEL = guild.channels.cache.get(AFK_CHANNEL_ID);

  if (!AFK_CHANNEL) {
    console.error(`❌ AFK канал с ID ${AFK_CHANNEL_ID} не найден`);
    return;
  }

  if (AFK_CHANNEL.type !== 2) {
    console.error(`❌ Канал ${AFK_CHANNEL.name} не является голосовым каналом`);
    return;
  }

  console.log(`✅ AFK канал найден: ${AFK_CHANNEL.name}`);
  clearInactivityTimer(userId);

  const timeoutId = setTimeout(async () => {
    try {
      console.log(
        `⏳ Проверяем пользователя ${username} (ID: ${userId}) через ${timeoutDisplay}`
      );
      const currentMember = guild.members.cache.get(userId);

      if (currentMember && currentMember.voice.channel) {
        console.log(
          `🎤 ${username} все еще в канале: ${currentMember.voice.channel.name}`
        );
        console.log(`🎙️ selfMute: ${currentMember.voice.selfMute}`);

        if (!currentMember.voice.selfMute) {
          console.log(
            `🎙️ ${username} включил микрофон или микрофон не отключен, отменяем перемещение в AFK`
          );
          return;
        }

        const originalChannelName = currentMember.voice.channel.name;
        userOriginalChannels.set(userId, currentMember.voice.channel.id);

        // Записываем время начала AFK
        userAFKStartTimes.set(userId, Date.now());

        await currentMember.voice.setChannel(AFK_CHANNEL);

        // Обновляем статистику AFK перемещений
        incrementUserStat(userId, "total_afk_moves");

        // Проверяем достижение "Первый сон" и другие AFK достижения
        const stats = getUserStats(userId);
        if (stats && stats.total_afk_moves === 1) {
          await checkAndUnlockAchievement(userId, username, "first_afk");
        }

        await checkAchievements(userId, username);

        console.log(
          `⏰ ${username} переемещен в AFK за неактивность (${timeoutDisplay})`
        );

        const dmEnabled = getUserDMSetting(userId);
        sendTelegramReport(
          `⏰ <b>Пользователь перемещен в AFK</b>\n` +
            `👤 Пользователь: ${username}\n` +
            `🆔 ID: <code>${userId}</code>\n` +
            `📺 Из канала: ${originalChannelName}\n` +
            `📺 В канал: ${AFK_CHANNEL.name}\n` +
            `⏱️ Неактивен: ${timeoutDisplay}\n` +
            `📩 ЛС уведомления: ${
              dmEnabled ? "✅ включены" : "❌ отключены"
            }\n` +
            `📅 Время: ${formatTime(new Date())}`
        );

        if (dmEnabled) {
          await currentMember
            .send(
              `⏰ Ты был неактивен ${timeoutDisplay}, малютка, и был перемещен откисать в токсичный канал.\n\n💡 Чтобы изменить настройки, напиши \`.!.\` на сервере`
            )
            .catch(() => {});
        }
      } else {
        console.log(
          `❌ ${username} не найден в голосовых каналах или покинул канал`
        );
      }
    } catch (error) {
      console.error("❌ Ошибка при перемещении в AFK:", error);
    }
  }, timeoutMs);

  userInactivityTimers.set(userId, timeoutId);
  console.log(`⏱️ Таймер запущен для ${username} (${userTimeout} минут)`);
}

function clearInactivityTimer(userId) {
  const timeoutId = userInactivityTimers.get(userId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    userInactivityTimers.delete(userId);
    const member = client.users.cache.get(userId);
    const username = member ? member.username : userId;
    console.log(`🛑 Таймер остановлен для пользователя ${username}`);
  }
}

// ===== ОБРАБОТЧИКИ ОШИБОК И ЗАВЕРШЕНИЯ =====
process.on("SIGINT", () => {
  console.log("🛑 Закрытие базы данных...");
  sendTelegramReport(
    `🛑 <b>AFK Bot остановлен</b>\n📅 Время: ${formatTime(new Date())}`
  );
  db.close();
  process.exit(0);
});

client.on("error", (error) => console.error("❌ Client error:", error));
process.on("unhandledRejection", (error) =>
  console.error("❌ Unhandled rejection:", error)
);

// ===== ЗАПУСК БОТА =====
client.login(process.env.DISCORD_TOKEN);
