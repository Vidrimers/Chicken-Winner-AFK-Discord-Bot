// Константы достижений
const REGULAR_ACHIEVEMENTS = {
    first_join: { name: '🎤 Малыш заговорил', description: 'Присоединился к голосовому каналу впервые', points: 10 },
    first_afk: { name: '😴 Первый сон', description: 'Был перемещен в AFK впервые', points: 5 },
    first_message: { name: '💬 Первые буквы', description: 'Отправил первое сообщение в текстовом канале', points: 10 },
    first_settings: { name: '⚙️ Первые настройки', description: 'Изменил настройки бота впервые', points: 10 },
    first_web_visit: { name: '🌐 Первый серфер', description: 'Посетил веб-панель бота впервые', points: 15 },
    first_stream: { name: '📡 Первый стример', description: 'Включил трансляцию впервые', points: 20 },
    voice_starter: { name: '🎧 Алло, это я', description: 'Провел 50+ часов в голосовых каналах', points: 50 },
    voice_addict: { name: '🎧 Заболтал до сотки', description: 'Провел 100+ часов в голосовых каналах', points: 100 },
    voice_god: { name: '🎧 Звезда эфира', description: 'Провел 1000+ часов в голосовых каналах', points: 1000 },
    chatty_beginner: { name: '💬 Разговорчивый новичок', description: 'Отправил 200+ сообщений в текстовых каналах', points: 25 },
    chatty_user: { name: '💬 Болтун', description: 'Отправил 500+ сообщений в текстовых каналах', points: 75 },
    flooter: { name: '💬 Флудер', description: 'Отправил 750+ сообщений в текстовых каналах', points: 100 },
    linguist: { name: '💬 Лингвист', description: 'Отправил 1000+ сообщений в текстовых каналах', points: 150 },
    session_beginner: { name: '🎯 Начинающий участник', description: 'Участвовал в 10+ голосовых сессиях', points: 15 },
    session_veteran: { name: '🎯 Опытный участник', description: 'Участвовал в 50+ голосовых сессиях', points: 40 },
    session_master: { name: '🎯 Мастер сессий', description: 'Участвовал в 100+ голосовых сессиях', points: 75 },
    frequent_guest: { name: '🎯 Частый гость', description: 'Участвовал в 200+ голосовых сессиях', points: 150 },
    permanent_resident: { name: '🎯 Постоянный житель', description: 'Участвовал в 500+ голосовых сессиях', points: 350 },
    session_lord: { name: '🎯 Властелин сессий', description: 'Участвовал в 1000+ голосовых сессиях', points: 1000 },
    afk_beginner: { name: '😴 AFK новичок', description: 'Перемещен в AFK 10 раз', points: 10 },
    afk_veteran: { name: '😴 AFK ветеран', description: 'Перемещен в AFK 50 раз', points: 50 },
    afk_master: { name: '😴 AFK Специалист', description: 'Перемещен в AFK 100 раз', points: 100 },
    afk_time_lord: { name: '😴 AFK Повелитель времени', description: 'Провел 1000+ часов в AFK канале', points: 1000 },
    no_afk_week: { name: '💪 Железная воля', description: 'Неделя без перемещений в AFK', points: 50 },
    mute_master: { name: '🎙️ Мастер тишины', description: 'Переключил микрофон 100 раз', points: 25 },
    long_session: { name: '⏰ Марафонец', description: 'Провел 12+ часов в одной сессии', points: 75 },
    voice_vegetable: { name: '🥦 Биомебель войса', description: 'Провел 24+ часов в одной сессии', points: 150 },
    settings_explorer: { name: '⚙️ Исследователь настроек', description: 'Изменил настройки бота 20 раз', points: 30 },
    mention_responder: { name: '📢 Отзывчивый', description: 'Ответил на 1000+ упоминаний', points: 100 },
    stream_viewer_1: { name: '📺 Одним глазком', description: 'Провел 5+ часов в канале Че смотрим?', points: 10 },
    stream_viewer_2: { name: '📺 Зритель со стажем', description: 'Провел 50+ часов в канале Че смотрим?', points: 50 },
    stream_viewer_3: { name: '📺 Топовый зритель', description: 'Провел 100+ часов в канале Че смотрим?', points: 100 },
    stream_viewer_4: { name: '📺 Киберфанат', description: 'Провел 200+ часов в канале Че смотрим?', points: 200 },
    stream_viewer_5: { name: '📺 Бессмертный зритель', description: 'Провел 500+ часов в канале Че смотрим?', points: 500 },
    stream_viewer_6: { name: '📺 Легенда трансляций', description: 'Провел 1000+ часов в канале Че смотрим?', points: 1000 },
    // Cheater Checker — проверенные профили
    checker_first: { name: '🔍 Досье открыто', description: 'Проверил первый Steam-профиль', points: 5 },
    checker_beginner: { name: '🔍 Любопытный сосед', description: 'Проверил 10 Steam-профилей', points: 10 },
    checker_active: { name: '🔍 Любитель покопаться', description: 'Проверил 25 Steam-профилей', points: 25 },
    checker_veteran: { name: '🔍 Диванный детектив', description: 'Проверил 50 Steam-профилей', points: 50 },
    checker_master: { name: '🔍 Маленький сыщик', description: 'Проверил 100 Steam-профилей', points: 100 },
    checker_300: { name: '🔍 Патруль на минималках', description: 'Проверил 300 Steam-профилей', points: 200 },
    checker_500: { name: '🔍 Машина подозрений', description: 'Проверил 500 Steam-профилей', points: 350 },
    checker_700: { name: '🔍 Главный по репортам', description: 'Проверил 700 Steam-профилей', points: 500 },
    checker_1000: { name: '🔍 Параноик года', description: 'Проверил 1000 Steam-профилей', points: 750 },
    // Cheater Checker — выявленные читеры
    cheater_found_first: { name: '🚨 Я так и знал', description: 'Выявил первого читера', points: 15 },
    cheater_found_5: { name: '🚨 Крысолов', description: 'Выявил 5 читеров', points: 25 },
    cheater_found_10: { name: '🚨 Слишком много совпадений', description: 'Выявил 10 читеров', points: 50 },
    cheater_found_25: { name: '🚨 Минус аккаунт', description: 'Выявил 25 читеров', points: 150 },
    cheater_found_50: { name: '🚨 Уже не удивляюсь', description: 'Выявил 50 читеров', points: 300 },
    cheater_found_100: { name: '🚨 Санитар матчмейкинга', description: 'Выявил 100 читеров', points: 450 },
    cheater_found_300: { name: '🚨 Истребитель шнырей', description: 'Выявил 300 читеров', points: 600 },
    cheater_found_500: { name: '🚨 Valve мне должны', description: 'Выявил 500 читеров', points: 800 },
    cheater_found_700: { name: '🚨 У меня нет жизни, но есть статистика', description: 'Выявил 700 читеров', points: 900 },
    cheater_found_1000: { name: '🚨 VAC на ножках', description: 'Выявил 1000 читеров', points: 1000 }
};

