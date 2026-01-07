function openCreateSpecialAchievementModal() {
    document.getElementById('createSpecialAchievementModal').style.display = 'block';
    document.body.classList.add('modal-open');
    updateSpecialAchievementPreview();
}

function closeCreateSpecialAchievementModal() {
    document.getElementById('createSpecialAchievementModal').style.display = 'none';
    document.body.classList.remove('modal-open');
}

function updateSpecialAchievementPreview() {
    const emoji = document.getElementById('specialAchievementEmoji').value || '🏆';
    const name = document.getElementById('specialAchievementName').value || 'Название';
    const color = document.getElementById('specialAchievementColor').value || '#FFD700';
    
    const preview = document.getElementById('specialAchievementPreview');
    const bgGradient = 'linear-gradient(135deg, ' + color + '22, ' + color + '11)';
    const borderColor = color;
    
    preview.innerHTML = '<div class="achievement-preview" style="background: ' + bgGradient + '; border-left: 4px solid ' + borderColor + ';">' +
        '<div style="font-size: 32px;">' + emoji + '</div>' +
        '<div style="color: ' + color + '; font-weight: bold;">' + name + '</div>' +
        '</div>';
}

async function createSpecialAchievement() {
    const emoji = document.getElementById('specialAchievementEmoji').value;
    const name = document.getElementById('specialAchievementName').value;
    const description = document.getElementById('specialAchievementDescription').value;
    const targetUserId = document.getElementById('specialAchievementUserId').value;
    const date = document.getElementById('specialAchievementDate').value;
    const time = document.getElementById('specialAchievementTime').value;
    const color = document.getElementById('specialAchievementColor').value;
    
    if (!emoji || !name || !description || !targetUserId || !date || !time || !color) {
        alert('Заполни все обязательные поля!');
        return;
    }

    try {
        const response = await fetch('/api/admin/create-achievement', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                emoji,
                name,
                description,
                type: 'special',
                userId: targetUserId,
                specialDate: date + 'T' + time,
                color
            })
        });

        if (response.ok) {
            closeCreateSpecialAchievementModal();
            document.getElementById('createSpecialAchievementForm').reset();
            updateSpecialAchievementPreview();
            // Перезагружаем данные пользователя чтобы показать новое достижение
            loadUserDataAuto(window.currentUserId);
        } else {
            const error = await response.json();
            alert('Ошибка: ' + error.error);
        }
    } catch (error) {
        console.error('Ошибка при создании достижения:', error);
        alert('Ошибка при создании достижения');
    }
}


// Функции для редактирования специального достижения
function editSpecialAchievement(achievementId, event) {
    if (event) {
        event.stopPropagation();
    }
    
    console.log('🔧 Редактирование достижения:', achievementId);
    console.log('👤 Текущий пользователь:', window.currentUserId);
    
    // Заполняем форму редактирования
    document.getElementById('editAchievementId').value = achievementId;
    
    let emoji, name, description, color;
    
    if (achievementId === 'best_admin') {
        // Для best_admin сначала пробуем загрузить из данных пользователя
        fetch(`/api/stats/${window.currentUserId}`)
            .then(r => r.json())
            .then(data => {
                console.log('📦 Данные пользователя:', data);
                
                let achievement = data.achievements.find(a => a.achievement_id === achievementId);
                console.log('🔍 Найденное достижение:', achievement);
                
                // Для best_admin проверяем есть ли кастомные данные
                if (achievement && achievement.emoji) {
                    emoji = achievement.emoji;
                    name = achievement.name;
                    description = achievement.description;
                    color = achievement.color || '#ffd700';
                } else {
                    // Дефолтные значения
                    emoji = '👑';
                    name = 'Kakashech - Лучший админ';
                    description = 'Лучший admin_ebaniy канала';
                    color = '#ffd700';
                }
                
                // Заполняем форму
                document.getElementById('editSpecialAchievementEmoji').value = emoji;
                document.getElementById('editSpecialAchievementName').value = name;
                document.getElementById('editSpecialAchievementDescription').value = description;
                document.getElementById('editSpecialAchievementColor').value = color;
                
                updateEditSpecialAchievementPreview();
                document.getElementById('editSpecialAchievementModal').style.display = 'block';
                document.body.classList.add('modal-open');
            })
            .catch(error => {
                console.error('❌ Ошибка при загрузке достижения:', error);
                alert('Ошибка при загрузке достижения');
            });
    } else {
        // Для других специальных достижений загружаем из общего списка
        fetch('/api/special-achievements')
            .then(r => r.json())
            .then(allSpecial => {
                console.log('📦 Все специальные достижения:', allSpecial);
                
                let achievement = allSpecial.find(a => a.achievement_id === achievementId);
                console.log('🔍 Найденное достижение:', achievement);
                
                if (!achievement || !achievement.emoji) {
                    console.error('❌ Достижение не найдено');
                    alert('Достижение не найдено');
                    return;
                }
                
                // Заполняем форму
                document.getElementById('editSpecialAchievementEmoji').value = achievement.emoji;
                document.getElementById('editSpecialAchievementName').value = achievement.name;
                document.getElementById('editSpecialAchievementDescription').value = achievement.description;
                document.getElementById('editSpecialAchievementColor').value = achievement.color || '#a45eea';
                
                updateEditSpecialAchievementPreview();
                document.getElementById('editSpecialAchievementModal').style.display = 'block';
                document.body.classList.add('modal-open');
            })
            .catch(error => {
                console.error('❌ Ошибка при загрузке достижения:', error);
                alert('Ошибка при загрузке достижения');
            });
    }
}

