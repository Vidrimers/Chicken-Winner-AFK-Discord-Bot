import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import Database from "better-sqlite3";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import http from "http";
import {
  sendTelegramReport,
  sendAchievementNotification,
  sendSpecialAchievementNotification,
  sendSettingsChangeNotification,
  sendAchievementDeleteNotification,
  sendUserDeleteNotification,
  sendUnauthorizedAccessNotification,
  sendBotStatusNotification,
  sendNotOnServerAttempt,
  sendProfileViewNotification,
  initTelegramBot,
  registerTelegramUser,
  sendTelegramMessageToUser,
} from "./telegram.js";
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
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
    achievement_notifications BOOLEAN DEFAULT 1,
    theme TEXT DEFAULT 'standard'
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

db.exec(`
  CREATE TABLE IF NOT EXISTS telegram_users (
    user_id TEXT PRIMARY KEY,
    telegram_chat_id TEXT,
    started_bot BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS telegram_link_codes (
    code TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0
  )
`);

// Добавляем колонки, если их нет (обратная совместимость)
try {
  db.exec(`ALTER TABLE user_stats ADD COLUMN total_afk_time INTEGER DEFAULT 0`);
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE user_stats ADD COLUMN settings_changes INTEGER DEFAULT 0`,
  );
} catch (error) {}

try {
  db.exec(`ALTER TABLE user_stats ADD COLUMN messages_sent INTEGER DEFAULT 0`);
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE user_stats ADD COLUMN mentions_responded INTEGER DEFAULT 0`,
  );
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE user_stats ADD COLUMN stream_channel_time INTEGER DEFAULT 0`,
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
  db.exec(`ALTER TABLE user_stats ADD COLUMN avatar_url TEXT`);
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
    "ℹ️ Миграция longest_session_date уже выполнена или таблица voice_sessions пуста",
  );
}

try {
  db.exec(
    `ALTER TABLE user_settings ADD COLUMN achievement_notifications BOOLEAN DEFAULT 1`,
  );
} catch (error) {}

try {
  db.exec(`ALTER TABLE user_settings ADD COLUMN theme TEXT DEFAULT 'standard'`);
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE user_settings ADD COLUMN secret_theme_activated BOOLEAN DEFAULT 0`,
  );
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE user_settings ADD COLUMN channel_notifications BOOLEAN DEFAULT 0`,
  );
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE achievements ADD COLUMN notifications_sent BOOLEAN DEFAULT 0`,
  );
} catch (error) {}

try {
  db.exec(
    `ALTER TABLE user_achievements ADD COLUMN manually_deleted BOOLEAN DEFAULT 0`,
  );
} catch (error) {}

const AFK_CHANNEL_ID = process.env.AFK_CHANNEL_ID;
const DEFAULT_TIMEOUT = 15;
const STREAM_CHANNEL_ID = process.env.STREAM_CHANNEL_ID;
const ACHIEVEMENTS_CHANNEL_ID = process.env.ACHIEVEMENTS_CHANNEL_ID;
const SPECIAL_USER_ID = process.env.SPECIAL_USER_ID;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const DEFAULT_TEST_USER_ID = process.env.DEFAULT_TEST_USER_ID;

// Хранилище для отслеживания (временные данные)
const userInactivityTimers = new Map();
const userOriginalChannels = new Map();
const userJoinTimes = new Map();
const userAFKStartTimes = new Map();
const userStreamJoinTimes = new Map();
const achievementTimers = new Map(); // Хранилище таймеров для запланированных достижений

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
    `,
      )
      .all(nowMoscowISO);

    console.log(
      `🎯 Найдено достижений для отправки уведомлений: ${missedAchievements.length}`,
    );

    if (missedAchievements.length === 0) {
      console.log("✅ Нет пропущенных уведомлений о достижениях");
      return;
    }

    console.log(
      `⏰ Найдено ${missedAchievements.length} пропущенных уведомлений о достижениях`,
    );

    for (const achievement of missedAchievements) {
      try {
        console.log(
          `📤 Обработка достижения: ${achievement.name} для пользователя ${achievement.user_id}`,
        );

        const user = await client.users
          .fetch(achievement.user_id)
          .catch((err) => {
            console.log(
              `⚠️ Не удалось получить пользователя ${achievement.user_id}: ${err.message}`,
            );
            return null;
          });
        const username = user ? user.username : "Пользователь";

        // Отправляем ЛС пользователю
        if (user) {
          try {
            const dmMessage =
              `\n\n🏆 **Новое специальное достижение!**\n\n` +
              `${achievement.emoji} **${achievement.name}**\n` +
              `${achievement.description}\n\n` +
              `🌐 Посмотреть в веб-панели: http://${SERVER_IP}:${PORT}/?userId=${achievement.user_id}&autoLogin=true`;

            await user.send(dmMessage);
            console.log(
              `✅ ЛС отправлено пользователю ${username} за достижение "${achievement.name}"`,
            );
          } catch (dmError) {
            console.log(
              `❌ Не удалось отправить ЛС пользователю ${achievement.user_id}: ${dmError.message}`,
            );
          }
        } else {
          console.log(
            `⚠️ Пользователь ${achievement.user_id} не найден в Discord`,
          );
        }

        // Отправляем в канал Discord
        try {
          const channel = client.channels.cache.get(ACHIEVEMENTS_CHANNEL_ID);
          if (channel) {
            const channelMessage =
              `\n\n🏆 **Новое специальное достижение!**\n\n` +
              `👤 **Пользователь:** <@${achievement.user_id}>\n` +
              `🎯 **Достижение:** ${achievement.emoji} ${achievement.name}\n` +
              `📝 **Описание:** ${achievement.description}\n` +
              `📅 **Время:** ${formatTime(new Date())}\n\n` +
              `🌐 **Посмотреть в веб-панели:** http://${SERVER_IP}:${PORT}`;

            await channel.send(channelMessage);
            console.log(
              `✅ Сообщение в канал отправлено за достижение "${achievement.name}"`,
            );
          } else {
            console.log(
              `⚠️ Канал достижений (${ACHIEVEMENTS_CHANNEL_ID}) не найден`,
            );
          }
        } catch (channelError) {
          console.log(
            `❌ Не удалось отправить уведомление в канал: ${channelError.message}`,
          );
        }

        // Отправляем в Telegram
        try {
          await sendSpecialAchievementNotification(
            username,
            achievement.emoji,
            achievement.name,
            achievement.description,
            achievement.color,
            achievement.special_date,
          );
          console.log(
            `✅ Telegram уведомление отправлено за достижение "${achievement.name}"`,
          );
        } catch (telegramError) {
          console.log(
            `⚠️ Ошибка при отправке в Telegram: ${telegramError.message}`,
          );
        }

        // Отмечаем что уведомления отправлены
        try {
          db.prepare(
            `UPDATE achievements SET notifications_sent = 1 WHERE achievement_id = ?`,
          ).run(achievement.achievement_id);
          console.log(
            `✅ Флаг notifications_sent установлен для ${achievement.achievement_id}`,
          );
        } catch (updateErr) {
          console.error(
            "❌ Ошибка при обновлении флага notifications_sent:",
            updateErr,
          );
        }
      } catch (notificationError) {
        console.error(
          `❌ Ошибка при отправке пропущенного уведомления:`,
          notificationError,
        );
      }
    }

    console.log("✅ Завершена проверка пропущенных уведомлений о достижениях");
  } catch (error) {
    console.error(
      "❌ Критическая ошибка при проверке пропущенных уведомлений:",
      error,
    );
  }
}

// Telegram функции импортированы из telegram.js

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
    "SELECT dm_notifications FROM user_settings WHERE user_id = ?",
  );
  const result = stmt.get(userId);
  return result ? Boolean(result.dm_notifications) : true;
};

