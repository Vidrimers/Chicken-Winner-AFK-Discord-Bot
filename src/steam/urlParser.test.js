/**
 * Тесты для parseSteamUrl
 * Запуск: node src/steam/urlParser.test.js
 */

import { parseSteamUrl } from './urlParser.js';

let passed = 0;
let failed = 0;

function assert(description, actual, expected) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    passed++;
    console.log(`  ✅ ${description}`);
  } else {
    failed++;
    console.log(`  ❌ ${description}`);
    console.log(`     Ожидалось: ${expectedStr}`);
    console.log(`     Получено:  ${actualStr}`);
  }
}

console.log('🧪 Тесты parseSteamUrl\n');

// --- Vanity URL ---
console.log('📌 Vanity URL:');
assert(
  'https://steamcommunity.com/id/USERNAME → vanity',
  parseSteamUrl('https://steamcommunity.com/id/USERNAME'),
  { type: 'vanity', value: 'USERNAME' }
);

assert(
  'http://steamcommunity.com/id/player_name → vanity (http)',
  parseSteamUrl('http://steamcommunity.com/id/player_name'),
  { type: 'vanity', value: 'player_name' }
);

assert(
  'https://steamcommunity.com/id/user-name/ → vanity (trailing slash)',
  parseSteamUrl('https://steamcommunity.com/id/user-name/'),
  { type: 'vanity', value: 'user-name' }
);

assert(
  'https://steamcommunity.com/id/Player123 → vanity (mixed case + digits)',
  parseSteamUrl('https://steamcommunity.com/id/Player123'),
  { type: 'vanity', value: 'Player123' }
);

// --- SteamID64 URL ---
console.log('\n📌 SteamID64 URL:');
assert(
  'https://steamcommunity.com/profiles/76561198000000000 → steamid64',
  parseSteamUrl('https://steamcommunity.com/profiles/76561198000000000'),
  { type: 'steamid64', value: '76561198000000000' }
);

assert(
  'http://steamcommunity.com/profiles/76561198123456789 → steamid64 (http)',
  parseSteamUrl('http://steamcommunity.com/profiles/76561198123456789'),
  { type: 'steamid64', value: '76561198123456789' }
);

assert(
  'https://steamcommunity.com/profiles/76561198123456789/ → steamid64 (trailing slash)',
  parseSteamUrl('https://steamcommunity.com/profiles/76561198123456789/'),
  { type: 'steamid64', value: '76561198123456789' }
);

// --- Невалидные URL ---
console.log('\n📌 Невалидные URL:');
assert(
  'null → null',
  parseSteamUrl(null),
  null
);

assert(
  'пустая строка → null',
  parseSteamUrl(''),
  null
);

assert(
  'не URL → null',
  parseSteamUrl('not a url'),
  null
);

assert(
  'другой домен → null',
  parseSteamUrl('https://example.com/id/player'),
  null
);

assert(
  'без протокола → null',
  parseSteamUrl('steamcommunity.com/id/player'),
  null
);

assert(
  'невалидный vanity (спецсимволы) → null',
  parseSteamUrl('https://steamcommunity.com/id/user@name'),
  null
);

assert(
  'невалидный steamid64 (16 цифр) → null',
  parseSteamUrl('https://steamcommunity.com/profiles/7656119800000000'),
  null
);

assert(
  'невалидный steamid64 (18 цифр) → null',
  parseSteamUrl('https://steamcommunity.com/profiles/765611980000000001'),
  null
);

assert(
  'невалидный steamid64 (буквы) → null',
  parseSteamUrl('https://steamcommunity.com/profiles/7656119800000000a'),
  null
);

assert(
  'только домен без пути → null',
  parseSteamUrl('https://steamcommunity.com/'),
  null
);

assert(
  'неизвестный путь → null',
  parseSteamUrl('https://steamcommunity.com/groups/mygroup'),
  null
);

// --- Итоги ---
console.log(`\n📊 Результат: ${passed} пройдено, ${failed} провалено из ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
