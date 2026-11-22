// Oshi Push bot: a computer opponent that sits in an empty seat of a match.
//
// It runs on the server as a headless game client (the same kind of client a browser is), connected to the same game
// server, so the rules are enforced exactly as for a human. It sees only what a human in that seat would see.
//
// How it plays (simple but sensible):
//   - random legal deck, keeps its opening hand unless it is clearly unplayable
//   - deploys its persona on the platform where it is closest to winning, or where it can beat the opponent
//   - Content phase: plays the best-value Content/Upgrade cards it can afford, keeps a few Bits for clash Actions
//   - Clash: plays an Action only if it turns a losing (or tied) clash into a win; otherwise passes
//   - answers card decisions, discards its weakest cards, and acknowledges the results screen
import { Client } from 'boardgame.io/dist/cjs/client.js';
import { SocketIO } from 'boardgame.io/dist/cjs/multiplayer.js';
import { OshiPush, discardNeed, sideInf, playCost, cardPlayable, effectsPlayable, contentBlocked, canPlayAnywhere, upgradeFits, canFlip, premiumOf, platformPhaseCard, canPlayFromTop } from './game.js';

const other = (id) => (id === '0' ? '1' : '0');
const rand = (n) => Math.floor(Math.random() * n);
const pick = (list) => list[rand(list.length)];

// ---------- thinking: turn the current game state into a ranked list of moves to try ----------
// Each candidate is [moveName, ...args]. The first one the game accepts is played.
export function candidateMoves(state, me) {
  const { G, ctx } = state;
  const phase = ctx.phase, you = G.players[me], opp = other(me);
  const myTurn = ctx.currentPlayer === me;

  // 1. A decision is waiting for me (pick a card or platform for an effect).
  const ch = G.choices[0];
  if (ch) {
    if (ch.player !== me) return []; // the opponent has to answer first
    return choiceMoves(G, ch, me);
  }

  // 2. I owe discards (effects, or the hand limit at the end of a round).
  const need = discardNeed(G, me, phase === 'clashResults');
  if (need > 0 && (phase === 'clashResults' || (myTurn && (phase === 'content' || phase === 'clash')))) {
    return [...you.hand].sort((a, b) => keepValue(a) - keepValue(b)).map((c) => ['discardCard', c.id]);
  }

  switch (phase) {
    case 'deckSelect':
      return you.deckReady ? [] : [['useRandomDeck']];

    case 'mulligan': {
      if (you.mulliganDone) return [];
      const cheap = you.hand.filter((c) => c.type === 'Content' && c.cost <= Math.max(3, you.bits - 3)).length;
      return [[cheap === 0 ? 'mulligan' : 'keepHand'], ['keepHand']];
    }

    case 'platformSetup': {
      if (!myTurn) return [];
      const empty = [0, 1, 2].filter((i) => !G.platforms[i].card);
      return [...empty].sort(() => Math.random() - 0.5).map((i) => ['putPlatform', i]);
    }

    case 'deployment': {
      if (myTurn && G.platformHold === me) { // Platform Phase: play So Baby if it can be played, then say you are done
        const loc = G.personaLocations[me];
        const plays = you.hand.filter((c) => platformPhaseCard(c) && playCost(G, me, c, loc) <= you.bits).map((c) => ['playCard', c.id, loc]);
        return [...plays, ['endPlatformTurn']];
      }
      if (!myTurn || G.personaLocations[me] !== null) return [];
      return deployOrder(G, me).map((i) => ['deployPersona', i]);
    }

    case 'clashOrder': {
      if (G.firstPlayer !== me) return [];
      const lead = (i) => sideInf(G, i, me) - sideInf(G, i, opp);
      // Resolve first the end platform where I am doing better: captures there happen before the opponent can react.
      const dir = lead(0) >= lead(2) ? 'LEFT_TO_RIGHT' : 'RIGHT_TO_LEFT';
      return [['chooseClashOrder', dir], ['chooseClashOrder', 'LEFT_TO_RIGHT']];
    }

    case 'content': {
      if (!myTurn) return [];
      return [...flips(state, me), ...topPlays(G, me, phase), ...contentPlays(G, me), ['passTurn']];
    }

    case 'clash': {
      if (!myTurn) return [];
      return [...flips(state, me), ...topPlays(G, me, phase), ...clashPlays(G, me), ['passTurn']];
    }

    case 'clashResults':
      return G.clashAcks[me] ? [] : [['ackClash']];

    default:
      return [];
  }
}

// How much I want to keep a card when discarding: low = discard first.
const keepValue = (c) => (c.type === 'Content' ? c.inf * 2 - c.cost : c.type === 'Upgrade' ? 8 : c.type === 'Action' ? 3 : 0);

