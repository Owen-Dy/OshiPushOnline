// Headless tests for the Gen 2 Action card effects. Run: node tests/gen2-actions.test.mjs
import assert from 'assert';
import { mk, test, finish, card } from './harness.mjs';
import { CARDS } from '../cards.js';
import { sideInf, OshiPush } from '../game.js';

const cheap = (cost) => CARDS.find((c) => c.type === 'Content' && c.cost === cost && !(c.effects || []).length && !c.playOnly && !c.xCost).name; // a plain card
const at = (t, idx, id) => t.G().platforms[idx].cards[id].map((c) => c.name);
// A match in the Clash Phase, on the first platform, with both Personas there and plenty of 💎.
const inClash = (opts) => { const t = mk(opts); t.clash(); t.as('0', 'dbgDeploy', '0', 0); t.as('0', 'dbgDeploy', '1', 0); t.bits('0', 30); t.bits('1', 30); return t; };
const key = (idx, owner, c) => `c|${idx}|${owner}|${c.id}`;

// ---------- Content-phase and any-time Actions ----------
test('Euclase Frost: move any number of your 🟡4-or-less Content from here to other platforms', () => {
  const t = mk(); t.bits('0', 10); const a = t.put('0', 0, cheap(1)), b = t.put('0', 0, cheap(2)), big = t.put('0', 0, cheap(5));
  t.play('0', 'Euclase Frost', 0);
  assert.deepEqual(t.ch().options.map((o) => o.name).sort(), [a.name, b.name].sort(), 'the 🟡5 card is not offered');
  t.as('0', 'makeChoice', [key(0, '0', a), key(0, '0', b)]);
  t.pick('0', '1'); t.pick('0', '2');
  assert.deepEqual(at(t, 0, '0'), [big.name]);
  assert.equal(at(t, 1, '0').length + at(t, 2, '0').length, 2);
});
test('Throbbing Egghead: Persona +5 and draw 1 per platform where you are Dominating', () => {
  const t = mk(); t.bits('0', 10); t.put('0', 1, cheap(1)); t.put('0', 2, cheap(1)); t.put('1', 0, cheap(1)); t.put('1', 0, cheap(1));
  const before = sideInf(t.G(), 0, '0'), hand = t.G().players['0'].hand.length;
  t.play('0', 'Throbbing Egghead', 0);
  assert.equal(sideInf(t.G(), 0, '0'), before + 5);
  assert.equal(t.G().players['0'].hand.length, hand + 1 - 1 + 2, 'dominating 2 platforms = 2 cards');
});
test('Remove Ball-Jointed Head: they discard 1, you draw 1 for each card discarded', () => {
  const t = mk(); t.bits('0', 10); const hand = t.G().players['0'].hand.length;
  t.play('0', 'Remove Ball-Jointed Head', 0);
  assert.equal(t.G().pendingDiscard['1'], 1); assert.equal(t.G().players['0'].hand.length, hand + 1 - 1 + 1);
  const u = mk(); u.bits('0', 10); u.as('0', 'dbgClearHand', '1'); const h2 = u.G().players['0'].hand.length;
  u.play('0', 'Remove Ball-Jointed Head', 0);
  assert.equal(u.G().players['0'].hand.length, h2 + 1 - 1, 'nothing to discard, nothing to draw');
});
test('Off the Raelz: reveal 3, draw a Content card from them, discard the rest', () => {
  const t = mk(); t.bits('0', 10); const c = cheap(2), d = cheap(1);
  t.as('0', 'testDeck', '0', [c, 'Pinata', d, 'Hype']); t.play('0', 'Off the Raelz', 0);
  assert.deepEqual(t.ch().options.map((o) => o.name).sort(), [c, d].sort()); assert.equal(t.ch().revealed.length, 3);
  const trash = t.G().players['0'].trash.length; t.pick('0', c);
  assert.ok(t.G().players['0'].hand.some((x) => x.name === c));
  assert.equal(t.G().players['0'].trash.length, trash + 2, 'the other two revealed cards are discarded');
  assert.equal(t.G().players['0'].deck[0].name, 'Hype', 'the 4th card was not revealed');
});
test('AVId Gummy Worm Enjoyer: Persona +10 this round', () => {
  const t = mk(); t.bits('0', 10); const before = sideInf(t.G(), 0, '0'); t.play('0', 'AVId Gummy Worm Enjoyer', 0);
  assert.equal(sideInf(t.G(), 0, '0'), before + 10);
});
test('Soulslike Notes: draw until you have 3 cards', () => {
  const t = mk(); t.bits('0', 10); t.as('0', 'dbgClearHand', '0'); t.give('0', 'Soulslike Notes'); t.turn('0');
  t.as('0', 'playCard', t.G().players['0'].hand[0].id, 0);
  assert.equal(t.G().players['0'].hand.length, 3);
  const u = mk(); u.bits('0', 10); u.as('0', 'dbgClearHand', '0'); for (let i = 0; i < 4; i++) u.give('0', cheap(1)); u.play('0', 'Soulslike Notes', 0);
  assert.equal(u.G().players['0'].hand.length, 4, 'already at 3 or more: draws nothing');
});
test('Ash Blasting: choose a card from the opponent\'s hand; it is discarded', () => {
  const t = mk(); t.bits('0', 10); t.as('0', 'dbgClearHand', '1'); const x = t.give('1', cheap(1)); t.give('1', cheap(2));
  t.play('0', 'Ash Blasting', 0); assert.equal(t.ch().options.length, 2); t.pick('0', x.name);
  assert.equal(t.G().players['1'].hand.length, 1); assert.ok(t.G().players['1'].trash.some((c) => c.id === x.id));
});
test('Sniffa: play Content on any platform this round', () => {
  const t = mk(); t.bits('0', 10); t.play('0', 'Sniffa', 0); assert.equal(t.G().anyPlatform['0'], true);
});
test('Hard Pivot: discard any number of cards, then draw that many', () => {
  const t = mk(); t.bits('0', 10); t.as('0', 'dbgClearHand', '0'); const a = t.give('0', cheap(1)), b = t.give('0', cheap(2)); t.give('0', cheap(3));
  t.play('0', 'Hard Pivot', 0); const trash = t.G().players['0'].trash.length;
  t.as('0', 'makeChoice', [`h|${a.id}`, `h|${b.id}`]);
  assert.equal(t.G().players['0'].trash.length, trash + 2); assert.equal(t.G().players['0'].hand.length, 3, '1 kept + 2 drawn');
});
test('Waifu Wheel: draw 3, then you may put any 2 cards from your hand on top of your deck', () => {
  const setup = () => { const t = mk(); t.bits('0', 10); t.as('0', 'dbgClearHand', '0'); t.as('0', 'testDeck', '0', [cheap(1), cheap(2), cheap(3), 'Hype', 'Pinata']); t.play('0', 'Waifu Wheel', 0); return t; };
  const t = setup(); assert.equal(t.G().players['0'].hand.length, 3, 'drew 3'); assert.equal(t.ch().min, 0); assert.equal(t.ch().max, 2);
  const [a, b] = t.ch().options.map((o) => o.key);
  t.as('0', 'makeChoice', [a, b]);
  assert.equal(t.G().players['0'].hand.length, 1); assert.ok(t.ch(), 'with 2 cards you choose which goes on top');
  const top = t.ch().options[1]; t.as('0', 'makeChoice', [top.key]);
  assert.equal(t.G().players['0'].deck[0].name, top.name, 'the card you chose is on top'); assert.equal(t.G().players['0'].deck.length, 2 + 2);
  const u = setup(); u.as('0', 'makeChoice', []); assert.equal(u.G().players['0'].hand.length, 3, 'you may also put nothing back');
  const v = setup(); v.as('0', 'makeChoice', [v.ch().options[0].key]); assert.equal(v.G().players['0'].hand.length, 2); assert.ok(!v.ch());
});

