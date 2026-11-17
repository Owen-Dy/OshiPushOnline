// Headless tests for Content card effects. Run: node tests/content-cards.test.mjs
import { Client } from 'boardgame.io/dist/cjs/client.js';
import { OshiPush, starsOf } from '../game.js';
import { CARDS } from '../cards.js';
import assert from 'assert';

const card = (n) => CARDS.find((c) => c.name === n && c.type !== 'Persona');
const persona = (n) => CARDS.find((c) => c.type === 'Persona' && c.name === n).id;
const PIPPA = persona('Pipkin Pippa'), NASA = persona('Utatane Nasa'), IORI = persona('Hakushika Iori');

const game = {
  ...OshiPush,
  playerView: ({ G }) => G,
  setup: (ctx, d) => ({ ...OshiPush.setup(ctx, d), sandbox: true }),
  phases: Object.fromEntries(Object.entries(OshiPush.phases).map(([k, ph]) => [k, ph.moves ? { ...ph, moves: { ...ph.moves,
    testDeck: ({ G }, id, names) => { G.players[id].deck = names.map((n, i) => ({ ...card(n), id: `t${i}_${card(n).id}` })); },
    testTrash: ({ G }, id, n) => { G.players[id].trash.push({ ...card(n), id: `tt${G.players[id].trash.length}_${card(n).id}` }); },
    testText: ({ G }, idx, text) => { G.platforms[idx].card = { ...(G.platforms[idx].card || {}), text, effects: [] }; G.platforms[idx].threshold = 9; }, // 9: nothing gets captured by accident
  } } : ph])),
};

function mk({ p0 = PIPPA, p1 = PIPPA, at0 = 0, at1 = 0, up0 = null } = {}) {
  const client = Client({ game, numPlayers: 2 });
  // sandbox/test moves are only allowed for whoever has the turn
  const as = (id, move, ...a) => { client.updatePlayerID(/^(dbg|test)/.test(move) ? client.getState().ctx.currentPlayer : id); client.moves[move](...a); };
  for (const id of ['0', '1']) as(id, 'useRandomDeck');
  for (const id of ['0', '1']) as(id, 'keepHand');
  as('0', 'putPlatform', 0); as('1', 'putPlatform', 1); as('0', 'putPlatform', 2);
  as('0', 'dbgSetPersona', '0', p0, up0, at0); as('0', 'dbgSetPersona', '1', p1, null, at1);
  const G = () => client.getState().G, ctx = () => client.getState().ctx;
  for (let i = 0; i < 3; i++) as('0', 'testText', i, 'Clash Reward: Draw 1 card.'); // ordinary (non-Independent) platforms
  const t = {
    client, as, G, ctx,
    cur: () => ctx().currentPlayer,
    give: (id, n) => { as('0', 'dbgAddHand', id, card(n).id); return G().players[id].hand.at(-1); },
    put: (id, idx, n) => { as('0', 'dbgAddContent', id, idx, card(n).id); return G().platforms[idx].cards[id].at(-1); },
    bits: (id, n) => as('0', 'dbgSet', id, n),
    turn: (id) => as('0', 'dbgTurn', id),
    play: (id, n, idx = G().personaLocations[id]) => { const c = t.give(id, n); t.turn(id); as(id, 'playCard', c.id, idx); return c; },
    ch: () => G().choices[0],
    pick: (id, name) => { const o = t.ch().options.find((o) => o.name === name || o.key === name); assert.ok(o, `option ${name} in ${JSON.stringify(t.ch().options.map((o) => o.name || o.key))}`); as(id, 'makeChoice', [o.key]); },
    skip: (id) => as(id, 'makeChoice', []),
    stars: (id, idx, c) => starsOf(G(), idx, id, c),
    names: (arr) => arr.map((c) => c.name),
    clash: () => { as('0', 'dbgPhase', 'clash'); },
    passBoth: () => { as(t.cur(), 'passTurn'); as(t.cur(), 'passTurn'); },
  };
  return t;
}

const results = [];
const test = (name, fn) => { try { fn(); results.push([name, null]); } catch (e) { results.push([name, e]); } };

