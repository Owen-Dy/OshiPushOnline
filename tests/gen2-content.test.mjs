// Headless tests for the Gen 2 Content card effects. Run: node tests/gen2-content.test.mjs
import assert from 'assert';
import { mk, test, finish, card, persona, results } from './harness.mjs';
import { CARDS } from '../cards.js';
import { contentBlocked, playCost, sideInf } from '../game.js';

const cheap = (cost) => CARDS.find((c) => c.type === 'Content' && c.cost === cost && !(c.effects || []).length && !c.playOnly && !c.xCost).name; // a plain card to play for free
const at = (t, idx, id) => t.G().platforms[idx].cards[id].map((c) => c.name);

// ---------- ⭐ from card text ----------
test('Crystal Dragon Memories: +4 for each other Content card here', () => {
  const t = mk(); const c = t.put('0', 0, 'Crystal Dragon Memories');
  assert.equal(t.stars('0', 0, c), 5);
  t.put('0', 0, cheap(1)); t.put('0', 0, cheap(1)); t.put('1', 0, cheap(1)); // opposing cards do not count
  assert.equal(t.stars('0', 0, c), 13);
});
test('Hot Sauce Karaoke: +1 for each card in your Trash', () => {
  const t = mk(); const c = t.put('0', 0, 'Hot Sauce Karaoke');
  assert.equal(t.stars('0', 0, c), 0);
  t.as('0', 'testTrash', '0', cheap(1)); t.as('0', 'testTrash', '0', cheap(1)); t.as('0', 'testTrash', '0', cheap(2));
  assert.equal(t.stars('0', 0, c), 3);
});
test("Bug Burger Cooking Stream: ⭐ equal your Persona's ⭐", () => {
  const t = mk(); const c = t.put('0', 1, 'Bug Burger Cooking Stream');
  assert.equal(t.stars('0', 1, c), t.G().players['0'].persona.inf);
  t.as('0', 'dbgDeploy', '0', 1);
});
test('Wanna Hear a Joel-ke?: +3 for each other platform where you have Content', () => {
  const t = mk(); const c = t.put('0', 0, 'Wanna Hear a Joel-ke?');
  assert.equal(t.stars('0', 0, c), 5);
  t.put('0', 1, cheap(1)); assert.equal(t.stars('0', 0, c), 8);
  t.put('0', 2, cheap(1)); t.put('1', 2, cheap(1)); assert.equal(t.stars('0', 0, c), 11);
});
test('Toilet Swimmer: -1 for each card in your opponent\'s hand', () => {
  const t = mk(); const c = t.put('0', 0, 'Toilet Swimmer');
  assert.equal(t.stars('0', 0, c), 11 - t.G().players['1'].hand.length);
  t.give('1', cheap(1)); assert.equal(t.stars('0', 0, c), 11 - t.G().players['1'].hand.length);
});
test('Tomboy Abs: +10 only for the First Player', () => {
  const t = mk(); const a = t.put('0', 0, 'Tomboy Abs'), b = t.put('1', 1, 'Tomboy Abs');
  const first = t.G().firstPlayer;
  assert.equal(t.stars('0', 0, a), first === '0' ? 19 : 9);
  assert.equal(t.stars('1', 1, b), first === '1' ? 19 : 9);
});
test('Good Boy: +5 with 5 or more cards in your hand', () => {
  const t = mk(); const c = t.put('0', 0, 'Good Boy');
  t.as('0', 'dbgClearHand', '0'); for (let i = 0; i < 4; i++) t.give('0', cheap(1));
  assert.equal(t.stars('0', 0, c), 10);
  t.give('0', cheap(1)); assert.equal(t.stars('0', 0, c), 15);
});

