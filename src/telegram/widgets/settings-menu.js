/**
 * Rich Message: Настройки
 */

import { buildButtonRow } from '../rich-message.js';

/**
 * Подменю: Время до AFK
 * @param {number} current — текущее значение
 * @returns {string} HTML
 */
export function buildTimeoutRichHtml(current) {
  const opts = [15, 30, 45];
  const rows = opts.map(v =>
    buildButtonRow([[`${current === v ? '👉 ' : ''}${v} минут`, `settings_set_timeout_${v}`, current === v ? 'success' : 'link']])
  ).join('\n');

  return `<h2>⏱ Время до AFK</h2>
<p>Выберите время неактивности:</p>
${rows}
${buildButtonRow([['◀️ Назад', 'menu_settings', 'link']], 'center')}`;
}

/**
 * Подменю: Уведомления о читерах и ботах
 * @param {object} s — { own, others, nick, botOwn, botOthers, botNick }
 * @returns {string} HTML
 */
export function buildCheaterSettingsRichHtml(s) {
  const yn = (v) => v ? '✅' : '❌';
  const st = (v) => v ? 'success' : 'danger';

  return `<h2>🚨 Уведомления</h2>
<p>Выберите опцию:</p>

<blockquote>🔍 Читеры</blockquote>
${buildButtonRow([[`${yn(s.own)} Мои читеры`, 'settings_toggle_cheater_own', st(s.own)]])}
${buildButtonRow([[`${yn(s.others)} Чужие читеры`, 'settings_toggle_cheater_others', st(s.others)]])}
${buildButtonRow([[`${yn(s.nick)} Смена ников`, 'settings_toggle_cheater_nick', st(s.nick)]])}

<blockquote>🤖 Боты</blockquote>
${buildButtonRow([[`${yn(s.botOwn)} Мои боты`, 'settings_toggle_bot_own', st(s.botOwn)]])}
${buildButtonRow([[`${yn(s.botOthers)} Чужие боты`, 'settings_toggle_bot_others', st(s.botOthers)]])}
${buildButtonRow([[`${yn(s.botNick)} Смена ников ботов`, 'settings_toggle_bot_nick', st(s.botNick)]])}

${buildButtonRow([['◀️ Назад', 'menu_settings', 'link']], 'center')}`;
}

/**
 * Подменю: Steam аккаунт
 * @param {string|null} steamId
 * @returns {string} HTML
 */
export function buildSteamRichHtml(steamId) {
  const status = steamId
    ? `✅ Привязан: <code>${steamId}</code>`
    : '❌ Не привязан';

  const buttons = steamId
    ? buildButtonRow([['🗑️ Отвязать Steam', 'settings_unlink_steam', 'danger']])
    : buildButtonRow([['🔗 Привязать Steam ID', 'settings_link_steam', 'success']]);

  return `<h2>🎮 Steam аккаунт</h2>
<p>${status}</p>
<p>Привяжи Steam ID чтобы показывать CS2 статистику на профиле.</p>
<p>💡 Не знаешь свой Steam ID? В клиенте Steam нажми на свой ник сверху → <b>Об аккаунте</b> — ID будет указан под именем. Или найди через <a href="https://steamid.io">steamid.io</a></p>
${buttons}
${buildButtonRow([['◀️ Назад', 'menu_settings', 'link']], 'center')}`;
}

/**
 * Inline keyboard: Время до AFK (fallback)
 */
export function buildTimeoutInlineKeyboard(current) {
  const opts = [15, 30, 45];
  const rows = opts.map(v =>
    [{ text: `${current === v ? '👉 ' : ''}${v} минут`, callback_data: `settings_set_timeout_${v}` }]
  );
  rows.push([{ text: '◀️ Назад', callback_data: 'menu_settings' }]);
  return { inline_keyboard: rows };
}

/**
 * Inline keyboard: Уведомления о читерах (fallback)
 */