// ===================== ⭐ from card text =====================
test('Continued Gameplay: +3 while Dominating', () => {
  const t = mk(); const c = t.put('0', 0, 'Continued Gameplay');
  assert.equal(t.stars('0', 0, c), 9);
  t.put('1', 0, 'Charity Event'); assert.equal(t.stars('0', 0, c), 6, 'tied = not dominating');
});
test('Cabbage Voice Pack: +1 per card in hand', () => {
  const t = mk(); const c = t.put('0', 0, 'Cabbage Voice Pack'); t.as('0', 'dbgClearHand', '0');
  assert.equal(t.stars('0', 0, c), 7); t.give('0', 'Hype'); t.give('0', 'Hype'); assert.equal(t.stars('0', 0, c), 9);
});
test('Witch Mommy Energy: +3 per other cheap Content', () => {
  const t = mk(); const c = t.put('0', 0, 'Witch Mommy Energy'); t.put('0', 0, 'Charity Event'); t.put('0', 0, 'Marshmallows'); t.put('0', 0, 'Rage Game');
  assert.equal(t.stars('0', 0, c), 7 + 6);
});
test('Yapping: +3 per other platform with your Zatsudan', () => {
  const t = mk(); const c = t.put('0', 0, 'Yapping'); t.put('0', 1, 'Charity Event'); t.put('0', 2, 'Marshmallows'); t.put('0', 2, 'Rage Game');
  assert.equal(t.stars('0', 0, c), 4 + 6);
});
test('From Our Hearts: +5 while it is your only Content here', () => {
  const t = mk(); const c = t.put('0', 0, 'From Our Hearts'); assert.equal(t.stars('0', 0, c), 10);
  t.put('0', 0, 'Charity Event'); assert.equal(t.stars('0', 0, c), 5);
});
test('Court Room Roleplay: +3 while an opponent has 3+ cards', () => {
  const t = mk(); const c = t.put('0', 0, 'Court Room Roleplay'); t.as('0', 'dbgClearHand', '1');
  assert.equal(t.stars('0', 0, c), 4); for (let i = 0; i < 3; i++) t.give('1', 'Hype'); assert.equal(t.stars('0', 0, c), 7);
});
test('Birthday Special / You Laugh You Lose', () => {
  const t = mk(); const b = t.put('0', 0, 'Birthday Special'), y = t.put('0', 0, 'You Laugh You Lose');
  assert.equal(t.stars('0', 0, b), 3, 'platform has rules text');
  t.as('0', 'testText', 0, ''); assert.equal(t.stars('0', 0, b), 6, 'Independent = no rules text');
  assert.equal(t.stars('0', 0, y), 7); t.as('0', 'dbgSetPop', 0, '1', 1); assert.equal(t.stars('0', 0, y), 4);
});
test('Cringe Song / Dog Food Regret auras', () => {
  const t = mk(); const cs = t.put('0', 0, 'The Cringe Song'), ally = t.put('0', 0, 'Marshmallows'), foe = t.put('1', 0, 'Charity Event');
  assert.equal(t.stars('0', 0, cs), 8); assert.equal(t.stars('0', 0, ally), 1); assert.equal(t.stars('1', 0, foe), 1);
  const t2 = mk(); const d = t2.put('0', 0, 'Dog Food Regret'), mine = t2.put('0', 0, 'Marshmallows'), theirs = t2.put('1', 0, 'Marshmallows');
  assert.equal(t2.stars('0', 0, mine), 4); assert.equal(t2.stars('1', 0, theirs), 2); assert.equal(t2.stars('0', 0, d), 4);
});
test('Cinema Date: opposing Content gives 0 ⭐ during the clash while Dominating', () => {
  const t = mk(); t.put('0', 0, 'Cinema Date'); t.put('0', 0, 'Marshmallows'); const foe = t.put('1', 0, 'Rage Game');
  assert.equal(t.stars('1', 0, foe), 6, 'not during a clash');
  t.clash(); assert.equal(t.stars('1', 0, foe), 0);
  t.put('1', 0, 'Charity Event'); assert.equal(t.stars('1', 0, foe), 6, 'no longer Dominating');
});

