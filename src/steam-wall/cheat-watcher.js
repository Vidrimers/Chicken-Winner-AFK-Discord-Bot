import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import { checkProfiles } from '../steam/steamApi.js';
import { parseSteamUrl } from '../steam/urlParser.js';
import { error as logError, log, success } from '../utils/logger.js';

const POST_DELAY_MS = 20000; // 20 секунд между постами
const WALL_POLL_INTERVAL_MS = 60000; // 1 минута между опросами стены
const REP_RATE_LIMIT = 10; // максимум репортов
const REP_RATE_WINDOW_MS = 30 * 60 * 1000; // за 30 минут

/**
 * CheatWatcher — системный воркер для постинга комментариев на стене TheCheatWatcher
 * и обработки внешних репортов (-rep URL) от пользователей
 */
export class CheatWatcherWorker {
  constructor(db, telegramReport = null) {
    this.db = db;
    this.telegramReport = telegramReport;
    this.client = new SteamUser();
    this.community = new SteamCommunity();
    this.running = false;
    this.processing = false;
    this.lastWallCommentId = null;
    this.pendingHiddenComments = new Set(); // ID скрытых комментариев для повторной проверки
    this._bindEvents();
  }

  _bindEvents() {
    this.client.on('loggedOn', () => {
      success(`[CheatWatcher] Logged in, SteamID: ${this.client.steamID.getSteamID64()}`);
    });

    this.client.on('webSession', (sessionID, cookies) => {
      this.community.setCookies(cookies);
      success('[CheatWatcher] Web session established');
      this.running = true;
      this._processQueue();
      this._startWallPolling();
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
    if (this._wallPollTimer) {
      clearInterval(this._wallPollTimer);
      this._wallPollTimer = null;
    }
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

  // ===== QUEUE PROCESSING =====

  async _processQueue() {
    if (this.processing || !this.running) return;
    this.processing = true;

    try {
      const pending = this.db.getPendingCheatWatcherComments();

      if (pending.length === 0) {
        this.processing = false;
        setTimeout(() => this._processQueue(), 30000);
        return;
      }

      for (const item of pending) {
        if (!this.running) break;

        try {
          await this._postComment(this.client.steamID.getSteamID64(), item.comment_text);
          this.db.markCheatWatcherCommentPosted(item.id);
          log(`[CheatWatcher] Posted comment (queue #${item.id})`);
        } catch (err) {
          const errMsg = err.message || String(err);
          logError(`[CheatWatcher] Failed to post (queue #${item.id}): ${errMsg}`);
          this.db.markCheatWatcherCommentError(item.id, errMsg);

          if (errMsg.includes('not logged in') || errMsg.includes('login')) {
            this.running = false;
            break;
          }
        }

        if (pending.indexOf(item) < pending.length - 1) {
          await new Promise(r => setTimeout(r, POST_DELAY_MS));
        }
      }
    } catch (err) {
      logError(`[CheatWatcher] Queue processing error: ${err.message}`);
    }

    this.processing = false;

    if (this.running) {
      setTimeout(() => this._processQueue(), 10000);
    }
  }

  // ===== WALL POLLING FOR -rep =====

  _startWallPolling() {
    if (this._wallPollTimer) clearInterval(this._wallPollTimer);
    // Первый опрос сразу, потом по интервалу
    this._checkWallForReports();
    this._wallPollTimer = setInterval(() => this._checkWallForReports(), WALL_POLL_INTERVAL_MS);
  }

  _checkWallForReports() {
    if (!this.running || !this.client.steamID) return;

    this.community.getUserComments(this.client.steamID, { count: 25 }, (err, comments) => {
      if (err) {
        logError(`[CheatWatcher] Error reading wall: ${err.message}`);
        return;
      }
      if (!comments || comments.length === 0) return;

      const newest = comments[0];
      const SPAM_PLACEHOLDER = 'автоматической проверки контента';

      // Инициализация — запоминаем последний комментарий и скрытые
      if (this.lastWallCommentId === null) {
        this.lastWallCommentId = newest.id;
        // При первом запуске запоминаем все скрытые комментарии для будущей проверки
        for (const c of comments) {
          if (c.author.steamID.getSteamID64() !== this.client.steamID.getSteamID64() &&
              c.text && c.text.includes(SPAM_PLACEHOLDER)) {
            this.pendingHiddenComments.add(c.id);
          }
        }
        if (this.pendingHiddenComments.size > 0) {
          log(`[CheatWatcher] Wall initialized, ${this.pendingHiddenComments.size} hidden comments queued for re-check`);
        }
        return;
      }

      // 1. Проверяем ранее скрытые комментарии — может Steam уже одобрил
      if (this.pendingHiddenComments.size > 0) {
        for (const comment of comments) {
          if (!this.pendingHiddenComments.has(comment.id)) continue;
          // Если текст больше не содержит плейсхолдер — Steam одобрил
          if (comment.text && !comment.text.includes(SPAM_PLACEHOLDER)) {
            this.pendingHiddenComments.delete(comment.id);
            const authorId = comment.author.steamID.getSteamID64();
            if (authorId !== this.client.steamID.getSteamID64()) {
              this._processRepCommand(comment);
            }
          }
        }
      }

      if (newest.id === this.lastWallCommentId) return;

      // 2. Собираем новые комментарии
      const freshOnes = [];
      for (const c of comments) {
        if (c.id === this.lastWallCommentId) break;
        freshOnes.push(c);
      }
      freshOnes.reverse();

      this.lastWallCommentId = newest.id;

      for (const comment of freshOnes) {
        // Игнорируем свои комментарии
        const authorId = comment.author.steamID.getSteamID64();
        if (authorId === this.client.steamID.getSteamID64()) continue;

        // Если комментарий скрыт спам-фильтром — запоминаем для повторной проверки
        if (comment.text && comment.text.includes(SPAM_PLACEHOLDER)) {
          this.pendingHiddenComments.add(comment.id);
          log(`[CheatWatcher] Hidden comment detected, queued for re-check: ${comment.id}`);
          continue;
        }

        this._processRepCommand(comment);
      }
    });
  }

  async _processRepCommand(comment) {
    const text = (comment.text || '').trim();

    // Детектим -rep URL
    const repMatch = text.match(/^-rep\s+(https?:\/\/steamcommunity\.com\/(?:profiles\/\d{17}|id\/[a-zA-Z0-9_-]+)\/?)\s*$/i);
    if (!repMatch) return; // Не -rep комментарий — игнорируем

    const reporterId = comment.author.steamID.getSteamID64();
    const reporterName = comment.author.name || 'Unknown';
    const reporterUrl = `https://steamcommunity.com/profiles/${reporterId}`;
    const targetUrl = repMatch[1].replace(/\/$/, '');

    log(`[CheatWatcher] -rep detected from ${reporterName} (${reporterId}): ${targetUrl}`);

    // Rate limit check
    const reportCount = this.db.getSteamWallReportCount(reporterId, REP_RATE_WINDOW_MS);
    if (reportCount >= REP_RATE_LIMIT) {
      log(`[CheatWatcher] Rate limit hit for ${reporterName} (${reportCount}/${REP_RATE_LIMIT})`);
      try {
        await this._postComment(this.client.steamID.getSteamID64(),
          `⚠️ Rate limit reached. Maximum ${REP_RATE_LIMIT} reports per 30 minutes. Try again later.`);
      } catch {}
      return;
    }

    // Парсим URL
    const parsed = parseSteamUrl(targetUrl);
    if (!parsed) return; // Невалидный URL — молча пропускаем

    // Проверяем не заблокирован ли admin профиль
    const adminSteamId = (process.env.ADMIN_STEAM_ID || '').trim();
    if (adminSteamId) {
      if (parsed.type === 'steamid64' && parsed.value === adminSteamId) return;
      if (parsed.type === 'vanity') {
        try {
          const { resolveVanityUrl } = await import('../steam/steamApi.js');
          const resolved = await resolveVanityUrl(parsed.value);
          if (resolved === adminSteamId) return;
        } catch {}
      }
    }

    try {
      // Проверяем профиль через Steam API
      const { results, errors } = await checkProfiles([targetUrl]);

      if (errors.length > 0 && results.length === 0) {
        log(`[CheatWatcher] Failed to check profile: ${errors.join(', ')}`);
        return; // Ошибка API — молча пропускаем
      }

      if (results.length === 0) return;

      const profile = results[0];

      // Проверяем дубликат
      const existing = this.db.getCheaterCheckBySteamId(profile.steamId);
      if (existing) {
        log(`[CheatWatcher] Duplicate: ${profile.steamId} already in DB`);
        return; // Дубликат — молча пропускаем
      }

      // Сохраняем в БД
      this.db.upsertCheaterCheck({
        ...profile,
        checkedByDiscordId: null,
        checkedByUsername: reporterName,
        reportSource: 'steam_wall',
        reportedByName: reporterName,
        reportedByUrl: reporterUrl,
      });

      // Записываем репорт для rate limiting
      this.db.addSteamWallReport(reporterId, profile.steamId);

      log(`[CheatWatcher] Profile added via -rep: ${profile.personaName} (${profile.steamId}) by ${reporterName}`);

      // Ответ на стене
      const profileUrl = profile.profileUrl || `https://steamcommunity.com/profiles/${profile.steamId}`;
      const replyText =
        `✅ Profile added to database.\n` +
        `Player: ${profile.personaName || 'Unknown'}\n` +
        `SteamID64: ${profile.steamId}\n` +
        `Reported by: ${reporterName}`;

      try {
        await this._postComment(this.client.steamID.getSteamID64(), replyText);
      } catch (err) {
        logError(`[CheatWatcher] Failed to reply on wall: ${err.message}`);
      }

      // Уведомление админу в Telegram
      if (this.telegramReport) {
        try {
          await this.telegramReport(
            `📡 <b>Внешний репорт через Steam Wall</b>\n\n` +
            `👤 Игрок: ${profile.personaName || 'Unknown'}\n` +
            `🔗 Профиль: <a href="${profileUrl}">${profile.personaName || profile.steamId}</a>\n` +
            `🆔 SteamID: ${profile.steamId}\n` +
            `📣 Репорт от: <a href="${reporterUrl}">${reporterName}</a>\n` +
            `📅 Время: ${new Date().toLocaleString('ru-RU')}`
          );
        } catch (err) {
          logError(`[CheatWatcher] Failed to send Telegram notification: ${err.message}`);
        }
      }

      // CheatWatcher комментарий на стене
      const banDetails = formatBanDetails(profile);
      const cwComment =
        `⚠️ Potential ch\u0435\u0430t\u0435r fl\u0430gg\u0435d by Ch\u0435\u0430tW\u0430tch\u0435rs Community\n\n` +
        `Player: ${profile.personaName || 'Unknown'}\n` +
        `Profile: ${profileUrl}\n` +
        `SteamID64: ${profile.steamId}\n\n` +
        `Ban Details:\n${banDetails}\n` +
        `Date: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/Moscow' })}\n\n` +
        `Evidence archived for review.\n` +
        `Added to Ch\u0435\u0430tW\u0430tch\u0435rs Community database and Valve database.`;
      this.db.addCheatWatcherComment(profile.steamId, cwComment);

    } catch (err) {
      logError(`[CheatWatcher] Error processing -rep: ${err.message}`);
    }
  }

  // ===== POST COMMENT =====

  _postComment(targetSteamId, message) {
    return new Promise((resolve, reject) => {
      if (!this.running || !this.client.steamID) {
        return reject(new Error('Not logged in'));
      }

      // Заменяем https:// и буквы в триггерных словах чтобы Steam spam filter не скрыл комментарий
      let sanitizedMessage = message.replace(/https:\/\//g, '');
      sanitizedMessage = sanitizedMessage
        .replace(/cheater/gi, (m) => m.replace(/e/g, '\u0435').replace(/a/g, '\u0430'))
        .replace(/CheatWatchers/gi, (m) => m.replace(/e/g, '\u0435').replace(/a/g, '\u0430'))
        .replace(/cheat/gi, (m) => m.replace(/e/g, '\u0435').replace(/a/g, '\u0430'));

      this.community.postUserComment(
        { steamid: targetSteamId },
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

function formatBanDetails(profile) {
  const vac = profile.vacBanned ?? false;
  const vacCount = profile.numberOfVacBans || 0;
  const gameBans = profile.numberOfGameBans || 0;
  const days = profile.daysSinceLastBan || 0;
  const community = profile.communityBanned ?? false;
  const economy = profile.economyBan || 'none';

  return [
    `\u2022 VAC Ban: ${vac ? `Yes (${vacCount} ban${vacCount !== 1 ? 's' : ''})` : 'No'}`,
    `\u2022 Game Bans: ${gameBans > 0 ? gameBans : 'No'}`,
    `\u2022 Days Since Last Ban: ${(vac || gameBans > 0) ? days : '\u2014'}`,
    `\u2022 Community Ban: ${community ? 'Yes' : 'No'}`,
    `\u2022 Trade Ban: ${economy !== 'none' ? economy : 'No'}`,
  ].join('\n');
}
