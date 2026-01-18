// Конфигурация (будет загружена с сервера)
window.CONFIG = {
  ADMIN_USER_ID: "",
  ADMIN_LOGIN: "",
  SERVER_IP: "localhost",
  PORT: 3000,
};

window.currentUserId = null;
window.currentUsername = null;
let showingUsername = true; // По умолчанию показываем имя

// Проверяем флаг предупреждения при загрузке страницы
if (localStorage.getItem("notOnServerWarning") === "true") {
  // Очищаем данные пользователя
  localStorage.removeItem("afkBotUserId");
  localStorage.removeItem("afkBotUserAvatar");
  localStorage.removeItem("notOnServerWarning");
}

// Функция для безопасной установки имени пользователя
function setUserDisplay(username, userId) {
  window.currentUsername = username;
  window.currentUserId = userId;

  const userIdElement = document.getElementById("currentUserId");
  const labelElement = document.getElementById("userDisplayLabel");

  if (userIdElement) {
    userIdElement.textContent = username;
  } else {
    console.error("❌ Элемент currentUserId не найден!");
  }

  if (labelElement) {
    labelElement.textContent = "👤 Имя на сервере";
  }

  showingUsername = true;
}

// Функция переключения между именем и ID
function toggleUserInfo() {
  const label = document.getElementById("userDisplayLabel");
  const value = document.getElementById("currentUserId");
  const flipContainer = document.getElementById("userInfoFlipContainer");

  if (!window.currentUserId || !window.currentUsername) return;

  // Добавляем класс для анимации
  flipContainer.classList.add("flipping");

  // Меняем содержимое в середине анимации
  setTimeout(() => {
    showingUsername = !showingUsername;

    if (showingUsername) {
      label.textContent = "👤 Имя на сервере";
      value.textContent = window.currentUsername;
    } else {
      label.textContent = "👤 ID пользователя";
      value.textContent = window.currentUserId;
    }
  }, 150); // Половина времени анимации

  // Убираем класс после завершения анимации
  setTimeout(() => {
    flipContainer.classList.remove("flipping");
  }, 300);
}

// Функция копирования в буфер обмена
async function copyToClipboard(event) {
  event.stopPropagation(); // Останавливаем всплытие события, чтобы не сработал toggleUserInfo

  const element = document.getElementById("currentUserId");
  const text = element.textContent;

  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);

    // Показываем уведомление
    const originalText = element.textContent;
    element.textContent = "✓ Скопировано!";
    element.style.background = "rgba(40, 167, 69, 0.5)";

    setTimeout(() => {
      element.textContent = originalText;
      element.style.background = "";
    }, 1000);
  } catch (err) {
    console.error("❌ Ошибка копирования:", err);

    // Fallback для старых браузеров
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand("copy");
      element.textContent = "✓ Скопировано!";
      element.style.background = "rgba(40, 167, 69, 0.5)";

      setTimeout(() => {
        element.textContent = text;
        element.style.background = "";
      }, 1000);
    } catch (err2) {
      console.error("❌ Fallback копирование не удалось:", err2);
    }

    document.body.removeChild(textArea);
  }
}

// Загружаем конфигурацию при старте
async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    window.CONFIG = await response.json();

    // Обновляем ссылку на Telegram бота
    const telegramBotLink = document.getElementById("telegramBotLink");
    if (telegramBotLink && window.CONFIG.TELEGRAM_BOT_USERNAME) {
      telegramBotLink.href = `https://t.me/${window.CONFIG.TELEGRAM_BOT_USERNAME}`;
      telegramBotLink.textContent = `@${window.CONFIG.TELEGRAM_BOT_USERNAME}`;
    }

    return window.CONFIG;
  } catch (err) {
    console.error("❌ Ошибка загрузки конфигурации:", err);
    return window.CONFIG;
  }
}

// Функции для работы с авторизацией
function loginWithDiscord() {
  window.location.href = "/auth/discord";
}

async function logout() {
  if (confirm("Вы уверены, что хотите выйти?")) {
    // Скрываем аватарку
    hideUserAvatar();

    // Очищаем localStorage перед редиректом
    localStorage.removeItem("afkBotUserId");
    localStorage.removeItem("afkBotUserAvatar");
    console.log("🗑️ localStorage очищен при выходе");
    window.location.href = "/logout";
  }
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С localStorage =====
function loadSavedUserId() {
  const savedUserId = localStorage.getItem("afkBotUserId");
  if (savedUserId) {
    return savedUserId;
  }
  return null;
}

function clearSavedUserId() {
  localStorage.removeItem("afkBotUserId");
  document.getElementById("userIdInput").value = "";
  location.reload();
}

async function checkAuthStatus() {
  try {
    const response = await fetch("/api/session");
    const data = await response.json();
    if (data.userId) {
      window.currentUserId = data.userId;
      localStorage.setItem("afkBotUserId", data.userId);
      setTimeout(() => loadUserDataAuto(data.userId), 100);
      return true;
    } else {
      document.getElementById("userInfoDisplay").style.display = "none";
      document.getElementById("logoutBtn").style.display = "none";
      document.getElementById("userIdInput").style.display = "block";
      return false;
    }
  } catch (error) {
    console.log("Ошибка при проверке авторизации:", error);
    return false;
  }
}

async function loadUserDataAuto(userId) {
  window.currentUserId = userId;
  localStorage.setItem("afkBotUserId", userId);
  document.getElementById("loading").style.display = "block";
  document.getElementById("userContent").style.display = "none";
  document.getElementById("userIdDisplay").style.display = "none";
  document.getElementById("userIdInput").value = userId;

  try {
    const response = await fetch(`/api/stats/${userId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Проверяем если пользователь не на сервере
    if (data.notOnServer) {
      showNotOnServerWarning();
      return;
    }

    const username = data.stats.username || "Пользователь";
    const avatarUrl = data.stats.avatar_url || null;

    setUserDisplay(username, userId);
    displayUserAvatar(avatarUrl);

    // Сохраняем аватарку в localStorage
    if (avatarUrl) {
      localStorage.setItem("afkBotUserAvatar", avatarUrl);
    }

    try {
      await fetch(`/api/visit/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      data.stats.web_visits = (data.stats.web_visits || 0) + 1;
    } catch (error) {
      // Игнорируем ошибки отправки статистики посещений
    }

    displayUserStats(data.stats);
    displayUserAchievements(data.achievements);
    displayUserSettings(data.settings);
    document.getElementById("loading").style.display = "none";
    document.getElementById("userContent").style.display = "block";
    document.getElementById("userIdDisplay").style.display = "block";

    // Скрываем поле ввода ID и кнопку загрузки когда пользователь залогинен
    document.getElementById("manualInputSection").style.display = "none";

    document.getElementById("clearBtn").style.display = "block";

    if (window.currentUserId === window.CONFIG.ADMIN_USER_ID) {
      document.getElementById("adminPanel").style.display = "block";
      document.querySelectorAll(".admin-option").forEach((option) => {
        option.style.display = "block";
      });
    }
  } catch (error) {
    console.error("❌ Ошибка загрузки данных:", error);
    document.getElementById("loading").style.display = "none";
    document.getElementById("loading").textContent =
      "❌ Ошибка загрузки данных. Проверьте ID.";
  }
}

function deleteUserFromDB(userId, username) {
  event.stopPropagation();
  const confirmed = confirm(
    '⚠️ Вы уверены что хотите полностью удалить пользователя "' +
      username +
      '" из базы данных?' +
      String.fromCharCode(10) +
      String.fromCharCode(10) +
      "Это действие необратимо и удалит:" +
      String.fromCharCode(10) +
      "- Все статистики" +
      String.fromCharCode(10) +
      "- Все достижения" +
      String.fromCharCode(10) +
      "- Все сессии" +
      String.fromCharCode(10) +
      "- Все настройки",
  );

  if (!confirmed) {
    return;
  }

  fetch("/api/admin/delete-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: userId }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.success) {
        alert('✅ Пользователь "' + username + '" полностью удален из БД!');
        loadLeaderboard();
      } else {
        alert(
          "❌ Ошибка: " + (data.message || "Не удалось удалить пользователя"),
        );
      }
    })
    .catch((error) => {
      console.error("Ошибка при удалении пользователя:", error);
      alert("❌ Ошибка при удалении пользователя");
    });
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-content").forEach((tab) => {
    tab.classList.remove("active");
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.remove("active");
  });

  document.getElementById(tabName).classList.add("active");
  event.target.classList.add("active");

  if (tabName === "leaderboard") {
    loadLeaderboard();
  }
}