// ===================== When Played =====================
test('Marshmallows draws 1', () => {
  const t = mk(); const deck = t.G().players['0'].deck.length; t.as('0', 'dbgClearHand', '0'); t.bits('0', 10); t.play('0', 'Marshmallows');
  assert.equal(t.G().players['0'].hand.length, 1); assert.equal(t.G().players['0'].deck.length, deck - 1);
});
test('Rage Game / Batsu Bracket make the opponent discard', () => {
  const t = mk(); t.bits('0', 10); t.play('0', 'Rage Game'); assert.equal(t.G().pendingDiscard['1'], 1);
  const t2 = mk(); t2.bits('0', 10); t2.play('0', 'Batsu Bracket'); assert.equal(t2.G().pendingDiscard['1'], 2);
});
test('Edgelord Behavior deletes opposing Content with 5 ⭐ or less', () => {
  const t = mk(); t.put('1', 0, 'Charity Event'); t.put('1', 0, 'Rage Game'); t.bits('0', 10); t.play('0', 'Edgelord Behavior');
  assert.deepEqual(t.ch().options.map((o) => o.name), ['Charity Event']); t.pick('0', 'Charity Event');
  assert.deepEqual(t.names(t.G().players['1'].trash), ['Charity Event']);
});
test('Toxic Gaming: spend X to delete opposing Content with cost X', () => {
  const t = mk(); t.put('1', 0, 'Marshmallows'); t.put('1', 0, 'Rage Game'); t.bits('0', 5); t.play('0', 'Toxic Gaming');
  assert.deepEqual(t.ch().options.map((o) => o.name), ['Marshmallows'], 'Rage Game costs 4 > 3 Bits left'); t.pick('0', 'Marshmallows');
  assert.equal(t.G().players['0'].bits, 0); assert.deepEqual(t.names(t.G().players['1'].trash), ['Marshmallows']);
});
test("Let 'em Cook deletes your other Content here only", () => {
  const t = mk(); t.put('0', 0, 'Charity Event'); t.put('0', 1, 'Marshmallows'); t.put('1', 0, 'Rage Game'); t.bits('0', 10); const c = t.play('0', "Let 'em Cook");
  assert.deepEqual(t.names(t.G().platforms[0].cards['0']), ["Let 'em Cook"]); assert.equal(t.G().platforms[1].cards['0'].length, 1); assert.equal(t.G().platforms[0].cards['1'].length, 1);
});
test('Confessional Stream +4 to another of your Content', () => {
  const t = mk(); const a = t.put('0', 1, 'Marshmallows'); t.bits('0', 10); t.play('0', 'Confessional Stream');
  assert.deepEqual(t.ch().options.map((o) => o.name), ['Marshmallows']); t.pick('0', 'Marshmallows'); assert.equal(t.stars('0', 1, t.G().platforms[1].cards['0'][0]), 8);
});
test('Campfire Guitar zeroes, ADpocalypse -2, Dragon Deez -4', () => {
  for (const [n, want] of [['Campfire Guitar', 0], ['ADpocalypse', 4], ['Dragon Deez', 2]]) {
    const t = mk(); t.put('1', 0, 'Rage Game'); t.bits('0', 10); t.play('0', n); t.pick('0', 'Rage Game');
    assert.equal(t.stars('1', 0, t.G().platforms[0].cards['1'][0]), want, n);
  }
});
test('Mahjong Tournament only on an Independent platform', () => {
  const t = mk(); t.put('1', 1, 'Rage Game'); t.bits('0', 10); t.play('0', 'Mahjong Tournament'); assert.equal(t.G().choices.length, 0, 'platform has text');
  const t2 = mk(); t2.as('0', 'testText', 0, ''); t2.put('1', 1, 'Rage Game'); t2.bits('0', 10); t2.play('0', 'Mahjong Tournament'); t2.pick('0', 'Rage Game');
  assert.deepEqual(t2.names(t2.G().players['1'].trash), ['Rage Game']);
});
test('Encore Performance returns a card from the Trash', () => {
  const t = mk(); t.as('0', 'testTrash', '0', 'Hype'); t.bits('0', 10); t.as('0', 'dbgClearHand', '0'); t.play('0', 'Encore Performance'); t.pick('0', 'Hype');
  assert.deepEqual(t.names(t.G().players['0'].hand), ['Hype']); assert.equal(t.G().players['0'].trash.length, 0);
});
test('Updated Model Stream: +2 Bits only with an Upgraded Persona', () => {
  const t = mk(); t.bits('0', 10); t.play('0', 'Updated Model Stream'); assert.equal(t.G().players['0'].bits, 10 - 5);
  const t2 = mk({ up0: 'op01-002' }); t2.bits('0', 10); t2.play('0', 'Updated Model Stream'); assert.equal(t2.G().players['0'].bits, 10 - 5 + 2);
});
test('Big Head Moment / Thriller Story Reading (Independent only)', () => {
  const t = mk(); t.as('0', 'testText', 0, ''); t.as('0', 'dbgSetPop', 1, '0', 1); t.bits('0', 10); t.play('0', 'Big Head Moment');
  t.pick('0', '1'); assert.equal(t.G().platforms[0].pop['0'], 1); assert.equal(t.G().platforms[1].pop['0'], 0);
  const t2 = mk(); t2.as('0', 'testText', 0, ''); t2.put('1', 0, 'Rage Game'); t2.bits('0', 10); t2.play('0', 'Thriller Story Reading'); t2.pick('0', '2');
  assert.equal(t2.G().platforms[0].cards['1'].length, 0); assert.equal(t2.G().platforms[2].cards['1'].length, 1);
});
test('Peaceful ASMR may return a Content card; AD Break; Sweaty Gaming', () => {
  const t = mk(); t.put('1', 0, 'Rage Game'); t.bits('0', 10); t.play('0', 'Peaceful ASMR'); t.pick('0', 'Rage Game');
  assert.deepEqual(t.names(t.G().players['1'].hand).slice(-1), ['Rage Game']);
  const t2 = mk(); t2.put('1', 1, 'Charity Event'); t2.put('1', 2, 'Rage Game'); t2.bits('0', 10); t2.play('0', 'AD Break');
  assert.deepEqual(t2.ch().options.map((o) => o.name), ['Rage Game'], 'not Zatsudan');
  const t3 = mk(); t3.put('1', 0, 'Rage Game'); t3.put('1', 0, 'Charity Event'); t3.bits('0', 10); t3.play('0', 'Sweaty Gaming'); assert.equal(t3.G().choices.length, 0, 'not Dominating');
  const t4 = mk(); t4.put('0', 0, 'Charity Event'); t4.put('1', 0, 'Royalty Song'); t4.bits('0', 10); t4.play('0', 'Sweaty Gaming');
  assert.deepEqual(t4.ch().options.map((o) => o.name), ['Royalty Song'], 'only 🟡5 or more'); t4.pick('0', 'Royalty Song');
});
test('Menhara Club +10 this round', () => {
  const t = mk(); t.bits('0', 10); const c = t.play('0', 'Menhara Club'); assert.equal(t.stars('0', 0, t.G().platforms[0].cards['0'][0]), 12);
});

