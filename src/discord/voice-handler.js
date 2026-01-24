import { DISCORD_CONFIG, TIMEOUTS } from '../config.js';
import { formatTime } from '../utils/time.js';
import { log, error as logError } from '../utils/logger.js';

/**
 * Хранилище времени присоединения пользователей
 */
export const userJoinTimes = new Map();
export const userOriginalChannels = new Map();
export const userAFKStartTimes = new Map();
export const userStreamJoinTimes = new Map();
export const inactivityTimers = new Map();

/**
 * Класс для обработки голосовых событий
 */
export class VoiceStateHandler {
  constructor(db, achievements, telegram) {
    this.db = db;
    this.achievements = achievements;
    this.telegram = telegram;
  }

  /**
   * Обработать событие voiceStateUpdate
   */
  async handle(oldState, newState) {
    try {
      const member = newState.member;
      const userId = member.id;
      const username = member.displayName || member.user.username;

      if (member.user.bot) return;

      // Инициализируем пользователя
      await this.initUser(userId, username, member);

      // Проверяем выход из AFK канала
      if (
        oldState.channel?.id === DISCORD_CONFIG.AFK_CHANNEL_ID &&
        newState.channel?.id !== DISCORD_CONFIG.AFK_CHANNEL_ID
      ) {
        await this.handleAfkExit(userId);
      }

      // Пользователь присоединился к каналу
      if (!oldState.channel && newState.channel) {
        await this.handleJoin(userId, username, newState);
        return;
      }

      // Пользователь покинул канал
      if (oldState.channel && !newState.channel) {
        await this.handleLeave(userId, username, oldState);
        return;
      }

      // Пользователь переместился между каналами
      if (
        oldState.channel &&
        newState.channel &&
        oldState.channel.id !== newState.channel.id
      ) {
        await this.handleMove(userId, username, oldState, newState);
        return;
      }

      // Изменение состояния микрофона
      if (newState.selfMute && !oldState.selfMute) {
        await this.handleMute(userId, username, member, newState);
        return;
      }

      if (!newState.selfMute && oldState.selfMute) {
        await this.handleUnmute(userId, username, newState);
        return;
      }

      // Изменение состояния трансляции
      if (newState.streaming && !oldState.streaming) {
        await this.handleStreamStart(userId, username, newState);
        return;
      }

      if (!newState.streaming && oldState.streaming) {
        await this.handleStreamStop(userId, username, newState);
        return;
      }
    } catch (err) {
      logError(`Ошибка в voiceStateUpdate: ${err.message}`);
    }
  }

  /**
   * Инициализировать пользователя
   */
  async initUser(userId, username, member) {
    const existingUser = this.db.getUserStats(userId);
    
    let needsAvatar = !existingUser || 
                      !existingUser.avatar_url || 
                      existingUser.avatar_url.includes('nopic.png');

    let localAvatarPath = '/avatars/nopic.png';
    
    if (needsAvatar) {
      const discordAvatarUrl = member.user.displayAvatarURL({
        format: 'png',
        size: 128,
      });
      localAvatarPath = await this.downloadAvatar(userId, discordAvatarUrl);
    }

    this.db.initUserStats(userId, username, needsAvatar ? localAvatarPath : null);
  }

  /**
   * Обработать выход из AFK
   */
  async handleAfkExit(userId) {
    const afkStartTime = userAFKStartTimes.get(userId);
    if (afkStartTime) {
      const afkDuration = Math.floor((Date.now() - afkStartTime) / 1000);
      this.db.incrementUserStat(userId, 'total_afk_time', afkDuration);
      userAFKStartTimes.delete(userId);
    }
  }

