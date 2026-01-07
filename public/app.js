// Конфигурация (будет загружена с сервера)
window.CONFIG = {
    ADMIN_USER_ID: '',
    ADMIN_LOGIN: '',
    SERVER_IP: 'localhost',
    PORT: 3000
};

window.currentUserId = null;
window.currentUsername = null;
let showingUsername = true; // По умолчанию показываем имя

// Функция для безопасной установки имени пользователя
function setUserDisplay(username, userId) {
    window.currentUsername = username;
    window.currentUserId = userId;
    
    const userIdElement = document.getElementById('currentUserId');
    const labelElement = document.getElementById('userDisplayLabel');
    
    if (userIdElement) {
        userIdElement.textContent = username;
    } else {
        console.error('❌ Элемент currentUserId не найден!');
    }
    
    if (labelElement) {
        labelElement.textContent = '👤 Имя на сервере';
    }
    
    showingUsername = true;
}

// Функция переключения между именем и ID
function toggleUserInfo() {
    const label = document.getElementById('userDisplayLabel');
    const value = document.getElementById('currentUserId');
    const container = document.getElementById('userIdDisplay');
    
    if (!window.currentUserId || !window.currentUsername) return;
    
    // Добавляем класс для анимации
    container.classList.add('flipping');
    
    // Меняем содержимое в середине анимации
    setTimeout(() => {
        showingUsername = !showingUsername;
        
        if (showingUsername) {
            label.textContent = '👤 Имя на сервере';
            value.textContent = window.currentUsername;
        } else {
            label.textContent = '👤 ID пользователя';
            value.textContent = window.currentUserId;
        }
    }, 150); // Половина времени анимации
    
    // Убираем класс после завершения анимации
    setTimeout(() => {
        container.classList.remove('flipping');
    }, 300);
}

// Функция копирования в буфер обмена
async function copyToClipboard(event) {
    event.stopPropagation(); // Останавливаем всплытие события, чтобы не сработал toggleUserInfo
    
    const element = document.getElementById('currentUserId');
    const text = element.textContent;
    
    if (!text) return;
    
    try {
        await navigator.clipboard.writeText(text);
        
        // Показываем уведомление
        const originalText = element.textContent;
        element.textContent = '✓ Скопировано!';
        element.style.background = 'rgba(40, 167, 69, 0.5)';
        
        setTimeout(() => {
            element.textContent = originalText;
            element.style.background = '';
        }, 1000);
        
        console.log('✅ Скопировано в буфер:', text);
    } catch (err) {
        console.error('❌ Ошибка копирования:', err);
        
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            element.textContent = '✓ Скопировано!';
            element.style.background = 'rgba(40, 167, 69, 0.5)';
            
            setTimeout(() => {
                element.textContent = text;
                element.style.background = '';
            }, 1000);
        } catch (err2) {
            console.error('❌ Fallback копирование не удалось:', err2);
        }
        
        document.body.removeChild(textArea);
    }
}

// Загружаем конфигурацию при старте
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        window.CONFIG = await response.json();
        console.log('✅ Конфигурация загружена:', window.CONFIG);
        return window.CONFIG;
    } catch (err) {
        console.error('❌ Ошибка загрузки конфигурации:', err);
        return window.CONFIG;
    }
}

// Функции для работы с авторизацией
function loginWithDiscord() {
    window.location.href = '/auth/discord';
}

async function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        // Очищаем localStorage перед редиректом
        localStorage.removeItem('afkBotUserId');
        console.log('🗑️ localStorage очищен при выходе');
        window.location.href = '/logout';
    }
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С localStorage =====
function loadSavedUserId() {
    const savedUserId = localStorage.getItem('afkBotUserId');
    if (savedUserId) {
        console.log('💾 Загружаю сохраненный userId:', savedUserId);
        return savedUserId;
    }
    return null;
}

function clearSavedUserId() {
    localStorage.removeItem('afkBotUserId');
    console.log('🗑️ Сохраненный userId очищен');
    document.getElementById('userIdInput').value = '';
    location.reload();
}

async function checkAuthStatus() {
    try {
        const response = await fetch('/api/session');
        const data = await response.json();
        if (data.userId) {
            window.currentUserId = data.userId;
            localStorage.setItem('afkBotUserId', data.userId);
            setTimeout(() => loadUserDataAuto(data.userId), 100);
            return true;
        } else {
            document.getElementById('userInfoDisplay').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'none';
            document.getElementById('userIdInput').style.display = 'block';
            return false;
        }
    } catch (error) {
        console.log('Ошибка при проверке авторизации:', error);
        return false;
    }
}