test('Casual Misogyny: +10 with Content on every platform', () => {
  const t = mk(); const c = t.put('0', 0, 'Casual Misogyny');
  assert.equal(t.stars('0', 0, c), 16);
  t.put('0', 1, cheap(1)); assert.equal(t.stars('0', 0, c), 16);
  t.put('0', 2, cheap(1)); assert.equal(t.stars('0', 0, c), 26);
});
test('Convenience Store: +3 while it is your only Content here', () => {
  const t = mk(); const c = t.put('0', 0, 'Convenience Store');
  assert.equal(t.stars('0', 0, c), 8);
  t.put('0', 0, cheap(1)); assert.equal(t.stars('0', 0, c), 5);
});
test('Vaseline On Toast: while Dominating, +3 ⭐ at each adjacent platform', () => {
  const t = mk(), base = mk(); t.put('0', 1, 'Vaseline On Toast');
  const gain = (i) => sideInf(t.G(), i, '0') - sideInf(base.G(), i, '0');
  assert.equal(gain(0), 3); assert.equal(gain(2), 3); // the centre's neighbours are LEFT and RIGHT
  assert.equal(gain(1), 6); // at its own platform only its printed 6 ⭐ counts, no extra
  t.put('1', 1, cheap(1)); // tied at the centre: no longer Dominating
  assert.equal(gain(0), 0);
});

// ---------- When Played ----------
test('Sock Puppet Stream: gain 1 💎 and draw 1 card', () => {
  const t = mk(); t.bits('0', 10); const hand = t.G().players['0'].hand.length;
  t.play('0', 'Sock Puppet Stream', 0);
  assert.equal(t.G().players['0'].bits, 10 - 4 + 1);
  assert.equal(t.G().players['0'].hand.length, hand + 1 - 1 + 1); // +1 given, -1 played, +1 drawn
});
test('Date Night: draw 1, then discard 1', () => {
  const t = mk(); t.bits('0', 10);
  t.play('0', 'Date Night', 0);
  assert.equal(t.G().pendingDiscard['0'], 1);
});
test('Blockheads Big Adventure!: 1 💎 for each OTHER platform where you have Content', () => {
  const t = mk(); t.bits('0', 10); t.put('0', 1, cheap(1)); t.put('0', 2, cheap(1)); t.put('1', 0, cheap(1));
  t.play('0', 'Blockheads Big Adventure!', 0);
  assert.equal(t.G().players['0'].bits, 10 - 1 + 2);
});
test('Step on Building Blocks: an opposing Persona loses 3 ⭐ this round', () => {
  const t = mk({ at0: 0, at1: 0 }); t.bits('0', 10);
  const before = sideInf(t.G(), 0, '1');
  t.play('0', 'Step on Building Blocks', 0);
  assert.equal(sideInf(t.G(), 0, '1'), Math.max(0, before - 3));
});
test('Rampant Narcissim: may play another 🟡1 Content for free', () => {
  const t = mk(); t.bits('0', 10); const c = t.give('0', cheap(1)); t.bits('0', 10);
  t.play('0', 'Rampant Narcissim', 0);
  assert.ok(t.ch(), 'a choice is offered'); const bits = t.G().players['0'].bits;
  t.pick('0', c.name);
  assert.ok(at(t, 0, '0').includes(c.name)); assert.equal(t.G().players['0'].bits, bits, 'it was free');
});
test('Retro Games: free Content card with 🟡2 or less; a 🟡3 card is not offered', () => {
  const t = mk(); t.bits('0', 10); t.as('0', 'dbgClearHand', '0'); const two = t.give('0', cheap(2)); t.give('0', cheap(3));
  t.play('0', 'Retro Games', 0);
  assert.deepEqual(t.ch().options.map((o) => o.name), [two.name]);
});

