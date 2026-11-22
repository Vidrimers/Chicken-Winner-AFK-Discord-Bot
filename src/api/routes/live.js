/**
 * Live-трекер CS2 GSI:
 * - POST /api/gsi            — приём пакетов от игры (авторизация по токену в query)
 * - GET  /api/live/state     — состояние текущего матча для страницы
 * - GET  /api/live/config    — скачивание gamestate_integration_live.cfg с токеном
 * - POST /api/live/preview   — парсинг Steam-профиля без сохранения в базу
 */

import { randomBytes } from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { checkProfiles } from '../../steam/steamApi.js';
import { SERVER_CONFIG } from '../../config.js';
import { error as logError } from '../../utils/logger.js';

// Состояния матчей в памяти: userId -> MatchState
const matchStates = new Map();

// Время последнего GSI-пакета и steamid из него (индикатор связи + сверка аккаунта)
const lastGsiAt = new Map();

// Если пакетов от игры давно нет — считаем матч завершённым
const STALE_AFTER_SEC = 180;

function createRateLimiter(maxRequests, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.authenticatedUserId || req.ip;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= maxRequests) {
      return res.status(429).json({ error: 'Слишком много запросов, попробуй позже' });
    }
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}

function activeWeapon(weapons) {
  if (!weapons) return null;
  for (const key of Object.keys(weapons)) {
    if (weapons[key] && weapons[key].state === 'active') {
      return String(weapons[key].name || '').replace('weapon_', '') || null;
    }
  }
  return null;
}

// Склеивание игрока в общий список матча (нарастающий итог: спектатор + наблюдения)
function mergePlayer(state, steamId, p, now, source) {
  const prev = state.players.get(steamId);
  const ms = p.match_stats || {};
  const st = p.state || {};
  state.players.set(steamId, {
    steamid: steamId,
    name: p.name || (prev ? prev.name : ''),
    team: p.team || (prev ? prev.team : ''),
    kills: ms.kills != null ? ms.kills : (prev ? prev.kills : 0),
    deaths: ms.deaths != null ? ms.deaths : (prev ? prev.deaths : 0),
    assists: ms.assists != null ? ms.assists : (prev ? prev.assists : 0),
    hp: st.health != null ? st.health : (prev ? prev.hp : null),
    money: st.money != null ? st.money : (prev ? prev.money : null),
    weapon: activeWeapon(p.weapons) || (prev ? prev.weapon : null),
    firstSeen: prev ? prev.firstSeen : now,
    lastSeen: now,
    isSelf: source === 'self' || (prev ? !!prev.isSelf : false),
    source: prev && prev.source === 'roster' ? 'roster' : source,
  });
}

// Финализация матча: запись в историю (состав собирается нарастающим итогом)
function finalizeMatch(db, userId, state) {
  try {
    // Сохраняем, если кроме себя был увиден хотя бы один игрок;
    // себя тоже записываем — строка «(ты)» в истории
    const others = [...state.players.values()].filter(
      (p) => !state.playingSteamId || String(p.steamid) !== String(state.playingSteamId)
    );
    if (others.length > 0) {
      const matchId = db.insertLiveMatch({
        userId,
        mapName: state.mapName,
        mode: state.mode,
        scoreCt: state.scoreCt,
        scoreT: state.scoreT,
        startedAt: state.startedAt,
        endedAt: Math.floor(Date.now() / 1000),
      });
      for (const p of state.players.values()) {
        db.insertLiveMatchPlayer(matchId, p);
      }
    }
  } catch (e) {
    logError(`[Live] Ошибка записи матча в историю: ${e.message}`);
  }
  matchStates.delete(userId);
}