const SPECIAL_ACHIEVEMENTS = {
    best_admin: { name: '👑 Kakashech - Лучший админ', description: 'Лучший admin_ebaniy канала', points: 0 }
};

// Экспортируем для использования в других модулях
window.ACHIEVEMENTS = REGULAR_ACHIEVEMENTS;

function displayUserAchievements(achievements) {
    const achievementsList = document.getElementById('achievementsList');
    const unlockedIds = achievements.map(a => a.achievement_id);
    
    let html = '';
    
    const unlockedRegular = achievements.filter(a => REGULAR_ACHIEVEMENTS.hasOwnProperty(a.achievement_id));
    const totalRegular = Object.keys(REGULAR_ACHIEVEMENTS).length;
    
    html += `
        <div style="grid-column: 1 / -1; text-align: center; margin-bottom: 20px;">
            <h2 style="color: #667eea; margin-bottom: 10px;">🏆 Достижения (${unlockedRegular.length}/${totalRegular})</h2>
            <div class="progressbar" style="background: #f8f9fa; padding: 10px; border-radius: 10px; display: inline-block;">
                <strong>Прогресс: ${Math.round((unlockedRegular.length / totalRegular) * 100)}%</strong>
                <div style="width: 200px; height: 8px; background: #ddd; border-radius: 4px; margin: 5px auto; overflow: hidden;">
                    <div style="width: ${(unlockedRegular.length / totalRegular) * 100}%; height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); transition: width 0.3s;"></div>
                </div>
            </div>
        </div>
    `;
    
    const unlockedAchievements = [];
    const lockedAchievements = [];

    for (const [id, achievement] of Object.entries(REGULAR_ACHIEVEMENTS)) {
        const isUnlocked = unlockedIds.includes(id);
        const unlockedDate = isUnlocked ? achievements.find(a => a.achievement_id === id)?.unlocked_at : null;
        
        const achievementHtml = `
            <div class="achievement ${isUnlocked ? '' : 'locked'}" data-achievement-id="${id}">
                <h3>${achievement.name} ${isUnlocked ? '✅' : '🔒'}</h3>
                <p>${achievement.description}</p>
                <small>+${achievement.points} очков${isUnlocked ? ' • Получено: ' + new Date(unlockedDate).toLocaleDateString('ru-RU') : ''}</small>
            </div>
        `;
        
        if (isUnlocked) {
            unlockedAchievements.push({ html: achievementHtml, date: new Date(unlockedDate) });
        } else {
            lockedAchievements.push(achievementHtml);
        }
    }

    unlockedAchievements.sort((a, b) => b.date - a.date);

    unlockedAchievements.forEach(achievement => {
        html += achievement.html;
    });

    lockedAchievements.forEach(achievementHtml => {
        html += achievementHtml;
    });
    
    // Специальные достижения
    const isAdmin = window.currentUserId === window.CONFIG.ADMIN_USER_ID;
    const now = new Date();
    
    let userSpecialAchievements = achievements.filter(a => {
        // Пропускаем записи с пустыми данными (мусор из БД)
        if (!a.emoji || !a.name) return false;
        
        const isSpecial = a.type === 'special' || a.achievement_id === 'best_admin';
        if (!isSpecial) return false;
        
        if (isAdmin) return true;
        
        // Если достижение уже разблокировано (есть unlocked_at), показываем его
        if (a.unlocked_at) {
            return true;
        }
        
        // Если нет special_date, показываем
        if (!a.special_date) {
            return true;
        }
        
        // Если есть special_date но нет unlocked_at, проверяем дату
        const achievementDate = new Date(a.special_date);
        return achievementDate <= now;
    });
    
    // Добавляем best_admin только для админа если его нет в достижениях
    if (isAdmin && !userSpecialAchievements.some(a => a.achievement_id === 'best_admin')) {
        userSpecialAchievements.push({
            achievement_id: 'best_admin',
            unlocked_at: null,
            emoji: '👑',
            name: 'Kakashech - Лучший админ',
            description: 'Лучший admin_ebaniy канала',
            color: '#FFD700',
            type: 'special'
        });
    }
    
    // Для не-админа: показываем специальные достижения обычным способом
    if (!isAdmin && (userSpecialAchievements.length > 0)) {
        html += `
            <div style="grid-column: 1 / -1; margin-top: 40px; border-top: 3px solid #ffd700; padding-top: 30px;">
                <h2 style="text-align: center; color: #ffd700; margin-bottom: 20px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
                    ⭐ Специальные достижения ⭐
                </h2>
            </div>
        `;
        
        userSpecialAchievements.forEach(achievement => {
            if (achievement.achievement_id === 'best_admin') {
                let displayEmoji, displayName, displayDescription, displayColor;
                
                if (achievement.emoji) {
                    displayEmoji = achievement.emoji;
                    displayName = achievement.name;
                    displayDescription = achievement.description;
                    displayColor = achievement.color || '#ffd700';
                } else {
                    const bestAdminInfo = SPECIAL_ACHIEVEMENTS.best_admin;
                    displayEmoji = '👑';
                    displayName = bestAdminInfo.name;
                    displayDescription = bestAdminInfo.description;
                    displayColor = '#ffd700';
                }
                
                const isUnlocked = achievement.unlocked_at !== null;
                const deleteBtn = '';
                const editBtn = '';
                
                if (isUnlocked) {
                    html += `
                        <div class="achievement special-achievement" data-achievement-id="best_admin" style="
                            background: linear-gradient(135deg, ${displayColor}22 0%, ${displayColor}11 100%); 
                            color: #333; 
                            border-left: 5px solid ${displayColor};
                            position: relative;
                        ">
                            ${editBtn}
                            <h3 style="color: ${displayColor}; font-weight: bold;">${displayEmoji} ${displayName} ✨</h3>
                            <p style="color: #555; margin: 10px 0;">${displayDescription}</p>
                            <small style="color: #666; font-weight: bold;">🎉 Получено: ${new Date(achievement.unlocked_at).toLocaleDateString('ru-RU')}</small>
                            ${deleteBtn}
                        </div>
                    `;
                } else {
                    html += `
                        <div class="achievement special-achievement" style="
                            background: linear-gradient(135deg, ${displayColor}22 0%, ${displayColor}11 100%); 
                            color: #333; 
                            border-left: 5px solid ${displayColor};
                            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                            opacity: 0.5;
                            position: relative;
                        ">
                            ${editBtn}
                            <h3 style="color: ${displayColor}; font-weight: bold;">${displayEmoji} ${displayName} 🔒</h3>
                            <p style="color: #777; margin: 10px 0;">${displayDescription}</p>
                            <small style="color: #888; font-weight: bold;">❌ Для ID: 232581042177966080</small>
                            ${deleteBtn}
                        </div>
                    `;
                }
            } else if (achievement.emoji) {
                const deleteBtn = '';
                const editBtn = '';
                const isUnlocked = !!achievement.unlocked_at;
                
                if (isUnlocked) {
                    html += `
                        <div class="achievement special-achievement" data-achievement-id="${achievement.achievement_id}" style="
                            background: linear-gradient(135deg, ${achievement.color}22 0%, ${achievement.color}11 100%); 
                            color: #333; 
                            border-left: 5px solid ${achievement.color};
                            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                            position: relative;
                        ">
                            ${editBtn}
                            <h3 style="color: ${achievement.color}; font-weight: bold;">${achievement.emoji} ${achievement.name} ✨</h3>
                            <p style="color: #555; margin: 10px 0;">${achievement.description}</p>
                            <small style="color: #666; font-weight: bold;">🎉 Получено: ${new Date(achievement.unlocked_at).toLocaleDateString('ru-RU')}</small>
                            ${deleteBtn}
                        </div>
                    `;
                } else {
                    const achievementDate = achievement.special_date ? new Date(achievement.special_date) : null;
                    const scheduledDate = achievementDate ? achievementDate.toLocaleDateString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Неизвестно';
                    html += `
                        <div class="achievement special-achievement" style="
                            background: linear-gradient(135deg, ${achievement.color}22 0%, ${achievement.color}11 100%); 
                            color: #333; 
                            border-left: 5px solid ${achievement.color};
                            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                            opacity: 0.5;
                            position: relative;
                        ">
                            ${editBtn}
                            <h3 style="color: ${achievement.color}; font-weight: bold;">${achievement.emoji} ${achievement.name} 🔒</h3>
                            <p style="color: #777; margin: 10px 0;">${achievement.description}</p>
                            <small style="color: #888; font-weight: bold;">⏰ Планируется: ${scheduledDate}</small>
                            ${deleteBtn}
                        </div>
                    `;
                }
            }
        });
    }
    
    achievementsList.innerHTML = html;
    
    if (isAdmin) {
        fetch('/api/special-achievements')
            .then(r => r.json())
            .then(async allSpecial => {
                specialAchievementsAllSpecial = allSpecial;
                
                // Добавляем достижения самого админа (включая best_admin)
                const adminAchievements = userSpecialAchievements.map(a => ({
                    ...a,
                    user_id: window.currentUserId
                }));
                
                // Объединяем: достижения админа + достижения других из БД
                const allWithAdmin = [...adminAchievements];
                allSpecial.forEach(a => {
                    const exists = allWithAdmin.some(x => x.achievement_id === a.achievement_id && x.user_id === a.user_id);
                    if (!exists) {
                        allWithAdmin.push(a);
                    }
                });
                
                // Вручную добавляем best_admin для Kakashech если его нет или есть с пустыми данными
                const bestAdminIdx = allWithAdmin.findIndex(x => x.achievement_id === 'best_admin' && x.user_id === '232581042177966080');
                const bestAdminEntry = {
                    achievement_id: 'best_admin',
                    user_id: '232581042177966080',
                    emoji: '👑',
                    name: 'Kakashech - Лучший админ',
                    description: 'Лучший admin_ebaniy канала',
                    color: '#FFD700',
                    type: 'special',
                    unlocked_at: '2025-12-06T21:05:42.000Z'
                };
                if (bestAdminIdx >= 0) {
                    allWithAdmin[bestAdminIdx] = bestAdminEntry;
                } else {
                    allWithAdmin.push(bestAdminEntry);
                }
                specialAchievementsUserNames['232581042177966080'] = 'Kakashech';
                
                specialAchievementsAdminData = allWithAdmin;
                
                // Загружаем имена пользователей
                for (const achievement of specialAchievementsAdminData) {
                    if (!specialAchievementsUserNames[achievement.user_id]) {
                        try {
                            const response = await fetch(`/api/stats/${achievement.user_id}`);
                            const data = await response.json();
                            specialAchievementsUserNames[achievement.user_id] = data.stats?.username || 'Неизвестный';
                        } catch (err) {
                            specialAchievementsUserNames[achievement.user_id] = 'Неизвестный';
                        }
                    }
                }
                
                renderSpecialAchievementsUsersList();
            })
            .catch(err => console.error('Ошибка загрузки специальных достижений:', err));
    }
}

