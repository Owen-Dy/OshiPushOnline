import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { OshiPush, upgradeFits, discardNeed, HAND_LIMIT, sideInf, WIN_SUBS, cardPlayable, playCost, effectsPlayable, fxOf, starsOf, contentBlocked, canPlayAnywhere, canPlayFromTrash, canDiscardAbility, canActivate, personaAbility, canPersonaActivate } from '../game.js';
import { CARDS } from '../cards.js';
import { validateDeck } from '../deckRules.js';

const $ = (id) => document.getElementById(id);
const esc = (s = '') => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const portrait = (window.__portrait = new Set()); // platform art files that are portrait; shown rotated to landscape
const CARD_BACK = 'art/card-back.webp'; // put your own at public/art-web/card-back.webp
const CARD_BACK_FALLBACK = 'art/card-back.svg'; // used until that file exists
const url = (p) => p.split('/').map(encodeURIComponent).join('/'); // handles spaces and ' ! , in names
const img = (src, cls = '') => {
  const fail = src === CARD_BACK ? `this.onerror=null;this.src='${CARD_BACK_FALLBACK}'` : "this.style.visibility='hidden'";
  return `<img class="${cls}" src="${url(src)}" alt="" onerror="${fail}">`;
};
const pile = (n) => `<div class="pile" title="Deck">${img(CARD_BACK)}<span class="count">${n}</span></div>`;
const params = new URLSearchParams(location.search);
const matchID = params.get('match');
let playerID = params.get('player') || '0';
const sandboxMode = params.get('sandbox') === '1';

// ---- Lobby: no match in URL yet ----
if (!matchID) {
  $('lobby').hidden = false;
  $('game').hidden = true;
  $('create').onclick = async () => {
    const res = await fetch('/games/oshi-push/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numPlayers: 2 }),
    });
    const { matchID: id } = await res.json();
    location.search = `?match=${id}&player=0`;
  };
  $('createBot').onclick = async () => {
    $('createBot').disabled = true;
    const res = await fetch('/games/oshi-push/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numPlayers: 2 }),
    });
    if (!res.ok) { $('createBot').disabled = false; alert(await res.text()); return; }
    const { matchID: id } = await res.json();
    const bot = await fetch(`/bot/add?matchID=${encodeURIComponent(id)}&seat=1`, { method: 'POST' }); // the bot takes seat 1
    if (!bot.ok) alert(`The match was created, but the bot could not join: ${await bot.text()}`);
    location.search = `?match=${id}&player=0`;
  };
  if (params.get('dev') === '1') $('createSandbox').hidden = false; // the sandbox button only shows at /?dev=1
  $('createSandbox').onclick = async () => {
    const res = await fetch('/games/oshi-push/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numPlayers: 2, setupData: { sandbox: true } }),
    });
    const { matchID: id } = await res.json();
    location.search = `?match=${id}&player=0&sandbox=1`;
  };
} else {
  startGame();
}

