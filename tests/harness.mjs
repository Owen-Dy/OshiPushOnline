// Shared helpers for the headless card tests: mk() starts a sandbox match with both personas deployed (see content-cards.test.mjs).
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
    testPlatform: ({ G }, idx, name) => { const c = CARDS.find((x) => x.type === 'Platform' && x.name === name); const p = G.platforms[idx]; p.name = c.name; p.type = c.tags || p.type; p.threshold = 9; p.card = { id: c.id, name: c.name, art: c.art, text: c.text, effects: c.effects || [] }; },
    testText: ({ G }, idx, text) => { G.platforms[idx].card = { ...(G.platforms[idx].card || {}), text, effects: [] }; G.platforms[idx].threshold = 9; }, // 9: nothing gets captured by accident
  } } : ph])),
};

export function mk({ p0 = PIPPA, p1 = PIPPA, at0 = 0, at1 = 0, up0 = null } = {}) {
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

export const results = [];
export const test = (name, fn) => { try { fn(); results.push([name, null]); } catch (e) { results.push([name, e]); } };
export const finish = () => {
  let failed = 0;
  for (const [name, err] of results) if (err) { failed++; console.log('FAIL', name, '\n    ', String(err.message).split('\n')[0]); }
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
};
export { card, persona, PIPPA, NASA, IORI };
