import { success, log } from '../utils/logger.js';
import { VoiceStateHandler } from './voice-handler.js';
import { MessageHandler } from './message-handler.js';
import { formatTime } from '../utils/time.js';
import { DISCORD_CONFIG } from '../config.js';

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

      // Публикуем анонс в Discord-канал (Press F)
      await sendLeaveAnnouncement(client, member, stats);
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
 * Анонс об уходе с сервера в Discord-канал (Press F to pay respect)
 */
async function sendLeaveAnnouncement(client, member, stats) {
  const channelId = DISCORD_CONFIG.LEAVE_ANNOUNCE_CHANNEL_ID;
  if (!channelId) return;

  try {
    const { EmbedBuilder, AttachmentBuilder } = await import('discord.js');
    const path = await import('path');

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      log(`⚠️ Канал для анонсов об уходе не найден: ${channelId}`);
      return;
    }

    const voiceHours = Math.floor((stats?.total_voice_time || 0) / 3600);
    const voiceMinutes = Math.floor(((stats?.total_voice_time || 0) % 3600) / 60);

    const embed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle('Покинул сервер')
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👤 Имя', value: member.displayName || member.user.username, inline: true },
        { name: '🏷️ Тег', value: member.user.tag || '—', inline: true },
        { name: '🆔 ID', value: `\`${member.id}\``, inline: true },
        {
          name: '📊 Статистика',
          value:
            `⏱️ В голосовых: **${voiceHours}ч ${voiceMinutes}м**\n` +
            `🎤 Сессий: **${stats?.total_sessions || 0}**\n` +
            `😴 В AFK: **${stats?.total_afk_moves || 0}**\n` +
            `⭐ Очки: **${stats?.rank_points || 0}**\n` +
            `💬 Сообщений: **${stats?.messages_sent || 0}**`,
        }
      )
      .setImage('attachment://press-f.jpg')
      .setTimestamp();

    const imagePath = path.resolve('img', 'press-f.jpg');
    const attachment = new AttachmentBuilder(imagePath, { name: 'press-f.jpg' });

    await channel.send({ embeds: [embed], files: [attachment] });
  } catch (error) {
    log(`❌ Ошибка отправки анонса об уходе: ${error.message}`);
  }
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
      const attachments = message.attachments?.filter(a => {
        const ct = a.contentType || '';
        return ct.startsWith('image/') || ct.startsWith('video/');
      }) || [];

      // Разделяем по типам
      const imageAttachments = attachments.filter(a => (a.contentType || '').startsWith('image/'));
      const videoAttachments = attachments.filter(a => {
        const ct = a.contentType || '';
        if (ct === 'image/gif' || ct === 'image/apng') return true; // GIF через sendAnimation
        return ct.startsWith('video/');
      });
      // GIF (image/gif) считаем анимацией
      const gifAttachments = attachments.filter(a => (a.contentType || '') === 'image/gif');

      let msgText = `📢 <b>Вас упомянули в Discord</b>\n\n`;
      msgText += `👤 Кто: <b>${mentionerName}</b>\n`;
      msgText += `${channelType}: <b>#${channelName}</b>\n`;

      if (content) {
        msgText += `\n💬 <b>Сообщение:</b>\n${content}\n`;
      }

      msgText += `\n📅 ${new Date().toLocaleString('ru-RU')}`;

      // Inline кнопка "Ответить"
      const replyMarkup = {
        inline_keyboard: [
          [{ text: '💬 Ответить', callback_data: `mention_reply:${message.channel.id}:${message.id}` }]
        ]
      };

      // Отправляем уведомление
      await telegram.sendTelegramMessageToUser(telegramChatId, msgText, replyMarkup);

      // Отправляем картинки через sendPhoto
      if (imageAttachments.length > 0) {
        await telegram.sendTelegramPhotosToUser(telegramChatId, imageAttachments.map(a => a.url));
      }

      // Отправляем видео через sendVideo (≤50 МБ), иначе ссылкой
      if (videoAttachments.length > 0) {
        await telegram.sendTelegramVideosToUser(telegramChatId, videoAttachments.map(a => ({ url: a.url, size: a.size })));
      }

      // Отправляем GIF через sendAnimation
      if (gifAttachments.length > 0) {
        await telegram.sendTelegramGifsToUser(telegramChatId, gifAttachments.map(a => a.url));
      }
    }
  } catch (error) {
    log(`❌ Ошибка обработки упоминаний: ${error.message}`);
  }
}