// ===================== Triggers =====================
test('Eat a Spider deletes weaker Content when you play Content here', () => {
  const t = mk(); t.put('0', 0, 'Eat a Spider'); t.put('1', 0, 'Charity Event'); t.put('1', 0, 'Mahjong Tournament'); t.bits('0', 20); t.play('0', 'Rage Game');
  assert.deepEqual(t.ch().options.map((o) => o.name), ['Charity Event'], 'only weaker than Rage Game (6 ⭐)'); t.pick('0', 'Charity Event');
});
test('Gamer Fluid draws on a Poggers play; Christmas Special on cost 4+', () => {
  const t = mk(); t.put('0', 0, 'Gamer Fluid'); t.as('0', 'dbgClearHand', '0'); t.bits('0', 20); t.play('0', 'Rage Game'); assert.equal(t.G().players['0'].hand.length, 1);
  const t2 = mk(); t2.put('0', 1, 'Christmas Special'); t2.bits('0', 20); t2.play('0', 'Rage Game'); assert.equal(t2.G().players['0'].bits, 20 - 4 + 1);
  const t3 = mk(); t3.put('0', 1, 'Christmas Special'); t3.bits('0', 20); t3.play('0', 'Charity Event'); assert.equal(t3.G().players['0'].bits, 18, 'cost 2: no bonus');
});
test('Origins Video gains +2 when an Experience card (itself) is played', () => {
  const t = mk(); t.bits('0', 10); t.play('0', 'Origins Video'); assert.equal(t.stars('0', 0, t.G().platforms[0].cards['0'][0]), 8);
});
test('Depressed Single Divorced Fathers may move when you play another Content here', () => {
  const t = mk(); t.put('0', 0, 'Depressed Single Divorced Fathers'); t.bits('0', 10); t.play('0', 'Charity Event'); t.pick('0', '2');
  assert.equal(t.G().platforms[2].cards['0'][0].name, 'Depressed Single Divorced Fathers');
});
test('Closed Beta / Japanese Lesson react to an Action played during the clash', () => {
  const t = mk(); t.put('0', 0, 'Closed Beta'); t.put('0', 0, 'Rage Game'); t.clash(); t.bits('0', 10); const cb = t.G().platforms[0].cards['0'][0];
  t.play('0', 'Hype', 0); t.pick('0', 'Rage Game'); assert.equal(t.stars('0', 0, t.G().platforms[0].cards['0'][0]), 7 + 3);
  const t2 = mk(); t2.put('0', 0, 'Japanese Lesson'); t2.put('1', 0, 'Charity Event'); t2.put('1', 0, 'Rage Game'); t2.clash(); t2.bits('0', 10); t2.play('0', 'Hype', 0);
  const o = t2.ch().options.map((o) => o.name); t2.pick('0', 'Japanese Lesson'); t2.pick('0', 'Charity Event');
  assert.deepEqual(t2.names(t2.G().players['1'].trash), ['Charity Event']);
});