test('Be More Cultured: return an opposing Content card ON THIS PLATFORM with 🟡 up to the revealed top card\'s', () => {
  const t = mk(); t.bits('0', 10); const lo = t.put('1', 0, cheap(2)), hi = t.put('1', 1, cheap(5));
  t.as('0', 'testDeck', '0', [cheap(3), cheap(1)]); t.play('0', 'Be More Cultured', 0);
  assert.deepEqual(t.ch().options.map((o) => o.name), [lo.name], 'only 🟡3 or less is offered, and the 🟡5 card is elsewhere'); assert.deepEqual(t.ch().revealed, [cheap(3)]);
  t.pick('0', lo.name); assert.ok(t.G().players['1'].hand.some((c) => c.id === lo.id));
  assert.equal(t.G().players['0'].deck[0].name, cheap(3), 'the revealed card stays on top');
});
test('Lonely MILF: Persona +2, then you look at the top card and may play it (paying its 🟡)', () => {
  const t = mk(); t.bits('0', 10); t.as('0', 'testDeck', '0', [cheap(2), cheap(1)]); const before = sideInf(t.G(), 0, '0');
  t.play('0', 'Lonely MILF Looking for Comfort', 0); const bits = t.G().players['0'].bits;
  assert.equal(sideInf(t.G(), 0, '0'), before + 2); assert.deepEqual(t.ch().options.map((o) => o.key), ['yes', 'no']);
  t.pick('0', 'yes');
  assert.ok(at(t, 0, '0').includes(cheap(2))); assert.equal(t.G().players['0'].bits, bits - 2);
  const n = mk(); n.bits('0', 10); n.as('0', 'testDeck', '0', [cheap(2)]); n.play('0', 'Lonely MILF Looking for Comfort', 0); n.pick('0', 'no');
  assert.equal(n.G().players['0'].deck[0].name, cheap(2), 'declined: it stays on top'); assert.ok(!at(n, 0, '0').includes(cheap(2)));
});
test('Lonely MILF: if you cannot pay, you still get to look at the top card', () => {
  const u = mk(); u.bits('0', 1); u.as('0', 'testDeck', '0', [cheap(5)]); u.give('0', 'Lonely MILF Looking for Comfort'); u.turn('0');
  u.as('0', 'playCard', u.G().players['0'].hand.at(-1).id, 0);
  const ch = u.ch(); assert.ok(ch, 'a choice is shown'); assert.ok(ch.prompt.includes(cheap(5)), 'it names the card'); assert.deepEqual(ch.options.map((o) => o.key), ['no'], 'but there is nothing to play');
  u.pick('0', 'no'); assert.equal(u.G().players['0'].deck[0].name, cheap(5));
});
test('A secret choice does not leak its prompt to the opponent', () => {
  const u = mk(); u.bits('0', 1); u.as('0', 'testDeck', '0', [cheap(5)]); u.give('0', 'Lonely MILF Looking for Comfort'); u.turn('0');
  u.as('0', 'playCard', u.G().players['0'].hand.at(-1).id, 0);
  const view = (id) => OshiPush.playerView({ G: u.G(), playerID: id }).choices[0];
  assert.ok(view('0').prompt.includes(cheap(5)), 'you see the card'); assert.equal(view('1').prompt, '', 'the opponent sees no prompt');
});