async function loadUserData(skipSecurityCheck = false) {
  let userId = document.getElementById("userIdInput").value.trim();
  if (!userId) return;

  if (userId.toLowerCase() === window.CONFIG.ADMIN_LOGIN.toLowerCase()) {
    userId = window.CONFIG.ADMIN_USER_ID;
  } else if (userId === window.CONFIG.ADMIN_USER_ID && !skipSecurityCheck) {
    // Показываем предупреждение для попытки несанкционированного доступа
    showUnauthorizedAccessWarning();

    fetch("/api/unauthorized-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptedId: window.CONFIG.ADMIN_USER_ID,
        timestamp: new Date().toLocaleString("ru-RU"),
      }),
    }).catch((err) => console.error("Ошибка отправки уведомления:", err));

    return;
  }

  window.currentUserId = userId;
  localStorage.setItem("afkBotUserId", userId);
  document.getElementById("loading").style.display = "block";
  document.getElementById("userContent").style.display = "none";
  document.getElementById("userIdDisplay").style.display = "none";

  try {
    const response = await fetch(`/api/stats/${userId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Проверяем если пользователь не на сервере
    if (data.notOnServer) {
      showNotOnServerWarning();
      return;
    }

    try {
      await fetch(`/api/visit/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      data.stats.web_visits = (data.stats.web_visits || 0) + 1;
    } catch (error) {
      // Игнорируем ошибки отправки статистики посещений
    }

    displayUserStats(data.stats);
    displayUserAchievements(data.achievements);
    displayUserSettings(data.settings);

    const username = data.stats.username || "Пользователь";
    const avatarUrl = data.stats.avatar_url || null;

    setUserDisplay(username, userId);
    displayUserAvatar(avatarUrl);
    document.getElementById("userIdDisplay").style.display = "block";

    // Сохраняем аватарку в localStorage
    if (avatarUrl) {
      localStorage.setItem("afkBotUserAvatar", avatarUrl);
    }

    // Проверяем обновление имени через 5 секунд (на случай если бот только обновил имена)
    setTimeout(async () => {
      try {
        const response = await fetch(`/api/stats/${userId}`);
        if (response.ok) {
          const freshData = await response.json();
          const newUsername = freshData.stats.username || "Пользователь";
          const newAvatarUrl = freshData.stats.avatar_url || null;

          if (newUsername !== username) {
            setUserDisplay(newUsername, userId);
          }

          if (newAvatarUrl && newAvatarUrl !== avatarUrl) {
            console.log("🔄 Обновление аватарки");
            localStorage.setItem("afkBotUserAvatar", newAvatarUrl);
            displayUserAvatar(newAvatarUrl);
          }
        }
      } catch (error) {
        console.error("Ошибка при обновлении имени:", error);
      }
    }, 5000);

    // Скрываем поле ввода ID и кнопку загрузки когда пользователь залогинен
    document.getElementById("manualInputSection").style.display = "none";

    document.getElementById("clearBtn").style.display = "block";

    if (userId === window.CONFIG.ADMIN_USER_ID) {
      document.getElementById("adminPanel").style.display = "block";

      document.querySelectorAll(".admin-option").forEach((option) => {
        option.style.display = "block";
      });
    } else {
      document.getElementById("adminPanel").style.display = "none";
    }

    document.getElementById("loading").style.display = "none";
    document.getElementById("userContent").style.display = "block";
  } catch (error) {
    console.error("Ошибка при загрузке данных:", error);
    document.getElementById("loading").innerHTML =
      '<div class="error">Ошибка загрузки данных</div>';
    document.getElementById("userIdDisplay").style.display = "none";
  }
}

// Продолжение в следующем файле из-за ограничения размера