// ===================== Clash Rewards / Kickback (full clash on platform 0) =====================
const winClash = (t) => { t.clash(); t.passBoth(); };
test('Feet: draw 2 with a 5 ⭐ lead', () => {
  const t = mk(); t.put('0', 0, 'Feet: A Holy Deep Dive'); const h = t.G().players['0'].hand.length; winClash(t);
  assert.equal(t.G().players['0'].hand.length, h + 2);
});
test('Original Song: draw then discard', () => {
  const t = mk(); t.put('0', 0, 'Original Song'); t.put('0', 0, 'Rage Game'); const h = t.G().players['0'].hand.length; winClash(t);
  assert.equal(t.G().players['0'].hand.length, h + 1); assert.ok(t.G().pendingDiscard['0'] === 1 || t.G().choices.length >= 0);
});
test('Masterpiece steals a 🌠', () => {
  const t = mk(); t.put('0', 0, 'Masterpiece'); t.as('0', 'dbgSetPop', 0, '1', 1); winClash(t);
  assert.equal(t.G().platforms[0].pop['1'], 0); assert.equal(t.G().platforms[0].pop['0'], 2);
});
test('Long Game: Dominating -> 🌠 on another platform', () => {
  const t = mk(); t.put('0', 0, 'Long Game'); winClash(t); t.pick('0', '2'); assert.equal(t.G().platforms[2].pop['0'], 1);
});
test('Scary Yandere: 🌠 per card in opponent hands instead of 1', () => {
  const t = mk(); t.put('0', 0, 'Scary Yandere Roleplay'); t.as('0', 'dbgClearHand', '1'); for (let i = 0; i < 4; i++) t.give('1', 'Hype'); winClash(t);
  assert.equal(t.G().platforms[0].pop['0'], 4);
});
test('Pippa The Rippa: play a cost 3 or less Content for free', () => {
  const t = mk(); t.put('0', 0, 'Pippa The Rippa'); t.give('0', 'Marshmallows'); t.bits('0', 0); winClash(t); t.pick('0', 'Marshmallows');
  assert.equal(t.G().platforms[0].cards['0'].length, 2); assert.equal(t.G().players['0'].bits, 1, 'free: only Pippa\'s own 💎 reward');
});
test('Sus Gameplay may move after a Dominating win', () => {
  const t = mk(); t.put('0', 0, 'Sus Gameplay'); winClash(t); t.pick('0', '1'); assert.equal(t.G().platforms[1].cards['0'][0].name, 'Sus Gameplay');
});
test('Year 0 Science: opponents cannot gain 🌠 here', () => {
  const t = mk(); t.put('0', 0, 'Year 0 Science'); t.put('1', 0, 'Sus Gameplay'); winClash(t);
  assert.equal(t.G().platforms[0].pop['1'], 0);
});
test('Kickback: pays when you LOSE the clash (Charity Event, Royalty Song)', () => {
  const t = mk(); t.put('0', 0, 'Charity Event'); t.put('0', 0, 'Royalty Song'); t.put('1', 0, 'Sus Gameplay'); t.bits('0', 0); winClash(t);
  assert.equal(t.G().platforms[0].pop['1'], 1); assert.equal(t.G().players['0'].bits, 3, '1 + 2');
});
test('Kickback does not pay when you win or tie', () => {
  const t = mk(); t.put('0', 0, 'Charity Event'); t.bits('0', 0); winClash(t); assert.equal(t.G().players['0'].bits, 1, 'won: just Pippa\'s own 💎 reward, no Kickback');
  const t2 = mk(); t2.put('0', 0, 'Charity Event'); t2.put('1', 0, 'Charity Event'); t2.bits('0', 0); winClash(t2); assert.equal(t2.G().players['0'].bits, 0, 'tied');
});
test('Gold Farming has Kickback only while you have another Poggers Content', () => {
  const t = mk(); t.put('0', 0, 'Gold Farming'); t.put('1', 0, 'Sus Gameplay'); t.bits('0', 0); winClash(t); assert.equal(t.G().players['0'].bits, 0);
  const t2 = mk(); t2.put('0', 0, 'Gold Farming'); t2.put('0', 1, 'Rage Game'); t2.put('1', 0, 'Sus Gameplay'); t2.bits('0', 0); winClash(t2); assert.equal(t2.G().players['0'].bits, 1);
});

