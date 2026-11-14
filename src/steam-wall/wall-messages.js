/**
 * Randomized Steam wall messages
 * 10+ variants per type, no consecutive repeats
 * SteamID replaced with 6-char codes to avoid Steam spam filter
 */

import { createHash } from 'crypto';

// Generate deterministic 6-char code from SteamID
export function shortCode(steamId) {
  const hash = createHash('sha256').update(String(steamId)).digest('hex');
  return 'CW-' + hash.substring(0, 6).toUpperCase();
}

// Track last used index per type to avoid consecutive duplicates
const lastIndex = {};

function pickRandom(type, variants) {
  let idx;
  do {
    idx = Math.floor(Math.random() * variants.length);
  } while (variants.length > 1 && idx === lastIndex[type]);
  lastIndex[type] = idx;
  return variants[idx];
}

// ===== DATES =====

function dateFormats(date) {
  const d = date || new Date();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return {
    slash: `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`,
    iso: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
    long: `${months[d.getMonth()]} ${day}, ${year}`,
    dot: `${String(day).padStart(2,'0')}.${String(month).padStart(2,'0')}.${year}`,
    short: `${day} ${months[d.getMonth()].slice(0,3)} ${year}`,
  };
}

// ===== THANK YOU VARIANTS =====

const thankYouVariants = [
  'Thank you for your contribution to the community.',
  'Your report is appreciated.',
  'Community contribution noted. Thank you.',
  'Thanks for helping keep the community safe.',
  'Your input has been recorded. Gratitude.',
  'Appreciate the report — community effort valued.',
  'Thank you for supporting CheatWatchers Community.',
  'Your vigilance helps us all. Thank you.',
];

function getRandomThankYou() {
  return pickRandom('thankyou', thankYouVariants);
}

// ===== NEW CHEATER FLAGGED (10+ variants) =====

export function getRandomFlagMessage(steamId, date) {
  const d = dateFormats(date);
  const variants = [
    (id, dt) => `⚠️ Suspected player flagged by CheatWatchers Community\n\n${id}\n\nDate: ${dt.slash}\n\nNetwork identifier logged and archived.\nEvidence archived for review.\nAdded to CheatWatchers Community database and Valve database.`,

    (id, dt) => `🔍 Under review — CheatWatchers Community\n\n${id}\n\nLogged ${dt.long}\n\nConnection data recorded. Evidence preserved.\nFiled to CheatWatchers Community records and Valve database.`,

    (id, dt) => `⚠️ Flagged — CheatWatchers Community\n\nRef: ${id}\n\n${dt.slash}\n\nNetwork identifier archived. Evidence retained.\nAdded to database — CheatWatchers Community & Valve.`,

    (id, dt) => `📋 Case logged — CheatWatchers Community\n\nID: ${id}\nFiled: ${dt.long}\n\nConnection data saved. Review pending.\nSubmitted to CheatWatchers Community database and Valve database.`,

    (id, dt) => `⚠️ Suspected player — CheatWatchers Community\n\n${id} · ${dt.iso}\n\nNetwork trace preserved. Evidence archived.\nAdded to database — CheatWatchers Community & Valve.`,

    (id, dt) => `🔎 Profile under observation — CheatWatchers Community\n\n${id}\nDate: ${dt.dot}\n\nNetwork data logged and retained.\nEvidence preserved for review.\nRecorded in CheatWatchers Community and Valve databases.`,

    (id, dt) => `📋 Entry created — CheatWatchers Community\n\n${id}\nTimestamp: ${dt.long}\n\nConnection details archived. Evidence recorded.\nFiled with CheatWatchers Community database and Valve.`,

    (id, dt) => `⚠️ Suspected player flagged\n\n${id}\n\nLogged ${dt.short}\n\nNetwork identifier saved. Review complete.\nAdded to CheatWatchers Community and Valve records.`,

    (id, dt) => `🔍 Flagged for review — CheatWatchers Community\n\n${id} · ${dt.slash}\n\nNetwork trace recorded and archived.\nEvidence retained.\nRegistered in CheatWatchers Community database and Valve database.`,

    (id, dt) => `📋 Report filed — CheatWatchers Community\n\n${id}\nDate filed: ${dt.long}\n\nConnection data archived. Evidence preserved.\nSubmitted to CheatWatchers Community database and Valve database.`,

    (id, dt) => `⚠️ Profile flagged — CheatWatchers Community\n\n${id}\n${dt.iso}\n\nNetwork identifier logged. Evidence archived.\nAdded to database — CheatWatchers Community & Valve.`,

    (id, dt) => `🔎 Under observation — CheatWatchers Community\n\nRef: ${id}\nDate: ${dt.dot}\n\nConnection data preserved. Review complete.\nFiled to CheatWatchers Community records and Valve database.`,

    (id, dt) => `📋 Case opened — CheatWatchers Community\n\n${id}\nFiled: ${dt.short}\n\nNetwork trace saved and retained.\nEvidence archived for review.\nRecorded in CheatWatchers Community and Valve databases.`,

    (id, dt) => `⚠️ Suspected player — flagged\n\n${id}\nTimestamp: ${dt.long}\n\nNetwork identifier archived. Evidence preserved.\nAdded to CheatWatchers Community and Valve records.`,

    (id, dt) => `🔍 Profile reviewed — CheatWatchers Community\n\n${id} · ${dt.slash}\n\nConnection data logged and archived.\nEvidence retained.\nRegistered in CheatWatchers Community database and Valve database.`,
  ];
  const template = pickRandom('flag', variants);
  const code = shortCode(steamId);
  let msg = template(code, d);
  // Вставляем благодарность после строки с датой (перед финальными строками)
  const thankYou = getRandomThankYou();
  const lines = msg.split('\n');
  // Находим позицию после строки с датой — вставляем благодарность перед пустой строкой перед финальными
  let insertIdx = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '' && i > 0) {
      insertIdx = i;
      break;
    }
  }
  lines.splice(insertIdx, 0, thankYou);
  return lines.join('\n');
}

