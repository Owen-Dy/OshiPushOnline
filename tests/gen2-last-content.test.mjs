// Headless tests for the last Gen 2 Content cards. Run: node tests/gen2-last-content.test.mjs
import assert from 'assert';
import { mk, test, finish } from './harness.mjs';
import { CARDS } from '../cards.js';
import { playCost, canPlatformPlay } from '../game.js';

const SAFE = new Set(['discardAbility']);
const cheap = (cost) => (CARDS.find((c) => c.type === 'Content' && c.cost === cost && !(c.effects || []).length && !c.playOnly && !c.xCost)
  || CARDS.find((c) => c.type === 'Content' && c.cost === cost && (c.effects || []).every((e) => SAFE.has(e.type)) && !c.playOnly && !c.xCost)).name;
const at = (t, idx, id) => t.G().platforms[idx].cards[id].map((c) => c.name);
const M = (o = {}) => mk({ at0: 0, at1: 0, ...o });

// ---------- Children's Game ----------
test("Children's Game: when an opponent gains a 🌠 by winning a clash, gain 1 🌠 at this card's platform", () => {
  const t = M(); t.put('0', 1, "Children's Game"); t.put('1', 0, 'NPC Carry'); t.clash(); t.passBoth();
  assert.equal(t.G().platforms[0].pop['1'], 1); assert.equal(t.G().platforms[1].pop['0'], 1, 'their gain made me gain one at Children\'s Game');
});
test("Children's Game: also reacts to gain effects, but not to your own gains", () => {
  const t = M(); t.bits('1', 30); t.put('0', 1, "Children's Game"); t.as('0', 'dbgSetPop', 0, '0', 2);
  t.play('1', 'Joystick User', 0); assert.equal(t.G().platforms[0].pop['1'], 1); assert.equal(t.G().platforms[1].pop['0'], 1);
  const u = M(); u.bits('0', 30); u.put('0', 1, "Children's Game"); u.as('0', 'dbgSetPop', 0, '1', 2); u.play('0', 'Joystick User', 0);
  assert.equal(u.G().platforms[1].pop['0'], 0, 'my own gain does not trigger it');
});
test("Children's Game: two of them do not set each other off forever", () => {
  const t = M(); t.put('0', 1, "Children's Game"); t.put('1', 2, "Children's Game"); t.put('1', 0, 'NPC Carry'); t.clash(); t.passBoth();
  assert.equal(t.G().platforms[0].pop['1'], 1); assert.equal(t.G().platforms[1].pop['0'], 1); assert.equal(t.G().platforms[2].pop['1'], 0, 'the reaction does not react');
});

// ---------- Bathing Suit Outfit ----------
test('Bathing Suit Outfit: when you win a clash at another platform you may gain the 🌠 on its platform instead', () => {
  const t = M(); t.put('0', 1, 'Bathing Suit Outfit'); t.put('0', 0, 'NPC Carry'); t.clash(); t.passBoth();
  assert.equal(t.ch().player, '0'); assert.deepEqual(t.ch().options.map((o) => o.key).sort(), ['0', '1']);
  t.pick('0', '1'); assert.equal(t.G().platforms[1].pop['0'], 1); assert.equal(t.G().platforms[0].pop['0'], 0);
  const u = M(); u.put('0', 1, 'Bathing Suit Outfit'); u.put('0', 0, 'NPC Carry'); u.clash(); u.passBoth(); u.pick('0', '0');
  assert.equal(u.G().platforms[0].pop['0'], 1, 'or take it where you won');
});
test('Bathing Suit Outfit: no choice when it is on the platform you won, or when your opponent wins', () => {
  const t = M(); t.put('0', 0, 'Bathing Suit Outfit'); t.put('0', 0, 'NPC Carry'); t.clash(); t.passBoth(); assert.ok(!t.ch()); assert.equal(t.G().platforms[0].pop['0'], 1);
  const u = M(); u.put('0', 1, 'Bathing Suit Outfit'); u.put('1', 0, 'NPC Carry'); u.clash(); u.passBoth(); assert.ok(!u.ch()); assert.equal(u.G().platforms[0].pop['1'], 1);
});

