import dotenv from "dotenv";
dotenv.config();

import { checkProfiles } from './src/steam/steamApi.js';
import { STEAM_CONFIG, SERVER_CONFIG } from './src/config.js';
import { EmbedBuilder } from 'discord.js';

// Telegram bot settings
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "137981675";
const TELEGRAM_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

/**
 * Отправка отчета в Telegram
 * @param {string} message - Сообщение для отправки (поддерживает HTML разметку)
 */
export async function sendTelegramReport(message) {
  try {
    const response = await fetch(TELEGRAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      console.error(`❌ Ошибка отправки в Telegram: ${response.status}`);
    }
  } catch (error) {
    console.error("❌ Ошибка при отправке в Telegram:", error);
  }
}

/**
 * Отправка уведомления о новом достижении
 */
export async function sendAchievementNotification(
  username,
  achievementName,
  achievementDescription,
  points,
) {
  const message =
    `🏆 <b>Новое достижение!</b>\n` +
    `👤 Пользователь: ${username}\n` +
    `🎯 Достижение: ${achievementName}\n` +
    `📝 Описание: ${achievementDescription}\n` +
    `⭐ Очки: +${points}\n` +
    `📅 Время: ${new Date().toLocaleString("ru-RU")}`;

  await sendTelegramReport(message);
}

/**
 * Отправка уведомления о специальном достижении
 */
export async function sendSpecialAchievementNotification(
  username,
  userId,
  emoji,
  name,
  description,
  color,
  specialDate,
  db = null,
) {
  let message =
    `🏆 <b>Новое специальное достижение!</b>\n` +
    `👤 Пользователь: ${username}\n` +
    `🆔 ID: <code>${userId}</code>\n` +
    `🎯 Достижение: ${emoji} ${name}\n` +
    `📝 Описание: ${description}\n`;

  if (color) {
    message += `🎨 Цвет: ${color}\n`;
  }

  if (specialDate) {
    const scheduledTime = new Date(specialDate);
    const now = new Date();
    if (scheduledTime > now) {
      message += `⏰ Планируется: ${scheduledTime.toLocaleString("ru-RU")}\n`;
    } else {
      message += `✅ Доступно с: ${scheduledTime.toLocaleString("ru-RU")}\n`;
    }
  }

  message += `📅 Создано: ${new Date().toLocaleString("ru-RU")}`;

  await sendTelegramReport(message);
  
  // Отправляем уведомление пользователю если он связан с Telegram
  if (db) {
    try {
      const telegramUser = db.prepare(
        'SELECT telegram_chat_id FROM telegram_users WHERE user_id = ? AND started_bot = 1'
      ).get(userId);
      
      if (telegramUser && telegramUser.telegram_chat_id) {
        const userMessage =
          `🏆 <b>Вы получили специальное достижение!</b>\n\n` +
          `${emoji} <b>${name}</b>\n` +
          `${description}\n\n` +
          `🎉 Поздравляем!`;
        
        await sendTelegramMessageToUser(telegramUser.telegram_chat_id, userMessage);
      }
    } catch (error) {
      console.error('Ошибка отправки уведомления пользователю:', error);
    }
  }
}

/**
 * Отправка уведомления об изменении настроек
 */
export async function sendSettingsChangeNotification(
  username,
  userId,
  settings,
) {
  const message =
    `🔔 <b>Пользователь изменил настройки</b>\n` +
    `👤 Пользователь: ${username}\n` +
    `🆔 ID: <code>${userId}</code>\n` +
    `${settings}\n` +
    `📅 Время: ${new Date().toLocaleString("ru-RU")}`;

  await sendTelegramReport(message);
}

/**
 * Отправка уведомления об удалении достижения
 */
export async function sendAchievementDeleteNotification(
  userName,
  achievementName,
  points,
) {
  const pointsText = points > 0 ? `\n⭐ Очков удалено: -${points}` : "";
  const message =
    `🗑️ <b>Достижение удалено!</b>\n` +
    `👤 Пользователь: ${userName}\n` +
    `🎯 Достижение: ${achievementName}\n` +
    `📅 Время: ${new Date().toLocaleString("ru-RU")}${pointsText}\n` +
    `✅ Пользователь может получить его заново`;

  await sendTelegramReport(message);
}

/**
 * Отправка уведомления об удалении пользователя
 */
export async function sendUserDeleteNotification(userId, userName) {
  const message =
    "🗑️ <b>ПОЛЬЗОВАТЕЛЬ УДАЛЕН ИЗ БД</b>\n\n" +
    "ID: <code>" +
    userId +
    "</code>\n" +
    "Имя: " +
    userName +
    "\n" +
    "Время: " +
    new Date().toLocaleString("ru-RU");

  await sendTelegramReport(message);
}

/**
 * Отправка уведомления о попытке несанкционированного доступа
 */
export async function sendUnauthorizedAccessNotification(
  attemptedId,
  timestamp,
) {
  const message =
    "⚠️ <b>ПОПЫТКА НЕСАНКЦИОНИРОВАННОГО ДОСТУПА!</b>\n\n" +
    "Кто-то попытался зайти по прямому ADMIN_USER_ID: <code>" +
    attemptedId +
    "</code>\n" +
    "Время: " +
    timestamp;

  await sendTelegramReport(message);
}

/**
 * Отправка уведомления о просмотре профиля
 */
export async function sendProfileViewNotification(
  viewerUsername,
  viewerId,
  targetUsername,
  targetUserId,
) {
  const message =
    `👀 <b>Просмотр профиля</b>\n\n` +
    `<b>${viewerUsername}</b> (ID: <code>${viewerId}</code>)\n` +
    `смотрит профиль\n` +
    `<b>${targetUsername}</b> (ID: <code>${targetUserId}</code>)\n` +
    `📅 Время: ${new Date().toLocaleString("ru-RU")}`;

  await sendTelegramReport(message);
}

/**
 * Отправка уведомления о запуске/остановке бота
 */
export async function sendBotStatusNotification(status, details = "") {
  const emoji = status === "started" ? "🚀" : "🛑";
  const statusText = status === "started" ? "запущен" : "остановлен";

  const message =
    `${emoji} <b>AFK Bot ${statusText}</b>\n` +
    (details ? `${details}\n` : "") +
    `📅 Время: ${new Date().toLocaleString("ru-RU")}`;

  await sendTelegramReport(message);
}

/**
 * Отправка уведомления о попытке входа пользователя не с сервера
 */
export async function sendNotOnServerAttempt(userId, timestamp) {
  const message =
    "🚫 <b>ПОПЫТКА ВХОДА НЕ С СЕРВЕРА!</b>\n\n" +
    `👤 User ID: <code>${userId}</code>\n` +
    `⏰ Время: ${timestamp}\n` +
    `⚠️ Пользователь не найден на Discord сервере`;

  await sendTelegramReport(message);
}

/**
 * Уведомление о добавлении нового потенциального читера
 * @param {string} addedByUsername - кто добавил
 * @param {string} source - источник: 'web', 'discord', 'telegram'
 * @param {Array} profiles - массив профилей [{personaName, profileUrl, steamId}]
 */