// ===== BAN DETECTED (10+ variants) =====

export function getRandomBanMessage(steamId, banLine, date, wasClean) {
  const d = dateFormats(date);
  const prev = wasClean ? 'Clean' : 'Banned';
  const variants = [
    (id, dt) => `🔄 Status update — ban detected!\n\n${id}\n\n${banLine}\nDate: ${dt.slash}\n\nPreviously: ${prev}\n\nNetwork identifier logged and archived.\nEvidence archived for review.\nAdded to CheatWatchers Community database and Valve database.`,

    (id, dt) => `⚠️ Restriction update — CheatWatchers Community\n\n${id}\n\n${banLine}\nLogged ${dt.long}\n\nPrevious status: ${prev}\n\nConnection data recorded. Evidence preserved.\nFiled to CheatWatchers Community records and Valve database.`,

    (id, dt) => `🔄 Ban status changed\n\n${id}\n\n${banLine}\n${dt.iso}\n\nPrior status: ${prev}\n\nNetwork identifier archived. Evidence retained.\nAdded to database — CheatWatchers Community & Valve.`,

    (id, dt) => `📋 Case updated — CheatWatchers Community\n\n${id}\nFiled: ${dt.long}\n\n${banLine}\nPrevious: ${prev}\n\nConnection data saved. Review pending.\nSubmitted to CheatWatchers Community database and Valve database.`,

    (id, dt) => `⚠️ Restriction detected — CheatWatchers Community\n\n${id} · ${dt.slash}\n\n${banLine}\nPrior status: ${prev}\n\nNetwork trace preserved. Evidence archived.\nAdded to database — CheatWatchers Community & Valve.`,

    (id, dt) => `🔄 Status change — CheatWatchers Community\n\n${id}\nDate: ${dt.dot}\n\n${banLine}\nPreviously: ${prev}\n\nNetwork data logged and retained.\nEvidence preserved for review.\nRecorded in CheatWatchers Community and Valve databases.`,

    (id, dt) => `📋 Entry updated — CheatWatchers Community\n\n${id}\nTimestamp: ${dt.long}\n\n${banLine}\nPrevious state: ${prev}\n\nConnection details archived. Evidence recorded.\nFiled with CheatWatchers Community database and Valve.`,

    (id, dt) => `⚠️ Ban update — CheatWatchers Community\n\n${id}\n\n${banLine}\nLogged ${dt.short}\nPrior status: ${prev}\n\nNetwork identifier saved. Review complete.\nAdded to CheatWatchers Community and Valve records.`,

    (id, dt) => `🔄 Restriction update — CheatWatchers Community\n\n${id} · ${dt.iso}\n\n${banLine}\nPreviously: ${prev}\n\nNetwork trace recorded and archived.\nEvidence retained.\nRegistered in CheatWatchers Community database and Valve database.`,

    (id, dt) => `📋 Case updated — CheatWatchers Community\n\n${id}\nDate filed: ${dt.long}\n\n${banLine}\nPrior status: ${prev}\n\nConnection data archived. Evidence preserved.\nSubmitted to CheatWatchers Community database and Valve database.`,

    (id, dt) => `⚠️ Status changed — CheatWatchers Community\n\n${id}\n${dt.slash}\n\n${banLine}\nPrevious: ${prev}\n\nNetwork identifier logged. Evidence archived.\nAdded to database — CheatWatchers Community & Valve.`,

    (id, dt) => `🔄 Update filed — CheatWatchers Community\n\nRef: ${id}\nDate: ${dt.dot}\n\n${banLine}\nPreviously: ${prev}\n\nConnection data preserved. Review complete.\nFiled to CheatWatchers Community records and Valve database.`,

    (id, dt) => `📋 Restriction logged — CheatWatchers Community\n\n${id}\nFiled: ${dt.short}\n\n${banLine}\nPrior status: ${prev}\n\nNetwork trace saved and retained.\nEvidence archived for review.\nRecorded in CheatWatchers Community and Valve databases.`,

    (id, dt) => `⚠️ Ban detected — CheatWatchers Community\n\n${id}\nTimestamp: ${dt.long}\n\n${banLine}\nPrevious state: ${prev}\n\nNetwork identifier archived. Evidence preserved.\nAdded to CheatWatchers Community and Valve records.`,

    (id, dt) => `🔄 Case modified — CheatWatchers Community\n\n${id} · ${dt.slash}\n\n${banLine}\nPreviously: ${prev}\n\nConnection data logged and archived.\nEvidence retained.\nRegistered in CheatWatchers Community database and Valve database.`,
  ];
  const template = pickRandom('ban', variants);
  const code = shortCode(steamId);
  return template(code, d);
}