// ---------- decisions (makeChoice) ----------
function choiceMoves(G, ch, me) {
  const keys = ch.options.map((o) => o.key);
  const mine = (o) => o.owner === me;
  const score = (o) => {
    // Prefer helping myself when the effect helps, and hurting the opponent when it hurts: decide from the prompt text.
    const harmful = /delete|discard|trash|remove|lose|-\d|opponent'?s?\b.*(move|lose)/i.test(`${ch.prompt} ${ch.action?.do || ''}`) && !/return|draw|gain|\+\d/i.test(ch.prompt || '');
    const stars = o.stars ?? o.cost ?? 0;
    if (o.owner === undefined) return Math.random();
    return (harmful ? (mine(o) ? -1 : 1) : (mine(o) ? 1 : -1)) * 100 + stars + Math.random();
  };
  const ranked = [...ch.options].sort((a, b) => score(b) - score(a)).map((o) => o.key);
  const moves = [];
  if (ch.min === 0) { // optional decisions: usually take them when they look useful
    moves.push(['makeChoice', ranked.slice(0, Math.min(ch.max, ranked.length))]);
    moves.push(['makeChoice', []]);
  }
  for (let n = Math.max(ch.min, 1); n >= ch.min && n >= 1; n--) moves.push(['makeChoice', ranked.slice(0, Math.min(n, ch.max))]);
  // Fallbacks: every single option, then any group of the minimum size.
  for (const k of ranked) moves.push(['makeChoice', [k]]);
  if (ch.min > 1) for (let i = 0; i + ch.min <= keys.length; i++) moves.push(['makeChoice', keys.slice(i, i + ch.min)]);
  moves.push(['makeChoice', []]);
  return moves;
}

// ---------- deployment ----------
function deployOrder(G, me) {
  const opp = other(me), oppAt = G.personaLocations[opp];
  const per = G.players[me].persona;
  const score = (i) => {
    const p = G.platforms[i];
    const left = Math.max(1, p.threshold - p.pop[me]); // clashes I still need to win here
    const oppLeft = Math.max(1, p.threshold - p.pop[opp]);
    let s = (p.subValue / 100000) * (3 / left) + 2 / oppLeft + p.cards[me].length * 0.8 - p.cards[opp].length * 0.3;
    if (oppAt === i) s += (per?.inf || 0) >= (G.players[opp].persona?.inf || 0) ? 1.5 : -2.5; // fight there only if my persona is at least as strong
    return s + Math.random() * 0.5;
  };
  return [0, 1, 2].sort((a, b) => score(b) - score(a));
}

// ---------- Premium Content: flip a face-down card as soon as its condition is met ----------
function flips(state, me) {
  const { G, ctx } = state, out = [];
  for (const pl of G.platforms) for (const c of pl.cards[me]) if (c.faceDown && premiumOf(c) && canFlip(G, ctx.phase, me, c.id)) out.push(['flipCard', c.id]);
  return out;
}

// ---------- the revealed top card (AVId Gummy Worm Enjoyer): play it for free ----------
function topPlays(G, me, phase) {
  const top = G.players[me].deck[0], loc = G.personaLocations[me];
  if (!top || loc === null || !canPlayFromTop(G, me, top)) return [];
  if (phase === 'clash' && loc !== G.clashSequence[G.clashIndex]) return [];
  return [['playCard', top.id, loc, undefined, 'deck']];
}

// ---------- Content phase ----------
function contentPlays(G, me) {
  const you = G.players[me], at = G.personaLocations[me];
  if (at === null) return [];
  const actions = you.hand.filter((c) => c.type === 'Action' && cardPlayable(c, you.persona, 'clash'));
  const reserve = actions.length ? Math.min(2, Math.min(...actions.map((c) => Math.max(1, c.cost)))) : 0; // Bits kept for the clash
  const list = [];
  for (const card of you.hand) {
    if (card.type === 'Action') continue; // Actions are held for the clash, where I can see the totals
    if (card.xCost) continue;
    if (card.type === 'Upgrade' && !upgradeFits(card, you.persona)) continue;
    if (!cardPlayable(card, you.persona, 'content')) continue;
    const places = canPlayAnywhere(G, me, card) ? [0, 1, 2] : [at];
    for (const i of places) {
      const cost = playCost(G, me, card, i);
      if (cost > you.bits || contentBlocked(G, me, card, i)) continue;
      if (!effectsPlayable(G, me, card, i, you.bits - cost)) continue;
      const afterBits = you.bits - cost;
      let value = card.type === 'Upgrade' ? 6 : (premiumOf(card) ? 3 : card.inf) + 0.5;
      value += (card.effects || []).length * 0.5; // abilities are usually worth something
      value -= cost * 0.6;
      if (afterBits < reserve && cost > 0) value -= 4; // keep Bits for the clash
      if (i !== at) value -= 1;
      list.push({ move: ['playCard', card.id, i], value });
    }
  }
  return list.filter((m) => m.value > -2).sort((a, b) => b.value - a.value).map((m) => m.move);
}