test('WHO ARE YOU?: free Content card (🟡6 or less) onto ANOTHER platform', () => {
  const t = mk(); t.bits('0', 20); const c = t.give('0', cheap(5));
  t.play('0', 'WHO ARE YOU?', 0);
  t.pick('0', c.name); t.pick('0', '2');
  assert.ok(at(t, 2, '0').includes(c.name));
});
test('Knock Knock: may move one of your Content cards from another platform here', () => {
  const t = mk(); t.bits('0', 10); const m = t.put('0', 2, cheap(1));
  t.play('0', 'Knock Knock', 0); t.pick('0', m.name);
  assert.ok(at(t, 0, '0').includes(m.name)); assert.ok(!at(t, 2, '0').includes(m.name));
});
test('Robot Vacuum / In Your Walls: move ANOTHER Content card of yours to another platform', () => {
  for (const name of ['Robot Vacuum', 'In Your Walls']) {
    const t = mk(); t.bits('0', 10); const m = t.put('0', 0, cheap(1));
    t.play('0', name, 0);
    assert.deepEqual(t.ch().options.map((o) => o.name), [m.name], 'it cannot pick itself');
    t.pick('0', m.name); t.pick('0', '1');
    assert.ok(at(t, 1, '0').includes(m.name));
  }
});
test('Kiss, Marry, Kill: the OPPONENT chooses which of their Content cards is deleted', () => {
  const t = mk(); t.bits('0', 10); const a = t.put('1', 0, cheap(1)), b = t.put('1', 0, cheap(2));
  t.play('0', 'Kiss, Marry, Kill', 0);
  assert.equal(t.ch().player, '1');
  t.pick('1', b.name);
  assert.deepEqual(at(t, 0, '1'), [a.name]); assert.ok(t.G().players['1'].trash.some((c) => c.id === b.id));
});
test('Mods, Ban Them: the opponent moves one of their 🌠 away from this platform', () => {
  const t = mk(); t.bits('0', 10); t.as('0', 'dbgSetPop', 0, '1', 2);
  t.play('0', 'Mods, Ban Them', 0);
  assert.equal(t.ch().player, '1'); t.pick('1', '2');
  assert.equal(t.G().platforms[0].pop['1'], 1); assert.equal(t.G().platforms[2].pop['1'], 1);
});
test('Oversized Thighs: move 1 opposing 🌠 from another platform to this one', () => {
  const t = mk(); t.bits('0', 10); t.as('0', 'dbgSetPop', 2, '1', 1);
  t.play('0', 'Oversized Thighs', 0); t.pick('0', '2');
  assert.equal(t.G().platforms[2].pop['1'], 0); assert.equal(t.G().platforms[0].pop['1'], 1);
});
test('Joystick User: gain 1 🌠 only if the opponent has more here', () => {
  const t = mk(); t.bits('0', 10); t.as('0', 'dbgSetPop', 0, '1', 2); t.as('0', 'dbgSetPop', 0, '0', 1);
  t.play('0', 'Joystick User', 0); assert.equal(t.G().platforms[0].pop['0'], 2);
  const u = mk(); u.bits('0', 10); u.as('0', 'dbgSetPop', 0, '0', 1); u.as('0', 'dbgSetPop', 0, '1', 1);
  u.play('0', 'Joystick User', 0); assert.equal(u.G().platforms[0].pop['0'], 1, 'tied: no gain');
});
test('Touch Grass: each player keeps 1 Content card, all others (including Touch Grass) are deleted', () => {
  const t = mk(); t.bits('0', 20); const mine = t.put('0', 0, cheap(1)); t.put('0', 0, cheap(2)); const theirs = t.put('1', 0, cheap(3)); t.put('1', 0, cheap(4));
  t.play('0', 'Touch Grass', 0);
  t.pick('0', `c|0|0|${mine.id}`); t.pick('1', `c|0|1|${theirs.id}`);
  assert.deepEqual(at(t, 0, '0'), [mine.name]); assert.deepEqual(at(t, 0, '1'), [theirs.name]);
});

