// Quick regression check of the main rules. Run from the project folder:  node tests/smoke.test.js
import bgio from 'boardgame.io/dist/cjs/client.js';
import { OshiPush, sideInf, WIN_SUBS } from '../game.js';
import { CARDS } from '../cards.js';
import { RULES, validateDeck, randomDeck, fitsPersona } from '../deckRules.js';

let ok = 0, bad = 0;
const check = (label, got, want) => { const pass = JSON.stringify(got) === JSON.stringify(want); pass ? ok++ : bad++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(got)}${pass ? '' : '  (expected ' + JSON.stringify(want) + ')'}`); };
const byName = (n) => CARDS.find((c) => c.name === n);
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
const byId = new Map(CARDS.map((c) => [c.id, c]));
let uid = 0;
const mk = (x) => ({ ...structuredClone(typeof x === 'string' ? byName(x) : x), id: `S${uid++}` });
const content = (f) => CARDS.find((c) => c.type === 'Content' && !c.playOnly?.persona && f(c));
const A = content((c) => c.cost <= 3 && c.inf >= 2), B = content((c) => c.cost <= 3 && c.inf >= 2 && c.name !== A.name);

function scene({ p0 = 'Pipkin Pippa', p1 = 'Sakana', hand = [], bits = 20, prep, phase = 'clash', sandbox = false }) {
  const game = { ...OshiPush, setup: (c, d) => OshiPush.setup(c, sandbox ? { sandbox: true } : d), phases: { ...OshiPush.phases,
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
  return { c, as, S, cur, G, pass,
    play: (name, plat = 0) => { as('0'); const card = G().players['0'].hand.find((h) => h.name === name); c.moves.playCard(card.id, plat); return !G('0').players['0'].hand.some((h) => h.id === card.id); },
    finish: () => { let n = 0; while (S().ctx.phase !== 'clashResults' && n++ < 30) S().ctx.phase === 'clashOrder' ? (as(cur()), c.moves.chooseClashOrder('LEFT_TO_RIGHT')) : pass(); return G(); } };
}
const place = (G, id, idx, card) => G.platforms[idx].cards[id].push(mk(card));

// decks
{ const pip = byName('Pipkin Pippa'); const d = randomDeck(CARDS, shuffle, pip.id);
  check('random deck is legal (40 main, 5 platforms, max 4 copies, fits persona)', [validateDeck(d, byId), d.main.length], [[], RULES.MAIN]);
  const off = CARDS.find((c) => c.type === 'Content' && !fitsPersona(c, pip));
  check('a card off the persona\'s type and color is rejected', validateDeck({ ...d, main: [off.id, ...d.main.slice(1)] }, byId).length > 0, true);
  const foreign = byName('Utatane Nasa, Seiso Sleepy Dragon');
  check('another persona\'s Upgrade is rejected', validateDeck({ ...d, main: [foreign.id, ...d.main.slice(1)] }, byId).length > 0, true); }

// start of game
{ const t = scene({ phase: 'content' }); check('starting Bits are the persona\'s (Pipkin 3)', byName('Pipkin Pippa').gems, 3); check('game is in the Content phase after deployment', t.S().ctx.phase, 'content'); }
{ const t = scene({ p0: 'Sakana', p1: 'Pipkin Pippa', hand: ['Eat a Spider'], phase: 'content' }); check('Pipkin-only Content refused for Sakana', t.play('Eat a Spider'), false); }
{ const t = scene({ hand: [A.name], phase: 'content' }); check('Content played on the persona\'s platform', t.play(A.name, 0), true); }
{ const t = scene({ hand: [A.name], phase: 'content' }); check('Content refused on another platform', t.play(A.name, 1), false); }

// persona abilities, upgrades, rewards
{ const t = scene({ p0: 'Utatane Nasa', bits: 0, phase: 'content' }); check('Nasa with 0 Bits: 3 + 3 stars', sideInf(t.G(), 0, '0'), 6); }
{ const t = scene({ hand: ['Pipkin Pippa, Filippa'], phase: 'content' }); t.play('Pipkin Pippa, Filippa');
  const up = byName('Pipkin Pippa, Filippa'); check('Upgrade replaces the persona\'s stars', sideInf(t.G(), 0, '0'), up.inf); }
{ const t = scene({ bits: 3 }); const b = t.G().players['0'].bits; const g = t.finish();
  check('Pipkin wins her platform: Clash Reward +1 Bit (+3 income)', g.players['0'].bits - b, 4); }

// actions
{ const t = scene({ hand: ['Ban Hammer'], board: undefined, prep: (G) => { place(G, '0', 0, A); place(G, '1', 2, B); } }); t.play('Ban Hammer');
  const zats = (c) => /zatsudan/i.test(c.genre || ''); check('Ban Hammer deletes only non-Zatsudan Content', [t.G().platforms[0].cards['0'].every(zats), t.G().platforms[2].cards['1'].every(zats)], [true, true]); }
{ const t = scene({ hand: ['Big Cheese'], prep: (G) => { G.platforms.forEach((p) => { p.threshold = 9; }); place(G, '0', 0, A); } }); t.play('Big Cheese'); check('Big Cheese: more Content than the opponent -> +1 popularity', t.G().platforms[0].pop['0'], 1); }
{ const t = scene({ hand: ['Parasocial Trap'], prep: (G) => { G.platforms.forEach((p) => { p.threshold = 9; }); G.platforms[0].pop['1'] = 2; } }); t.play('Parasocial Trap'); check('Parasocial Trap steals 1 popularity', [t.G().platforms[0].pop['1'], t.G().platforms[0].pop['0']], [1, 1]); }
{ const t = scene({ hand: ['Hype'], prep: (G) => { place(G, '0', 0, A); } }); t.play('Hype'); const ch = t.G().choices[0];
  check('Hype asks which card; the turn waits', [ch.player, t.G().afterChoices?.actor, t.cur()], ['0', '0', '0']);
  t.c.moves.makeChoice([ch.options[0].key]); check('after the answer the card has +5 and the turn passed', [t.G().platforms[0].cards['0'][0].mod, t.cur()], [5, '1']); }

// clash flow
{ const t = scene({ phase: 'content' }); t.pass(); t.pass(); t.as('0'); t.c.moves.chooseClashOrder('RIGHT_TO_LEFT');
  const slots = t.G().platforms.map((p) => p.name); // names before any capture can replace a platform
  const g = t.finish(); check('clashes resolve right > middle > left, one platform at a time', g.clashLog.map((e) => e.name), [2, 1, 0].map((i) => slots[i])); }
{ const t = scene({ phase: 'content' }); t.as('0'); t.c.moves.togglePassAll(); t.as('1'); t.c.moves.togglePassAll();
  check('both Pass all in Content -> straight to the clash order', t.S().ctx.phase, 'clashOrder'); }

// end of round: hand limit
{ const t = scene({ hand: ['Hype', 'Hype', 'Hype', 'Hype', 'Hype', 'Hype', 'Hype', 'Hype'] }); t.finish(); t.as('0'); t.c.moves.ackClash();
  check('over the hand limit: cannot continue before discarding', t.G().clashAcks['0'], false);
  while (t.G().players['0'].hand.length > 6) { t.as('0'); t.c.moves.discardCard(t.G().players['0'].hand[0].id); }
  t.as('0'); t.c.moves.ackClash(); check('after discarding down to 6 the player can continue', t.G().clashAcks['0'], true); }

// sandbox / win
{ const t = scene({ hand: [] }); t.as('0'); t.c.moves.dbgAddHandType?.('0', 'Action'); check('a normal match refuses sandbox tools', t.G().players['0'].hand.length, 0); }
{ const t = scene({ sandbox: true, hand: [] }); t.as(t.cur()); t.c.moves.dbgAddHandType('0', 'Action'); check(`a sandbox match accepts them (${CARDS.filter((c) => c.type === 'Action').length} Actions)`, t.G('0').players['0'].hand.length, CARDS.filter((c) => c.type === 'Action').length); }
{ const t = scene({ prep: (G) => { G.players['0'].subs = WIN_SUBS - G.platforms[0].subValue; G.platforms[0].pop['0'] = G.platforms[0].threshold - 1; } });
  t.pass(); t.pass(); check('capturing a platform at 1,000,000 subscribers wins the game', t.S().ctx.gameover, { winner: '0' }); }
console.log(`\n${ok} passed, ${bad} failed`);