// ---------- Clash ----------
function clashPlays(G, me) {
  const you = G.players[me], opp = other(me);
  const cur = G.clashSequence[G.clashIndex];
  if (G.personaLocations[me] !== cur || G.actionLock[me]) return [];
  const mine = sideInf(G, cur, me), theirs = sideInf(G, cur, opp);
  if (mine > theirs) return []; // already winning: save my cards
  const p = G.platforms[cur];
  // Is this clash worth fighting for? Winning gives popularity, and a platform close to capture is worth more.
  const worth = 1 + (p.pop[me] + 1 >= p.threshold ? 3 : 0) + (p.pop[opp] + 1 >= p.threshold ? 2 : 0);
  const options = [];
  for (const card of you.hand) {
    if (card.type !== 'Action' || card.xCost || !cardPlayable(card, you.persona, 'clash')) continue;
    const cost = playCost(G, me, card, cur);
    if (cost > you.bits || !effectsPlayable(G, me, card, cur, you.bits - cost)) continue;
    const gain = card.inf || 0;
    if (mine + gain <= theirs) continue; // doesn't turn the clash around
    if (cost > worth * 2 + 1 && p.pop[me] + 1 < p.threshold) continue; // too expensive for what it wins
    options.push({ move: ['playCard', card.id, cur], value: -cost - (gain - (theirs - mine)) * 0.2 });
  }
  return options.sort((a, b) => b.value - a.value).map((o) => o.move);
}

// ---------- running a bot on the server ----------
const bots = new Map(); // `${matchID}:${seat}` -> { stop, since }
const DELAY = [700, 1500]; // pause (ms) between the bot's moves, so a person can follow what it does
const LEFT_MS = 30 * 60 * 1000; // a bot goes home when its human opponent has been gone this long

export const botCount = () => bots.size;
export const hasBot = (matchID, seat) => bots.has(`${matchID}:${seat}`);

export function startBot({ matchID, seat, serverUrl, onStop }) {
  const key = `${matchID}:${seat}`;
  if (bots.has(key)) return false;
  const client = Client({ game: OshiPush, multiplayer: SocketIO({ server: serverUrl }), matchID, playerID: seat });
  let timer = null, stopped = false, leftAt = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    clearInterval(watchdog);
    try { client.stop(); } catch { /* already closed */ }
    bots.delete(key);
    if (onStop) onStop();
  };

  const think = () => {
    timer = null;
    if (stopped) return;
    const state = client.getState();
    if (!state) return;
    if (state.ctx.gameover) { setTimeout(stop, 30000).unref(); return; } // linger so the human can read the result
    if (state.G.players[seat].hand.some((c) => c.hidden)) return; // not my view yet
    let moves;
    try { moves = candidateMoves(state, seat); } catch (e) { console.warn(`Bot ${key}: thinking failed:`, e.message); return; }
    for (const [name, ...args] of moves) {
      const before = client.getState()._stateID;
      try { client.moves[name](...args); } catch { continue; }
      if (client.getState()._stateID !== before) return; // accepted: the next state update wakes me up
    }
    // Nothing was accepted: wait for something to change (the opponent acting).
  };

  const watchdog = setInterval(() => { if (leftAt && Date.now() - leftAt > LEFT_MS) stop(); }, 60000);
  watchdog.unref?.();

  const wake = () => {
    if (stopped) return;
    const human = (client.matchData || []).find((p) => String(p.id) === other(seat));
    if (human && !human.isConnected) leftAt = leftAt || Date.now(); else leftAt = null;
    if (timer) return;
    const quick = ['deckSelect', 'mulligan'].includes(client.getState()?.ctx.phase);
    timer = setTimeout(think, quick ? 400 : DELAY[0] + rand(DELAY[1] - DELAY[0]));
    timer.unref?.();
  };

  client.subscribe(wake);
  client.start();
  bots.set(key, { stop, since: Date.now() });
  wake();
  return true;
}

export function stopBot(matchID, seat) { bots.get(`${matchID}:${seat}`)?.stop(); }
export function stopBotsFor(matchID) { for (const k of [...bots.keys()]) if (k.startsWith(`${matchID}:`)) bots.get(k).stop(); }
export function stopOldBots(maxAgeMs) { for (const [, b] of [...bots]) if (Date.now() - b.since > maxAgeMs) b.stop(); }