test('Boy Failure: return another of your Content cards here to hand; with none, delete itself', () => {
  const t = mk(); t.bits('0', 10); const m = t.put('0', 0, cheap(1));
  t.play('0', 'Boy Failure', 0); t.pick('0', m.name);
  assert.ok(t.G().players['0'].hand.some((c) => c.id === m.id)); assert.ok(at(t, 0, '0').includes('Boy Failure'));
  const u = mk(); u.bits('0', 10); u.play('0', 'Boy Failure', 0);
  assert.ok(!at(u, 0, '0').includes('Boy Failure'), 'deleted when there is nothing to return');
});
test('Fashionista: the opponent\'s Content costs 3 more this round', () => {
  const t = mk(); t.bits('0', 20); const c = t.give('1', cheap(2)); const before = playCost(t.G(), '1', c, 0);
  t.play('0', 'Fashionista', 0);
  assert.equal(playCost(t.G(), '1', c, 0), before + 3); assert.equal(playCost(t.G(), '0', c, 0), before, 'only the opponent');
});
test('Queen Status: +3 this round only if the opposing Persona is on this platform', () => {
  const t = mk({ at0: 0, at1: 0 }); t.bits('0', 10); const c = t.play('0', 'Queen Status', 0);
  assert.equal(t.stars('0', 0, t.G().platforms[0].cards['0'].find((x) => x.id === c.id)), 7);
  const u = mk({ at0: 0, at1: 1 }); u.bits('0', 10); const d = u.play('0', 'Queen Status', 0);
  assert.equal(u.stars('0', 0, u.G().platforms[0].cards['0'].find((x) => x.id === d.id)), 4);
});

// ---------- costs and restrictions ----------
test('Sigma Alpha Dominant: costs 1 less for each Content card you have in play', () => {
  const t = mk(); const c = t.give('0', 'Sigma Alpha Dominant');
  assert.equal(playCost(t.G(), '0', c, 0), 5);
  t.put('0', 1, cheap(1)); t.put('0', 2, cheap(1)); t.put('1', 0, cheap(1));
  assert.equal(playCost(t.G(), '0', c, 0), 3);
});
test('MILC: Content cards cost 1 less on other platforms', () => {
  const t = mk(); t.put('0', 0, 'MILC'); const c = t.give('0', cheap(3));
  assert.equal(playCost(t.G(), '0', c, 0), 3); assert.equal(playCost(t.G(), '0', c, 1), 2);
});
test('Trash Talk: Actions cost opponents 2 more while clashing at this platform', () => {
  const t = mk(); t.clash();
  const idx = t.G().clashSequence[t.G().clashIndex];
  t.put('0', idx, 'Trash Talk'); const a = t.give('1', 'Hype'), mine = t.give('0', 'Hype');
  const base = card('Hype').cost;
  assert.equal(playCost(t.G(), '1', a, idx), base + 2);
  assert.equal(playCost(t.G(), '0', mine, idx), base, 'its own player pays the normal cost');
});

test('Caught in 4k: you can\'t play other Content cards on this platform (opponent can)', () => {
  const t = mk(); t.put('0', 0, 'Caught in 4k'); const a = t.give('0', cheap(1)), b = t.give('1', cheap(1));
  assert.equal(contentBlocked(t.G(), '0', a, 0), true); assert.equal(contentBlocked(t.G(), '0', a, 1), false);
  assert.equal(contentBlocked(t.G(), '1', b, 0), false);
});
test('Morning Voice Stream: can\'t be played where you already have Content', () => {
  const t = mk(); const c = t.give('0', 'Morning Voice Stream'); t.put('0', 0, cheap(1));
  assert.equal(contentBlocked(t.G(), '0', c, 0), true); assert.equal(contentBlocked(t.G(), '0', c, 1), false);
});
test('Brain Rot: each player may play only 1 Content per round on this platform', () => {
  const t = mk(); t.bits('0', 30); t.bits('1', 30); t.put('0', 0, 'Brain Rot');
  t.play('0', cheap(1), 0); const second = t.give('0', cheap(1)); const theirs = t.give('1', cheap(1));
  assert.equal(contentBlocked(t.G(), '0', second, 0), true); assert.equal(contentBlocked(t.G(), '0', second, 1), false);
  assert.equal(contentBlocked(t.G(), '1', theirs, 0), false, 'the opponent has not played here yet');
});
test('Nail Painting: opponents can\'t play Content with 🟡2 or less here (you can)', () => {
  const t = mk(); t.put('0', 0, 'Nail Painting'); const a = t.give('0', cheap(1)), b = t.give('1', cheap(2)), c = t.give('1', cheap(3));
  assert.equal(contentBlocked(t.G(), '1', b, 0), true); assert.equal(contentBlocked(t.G(), '1', c, 0), false);
  assert.equal(contentBlocked(t.G(), '0', a, 0), false);
});