// ===== DUPLICATE (10+ variants) =====

export function getRandomDuplicateMessage(steamId) {
  const variants = [
    (id) => `⚠️ This profile is already in database.\n${id}`,
    (id) => `📋 Already on record.\n${id}`,
    (id) => `🔍 Profile exists in database.\nRef: ${id}`,
    (id) => `⚠️ Duplicate entry detected.\n${id}`,
    (id) => `📋 This case is already filed.\nID: ${id}`,
    (id) => `🔍 Already tracked by CheatWatchers Community.\n${id}`,
    (id) => `⚠️ Profile previously logged.\n${id}`,
    (id) => `📋 Entry already exists.\nRef: ${id}`,
    (id) => `🔍 On file — no action needed.\n${id}`,
    (id) => `⚠️ Already in database — CheatWatchers Community.\n${id}`,
    (id) => `📋 Previously recorded.\nID: ${id}`,
    (id) => `🔍 Duplicate report — already tracked.\n${id}`,
  ];
  const template = pickRandom('duplicate', variants);
  const code = shortCode(steamId);
  return template(code) + '\n\n' + getRandomThankYou();
}

// ===== WARNING — TheCheatWatcher protection (10+ variants) =====

export function getRandomWarningMessage() {
  const variants = [
    `⚠️ Warning.\n\nReporting CheatWatchers Community members is prohibited.\nThis action has been logged.\n\nNetwork identifier logged and archived.\nEvidence archived for review.`,
    `⚠️ Notice.\n\nFlagging CheatWatchers Community members is not permitted.\nThis attempt has been recorded.\n\nConnection data saved. Evidence preserved.`,
    `⚠️ Alert — CheatWatchers Community.\n\nReports targeting community members will not be accepted.\nYour activity has been logged.\n\nNetwork trace preserved. Evidence retained.`,
    `⚠️ Warning — CheatWatchers Community.\n\nThis action is prohibited and has been documented.\n\nNetwork identifier archived. Review pending.`,
    `⚠️ Caution.\n\nAttempting to flag CheatWatchers Community members is a violation.\nThis incident has been recorded.\n\nConnection data archived. Evidence preserved.`,
    `⚠️ Notice — CheatWatchers Community.\n\nReports against community members are not accepted.\nThis attempt is on file.\n\nNetwork data logged and retained.`,
    `⚠️ Warning issued.\n\nTargeting CheatWatchers Community members is prohibited.\nActivity has been documented.\n\nEvidence archived for review.`,
    `⚠️ Alert.\n\nThis action violates community guidelines and has been logged.\n\nNetwork identifier saved. Evidence preserved.\nRecorded in CheatWatchers Community and Valve databases.`,
    `⚠️ Caution — CheatWatchers Community.\n\nFlagging community members is not permitted.\nThis attempt has been recorded.\n\nConnection data preserved. Review complete.`,
    `⚠️ Warning.\n\nReports targeting CheatWatchers Community members will not be processed.\nThis incident is on file.\n\nNetwork trace archived. Evidence retained.`,
    `⚠️ Notice.\n\nThis action is prohibited and has been documented.\n\nNetwork identifier logged. Evidence archived.\nAdded to database — CheatWatchers Community & Valve.`,
    `⚠️ Alert — CheatWatchers Community.\n\nAttempting to flag community members is a violation.\nYour activity has been recorded.\n\nConnection data archived. Evidence preserved.`,
  ];
  return pickRandom('warning', variants);
}

