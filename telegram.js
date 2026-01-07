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
export async function sendAchievementNotification(username, achievementName, achievementDescription, points) {
  const message = 
    `🏆 <b>Новое достижение!</b>\n` +
    `👤 Пользователь: ${username}\n` +
    `🎯 Достижение: ${achievementName}\n` +
    `📝 Описание: ${achievementDescription}\n` +
    `⭐ Очки: +${points}\n` +
    `📅 Время: ${new Date().toLocaleString('ru-RU')}`;
  
  await sendTelegramReport(message);
}

/**
 * Отправка уведомления о специальном достижении
 */
export async function sendSpecialAchievementNotification(username, emoji, name, description, color, specialDate) {
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
      message += `⏰ Планируется: ${scheduledTime.toLocaleString('ru-RU')}\n`;
    } else {
      message += `✅ Доступно с: ${scheduledTime.toLocaleString('ru-RU')}\n`;
    }
  }

  message += `📅 Создано: ${new Date().toLocaleString('ru-RU')}`;

  await sendTelegramReport(message);
}

/**
 * Отправка уведомления об изменении настроек
 */
export async function sendSettingsChangeNotification(username, userId, settings) {
  const message = 
    `🔔 <b>Пользователь изменил настройки</b>\n` +
    `👤 Пользователь: ${username}\n` +
    `🆔 ID: <code>${userId}</code>\n` +
    `${settings}\n` +
    `📅 Время: ${new Date().toLocaleString('ru-RU')}`;
  
  await sendTelegramReport(message);
}

/**
 * Отправка уведомления об удалении достижения
 */
export async function sendAchievementDeleteNotification(userName, achievementName, points) {
  const pointsText = points > 0 ? `\n⭐ Очков удалено: -${points}` : "";
  const message = 
    `🗑️ <b>Достижение удалено!</b>\n` +
    `👤 Пользователь: ${userName}\n` +
    `🎯 Достижение: ${achievementName}\n` +
    `📅 Время: ${new Date().toLocaleString('ru-RU')}${pointsText}\n` +
    `✅ Пользователь может получить его заново`;
  
  await sendTelegramReport(message);
}

/**
 * Отправка уведомления об удалении пользователя
 */
export async function sendUserDeleteNotification(userId, userName) {
  const message = 
    "🗑️ <b>ПОЛЬЗОВАТЕЛЬ УДАЛЕН ИЗ БД</b>\n\n" +
    "ID: <code>" + userId + "</code>\n" +
    "Имя: " + userName + "\n" +
    "Время: " + new Date().toLocaleString("ru-RU");
  
  await sendTelegramReport(message);
}

/**
 * Отправка уведомления о попытке несанкционированного доступа
 */
export async function sendUnauthorizedAccessNotification(attemptedId, timestamp) {
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
export async function sendBotStatusNotification(status, details = '') {
  const emoji = status === 'started' ? '🚀' : '🛑';
  const statusText = status === 'started' ? 'запущен' : 'остановлен';
  
  const message = 
    `${emoji} <b>AFK Bot ${statusText}</b>\n` +
    (details ? `${details}\n` : '') +
    `📅 Время: ${new Date().toLocaleString('ru-RU')}`;
  
  await sendTelegramReport(message);
}