  /**
   * Обработать присоединение к каналу
   */
  async handleJoin(userId, username, newState) {
    const joinTime = new Date();
    userJoinTimes.set(userId, joinTime.getTime());

    log(`🎤 ${username} присоединился к ${newState.channel.name}`);

    this.db.incrementUserStat(userId, 'total_sessions');

    // Проверяем если зашел сразу в AFK
    if (newState.channel.id === DISCORD_CONFIG.AFK_CHANNEL_ID) {
      this.db.incrementUserStat(userId, 'total_afk_moves');
      userAFKStartTimes.set(userId, Date.now());
      log(`😴 ${username} зашел в AFK канал сам`);
    }

    // Отслеживаем стрим-канал
    if (newState.channel.id === DISCORD_CONFIG.STREAM_CHANNEL_ID) {
      userStreamJoinTimes.set(userId, Date.now());
    }

    // Проверяем достижение "Первый шаг"
    const stats = this.db.getUserStats(userId);
    if (stats && stats.total_sessions === 1) {
      await this.achievements.checkAndUnlock(userId, username, 'first_join');
    }

    await this.achievements.checkAll(userId, username);

    // Отправляем уведомления
    if (this.telegram) {
      await this.telegram.sendReport(
        `🎤 <b>Пользователь зашел в канал</b>\n` +
        `👤 Пользователь: ${username}\n` +
        `🆔 ID: <code>${userId}</code>\n` +
        `📺 Канал: ${newState.channel.name}\n` +
        `📅 Время захода: ${formatTime(joinTime)}`
      );

      await this.telegram.notifyChannelActivity(
        `🎤 <b>${username}</b> зашел в канал <b>${newState.channel.name}</b>`
      );
    }

    if (newState.selfMute) {
      this.startInactivityTimer(newState.member, newState.guild);
    }
  }

  /**
   * Обработать выход из канала
   */
  async handleLeave(userId, username, oldState) {
    log(`👋 ${username} покинул голосовой канал`);

    // Проверяем AFK время
    if (oldState.channel.id === DISCORD_CONFIG.AFK_CHANNEL_ID) {
      const afkStartTime = userAFKStartTimes.get(userId);
      if (afkStartTime) {
        const afkDuration = Math.floor((Date.now() - afkStartTime) / 1000);
        this.db.incrementUserStat(userId, 'total_afk_time', afkDuration);
      }
    }

    // Обновляем время в голосовых каналах
    const joinTime = userJoinTimes.get(userId);
    if (joinTime) {
      const sessionDuration = Math.floor((Date.now() - joinTime) / 1000);
      this.db.incrementUserStat(userId, 'total_voice_time', sessionDuration);

      // Обновляем самую длинную сессию
      const currentStats = this.db.getUserStats(userId);
      if (currentStats && sessionDuration > (currentStats.longest_session || 0)) {
        this.db.updateUserStats(userId, 'longest_session', sessionDuration);
      }

      await this.achievements.checkAll(userId, username);
    }

    // Обновляем время в стрим-канале
    const streamJoinTime = userStreamJoinTimes.get(userId);
    if (streamJoinTime && oldState.channel.id === DISCORD_CONFIG.STREAM_CHANNEL_ID) {
      const streamDuration = Math.floor((Date.now() - streamJoinTime) / 1000);
      this.db.incrementUserStat(userId, 'stream_channel_time', streamDuration);
      userStreamJoinTimes.delete(userId);
      await this.achievements.checkAll(userId, username);
    }

    // Отправляем уведомления
    if (this.telegram) {
      await this.telegram.sendReport(
        `👋 <b>Пользователь покинул канал</b>\n` +
        `👤 Пользователь: ${username}\n` +
        `🆔 ID: <code>${userId}</code>\n` +
        `📺 Канал: ${oldState.channel.name}\n` +
        `📅 Время: ${formatTime(new Date())}`
      );

      await this.telegram.notifyChannelActivity(
        `👋 <b>${username}</b> вышел из канала <b>${oldState.channel.name}</b>`
      );
    }

    this.clearInactivityTimer(userId);
    userJoinTimes.delete(userId);
    userOriginalChannels.delete(userId);
    userAFKStartTimes.delete(userId);
    userStreamJoinTimes.delete(userId);
  }

