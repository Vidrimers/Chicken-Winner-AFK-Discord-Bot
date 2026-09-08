import dotenv from 'dotenv';
import { validateConfig, SERVER_CONFIG } from './config.js';
import { success, log, error as logError } from './utils/logger.js';
import { DatabaseManager } from './database/index.js';
import { GamesDatabase } from './database/games-db.js';
import { PriceNotificationService } from './services/price-notification.js';
import { AchievementSystem } from './achievements/index.js';
import { AchievementNotificationService } from './achievements/notifications.js';
import { AchievementChecker } from './achievements/checker.js';
import { createDiscordClient, connectDiscord } from './discord/client.js';
import { registerDiscordEvents } from './discord/events.js';
import { createExpressServer, startServer } from './api/server.js';
import { registerRoutes } from './api/routes/index.js';
import { 
  initTelegramBot, 
  sendBotStatusNotification,
  sendTelegramReport,
  sendAchievementNotification,
  sendSettingsChangeNotification,
  sendTelegramMessageToUser,
  sendProfileViewNotification,
  sendAchievementDeleteNotification,
  sendUserDeleteNotification,
  sendSpecialAchievementNotification,
  sendBlocklistAddNotification,
  sendNewCheaterNotification,
  backfillTelegramUsernames
} from '../telegram.js';

// Загружаем переменные окружения
dotenv.config();

/**
 * Форматирует детали банов для CheatWatcher комментария (английский)
 */
function formatCheatWatcherBanDetails(profile) {
  const vac = profile.vacBanned ?? false;
  const vacCount = profile.numberOfVacBans || 0;
  const gameBans = profile.numberOfGameBans || 0;
  const days = profile.daysSinceLastBan || 0;
  const community = profile.communityBanned ?? false;
  const economy = profile.economyBan || 'none';

  return [
    `• VAC Ban: ${vac ? `Yes (${vacCount} ban${vacCount !== 1 ? 's' : ''})` : 'No'}`,
    `• Game Bans: ${gameBans > 0 ? gameBans : 'No'}`,
    `• Days Since Last Ban: ${(vac || gameBans > 0) ? days : '—'}`,
    `• Community Ban: ${community ? 'Yes' : 'No'}`,
    `• Trade Ban: ${economy !== 'none' ? economy : 'No'}`,
  ].join('\n');
}

// ===== BAN CHECK STATE =====
export const banCheckState = {
  isChecking: false,
  startedAt: null,
  scheduledTimer: null,
};

/**
 * Собирает уведомления для пользователей (свои + чужие) в массив
 */
function collectUserNotifications(db, existing, message) {
  const notifications = [];

  // Уведомление тому, кто добавил профиль
  if (existing.checked_by_discord_id) {
    const ownEnabled = db.getUserCheaterOwnNotificationSetting(existing.checked_by_discord_id);
    if (ownEnabled) {
      const chatId = db.getTelegramChatId(existing.checked_by_discord_id);
      if (chatId && chatId.toString() !== (process.env.TELEGRAM_CHAT_ID || '')) {
        notifications.push({ type: 'user', chatId, message, countAs: 'own' });
      }
    }
  }

  // Уведомление подписчикам "чужие читеры"
  const otherSubscribers = db.getUsersSubscribedToOthersCheaterNotifications();
  for (const subscriber of otherSubscribers) {
    if (subscriber.user_id === existing.checked_by_discord_id) continue;
    notifications.push({ type: 'user', chatId: subscriber.telegram_chat_id, message, countAs: 'others' });
  }

  return notifications;
}

/**
 * Запуск проверки банов. Вызывается из setInterval (auto) и API (manual).
 * Возвращает результат или null если уже идёт проверка.
 */
