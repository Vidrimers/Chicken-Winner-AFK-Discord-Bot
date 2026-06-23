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
  sendNewCheaterNotification
} from '../telegram.js';

// Загружаем переменные окружения
dotenv.config();

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

    // Создание Express сервера
    const app = createExpressServer();

    // Запуск сервиса уведомлений о ценах
    const priceNotificationService = new PriceNotificationService(gamesDb, discordClient, telegramWrapper);
    priceNotificationService.start();

    // Регистрация API роутов
    registerRoutes(app, db, discordClient, achievements, telegramWrapper, notificationService, gamesDb, priceNotificationService);

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
          getOnlineUsers
        );

        success('Telegram бот инициализирован');
        
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

    // Ежедневная перепроверка всех профилей из БД на изменение статуса банов
    setInterval(async () => {
      try {
        log('🔄 Ежедневная перепроверка профилей из БД...');
        const allProfiles = db.getCheaterChecks({ limit: 100, offset: 0, filter: 'all' });
        
        if (allProfiles.length === 0) {
          log('📭 Нет профилей для перепроверки');
          return;
        }

        const { checkProfiles } = await import('./steam/steamApi.js');
        const urls = allProfiles.map(p => p.profile_url).filter(Boolean);
        
        // Проверяем пакетами по 20 с задержкой
        const batchSize = 20;
        let updated = 0;

        for (let i = 0; i < urls.length; i += batchSize) {
          const batch = urls.slice(i, i + batchSize);
          const { results } = await checkProfiles(batch);

          for (const profile of results) {
            const existing = db.getCheaterCheckBySteamId(profile.steamId);
            if (existing) {
              // Проверяем изменились ли данные
              const changed = 
                existing.vac_banned !== (profile.vacBanned ? 1 : 0) ||
                existing.number_of_game_bans !== (profile.numberOfGameBans || 0) ||
                existing.community_banned !== (profile.communityBanned ? 1 : 0) ||
                existing.economy_ban !== (profile.economyBan || 'none');

              if (changed) {
                // Определяем был ли профиль "чистым" до обновления
                const wasClean = existing.vac_banned === 0 &&
                  existing.number_of_game_bans === 0 &&
                  existing.community_banned === 0 &&
                  existing.economy_ban === 'none';

                // Определяем стал ли профиль "с ограничениями" (но не забанен)
                const isNowRestricted = !profile.vacBanned &&
                  (profile.numberOfGameBans || 0) === 0 &&
                  (profile.communityBanned || (profile.economyBan && profile.economyBan !== 'none'));

                db.upsertCheaterCheck({
                  ...profile,
                  checkedByDiscordId: existing.checked_by_discord_id,
                  checkedByUsername: existing.checked_by_username
                });
                updated++;
                log(`🔄 Обновлён профиль ${profile.personaName} (${profile.steamId}) — статус бана изменился`);

                // Уведомление: чистый → с ограничениями
                if (wasClean && isNowRestricted) {
                  const profileName = profile.personaName || profile.steamId;
                  const profileUrl = profile.profileUrl || `https://steamcommunity.com/profiles/${profile.steamId}`;
                  const restrictionDetails = [];
                  if (profile.communityBanned) restrictionDetails.push('Коммьюнити-бан');
                  if (profile.economyBan && profile.economyBan !== 'none') restrictionDetails.push(`Торговый бан: ${profile.economyBan}`);

                  // Уведомление админу
                  const adminMessage =
                    `⚠️ <b>Потенциальный читер получил ограничения!</b>\n\n` +
                    `👤 Игрок: <a href="${profileUrl}">${profileName}</a>\n` +
                    `🆔 SteamID: ${profile.steamId}\n` +
                    `🚫 Ограничения: ${restrictionDetails.join(', ')}\n` +
                    `👁 Добавил: ${existing.checked_by_username || 'Неизвестно'}\n` +
                    `📅 Время: ${new Date().toLocaleString('ru-RU')}`;

                  await sendTelegramReport(adminMessage);
                  log(`📨 Отправлено уведомление админу: ${profileName} получил ограничения`);

                  // Уведомление тому, кто добавил профиль (если включены уведомления "мои читеры" и связан с Telegram)
                  if (existing.checked_by_discord_id) {
                    const ownNotificationsEnabled = db.getUserCheaterOwnNotificationSetting(existing.checked_by_discord_id);
                    if (ownNotificationsEnabled) {
                      const telegramChatId = db.getTelegramChatId(existing.checked_by_discord_id);
                      if (telegramChatId) {
                        const userMessage =
                          `⚠️ <b>Обновление по потенциальному читеру</b>\n\n` +
                          `Профиль, который вы добавили, получил ограничения:\n\n` +
                          `👤 Игрок: <a href="${profileUrl}">${profileName}</a>\n` +
                          `🆔 SteamID: ${profile.steamId}\n` +
                          `🚫 Ограничения: ${restrictionDetails.join(', ')}\n` +
                          `📅 Время: ${new Date().toLocaleString('ru-RU')}`;

                        await sendTelegramMessageToUser(telegramChatId, userMessage);
                        log(`📨 Отправлено уведомление пользователю (${existing.checked_by_discord_id}): ${profileName} получил ограничения`);
                      }
                    }
                  }

                  // Уведомление подписчикам "чужие читеры"
                  const otherSubscribers = db.getUsersSubscribedToOthersCheaterNotifications();
                  for (const subscriber of otherSubscribers) {
                    if (subscriber.user_id === existing.checked_by_discord_id) continue;
                    const othersMessage =
                      `🔔 <b>Изменение статуса читера</b>\n\n` +
                      `👤 Игрок: <a href="${profileUrl}">${profileName}</a>\n` +
                      `🆔 SteamID: ${profile.steamId}\n` +
                      `🚫 Ограничения: ${restrictionDetails.join(', ')}\n` +
                      `👁 Добавил: ${existing.checked_by_username || 'Неизвестно'}\n` +
                      `📅 Время: ${new Date().toLocaleString('ru-RU')}`;
                    await sendTelegramMessageToUser(subscriber.telegram_chat_id, othersMessage);
                  }
                  if (otherSubscribers.length > 0) {
                    log(`📨 Отправлено уведомление ${otherSubscribers.length} подписчикам "чужие читеры": ${profileName}`);
                  }
                }
              }
            }
          }

          // Задержка между пакетами
          if (i + batchSize < urls.length) {
            await new Promise(r => setTimeout(r, 3000));
          }
        }

        log(`✅ Перепроверка завершена. Обновлено: ${updated} из ${allProfiles.length}`);
      } catch (error) {
        logError(`Ошибка ежедневной перепроверки: ${error.message}`);
      }
    }, 24 * 60 * 60 * 1000); // Каждые 24 часа

    // Обработка завершения
    process.on('SIGINT', async () => {
      log('🛑 Закрытие бота...');
      
      try {
        await sendBotStatusNotification('stopped');
      } catch (error) {
        logError(`Ошибка отправки уведомления об остановке: ${error.message}`);
      }
      
      db.close();
      gamesDb.close();
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