function displayUserStats(stats) {
  const statsGrid = document.getElementById("statsGrid");
  const voiceHours = Math.floor((stats.total_voice_time || 0) / 3600);
  const voiceMinutes = Math.floor(((stats.total_voice_time || 0) % 3600) / 60);
  const afkHours = Math.floor((stats.total_afk_time || 0) / 3600);
  const afkMinutes = Math.floor(((stats.total_afk_time || 0) % 3600) / 60);
  const streamHours = Math.floor((stats.stream_channel_time || 0) / 3600);
  const streamMinutes = Math.floor(
    ((stats.stream_channel_time || 0) % 3600) / 60,
  );

  let longestSessionDate = "";
  if (stats.longest_session_date) {
    const date = new Date(stats.longest_session_date);
    longestSessionDate =
      '<br><span style="font-size:0.4em;">' +
      date.toLocaleDateString("ru-RU") +
      " " +
      date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) +
      "</span>";
  }

  statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${stats.total_sessions || 0}</div>
            <div class="stat-label">Всего сессий</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${voiceHours}ч ${voiceMinutes}м</div>
            <div class="stat-label">Время в голосовых</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.total_afk_moves || 0}</div>
            <div class="stat-label">Перемещений в AFK</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${afkHours}ч ${afkMinutes}м</div>
            <div class="stat-label">Время в AFK</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.rank_points || 0}</div>
            <div class="stat-label">Очки рейтинга</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" style="line-height: 1em;">${Math.floor((stats.longest_session || 0) / 3600)}ч ${Math.floor(((stats.longest_session || 0) % 3600) / 60)}м${longestSessionDate}</div>
            <div class="stat-label">Самая длинная сессия</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.total_mute_toggles || 0}</div>
            <div class="stat-label">Переключений микрофона</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.settings_changes || 0}</div>
            <div class="stat-label">Изменений настроек</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.messages_sent || 0}</div>
            <div class="stat-label">Отправлено сообщений</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.mentions_responded || 0}</div>
            <div class="stat-label">Ответов на упоминания</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${streamHours}ч ${streamMinutes}м</div>
            <div class="stat-label">Время в канале Че смотрим?</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.web_visits || 0}</div>
            <div class="stat-label">Посещений веб-панели</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.total_streams || 0}</div>
            <div class="stat-label">Включений трансляций</div>
        </div>
    `;
}

function displayUserSettings(settings) {
  document.getElementById("dmNotifications").value =
    settings.dmNotifications.toString();
  document.getElementById("afkTimeout").value = settings.afkTimeout.toString();
  document.getElementById("achievementNotifications").value =
    settings.achievementNotifications.toString();

  console.log(
    "📥 Загружены настройки channelNotifications:",
    settings.channelNotifications,
    typeof settings.channelNotifications,
  );

  document.getElementById("channelNotifications").value = (
    settings.channelNotifications || false
  ).toString();

  // Проверяем активирована ли секретная тема на сервере
  const secretThemeActivated = settings.secretThemeActivated || false;
  const themeSelect = document.getElementById("themeSelect");

  // Синхронизируем localStorage с сервером
  if (secretThemeActivated) {
    localStorage.setItem("secretThemeActivated", "true");

    // Убираем подсказку и курсор у логотипа
    const logoActivate = document.querySelector(".header-logo-img-activate");
    if (logoActivate) {
      logoActivate.removeAttribute("title");
      logoActivate.style.cursor = "default";
    }
  }

  if (
    secretThemeActivated &&
    themeSelect &&
    !themeSelect.querySelector('option[value="die-my-darling"]')
  ) {
    const option = document.createElement("option");
    option.value = "die-my-darling";
    option.textContent = "🥀 Die my Darling";
    themeSelect.appendChild(option);
  }

  // Загружаем тему
  const theme = settings.theme || "standard";
  document.getElementById("themeSelect").value = theme;
  applyTheme(theme);

  // Проверяем статус связи с Telegram
  checkTelegramLinkStatus();

  // Показываем уведомление о секретной теме (только если её нет)
  showSecretThemeNotification(secretThemeActivated);
}

// Показать уведомление о секретной теме
function showSecretThemeNotification(hasSecretTheme) {
  // Считаем количество доступных секретных тем
  const themeSelect = document.getElementById("themeSelect");
  const allThemes = themeSelect ? themeSelect.options.length : 4; // 4 стандартные темы
  const secretThemesCount = Math.max(0, allThemes - 4); // Вычитаем 4 стандартные темы

  // Получаем сохраненное количество секретных тем
  const savedSecretThemesCount = parseInt(
    sessionStorage.getItem("secretThemesCount") || "0",
  );

  // Проверяем, добавилась ли новая секретная тема
  const hasNewSecretTheme = secretThemesCount > savedSecretThemesCount;

  // Сохраняем текущее количество секретных тем
  sessionStorage.setItem("secretThemesCount", secretThemesCount.toString());

  // Показываем уведомление если:
  // 1. У пользователя нет ни одной секретной темы ИЛИ
  // 2. Добавилась новая секретная тема
  const shouldShow =
    (!hasSecretTheme && secretThemesCount < 1) || hasNewSecretTheme;

  // Проверяем, показывали ли уже уведомление для текущего количества тем
  const notificationKey = `secretThemeNotification_${secretThemesCount}`;
  if (!shouldShow || sessionStorage.getItem(notificationKey)) {
    return;
  }

  // Формируем текст уведомления
  let notificationText =
    "🔍 <b>Секретная тема доступна!</b> Найди её, малютка 😏";
  if (hasNewSecretTheme && savedSecretThemesCount > 0) {
    notificationText = "🆕 <b>Новая секретная тема!</b> Найди её, малютка 😏";
  }

  // Создаем элемент уведомления
  const notification = document.createElement("div");
  notification.id = "secretThemeNotification";
  notification.innerHTML = notificationText;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(-100px);
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 15px 30px;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    z-index: 10001;
    font-weight: 500;
    font-size: 14px;
    text-align: center;
    opacity: 0;
    transition: all 0.5s ease;
  `;

  document.body.appendChild(notification);

  // Анимация появления
  setTimeout(() => {
    notification.style.transform = "translateX(-50%) translateY(0)";
    notification.style.opacity = "1";
  }, 100);

  // Анимация исчезновения через 4.5 секунды
  setTimeout(() => {
    notification.style.transform = "translateX(-50%) translateY(-100px)";
    notification.style.opacity = "0";

    // Удаляем элемент через 0.5 секунды (после завершения анимации)
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 4500);

  // Помечаем, что уведомление показано для текущего количества тем
  sessionStorage.setItem(notificationKey, "true");
}

// Проверка статуса связи с Telegram
async function checkTelegramLinkStatus() {
  if (!window.currentUserId) return;

  try {
    const response = await fetch(
      `/api/telegram-link/status/${window.currentUserId}`,
    );
    const data = await response.json();

    const statusDiv = document.getElementById("telegramLinkStatus");
    const btn = document.getElementById("telegramLinkBtn");
    const unlinkBtn = document.getElementById("telegramUnlinkBtn");
    const description = document.getElementById("telegramLinkDescription");
    const channelNotificationsSelect = document.getElementById(
      "channelNotifications",
    );
    const channelNotificationsHint = document.getElementById(
      "channelNotificationsHint",
    );

    if (data.linked) {
      statusDiv.style.display = "block";
      btn.textContent = "✅ Аккаунты связаны";
      btn.style.background = "#4CAF50";
      btn.style.cursor = "default";
      btn.onclick = null;

      // Показываем кнопку отвязки
      if (unlinkBtn) {
        unlinkBtn.style.display = "block";
      }

      description.textContent = "Ваш Discord аккаунт связан с Telegram";

      // Разблокируем настройку "Кто в канале"
      if (channelNotificationsSelect) {
        channelNotificationsSelect.disabled = false;
        channelNotificationsSelect.style.opacity = "1";
        channelNotificationsSelect.style.cursor = "pointer";
      }

      // Меняем подсказку на успешную
      if (channelNotificationsHint) {
        channelNotificationsHint.textContent =
          "✅ Уведомления будут приходить в Telegram";
        channelNotificationsHint.style.color = "#4CAF50";
      }
    } else {
      statusDiv.style.display = "none";
      btn.textContent = "🔗 Связать с Telegram";
      btn.style.background =
        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
      btn.style.cursor = "pointer";
      btn.onclick = showLinkCodeModal;

      // Скрываем кнопку отвязки
      if (unlinkBtn) {
        unlinkBtn.style.display = "none";
      }

      description.textContent =
        "Свяжите Discord аккаунт с Telegram для получения уведомлений";

      // Блокируем настройку "Кто в канале"
      if (channelNotificationsSelect) {
        channelNotificationsSelect.disabled = true;
        channelNotificationsSelect.value = "false";
        channelNotificationsSelect.style.opacity = "0.5";
        channelNotificationsSelect.style.cursor = "not-allowed";
      }

      // Показываем предупреждение
      if (channelNotificationsHint) {
        channelNotificationsHint.textContent =
          "⚠️ Сначала свяжите аккаунт с Telegram";
        channelNotificationsHint.style.color = "#ff9800";
      }
    }
  } catch (error) {
    console.error("Ошибка проверки статуса Telegram:", error);
  }
}

