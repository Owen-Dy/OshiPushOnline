// Headless tests for the revealed top card and AVId Gummy Worm Enjoyer. Run: node tests/gen2-avid.test.mjs
import assert from 'assert';
import { mk, test, finish, persona } from './harness.mjs';
import { CARDS } from '../cards.js';
import { OshiPush, sideInf, isTopRevealed, canPlayFromTop } from '../game.js';

const SAFE = new Set(['discardAbility']);
const cheap = (cost) => (CARDS.find((c) => c.type === 'Content' && c.cost === cost && !(c.effects || []).length && !c.playOnly && !c.xCost)
  || CARDS.find((c) => c.type === 'Content' && c.cost === cost && (c.effects || []).every((e) => SAFE.has(e.type)) && !c.playOnly && !c.xCost)).name;
const AVISPA = persona('La Avispa Nectarina');
const view = (t, id) => OshiPush.playerView({ G: t.G(), playerID: id });
const N = (o = {}) => mk({ p0: AVISPA, at0: 0, at1: 0, ...o }); // player 0 is La Avispa Nectarina

test("La Avispa Nectarina: the top card of her deck is revealed to BOTH players; other cards stay hidden", () => {
  const t = N(); t.as('0', 'testDeck', '0', [cheap(3), cheap(5), cheap(1)]);
  for (const id of ['0', '1']) { const d = view(t, id).players['0'].deck; assert.equal(d[0].name, cheap(3), `player ${id} sees the top card`); assert.equal(d[1].hidden, true); assert.equal(d[2].hidden, true); }
  assert.equal(view(t, '0').players['1'].deck[0].hidden, true, 'the opponent\'s deck is still hidden');
  assert.equal(isTopRevealed(t.G(), '0'), true); assert.equal(isTopRevealed(t.G(), '1'), false);
});
test('A Persona without it keeps the top card hidden', () => {
  const t = mk({ at0: 0, at1: 0 }); t.as('0', 'testDeck', '0', [cheap(3), cheap(5)]);
  assert.equal(view(t, '1').players['0'].deck[0].hidden, true); assert.equal(isTopRevealed(t.G(), '0'), false);
});
test('La Avispa Nectarina gains ⭐ equal to the cost of the revealed card, and it follows the top card', () => {
  const t = N(); t.as('0', 'testDeck', '0', [cheap(3), cheap(6)]); const base = sideInf(mk({ p0: AVISPA, at0: 0, at1: 0 }).G(), 0, '0');
  const a = sideInf(t.G(), 0, '0'); t.as('0', 'testDeck', '0', [cheap(6), cheap(3)]); const b = sideInf(t.G(), 0, '0');
  assert.equal(b - a, 3, 'a 🟡6 top card gives 3 more ⭐ than a 🟡3 one'); assert.equal(a, (a - 3) + 3);
  assert.ok(sideInf(view(t, '1'), 0, '0') === b, "the opponent's screen adds up to the same ⭐");
});
test('AVId Gummy Worm Enjoyer: while it is the revealed top card you may play it for free (Persona +10 ⭐)', () => {
  const t = N(); t.bits('0', 0); t.as('0', 'testDeck', '0', ['AVId Gummy Worm Enjoyer', cheap(1)]);
  const avid = t.G().players['0'].deck[0]; assert.equal(canPlayFromTop(t.G(), '0', avid), true);
  const before = sideInf(t.G(), 0, '0'); t.turn('0'); t.as('0', 'playCard', avid.id, 0, undefined, 'deck');
  assert.equal(t.G().players['0'].bits, 0, 'it was free'); assert.equal(t.G().players['0'].deck.length, 1); assert.deepEqual(t.G().platforms[0].actions['0'].map((c) => c.name), ['AVId Gummy Worm Enjoyer']);
  assert.equal(sideInf(t.G(), 0, '0') - before, 10 + (1 - 4), '+10 ⭐ this round; her top-card ⭐ went from 🟡4 (AVId) to 🟡1 (the new top card)');
});
test('AVId: it must be the TOP card, and the top card must be revealed', () => {
  const t = N(); t.as('0', 'testDeck', '0', [cheap(1), 'AVId Gummy Worm Enjoyer']); const second = t.G().players['0'].deck[1];
  assert.equal(canPlayFromTop(t.G(), '0', second), false); t.turn('0'); t.as('0', 'playCard', second.id, 0, undefined, 'deck'); assert.equal(t.G().players['0'].deck.length, 2, 'not on top: nothing happens');
  const u = mk({ at0: 0, at1: 0 }); u.as('0', 'testDeck', '0', ['AVId Gummy Worm Enjoyer', cheap(1)]); const top = u.G().players['0'].deck[0];
  assert.equal(canPlayFromTop(u.G(), '0', top), false, 'not revealed'); u.turn('0'); u.as('0', 'playCard', top.id, 0, undefined, 'deck'); assert.equal(u.G().players['0'].deck.length, 2);
});
test('Only a card that says so can be played from the top of the deck', () => {
  const t = N(); t.bits('0', 20); t.as('0', 'testDeck', '0', [cheap(1), cheap(2)]); const top = t.G().players['0'].deck[0];
  assert.equal(canPlayFromTop(t.G(), '0', top), false); t.turn('0'); t.as('0', 'playCard', top.id, 0, undefined, 'deck'); assert.equal(t.G().players['0'].deck.length, 2);
});
test('Be More Cultured reveals your top card even with nothing to return, and a revealed AVId can then be played free', () => {
  const t = mk({ at0: 0, at1: 0 }); t.bits('0', 10); t.as('0', 'testDeck', '0', ['AVId Gummy Worm Enjoyer', cheap(1)]);
  t.play('0', 'Be More Cultured', 0); assert.deepEqual(t.G().notice.revealed, ['AVId Gummy Worm Enjoyer']); assert.ok(!t.ch(), 'no opposing Content: nothing to choose');
  const avid = t.G().players['0'].deck[0]; assert.equal(isTopRevealed(t.G(), '0'), true); assert.equal(view(t, '1').players['0'].deck[0].name, 'AVId Gummy Worm Enjoyer');
  const bits = t.G().players['0'].bits; t.turn('0'); t.as('0', 'playCard', avid.id, 0, undefined, 'deck'); assert.equal(t.G().players['0'].bits, bits, 'free');
  assert.equal(t.G().platforms[0].actions['0'].some((c) => c.name === 'AVId Gummy Worm Enjoyer'), true);
});
test('The reveal from Be More Cultured ends when the top card changes', () => {
  const t = mk({ at0: 0, at1: 0 }); t.bits('0', 10); t.as('0', 'testDeck', '0', [cheap(1), cheap(2)]); t.play('0', 'Be More Cultured', 0);
  assert.equal(isTopRevealed(t.G(), '0'), true); t.as('0', 'testDeck', '0', [cheap(2), cheap(1)]); assert.equal(isTopRevealed(t.G(), '0'), false, 'a different card is on top now');
});
test('A temporary reveal does not last into the next round', () => {
  const t = mk({ at0: 0, at1: 0 }); t.bits('0', 10); t.as('0', 'testDeck', '0', [cheap(1), cheap(2)]); t.play('0', 'Be More Cultured', 0); assert.equal(isTopRevealed(t.G(), '0'), true);
  t.clash(); t.passBoth(); t.passBoth(); t.passBoth(); t.as('0', 'ackClash'); t.as('1', 'ackClash');
  assert.equal(t.G().players['0'].topShown, undefined);
});
test('The Upgrades Sweaty Tomboy and Timeline B reveal the top card too (checked on a copy of the state: Gen 2 Upgrades cannot be set up in the sandbox yet)', () => {
  for (const name of ['Sweaty Tomboy', 'Timeline B']) {
    const t = mk({ at0: 0, at1: 0 }); t.as('0', 'testDeck', '0', [cheap(4), cheap(1)]);
    const G = JSON.parse(JSON.stringify(t.G())); G.players['0'].upgrades = [{ ...CARDS.find((c) => c.name === name) }];
    assert.equal(isTopRevealed(G, '0'), true, name); assert.equal(OshiPush.playerView({ G, playerID: '1' }).players['0'].deck[0].name, cheap(4));
    assert.equal(sideInf(G, 0, '0') - sideInf(t.G(), 0, '0') >= 4 - t.G().players['0'].persona.inf, true, 'gains ⭐ equal to the revealed card\'s cost');
  }
});

finish();
