import { Router } from 'express';
import { log, error as logError } from '../../utils/logger.js';

function getDiscordId(req) {
  return req.session?.userId || null;
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
  const urlMatch = input.match(/steamcommunity\.com\/(?:profiles\/(\d{17})|id\/([^/]+))/);
  if (urlMatch) {
    return { steamId64: urlMatch[1] || null, vanityUrl: urlMatch[2] || null };
  }
  if (/^\d{17}$/.test(input) && input.startsWith('765611')) {
    return { steamId64: input, vanityUrl: null };
  }
  return null;
}

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

    const parsed = parseSteamId(inputSteamId);
    if (parsed && parsed.vanityUrl && steamApi) {
      try {
        const info = await steamApi.resolveVanityUrl(parsed.vanityUrl);
        if (info) {
          steamId64 = info.steamId;
          resolvedName = info.personaName || resolvedName;
          resolvedUrl = info.profileUrl || resolvedUrl;
        }
      } catch (err) {
        logError(`[SW API] Ошибка резолва vanity URL: ${err.message}`);
      }
    }

    if (!/^\d{17}$/.test(steamId64)) {
      return res.status(400).json({ error: 'Невалидный SteamID64' });
    }

    if (!resolvedUrl) {
      resolvedUrl = `https://steamcommunity.com/profiles/${steamId64}`;
    }

    const result = db.addTargetUser(discordId, steamId64, resolvedName, resolvedUrl, phrases || []);
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

  return router;
}
