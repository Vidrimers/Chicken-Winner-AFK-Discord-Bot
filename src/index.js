import dotenv from 'dotenv';
import { validateConfig, SERVER_CONFIG } from './config.js';
import { success, log, error as logError } from './utils/logger.js';
import { DatabaseManager } from './database/index.js';
import { AchievementSystem } from './achievements/index.js';
import { AchievementNotificationService } from './achievements/notifications.js';
import { AchievementChecker } from './achievements/checker.js';
import { createDiscordClient, connectDiscord } from './discord/client.js';
import { registerDiscordEvents } from './discord/events.js';
import { createExpressServer, startServer } from './api/server.js';
import { registerRoutes } from './api/routes/index.js';
import { initTelegramBot } from '../telegram.js';

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
    success('База данных инициализирована');

    // Создание Discord клиента
    const discordClient = createDiscordClient();

    // Инициализация Telegram (будет инициализирован позже)
    let telegramService = null;

    // Создание системы достижений
    const notificationService = new AchievementNotificationService(
      discordClient,
      telegramService,
      db
    );
    const achievements = new AchievementSystem(db, notificationService);
    const achievementChecker = new AchievementChecker(db, achievements);

    // Регистрация обработчиков Discord событий
    registerDiscordEvents(discordClient, db, achievements, telegramService);

    // Подключение к Discord
    await connectDiscord(discordClient);

    // Создание Express сервера
    const app = createExpressServer();

    // Регистрация API роутов
    registerRoutes(app, db, discordClient, achievements, telegramService);

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
        const getVoiceChannelActivity = () => {
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
              (channel) => channel.type === 2 && channel.members.size > 0
            );

            if (voiceChannels.size === 0) {
              return {
                success: true,
                message: '📭 Нет активных голосовых каналов',
              };
            }

            let message = `🎤 <b>Активные голосовые каналы:</b> ${voiceChannels.size}\n\n`;
            const activeChannels = [];

            voiceChannels.forEach((channel) => {
              message += `📺 <b>${channel.name}</b> (${channel.members.size} чел.)\n`;
              activeChannels.push({
                name: channel.name,
                memberCount: channel.members.size,
              });

              channel.members.forEach((member) => {
                const statusIcons = [];
                if (member.voice.selfMute) statusIcons.push('🎙️❌');
                if (member.voice.selfDeaf) statusIcons.push('🔇');
                if (member.voice.streaming) statusIcons.push('📡');
                const status = statusIcons.length > 0 ? ` (${statusIcons.join(', ')})` : '';
                message += `  👤 ${member.displayName}${status}\n`;
              });

              message += '\n';
            });

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
        const getOnlineUsers = () => {
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
                member.presence.status !== 'offline'
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
        telegramService = initTelegramBot(
          db,
          discordClient,
          useLinkCode,
          getVoiceChannelActivity,
          getOnlineUsers
        );

        // Обновляем ссылку на telegram в notification service
        notificationService.telegram = telegramService;

        success('Telegram бот инициализирован');
      } catch (error) {
        logError(`Ошибка при инициализации Telegram: ${error.message}`);
      }
    }, 2000);

    // Обработка завершения
    process.on('SIGINT', async () => {
      log('🛑 Закрытие бота...');
      
      if (telegramService && telegramService.sendBotStatus) {
        await telegramService.sendBotStatus('stopped');
      }
      
      db.close();
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
