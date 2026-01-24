import { success, log } from '../utils/logger.js';
import { VoiceStateHandler } from './voice-handler.js';
import { MessageHandler } from './message-handler.js';
import { formatTime } from '../utils/time.js';

/**
 * Зарегистрировать все обработчики событий Discord
 */
export function registerDiscordEvents(client, db, achievements, telegram) {
  const voiceHandler = new VoiceStateHandler(db, achievements, telegram);
  const messageHandler = new MessageHandler(db, achievements, telegram);

  // Событие готовности
  client.once('clientReady', () => {
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

  // Пользователь покинул сервер
  client.on('guildMemberRemove', async (member) => {
    try {
      if (member.user.bot) return;

      const userId = member.id;
      const username = member.displayName || member.user.username;
      const userTag = member.user.tag;

      log(`👋 Пользователь ${username} (${userId}) покинул сервер`);

      // Получаем статистику пользователя
      const stats = db.getUserStats(userId);
      
      let statsText = '';
      if (stats) {
        const voiceHours = Math.floor((stats.total_voice_time || 0) / 3600);
        const voiceMinutes = Math.floor(((stats.total_voice_time || 0) % 3600) / 60);
        
        statsText = 
          `\n\n📊 <b>Статистика пользователя:</b>\n` +
          `⏱️ Время в голосовых: ${voiceHours}ч ${voiceMinutes}м\n` +
          `🎤 Всего сессий: ${stats.total_sessions || 0}\n` +
          `😴 Перемещений в AFK: ${stats.total_afk_moves || 0}\n` +
          `⭐ Очки рейтинга: ${stats.rank_points || 0}\n` +
          `💬 Сообщений: ${stats.messages_sent || 0}`;
      }

      // Отправляем уведомление админу
      if (telegram) {
        await telegram.sendReport(
          `👋 <b>Пользователь покинул сервер</b>\n\n` +
          `👤 Имя: ${username}\n` +
          `🏷️ Тег: ${userTag}\n` +
          `🆔 ID: <code>${userId}</code>${statsText}\n\n` +
          `📅 Время: ${formatTime(new Date())}`
        );
      }
    } catch (error) {
      log(`❌ Ошибка в guildMemberRemove: ${error.message}`);
    }
  });

  // Обработка ошибок
  client.on('error', (error) => {
    log(`❌ Discord client error: ${error.message}`);
  });

  success('Обработчики Discord событий зарегистрированы');
}
