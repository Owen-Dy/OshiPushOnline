// End to end: start the real server, create a match over HTTP, add the bot, and play a human seat (driven by the same
// move chooser) over a real socket connection until the game ends.
import { spawn } from 'child_process';
import { Client } from 'boardgame.io/dist/cjs/client.js';
import { SocketIO } from 'boardgame.io/dist/cjs/multiplayer.js';
import { OshiPush } from '../game.js';
import { candidateMoves } from '../bot.js';

const PORT = 8123, URL = `http://localhost:${PORT}`;
const server = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(d));
const done = (code, msg) => { if (msg) console.log(msg); server.kill(); process.exit(code); };
setTimeout(() => done(1, 'TIMEOUT: game did not finish'), 240000).unref();
await new Promise((r) => setTimeout(r, 2500));

const post = (p) => fetch(URL + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numPlayers: 2 }) });
const { matchID } = await (await post('/games/oshi-push/create')).json();

// refusals
const bad = await post('/bot/add?matchID=nope&seat=1'); if (bad.status !== 404) done(1, `expected 404 for unknown match, got ${bad.status}`);
const badSeat = await post(`/bot/add?matchID=${matchID}&seat=7`); if (badSeat.status !== 400) done(1, `expected 400 for bad seat, got ${badSeat.status}`);

const add = await post(`/bot/add?matchID=${matchID}&seat=1`);
if (!add.ok) done(1, `adding the bot failed: ${add.status} ${await add.text()}`);
const again = await post(`/bot/add?matchID=${matchID}&seat=1`);
if (again.status !== 409) done(1, `expected 409 when adding a second bot, got ${again.status}`);

const human = Client({ game: OshiPush, multiplayer: SocketIO({ server: URL }), matchID, playerID: '0' });
human.start();
let moves = 0, last = Date.now();
const timer = setInterval(() => {
  const st = human.getState();
  if (!st) return;
  if (st.ctx.gameover) {
    const names = human.matchData?.map((p) => `${p.id}:${p.name || '-'}`).join(' ');
    clearInterval(timer);
    done(0, `OK: game over after ${moves} human moves, round ${st.G.round}, result ${JSON.stringify(st.ctx.gameover)}, players ${names}`);
  }
  if (st.G.players['0'].hand.some((c) => c.hidden)) return;
  for (const [name, ...args] of candidateMoves(st, '0')) {
    const before = human.getState()._stateID;
    human.moves[name](...args);
    if (human.getState()._stateID !== before) { moves++; last = Date.now(); return; }
  }
  if (Date.now() - last > 60000) { clearInterval(timer); done(1, `STUCK in phase ${st.ctx.phase}, current player ${st.ctx.currentPlayer}`); }
}, 150);