export async function sendNewCheaterNotification(addedByUsername, source, profiles) {
  const sourceEmoji = { web: '🌐', discord: '💬', telegram: '📱' }[source] || '❓';
  const sourceLabel = { web: 'Сайт', discord: 'Discord', telegram: 'Telegram' }[source] || source;

  let message = `🕵️ <b>Новый потенциальный читер</b> ${sourceEmoji} ${sourceLabel}\n`;
  message += `👤 Добавил: <b>${addedByUsername}</b>\n\n`;

  if (profiles.length === 1) {
    const p = profiles[0];
    message += `🎮 <a href="${p.profileUrl}">${p.personaName}</a>\n`;
    message += `🆔 <code>${p.steamId}</code>`;
  } else {
    message += `📋 Профилей: ${profiles.length}\n`;
    profiles.forEach((p, i) => {
      message += `${i + 1}. <a href="${p.profileUrl}">${p.personaName}</a> <code>${p.steamId}</code>\n`;
    });
  }

  await sendTelegramReport(message);
}

/**
 * Уведомление о добавлении пользователя в чёрный список
 */
export async function sendBlocklistAddNotification(addedByUsername, addedByUserId, blockedUsername, blockedUserId) {
  const message =
    `🚫 <b>Добавление в чёрный список</b>\n\n` +
    `👤 Кто добавил: ${addedByUsername} (<code>${addedByUserId}</code>)\n` +
    `🙈 Кого добавил: ${blockedUsername} (<code>${blockedUserId}</code>)\n` +
    `📅 Время: ${new Date().toLocaleString('ru-RU')}`;

  await sendTelegramReport(message);
}

// ===== TELEGRAM BOT =====
import TelegramBot from "node-telegram-bot-api";

let telegramBot = null;
let db = null;
let discordClient = null;
let getVoiceActivityHandler = null;
let getOnlineUsersHandler = null;

// Состояния пользователей для пошаговых диалогов
const userStates = new Map(); // chatId → state string


// ===== HELPER FUNCTIONS =====

/**
 * Получить связанный Discord ID по Telegram chat ID
 */
function getLinkedDiscordId(chatId) {
  // Ищем все записи для этого chat_id и возвращаем настоящий Discord ID (17-20 цифр)
  const results = db.prepare(
    'SELECT user_id FROM telegram_users WHERE telegram_chat_id = ? AND started_bot = 1'
  ).all(chatId.toString());
  
  if (!results || results.length === 0) return null;
  
  // Ищем запись с настоящим Discord ID (17-20 цифр)
  const realDiscord = results.find(r => /^\d{17,20}$/.test(r.user_id));
  return realDiscord ? realDiscord.user_id : null;
}

/**
 * Получить Discord username по user_id
 */
function getDiscordUsername(discordId) {
  const result = db.prepare('SELECT username FROM user_stats WHERE user_id = ?').get(discordId);
  return result ? result.username : 'Unknown';
}

// ===== INLINE MENU FUNCTIONS =====

/**
 * Отправка главного меню с inline-кнопками
 */
async function sendMainMenu(chatId) {
  const menuButtons = {
    inline_keyboard: [
      [
        { text: '🎤 Кто в канале', callback_data: 'menu_voice' },
        { text: '👥 Кто онлайн', callback_data: 'menu_online' }
      ],
      [
        { text: '🔍 Чекер читеров', callback_data: 'menu_checker' }
      ],
      [
        { text: '🐛 Багрепорт', callback_data: 'menu_bugreport' },
        { text: '⚙️ Настройки', callback_data: 'menu_settings' }
      ],
      [
        { text: '🌐 Открыть сайт', url: SERVER_CONFIG.SITE_URL }
      ]
    ]
  };

  const discordId = getLinkedDiscordId(chatId);
  const idLine = discordId ? `\n🆔 <code>${discordId}</code>` : '';

  await telegramBot.sendMessage(chatId, `<b>📱 Главное меню</b>${idLine}\n\nВыберите действие:`, {
    parse_mode: 'HTML',
    reply_markup: menuButtons
  });
}

/**
 * Отправка подменю чекера читеров
 */
async function sendCheckerMenu(chatId) {
  const checkerButtons = {
    inline_keyboard: [
      [
        { text: '📋 Мои добавленные', callback_data: 'checker_my_added' }
      ],
      [
        { text: '🔎 Проверить читера', callback_data: 'checker_check' }
      ],
      [
        { text: '◀️ Назад', callback_data: 'back_to_menu' }
      ]
    ]
  };

  await telegramBot.sendMessage(chatId, '<b>🔍 Чекер читеров</b>\n\nВыберите действие:', {
    parse_mode: 'HTML',
    reply_markup: checkerButtons
  });
}

/**
 * Отправка подменю настроек
 */
async function sendSettingsMenu(chatId) {
  const discordId = getLinkedDiscordId(chatId);
  if (!discordId) {
    await telegramBot.sendMessage(chatId, '❌ Ваш Telegram не связан с Discord аккаунтом. Используйте /link для связывания.');
    return;
  }

  const dm = db.getUserDMSetting(discordId);
  const timeout = db.getUserTimeout(discordId);
  const achievement = db.getUserAchievementNotificationSetting(discordId);
  const channel = db.getUserChannelNotificationSetting(discordId);
  const cheaterOwn = db.getUserCheaterOwnNotificationSetting(discordId);
  const cheaterOthers = db.getUserCheaterOthersNotificationSetting(discordId);
  const steamId = db.getSteamId(discordId);

  const timeoutDisplay = timeout < 15 ? `${timeout} сек` : `${timeout} мин`;

  const settingsButtons = {
    inline_keyboard: [
      [{ text: `📩 ЛС уведомления [${dm ? '✅' : '❌'}] · Для Discord`, callback_data: 'settings_toggle_dm' }],
      [{ text: `⏱ Время до AFK [${timeoutDisplay}] · Для Discord`, callback_data: 'settings_change_timeout' }],
      [{ text: `🏆 Уведомления о достижениях [${achievement ? '✅' : '❌'}] · Для Discord`, callback_data: 'settings_toggle_achievement' }],
      [{ text: `🔔 Кто в канале [${channel ? '✅' : '❌'}] · Для Telegram`, callback_data: 'settings_toggle_channel' }],
      [{ text: `🚨 Уведомления о читерах · Для Telegram`, callback_data: 'settings_cheater_menu' }],
      [{ text: `🎮 Steam [${steamId ? '✅' : '❌'}]`, callback_data: 'settings_steam_menu' }],
      [{ text: '◀️ Назад', callback_data: 'back_to_menu' }]
    ]
  };

  await telegramBot.sendMessage(chatId, '<b>⚙️ Настройки</b>\n\nНажмите на настройку чтобы изменить:', {
    parse_mode: 'HTML',
    reply_markup: settingsButtons
  });
}

/**
 * Переключение настройки и обновление меню
 */
async function toggleSetting(chatId, getter, setter, label) {
  const discordId = getLinkedDiscordId(chatId);
  if (!discordId) return;

  const current = getter.call(db, discordId);
  setter.call(db, discordId, !current);
  await sendSettingsMenu(chatId);
}

/**
 * Подменю времени до AFK
 */
