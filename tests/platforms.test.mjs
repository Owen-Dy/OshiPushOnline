// Headless tests for the 17 Platform rules. Run: node tests/platforms.test.mjs
import assert from 'assert';
import { CARDS } from '../cards.js';
import { validateDeck, platformFits, randomDeck } from '../deckRules.js';
import { sideInf } from '../game.js';
import { mk, test, finish, persona } from './harness.mjs';

const plat = (t, idx, name) => t.as('0', 'testPlatform', idx, name);
const win = (t) => { t.clash(); t.passBoth(); }; // player 0 has the only Content on platform 0, so wins the clash there
const withWin = (platName) => { const t = mk(); plat(t, 0, platName); t.put('0', 0, 'Charity Event'); t.as('0', 'dbgClearHand', '0'); return t; };
const bitsAfterWin = (platName) => { const t = withWin(platName); t.bits('0', 0); win(t); return t.G().players['0'].bits; };
const baseline = bitsAfterWin('Click Clock'); // no rules text: only Pippa's own 💎 reward

// ===================== Clash Rewards (the player who wins the clash gets them) =====================
test('SwiftChat: draw 1', () => { const t = withWin('SwiftChat'); const h = t.G().players['0'].hand.length; win(t); assert.equal(t.G().players['0'].hand.length, h + 1); });
test('Yappers: gain 1 💎', () => assert.equal(bitsAfterWin('Yappers'), baseline + 1));
test('only the clash WINNER gets the platform reward', () => {
  const t = mk(); plat(t, 0, 'Yappers'); t.put('1', 0, 'Marshmallows'); t.bits('1', 0); t.bits('0', 0); win(t);
  assert.equal(t.G().platforms[0].pop['1'], 1, 'player 1 won'); assert.equal(t.G().players['1'].bits, baseline + 1, 'winner: Yappers 💎 (plus Pippa\'s own)'); assert.equal(t.G().players['0'].bits, 0, 'loser gets nothing');
});
test('Sudden Clips: return a Content card from your Trash', () => {
  const t = withWin('Sudden Clips'); t.as('0', 'testTrash', '0', 'Rage Game'); t.as('0', 'dbgClearHand', '0'); win(t); t.pick('0', 'Rage Game');
  assert.deepEqual(t.names(t.G().players['0'].hand), ['Rage Game']);
});
test('Chirpper: play a 🟡1 Content card to ANOTHER platform for free', () => {
  const t = withWin('Chirpper'); t.give('0', 'Anniversary Celebration'); t.give('0', 'Rage Game'); t.bits('0', 0); win(t);
  assert.deepEqual(t.ch().options.map((o) => o.name), ['Anniversary Celebration'], 'only 🟡1 or less');
  t.pick('0', 'Anniversary Celebration'); assert.deepEqual(t.ch().options.map((o) => o.key).sort(), ['1', '2'], 'not this platform');
  t.pick('0', '2'); assert.equal(t.G().platforms[2].cards['0'][0].name, 'Anniversary Celebration'); assert.equal(t.G().players['0'].bits, baseline, 'free');
});
test('Sketch Book: move your Content from this platform to another', () => {
  const t = withWin('Sketch Book'); win(t); t.pick('0', 'Charity Event'); t.pick('0', '1');
  assert.equal(t.G().platforms[1].cards['0'][0].name, 'Charity Event'); assert.equal(t.G().platforms[0].cards['0'].length, 0);
});
test('Convulsive Movement: move your 🌠 here from another platform (optional)', () => {
  const t = withWin('Convulsive Movement'); t.as('0', 'dbgSetPop', 1, '0', 1); win(t); t.pick('0', '1');
  assert.equal(t.G().platforms[1].pop['0'], 0); assert.equal(t.G().platforms[0].pop['0'], 2);
  const t2 = withWin('Convulsive Movement'); t2.as('0', 'dbgSetPop', 1, '0', 1); win(t2); t2.skip('0'); assert.equal(t2.G().platforms[1].pop['0'], 1, 'declined');
});
test('Bobby Bobby: copies the Clash Reward of another platform', () => {
  const t = withWin('Bobby Bobby'); plat(t, 1, 'Yappers'); t.bits('0', 0); win(t); assert.equal(t.G().choices.length, 0, 'one choice only: copied automatically');
  assert.equal(t.G().players['0'].bits, baseline + 1);
  const t2 = withWin('Bobby Bobby'); plat(t2, 1, 'Yappers'); plat(t2, 2, 'SwiftChat'); const h = t2.G().players['0'].hand.length; win(t2); t2.pick('0', '2');
  assert.equal(t2.G().players['0'].hand.length, h + 1, 'chose SwiftChat');
  const t3 = withWin('Bobby Bobby'); plat(t3, 1, 'Click Clock'); t3.bits('0', 0); win(t3); assert.equal(t3.G().players['0'].bits, baseline, 'nothing to copy');
});
test('Historical Lion: may delete a Content card with 🟡2 or less in play', () => {
  const t = withWin('Historical Lion'); t.put('1', 2, 'Charity Event'); t.put('1', 2, 'Rage Game'); win(t);
  assert.ok(t.ch().options.length >= 1 && t.ch().options.every((o) => o.cost <= 2), 'only 🟡2 or less'); t.pick('0', t.ch().options.find((o) => o.owner === '1').key);
  assert.deepEqual(t.names(t.G().players['1'].trash), ['Charity Event']);
  const t2 = withWin('Historical Lion'); t2.put('1', 2, 'Charity Event'); win(t2); t2.skip('0'); assert.equal(t2.G().platforms[2].cards['1'].length, 1, 'declined');
});
test('Soul Exciting!: play a 🟡2 or less Content card on this platform for free', () => {
  const t = withWin('Soul Exciting!'); t.give('0', 'Anniversary Celebration'); t.give('0', 'Rage Game'); t.bits('0', 0); win(t);
  assert.deepEqual(t.ch().options.map((o) => o.name), ['Anniversary Celebration']); t.pick('0', 'Anniversary Celebration');
  assert.equal(t.G().platforms[0].cards['0'].length, 2); assert.equal(t.G().players['0'].bits, baseline);
});

