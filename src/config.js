import dotenv from 'dotenv';
dotenv.config();

// ===== DISCORD CONFIGURATION =====
export const DISCORD_CONFIG = {
  AFK_CHANNEL_ID: process.env.AFK_CHANNEL_ID,
  STREAM_CHANNEL_ID: process.env.STREAM_CHANNEL_ID,
  ACHIEVEMENTS_CHANNEL_ID: process.env.ACHIEVEMENTS_CHANNEL_ID,
};

// ===== USER IDS =====
export const USER_IDS = {
  SPECIAL_USER_ID: process.env.SPECIAL_USER_ID,
  ADMIN_USER_ID: process.env.ADMIN_USER_ID,
  DEFAULT_TEST_USER_ID: process.env.DEFAULT_TEST_USER_ID,
};

// ===== TIMEOUTS =====
export const TIMEOUTS = {
  DEFAULT_AFK_TIMEOUT: 15, // минуты
  MESSAGE_DELETE_DELAY: 100, // миллисекунды
};

// ===== SERVER CONFIGURATION =====
export const SERVER_CONFIG = {
  IP: process.env.SERVER_IP || 'localhost',
  PORT: process.env.PORT || 3000,
  SITE_URL: process.env.SITE_URL || `http://${process.env.SERVER_IP || 'localhost'}:${process.env.PORT || 3000}`,
};

// ===== TELEGRAM CONFIGURATION =====
export const TELEGRAM_CONFIG = {
  BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  CHAT_ID: process.env.TELEGRAM_CHAT_ID || '137981675',
  BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
};

// ===== STEAM CONFIGURATION =====
export const STEAM_CONFIG = {
  STEAM_API_KEY: process.env.STEAM_API_KEY,
  VAC_WATCH_CHANNEL_ID: process.env.VAC_WATCH_CHANNEL_ID,
  VAC_THREAD_ID: process.env.VAC_THREAD_ID,
};

// ===== FACEIT CONFIGURATION =====
export const FACEIT_CONFIG = {
  FACEIT_API_KEY: process.env.FACEIT_API_KEY || null,
};

// ===== VALIDATION =====
export function validateConfig() {
  const required = [
    { name: 'AFK_CHANNEL_ID', value: DISCORD_CONFIG.AFK_CHANNEL_ID },
    { name: 'ADMIN_USER_ID', value: USER_IDS.ADMIN_USER_ID },
  ];

  const missing = required.filter(({ value }) => !value);

  if (missing.length > 0) {
    console.error('❌ Отсутствуют обязательные переменные окружения:');
    missing.forEach(({ name }) => console.error(`   - ${name}`));
    process.exit(1);
  }

  console.log('✅ Конфигурация валидна');
}