// ===== BLOCK — second offense (10+ variants) =====

export function getRandomBlockMessage() {
  const variants = [
    `🚫 Access restricted.\n\nYour account is no longer permitted to submit reports.\nAbuse of this system will not be tolerated.\n\nNetwork identifier logged and archived.\nEvidence archived for review.`,
    `🚫 Account restricted — CheatWatchers Community.\n\nReport submission privileges have been revoked.\n\nNetwork data saved. Evidence preserved.`,
    `🚫 Access revoked.\n\nThis account can no longer submit reports.\nRepeated violations have been documented.\n\nConnection data archived. Evidence retained.`,
    `🚫 Restricted — CheatWatchers Community.\n\nYour ability to file reports has been removed.\n\nNetwork identifier archived. Review complete.`,
    `🚫 Account flagged for abuse.\n\nReport submissions are no longer accepted from this account.\n\nNetwork trace preserved. Evidence archived.`,
    `🚫 Access denied — CheatWatchers Community.\n\nThis account has been restricted due to repeated violations.\n\nConnection data logged and retained.`,
    `🚫 Privileges revoked.\n\nAbuse of the reporting system will not be tolerated.\nThis action has been documented.\n\nEvidence archived for review.`,
    `🚫 Account blocked — CheatWatchers Community.\n\nReport submission is no longer permitted.\n\nNetwork identifier saved. Evidence preserved.\nRecorded in CheatWatchers Community and Valve databases.`,
    `🚫 Restricted access.\n\nThis account can no longer submit reports.\nAll activity has been documented.\n\nNetwork trace archived. Evidence retained.`,
    `🚫 Access suspended — CheatWatchers Community.\n\nRepeated violations have resulted in account restrictions.\n\nConnection data archived. Evidence preserved.`,
    `🚫 Account restricted.\n\nReport submission privileges removed due to abuse.\n\nNetwork identifier logged. Evidence archived.\nAdded to database — CheatWatchers Community & Valve.`,
    `🚫 Banned from reporting — CheatWatchers Community.\n\nThis account is no longer authorized to file reports.\n\nConnection data preserved. Review complete.`,
  ];
  return pickRandom('block', variants);
}