export async function runBanCheck(db, sendTelegramReport, sendTelegramMessageToUser) {
  if (banCheckState.isChecking) return null;

  banCheckState.isChecking = true;
  banCheckState.startedAt = Date.now();

  try {
    log('🔄 Перепроверка профилей из БД...');
    const { checkProfiles, resolveVanityUrl } = await import('./steam/steamApi.js');

    const batchSize = 20;
    const delayMs = 3000;
    let offset = 0;
    let totalChecked = 0;
    let updated = 0;
    let notified = 0;
    let notifiedOthers = 0;
    let lastProgressReport = 0;

    // Очередь уведомлений — собираем во время проверки, отправляем после
    const notificationQueue = [];

    // Уведомление админу о начале проверки
    const totalCount = db.getCheaterChecksCount('all');
    await sendTelegramReport(`🔍 <b>Начата проверка читеров</b>\n📊 Всего профилей: ${totalCount}`);

    while (true) {
      const batch = db.getCheaterChecks({ limit: batchSize, offset, filter: 'all' });
      if (batch.length === 0) break;

      // Предварительная проверка vanity URL для профилей с original_vanity_url
      const vanityChanges = new Map();
      const profilesToCheck = batch.filter(p => p.original_vanity_url);
      for (const existing of profilesToCheck) {
        try {
          const resolvedId = await resolveVanityUrl(existing.original_vanity_url);
          if (resolvedId !== existing.steam_id) {
            vanityChanges.set(existing.steam_id, { type: 'changed', resolvedId });
          }
        } catch (err) {
          if (err.message.startsWith('VANITY_NOT_FOUND:')) {
            vanityChanges.set(existing.steam_id, { type: 'deleted' });
          }
        }
        await new Promise(r => setTimeout(r, 1500));
      }

      const urls = batch.map(p => p.profile_url).filter(Boolean);
      const { results } = await checkProfiles(urls);

      for (const profile of results) {
        const existing = db.getCheaterCheckBySteamId(profile.steamId);
        if (!existing) continue;

        // Проверяем все типы изменений
        const banChanged =
          existing.vac_banned !== (profile.vacBanned ? 1 : 0) ||
          existing.number_of_game_bans !== (profile.numberOfGameBans || 0) ||
          existing.community_banned !== (profile.communityBanned ? 1 : 0) ||
          existing.economy_ban !== (profile.economyBan || 'none');
        const nickChanged = existing.persona_name && profile.personaName &&
          existing.persona_name !== profile.personaName &&
          profile.personaName !== 'Unknown';
        const vanityChanged = vanityChanges.has(profile.steamId);

        if (!banChanged && !nickChanged && !vanityChanged) continue;

        // Собираем причины обновления
        const updateReasons = [];
        if (nickChanged) updateReasons.push('nick');
        if (vanityChanged) updateReasons.push('url');
        if (banChanged) updateReasons.push('ban');

        // Обновляем профиль в БД если бан изменился
        if (banChanged) {
          db.upsertCheaterCheck({
            ...profile,
            checkedByDiscordId: existing.checked_by_discord_id,
            checkedByUsername: existing.checked_by_username
          });
        }
        db.markCheaterBanUpdated(profile.steamId, updateReasons.join(','));
        updated++;

        const profileUrl = profile.profileUrl || `https://steamcommunity.com/profiles/${profile.steamId}`;

        // === Смена ника ===
        if (nickChanged) {
          log(`✏️ Смена ника: ${existing.persona_name} → ${profile.personaName} (${profile.steamId})`);

          db.prepare('UPDATE cheater_checks SET persona_name = ? WHERE steam_id = ?')
            .run(profile.personaName, profile.steamId);

          const nickTitle = '✏️ <b>Смена ника читера</b>';
          const nickMessage =
            `${nickTitle}\n\n` +
            `👤 Было: ${existing.persona_name}\n` +
            `👤 Стало: ${profile.personaName}\n` +
            `🔗 Профиль: <a href="${profileUrl}">${profile.personaName}</a>\n` +
            `🆔 SteamID: ${profile.steamId}\n` +
            `👁 Добавил: ${existing.checked_by_username || 'Неизвестно'}\n` +
            `📅 Время: ${new Date().toLocaleString('ru-RU')}`;

          notificationQueue.push({ type: 'admin', message: nickMessage });
          notificationQueue.push(...collectUserNotifications(db, existing, nickMessage));

          // CheatWatcher
          const cwNickComment =
            `✏️ Nickname changed\n\n` +
            `Was: ${existing.persona_name}\n` +
            `Now: ${profile.personaName}\n` +
            `Profile: ${profileUrl}\n` +
            `SteamID64: ${profile.steamId}\n` +
            `Date: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/Moscow' })}\n\n` +
            `Added to CheatWatchers Community database and Valve database.\n\n` +
            `— Sent to Valve employees`;
          db.addCheatWatcherComment(profile.steamId, cwNickComment);
        }

        // === Смена vanity URL ===
        if (vanityChanged) {
          const change = vanityChanges.get(profile.steamId);
          log(`🔗 Vanity URL изменён: ${existing.original_vanity_url} (${profile.steamId}) — ${change.type}`);

          db.prepare('UPDATE cheater_checks SET original_vanity_url = NULL WHERE steam_id = ?')
            .run(profile.steamId);

          const canonicalUrl = `https://steamcommunity.com/profiles/${profile.steamId}`;
          const urlTitle = '🔗 <b>Смена URL профиля</b>';
          const urlMessage =
            `${urlTitle}\n\n` +
            `🔗 Было: steamcommunity.com/id/${existing.original_vanity_url}\n` +
            `🔗 Стало: ${canonicalUrl} (числовой)\n` +
            `👤 Игрок: <a href="${canonicalUrl}">${profile.personaName}</a>\n` +
            `🆔 SteamID: ${profile.steamId}\n` +
            `👁 Добавил: ${existing.checked_by_username || 'Неизвестно'}\n` +
            `📅 Время: ${new Date().toLocaleString('ru-RU')}`;

          notificationQueue.push({ type: 'admin', message: urlMessage });
          notificationQueue.push(...collectUserNotifications(db, existing, urlMessage));

          // CheatWatcher
          const cwUrlComment =
            `🔗 Profile URL changed\n\n` +
            `Was: steamcommunity.com/id/${existing.original_vanity_url}\n` +
            `Now: ${canonicalUrl}\n` +
            `Player: ${profile.personaName}\n` +
            `SteamID64: ${profile.steamId}\n` +
            `Date: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/Moscow' })}\n\n` +
            `Added to CheatWatchers Community database and Valve database.\n\n` +
            `— Sent to Valve employees`;
          db.addCheatWatcherComment(profile.steamId, cwUrlComment);
        }

        // === Бан ===
        if (banChanged) {
          const wasClean = existing.vac_banned === 0 &&
            existing.number_of_game_bans === 0 &&
            existing.community_banned === 0 &&
            existing.economy_ban === 'none';

          log(`🔄 Обновлён профиль ${profile.personaName} (${profile.steamId}) — статус бана изменился`);

          const banDetails = [];
          if (profile.vacBanned) banDetails.push(`VAC-бан (${profile.numberOfVacBans || 1})`);
          if ((profile.numberOfGameBans || 0) > 0) banDetails.push(`Игровой бан (${profile.numberOfGameBans})`);
          if (profile.communityBanned) banDetails.push('Коммьюнити-бан');
          if (profile.economyBan && profile.economyBan !== 'none') banDetails.push(`Торговый бан: ${profile.economyBan}`);

          if (banDetails.length > 0) {
            const profileName = profile.personaName || profile.steamId;

            const ownTitle = wasClean
              ? '⚠️ <b>Потенциальный читер получил ограничения!</b>'
              : '🔔 <b>Обновление ограничений читера</b>';

            const banMessage =
              `${ownTitle}\n\n` +
              `👤 Игрок: <a href="${profileUrl}">${profileName}</a>\n` +
              `🆔 SteamID: ${profile.steamId}\n` +
              `🚫 Ограничения: ${banDetails.join(', ')}\n` +
              `👁 Добавил: ${existing.checked_by_username || 'Неизвестно'}\n` +
              `📅 Время: ${new Date().toLocaleString('ru-RU')}`;

            notificationQueue.push({ type: 'admin', message: banMessage });
            notificationQueue.push(...collectUserNotifications(db, existing, banMessage));

            // CheatWatcher
            const cwBanComment =
              `🔄 Status update — ban detected!\n\n` +
              `Player: ${profile.personaName}\n` +
              `Profile: ${profileUrl}\n` +
              `SteamID64: ${profile.steamId}\n\n` +
              `Ban Details:\n${formatCheatWatcherBanDetails(profile)}\n` +
              `Date: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/Moscow' })}\n\n` +
              `Previously: ${wasClean ? 'Clean' : 'Banned'}\n\n` +
              `Added to CheatWatchers Community database and Valve database.\n\n` +
              `— Sent to Valve employees`;
            db.addCheatWatcherComment(profile.steamId, cwBanComment);
          }
        }
      }

      totalChecked += batch.length;
      offset += batchSize;

      // Прогресс каждые 100 профилей
      if (totalChecked - lastProgressReport >= 100) {
        lastProgressReport = totalChecked;
        await sendTelegramReport(`⏳ Проверено ${totalChecked} из ${totalCount}`);
      }

      if (batch.length < batchSize) break;
      await new Promise(r => setTimeout(r, delayMs));
    }

    // === Отправка уведомлений после завершения проверки ===
    if (notificationQueue.length > 0) {
      log(`📨 Отправка ${notificationQueue.length} уведомлений с задержкой 1.5с...`);

      for (let i = 0; i < notificationQueue.length; i++) {
        const n = notificationQueue[i];
        try {
          if (n.type === 'admin') {
            await sendTelegramReport(n.message);
          } else {
            await sendTelegramMessageToUser(n.chatId, n.message);
            if (n.countAs === 'own') notified++;
            if (n.countAs === 'others') notifiedOthers++;
          }
        } catch (err) {
          logError(`Ошибка отправки уведомления ${i + 1}/${notificationQueue.length}: ${err.message}`);
        }

        // Задержка между сообщениями (кроме последнего)
        if (i < notificationQueue.length - 1) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      log(`✅ Уведомления отправлены: ${notificationQueue.length} за ${Math.round(notificationQueue.length * 1.5)}с`);
    }

    const result = { timestamp: Date.now(), totalChecked, updated, notified, notifiedOthers };
    const elapsed = Math.round((Date.now() - banCheckState.startedAt) / 1000);
    log(`✅ Перепроверка завершена. Проверено: ${totalChecked}, обновлено: ${updated}, уведомлений: ${notified} свои / ${notifiedOthers} чужие`);

    // Уведомление админу о завершении
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeStr = minutes > 0 ? `${minutes} мин ${seconds} сек` : `${seconds} сек`;
    await sendTelegramReport(
      `✅ <b>Проверка читеров завершена</b>\n\n` +
      `📊 Проверено: ${totalChecked}\n` +
      `🔄 Обновлено: ${updated}\n` +
      `📨 Уведомлений: ${notified + notifiedOthers} (свои: ${notified} / чужие: ${notifiedOthers})\n` +
      `⏱ Время: ${timeStr}`
    );

    return result;
  } catch (error) {
    logError(`Ошибка перепроверки: ${error.message}`);

    const errorElapsed = Math.round((Date.now() - banCheckState.startedAt) / 1000);
    const errorResult = { timestamp: Date.now(), totalChecked: 0, updated: 0, notified: 0, notifiedOthers: 0, error: error.message };

    // Уведомление админу об ошибке
    const minutes = Math.floor(errorElapsed / 60);
    const seconds = errorElapsed % 60;
    const timeStr = minutes > 0 ? `${minutes} мин ${seconds} сек` : `${seconds} сек`;
    await sendTelegramReport(
      `❌ <b>Ошибка проверки читеров</b>\n\n` +
      `⚠️ Ошибка: ${error.message}\n` +
      `⏱ Время: ${timeStr}`
    ).catch(() => {});

    return errorResult;
  } finally {
    banCheckState.isChecking = false;
    banCheckState.startedAt = null;
  }
}

/**
 * Синхронизация статуса членства на сервере
 * Запускается при старте бота — проверяет всех пользователей из user_stats
 */
async function syncServerMembership(discordClient, db) {
  try {
    const guild = discordClient.guilds.cache.first();
    if (!guild) {
      log('⚠️ Сервер не найден, синхронизация пропущена');
      return;
    }

    log('🔄 Синхронизация членства на сервере...');

    // Получаем всех участников сервера
    const members = await guild.members.fetch();
    const memberIds = new Set(members.map(m => m.id));

    // Получаем всех пользователей из user_stats
    const allUsers = db.prepare('SELECT user_id FROM user_stats').all();

    let updated = 0;
    for (const user of allUsers) {
      const isOnServer = memberIds.has(user.user_id) ? 1 : 0;
      db.prepare('UPDATE user_stats SET is_on_server = ? WHERE user_id = ?').run(isOnServer, user.user_id);
      updated++;
    }

    const onServer = allUsers.filter(u => memberIds.has(u.user_id)).length;
    const notOnServer = allUsers.length - onServer;

    log(`✅ Синхронизация завершена: ${onServer} на сервере, ${notOnServer} не на сервере (всего ${updated})`);
  } catch (error) {
    logError(`❌ Ошибка синхронизации членства: ${error.message}`);
  }
}

/**
 * Главная функция запуска бота
 */
async function main() {
  try {
    log('🚀 Запуск AFK Discord Bot...');

    // Валидация конфигурации
    validateConfig();

    // Инициализация базы данных
    const db = new DatabaseManager();
    const gamesDb = new GamesDatabase();
    success('База данных инициализирована');

    // Инициализация Steam Wall Auto-Answer
    const { SteamWallDatabase, SteamWallManager } = await import('./steam-wall/index.js');
    const steamWallDb = new SteamWallDatabase();
    const steamWallManager = new SteamWallManager(steamWallDb);
    success('Steam Wall Auto-Answer инициализирован');

    // Инициализация CheatWatcher
    const { CheatWatcherWorker } = await import('./steam-wall/cheat-watcher.js');
    const cheatWatcher = new CheatWatcherWorker(db);
    const cwToken = process.env.CHEAT_WATCHER_REFRESH_TOKEN;
    if (cwToken) {
      cheatWatcher.start(cwToken);
      success('CheatWatcher запущен');
    } else {
      log('CheatWatcher: нет токена, ожидает авторизации через админ-панель');
    }

    // Создание Discord клиента
    const discordClient = createDiscordClient();

    // Создаем обертку для Telegram сервиса
    const telegramWrapper = {
      sendReport: sendTelegramReport,
      sendTelegramReport: sendTelegramReport,
      sendTelegramMessageToUser: sendTelegramMessageToUser,
      sendAchievement: sendAchievementNotification,
      sendSettingsChange: sendSettingsChangeNotification,
      sendProfileView: sendProfileViewNotification,
      sendAchievementDeleteNotification: sendAchievementDeleteNotification,
      sendUserDelete: sendUserDeleteNotification,
      sendSpecialAchievement: sendSpecialAchievementNotification,
      sendBlocklistAddNotification: sendBlocklistAddNotification,
      sendNewCheaterNotification: sendNewCheaterNotification,
      notifyChannelActivity: async (message) => {
        try {
          // Получаем всех пользователей с включенными уведомлениями
          const usersWithNotifications = db.prepare(`
            SELECT us.user_id, tu.telegram_chat_id 
            FROM user_settings us
            JOIN telegram_users tu ON us.user_id = tu.user_id
            WHERE us.channel_notifications = 1 AND tu.started_bot = 1
          `).all();

          for (const user of usersWithNotifications) {
            await sendTelegramMessageToUser(user.telegram_chat_id, message);
          }
        } catch (error) {
          logError(`Ошибка отправки уведомлений о канале: ${error.message}`);
        }
      }
    };

    // Создание системы достижений
    const notificationService = new AchievementNotificationService(
      discordClient,
      telegramWrapper,
      db
    );
    const achievements = new AchievementSystem(db, notificationService);
    const achievementChecker = new AchievementChecker(db, achievements);

    // Регистрация обработчиков Discord событий
    registerDiscordEvents(discordClient, db, achievements, telegramWrapper);

    // Подключение к Discord
    await connectDiscord(discordClient);

    // Синхронизация is_on_server при запуске
    syncServerMembership(discordClient, db);

    // Создание Express сервера
    const app = createExpressServer(db);

    // Запуск сервиса уведомлений о ценах
    const priceNotificationService = new PriceNotificationService(gamesDb, discordClient, telegramWrapper, db);
    priceNotificationService.start();

    // Регистрация API роутов
    registerRoutes(app, db, discordClient, achievements, telegramWrapper, notificationService, gamesDb, priceNotificationService, steamWallDb, steamWallManager, banCheckState, () => runBanCheck(db, sendTelegramReport, sendTelegramMessageToUser), cheatWatcher);

    // Запуск сервера
    await startServer(app, SERVER_CONFIG.PORT);

    // Инициализация Telegram бота (с задержкой)
    setTimeout(() => {
      try {
        // Функция для использования кода связывания
        const useLinkCode = (code, telegramChatId) => {
          const now = new Date().toISOString();
          const result = db.prepare(
            'SELECT user_id, expires_at, used FROM telegram_link_codes WHERE code = ?'
          ).get(code);

          if (!result) {
            return { success: false, error: 'Код не найден' };
          }

          if (result.used) {
            return { success: false, error: 'Код уже использован' };
          }

          if (result.expires_at < now) {
            return { success: false, error: 'Код истёк' };
          }

          db.prepare('UPDATE telegram_link_codes SET used = 1 WHERE code = ?').run(code);

          db.prepare(
            `INSERT OR REPLACE INTO telegram_users (user_id, telegram_chat_id, started_bot, created_at)
             VALUES (?, ?, 1, COALESCE((SELECT created_at FROM telegram_users WHERE user_id = ?), CURRENT_TIMESTAMP))`
          ).run(result.user_id, telegramChatId, result.user_id);

          return { success: true, userId: result.user_id };
        };

        // Функция для получения активности голосовых каналов
        const getVoiceChannelActivity = (blockedIds = []) => {
          try {
            if (!discordClient || !discordClient.isReady()) {
              return {
                success: false,
                message: '⏳ Discord бот еще загружается, попробуйте через несколько секунд',
              };
            }

            const guild = discordClient.guilds.cache.first();
            if (!guild) {
              return { success: false, message: '❌ Сервер не найден' };
            }

            const voiceChannels = guild.channels.cache.filter(
              (channel) => channel.type === 2 && channel.members.filter(m => !blockedIds.includes(m.id)).size > 0
            );

            if (voiceChannels.size === 0) {
              return {
                success: true,
                message: '📭 Нет активных голосовых каналов',
              };
            }

            const activeChannels = [];
            let message = '';

            voiceChannels.forEach((channel) => {
              const visibleMembers = channel.members.filter(m => !blockedIds.includes(m.id));
              if (visibleMembers.size === 0) return;

              message += `📺 <b>${channel.name}</b> (${visibleMembers.size} чел.)\n`;
              activeChannels.push({
                name: channel.name,
                memberCount: visibleMembers.size,
              });

              visibleMembers.forEach((member) => {
                const statusIcons = [];
                if (member.voice.selfMute) statusIcons.push('🎙️❌');
                if (member.voice.selfDeaf) statusIcons.push('🔇');
                if (member.voice.streaming) statusIcons.push('📡');
                const status = statusIcons.length > 0 ? ` (${statusIcons.join(', ')})` : '';
                message += `  👤 ${member.displayName}${status}\n`;
              });

              message += '\n';
            });

            if (!message) {
              return { success: true, message: '📭 Нет активных голосовых каналов' };
            }

            message = `🎤 <b>Активные голосовые каналы:</b> ${activeChannels.length}\n\n` + message;
            message += `📅 ${new Date().toLocaleString('ru-RU')}`;

            return {
              success: true,
              message: message,
              activeChannels: activeChannels,
            };
          } catch (error) {
            logError(`Ошибка при получении информации о каналах: ${error.message}`);
            return {
              success: false,
              message: '❌ Ошибка при получении информации о каналах',
            };
          }
        };

        // Функция для получения онлайн пользователей
        const getOnlineUsers = (blockedIds = []) => {
          try {
            if (!discordClient || !discordClient.isReady()) {
              return {
                success: false,
                message: '⏳ Discord бот еще загружается, попробуйте через несколько секунд',
              };
            }

            const guild = discordClient.guilds.cache.first();
            if (!guild) {
              return { success: false, message: '❌ Сервер не найден' };
            }

            const members = guild.members.cache;
            if (members.size === 0) {
              return { success: true, message: '📭 На сервере нет участников' };
            }

            const onlineMembers = members.filter(
              (member) =>
                !member.user.bot &&
                member.presence?.status &&
                member.presence.status !== 'offline' &&
                !blockedIds.includes(member.id)
            );

            if (onlineMembers.size === 0) {
              return {
                success: true,
                message: '📭 Нет пользователей онлайн',
              };
            }

            const statusGroups = {
              online: [],
              idle: [],
              dnd: [],
            };

            onlineMembers.forEach((member) => {
              const status = member.presence?.status || 'offline';
              const memberInfo = {
                displayName: member.displayName || member.user?.username || 'Unknown',
                username: member.user?.username || 'Unknown',
                id: member.id,
                status: status,
                activities: member.presence?.activities || [],
              };

              if (status === 'online') {
                statusGroups.online.push(memberInfo);
              } else if (status === 'idle') {
                statusGroups.idle.push(memberInfo);
              } else if (status === 'dnd') {
                statusGroups.dnd.push(memberInfo);
              }
            });

            let message = `👥 <b>Пользователи онлайн:</b> ${onlineMembers.size} чел.\n\n`;

            if (statusGroups.online.length > 0) {
              message += `🟢 <b>Онлайн</b> (${statusGroups.online.length})\n`;
              statusGroups.online.forEach((member) => {
                message += `  👤 ${member.displayName}\n`;
                if (member.activities.length > 0) {
                  const activity = member.activities[0];
                  if (activity.name) {
                    message += `     🎮 ${activity.name}\n`;
                  }
                }
              });
              message += '\n';
            }

            if (statusGroups.idle.length > 0) {
              message += `🟡 <b>Неактивен</b> (${statusGroups.idle.length})\n`;
              statusGroups.idle.forEach((member) => {
                message += `  👤 ${member.displayName}\n`;
              });
              message += '\n';
            }

            if (statusGroups.dnd.length > 0) {
              message += `🔴 <b>Не беспокоить</b> (${statusGroups.dnd.length})\n`;
              statusGroups.dnd.forEach((member) => {
                message += `  👤 ${member.displayName}\n`;
              });
              message += '\n';
            }

            message += `📅 ${new Date().toLocaleString('ru-RU')}`;

            return {
              success: true,
              message: message,
              onlineCount: onlineMembers.size,
              totalCount: members.size,
            };
          } catch (error) {
            logError(`Ошибка при получении списка онлайн пользователей: ${error.message}`);
            return {
              success: false,
              message: '❌ Ошибка при получении списка пользователей',
            };
          }
        };

        // Инициализируем Telegram бота
        initTelegramBot(
          db,
          discordClient,
          useLinkCode,
          getVoiceChannelActivity,
          getOnlineUsers,
          steamWallDb,
          steamWallManager,
          cheatWatcher
        );

        success('Telegram бот инициализирован');

        // Загружаем telegram_username для существующих пользователей
        backfillTelegramUsernames().catch((err) => {
          logError(`Ошибка backfill telegram_username: ${err.message}`);
        });
        
        // Запуск всех активных Steam Wall ботов
        try {
          steamWallManager.startAll();
        } catch (err) {
          logError(`Ошибка запуска Steam Wall ботов: ${err.message}`);
        }
        
        // Отправляем уведомление о запуске бота
        sendBotStatusNotification('started', `Версия: 2.0.0 (Refactored)`).catch((err) => {
          logError(`Ошибка отправки уведомления о запуске: ${err.message}`);
        });
      } catch (error) {
        logError(`Ошибка при инициализации Telegram: ${error.message}`);
      }
    }, 2000);

    // Проверка запланированных достижений каждую минуту
    setInterval(async () => {
      try {
        // Получаем локальное время в формате YYYY-MM-DDTHH:MM
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const localTime = `${year}-${month}-${day}T${hours}:${minutes}`;
        
        log(`🔍 Проверка запланированных достижений (текущее время: ${localTime})...`);
        
        // Находим достижения, которые запланированы и время уже наступило
        const scheduledAchievements = db.prepare(`
          SELECT a.achievement_id, a.user_id, a.emoji, a.name, a.description, a.special_date
          FROM achievements a
          INNER JOIN user_achievements ua ON a.achievement_id = ua.achievement_id AND a.user_id = ua.user_id
          WHERE a.type = 'special' 
            AND a.special_date IS NOT NULL 
            AND a.special_date <= ?
            AND ua.notified = 0
            AND ua.manually_deleted = 0
        `).all(localTime);

        if (scheduledAchievements.length > 0) {
          log(`📅 Найдено ${scheduledAchievements.length} запланированных достижений для отправки уведомлений`);
        } else {
          log(`✅ Нет запланированных достижений для отправки`);
        }

        for (const achievement of scheduledAchievements) {
          try {
            log(`📤 Отправка уведомлений для достижения "${achievement.name}" (${achievement.achievement_id})`);
            
            const guild = discordClient.guilds.cache.first();
            let username = 'Неизвестный пользователь';
            
            if (guild) {
              try {
                const member = await guild.members.fetch(achievement.user_id);
                username = member.displayName || member.user.username;
              } catch (err) {
                const user = await discordClient.users.fetch(achievement.user_id).catch(() => null);
                username = user ? user.username : 'Неизвестный пользователь';
              }
            }

            // Отправляем уведомление в Telegram
            if (telegramWrapper && telegramWrapper.sendSpecialAchievement) {
              log(`📱 Отправка в Telegram для ${username}...`);
              await telegramWrapper.sendSpecialAchievement(
                username,
                achievement.user_id,
                achievement.emoji,
                achievement.name,
                achievement.description,
                null, // color
                achievement.special_date,
                db
              );
              log(`✅ Telegram уведомление отправлено`);
            } else {
              logError(`❌ telegramWrapper не доступен`);
            }

            // Отправляем уведомление в Discord канал
            if (notificationService) {
              log(`💬 Отправка в Discord канал для ${username}...`);
              await notificationService.sendSpecialAchievementToDiscordChannel(
                achievement.user_id,
                username,
                achievement.emoji,
                achievement.name,
                achievement.description
              );
              log(`✅ Discord уведомление отправлено`);
            } else {
              logError(`❌ notificationService не доступен`);
            }

            // Помечаем что уведомление отправлено
            db.prepare(`
              UPDATE user_achievements 
              SET notified = 1 
              WHERE user_id = ? AND achievement_id = ?
            `).run(achievement.user_id, achievement.achievement_id);

            log(`✅ Уведомления отправлены для достижения "${achievement.name}" пользователю ${username}`);
          } catch (err) {
            logError(`Ошибка отправки уведомления о достижении ${achievement.achievement_id}: ${err.message}`);
          }
        }
      } catch (error) {
        logError(`Ошибка проверки запланированных достижений: ${error.message}`);
      }
    }, 60000); // Проверяем каждую минуту

    // === Планировщик проверки читеров ===
    function getMsUntilCheckTime(timeStr) {
      const [targetH, targetM] = timeStr.split(':').map(Number);
      const now = new Date();
      const target = new Date(now);
      target.setHours(targetH, targetM, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      return target - now;
    }

    function scheduleNextBanCheck() {
      if (banCheckState.scheduledTimer) clearTimeout(banCheckState.scheduledTimer);

      const checkTime = db.getBanCheckTime();
      const delay = getMsUntilCheckTime(checkTime);

      banCheckState.scheduledTimer = setTimeout(async () => {
        const startTime = Date.now();
        const result = await runBanCheck(db, sendTelegramReport, sendTelegramMessageToUser);
        if (result) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          db.saveBanCheckResult('auto', result, elapsed);
        }
        scheduleNextBanCheck(); // планируем следующую
      }, delay);

      log(`📅 Следующая проверка читеров в ${checkTime} (через ${Math.round(delay / 60000)} мин)`);
    }

    banCheckState.reschedule = scheduleNextBanCheck;
    scheduleNextBanCheck();

    // Обработка завершения
    process.on('SIGINT', async () => {
      log('🛑 Закрытие бота...');
      
      try {
        steamWallManager.stopAll();
      } catch (error) {
        logError(`Ошибка остановки Steam Wall ботов: ${error.message}`);
      }

      try {
        cheatWatcher.stop();
      } catch (error) {
        logError(`Ошибка остановки CheatWatcher: ${error.message}`);
      }

      try {
        await sendBotStatusNotification('stopped');
      } catch (error) {
        logError(`Ошибка отправки уведомления об остановке: ${error.message}`);
      }
      
      db.close();
      gamesDb.close();
      steamWallDb.close();
      process.exit(0);
    });

    // Обработка ошибок
    process.on('unhandledRejection', (error) => {
      logError(`Unhandled rejection: ${error.message}`);
    });

    success('✅ AFK Discord Bot успешно запущен!');
  } catch (error) {
    logError(`Критическая ошибка при запуске: ${error.message}`);
    process.exit(1);
  }
}

// Запуск
main();
