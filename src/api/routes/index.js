import { createStatsRouter } from './stats.js';
import { createSettingsRouter } from './settings.js';
import { createTelegramRouter } from './telegram.js';
import { createAdminRouter } from './admin.js';
import { createAchievementsRouter } from './achievements.js';
import { createCheaterCheckerRouter } from './cheater-checker.js';
import { createBugReportsRouter } from './bug-reports.js';
import { createBlocklistRouter } from './blocklist.js';
import { success } from '../../utils/logger.js';
import { USER_IDS, DISCORD_CONFIG, SERVER_CONFIG } from '../../config.js';

/**
 * Зарегистрировать все API роуты
 */
export function registerRoutes(app, db, discordClient, achievements, telegram, notificationService) {
  // Config роут - для загрузки конфигурации на фронтенде
  app.get('/api/config', (req, res) => {
    res.json({
      ADMIN_USER_ID: USER_IDS.ADMIN_USER_ID,
      ADMIN_LOGIN: process.env.ADMIN_LOGIN || 'admin',
      SERVER_IP: SERVER_CONFIG.SERVER_IP || 'localhost',
      PORT: SERVER_CONFIG.PORT,
      TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || ''
    });
  });

  // Session роут - проверка текущей сессии
  app.get('/api/session', (req, res) => {
    const userId = req.query.userId || req.session?.userId;
    if (userId) {
      res.json({ userId });
    } else {
      res.json({ userId: null });
    }
  });

  // Stats роуты
  const statsRouter = createStatsRouter(db, discordClient, telegram);
  app.use('/api/stats', statsRouter);
  
  // Дополнительные stats endpoints
  app.get('/api/leaderboard', (req, res) => {
    try {
      const topUsers = db.getTopUsers(20);
      res.json(topUsers);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  app.get('/api/online-status', (req, res) => {
    try {
      const guild = discordClient.guilds.cache.first();
      if (!guild) {
        return res.json({});
      }

      const onlineStatuses = {};
      guild.members.cache.forEach((member) => {
        if (member.presence?.status && member.presence.status !== 'offline') {
          onlineStatuses[member.id] = member.presence.status;
        }
      });

      res.json(onlineStatuses);
    } catch (error) {
      res.json({});
    }
  });

  // Список участников Discord-сервера (без ботов) — с кешированием
  let guildMembersCache = null;
  let guildMembersCacheTime = 0;
  const GUILD_MEMBERS_CACHE_TTL = 5 * 60 * 1000; // 5 минут

  app.get('/api/guild-members', async (req, res) => {
    try {
      const guild = discordClient.guilds.cache.first();
      if (!guild) {
        return res.json([]);
      }

      // Проверяем кеш
      const now = Date.now();
      if (guildMembersCache && (now - guildMembersCacheTime) < GUILD_MEMBERS_CACHE_TTL) {
        return res.json(guildMembersCache);
      }

      // Загружаем всех участников (это вызывает один большой fetch, попадает в rate limit Discord)
      // Используем cache как fallback если fetch не сработал
      let allMembers;
      try {
        allMembers = await guild.members.fetch({ time: 30000 });
      } catch (fetchErr) {
        console.error('Ошибка fetch участников, используем cache:', fetchErr.message);
        allMembers = guild.members.cache;
      }

      const members = [];
      allMembers.forEach((member) => {
        if (member.user.bot) return;
        members.push({
          user_id: member.id,
          username: member.displayName || member.user.username
        });
      });

      members.sort((a, b) => a.username.localeCompare(b.username));
      
      // Сохраняем в кеш
      guildMembersCache = members;
      guildMembersCacheTime = now;
      
      res.json(members);
    } catch (error) {
      console.error('Ошибка /api/guild-members:', error.message);
      res.json([]);
    }
  });
  
  app.post('/api/visit/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      
      db.initUserStats(userId, 'Web User');
      db.incrementUserStat(userId, 'web_visits');

      const stats = db.getUserStats(userId);
      if (stats && stats.web_visits === 1) {
        const guild = discordClient.guilds.cache.first();
        if (guild) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            const username = member.displayName || member.user.username;
            await achievements.checkAndUnlock(userId, username, 'first_web_visit');
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Blocklist роуты (ВАЖНО: должны быть ДО settingsRouter)
  const blocklistRouter = createBlocklistRouter(db, telegram);
  app.use('/api/blocklist', blocklistRouter);

  // Bug Reports роуты (ВАЖНО: должны быть ДО settingsRouter чтобы /api/bug-report не перехватывался)
  const bugReportsRouter = createBugReportsRouter(db, telegram);
  app.use('/api', bugReportsRouter);

  // Settings роуты
  const settingsRouter = createSettingsRouter(db, discordClient, achievements, telegram, notificationService);
  app.use('/api/settings', settingsRouter);
  app.use('/api', settingsRouter); // Для /api/activate-secret-theme

  // Telegram роуты
  const telegramRouter = createTelegramRouter(db, telegram);
  app.post('/api/register-telegram/:userId', async (req, res) => {
    const userId = req.params.userId;
    const { telegramChatId } = req.body;

    try {
      if (!telegramChatId) {
        return res.status(400).json({ error: 'Telegram chat ID is required' });
      }

      if (telegram && telegram.registerUser) {
        const success = telegram.registerUser(userId, telegramChatId);
        
        if (success) {
          res.json({
            success: true,
            message: 'Telegram chat ID registered successfully',
          });
        } else {
          res.status(500).json({ error: 'Failed to register Telegram chat ID' });
        }
      } else {
        res.status(503).json({ error: 'Telegram service not available' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  app.use('/api/telegram-link', telegramRouter);

  // Admin роуты
  const adminRouter = createAdminRouter(db, discordClient, telegram, notificationService);
  app.use('/api/admin', adminRouter);

  // Cheater Checker роуты
  const cheaterCheckerRouter = createCheaterCheckerRouter(db, discordClient, telegram);
  app.use('/api/cheater-checker', cheaterCheckerRouter);

  // Achievements роуты
  const achievementsRouter = createAchievementsRouter(db, telegram);
  app.use('/api/achievements', achievementsRouter);
  app.use('/api', achievementsRouter);

  // Logout роут
  app.get('/logout', (req, res) => {
    // Очищаем сессию если она есть
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Ошибка при очистке сессии:', err);
        }
      });
    }
    // Очищаем куки
    res.clearCookie('connect.sid');
    // Редирект на главную
    res.redirect('/');
  });

  success('API роуты зарегистрированы');
}
