// Headless tests for Premium Content, flipping and Exhaust. Run: node tests/gen2-premium.test.mjs
import assert from 'assert';
import { mk, test, finish } from './harness.mjs';
import { CARDS } from '../cards.js';
import { OshiPush, sideInf, canFlip, fxOf, premiumOf, contentBlocked } from '../game.js';

const SAFE = new Set(['discardAbility']); // a card whose only ability works from your hand is as good as a plain one on the board
const cheap = (cost) => (CARDS.find((c) => c.type === 'Content' && c.cost === cost && !(c.effects || []).length && !c.playOnly && !c.xCost)
  || CARDS.find((c) => c.type === 'Content' && c.cost === cost && (c.effects || []).every((e) => SAFE.has(e.type)) && !c.playOnly && !c.xCost)).name; // a plain card to play for free
const find = (t, c) => { for (let i = 0; i < 3; i++) for (const id of ['0', '1']) { const x = t.G().platforms[i].cards[id].find((k) => k.id === c.id); if (x) return x; } return null; };
const at = (t, idx, id) => t.G().platforms[idx].cards[id].map((c) => c.name);
// Play a Premium card face-down for `id` on `idx` (it costs 🟡2).
const down = (t, id, name, idx = 0) => { t.bits(id, 30); const c = t.play(id, name, idx); return find(t, c); };
const flippable = (t, id, c) => canFlip(t.G(), t.ctx().phase, id, c.id);
const flip = (t, id, c) => { t.turn(id); t.as(id, 'flipCard', c.id); };
const M = (o = {}) => mk({ at0: 0, at1: 0, ...o });

// ---------- face-down play and hidden information ----------
test('Premium: played face-down as a 🟡2 Content card with 3 ⭐, and its text is inactive', () => {
  const t = M(); t.bits('0', 10); const c = find(t, t.play('0', 'Gamer Gene', 0));
  assert.equal(c.faceDown, true); assert.equal(t.G().players['0'].bits, 8); assert.equal(t.stars('0', 0, c), 3);
  assert.deepEqual(fxOf(c, 'premium'), [], 'a face-down card has no active text'); assert.ok(premiumOf(c));
});
test('An opponent sees that a face-down card is there, but not what it is', () => {
  const t = M(); const c = down(t, '0', 'Gamer Gene');
  const theirs = OshiPush.playerView({ G: t.G(), playerID: '1' }), mine = OshiPush.playerView({ G: t.G(), playerID: '0' });
  const v = theirs.platforms[0].cards['0'][0];
  assert.equal(v.name, 'Face-down card'); assert.deepEqual(v.effects, []); assert.equal(v.art, undefined); assert.equal(v.id, c.id);
  assert.equal(mine.platforms[0].cards['0'][0].name, 'Gamer Gene');
  assert.equal(sideInf(theirs, 0, '0'), sideInf(t.G(), 0, '0'), 'their view adds up to the same ⭐');
});
test('Choosing among opposing cards never names a face-down one', () => {
  const t = M(); t.bits('0', 10); down(t, '1', 'Gamer Gene'); t.play('0', 'Vomit Drawer', 0);
  assert.deepEqual(t.ch().options.map((o) => o.name), ['Face-down card']);
});
test('Only the player who played it can flip it, and only on their own action', () => {
  const t = M(); const c = down(t, '0', 'Bepis Tower'); // flips when the opposing Persona is here (it is)
  assert.equal(flippable(t, '0', c), true); assert.equal(flippable(t, '1', c), false);
  t.turn('1'); t.as('1', 'flipCard', c.id); assert.equal(find(t, c).faceDown, true);
});
test('Flipping is an action: it flips the card, tells both players, and passes the turn', () => {
  const t = M(); const c = down(t, '0', 'Bepis Tower'); t.turn('0');
  t.as('0', 'flipCard', c.id);
  assert.equal(find(t, c).faceDown, false); assert.equal(t.stars('0', 0, find(t, c)), 8);
  assert.equal(t.G().notice.flipped, 'Bepis Tower'); assert.equal(t.G().flipped['0'], 1); assert.equal(t.cur(), '1');
});
test('A face-down card with an unmet condition cannot be flipped', () => {
  const t = M({ at0: 0, at1: 1 }); const c = down(t, '0', 'Bepis Tower'); // their Persona is elsewhere
  assert.equal(flippable(t, '0', c), false); t.turn('0'); t.as('0', 'flipCard', c.id); assert.equal(find(t, c).faceDown, true);
});