async function sendTimeoutMenu(chatId) {
  const discordId = getLinkedDiscordId(chatId);
  if (!discordId) return;

  const current = db.getUserTimeout(discordId);

  const buttons = [
    [{ text: `${current === 15 ? '👉 ' : ''}15 минут`, callback_data: 'settings_set_timeout_15' }],
    [{ text: `${current === 30 ? '👉 ' : ''}30 минут`, callback_data: 'settings_set_timeout_30' }],
    [{ text: `${current === 45 ? '👉 ' : ''}45 минут`, callback_data: 'settings_set_timeout_45' }],
    [{ text: '◀️ Назад', callback_data: 'menu_settings' }]
  ];

  await telegramBot.sendMessage(chatId, '<b>⏱ Время до AFK</b>\n\nВыберите время неактивности:', {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  });
}

/**
 * Подменю уведомлений о читерах
 */
async function sendCheaterSettingsMenu(chatId) {
  const discordId = getLinkedDiscordId(chatId);
  if (!discordId) return;

  const own = db.getUserCheaterOwnNotificationSetting(discordId);
  const others = db.getUserCheaterOthersNotificationSetting(discordId);

  const buttons = [
    [{ text: `👤 Мои читеры [${own ? '✅' : '❌'}]`, callback_data: 'settings_toggle_cheater_own' }],
    [{ text: `👥 Чужие читеры [${others ? '✅' : '❌'}]`, callback_data: 'settings_toggle_cheater_others' }],
    [{ text: '◀️ Назад', callback_data: 'menu_settings' }]
  ];

  await telegramBot.sendMessage(chatId, '<b>🚨 Уведомления о читерах</b>\n\nВыберите опцию:', {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  });
}

/**
 * Подменю Steam аккаунта
 */
async function sendSteamMenu(chatId) {
  const discordId = getLinkedDiscordId(chatId);
  if (!discordId) return;

  const steamId = db.getSteamId(discordId);

  const buttons = [];
  if (steamId) {
    buttons.push([{ text: `✅ Привязан: ${steamId}`, callback_data: 'noop' }]);
    buttons.push([{ text: '🗑️ Отвязать Steam', callback_data: 'settings_unlink_steam' }]);
  } else {
    buttons.push([{ text: '❌ Не привязан', callback_data: 'noop' }]);
    buttons.push([{ text: '🔗 Привязать Steam ID', callback_data: 'settings_link_steam' }]);
  }
  buttons.push([{ text: '◀️ Назад', callback_data: 'menu_settings' }]);

  await telegramBot.sendMessage(chatId, '<b>🎮 Steam аккаунт</b>\n\nПривяжи Steam ID чтобы показывать CS2 статистику на профиле.\n\n💡 Не знаешь свой Steam ID? В клиенте Steam нажми на свой ник сверху → <b>Об аккаунте</b> — ID будет указан под именем. Или найди через <a href="https://steamid.io">steamid.io</a>', {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  });
}

/**
 * Обработка голосовой активности (для inline кнопки)
 */
async function handleVoiceActivity(chatId) {
  try {
    if (!getVoiceActivityHandler) {
      await telegramBot.sendMessage(chatId, '❌ Функция временно недоступна');
      return;
    }

    // Получаем заблокированных пользователей по Discord ID
    const discordId = getLinkedDiscordId(chatId);
    let blockedIds = [];
    if (discordId && db) {
      const blocklist = db.getUserBlocklist(discordId);
      blockedIds = blocklist.map(b => b.blocked_user_id);
    }

    const result = getVoiceActivityHandler(blockedIds);

    if (result.success) {
      await telegramBot.sendMessage(chatId, result.message, { parse_mode: 'HTML' });
    } else {
      await telegramBot.sendMessage(chatId, result.message || '❌ Не удалось получить информацию о каналах');
    }
  } catch (error) {
    console.error('❌ Ошибка при обработке "Кто в канале":', error);
    await telegramBot.sendMessage(chatId, '❌ Произошла ошибка при получении информации. Попробуйте позже.');
  }
}

/**
 * Обработка онлайн пользователей (для inline кнопки)
 */
async function handleOnlineUsers(chatId) {
  try {
    if (!getOnlineUsersHandler) {
      await telegramBot.sendMessage(chatId, '❌ Функция временно недоступна');
      return;
    }

    // Получаем заблокированных пользователей по Discord ID
    const discordId = getLinkedDiscordId(chatId);
    let blockedIds = [];
    if (discordId && db) {
      const blocklist = db.getUserBlocklist(discordId);
      blockedIds = blocklist.map(b => b.blocked_user_id);
    }

    const result = getOnlineUsersHandler(blockedIds);

    if (result.success) {
      await telegramBot.sendMessage(chatId, result.message, { parse_mode: 'HTML' });
    } else {
      await telegramBot.sendMessage(chatId, result.message || '❌ Не удалось получить список пользователей');
    }
  } catch (error) {
    console.error('❌ Ошибка при обработке "Кто онлайн":', error);
    await telegramBot.sendMessage(chatId, '❌ Произошла ошибка при получении информации. Попробуйте позже.');
  }
}

/**
 * Обработка "Мои добавленные" — показывает профили, добавленные пользователем
 */
async function handleMyAdded(chatId) {
  const discordId = getLinkedDiscordId(chatId);
  if (!discordId) {
    await telegramBot.sendMessage(chatId, '❌ Ваш Telegram не связан с Discord аккаунтом. Используйте /link для связывания.');
    return;
  }

  try {
    const profiles = db.prepare(
      'SELECT persona_name, vac_banned, number_of_game_bans, checked_at FROM cheater_checks WHERE checked_by_discord_id = ? ORDER BY checked_at DESC LIMIT 20'
    ).all(discordId);

    if (!profiles || profiles.length === 0) {
      const backButton = {
        inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'menu_checker' }]]
      };
      await telegramBot.sendMessage(chatId, '📭 Вы ещё не добавляли профили', {
        reply_markup: backButton
      });
      return;
    }

    let message = '<b>📋 Ваши добавленные профили:</b>\n\n';

    profiles.forEach((p, i) => {
      const status = (p.vac_banned || p.number_of_game_bans > 0) ? '🔴' : '🟢';
      const vacText = p.vac_banned ? 'VAC' : '';
      const gameText = p.number_of_game_bans > 0 ? `Game(${p.number_of_game_bans})` : '';
      const banInfo = [vacText, gameText].filter(Boolean).join(', ') || 'Чисто';
      const date = p.checked_at ? new Date(p.checked_at).toLocaleDateString('ru-RU') : '—';

      message += `${i + 1}. ${status} <b>${p.persona_name || 'Unknown'}</b>\n`;
      message += `   Статус: ${banInfo} | Дата: ${date}\n\n`;
    });

    const backButton = {
      inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'menu_checker' }]]
    };

    await telegramBot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: backButton
    });
  } catch (error) {
    console.error('❌ Ошибка получения добавленных профилей:', error);
    await telegramBot.sendMessage(chatId, '❌ Произошла ошибка при получении данных. Попробуйте позже.');
  }
}

/**
 * Обработка проверки Steam-профиля по URL
 */