function renderSpecialAchievementsUsersList() {
    const container = document.getElementById('achievementsList');
    const existingSpecialSection = container.querySelector('.special-achievements-admin-section');
    if (existingSpecialSection) existingSpecialSection.remove();
    
    if (specialAchievementsAdminData.length === 0) return;
    
    // Группируем по пользователям
    const usersMap = {};
    specialAchievementsAdminData.forEach(a => {
        if (!usersMap[a.user_id]) {
            usersMap[a.user_id] = { userId: a.user_id, count: 0 };
        }
        usersMap[a.user_id].count++;
    });
    
    const users = Object.values(usersMap).sort((a, b) => b.count - a.count);
    
    let html = `
        <div class="special-achievements-admin-section" style="grid-column: 1 / -1; margin-top: 40px; border-top: 3px solid #ffd700; padding-top: 30px;">
            <h2 style="text-align: center; color: #ffd700; margin-bottom: 20px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
                ⭐ Специальные достижения ⭐
            </h2>
            <div style="max-width: 500px;">
    `;
    
    users.forEach(user => {
        const userName = specialAchievementsUserNames[user.userId] || 'Неизвестный';
        html += `
            <div onclick="showSpecialAchievementsForUser('${user.userId}')"
                 style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,215,0,0.3); border-radius:8px; cursor:pointer; transition: background 0.2s;"
                 onmouseover="this.style.background='rgba(255,215,0,0.1)'"
                 onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                <div>
                    <span style="color:#e0e0e0; font-weight:500;">👤 ${userName}</span>
                    <span style="color:#888; font-size:12px; margin-left:8px;">ID: ${user.userId}</span>
                </div>
                <span style="color:#ffd700; font-weight:bold;">${user.count} ${user.count === 1 ? 'достижение' : (user.count < 5 ? 'достижения' : 'достижений')}</span>
            </div>
        `;
    });
    
    html += '</div></div>';
    container.innerHTML += html;
}

