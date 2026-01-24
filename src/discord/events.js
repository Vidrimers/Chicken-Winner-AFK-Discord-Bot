import { success, log } from '../utils/logger.js';
import { VoiceStateHandler } from './voice-handler.js';
import { MessageHandler } from './message-handler.js';

/**
 * Зарегистрировать все обработчики событий Discord
 */
export function registerDiscordEvents(client, db, achievements, telegram) {
  const voiceHandler = new VoiceStateHandler(db, achievements, telegram);
  const messageHandler = new MessageHandler(db, achievements, telegram);

  // Событие готовности
  client.once('ready', () => {
    success(`Discord бот запущен как ${client.user.tag}`);
    log(`Подключен к ${client.guilds.cache.size} серверам`);
  });

  // Голосовые события
  client.on('voiceStateUpdate', async (oldState, newState) => {
    await voiceHandler.handle(oldState, newState);
  });

  // Сообщения
  client.on('messageCreate', async (message) => {
    await messageHandler.handle(message);
  });

  // Обработка ошибок
  client.on('error', (error) => {
    log(`❌ Discord client error: ${error.message}`);
  });

  success('Обработчики Discord событий зарегистрированы');
}