  /**
   * Обработать перемещение между каналами
   */
  async handleMove(userId, username, oldState, newState) {
    log(`🔄 ${username} переместился из ${oldState.channel.name} в ${newState.channel.name}`);

    // Учитываем AFK время при переходе ИЗ AFK
    if (oldState.channel.id === DISCORD_CONFIG.AFK_CHANNEL_ID) {
      const afkStartTime = userAFKStartTimes.get(userId);
      if (afkStartTime) {
        const afkDuration = Math.floor((Date.now() - afkStartTime) / 1000);
        this.db.incrementUserStat(userId, 'total_afk_time', afkDuration);
        userAFKStartTimes.delete(userId);
      }
    }

    // Если новый канал это AFK
    if (newState.channel.id === DISCORD_CONFIG.AFK_CHANNEL_ID) {
      this.db.incrementUserStat(userId, 'total_afk_moves');
      userAFKStartTimes.set(userId, Date.now());
      log(`😴 ${username} переместился в AFK канал сам`);
    } else {
      userAFKStartTimes.delete(userId);
    }

    // Отправляем уведомления
    if (this.telegram) {
      await this.telegram.sendReport(
        `🔄 <b>Пользователь переместился между каналами</b>\n` +
        `👤 Пользователь: ${username}\n` +
        `🆔 ID: <code>${userId}</code>\n` +
        `📺 Из канала: ${oldState.channel.name}\n` +
        `📺 В канал: ${newState.channel.name}\n` +
        `📅 Время: ${formatTime(new Date())}`
      );
    }

    userJoinTimes.set(userId, new Date().getTime());

    // Обрабатываем стрим-канал
    const streamJoinTime = userStreamJoinTimes.get(userId);
    if (streamJoinTime && oldState.channel.id === DISCORD_CONFIG.STREAM_CHANNEL_ID) {
      const streamDuration = Math.floor((Date.now() - streamJoinTime) / 1000);
      this.db.incrementUserStat(userId, 'stream_channel_time', streamDuration);
      userStreamJoinTimes.delete(userId);
      await this.achievements.checkAll(userId, username);
    }

    if (newState.channel.id === DISCORD_CONFIG.STREAM_CHANNEL_ID) {
      userStreamJoinTimes.set(userId, Date.now());
    }

    if (newState.selfMute) {
      this.clearInactivityTimer(userId);
      this.startInactivityTimer(newState.member, newState.guild);
    } else {
      this.clearInactivityTimer(userId);
    }
  }

  /**
   * Обработать отключение микрофона
   */
  async handleMute(userId, username, member, newState) {
    const userTimeout = this.db.getUserTimeout(userId);
    const dmEnabled = this.db.getUserDMSetting(userId);

    let timeoutDisplay;
    if (userTimeout < 15) {
      timeoutDisplay = userTimeout + ' секунд';
    } else {
      timeoutDisplay = userTimeout + ' минут';
    }

    log(`🎙️❌ ${username} отключил микрофон`);
    this.clearInactivityTimer(userId);
    this.startInactivityTimer(member, newState.guild);

    this.db.incrementUserStat(userId, 'total_mute_toggles');
    await this.achievements.checkAll(userId, username);

    if (this.telegram) {
      await this.telegram.sendReport(
        `🎙️❌ <b>Пользователь отключил микрофон</b>\n` +
        `👤 Пользователь: ${username}\n` +
        `🆔 ID: <code>${userId}</code>\n` +
        `📺 Канал: ${newState.channel.name}\n` +
        `⏱️ Запущен таймер на: ${timeoutDisplay}\n` +
        `📩 ЛС уведомления: ${dmEnabled ? '✅ включены' : '❌ отключены'}\n` +
        `📅 Время: ${formatTime(new Date())}`
      );
    }

    if (dmEnabled) {
      await member.send(
        `🎙️❌ Похоже ты решил побыть AFK, раз отключил микрофон, через ${timeoutDisplay} ты окажешься в токсичном канале, подумай об этом\n\n💡 Чтобы отключить эти уведомления, напиши \`.!.\` на сервере`
      ).catch(() => {
        log(`❌ Не удалось отправить ЛС пользователю ${username}`);
      });
    }
  }