function showSpecialAchievementsForUser(userId) {
    const container = document.getElementById('achievementsList');
    const section = container.querySelector('.special-achievements-admin-section');
    if (!section) return;
    
    const userName = specialAchievementsUserNames[userId] || 'Неизвестный';
    const userAchievements = specialAchievementsAdminData.filter(a => a.user_id === userId && a.emoji && a.name);
    
    let html = `
        <h2 style="text-align: center; color: #ffd700; margin-bottom: 20px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
            ⭐ Достижения: ${userName} ⭐
        </h2>
        <div onclick="renderSpecialAchievementsUsersList()" style="text-align:center; margin-bottom:20px;">
            <span style="color:#a45eea; cursor:pointer; font-weight:500; text-decoration:underline;">← Назад к списку</span>
        </div>
        <div style="max-width: 500px;">
    `;
    
    userAchievements.forEach(achievement => {
        const editBtn = `<button onclick="editSpecialAchievementOther('${achievement.achievement_id}', '${achievement.user_id}', event)" style="position:absolute; top:5px; right:5px; padding:6px 10px; background:transparent; border:none; border-radius:4px; cursor:pointer; font-size:18px; z-index:100;">✏️</button>`;
        const deleteBtn = `<button onclick="deleteUserAchievement('${achievement.user_id}', '${achievement.achievement_id}')" style="margin-top:8px; padding:4px 8px; background:#ff4444; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;">🗑️ Удалить</button>`;
        const achievementColor = achievement.color || '#999';
        const unlockedDate = achievement.unlocked_at ? new Date(achievement.unlocked_at).toLocaleDateString('ru-RU') : 'Неизвестно';
        const isUnlocked = !!achievement.unlocked_at;
        
        html += `
            <div class="achievement special-achievement" data-achievement-id="${achievement.achievement_id}" style="
                background: linear-gradient(135deg, ${achievementColor}22 0%, ${achievementColor}11 100%); 
                color: #333; 
                border-left: 5px solid ${achievementColor};
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                opacity: ${isUnlocked ? '1' : '0.7'};
                position: relative;
                margin-bottom: 10px;
            ">
                ${editBtn}
                <h3 style="color: ${achievementColor}; font-weight: bold;">${achievement.emoji} ${achievement.name} ${isUnlocked ? '✨' : '🔒'}</h3>
                <p style="color: #555; margin: 10px 0;">${achievement.description}</p>
                <small style="color: #666; font-weight: bold; display: block; margin-top: 3px;">🎉 Получено: ${unlockedDate}</small>
                ${deleteBtn}
            </div>
        `;
    });
    
    html += '</div>';
    section.innerHTML = html;
}