test('No Prep, No Problem: move a Content card from a platform with 2+ Content to another platform', () => {
  const t = mk(); t.bits('0', 10); const a = t.put('0', 1, cheap(1)), b = t.put('1', 1, cheap(2)); t.put('0', 2, cheap(3));
  t.play('0', 'No Prep, No Problem', 0);
  assert.deepEqual(t.ch().options.map((o) => o.name).sort(), [a.name, b.name].sort(), 'the lone card on platform 2 is not offered');
  t.pick('0', b.name); t.pick('0', '2'); assert.ok(at(t, 2, '1').includes(b.name));
});
test('Accidental Flash: move up to 2 opposing 🌠 from here to other platforms', () => {
  const t = mk(); t.bits('0', 10); t.as('0', 'dbgSetPop', 0, '1', 2); t.play('0', 'Accidental Flash', 0);
  t.pick('0', '1'); t.pick('0', '2');
  assert.deepEqual([0, 1, 2].map((i) => t.G().platforms[i].pop['1']), [0, 1, 1]);
  const u = mk(); u.bits('0', 10); u.as('0', 'dbgSetPop', 0, '1', 1); u.play('0', 'Accidental Flash', 0);
  u.pick('0', '1'); u.pick('0', '2'); assert.deepEqual([0, 1, 2].map((i) => u.G().platforms[i].pop['1']), [0, 1, 0], 'only 1 🌠 existed: nothing goes negative');
});

