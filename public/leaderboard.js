async function loadLeaderboard(forceRefresh = false) {
  try {
    const response = await fetch("/api/leaderboard");
    const leaderboard = await response.json();

    // Получаем онлайн статусы
    const statusResponse = await fetch("/api/online-status");
    const onlineStatuses = await statusResponse.json();

    // Сохраняем данные пользователей с аватарками в localStorage
    localStorage.setItem("leaderboardUsers", JSON.stringify(leaderboard));

    const leaderboardList = document.getElementById("leaderboardList");
    let html = "";

    leaderboard.forEach((user, index) => {
      const hours = Math.floor(user.total_voice_time / 3600);
      const minutes = Math.floor((user.total_voice_time % 3600) / 60);
      const userId = user.user_id.replace(/"/g, "&quot;");
      const avatarUrl = user.avatar_url || "/avatars/nopic.png";
      // Добавляем timestamp только если принудительное обновление или nopic.png
      const avatarUrlFinal =
        forceRefresh || avatarUrl.includes("nopic.png")
          ? avatarUrl + "?t=" + Date.now()
          : avatarUrl;

      // Получаем статус пользователя
      const userStatus = onlineStatuses[user.user_id];
      const statusIndicator = userStatus
        ? `<span class="status-indicator ${userStatus}"></span>`
        : "";

      html +=
        '<div class="leaderboard-item" onclick="showUserModal(&#34;' +
        userId +
        "&#34;, &#34;" +
        (user.username || "Неизвестный пользователь").replace(/"/g, "&quot;") +
        "&#34;, " +
        (index + 1) +
        ')" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center;">' +
        '<div class="leaderboard-item-top" style="display: flex; align-items: center; gap: 12px;">' +
        '<span class="rank">#' +
        (index + 1) +
        "</span>" +
        '<div class="avatar-container">' +
        '<img src="' +
        avatarUrlFinal +
        '" alt="Avatar" onerror="this.src=\'/avatars/nopic.png\'">' +
        statusIndicator +
        "</div>" +
        "<strong>" +
        (user.username || "Неизвестный пользователь") +
        "</strong>" +
        "</div>" +
        '<div class="leaderboard-item-bottom" style="display: flex; align-items: center;">' +
        "<span>" +
        hours +
        "ч " +
        minutes +
        "м</span>" +
        '<small style="margin-left: 10px; color: #666;">(' +
        (user.rank_points || 0) +
        " очков)</small>" +
        "</div>" +
        "</div>";
    });

    leaderboardList.innerHTML = html;
  } catch (error) {
    document.getElementById("leaderboardList").innerHTML =
      '<div class="error">Ошибка загрузки рейтинга</div>';
  }
}

async function showUserModal(userId, username, rank) {
  // Показываем индикатор загрузки
  showLoadingModal();

  try {
    const response = await fetch(`/api/stats/${userId}`);
    const data = await response.json();
    const isAdmin = window.currentUserId === window.CONFIG.ADMIN_USER_ID;

    // Получаем аватарку из localStorage или используем дефолтную
    const savedUsers = JSON.parse(
      localStorage.getItem("leaderboardUsers") || "[]",
    );
    const user = savedUsers.find((u) => u.user_id === userId);
    const avatarUrl =
      user?.avatar_url || data.stats?.avatar_url || "/avatars/nopic.png";

    // Получаем онлайн статус пользователя
    const statusResponse = await fetch("/api/online-status");
    const onlineStatuses = await statusResponse.json();
    const userStatus = onlineStatuses[userId];

    // Отправляем уведомление админу о просмотре профиля
    if (window.currentUserId && window.currentUsername) {
      fetch("/api/notify/profile-view", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          viewerId: window.currentUserId,
          viewerUsername: window.currentUsername,
          targetUserId: userId,
          targetUsername: username,
        }),
      }).catch((err) => console.error("Ошибка отправки уведомления:", err));
    }

    // Закрываем индикатор загрузки и показываем модалку с данными
    closeLoadingModal();
    displayUserModal(
      data,
      username,
      rank,
      userId,
      isAdmin,
      avatarUrl,
      userStatus,
    );
  } catch (error) {
    closeLoadingModal();
    alert("Ошибка загрузки данных пользователя");
  }
}

function showLoadingModal() {
  const loadingHtml = `
        <div class="modal" id="loadingModal">
            <div class="loading-modal-content">
                <div class="loading-spinner">
                    <img src="/avatars/loading.png" alt="Loading" class="loading-image">
                    <div class="loading-dots">
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                    </div>
                </div>
                <p class="loading-text">Загрузка данных...</p>
            </div>
        </div>
    `;

  document.body.insertAdjacentHTML("beforeend", loadingHtml);
  document.body.classList.add("modal-open");
}

function closeLoadingModal() {
  const modal = document.getElementById("loadingModal");
  if (modal) {
    modal.remove();
  }
}

function switchModalTab(tabName) {
  document.querySelectorAll(".modal-tab-content").forEach((tab) => {
    tab.style.display = "none";
  });

  document.querySelectorAll(".modal-tab-button").forEach((btn) => {
    btn.classList.remove("active");
  });

  document.getElementById(`modal-${tabName}`).style.display = "block";

  document
    .querySelector(`[onclick="switchModalTab('${tabName}')"]`)
    .classList.add("active");
}