function processGsi(db, userId, payload) {
  const now = Math.floor(Date.now() / 1000);
  const providerSid = payload.provider ? payload.provider.steamid : null;
  lastGsiAt.set(userId, { at: Date.now(), sid: providerSid });
  let state = matchStates.get(userId);
  const map = payload.map && payload.map.name ? payload.map : null;

  // Вышли из матча / меню — завершаем текущий матч
  if (!map) {
    if (state) finalizeMatch(db, userId, state);
    return;
  }

  // Сменилась карта — предыдущий матч завершается
  if (state && state.mapName && state.mapName !== map.name) {
    finalizeMatch(db, userId, state);
    state = null;
  }

  if (!state) {
    state = {
      mapName: map.name,
      mode: map.mode || '',
      scoreCt: map.team_ct ? map.team_ct.score : 0,
      scoreT: map.team_t ? map.team_t.score : 0,
      round: map.round != null ? map.round : 0,
      phase: map.phase || '',
      startedAt: now,
      lastPacketAt: now,
      playingSteamId: providerSid,
      me: null,
      players: new Map(),
      rosterLive: false,
    };
    matchStates.set(userId, state);
  }

  if (providerSid) state.playingSteamId = providerSid;

  state.mode = map.mode || state.mode;
  if (map.team_ct && map.team_ct.score != null) state.scoreCt = map.team_ct.score;
  if (map.team_t && map.team_t.score != null) state.scoreT = map.team_t.score;
  if (map.round != null) state.round = map.round;
  if (map.phase) state.phase = map.phase;
  state.lastPacketAt = now;

  // Состав — приходит только в режиме Spectate
  if (payload.allplayers) {
    state.rosterLive = true;
    for (const sid of Object.keys(payload.allplayers)) {
      mergePlayer(state, sid, payload.allplayers[sid] || {}, now, 'roster');
    }
  } else {
    state.rosterLive = false;
  }

  // player: я сам (жив/мёртв) или наблюдаемый (тиммейт / зритель)
  const player = payload.player;
  if (player && player.steamid) {
    if (providerSid && player.steamid === providerSid) {
      const ms = player.match_stats || {};
      const pst = player.state || {};
      state.me = {
        name: player.name || '',
        steamid: player.steamid,
        team: player.team || '',
        activity: player.activity || '',
        hp: pst.health != null ? pst.health : null,
        armor: pst.armor != null ? pst.armor : null,
        money: pst.money != null ? pst.money : null,
        kills: ms.kills || 0,
        deaths: ms.deaths || 0,
        assists: ms.assists || 0,
        weapon: activeWeapon(player.weapons),
      };
      // Себя тоже держим в списке игроков — строка «(ты)» в составе и истории
      mergePlayer(state, player.steamid, player, now, 'self');
    } else {
      mergePlayer(state, player.steamid, player, now, 'observed');
    }
  }
}