// Функция для переключения между именем и ID
function toggleUserFlip(flipId) {
    const container = document.getElementById(flipId);
    const textElement = container.querySelector('.user-flip-text');
    
    // Получаем текущее состояние из data-атрибута или определяем по содержимому
    const isShowingName = !container.dataset.showingId || container.dataset.showingId === 'false';
    
    // Добавляем класс для анимации
    textElement.style.animation = 'flipVertical 0.3s ease-in-out';
    
    // Меняем текст в середине анимации
    setTimeout(() => {
        const userName = textElement.dataset.username || textElement.textContent;
        const userId = textElement.dataset.userid;
        
        if (!textElement.dataset.username) {
            textElement.dataset.username = userName;
        }
        if (!textElement.dataset.userid) {
            textElement.dataset.userid = userId;
        }
        
        if (isShowingName) {
            textElement.textContent = userId;
            container.dataset.showingId = 'true';
        } else {
            textElement.textContent = userName;
            container.dataset.showingId = 'false';
        }
    }, 150);
    
    // Убираем анимацию после завершения
    setTimeout(() => {
        textElement.style.animation = '';
    }, 300);
}

// Функция для копирования имени или ID в буфер обмена
async function copyUserInfo(event, userName, userId) {
    event.stopPropagation();
    
    const textElement = event.target;
    const textToCopy = textElement.textContent;
    
    try {
        await navigator.clipboard.writeText(textToCopy);
        
        // Показываем уведомление
        const originalText = textElement.textContent;
        const originalColor = textElement.style.color;
        textElement.textContent = '✓ Скопировано!';
        textElement.style.color = '#28a745';
        
        setTimeout(() => {
            textElement.textContent = originalText;
            textElement.style.color = originalColor;
        }, 1000);
        
        console.log('✅ Скопировано в буфер:', textToCopy);
    } catch (err) {
        console.error('❌ Ошибка копирования:', err);
        
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            const originalText = textElement.textContent;
            const originalColor = textElement.style.color;
            textElement.textContent = '✓ Скопировано!';
            textElement.style.color = '#28a745';
            
            setTimeout(() => {
                textElement.textContent = originalText;
                textElement.style.color = originalColor;
            }, 1000);
        } catch (err2) {
            console.error('❌ Fallback копирование не удалось:', err2);
        }
        
        document.body.removeChild(textArea);
    }
}

