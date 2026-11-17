// Plays full games bot vs bot (no network) and checks that games finish without the bots getting stuck or breaking a rule.
import { Client } from 'boardgame.io/dist/cjs/client.js';
import { Local } from 'boardgame.io/dist/cjs/multiplayer.js';
import { OshiPush } from '../game.js';
import { candidateMoves } from '../bot.js';

const GAMES = Number(process.argv[2] || 20), MAX_STEPS = 6000;
let finished = 0, stuck = 0; const wins = { 0: 0, 1: 0 }, rounds = [];

for (let g = 0; g < GAMES; g++) {
  const transport = Local({ persist: false });
  const clients = ['0', '1'].map((id) => { const c = Client({ game: OshiPush, multiplayer: transport, matchID: `bot${g}`, playerID: id, numPlayers: 2 }); c.start(); return c; });
  let steps = 0, over = false;
  while (steps < MAX_STEPS && !over) {
    let moved = false;
    for (const c of clients) {
      const state = c.getState();
      if (state.ctx.gameover) { over = true; break; }
      for (const [name, ...args] of candidateMoves(state, c.playerID)) {
        const before = c.getState()._stateID;
        c.moves[name](...args);
        if (c.getState()._stateID !== before) { moved = true; steps++; break; }
      }
      if (moved) break;
    }
    if (!moved && !over) break; // nobody can move
  }
  const st = clients[0].getState();
  if (st.ctx.gameover) { finished++; const w = st.ctx.gameover.winner; if (w !== undefined) wins[w]++; rounds.push(st.G.round); }
  else { stuck++; console.log(`game ${g} stuck: phase=${st.ctx.phase} cur=${st.ctx.currentPlayer} round=${st.G.round} choices=${st.G.choices.length} steps=${steps}`); }
  clients.forEach((c) => c.stop());
}
console.log(`${finished}/${GAMES} games finished, ${stuck} stuck. wins by seat:`, wins, 'avg rounds:', rounds.length ? (rounds.reduce((a, b) => a + b, 0) / rounds.length).toFixed(1) : '-');
process.exit(stuck ? 1 : 0);
