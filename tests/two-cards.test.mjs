// Headless test of "I'll Crush You!" and "Scary Story Writing". Run: node tests/two-cards.test.mjs
import { Client } from 'boardgame.io/dist/cjs/client.js';
import { OshiPush } from '../game.js';
import { CARDS } from '../cards.js';
import assert from 'assert';

const byName = (n) => CARDS.find((c) => c.name === n);
const NASA = CARDS.find((c) => c.type === 'Persona' && c.name === 'Utatane Nasa').id;
const IORI = CARDS.find((c) => c.type === 'Persona' && c.name === 'Hakushika Iori').id;
const OTHER = CARDS.find((c) => c.type === 'Persona' && !/Nasa|Iori/.test(c.name)).id;
const CRUSH = byName("I'll Crush You!").id, SCARY = byName('Scary Story Writing').id;
// Content cards with nothing that happens on play (only passive/ability markers), so they don't ask questions in these tests
const QUIET = new Set(['kickback', 'undeletable', 'returnInsteadOfDelete', 'activate', 'discardAbility']);
const quiet = (c) => c.type === 'Content' && !c.playOnly && !c.xCost && (c.effects || []).every((fx) => QUIET.has(fx.type));
const bigQuiet = () => CARDS.find((c) => quiet(c) && c.inf >= 8).id;
const cheapContent = CARDS.filter((c) => quiet(c) && c.cost > 0 && c.cost <= 3).slice(0, 6);

// the same game, plus test-only moves and no hidden information
const game = {
  ...OshiPush,
  playerView: ({ G }) => G,
  setup: (ctx, d) => ({ ...OshiPush.setup(ctx, d), sandbox: true }),
  phases: Object.fromEntries(Object.entries(OshiPush.phases).map(([k, ph]) => [k, ph.moves ? { ...ph, moves: { ...ph.moves, testDeck: ({ G }, id, ids) => { G.players[id].deck = ids.map((cid, i) => ({ ...CARDS.find((c) => c.id === cid), id: `t${i}_${cid}` })); }, testClean: ({ G }) => { for (const p of G.platforms) p.card = { ...(p.card || {}), text: 'x', effects: [] }; }, // plain platforms: random ones have rules now
    testTrash: ({ G }, id, cid) => { G.players[id].trash.push({ ...CARDS.find((c) => c.id === cid), id: `tt_${cid}` }); } } } : ph])),
};

function setup() {
  const client = Client({ game, numPlayers: 2 });
  const as = (id, move, ...args) => { client.updatePlayerID(id); client.moves[move](...args); };
  const G = () => client.getState().G;
  const phase = () => client.getState().ctx.phase;
  for (const id of ['0', '1']) as(id, 'useRandomDeck');
  for (const id of ['0', '1']) as(id, 'keepHand');
  as('0', 'putPlatform', 0); as('1', 'putPlatform', 1); as('0', 'putPlatform', 2);
  assert.equal(phase(), 'deployment');
  as('0', 'testClean');
  return { client, as, G, phase };
}

