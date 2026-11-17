// Checks for captures replacing platforms, Controlling The Narrative and Watchalong. Run:  node tests/actions.test.js
import bgio from 'boardgame.io/dist/cjs/client.js';
import { OshiPush } from '../game.js';
import { CARDS } from '../cards.js';
import { randomDeck } from '../deckRules.js';

let ok = 0, bad = 0;
const check = (label, got, want) => { const pass = JSON.stringify(got) === JSON.stringify(want); pass ? ok++ : bad++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(got)}${pass ? '' : '  (expected ' + JSON.stringify(want) + ')'}`); };
const byName = (n) => CARDS.find((c) => c.name === n);
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
let uid = 0;
const mk = (x) => ({ ...structuredClone(typeof x === 'string' ? byName(x) : x), id: `A${uid++}` });
const content = (f) => CARDS.find((c) => c.type === 'Content' && !c.playOnly?.persona && f(c));
const cheap = content((c) => c.cost >= 1 && c.cost <= 3 && c.inf >= 1), dear = content((c) => c.cost >= 8);

function scene({ p0 = 'Pipkin Pippa', p1 = 'Sakana', hand = [], bits = 20, prep, phase = 'clash' }) {
  const game = { ...OshiPush, phases: { ...OshiPush.phases,
    mulligan: { ...OshiPush.phases.mulligan, onEnd: ({ G }) => { G.players['0'].hand = hand.map(mk); G.players['0'].bits = bits; G.players['1'].bits = 20; } },
    platformSetup: { ...OshiPush.phases.platformSetup, onEnd: ({ G }) => { prep?.(G); } } } };
  const c = bgio.Client({ game, numPlayers: 2 }); c.start();
  const as = (p) => c.updatePlayerID(p), S = () => c.getState(), cur = () => S().ctx.currentPlayer;
  as('0'); c.moves.submitDeck(randomDeck(CARDS, shuffle, byName(p0).id)); as('1'); c.moves.submitDeck(randomDeck(CARDS, shuffle, byName(p1).id));
  as('0'); c.moves.keepHand(); as('1'); c.moves.keepHand();
  for (const slot of [0, 1, 2]) { as(cur()); c.moves.putPlatform(slot); } // players put down the 3 platforms
  as('0'); c.moves.deployPersona(0); as('1'); c.moves.deployPersona(2);
  const G = (p = '0') => (as(p), S().G);
  const pass = () => { as(cur()); c.moves.passTurn(); };
  if (phase === 'clash') { pass(); pass(); as('0'); c.moves.chooseClashOrder('LEFT_TO_RIGHT'); }
  const api = { c, as, S, cur, G, pass,
    play: (name, plat = 0) => { as('0'); const card = G().players['0'].hand.find((h) => h.name === name); c.moves.playCard(card.id, plat); return !G('0').players['0'].hand.some((h) => h.id === card.id); },
    ch: () => G('0').choices[0],
    answer: (keys) => { const who = api.ch().player; as(who); c.moves.makeChoice(keys); } };
  return api;
}

console.log('--- Setting up the field: first player, second player, first player again (platforms drawn at random, slots chosen)');
{ const c = bgio.Client({ game: OshiPush, numPlayers: 2 }); c.start();
  const as = (p) => c.updatePlayerID(p), S = () => c.getState(), cur = () => S().ctx.currentPlayer;
  as('0'); c.moves.submitDeck(randomDeck(CARDS, shuffle, byName('Pipkin Pippa').id)); as('1'); c.moves.submitDeck(randomDeck(CARDS, shuffle, byName('Sakana').id));
  as('0'); c.moves.keepHand(); as('1'); c.moves.keepHand();
  const own = (p) => (as(p), S().G.players[p].platformCards);
  check('after the mulligan the field is empty and the first player is up', [S().ctx.phase, S().G.platforms.some((p) => p.card), cur()], ['platformSetup', false, '0']);
  check('each player has a 5-card platform deck', [own('0').length, own('1').length], [5, 5]);
  as('1'); c.moves.putPlatform(0); check('the second player cannot go first', S().G.platforms[0].card, undefined);
  const top0 = own('0')[0]; as('0'); c.moves.putPlatform('not-a-slot'); check('an invalid slot is refused', cur(), '0');
  as('0'); c.moves.putPlatform(1);
  check('the first player\'s platform is the top card of their (shuffled) deck, in the slot they chose; now the second player', [S().G.platforms[1].card?.name, cur()], [top0.name, '1']);
  as('1'); c.moves.putPlatform(1); check('an occupied slot is refused', cur(), '1');
  const top1 = own('1')[0]; as('1'); c.moves.putPlatform(0);
  check('second player: their top card goes in the chosen slot; first player again', [S().G.platforms[0].card?.name, cur()], [top1.name, '0']);
  const top2 = own('0')[0]; as('0'); c.moves.putPlatform(2);
  check('first player fills the last slot -> deployment starts with 3 platforms', [S().ctx.phase, S().G.platforms.map((p) => p.card?.name)], ['deployment', [top1.name, top0.name, top2.name]]);
  check('the first player used 2 cards, the second 1 (platform decks 3 and 4)', [own('0').length, own('1').length], [3, 4]);
  check('the opponent cannot see your platform deck', (as('1'), S().G.players['0'].platformCards.every((x) => x.hidden)), true); }

console.log('--- A captured platform is replaced from the side deck of the player who did NOT get the subscribers');
{ const t = scene({ hand: ['Big Cheese'], prep: (G) => { G.platforms[0].cards['0'].push(mk(cheap)); G.platforms[0].pop['0'] = G.platforms[0].threshold - 1; } });
  const top = t.G('1').players['1'].platformCards[0], mineBefore = t.G('0').players['0'].platformCards.length, theirsBefore = t.G('1').players['1'].platformCards.length;
  const sv = t.G().platforms[0].subValue; t.play('Big Cheese'); const g = t.G('1');
  check('p0 captured (subs awarded)', g.players['0'].subs, sv);
  check('the new platform is the top card of the LOSER\'s (player 1) platform deck', g.platforms[0].name, top.name);
  check('the loser\'s platform deck shrank by 1; the capturer\'s did not', [g.players['1'].platformCards.length, t.G('0').players['0'].platformCards.length], [theirsBefore - 1, mineBefore]);
  check('the new platform starts empty (no popularity or Content)', [g.platforms[0].pop, g.platforms[0].cards], [{ 0: 0, 1: 0 }, { 0: [], 1: [] }]); }
{ const t = scene({ prep: (G) => { G.players['1'].platformCards = []; G.platforms[0].pop['0'] = G.platforms[0].threshold - 1; G.platforms[0].cards['0'].push(mk(cheap)); } });
  const oldName = t.G().platforms[0].name; t.pass(); t.pass();
  check('if the loser has no platform cards left, the same platform stays (reset)', [t.G().platforms[0].name === oldName, t.G().platforms[0].pop['0']], [true, 0]); }

console.log('--- Controlling The Narrative: can complete the opponent\'s capture, but no Clash Reward');
{ const t = scene({ hand: ['Controlling The Narrative'], prep: (G) => { G.platforms[0].pop['1'] = 1; G.platforms[2].pop['1'] = G.platforms[2].threshold - 1; G.players['1'].persona = { ...byName('Pipkin Pippa') }; } });
  const sv = t.G().platforms[2].subValue, name2 = t.G().platforms[2].name, bits1 = t.G('1').players['1'].bits, myPop = t.G().platforms[2].pop['0'];
  const topMine = t.G('0').players['0'].platformCards[0];
  t.play('Controlling The Narrative'); t.answer(['2']); const g = t.G('1');
  check('opponent\'s 🌠 moved to the right platform and reached its threshold: they capture it', [g.players['1'].subs, g.platforms[2].name !== name2, g.platforms[2].pop['1']], [sv, true, 0]);
  check('the replacement comes from MY platform deck (I am the one who did not get the subscribers)', g.platforms[2].name, topMine.name);
  check('the platform they left behind has lost that popularity', g.platforms[0].pop['1'], 0);
  check('no Clash Reward fired for the opponent (a Pipkin persona would have given +1 Bit)', g.players['1'].bits, bits1 + myPop); }
{ const t = scene({ hand: ['Controlling The Narrative'], prep: (G) => { G.platforms.forEach((p) => { p.threshold = 9; }); G.platforms[0].pop['1'] = 2; } });
  t.play('Controlling The Narrative'); t.answer(['1']);
  check('below the threshold: just moves, no capture', [t.G().platforms[0].pop['1'], t.G().platforms[1].pop['1'], t.G('1').players['1'].subs], [1, 1, 0]); }

console.log('--- Watchalong: you must play a Content card, and it can only be played if you can');
{ const t = scene({ hand: ['Watchalong'] }); check('no Content card in hand: Watchalong cannot be played', t.play('Watchalong'), false); }
{ const t = scene({ hand: ['Watchalong', dear.name], bits: 5 }); check('a Content card you cannot afford: still not playable', t.play('Watchalong'), false); }
{ const w = byName('Watchalong'); const t = scene({ hand: ['Watchalong', cheap.name], bits: w.cost + cheap.cost - 1 });
  check('cannot afford Watchalong AND the Content card together: not playable', t.play('Watchalong'), false); }
{ const w = byName('Watchalong'); const t = scene({ hand: ['Watchalong', cheap.name], bits: w.cost + cheap.cost });
  check('enough Bits for both: Watchalong can be played', t.play('Watchalong'), true);
  check('the choice cannot be skipped (must pick exactly 1)', [t.ch().min, t.ch().max], [1, 1]);
  t.as('0'); t.c.moves.makeChoice([]); check('answering with nothing is refused', t.ch() !== undefined, true);
  t.answer([t.ch().options[0].key]); check('the Content card is played; Bits are all spent', [t.G().platforms[0].cards['0'].length, t.G().players['0'].bits], [1, 0]); }
{ const t = scene({ p0: 'Sakana', p1: 'Pipkin Pippa', hand: ['Watchalong', 'Eat a Spider'], bits: 20 });
  check('a Content card the persona cannot play (Pipkin-only) does not count', t.play('Watchalong'), false); }
console.log(`\n${ok} passed, ${bad} failed`);