async function handleSteamUrlCheck(chatId, text) {
  const discordId = getLinkedDiscordId(chatId);
  if (!discordId) {
    await telegramBot.sendMessage(chatId, '❌ Ваш Telegram не связан с Discord аккаунтом. Используйте /link для связывания.');
    return;
  }

  const discordUsername = getDiscordUsername(discordId);

  // Разбиваем на строки и фильтруем пустые + валидные Steam URL
  const urls = text.split('\n').map(line => line.trim()).filter(line => {
    if (!line) return false;
    return line.includes('steamcommunity.com/profiles/') || line.includes('steamcommunity.com/id/');
  });

  // Если нет валидных URL — пробуем как один URL
  let urlsToCheck = urls.length > 0 ? urls : [text.trim()];

  if (urlsToCheck.length > 5) {
    await telegramBot.sendMessage(chatId, '⚠️ Максимум 5 профилей за раз. Отправьте первые 5.');
    urlsToCheck = urlsToCheck.slice(0, 5);
  }

  const countText = urlsToCheck.length > 1 ? `${urlsToCheck.length} профилей` : 'профиль';
  await telegramBot.sendMessage(chatId, `⏳ Проверяю ${countText}... Это может занять несколько секунд.`);

  try {
    const { results, errors } = await checkProfiles(urlsToCheck);

    if (errors.length > 0 && results.length === 0) {
      await telegramBot.sendMessage(chatId, `❌ Ошибка проверки:\n${errors.join('\n')}`);
      return;
    }

    if (results.length === 0) {
      await telegramBot.sendMessage(chatId, '❌ Не удалось получить данные профиля.');
      return;
    }

    // Обрабатываем каждый профиль
    for (const profile of results) {
      const existingProfile = db.getCheaterCheckBySteamId(profile.steamId);
      if (existingProfile) {
        db.upsertCheaterCheck({
          ...profile,
          checkedByDiscordId: discordId,
          checkedByUsername: discordUsername,
        });

        const isBanned = profile.vacBanned || profile.numberOfGameBans > 0 || profile.communityBanned || (profile.economyBan && profile.economyBan !== 'none');
        const statusEmoji = isBanned ? '🔴' : '🟢';
        const statusText = isBanned ? 'ЗАБАНЕН' : 'ЧИСТО';

        const isSameUser = existingProfile.checked_by_discord_id === discordId;
        let dupMessage;
        if (isSameUser) {
          dupMessage = `⚠️ <b>Ты уже добавлял этого читера!</b>\n\n`;
          dupMessage += `📅 Дата: ${new Date(existingProfile.checked_at).toLocaleDateString('ru-RU')}\n\n`;
        } else {
          dupMessage = `⚠️ <b>Этот профиль уже добавлен!</b>\n\n`;
          dupMessage += `👤 Добавил: <b>${existingProfile.checked_by_username || 'Unknown'}</b>\n`;
          dupMessage += `📅 Дата: ${new Date(existingProfile.checked_at).toLocaleDateString('ru-RU')}\n\n`;
        }
        dupMessage += `${statusEmoji} <b>${profile.personaName}</b> — ${statusText}\n`;
        dupMessage += `🔗 <a href="${profile.profileUrl}">Профиль Steam</a>\n`;
        dupMessage += `\nДанные о банах обновлены.`;

        await telegramBot.sendMessage(chatId, dupMessage, {
          parse_mode: 'HTML',
          disable_web_page_preview: true
        });
        continue;
      }

      // Сохраняем в БД
      db.upsertCheaterCheck({
        ...profile,
        checkedByDiscordId: discordId,
        checkedByUsername: discordUsername,
      });

      // Уведомление админу
      try {
        await sendNewCheaterNotification(discordUsername, 'telegram', [{
          personaName: profile.personaName || profile.steamId,
          profileUrl: profile.profileUrl || `https://steamcommunity.com/profiles/${profile.steamId}`,
          steamId: profile.steamId,
        }]);
      } catch (err) {
        console.error('[TG] Ошибка отправки уведомления о читере:', err.message);
      }

      const isBanned = profile.vacBanned || profile.numberOfGameBans > 0 || profile.communityBanned || (profile.economyBan && profile.economyBan !== 'none');
      const statusEmoji = isBanned ? '🔴' : '🟢';
      const statusText = isBanned ? 'ЗАБАНЕН' : 'ЧИСТО';

      let resultMessage = `${statusEmoji} <b>${profile.personaName}</b> — ${statusText}\n\n`;
      resultMessage += `🔗 <a href="${profile.profileUrl}">Профиль Steam</a>\n`;
      resultMessage += `🆔 SteamID64: <code>${profile.steamId}</code>\n\n`;
      resultMessage += `<b>Детали:</b>\n`;
      resultMessage += `• VAC-бан: ${profile.vacBanned ? `Да (${profile.numberOfVacBans} бан(ов))` : 'Нет'}\n`;
      resultMessage += `• Игровые баны: ${profile.numberOfGameBans > 0 ? profile.numberOfGameBans : 'Нет'}\n`;
      resultMessage += `• Дней с последнего бана: ${profile.daysSinceLastBan > 0 ? profile.daysSinceLastBan : '—'}\n`;
      resultMessage += `• Коммьюнити-бан: ${profile.communityBanned ? 'Да' : 'Нет'}\n`;
      resultMessage += `• Торговый бан: ${profile.economyBan !== 'none' ? profile.economyBan : 'Нет'}\n`;

      const resultButtons = {
        inline_keyboard: [
          [{ text: '📢 Опубликовать в Discord', callback_data: `checker_publish_${profile.steamId}` }],
          [{ text: '🔎 Проверить ещё', callback_data: 'checker_check' }],
          [{ text: '◀️ Назад в меню', callback_data: 'back_to_menu' }]
        ]
      };

      await telegramBot.sendMessage(chatId, resultMessage, {
        parse_mode: 'HTML',
        reply_markup: resultButtons,
        disable_web_page_preview: true
      });
    }

    if (errors.length > 0) {
      await telegramBot.sendMessage(chatId, `⚠️ Предупреждения:\n${errors.join('\n')}`);
    }
  } catch (error) {
    console.error('❌ Ошибка проверки Steam профиля:', error);
    await telegramBot.sendMessage(chatId, '❌ Произошла ошибка при проверке. Попробуйте позже.');
  }
}

/**
 * Публикация профиля в Discord
 */