// ---------- clash-only Actions ----------
test('Unique Laughing Sounds: Persona +3 this clash for each Content card you have in play', () => {
  const t = inClash(); t.put('0', 1, cheap(1)); t.put('0', 2, cheap(1)); const before = sideInf(t.G(), 0, '0');
  t.play('0', 'Unique Laughing Sounds', 0); assert.equal(sideInf(t.G(), 0, '0'), before + 6);
});
test('Date Your Mom: Persona +5 this clash for each platform where you have 🌠', () => {
  const t = inClash(); t.as('0', 'dbgSetPop', 1, '0', 1); t.as('0', 'dbgSetPop', 2, '0', 2); const before = sideInf(t.G(), 0, '0');
  t.play('0', 'Date Your Mom', 0); assert.equal(sideInf(t.G(), 0, '0'), before + 10);
});
test('Intended Flash: Persona +5 and +1 for each card in your opponents\' hands', () => {
  const t = inClash(); const before = sideInf(t.G(), 0, '0'), opp = t.G().players['1'].hand.length;
  t.play('0', 'Intended Flash', 0); assert.equal(sideInf(t.G(), 0, '0'), before + 5 + opp);
});
test('Take a Shot: one of your Content cards gains +6 this clash', () => {
  const t = inClash(); const c = t.put('0', 0, cheap(1)); const before = t.stars('0', 0, c);
  t.play('0', 'Take a Shot', 0); t.pick('0', c.name); assert.equal(t.stars('0', 0, t.G().platforms[0].cards['0'][0]), before + 6);
});
test('ARF ARF: +1 ⭐ this clash for each card in your Trash', () => {
  const t = inClash(); const c = t.put('0', 0, cheap(1)); t.as('0', 'testTrash', '0', cheap(1)); t.as('0', 'testTrash', '0', cheap(2));
  const before = t.stars('0', 0, c), trash = t.G().players['0'].trash.length; t.play('0', 'ARF ARF', 0); const after = t.G().players['0'].trash.length;
  t.pick('0', c.name); assert.equal(t.stars('0', 0, t.G().platforms[0].cards['0'][0]), before + after);
});
test('Aggressive Bite: only during a clash; an opposing Content card here loses 5 ⭐', () => {
  const t = mk(); t.bits('0', 10); const c = t.give('0', 'Aggressive Bite'); t.turn('0'); t.as('0', 'playCard', c.id, 0);
  assert.equal(t.G().players['0'].hand.some((x) => x.id === c.id), true, 'not playable outside a clash');
  const u = inClash(); const big = u.put('1', 0, 'NPC Carry'); u.play('0', 'Aggressive Bite', 0); u.pick('0', 'NPC Carry');
  assert.equal(u.stars('1', 0, u.G().platforms[0].cards['1'][0]), 12);
});
test('Nose Pull: delete an opposing Content card on this platform', () => {
  const t = inClash(); const c = t.put('1', 0, cheap(1)); t.play('0', 'Nose Pull', 0); t.pick('0', c.name);
  assert.ok(!at(t, 0, '1').includes(c.name)); assert.ok(t.G().players['1'].trash.some((x) => x.id === c.id));
});
test('Cage Chat: -4 ⭐ this clash, and the card is deleted if it ends with 0 ⭐', () => {
  const t = inClash(); const weak = t.put('1', 0, cheap(1)), big = t.put('1', 1, 'NPC Carry');
  t.play('0', 'Cage Chat', 0); t.pick('0', big.name); assert.equal(t.stars('1', 1, t.G().platforms[1].cards['1'][0]), 13, 'a strong card just loses 4');
  t.turn('0'); t.play('0', 'Cage Chat', 0); t.pick('0', weak.name); assert.ok(!at(t, 0, '1').includes(weak.name), 'a weak card is deleted');
});
test('Identity Theft: your Persona gets "Clash Reward: steal 1 🌠 on this platform" this round', () => {
  const t = inClash(); t.play('0', 'Identity Theft', 0);
  const r = t.G().roundRewards['0'] || []; assert.ok(r.length && r[0].effects[0].type === 'stealPop');
});

