import { Router } from 'express';
import { LoginSession, EAuthTokenPlatformType } from 'steam-session';
import { resolveVanityUrl, getPlayerSummaries } from '../../steam/steamApi.js';
import { log, error as logError } from '../../utils/logger.js';

function getDiscordId(req) {
  // Из сессии, из query params, или из body
  return req.session?.userId || req.query?.userId || req.body?.userId || null;
}

function requireAuth(req, res) {
  const discordId = getDiscordId(req);
  if (!discordId) {
    res.status(401).json({ error: 'Не авторизован' });
    return null;
  }
  return discordId;
}

function parseSteamId(input) {
  // Полная ссылка на профиль
  const profileMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (profileMatch) {
    return { steamId64: profileMatch[1], vanityUrl: null };
  }

  // Ссылка на vanity URL
  const vanityMatch = input.match(/steamcommunity\.com\/id\/([^/?]+)/);
  if (vanityMatch) {
    return { steamId64: null, vanityUrl: vanityMatch[1] };
  }

  // Просто 17-значный SteamID64
  if (/^\d{17}$/.test(input) && input.startsWith('765611')) {
    return { steamId64: input, vanityUrl: null };
  }

  // Vanity URL без полной ссылки (просто username)
  if (/^[a-zA-Z0-9_-]+$/.test(input) && input.length > 2 && input.length < 32) {
    return { steamId64: null, vanityUrl: input };
  }

  return null;
}

// Хранилище активных QR-сессий
const qrSessions = new Map(); // discordId -> { session, qrChallengeUrl, status, refreshToken, timeout }