async function handlePublishToDiscord(chatId, steamId) {
  const discordId = getLinkedDiscordId(chatId);
  if (!discordId) {
    await telegramBot.sendMessage(chatId, '❌ Ваш Telegram не связан с Discord аккаунтом. Используйте /link для связывания.');
    return;
  }

  try {
    const profile = db.getCheaterCheckBySteamId(steamId);
    if (!profile) {
      await telegramBot.sendMessage(chatId, '❌ Профиль не найден в базе данных.');
      return;
    }

    const threadId = STEAM_CONFIG.VAC_THREAD_ID;
    if (!threadId) {
      await telegramBot.sendMessage(chatId, '❌ VAC_THREAD_ID не настроен на сервере.');
      return;
    }

    // Цвета embed
    const EMBED_COLORS = {
      BANNED: 0xFF0000,
      RESTRICTED: 0xFFAA00,
      CLEAN: 0x00CC44,
    };

    let color = EMBED_COLORS.CLEAN;
    if (profile.vac_banned || profile.number_of_game_bans > 0) {
      color = EMBED_COLORS.BANNED;
    } else if (profile.community_banned || (profile.economy_ban && profile.economy_ban !== 'none')) {
      color = EMBED_COLORS.RESTRICTED;
    }

    const embed = new EmbedBuilder()
      .setTitle(profile.persona_name || 'Unknown')
      .setURL(profile.profile_url)
      .setThumbnail(profile.avatar_url || null)
      .setColor(color)
      .addFields(
        { name: 'SteamID64', value: profile.steam_id, inline: true },
        { name: 'VAC-бан', value: profile.vac_banned ? `Да (${profile.number_of_vac_bans} бан(ов))` : 'Нет', inline: true },
        { name: 'Игровые баны', value: profile.number_of_game_bans > 0 ? `${profile.number_of_game_bans}` : 'Нет', inline: true },
        { name: 'Дней с последнего бана', value: profile.days_since_last_ban > 0 ? `${profile.days_since_last_ban}` : '—', inline: true },
        { name: 'Коммьюнити-бан', value: profile.community_banned ? 'Да' : 'Нет', inline: true },
        { name: 'Торговый бан', value: profile.economy_ban !== 'none' ? profile.economy_ban : 'Нет', inline: true },
      )
      .setFooter({ text: `Checked by ${profile.checked_by_username || 'Unknown'} (via Telegram)` })
      .setTimestamp();

    const channel = await discordClient.channels.fetch(threadId).catch(() => null);
    if (!channel) {
      await telegramBot.sendMessage(chatId, '❌ Не удалось найти Discord канал.');
      return;
    }

    await channel.send({ embeds: [embed] });
    await telegramBot.sendMessage(chatId, '✅ Опубликовано в Discord');
  } catch (error) {
    console.error('❌ Ошибка публикации в Discord:', error);
    await telegramBot.sendMessage(chatId, '❌ Не удалось опубликовать в Discord. Попробуйте позже.');
  }
}


/**
 * Отправка подменю багрепортов
 */
async function sendBugReportMenu(chatId) {
  const bugReportButtons = {
    inline_keyboard: [
      [
        { text: '📋 Мои багрепорты', callback_data: 'bugreport_my' }
      ],
      [
        { text: '✍️ Написать багрепорт', callback_data: 'bugreport_write' }
      ],
      [
        { text: '◀️ Назад', callback_data: 'back_to_menu' }
      ]
    ]
  };

  await telegramBot.sendMessage(chatId, '<b>🐛 Багрепорт</b>\n\nВыберите действие:', {
    parse_mode: 'HTML',
    reply_markup: bugReportButtons
  });
}

/**
 * Обработка "Мои багрепорты" — показывает багрепорты пользователя
 */
async function handleMyBugReports(chatId) {
  const discordId = getLinkedDiscordId(chatId);
  if (!discordId) {
    await telegramBot.sendMessage(chatId, '❌ Ваш Telegram не связан с Discord аккаунтом. Используйте /link для связывания.');
    return;
  }

  try {
    const reports = db.getBugReportsByUser(discordId);

    if (!reports || reports.length === 0) {
      const backButton = {
        inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'menu_bugreport' }]]
      };
      await telegramBot.sendMessage(chatId, '📭 У вас нет багрепортов', {
        reply_markup: backButton
      });
      return;
    }

    const statusIcons = { new: '🆕', in_progress: '🔄', resolved: '✅', rejected: '❌' };
    const statusTexts = { new: 'Новый', in_progress: 'В работе', resolved: 'Решено', rejected: 'Отклонено' };

    let message = '<b>📋 Ваши багрепорты:</b>\n\n';

    reports.slice(0, 10).forEach((r, i) => {
      const icon = statusIcons[r.status] || '❓';
      const statusText = statusTexts[r.status] || r.status;
      const date = new Date(r.created_at).toLocaleDateString('ru-RU');
      const preview = r.bug_text.length > 60 ? r.bug_text.substring(0, 60) + '...' : r.bug_text;

      message += `${i + 1}. ${icon} <b>#${r.id}</b> — ${statusText}\n`;
      message += `   📝 ${preview}\n`;
      message += `   📅 ${date}\n\n`;
    });

    if (reports.length > 10) {
      message += `\n<i>Показаны последние 10 из ${reports.length}</i>`;
    }

    const backButton = {
      inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'menu_bugreport' }]]
    };

    await telegramBot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: backButton
    });
  } catch (error) {
    console.error('❌ Ошибка получения багрепортов:', error);
    await telegramBot.sendMessage(chatId, '❌ Произошла ошибка при получении данных. Попробуйте позже.');
  }
}


/**
 * Инициализация Telegram бота
 */