  /**
   * Обработать включение микрофона
   */
  async handleUnmute(userId, username, newState) {
    log(`🎙️✅ ${username} включил микрофон`);
    this.clearInactivityTimer(userId);

    this.db.incrementUserStat(userId, 'total_mute_toggles');
    await this.achievements.checkAll(userId, username);

    if (this.telegram) {
      await this.telegram.sendReport(
        `🎙️✅ <b>Пользователь включил микрофон</b>\n` +
        `👤 Пользователь: ${username}\n` +
        `🆔 ID: <code>${userId}</code>\n` +
        `📺 Канал: ${newState.channel.name}\n` +
        `🛑 Таймер остановлен\n` +
        `📅 Время: ${formatTime(new Date())}`
      );
    }

    // Возвращаем из AFK если нужно
    const originalChannelId = userOriginalChannels.get(userId);
    if (originalChannelId && newState.channel?.id === DISCORD_CONFIG.AFK_CHANNEL_ID) {
      const originalChannel = newState.guild.channels.cache.get(originalChannelId);
      if (originalChannel?.type === 2) {
        try {
          await newState.member.voice.setChannel(originalChannel);
          log(`✅ ${username} возвращен в ${originalChannel.name}`);

          if (this.telegram) {
            await this.telegram.sendReport(
              `↩️ <b>Пользователь возвращен из AFK</b>\n` +
              `👤 Пользователь: ${username}\n` +
              `📺 Из канала: 😡 Токсичный канал\n` +
              `📺 В канал: ${originalChannel.name}\n` +
              `📅 Время: ${formatTime(new Date())}`
            );
          }

          userOriginalChannels.delete(userId);
        } catch (err) {
          logError(`Ошибка при возврате из AFK: ${err.message}`);
        }
      }
    }
  }

  /**
   * Обработать начало трансляции
   */
  async handleStreamStart(userId, username, newState) {
    log(`📡 ${username} включил трансляцию`);

    this.db.incrementUserStat(userId, 'total_streams');

    const streamStats = this.db.getUserStats(userId);
    if (streamStats && streamStats.total_streams === 1) {
      await this.achievements.checkAndUnlock(userId, username, 'first_stream');
    }

    await this.achievements.checkAll(userId, username);

    if (this.telegram) {
      await this.telegram.sendReport(
        `📡 <b>Пользователь включил трансляцию</b>\n` +
        `👤 Пользователь: ${username}\n` +
        `🆔 ID: <code>${userId}</code>\n` +
        `📺 Канал: ${newState.channel.name}\n` +
        `📅 Время: ${formatTime(new Date())}`
      );

      await this.telegram.notifyChannelActivity(
        `📡 <b>${username}</b> включил трансляцию в канале <b>${newState.channel.name}</b>`
      );
    }
  }

  /**
   * Обработать окончание трансляции
   */
  async handleStreamStop(userId, username, newState) {
    log(`📡❌ ${username} отключил трансляцию`);

    if (this.telegram) {
      await this.telegram.sendReport(
        `📡❌ <b>Пользователь отключил трансляцию</b>\n` +
        `👤 Пользователь: ${username}\n` +
        `🆔 ID: <code>${userId}</code>\n` +
        `📺 Канал: ${newState.channel.name}\n` +
        `📅 Время: ${formatTime(new Date())}`
      );

      await this.telegram.notifyChannelActivity(
        `📡❌ <b>${username}</b> отключил трансляцию в канале <b>${newState.channel.name}</b>`
      );
    }
  }