function closeEditSpecialAchievementModal() {
    document.getElementById('editSpecialAchievementModal').style.display = 'none';
    document.body.classList.remove('modal-open');
}

function updateEditSpecialAchievementPreview() {
    const emoji = document.getElementById('editSpecialAchievementEmoji').value || '🏆';
    const name = document.getElementById('editSpecialAchievementName').value || 'Название';
    const color = document.getElementById('editSpecialAchievementColor').value || '#FFD700';
    
    const preview = document.getElementById('editSpecialAchievementPreview');
    const bgGradient = 'linear-gradient(135deg, ' + color + '22, ' + color + '11)';
    const borderColor = color;
    
    preview.innerHTML = '<div class="achievement-preview" style="background: ' + bgGradient + '; border-left: 4px solid ' + borderColor + ';">' +
        '<div style="font-size: 32px;">' + emoji + '</div>' +
        '<div style="color: ' + color + '; font-weight: bold;">' + name + '</div>' +
        '</div>';
}

async function saveEditSpecialAchievement() {
    const achievementId = document.getElementById('editAchievementId').value;
    const emoji = document.getElementById('editSpecialAchievementEmoji').value;
    const name = document.getElementById('editSpecialAchievementName').value;
    const description = document.getElementById('editSpecialAchievementDescription').value;
    const color = document.getElementById('editSpecialAchievementColor').value;
    
    if (!emoji || !name || !description || !color) {
        alert('Заполни все обязательные поля!');
        return;
    }

    try {
        const response = await fetch('/api/admin/edit-achievement', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                achievementId,
                emoji,
                name,
                description,
                color
            })
        });

        if (response.ok) {
            closeEditSpecialAchievementModal();
            // Перезагружаем данные пользователя (с пропуском проверки безопасности)
            loadUserDataAuto(window.currentUserId);
        } else {
            const error = await response.json();
            alert('Ошибка: ' + error.error);
        }
    } catch (error) {
        console.error('Ошибка при обновлении достижения:', error);
        alert('Ошибка при обновлении достижения');
    }
}

// Функция для редактирования достижений других пользователей
function editSpecialAchievementOther(achievementId, userId, event) {
    if (event) {
        event.stopPropagation();
    }
    
    console.log('🔧 Редактирование достижения другого пользователя:', achievementId);
    console.log('👤 ID пользователя:', userId);
    
    // Заполняем форму редактирования
    document.getElementById('editAchievementId').value = achievementId;
    
    // Получаем данные из общего списка специальных достижений
    fetch('/api/special-achievements')
        .then(r => r.json())
        .then(allSpecial => {
            console.log('📦 Все специальные достижения:', allSpecial);
            
            // Ищем достижение по ID
            let achievement = allSpecial.find(a => a.achievement_id === achievementId);
            console.log('🔍 Найденное достижение:', achievement);
            
            if (!achievement || !achievement.emoji) {
                console.error('❌ Достижение не найдено');
                alert('Достижение не найдено');
                return;
            }
            
            // Заполняем форму данными достижения
            document.getElementById('editSpecialAchievementEmoji').value = achievement.emoji;
            document.getElementById('editSpecialAchievementName').value = achievement.name;
            document.getElementById('editSpecialAchievementDescription').value = achievement.description;
            document.getElementById('editSpecialAchievementColor').value = achievement.color || '#a45eea';
            
            updateEditSpecialAchievementPreview();
            document.getElementById('editSpecialAchievementModal').style.display = 'block';
            document.body.classList.add('modal-open');
        })
        .catch(error => {
            console.error('❌ Ошибка при загрузке достижения:', error);
            alert('Ошибка при загрузке достижения');
        });
}