// Показать модальное окно с кодом для связывания
async function showLinkCodeModal() {
  try {
    const response = await fetch(
      `/api/telegram-link/generate/${window.currentUserId}`,
      {
        method: "POST",
      },
    );
    const data = await response.json();

    if (data.success) {
      const botUsername = window.CONFIG?.TELEGRAM_BOT_USERNAME || "your_bot";
      const expiresMin = Math.floor(data.expiresIn / 60);

      showCustomAlert(
        "🔗 Связывание с Telegram",
        `<div style="text-align: center;">
          <p style="margin-bottom: 15px;">Ваш код для связывания:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #667eea; background: rgba(102, 126, 234, 0.1); padding: 15px; border-radius: 10px; margin: 15px 0; user-select: all;">${data.code}</div>
          <p style="margin-bottom: 15px; font-size: 14px; opacity: 0.8;">Код действителен ${expiresMin} минут</p>
          <p style="margin-bottom: 10px;">Отправьте команду боту @${botUsername}:</p>
          <div id="linkCommand" style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; font-family: monospace; user-select: all; margin: 10px 0; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.background='rgba(102, 126, 234, 0.3)'" onmouseout="this.style.background='rgba(0,0,0,0.3)'" onclick="
            navigator.clipboard.writeText('/link ${data.code}').then(() => {
              this.style.background='rgba(76, 175, 80, 0.3)';
              this.innerHTML = '✅ Скопировано!';
              setTimeout(() => {
                this.innerHTML = '/link ${data.code}';
                this.style.background='rgba(0,0,0,0.3)';
              }, 2000);
            });
          ">/link ${data.code}</div>
          <p style="font-size: 12px; opacity: 0.6; margin-top: 5px;">👆 Нажмите, чтобы скопировать</p>
        </div>`,
        [
          {
            text: "📱 Открыть бота",
            color: "#667eea",
            action: () => {
              window.open(`https://t.me/${botUsername}`, "_blank");
              // Начинаем проверку статуса каждые 3 секунды
              const checkInterval = setInterval(async () => {
                const status = await fetch(
                  `/api/telegram-link/status/${window.currentUserId}`,
                );
                const statusData = await status.json();
                if (statusData.linked) {
                  clearInterval(checkInterval);
                  checkTelegramLinkStatus();
                  showCustomAlert(
                    "✅ Успешно!",
                    "Ваши аккаунты успешно связаны! Теперь вы можете получать уведомления в Telegram.",
                    [{ text: "Отлично", color: "#4CAF50", action: null }],
                  );
                }
              }, 3000);

              // Останавливаем проверку через 5 минут
              setTimeout(() => clearInterval(checkInterval), 300000);
            },
          },
          {
            text: "Закрыть",
            color: "#666",
            action: null,
          },
        ],
      );
    } else {
      showCustomAlert(
        "❌ Ошибка",
        "Не удалось сгенерировать код. Попробуйте позже.",
        [{ text: "OK", color: "#666", action: null }],
      );
    }
  } catch (error) {
    console.error("Ошибка генерации кода:", error);
    showCustomAlert(
      "❌ Ошибка",
      "Произошла ошибка при генерации кода. Попробуйте позже.",
      [{ text: "OK", color: "#666", action: null }],
    );
  }
}

// Функция для применения темы
function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
}
// Функция для предпросмотра темы (без сохранения)
function previewTheme(theme) {
  applyTheme(theme);
}

async function saveSettings() {
  if (!window.currentUserId) return;

  const dmNotifications =
    document.getElementById("dmNotifications").value === "true";
  const afkTimeout = parseInt(document.getElementById("afkTimeout").value);
  const achievementNotifications =
    document.getElementById("achievementNotifications").value === "true";
  const theme = document.getElementById("themeSelect").value;
  const channelNotifications =
    document.getElementById("channelNotifications").value === "true";

  console.log("📤 Отправляем настройки:", {
    dmNotifications,
    afkTimeout,
    achievementNotifications,
    theme,
    channelNotifications,
  });

  try {
    const response = await fetch(`/api/settings/${window.currentUserId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dmNotifications,
        afkTimeout,
        achievementNotifications,
        theme,
        channelNotifications,
      }),
    });

    if (!response.ok) {
      alert("Ошибка сохранения настроек");
      return;
    }

    const data = await response.json();

    // Если включены уведомления канала, проверяем нажал ли пользователь /start
    if (channelNotifications) {
      const hasStarted = data.settings?.channelNotifications === true;
      if (hasStarted) {
        // Проверяем, связан ли аккаунт с Telegram
        // Если нет - показываем подсказку
        const botUsername = window.CONFIG?.TELEGRAM_BOT_USERNAME || "your_bot";
        setTimeout(() => {
          showCustomAlert(
            "ℹ️ Важно!",
            `Чтобы получать уведомления "Кто в канале", убедитесь что вы:\n\n` +
              `1️⃣ Нажали /start в боте @${botUsername}\n` +
              `2️⃣ Ваш Telegram username совпадает с Discord username\n\n` +
              `Если имена разные, уведомления могут не приходить.`,
            [
              {
                text: "📱 Открыть бота",
                color: "#667eea",
                action: () => {
                  window.open(`https://t.me/${botUsername}`, "_blank");
                },
              },
              {
                text: "Понятно",
                color: "#666",
                action: null,
              },
            ],
          );
        }, 500);
      }
    }

    // Показываем уведомление об успешном сохранении
    const saveBtn = document.querySelector(".save-settings-btn");
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "✅ Сохранено!";
    saveBtn.style.background = "#4CAF50";

    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.style.background = "";
    }, 2000);
  } catch (error) {
    alert("Ошибка сохранения настроек");
  }
}

// Инициализация при загрузке страницы
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🟢 DOMContentLoaded сработал");

  // Сначала загружаем конфигурацию
  await loadConfig();

  document.getElementById("userInfoDisplay").style.display = "none";
  document.getElementById("logoutBtn").style.display = "none";
  document.getElementById("userIdInput").style.display = "block";

  // Добавляем обработчик клика на логотип для активации секретной темы
  const logoActivate = document.querySelector(".header-logo-img-activate");
  if (logoActivate) {
    logoActivate.addEventListener("click", activateSecretTheme);
  }

  const urlParams = new URLSearchParams(window.location.search);
  const autoLogin = urlParams.get("autoLogin");
  const userIdParam = urlParams.get("userId");

  if (autoLogin && userIdParam) {
    loadUserDataAuto(userIdParam);
  } else {
    const authOk = await checkAuthStatus();

    if (!authOk) {
      // Показываем поле ввода ID если пользователь не залогинен
      document.getElementById("manualInputSection").style.display = "flex";

      const savedUserId = loadSavedUserId();
      if (savedUserId) {
        setTimeout(() => loadUserDataAuto(savedUserId), 500);
      }
    }
  }

  loadLeaderboard();
});

