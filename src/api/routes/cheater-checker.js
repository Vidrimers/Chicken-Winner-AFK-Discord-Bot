import { Router } from 'express';
import { checkProfiles } from '../../steam/steamApi.js';
import { USER_IDS, STEAM_CONFIG } from '../../config.js';
import { EmbedBuilder } from 'discord.js';

/**
 * In-memory rate limiter
 * @param {number} maxRequests — максимум запросов
 * @param {number} windowMs — окно в миллисекундах
 * @returns {Function} middleware
 */
function createRateLimiter(maxRequests, windowMs) {
  const requests = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!requests.has(ip)) {
      requests.set(ip, []);
    }

    const timestamps = requests.get(ip).filter(ts => now - ts < windowMs);
    requests.set(ip, timestamps);

    if (timestamps.length >= maxRequests) {
      return res.status(429).json({ error: 'Слишком много запросов, попробуйте позже' });
    }

    timestamps.push(now);
    next();
  };
}

// Цветовая схема для embed
const EMBED_COLORS = {
  BANNED: 0xFF0000,
  RESTRICTED: 0xFFAA00,
  CLEAN: 0x00CC44,
};

/**
 * Роуты для cheater checker API
 */
export function createCheaterCheckerRouter(db, discordClient, telegram, achievements) {
  const router = Router();

  // Rate limiters
  const checkLimiter = createRateLimiter(5, 60 * 1000); // 5 req/min
  const publishLimiter = createRateLimiter(10, 60 * 1000); // 10 req/min

  /**
   * POST /api/cheater-checker/check
   * Проверка массива Steam-профилей
   */
  router.post('/check', checkLimiter, async (req, res) => {
    try {
      const { urls, checkedByDiscordId, checkedByUsername } = req.body;

      // Валидация
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'urls должен быть непустым массивом' });
      }

      if (urls.length > 20) {
        return res.status(400).json({ error: 'Максимум 20 ссылок за один запрос' });
      }

      if (!checkedByDiscordId) {
        return res.status(400).json({ error: 'checkedByDiscordId обязательное поле' });
      }

      // Проверка профилей через Steam API
      const { results, errors } = await checkProfiles(urls);

      // Проверяем какие профили уже есть в БД
      const duplicates = [];
      const newProfiles = [];

      for (const profile of results) {
        const existing = db.getCheaterCheckBySteamId(profile.steamId);
        if (existing) {
          duplicates.push({
            ...profile,
            alreadyAddedBy: existing.checked_by_username || 'Unknown',
            alreadyAddedByDiscordId: existing.checked_by_discord_id || null,
            alreadyAddedAt: existing.checked_at,
          });
        } else {
          newProfiles.push(profile);
        }
      }

      // Сохранение только новых результатов в БД
      for (const profile of newProfiles) {
        db.upsertCheaterCheck({
          ...profile,
          checkedByDiscordId,
          checkedByUsername: checkedByUsername || 'Unknown',
        });
      }

      // Обновляем данные о банах для дубликатов (без перезаписи автора)
      for (const profile of duplicates) {
        db.upsertCheaterCheck({
          ...profile,
          checkedByDiscordId,
          checkedByUsername: checkedByUsername || 'Unknown',
        });
      }

      // Уведомление админу только о новых профилях
      if (newProfiles.length > 0 && telegram && telegram.sendNewCheaterNotification) {
        try {
          const profiles = newProfiles.map(p => ({
            personaName: p.personaName || p.steamId,
            profileUrl: p.profileUrl || `https://steamcommunity.com/profiles/${p.steamId}`,
            steamId: p.steamId,
          }));
          await telegram.sendNewCheaterNotification(checkedByUsername || 'Unknown', 'web', profiles);
        } catch (err) {
          console.error('[CheaterChecker] Ошибка отправки уведомления:', err.message);
        }
      }

      // Проверяем достижения cheater-checker для пользователя
      if (achievements && checkedByDiscordId) {
        try {
          await achievements.checkAll(checkedByDiscordId, checkedByUsername || 'Unknown');
        } catch (err) {
          console.error('[CheaterChecker] Ошибка проверки достижений:', err.message);
        }
      }

      res.json({ results, errors, duplicates });
    } catch (error) {
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  /**
   * GET /api/cheater-checker/profiles
   * Получение сохранённых профилей с пагинацией и фильтром
   */
  router.get('/profiles', (req, res) => {
    try {
      let limit = parseInt(req.query.limit, 10) || 50;
      let offset = parseInt(req.query.offset, 10) || 0;
      const filter = req.query.filter || 'all';

      // Ограничения
      if (limit < 1) limit = 1;
      if (offset < 0) offset = 0;

      // Валидация filter
      if (!['all', 'banned', 'clean'].includes(filter)) {
        return res.status(400).json({ error: 'filter должен быть: all, banned или clean' });
      }

      const profiles = db.getCheaterChecks({ limit, offset, filter });
      const total = db.getCheaterChecksCount(filter);

      res.json({ profiles, total });
    } catch (error) {
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  /**
   * DELETE /api/cheater-checker/profiles/:steamId
   * Удаление записи (только admin)
   */
  router.delete('/profiles/:steamId', (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      const { steamId } = req.params;

      // Проверка admin
      if (!userId || userId !== USER_IDS.ADMIN_USER_ID) {
        return res.status(403).json({ error: 'Доступ запрещён' });
      }

      // Валидация steamId (17 цифр)
      if (!/^\d{17}$/.test(steamId)) {
        return res.status(400).json({ error: 'Невалидный SteamID64' });
      }

      db.deleteCheaterCheck(steamId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  /**
   * POST /api/cheater-checker/publish-discord
   * Публикация embed в Discord-ветку
   */
  router.post('/publish-discord', publishLimiter, async (req, res) => {
    try {
      const { steamId } = req.body;

      if (!steamId || !/^\d{17}$/.test(steamId)) {
        return res.status(400).json({ error: 'Невалидный SteamID64' });
      }

      // Получаем профиль из БД
      const profile = db.getCheaterCheckBySteamId(steamId);
      if (!profile) {
        return res.status(404).json({ error: 'Профиль не найден в базе данных' });
      }

      // Определяем цвет embed
      let color = EMBED_COLORS.CLEAN;
      if (profile.vac_banned || profile.number_of_game_bans > 0) {
        color = EMBED_COLORS.BANNED;
      } else if (profile.community_banned || (profile.economy_ban && profile.economy_ban !== 'none')) {
        color = EMBED_COLORS.RESTRICTED;
      }

      // Строим embed
      const embed = new EmbedBuilder()
        .setTitle(profile.persona_name || 'Unknown')
        .setURL(profile.profile_url)
        .setThumbnail(profile.avatar_url || null)
        .setColor(color)
        .addFields(
          { name: 'SteamID64', value: profile.steam_id, inline: true },
          { name: 'VAC-бан', value: profile.vac_banned ? `Да (${profile.number_of_vac_bans} бан(ов))` : 'Нет', inline: true },
          { name: 'Игровые баны', value: profile.number_of_game_bans > 0 ? `${profile.number_of_game_bans}` : 'Нет', inline: true },
          { name: 'Дней с последнего бана', value: profile.days_since_last_ban > 0 ? `${profile.days_since_last_ban}` : '—', inline: true },
          { name: 'Коммьюнити-бан', value: profile.community_banned ? 'Да' : 'Нет', inline: true },
          { name: 'Торговый бан', value: profile.economy_ban !== 'none' ? profile.economy_ban : 'Нет', inline: true },
        )
        .setFooter({ text: `Checked by ${profile.checked_by_username || 'Unknown'}` })
        .setTimestamp();

      // Отправляем в Discord-ветку
      const threadId = STEAM_CONFIG.VAC_THREAD_ID;
      if (!threadId) {
        return res.status(500).json({ error: 'VAC_THREAD_ID не настроен' });
      }

      const channel = await discordClient.channels.fetch(threadId).catch(() => null);
      if (!channel) {
        return res.status(500).json({ error: 'Не удалось отправить в Discord' });
      }

      const message = await channel.send({ embeds: [embed] });
      const messageUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;

      res.json({ success: true, messageUrl });
    } catch (error) {
      res.status(500).json({ error: 'Не удалось отправить в Discord' });
    }
  });

  return router;
}
