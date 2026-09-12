import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import { error as logError, log, success } from '../utils/logger.js';

const POST_DELAY_MS = 20000; // 20 секунд между постами

/**
 * CheatWatcher — системный воркер для постинга комментариев на стенах читеров
 * Всегда работает, не привязан к пользователю, читает очередь из БД
 */
export class CheatWatcherWorker {
  constructor(db) {
    this.db = db;
    this.client = new SteamUser();
    this.community = new SteamCommunity();
    this.running = false;
    this.processing = false;
    this._bindEvents();
  }

  _bindEvents() {
    this.client.on('loggedOn', () => {
      success(`[CheatWatcher] Logged in, SteamID: ${this.client.steamID.getSteamID64()}`);
    });

    this.client.on('webSession', (sessionID, cookies) => {
      this.community.setCookies(cookies);
      success('[CheatWatcher] Web session established, queue processing started');
      this.running = true;
      this._processQueue();
    });

    this.client.on('error', (err) => {
      logError(`[CheatWatcher] Steam error: ${err.message}`);
      if (err.message.includes('InvalidCredentials') || err.message.includes('Expired')) {
        logError('[CheatWatcher] Token expired, needs re-login via admin panel');
        this.running = false;
      }
    });

    this.client.on('disconnected', (reason) => {
      log(`[CheatWatcher] Disconnected: ${reason}`);
    });
  }

  start(refreshToken) {
    if (!refreshToken) {
      log('[CheatWatcher] No refresh token, skipping startup');
      return;
    }
    log('[CheatWatcher] Starting...');
    this.client.logOn({ refreshToken });
  }

  stop() {
    this.running = false;
    this.processing = false;
    try {
      this.client.logOff();
    } catch {}
    log('[CheatWatcher] Stopped');
  }

  isConnected() {
    return this.running && this.client.steamID;
  }

  getSteamId() {
    return this.client.steamID ? this.client.steamID.getSteamID64() : null;
  }

  async _processQueue() {
    if (this.processing || !this.running) return;
    this.processing = true;

    try {
      const pending = this.db.getPendingCheatWatcherComments();

      if (pending.length === 0) {
        this.processing = false;
        // Проверяем очередь снова через 30 секунд
        setTimeout(() => this._processQueue(), 30000);
        return;
      }

      for (const item of pending) {
        if (!this.running) break;

        try {
          await this._postComment(item.steam_id, item.comment_text);
          this.db.markCheatWatcherCommentPosted(item.id);
          log(`[CheatWatcher] Posted comment on ${item.steam_id} (queue #${item.id})`);
        } catch (err) {
          const errMsg = err.message || String(err);
          logError(`[CheatWatcher] Failed to post on ${item.steam_id}: ${errMsg}`);
          this.db.markCheatWatcherCommentError(item.id, errMsg);

          // Если ошибка авторизации — останавливаемся
          if (errMsg.includes('not logged in') || errMsg.includes('login')) {
            this.running = false;
            break;
          }
        }

        // Задержка между постами
        if (pending.indexOf(item) < pending.length - 1) {
          await new Promise(r => setTimeout(r, POST_DELAY_MS));
        }
      }
    } catch (err) {
      logError(`[CheatWatcher] Queue processing error: ${err.message}`);
    }

    this.processing = false;

    // Продолжаем обработку если всё ещё работаем
    if (this.running) {
      setTimeout(() => this._processQueue(), 10000);
    }
  }

  _postComment(targetSteamId, message) {
    return new Promise((resolve, reject) => {
      if (!this.running || !this.client.steamID) {
        return reject(new Error('Not logged in'));
      }

      // Убираем https:// чтобы Steam spam filter не скрыл комментарий
      const sanitizedMessage = message.replace(/https:\/\//g, '');

      // Постим на СВОЮ стену (профиль TheCheatWatcher), не на стену читера
      this.community.postUserComment(
        this.client.steamID,
        sanitizedMessage,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }
}