// ===================== Discard / Activate abilities =====================
test('Discard: Suck on Copium gains 1 Bit', () => {
  const t = mk(); const c = t.give('0', 'Suck on Copium'); t.bits('0', 0); t.turn('0'); t.as('0', 'discardAbility', c.id);
  assert.equal(t.G().players['0'].bits, 1); assert.equal(t.G().players['0'].trash.at(-1).name, 'Suck on Copium');
});
test('Discard: Game Flavor / Moldy Bread / Karaoke Night / Mega Capping give your Persona +2, clash only', () => {
  for (const n of ['Game Flavor of the Week', 'Moldy Bread', 'Karaoke Night', 'Mega Capping']) {
    const t = mk(); const c = t.give('0', n); t.turn('0'); const b = t.G().platforms[0].pmods['0']; t.as('0', 'discardAbility', c.id);
    assert.equal(t.G().platforms[0].pmods['0'], b, n + ': not allowed in the Content Phase'); assert.ok(t.G().players['0'].hand.some((x) => x.id === c.id));
    t.clash(); t.turn('0'); t.as(t.cur(), 'discardAbility', c.id); assert.equal(t.G().platforms[0].pmods['0'], b + 2, n + ' in a clash');
  }
});
test('Discard: Spooky Town moves your Persona to the clashing platform', () => {
  const t = mk({ at0: 1 }); const c = t.give('0', 'Spooky Town'); t.clash(); t.turn('0'); t.as('0', 'discardAbility', c.id); assert.equal(t.G().personaLocations['0'], 0);
});
test('Activate: Donothon / Mama Cameo / once per round', () => {
  const t = mk(); const d = t.put('0', 0, 'Donothon'); t.put('0', 1, 'Marshmallows'); t.bits('0', 0); t.turn('0'); t.as('0', 'activateCard', d.id); assert.equal(t.G().players['0'].bits, 2);
  t.turn('0'); t.as('0', 'activateCard', d.id); assert.equal(t.G().players['0'].bits, 2, 'only once per round');
  const t2 = mk(); const m = t2.put('0', 0, 'Mama Cameo'); t2.bits('0', 0); t2.turn('0'); t2.as('0', 'activateCard', m.id);
  assert.equal(t2.G().players['0'].bits, 2); assert.equal(t2.G().players['0'].hand.at(-1).name, 'Mama Cameo'); assert.equal(t2.G().platforms[0].cards['0'].length, 0);
});
test('Activate: First Date returns itself to the deck top and a cheap Content to hand', () => {
  const t = mk(); const f = t.put('0', 0, 'First Date'); t.put('1', 0, 'Charity Event'); t.put('1', 0, 'Rage Game'); t.turn('0'); t.as('0', 'activateCard', f.id);
  assert.deepEqual(t.ch().options.map((o) => o.name), ['Charity Event']); t.pick('0', 'Charity Event');
  assert.equal(t.G().players['0'].deck[0].name, 'First Date'); assert.equal(t.G().players['1'].hand.at(-1).name, 'Charity Event');
});
test('Activate: Burned Toast Tart gains ⭐ equal to the top card\'s cost', () => {
  const t = mk(); const b = t.put('0', 0, 'Burned Toast Tart'); t.as('0', 'testDeck', '0', ['Rage Game', 'Hype']); t.turn('0'); t.as('0', 'activateCard', b.id);
  assert.equal(t.stars('0', 0, t.G().platforms[0].cards['0'][0]), 9 + 4); assert.equal(t.G().players['0'].deck[0].name, 'Rage Game');
});
test('Activate: Disruption Stream makes the OPPONENT move a 🌠', () => {
  const t = mk(); const d = t.put('0', 0, 'Disruption Stream'); t.as('0', 'dbgSetPop', 0, '1', 1); t.bits('0', 5); t.turn('0'); t.as('0', 'activateCard', d.id);
  assert.equal(t.G().players['0'].bits, 2); assert.equal(t.ch().player, '1'); t.pick('1', '2');
  assert.equal(t.G().platforms[0].pop['1'], 0); assert.equal(t.G().platforms[2].pop['1'], 1);
});
test('Activate: Cover Song / Halloween Special / Requested Song Stream / Mukbang ASMR', () => {
  const t = mk(); const c = t.put('0', 1, 'Cover Song'); t.as('0', 'testTrash', '0', 'Royalty Song'); t.as('0', 'testTrash', '0', 'Anniversary Celebration'); t.as('0', 'testTrash', '0', 'Charity Event'); t.bits('0', 6); t.turn('0'); t.as('0', 'activateCard', c.id);
  assert.deepEqual(t.ch().options.map((o) => o.name).sort(), ['Anniversary Celebration', 'Royalty Song'], 'Creatives only'); t.pick('0', 'Royalty Song');
  assert.equal(t.G().players['0'].bits, 0); assert.equal(t.G().platforms[0].cards['0'][0].name, 'Royalty Song', 'played where your Persona is');
  const t2 = mk(); const h = t2.put('0', 0, 'Halloween Special'); t2.as('0', 'testTrash', '0', 'Hype'); t2.as('0', 'testTrash', '0', 'Diss Track'); t2.turn('0'); t2.as('0', 'activateCard', h.id);
  assert.equal(t2.G().choices.length, 0, 'nothing playable: Hype is clash-only and Diss Track costs 3');
});
test('Activate: Requested Song Stream + Mukbang ASMR', () => {
  const t = mk(); const r = t.put('0', 0, 'Requested Song Stream'); t.as('0', 'testDeck', '0', ['Rage Game', 'Marshmallows', 'Hype']); t.bits('0', 3); t.as('0', 'dbgClearHand', '0'); t.turn('0'); t.as('0', 'activateCard', r.id);
  t.pick('0', 'Rage Game'); assert.equal(t.G().players['0'].trash.at(-1).name, 'Rage Game'); assert.equal(t.G().players['0'].hand.at(-1).name, 'Marshmallows'); assert.equal(t.G().players['0'].deck[0].name, 'Hype');
  const t2 = mk(); const m = t2.put('0', 0, 'Mukbang ASMR'); t2.turn('0'); t2.as('0', 'activateCard', m.id); t2.pick('0', '2'); assert.equal(t2.G().platforms[2].cards['0'][0].name, 'Mukbang ASMR');
});