// Функция активации секретной темы
async function activateSecretTheme() {
  if (!window.currentUserId) {
    return;
  }

  try {
    // Отправляем запрос на сервер для активации темы
    const response = await fetch(
      `/api/activate-secret-theme/${window.currentUserId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error("Ошибка активации темы");
    }

    const data = await response.json();

    if (data.alreadyActivated) {
      console.log("🔒 Секретная тема уже активирована");
      return;
    }

    // Сохраняем флаг в localStorage
    localStorage.setItem("secretThemeActivated", "true");

    // Убираем подсказку и курсор у логотипа
    const logoActivate = document.querySelector(".header-logo-img-activate");
    if (logoActivate) {
      logoActivate.removeAttribute("title");
      logoActivate.style.cursor = "default";
    }

    // Применяем тему
    applyTheme("die-my-darling");

    // Добавляем опцию в селект если её еще нет
    const themeSelect = document.getElementById("themeSelect");
    if (
      themeSelect &&
      !themeSelect.querySelector('option[value="die-my-darling"]')
    ) {
      const option = document.createElement("option");
      option.value = "die-my-darling";
      option.textContent = "🥀 Die my Darling";
      themeSelect.appendChild(option);
    }

    // Устанавливаем тему в селекте
    if (themeSelect) {
      themeSelect.value = "die-my-darling";
    }
  } catch (error) {
    console.error("❌ Ошибка при активации секретной темы:", error);
  }
}

// Функция для создания бэкапа базы данных
async function backupDatabase() {
  try {
    const response = await fetch("/api/admin/backup-database", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      alert("✅ Бэкап создан успешно!\n📂 Файл: " + data.filename);
    } else {
      const error = await response.json();
      alert("Ошибка при создании бэкапа: " + error.error);
    }
  } catch (error) {
    console.error("Ошибка при создании бэкапа:", error);
    alert("Ошибка при создании бэкапа базы данных");
  }
}

// Функции для управления пользователями
async function openUsersModal() {
  document.getElementById("usersModal").style.display = "block";
  document.body.classList.add("modal-open");
  await loadAllUsers();
}

function closeUsersModal() {
  document.getElementById("usersModal").style.display = "none";
  document.body.classList.remove("modal-open");
}

function closeUsersModalOnOutsideClick(event) {
  if (event.target.id === "usersModal") {
    closeUsersModal();
  }
}

async function loadAllUsers() {
  try {
    const response = await fetch("/api/admin/users");
    if (!response.ok) {
      throw new Error("Ошибка загрузки пользователей");
    }

    const users = await response.json();
    displayUsers(users);
  } catch (error) {
    console.error("Ошибка при загрузке пользователей:", error);
    document.getElementById("usersList").innerHTML =
      '<p style="color: #ff4444; text-align: center;">Ошибка загрузки пользователей</p>';
  }
}

function displayUsers(users) {
  const usersList = document.getElementById("usersList");

  if (users.length === 0) {
    usersList.innerHTML =
      '<p style="color: #999; text-align: center;">Нет пользователей</p>';
    return;
  }

  let html = "";
  users.forEach((user) => {
    const isAdmin = user.user_id === window.CONFIG.ADMIN_USER_ID;
    const deleteBtn = isAdmin
      ? '<span style="color: #999; font-size: 12px;">Админ</span>'
      : `<button onclick="deleteUser('${user.user_id}', '${user.username}')" style="padding: 6px 12px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>`;

    html += `
            <div style="background: #2a2a2a; padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #333;">
                <div>
                    <div style="color: white; font-weight: bold; margin-bottom: 5px;">👤 ${user.username}</div>
                    <div style="color: #999; font-size: 12px;">ID: ${user.user_id}</div>
                    <div style="color: #667eea; font-size: 12px; margin-top: 5px;">
                        📊 Сессий: ${user.total_sessions || 0} | 
                        ⏱️ Время: ${Math.floor((user.total_voice_time || 0) / 3600)}ч | 
                        ⭐ Очки: ${user.rank_points || 0}
                    </div>
                </div>
                <div>
                    ${deleteBtn}
                </div>
            </div>
        `;
  });

  usersList.innerHTML = html;
}

async function deleteUser(userId, username) {
  const confirmed = confirm(
    '⚠️ Вы уверены что хотите полностью удалить пользователя "' +
      username +
      '" из базы данных?' +
      String.fromCharCode(10) +
      String.fromCharCode(10) +
      "Это действие необратимо и удалит:" +
      String.fromCharCode(10) +
      "- Все статистики" +
      String.fromCharCode(10) +
      "- Все достижения" +
      String.fromCharCode(10) +
      "- Все сессии" +
      String.fromCharCode(10) +
      "- Все настройки",
  );

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    if (response.ok) {
      console.log("✅ Пользователь удален");
      await loadAllUsers(); // Перезагружаем список
    } else {
      const error = await response.json();
      alert("Ошибка при удалении пользователя: " + error.error);
    }
  } catch (error) {
    console.error("Ошибка при удалении пользователя:", error);
    alert("Ошибка при удалении пользователя");
  }
}

