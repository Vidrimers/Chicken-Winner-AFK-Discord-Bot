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
        const isSpecial = (a.emoji && a.name && a.type === 'special') || a.achievement_id === 'best_admin';
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
    
    if (isAdmin && !userSpecialAchievements.some(a => a.achievement_id === 'best_admin')) {
        userSpecialAchievements.push({
            achievement_id: 'best_admin',
            unlocked_at: null,
            emoji: null,
            name: null,
            description: null,
            color: null,
            type: null
        });
    }
    
    if (userSpecialAchievements.length > 0 || isAdmin) {
        html += `
            <div style="grid-column: 1 / -1; margin-top: 40px; border-top: 3px solid #ffd700; padding-top: 30px;">
                <h2 style="text-align: center; color: #ffd700; margin-bottom: 20px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
                    ⭐ Специальные достижения ⭐
                </h2>
            </div>
        `;
    }
    
    userSpecialAchievements.forEach(achievement => {
        if (achievement.achievement_id === 'best_admin') {
            // Для best_admin используем кастомные данные если есть, иначе дефолтные
            let displayEmoji, displayName, displayDescription, displayColor;
            
            if (achievement.emoji) {
                // Есть кастомные данные из БД
                displayEmoji = achievement.emoji;
                displayName = achievement.name;
                displayDescription = achievement.description;
                displayColor = achievement.color || '#ffd700';
            } else {
                // Используем дефолтные из константы
                const bestAdminInfo = SPECIAL_ACHIEVEMENTS.best_admin;
                displayEmoji = '👑';
                displayName = bestAdminInfo.name;
                displayDescription = bestAdminInfo.description;
                displayColor = '#ffd700';
            }
            
            const isUnlocked = achievement.unlocked_at !== null;
            const deleteBtn = isAdmin ? `<button onclick="deleteUserAchievement('${window.currentUserId}', 'best_admin')" style="padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>` : '';
            const editBtn = isAdmin ? `<button onclick="editSpecialAchievement('best_admin', event)" style="position: absolute; top: 5px; right: 5px; padding: 6px 10px; background: transparent; border: none; border-radius: 4px; cursor: pointer; font-size: 18px; z-index: 100; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">✏️</button>` : '';
            
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
            const deleteBtn = isAdmin ? `<button onclick="deleteUserAchievement('${window.currentUserId}', '${achievement.achievement_id}')" style="margin-top: 8px; padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>` : '';
            const editBtn = isAdmin ? `<button onclick="editSpecialAchievement('${achievement.achievement_id}', event)" style="position: absolute; top: 5px; right: 5px; padding: 6px 10px; background: transparent; border: none; border-radius: 4px; cursor: pointer; font-size: 18px; z-index: 100; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">✏️</button>` : '';
            
            // Если есть unlocked_at, значит достижение уже получено
            const isUnlocked = !!achievement.unlocked_at;
            
            if (isUnlocked) {
                // Достижение получено - показываем дату получения
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
                // Достижение еще не получено - показываем когда планируется
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
    
    achievementsList.innerHTML = html;
    
    if (isAdmin) {
        fetch('/api/special-achievements')
            .then(r => r.json())
            .then(async allSpecial => {
                const unlockedIds = userSpecialAchievements.map(a => a.achievement_id);
                
                const unlockedOtherSpecial = allSpecial.filter(a => !unlockedIds.includes(a.achievement_id));
                
                if (unlockedOtherSpecial.length > 0) {
                    // Загружаем имена пользователей
                    const userNames = {};
                    for (const achievement of unlockedOtherSpecial) {
                        if (!userNames[achievement.user_id]) {
                            try {
                                const response = await fetch(`/api/stats/${achievement.user_id}`);
                                const data = await response.json();
                                userNames[achievement.user_id] = data.stats?.username || 'Неизвестный';
                            } catch (err) {
                                userNames[achievement.user_id] = 'Неизвестный';
                            }
                        }
                    }
                    
                    let addHtml = '';
                    unlockedOtherSpecial.forEach(achievement => {
                        const editBtn = `<button onclick="editSpecialAchievementOther('${achievement.achievement_id}', '${achievement.user_id}', event)" style="position: absolute; top: 5px; right: 5px; padding: 6px 10px; background: transparent; border: none; border-radius: 4px; cursor: pointer; font-size: 18px; z-index: 100; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">✏️</button>`;
                        const deleteBtn = `<button onclick="deleteUserAchievement('${achievement.user_id}', '${achievement.achievement_id}')" style="margin-top: 8px; padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>`;
                        const achievementColor = achievement.color || '#999';
                        const userName = userNames[achievement.user_id] || 'Неизвестный';
                        const flipId = `flip-${achievement.achievement_id}`;
                        const unlockedDate = achievement.unlocked_at ? new Date(achievement.unlocked_at).toLocaleDateString('ru-RU') : 'Неизвестно';
                        
                        addHtml += `
                            <div class="achievement special-achievement" data-achievement-id="${achievement.achievement_id}" style="
                                background: linear-gradient(135deg, ${achievementColor}22 0%, ${achievementColor}11 100%); 
                                color: #333; 
                                border-left: 5px solid ${achievementColor};
                                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                                opacity: 0.7;
                                position: relative;
                            ">
                                ${editBtn}
                                <h3 style="color: ${achievementColor}; font-weight: bold;">${achievement.emoji} ${achievement.name} 🔒</h3>
                                <p style="color: #777; margin: 10px 0;">${achievement.description}</p>
                                <small style="color: #888; font-weight: bold; display: block; margin-top: 5px;">
                                    <span onclick="toggleUserFlip('${flipId}')" style="cursor: pointer;">👤 Для:</span>
                                    <span class="user-flip-container" id="${flipId}" data-showing-id="false" style="display: inline-block; position: relative; perspective: 1000px;">
                                        <span class="user-flip-text" onclick="copyUserInfo(event, '${userName}', '${achievement.user_id}')" data-username="${userName}" data-userid="${achievement.user_id}" style="cursor: pointer; display: inline-block; transition: transform 0.3s; transform-style: preserve-3d;">${userName}</span>
                                    </span>
                                </small>
                                <small style="color: #666; font-weight: bold; display: block; margin-top: 3px;">🎉 Получено: ${unlockedDate}</small>
                                ${deleteBtn}
                            </div>
                        `;
                    });
                    document.getElementById('achievementsList').innerHTML += addHtml;
                }
            })
            .catch(err => console.error('Ошибка загрузки специальных достижений:', err));
    }
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