// ---------- Exposure Therapy ----------
test("Exposure Therapy: discard the top card of any player's deck", () => {
  const t = M(); t.bits('0', 10); t.as('0', 'testDeck', '0', [cheap(1), cheap(2)]); t.as('0', 'testDeck', '1', [cheap(3), cheap(4)]);
  t.play('0', 'Exposure Therapy', 0); assert.deepEqual(t.ch().options.map((o) => o.key), ['me', 'opp']); t.pick('0', 'opp');
  assert.equal(t.G().players['1'].deck.length, 1); assert.equal(t.G().players['1'].trash.at(-1).name, cheap(3)); assert.equal(t.G().notice.discarded, cheap(3));
  const u = M(); u.bits('0', 10); u.as('0', 'testDeck', '0', [cheap(1), cheap(2)]); u.as('0', 'testDeck', '1', []);
  u.play('0', 'Exposure Therapy', 0); assert.deepEqual(u.ch().options.map((o) => o.key), ['me'], 'an empty deck is not offered');
});

// ---------- Press Conference ----------
test('Press Conference: may be played from your Trash', () => {
  const t = M(); t.bits('0', 30); t.as('0', 'testTrash', '0', 'Press Conference'); const pc = t.G().players['0'].trash.at(-1);
  t.turn('0'); t.as('0', 'playCard', pc.id, 0, 0, 'trash');
  assert.ok(at(t, 0, '0').includes('Press Conference')); assert.ok(!t.G().players['0'].trash.some((c) => c.id === pc.id)); assert.equal(t.G().players['0'].bits, 30 - 9);
});
test('Press Conference: if it would be deleted it goes to the bottom of your deck', () => {
  const t = M(); t.bits('0', 30); t.put('1', 0, 'Press Conference'); t.as('0', 'testDeck', '1', [cheap(1), cheap(2)]);
  t.play('0', 'Kiss, Marry, Kill', 0); t.pick('1', 'Press Conference');
  assert.ok(!at(t, 0, '1').includes('Press Conference')); assert.equal(t.G().players['1'].deck.at(-1).name, 'Press Conference'); assert.ok(!t.G().players['1'].trash.some((c) => c.name === 'Press Conference'));
});

// ---------- Bad Pick Up Lines ----------
test('Bad Pick Up Lines: costs 🟡2 less on a platform where an opponent has more 🌠 than you', () => {
  const t = M(); const c = t.give('0', 'Bad Pick Up Lines'); assert.equal(playCost(t.G(), '0', c, 0), 7);
  t.as('0', 'dbgSetPop', 0, '1', 1); assert.equal(playCost(t.G(), '0', c, 0), 5); assert.equal(playCost(t.G(), '0', c, 1), 7, 'only on that platform');
  t.as('0', 'dbgSetPop', 0, '0', 1); assert.equal(playCost(t.G(), '0', c, 0), 7, 'tied: no discount');
});
test('Bad Pick Up Lines: when ANY player wins a clash at this platform it returns to its owner\'s hand', () => {
  const t = M(); t.put('0', 0, 'Bad Pick Up Lines'); t.put('1', 0, 'NPC Carry'); t.clash(); t.passBoth();
  assert.ok(!at(t, 0, '0').includes('Bad Pick Up Lines')); assert.ok(t.G().players['0'].hand.some((c) => c.name === 'Bad Pick Up Lines'));
  const u = M(); u.put('0', 1, 'Bad Pick Up Lines'); u.put('1', 0, 'NPC Carry'); u.clash(); u.passBoth();
  assert.ok(at(u, 1, '0').includes('Bad Pick Up Lines'), 'a clash won on another platform does not send it back');
});

// ---------- Bottom Energy ----------
test("Bottom Energy: Activate to put 1 card from any player's Trash onto the bottom of their deck", () => {
  const t = M(); const be = t.put('0', 0, 'Bottom Energy'); t.as('0', 'testTrash', '0', cheap(1)); t.as('0', 'testTrash', '1', cheap(2));
  t.turn('0'); t.as('0', 'activateCard', be.id); assert.equal(t.ch().options.length, 2);
  t.pick('0', cheap(2)); assert.equal(t.G().players['1'].deck.at(-1).name, cheap(2)); assert.ok(!t.G().players['1'].trash.some((c) => c.name === cheap(2)));
  assert.equal(t.G().players['0'].trash.length, 1, 'mine was left alone');
});