// Функция для обновления имен пользователей
async function updateUserNames() {
  const btn = document.getElementById("updateNamesBtn");
  const originalText = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML =
      '<span class="admin-btn-icon">⏳</span><span class="admin-btn-text">Обновление...</span>';

    const response = await fetch("/api/admin/update-names", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      alert(
        `✅ Обновлено имен: ${data.updated}\nВсего пользователей: ${data.total}`,
      );

      // Обновляем текущую страницу если нужно
      if (window.currentUserId) {
        setTimeout(async () => {
          const freshResponse = await fetch(
            `/api/stats/${window.currentUserId}`,
          );
          if (freshResponse.ok) {
            const freshData = await freshResponse.json();
            const newUsername = freshData.stats.username || "Пользователь";
            setUserDisplay(newUsername, window.currentUserId);
          }
        }, 1000);
      }
    } else {
      const error = await response.json();
      alert("Ошибка при обновлении имен: " + error.error);
    }
  } catch (error) {
    console.error("Ошибка при обновлении имен:", error);
    alert("Ошибка при обновлении имен");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// Функция для загрузки аватарок на сервер
async function downloadAvatars() {
  const btn = document.getElementById("downloadAvatarsBtn");
  const originalText = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML =
      '<span class="admin-btn-icon">⏳</span><span class="admin-btn-text">Загрузка...</span>';

    const response = await fetch("/api/admin/download-avatars", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      alert(
        `✅ Загружено аватарок: ${data.downloaded}\nОшибок: ${data.errors}\nВсего пользователей: ${data.total}`,
      );

      // Перезагружаем рейтинг чтобы обновить аватарки
      if (typeof loadLeaderboard === "function") {
        await loadLeaderboard(true); // Передаем true для принудительного обновления кеша
      }

      // Обновляем аватарку текущего пользователя если он залогинен
      if (window.currentUserId) {
        const userResponse = await fetch(`/api/stats/${window.currentUserId}`);
        if (userResponse.ok) {
          const userData = await userResponse.json();
          if (userData.stats.avatar_url) {
            // Обновляем аватарку в шапке
            const avatarImg = document.getElementById("userAvatar");
            if (avatarImg) {
              avatarImg.src = userData.stats.avatar_url + "?t=" + Date.now(); // Добавляем timestamp чтобы обновить кеш
            }

            // Обновляем в localStorage
            localStorage.setItem("afkBotUserAvatar", userData.stats.avatar_url);
          }
        }
      }
    } else {
      const error = await response.json();
      alert("Ошибка при загрузке аватарок: " + error.error);
    }
  } catch (error) {
    console.error("Ошибка при загрузке аватарок:", error);
    alert("Ошибка при загрузке аватарок");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// Функция для отображения аватарки пользователя
function displayUserAvatar(avatarUrl) {
  const avatarContainer = document.getElementById("userAvatarContainer");
  const avatarImg = document.getElementById("userAvatar");

  if (avatarUrl) {
    avatarImg.src = avatarUrl;
    avatarContainer.style.display = "block";
  } else {
    avatarImg.src = "/avatars/nopic.png";
    avatarContainer.style.display = "block";
  }
}

function hideUserAvatar() {
  const avatarContainer = document.getElementById("userAvatarContainer");
  avatarContainer.style.display = "none";
}

// Функция показа предупреждения для пользователей не с сервера
function showNotOnServerWarning() {
  // Устанавливаем флаг что показано предупреждение
  localStorage.setItem("notOnServerWarning", "true");

  // Меняем фон на кроваво-красный
  document.body.style.background =
    "linear-gradient(135deg, #8B0000 0%, #DC143C 100%)";
  document.querySelector(".container").style.background =
    "linear-gradient(135deg, #8B0000 0%, #DC143C 100%)";

  // Окрашиваем header
  const header = document.querySelector(".header");
  header.style.background = "linear-gradient(135deg, #8B0000 0%, #DC143C 100%)";
  header.style.position = "fixed";
  header.style.top = "0";
  header.style.left = "0";
  header.style.right = "0";
  header.style.overflow = "visible";
  header.style.minHeight = "80px";
  header.style.zIndex = "1";

  // Функция для разбивки текста на символы и обработки изображений
  function splitTextToChars(element) {
    const childNodes = Array.from(element.childNodes);
    element.innerHTML = "";
    element.style.position = "relative";

    childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        // Обрабатываем текстовые узлы
        const text = node.textContent;
        Array.from(text).forEach((char) => {
          const span = document.createElement("span");
          span.textContent = char;
          span.style.display = "inline-block";
          span.style.position = "relative";

          // Сохраняем пробелы
          if (char === " ") {
            span.style.width = "0.3em";
          }

          // Случайные параметры анимации
          const duration = 3 + Math.random() * 4;
          const delay = 4 + Math.random() * 2;
          const rotation = (Math.random() - 0.5) * 720;

          span.style.animation = `fallDown ${duration}s ease-in ${delay}s forwards`;
          span.style.setProperty("--rotation", `${rotation}deg`);

          element.appendChild(span);
        });
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.tagName === "IMG"
      ) {
        // Обрабатываем img элементы
        const imgWrapper = document.createElement("span");
        imgWrapper.style.display = "inline-block";
        imgWrapper.style.position = "relative";

        const img = node.cloneNode(true);

        // Если это logo.png, меняем на logo-dark.png за 3 секунды
        if (
          img.src.includes("logo.png") &&
          !img.src.includes("logo-dark.png")
        ) {
          img.style.transition = "opacity 3s ease-in-out";
          img.style.opacity = "1";

          const darkImg = document.createElement("img");
          darkImg.src = img.src.replace("logo.png", "logo-dark.png");
          darkImg.className = img.className;
          darkImg.style.position = "absolute";
          darkImg.style.top = "0";
          darkImg.style.left = "0";
          darkImg.style.width = img.style.width;
          darkImg.style.height = img.style.height;
          darkImg.style.marginRight = img.style.marginRight;
          darkImg.style.marginLeft = img.style.marginLeft;
          darkImg.style.opacity = "0";
          darkImg.style.transition = "opacity 3s ease-in-out";

          imgWrapper.style.position = "relative";

          setTimeout(() => {
            img.style.opacity = "0";
            darkImg.style.opacity = "1";
          }, 100);

          imgWrapper.appendChild(darkImg);
        }

        // Случайные параметры анимации падения
        const duration = 3 + Math.random() * 4;
        const delay = 4 + Math.random() * 2;
        const rotation = (Math.random() - 0.5) * 720;

        imgWrapper.style.animation = `fallDown ${duration}s ease-in ${delay}s forwards`;
        imgWrapper.style.setProperty("--rotation", `${rotation}deg`);

        imgWrapper.appendChild(img);
        element.appendChild(imgWrapper);
      }
    });
  }

  // Разбиваем текст в h1 и p на символы
  const h1 = header.querySelector("h1");
  const p = header.querySelector("p");

  if (h1) splitTextToChars(h1);
  if (p) splitTextToChars(p);

  // Добавляем CSS анимацию если её еще нет
  if (!document.getElementById("fallDownAnimation")) {
    const style = document.createElement("style");
    style.id = "fallDownAnimation";
    style.textContent = `
            @keyframes fallDown {
                0% {
                    transform: translateY(0) rotate(0deg);
                    opacity: 1;
                }
                90% {
                    opacity: 1;
                }
                100% {
                    transform: translateY(100vh) rotate(var(--rotation));
                    opacity: 0;
                }
            }
        `;
    document.head.appendChild(style);
  }

  // Скрываем все содержимое
  document.getElementById("loading").style.display = "none";
  document.getElementById("userContent").style.display = "none";
  document.getElementById("userIdDisplay").style.display = "none";
  document.getElementById("manualInputSection").style.display = "none";

  // Создаем предупреждение
  const warningHtml = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; text-align: center; box-sizing: border-box;">
            <img src="/avatars/warning.png" alt="Warning" style="width: 150px; height: 150px; margin-bottom: 20px; filter: drop-shadow(0 0 20px rgba(255,0,0,0.8)); animation: pulse 2s ease-in-out infinite;">
            <h1 style="color: white; font-size: 2.5rem; margin-bottom: 15px; text-shadow: 0 0 20px rgba(0,0,0,0.5);">Ты кто?</h1>
            <p style="color: white; font-size: 1.3rem; margin-bottom: 30px; text-shadow: 0 0 10px rgba(0,0,0,0.5);">Сначала присоединись к серверу</p>
            <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;">
                <a href="https://discord.gg/KCJrkf9Q" target="_blank" class="warning-btn warning-btn-primary">
                    🚪 Присоединиться
                </a>
                <button onclick="restoreNormalView()" class="warning-btn warning-btn-secondary">
                    🔙 Войти нормально
                </button>
            </div>
        </div>
    `;

  // Добавляем анимацию пульсации для картинки и стили кнопок
  if (!document.getElementById("pulseAnimation")) {
    const style = document.createElement("style");
    style.id = "pulseAnimation";
    style.textContent = `
            @keyframes pulse {
                0%, 100% {
                    transform: scale(1);
                    filter: drop-shadow(0 0 20px rgba(255,0,0,0.8));
                }
                50% {
                    transform: scale(1.1);
                    filter: drop-shadow(0 0 40px rgba(255,0,0,1));
                }
            }
            
            .warning-btn {
                padding: 20px 50px;
                text-decoration: none;
                font-size: 1.3rem;
                font-weight: bold;
                border-radius: 50px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                transition: all 0.3s ease;
                display: inline-block;
                cursor: pointer;
            }
            
            .warning-btn-primary {
                background: white;
                color: #8B0000;
                border: none;
            }
            
            .warning-btn-secondary {
                background: rgba(255,255,255,0.2);
                color: white;
                border: 2px solid white;
            }
            
            .warning-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 15px 40px rgba(0,0,0,0.7);
            }
            
            .warning-btn-secondary:hover {
                background: rgba(255,255,255,0.3);
            }
            
            @media (max-width: 768px) {
                .warning-btn {
                    padding: 15px 30px;
                    font-size: 1rem;
                }
            }
        `;
    document.head.appendChild(style);
  }

  const contentElement = document.querySelector(".content");
  contentElement.innerHTML = warningHtml;
  contentElement.style.overflow = "hidden";
  contentElement.style.height = "100vh";
  document.body.style.overflow = "hidden";
}

// Функция восстановления нормального вида сайта
function restoreNormalView() {
  // Очищаем сохраненный userId и флаг предупреждения
  localStorage.removeItem("afkBotUserId");
  localStorage.removeItem("afkBotUserAvatar");
  localStorage.removeItem("notOnServerWarning");

  // Перезагружаем страницу чтобы вернуть все к исходному состоянию
  window.location.reload();
}

// Функция показа предупреждения для попытки несанкционированного доступа
function showUnauthorizedAccessWarning() {
  // Устанавливаем флаг что показано предупреждение
  localStorage.setItem("notOnServerWarning", "true");

  // Меняем фон на кроваво-красный
  document.body.style.background =
    "linear-gradient(135deg, #8B0000 0%, #DC143C 100%)";
  document.querySelector(".container").style.background =
    "linear-gradient(135deg, #8B0000 0%, #DC143C 100%)";

  // Окрашиваем header
  const header = document.querySelector(".header");
  header.style.background = "linear-gradient(135deg, #8B0000 0%, #DC143C 100%)";
  header.style.position = "fixed";
  header.style.top = "0";
  header.style.left = "0";
  header.style.right = "0";
  header.style.overflow = "visible";
  header.style.minHeight = "80px";
  header.style.zIndex = "1";

  // Функция для разбивки текста на символы и обработки изображений
  function splitTextToChars(element) {
    const childNodes = Array.from(element.childNodes);
    element.innerHTML = "";
    element.style.position = "relative";

    childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        // Обрабатываем текстовые узлы
        const text = node.textContent;
        Array.from(text).forEach((char) => {
          const span = document.createElement("span");
          span.textContent = char;
          span.style.display = "inline-block";
          span.style.position = "relative";

          // Сохраняем пробелы
          if (char === " ") {
            span.style.width = "0.3em";
          }

          // Случайные параметры анимации
          const duration = 3 + Math.random() * 4;
          const delay = 4 + Math.random() * 2;
          const rotation = (Math.random() - 0.5) * 720;

          span.style.animation = `fallDown ${duration}s ease-in ${delay}s forwards`;
          span.style.setProperty("--rotation", `${rotation}deg`);

          element.appendChild(span);
        });
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.tagName === "IMG"
      ) {
        // Обрабатываем img элементы
        const imgWrapper = document.createElement("span");
        imgWrapper.style.display = "inline-block";
        imgWrapper.style.position = "relative";

        const img = node.cloneNode(true);

        // Если это logo.png, меняем на logo-dark.png за 3 секунды
        if (
          img.src.includes("logo.png") &&
          !img.src.includes("logo-dark.png")
        ) {
          img.style.transition = "opacity 3s ease-in-out";
          img.style.opacity = "1";

          const darkImg = document.createElement("img");
          darkImg.src = img.src.replace("logo.png", "logo-dark.png");
          darkImg.className = img.className;
          darkImg.style.position = "absolute";
          darkImg.style.top = "0";
          darkImg.style.left = "0";
          darkImg.style.width = img.style.width;
          darkImg.style.height = img.style.height;
          darkImg.style.marginRight = img.style.marginRight;
          darkImg.style.marginLeft = img.style.marginLeft;
          darkImg.style.opacity = "0";
          darkImg.style.transition = "opacity 3s ease-in-out";

          imgWrapper.style.position = "relative";

          setTimeout(() => {
            img.style.opacity = "0";
            darkImg.style.opacity = "1";
          }, 100);

          imgWrapper.appendChild(darkImg);
        }

        // Случайные параметры анимации падения
        const duration = 3 + Math.random() * 4;
        const delay = 4 + Math.random() * 2;
        const rotation = (Math.random() - 0.5) * 720;

        imgWrapper.style.animation = `fallDown ${duration}s ease-in ${delay}s forwards`;
        imgWrapper.style.setProperty("--rotation", `${rotation}deg`);

        imgWrapper.appendChild(img);
        element.appendChild(imgWrapper);
      }
    });
  }

  // Разбиваем текст в h1 и p на символы
  const h1 = header.querySelector("h1");
  const p = header.querySelector("p");

  if (h1) splitTextToChars(h1);
  if (p) splitTextToChars(p);

  // Добавляем CSS анимацию если её еще нет
  if (!document.getElementById("fallDownAnimation")) {
    const style = document.createElement("style");
    style.id = "fallDownAnimation";
    style.textContent = `
            @keyframes fallDown {
                0% {
                    transform: translateY(0) rotate(0deg);
                    opacity: 1;
                }
                90% {
                    opacity: 1;
                }
                100% {
                    transform: translateY(100vh) rotate(var(--rotation));
                    opacity: 0;
                }
            }
        `;
    document.head.appendChild(style);
  }

  // Скрываем все содержимое
  document.getElementById("loading").style.display = "none";
  document.getElementById("userContent").style.display = "none";
  document.getElementById("userIdDisplay").style.display = "none";
  document.getElementById("manualInputSection").style.display = "none";

  // Создаем предупреждение для несанкционированного доступа
  const warningHtml = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; text-align: center; box-sizing: border-box;">
            <img src="/avatars/warning.png" alt="Warning" style="width: 150px; height: 150px; margin-bottom: 20px; filter: drop-shadow(0 0 20px rgba(255,0,0,0.8)); animation: pulse 2s ease-in-out infinite;">
            <h1 style="color: white; font-size: 2.5rem; margin-bottom: 15px; text-shadow: 0 0 20px rgba(0,0,0,0.5);">Слышь, псина</h1>
            <p style="color: white; font-size: 1.3rem; margin-bottom: 30px; text-shadow: 0 0 10px rgba(0,0,0,0.5);">Куда ты идешь?</p>
            <button onclick="restoreNormalView()" class="warning-btn warning-btn-primary">
                🔙 Войти нормально
            </button>
        </div>
    `;

  // Добавляем анимацию пульсации для картинки (стили уже добавлены в первой функции)
  if (!document.getElementById("pulseAnimation")) {
    const style = document.createElement("style");
    style.id = "pulseAnimation";
    style.textContent = `
            @keyframes pulse {
                0%, 100% {
                    transform: scale(1);
                    filter: drop-shadow(0 0 20px rgba(255,0,0,0.8));
                }
                50% {
                    transform: scale(1.1);
                    filter: drop-shadow(0 0 40px rgba(255,0,0,1));
                }
            }
            
            .warning-btn {
                padding: 20px 50px;
                text-decoration: none;
                font-size: 1.3rem;
                font-weight: bold;
                border-radius: 50px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                transition: all 0.3s ease;
                display: inline-block;
                cursor: pointer;
            }
            
            .warning-btn-primary {
                background: white;
                color: #8B0000;
                border: none;
            }
            
            .warning-btn-secondary {
                background: rgba(255,255,255,0.2);
                color: white;
                border: 2px solid white;
            }
            
            .warning-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 15px 40px rgba(0,0,0,0.7);
            }
            
            .warning-btn-secondary:hover {
                background: rgba(255,255,255,0.3);
            }
            
            @media (max-width: 768px) {
                .warning-btn {
                    padding: 15px 30px;
                    font-size: 1rem;
                }
            }
        `;
    document.head.appendChild(style);
  }

  const contentElement = document.querySelector(".content");
  contentElement.innerHTML = warningHtml;
  contentElement.style.overflow = "hidden";
  contentElement.style.height = "100vh";
  document.body.style.overflow = "hidden";
}