const getUserTimeout = (userId) => {
  const stmt = db.prepare(
    "SELECT afk_timeout FROM user_settings WHERE user_id = ?",
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
    "SELECT achievement_notifications FROM user_settings WHERE user_id = ?",
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

// Функция для получения темы пользователя
const getUserTheme = (userId) => {
  const stmt = db.prepare("SELECT theme FROM user_settings WHERE user_id = ?");
  const result = stmt.get(userId);
  return result && result.theme ? result.theme : "standard";
};

// Функция для получения флага активации секретной темы
const getSecretThemeActivated = (userId) => {
  const stmt = db.prepare(
    "SELECT secret_theme_activated FROM user_settings WHERE user_id = ?",
  );
  const result = stmt.get(userId);
  return result ? Boolean(result.secret_theme_activated) : false;
};

// Функция для получения настроек уведомлений канала
const getUserChannelNotificationSetting = (userId) => {
  const stmt = db.prepare(
    "SELECT channel_notifications FROM user_settings WHERE user_id = ?",
  );
  const result = stmt.get(userId);
  return result ? Boolean(result.channel_notifications) : false;
};

// Функция для установки настроек уведомлений канала
const setUserChannelNotificationSetting = (userId, value) => {
  console.log(
    `🔧 setUserChannelNotificationSetting вызвана для userId ${userId} со значением:`,
    value,
    typeof value,
  );
  const numValue = value ? 1 : 0;
  console.log(`🔧 Преобразовано в число:`, numValue);

  db.prepare(
    `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications, theme, secret_theme_activated, channel_notifications) 
       VALUES (?, 
               COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), 
               COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
               COALESCE((SELECT achievement_notifications FROM user_settings WHERE user_id = ?), 1),
               COALESCE((SELECT theme FROM user_settings WHERE user_id = ?), 'standard'),
               COALESCE((SELECT secret_theme_activated FROM user_settings WHERE user_id = ?), 0),
               ?)`,
  ).run(userId, userId, userId, userId, userId, userId, numValue);

  // Проверяем что сохранилось
  const saved = getUserChannelNotificationSetting(userId);
  console.log(`✅ После сохранения в БД значение:`, saved, typeof saved);
};

// Функция для проверки, нажал ли пользователь /start в Telegram боте
const hasUserStartedTelegramBot = (userId) => {
  const stmt = db.prepare(
    "SELECT started_bot FROM telegram_users WHERE user_id = ?",
  );
  const result = stmt.get(userId);
  return result ? Boolean(result.started_bot) : false;
};

// Функция для получения Telegram chat ID по Discord ID
const getTelegramChatId = (userId) => {
  const stmt = db.prepare(
    "SELECT telegram_chat_id FROM telegram_users WHERE user_id = ? AND started_bot = 1",
  );
  const result = stmt.get(userId);
  return result ? result.telegram_chat_id : null;
};

// Генерация 6-значного кода для связывания аккаунтов
const generateLinkCode = (userId) => {
  // Удаляем старые неиспользованные коды пользователя
  db.prepare(
    "DELETE FROM telegram_link_codes WHERE user_id = ? AND used = 0",
  ).run(userId);

  // Генерируем уникальный 6-значный код
  let code;
  let attempts = 0;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    attempts++;
    if (attempts > 100) {
      throw new Error("Не удалось сгенерировать уникальный код");
    }
  } while (
    db.prepare("SELECT code FROM telegram_link_codes WHERE code = ?").get(code)
  );

  // Код действителен 15 минут
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(
    "INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(code, userId, expiresAt);

  return code;
};

// Проверка и использование кода для связывания
const useLinkCode = (code, telegramChatId) => {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      "SELECT user_id, expires_at, used FROM telegram_link_codes WHERE code = ?",
    )
    .get(code);

  if (!result) {
    return { success: false, error: "Код не найден" };
  }

  if (result.used) {
    return { success: false, error: "Код уже использован" };
  }

  if (result.expires_at < now) {
    return { success: false, error: "Код истёк" };
  }

  // Помечаем код как использованный
  db.prepare("UPDATE telegram_link_codes SET used = 1 WHERE code = ?").run(
    code,
  );

  // Создаём или обновляем связь с Telegram
  db.prepare(
    `INSERT OR REPLACE INTO telegram_users (user_id, telegram_chat_id, started_bot, created_at) 
     VALUES (?, ?, 1, COALESCE((SELECT created_at FROM telegram_users WHERE user_id = ?), CURRENT_TIMESTAMP))`,
  ).run(result.user_id, telegramChatId, result.user_id);

  return { success: true, userId: result.user_id };
};

// Проверка статуса связи с Telegram
const getTelegramLinkStatus = (userId) => {
  const result = db
    .prepare(
      "SELECT telegram_chat_id, started_bot, created_at FROM telegram_users WHERE user_id = ?",
    )
    .get(userId);

  if (!result || !result.started_bot) {
    return { linked: false };
  }

  return {
    linked: true,
    telegramChatId: result.telegram_chat_id,
    linkedAt: result.created_at,
  };
};

// Функция для отправки уведомлений всем пользователям с включенной настройкой
async function notifyChannelActivity(message) {
  try {
    // Получаем всех пользователей с включенными уведомлениями
    const usersWithNotifications = db
      .prepare(
        `
      SELECT us.user_id, tu.telegram_chat_id 
      FROM user_settings us
      JOIN telegram_users tu ON us.user_id = tu.user_id
      WHERE us.channel_notifications = 1 AND tu.started_bot = 1
    `,
      )
      .all();

    console.log(
      `📢 Отправка уведомлений ${usersWithNotifications.length} пользователям`,
    );

    for (const user of usersWithNotifications) {
      await sendTelegramMessageToUser(user.telegram_chat_id, message);
    }
  } catch (error) {
    console.error(`❌ Ошибка отправки уведомлений о канале: ${error.message}`);
  }
}

// ===== ФУНКЦИЯ СКАЧИВАНИЯ АВАТАРКИ =====
const downloadAvatar = async (userId, avatarUrl) => {
  try {
    if (
      !avatarUrl ||
      avatarUrl.includes("nopic.png") ||
      avatarUrl.startsWith("/avatars/")
    ) {
      return "/avatars/nopic.png";
    }

    const fs = await import("fs");
    const path = await import("path");
    const https = await import("https");

    const avatarsDir = "./avatars";
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    const fileName = `${userId}.png`;
    const filePath = path.join(avatarsDir, fileName);

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);
      const request = https.get(avatarUrl, { timeout: 5000 }, (response) => {
        if (response.statusCode !== 200) {
          fs.unlink(filePath, () => {});
          resolve("/avatars/nopic.png");
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(`/avatars/${fileName}`);
        });
      });

      request.on("error", (err) => {
        fs.unlink(filePath, () => {});
        console.error(
          `❌ Ошибка загрузки аватарки для ${userId}:`,
          err.message,
        );
        resolve("/avatars/nopic.png");
      });

      request.on("timeout", () => {
        request.destroy();
        fs.unlink(filePath, () => {});
        console.error(`⏱️ Таймаут загрузки аватарки для ${userId}`);
        resolve("/avatars/nopic.png");
      });
    });
  } catch (error) {
    console.error(
      `❌ Ошибка при скачивании аватарки для ${userId}:`,
      error.message,
    );
    return "/avatars/nopic.png";
  }
};

// ===== ФУНКЦИИ СТАТИСТИКИ =====
const initUserStats = (userId, username, avatarUrl = null) => {
  // Проверяем, существует ли уже пользователь
  const existingStmt = db.prepare(
    "SELECT username, avatar_url FROM user_stats WHERE user_id = ?",
  );
  const existing = existingStmt.get(userId);

  if (existing) {
    // Пользователь уже существует
    // Обновляем имя если оно было "Web User"
    if (
      existing.username === "Web User" &&
      username &&
      username !== "Web User"
    ) {
      const updateStmt = db.prepare(
        "UPDATE user_stats SET username = ? WHERE user_id = ?",
      );
      updateStmt.run(username, userId);
    }

    // Обновляем аватарку если передана (для случая когда была nopic.png)
    if (avatarUrl && avatarUrl !== "/avatars/nopic.png") {
      const updateStmt = db.prepare(
        "UPDATE user_stats SET avatar_url = ? WHERE user_id = ?",
      );
      updateStmt.run(avatarUrl, userId);
    }
  } else {
    // Новый пользователь - создаем запись с аватаркой
    const stmt = db.prepare(`
      INSERT INTO user_stats (user_id, username, avatar_url) 
      VALUES (?, ?, ?)
    `);
    stmt.run(userId, username, avatarUrl || "/avatars/nopic.png");
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
      `⏭️ Достижение ${achievementId} уже есть у пользователя ${username}`,
    );
    return false;
  }

  console.log(
    `✅ Добавляем новое достижение ${achievementId} пользователю ${username}`,
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
    `,
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
    achievement ? "✅ НАЙДЕНО" : "❌ НЕ НАЙДЕНО",
  );

  if (achievement) {
    console.log(
      `📤 Отправляем уведомления для достижения: ${achievement.name}`,
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
      }, Уведомления: ${achievementNotificationsEnabled}`,
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
            `🌐 Веб-панель: http://${SERVER_IP}:${PORT}/?userId=${userId}&autoLogin=true`,
        );
        console.log(`✅ ЛС отправлено пользователю ${username}`);
      } catch (error) {
        console.log(
          `❌ Не удалось отправить уведомление о достижении пользователю ${username}: ${error.message}`,
        );
      }
    }

    // Отправляем в Telegram
    await sendAchievementNotification(
      username,
      achievement.name,
      achievement.description,
      achievement.points,
    );
    console.log(`✅ Telegram отправлен`);

    // Отправляем уведомление в канал Discord
    try {
      const channel = client.channels.cache.get(ACHIEVEMENTS_CHANNEL_ID);
      console.log(
        `📢 Канал достижений: ${channel ? channel.name : "НЕ НАЙДЕН"}`,
      );
      if (channel) {
        const discordText =
          `🏆 **Новое достижение!**\n\n` +
          `👤 **Пользователь:** <@${userId}>\n` +
          `🎯 **Достижение:** ${achievement.name}\n` +
          `📝 **Описание:** ${achievement.description}\n` +
          `⭐ **Очки:** +${achievement.points}\n` +
          `📅 **Время:** ${formatTime(new Date())}`;

        await channel.send(discordText);
        console.log(`✅ Сообщение в канал отправлено`);
      }
    } catch (error) {
      console.log(
        `❌ Не удалось отправить уведомление о достижении в канал: ${error.message}`,
      );
    }

    return true;
  } else {
    console.log(`❌ Достижение ${achievementId} не найдено в ACHIEVEMENTS!`);
  }
  return false;
};

const getUserAchievements = (userId) => {
  // Получаем обычные достижения из user_achievements (исключаем удаленные и специальные)
  const stmt = db.prepare(`
    SELECT ua.*, ua.unlocked_at, NULL as emoji, NULL as name, NULL as description, NULL as color, NULL as type
    FROM user_achievements ua
    LEFT JOIN achievements a ON ua.achievement_id = a.achievement_id
    WHERE ua.user_id = ? 
      AND (ua.manually_deleted = 0 OR ua.manually_deleted IS NULL)
      AND (a.type IS NULL OR a.type != 'special')
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
            "🎉 Поздравляем! Ты стал лучшим администратором канала! С днем рождения, малютка 👑",
          );

          console.log(
            `🎉 Специальное достижение "Лучший админ" выдано пользователю ${specialUserId}`,
          );

          // Отправляем в Telegram
          await sendTelegramReport(
            `👑 <b>Специальное достижение выдано!</b>\n` +
              `🎯 Достижение: Лучший админ\n` +
              `👤 Пользователь ID: <code>${specialUserId}</code>\n` +
              `🎂 Поздравление с днем рождения отправлено!\n` +
              `📅 Время: ${formatTime(new Date())}`,
          );

          // Отправляем уведомление в канал Discord
          try {
            const channel = client.channels.cache.get(ACHIEVEMENTS_CHANNEL_ID);
            if (channel) {
              await channel.send(
                `🏆 **Новое специальное достижение!**\n\n` +
                  `👤 **Пользователь:** <@${specialUserId}> (Лучший админ)\n` +
                  `🎯 **Достижение:** 👑 Kakashech - Лучший админ\n` +
                  `📝 **Описание:** Лучший admin_ebaniy канала\n` +
                  `📅 **Время:** ${formatTime(new Date())}\n` +
                  `🎂  **Поздравляем малютку с днем рождения**\n\n` +
                  `🌐 **Посмотреть это достижение можно в веб-панели:** http://${SERVER_IP}:${PORT}`,
              );
            }
          } catch (channelError) {
            console.log(
              `Не удалось отправить уведомление о достижении best_admin в канал: ${channelError.message}`,
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
    `sessionId=${sessionId}; Path=/; Max-Age=86400; SameSite=Strict`,
  );
  return sessionId;
}

