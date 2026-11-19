/**
 * Rich Message / Widget: Steam/Faceit статистика
 */

import { buildButtonRow } from '../rich-message.js';

/**
 * Прогресс-бар для rich message (код-блок)
 */
function bar(pct, width = 10) {
  if (pct === null || pct === undefined) return '—';
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${pct}%`;
}

/**
 * Сгенерировать HTML статистики для Rich Message
 * @param {string} username
 * @param {object} cs2 — CS2 статистика
 * @param {object|null} faceit — FACEIT статистика
 * @returns {string} HTML
 */
export function buildStatsRichHtml(username, cs2, faceit) {
  let html = `<h2>📊 Статистика ${escapeHtml(username)}</h2>\n`;

  // CS2
  html += `\n<blockquote>🎮 CS2 (Steam)</blockquote>\n`;
  if (cs2.private) {
    html += `<p>Профиль приватный</p>\n`;
  } else if (cs2.noData || cs2.totalMatchesPlayed === null) {
    html += `<p>Нет данных (не играл в CS2)</p>\n`;
  } else {
    html += `<p>K/D <code>${cs2.kd ?? '—'}</code>  ·  Матчи <code>${cs2.totalMatchesPlayed ?? '—'}</code>  ·  Часы <code>${cs2.hoursPlayed ?? '—'}ч</code></p>\n`;
    if (cs2.accountCreatedYear) html += `<p>Год аккаунта: <code>${cs2.accountCreatedYear}</code></p>\n`;
    html += `<pre>Winrate  ${bar(cs2.winRate)}\nHS%      ${bar(cs2.hsPercent)}</pre>\n`;
    html += `<p>Убийств <code>${cs2.totalKills ?? '—'}</code>  ·  Смертей <code>${cs2.totalDeaths ?? '—'}</code>  ·  Урон <code>${cs2.totalDamage ?? '—'}</code></p>\n`;
    html += `<p>MVP <code>${cs2.totalMvps ?? '—'}</code>  ·  Раундов <code>${cs2.totalRoundsPlayed ?? '—'}</code>  ·  Точность <code>${cs2.accuracy ?? '—'}%</code></p>\n`;
  }

  // FACEIT
  html += `\n<blockquote>🏆 FACEIT</blockquote>\n`;
  if (faceit) {
    html += `<p>Уровень <code>${faceit.level ?? '—'}</code>  ·  ELO <code>${faceit.elo ?? '—'}</code>`;
    if (faceit.country) html += `  ·  ${escapeHtml(faceit.country.toUpperCase())}`;
    html += `</p>\n`;
    html += `<p>Матчи <code>${faceit.matches ?? '—'}</code>  ·  Побед <code>${faceit.wins ?? '—'}</code>  ·  K/D <code>${faceit.avgKD ?? '—'}</code></p>\n`;
    html += `<p>ADR <code>${faceit.avgKR ?? '—'}</code>  ·  Убийств <code>${faceit.totalKills ?? '—'}</code>  ·  Урон <code>${faceit.totalDamage ?? '—'}</code></p>\n`;
    html += `<p>Раундов <code>${faceit.totalRounds ?? '—'}</code>  ·  Хедшотов <code>${faceit.totalHeadshots ?? '—'}</code></p>\n`;
    html += `<pre>Winrate  ${bar(faceit.winRate)}\nHS%      ${bar(faceit.avgHS)}\n1v1      ${bar(faceit.oneV1WinRate)}\n1v2      ${bar(faceit.oneV2WinRate)}</pre>\n`;
    html += `<p>Серия: <code>${faceit.currentWinStreak ?? '—'}</code>  ·  Макс: <code>${faceit.longestWinStreak ?? '—'}</code></p>\n`;
    html += `<p>Entry: <code>${faceit.entryRate ?? '—'}</code>  ·  Успех: <code>${faceit.entrySuccessRate ?? '—'}</code>  ·  Флешки: <code>${faceit.flashSuccessRate ?? '—'}%</code>  ·  Снайпер: <code>${faceit.sniperKillRate ?? '—'}</code></p>\n`;

    if (faceit.isBanned) html += `\n<p>🔴 <b>Забанен на FACEIT</b></p>\n`;

    if (faceit.recentResults && faceit.recentResults.length > 0) {
      const streak = faceit.recentResults.slice(0, 5).map(r => r.trim() === '1' ? '✅' : '❌').join('');
      html += `\n<p>Последние 5: ${streak}</p>\n`;
    }
  } else {
    html += `<p>Не найден на FACEIT</p>\n`;
  }

  return html;
}

/**
 * Сгенерировать HTML виджет статистики (Bot API 10.4)
 * @param {string} username
 * @param {object} cs2
 * @param {object|null} faceit
 * @returns {string} HTML
 */
export function buildStatsWidget(username, cs2, faceit) {
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
  }
  .header { text-align: center; margin-bottom: 16px; }
  .title { font-size: 18px; font-weight: 700; }
  .section { margin-bottom: 14px; }
  .section-title {
    font-size: 13px; font-weight: 600; color: var(--tg-theme-hint-color, #888);
    text-transform: uppercase; letter-spacing: 0.5px;
    margin-bottom: 8px; padding-bottom: 4px;
    border-bottom: 1px solid var(--tg-theme-section-separator-color, #e0e0e0);
  }
  .row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; }
  .label { color: var(--tg-theme-hint-color, #888); }
  .value { font-weight: 600; font-family: monospace; }
  .bar-track {
    width: 100%; height: 8px; background: var(--tg-theme-secondary-bg-color, #e0e0e0);
    border-radius: 4px; margin: 4px 0 8px 0; overflow: hidden;
  }
  .bar-fill { height: 100%; border-radius: 4px; background: #4CAF50; }
  .bar-label { font-size: 11px; color: var(--tg-theme-hint-color, #888); margin-bottom: 2px; }
  .recent { font-size: 16px; letter-spacing: 2px; }
  .ban { color: #f44336; font-weight: 700; margin-top: 8px; }
</style>
</head>
<body>
  <div class="header"><div class="title">📊 Статистика ${escapeHtml(username)}</div></div>
  ${buildStatsWidgetBody(cs2, faceit)}
</body>
</html>`;
}