export function buildCheaterSettingsInlineKeyboard(s) {
  const yn = (v) => v ? '✅' : '❌';
  return {
    inline_keyboard: [
      [{ text: `${yn(s.own)} Мои читеры`, callback_data: 'settings_toggle_cheater_own' }],
      [{ text: `${yn(s.others)} Чужие читеры`, callback_data: 'settings_toggle_cheater_others' }],
      [{ text: `${yn(s.nick)} Смена ников`, callback_data: 'settings_toggle_cheater_nick' }],
      [{ text: '— — — — —', callback_data: 'noop' }],
      [{ text: `${yn(s.botOwn)} Мои боты`, callback_data: 'settings_toggle_bot_own' }],
      [{ text: `${yn(s.botOthers)} Чужие боты`, callback_data: 'settings_toggle_bot_others' }],
      [{ text: `${yn(s.botNick)} Смена ников ботов`, callback_data: 'settings_toggle_bot_nick' }],
      [{ text: '◀️ Назад', callback_data: 'menu_settings' }]
    ]
  };
}

/**
 * Inline keyboard: Steam (fallback)
 */
export function buildSteamInlineKeyboard(steamId) {
  const buttons = [];
  if (steamId) {
    buttons.push([{ text: `✅ Привязан: ${steamId}`, callback_data: 'noop' }]);
    buttons.push([{ text: '🗑️ Отвязать Steam', callback_data: 'settings_unlink_steam' }]);
  } else {
    buttons.push([{ text: '❌ Не привязан', callback_data: 'noop' }]);
    buttons.push([{ text: '🔗 Привязать Steam ID', callback_data: 'settings_link_steam' }]);
  }
  buttons.push([{ text: '◀️ Назад', callback_data: 'menu_settings' }]);
  return { inline_keyboard: buttons };
}

/**
 * Сгенерировать HTML виджет настроек (Bot API 10.4)
 * @param {object} settings
 * @returns {string} HTML
 */
export function buildSettingsWidget(settings) {
  const { dm, timeout, achievement, channel, mention, steamId } = settings;
  const timeoutDisplay = timeout < 15 ? `${timeout} сек` : `${timeout} мин`;

  return `<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--tg-theme-bg-color, #fff);
    color: var(--tg-theme-text-color, #000);
    padding: 16px;
    min-height: 100vh;
  }
  .header { text-align: center; margin-bottom: 16px; }
  .title { font-size: 20px; font-weight: 700; color: var(--tg-theme-hint-color, #888); }
  .subtitle { font-size: 13px; color: var(--tg-theme-hint-color, #888); margin-top: 4px; }
  .section-title {
    font-size: 13px; font-weight: 600; color: var(--tg-theme-hint-color, #888);
    text-transform: uppercase; letter-spacing: 0.5px;
    margin: 14px 0 8px 0; padding-bottom: 4px;
    border-bottom: 1px solid var(--tg-theme-section-separator-color, #e0e0e0);
  }
  .btn {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 12px 14px; border: none; border-radius: 10px;
    font-size: 13px; font-weight: 600; cursor: pointer;
    width: 100%; margin-bottom: 8px;
    transition: opacity 0.2s, transform 0.1s;
    -webkit-tap-highlight-color: transparent; user-select: none;
  }
  .btn:active { opacity: 0.8; transform: scale(0.97); }
  .btn.on { background: #4CAF50; color: #fff; }
  .btn.off { background: #f44336; color: #fff; }
  .btn.nav { background: var(--tg-theme-secondary-bg-color, #f0f0f0); color: var(--tg-theme-text-color, #000); }
  .btn .icon { font-size: 16px; line-height: 1; }
  .btn .status { font-size: 12px; opacity: 0.8; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">⚙️ Настройки</div>
    <div class="subtitle">Нажмите на настройку чтобы изменить</div>
  </div>

  <div class="section-title">📩 Discord уведомления</div>
  <button class="btn ${dm ? 'on' : 'off'}" onclick="TelegramWidget.request('settings_toggle_dm')">
    <span>📩 ЛС уведомления</span><span class="status">${dm ? '✅' : '❌'}</span>
  </button>
  <button class="btn ${achievement ? 'on' : 'off'}" onclick="TelegramWidget.request('settings_toggle_achievement')">
    <span>🏆 Достижения</span><span class="status">${achievement ? '✅' : '❌'}</span>
  </button>
  <button class="btn ${mention ? 'on' : 'off'}" onclick="TelegramWidget.request('settings_toggle_mention')">
    <span>💬 Упоминания</span><span class="status">${mention ? '✅' : '❌'}</span>
  </button>

  <div class="section-title">📱 Telegram уведомления</div>
  <button class="btn ${channel ? 'on' : 'off'}" onclick="TelegramWidget.request('settings_toggle_channel')">
    <span>🔔 Кто в канале</span><span class="status">${channel ? '✅' : '❌'}</span>
  </button>
  <button class="btn nav" onclick="TelegramWidget.request('settings_cheater_menu')">
    <span>🚨 Уведомления о читерах</span><span class="status">›</span>
  </button>

  <div class="section-title">⏱ Таймеры</div>
  <button class="btn nav" onclick="TelegramWidget.request('settings_change_timeout')">
    <span>⏱ Время до AFK</span><span class="status">${timeoutDisplay} ›</span>
  </button>

  <div class="section-title">🎮 Аккаунт</div>
  <button class="btn ${steamId ? 'on' : 'off'}" onclick="TelegramWidget.request('settings_steam_menu')">
    <span>🎮 Steam</span><span class="status">${steamId ? '✅' : '❌'}</span>
  </button>

  <button class="btn nav" onclick="TelegramWidget.request('back_to_menu')" style="margin-top:12px;">
    <span>◀️ Назад</span>
  </button>
</body>
</html>`;
}

