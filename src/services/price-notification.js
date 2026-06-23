import { log, error as logError } from '../utils/logger.js';

/**
 * Сервис проверки изменения цен и отправки уведомлений
 */
export class PriceNotificationService {
  constructor(gamesDb, discordClient, telegram) {
    this.gamesDb = gamesDb;
    this.discordClient = discordClient;
    this.telegram = telegram;
    this.checkInterval = null;
  }

  /**
   * Запуск периодической проверки цен
   */
  start() {
    this.scheduleNext();
    log('💰 Price notification service запущен');
    // Первая проверка через 5 минут после запуска
    setTimeout(() => this.checkPrices(), 5 * 60 * 1000);
  }

  scheduleNext() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    const hours = this.gamesDb.getPriceCheckInterval();
    const ms = hours * 60 * 60 * 1000;
    this.checkInterval = setInterval(() => this.checkPrices(), ms);
    log(`💰 Следующая проверка цен через ${hours}ч`);
  }

  restart() {
    this.scheduleNext();
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Проверка цен для всех игр в избранном
   */
  async checkPrices() {
    try {
      log('💰 Проверка изменения цен...');

      const usersWithNotifications = this.gamesDb.getUsersWithNotifications();
      if (usersWithNotifications.length === 0) {
        log('💰 Нет пользователей с уведомлениями о ценах');
        return;
      }

      // Собираем все уникальные слаги игр из избранного
      const allFavoriteSlugs = this.gamesDb.getFavoriteSlugs();
      if (allFavoriteSlugs.length === 0) {
        log('💰 Нет игр в избранном у пользователей');
        return;
      }

      // Получаем актуальные цены для каждой игры
      const priceUpdates = [];

      for (const slug of allFavoriteSlugs) {
        try {
          // Получаем старые цены из кэша
          const oldPrices = this.gamesDb.getCachedPrices(slug);

          // Запрашиваем свежие цены из API
          const apiRes = await fetch(`https://api.hot.game/game/${slug}/main-info?currency=RUB`);
          if (!apiRes.ok) continue;

          const apiData = await apiRes.json();
          if (!apiData.min_prices_by_region) continue;

          // Сохраняем новые цены
          const newPrices = [];
          for (const [region, regionPrices] of Object.entries(apiData.min_prices_by_region)) {
            for (const price of regionPrices) {
              newPrices.push({
                region: region,
                currency: price.currency,
                price: price.price,
                old_price: null,
                discount: price.percent_discount || 0,
                platform: price.platform,
                store_name: price.platform,
                store_url: null,
              });
            }
          }

          // Сравниваем с старыми ценами
          for (const newPrice of newPrices) {
            const oldPrice = oldPrices.find(
              (op) => op.region === newPrice.region && op.platform === newPrice.platform
            );

            if (oldPrice && oldPrice.price !== newPrice.price) {
              priceUpdates.push({
                slug,
                title: apiData.title,
                region: newPrice.region,
                platform: newPrice.platform,
                oldPrice: oldPrice.price,
                newPrice: newPrice.price,
                currency: newPrice.currency,
                hgLink: apiData.hg_link,
              });
            }
          }

          // Обновляем кэш цен
          this.gamesDb.upsertGamePrices(slug, newPrices);

          // Сохраняем историю цен для графиков
          const minPrice = newPrices.length > 0
            ? Math.min(...newPrices.map((p) => p.price || Infinity))
            : null;
          if (minPrice != null && minPrice < Infinity) {
            this.gamesDb.addPriceHistory(slug, minPrice, 'RUB');
          }

          // Небольшая задержка между запросами к API
          await new Promise((r) => setTimeout(r, 500));
        } catch (err) {
          logError(`💰 Ошибка проверки цен для ${slug}: ${err.message}`);
        }
      }

      if (priceUpdates.length === 0) {
        log('💰 Изменений цен не обнаружено');
        return;
      }

      log(`💰 Обнаружено ${priceUpdates.length} изменений цен, отправка уведомлений...`);

      // Группируем по пользователям
      for (const user of usersWithNotifications) {
        const userFavorites = this.gamesDb.getUserFavorites(user.user_id);
        const favoriteSlugs = new Set(userFavorites.map((f) => f.game_slug));

        // Фильтруем обновления для этого пользователя
        const userUpdates = priceUpdates.filter((u) => favoriteSlugs.has(u.slug));
        if (userUpdates.length === 0) continue;

        // Отправляем Discord DM
        if (user.notify_discord && this.discordClient) {
          try {
            const discordUser = await this.discordClient.users.fetch(user.user_id);
            if (discordUser) {
              const message = this.formatDiscordMessage(userUpdates);
              await discordUser.send(message);
              log(`💰 Discord уведомление отправлено ${user.user_id}`);
            }
          } catch (err) {
            logError(`💰 Ошибка отправки Discord DM ${user.user_id}: ${err.message}`);
          }
        }

        // Отправляем Telegram
        if (user.notify_telegram && user.telegram_chat_id && this.telegram) {
          try {
            const message = this.formatTelegramMessage(userUpdates);
            await this.telegram.sendTelegramMessageToUser(user.telegram_chat_id, message);
            log(`💰 Telegram уведомление отправлено ${user.user_id}`);
          } catch (err) {
            logError(`💰 Ошибка отправки Telegram ${user.user_id}: ${err.message}`);
          }
        }
      }

      log(`💰 Проверка цен завершена. Уведомлений отправлено.`);

      // Очистка старых записей истории (старше 90 дней)
      this.gamesDb.cleanOldPriceHistory(90);
    } catch (error) {
      logError(`💰 Ошибка проверки цен: ${error.message}`);
    }
  }

  /**
   * Форматирование сообщения для Discord
   */
  formatDiscordMessage(updates) {
    let message = '💰 **Изменение цен на игры!**\n\n';

    for (const update of updates.slice(0, 10)) {
      const diff = update.newPrice - update.oldPrice;
      const arrow = diff > 0 ? '📈' : '📉';
      const diffText = diff > 0 ? `+${diff}` : `${diff}`;

      message += `${arrow} **${update.title}**\n`;
      message += `  ${update.oldPrice} → ${update.newPrice} (${diffText})\n`;
      message += `  Платформа: ${update.platform} | Регион: ${update.region}\n`;
      message += `  <${update.hgLink}>\n\n`;
    }

    if (updates.length > 10) {
      message += `... и ещё ${updates.length - 10} игр`;
    }

    return message;
  }

  /**
   * Форматирование сообщения для Telegram
   */
  formatTelegramMessage(updates) {
    let message = '💰 <b>Изменение цен на игры!</b>\n\n';

    for (const update of updates.slice(0, 10)) {
      const diff = update.newPrice - update.oldPrice;
      const arrow = diff > 0 ? '📈' : '📉';
      const diffText = diff > 0 ? `+${diff}` : `${diff}`;

      message += `${arrow} <b>${update.title}</b>\n`;
      message += `  ${update.oldPrice} → ${update.newPrice} (${diffText})\n`;
      message += `  Платформа: ${update.platform} | Регион: ${update.region}\n`;
      message += `  <a href="${update.hgLink}">Открыть</a>\n\n`;
    }

    if (updates.length > 10) {
      message += `... и ещё ${updates.length - 10} игр`;
    }

    return message;
  }
}