// ---------- each Premium card: Flip Condition and When Flipped ----------
test('Wisdom of the Day: flips after an opponent plays Content here; then play a 🟡2 Content for free', () => {
  const t = M(); t.bits('1', 30); const c = down(t, '0', 'Wisdom of the Day'); t.give('0', cheap(2));
  assert.equal(flippable(t, '0', c), false); t.play('1', cheap(1), 0); assert.equal(flippable(t, '0', c), true);
  flip(t, '0', c); assert.ok(t.ch()); const bits = t.G().players['0'].bits; t.pick('0', cheap(2)); assert.equal(t.G().players['0'].bits, bits, 'free');
});
test('Gamer Gene: flips when an opponent has a Content card with 🟡4+ here (10 ⭐ when flipped)', () => {
  const t = M(); const c = down(t, '0', 'Gamer Gene'); assert.equal(flippable(t, '0', c), false);
  t.put('1', 0, cheap(3)); assert.equal(flippable(t, '0', c), false); t.put('1', 0, cheap(4)); assert.equal(flippable(t, '0', c), true);
  flip(t, '0', c); assert.equal(t.stars('0', 0, find(t, c)), 10);
});
test('Chat Control: flips when an opponent is Dominating; then delete an opposing Content card here', () => {
  const t = M(); const c = down(t, '0', 'Chat Control'); assert.equal(flippable(t, '0', c), false);
  const a = t.put('1', 0, cheap(1)); t.put('1', 0, cheap(2)); assert.equal(flippable(t, '0', c), true);
  flip(t, '0', c); t.pick('0', a.name); assert.ok(!at(t, 0, '1').includes(a.name));
});
test('Child Support: flips when an opponent has more cards in hand; they discard 2', () => {
  const t = M(); const c = down(t, '0', 'Child Support'); t.as('0', 'dbgClearHand', '0'); t.as('0', 'dbgClearHand', '1');
  assert.equal(flippable(t, '0', c), false); t.give('1', cheap(1)); assert.equal(flippable(t, '0', c), true);
  t.give('1', cheap(1)); flip(t, '0', c); assert.equal(t.G().pendingDiscard['1'], 2);
});
test("Tier List: flips when an opponent's Persona is on another platform; may move a Content card away", () => {
  const t = M({ at0: 0, at1: 1 }); const c = down(t, '0', 'Tier List'); assert.equal(flippable(t, '0', c), true);
  const m = t.put('0', 0, cheap(1)); flip(t, '0', c); t.pick('0', m.name); t.pick('0', '2'); assert.ok(at(t, 2, '0').includes(m.name));
  const u = M(); assert.equal(flippable(u, '0', down(u, '0', 'Tier List')), false);
});
test('Against TOS: flips when you have fewer Subscribers; opponents cannot play Content here this round', () => {
  const t = M(); const c = down(t, '0', 'Against TOS'); assert.equal(flippable(t, '0', c), false);
  t.as('0', 'dbgSet', '1', 10, 3); assert.equal(flippable(t, '0', c), true);
  const x = t.give('1', cheap(1)); flip(t, '0', c); assert.equal(contentBlocked(t.G(), '1', x, 0), true); assert.equal(contentBlocked(t.G(), '1', x, 1), false);
});
test('Short Attention Span: flips with an empty hand; draw 2', () => {
  const t = M(); const c = down(t, '0', 'Short Attention Span'); t.give('0', cheap(1)); assert.equal(flippable(t, '0', c), false);
  t.as('0', 'dbgClearHand', '0'); assert.equal(flippable(t, '0', c), true); flip(t, '0', c); assert.equal(t.G().players['0'].hand.length, 2);
});
test('Wardrobe Malfunction: flips with more ⭐ here; only during a clash it stops opposing Actions', () => {
  const t = M(); const c = down(t, '0', 'Wardrobe Malfunction'); t.put('1', 0, cheap(1)); t.put('1', 0, cheap(2)); t.put('1', 0, cheap(3));
  assert.equal(flippable(t, '0', c), false); t.put('0', 0, 'NPC Carry'); assert.equal(flippable(t, '0', c), true);
  flip(t, '0', c); assert.equal(t.G().actionLock['1'], false, 'not in a clash: no lock');
  const u = M(); const d = down(u, '0', 'Wardrobe Malfunction'); u.put('0', 0, 'NPC Carry'); u.clash(); flip(u, '0', d); assert.equal(u.G().actionLock['1'], true);
});
test("Spray Streamer: flips after an opponent plays Content here; set an opposing card's ⭐ to 0 this round", () => {
  const t = M(); t.bits('1', 30); const c = down(t, '0', 'Spray Streamer'); const big = t.put('1', 0, 'NPC Carry'); t.play('1', cheap(1), 0);
  assert.equal(flippable(t, '0', c), true); flip(t, '0', c); t.pick('0', 'NPC Carry'); assert.equal(t.stars('1', 0, find(t, big)), 0);
});
test('Sudden Stream Scuff: flips when an opponent is Dominating; +10 ⭐ this round', () => {
  const t = M(); const c = down(t, '0', 'Sudden Stream Scuff'); t.put('1', 0, cheap(1)); t.put('1', 0, cheap(1));
  const printed = CARDS.find((x) => x.name === 'Sudden Stream Scuff').inf; flip(t, '0', c); assert.equal(t.stars('0', 0, find(t, c)), printed + 10);
});
test('Marketable Plushie: flips when your opponent has 2+ 🌠 here; gain 4 💎', () => {
  const t = M(); const c = down(t, '0', 'Marketable Plushie'); t.as('0', 'dbgSetPop', 0, '1', 1); assert.equal(flippable(t, '0', c), false);
  t.as('0', 'dbgSetPop', 0, '1', 2); const bits = t.G().players['0'].bits; flip(t, '0', c); assert.equal(t.G().players['0'].bits, bits + 4);
});
test('Powerpoint Presentation: flips after an opponent plays an Action this clash; replay an Action from your Trash for 3 less', () => {
  const t = M(); t.bits('1', 30); const c = down(t, '0', 'Powerpoint Presentation'); t.clash(); t.bits('0', 20); t.bits('1', 30); assert.equal(flippable(t, '0', c), false);
  t.play('1', 'Sniffa', 0); assert.equal(flippable(t, '0', c), true);
  t.as('0', 'testTrash', '0', 'Gacha Pull'); const cost = CARDS.find((x) => x.name === 'Gacha Pull').cost;
  flip(t, '0', c); t.pick('0', 'Gacha Pull'); assert.equal(t.G().players['0'].bits, 20 - Math.max(0, cost - 3));
  assert.equal(t.G().players['0'].deck.at(-1).name, 'Gacha Pull', 'it goes to the bottom of your deck');
});
test('Show Feet: flips only after you flipped another card this round; Persona +5', () => {
  const t = M(); const feet = down(t, '0', 'Show Feet'), gene = down(t, '0', 'Gamer Gene'); assert.equal(flippable(t, '0', feet), false);
  t.play('0', 'Permission to Swear', 0); t.pick('0', 'Gamer Gene'); assert.equal(find(t, gene).faceDown, false); // flipped by another card
  assert.equal(flippable(t, '0', feet), true); const before = sideInf(t.G(), 0, '0'); flip(t, '0', feet); assert.equal(sideInf(t.G(), 0, '0') - before, 5 + (feet.inf - 3));
});
test("Bepis Tower and Single Life: flip when an opponent's Persona is here; Single Life removes an opposing 🌠", () => {
  const t = M(); t.as('0', 'dbgSetPop', 0, '1', 2); const c = down(t, '0', 'Single Life'); assert.equal(flippable(t, '0', c), true);
  flip(t, '0', c); assert.equal(t.G().platforms[0].pop['1'], 1);
  assert.equal(flippable(M({ at0: 0, at1: 2 }), '0', down(M({ at0: 0, at1: 2 }), '0', 'Bepis Tower')), false);
});
test('FIRED: flips after an opponent plays Content here; return an opposing 🟡2-or-less card to hand', () => {
  const t = M(); t.bits('1', 30); const c = down(t, '0', 'FIRED'); const lo = t.put('1', 0, cheap(2)); t.put('1', 0, cheap(4)); t.play('1', cheap(1), 0);
  flip(t, '0', c); assert.ok(!t.ch().options.some((o) => o.cost > 2)); t.pick('0', lo.name); assert.ok(t.G().players['1'].hand.some((x) => x.id === lo.id));
});
test('How to be a Femboy: flips when an opponent has more Subscribers; play a Content card here (paying its cost)', () => {
  const t = M(); const c = down(t, '0', 'How to be a Femboy'); t.as('0', 'dbgSet', '1', 10, 5); assert.equal(flippable(t, '0', c), true);
  const x = t.give('0', cheap(2)); const bits = t.G().players['0'].bits; flip(t, '0', c); t.pick('0', x.name);
  assert.ok(at(t, 0, '0').includes(x.name)); assert.equal(t.G().players['0'].bits, bits - 2);
});

