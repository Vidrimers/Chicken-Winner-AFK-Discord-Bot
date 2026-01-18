import dotenv from "dotenv";
dotenv.config();

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
  emoji,
  name,
  description,
  color,
  specialDate,
) {
  let message =
    `🏆 <b>Новое специальное достижение!</b>\n` +
    `👤 Пользователь: ${username}\n` +
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

// ===== TELEGRAM BOT =====
import TelegramBot from "node-telegram-bot-api";

let telegramBot = null;
let db = null;
let discordClient = null;
let getVoiceActivityHandler = null;
let getOnlineUsersHandler = null;

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
              // Обновляем только флаг started_bot, сохраняя created_at
              db.prepare(
                `UPDATE telegram_users SET started_bot = 1 WHERE telegram_chat_id = ?`,
              ).run(chatId.toString());
              console.log(
                `✅ Флаг started_bot обновлен для существующего пользователя`,
              );
            } else {
              // Создаем новую запись
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

          // Создаем клавиатуру с кнопками
          const keyboard = {
            keyboard: [
              [{ text: "🎤 Кто в канале" }],
              [{ text: "👥 Кто онлайн" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
          };

          await telegramBot.sendMessage(chatId, welcomeMessage, {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
          console.log(`✅ Приветственное сообщение отправлено с клавиатурой`);
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
            console.log(`📥 Загрузка списка участников сервера...`);
            // Пытаемся найти пользователя по Telegram username
            const members = await guild.members.fetch();
            console.log(`✅ Загружено ${members.size} участников`);

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

              // Сохраняем связь Discord ID с Telegram chat ID
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
          // Получаем username из Discord
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

          // Уведомляем админа
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

    // Обработчик текстовых сообщений (для кнопки "Кто в канале")
    telegramBot.on("message", async (msg) => {
      // Пропускаем команды (они обрабатываются отдельно)
      if (msg.text && msg.text.startsWith("/")) {
        return;
      }

      const chatId = msg.chat.id;
      const text = msg.text;

      // Обработка кнопки "Кто в канале"
      if (text === "🎤 Кто в канале") {
        console.log(`🎤 Получен запрос "Кто в канале" от chat_id: ${chatId}`);

        try {
          if (!getVoiceActivityHandler) {
            console.error("❌ getVoiceActivityHandler не установлен");
            await telegramBot.sendMessage(
              chatId,
              "❌ Функция временно недоступна",
            );
            return;
          }

          console.log("📡 Запрашиваем информацию о голосовых каналах...");

          // Получаем информацию о голосовых каналах
          const result = getVoiceActivityHandler();

          console.log(
            `📊 Результат: success=${result.success}, activeChannels=${result.activeChannels?.length || 0}`,
          );

          if (result.success) {
            await telegramBot.sendMessage(chatId, result.message, {
              parse_mode: "HTML",
            });
            console.log(
              `✅ Информация о каналах отправлена пользователю ${chatId}`,
            );
          } else {
            await telegramBot.sendMessage(
              chatId,
              result.message || "❌ Не удалось получить информацию о каналах",
            );
            console.log(
              `⚠️ Не удалось получить информацию о каналах: ${result.message}`,
            );
          }
        } catch (error) {
          console.error(
            "❌ Ошибка при обработке запроса 'Кто в канале':",
            error,
          );
          console.error("Stack trace:", error.stack);
          await telegramBot.sendMessage(
            chatId,
            "❌ Произошла ошибка при получении информации. Попробуйте позже.",
          );
        }
      }

      // Обработка кнопки "Кто онлайн"
      if (text === "👥 Кто онлайн") {
        console.log(`👥 Получен запрос "Кто онлайн" от chat_id: ${chatId}`);

        try {
          if (!getOnlineUsersHandler) {
            console.error("❌ getOnlineUsersHandler не установлен");
            await telegramBot.sendMessage(
              chatId,
              "❌ Функция временно недоступна"
            );
            return;
          }

          console.log("📡 Запрашиваем список онлайн пользователей...");

          // Получаем информацию об онлайн пользователях
          const result = getOnlineUsersHandler();

          console.log(
            `📊 Результат: success=${result.success}, онлайн: ${result.onlineCount || 0}/${result.totalCount || 0}`,
          );

          if (result.success) {
            await telegramBot.sendMessage(chatId, result.message, {
              parse_mode: "HTML",
            });
            console.log(
              `✅ Список онлайн пользователей отправлен пользователю ${chatId}`,
            );
          } else {
            await telegramBot.sendMessage(
              chatId,
              result.message || "❌ Не удалось получить список пользователей",
            );
            console.log(
              `⚠️ Не удалось получить список пользователей: ${result.message}`,
            );
          }
        } catch (error) {
          console.error(
            "❌ Ошибка при обработке запроса 'Кто онлайн':",
            error,
          );
          console.error("Stack trace:", error.stack);
          await telegramBot.sendMessage(
            chatId,
            "❌ Произошла ошибка при получении информации. Попробуйте позже.",
          );
        }
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