export function createSteamWallRouter(db, manager, steamApi) {
  const router = Router();

  // ===== PHRASES =====

  router.get('/phrases', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const phrases = db.getPhrases(discordId);
    res.json(phrases);
  });

  router.post('/phrases', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Текст фразы обязателен' });
    }

    const result = db.addPhrase(discordId, text.trim());
    res.json({ success: true, id: result.lastInsertRowid });
  });

  router.put('/phrases/:id', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const { id } = req.params;
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Текст фразы обязателен' });
    }

    db.updatePhrase(parseInt(id), discordId, text.trim());
    res.json({ success: true });
  });

  router.delete('/phrases/:id', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const { id } = req.params;
    db.deletePhrase(parseInt(id), discordId);
    res.json({ success: true });
  });

  // ===== TARGET USERS =====

  router.get('/targets', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const targets = db.getTargetUsers(discordId);
    res.json(targets);
  });

  router.post('/targets', async (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const { steamId64: inputSteamId, name, profileUrl, phrases } = req.body;
    if (!inputSteamId) {
      return res.status(400).json({ error: 'Steam ID обязателен' });
    }

    let steamId64 = inputSteamId;
    let resolvedName = name || null;
    let resolvedUrl = profileUrl || null;

    // Пробуем распарсить URL
    const parsed = parseSteamId(inputSteamId);

    if (parsed) {
      if (parsed.steamId64) {
        // Уже SteamID64
        steamId64 = parsed.steamId64;
        if (!resolvedUrl) {
          resolvedUrl = `https://steamcommunity.com/profiles/${steamId64}`;
        }
      } else if (parsed.vanityUrl) {
        // Vanity URL — резолвим через Steam API
        try {
          const resolved = await resolveVanityUrl(parsed.vanityUrl);
          if (resolved) {
            steamId64 = resolved;
            if (!resolvedUrl) {
              resolvedUrl = `https://steamcommunity.com/profiles/${steamId64}`;
            }
          }
        } catch (err) {
          logError(`[SW API] Ошибка резолва vanity URL: ${err.message}`);
          return res.status(400).json({ error: 'Не удалось найти Steam профиль по этой ссылке' });
        }
      }
    } else if (steamId64.match(/^https?:\/\/steamcommunity\.com\/(profiles|id)\/(.+)/)) {
      // Прямая ссылка — парсим вручную
      const urlMatch = steamId64.match(/^https?:\/\/steamcommunity\.com\/profiles\/(\d{17})/);
      if (urlMatch) {
        steamId64 = urlMatch[1];
        if (!resolvedUrl) resolvedUrl = steamId64;
      } else {
        const idMatch = steamId64.match(/^https?:\/\/steamcommunity\.com\/id\/([^/]+)/);
        if (idMatch) {
          try {
            const resolved = await resolveVanityUrl(idMatch[1]);
            if (resolved) {
              steamId64 = resolved;
              if (!resolvedUrl) resolvedUrl = `https://steamcommunity.com/profiles/${steamId64}`;
            }
          } catch (err) {
            return res.status(400).json({ error: 'Не удалось найти Steam профиль по этой ссылке' });
          }
        }
      }
    }

    if (!/^\d{17}$/.test(steamId64)) {
      return res.status(400).json({ error: 'Невалидный SteamID64. Вставьте ссылку на профиль или 17-значный ID.' });
    }

    if (!resolvedUrl) {
      resolvedUrl = `https://steamcommunity.com/profiles/${steamId64}`;
    }

    // Получаем аватар и ник через Steam API
    let resolvedAvatar = null;
    try {
      const summaries = await getPlayerSummaries([steamId64]);
      if (summaries && summaries.length > 0) {
        const player = summaries[0];
        resolvedAvatar = player.avatarfull || null;
        if (!resolvedName) resolvedName = player.personaname || null;
      }
    } catch (err) {
      logError(`[SW API] Ошибка получения summary: ${err.message}`);
    }

    const result = db.addTargetUser(discordId, steamId64, resolvedName, resolvedUrl, resolvedAvatar, phrases || []);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  router.put('/targets/:id', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const { id } = req.params;
    const data = req.body;

    db.updateTargetUser(parseInt(id), discordId, data);
    res.json({ success: true });
  });

  router.delete('/targets/:id', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const { id } = req.params;
    db.deleteTargetUser(parseInt(id), discordId);
    res.json({ success: true });
  });

  // ===== SETTINGS =====

  router.get('/settings', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const settings = db.getSettings(discordId);
    res.json(settings);
  });

  router.put('/settings', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const { skipFriends, perUserCooldownMin, pollIntervalMs } = req.body;
    db.updateSettings(discordId, { skipFriends, perUserCooldownMin, pollIntervalMs });

    if (manager.isRunning(discordId)) {
      manager.restartWorker(discordId);
    }

    res.json({ success: true });
  });

  // ===== TOKEN =====

  router.post('/token', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const { token } = req.body;
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'Refresh token обязателен' });
    }

    db.setRefreshToken(discordId, token.trim());
    res.json({ success: true });
  });

  // ===== BOT CONTROL =====

  router.get('/status', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const status = manager.getWorkerStatus(discordId);
    const settings = db.getSettings(discordId);
    const logsCount = db.getLogsCount(discordId);

    res.json({
      running: status ? status.running : false,
      steamId: status?.steamId || null,
      hasToken: settings?.hasToken || false,
      logsCount,
    });
  });

  router.post('/start', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    if (!db.hasRefreshToken(discordId)) {
      return res.status(400).json({ error: 'Сначала введите refresh token' });
    }

    manager.startWorker(discordId);
    res.json({ success: true });
  });

  router.post('/stop', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    manager.stopWorker(discordId);
    res.json({ success: true });
  });

  // ===== LOGS =====

  router.get('/logs', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const limit = parseInt(req.query.limit) || 50;
    const logs = db.getLogs(discordId, limit);
    res.json(logs);
  });

  // ===== QR LOGIN =====

  router.post('/qr/start', async (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    // Если уже есть активная сессия — отменяем старую
    if (qrSessions.has(discordId)) {
      const old = qrSessions.get(discordId);
      try { old.session.cancelLoginAttempt(); } catch {}
      if (old.timeout) clearTimeout(old.timeout);
      qrSessions.delete(discordId);
    }

    try {
      const session = new LoginSession(EAuthTokenPlatformType.SteamClient);
      session.loginTimeout = 120000; // 2 минуты

      const result = await session.startWithQR();

      const sessionData = {
        session,
        qrChallengeUrl: result.qrChallengeUrl,
        status: 'waiting',
        refreshToken: null,
        timeout: null,
      };

      // Обработчики событий
      session.on('authenticated', () => {
        log(`[SW QR] Авторизован: ${discordId}`);
        sessionData.status = 'authenticated';
        sessionData.refreshToken = session.refreshToken;
      });

      session.on('timeout', () => {
        log(`[SW QR] Тайм-аут: ${discordId}`);
        sessionData.status = 'timeout';
        qrSessions.delete(discordId);
      });

      session.on('error', (err) => {
        logError(`[SW QR] Ошибка: ${discordId}: ${err.message}`);
        sessionData.status = 'error';
        qrSessions.delete(discordId);
      });

      // Автоочистка через 3 минуты
      sessionData.timeout = setTimeout(() => {
        try { session.cancelLoginAttempt(); } catch {}
        qrSessions.delete(discordId);
      }, 180000);

      qrSessions.set(discordId, sessionData);

      res.json({
        success: true,
        qrChallengeUrl: result.qrChallengeUrl,
      });
    } catch (err) {
      logError(`[SW QR] Ошибка запуска: ${discordId}: ${err.message}`);
      res.status(500).json({ error: 'Ошибка создания QR-сессии' });
    }
  });

  router.get('/qr/status', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const data = qrSessions.get(discordId);
    if (!data) {
      return res.json({ status: 'none' });
    }

    if (data.status === 'authenticated' && data.refreshToken) {
      // Сохраняем токен в БД
      db.setRefreshToken(discordId, data.refreshToken);

      // Очищаем сессию
      if (data.timeout) clearTimeout(data.timeout);
      qrSessions.delete(discordId);

      return res.json({ status: 'authenticated' });
    }

    res.json({ status: data.status });
  });

  router.post('/qr/cancel', (req, res) => {
    const discordId = requireAuth(req, res);
    if (!discordId) return;

    const data = qrSessions.get(discordId);
    if (data) {
      try { data.session.cancelLoginAttempt(); } catch {}
      if (data.timeout) clearTimeout(data.timeout);
      qrSessions.delete(discordId);
    }

    res.json({ success: true });
  });

  return router;
}