// ---------- resolving the clash ----------
test('Pinata: if you are Dominating this platform, you win the clash even with fewer ⭐', () => {
  const t = inClash(); t.put('0', 0, cheap(1)); t.put('0', 0, cheap(1)); t.put('1', 0, 'NPC Carry'); // I have more cards, they have far more ⭐
  assert.ok(sideInf(t.G(), 0, '1') > sideInf(t.G(), 0, '0'));
  t.play('0', 'Pinata', 0); t.passBoth(); assert.equal(t.G().platforms[0].pop['0'], 1); assert.equal(t.G().platforms[0].pop['1'], 0);
});
test('Pinata does nothing if you are not Dominating', () => {
  const t = inClash(); t.put('1', 0, 'NPC Carry'); t.play('0', 'Pinata', 0); t.passBoth();
  assert.equal(t.G().platforms[0].pop['1'], 1); assert.equal(t.G().platforms[0].pop['0'], 0);
});
test('Bonus Three Inches: with Content on every platform you win the clash', () => {
  const t = inClash(); t.put('0', 0, cheap(1)); t.put('0', 1, cheap(1)); t.put('0', 2, cheap(1)); t.put('1', 0, 'NPC Carry');
  t.play('0', 'Bonus Three Inches', 0); t.passBoth(); assert.equal(t.G().platforms[0].pop['0'], 1); assert.equal(t.G().platforms[0].pop['1'], 0);
  const u = inClash(); u.put('0', 0, cheap(1)); u.put('1', 0, 'NPC Carry'); u.play('0', 'Bonus Three Inches', 0); u.passBoth();
  assert.equal(u.G().platforms[0].pop['1'], 1, 'a platform without your Content: no forced win');
});
test('Boymode: your opponent can\'t gain 🌠 from this clash', () => {
  const t = inClash(); t.put('1', 0, 'NPC Carry'); t.play('0', 'Boymode', 0); t.passBoth();
  assert.equal(t.G().platforms[0].pop['1'], 0); assert.equal(t.G().platforms[0].pop['0'], 0);
});

test('"Opposing" means the platform your Persona is on: Be More Cultured ignores opposing Content on other platforms', () => {
  const t = mk(); t.bits('0', 10); const elsewhere = t.put('1', 2, cheap(1)); t.as('0', 'testDeck', '0', [cheap(3)]);
  t.play('0', 'Be More Cultured', 0); assert.ok(!t.ch(), 'no opposing Content here: nothing to return');
  assert.ok(at(t, 2, '1').includes(elsewhere.name));
});
test('"Opposing" means the platform your Persona is on: Vomit Drawer only deletes opposing Content here', () => {
  const t = mk(); t.bits('0', 10); const weak = CARDS.find((c) => c.type === 'Content' && c.inf <= 6 && !c.xCost && !(c.effects || []).length).name; const far = t.put('1', 2, weak), near = t.put('1', 0, weak);
  t.play('0', 'Vomit Drawer', 0); assert.deepEqual(t.ch().options.map((o) => o.name), [near.name]); assert.ok(at(t, 2, '1').includes(far.name));
});
test('"Opposing" Persona: Chew on Cables only affects the opposing Persona if it is on this platform', () => {
  const here = inClash(); const before = sideInf(here.G(), 0, '1'); here.play('0', 'Chew on Cables', 0);
  assert.equal(sideInf(here.G(), 0, '1'), 0); assert.ok(before > 0);
  const away = mk({ at0: 0, at1: 1 }); away.clash(); away.as('0', 'dbgDeploy', '0', 0); away.as('0', 'dbgDeploy', '1', 1); away.bits('0', 30);
  const b2 = sideInf(away.G(), 1, '1'); away.play('0', 'Chew on Cables', 0);
  assert.equal(sideInf(away.G(), 1, '1'), b2, 'their Persona is on another platform: unaffected');
});

finish();
