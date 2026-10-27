// Run with: npm test (in server/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSafety, normalize } from './safety.js';

const standard = { safety_level: 'standard', blocked_words: [], allowed_words: [] };
const strict = { safety_level: 'strict', blocked_words: [], allowed_words: [] };
const custom = (blocked_words, allowed_words) => ({ safety_level: 'custom', blocked_words, allowed_words });

const allows = (text, session = standard) => assert.equal(checkSafety(text, session).allowed, true, `should allow: ${text}`);
const blocks = (text, category, session = standard) => {
  const v = checkSafety(text, session);
  assert.equal(v.allowed, false, `should block: ${text}`);
  if (category) assert.equal(v.category, category, `category for: ${text}`);
};

test('everyday requests pass', () => {
  for (const t of [
    'a cat', 'big red apple', 'a jeepney', 'firefighter with a fire truck', 'a happy butterfly', 'zebra stripes',
    'shooting star', 'killer whale', 'leche flan', 'my class', 'a glass of milk', 'butterfly on a flower',
    'isang malaking aso', 'tatlong mangga', 'bahay kubo', 'the ugly duckling', 'Star', 'a butter cookie',
    'I want a dinosaur', '1 2 3 4 5 6 7 balloons', 'kuya at ate', 'a doctor', 'pusa at aso', 'a hanger',
  ]) allows(t);
});

test('standard blocks unsafe words in English and Filipino', () => {
  blocks('a gun', 'weapons');
  blocks('two guns', 'weapons');
  blocks('baril', 'weapons');
  blocks('kill the dog', 'violence');
  blocks('patayin ang pusa', 'violence');
  blocks('blood everywhere', 'violence');
  blocks('naked lady', 'adult');
  blocks('bobo ka', 'hate');
  blocks('putang ina', 'bad_language');
  blocks('tangina', 'bad_language');
  blocks('a beer bottle', 'drugs');
  blocks('lasing na lalaki', 'drugs');
  blocks('I want to kill myself');
});

test('tricky spellings are still caught', () => {
  blocks('KILL!!!', 'violence');
  blocks('kiiiill', 'violence');
  blocks('k1ll', 'violence');
  blocks('$hooting', 'violence');
  blocks('a bóómb', 'weapons');
  blocks('bombs', 'weapons');
  blocks('punching and stabbing', 'violence');
});

test('personal information is blocked', () => {
  blocks('call 0917 123 4567', 'personal_info');
  blocks('my email is kid@example.com', 'personal_info');
  blocks('I live at 12 Mabini street', 'personal_info');
});

test('strict also blocks scary things and rough play', () => {
  allows('a ghost');
  allows('a pirate ship');
  blocks('a ghost', 'scary', strict);
  blocks('multo', 'scary', strict);
  blocks('a pirate ship', 'rough_play', strict);
  blocks('two kids fighting', 'rough_play', strict);
  allows('a friendly ghost', strict);
  allows('a happy puppy', strict);
  blocks('a gun', 'weapons', strict);
});

test('custom adds teacher words on top of standard', () => {
  const s = custom(['spider', 'Pokemon'], ['water gun', 'war']);
  blocks('a spider', 'custom', s);
  blocks('big spiders', 'custom', s);
  blocks('pokémon', 'custom', s);
  allows('a water gun', s);
  allows('star war', s);
  blocks('a gun', 'weapons', s);
  blocks('kill', 'violence', s);
});

test('teacher words only count in custom mode', () => {
  const words = { blocked_words: ['spider'], allowed_words: ['gun'] };
  allows('a spider', { ...standard, ...words });
  blocks('a gun', 'weapons', { ...standard, ...words });
});

test('the reason names the word that matched', () => {
  const v = checkSafety('a big knife', standard);
  assert.equal(v.matched, 'knife');
  assert.match(v.reason, /knife/);
});

test('normalize', () => {
  assert.equal(normalize('  Ang  PUSA!  '), 'ang pusa');
  assert.equal(normalize('niño'), 'nino');
  assert.equal(normalize('5 apples'), '5 apples');
});
