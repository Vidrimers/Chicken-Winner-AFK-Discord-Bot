import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import { error as logError, log, success } from '../utils/logger.js';

/**
 * Воркер — логика одного Steam Wall бота для конкретного пользователя
 */
export class SteamWallWorker {
  constructor(discordId, db, options = {}) {
    this.discordId = discordId;
    this.db = db;
    this.client = new SteamUser();
    this.community = new SteamCommunity();
    this.pollInterval = options.pollIntervalMs || 60000;
    this.pollTimer = null;
    this.running = false;
    this.lastCommentId = null;
    this.lastReplyByUser = {};
    this.timeouts = [];

    this._bindEvents();
  }

  _bindEvents() {
    this.client.on('loggedOn', () => {
      log(`[SW:${this.discordId}] Успешный вход, SteamID: ${this.client.steamID.getSteamID64()}`);
    });

    this.client.on('webSession', (sessionID, cookies) => {
      this.community.setCookies(cookies);
      log(`[SW:${this.discordId}] Веб-сессия установлена, запускаю опрос стены...`);
      this._startPolling();
    });

    this.client.on('error', (err) => {
      logError(`[SW:${this.discordId}] Ошибка Steam: ${err.message}`);
      if (err.message.includes('InvalidCredentials') || err.message.includes('Expired')) {
        this.db.setUserActive(this.discordId, false);
        log(`[SW:${this.discordId}] Токен истёк, бот деактивирован`);
        this.stop();
      }
    });

    this.client.on('disconnected', (reason) => {
      log(`[SW:${this.discordId}] Отключён: ${reason}`);
    });
  }

  start(refreshToken) {
    if (this.running) return;
    this.running = true;
    this.client.logOn({ refreshToken });
  }

  stop() {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.timeouts.forEach(t => clearTimeout(t));
    this.timeouts = [];
    try {
      this.client.logOff();
    } catch {}
  }

  _startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this._checkWall();
    this.pollTimer = setInterval(() => this._checkWall(), this.pollInterval);
  }

  _checkWall() {
    if (!this.running) return;

    this.community.getUserComments(this.client.steamID, { count: 15 }, (err, comments) => {
      if (err) {
        logError(`[SW:${this.discordId}] Ошибка получения комментариев: ${err.message}`);
        return;
      }
      if (!comments || comments.length === 0) return;

      const newest = comments[0];

      if (this.lastCommentId === null) {
        this.lastCommentId = newest.id;
        log(`[SW:${this.discordId}] Инициализация: запомнил последний комментарий, жду новых.`);
        return;
      }

      if (newest.id === this.lastCommentId) return;

      const freshOnes = [];
      for (const c of comments) {
        if (c.id === this.lastCommentId) break;
        freshOnes.push(c);
      }
      freshOnes.reverse();

      const mySteamId = this.client.steamID.getSteamID64();
      const settings = this.db.getSettings(this.discordId);

      for (const comment of freshOnes) {
        if (comment.author.steamID.getSteamID64() === mySteamId) continue;
        this._maybeReplyTo(comment, settings);
      }

      this.lastCommentId = newest.id;
    });
  }

  _maybeReplyTo(comment, settings) {
    const authorId = comment.author.steamID.getSteamID64();

    if (settings.skipFriends && this.client.myFriends && this.client.myFriends[authorId] !== undefined) {
      log(`[SW:${this.discordId}] Пропускаю ${comment.author.name} — он в друзьях.`);
      return;
    }

    const cooldownMs = (settings.perUserCooldownMin || 30) * 60 * 1000;
    const lastReply = this.lastReplyByUser[authorId] || 0;

    if (Date.now() - lastReply < cooldownMs) {
      log(`[SW:${this.discordId}] Пропускаю ${comment.author.name} — недавно уже отвечал (cooldown).`);
      return;
    }

    const delay = 15000 + Math.random() * 45000;

    log(`[SW:${this.discordId}] Новый комментарий от ${comment.author.name}: "${comment.text}" -> отвечу через ${(delay / 1000).toFixed(0)}с`);

    this.lastReplyByUser[authorId] = Date.now();

    const timeout = setTimeout(() => {
      const phrase = this._pickPhrase(authorId);
      this.community.postUserComment(this.client.steamID, phrase, (err) => {
        if (err) {
          logError(`[SW:${this.discordId}] Не удалось отправить ответ: ${err.message}`);
        } else {
          log(`[SW:${this.discordId}] Ответил ${comment.author.name}: ${phrase}`);
          this.db.addLog(this.discordId, comment.author.name, authorId, phrase);
        }
      });
    }, delay);

    this.timeouts.push(timeout);
  }

  _pickPhrase(authorId) {
    const targetPhrases = this.db.getTargetPhrases(this.discordId, authorId);
    if (targetPhrases.length > 0) {
      return targetPhrases[Math.floor(Math.random() * targetPhrases.length)];
    }

    const phrases = this.db.getActivePhrases(this.discordId);
    if (phrases.length === 0) return 'Спасибо за сообщение!';
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  getStatus() {
    return {
      discordId: this.discordId,
      running: this.running,
      steamId: this.client.steamID ? this.client.steamID.getSteamID64() : null,
      lastCommentId: this.lastCommentId,
    };
  }
}
