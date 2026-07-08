import { SteamWallWorker } from './worker.js';
import { log, error as logError, success } from '../utils/logger.js';

/**
 * Менеджер Steam Wall ботов — управляет экземплярами для всех пользователей
 */
export class SteamWallManager {
  constructor(db) {
    this.db = db;
    this.workers = new Map();
  }

  /**
   * Запустить бота для пользователя
   */
  startWorker(discordId) {
    if (this.workers.has(discordId)) {
      log(`[SW Manager] Бот для ${discordId} уже запущен`);
      return;
    }

    const refreshToken = this.db.getRefreshToken(discordId);
    if (!refreshToken) {
      logError(`[SW Manager] Нет refresh token для ${discordId}`);
      return;
    }

    const settings = this.db.getSettings(discordId);
    const worker = new SteamWallWorker(discordId, this.db, {
      pollIntervalMs: settings?.pollIntervalMs || 60000,
    });

    this.workers.set(discordId, worker);
    worker.start(refreshToken);
    this.db.setUserActive(discordId, true);

    log(`[SW Manager] Бот запущен для ${discordId}`);
  }

  /**
   * Остановить бота для пользователя
   */
  stopWorker(discordId) {
    const worker = this.workers.get(discordId);
    if (!worker) return;

    worker.stop();
    this.workers.delete(discordId);
    // is_active НЕ сбрасываем — бот должен перезапуститься при старте сервера

    log(`[SW Manager] Бот остановлен для ${discordId}`);
  }

  /**
   * Перезапустить бота
   */
  restartWorker(discordId) {
    this.stopWorker(discordId);
    this.startWorker(discordId);
  }

  /**
   * Запустить всех активных ботов (при старте приложения)
   */
  startAll() {
    log(`[SW Manager] startAll() вызван`);
    const activeUsers = this.db.getActiveUsers();
    log(`[SW Manager] Запуск ${activeUsers.length} активных ботов...`);

    for (const user of activeUsers) {
      try {
        this.startWorker(user.discord_id);
      } catch (err) {
        logError(`[SW Manager] Ошибка запуска бота для ${user.discord_id}: ${err.message}`);
      }
    }

    success(`[SW Manager] Запущено ${this.workers.size} ботов`);
  }

  /**
   * Остановить все боты (при выключении)
   */
  stopAll() {
    log(`[SW Manager] Остановка всех ботов (${this.workers.size})...`);
    for (const [discordId] of this.workers) {
      this.stopWorker(discordId);
    }
    success('[SW Manager] Все боты остановлены');
  }

  /**
   * Получить статус бота
   */
  getWorkerStatus(discordId) {
    const worker = this.workers.get(discordId);
    if (!worker) return null;
    return worker.getStatus();
  }

  /**
   * Получить статус всех ботов
   */
  getAllStatus() {
    const statuses = [];
    for (const [discordId, worker] of this.workers) {
      statuses.push(worker.getStatus());
    }
    return statuses;
  }

  /**
   * Проверить запущен ли бот
   */
  isRunning(discordId) {
    const worker = this.workers.get(discordId);
    return worker ? worker.running : false;
  }
}