// ---------- cards that work with Premium ----------
test('38+ Husbands: may flip a face-up Premium Content card on this platform face-down again', () => {
  const t = M(); t.bits('0', 30); const c = down(t, '0', 'Gamer Gene'); t.play('0', 'Permission to Swear', 0); t.pick('0', 'Gamer Gene'); assert.equal(find(t, c).faceDown, false);
  t.play('0', '38+ Husbands', 0); t.pick('0', 'Gamer Gene'); assert.equal(find(t, c).faceDown, true);
});
test('Parasocial Sunday: +3 ⭐ this round whenever you flip a Premium card', () => {
  const t = M(); const ps = t.put('0', 1, 'Parasocial Sunday'); const c = down(t, '0', 'Bepis Tower'); const before = t.stars('0', 1, find(t, ps));
  flip(t, '0', c); assert.equal(t.stars('0', 1, find(t, ps)), before + 3);
});
test('Love the Nub: +3 ⭐ while you have a face-up Premium card on this platform', () => {
  const t = M(); const nub = t.put('0', 0, 'Love the Nub'); const base = t.stars('0', 0, nub); const c = down(t, '0', 'Bepis Tower');
  assert.equal(t.stars('0', 0, find(t, nub)), base, 'face-down does not count'); flip(t, '0', c); assert.equal(t.stars('0', 0, find(t, nub)), base + 3);
});
test('Mandatory Ball Crushing: when you flip a card here, exhaust it to delete an opposing Content card', () => {
  const t = M(); const mbc = t.put('0', 0, 'Mandatory Ball Crushing'); const foe = t.put('1', 0, cheap(1)); const c = down(t, '0', 'Bepis Tower');
  flip(t, '0', c); t.pick('0', 'yes'); assert.equal(find(t, mbc).exhausted, true); t.pick('0', foe.name); assert.ok(!at(t, 0, '1').includes(foe.name));
});
test('Community Art: at the start of a clash here, gain 1 💎 if you have a face-up Premium card on this platform', () => {
  const t = M(); t.put('0', 0, 'Community Art'); const c = down(t, '0', 'Bepis Tower'); flip(t, '0', c); t.as('0', 'dbgPhase', 'clashOrder');
  const bits = t.G().players['0'].bits; t.as(t.G().firstPlayer, 'chooseClashOrder', 'LEFT_TO_RIGHT'); assert.equal(t.G().players['0'].bits, bits + 1);
});
test('Friendship Tax: Activate to gain a 🌠 on your Persona\'s platform if you have a face-up Premium card here', () => {
  const t = M(); const ft = t.put('0', 0, 'Friendship Tax'); const c = down(t, '0', 'Bepis Tower'); assert.equal(t.G().platforms[0].pop['0'], 0);
  flip(t, '0', c); t.turn('0'); t.as('0', 'activateCard', ft.id); assert.equal(t.G().platforms[0].pop['0'], 1);
});
test('Tax Evasion: gain 3 💎 only if you have a face-up Premium card', () => {
  const t = M(); t.bits('0', 30); const c = down(t, '0', 'Bepis Tower'); let bits = t.G().players['0'].bits; t.play('0', 'Tax Evasion', 0);
  assert.equal(t.G().players['0'].bits, bits - CARDS.find((x) => x.name === 'Tax Evasion').cost, 'no face-up Premium: no bits');
  flip(t, '0', c); const u = t.G().players['0'].bits; t.play('0', 'Tax Evasion', 0); assert.equal(t.G().players['0'].bits, u - CARDS.find((x) => x.name === 'Tax Evasion').cost + 3);
});
test("It Should've Been Me!: exhaust an opposing Content card or Persona; later changes cannot move it", () => {
  const t = M(); t.bits('0', 30); t.bits('1', 30); const big = t.put('1', 0, 'NPC Carry'); t.play('0', "It Should've Been Me!", 0);
  assert.ok(t.ch().options.some((o) => o.kind === 'persona')); t.pick('0', 'NPC Carry');
  assert.equal(t.stars('1', 0, find(t, big)), 0);
  t.clash(); t.bits('1', 30); t.play('1', 'Take a Shot', 0); t.pick('1', 'NPC Carry'); assert.equal(t.stars('1', 0, find(t, big)), 0, 'cannot change until the next round');
  const u = M(); u.bits('0', 30); const before = sideInf(u.G(), 0, '1'); u.play('0', "It Should've Been Me!", 0); u.pick('0', u.ch().options.find((o) => o.kind === 'persona').key);
  assert.ok(before > 0); assert.equal(sideInf(u.G(), 0, '1'), 0);
});
test('Take a Shot: +6 ⭐, and draw 1 more if the card is a face-up Premium card', () => {
  const t = M(); const c = down(t, '0', 'Bepis Tower'); flip(t, '0', c); t.clash(); t.bits('0', 30);
  const hand = t.G().players['0'].hand.length; t.play('0', 'Take a Shot', 0); t.pick('0', 'Bepis Tower'); assert.equal(t.G().players['0'].hand.length, hand + 1 - 1 + 1);
});
test('Find the Bepis: search your deck for a Premium card and play it face-down for free', () => {
  const t = M(); t.bits('0', 30); t.as('0', 'testDeck', '0', [cheap(1), 'Wisdom of the Day', 'Hype']);
  t.play('0', 'Find the Bepis', 0); assert.deepEqual(t.ch().options.map((o) => o.name), ['Wisdom of the Day']); const bits = t.G().players['0'].bits;
  t.pick('0', 'Wisdom of the Day'); const placed = t.G().platforms[0].cards['0'].find((c) => c.name === 'Wisdom of the Day');
  assert.equal(placed.faceDown, true); assert.equal(t.G().players['0'].bits, bits); assert.equal(t.G().players['0'].deck.length, 2);
});
test('Powered by Bepis: may flip a face-down Premium card; Persona +4 for each face-up Premium card', () => {
  const t = M(); const a = down(t, '0', 'Gamer Gene'), b = down(t, '0', 'Bepis Tower'); const before = sideInf(t.G(), 0, '0');
  t.play('0', 'Powered by Bepis', 0); t.pick('0', 'Gamer Gene'); assert.equal(find(t, a).faceDown, false); assert.equal(find(t, b).faceDown, true);
  assert.equal(sideInf(t.G(), 0, '0') - before, 4 + (a.inf - 3));
});
test('Permission to Swear: flip one of your face-down Premium cards without its condition', () => {
  const t = M({ at0: 0, at1: 2 }); const c = down(t, '0', 'Bepis Tower'); assert.equal(flippable(t, '0', c), false);
  t.play('0', 'Permission to Swear', 0); t.pick('0', 'Bepis Tower'); assert.equal(find(t, c).faceDown, false);
});
test('Hydraulic Press: needs a face-up Premium card to delete; then gain 2 💎', () => {
  const t = M(); t.bits('0', 30); const h = t.give('0', 'Hydraulic Press'); t.turn('0'); t.as('0', 'playCard', h.id, 0);
  assert.ok(t.G().players['0'].hand.some((x) => x.id === h.id), 'not playable without one');
  const c = down(t, '0', 'Bepis Tower'); flip(t, '0', c); t.turn('0'); const bits = t.G().players['0'].bits; t.as('0', 'playCard', h.id, 0);
  t.pick('0', 'Bepis Tower'); assert.ok(!at(t, 0, '0').includes('Bepis Tower')); assert.equal(t.G().players['0'].bits, bits - CARDS.find((x) => x.name === 'Hydraulic Press').cost + 2);
});

// ---------- Exhaust ----------
test('Exhaust lasts until the next round starts', () => {
  const t = M(); t.bits('0', 30); const big = t.put('1', 0, 'NPC Carry'); t.play('0', "It Should've Been Me!", 0); t.pick('0', 'NPC Carry');
  assert.equal(find(t, big).exhausted, true); t.clash(); t.passBoth(); t.passBoth(); t.passBoth();
  assert.equal(t.ctx().phase, 'clashResults'); t.as('0', 'ackClash'); t.as('1', 'ackClash');
  assert.ok(!find(t, big)?.exhausted, 'a new round: no longer exhausted');
});

finish();
