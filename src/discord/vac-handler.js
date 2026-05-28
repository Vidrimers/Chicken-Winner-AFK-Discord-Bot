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
  constructor(db, discordClient) {
    this.db = db;
    this.client = discordClient;
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

        // Сохраняем в БД
        this.db.upsertCheaterCheck({
          ...profile,
          checkedByDiscordId: message.author.id,
          checkedByUsername: message.author.username
        });

        // Строим и отправляем embed
        const embed = this.buildProfileEmbed(profile, message.author.username);
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
   * Выводит последние N забаненных профилей из БД пакетами по 5
   */
  async handleVacListCommand(message, count) {
    // Валидация count
    if (isNaN(count) || count < 1 || count > 100) {
      await message.reply('❌ Укажите число от 1 до 100. Пример: `.!. vac 10`');
      return;
    }

    // Предупреждение при N > 50
    if (count > 50) {
      await message.reply(`⚠️ Запрошено ${count} записей. Это может занять некоторое время...`);
    }

    const profiles = this.db.getBannedProfiles(count);

    if (profiles.length === 0) {
      await message.reply('📭 Забаненных профилей в базе не найдено.');
      return;
    }

    // Отправляем пакетами по 5 с задержкой 2 секунды
    const batchSize = 5;
    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);
      const embeds = batch.map(profile => this.buildProfileEmbed(profile));

      await message.channel.send({ embeds });

      // Задержка между пакетами (кроме последнего)
      if (i + batchSize < profiles.length) {
        await delay(2000);
      }
    }

    await message.channel.send(`✅ Показано ${profiles.length} из ${count} запрошенных забаненных профилей.`);
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
          value: '`.!. <steam_url>` — проверить профиль\n`.!. vac N` — последние N забаненных (1-100)\n`.!. vac-help` — эта справка'
        },
        {
          name: '🔗 Форматы ссылок',
          value: '`https://steamcommunity.com/id/USERNAME`\n`https://steamcommunity.com/profiles/STEAMID64`'
        },
        {
          name: '🌐 Веб-версия',
          value: `http://${SERVER_CONFIG.IP}:${SERVER_CONFIG.PORT}/cheater-checker.html`
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
