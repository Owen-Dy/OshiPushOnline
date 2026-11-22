// Tests for Gen 2 Persona abilities. Run: node tests/gen2-personas.test.mjs
import assert from 'assert';
import { CARDS } from '../cards.js';
import { sideInf } from '../game.js';
import { mk, test, finish, persona } from './harness.mjs';

const card = (name) => CARDS.find((c) => c.name === name && c.type !== 'Persona');
const win = (t) => { t.clash(); t.passBoth(); };

test('Eden: own Content costing 4 or less gains +1 ⭐ on this Platform', () => {
  const t = mk({ p0: persona('Eden') });
  const cheap = t.put('0', 0, 'Charity Event');
  assert.equal(t.stars('0', 0, cheap), cheap.inf + 1);
  const expensive = t.put('0', 0, 'Cover Song');
  assert.equal(t.stars('0', 0, expensive), expensive.inf);
});
test('Captain Camille: +2 Persona ⭐ while dominating any Platform', () => {
  const t = mk({ p0: persona('Captain Camille') });
  const before = sideInf(t.G(), 0, '0');
  t.put('0', 1, 'Charity Event');
  assert.equal(sideInf(t.G(), 0, '0'), before + 2);
  t.put('1', 1, 'Marshmallows');
  assert.equal(sideInf(t.G(), 0, '0'), before);
});
test('Porcelain Maid: Clash Reward draws and then discards per Content platform', () => {
  const t = mk({ p0: persona('Porcelain Maid') });
  t.put('0', 0, 'Charity Event'); t.put('0', 1, 'Charity Event');
  t.as('0', 'testDeck', '0', ['Rage Game', 'Marshmallows']);
  win(t);
  assert.equal(t.G().pendingDiscard['0'], 2);
  assert.ok(t.G().players['0'].hand.some((c) => c.name === 'Rage Game'));
  assert.ok(t.G().players['0'].hand.some((c) => c.name === 'Marshmallows'));
});
test('Raelice: may discard the top 2 cards of the deck as a Clash Reward', () => {
  const t = mk({ p0: persona('Raelice') });
  t.put('0', 0, 'Charity Event');
  t.as('0', 'testDeck', '0', ['Rage Game', 'Marshmallows', 'Cover Song']);
  win(t);
  assert.equal(t.ch().options.length, 2);
  t.pick('0', 'yes');
  assert.deepEqual(t.names(t.G().players['0'].trash), ['Rage Game', 'Marshmallows']);
  assert.equal(t.G().players['0'].deck.length, 1);
});
test('LineChu: +2 Persona ⭐ while you have a face-up Premium Content card', () => {
  const t = mk({ p0: persona('LineChu') });
  const before = sideInf(t.G(), 0, '0');
  t.put('0', 0, 'Wisdom of the Day');
  assert.equal(sideInf(t.G(), 0, '0'), before + 2 + card('Wisdom of the Day').inf);
});

finish();