  /**
   * Запустить таймер неактивности
   */
  startInactivityTimer(member, guild) {
    const userId = member.id;
    const username = member.displayName || member.user.username;
    const userTimeout = this.db.getUserTimeout(userId);

    let timeoutMs;
    let timeoutDisplay;

    if (userTimeout < 15) {
      timeoutMs = userTimeout * 1000;
      timeoutDisplay = userTimeout + ' секунд';
    } else {
      timeoutMs = userTimeout * 60 * 1000;
      timeoutDisplay = userTimeout + ' минут';
    }

    log(`⏰ Таймер неактивности для ${username}: ${timeoutDisplay}`);

    const AFK_CHANNEL = guild.channels.cache.get(DISCORD_CONFIG.AFK_CHANNEL_ID);

    if (!AFK_CHANNEL || AFK_CHANNEL.type !== 2) {
      logError(`❌ AFK канал не найден или не является голосовым`);
      return;
    }

    this.clearInactivityTimer(userId);

    const timeoutId = setTimeout(async () => {
      try {
        const currentMember = guild.members.cache.get(userId);

        if (currentMember && currentMember.voice.channel) {
          if (!currentMember.voice.selfMute) {
            log(`🎙️ ${username} включил микрофон, отменяем перемещение в AFK`);
            return;
          }

          const originalChannelName = currentMember.voice.channel.name;
          userOriginalChannels.set(userId, currentMember.voice.channel.id);
          userAFKStartTimes.set(userId, Date.now());

          await currentMember.voice.setChannel(AFK_CHANNEL);

          this.db.incrementUserStat(userId, 'total_afk_moves');

          const stats = this.db.getUserStats(userId);
          if (stats && stats.total_afk_moves === 1) {
            await this.achievements.checkAndUnlock(userId, username, 'first_afk');
          }

          await this.achievements.checkAll(userId, username);

          log(`😴 ${username} перемещен в AFK канал`);

          if (this.telegram) {
            await this.telegram.sendReport(
              `😴 <b>Пользователь перемещен в AFK</b>\n` +
              `👤 Пользователь: ${username}\n` +
              `🆔 ID: <code>${userId}</code>\n` +
              `📺 Из канала: ${originalChannelName}\n` +
              `📺 В канал: ${AFK_CHANNEL.name}\n` +
              `⏱️ Время неактивности: ${timeoutDisplay}\n` +
              `📅 Время: ${formatTime(new Date())}`
            );
          }

          const dmEnabled = this.db.getUserDMSetting(userId);
          if (dmEnabled) {
            await currentMember.send(
              `😴 Ты был перемещен в AFK канал из-за неактивности (${timeoutDisplay})\n\n💡 Включи микрофон, чтобы вернуться обратно`
            ).catch(() => {
              log(`❌ Не удалось отправить ЛС пользователю ${username}`);
            });
          }
        }
      } catch (err) {
        logError(`Ошибка при перемещении в AFK: ${err.message}`);
      }
    }, timeoutMs);

    inactivityTimers.set(userId, timeoutId);
  }

  /**
   * Очистить таймер неактивности
   */
  clearInactivityTimer(userId) {
    const timerId = inactivityTimers.get(userId);
    if (timerId) {
      clearTimeout(timerId);
      inactivityTimers.delete(userId);
    }
  }

  /**
   * Скачать аватар пользователя
   */
  async downloadAvatar(userId, avatarUrl) {
    try {
      if (!avatarUrl || avatarUrl.includes('nopic.png') || avatarUrl.startsWith('/avatars/')) {
        return '/avatars/nopic.png';
      }

      const fs = await import('fs');
      const path = await import('path');
      const https = await import('https');

      const avatarsDir = './avatars';
      if (!fs.existsSync(avatarsDir)) {
        fs.mkdirSync(avatarsDir, { recursive: true });
      }

      const localPath = path.join(avatarsDir, `${userId}.png`);

      return new Promise((resolve) => {
        https.get(avatarUrl, (response) => {
          const fileStream = fs.createWriteStream(localPath);
          response.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve(`/avatars/${userId}.png`);
          });
        }).on('error', () => {
          resolve('/avatars/nopic.png');
        });
      });
    } catch (err) {
      return '/avatars/nopic.png';
    }
  }
}
