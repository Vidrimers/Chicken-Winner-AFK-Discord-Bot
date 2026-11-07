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

  // Пользователь покинул сервер (уход / кик / бан)
  client.on('guildMemberRemove', async (member) => {
    try {
      if (member.user.bot) return;

      const userId = member.id;
      const username = member.displayName || member.user.username;
      const userTag = member.user.tag;

      // Обновляем статус на сервере
      try {
        db.prepare('UPDATE user_stats SET is_on_server = 0 WHERE user_id = ?').run(userId);
      } catch (e) {
        log(`⚠️ Не удалось обновить is_on_server: ${e.message}`);
      }

      const stats = db.getUserStats(userId);
      const removal = await detectRemovalReason(member.guild, userId);

      if (removal.type === 'ban') {
        log(`🔨 ${username} (${userId}) забанен`);
        await sendMemberCard(client, member, {
          type: 'ban',
          stats,
          executor: removal.executor,
          reason: removal.reason,
        });
        if (telegram) {
          await telegram.sendReport(
            `🔨 <b>Пользователь забанен</b>\n\n` +
            `👤 Имя: ${username}\n` +
            `🏷️ Тег: ${userTag}\n` +
            `🆔 ID: <code>${userId}</code>\n` +
            `🛡️ Забанил: ${removal.executor?.tag || removal.executor?.username || '—'}\n` +
            `📌 Причина: ${removal.reason || 'не указана'}\n` +
            `${buildStatsHtml(stats)}\n\n` +
            `📅 Время: ${formatTime(new Date())}`
          );
        }
      } else if (removal.type === 'kick') {
        log(`👢 ${username} (${userId}) кикнут`);
        await sendMemberCard(client, member, {
          type: 'kick',
          stats,
          executor: removal.executor,
          reason: removal.reason,
        });
        if (telegram) {
          await telegram.sendReport(
            `👢 <b>Пользователь кикнут</b>\n\n` +
            `👤 Имя: ${username}\n` +
            `🏷️ Тег: ${userTag}\n` +
            `🆔 ID: <code>${userId}</code>\n` +
            `🛡️ Кикнул: ${removal.executor?.tag || removal.executor?.username || '—'}\n` +
            `📌 Причина: ${removal.reason || 'не указана'}\n` +
            `${buildStatsHtml(stats)}\n\n` +
            `📅 Время: ${formatTime(new Date())}`
          );
        }
      } else {
        log(`👋 ${username} (${userId}) покинул сервер`);
        await sendMemberCard(client, member, {
          type: 'leave',
          stats,
        });
        if (telegram) {
          await telegram.sendReport(
            `👋 <b>Пользователь покинул сервер</b>\n\n` +
            `👤 Имя: ${username}\n` +
            `🏷️ Тег: ${userTag}\n` +
            `🆔 ID: <code>${userId}</code>${buildStatsHtml(stats)}\n\n` +
            `📅 Время: ${formatTime(new Date())}`
          );
        }
      }
    } catch (error) {
      log(`❌ Ошибка в guildMemberRemove: ${error.message}`);
    }
  });

  // Пользователь присоединился к серверу (первый раз / повторно)
  client.on('guildMemberAdd', async (member) => {
    try {
      if (member.user.bot) return;

      const userId = member.id;
      const username = member.displayName || member.user.username;
      const userTag = member.user.tag;

      // Определяем, был ли пользователь раньше — ДО обновления is_on_server
      const previousStats = db.getUserStats(userId);
      const isReturning = Boolean(previousStats);

      log(`👋 Пользователь ${username} (${userId}) ${isReturning ? 'вернулся' : 'впервые зашёл на сервер'}`);

      try {
        db.prepare('UPDATE user_stats SET is_on_server = 1 WHERE user_id = ?').run(userId);
      } catch (e) {
        log(`⚠️ Не удалось обновить is_on_server: ${e.message}`);
      }

      await sendMemberCard(client, member, {
        type: isReturning ? 'join_again' : 'join_first',
        stats: previousStats,
      });

      if (telegram) {
        if (isReturning) {
          await telegram.sendReport(
            `👋 <b>Пользователь снова с нами</b>\n\n` +
            `👤 Имя: ${username}\n` +
            `🏷️ Тег: ${userTag}\n` +
            `🆔 ID: <code>${userId}</code>${buildStatsHtml(previousStats)}\n\n` +
            `📅 Время: ${formatTime(new Date())}`
          );
        } else {
          await telegram.sendReport(
            `🎉 <b>Новый пользователь на сервере</b>\n\n` +
            `👤 Имя: ${username}\n` +
            `🏷️ Тег: ${userTag}\n` +
            `🆔 ID: <code>${userId}</code>\n\n` +
            `📅 Время: ${formatTime(new Date())}`
          );
        }
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
 * Статистика для Telegram (HTML)
 */
function buildStatsHtml(stats) {
  if (!stats) return '';
  const voiceHours = Math.floor((stats.total_voice_time || 0) / 3600);
  const voiceMinutes = Math.floor(((stats.total_voice_time || 0) % 3600) / 60);
  return (
    `\n\n📊 <b>Статистика пользователя:</b>\n` +
    `⏱️ Время в голосовых: ${voiceHours}ч ${voiceMinutes}м\n` +
    `🎤 Всего сессий: ${stats.total_sessions || 0}\n` +
    `😴 Перемещений в AFK: ${stats.total_afk_moves || 0}\n` +
    `⭐ Очки рейтинга: ${stats.rank_points || 0}\n` +
    `💬 Сообщений: ${stats.messages_sent || 0}`
  );
}

/**
 * Статистика для Discord-embed
 */
function buildStatsField(stats, { isFirstVisit = false } = {}) {
  if (isFirstVisit || !stats) {
    return '🎉 Это его первый визит — статистика только начнётся!';
  }
  const voiceHours = Math.floor((stats.total_voice_time || 0) / 3600);
  const voiceMinutes = Math.floor(((stats.total_voice_time || 0) % 3600) / 60);
  return (
    `⏱️ В голосовых: **${voiceHours}ч ${voiceMinutes}м**\n` +
    `🎤 Сессий: **${stats.total_sessions || 0}**\n` +
    `😴 В AFK: **${stats.total_afk_moves || 0}**\n` +
    `⭐ Очки: **${stats.rank_points || 0}**\n` +
    `💬 Сообщений: **${stats.messages_sent || 0}**`
  );
}

/**
 * Определить причину ухода: leave / kick / ban (по audit log)
 */
async function detectRemovalReason(guild, userId) {
  try {
    const { AuditLogEvent } = await import('discord.js');
    const now = Date.now();
    const logs = await guild.fetchAuditLogs({ limit: 8 });

    const entry = logs.entries.find((e) => {
      const age = now - e.createdTimestamp;
      if (age > 10000) return false;
      if (e.target?.id !== userId) return false;
      return (
        e.action === AuditLogEvent.MemberKick ||
        e.action === AuditLogEvent.MemberBanAdd
      );
    });

    if (!entry) return { type: 'leave' };
    if (entry.action === AuditLogEvent.MemberBanAdd) {
      return { type: 'ban', executor: entry.executor, reason: entry.reason };
    }
    return { type: 'kick', executor: entry.executor, reason: entry.reason };
  } catch (error) {
    log(`⚠️ Не удалось получить audit log: ${error.message}`);
    return { type: 'leave' };
  }
}

/**
 * Универсальная карточка участника в Discord
 * type: join_first | join_again | leave | kick | ban
 */
async function sendMemberCard(client, member, { type, stats, executor, reason }) {
  const channelId = DISCORD_CONFIG.LEAVE_ANNOUNCE_CHANNEL_ID;
  if (!channelId) return;

  try {
    const { EmbedBuilder, AttachmentBuilder } = await import('discord.js');
    const path = await import('path');

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      log(`⚠️ Канал для анонсов не найден: ${channelId}`);
      return;
    }

    const presets = {
      join_first: {
        title: 'Приветики',
        color: 0x2ecc71,
        image: 'privet.jpg',
        description:
          `Добро пожаловать в Chicken Winner, <@${member.id}>! 🐔\n\n` +
          `Ты только что стал частью команды.\n` +
          `Заходи в голосовые — твоё время в AFK идёт в статистику.\n` +
          `Выполняй достижения, набирай рейтинг и поднимайся в топе.\n\n` +
          `Рады видеть тебя с нами!`,
      },
      join_again: {
        title: 'Снова с нами',
        color: 0x3498db,
        image: 'again.jpg',
        description: `С возвращением, <@${member.id}>! 👋\nПродолжай в том же духе.`,
      },
      leave: {
        title: 'Покинул сервер',
        color: 0x2f3136,
        image: 'press-f.jpg',
        description: null,
      },
      kick: {
        title: 'Кикнут с сервера',
        color: 0xe67e22,
        image: 'kick.jpg',
        description: null,
      },
      ban: {
        title: 'Забанен',
        color: 0x8b0000,
        image: 'ban.jpg',
        description: null,
      },
    };

    const preset = presets[type];
    if (!preset) return;

    const embed = new EmbedBuilder()
      .setColor(preset.color)
      .setTitle(preset.title)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👤 Имя', value: member.displayName || member.user.username, inline: true },
        { name: '🏷️ Тег', value: member.user.tag || '—', inline: true },
        { name: '🆔 ID', value: `\`${member.id}\``, inline: true },
        {
          name: '📊 Статистика',
          value: buildStatsField(stats, { isFirstVisit: type === 'join_first' }),
        }
      )
      .setImage(`attachment://${preset.image}`)
      .setTimestamp();

    if (preset.description) {
      embed.setDescription(preset.description);
    }

    if (executor) {
      const executorLabel = type === 'ban' ? '🛡️ Забанил' : '🛡️ Кикнул';
      embed.addFields({
        name: executorLabel,
        value: `${executor.tag || executor.username || '—'}\n📌 Причина: ${reason || 'не указана'}`,
      });
    }

    const imagePath = path.resolve('img', preset.image);
    const attachment = new AttachmentBuilder(imagePath, { name: preset.image });

    // content с упоминанием — для join, чтобы пинговать пользователя
    const content = type === 'join_first' || type === 'join_again' ? `<@${member.id}>` : null;

    await channel.send({ content, embeds: [embed], files: [attachment] });
  } catch (error) {
    log(`❌ Ошибка отправки карточки (${type}): ${error.message}`);
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