function startGame() {
  $('lobby').hidden = true;
  $('game').hidden = false;
  let other = playerID === '0' ? '1' : '0';
  $('invite').value = `${location.origin}/?match=${matchID}&player=${other}`;
  $('role').textContent = `Player ${playerID}`;

  const client = Client({
    game: OshiPush,
    multiplayer: SocketIO({ server: location.origin }),
    matchID,
    playerID,
  });
  client.start();

  // Nobody in the other seat? Offer the bot. Once someone (or the bot) is there, hide the invite link / the offer.
  const updateBotBox = () => {
    const opp = (client.matchData || []).find((p) => String(p.id) === other);
    const isBot = !!opp && opp.name === 'Bot';
    const hide = sandboxMode || !client.matchData;
    $('invitebox').hidden = hide || isBot;
    $('botbox').hidden = hide || (!!opp?.isConnected && !isBot);
    $('addbot').hidden = isBot || !!opp?.isConnected;
    $('botmsg').textContent = isBot ? 'Your opponent is the bot.' : 'Nobody here yet?';
  };
  $('addbot').onclick = async () => {
    $('addbot').disabled = true;
    const res = await fetch(`/bot/add?matchID=${encodeURIComponent(matchID)}&seat=${other}`, { method: 'POST' });
    $('addbot').disabled = false;
    if (!res.ok) $('botmsg').textContent = await res.text();
  };

  let selected = null; // card id chosen from hand (or from the Trash, see selectedZone)
  let selectedZone = 'hand'; // 'hand' | 'trash': Scary Story Writing can be played from the Trash
  let picked = []; // options ticked in the current multi-pick decision
  let lastChoiceId = null;
  const savedDecks = () => { try { return JSON.parse(localStorage.getItem('oshi-decks') || '[]'); } catch { return []; } };

  const render = (state) => {
    if (!state) { $('phase').textContent = 'connecting…'; return; }
    const { G, ctx } = state;
    const me = G.players[playerID];
    if (me.hand.some((x) => x.hidden)) return; // a state meant for the other player's view
    const activePersona = (pid) => { const u = G.players[pid].upgrades; return u.length ? u[u.length - 1] : G.players[pid].persona; };
    const phase = ctx.phase;
    const need = discardNeed(G, playerID, phase === 'clashResults'); // cards you must still discard
    const busy = G.choices.length > 0; // a decision (pick a card or platform) is waiting
    const curPlat = phase === 'clash' ? G.clashSequence[G.clashIndex] : null; // the platform clashing right now
    const myTurn = (phase === 'content' || phase === 'clash') && ctx.currentPlayer === playerID;
    const typeOK = (c) => phase === 'clash' ? c.type === 'Action' : c.type === 'Content' || c.type === 'Action' || upgradeFits(c, me.persona);
    const myLoc = G.personaLocations[playerID];
    // Can this card be played on platform i right now? zone: 'hand', or 'trash' for cards that say they can be played from the Trash.
    const playableAt = (c, i, zone = 'hand') => {
      if (need > 0 || busy || !myTurn || myLoc === null || !typeOK(c) || (zone === 'trash' && !canPlayFromTrash(c))) return false;
      if (myLoc !== i && !canPlayAnywhere(G, playerID, c)) return false; // Guerrilla Stream, Drop In Call, Clip Out of Context
      if (phase === 'clash' && (i !== curPlat || myLoc !== curPlat)) return false;
      const cost = playCost(G, playerID, c, i);
      return cost <= me.bits && cardPlayable(c, me.persona, phase) && !contentBlocked(G, playerID, c, i) &&
        effectsPlayable(G, playerID, c, i, me.bits - cost) && !(c.type === 'Action' && G.actionLock[playerID]);
    };
    const canPlay = (c, zone = 'hand') => [0, 1, 2].some((i) => playableAt(c, i, zone));
    const chosen = (selectedZone === 'trash' ? me.trash : me.hand).find((c) => c.id === selected);
    if (!chosen || !canPlay(chosen, selectedZone)) selected = null;
    const myDeploy = phase === 'deployment' && ctx.currentPlayer === playerID && myLoc === null;

    const steps = [['deckSelect', 'Deck'], ['mulligan', 'Mulligan'], ['platformSetup', 'Platforms'], ['deployment', 'Deployment'], ['content', 'Content'], ['clash', 'Clash']];
    $('phase').innerHTML = steps.map(([k, n]) => (k === phase || (k === 'clash' && (phase === 'clashResults' || phase === 'clashOrder')) ? `[${n}]` : n)).join(' › ');
    $('round').textContent = G.round;
    $('persona').textContent = activePersona(playerID) ? activePersona(playerID).name : '-';
    $('first').textContent = G.firstPlayer === playerID ? 'You' : 'Opponent';
    $('deck').textContent = `(deck: ${me.deck.length} · platform deck: ${me.platformCards.length} · discard pile: ${me.trash.length} · hand limit ${HAND_LIMIT})`;
    $('bits').textContent = me.bits;
    $('subs').textContent = `${me.subs.toLocaleString()} / ${WIN_SUBS.toLocaleString()}`;
    $('oppsubs').textContent = `${G.players[other].subs.toLocaleString()} / ${WIN_SUBS.toLocaleString()}`;
    // Deck selection: saved decks come from the deck builder (stored in this browser).
    $('deckpick').hidden = phase !== 'deckSelect' && phase !== 'mulligan' && phase !== 'platformSetup';
    if (phase === 'platformSetup') {
      const myTurnNow = ctx.currentPlayer === playerID, top = me.platformCards[0];
      $('deckpick').innerHTML = `<h2>Put down the platforms</h2><p class="meta">The first player puts down a platform, then the second player, then the first player again, until 3 platforms are on the field. Each platform is drawn at random from your platform deck; you choose which empty slot it goes in.</p>` +
        (myTurnNow && top
          ? `<div class="opts"><div class="opt on">${img(top.art, 'optimg')}<span><b>Your platform: ${esc(top.name)}</b><br><small>${top.threshold || '?'} 🌠 · ${(top.subValue || 0).toLocaleString()} subs</small></span></div></div><p class="meta">Choose an empty slot on the field below.</p>`
          : '<p>Waiting for your opponent to put down a platform…</p>');
    } else if (phase === 'mulligan') {
      $('deckpick').innerHTML = me.mulliganDone
        ? `<p>${me.mulliganed ? 'You mulliganed.' : 'You kept your hand.'} Waiting for your opponent…</p>`
        : `<h2>Your starting hand</h2><p class="meta">You start with ${me.bits} Bits (the 💎 on your persona). Keep this hand, or mulligan once: it is shuffled back into your deck and you draw a new hand.</p><button data-keep>Keep hand</button> <button data-mulligan>Mulligan (once)</button>`;
    } else if (phase === 'deckSelect') {
      const byId = new Map(CARDS.map((c) => [c.id, c]));
      $('deckpick').innerHTML = me.deckReady ? '<p>Deck chosen. Waiting for your opponent…</p>' : '<h2>Choose your deck</h2>' +
        savedDecks().map((d, i) => {
          const errs = validateDeck(d, byId);
          const per = byId.get(d.persona);
          return `<div class="deckrow"><b>${esc(d.name)}</b><span class="meta">${per ? esc(per.name) : 'no persona'}</span>` +
            (errs.length ? `<span class="meta" title="${esc(errs.join('; '))}">incomplete</span>` : `<button data-deck="${i}">Use this deck</button>`) + '</div>';
        }).join('') +
        '<p><button data-random>Use a random deck</button> <a href="decks.html" target="_blank">Build or edit decks</a></p>';
    }
    $('turn').textContent =
      phase === 'deckSelect' ? (me.deckReady ? 'Waiting for your opponent to choose a deck…' : 'Choose your deck')
      : phase === 'platformSetup' ? (ctx.currentPlayer === playerID ? 'Your turn: choose an empty slot on the field for the platform drawn from your platform deck' : 'Your opponent is putting down a platform…')
      : phase === 'mulligan' ? (me.mulliganDone ? 'Waiting for your opponent to decide…' : 'Keep your starting hand, or mulligan it (once)')
      : phase === 'clashOrder' ? (G.firstPlayer === playerID ? 'You are the turn player: choose which platform resolves first' : 'Your opponent (the turn player) is choosing which platform resolves first…')
      : phase === 'deployment'
        ? (myDeploy ? 'Your turn: deploy your persona on a platform' : 'Opponent is deploying their persona…')
        : phase === 'content' || phase === 'clash'
          ? ((myTurn ? 'Your turn' : "Opponent's turn") + (phase === 'clash' ? ` - Clash ${G.clashIndex + 1} of 3 at ${G.platforms[curPlat].name}: ` + (G.personaLocations[playerID] === curPlat ? 'play an Action card here or pass' : 'your persona is not here, so you can only pass') : ' - Content phase') + (G.passed[other] ? ' (opponent has passed)' : '') + (G.passed[playerID] ? ' (you have passed)' : '') + (G.autoPass[playerID] ? ' (you are passing for the rest of this phase)' : '') + (G.autoPass[other] ? ' (opponent is passing for the rest of this phase)' : '') + (G.actionLock[playerID] ? ' (your Actions are locked this clash)' : ''))
          : phase === 'clashResults' ? 'Clash resolved' : '';
    if (need > 0) $('turn').textContent = `Discard ${need} card${need > 1 ? 's' : ''}: click the card${need > 1 ? 's' : ''} in your hand that you want to discard`;

    const resultLines = () =>
      G.clashLog.map((e) => {
        const res = e.winner === null ? 'tie, no popularity gained'
          : (e.winner === playerID ? 'you gain popularity' : 'they gain popularity');
        const cap = e.captured ? (e.winner === playerID ? ' and you captured it' : ' and they captured it') + (e.replacedBy ? ` (replaced by ${esc(e.replacedBy)})` : '') : '';
        return `<p><b>${e.name}</b>: you ${e.inf[playerID]} vs them ${e.inf[other]}: ${res}${cap} (pop ${e.pop[playerID]}-${e.pop[other]})${(e.cardRewards || []).map((r) => `<br><span class="meta">Clash Reward: ${esc(r)}</span>`).join('')}${e.reward ? `<br><span class="meta">Clash Reward (${e.winner === playerID ? 'you' : 'opponent'}, ${esc(e.rewardBy)}): ${esc(e.reward)}</span>` : ''}</p>`;
      }).join('');

    // Decisions: pick a card or platform for an effect. Only the player who must choose sees the options.
    const ch = G.choices[0];
    $('choice').hidden = !ch;
    if (ch) {
      if (ch.id !== lastChoiceId) { lastChoiceId = ch.id; picked = []; }
      const platName = (i) => (G.platforms[i] ? G.platforms[i].name : '');
      const whose = (o) => (o.owner === playerID ? 'yours' : "opponent's");
      const optLabel = (o) => o.hidden ? 'a hidden card'
        : o.kind === 'platform' || o.kind === 'option' ? esc(o.name)
        : `${img(o.art, 'optimg')}<span><b>${esc(o.name)}</b>${o.kind === 'persona' ? ' (persona)' : ''}<br><small>${o.owner !== undefined ? `${whose(o)} · ${esc(platName(o.platform))}` : ''}${o.stars !== undefined ? ` · ${o.stars} ⭐` : ''}${o.cost !== undefined ? ` · 🟡${o.cost}` : ''}</small></span>`;
      const single = ch.min === 1 && ch.max === 1;
      const count = ch.min === ch.max ? `${ch.min}` : `${ch.min} to ${ch.max}`;
      $('choice').innerHTML = ch.player === playerID
        ? `<h2>${esc(ch.source)}: your choice</h2><p>${esc(ch.prompt)}</p>${ch.revealed ? `<p class="meta">Revealed: ${esc(ch.revealed.join(', '))}</p>` : ''}` +
          `<div class="opts">${ch.options.map((o) => `<button class="opt${picked.includes(o.key) ? ' on' : ''}" data-opt="${esc(o.key)}">${optLabel(o)}</button>`).join('')}</div>` +
          `<p class="meta">Choose ${count}.</p>` +
          (single ? '' : `<button data-confirm ${picked.length < ch.min || picked.length > ch.max ? 'disabled' : ''}>${picked.length ? 'Confirm' : 'Skip'}</button>`)
        : `<h2>${esc(ch.source)}</h2><p>Waiting for ${ch.player === playerID ? 'you' : 'your opponent'} to choose…</p>`;
    }

    const orderPanel = G.firstPlayer === playerID
      ? '<h2>Choose the clash order</h2><p class="meta">The leftmost or rightmost platform resolves first, then the middle, then the other end.</p>' +
        '<button data-dir="LEFT_TO_RIGHT">Left platform first</button> <button data-dir="RIGHT_TO_LEFT">Right platform first</button>'
      : '<h2>Clash order</h2><p>Waiting for your opponent (the turn player) to choose which platform resolves first…</p>';
    const clashPanel = phase === 'clash'
      ? `<h2>Clash ${G.clashIndex + 1} of 3: ${esc(G.platforms[curPlat].name)}</h2><p class="meta">Order: ${G.clashDirection === 'LEFT_TO_RIGHT' ? 'left to right' : 'right to left'}. Play Action cards on this platform, then both players pass to resolve it.</p>` + resultLines()
      : '';
    $('clash').innerHTML = phase === 'clashOrder' ? orderPanel : phase === 'clash' ? clashPanel : phase !== 'clashResults' ? '' :
      '<h2>Clash results</h2>' +
      `<p class="meta">Resolved ${G.clashDirection === 'LEFT_TO_RIGHT' ? 'left to right' : 'right to left'}, chosen by ${G.clashChooser === playerID ? 'you' : 'your opponent'}.</p>` +
      resultLines() +
      `<button data-ack ${G.clashAcks[playerID] || need > 0 || busy ? 'disabled' : ''}>${G.clashAcks[playerID] ? 'Waiting for opponent…' : busy ? 'Answer the decision above first' : need > 0 ? `Discard ${need} card${need > 1 ? 's' : ''} first (hand limit ${HAND_LIMIT})` : 'Start next round'}</button>`;

    $('platforms').innerHTML = G.platforms.map((p, i) => {
      const tiles = (pid) => [...p.cards[pid], ...p.actions[pid].map((a) => ({ ...a, act: true }))].map((c) => {
        const stars = c.act ? null : starsOf(G, i, pid, c); // what it gives right now, including this round's changes and card text
        const ab = !c.act && pid === playerID ? fxOf(c, 'activate')[0] : null; // "Activate: ..." (once per round)
        const abBtn = ab ? `<button class="ability" data-activate="${esc(c.id)}" ${myTurn && canActivate(G, phase, playerID, c.id) ? '' : 'disabled'} title="${esc(c.text)}">${c.used ? 'Used this round' : `Activate${ab.bits ? ` (${ab.bits}💎)` : ''}`}</button>` : '';
        return `<div class="tile${c.act ? ' act' : ''}${c.used ? ' used' : ''}" title="${esc(c.name)} (${c.act ? c.inf : stars + ' ⭐ now, printed ' + c.inf})${c.text ? ' - ' + esc(c.text) : ''}"><div class="artbox">${img(c.art)}</div><span>${esc(c.name)}</span>${stars !== null ? `<span class="stars">${stars} ⭐</span>` : ''}${abBtn}</div>`;
      }).join('');
      const sum = (pid) => sideInf(G, i, pid);
      const deploy = myDeploy
        ? `<button data-deploy="${i}">Deploy persona here</button>` : '';
      const slotBtn = phase === 'platformSetup' && ctx.currentPlayer === playerID && !p.card ? `<button data-slot="${i}">Put my platform here</button>` : '';
      const sel = chosen && playableAt(chosen, i, selectedZone) ? `<button data-play="${i}">Play ${esc(chosen.name)} here${selectedZone === 'trash' ? ' (from Trash)' : ''} · 🟡${playCost(G, playerID, chosen, i)}</button>` : '';
      const persona = (pid) => {
        const per = activePersona(pid);
        return `<div class="tile persona" title="${esc(per ? per.name : 'Persona')}${per && per.text ? ' - ' + esc(per.text) : ''}"><div class="artbox">${per ? img(per.art) : ''}</div><span>${esc(per ? per.name : 'Persona')}</span></div>`;
      };
      const side = (pid, label) =>
        `<div class="side"><div class="lbl">${label} · ${sum(pid)} inf</div><div class="stack">${G.personaLocations[pid] === i ? persona(pid) : ''}<div class="tiles">${tiles(pid)}</div></div></div>`;
      return `<section class="plat${i === curPlat ? ' now' : ''}">
        ${side(other, 'Opponent')}
        <div class="mid">
          ${!p.card ? '<p class="meta">Empty slot: no platform here yet</p>' : ''}
          ${p.card ? `<div class="platart" title="${esc(p.card.text)}"><img class="${portrait.has(p.card.art) ? 'rot' : ''}" src="${url(p.card.art)}" data-art="${esc(p.card.art)}" alt="" onload="if(this.naturalHeight>this.naturalWidth){window.__portrait.add(this.dataset.art);this.classList.add('rot')}" onerror="this.style.visibility='hidden'"></div>` : ''}
          <h3>${esc(p.name)}${p.type ? ' · ' + esc(p.type) : ''}</h3>
          ${p.card && p.card.text ? `<p class="meta platrule">${esc(p.card.text)}</p>` : ''}
          <p class="meta">Capture at ${p.threshold} pop · ${p.subValue.toLocaleString()} subs</p>
          <p>Pop: you ${p.pop[playerID]} / them ${p.pop[other]}</p>
          ${deploy}${sel}${slotBtn}
        </div>
        ${side(playerID, 'You')}
      </section>`;
    }).join('');

    const cardBtn = (c, attr, on, enabled, extra = '') =>
      `<button class="card${on ? ' on' : ''}${extra}" ${attr}="${esc(c.id)}" ${enabled ? '' : 'disabled'}>
        <div class="artbox">${img(c.art)}</div>
        <b>${esc(c.name)}</b><span>${c.type}</span><span>Cost ${c.xCost ? 'X' : playCost(G, playerID, c, myLoc)}${playCost(G, playerID, c, myLoc) !== c.cost ? ` (was ${c.cost})` : ''} · Inf ${c.inf}</span>${c.text ? `<small class="txt">${esc(c.text)}</small>` : ''}</button>`;
    $('hand').innerHTML = me.hand.map((c) => {
      const ab = fxOf(c, 'discardAbility')[0]; // "Discard: ..." (uses your turn; the card goes to your Trash)
      const abOK = ab && myTurn && canDiscardAbility(G, phase, playerID, c);
      const abBtn = ab ? `<button class="ability" data-discardab="${esc(c.id)}" ${abOK ? '' : 'disabled'} title="${esc(c.text)}">Discard to use its ability</button>` : '';
      return `<div class="cardwrap">${cardBtn(c, 'data-card', c.id === selected && selectedZone === 'hand', need > 0 || canPlay(c), need > 0 ? ' discard' : '')}${abBtn}</div>`;
    }).join('');
    // Cards in your Trash that can be played from there (Scary Story Writing)
    const fromTrash = me.trash.filter(canPlayFromTrash);
    $('trashrow').hidden = !fromTrash.length;
    $('trashplay').innerHTML = fromTrash.map((c) => `<div class="cardwrap">${cardBtn(c, 'data-trashcard', c.id === selected && selectedZone === 'trash', canPlay(c, 'trash'))}</div>`).join('');
    $('mydeck').innerHTML = pile(me.deck.length);
    const opp = G.players[other];
    $('opp').innerHTML = `<span class="meta">Opponent</span>${pile(opp.deck.length)}<div class="minihand">${opp.hand.map(() => img(CARD_BACK, 'cardback')).join('')}</div>`;

    $('pass').disabled = !myTurn || need > 0 || busy;
    const inPlay = phase === 'content' || phase === 'clash';
    const on = !!G.autoPass[playerID];
    $('passall').disabled = !inPlay || (!on && myTurn && (need > 0 || busy));
    $('passall').textContent = on ? 'Pass all: ON (click to stop)' : 'Pass all: OFF';
    $('passall').classList.toggle('on', on);
    const ab = personaAbility(G, playerID); // Sakana's coffee bean, or the Activate ability of your Upgrade
    $('activate').hidden = !ab;
    if (ab) {
      const used = `used ${me.activations}/${ab.limitPerRound ?? 1} this round`;
      $('activate').textContent = ab.effects ? `Activate: ${ab.name}${ab.bits ? ` (${ab.bits} 💎)` : ''} · ${used}` : `Activate: ${ab.name} (+${ab.amount} ⭐, ${used})`;
      $('activate').title = activePersona(playerID)?.text || '';
      $('activate').disabled = !(myTurn && canPersonaActivate(G, playerID));
    }

    // Game over: someone reached the subscriber goal.
    if (ctx.gameover) {
      const w = ctx.gameover.winner;
      const msg = w === undefined ? 'Draw: both players reached the goal with the same subscribers.' : w === playerID ? 'You win!' : 'You lose.';
      $('turn').textContent = `Game over: ${msg}`;
      $('clash').innerHTML = `<h2>${msg}</h2><p>${ctx.gameover.winner === undefined ? '' : (w === playerID ? 'You' : 'Your opponent') + ' reached ' + WIN_SUBS.toLocaleString() + ' subscribers first. '}Final subscribers: you ${me.subs.toLocaleString()}, opponent ${G.players[other].subs.toLocaleString()}.</p><p><a href="/">Back to the start screen</a></p>`;
      for (const id of ['pass', 'passall', 'activate']) $(id).disabled = true;
      $('hand').querySelectorAll('button').forEach((b) => { b.disabled = true; });
    }
  };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.deploy !== undefined) client.moves.deployPersona(Number(t.dataset.deploy));
    if (t.dataset.deck !== undefined) client.moves.submitDeck(savedDecks()[Number(t.dataset.deck)]);
    if (t.dataset.random !== undefined) client.moves.useRandomDeck();
    if (t.dataset.opt !== undefined) {
      const st = client.getState(), cd = st.G.choices[0];
      if (!cd || cd.player !== playerID) return;
      if (cd.min === 1 && cd.max === 1) client.moves.makeChoice([t.dataset.opt]); // one pick: answer at once
      else { picked = picked.includes(t.dataset.opt) ? picked.filter((k) => k !== t.dataset.opt) : [...picked, t.dataset.opt]; render(st); }
    }
    if (t.dataset.confirm !== undefined) { client.moves.makeChoice(picked); picked = []; }
    if (t.dataset.slot !== undefined) client.moves.putPlatform(Number(t.dataset.slot));
    if (t.dataset.ack !== undefined) client.moves.ackClash();
    if (t.dataset.keep !== undefined) client.moves.keepHand();
    if (t.dataset.mulligan !== undefined) client.moves.mulligan();
    if (t.dataset.dir) client.moves.chooseClashOrder(t.dataset.dir);
    if (t.dataset.card) {
      const st = client.getState();
      if (discardNeed(st.G, playerID, st.ctx.phase === 'clashResults') > 0) client.moves.discardCard(t.dataset.card); // you choose what to discard
      else { selected = selected === t.dataset.card && selectedZone === 'hand' ? null : t.dataset.card; selectedZone = 'hand'; render(st); }
    }
    if (t.dataset.trashcard) { selected = selected === t.dataset.trashcard && selectedZone === 'trash' ? null : t.dataset.trashcard; selectedZone = 'trash'; render(client.getState()); }
    if (t.dataset.discardab) client.moves.discardAbility(t.dataset.discardab);
    if (t.dataset.activate) client.moves.activateCard(t.dataset.activate);
    if (t.dataset.play !== undefined) {
      const st = client.getState();
      const zone = selectedZone, card = st.G.players[playerID][zone === 'trash' ? 'trash' : 'hand'].find((x) => x.id === selected);
      let x;
      if (card?.xCost) { // a cost of X: the player chooses how many Bits to spend
        const v = prompt(`${card.name} costs X. How many Bits do you want to spend? (you have ${st.G.players[playerID].bits})`, '1');
        if (v === null) return;
        x = Math.max(0, Math.floor(Number(v) || 0));
      }
      client.moves.playCard(selected, Number(t.dataset.play), x, zone === 'trash' ? 'trash' : undefined);
      selected = null; selectedZone = 'hand';
    }
  });
  $('pass').onclick = () => client.moves.passTurn();
  $('passall').onclick = () => client.moves.togglePassAll();
  $('activate').onclick = () => client.moves.activate();
  // ---- Sandbox: a test match where you can set up any situation. The server only allows these moves in matches
  //      made with "Create sandbox". Debug moves are sent as whoever is on turn; "View as" switches which player you see and play.
  // Each player gets a small helper connection that sends the sandbox's setup and debug moves, so the player you are
  // viewing never has to be switched in the middle of a move.
  const helpers = {};
  const helper = (id) => {
    if (!helpers[id]) { helpers[id] = Client({ game: OshiPush, multiplayer: SocketIO({ server: location.origin }), matchID, playerID: id }); helpers[id].start(); }
    return helpers[id];
  };
  const ready = (id) => { const h = helper(id); return h.getState() ? h : null; }; // a helper can send moves once it has received the game
  if (sandboxMode) { helper('0'); helper('1'); } // connect both helpers right away
  const dbg = (name, ...args) => { // debug moves go out as whoever is on turn
    const st = client.getState(), h = st && ready(st.ctx.currentPlayer);
    if (h) h.moves[name](...args); else $('turn').textContent = 'Sandbox is still connecting, try again in a moment.';
  };
  const switchView = (id) => {
    playerID = id; other = id === '0' ? '1' : '0'; selected = null; selectedZone = 'hand';
    $('role').textContent = `Player ${id}`;
    client.updatePlayerID(id);
    render(client.getState());
  };
  const lastSent = {};
  const sandboxStep = (st) => {
    if (!sandboxMode || !st) return;
    const ph = st.ctx.phase;
    // get through deck choice and the mulligan automatically, one move at a time
    const todo = ['0', '1'].find((id) => (ph === 'deckSelect' && !st.G.players[id].deckReady) || (ph === 'mulligan' && !st.G.players[id].mulliganDone));
    if (todo !== undefined) {
      const key = `${ph}-${todo}`;
      const h = ready(todo);
      if (h && (!lastSent[key] || Date.now() - lastSent[key] > 1500)) { lastSent[key] = Date.now(); h.moves[ph === 'deckSelect' ? 'useRandomDeck' : 'keepHand'](); }
    }
    if (ph === 'platformSetup') { // the sandbox puts platforms down for you: the player on turn uses the first card of their platform deck
      const cur = st.ctx.currentPlayer, h = ready(cur), empty = st.G.platforms.findIndex((p) => !p.card);
      const mine = h && h.getState().G.players[cur].platformCards[0];
      const key = `${ph}-${st.G.platforms.filter((p) => p.card).length}`;
      if (h && mine && empty !== -1 && (!lastSent[key] || Date.now() - lastSent[key] > 1500)) { lastSent[key] = Date.now(); h.moves.putPlatform(empty); }
    }
    $('sandbox').hidden = !st.G.sandbox;
    document.body.classList.toggle('sandbox', !!st.G.sandbox);
    if (st.G.sandbox && !$('sandbox').dataset.built) { $('sandbox').dataset.built = '1'; buildSandbox(); }
  };
  if (sandboxMode) setInterval(() => sandboxStep(client.getState()), 800); // keeps the automatic setup moving even if a move is refused
  const buildSandbox = () => {
    const personas = CARDS.filter((x) => x.type === 'Persona'), upgrades = CARDS.filter((x) => x.type === 'Upgrade');
    const opt = (x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`;
    const group = (type) => `<optgroup label="${type}">${CARDS.filter((x) => x.type === type).map(opt).join('')}</optgroup>`;
    $('sandbox').innerHTML = `<details open><summary><b>Sandbox tools</b> (test match: set up any situation)</summary>
      <div class="sbrow">View and play as: <button data-view="0">Player 0</button> <button data-view="1">Player 1</button>
        &nbsp;·&nbsp; Target player for the tools: <select id="sb-p"><option value="0">Player 0</option><option value="1">Player 1</option></select>
        Platform: <select id="sb-plat"><option value="0">Left</option><option value="1">Middle</option><option value="2">Right</option></select></div>
      <div class="sbrow">Persona: <select id="sb-persona">${personas.map(opt).join('')}</select>
        Upgrade: <select id="sb-up"><option value="">none</option>${upgrades.map(opt).join('')}</select>
        <button data-sb="persona">Set persona and put it on the platform</button> <button data-sb="deploy">Only move the persona to the platform</button></div>
      <div class="sbrow">Quick persona (puts it on the platform):
        ${personas.map((x) => `<button data-quick="${esc(x.id)}">${esc(x.name)}</button>`).join(' ')}</div>
      <div class="sbrow">Card: <select id="sb-card">${group('Action')}${group('Content')}${group('Upgrade')}</select>
        <button data-sb="addhand">Add to hand</button> <button data-sb="addcontent">Put on the platform (Content only)</button>
        <button data-sb="allAction">All Actions to hand</button> <button data-sb="allContent">All Content to hand</button>
        <button data-sb="allUpgrade">All Upgrades to hand</button> <button data-sb="clearhand">Clear hand</button></div>
      <div class="sbrow">Bits <input id="sb-bits" type="number" value="20"> Subs <input id="sb-subs" type="number" placeholder="unchanged">
        <button data-sb="set">Set</button> Popularity on the platform <input id="sb-pop" type="number" value="0"> <button data-sb="pop">Set</button>
        <button data-sb="clearboard">Clear the whole board</button></div>
      <div class="sbrow">Jump to phase: ${['deployment', 'content', 'clashOrder', 'clash', 'clashResults'].map((p) => `<button data-ph="${p}">${p}</button>`).join(' ')}
        &nbsp;·&nbsp; Give the turn to: <button data-turn="0">Player 0</button> <button data-turn="1">Player 1</button></div>
      <p class="meta">Tip: the tools act on the target player. Your hand shows for the player you view, so switch "View and play as" to play that player's cards. Hand limits are not enforced in a sandbox.</p>
    </details>`;
  };
  $('sandbox').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const P = $('sb-p')?.value, plat = Number($('sb-plat')?.value), card = $('sb-card')?.value;
    const num = (id) => { const v = $(id).value; return v === '' ? NaN : Number(v); };
    if (b.dataset.view) switchView(b.dataset.view);
    else if (b.dataset.quick) dbg('dbgSetPersona', P, b.dataset.quick, null, plat);
    else if (b.dataset.ph) dbg('dbgPhase', b.dataset.ph);
    else if (b.dataset.turn) dbg('dbgTurn', b.dataset.turn);
    else if (b.dataset.sb === 'persona') dbg('dbgSetPersona', P, $('sb-persona').value, $('sb-up').value || null, plat);
    else if (b.dataset.sb === 'deploy') dbg('dbgDeploy', P, plat);
    else if (b.dataset.sb === 'addhand') dbg('dbgAddHand', P, card, 1);
    else if (b.dataset.sb === 'addcontent') dbg('dbgAddContent', P, plat, card);
    else if (b.dataset.sb?.startsWith('all')) dbg('dbgAddHandType', P, b.dataset.sb.slice(3));
    else if (b.dataset.sb === 'clearhand') dbg('dbgClearHand', P);
    else if (b.dataset.sb === 'set') dbg('dbgSet', P, num('sb-bits'), num('sb-subs'));
    else if (b.dataset.sb === 'pop') dbg('dbgSetPop', plat, P, num('sb-pop'));
    else if (b.dataset.sb === 'clearboard') dbg('dbgClearBoard');
  });

  client.subscribe((s) => { render(s); sandboxStep(s); updateBotBox(); });
}