/**
 * Сгенерировать HTML настроек для Rich Message
 * @param {object} settings — { dm, timeout, achievement, channel, cheaterOwn, cheaterOthers, mention, steamId }
 * @returns {string} HTML
 */
export function buildSettingsRichHtml(settings) {
  const { dm, timeout, achievement, channel, mention, steamId } = settings;
  const timeoutDisplay = timeout < 15 ? `${timeout} сек` : `${timeout} мин`;
  const yn = (v) => v ? '✅' : '❌';

  return `<h2>⚙️ Настройки</h2>
<p>Нажмите на настройку чтобы изменить:</p>

<blockquote>📩 Discord уведомления</blockquote>
${buildButtonRow([[
  `${yn(dm)} ЛС уведомления`, 'settings_toggle_dm', dm ? 'success' : 'danger'
]])}
${buildButtonRow([[
  `${yn(achievement)} Достижения`, 'settings_toggle_achievement', achievement ? 'success' : 'danger'
]])}
${buildButtonRow([[
  `${yn(mention)} Упоминания`, 'settings_toggle_mention', mention ? 'success' : 'danger'
]])}

<blockquote>📱 Telegram уведомления</blockquote>
${buildButtonRow([[
  `${yn(channel)} Кто в канале`, 'settings_toggle_channel', channel ? 'success' : 'danger'
]])}
${buildButtonRow([[
  `🚨 Уведомления о читерах`, 'settings_cheater_menu', 'link'
]])}

<blockquote>⏱ Таймеры</blockquote>
${buildButtonRow([[
  `⏱ AFK: ${timeoutDisplay}`, 'settings_change_timeout', 'link'
]])}

<blockquote>🎮 Аккаунт</blockquote>
${buildButtonRow([[
  `${steamId ? '✅' : '❌'} Steam ${steamId ? '(' + steamId + ')' : ''}`, 'settings_steam_menu', steamId ? 'success' : 'danger'
]])}

${buildButtonRow([['◀️ Назад', 'back_to_menu', 'link']], 'center')}`;
}

/**
 * Сгенерировать inline_keyboard настроек (fallback)
 */
export function buildSettingsInlineKeyboard(settings) {
  const { dm, timeout, achievement, channel, mention, steamId } = settings;
  const timeoutDisplay = timeout < 15 ? `${timeout} сек` : `${timeout} мин`;
  const yn = (v) => v ? '✅' : '❌';

  return {
    inline_keyboard: [
      [{ text: `${yn(dm)} ЛС уведомления · Для Discord`, callback_data: 'settings_toggle_dm' }],
      [{ text: `⏱ Время до AFK [${timeoutDisplay}] · Для Discord`, callback_data: 'settings_change_timeout' }],
      [{ text: `${yn(achievement)} Уведомления о достижениях · Для Discord`, callback_data: 'settings_toggle_achievement' }],
      [{ text: `${yn(channel)} Кто в канале · Для Telegram`, callback_data: 'settings_toggle_channel' }],
      [{ text: `🚨 Уведомления о читерах · Для Telegram`, callback_data: 'settings_cheater_menu' }],
      [{ text: `${yn(mention)} Упоминания · Для Discord`, callback_data: 'settings_toggle_mention' }],
      [{ text: `${steamId ? '✅' : '❌'} Steam [${steamId ? steamId : '—'}]`, callback_data: 'settings_steam_menu' }],
      [{ text: '◀️ Назад', callback_data: 'back_to_menu' }]
    ]
  };
}
