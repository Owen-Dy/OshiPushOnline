// Plays random games (random decks, random moves) to catch crashes or stuck games in the card effects. Run: node tests/fuzz.test.mjs [games]
import { Client } from 'boardgame.io/dist/cjs/client.js';
import { OshiPush, platformPhaseCard } from '../game.js';
const game = { ...OshiPush, playerView: ({ G }) => G };
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const GAMES = Number(process.argv[2] || 30);
let rounds = 0, finished = 0, stuck = 0, crashes = [];
for (let g = 0; g < GAMES; g++) {
  const client = Client({ game, numPlayers: 2 });
  const S = () => client.getState();
  const as = (id, move, ...a) => { lastMoves.push(`${id}:${move}${JSON.stringify(a).slice(0, 40)}`); client.updatePlayerID(id); try { client.moves[move](...a); } catch (e) { crashes.push(`${move}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); } };
  let idle = 0, lastSig = ''; const lastMoves = [];
  for (let step = 0; step < 4000 && !S().ctx.gameover; step++) {
    const { G, ctx } = S(); const ph = ctx.phase;
    const sig = JSON.stringify([ph, G.round, ctx.currentPlayer, G.choices.length, G.players['0'].hand.length, G.players['1'].hand.length, G.clashIndex, G.passed, G.personaLocations]);
    idle = sig === lastSig ? idle + 1 : 0; lastSig = sig;
    if (idle > 400) { // 0.88^400 is ~5e-23: only a real deadlock gets here
      stuck++; console.log('STUCK in', ph, 'round', G.round, 'choices', JSON.stringify(G.choices.map((c) => c.prompt)));
      console.log('  cur', ctx.currentPlayer, 'clashIndex', G.clashIndex, 'passed', JSON.stringify(G.passed), 'pendingDiscard', JSON.stringify(G.pendingDiscard), 'autoPass', JSON.stringify(G.autoPass), 'actionLock', JSON.stringify(G.actionLock), 'hands', G.players['0'].hand.length, G.players['1'].hand.length, 'locs', JSON.stringify(G.personaLocations), 'afterChoices', JSON.stringify(G.afterChoices));
      console.log('  last moves:', lastMoves.slice(-8).join(' | '));
      const tally = {}; for (const m of lastMoves.slice(-60)) { const k = m.split('[')[0]; tally[k] = (tally[k] || 0) + 1; } console.log('  last 60 moves by type:', JSON.stringify(tally));
      const before = JSON.stringify(S().G.passed) + S().ctx.currentPlayer; as(ctx.currentPlayer, 'passTurn');
      console.log('  passTurn accepted?', before !== JSON.stringify(S().G.passed) + S().ctx.currentPlayer, '-> passed', JSON.stringify(S().G.passed), 'cur', S().ctx.currentPlayer);
      break;
    }
    const cur = ctx.currentPlayer, ids = ['0', '1'];
    if (ph === 'deckSelect') { for (const id of ids) as(id, 'useRandomDeck'); continue; }
    if (ph === 'mulligan') { for (const id of ids) as(id, 'keepHand'); continue; }
    if (ph === 'platformSetup') { as(cur, 'putPlatform', rnd(3)); continue; }
    if (G.choices.length) { const ch = G.choices[0]; const n = Math.min(ch.max || 1, ch.options.length); const keys = [...ch.options].sort(() => Math.random() - 0.5).slice(0, ch.min === 0 && Math.random() < 0.3 ? 0 : Math.max(ch.min ?? 1, 1)).map((o) => o.key); as(ch.player, 'makeChoice', keys); continue; }
    if (ph === 'deployment') {
      if (G.platformHold === cur) { // Platform Phase: play So Baby (sometimes) or say you are done
        const sb = G.players[cur].hand.find((c) => platformPhaseCard(c));
        if (sb && Math.random() < 0.5) as(cur, 'playCard', sb.id, G.personaLocations[cur]); else as(cur, 'endPlatformTurn');
      } else as(cur, 'deployPersona', rnd(3));
      continue;
    }
    if (ph === 'clashOrder') { as(cur, 'chooseClashOrder', pick(['LEFT_TO_RIGHT', 'RIGHT_TO_LEFT'])); continue; }
    if (ph === 'clashResults') {
      for (const id of ids) { // acknowledge; if the hand limit forces a discard first, discard instead
        as(id, 'ackClash');
        if (!S().G.clashAcks[id] && S().G.players[id].hand.length) as(id, 'discardCard', S().G.players[id].hand[0].id);
      }
      continue;
    }
    // content / clash: random action by the current player
    const me = G.players[cur], loc = G.personaLocations[cur], r = Math.random();
    if (G.pendingDiscard[cur] > 0 && me.hand.length) { as(cur, 'discardCard', pick(me.hand).id); continue; }
    if (r < 0.55 && me.hand.length) { const c = pick(me.hand); as(cur, 'playCard', c.id, ph === 'clash' ? G.clashSequence[G.clashIndex] : rnd(3) < 2 ? loc : rnd(3), 0); }
    else if (r < 0.7 && me.hand.length) as(cur, 'discardAbility', pick(me.hand).id);
    else if (r < 0.8) { const cs = G.platforms.flatMap((p) => p.cards[cur]); if (cs.length) as(cur, 'activateCard', pick(cs).id); else as(cur, 'passTurn'); }
    else if (r < 0.88) as(cur, 'activate'); // the Persona's own Activate (Sakana, Upgrades)
    else as(cur, 'passTurn');
  }
  rounds += S().G.round; if (S().ctx.gameover) finished++;
}
const uniq = [...new Set(crashes)];
console.log(`${GAMES} games, avg round reached ${(rounds / GAMES).toFixed(1)}, finished ${finished}, stuck ${stuck}, distinct crashes ${uniq.length}`);
for (const c of uniq.slice(0, 8)) console.log('CRASH', c);
process.exit(uniq.length || stuck ? 1 : 0);