function clearSession(res, req) {
  const sessionId = req.headers.cookie?.split("sessionId=")[1]?.split(";")[0];
  if (sessionId) sessions.delete(sessionId);
  res.setHeader("Set-Cookie", `sessionId=; Path=/; Max-Age=0`);
}

app.use(express.static(path.join(__dirname, "public")));
app.use("/avatars", express.static(path.join(__dirname, "avatars")));
app.use(express.json());

// API маршруты
app.get("/api/stats/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    let stats = getUserStats(userId);

    // Если пользователя нет в БД, создаем его с аватаркой
    if (!stats) {
      console.log(
        `📝 Новый пользователь ${userId} зашел на сайт, создаем запись...`,
      );

      try {
        const guild = client.guilds.cache.first();
        if (guild) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            const username = member.displayName || member.user.username;
            const discordAvatarUrl = member.user.displayAvatarURL({
              format: "png",
              size: 128,
            });
            const localAvatarPath = await downloadAvatar(
              userId,
              discordAvatarUrl,
            );

            // Создаем пользователя
            initUserStats(userId, username, localAvatarPath);

            // Получаем созданную статистику
            stats = getUserStats(userId);
            console.log(
              `✅ Создан пользователь ${username} (${userId}) с аватаркой`,
            );
          } else {
            // Пользователь не найден на сервере Discord
            console.log(
              `⚠️ Пользователь ${userId} не найден на сервере Discord`,
            );

            // Отправляем уведомление в Telegram
            await sendNotOnServerAttempt(
              userId,
              new Date().toLocaleString("ru-RU"),
            );

            return res.json({
              notOnServer: true,
              message: "Пользователь не найден на Discord сервере",
            });
          }
        } else {
          // Гильдия не найдена
          initUserStats(userId, "Web User", "/avatars/nopic.png");
          stats = getUserStats(userId);
        }
      } catch (error) {
        console.error(`❌ Ошибка при создании пользователя ${userId}:`, error);
        initUserStats(userId, "Web User", "/avatars/nopic.png");
        stats = getUserStats(userId);
      }
    }

    const achievements = getUserAchievements(userId);

    const settings = {
      dmNotifications: getUserDMSetting(userId),
      afkTimeout: getUserTimeout(userId),
      achievementNotifications: getUserAchievementNotificationSetting(userId),
      theme: getUserTheme(userId),
      secretThemeActivated: getSecretThemeActivated(userId),
      channelNotifications: getUserChannelNotificationSetting(userId),
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

// API endpoint для получения онлайн статусов пользователей
app.get("/api/online-status", (req, res) => {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) {
      return res.json({});
    }

    const onlineStatuses = {};
    guild.members.cache.forEach((member) => {
      if (member.presence?.status && member.presence.status !== "offline") {
        onlineStatuses[member.id] = member.presence.status; // online, idle, dnd
      }
    });

    res.json(onlineStatuses);
  } catch (error) {
    console.error("❌ Ошибка при получении онлайн статусов:", error);
    res.json({});
  }
});