export function initTelegramBot(
  database,
  client,
  linkCodeHandler,
  voiceActivityHandler,
  onlineUsersHandler,
) {
  if (!TELEGRAM_TOKEN) {
    console.log(
      "⚠️ TELEGRAM_BOT_TOKEN не настроен, Telegram бот не будет запущен",
    );
    return null;
  }

  db = database;
  discordClient = client;
  getVoiceActivityHandler = voiceActivityHandler;
  getOnlineUsersHandler = onlineUsersHandler;

  try {
    telegramBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
    console.log("✅ Telegram бот запущен");

    // Регистрируем команды для кнопки Menu в Telegram
    telegramBot.setMyCommands([
      { command: 'menu', description: 'Главное меню' },
      { command: 'start', description: 'Запустить бота' },
      { command: 'link', description: 'Связать с Discord (код)' }
    ]).catch(err => console.error('Ошибка setMyCommands:', err.message));

    // Обработчик команды /start
    telegramBot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const telegramUserId = msg.from.id;
      const telegramUsername =
        msg.from.username || msg.from.first_name || "Пользователь";

      console.log(
        `📱 Получена команда /start от ${telegramUsername} (${telegramUserId}), chat_id: ${chatId}`,
      );

      try {
        // Проверяем, был ли пользователь уже зарегистрирован ранее
        let wasRegistered = false;
        let previousChatId = null;

        if (db) {
          try {
            const existingUser = db
              .prepare(
                "SELECT telegram_chat_id, started_bot, created_at FROM telegram_users WHERE telegram_chat_id = ?",
              )
              .get(chatId.toString());

            if (existingUser && existingUser.started_bot) {
              wasRegistered = true;
              previousChatId = existingUser.telegram_chat_id;
              console.log(
                `ℹ️ Пользователь уже был зарегистрирован ранее (chat_id: ${previousChatId}, дата: ${existingUser.created_at})`,
              );
            }
          } catch (dbError) {
            console.log(`⚠️ Ошибка проверки регистрации: ${dbError.message}`);
          }
        }

        // Сохраняем/обновляем информацию о том, что пользователь нажал /start
        if (db) {
          try {
            if (wasRegistered) {
              db.prepare(
                `UPDATE telegram_users SET started_bot = 1 WHERE telegram_chat_id = ?`,
              ).run(chatId.toString());
              console.log(
                `✅ Флаг started_bot обновлен для существующего пользователя`,
              );
            } else {
              db.prepare(
                `INSERT OR REPLACE INTO telegram_users (user_id, telegram_chat_id, started_bot, created_at) 
                 VALUES ('telegram_' || ?, ?, 1, CURRENT_TIMESTAMP)`,
              ).run(chatId.toString(), chatId.toString());
              console.log(`✅ Новый пользователь создан в БД`);
            }
          } catch (dbError) {
            console.log(`⚠️ Ошибка сохранения в БД: ${dbError.message}`);
          }
        }

        const welcomeMessage = wasRegistered
          ? `👋 <b>С возвращением, ${telegramUsername}!</b>\n\n` +
            `✅ Бот снова активирован!\n\n` +
            `Теперь вы можете снова включить уведомления "Кто в канале" в настройках веб-панели.\n\n` +
            `📊 Напоминаем:\n` +
            `1️⃣ Зайти на веб-панель бота\n` +
            `2️⃣ Перейти в настройки\n` +
            `3️⃣ Включить уведомления "Кто в канале"\n\n` +
            `После этого вы будете получать уведомления о том, кто заходит и выходит из голосовых каналов! 🔔`
          : `👋 <b>Привет, ${telegramUsername}!</b>\n\n` +
            `✅ Вы успешно активировали бота!\n\n` +
            `Теперь вы можете включить уведомления "Кто в канале" в настройках веб-панели.\n\n` +
            `📊 Чтобы связать ваш Discord аккаунт с Telegram, вам нужно:\n` +
            `1️⃣ Зайти на веб-панель бота\n` +
            `2️⃣ Перейти в настройки\n` +
            `3️⃣ Включить уведомления "Кто в канале"\n\n` +
            `После этого вы будете получать уведомления о том, кто заходит и выходит из голосовых каналов! 🔔`;

        try {
          console.log(`📤 Отправка приветственного сообщения пользователю...`);

          await telegramBot.sendMessage(chatId, welcomeMessage, {
            parse_mode: "HTML",
          });

          // Отправляем главное меню
          await sendMainMenu(chatId);

          console.log(`✅ Приветственное сообщение и меню отправлены`);
        } catch (sendError) {
          console.error(
            `❌ Ошибка отправки приветственного сообщения: ${sendError.message}`,
          );
        }

        // Пытаемся найти пользователя в Discord по username
        let discordUsername = "Не найден";
        let discordUserId = "Не найден";

        console.log(`🔍 Начинаем поиск пользователя Discord...`);

        if (
          discordClient &&
          discordClient.guilds &&
          discordClient.guilds.cache.size > 0
        ) {
          const guild = discordClient.guilds.cache.first();

          try {
            console.log(`🔍 Поиск пользователя Discord в кеше...`);
            // Используем кеш вместо fetch() чтобы не получать rate limit
            const members = guild.members.cache;
            console.log(`📋 В кеше ${members.size} участников`);

            const foundMember = members.find((member) => {
              const username = member.user.username.toLowerCase();
              const displayName = member.displayName.toLowerCase();
              const telegramName = telegramUsername
                .toLowerCase()
                .replace("@", "");

              return (
                username.includes(telegramName) ||
                displayName.includes(telegramName) ||
                telegramName.includes(username)
              );
            });

            if (foundMember) {
              discordUsername =
                foundMember.displayName || foundMember.user.username;
              discordUserId = foundMember.user.id;
              console.log(
                `✅ Найден пользователь Discord: ${discordUsername} (${discordUserId})`,
              );

              if (db) {
                try {
                  db.prepare(
                    `INSERT OR REPLACE INTO telegram_users (user_id, telegram_chat_id, started_bot, created_at) 
                     VALUES (?, ?, 1, COALESCE((SELECT created_at FROM telegram_users WHERE user_id = ?), CURRENT_TIMESTAMP))`,
                  ).run(discordUserId, chatId.toString(), discordUserId);
                  console.log(
                    `✅ Связь Discord ID ${discordUserId} ↔ Telegram chat ${chatId} сохранена`,
                  );
                } catch (linkError) {
                  console.error(
                    `❌ Ошибка сохранения связи: ${linkError.message}`,
                  );
                }
              }
            } else {
              console.log(
                `⚠️ Пользователь Discord не найден по имени: ${telegramUsername}`,
              );
            }
          } catch (searchError) {
            console.error(
              `❌ Ошибка поиска пользователя Discord: ${searchError.message}`,
            );
            console.error(searchError.stack);
          }
        } else {
          console.log(`⚠️ Discord client не готов или нет серверов`);
        }

        console.log(
          `🎯 Discord пользователь: ${discordUsername} (${discordUserId})`,
        );

        // Отправляем уведомление админу только для новых пользователей
        if (!wasRegistered) {
          const notificationTitle = `🆕 <b>Новый пользователь нажал /start</b>`;

          console.log(`📤 Отправка уведомления админу: НОВЫЙ ПОЛЬЗОВАТЕЛЬ`);

          const adminNotification =
            `${notificationTitle}\n\n` +
            `👤 Telegram: @${telegramUsername}\n` +
            `🆔 Telegram ID: <code>${telegramUserId}</code>\n` +
            `💬 Chat ID: <code>${chatId}</code>\n` +
            `🎮 Discord: ${discordUsername}\n` +
            `🆔 Discord ID: <code>${discordUserId}</code>\n` +
            `📅 Время: ${new Date().toLocaleString("ru-RU")}`;

          console.log(`📨 Текст уведомления:\n${adminNotification}`);

          try {
            await sendTelegramReport(adminNotification);
            console.log(`✅ Уведомление админу отправлено успешно`);
          } catch (reportError) {
            console.error(
              `❌ Ошибка отправки уведомления админу: ${reportError.message}`,
            );
            console.error(reportError.stack);
          }
        } else {
          console.log(
            `⏭️ Повторная активация - уведомление админу не отправляется`,
          );
        }

        const statusMessage = wasRegistered
          ? `✅ Пользователь ${telegramUsername} вернулся и получил приветственное сообщение`
          : `✅ Пользователь ${telegramUsername} получил приветственное сообщение`;
        console.log(statusMessage);
      } catch (error) {
        console.error("❌ Ошибка при обработке /start:", error);
      }
    });

    // Обработчик команды /menu
    telegramBot.onText(/\/menu/, async (msg) => {
      await sendMainMenu(msg.chat.id);
    });

    // Обработчик команды /link для связывания аккаунтов через код
    telegramBot.onText(/\/link (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const code = match[1].trim();
      const telegramUsername =
        msg.from.username || msg.from.first_name || "Пользователь";

      console.log(
        `🔗 Получена команда /link с кодом: ${code} от ${telegramUsername}`,
      );

      try {
        if (!linkCodeHandler) {
          await telegramBot.sendMessage(
            chatId,
            "❌ Функция связывания временно недоступна",
          );
          return;
        }

        const result = linkCodeHandler(code, chatId.toString());

        if (result.success) {
          let discordUsername = "Discord пользователь";
          if (discordClient && db) {
            const userStat = db
              .prepare("SELECT username FROM user_stats WHERE user_id = ?")
              .get(result.userId);
            if (userStat) {
              discordUsername = userStat.username;
            }
          }

          await telegramBot.sendMessage(
            chatId,
            `✅ <b>Успешно связано!</b>\n\n` +
              `Ваш Telegram аккаунт теперь связан с Discord аккаунтом <b>${discordUsername}</b>.\n\n` +
              `Теперь вы можете:\n` +
              `• Включить уведомления "Кто в канале" в настройках веб-панели\n` +
              `• Получать персональные уведомления о голосовых каналах\n\n` +
              `🎉 Приятного использования!`,
            { parse_mode: "HTML" },
          );

          console.log(
            `✅ Аккаунт успешно связан: Discord ${result.userId} ↔ Telegram ${chatId}`,
          );

          await sendTelegramReport(
            `🔗 <b>Аккаунты связаны через код</b>\n\n` +
              `👤 Telegram: @${telegramUsername}\n` +
              `💬 Chat ID: <code>${chatId}</code>\n` +
              `🎮 Discord: ${discordUsername}\n` +
              `🆔 Discord ID: <code>${result.userId}</code>\n` +
              `🔢 Код: <code>${code}</code>\n` +
              `📅 Время: ${new Date().toLocaleString("ru-RU")}`,
          );
        } else {
          let errorMessage = "❌ Ошибка связывания аккаунта\n\n";

          if (result.error === "Код не найден") {
            errorMessage +=
              "Неверный код. Проверьте правильность кода и попробуйте снова.";
          } else if (result.error === "Код уже использован") {
            errorMessage +=
              "Этот код уже был использован. Сгенерируйте новый код на веб-панели.";
          } else if (result.error === "Код истёк") {
            errorMessage +=
              "Срок действия кода истёк (15 минут). Сгенерируйте новый код на веб-панели.";
          } else {
            errorMessage += result.error;
          }

          errorMessage +=
            "\n\n💡 Чтобы получить новый код:\n" +
            "1️⃣ Откройте веб-панель бота\n" +
            "2️⃣ Перейдите в настройки\n" +
            "3️⃣ Нажмите 'Связать с Telegram'\n" +
            "4️⃣ Отправьте команду /link XXXXXX с новым кодом";

          await telegramBot.sendMessage(chatId, errorMessage);
          console.log(`❌ Ошибка связывания: ${result.error}`);
        }
      } catch (error) {
        console.error("❌ Ошибка при обработке /link:", error);
        await telegramBot.sendMessage(
          chatId,
          "❌ Произошла ошибка при связывании аккаунта. Попробуйте позже.",
        );
      }
    });

    // ===== CALLBACK QUERY HANDLER (inline кнопки) =====
    telegramBot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;

      try {
        await telegramBot.answerCallbackQuery(query.id);
      } catch (e) {
        // Игнорируем ошибку если callback уже отвечен
      }

      console.log(`🔘 Callback query: ${data} от chat_id: ${chatId}`);

      try {
        switch (data) {
          case 'menu_voice':
            await handleVoiceActivity(chatId);
            break;

          case 'menu_online':
            await handleOnlineUsers(chatId);
            break;

          case 'menu_checker': {
            // Проверяем привязку перед показом меню чекера
            const discordId = getLinkedDiscordId(chatId);
            if (!discordId) {
              await telegramBot.sendMessage(chatId, '❌ Ваш Telegram не связан с Discord аккаунтом. Используйте /link для связывания.');
              return;
            }
            await sendCheckerMenu(chatId);
            break;
          }

          case 'menu_settings': {
            const discordIdSettings = getLinkedDiscordId(chatId);
            if (!discordIdSettings) {
              await telegramBot.sendMessage(chatId, '❌ Ваш Telegram не связан с Discord аккаунтом. Используйте /link для связывания.');
              return;
            }
            await sendSettingsMenu(chatId);
            break;
          }

          case 'settings_toggle_dm':
            await toggleSetting(chatId, db.getUserDMSetting, db.setUserDMSetting);
            break;

          case 'settings_toggle_achievement':
            await toggleSetting(chatId, db.getUserAchievementNotificationSetting, db.setUserAchievementNotificationSetting);
            break;

          case 'settings_toggle_channel':
            await toggleSetting(chatId, db.getUserChannelNotificationSetting, db.setUserChannelNotificationSetting);
            break;

          case 'settings_toggle_cheater_own': {
            const dIdOwn = getLinkedDiscordId(chatId);
            if (dIdOwn) {
              const cur = db.getUserCheaterOwnNotificationSetting(dIdOwn);
              db.setUserCheaterOwnNotificationSetting(dIdOwn, !cur);
              await sendCheaterSettingsMenu(chatId);
            }
            break;
          }

          case 'settings_toggle_cheater_others': {
            const dIdOthers = getLinkedDiscordId(chatId);
            if (dIdOthers) {
              const cur = db.getUserCheaterOthersNotificationSetting(dIdOthers);
              db.setUserCheaterOthersNotificationSetting(dIdOthers, !cur);
              await sendCheaterSettingsMenu(chatId);
            }
            break;
          }

          case 'settings_change_timeout':
            await sendTimeoutMenu(chatId);
            break;

          case 'settings_set_timeout_15': {
            const dId15 = getLinkedDiscordId(chatId);
            if (dId15) { db.setUserTimeout(dId15, 15); await sendSettingsMenu(chatId); }
            break;
          }

          case 'settings_set_timeout_30': {
            const dId30 = getLinkedDiscordId(chatId);
            if (dId30) { db.setUserTimeout(dId30, 30); await sendSettingsMenu(chatId); }
            break;
          }

          case 'settings_set_timeout_45': {
            const dId45 = getLinkedDiscordId(chatId);
            if (dId45) { db.setUserTimeout(dId45, 45); await sendSettingsMenu(chatId); }
            break;
          }

          case 'settings_cheater_menu':
            await sendCheaterSettingsMenu(chatId);
            break;

          case 'settings_steam_menu':
            await sendSteamMenu(chatId);
            break;

          case 'settings_unlink_steam': {
            const dIdSteam = getLinkedDiscordId(chatId);
            if (dIdSteam) {
              db.setSteamId(dIdSteam, null);
              await sendSteamMenu(chatId);
            }
            break;
          }

          case 'settings_link_steam': {
            userStates.set(chatId, 'awaiting_steam_id');
            const cancelButton = {
              inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'settings_steam_menu' }]]
            };
            await telegramBot.sendMessage(chatId, '🎮 Отправьте свой Steam ID (17-значный числовой идентификатор, начинающийся на 765611)\n\n💡 Не знаешь свой Steam ID? В клиенте Steam нажми на свой ник сверху → <b>Об аккаунте</b> — ID будет указан под именем.', {
              parse_mode: 'HTML',
              reply_markup: cancelButton
            });
            break;
          }

          case 'noop':
            break;

          case 'checker_my_added':
            await handleMyAdded(chatId);
            break;

          case 'checker_check': {
            // Проверяем привязку
            const discordIdCheck = getLinkedDiscordId(chatId);
            if (!discordIdCheck) {
              await telegramBot.sendMessage(chatId, '❌ Ваш Telegram не связан с Discord аккаунтом. Используйте /link для связывания.');
              return;
            }
            userStates.set(chatId, 'awaiting_steam_url');
            const cancelButton = {
              inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu_checker' }]]
            };
            await telegramBot.sendMessage(chatId, '🔗 Отправьте ссылку на Steam-профиль для проверки\n\nМожно отправить до 5 ссылок (каждая ссылка с новой строки)\n\nПримеры:\n• https://steamcommunity.com/id/username\n• https://steamcommunity.com/profiles/76561198xxxxxxxxx', {
              reply_markup: cancelButton
            });
            break;
          }

          case 'back_to_menu':
            userStates.delete(chatId);
            await sendMainMenu(chatId);
            break;

          case 'menu_bugreport': {
            const discordIdBug = getLinkedDiscordId(chatId);
            if (!discordIdBug) {
              await telegramBot.sendMessage(chatId, '❌ Ваш Telegram не связан с Discord аккаунтом. Используйте /link для связывания.');
              return;
            }
            await sendBugReportMenu(chatId);
            break;
          }

          case 'bugreport_my':
            await handleMyBugReports(chatId);
            break;

          case 'bugreport_write': {
            const discordIdWrite = getLinkedDiscordId(chatId);
            if (!discordIdWrite) {
              await telegramBot.sendMessage(chatId, '❌ Ваш Telegram не связан с Discord аккаунтом. Используйте /link для связывания.');
              return;
            }
            userStates.set(chatId, 'awaiting_bug_text');
            const cancelBugButton = {
              inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu_bugreport' }]]
            };
            await telegramBot.sendMessage(chatId, '✍️ Опишите проблему или ошибку, которую вы обнаружили:\n\n<i>Просто напишите текст сообщением</i>', {
              parse_mode: 'HTML',
              reply_markup: cancelBugButton
            });
            break;
          }

          default:
            // Обработка публикации в Discord
            if (data.startsWith('checker_publish_')) {
              const steamId = data.replace('checker_publish_', '');
              await handlePublishToDiscord(chatId, steamId);
            }
            break;
        }
      } catch (error) {
        console.error(`❌ Ошибка обработки callback_query (${data}):`, error);
        await telegramBot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
      }
    });

    // Обработчик текстовых сообщений
    telegramBot.on("message", async (msg) => {
      // Пропускаем команды (они обрабатываются отдельно)
      if (msg.text && msg.text.startsWith("/")) {
        return;
      }

      const chatId = msg.chat.id;
      const text = msg.text;

      // Проверяем состояние пользователя (ожидание Steam URL)
      if (userStates.get(chatId) === 'awaiting_steam_url') {
        userStates.delete(chatId);
        if (text) {
          await handleSteamUrlCheck(chatId, text.trim());
        }
        return;
      }

      // Проверяем состояние пользователя (ожидание Steam ID для привязки)
      if (userStates.get(chatId) === 'awaiting_steam_id') {
        userStates.delete(chatId);
        if (text) {
          const steamId = text.trim();
          if (!/^\d{17}$/.test(steamId) || !steamId.startsWith('765611')) {
            await telegramBot.sendMessage(chatId, '❌ Невалидный Steam ID. Ожидается 17-значный числовой идентификатор, начинающийся на 765611');
            await sendSteamMenu(chatId);
          } else {
            const discordId = getLinkedDiscordId(chatId);
            if (discordId) {
              db.setSteamId(discordId, steamId);
              await telegramBot.sendMessage(chatId, `✅ Steam ID ${steamId} успешно привязан!`);
              await sendSteamMenu(chatId);
            }
          }
        }
        return;
      }

      // Проверяем состояние пользователя (ожидание текста багрепорта)
      if (userStates.get(chatId) === 'awaiting_bug_text') {
        userStates.delete(chatId);
        if (text) {
          const discordId = getLinkedDiscordId(chatId);
          if (!discordId) {
            await telegramBot.sendMessage(chatId, '❌ Ваш Telegram не связан с Discord аккаунтом.');
            return;
          }

          // Получаем username: сначала из Discord, если нет — из Telegram
          let username = getDiscordUsername(discordId);
          if (username === 'Unknown') {
            username = msg.from?.username || msg.from?.first_name || 'Telegram User';
          }

          try {
            const id = db.createBugReport(discordId, username, text.trim());
            console.log(`🐛 Новый багрепорт #${id} от ${username} (${discordId}) через Telegram`);

            // Уведомляем админа
            const adminMessage =
              `🐛 <b>Новый багрепорт #${id}</b> (через Telegram)\n\n` +
              `👤 Пользователь: ${username}\n` +
              `🆔 ID: <code>${discordId}</code>\n` +
              `📝 Текст: ${text.trim().substring(0, 500)}${text.trim().length > 500 ? '...' : ''}\n` +
              `📅 Время: ${new Date().toLocaleString('ru-RU')}`;

            await sendTelegramReport(adminMessage);

            const backButton = {
              inline_keyboard: [[{ text: '◀️ Назад в меню', callback_data: 'back_to_menu' }]]
            };
            await telegramBot.sendMessage(chatId, '✅ Спасибо! Ваш отчёт об ошибке #' + id + ' отправлен администратору.', {
              reply_markup: backButton
            });
          } catch (error) {
            console.error('❌ Ошибка создания багрепорта через Telegram:', error);
            await telegramBot.sendMessage(chatId, '❌ Произошла ошибка при отправке. Попробуйте позже.');
          }
        }
        return;
      }

      // Fallback: обработка старых кнопок клавиатуры (для пользователей с кешированной клавиатурой)
      if (text === "🎤 Кто в канале") {
        console.log(`🎤 Получен запрос "Кто в канале" от chat_id: ${chatId}`);
        await handleVoiceActivity(chatId);
      }

      if (text === "👥 Кто онлайн") {
        console.log(`👥 Получен запрос "Кто онлайн" от chat_id: ${chatId}`);
        await handleOnlineUsers(chatId);
      }
    });

    // Обработчик ошибок polling
    telegramBot.on("polling_error", (error) => {
      console.error("❌ Ошибка Telegram polling:", error.code, error.message);
    });

    return telegramBot;
  } catch (error) {
    console.error("❌ Ошибка при инициализации Telegram бота:", error);
    return null;
  }
}