// Универсальная функция для показа кастомных алертов
function showCustomAlert(title, message, buttons = []) {
  // Создаем оверлей
  const overlay = document.createElement("div");
  overlay.id = "customAlertOverlay";
  overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: fadeIn 0.3s ease;
    `;

  // Создаем модальное окно
  const modal = document.createElement("div");
  modal.style.cssText = `
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
        border: 2px solid #667eea;
        border-radius: 15px;
        padding: 30px;
        max-width: 500px;
        width: 100%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: slideIn 0.3s ease;
    `;

  // Заголовок
  const titleElement = document.createElement("h2");
  titleElement.textContent = title;
  titleElement.style.cssText = `
        color: white;
        margin: 0 0 15px 0;
        font-size: 1.5rem;
        text-align: center;
    `;

  // Сообщение
  const messageElement = document.createElement("p");
  messageElement.innerHTML = message; // Изменено с textContent на innerHTML для поддержки HTML
  messageElement.style.cssText = `
        color: rgba(255, 255, 255, 0.8);
        margin: 0 0 25px 0;
        font-size: 1rem;
        line-height: 1.5;
        text-align: center;
    `;

  // Контейнер для кнопок
  const buttonsContainer = document.createElement("div");
  buttonsContainer.style.cssText = `
        display: flex;
        gap: 15px;
        justify-content: center;
        flex-wrap: wrap;
    `;

  // Создаем кнопки
  buttons.forEach((buttonConfig) => {
    const button = document.createElement("button");
    button.textContent = buttonConfig.text;
    button.style.cssText = `
            padding: 12px 30px;
            background: ${buttonConfig.color || "#667eea"};
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
        `;

    button.onmouseover = () => {
      button.style.transform = "scale(1.05)";
      button.style.boxShadow = "0 5px 15px rgba(0, 0, 0, 0.3)";
    };

    button.onmouseout = () => {
      button.style.transform = "scale(1)";
      button.style.boxShadow = "none";
    };

    button.onclick = () => {
      // Закрываем модалку
      document.body.removeChild(overlay);

      // Выполняем действие, если оно есть
      if (buttonConfig.action) {
        buttonConfig.action();
      }
    };

    buttonsContainer.appendChild(button);
  });

  // Собираем модалку
  modal.appendChild(titleElement);
  modal.appendChild(messageElement);
  modal.appendChild(buttonsContainer);
  overlay.appendChild(modal);

  // Добавляем анимации, если их еще нет
  if (!document.getElementById("customAlertAnimations")) {
    const style = document.createElement("style");
    style.id = "customAlertAnimations";
    style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideIn {
                from { 
                    transform: translateY(-50px);
                    opacity: 0;
                }
                to { 
                    transform: translateY(0);
                    opacity: 1;
                }
            }
        `;
    document.head.appendChild(style);
  }

  // Добавляем на страницу
  document.body.appendChild(overlay);
}

