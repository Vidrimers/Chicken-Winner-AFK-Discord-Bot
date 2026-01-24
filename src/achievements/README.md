# Модуль достижений

Модуль для управления системой достижений в AFK Discord Bot.

## Структура

```
src/achievements/
├── index.js           # Основной класс AchievementSystem
├── definitions.js     # Определения всех достижений
├── notifications.js   # Сервис уведомлений
├── checker.js         # Специальная логика проверки
└── README.md          # Документация
```

## Использование

### Инициализация

```javascript
import { DatabaseManager } from '../database/index.js';
import { AchievementSystem } from './index.js';
import { AchievementNotificationService } from './notifications.js';
import { AchievementChecker } from './checker.js';

// Создаем зависимости
const db = new DatabaseManager();
const notificationService = new AchievementNotificationService(
  discordClient,
  telegramService,
  db
);

// Создаем систему достижений
const achievements = new AchievementSystem(db, notificationService);

// Создаем чекер для специальной логики
const checker = new AchievementChecker(db, achievements);
```

### Проверка достижений

```javascript
// Проверить одно достижение
await achievements.checkAndUnlock(userId, username, 'voice_starter');

// Проверить все достижения пользователя
await achievements.checkAll(userId, username);
```

### Специальные достижения

```javascript
// Проверить "Неделя без AFK" (запускать каждый день в 00:00)
await checker.checkNoAfkWeek();

// Выдать "Лучший админ" (вручную)
await checker.grantBestAdmin(userId, username);

// Проверить праздничные достижения
await checker.checkSpecialAchievements(userId, username);
```

## Определения достижений

Все достижения определены в `definitions.js`:

```javascript
export const ACHIEVEMENTS = {
  voice_starter: {
    name: '🎤 Начинающий болтун',
    description: 'Провел 50 часов в голосовых каналах',
    points: 100,
    condition: (stats) => stats.total_voice_time >= 180000
  },
  // ...
};
```

### Структура достижения

- `name` - Название с эмодзи
- `description` - Описание
- `points` - Очки рейтинга
- `condition` - Функция проверки (принимает stats, возвращает boolean)

## Уведомления

Система автоматически отправляет уведомления в:
1. Discord ЛС (если включены в настройках)
2. Telegram (если привязан)
3. Канал Discord (всегда)

## API

### AchievementSystem

#### `checkAndUnlock(userId, username, achievementId)`
Проверяет и разблокирует достижение.

**Параметры:**
- `userId` - ID пользователя Discord
- `username` - Имя пользователя
- `achievementId` - ID достижения из definitions.js

**Возвращает:** `Promise<boolean>` - true если разблокировано

#### `checkAll(userId, username)`
Проверяет все достижения пользователя.

**Параметры:**
- `userId` - ID пользователя Discord
- `username` - Имя пользователя

**Возвращает:** `Promise<void>`

### AchievementChecker

#### `checkNoAfkWeek()`
Проверяет достижение "Неделя без AFK" для всех пользователей.

**Возвращает:** `Promise<void>`

#### `grantBestAdmin(userId, username)`
Выдает достижение "Лучший админ".

**Параметры:**
- `userId` - ID пользователя Discord
- `username` - Имя пользователя

**Возвращает:** `Promise<void>`

#### `checkSpecialAchievements(userId, username)`
Проверяет праздничные достижения.

**Параметры:**
- `userId` - ID пользователя Discord
- `username` - Имя пользователя

**Возвращает:** `Promise<void>`

## Примеры

### Проверка после голосовой активности

```javascript
// После обновления статистики
db.incrementUserStat(userId, 'total_voice_time', duration);

// Проверяем достижения
await achievements.checkAll(userId, username);
```

### Проверка после AFK

```javascript
// После перемещения в AFK
db.incrementUserStat(userId, 'total_afk_moves', 1);

// Проверяем достижения
await achievements.checkAll(userId, username);
```

### Ежедневная проверка

```javascript
// Запускать каждый день в 00:00 МСК
cron.schedule('0 0 * * *', async () => {
  await checker.checkNoAfkWeek();
}, {
  timezone: 'Europe/Moscow'
});
```

## Добавление нового достижения

1. Добавить в `definitions.js`:

```javascript
export const ACHIEVEMENTS = {
  // ...
  my_new_achievement: {
    name: '🎯 Мое достижение',
    description: 'Описание достижения',
    points: 50,
    condition: (stats) => stats.some_field >= 100
  }
};
```

2. Достижение автоматически будет проверяться при вызове `checkAll()`

## Заметки

- Достижения не дублируются (проверка через `hasAchievement`)
- Удаленные достижения (manually_deleted = 1) не восстанавливаются автоматически
- Специальные достижения (best_admin, no_afk_week) не проверяются в `checkAll()`
- Праздничные достижения проверяются по дате (день + месяц)