// ---------- Little Sister Energy ----------
test('Little Sister Energy: each player shuffles their hand and Trash into their deck, then draws 5', () => {
  const t = M(); t.bits('0', 30);
  for (const id of ['0', '1']) { t.as('0', 'dbgClearHand', id); for (let i = 0; i < 3; i++) t.give(id, cheap(1)); t.as('0', 'testTrash', id, cheap(2)); t.as('0', 'testTrash', id, cheap(3)); }
  const total = (id) => { const p = t.G().players[id]; return p.deck.length + p.hand.length + p.trash.length; };
  const before = { 0: total('0'), 1: total('1') }; // (the played card itself ends up on the board, not in these piles)
  t.play('0', 'Little Sister Energy', 0);
  for (const id of ['0', '1']) { const p = t.G().players[id]; assert.equal(p.hand.length, 5, `player ${id} draws 5`); assert.equal(p.trash.length, 0); }
  assert.equal(total('0'), before[0] + 0, 'nothing lost or created (player 0)'); assert.equal(total('1'), before[1], 'nothing lost or created (player 1)');
});

// ---------- So Baby (the Platform Phase) ----------
const platformPhase = (setup) => { const t = M(); t.as('0', 'dbgPhase', 'deployment'); const first = t.G().firstPlayer; setup?.(t, first); return { t, first, second: first === '0' ? '1' : '0' }; };
test('So Baby: after deploying you keep your turn and may play it (on your Persona\'s platform), then the turn passes', () => {
  const { t, first, second } = platformPhase((t, f) => { t.bits(f, 30); t.give(f, 'So Baby'); });
  t.as(first, 'deployPersona', 1); assert.equal(t.G().platformHold, first); assert.equal(t.cur(), first); assert.ok(canPlatformPlay(t.G(), first));
  const sb = t.G().players[first].hand.find((c) => c.name === 'So Baby');
  t.as(first, 'playCard', sb.id, 0); assert.ok(!at(t, 0, first).includes('So Baby'), 'it must go on your Persona\'s platform (1), not 0');
  t.as(first, 'playCard', sb.id, 1); assert.ok(at(t, 1, first).includes('So Baby')); assert.equal(t.G().platformHold, null); assert.equal(t.cur(), second);
  t.as(second, 'deployPersona', 0); assert.equal(t.ctx().phase, 'content');
});
test('So Baby: you can also decline with Done; without it or the 🟡 the Platform Phase is unchanged', () => {
  const { t, first, second } = platformPhase((t, f) => { t.bits(f, 30); t.give(f, 'So Baby'); });
  t.as(first, 'deployPersona', 0); t.as(first, 'endPlatformTurn'); assert.equal(t.G().platformHold, null); assert.equal(t.cur(), second);
  const u = platformPhase((t, f) => { t.bits(f, 2); t.give(f, 'So Baby'); }); u.t.as(u.first, 'deployPersona', 0); assert.equal(u.t.G().platformHold, null, 'cannot afford it'); assert.equal(u.t.cur(), u.second);
  const v = platformPhase(); v.t.as(v.first, 'deployPersona', 0); assert.equal(v.t.cur(), v.second);
});
test('So Baby: the second player can play it too, and the phase waits until they do', () => {
  const { t, first, second } = platformPhase((t, f) => { t.bits('0', 30); t.bits('1', 30); const s = f === '0' ? '1' : '0'; t.give(s, 'So Baby'); });
  t.as(first, 'deployPersona', 0); t.as(second, 'deployPersona', 2);
  assert.equal(t.ctx().phase, 'deployment', 'still waiting for their decision'); assert.equal(t.G().platformHold, second);
  const sb = t.G().players[second].hand.find((c) => c.name === 'So Baby'); t.as(second, 'playCard', sb.id, 2);
  assert.ok(at(t, 2, second).includes('So Baby')); assert.equal(t.ctx().phase, 'content');
});

finish();