// API endpoint для уведомления админа о просмотре профиля
app.post("/api/notify/profile-view", express.json(), async (req, res) => {
  try {
    const { viewerId, viewerUsername, targetUserId, targetUsername } = req.body;

    // Проверяем, что это не просмотр своего профиля
    if (viewerId === targetUserId) {
      return res.json({ success: true });
    }

    // Отправляем уведомление админу в Telegram
    try {
      await sendProfileViewNotification(
        viewerUsername,
        viewerId,
        targetUsername,
        targetUserId,
      );
      console.log(
        `📬 Telegram уведомление админу о просмотре профиля: ${viewerUsername} → ${targetUsername}`,
      );
    } catch (telegramError) {
      console.error("❌ Ошибка отправки Telegram уведомления:", telegramError);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Ошибка в API /api/notify/profile-view:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API endpoint для получения всех пользователей (для админа)
app.get("/api/admin/users", (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT user_id, username, total_sessions, total_voice_time, rank_points
      FROM user_stats
      ORDER BY username ASC
    `);
    const users = stmt.all();
    res.json(users);
  } catch (error) {
    console.error("❌ Ошибка при получении пользователей:", error);
    res.status(500).json({ error: "Ошибка при получении пользователей" });
  }
});

// API endpoint для получения всех специальных достижений
app.get("/api/special-achievements", (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT DISTINCT a.achievement_id, a.emoji, a.name, a.description, a.type, a.color, a.special_date, a.user_id, ua.unlocked_at
      FROM achievements a
      LEFT JOIN user_achievements ua ON a.achievement_id = ua.achievement_id AND a.user_id = ua.user_id
      WHERE a.type = 'special'
      ORDER BY a.created_at DESC
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
  const {
    dmNotifications,
    afkTimeout,
    achievementNotifications,
    theme,
    channelNotifications,
  } = req.body;

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

    // Сохраняем тему
    if (theme !== undefined) {
      db.prepare("UPDATE user_settings SET theme = ? WHERE user_id = ?").run(
        theme,
        userId,
      );
      settingsChanged = true;
    }

    // Проверяем настройки уведомлений о канале
    if (channelNotifications !== undefined) {
      console.log(
        `📊 Получено значение channelNotifications:`,
        channelNotifications,
        typeof channelNotifications,
      );

      const currentChannelNotifications =
        getUserChannelNotificationSetting(userId);

      console.log(
        `📊 Текущее значение в БД:`,
        currentChannelNotifications,
        typeof currentChannelNotifications,
      );

      // Сохраняем настройку независимо от того, нажал ли пользователь /start
      // Уведомления просто не будут приходить, пока не нажмет /start
      if (channelNotifications !== currentChannelNotifications) {
        console.log(`💾 Сохраняем новое значение:`, channelNotifications);
        setUserChannelNotificationSetting(userId, channelNotifications);
        settingsChanged = true;
      } else {
        console.log(`⏭️ Значение не изменилось, пропускаем сохранение`);
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

        // Получаем название темы
        const themeValue = theme !== undefined ? theme : getUserTheme(userId);
        const themeNames = {
          standard: "🎨 Стандарт",
          metal: "⚙️ Металл",
          discord: "💬 Дискорд",
          steam: "🎮 Стим",
        };
        const themeDisplay = themeNames[themeValue] || themeValue;

        const channelStatus =
          channelNotifications !== undefined
            ? channelNotifications
              ? "✅ включены"
              : "❌ отключены"
            : getUserChannelNotificationSetting(userId)
              ? "✅ включены"
              : "❌ отключены";

        const settingsText =
          `📩 ЛС уведомления: ${dmStatus}\n` +
          `⏱️ Таймер AFK: ${timeoutDisplay}\n` +
          `🏆 Уведомления о достижениях: ${achievementStatus}\n` +
          `🔔 Уведомления "Кто в канале": ${channelStatus}\n` +
          `🎨 Тема оформления: ${themeDisplay}`;

        await sendSettingsChangeNotification(username, userId, settingsText);
      } catch (error) {
        console.error(
          "Ошибка при проверке достижений через веб-панель:",
          error,
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка при сохранении настроек:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API для активации секретной темы
app.post("/api/activate-secret-theme/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    // Проверяем активирована ли уже тема
    const stmt = db.prepare(
      "SELECT secret_theme_activated FROM user_settings WHERE user_id = ?",
    );
    const settings = stmt.get(userId);

    if (settings && settings.secret_theme_activated) {
      return res.json({ success: true, alreadyActivated: true });
    }

    // Активируем секретную тему
    db.prepare(
      `INSERT OR REPLACE INTO user_settings (user_id, dm_notifications, afk_timeout, achievement_notifications, theme, secret_theme_activated) 
       VALUES (?, 
               COALESCE((SELECT dm_notifications FROM user_settings WHERE user_id = ?), 1), 
               COALESCE((SELECT afk_timeout FROM user_settings WHERE user_id = ?), 15),
               COALESCE((SELECT achievement_notifications FROM user_settings WHERE user_id = ?), 1),
               'die-my-darling',
               1)`,
    ).run(userId, userId, userId, userId);

    console.log(`🥀 Секретная тема активирована для пользователя ${userId}`);

    // Создаем специальное достижение
    const achievementId = `secret-theme-${userId}-${Date.now()}`;
    const nowMoscowISO = getMoscowNowISO();

    try {
      // Добавляем достижение в таблицу achievements
      db.prepare(
        `INSERT INTO achievements (achievement_id, user_id, emoji, name, description, type, color, special_date, notifications_sent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        achievementId,
        userId,
        "🥀",
        "Die my Darling",
        "Открыл секретную тему",
        "special",
        "#8b0000",
        nowMoscowISO,
        1,
      );

      // Добавляем в user_achievements
      db.prepare(
        `INSERT INTO user_achievements (user_id, achievement_id, unlocked_at, manually_deleted)
         VALUES (?, ?, ?, ?)`,
      ).run(userId, achievementId, nowMoscowISO, 0);

      console.log(
        `🏆 Достижение "Die my Darling" выдано пользователю ${userId}`,
      );

      // Отправляем уведомление пользователю
      const user = await client.users.fetch(userId).catch(() => null);
      const username = user ? user.username : "Пользователь";

      if (user) {
        try {
          const dmMessage =
            `\n\n🏆 **Новое специальное достижение!**\n\n` +
            `🥀 **Die my Darling**\n` +
            `Открыл секретную тему\n\n` +
            `🌐 Посмотреть в веб-панели: http://${SERVER_IP}:${PORT}/?userId=${userId}&autoLogin=true`;

          await user.send(dmMessage);
          console.log(`✅ ЛС отправлено пользователю ${username}`);
        } catch (dmError) {
          console.log(
            `❌ Не удалось отправить ЛС пользователю ${userId}: ${dmError.message}`,
          );
        }
      }

      // Отправляем в канал Discord
      try {
        const channel = client.channels.cache.get(ACHIEVEMENTS_CHANNEL_ID);
        if (channel) {
          const channelMessage =
            `\n\n🏆 **Новое специальное достижение!**\n\n` +
            `👤 **Пользователь:** <@${userId}>\n` +
            `🎯 **Достижение:** 🥀 Die my Darling\n` +
            `📝 **Описание:** Открыл секретную тему\n` +
            `📅 **Время:** ${formatTime(new Date())}\n\n` +
            `🌐 **Посмотреть в веб-панели:** http://${SERVER_IP}:${PORT}`;

          await channel.send(channelMessage);
          console.log(`✅ Сообщение в канал отправлено`);
        }
      } catch (channelError) {
        console.log(
          `❌ Не удалось отправить уведомление в канал: ${channelError.message}`,
        );
      }

      // Отправляем в Telegram
      try {
        await sendSpecialAchievementNotification(
          username,
          "🥀",
          "Die my Darling",
          "Открыл секретную тему",
          "#8b0000",
          nowMoscowISO,
        );
        console.log(`✅ Telegram уведомление отправлено`);
      } catch (telegramError) {
        console.log(
          `⚠️ Ошибка при отправке в Telegram: ${telegramError.message}`,
        );
      }
    } catch (achievementError) {
      console.error("❌ Ошибка при создании достижения:", achievementError);
    }

    res.json({ success: true, alreadyActivated: false });
  } catch (error) {
    console.error("Ошибка при активации секретной темы:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API для регистрации Telegram chat_id пользователя
app.post("/api/register-telegram/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { telegramChatId } = req.body;

  try {
    if (!telegramChatId) {
      return res.status(400).json({ error: "Telegram chat ID is required" });
    }

    const success = registerTelegramUser(userId, telegramChatId);

    if (success) {
      res.json({
        success: true,
        message: "Telegram chat ID registered successfully",
      });
    } else {
      res.status(500).json({ error: "Failed to register Telegram chat ID" });
    }
  } catch (error) {
    console.error("Ошибка при регистрации Telegram chat ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API для генерации кода связывания с Telegram
app.post("/api/telegram-link/generate/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    const code = generateLinkCode(userId);
    res.json({
      success: true,
      code: code,
      expiresIn: 900, // 15 минут в секундах
    });
  } catch (error) {
    console.error("Ошибка при генерации кода:", error);
    res.status(500).json({ error: "Failed to generate link code" });
  }
});

// API для проверки статуса связи с Telegram
app.get("/api/telegram-link/status/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    const status = getTelegramLinkStatus(userId);
    res.json(status);
  } catch (error) {
    console.error("Ошибка при проверке статуса:", error);
    res.status(500).json({ error: "Failed to check link status" });
  }
});

// API для отвязки Telegram аккаунта
app.delete("/api/telegram-link/unlink/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    // Удаляем связь из базы данных
    db.prepare("DELETE FROM telegram_users WHERE user_id = ?").run(userId);

    // Отключаем уведомления канала
    setUserChannelNotificationSetting(userId, false);

    console.log(`🔓 Telegram аккаунт отвязан для userId: ${userId}`);

    res.json({
      success: true,
      message: "Telegram аккаунт успешно отвязан",
    });
  } catch (error) {
    console.error("Ошибка при отвязке Telegram:", error);
    res.status(500).json({ error: "Failed to unlink Telegram account" });
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
    `📝 Параметры: emoji=${emoji}, name=${name}, type=${type}, userId=${userId}, specialDate=${specialDate}`,
  );

  // Проверяем обязательные поля
  if (!emoji || !name || !description || !type || !userId) {
    console.log("❌ Отсутствуют обязательные поля!");
    return res.status(400).json({ error: "Отсутствуют обязательные поля" });
  }

  try {
    console.log(
      `📝 API: Получен запрос на создание достижения: ${name} для пользователя ${userId}`,
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
      `,
      ).run(
        achievementId,
        userId,
        emoji,
        name,
        description,
        type,
        color,
        specialDate || null,
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
      `,
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
        "   Целевое UTC (уже корректное): " + targetDateUTC.toISOString(),
      );
      console.log(
        "   Задержка (мс): " +
          delayMs +
          " = " +
          Math.round(delayMs / 60000) +
          " минут",
      );
      console.log(
        "   Будет ли setTimeout? " + (delayMs > 0 ? "ДА ✅" : "НЕТ ❌"),
      );

      if (delayMs > 0) {
        // Откладываем отправку уведомлений на указанное время
        const timeoutId = setTimeout(async () => {
          try {
            const user = await client.users.fetch(userId).catch(() => null);
            const username = user ? user.username : "Пользователь";

            // Отправляем ЛС пользователю
            if (user) {
              try {
                await user.send(
                  `🏆 **Новое специальное достижение!**\n\n` +
                    `${emoji} **${name}**\n` +
                    `${description}\n\n` +
                    `🌐 Посмотреть в веб-панели: http://${SERVER_IP}:${PORT}/?userId=${userId}&autoLogin=true`,
                );
              } catch (dmError) {
                console.log(
                  `Не удалось отправить ЛС пользователю ${userId}: ${dmError.message}`,
                );
              }
            }

            // Отправляем в канал Discord
            try {
              const channel = client.channels.cache.get(
                ACHIEVEMENTS_CHANNEL_ID,
              );
              if (channel) {
                await channel.send(
                  `🏆 **Новое специальное достижение!**\n\n` +
                    `👤 **Пользователь:** <@${userId}>\n` +
                    `🎯 **Достижение:** ${emoji} ${name}\n` +
                    `📝 **Описание:** ${description}\n` +
                    `📅 **Время:** ${formatTime(new Date())}\n\n` +
                    `🌐 **Посмотреть в веб-панели:** http://${SERVER_IP}:${PORT}`,
                );
              }
            } catch (channelError) {
              console.log(
                `Не удалось отправить уведомление в канал: ${channelError.message}`,
              );
            }

            // Отправляем в Telegram
            await sendSpecialAchievementNotification(
              username,
              emoji,
              name,
              description,
              color,
              specialDate,
            );
          } catch (notificationError) {
            console.error(
              "Ошибка при отправке отложенного уведомления:",
              notificationError,
            );
          }

          // Отмечаем что уведомления отправлены
          try {
            db.prepare(
              `UPDATE achievements SET notifications_sent = 1 WHERE achievement_id = ?`,
            ).run(achievementId);
          } catch (err) {
            console.error(
              "Ошибка при обновлении флага notifications_sent:",
              err,
            );
          }

          // Удаляем таймер из Map после выполнения
          achievementTimers.delete(achievementId);
        }, delayMs);

        // Сохраняем ID таймера для возможности отмены
        achievementTimers.set(achievementId, timeoutId);

        console.log(
          '✅ Достижение "' +
            name +
            '" запланировано на ' +
            targetDateUTC.toLocaleString("ru-RU"),
        );
      } else {
        // Если дата в прошлом или сейчас (delayMs <= 0)
        // Просто отмечаем что уведомления нужно было отправить
        // Они будут отправлены при следующей проверке пропущенных уведомлений
        console.log(
          `⚠️ Дата достижения "${name}" уже в прошлом (delayMs=${delayMs})`,
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
      `,
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
        `SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id = ?`,
      )
      .get(userId, achievementId);

    if (existingAchievement) {
      // Полностью удаляем достижение из user_achievements
      db.prepare(
        `DELETE FROM user_achievements WHERE user_id = ? AND achievement_id = ?`,
      ).run(userId, achievementId);
      console.log(
        `🗑️ Достижение ${achievementId} полностью удалено из user_achievements`,
      );

      // Если это обычное достижение (из ACHIEVEMENTS), вычитаем очки
      if (achievement && achievement.points > 0) {
        db.prepare(
          `UPDATE user_stats SET rank_points = MAX(0, rank_points - ?) WHERE user_id = ?`,
        ).run(achievement.points, userId);
        console.log(`💔 Вычтено ${achievement.points} очков`);
      } else if (achievementPoints > 0) {
        // Если это спец. достижение с очками, тоже вычитаем
        db.prepare(
          `UPDATE user_stats SET rank_points = MAX(0, rank_points - ?) WHERE user_id = ?`,
        ).run(achievementPoints, userId);
        console.log(`💔 Вычтено ${achievementPoints} очков`);
      }
    }

    // Также удаляем из таблицы achievements если это специальное достижение
    db.prepare(
      `DELETE FROM achievements WHERE user_id = ? AND achievement_id = ?`,
    ).run(userId, achievementId);

    // Отменяем запланированный таймер если он есть
    const timerId = achievementTimers.get(achievementId);
    if (timerId) {
      clearTimeout(timerId);
      achievementTimers.delete(achievementId);
      console.log(
        `⏰ Отменён запланированный таймер для достижения ${achievementId}`,
      );
    }

    // Отправляем отчет в Telegram
    await sendAchievementDeleteNotification(
      userName,
      achievementName,
      achievementPoints,
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении достижения:", error);
    res.status(500).json({ error: "Ошибка при удалении достижения" });
  }
});

// API endpoint для редактирования специального достижения
app.post("/api/admin/edit-achievement", async (req, res) => {
  const { achievementId, emoji, name, description, color } = req.body;

  if (!achievementId || !emoji || !name || !description || !color) {
    return res.status(400).json({ error: "Отсутствуют обязательные поля" });
  }

  try {
    console.log(`✏️ Редактирование достижения: ${achievementId}`);

    // Если это best_admin, обновляем в таблице achievements
    if (achievementId === "best_admin") {
      // Проверяем, существует ли запись
      const existing = db
        .prepare(`SELECT * FROM achievements WHERE achievement_id = ?`)
        .get(achievementId);

      if (existing) {
        // Обновляем существующую запись
        db.prepare(
          `
          UPDATE achievements 
          SET emoji = ?, name = ?, description = ?, color = ?
          WHERE achievement_id = ?
        `,
        ).run(emoji, name, description, color, achievementId);
      } else {
        // Создаем новую запись для best_admin
        db.prepare(
          `
          INSERT INTO achievements (achievement_id, user_id, emoji, name, description, type, color)
          VALUES (?, ?, ?, ?, ?, 'special', ?)
        `,
        ).run(
          achievementId,
          process.env.ADMIN_USER_ID,
          emoji,
          name,
          description,
          color,
        );
      }
    } else {
      // Для других специальных достижений обновляем в таблице achievements
      db.prepare(
        `
        UPDATE achievements 
        SET emoji = ?, name = ?, description = ?, color = ?
        WHERE achievement_id = ?
      `,
      ).run(emoji, name, description, color, achievementId);
    }

    console.log(`✅ Достижение ${achievementId} успешно обновлено`);
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Ошибка при редактировании достижения:", error);
    res.status(500).json({ error: "Ошибка при редактировании достижения" });
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

    // Удаляем файл аватарки если он существует
    try {
      const fs = await import("fs");
      const path = await import("path");
      const avatarPath = path.join("./avatars", `${userId}.png`);

      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
        console.log(`🗑️ Удален файл аватарки: ${avatarPath}`);
      }
    } catch (err) {
      console.error(
        `❌ Ошибка при удалении аватарки для ${userId}:`,
        err.message,
      );
    }

    // Удаляем пользователя из всех таблиц
    db.prepare("DELETE FROM user_stats WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_settings WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_achievements WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM voice_sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM achievements WHERE user_id = ?").run(userId);

    console.log(
      "🗑️ Пользователь " +
        userId +
        " (" +
        userName +
        ") полностью удален из БД",
    );

    // Отправляем уведомление в Telegram
    await sendUserDeleteNotification(userId, userName);

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении пользователя:", error);
    res.status(500).json({ error: "Ошибка при удалении пользователя" });
  }
});

// ===== УДАЛЕНИЕ СООБЩЕНИЙ ПОЛЬЗОВАТЕЛЯ =====
app.post("/api/admin/delete-user-messages", async (req, res) => {
  const { userId, hours } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Отсутствует userId" });
  }

  try {
    const guild = client.guilds.cache.first();
    if (!guild) {
      return res.status(500).json({ error: "Гильдия не найдена" });
    }

    let deletedCount = 0;
    let errorsList = [];
    const now = Date.now();
    const cutoffTime = hours === 0 ? 0 : now - (hours * 60 * 60 * 1000);

    console.log(`🗑️ Начинаем удаление сообщений пользователя ${userId} за ${hours === 0 ? 'все время' : hours + ' часов'}`);

    // Получаем все текстовые каналы
    const channels = guild.channels.cache.filter(channel => channel.isTextBased());

    for (const [channelId, channel] of channels) {
      try {
        console.log(`📝 Проверяем канал: ${channel.name}`);
        
        let lastMessageId;
        let hasMore = true;

        while (hasMore) {
          const options = { limit: 100 };
          if (lastMessageId) {
            options.before = lastMessageId;
          }

          const messages = await channel.messages.fetch(options);
          
          if (messages.size === 0) {
            hasMore = false;
            break;
          }

          const userMessages = messages.filter(msg => {
            if (msg.author.id !== userId) return false;
            if (hours === 0) return true;
            return msg.createdTimestamp >= cutoffTime;
          });

          for (const [msgId, msg] of userMessages) {
            try {
              await msg.delete();
              deletedCount++;
              console.log(`✅ Удалено сообщение ${msgId} в канале ${channel.name}`);
              
              // Задержка чтобы не превысить rate limit
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (err) {
              const errorMsg = `Канал "${channel.name}": ${err.message}`;
              console.error(`❌ Ошибка удаления сообщения ${msgId}:`, err.message);
              errorsList.push(errorMsg);
            }
          }

          lastMessageId = messages.last()?.id;

          // Если все сообщения старше cutoffTime, прекращаем поиск
          if (hours !== 0 && messages.last()?.createdTimestamp < cutoffTime) {
            hasMore = false;
          }

          // Если получили меньше 100 сообщений, значит это последняя страница
          if (messages.size < 100) {
            hasMore = false;
          }
        }
      } catch (channelError) {
        const errorMsg = `Канал "${channel.name}": ${channelError.message}`;
        console.error(`❌ Ошибка обработки канала ${channel.name}:`, channelError.message);
        errorsList.push(errorMsg);
      }
    }

    console.log(`✅ Удаление завершено. Удалено: ${deletedCount}, Ошибок: ${errorsList.length}`);

    // Отправляем уведомление в Telegram
    const userStats = getUserStats(userId);
    const userName = userStats?.username || `ID: ${userId}`;
    const periodText = hours === 0 ? 'все сообщения' : `сообщения за ${hours}ч`;
    
    let telegramMsg = `🗑️ <b>Удалены сообщения пользователя</b>\n` +
      `👤 Пользователь: ${userName}\n` +
      `📝 Период: ${periodText}\n` +
      `✅ Удалено: ${deletedCount}\n` +
      `❌ Ошибок: ${errorsList.length}\n` +
      `📅 Время: ${formatTime(new Date())}`;
    
    if (errorsList.length > 0) {
      telegramMsg += `\n\n<b>Список ошибок:</b>\n` + errorsList.slice(0, 5).map(e => `• ${e}`).join('\n');
      if (errorsList.length > 5) {
        telegramMsg += `\n... и еще ${errorsList.length - 5} ошибок`;
      }
    }
    
    await sendTelegramReport(telegramMsg);

    res.json({ success: true, deletedCount, errors: errorsList.length, errorsList });
  } catch (error) {
    console.error("❌ Ошибка при удалении сообщений:", error);
    res.status(500).json({ error: "Ошибка при удалении сообщений" });
  }
});

// ===== БЭКАП БАЗЫ ДАННЫХ =====
app.post("/api/admin/backup-database", async (req, res) => {
  try {
    const fs = await import("fs");
    const path = await import("path");

    // Путь к текущей БД
    const dbPath = "./afkbot.db";

    // Проверяем существование файла
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: "База данных не найдена" });
    }

    // Создаем папку backup если её нет
    const backupDir = "./backup";
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Генерируем имя файла с датой и временем
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const backupPath = path.join(backupDir, `afkbot-backup-${dateStr}.db`);

    console.log("💾 Создание бэкапа базы данных...");
    console.log("📂 Путь: " + backupPath);

    // Копируем файл БД в папку backup
    fs.copyFileSync(dbPath, backupPath);

    console.log("✅ Бэкап базы данных успешно создан: " + backupPath);

    res.json({
      success: true,
      message: "Бэкап создан успешно",
      filename: `afkbot-backup-${dateStr}.db`,
      path: backupPath,
    });
  } catch (error) {
    console.error("❌ Ошибка при создании бэкапа:", error);
    res.status(500).json({ error: "Ошибка при создании бэкапа" });
  }
});

// ===== ОБНОВЛЕНИЕ ИМЕН ПОЛЬЗОВАТЕЛЕЙ =====
app.post("/api/admin/update-names", async (req, res) => {
  try {
    console.log("🔄 Запрос на обновление имен пользователей...");

    const guild = client.guilds.cache.first();
    if (!guild) {
      return res.status(500).json({ error: "Гильдия не найдена" });
    }

    const allUsers = db.prepare("SELECT user_id FROM user_stats").all();
    let updated = 0;
    let total = allUsers.length;

    for (const user of allUsers) {
      try {
        const member = await guild.members
          .fetch(user.user_id)
          .catch(() => null);
        if (member) {
          const displayName = member.displayName || member.user.username;
          const discordAvatarUrl = member.user.displayAvatarURL({
            format: "png",
            size: 128,
          });
          const localAvatarPath = await downloadAvatar(
            user.user_id,
            discordAvatarUrl,
          );
          db.prepare(
            "UPDATE user_stats SET username = ?, avatar_url = ? WHERE user_id = ?",
          ).run(displayName, localAvatarPath, user.user_id);
          updated++;
        }
      } catch (err) {
        // Пропускаем пользователей которых не удалось найти
      }
    }

    console.log(
      `✅ Обновлено displayName и аватарок для ${updated} из ${total} пользователей`,
    );

    res.json({
      success: true,
      updated: updated,
      total: total,
      message: `Обновлено ${updated} из ${total} пользователей`,
    });
  } catch (error) {
    console.error("❌ Ошибка при обновлении имен:", error);
    res.status(500).json({ error: "Ошибка при обновлении имен" });
  }
});

// ===== ЗАГРУЗКА АВАТАРОК НА СЕРВЕР =====
app.post("/api/admin/download-avatars", async (req, res) => {
  try {
    console.log("📥 Запрос на загрузку аватарок...");

    const fs = await import("fs");
    const path = await import("path");
    const https = await import("https");

    // Создаем папку avatars если её нет
    const avatarsDir = "./avatars";
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    const guild = client.guilds.cache.first();
    if (!guild) {
      return res.status(500).json({ error: "Гильдия не найдена" });
    }

    const allUsers = db
      .prepare("SELECT user_id, avatar_url FROM user_stats")
      .all();
    let downloaded = 0;
    let errors = 0;
    let total = allUsers.length;

    for (const user of allUsers) {
      try {
        if (
          !user.avatar_url ||
          user.avatar_url.includes("nopic.png") ||
          user.avatar_url.startsWith("/avatars/")
        ) {
          continue;
        }

        const fileName = `${user.user_id}.png`;
        const filePath = path.join(avatarsDir, fileName);

        // Скачиваем аватарку
        await new Promise((resolve, reject) => {
          const file = fs.createWriteStream(filePath);
          https
            .get(user.avatar_url, (response) => {
              response.pipe(file);
              file.on("finish", () => {
                file.close();
                // Обновляем путь в базе данных
                db.prepare(
                  "UPDATE user_stats SET avatar_url = ? WHERE user_id = ?",
                ).run(`/avatars/${fileName}`, user.user_id);
                downloaded++;
                resolve();
              });
            })
            .on("error", (err) => {
              fs.unlink(filePath, () => {});
              errors++;
              reject(err);
            });
        });
      } catch (err) {
        console.error(
          `❌ Ошибка загрузки аватарки для ${user.user_id}:`,
          err.message,
        );
        errors++;
      }
    }

    console.log(`✅ Загружено ${downloaded} аватарок, ошибок: ${errors}`);

    res.json({
      success: true,
      downloaded: downloaded,
      errors: errors,
      total: total,
      message: `Загружено ${downloaded} аватарок, ошибок: ${errors}`,
    });
  } catch (error) {
    console.error("❌ Ошибка при загрузке аватарок:", error);
    res.status(500).json({ error: "Ошибка при загрузке аватарок" });
  }
});

// ===== ПОПЫТКА НЕСАНКЦИОНИРОВАННОГО ДОСТУПА =====
app.post("/api/unauthorized-access", async (req, res) => {
  const { attemptedId, timestamp } = req.body;

  try {
    // Отправляем уведомление в Telegram
    await sendUnauthorizedAccessNotification(attemptedId, timestamp);

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
      "http://localhost:3000/auth/discord/callback",
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
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API для получения конфигурации клиента
app.get("/api/config", (req, res) => {
  res.json({
    ADMIN_USER_ID: process.env.ADMIN_USER_ID,
    ADMIN_LOGIN: process.env.ADMIN_LOGIN,
    SERVER_IP: SERVER_IP,
    PORT: PORT,
    TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || "your_bot",
  });
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

  // Проверяем существует ли пользователь в БД и его аватарку
  const existingUser = db
    .prepare("SELECT user_id, avatar_url FROM user_stats WHERE user_id = ?")
    .get(userId);

  // Получаем displayName из guild member если возможно
  let username = message.author.username;
  let localAvatarPath = "/avatars/nopic.png";

  if (message.guild) {
    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (member) {
      username = member.displayName || member.user.username;

      // Скачиваем аватарку если пользователь новый или у него nopic.png
      const needsAvatar =
        !existingUser ||
        !existingUser.avatar_url ||
        existingUser.avatar_url.includes("nopic.png");

      if (needsAvatar) {
        const discordAvatarUrl = member.user.displayAvatarURL({
          format: "png",
          size: 128,
        });
        localAvatarPath = await downloadAvatar(userId, discordAvatarUrl);
      }
    }
  }

  // Инициализируем пользователя в статистике
  const needsAvatar =
    !existingUser ||
    !existingUser.avatar_url ||
    existingUser.avatar_url.includes("nopic.png");
  initUserStats(userId, username, needsAvatar ? localAvatarPath : null);

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
        message.reference.messageId,
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
        error.message,
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
        "📊 У вас пока нет статистики. Начните использовать голосовые каналы!",
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
🌐 **Подробная статистика:** http://${SERVER_IP}:${PORT}
    `);
    return;
  }

  // Команда для просмотра достижений
  if (content === ".!. achievements" || content === ".!. достижения") {
    const achievements = getUserAchievements(userId);
    const totalAchievements = Object.keys(ACHIEVEMENTS).filter(
      (id) => id !== "best_admin",
    ).length;
    const userAchievements = achievements.filter(
      (a) => a.achievement_id !== "best_admin",
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
      "✅ ЛС уведомления о перемещении в токсичный канал **включены**",
    );
    await sendSettingsChangeNotification(
      message.author.username,
      message.author.id,
      `📩 ЛС уведомления: ✅ ВКЛЮЧЕНЫ`,
    );
    return;
  }

  if (content === ".!. msg off" || content === ".!. лс выкл") {
    setUserDMSetting(message.author.id, false);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply(
      "❌ ЛС уведомления о перемещении в токсичный канал **отключены**",
    );
    await sendSettingsChangeNotification(
      message.author.username,
      message.author.id,
      `📩 ЛС уведомления: ❌ ОТКЛЮЧЕНЫ`,
    );
    return;
  }

  if (content === ".!. time 15" || content === ".!. время 15") {
    setUserTimeout(message.author.id, 15);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply(
      "⏰ Время до перемещения в AFK установлено: **15 минут**",
    );
    const dmEnabled = getUserDMSetting(message.author.id);
    await sendSettingsChangeNotification(
      message.author.username,
      message.author.id,
      `⏱️ Таймер AFK: 15 минут\n📩 ЛС уведомления: ${dmEnabled ? "✅ включены" : "❌ отключены"}`,
    );
    return;
  }

  if (content === ".!. time 30" || content === ".!. время 30") {
    setUserTimeout(message.author.id, 30);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply(
      "⏰ Время до перемещения в AFK установлено: **30 минут**",
    );
    const dmEnabled = getUserDMSetting(message.author.id);
    await sendSettingsChangeNotification(
      message.author.username,
      message.author.id,
      `⏱️ Таймер AFK: 30 минут\n📩 ЛС уведомления: ${dmEnabled ? "✅ включены" : "❌ отключены"}`,
    );
    return;
  }

  if (content === ".!. time 45" || content === ".!. время 45") {
    setUserTimeout(message.author.id, 45);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply(
      "⏰ Время до перемещения в AFK установлено: **45 минут**",
    );
    const dmEnabled = getUserDMSetting(message.author.id);
    await sendSettingsChangeNotification(
      message.author.username,
      message.author.id,
      `⏱️ Таймер AFK: 45 минут\n📩 ЛС уведомления: ${dmEnabled ? "✅ включены" : "❌ отключены"}`,
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
🌐 **Веб-панель:** http://${SERVER_IP}:${PORT}`,
    );

    await sendTelegramReport(
      `📊 <b>Пользователь проверил статус настроек</b>\n` +
        `👤 Пользователь: ${message.author.username}\n` +
        `🆔 ID: <code>${message.author.id}</code>\n` +
        `⏱️ Текущий таймер: ${timeout} минут\n` +
        `📩 ЛС уведомления: ${dmEnabled ? "✅ включены" : "❌ отключены"}\n` +
        `📅 Время: ${formatTime(new Date())}`,
    );
    return;
  }

  // Команды управления уведомлениями о достижениях
  if (content === ".!. ach on" || content === ".!. достижения вкл") {
    setUserAchievementNotificationSetting(message.author.id, true);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply("🏆✅ Уведомления о достижениях **включены**");

    await sendSettingsChangeNotification(
      message.author.username,
      message.author.id,
      `🏆 Уведомления о достижениях: ✅ ВКЛЮЧЕНЫ`,
    );
    return;
  }

  if (content === ".!. ach off" || content === ".!. достижения выкл") {
    setUserAchievementNotificationSetting(message.author.id, false);
    incrementUserStat(userId, "settings_changes");
    await checkAchievements(userId, username);

    await message.reply("🏆❌ Уведомления о достижениях **отключены**");

    await sendSettingsChangeNotification(
      message.author.username,
      message.author.id,
      `🏆 Уведомления о достижениях: ❌ ОТКЛЮЧЕНЫ`,
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
🌐 **Веб-панель:** http://${SERVER_IP}:${PORT}
    `);

    await sendTelegramReport(
      `❓ <b>Пользователь запросил справку</b>\n` +
        `👤 Пользователь: ${message.author.username}\n` +
        `🆔 ID: <code>${message.author.id}</code>\n` +
        `📅 Время: ${formatTime(new Date())}`,
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
          `❌ У пользователя \`${targetUserId}\` нет достижений`,
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
        "DELETE FROM user_achievements WHERE user_id = ?",
      );
      const result = stmt.run(targetUserId);

      // Обнуляем очки рейтинга
      const resetPointsStmt = db.prepare(
        "UPDATE user_stats SET rank_points = 0 WHERE user_id = ?",
      );
      resetPointsStmt.run(targetUserId);

      await message.reply(
        `✅ **Достижения сброшены для пользователя:** \`${targetUserId}\`\n` +
          `🗑️ Удалено достижений: **${result.changes}**\n` +
          `⭐ Очки рейтинга обнулены`,
      );

      console.log(`🗑️ Сброшены достижения для пользователя ${targetUserId}`);

      await sendTelegramReport(
        `🗑️ <b>Достижения сброшены администратором</b>\n` +
          `👤 Администратор: ${message.author.username}\n` +
          `🎯 Для пользователя ID: <code>${targetUserId}</code>\n` +
          `📊 Удалено достижений: ${result.changes}\n` +
          `📅 Время: ${formatTime(new Date())}`,
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
        `❌ Укажите ID достижения\nПример: \`.!. resetachievement first_join ${DEFAULT_TEST_USER_ID}\``,
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
          `**Пример:** \`.!. resetachievement first_web_visit ${DEFAULT_TEST_USER_ID}\``,
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
          `❌ Пользователь \`${targetUserId}\` не найден в статистике`,
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
            20 - (stats.settings_changes || 0),
          )} изменений**`,
      );
      return;
    }

    try {
      const stmt = db.prepare(
        "DELETE FROM user_achievements WHERE user_id = ? AND achievement_id = ?",
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
            `⭐ Очков вычтено: ${achievement?.points || 0}`,
        );
      } else {
        await message.reply(
          `❌ Достижение \`${achievementId}\` не найдено у пользователя \`${targetUserId}\``,
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

client.on("clientReady", async () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
  console.log(`📝 AFK канал ID: ${AFK_CHANNEL_ID}`);
  console.log(`⏱️ Таймер неактивности по умолчанию: ${DEFAULT_TIMEOUT} минут`);
  console.log(`💾 База данных: afkbot.db`);
  console.log(`📱 Telegram отчеты: включены`);
  console.log(`🌐 Веб-панель: http://${SERVER_IP}:${PORT}`);

  const botDetails =
    `🤖 Бот: ${client.user.tag}\n` +
    `🌐 Веб-панель: http://${SERVER_IP}:${PORT}`;

  await sendBotStatusNotification("started", botDetails);

  client.guilds.cache.forEach((guild) => {
    const afkChannel = guild.channels.cache.get(AFK_CHANNEL_ID);
    if (afkChannel) {
      console.log(
        `✅ AFK канал найден: ${afkChannel.name} в гильдии ${guild.name}`,
      );
    } else {
      console.log(`❌ AFK канал не найден в гильдии ${guild.name}`);
    }
  });

  // Миграция: очищаем все CDN URL из базы данных
  console.log("🔄 Миграция: очистка CDN URL из базы данных...");
  try {
    const cdnUsers = db
      .prepare(
        "SELECT user_id FROM user_stats WHERE avatar_url LIKE '%cdn.discordapp.com%'",
      )
      .all();
    if (cdnUsers.length > 0) {
      console.log(`📝 Найдено ${cdnUsers.length} пользователей с CDN URL`);
      db.prepare(
        "UPDATE user_stats SET avatar_url = '/avatars/nopic.png' WHERE avatar_url LIKE '%cdn.discordapp.com%'",
      ).run();
      console.log(`✅ CDN URL очищены, установлен nopic.png`);
    } else {
      console.log(`✅ CDN URL не найдены`);
    }
  } catch (error) {
    console.error("❌ Ошибка при миграции CDN URL:", error);
  }

  // Запускаем проверку специального достижения каждую минуту
  setInterval(checkSpecialAchievement, 60000);
  console.log("⏰ Запущена проверка специального достижения");

  // Обновляем только displayName для всех пользователей в БД (без аватарок)
  setTimeout(async () => {
    console.log("🔄 Обновление displayName для всех пользователей...");
    try {
      const guild = client.guilds.cache.first();
      if (guild) {
        const allUsers = db.prepare("SELECT user_id FROM user_stats").all();
        let updated = 0;

        for (const user of allUsers) {
          try {
            const member = await guild.members
              .fetch(user.user_id)
              .catch(() => null);
            if (member) {
              const displayName = member.displayName || member.user.username;
              db.prepare(
                "UPDATE user_stats SET username = ? WHERE user_id = ?",
              ).run(displayName, user.user_id);
              updated++;
            }
          } catch (err) {
            // Пропускаем пользователей которых не удалось найти
          }
        }

        console.log(`✅ Обновлено displayName для ${updated} пользователей`);
      }
    } catch (error) {
      console.error("❌ Ошибка при обновлении displayName:", error);
    }
  }, 5000); // Задержка 5 секунд

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
        error,
      );
    }
  }, 30000);
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const member = newState.member;
    const userId = member.id;
    const username = member.displayName || member.user.username;

    if (member.user.bot) return;

    // Проверяем существует ли пользователь в БД и его аватарку
    const existingUser = db
      .prepare("SELECT user_id, avatar_url FROM user_stats WHERE user_id = ?")
      .get(userId);

    let localAvatarPath = "/avatars/nopic.png";

    // Скачиваем аватарку если пользователь новый или у него nopic.png
    const needsAvatar =
      !existingUser ||
      !existingUser.avatar_url ||
      existingUser.avatar_url.includes("nopic.png");

    if (needsAvatar) {
      const discordAvatarUrl = member.user.displayAvatarURL({
        format: "png",
        size: 128,
      });
      localAvatarPath = await downloadAvatar(userId, discordAvatarUrl);
    }

    // Инициализируем пользователя в статистике
    initUserStats(userId, username, needsAvatar ? localAvatarPath : null);

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

      await sendTelegramReport(
        `🎤 <b>Пользователь зашел в канал</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${newState.channel.name}\n` +
          `📅 Время захода: ${formatTime(joinTime)}`,
      );

      // Отправляем уведомления пользователям с включенной настройкой
      await notifyChannelActivity(
        `🎤 <b>${username}</b> зашел в канал <b>${newState.channel.name}</b>`,
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
            `⏱️ AFK время добавлено при выходе: ${formatDuration(afkDuration)}`,
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

      await sendTelegramReport(
        `👋 <b>Пользователь покинул канал</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${oldState.channel.name}\n` +
          `📅 Время: ${formatTime(new Date())}`,
      );

      // Отправляем уведомления пользователям с включенной настройкой
      await notifyChannelActivity(
        `👋 <b>${username}</b> вышел из канала <b>${oldState.channel.name}</b>`,
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
        `🔄 ${username} переместился из ${oldState.channel.name} в ${newState.channel.name}`,
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
              afkDuration,
            )}`,
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

      await sendTelegramReport(
        `🔄 <b>Пользователь переместился между каналами</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Из канала: ${oldState.channel.name}\n` +
          `📺 В канал: ${newState.channel.name}\n` +
          `📅 Время: ${formatTime(new Date())}`,
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

      await sendTelegramReport(
        `🎙️❌ <b>Пользователь отключил микрофон</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${newState.channel.name}\n` +
          `⏱️ Запущен таймер на: ${timeoutDisplay}\n` +
          `📩 ЛС уведомления: ${dmEnabled ? "✅ включены" : "❌ отключены"}\n` +
          `📅 Время: ${formatTime(new Date())}`,
      );

      if (dmEnabled) {
        await member
          .send(
            `🎙️❌ Похоже ты решил побыть AFK, раз отключил микрофон, через ${timeoutDisplay} ты окажешься в токсичном канале, подумай об этом\n\n💡 Чтобы отключить эти уведомления, напиши \`.!.\` на сервере`,
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

      await sendTelegramReport(
        `📡 <b>Пользователь включил трансляцию</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${newState.channel.name}\n` +
          `📅 Время: ${formatTime(new Date())}`,
      );

      // Отправляем уведомления пользователям с включенной настройкой
      await notifyChannelActivity(
        `📡 <b>${username}</b> включил трансляцию в канале <b>${newState.channel.name}</b>`,
      );

      return;
    }

    // ===== ПОЛЬЗОВАТЕЛЬ ОТКЛЮЧИЛ ТРАНСЛЯЦИЮ =====
    if (!newState.streaming && oldState.streaming) {
      console.log(`📡❌ ${username} отключил трансляцию`);

      await sendTelegramReport(
        `📡❌ <b>Пользователь отключил трансляцию</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${newState.channel.name}\n` +
          `📅 Время: ${formatTime(new Date())}`,
      );

      // Отправляем уведомления пользователям с включенной настройкой
      await notifyChannelActivity(
        `📡❌ <b>${username}</b> отключил трансляцию в канале <b>${newState.channel.name}</b>`,
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

      await sendTelegramReport(
        `🎙️✅ <b>Пользователь включил микрофон</b>\n` +
          `👤 Пользователь: ${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `📺 Канал: ${newState.channel.name}\n` +
          `🛑 Таймер остановлен\n` +
          `📅 Время: ${formatTime(new Date())}`,
      );

      const originalChannelId = userOriginalChannels.get(userId);
      if (originalChannelId && newState.channel?.id === AFK_CHANNEL_ID) {
        const originalChannel =
          newState.guild.channels.cache.get(originalChannelId);
        if (originalChannel?.type === 2) {
          await newState.setChannel(originalChannel);
          console.log(`✅ ${username} возвращен в ${originalChannel.name}`);

          await sendTelegramReport(
            `↩️ <b>Пользователь возвращен из AFK</b>\n` +
              `👤 Пользователь: ${username}\n` +
              `📺 Из канала: 😡 Токсичный канал\n` +
              `📺 В канал: ${originalChannel.name}\n` +
              `📅 Время: ${formatTime(new Date())}`,
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
  const username = member.displayName || member.user.username;
  const avatarUrl = member.user.displayAvatarURL({ format: "png", size: 128 });
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
        `⏳ Проверяем пользователя ${username} (ID: ${userId}) через ${timeoutDisplay}`,
      );
      const currentMember = guild.members.cache.get(userId);

      if (currentMember && currentMember.voice.channel) {
        console.log(
          `🎤 ${username} все еще в канале: ${currentMember.voice.channel.name}`,
        );
        console.log(`🎙️ selfMute: ${currentMember.voice.selfMute}`);

        if (!currentMember.voice.selfMute) {
          console.log(
            `🎙️ ${username} включил микрофон или микрофон не отключен, отменяем перемещение в AFK`,
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
          `⏰ ${username} переемещен в AFK за неактивность (${timeoutDisplay})`,
        );

        const dmEnabled = getUserDMSetting(userId);
        await sendTelegramReport(
          `⏰ <b>Пользователь перемещен в AFK</b>\n` +
            `👤 Пользователь: ${username}\n` +
            `🆔 ID: <code>${userId}</code>\n` +
            `📺 Из канала: ${originalChannelName}\n` +
            `📺 В канал: ${AFK_CHANNEL.name}\n` +
            `⏱️ Неактивен: ${timeoutDisplay}\n` +
            `📩 ЛС уведомления: ${
              dmEnabled ? "✅ включены" : "❌ отключены"
            }\n` +
            `📅 Время: ${formatTime(new Date())}`,
        );

        if (dmEnabled) {
          await currentMember
            .send(
              `⏰ Ты был неактивен ${timeoutDisplay}, малютка, и был перемещен откисать в токсичный канал.\n\n💡 Чтобы изменить настройки, напиши \`.!.\` на сервере`,
            )
            .catch(() => {});
        }
      } else {
        console.log(
          `❌ ${username} не найден в голосовых каналах или покинул канал`,
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

// ===== ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ ИНФОРМАЦИИ О ПОЛЬЗОВАТЕЛЯХ В КАНАЛАХ =====
export function getVoiceChannelActivity() {
  try {
    // Проверяем, что Discord клиент готов
    if (!client || !client.isReady()) {
      console.log("⚠️ Discord клиент еще не готов");
      return {
        success: false,
        message:
          "⏳ Discord бот еще загружается, попробуйте через несколько секунд",
      };
    }

    const guild = client.guilds.cache.first();
    if (!guild) {
      console.log("⚠️ Сервер не найден");
      return { success: false, message: "❌ Сервер не найден" };
    }

    const voiceChannels = guild.channels.cache.filter(
      (channel) => channel.type === ChannelType.GuildVoice,
    );

    console.log(`📊 Всего голосовых каналов: ${voiceChannels.size}`);

    if (voiceChannels.size === 0) {
      return { success: true, message: "📭 Нет голосовых каналов на сервере" };
    }

    let activeChannels = [];
    let totalMembers = 0;

    voiceChannels.forEach((channel) => {
      const memberCount = channel.members ? channel.members.size : 0;
      console.log(`🔊 Канал "${channel.name}": ${memberCount} участников`);

      if (memberCount > 0) {
        totalMembers += memberCount;
        const channelInfo = {
          name: channel.name,
          id: channel.id,
          members: [],
          oldestJoinTime: null, // Время присоединения самого раннего участника
          channelActivityDuration: "Неизвестно",
        };

        channel.members.forEach((member) => {
          try {
            const joinTime = userJoinTimes.get(member.id);

            // Отслеживаем самое раннее время присоединения
            if (joinTime) {
              if (
                !channelInfo.oldestJoinTime ||
                joinTime < channelInfo.oldestJoinTime
              ) {
                channelInfo.oldestJoinTime = joinTime;
              }
            }

            const memberInfo = {
              username: member.user ? member.user.username : "Unknown",
              displayName:
                member.displayName || member.user?.username || "Unknown",
              id: member.id,
              streaming: member.voice?.streaming || false,
              selfVideo: member.voice?.selfVideo || false,
              muted: member.voice?.mute || false,
              deafened: member.voice?.deaf || false,
            };

            channelInfo.members.push(memberInfo);
            console.log(`  👤 Добавлен: ${memberInfo.displayName}`);
          } catch (memberError) {
            console.error(
              `⚠️ Ошибка обработки участника ${member.id}:`,
              memberError.message,
            );
          }
        });

        // Вычисляем общее время активности канала
        if (channelInfo.oldestJoinTime) {
          const now = Date.now();
          const diff = now - channelInfo.oldestJoinTime;
          const hours = Math.floor(diff / 3600000);
          const minutes = Math.floor((diff % 3600000) / 60000);

          // Не показываем время если меньше минуты
          if (hours > 0) {
            channelInfo.channelActivityDuration = `${hours}ч ${minutes}м`;
          } else if (minutes > 0) {
            channelInfo.channelActivityDuration = `${minutes}м`;
          } else {
            channelInfo.channelActivityDuration = "Неизвестно";
          }
        }

        if (channelInfo.members.length > 0) {
          activeChannels.push(channelInfo);
          console.log(
            `✅ Канал "${channelInfo.name}" добавлен с ${channelInfo.members.length} участниками, активность: ${channelInfo.channelActivityDuration}`,
          );
        } else {
          console.log(
            `⚠️ Канал "${channelInfo.name}" имеет участников, но все были пропущены из-за ошибок`,
          );
        }
      }
    });

    console.log(
      `📊 Итого: ${totalMembers} участников в ${activeChannels.length} каналах`,
    );

    if (activeChannels.length === 0) {
      console.log(
        `⚠️ activeChannels пуст, но было найдено ${totalMembers} участников`,
      );
      return {
        success: true,
        message:
          totalMembers > 0
            ? "⚠️ Не удалось получить информацию о пользователях в каналах. Попробуйте позже."
            : "📭 Все голосовые каналы пусты",
      };
    }

    // Формируем текстовое сообщение
    let message = "🎤 <b>Активность в голосовых каналах:</b>\n\n";

    activeChannels.forEach((channel) => {
      // Заголовок канала с количеством участников и временем активности
      message += `🔊 <b>${channel.name}</b> (${channel.members.length} чел.)`;

      // Показываем общее время активности канала
      if (channel.channelActivityDuration !== "Неизвестно") {
        message += ` • ⏱ ${channel.channelActivityDuration}`;
      }

      message += `\n`;

      channel.members.forEach((member) => {
        let statusIcons = [];
        if (member.streaming) statusIcons.push("🔴 Стрим");
        if (member.selfVideo) statusIcons.push("📹 Видео");
        if (member.muted) statusIcons.push("🔇");
        if (member.deafened) statusIcons.push("🔕");

        const status =
          statusIcons.length > 0 ? ` (${statusIcons.join(", ")})` : "";
        message += `  👤 ${member.displayName}${status}\n`;
      });

      message += "\n";
    });

    message += `📅 ${new Date().toLocaleString("ru-RU")}`;

    console.log(
      `✅ Информация о каналах успешно собрана: ${activeChannels.length} активных каналов`,
    );

    return {
      success: true,
      message: message,
      activeChannels: activeChannels,
    };
  } catch (error) {
    console.error("❌ Ошибка при получении информации о каналах:", error);
    console.error("Stack trace:", error.stack);
    return {
      success: false,
      message: "❌ Ошибка при получении информации о каналах",
    };
  }
}

// ===== ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ СПИСКА ОНЛАЙН ПОЛЬЗОВАТЕЛЕЙ =====
export function getOnlineUsers() {
  try {
    // Проверяем, что Discord клиент готов
    if (!client || !client.isReady()) {
      console.log("⚠️ Discord клиент еще не готов");
      return {
        success: false,
        message:
          "⏳ Discord бот еще загружается, попробуйте через несколько секунд",
      };
    }

    const guild = client.guilds.cache.first();
    if (!guild) {
      console.log("⚠️ Сервер не найден");
      return { success: false, message: "❌ Сервер не найден" };
    }

    // Получаем всех участников сервера
    const members = guild.members.cache;

    if (members.size === 0) {
      return { success: true, message: "📭 На сервере нет участников" };
    }

    // Фильтруем онлайн пользователей (не оффлайн и не боты)
    const onlineMembers = members.filter(
      (member) =>
        !member.user.bot &&
        member.presence?.status &&
        member.presence.status !== "offline",
    );

    console.log(
      `👥 Всего участников: ${members.size}, онлайн: ${onlineMembers.size}`,
    );

    if (onlineMembers.size === 0) {
      return {
        success: true,
        message: "📭 Нет пользователей онлайн",
      };
    }

    // Группируем по статусам
    const statusGroups = {
      online: [],
      idle: [],
      dnd: [],
    };

    onlineMembers.forEach((member) => {
      const status = member.presence?.status || "offline";
      const memberInfo = {
        displayName: member.displayName || member.user?.username || "Unknown",
        username: member.user?.username || "Unknown",
        id: member.id,
        status: status,
        activities: member.presence?.activities || [],
      };

      if (status === "online") {
        statusGroups.online.push(memberInfo);
      } else if (status === "idle") {
        statusGroups.idle.push(memberInfo);
      } else if (status === "dnd") {
        statusGroups.dnd.push(memberInfo);
      }
    });

    // Формируем сообщение
    let message = `👥 <b>Пользователи онлайн:</b> ${onlineMembers.size} чел.\n\n`;

    // Онлайн (зелёный)
    if (statusGroups.online.length > 0) {
      message += `🟢 <b>Онлайн</b> (${statusGroups.online.length})\n`;
      statusGroups.online.forEach((member) => {
        message += `  👤 ${member.displayName}\n`;
        // Показываем активность если есть
        if (member.activities.length > 0) {
          const activity = member.activities[0];
          if (activity.name) {
            message += `     🎮 ${activity.name}\n`;
          }
        }
      });
      message += "\n";
    }

    // Неактивен (жёлтый)
    if (statusGroups.idle.length > 0) {
      message += `🟡 <b>Неактивен</b> (${statusGroups.idle.length})\n`;
      statusGroups.idle.forEach((member) => {
        message += `  👤 ${member.displayName}\n`;
      });
      message += "\n";
    }

    // Не беспокоить (красный)
    if (statusGroups.dnd.length > 0) {
      message += `🔴 <b>Не беспокоить</b> (${statusGroups.dnd.length})\n`;
      statusGroups.dnd.forEach((member) => {
        message += `  👤 ${member.displayName}\n`;
      });
      message += "\n";
    }

    message += `📅 ${new Date().toLocaleString("ru-RU")}`;

    console.log(
      `✅ Информация об онлайн пользователях собрана: ${onlineMembers.size} онлайн`,
    );

    return {
      success: true,
      message: message,
      onlineCount: onlineMembers.size,
      totalCount: members.size,
    };
  } catch (error) {
    console.error(
      "❌ Ошибка при получении списка онлайн пользователей:",
      error,
    );
    console.error("Stack trace:", error.stack);
    return {
      success: false,
      message: "❌ Ошибка при получении списка пользователей",
    };
  }
}

// ===== ОБРАБОТЧИКИ ОШИБОК И ЗАВЕРШЕНИЯ =====
process.on("SIGINT", async () => {
  console.log("🛑 Закрытие базы данных...");
  await sendBotStatusNotification("stopped");
  db.close();
  process.exit(0);
});

client.on("error", (error) => console.error("❌ Client error:", error));
process.on("unhandledRejection", (error) =>
  console.error("❌ Unhandled rejection:", error),
);

// ===== ЗАПУСК БОТА =====
client.login(process.env.DISCORD_TOKEN);

// ===== ИНИЦИАЛИЗАЦИЯ TELEGRAM БОТА =====
setTimeout(() => {
  initTelegramBot(
    db,
    client,
    useLinkCode,
    getVoiceChannelActivity,
    getOnlineUsers,
  );
}, 2000); // Даем Discord боту время на запуск