function deleteUserAchievement(userId, achievementId) {
    if (!confirm('Вы уверены, что хотите удалить это достижение у пользователя?')) {
        return;
    }
    
    fetch('/api/admin/delete-achievement', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            userId: userId,
            achievementId: achievementId
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            // Удаляем элемент из DOM
            const achievementElement = document.querySelector('[data-achievement-id="' + achievementId + '"]');
            if (achievementElement) {
                achievementElement.remove();
            }
            
            // Если это текущий пользователь - перезагружаем его данные
            if (userId === window.currentUserId) {
                loadUserDataAuto(window.currentUserId);
            }
            
            // Если открыто модальное окно - закрываем его и перезагружаем лидерборд
            const modal = document.getElementById('achievementsModal');
            if (modal) {
                closeModal();
                loadLeaderboard();
            }
            
            console.log('✅ Достижение успешно удалено!');
        } else {
            alert('Ошибка при удалении достижения');
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        alert('Ошибка при удалении достижения');
    });
}

// === Выдача обычного достижения через админку ===

let grantAchievementAllUsers = [];

// === Навигация по спец. достижениям для админа ===
let specialAchievementsAdminData = [];
let specialAchievementsAllSpecial = [];
let specialAchievementsUserNames = {};

function openGrantRegularAchievementModal() {
    const select = document.getElementById('grantAchievementSelect');
    select.innerHTML = '<option value="">Выберите достижение</option>';
    
    for (const [id, achievement] of Object.entries(REGULAR_ACHIEVEMENTS)) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${achievement.name} (+${achievement.points} очков)`;
        select.appendChild(option);
    }
    
    document.getElementById('grantAchievementUserId').value = '';
    document.getElementById('grantAchievementSearch').value = '';
    document.getElementById('grantAchievementSelected').style.display = 'none';
    document.getElementById('grantAchievementDropdown').style.display = 'none';
    document.getElementById('grantAchievementPreview').style.display = 'none';
    
    select.onchange = function() {
        const preview = document.getElementById('grantAchievementPreview');
        const selected = REGULAR_ACHIEVEMENTS[this.value];
        if (selected) {
            preview.style.display = 'block';
            preview.innerHTML = `<strong style="color: #a45eea;">${selected.name}</strong><br><span style="color: #ccc;">${selected.description}</span><br><small style="color: #888;">+${selected.points} очков</small>`;
        } else {
            preview.style.display = 'none';
        }
    };
    
    document.getElementById('grantRegularAchievementModal').style.display = 'block';
    document.body.classList.add('modal-open');
    
    loadGrantAchievementUsers();
}

async function loadGrantAchievementUsers() {
    try {
        const res = await fetch('/api/guild-members');
        const users = await res.json();
        grantAchievementAllUsers = users || [];
    } catch (err) {
        console.error('Ошибка загрузки участников:', err);
        grantAchievementAllUsers = [];
    }
}

function filterGrantAchievementUsers(query) {
    const dropdown = document.getElementById('grantAchievementDropdown');
    const q = query.toLowerCase().trim();
    
    if (!q) {
        dropdown.style.display = 'none';
        return;
    }
    
    const filtered = grantAchievementAllUsers.filter(u =>
        u.username.toLowerCase().includes(q) ||
        u.user_id.includes(q)
    ).slice(0, 15);
    
    if (filtered.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.innerHTML = filtered.map(user => `
        <div onclick="selectGrantAchievementUser('${user.user_id}', '${escapeHtmlBug(user.username)}')"
             style="padding:8px 12px;cursor:pointer;color:#e0e0e0;border-bottom:1px solid rgba(255,255,255,0.05);"
             onmouseover="this.style.background='rgba(164,94,234,0.2)'"
             onmouseout="this.style.background='transparent'">
            <div style="font-weight:500;">${escapeHtmlBug(user.username)}</div>
            <div style="font-size:11px;color:#888;">${user.user_id}</div>
        </div>
    `).join('');
    
    dropdown.style.display = 'block';
}

function selectGrantAchievementUser(userId, username) {
    document.getElementById('grantAchievementUserId').value = userId;
    document.getElementById('grantAchievementSearch').value = username;
    document.getElementById('grantAchievementDropdown').style.display = 'none';
    
    const selected = document.getElementById('grantAchievementSelected');
    selected.style.display = 'block';
    selected.innerHTML = `Выбран: <strong>${username}</strong> (${userId})`;
}

document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('grantAchievementDropdown');
    const search = document.getElementById('grantAchievementSearch');
    if (dropdown && search && !dropdown.contains(e.target) && e.target !== search) {
        dropdown.style.display = 'none';
    }
});

function closeGrantRegularAchievementModal() {
    document.getElementById('grantRegularAchievementModal').style.display = 'none';
    document.getElementById('grantAchievementDropdown').style.display = 'none';
    document.body.classList.remove('modal-open');
}

async function grantRegularAchievement() {
    const userId = document.getElementById('grantAchievementUserId').value.trim();
    const achievementId = document.getElementById('grantAchievementSelect').value;
    
    if (!userId || !achievementId) {
        alert('Выберите пользователя и достижение!');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/grant-achievement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, achievementId })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            closeGrantRegularAchievementModal();
            alert(data.message || 'Достижение выдано!');
            loadUserDataAuto(window.currentUserId);
        } else {
            alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка при выдаче достижения:', error);
        alert('Ошибка при выдаче достижения');
    }
}