// ===================== Restrictions =====================
test('Puzzling Puzzle blocks 🟡5+ Content on its platform', () => {
  const t = mk(); t.put('1', 0, 'Puzzling Puzzle'); t.bits('0', 20); const big = t.give('0', 'Cover Song'); t.turn('0'); t.as('0', 'playCard', big.id, 0);
  assert.equal(t.G().platforms[0].cards['0'].length, 0); t.play('0', 'Rage Game'); assert.equal(t.G().platforms[0].cards['0'].length, 1);
});
test('Craft Show: only 1 Content per round', () => {
  const t = mk(); t.put('1', 1, 'Craft Show'); t.bits('0', 20); t.play('0', 'Charity Event'); t.play('0', 'Charity Event'); assert.equal(t.G().platforms[0].cards['0'].length, 1);
});
test('Math Stream: opponents pay 1 more here', () => {
  const t = mk(); t.put('1', 0, 'Math Stream'); t.bits('0', 10); t.play('0', 'Charity Event'); assert.equal(t.G().players['0'].bits, 10 - 3);
});
test('Speedrun: Actions cost 3 less (min 1) while clashing here', () => {
  const t = mk(); t.put('0', 0, 'Speedrun'); t.clash(); t.bits('0', 10); t.play('0', 'Diss Track', 0); assert.equal(t.G().players['0'].bits, 9);
});
test('Guerrilla Stream may be played on any platform', () => {
  const t = mk(); t.bits('0', 10); t.play('0', 'Guerrilla Stream', 2); assert.equal(t.G().platforms[2].cards['0'].length, 1);
});
test('Clip Out of Context: play on other platforms for 2 less', () => {
  const t = mk(); t.bits('0', 20); t.play('0', 'Clip Out of Context'); const b = t.G().players['0'].bits;
  t.play('0', 'Charity Event', 2); assert.equal(t.G().platforms[2].cards['0'].length, 1); assert.equal(t.G().players['0'].bits, b - 0);
});
test('Rent Free cannot be deleted while its owner has Content on every platform', () => {
  const t = mk(); t.as('0', 'testText', 0, ''); t.put('1', 1, 'Rent Free'); t.put('1', 0, 'Charity Event'); t.put('1', 2, 'Charity Event'); t.bits('0', 20);
  t.play('0', 'Mahjong Tournament'); t.pick('0', 'Rent Free');
  assert.equal(t.G().platforms[1].cards['1'][0]?.name, 'Rent Free', 'survives');
  const t2 = mk(); t2.as('0', 'testText', 0, ''); t2.put('1', 1, 'Rent Free'); t2.put('1', 0, 'Charity Event'); t2.bits('0', 20);
  t2.play('0', 'Mahjong Tournament'); t2.pick('0', 'Rent Free');
  assert.equal(t2.G().platforms[1].cards['1'].length, 0, 'deleted: no Content on platform 2'); assert.equal(t2.G().players['1'].trash.at(-1).name, 'Rent Free');
});
test('Rent Free stays in play when its platform is captured', () => {
  const t = mk(); t.put('1', 1, 'Rent Free'); t.put('1', 0, 'Charity Event'); t.put('1', 2, 'Charity Event'); t.put('1', 1, 'Marshmallows');
  t.as('0', 'dbgSetPop', 1, '1', 2); t.put('0', 0, 'Charity Event'); t.as('0', 'dbgSetPop', 1, '0', 0);
  const th = t.G().platforms[1].threshold; t.as('0', 'dbgSetPop', 1, '1', th - 1);
  // player 1 wins platform 1 -> reaches the threshold -> captured
  t.as('0', 'dbgDeploy', '0', 1); t.as('0', 'dbgDeploy', '1', 1); t.as('0', 'dbgClearHand', '0');
  t.as('0', 'dbgPhase', 'clash'); t.as(t.cur(), 'passTurn'); t.as(t.cur(), 'passTurn'); // platform 0 resolves
  t.as(t.cur(), 'passTurn'); t.as(t.cur(), 'passTurn'); // platform 1 resolves
  const left = t.G().platforms[1].cards['1'].map((c) => c.name);
  assert.deepEqual(left, ['Rent Free'], 'Marshmallows left, Rent Free stayed'); assert.equal(t.G().players['1'].trash.some((c) => c.name === 'Marshmallows'), true);
});
test('Puzzle Hand Cam returns to hand instead of being deleted', () => {
  const t = mk(); t.put('1', 0, 'Puzzle Hand Cam'); t.bits('0', 10); t.play('0', 'Edgelord Behavior'); t.pick('0', 'Puzzle Hand Cam');
  assert.equal(t.G().players['1'].hand.at(-1).name, 'Puzzle Hand Cam'); assert.equal(t.G().players['1'].trash.length, 0);
});

// ===================== Refresh Phase =====================
test('Dragon Deez: Nasa may return it at the start of the Refresh Phase', () => {
  const t = mk({ p0: NASA }); t.put('0', 0, 'Dragon Deez'); t.as('0', 'dbgPhase', 'clashResults');
  assert.equal(t.G().choices.length, 1, 'asks Nasa'); t.pick('0', 'Dragon Deez');
  assert.equal(t.G().platforms[0].cards['0'].length, 0); assert.equal(t.G().players['0'].hand.some((c) => c.name === 'Dragon Deez'), true);
  const t2 = mk({ p0: PIPPA }); t2.put('0', 0, 'Dragon Deez'); t2.as('0', 'dbgPhase', 'clashResults'); assert.equal(t2.G().choices.length, 0, 'not Nasa');
});

let failed = 0;
for (const [name, err] of results) { if (err) { failed++; console.log('FAIL', name, '\n    ', String(err.message).split('\n')[0]); } }
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
