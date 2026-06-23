import { Router } from "express";

// Rate limiting для Hot.Game API
const apiCallTimestamps = [];
const API_RATE_LIMIT = 30; // максимум запросов в минуту
const API_RATE_WINDOW = 60 * 1000; // окно 1 минута

function canCallApi() {
  const now = Date.now();
  // Удаляем старые записи
  while (apiCallTimestamps.length > 0 && apiCallTimestamps[0] < now - API_RATE_WINDOW) {
    apiCallTimestamps.shift();
  }
  return apiCallTimestamps.length < API_RATE_LIMIT;
}

function recordApiCall() {
  apiCallTimestamps.push(Date.now());
}

export function createGamePricesRouter(db, gamesDb, discordClient, telegram, priceNotificationService) {
  const router = Router();

  // ===== SEARCH =====
  router.get("/search", async (req, res) => {
    try {
      const { q, platform, sort, currency, limit = 50 } = req.query;

      if (!q || q.trim().length < 2) {
        return res.json([]);
      }

      let results = gamesDb.searchGames(q.trim(), parseInt(limit));

      // Если в БД мало результатов — пробуем поиск через API
      if (results.length === 0) {
        if (!canCallApi()) {
          console.warn("Hot.Game API rate limit exceeded, skipping search");
          return res.json(results);
        }
        try {
          const apiRes = await fetch("https://api.hot.game/method/all-games");
          if (apiRes.ok) {
            recordApiCall();
            const allGames = await apiRes.json();
            const query = q.trim().toLowerCase();
            const matched = allGames.filter(
              (g) =>
                g.title?.toLowerCase().includes(query) ||
                g.slug?.toLowerCase().includes(query)
            ).slice(0, parseInt(limit));

            // Сохраняем найденные игры в БД
            if (matched.length > 0) {
              gamesDb.upsertManyGames(matched);
              results = gamesDb.searchGames(q.trim(), parseInt(limit));
            }
          }
        } catch (apiErr) {
          console.error("Ошибка API при поиске:", apiErr.message);
        }
      }

      // Сортировка
      if (sort === "price_asc" || sort === "price_desc") {
        results = results.map((game) => {
          const prices = gamesDb.getCachedPrices(game.slug);
          const minPrice = prices.length > 0
            ? Math.min(...prices.map((p) => p.price || Infinity))
            : Infinity;
          return { ...game, _minPrice: minPrice };
        });
        results.sort((a, b) =>
          sort === "price_asc"
            ? a._minPrice - b._minPrice
            : b._minPrice - a._minPrice
        );
        results = results.map(({ _minPrice, ...rest }) => rest);
      } else if (sort === "name_asc") {
        results.sort((a, b) => a.title.localeCompare(b.title));
      } else if (sort === "name_desc") {
        results.sort((a, b) => b.title.localeCompare(a.title));
      }

      // Фильтр по платформе (если есть закэшированные цены)
      if (platform) {
        results = results.filter((game) => {
          const prices = gamesDb.getCachedPrices(game.slug);
          if (prices.length === 0) return true;
          return prices.some((p) => p.platform === platform);
        });
      }

      res.json(results);
    } catch (error) {
      console.error("Ошибка поиска игр:", error.message);
      res.status(500).json({ error: "Ошибка поиска" });
    }
  });

  // ===== POPULAR GAMES =====
  router.get("/popular", async (req, res) => {
    try {
      // Сначала из избранного пользователей
      let popular = gamesDb.getFavoritesCountBySlug();

      if (popular.length === 0) {
        // Если избранного нет — берём из API (горячие игры)
        try {
          const apiRes = await fetch("https://api.hot.game/method/all-games");
          if (apiRes.ok) {
            const allGames = await apiRes.json();
            popular = allGames.slice(0, 20).map((g) => ({
              slug: g.slug,
              title: g.title,
              hg_link: g.hg_link,
              cnt: 0,
            }));
          }
        } catch (apiErr) {
          console.error("Ошибка API:", apiErr.message);
        }
      } else {
        // Обогащаем данными из БД
        popular = popular.map((p) => {
          const game = gamesDb.getGameBySlug(p.game_slug);
          return { slug: p.game_slug, title: game?.title || p.game_slug, hg_link: game?.hg_link };
        });
      }

      res.json(popular);
    } catch (error) {
      console.error("Ошибка получения популярных игр:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  // ===== GAME INFO =====
  router.get("/game/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const { currency = "RUB" } = req.query;

      // Проверяем кэш в БД (обновляем если старше 24ч)
      let game = gamesDb.getGameBySlug(slug);
      const isStale =
        game && game.last_updated
          ? Date.now() - new Date(game.last_updated).getTime() > 24 * 60 * 60 * 1000
          : true;

      if (!game || isStale) {
        // Запрашиваем из API
        if (!canCallApi()) {
          console.warn("Hot.Game API rate limit exceeded, using cached data");
          if (!game) {
            return res.status(404).json({ error: "Игра не найдена (кэш пуст)" });
          }
        } else {
          try {
            const apiRes = await fetch(
              `https://api.hot.game/game/${slug}/main-info?currency=${currency}`
            );
            if (apiRes.ok) {
              recordApiCall();
              const apiData = await apiRes.json();

              // Сохраняем/обновляем基本信息
              gamesDb.upsertGame(apiData);

              // Парсим данные со страницы игры (poster, description, store links)
              try {
                const pageRes = await fetch(`https://hot.game/ru-kz/game/${slug}`, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });
                if (pageRes.ok) {
                  const html = await pageRes.text();
                  const updates = {};

                  // Poster
                  const ogImg = html.match(/property="og:image"\s+content="([^"]+)"/);
                  if (ogImg) updates.poster = ogImg[1];

                  // Description
                  const ogDesc = html.match(/name="description"\s+content="([^"]+)"/);
                  if (ogDesc) updates.description = ogDesc[1];

                  // Store links: data-href + data-price-source
                  const storeLinks = [];
                  const storeRegex = /data-href="([^"]+)"[^>]*class="hidden-link2 hidden-link-game-price"[^>]*>[\s\S]*?data-price-source="([^"]*)"[^>]*data-activation="([^"]*)"/g;
                  let m;
                  while ((m = storeRegex.exec(html)) !== null) {
                    const url = m[1].replace(/&amp;/g, '&');
                    const source = m[2];
                    const activation = m[3];
                    if (!storeLinks.find(s => s.url === url)) {
                      storeLinks.push({ url, source, activation });
                    }
                  }
                  if (storeLinks.length > 0) {
                    updates.screenshots = JSON.stringify(storeLinks);
                  }

                  if (Object.keys(updates).length > 0) {
                    gamesDb.updateGameInfo(slug, updates);
                  }
                }
              } catch (e) { /* не критично */ }

              // Сохраняем цены
              if (apiData.min_prices_by_region) {
                const allPrices = [];
                for (const [region, regionPrices] of Object.entries(apiData.min_prices_by_region)) {
                  for (const price of regionPrices) {
                    allPrices.push({
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
              gamesDb.upsertGamePrices(slug, allPrices);
            }

            game = gamesDb.getGameBySlug(slug);
          }
        } catch (apiErr) {
          console.error(`Ошибка API для ${slug}:`, apiErr.message);
        }
        }
      }

      if (!game) {
        return res.status(404).json({ error: "Игра не найдена" });
      }

      // Если poster/description не заполнены — парсим страницу
      if (!game.poster || !game.description) {
        try {
          console.log(`[game] Парсим страницу для ${slug} (poster=${!!game.poster}, desc=${!!game.description})`);
          const pageRes = await fetch(`https://hot.game/ru-kz/game/${slug}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'Accept': 'text/html',
              'Accept-Language': 'ru',
            }
          });
          if (pageRes.ok) {
            const html = await pageRes.text();
            const updates = {};

            if (!game.poster) {
              const ogImg = html.match(/property="og:image"\s+content="([^"]+)"/);
              if (ogImg) updates.poster = ogImg[1];
            }

            if (!game.description) {
              const ogDesc = html.match(/name="description"\s+content="([^"]+)"/);
              if (ogDesc) updates.description = ogDesc[1];
            }

            if (!game.screenshots) {
              const storeLinks = [];
              const storeRegex = /data-href="([^"]+)"[^>]*class="hidden-link2 hidden-link-game-price"[\s\S]*?data-price-source="([^"]*)"/g;
              let m;
              while ((m = storeRegex.exec(html)) !== null) {
                const url = m[1].replace(/&amp;/g, '&');
                const source = m[2];
                if (!storeLinks.find(s => s.url === url)) {
                  storeLinks.push({ url, source });
                }
              }
              if (storeLinks.length > 0) {
                updates.screenshots = JSON.stringify(storeLinks);
              }
            }

            if (Object.keys(updates).length > 0) {
              console.log(`[game] Обновляем ${slug}:`, Object.keys(updates));
              gamesDb.updateGameInfo(slug, updates);
              game = gamesDb.getGameBySlug(slug);
            }
          }
        } catch (e) {
          console.error(`[game] Ошибка парсинга ${slug}:`, e.message);
        }
      }

      const prices = gamesDb.getCachedPrices(slug);
      const priceHistory = gamesDb.getOldPrices(slug);

      res.json({
        ...game,
        prices,
        priceHistory,
        screenshots: game.screenshots ? JSON.parse(game.screenshots) : [],
      });
    } catch (error) {
      console.error("Ошибка получения информации об игре:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  // ===== PRICE HISTORY =====
  router.get("/game/:slug/price-history", (req, res) => {
    try {
      const { slug } = req.params;
      const history = gamesDb.getOldPrices(slug);
      res.json(history);
    } catch (error) {
      console.error("Ошибка получения истории цен:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  // ===== FAVORITES =====
  router.get("/favorites", (req, res) => {
    try {
      const userId = req.query.user_id || req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ error: "Требуется user_id" });
      }

      const favorites = gamesDb.getUserFavorites(userId);
      res.json(favorites);
    } catch (error) {
      console.error("Ошибка получения избранного:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  router.post("/favorites", async (req, res) => {
    try {
      const { user_id, game_slug } = req.body;
      if (!user_id || !game_slug) {
        return res.status(400).json({ error: "user_id и game_slug обязательны" });
      }

      gamesDb.addFavorite(user_id, game_slug);

      // Записываем начальную цену для графика
      try {
        const currency = req.body.currency || 'RUB';
        const apiRes = await fetch(`https://api.hot.game/game/${game_slug}/main-info?currency=${currency}`);
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (apiData.min_prices_by_region) {
            let minPrice = Infinity;
            for (const regionPrices of Object.values(apiData.min_prices_by_region)) {
              for (const p of regionPrices) {
                if (p.price < minPrice) minPrice = p.price;
              }
            }
            if (minPrice < Infinity) {
              gamesDb.addPriceHistory(game_slug, minPrice, currency);
            }
          }
        }
      } catch (e) {
        // Не критично
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Ошибка добавления в избранное:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  router.delete("/favorites/:slug", (req, res) => {
    try {
      const userId = req.query.user_id || req.headers["x-user-id"];
      const { slug } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "Требуется user_id" });
      }

      gamesDb.removeFavorite(userId, slug);
      res.json({ success: true });
    } catch (error) {
      console.error("Ошибка удаления из избранного:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  router.get("/favorites/check/:slug", (req, res) => {
    try {
      const userId = req.query.user_id || req.headers["x-user-id"];
      const { slug } = req.params;

      if (!userId) {
        return res.json({ isFavorite: false });
      }

      const isFav = gamesDb.isFavorite(userId, slug);
      res.json({ isFavorite: isFav });
    } catch (error) {
      res.json({ isFavorite: false });
    }
  });

  // ===== NOTIFICATIONS =====
  router.get("/notifications", (req, res) => {
    try {
      const userId = req.query.user_id || req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ error: "Требуется user_id" });
      }

      const settings = gamesDb.getNotificationSettings(userId);
      res.json(settings);
    } catch (error) {
      console.error("Ошибка получения настроек уведомлений:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  router.post("/notifications", (req, res) => {
    try {
      const userId = req.body.user_id || req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ error: "Требуется user_id" });
      }

      gamesDb.setNotificationSettings(userId, req.body);
      res.json({ success: true });
    } catch (error) {
      console.error("Ошибка сохранения настроек уведомлений:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  // ===== POSTERS =====
  router.get("/posters", async (req, res) => {
    try {
      const { slugs } = req.query;
      if (!slugs) return res.json({});

      const slugList = slugs.split(',').slice(0, 10);
      const result = {};

      for (const slug of slugList) {
        const game = gamesDb.getGameBySlug(slug);
        if (game && game.poster) {
          result[slug] = game.poster;
          continue;
        }
        // Парсим данные со страницы
        try {
          if (!canCallApi()) continue;
          console.log(`[posters] Парсим ${slug}...`);
          const pageRes = await fetch(`https://hot.game/ru-kz/game/${slug}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'Accept': 'text/html',
              'Accept-Language': 'ru',
            }
          });
          console.log(`[posters] Ответ для ${slug}: ${pageRes.status}`);
          if (pageRes.ok) {
            recordApiCall();
            const html = await pageRes.text();
            const ogImg = html.match(/property="og:image"\s+content="([^"]+)"/);
            console.log(`[posters] og:image для ${slug}: ${ogImg ? ogImg[1] : 'не найден'}`);
            if (ogImg) {
              result[slug] = ogImg[1];
              gamesDb.setPoster(slug, ogImg[1]);
            }
          }
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {
          console.error(`[posters] Ошибка для ${slug}:`, e.message);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Ошибка получения постеров:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  // ===== ADMIN SETTINGS =====
  router.get("/admin/settings", (req, res) => {
    try {
      const interval = gamesDb.getPriceCheckInterval();
      res.json({ priceCheckIntervalHours: interval });
    } catch (error) {
      console.error("Ошибка получения настроек:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  router.post("/admin/settings", (req, res) => {
    try {
      const { priceCheckIntervalHours } = req.body;
      if (priceCheckIntervalHours !== undefined) {
        const hours = Math.max(1, Math.min(48, parseInt(priceCheckIntervalHours, 10) || 6));
        gamesDb.setPriceCheckInterval(hours);
        // Перезапускаем сервис с новым интервалом
        if (priceNotificationService) {
          priceNotificationService.restart();
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Ошибка сохранения настроек:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  return router;
}