/**
 * Получить экземпляр Telegram бота
 */
export function getTelegramBot() {
  return telegramBot;
}

/**
 * Регистрация Discord пользователя в Telegram боте
 * @param {string} discordUserId - Discord ID пользователя
 * @param {string} telegramChatId - Telegram Chat ID
 */
export function registerTelegramUser(discordUserId, telegramChatId) {
  if (!db) {
    console.error("❌ База данных не инициализирована");
    return false;
  }

  try {
    db.prepare(
      `INSERT OR REPLACE INTO telegram_users (user_id, telegram_chat_id, started_bot, created_at) 
       VALUES (?, ?, 1, CURRENT_TIMESTAMP)`,
    ).run(discordUserId, telegramChatId);

    console.log(
      `✅ Пользователь ${discordUserId} зарегистрирован в Telegram (chat_id: ${telegramChatId})`,
    );
    return true;
  } catch (error) {
    console.error("❌ Ошибка регистрации Telegram пользователя:", error);
    return false;
  }
}

/**
 * Отправка уведомления конкретному пользователю в Telegram
 * @param {string} chatId - Telegram Chat ID пользователя
 * @param {string} message - Сообщение для отправки
 */
export async function sendTelegramMessageToUser(chatId, message) {
  if (!telegramBot) {
    console.error("❌ Telegram бот не инициализирован");
    return false;
  }

  try {
    await telegramBot.sendMessage(chatId, message, { parse_mode: "HTML" });
    console.log(`✅ Уведомление отправлено пользователю (chat_id: ${chatId})`);
    return true;
  } catch (error) {
    console.error(
      `❌ Ошибка отправки уведомления пользователю: ${error.message}`,
    );
    return false;
  }
}