async function loadUserDataAuto(userId) {
    console.log('🔵 loadUserDataAuto вызвана с userId:', userId);
    window.currentUserId = userId;
    localStorage.setItem('afkBotUserId', userId);
    document.getElementById('loading').style.display = 'block';
    document.getElementById('userContent').style.display = 'none';
    document.getElementById('userIdDisplay').style.display = 'none';
    document.getElementById('userIdInput').value = userId;
    
    try {
        const response = await fetch(`/api/stats/${userId}`);
        console.log('📡 Response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('✅ Данные получены:', data);
        
        const username = data.stats.username || 'Пользователь';
        setUserDisplay(username, userId);
        
        try {
            await fetch(`/api/visit/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            data.stats.web_visits = (data.stats.web_visits || 0) + 1;
        } catch (error) {
            console.log('Не удалось отправить данные о посещении');
        }
        
        displayUserStats(data.stats);
        displayUserAchievements(data.achievements);
        displayUserSettings(data.settings);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('userContent').style.display = 'block';
        document.getElementById('userIdDisplay').style.display = 'block';
        
        // Скрываем поле ввода ID и кнопку загрузки когда пользователь залогинен
        document.getElementById('manualInputSection').style.display = 'none';
        
        document.getElementById('clearBtn').style.display = 'block';
        
        if (window.currentUserId === window.CONFIG.ADMIN_USER_ID) {
            document.getElementById('adminPanel').style.display = 'block';
            document.querySelectorAll('.admin-option').forEach(option => {
                option.style.display = 'block';
            });
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('loading').textContent = '❌ Ошибка загрузки данных. Проверьте ID.';
    }
}

function deleteUserFromDB(userId, username) {
    event.stopPropagation();
    const confirmed = confirm('⚠️ Вы уверены что хотите полностью удалить пользователя "' + username + '" из базы данных?' + String.fromCharCode(10) + String.fromCharCode(10) + 'Это действие необратимо и удалит:' + String.fromCharCode(10) + '- Все статистики' + String.fromCharCode(10) + '- Все достижения' + String.fromCharCode(10) + '- Все сессии' + String.fromCharCode(10) + '- Все настройки');
    
    if (!confirmed) {
        return;
    }
    
    fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('✅ Пользователь "' + username + '" полностью удален из БД!');
            loadLeaderboard();
        } else {
            alert('❌ Ошибка: ' + (data.message || 'Не удалось удалить пользователя'));
        }
    })
    .catch(error => {
        console.error('Ошибка при удалении пользователя:', error);
        alert('❌ Ошибка при удалении пользователя');
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
    
    if (tabName === 'leaderboard') {
        loadLeaderboard();
    }
}

async function loadUserData(skipSecurityCheck = false) {
    let userId = document.getElementById('userIdInput').value.trim();
    if (!userId) return;
    
    if (userId === window.CONFIG.ADMIN_LOGIN) {
        userId = window.CONFIG.ADMIN_USER_ID;
        console.log('✅ Админ вошел по логину, используем ADMIN_USER_ID');
    } else if (userId === window.CONFIG.ADMIN_USER_ID && !skipSecurityCheck) {
        alert('❌ Это же не твой ID, зайка, куда ты собрался?');
        
        fetch('/api/unauthorized-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                attemptedId: window.CONFIG.ADMIN_USER_ID,
                timestamp: new Date().toLocaleString('ru-RU')
            })
        }).catch(err => console.log('Ошибка отправки уведомления'));
        
        return;
    }
    
    window.currentUserId = userId;
    localStorage.setItem('afkBotUserId', userId);
    document.getElementById('loading').style.display = 'block';
    document.getElementById('userContent').style.display = 'none';
    document.getElementById('userIdDisplay').style.display = 'none';
    
    try {
        const response = await fetch(`/api/stats/${userId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Полученные данные:', data);

        try {
            await fetch(`/api/visit/${userId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            data.stats.web_visits = (data.stats.web_visits || 0) + 1;
        } catch (error) {
            console.log('Не удалось отправить данные о посещении');
        }
        
        console.log('Вызываю displayUserStats...');
        displayUserStats(data.stats);
        console.log('Вызываю displayUserAchievements...');
        console.log('data.achievements перед вызовом:', data.achievements);
        displayUserAchievements(data.achievements);
        console.log('Вызываю displayUserSettings...');
        displayUserSettings(data.settings);
        
        const username = data.stats.username || 'Пользователь';
        setUserDisplay(username, userId);
        document.getElementById('userIdDisplay').style.display = 'block';
        
        // Скрываем поле ввода ID и кнопку загрузки когда пользователь залогинен
        document.getElementById('manualInputSection').style.display = 'none';
        
        document.getElementById('clearBtn').style.display = 'block';
        
        if (userId === window.CONFIG.ADMIN_USER_ID) {
            document.getElementById('adminPanel').style.display = 'block';
            
            document.querySelectorAll('.admin-option').forEach(option => {
                option.style.display = 'block';
            });
        } else {
            document.getElementById('adminPanel').style.display = 'none';
        }
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('userContent').style.display = 'block';
    } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
        document.getElementById('loading').innerHTML = '<div class="error">Ошибка загрузки данных</div>';
        document.getElementById('userIdDisplay').style.display = 'none';
    }
}

// Продолжение в следующем файле из-за ограничения размера

function displayUserStats(stats) {
    const statsGrid = document.getElementById('statsGrid');
    const voiceHours = Math.floor((stats.total_voice_time || 0) / 3600);
    const voiceMinutes = Math.floor(((stats.total_voice_time || 0) % 3600) / 60);
    const afkHours = Math.floor((stats.total_afk_time || 0) / 3600);
    const afkMinutes = Math.floor(((stats.total_afk_time || 0) % 3600) / 60);
    const streamHours = Math.floor((stats.stream_channel_time || 0) / 3600);
    const streamMinutes = Math.floor(((stats.stream_channel_time || 0) % 3600) / 60);
    
    let longestSessionDate = '';
    if (stats.longest_session_date) {
        const date = new Date(stats.longest_session_date);
        longestSessionDate = '<br><span style="font-size:0.4em;">' + date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) + '</span>';
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
    document.getElementById('dmNotifications').value = settings.dmNotifications.toString();
    document.getElementById('afkTimeout').value = settings.afkTimeout.toString();
    document.getElementById('achievementNotifications').value = settings.achievementNotifications.toString();
    
    // Загружаем тему
    const theme = settings.theme || 'standard';
    document.getElementById('themeSelect').value = theme;
    applyTheme(theme);
}

// Функция для применения темы
function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
}

// Функция для предпросмотра темы (без сохранения)
function previewTheme(theme) {
    applyTheme(theme);
}

async function saveSettings() {
    if (!window.currentUserId) return;
    
    const dmNotifications = document.getElementById('dmNotifications').value === 'true';
    const afkTimeout = parseInt(document.getElementById('afkTimeout').value);
    const achievementNotifications = document.getElementById('achievementNotifications').value === 'true';
    const theme = document.getElementById('themeSelect').value;
    
    try {
        const response = await fetch(`/api/settings/${window.currentUserId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                dmNotifications,
                afkTimeout,
                achievementNotifications,
                theme
            })
        });
        
        if (!response.ok) {
            alert('Ошибка сохранения настроек');
        }
    } catch (error) {
        alert('Ошибка сохранения настроек');
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🟢 DOMContentLoaded сработал');
    
    // Сначала загружаем конфигурацию
    await loadConfig();
    
    document.getElementById('userInfoDisplay').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('userIdInput').style.display = 'block';
    
    const urlParams = new URLSearchParams(window.location.search);
    const autoLogin = urlParams.get('autoLogin');
    const userIdParam = urlParams.get('userId');
    
    console.log('📋 URL params - autoLogin:', autoLogin, 'userId:', userIdParam);
    
    if (autoLogin && userIdParam) {
        console.log('🔑 Запуск autoLogin с userId:', userIdParam);
        loadUserDataAuto(userIdParam);
    } else {
        const authOk = await checkAuthStatus();
        
        if (!authOk) {
            // Показываем поле ввода ID если пользователь не залогинен
            document.getElementById('manualInputSection').style.display = 'flex';
            
            const savedUserId = loadSavedUserId();
            if (savedUserId) {
                console.log('📱 Автоматически загружаю сохраненного пользователя:', savedUserId);
                setTimeout(() => loadUserDataAuto(savedUserId), 500);
            }
        }
    }
    
    loadLeaderboard();
});

// Функция для создания бэкапа базы данных
async function backupDatabase() {
    try {
        const response = await fetch('/api/admin/backup-database', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Бэкап базы данных создан успешно!');
            console.log('📂 Файл:', data.filename);
            alert('✅ Бэкап создан успешно!\n📂 Файл: ' + data.filename);
        } else {
            const error = await response.json();
            alert('Ошибка при создании бэкапа: ' + error.error);
        }
    } catch (error) {
        console.error('Ошибка при создании бэкапа:', error);
        alert('Ошибка при создании бэкапа базы данных');
    }
}
