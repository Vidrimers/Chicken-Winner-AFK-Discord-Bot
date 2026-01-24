import { createStatsRouter } from './stats.js';
import { createSettingsRouter } from './settings.js';
import { createTelegramRouter } from './telegram.js';
import { createAdminRouter } from './admin.js';
import { createAchievementsRouter } from './achievements.js';
import { success } from '../../utils/logger.js';

/**
 * Зарегистрировать все API роуты
 */
export function registerRoutes(app, db, discordClient, achievements, telegram) {
  // Stats роуты
  const statsRouter = createStatsRouter(db, discordClient, telegram);
  app.use('/api/stats', statsRouter);
  app.get('/api/leaderboard', (req, res) => {
    statsRouter.handle({ ...req, params: {}, url: '/leaderboard' }, res);
  });
  app.get('/api/online-status', (req, res) => {
    statsRouter.handle({ ...req, params: {}, url: '/online-status' }, res);
  });
  app.post('/api/visit/:userId', (req, res) => {
    statsRouter.handle({ ...req, url: '/visit/' + req.params.userId }, res);
  });

  // Settings роуты
  const settingsRouter = createSettingsRouter(db, discordClient, achievements, telegram);
  app.use('/api/settings', settingsRouter);
  app.post('/api/activate-secret-theme/:userId', (req, res) => {
    settingsRouter.handle({ ...req, url: '/activate-secret-theme/' + req.params.userId }, res);
  });

  // Telegram роуты
  const telegramRouter = createTelegramRouter(db, telegram);
  app.post('/api/register-telegram/:userId', (req, res) => {
    telegramRouter.handle({ ...req, url: '/register-telegram/' + req.params.userId }, res);
  });
  app.post('/api/telegram-link/generate/:userId', (req, res) => {
    telegramRouter.handle({ ...req, url: '/telegram-link/generate/' + req.params.userId }, res);
  });
  app.get('/api/telegram-link/status/:userId', (req, res) => {
    telegramRouter.handle({ ...req, url: '/telegram-link/status/' + req.params.userId }, res);
  });
  app.delete('/api/telegram-link/unlink/:userId', (req, res) => {
    telegramRouter.handle({ ...req, url: '/telegram-link/unlink/' + req.params.userId }, res);
  });

  // Admin роуты
  const adminRouter = createAdminRouter(db, discordClient, telegram);
  app.use('/api/admin', adminRouter);

  // Achievements роуты
  const achievementsRouter = createAchievementsRouter(db);
  app.get('/api/achievements', (req, res) => {
    achievementsRouter.handle({ ...req, params: {}, url: '/' }, res);
  });
  app.get('/api/special-achievements', (req, res) => {
    achievementsRouter.handle({ ...req, params: {}, url: '/special' }, res);
  });
  app.post('/api/notify/profile-view', (req, res) => {
    achievementsRouter.handle({ ...req, params: {}, url: '/notify/profile-view' }, res);
  });

  success('API роуты зарегистрированы');
}