// ===================== passive rules =====================
test("Pippa's Quarters: Persona +5 ⭐ here while you have Content on every platform", () => {
  const t = mk(); plat(t, 0, "Pippa's Quarters"); const side = () => sideInf(t.G(), 0, '0');
  const a = side(); t.put('0', 0, 'Charity Event'); const b = side(); t.put('0', 1, 'Charity Event'); const c1 = side(); t.put('0', 2, 'Charity Event'); const c = side();
  assert.equal(b - a, 4, 'Content only'); assert.equal(c1 - b, 0, 'Content on another platform is not on this one'); assert.equal(c - c1, 5, '+5 once every platform has your Content');
  const t2 = mk(); plat(t2, 0, 'Click Clock'); t2.put('0', 0, 'Charity Event'); t2.put('0', 1, 'Charity Event'); t2.put('0', 2, 'Charity Event'); assert.equal(sideInf(t2.G(), 0, '0') - c, -5 + 0, 'the +5 really comes from the platform');
});
test("Michiru's Cabin: Content with 🟡5+ can't be played here", () => {
  const t = mk(); plat(t, 0, "Michiru's Cabin"); t.bits('0', 20); t.play('0', 'Cover Song'); assert.equal(t.G().platforms[0].cards['0'].length, 0);
  t.play('0', 'Rage Game'); assert.equal(t.G().platforms[0].cards['0'].length, 1, 'cost 4 is fine');
});
test("Lia's Network: Content costs 1 less here", () => {
  const t = mk(); plat(t, 0, "Lia's Network"); t.bits('0', 10); t.play('0', 'Rage Game'); assert.equal(t.G().players['0'].bits, 10 - 3);
  const t2 = mk(); plat(t2, 0, 'Click Clock'); t2.bits('0', 10); t2.play('0', 'Rage Game'); assert.equal(t2.G().players['0'].bits, 10 - 4);
});

