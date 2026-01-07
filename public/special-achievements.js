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
            alert('Специальное достижение создано!');
            closeCreateSpecialAchievementModal();
            document.getElementById('createSpecialAchievementForm').reset();
            updateSpecialAchievementPreview();
        } else {
            const error = await response.json();
            alert('Ошибка: ' + error.error);
        }
    } catch (error) {
        console.error('Ошибка при создании достижения:', error);
        alert('Ошибка при создании достижения');
    }
}