// ---------- leaving play, triggers and choices ----------
test('Pro Gamer: your OTHER Content is safe from opposing effects (Pro Gamer itself is not), but not from your own', () => {
  const t = mk(); t.bits('0', 30); t.put('1', 0, 'Pro Gamer'); const m = t.put('1', 0, cheap(1));
  t.play('0', 'Kiss, Marry, Kill', 0); t.pick('1', m.name); // the opponent's effect tries to delete the protected card
  assert.ok(at(t, 0, '1').includes(m.name), 'protected');
  t.play('0', 'Kiss, Marry, Kill', 0); t.pick('1', 'Pro Gamer');
  assert.ok(!at(t, 0, '1').includes('Pro Gamer'), 'Pro Gamer does not protect itself');
  const u = mk(); u.bits('1', 30); u.put('1', 0, 'Pro Gamer'); const n = u.put('1', 0, cheap(1));
  u.play('1', "Let 'em Cook", 0); // your own effect can delete your own cards
  assert.ok(!at(u, 0, '1').includes(n.name));
});

test('Vine Boom: Clash Reward deletes every Content card here with 6 ⭐ or less (yours too), not bigger ones', () => {
  const t = mk({ at0: 0, at1: 1 }); t.clash();
  const idx = t.G().clashSequence[t.G().clashIndex];
  t.as('0', 'dbgDeploy', '0', idx);
  t.put('0', idx, 'Vine Boom'); t.put('0', idx, 'NPC Carry'); const mineSmall = t.put('0', idx, cheap(1)); const theirSmall = t.put('1', idx, cheap(1));
  t.passBoth(); // the clash here is won by player 0, so Vine Boom's Clash Reward runs
  assert.ok(!at(t, idx, '1').includes(theirSmall.name), 'their small card was deleted');
  assert.ok(!at(t, idx, '0').includes(mineSmall.name), 'so was my small card');
  assert.ok(at(t, idx, '0').includes('NPC Carry') && at(t, idx, '0').includes('Vine Boom'), 'cards with more than 6 stars stay');
});
test('Horror Game Stream: if it would be deleted it goes back to the TOP of your deck', () => {
  const t = mk(); t.bits('0', 20); t.put('1', 0, 'Horror Game Stream');
  t.play('0', 'Kiss, Marry, Kill', 0); t.pick('1', 'Horror Game Stream');
  assert.equal(t.G().players['1'].deck[0].name, 'Horror Game Stream'); assert.ok(!at(t, 0, '1').includes('Horror Game Stream'));
});
test('CUSTODY BATTLE: Activate gives a Content card on an ADJACENT platform +3 ⭐', () => {
  const t = mk(); const c = t.put('0', 0, 'CUSTODY BATTLE'); const near = t.put('0', 1, cheap(1)); const far = t.put('0', 2, cheap(1));
  t.turn('0'); t.as('0', 'activateCard', c.id);
  assert.deepEqual(t.ch().options.map((o) => o.name), [near.name]); // the centre is adjacent to the left; the right is not
  t.pick('0', near.name); assert.equal(t.stars('0', 1, t.G().platforms[1].cards['0'][0]), near.inf + 3);
});
test('VTuber HR: when your Persona moves here you may move this card away', () => {
  const t = mk({ at0: 0 }); t.clash();
  const idx = t.G().clashSequence[t.G().clashIndex], away = idx === 0 ? 1 : 0;
  t.as('0', 'dbgDeploy', '0', away); const hr = t.put('0', idx, 'VTuber HR');
  const spooky = t.give('0', 'Spooky Town'); t.turn('0'); t.as('0', 'discardAbility', spooky.id); // moves your Persona to the clashing platform
  assert.equal(t.G().personaLocations['0'], idx); assert.ok(t.ch(), 'a choice is offered');
  const dest = [0, 1, 2].find((i) => i !== idx); t.pick('0', String(dest));
  assert.ok(at(t, dest, '0').includes('VTuber HR'));
});

finish();