function buildStatsWidgetBody(cs2, faceit) {
  let html = '';

  // CS2
  html += `<div class="section"><div class="section-title">🎮 CS2 (Steam)</div>`;
  if (cs2.private) {
    html += `<div class="row"><span>Профиль приватный</span></div>`;
  } else if (cs2.noData || cs2.totalMatchesPlayed === null) {
    html += `<div class="row"><span>Нет данных (не играл в CS2)</span></div>`;
  } else {
    html += `<div class="row"><span class="label">K/D</span><span class="value">${cs2.kd ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">Матчи</span><span class="value">${cs2.totalMatchesPlayed ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">Часы</span><span class="value">${cs2.hoursPlayed ?? '—'}ч</span></div>`;
    if (cs2.accountCreatedYear) html += `<div class="row"><span class="label">Год аккаунта</span><span class="value">${cs2.accountCreatedYear}</span></div>`;
    html += buildBarWidget('Winrate', cs2.winRate);
    html += buildBarWidget('HS%', cs2.hsPercent);
    html += `<div class="row"><span class="label">Убийств</span><span class="value">${cs2.totalKills ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">Смертей</span><span class="value">${cs2.totalDeaths ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">Урон</span><span class="value">${cs2.totalDamage ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">MVP</span><span class="value">${cs2.totalMvps ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">Раундов</span><span class="value">${cs2.totalRoundsPlayed ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">Точность</span><span class="value">${cs2.accuracy ?? '—'}%</span></div>`;
  }
  html += `</div>`;

  // FACEIT
  html += `<div class="section"><div class="section-title">🏆 FACEIT</div>`;
  if (faceit) {
    html += `<div class="row"><span class="label">Уровень</span><span class="value">${faceit.level ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">ELO</span><span class="value">${faceit.elo ?? '—'}${faceit.country ? ' · ' + escapeHtml(faceit.country.toUpperCase()) : ''}</span></div>`;
    html += `<div class="row"><span class="label">Матчи</span><span class="value">${faceit.matches ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">Побед</span><span class="value">${faceit.wins ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">K/D</span><span class="value">${faceit.avgKD ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">ADR</span><span class="value">${faceit.avgKR ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">Убийств</span><span class="value">${faceit.totalKills ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">Урон</span><span class="value">${faceit.totalDamage ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">Раундов</span><span class="value">${faceit.totalRounds ?? '—'}</span></div>`;
    html += `<div class="row"><span class="label">Хедшотов</span><span class="value">${faceit.totalHeadshots ?? '—'}</span></div>`;
    html += buildBarWidget('Winrate', faceit.winRate);
    html += buildBarWidget('HS%', faceit.avgHS);
    html += buildBarWidget('1v1', faceit.oneV1WinRate);
    html += buildBarWidget('1v2', faceit.oneV2WinRate);
    html += `<div class="row"><span class="label">Серия</span><span class="value">${faceit.currentWinStreak ?? '—'} (макс: ${faceit.longestWinStreak ?? '—'})</span></div>`;
    html += `<div class="row"><span class="label">Entry</span><span class="value">${faceit.entryRate ?? '—'} (${faceit.entrySuccessRate ?? '—'})</span></div>`;
    html += `<div class="row"><span class="label">Флешки</span><span class="value">${faceit.flashSuccessRate ?? '—'}%</span></div>`;
    html += `<div class="row"><span class="label">Снайпер</span><span class="value">${faceit.sniperKillRate ?? '—'}</span></div>`;
    if (faceit.isBanned) html += `<div class="ban">🔴 Забанен на FACEIT</div>`;
    if (faceit.recentResults && faceit.recentResults.length > 0) {
      const streak = faceit.recentResults.slice(0, 5).map(r => r.trim() === '1' ? '✅' : '❌').join('');
      html += `<div class="recent">${streak}</div>`;
    }
  } else {
    html += `<div class="row"><span>Не найден на FACEIT</span></div>`;
  }
  html += `</div>`;

  return html;
}

function buildBarWidget(label, pct) {
  if (pct === null || pct === undefined) return '';
  return `<div class="bar-label">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(pct, 100)}%"></div></div>`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