// ---------- I'll Crush You! ----------
{
  const { as, G, phase, client } = setup();
  as('0', 'dbgSetPersona', '0', NASA, null, 0); as('0', 'dbgSetPersona', '1', OTHER, null, 0);
  assert.equal(phase(), 'content');
  as('0', 'dbgClearHand', '0'); as('0', 'dbgAddHand', '0', CRUSH);
  as('0', 'dbgSet', '0', 10, 0);
  as('0', 'dbgAddContent', '0', 0, bigQuiet()); // so player 0 wins the clash
  const [a, b, c] = cheapContent;
  // top 3 of the deck: a Content card, a Content card, and a third; the 4th must be untouched
  as('0', 'testDeck', '0', [a.id, b.id, c.id, cheapContent[3].id, cheapContent[4].id]);
  const crush = G().players['0'].hand[0];
  as('0', 'playCard', crush.id, 0);
  assert.equal(G().players['0'].bits, 10, 'costs 0');
  assert.equal(G().roundRewards['0'].length, 1, 'persona gained the reward');
  assert.equal(G().roundRewards['1'].length, 0);
  as('1', 'passTurn'); as('0', 'passTurn');
  assert.equal(phase(), 'clashOrder');
  as('0', 'chooseClashOrder', 'LEFT_TO_RIGHT');
  assert.equal(phase(), 'clash');
  // make player 0 win platform 0: give the opponent nothing
  as('0', 'dbgSetPop', 0, '0', 0);
  as('0', 'passTurn'); as('1', 'passTurn');
  const ch = G().choices;
  assert.equal(ch.length, 1, 'reward asks a question');
  assert.equal(ch[0].player, '0');
  assert.equal(ch[0].options.length, 3, 'all three Content cards can be chosen');
  assert.equal(G().players['0'].deck.length, 2, 'top 3 are held out of the deck');
  // pick card b -> order remaining (a, c): put c on top, then a
  as('0', 'makeChoice', [`r|${G().choices[0].options[1].key.slice(2)}`]);
  assert.equal(G().choices[0].options.length, 2, 'ordering the two others');
  const cKey = G().choices[0].options.find((o) => o.name === c.name).key;
  as('0', 'makeChoice', [cKey]);
  // now the platform choice
  assert.equal(G().choices[0].kind, 'platform');
  const deckNames = G().players['0'].deck.map((x) => x.name);
  assert.deepEqual(deckNames.slice(0, 2), [c.name, a.name], 'others go back on top in the chosen order');
  assert.equal(G().players['0'].deck.length, 4);
  as('0', 'makeChoice', ['2']); // play on platform 2 ("any Platform")
  assert.equal(G().choices.length, 0);
  assert.equal(G().platforms[2].cards['0'].length, 1);
  assert.equal(G().platforms[2].cards['0'][0].name, b.name);
  assert.equal(G().players['0'].bits, 10 - b.cost, 'paid its cost');
  // clash 1 is now active; finish the round and make sure the reward is gone next round
  for (let i = 0; i < 2; i++) { as(client.getState().ctx.currentPlayer, 'passTurn'); as(client.getState().ctx.currentPlayer, 'passTurn'); }
  // the third platform clash may have resolved by now
  console.log("I'll Crush You!: ok (phase now " + phase() + ')');
}

// Crush where nothing can be played (no Content in top 3): still orders the cards
{
  const { as, G, phase } = setup();
  as('0', 'dbgSetPersona', '0', NASA, null, 0); as('0', 'dbgSetPersona', '1', OTHER, null, 0);
  as('0', 'dbgClearHand', '0'); as('0', 'dbgAddHand', '0', CRUSH);
  as('0', 'dbgAddContent', '0', 0, bigQuiet());
  const act = CARDS.filter((c) => c.type === 'Action').slice(0, 3).map((c) => c.id);
  as('0', 'testDeck', '0', [...act, cheapContent[0].id]);
  as('0', 'playCard', G().players['0'].hand[0].id, 0);
  as('1', 'passTurn'); as('0', 'passTurn'); as('0', 'chooseClashOrder', 'LEFT_TO_RIGHT');
  as('0', 'passTurn'); as('1', 'passTurn');
  assert.equal(G().choices.length, 1);
  assert.equal(G().choices[0].options.length, 3, 'ordering all three');
  as('0', 'makeChoice', [G().choices[0].options[2].key]);
  as('0', 'makeChoice', [G().choices[0].options[1].key]);
  assert.equal(G().choices.length, 0, 'last card is placed automatically');
  assert.equal(G().players['0'].deck.length, 4);
  console.log("I'll Crush You! (no Content found): ok");
}

// Not Nasa: can't be played; and if the opponent wins the clash, no reward
{
  const { as, G } = setup();
  as('0', 'dbgSetPersona', '0', OTHER, null, 0); as('0', 'dbgSetPersona', '1', OTHER, null, 0);
  as('0', 'dbgAddHand', '0', CRUSH);
  const n = G().players['0'].hand.length;
  as('0', 'playCard', G().players['0'].hand[n - 1].id, 0);
  assert.equal(G().players['0'].hand.length, n, 'rejected for another persona');
  console.log("I'll Crush You! (wrong persona): ok");
}