function displayUserModal(
  data,
  username,
  rank,
  userId,
  isAdmin = false,
  avatarUrl = "/avatars/nopic.png",
  userStatus = null,
) {
  const achievements = data.achievements;
  const stats = data.stats;

  // Добавляем timestamp только если nopic.png
  const avatarUrlFinal = avatarUrl.includes("nopic.png")
    ? avatarUrl + "?t=" + Date.now()
    : avatarUrl;

  // Формируем индикатор статуса
  const statusIndicator = userStatus
    ? `<span class="status-indicator ${userStatus}"></span>`
    : "";

  // Подсчитываем достижения (исключая специальные)
  const regularAchievements = achievements.filter(
    (a) => !a.emoji && !a.type && a.achievement_id !== "best_admin",
  );
  const specialAchievements = achievements.filter(
    (a) =>
      (a.emoji && a.type === "special") || a.achievement_id === "best_admin",
  );
  const totalRegular = Object.keys(window.ACHIEVEMENTS).length;

  // Формируем HTML для достижений
  let achievementsHtml = "";

  if (regularAchievements.length === 0 && specialAchievements.length === 0) {
    achievementsHtml = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #666;">
                <h3>😔 Достижений пока нет</h3>
                <p>Этот пользователь еще не получил ни одного достижения</p>
            </div>
        `;
  } else {
    // Обычные достижения
    regularAchievements.forEach((ach) => {
      const achievement = window.ACHIEVEMENTS[ach.achievement_id];
      if (achievement) {
        const deleteBtn = isAdmin
          ? `<button onclick="deleteUserAchievement('${userId}', '${ach.achievement_id}')" style="margin-top: 8px; padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>`
          : "";
        achievementsHtml += `
                    <div class="modal-achievement">
                        <h4>${achievement.name} ✅</h4>
                        <p style="margin: 8px 0; color: #666;">${achievement.description}</p>
                        <small>+${achievement.points} очков • Получено: ${new Date(ach.unlocked_at).toLocaleDateString("ru-RU")}</small>
                        ${deleteBtn}
                    </div>
                `;
      }
    });

    // Специальные достижения
    if (specialAchievements.length > 0) {
      achievementsHtml += `
                <div style="grid-column: 1 / -1; margin-top: 20px; border-top: 3px solid #ffd700; padding-top: 20px;">
                    <h3 style="text-align: center; color: #ffd700; margin-bottom: 15px;">⭐ Специальные достижения ⭐</h3>
                </div>
            `;

      specialAchievements.forEach((ach) => {
        const deleteBtn = isAdmin
          ? `<button onclick="deleteUserAchievement('${userId}', '${ach.achievement_id}')" style="margin-top: 8px; padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>`
          : "";

        // Для best_admin используем кастомные данные если есть, иначе дефолтные
        let displayEmoji, displayName, displayDescription, displayColor;

        if (ach.achievement_id === "best_admin") {
          if (ach.emoji) {
            displayEmoji = ach.emoji;
            displayName = ach.name;
            displayDescription = ach.description;
            displayColor = ach.color || "#ffd700";
          } else {
            displayEmoji = "👑";
            displayName = "Kakashech - Лучший админ";
            displayDescription = "Лучший admin_ebaniy канала";
            displayColor = "#ffd700";
          }
        } else {
          displayEmoji = ach.emoji;
          displayName = ach.name;
          displayDescription = ach.description;
          displayColor = ach.color || "#ffd700";
        }

        // Показываем запланированную дату для админа
        let scheduledInfo = '';
        if (isAdmin && ach.special_date) {
          const scheduledDate = new Date(ach.special_date);
          const now = new Date();
          if (scheduledDate > now) {
            scheduledInfo = `<small style="color: #ff9800; font-weight: bold;">⏰ Запланировано на: ${scheduledDate.toLocaleString("ru-RU")}</small><br>`;
          }
        }

        achievementsHtml += `
                    <div class="modal-achievement special-achievement" style="
                        background: linear-gradient(135deg, ${displayColor}22 0%, ${displayColor}11 100%);
                        border-left: 4px solid ${displayColor};
                    ">
                        <h4 style="color: ${displayColor};">${displayEmoji} ${displayName} ✨</h4>
                        <p style="margin: 8px 0; color: #555;">${displayDescription}</p>
                        ${scheduledInfo}
                        <small style="color: #666; font-weight: bold;">🎉 Получено: ${new Date(ach.unlocked_at).toLocaleDateString("ru-RU")}</small>
                        ${deleteBtn}
                    </div>
                `;
      });
    }
  }

  let modalHtml = `
        <div class="modal" id="achievementsModal">
            <div class="modal-content" style="max-width: 800px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;">
                <div class="modal-header" style="display: flex; align-items: center; gap: 20px; position: relative; flex-shrink: 0;">
                    <div class="modal-avatar-container">
                        <img src="${avatarUrlFinal}" alt="Avatar" class="modal-avatar" onerror="this.src='/avatars/nopic.png'">
                        ${statusIndicator}
                    </div>
                    <div class="modal-header-name-block" style="flex: 1; text-align: center;">
                        <h2>👤 Профиль пользователя</h2>
                        <h3>#${rank} ${username}</h3>
                    </div>
                    <button class="close-btn" onclick="closeModal()">×</button>
                </div>
                
                <div class="modal-tabs" style="flex-shrink: 0;">
                    <button class="modal-tab-button active" onclick="switchModalTab('achievements')">🏆 Достижения</button>
                    <button class="modal-tab-button" onclick="switchModalTab('stats')">📊 Статистика</button>
                </div>
                
                <div class="modal-body" style="flex: 1; overflow-y: auto; overflow-x: hidden;">
                    <div id="modal-achievements" class="modal-tab-content">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <p>Достижений: ${regularAchievements.length}/${totalRegular} (${Math.round((regularAchievements.length / totalRegular) * 100)}%)</p>
                            <p>Очков рейтинга: ${stats.rank_points || 0}</p>
                        </div>
                        <div class="modal-achievements">
                            ${achievementsHtml}
                        </div>
                    </div>
                    
                    <div id="modal-stats" class="modal-tab-content" style="display: none;">
                        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                            <div class="stat-item">
                                <div class="stat-value">${stats.total_sessions || 0}</div>
                                <div class="stat-label">Всего сессий</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${Math.floor((stats.total_voice_time || 0) / 3600)}ч ${Math.floor(((stats.total_voice_time || 0) % 3600) / 60)}м</div>
                                <div class="stat-label">Время в голосовых</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${stats.total_afk_moves || 0}</div>
                                <div class="stat-label">Перемещений в AFK</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${Math.floor((stats.total_afk_time || 0) / 3600)}ч ${Math.floor(((stats.total_afk_time || 0) % 3600) / 60)}м</div>
                                <div class="stat-label">Время в AFK</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${stats.rank_points || 0}</div>
                                <div class="stat-label">Очки рейтинга</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${Math.floor((stats.longest_session || 0) / 3600)}ч ${Math.floor(((stats.longest_session || 0) % 3600) / 60)}м${stats.longest_session_date ? '<br><span style="font-size:0.55em;color:#999;">' + new Date(stats.longest_session_date).toLocaleDateString("ru-RU") + " " + new Date(stats.longest_session_date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) + "</span>" : ""}</div>
                                <div class="stat-label">Самая длинная сессия</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${stats.total_mute_toggles || 0}</div>
                                <div class="stat-label">Переключений микрофона</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${stats.settings_changes || 0}</div>
                                <div class="stat-label">Изменений настроек</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${stats.messages_sent || 0}</div>
                                <div class="stat-label">Отправлено сообщений</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${stats.mentions_responded || 0}</div>
                                <div class="stat-label">Ответов на упоминания</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${Math.floor((stats.stream_channel_time || 0) / 3600)}ч ${Math.floor(((stats.stream_channel_time || 0) % 3600) / 60)}м</div>
                                <div class="stat-label">Время в канале Че смотрим?</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${stats.web_visits || 0}</div>
                                <div class="stat-label">Посещений веб-панели</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${stats.total_streams || 0}</div>
                                <div class="stat-label">Включений трансляций</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  document.body.classList.add("modal-open");
}

function closeModal() {
  const modal = document.getElementById("achievementsModal");
  if (modal) {
    modal.remove();
    document.body.classList.remove("modal-open");
  }
}

// Периодическое обновление онлайн статусов (каждые 30 секунд)
setInterval(async () => {
  try {
    const statusResponse = await fetch("/api/online-status");
    const onlineStatuses = await statusResponse.json();

    // Обновляем индикаторы статусов для текущих элементов
    const leaderboardItems = document.querySelectorAll(".leaderboard-item");
    leaderboardItems.forEach((item, index) => {
      const savedUsers = JSON.parse(
        localStorage.getItem("leaderboardUsers") || "[]",
      );
      if (savedUsers[index]) {
        const userId = savedUsers[index].user_id;
        const avatarContainer = item.querySelector(".avatar-container");

        if (avatarContainer) {
          // Удаляем старый индикатор
          const oldIndicator =
            avatarContainer.querySelector(".status-indicator");
          if (oldIndicator) {
            oldIndicator.remove();
          }

          // Добавляем новый индикатор, если пользователь онлайн
          const userStatus = onlineStatuses[userId];
          if (userStatus) {
            const statusIndicator = document.createElement("span");
            statusIndicator.className = `status-indicator ${userStatus}`;
            avatarContainer.appendChild(statusIndicator);
          }
        }
      }
    });
  } catch (error) {
    console.error("Ошибка обновления онлайн статусов:", error);
  }
}, 30000); // 30 секунд

document.addEventListener("click", function (event) {
  const modal = document.getElementById("achievementsModal");
  const createModal = document.getElementById("createSpecialAchievementModal");

  if (modal && event.target === modal) {
    closeModal();
  }
  if (createModal && event.target === createModal) {
    closeCreateSpecialAchievementModal();
  }
});