export function registerLiveRoutes(app, db) {
  const previewLimiter = createRateLimiter(10, 60 * 1000);

  const getAccess = (userId) => {
    const stats = db.getUserStats(userId) || {};
    return {
      steam: !!db.getSteamId(userId),
      telegram: db.hasTelegramLink(userId),
      member: stats.is_on_server === 1,
    };
  };

  const isGranted = (access) => access.steam && access.telegram && access.member;

  // Приём GSI-пакетов от CS2: /api/gsi?k=<token>
  app.post('/api/gsi', (req, res) => {
    try {
      const token = req.query.k ? String(req.query.k) : '';
      const userId = token ? db.getLiveGsiTokenUser(token) : null;
      if (!userId) {
        res.status(403).end();
        return;
      }
      if (req.body && typeof req.body === 'object') {
        processGsi(db, userId, req.body);
      }
      res.status(200).end('ok');
    } catch (e) {
      logError(`[Live] Ошибка обработки GSI: ${e.message}`);
      res.status(200).end('ok');
    }
  });

  // Состояние для страницы live
  app.get('/api/live/state', requireAuth, (req, res) => {
    try {
      const userId = req.authenticatedUserId;
      const access = getAccess(userId);
      const granted = isGranted(access);

      // Завершаем "зависшие" матчи без пакетов
      const stale = matchStates.get(userId);
      if (stale && Math.floor(Date.now() / 1000) - stale.lastPacketAt > STALE_AFTER_SEC) {
        finalizeMatch(db, userId, stale);
      }

      if (!granted) {
        res.json({ access, granted: false, token: null, match: null, me: null, players: [] });
        return;
      }

      // Токен генерируется при первом заходе
      let token = db.getLiveGsiToken(userId);
      if (!token) token = db.insertLiveGsiToken(userId, randomBytes(24).toString('hex'));

      // Индикатор связи с игрой и сверка Steam-аккаунта
      const seen = lastGsiAt.get(userId) || null;
      const gsiAlive = !!seen && (Date.now() - seen.at) < 90000;
      const current = matchStates.get(userId);
      const playingSteamId = (current && current.playingSteamId) || (seen ? seen.sid : null);
      const linkedSteamId = db.getSteamId(userId);
      const wrongAccount = !!(
        playingSteamId && linkedSteamId && String(playingSteamId) !== String(linkedSteamId)
      );

      if (!current) {
        res.json({
          access, granted: true, token, gsiAlive, wrongAccount, playingSteamId,
          match: null, me: null, players: [],
        });
        return;
      }

      const players = [...current.players.values()];
      const inDb = db.getCheckerTypesBySteamIds(players.map((p) => p.steamid));

      res.json({
        access,
        granted: true,
        token,
        gsiAlive,
        wrongAccount,
        playingSteamId,
        match: {
          map: current.mapName,
          mode: current.mode,
          scoreCt: current.scoreCt,
          scoreT: current.scoreT,
          round: current.round,
          phase: current.phase,
          rosterLive: current.rosterLive,
          startedAt: current.startedAt,
        },
        me: current.me,
        players: players.map((p) => ({ ...p, inDb: inDb[p.steamid] || null })),
      });
    } catch (e) {
      logError(`[Live] Ошибка /api/live/state: ${e.message}`);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // Скачивание gamestate_integration_live.cfg с токеном
  app.get('/api/live/config', requireAuth, (req, res) => {
    try {
      const userId = req.authenticatedUserId;
      const access = getAccess(userId);
      if (!isGranted(access)) {
        return res.status(403).json({ error: 'Не выполнены условия доступа' });
      }
      let token = db.getLiveGsiToken(userId);
      if (!token) token = db.insertLiveGsiToken(userId, randomBytes(24).toString('hex'));

      // Адрес панели берём из запроса; порт — напрямую мимо nginx,
      // т.к. GSI шлёт обычный HTTP и не ходит по редиректам на HTTPS
      const host = String(req.get('host') || '').split(':')[0];
      const uri = `http://${host}:${SERVER_CONFIG.PORT}/api/gsi?k=${token}`;
      const cfg = `"LiveTracker"
{
	"uri"		"${uri}"
	"timeout"	"5.0"
	"throttle"	"0.5"
	"heartbeat"	"30.0"
	"data"
	{
		"provider"			"1"
		"map"				"1"
		"round"				"1"
		"player_id"			"1"
		"player_state"			"1"
		"player_weapons"		"1"
		"player_match_stats"		"1"
		"allplayers_id"			"1"
		"allplayers_state"		"1"
		"allplayers_match_stats"	"1"
		"allplayers_weapons"		"1"
		"phase_countdowns"		"1"
		"bombs"				"1"
		"allstats"			"1"
		"map_wins"			"1"
		"grenades"			"1"
		"player"			"1"
		"allplayers"			"1"
	}
}
`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="gamestate_integration_live.cfg"');
      res.send(cfg);
    } catch (e) {
      logError(`[Live] Ошибка /api/live/config: ${e.message}`);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // История матчей пользователя: список + составы + режимы для табов
  app.get('/api/live/history', requireAuth, (req, res) => {
    try {
      const userId = req.authenticatedUserId;
      const mode = req.query.mode ? String(req.query.mode) : null;
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = 10;
      const offset = (page - 1) * limit;

      const rows = db.getLiveMatches(userId, { mode, limit, offset });
      const playersMap = db.getLiveMatchPlayersByMatchIds(rows.map((m) => m.id));
      const modes = db.getLiveMatchModes(userId);

      const allSids = [];
      for (const arr of Object.values(playersMap)) {
        for (const p of arr) allSids.push(p.steamid);
      }
      const inDb = db.getCheckerTypesBySteamIds(allSids);

      res.json({
        matches: rows.map((m) => ({
          id: m.id,
          map: m.map_name,
          mode: m.mode,
          scoreCt: m.score_ct,
          scoreT: m.score_t,
          startedAt: m.started_at,
          endedAt: m.ended_at,
          players: (playersMap[m.id] || []).map((p) => ({ ...p, inDb: inDb[p.steamid] || null })),
        })),
        modes,
        total: db.getLiveMatchesCount(userId, mode),
        page,
      });
    } catch (e) {
      logError(`[Live] Ошибка /api/live/history: ${e.message}`);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // Парсинг Steam-профиля без сохранения в базу (для модалки игрока)
  app.post('/api/live/preview', requireAuth, previewLimiter, async (req, res) => {
    try {
      const { steamId } = req.body || {};
      if (!steamId || !/^\d{17}$/.test(String(steamId))) {
        return res.status(400).json({ error: 'Невалидный SteamID64' });
      }
      const url = `https://steamcommunity.com/profiles/${steamId}/`;
      const { results, errors } = await checkProfiles([url]);
      // Есть ли профиль уже в базе (читеры/боты)
      const inDb = db.getCheckerTypesBySteamIds([String(steamId)])[String(steamId)] || null;
      res.json({ profile: results && results[0] ? results[0] : null, errors: errors || [], inDb });
    } catch (e) {
      logError(`[Live] Ошибка /api/live/preview: ${e.message}`);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });
}