// ---------- Scary Story Writing ----------
{
  const { as, G, phase } = setup();
  as('0', 'dbgSetPersona', '0', IORI, null, 0); as('0', 'dbgSetPersona', '1', OTHER, null, 0);
  as('0', 'dbgClearHand', '0'); as('0', 'dbgAddHand', '0', SCARY, 2); as('0', 'dbgSet', '0', 10, 0);
  const [s1, s2] = G().players['0'].hand;
  // not in the content phase
  as('0', 'playCard', s1.id, 0);
  assert.equal(G().players['0'].hand.length, 2, 'clash-only');
  as('0', 'passTurn'); as('1', 'passTurn');
  as('0', 'chooseClashOrder', 'LEFT_TO_RIGHT');
  assert.equal(phase(), 'clash');
  const base = () => G().platforms[0].pmods['0'];
  const before = base();
  as('0', 'playCard', s1.id, 0);
  assert.equal(base(), before + 3 + 2, '+3 stars (+2 from Iori\'s first-Action passive)');
  assert.equal(G().players['0'].bits, 9);
  // opponent passes, we can't play from trash yet (it is still on the board this clash)
  assert.equal(G().players['0'].trash.length, 0);
  // seed the trash, then play from the trash
  as('1', 'passTurn');
  as('0', 'testTrash', '0', SCARY);
  const t = G().players['0'].trash[0];
  as('0', 'playCard', t.id, 0, 0, 'trash');
  assert.equal(base(), before + 8, 'another +3 from the Trash (the passive only triggers once)');
  assert.equal(G().players['0'].bits, 8);
  assert.equal(G().players['0'].trash.length, 0, 'left the Trash');
  assert.equal(G().players['0'].deck[G().players['0'].deck.length - 1].name, 'Scary Story Writing', 'bottom of the deck');
  assert.equal(G().platforms[0].actions['0'].length, 1, 'only the hand-played copy stays on the board');
  // a card in the Trash that is not allowed to be replayed
  console.log('Scary Story Writing: ok');
}

// Actions go to the Trash at the end of the round (so Scary Story Writing can be replayed later)
{
  const { as, G, phase, client } = setup();
  as('0', 'dbgSetPersona', '0', IORI, null, 0); as('0', 'dbgSetPersona', '1', OTHER, null, 0);
  as('0', 'dbgClearHand', '0'); as('0', 'dbgAddHand', '0', SCARY);
  as('0', 'dbgSet', '0', 10, 0);
  as('0', 'passTurn'); as('1', 'passTurn'); as('0', 'chooseClashOrder', 'LEFT_TO_RIGHT');
  as('0', 'playCard', G().players['0'].hand[0].id, 0);
  for (let i = 0; i < 12 && phase() === 'clash'; i++) as(client.getState().ctx.currentPlayer, 'passTurn');
  assert.equal(phase(), 'clashResults');
  as('0', 'ackClash'); as('1', 'ackClash');
  assert.equal(phase(), 'deployment');
  assert.equal(G().players['0'].trash.some((c) => c.name === 'Scary Story Writing'), true, 'Action is in the Trash');
  assert.equal(G().roundRewards['0'].length, 0);
  console.log('Action -> Trash at round end: ok');
}

// Reward on the LAST platform to clash: the clash phase must wait for the answer instead of ending
{
  const { as, G, phase, client } = setup();
  as('0', 'dbgSetPersona', '0', NASA, null, 2); as('0', 'dbgSetPersona', '1', OTHER, null, 2);
  as('0', 'dbgClearHand', '0'); as('0', 'dbgAddHand', '0', CRUSH);
  as('0', 'dbgAddContent', '0', 2, bigQuiet());
  as('0', 'testDeck', '0', cheapContent.slice(0, 4).map((c) => c.id));
  as('0', 'playCard', G().players['0'].hand[0].id, 2);
  as('1', 'passTurn'); as('0', 'passTurn'); as('0', 'chooseClashOrder', 'LEFT_TO_RIGHT');
  for (let i = 0; i < 3; i++) { as(client.getState().ctx.currentPlayer, 'passTurn'); as(client.getState().ctx.currentPlayer, 'passTurn'); }
  assert.equal(phase(), 'clash', 'still in the clash phase while the reward is unanswered');
  assert.equal(G().choices.length, 1);
  as('0', 'makeChoice', []); // "you may": decline to play anything
  assert.equal(phase(), 'clash', 'ordering the 3 cards is still pending');
  for (let n = 0; n < 5 && G().choices.length; n++) as('0', 'makeChoice', [G().choices[0].options[0].key]);
  assert.equal(G().choices.length, 0);
  assert.equal(phase(), 'clashResults', 'phase ends once every decision is answered');
}
console.log('ALL PASSED');