// Функция для отвязки Telegram аккаунта
async function unlinkTelegram() {
  showCustomAlert(
    "⚠️ Отвязать Telegram?",
    "Вы уверены, что хотите отвязать Telegram аккаунт?\n\n" +
      "После отвязки:\n" +
      "• Уведомления 'Кто в канале' будут автоматически отключены\n" +
      "• Для повторной связи нужно будет заново сгенерировать код",
    [
      {
        text: "🔓 Да, отвязать",
        color: "#f44336",
        action: async () => {
          try {
            const response = await fetch(
              `/api/telegram-link/unlink/${window.currentUserId}`,
              {
                method: "DELETE",
              },
            );

            if (response.ok) {
              // Обновляем UI
              checkTelegramLinkStatus();

              showCustomAlert(
                "✅ Успешно!",
                "Telegram аккаунт отвязан. Уведомления отключены.\n\nДля повторной связи нажмите 'Связать с Telegram'.",
                [{ text: "OK", color: "#4CAF50", action: null }],
              );
            } else {
              showCustomAlert(
                "❌ Ошибка",
                "Не удалось отвязать Telegram аккаунт. Попробуйте позже.",
                [{ text: "OK", color: "#666", action: null }],
              );
            }
          } catch (error) {
            console.error("Ошибка отвязки Telegram:", error);
            showCustomAlert(
              "❌ Ошибка",
              "Произошла ошибка при отвязке. Попробуйте позже.",
              [{ text: "OK", color: "#666", action: null }],
            );
          }
        },
      },
      {
        text: "Отмена",
        color: "#666",
        action: null,
      },
    ],
  );
}
