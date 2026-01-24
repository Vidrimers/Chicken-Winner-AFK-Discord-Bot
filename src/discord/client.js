import { Client, GatewayIntentBits } from 'discord.js';
import { DISCORD_CONFIG } from '../config.js';
import { success, error as logError } from '../utils/logger.js';

/**
 * Создать и настроить Discord клиент
 */
export function createDiscordClient() {
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

  return client;
}

/**
 * Подключить Discord клиент
 */
export async function connectDiscord(client) {
  try {
    await client.login(DISCORD_CONFIG.TOKEN);
    success('Discord клиент подключен');
  } catch (err) {
    logError(`Ошибка подключения Discord: ${err.message}`);
    throw err;
  }
}
