import { EmbedBuilder } from 'discord.js';
import { checkProfiles } from '../steam/steamApi.js';
import { STEAM_CONFIG, SERVER_CONFIG } from '../config.js';

// Цветовая схема
const EMBED_COLORS = {
  BANNED: 0xFF0000,      // VAC-бан или игровые баны
  RESTRICTED: 0xFFAA00,  // Коммьюнити-бан или торговый бан
  CLEAN: 0x00CC44,       // Чистый профиль
  INFO: 0x2196F3         // Справка (синий)
};

/**
 * Утилита задержки
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Обработчик Discord-команд для проверки Steam-профилей
 */
export class VacHandler {
  constructor(db, discordClient, telegram = null) {
    this.db = db;
    this.client = discordClient;
    this.telegram = telegram;
  }

  /**
   * Построить Discord Embed для профиля
   * @param {Object} profile — объект профиля из БД или результата проверки
   * @param {string} [footerUsername] — имя проверяющего для footer
   * @returns {EmbedBuilder}
   */
  buildProfileEmbed(profile, footerUsername) {
    const hasVacOrGameBan = profile.vacBanned || profile.vac_banned ||
      (profile.numberOfGameBans || profile.number_of_game_bans || 0) > 0;
    const hasCommunityOrTradeBan = profile.communityBanned || profile.community_banned ||
      (profile.economyBan || profile.economy_ban || 'none') !== 'none';

    let color, title;
    if (hasVacOrGameBan) {
      color = EMBED_COLORS.BANNED;
      title = '🚨 БАНЫ НАЙДЕНЫ';
    } else if (hasCommunityOrTradeBan) {
      color = EMBED_COLORS.RESTRICTED;
      title = '⚠️ Ограничения';
    } else {
      color = EMBED_COLORS.CLEAN;
      title = '✅ Чистый профиль';
    }

    // Нормализация полей (поддержка camelCase и snake_case)
    const steamId = profile.steamId || profile.steam_id;
    const personaName = profile.personaName || profile.persona_name || 'Unknown';
    const avatarUrl = profile.avatarUrl || profile.avatar_url || '';
    const profileUrl = profile.profileUrl || profile.profile_url || `https://steamcommunity.com/profiles/${steamId}`;
    const vacBanned = profile.vacBanned ?? profile.vac_banned ?? false;
    const numberOfVacBans = profile.numberOfVacBans || profile.number_of_vac_bans || 0;
    const numberOfGameBans = profile.numberOfGameBans || profile.number_of_game_bans || 0;
    const daysSinceLastBan = profile.daysSinceLastBan || profile.days_since_last_ban || 0;
    const communityBanned = profile.communityBanned ?? profile.community_banned ?? false;
    const economyBan = profile.economyBan || profile.economy_ban || 'none';
    const checkedByUsername = footerUsername || profile.checkedByUsername || profile.checked_by_username || 'System';

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setThumbnail(avatarUrl || null)
      .addFields(
        { name: 'Игрок', value: `[${personaName}](${profileUrl})`, inline: true },
        { name: 'SteamID64', value: steamId, inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        {
          name: 'VAC-бан',
          value: vacBanned ? `Да (${numberOfVacBans} бан(ов))` : 'Нет',
          inline: true
        },
        {
          name: 'Игровые баны',
          value: numberOfGameBans > 0 ? `${numberOfGameBans}` : 'Нет',
          inline: true
        },
        {
          name: 'Дней с последнего бана',
          value: (vacBanned || numberOfGameBans > 0) ? `${daysSinceLastBan}` : '—',
          inline: true
        },
        {
          name: 'Коммьюнити-бан',
          value: communityBanned ? 'Да' : 'Нет',
          inline: true
        },
        {
          name: 'Торговый бан',
          value: economyBan !== 'none' ? economyBan : 'Нет',
          inline: true
        }
      )
      .setFooter({ text: `Проверил: ${checkedByUsername} • Steam VAC Checker` });

    return embed;
  }

  /**
   * Обработка команды .!. <steam_url>
   * Проверяет один профиль, отвечает embed-сообщением, сохраняет в БД
   */
  async handleCheckCommand(message, url) {
    try {
      // Добавляем реакцию "поиск"
      await message.react('🔍');

      const { results, errors } = await checkProfiles([url]);

      if (errors.length > 0 && results.length === 0) {
        await message.reactions.cache.get('🔍')?.remove();
        await message.react('❌');
        await message.reply(`❌ Ошибка: ${errors.join(', ')}`);
        return;
      }

      if (results.length > 0) {
        const profile = results[0];

        // Берём displayName с сервера из БД (то же имя что на сайте)
        const discordDisplayName = this.db.getUserStats(message.author.id)?.username || message.member?.displayName || message.author.username;

        // Сохраняем в БД
        this.db.upsertCheaterCheck({
          ...profile,
          checkedByDiscordId: message.author.id,
          checkedByUsername: discordDisplayName
        });

        // Уведомление админу
        if (this.telegram && this.telegram.sendNewCheaterNotification) {
          try {
            await this.telegram.sendNewCheaterNotification(discordDisplayName, 'discord', [{
              personaName: profile.personaName || profile.steamId,
              profileUrl: profile.profileUrl || `https://steamcommunity.com/profiles/${profile.steamId}`,
              steamId: profile.steamId,
            }]);
          } catch (err) {
            console.error('[VacHandler] Ошибка отправки уведомления:', err.message);
          }
        }

        // Строим и отправляем embed
        const embed = this.buildProfileEmbed(profile, discordDisplayName);
        await message.reply({ embeds: [embed] });

        // Убираем 🔍, ставим ✅
        await message.reactions.cache.get('🔍')?.remove();
        await message.react('✅');
      }

      // Если были ошибки помимо результатов — сообщаем
      if (errors.length > 0 && results.length > 0) {
        await message.channel.send(`⚠️ Предупреждения: ${errors.join(', ')}`);
      }
    } catch (err) {
      await message.reactions.cache.get('🔍')?.remove();
      await message.react('❌');
      await message.reply('❌ Произошла ошибка при проверке профиля.');
    }
  }

  /**
   * Обработка команды .!. vac N
   * Сканирует последние N сообщений в канале, находит Steam-ссылки, проверяет новые
   */
  async handleVacListCommand(message, count) {
    // Валидация count
    if (isNaN(count) || count < 1 || count > 100) {
      await message.reply('❌ Укажите число от 1 до 100. Пример: `.!. vac 10`');
      return;
    }

    await message.react('🔍');

    try {
      // Сканируем последние N сообщений в канале
      const messages = await message.channel.messages.fetch({ limit: count });
      
      // Извлекаем Steam-ссылки из сообщений
      const steamUrlRegex = /https?:\/\/steamcommunity\.com\/(id|profiles)\/[^\s]+/gi;
      const foundUrls = new Set(); // Set для уникальности
      
      messages.forEach(msg => {
        if (msg.author.bot) return; // Пропускаем сообщения ботов
        const matches = msg.content.match(steamUrlRegex);
        if (matches) {
          matches.forEach(url => foundUrls.add(url.replace(/[,;]$/, ''))); // Убираем запятые/точки с запятой в конце
        }
      });

      if (foundUrls.size === 0) {
        await message.reactions.cache.get('🔍')?.remove();
        await message.reply(`📭 В последних ${count} сообщениях Steam-ссылок не найдено.`);
        return;
      }

      // Фильтруем: пропускаем те, что уже есть в БД без изменений
      const urlsToCheck = [];
      const alreadyInDb = [];

      for (const url of foundUrls) {
        // Пытаемся извлечь steamId из URL для проверки в БД
        const { parseSteamUrl } = await import('../steam/urlParser.js');
        const parsed = parseSteamUrl(url);
        
        if (parsed && parsed.type === 'steamid64') {
          const existing = this.db.getCheaterCheckBySteamId(parsed.value);
          if (existing) {
            alreadyInDb.push(existing);
            continue; // Пропускаем — уже в базе
          }
        }
        
        urlsToCheck.push(url);
      }

      let newResults = [];
      let errors = [];

      // Проверяем только новые ссылки через Steam API
      if (urlsToCheck.length > 0) {
        const result = await checkProfiles(urlsToCheck);
        newResults = result.results || [];
        errors = result.errors || [];

        // Сохраняем новые результаты в БД
        const discordDisplayName2 = this.db.getUserStats(message.author.id)?.username || message.member?.displayName || message.author.username;
        for (const profile of newResults) {
          this.db.upsertCheaterCheck({
            ...profile,
            checkedByDiscordId: message.author.id,
            checkedByUsername: discordDisplayName2
          });
        }

        // Уведомление админу о новых профилях
        if (newResults.length > 0 && this.telegram && this.telegram.sendNewCheaterNotification) {
          try {
            const profiles = newResults.map(p => ({
              personaName: p.personaName || p.steamId,
              profileUrl: p.profileUrl || `https://steamcommunity.com/profiles/${p.steamId}`,
              steamId: p.steamId,
            }));
            await this.telegram.sendNewCheaterNotification(discordDisplayName2, 'discord', profiles);
          } catch (err) {
            console.error('[VacHandler] Ошибка отправки уведомления:', err.message);
          }
        }
      }

      await message.reactions.cache.get('🔍')?.remove();

      // Отправляем результаты только для новых (не дублируем уже проверенных)
      if (newResults.length === 0 && alreadyInDb.length > 0) {
        await message.reply(`✅ Найдено ${foundUrls.size} ссылок в ${count} сообщениях.\n📋 Все ${alreadyInDb.length} уже проверены ранее — новых нет.`);
        return;
      }

      if (newResults.length === 0 && alreadyInDb.length === 0) {
        await message.reply(`📭 Не удалось проверить ни одного профиля.${errors.length > 0 ? '\n⚠️ ' + errors.join(', ') : ''}`);
        return;
      }

      // Отправляем embed'ы для новых результатов пакетами по 5
      const batchSize = 5;
      for (let i = 0; i < newResults.length; i += batchSize) {
        const batch = newResults.slice(i, i + batchSize);
        const embeds = batch.map(profile => this.buildProfileEmbed(profile, message.author.username));

        await message.channel.send({ embeds });

        if (i + batchSize < newResults.length) {
          await delay(2000);
        }
      }

      let summary = `✅ Проверено: ${newResults.length} новых профилей`;
      if (alreadyInDb.length > 0) {
        summary += ` | Пропущено (уже в базе): ${alreadyInDb.length}`;
      }
      if (errors.length > 0) {
        summary += `\n⚠️ Ошибки: ${errors.join(', ')}`;
      }
      await message.channel.send(summary);
      await message.react('✅');

    } catch (err) {
      await message.reactions.cache.get('🔍')?.remove();
      await message.react('❌');
      await message.reply('❌ Ошибка при сканировании сообщений.');
      console.error('Ошибка handleVacListCommand:', err);
    }
  }

  /**
   * Обработка команды .!. vac-help
   * Отвечает embed-сообщением со справкой
   */
  async handleHelpCommand(message) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.INFO)
      .setTitle('ℹ️ VAC Чекер — Справка')
      .setDescription('Проверка Steam-профилей на VAC-баны, игровые баны и ограничения')
      .addFields(
        {
          name: '🔍 Используемые сервисы',
          value: 'Steam Web API (GetPlayerBans, GetPlayerSummaries, ResolveVanityURL)'
        },
        {
          name: '📋 Команды',
          value: '`.!. <steam_url>` — проверить профиль\n`.!. vac N` — сканировать последние N сообщений в чате и проверить найденные ссылки\n`.!. vac-help` — эта справка'
        },
        {
          name: '🔗 Форматы ссылок',
          value: '`https://steamcommunity.com/id/USERNAME`\n`https://steamcommunity.com/profiles/STEAMID64`'
        },
        {
          name: '🌐 Веб-версия',
          value: `Проверить читера также можно на сайте:\nhttp://${SERVER_CONFIG.IP}:${SERVER_CONFIG.PORT}/cheater-checker.html`
        },
        {
          name: '📢 Публикация в Discord',
          value: 'Опубликовать результат проверки в Discord может администратор или тот, кто добавил читера на сайт'
        },
        {
          name: '🔎 Сторонние ресурсы для ручной проверки',
          value: '[steamid.io](https://steamid.io) — информация о профиле и SteamID\n[bansearch.com](https://bansearch.com/) — проверяет VAC-баны, game-баны, BattlEye, FaceIT, Easy Anti-Cheat и infiSTAR одновременно на одной странице, запрашивая данные у официальных провайдеров в реальном времени\n[vac-ban.com](https://vac-ban.com/) — помимо стандартных банов показывает анализ риска читерства, интеграцию с FACEIT ELO, Leetify, а также интерактивную карту сети из 770+ забаненных профессиональных CS2 игроков\n[vacbanchecker](https://vacbanchecker.skincade.com/) — база из 15+ миллионов профилей, проверяет VAC, game ban, trade ban и community ban\n[vacwatch.net](https://vacwatch.net/) — трекер, позволяет следить за аккаунтами и получать уведомления при появлении бана\n[sihrep.com](https://sihrep.com/ru) — специализируется на репутации трейдеров скинами: рейтинг, отзывы, VAC-статус, FACEIT и стоимость аккаунта\n'
        }
      )
      .setFooter({ text: 'Steam VAC Checker • Powered by Steam Web API' });

    await message.reply({ embeds: [embed] });
  }

  /**
   * Публикация embed в Discord-ветку VAC_THREAD_ID
   * @param {string} steamId — SteamID64 профиля из БД
   * @returns {Promise<string|null>} URL отправленного сообщения или null
   */
  async publishToDiscord(steamId) {
    const profile = this.db.getCheaterCheckBySteamId(steamId);
    if (!profile) {
      return null;
    }

    const embed = this.buildProfileEmbed(profile);

    const channel = await this.client.channels.fetch(STEAM_CONFIG.VAC_THREAD_ID);
    if (!channel) {
      throw new Error('Не удалось найти Discord-ветку для публикации');
    }

    const sentMessage = await channel.send({ embeds: [embed] });
    return sentMessage.url;
  }
}
