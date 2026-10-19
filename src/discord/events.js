import { success, log } from '../utils/logger.js';
import { VoiceStateHandler } from './voice-handler.js';
import { MessageHandler } from './message-handler.js';
import { formatTime } from '../utils/time.js';

/**
 * Зарегистрировать все обработчики событий Discord
 */
export function registerDiscordEvents(client, db, achievements, telegram) {
  const voiceHandler = new VoiceStateHandler(db, achievements, telegram);
  const messageHandler = new MessageHandler(db, achievements, telegram, client);

  // Событие готовности
  client.once('clientReady', () => {
    success(`Discord бот запущен как ${client.user.tag}`);
    log(`Подключен к ${client.guilds.cache.size} серверам`);
    
    // Загружаем активные голосовые сессии из БД
    const guild = client.guilds.cache.first();
    if (guild) {
      voiceHandler.loadActiveSessions(guild);
    }
    
    // Graceful shutdown — сохраняем сессии при остановке
    const gracefulShutdown = () => {
      voiceHandler.saveActiveSessions();
    };
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  });

  // Голосовые события
  client.on('voiceStateUpdate', async (oldState, newState) => {
    await voiceHandler.handle(oldState, newState);
  });

  // Сообщения
  client.on('messageCreate', async (message) => {
    await messageHandler.handle(message);
    await handleMentions(message, db, telegram);
  });

  // Пользователь покинул сервер
  client.on('guildMemberRemove', async (member) => {
    try {
      if (member.user.bot) return;

      const userId = member.id;
      const username = member.displayName || member.user.username;
      const userTag = member.user.tag;

      log(`👋 Пользователь ${username} (${userId}) покинул сервер`);

      // Обновляем статус на сервере
      try {
        db.prepare('UPDATE user_stats SET is_on_server = 0 WHERE user_id = ?').run(userId);
      } catch (e) {
        log(`⚠️ Не удалось обновить is_on_server: ${e.message}`);
      }

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

  // Пользователь присоединился к серверу
  client.on('guildMemberAdd', async (member) => {
    try {
      if (member.user.bot) return;

      const userId = member.id;
      const username = member.displayName || member.user.username;

      log(`👋 Пользователь ${username} (${userId}) присоединился к серверу`);

      // Обновляем статус на сервере
      try {
        db.prepare('UPDATE user_stats SET is_on_server = 1 WHERE user_id = ?').run(userId);
      } catch (e) {
        log(`⚠️ Не удалось обновить is_on_server: ${e.message}`);
      }
    } catch (error) {
      log(`❌ Ошибка в guildMemberAdd: ${error.message}`);
    }
  });

  // Обработка ошибок
  client.on('error', (error) => {
    log(`❌ Discord client error: ${error.message}`);
  });

  success('Обработчики Discord событий зарегистрированы');
}

/**
 * Обработка упоминаний — отправка уведомлений в Telegram
 */
async function handleMentions(message, db, telegram) {
  try {
    // Игнорируем ботов и сообщения без упоминаний
    if (message.author.bot) return;
    if (message.mentions.users.size === 0) return;

    // Игнорируем @everyone / @here
    if (message.mentions.everyone) return;

    // Получаем список упомянутых пользователей
    const mentionedUsers = message.mentions.users;

    for (const [userId, user] of mentionedUsers) {
      // Пропускаем ботов
      if (user.bot) continue;

      // Проверяем настройку уведомлений об упоминаниях
      const mentionEnabled = db.getUserMentionNotificationSetting(userId);
      if (!mentionEnabled) continue;

      // Проверяем привязку Telegram
      const telegramChatId = db.getTelegramChatId(userId);
      if (!telegramChatId) continue;

      // Собираем информацию
      const mentionerName = message.member?.displayName || message.author.username;
      const channelName = message.channel.name || message.channel.id;
      const isThread = message.channel.isThread?.() || false;
      const channelType = isThread ? '🧵 ветка' : '📢 канал';

      // Текст сообщения (без пустых)
      let content = message.content || '';
      // Убираем упоминания для чистоты
      content = content.replace(/<@!?\d+>/g, '').trim();

      // Вложения
      const attachments = message.attachments?.filter(a => a.contentType?.startsWith('image/')) || [];
      const imageUrls = attachments.map(a => a.url);

      let msgText = `📢 <b>Вас упомянули в Discord</b>\n\n`;
      msgText += `👤 Кто: <b>${mentionerName}</b>\n`;
      msgText += `${channelType}: <b>#${channelName}</b>\n`;

      if (content) {
        msgText += `\n💬 <b>Сообщение:</b>\n${content}\n`;
      }

      if (imageUrls.length > 0) {
        msgText += `\n🖼️ <b>Вложений:</b> ${imageUrls.length} шт.\n`;
        msgText += imageUrls.map(url => `📎 <a href="${url}">Изображение</a>`).join('\n') + '\n';
      }

      msgText += `\n📅 ${new Date().toLocaleString('ru-RU')}`;

      await telegram.sendTelegramMessageToUser(telegramChatId, msgText);
    }
  } catch (error) {
    log(`❌ Ошибка обработки упоминаний: ${error.message}`);
  }
}