// ===================== triggers =====================
test("Nasa's Dream: may pay 2 💎 to draw 1 when you play Content here", () => {
  const t = mk(); plat(t, 0, "Nasa's Dream"); t.bits('0', 10); const h = t.G().players['0'].hand.length; t.play('0', 'Charity Event');
  assert.equal(t.ch().options[0].name, 'Pay 2 💎 to draw 1 card'); t.pick('0', 'yes');
  assert.equal(t.G().players['0'].bits, 10 - 2 - 2); assert.equal(t.G().players['0'].hand.length, h + 1 - 1 + 1 - 0, 'played 1, drew 1 (given card counted)');
  const t2 = mk(); plat(t2, 0, "Nasa's Dream"); t2.bits('0', 10); t2.play('0', 'Charity Event'); t2.skip('0'); assert.equal(t2.G().players['0'].bits, 8, 'declined');
  const t3 = mk(); plat(t3, 0, "Nasa's Dream"); t3.bits('0', 3); t3.play('0', 'Charity Event'); assert.equal(t3.G().choices.length, 0, 'cannot afford 2 more');
});
test("Iori's Den: first Action you play while clashing here gains 1 💎 (once per round)", () => {
  const t = mk(); plat(t, 0, "Iori's Den"); t.clash(); t.bits('0', 20); t.play('0', 'Instant Replay', 0); const b = t.G().players['0'].bits;
  const t0 = mk(); t0.clash(); t0.bits('0', 20); t0.play('0', 'Instant Replay', 0); assert.equal(b - t0.G().players['0'].bits, 1, 'first Action: +1 💎 more than a plain platform');
  const b1 = t.G().players['0'].bits; t.play('0', 'Instant Replay', 0); const t00 = t0.G().players['0'].bits; t0.play('0', 'Instant Replay', 0);
  assert.equal(t.G().players['0'].bits - b1, t0.G().players['0'].bits - t00, 'second Action: no bonus');
});
test("Uruka's Lounge: playing Content deletes your OTHER Content here", () => {
  const t = mk(); plat(t, 0, "Uruka's Lounge"); t.put('0', 0, 'Marshmallows'); t.put('0', 1, 'Charity Event'); t.put('1', 0, 'Rage Game'); t.bits('0', 10); t.play('0', 'Charity Event');
  assert.deepEqual(t.names(t.G().platforms[0].cards['0']), ['Charity Event']); assert.equal(t.G().platforms[1].cards['0'].length, 1, 'other platforms untouched'); assert.equal(t.G().platforms[0].cards['1'].length, 1, "opponent's stays");
  assert.deepEqual(t.names(t.G().players['0'].trash), ['Marshmallows']);
});
test("Tenma's Basement: draw 1 when your Persona MOVES here", () => {
  const t = mk({ at0: 1 }); plat(t, 0, "Tenma's Basement"); const c = t.give('0', 'Spooky Town'); const h = t.G().players['0'].hand.length; t.clash(); t.turn('0'); t.as('0', 'discardAbility', c.id);
  assert.equal(t.G().personaLocations['0'], 0); assert.equal(t.G().players['0'].hand.length, h - 1 + 1, 'discarded 1, drew 1');
});
test('Phase Warehouse: Persona +1 ⭐ per piece of merch (declared once per round) when you play an Action here', () => {
  const t = mk(); plat(t, 0, 'Phase Warehouse'); t.clash(); t.bits('0', 20); const b = t.G().platforms[0].pmods['0']; t.play('0', 'Instant Replay', 0);
  assert.equal(t.ch().options.length, 11); t.pick('0', '3'); const afterFirst = t.G().platforms[0].pmods['0'];
  const t0 = mk(); t0.clash(); t0.bits('0', 20); t0.play('0', 'Instant Replay', 0);
  assert.equal(afterFirst - t0.G().platforms[0].pmods['0'], 3, '+3 from 3 pieces of merch');
  t.play('0', 'Instant Replay', 0); assert.equal(t.G().choices.length, 0, 'not asked again this round'); t0.play('0', 'Instant Replay', 0);
  assert.equal(t.G().platforms[0].pmods['0'] - t0.G().platforms[0].pmods['0'], 6, '+3 again');
});

// ===================== deck-only rules & capture =====================
test('"Deck only" platforms fit only their own deck (Phase Warehouse: Phase Connect)', () => {
  const P = (n) => CARDS.find((c) => c.type === 'Persona' && c.name === n), C = (n) => CARDS.find((c) => c.name === n && c.type === 'Platform');
  const rules = { "Pippa's Quarters": 'Pipkin Pippa', "Nasa's Dream": 'Utatane Nasa', "Iori's Den": 'Hakushika Iori', "Michiru's Cabin": 'Shisui Michiru', "Uruka's Lounge": 'Fujikura Uruka', "Lia's Network": 'Rinkou Ashelia', "Tenma's Basement": 'Tenma Maemi' };
  for (const [pl, owner] of Object.entries(rules)) for (const p of CARDS.filter((c) => c.type === 'Persona')) assert.equal(platformFits(C(pl), p), p.name === owner, `${pl} with ${p.name}`);
  assert.equal(platformFits(C('Phase Warehouse'), P('Shisui Michiru')), true); assert.equal(platformFits(C('Yappers'), P('Shisui Michiru')), true);
  const byId = new Map(CARDS.map((c) => [c.id, c]));
  const deck = randomDeck(CARDS, (a) => a, P('Utatane Nasa').id); deck.platforms[0] = C("Pippa's Quarters").id;
  assert.ok(validateDeck(deck, byId).some((e) => /another deck/.test(e)), 'validateDeck rejects it');
  for (let i = 0; i < 200; i++) { const d = randomDeck(CARDS, (a) => [...a].sort(() => Math.random() - 0.5)); assert.deepEqual(validateDeck(d, byId), []); }
});
test('a platform that replaces a captured one brings its rules with it', () => {
  const t = mk(); plat(t, 0, 'Yappers'); t.put('0', 0, 'Charity Event'); t.as('0', 'dbgSetPop', 0, '0', 8); win(t);
  const g = t.G(), now = g.platforms[0]; assert.deepEqual(now.pop, { 0: 0, 1: 0 }, 'captured: popularity reset'); assert.equal(g.clashLog.at(-1).captured, true);
  const data = CARDS.find((c) => c.id === now.card.id); assert.deepEqual(now.card.effects, data.effects || [], `${now.card.name} has its own rules`);
});

finish();
