/**
 * Определения всех достижений
 */

export const ACHIEVEMENTS = {
  // Первые достижения
  first_join: {
    id: 'first_join',
    name: '🎤 Малыш заговорил',
    description: 'Присоединился к голосовому каналу впервые',
    points: 10,
    condition: (stats) => stats.total_sessions >= 1,
  },
  first_afk: {
    id: 'first_afk',
    name: '😴 Первый сон',
    description: 'Был перемещен в AFK впервые',
    points: 5,
    condition: (stats) => stats.total_afk_moves >= 1,
  },
  first_message: {
    id: 'first_message',
    name: '💬 Первые буквы',
    description: 'Отправил первое сообщение в текстовом канале',
    points: 10,
    condition: (stats) => stats.messages_sent >= 1,
  },
  first_settings: {
    id: 'first_settings',
    name: '⚙️ Первые настройки',
    description: 'Изменил настройки бота впервые',
    points: 10,
    condition: (stats) => stats.settings_changes >= 1,
  },
  first_web_visit: {
    id: 'first_web_visit',
    name: '🌐 Первый серфер',
    description: 'Посетил веб-панель бота впервые',
    points: 15,
    condition: (stats) => stats.web_visits >= 1,
  },
  first_stream: {
    id: 'first_stream',
    name: '📡 Первый стример',
    description: 'Включил трансляцию впервые',
    points: 20,
    condition: (stats) => stats.total_streams >= 1,
  },

  // Голосовые каналы
  voice_starter: {
    id: 'voice_starter',
    name: '🎧 Алло, это я',
    description: 'Провел 50+ часов в голосовых каналах',
    points: 50,
    condition: (stats) => stats.total_voice_time >= 50 * 3600,
  },
  voice_addict: {
    id: 'voice_addict',
    name: '🎧 Заболтал до сотки',
    description: 'Провел 100+ часов в голосовых каналах',
    points: 100,
    condition: (stats) => stats.total_voice_time >= 100 * 3600,
  },

  voice_god: {
    id: 'voice_god',
    name: '🎧 Звезда эфира',
    description: 'Провел 1000+ часов в голосовых каналах',
    points: 1000,
    condition: (stats) => stats.total_voice_time >= 1000 * 3600,
  },

  // Сообщения
  chatty_beginner: {
    id: 'chatty_beginner',
    name: '💬 Разговорчивый новичок',
    description: 'Отправил 200+ сообщений в текстовых каналах',
    points: 25,
    condition: (stats) => stats.messages_sent >= 200,
  },
  chatty_user: {
    id: 'chatty_user',
    name: '💬 Болтун',
    description: 'Отправил 500+ сообщений в текстовых каналах',
    points: 75,
    condition: (stats) => stats.messages_sent >= 500,
  },
  flooter: {
    id: 'flooter',
    name: '💬 Флудер',
    description: 'Отправил 750+ сообщений в текстовых каналах',
    points: 100,
    condition: (stats) => stats.messages_sent >= 750,
  },
  linguist: {
    id: 'linguist',
    name: '💬 Лингвист',
    description: 'Отправил 1000+ сообщений в текстовых каналах',
    points: 150,
    condition: (stats) => stats.messages_sent >= 1000,
  },

  // Сессии
  session_beginner: {
    id: 'session_beginner',
    name: '🎯 Начинающий участник',
    description: 'Участвовал в 10+ голосовых сессиях',
    points: 15,
    condition: (stats) => stats.total_sessions >= 10,
  },
  session_veteran: {
    id: 'session_veteran',
    name: '🎯 Опытный участник',
    description: 'Участвовал в 50+ голосовых сессиях',
    points: 40,
    condition: (stats) => stats.total_sessions >= 50,
  },
  session_master: {
    id: 'session_master',
    name: '🎯 Мастер сессий',
    description: 'Участвовал в 100+ голосовых сессиях',
    points: 75,
    condition: (stats) => stats.total_sessions >= 100,
  },
  frequent_guest: {
    id: 'frequent_guest',
    name: '🎯 Частый гость',
    description: 'Участвовал в 200+ голосовых сессиях',
    points: 150,
    condition: (stats) => stats.total_sessions >= 200,
  },
  permanent_resident: {
    id: 'permanent_resident',
    name: '🎯 Постоянный житель',
    description: 'Участвовал в 500+ голосовых сессиях',
    points: 350,
    condition: (stats) => stats.total_sessions >= 500,
  },
  session_lord: {
    id: 'session_lord',
    name: '🎯 Властелин сессий',
    description: 'Участвовал в 1000+ голосовых сессиях',
    points: 1000,
    condition: (stats) => stats.total_sessions >= 1000,
  },

  // AFK
  afk_beginner: {
    id: 'afk_beginner',
    name: '😴 AFK новичок',
    description: 'Перемещен в AFK 10 раз',
    points: 10,
    condition: (stats) => stats.total_afk_moves >= 10,
  },
  afk_veteran: {
    id: 'afk_veteran',
    name: '😴 AFK ветеран',
    description: 'Перемещен в AFK 50 раз',
    points: 50,
    condition: (stats) => stats.total_afk_moves >= 50,
  },
  afk_master: {
    id: 'afk_master',
    name: '😴 AFK Специалист',
    description: 'Перемещен в AFK 100 раз',
    points: 100,
    condition: (stats) => stats.total_afk_moves >= 100,
  },
  afk_time_lord: {
    id: 'afk_time_lord',
    name: '😴 AFK Повелитель времени',
    description: 'Провел 1000+ часов в AFK канале',
    points: 1000,
    condition: (stats) => stats.total_afk_time >= 1000 * 3600,
  },
  no_afk_week: {
    id: 'no_afk_week',
    name: '💪 Железная воля',
    description: 'Неделя без перемещений в AFK',
    points: 50,
    condition: (stats) => false, // Специальная логика
  },

  // Другие
  mute_master: {
    id: 'mute_master',
    name: '🎙️ Мастер тишины',
    description: 'Переключил микрофон 100 раз',
    points: 25,
    condition: (stats) => stats.total_mute_toggles >= 100,
  },
  long_session: {
    id: 'long_session',
    name: '⏰ Марафонец',
    description: 'Провел 12+ часов в одной сессии',
    points: 75,
    condition: (stats) => stats.longest_session >= 12 * 3600,
  },
  settings_explorer: {
    id: 'settings_explorer',
    name: '⚙️ Исследователь настроек',
    description: 'Изменил настройки бота 20 раз',
    points: 30,
    condition: (stats) => stats.settings_changes >= 20,
  },
  mention_responder: {
    id: 'mention_responder',
    name: '📢 Отзывчивый',
    description: 'Ответил на 1000+ упоминаний',
    points: 100,
    condition: (stats) => stats.mentions_responded >= 1000,
  },

  // Стримы
  stream_viewer_1: {
    id: 'stream_viewer_1',
    name: '📺 Одним глазком',
    description: 'Провел 5+ часов в канале Че смотрим?',
    points: 10,
    condition: (stats) => stats.stream_channel_time >= 5 * 3600,
  },
  stream_viewer_2: {
    id: 'stream_viewer_2',
    name: '📺 Зритель со стажем',
    description: 'Провел 50+ часов в канале Че смотрим?',
    points: 50,
    condition: (stats) => stats.stream_channel_time >= 50 * 3600,
  },
  stream_viewer_3: {
    id: 'stream_viewer_3',
    name: '📺 Топовый зритель',
    description: 'Провел 100+ часов в канале Че смотрим?',
    points: 100,
    condition: (stats) => stats.stream_channel_time >= 100 * 3600,
  },
  stream_viewer_4: {
    id: 'stream_viewer_4',
    name: '📺 Киберфанат',
    description: 'Провел 200+ часов в канале Че смотрим?',
    points: 200,
    condition: (stats) => stats.stream_channel_time >= 200 * 3600,
  },
  stream_viewer_5: {
    id: 'stream_viewer_5',
    name: '📺 Бессмертный зритель',
    description: 'Провел 500+ часов в канале Че смотрим?',
    points: 500,
    condition: (stats) => stats.stream_channel_time >= 500 * 3600,
  },
  stream_viewer_6: {
    id: 'stream_viewer_6',
    name: '📺 Легенда трансляций',
    description: 'Провел 1000+ часов в канале Че смотрим?',
    points: 1000,
    condition: (stats) => stats.stream_channel_time >= 1000 * 3600,
  },

  // Специальные
  best_admin: {
    id: 'best_admin',
    name: '👑 Kakashech - Лучший админ',
    description: 'Лучший admin_ebaniy канала',
    points: 0,
    condition: (stats) => false, // Выдается вручную
  },
};
