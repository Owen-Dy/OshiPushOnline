import { INVALID_MOVE, ActivePlayers, Stage } from 'boardgame.io/dist/cjs/core.js';
import { CARDS } from './cards.js';
import { validateDeck, randomDeck, nameKey, upgradeFits, normKey } from './deckRules.js';
export { upgradeFits }; // the match screen uses it too

const STARTING_HAND = 5;
export const WIN_SUBS = 1000000; // first player to this many subscribers wins
export const HAND_LIMIT = 7; // checked at the end of every round; extra cards must be discarded
const CARDS_BY_ID = new Map(CARDS.map((c) => [c.id, c]));

// Turn a validated deck into this player's persona, platform cards, shuffled draw pile and opening hand.
const setupPlayer = (G, id, deck, random) => {
  const p = G.players[id];
  p.persona = { ...CARDS_BY_ID.get(deck.persona) };
  p.bits = Number(p.persona.gems) || 0; // you start with the Bits printed on your persona
  p.platformCards = random.Shuffle(deck.platforms.map((cid) => ({ ...CARDS_BY_ID.get(cid) }))); // the platform side deck, shuffled
  const main = random.Shuffle(deck.main.map((cid, i) => ({ ...CARDS_BY_ID.get(cid), id: `p${id}_${i}_${cid}` })));
  p.hand = main.splice(0, STARTING_HAND);
  p.deck = main;
  p.deckReady = true;
};

const other = (pId) => (pId === '0' ? '1' : '0');

// ---- Content card abilities live in card.effects (see card-effects.js). Helpers to read them. ----
// Rules of the Platform card in slot idx (see card-effects.js): platformReward, platformStars, blockPlay, costReduce, onPlayHere, onPersonaMoveHere.
export const platformFx = (G, idx, type) => fxOf(G.platforms[idx]?.card, type);
export const fxOf = (c, type) => (c?.effects || []).filter((fx) => fx.type === type);
const genreIs = (c, genre) => normKey(c.genre) === normKey(genre);
// An Independent platform is one with no rules text on it.
const isIndependent = (G, idx) => !(G.platforms[idx]?.card?.text || '').trim();
const dominating = (G, id, idx) => G.platforms[idx].cards[id].length > G.platforms[idx].cards[other(id)].length; // more Content than the opponent here
const locate = (G, cardId) => {
  for (let i = 0; i < 3; i++) for (const id of ['0', '1']) { const card = G.platforms[i].cards[id].find((c) => c.id === cardId); if (card) return { idx: i, owner: id, card }; }
  return null;
};
const keyOfCard = (G, card) => { const l = card ? locate(G, card.id) : null; return l ? `c|${l.idx}|${l.owner}|${card.id}` : null; };
const clashingNow = (G) => (G.phase === 'clash' && G.clashIndex < 3 ? G.clashSequence[G.clashIndex] : null); // the platform whose clash is happening
// "Your opponents can't gain 🌠 here" (Year 0 Science): can `id` gain popularity on platform idx?
const popBlocked = (G, idx, id) => G.platforms[idx].cards[other(id)].some((c) => fxOf(c, 'noOppPop').length) || !!G.platforms[idx].noPop?.[id]; // Boymode: noPop
// Content that can't be played right now: Puzzling Puzzle (🟡5+ here) and Craft Show (1 Content per round).
export const contentBlocked = (G, id, card, idx) => {
  if (card.type !== 'Content') return false;
  for (const oid of ['0', '1']) for (const c of G.platforms[idx].cards[oid]) {
    for (const fx of fxOf(c, 'blockPlay')) {
      if (fx.costMin !== undefined && card.cost >= fx.costMin) return true; // Puzzling Puzzle
      if (fx.costMax !== undefined && card.cost <= fx.costMax && (!fx.oppOnly || oid !== id)) return true; // Nail Painting: only your opponents
    }
    if (oid === id && fxOf(c, 'blockOtherContent').length) return true; // Caught in 4k: you can't play other Content here
    if (fxOf(c, 'onePerRoundHere').length && (G.platforms[idx].playedHere?.[id] || 0) >= 1) return true; // Brain Rot: 1 Content per player per round here
  }
  if (fxOf(card, 'noPlayWithContent').length && G.platforms[idx].cards[id].length > 0) return true; // Morning Voice Stream
  for (const fx of platformFx(G, idx, 'blockPlay')) if (card.cost >= fx.costMin) return true; // Michiru's Cabin
  const craft = G.platforms.some((pl) => ['0', '1'].some((o) => pl.cards[o].some((c) => fxOf(c, 'oneContentPerRound').length)));
  return craft && G.players[id].played.Content >= 1;
};
// Stars a card gives from its own text: "This card gains +3 ⭐ while ...", and other cards' auras ("All other Content cards lose -3 ⭐").
const cardBonus = (G, idx, owner, c) => {
  const p = G.platforms[idx], opp = other(owner);
  let total = 0;
  for (const fx of fxOf(c, 'selfStars')) {
    const w = fx.when || {};
    if (w.dominating && !dominating(G, owner, idx)) continue;
    if (w.noOppPop && p.pop[opp] > 0) continue;
    if (w.independent && !isIndependent(G, idx)) continue;
    if (w.onlyContent && p.cards[owner].length !== 1) continue;
    if (w.oppHandAtLeast !== undefined && G.players[opp].hand.length < w.oppHandAtLeast) continue;
    if (w.firstPlayer && G.firstPlayer !== owner) continue; // Tomboy Abs
    if (w.handAtLeast !== undefined && G.players[owner].hand.length < w.handAtLeast) continue; // Good Boy
    if (w.contentEverywhere && !G.platforms.every((pl) => pl.cards[owner].length > 0)) continue; // Casual Misogyny
    let n = 1;
    if (fx.per === 'hand') n = G.players[owner].hand.length;
    else if (fx.per === 'otherCheapContent') n = p.cards[owner].filter((o) => o.id !== c.id && o.cost <= (fx.costMax ?? 3)).length;
    else if (fx.per === 'otherContentHere') n = p.cards[owner].filter((o) => o.id !== c.id).length; // Crystal Dragon Memories
    else if (fx.per === 'trash') n = G.players[owner].trash.length; // Hot Sauce Karaoke
    else if (fx.per === 'oppHand') n = G.players[opp].hand.length; // Toilet Swimmer
    else if (fx.per === 'otherPlatformsContent') n = G.platforms.filter((pl, j) => j !== idx && pl.cards[owner].length > 0).length; // Wanna Hear a Joel-ke?
    else if (fx.per === 'otherPlatformsGenre') n = G.platforms.filter((pl, j) => j !== idx && pl.cards[owner].some((o) => genreIs(o, fx.genre))).length;
    total += fx.amount * n;
  }
  if (fxOf(c, 'selfStarsPersona').length) total += personaStarsOf(G, owner); // Bug Burger Cooking Stream: this card's ⭐ equal your Persona's
  for (const oid of ['0', '1']) for (const a of p.cards[oid]) for (const fx of fxOf(a, 'aura')) {
    if (fx.affects === 'otherAll' && a.id !== c.id) total += fx.amount;
    else if (fx.affects === 'opp' && oid !== owner) total += fx.amount;
    else if (fx.affects === 'otherOwn' && oid === owner && a.id !== c.id) total += fx.amount;
  }
  return total;
};
// The ⭐ a Content card gives right now (printed + this-round changes + its own and other cards' text).
export const starsOf = (G, idx, owner, c) => {
  const p = G.platforms[idx];
  // Cinema Date: during the clash here, while its owner is Dominating, the opposing Content gives no ⭐.
  if (clashingNow(G) === idx && p.cards[other(owner)].some((o) => fxOf(o, 'oppZeroWhenDominating').length) && dominating(G, other(owner), idx)) return 0;
  return Math.max(0, c.inf + (c.mod || 0) + cardBonus(G, idx, owner, c));
};

// Kickback: a reward you get when you LOSE a clash at the platform this Content card is on.
// (Gold Farming only has it while you have another Poggers Content card in play.)
const kickbackFor = (G, owner, card) => {
  let n = 0;
  for (const fx of fxOf(card, 'kickback')) {
    const w = fx.when;
    if (w?.otherGenre && !G.platforms.some((p) => p.cards[owner].some((c) => c.id !== card.id && genreIs(c, w.otherGenre)))) continue;
    n += fx.amount;
  }
  return n;
};
// A Content card leaves the board: to the Trash ('trash'), a hand ('hand') or the top of its owner's deck ('deckTop').
const leaveCard = (G, owner, idx, card, dest = 'trash') => {
  const arr = G.platforms[idx].cards[owner], k = arr.findIndex((c) => c.id === card.id);
  if (k === -1) return false;
  const [c] = arr.splice(k, 1);
  delete c.mod; delete c.used;
  const pl = G.players[owner];
  if (dest === 'hand') pl.hand.push(c); else if (dest === 'deckTop') pl.deck.unshift(c); else pl.trash.push(c);
  return true;
};
// Deleting goes through here so Rent Free (can't be deleted) and Puzzle Hand Cam (returns to hand instead) work everywhere.
// `by` = the player whose effect deletes it (Pro Gamer protects a player's other Content from an OPPOSING player's effects).
const deleteCard = (G, owner, idx, card, by) => {
  if (fxOf(card, 'undeletable').length && G.platforms.every((pl) => pl.cards[owner].length > 0)) return false;
  if (by !== undefined && by !== owner && G.platforms[idx].cards[owner].some((o) => o.id !== card.id && fxOf(o, 'protectOthers').length)) return false;
  const back = fxOf(card, 'returnInsteadOfDelete')[0]; // to: 'deckTop' (Horror Game Stream); otherwise it goes back to its owner's hand
  return leaveCard(G, owner, idx, card, back ? back.to || 'hand' : 'trash');
};

// ---- Persona / Upgrade passive abilities ("While you have 0 💎: ... gains +3 ⭐") ----
const passiveHolds = (G, id, idx, cond) => {
  const player = G.players[id], content = G.platforms[idx].cards[id];
  if (cond.bitsEq !== undefined) return player.bits === cond.bitsEq;
  if (cond.contentAtLeast !== undefined) return content.filter((c) => cond.costMax === undefined || c.cost <= cond.costMax).length >= cond.contentAtLeast;
  if (cond.contentExactly !== undefined) return content.length === cond.contentExactly;
  if (cond.handAtLeast !== undefined) return player.hand.length >= cond.handAtLeast;
  return false;
};
const passiveBonus = (G, id, idx) => {
  let total = 0;
  for (const ps of activePersona(G, id)?.passives || []) {
    if (ps.kind === 'while' && passiveHolds(G, id, idx, ps.cond)) total += ps.amount;
    else if (ps.kind === 'perContentPlatform') total += ps.amount * G.platforms.filter((pl) => pl.cards[id].length > 0).length;
  }
  return total;
};
// The ⭐ a player's Persona has right now, on whichever platform it stands (0 if it has not been deployed).
const personaStarsOf = (G, id) => {
  const loc = G.personaLocations[id];
  return loc == null ? 0 : Math.max(0, (activePersona(G, id)?.inf || 0) + passiveBonus(G, id, loc) + platformBonus(G, loc, id) + G.platforms[loc].pmods[id]);
};
// Stars `id` has on platform `idx`: persona (stars + passives + this-round changes) plus Content and Action cards.
export const sideInf = (G, idx, id) => {
  const p = G.platforms[idx];
  const persona = G.personaLocations[id] === idx ? Math.max(0, (activePersona(G, id)?.inf || 0) + passiveBonus(G, id, idx) + platformBonus(G, idx, id) + p.pmods[id]) : 0;
  const content = p.cards[id].reduce((t, c) => t + starsOf(G, idx, id, c), 0); // c.mod: stars added this round; plus the card's own text
  // "While you are Dominating this Platform: you gain +3 ⭐ at each adjacent Platform" (Vaseline On Toast): LEFT-CENTER-RIGHT are neighbours in a row
  let adjacent = 0;
  for (const j of [idx - 1, idx + 1]) if (j >= 0 && j <= 2) for (const c of G.platforms[j].cards[id]) for (const fx of fxOf(c, 'adjacentStars')) if (!fx.when?.dominating || dominating(G, id, j)) adjacent += fx.amount;
  return persona + Math.max(0, p.mods[id] + content + adjacent + p.actions[id].reduce((t, c) => t + c.inf, 0));
};

// "While you have at least 1 Content card on every Platform: your Persona gains +5 ⭐ on this Platform" (Pippa's Quarters)
const platformBonus = (G, idx, id) => platformFx(G, idx, 'platformStars').reduce((t, fx) => (fx.when?.contentEverywhere && !G.platforms.every((pl) => pl.cards[id].length > 0) ? t : t + fx.amount), 0);

// Put a Platform card into a platform slot (its threshold, subscriber value and art).
const applyPlatformCard = (p, card) => {
  if (!p.slot) p.slot = p.name; // remember LEFT / CENTER / RIGHT
  p.name = card.name;
  p.type = card.tags || card.genre || p.type;
  p.threshold = card.threshold || p.threshold;
  p.subValue = card.subValue || p.subValue;
  p.card = { id: card.id, name: card.name, art: card.art, text: card.text, effects: card.effects || [] };
};

// If `id` has enough popularity on platform idx they capture it: subscribers, loser compensation, platform reset.
const captureIfReady = (G, idx, id) => {
  const p = G.platforms[idx];
  if (p.pop[id] < p.threshold) return false;
  const loser = other(id);
  G.players[id].subs += p.subValue;
  G.players[loser].bits += p.pop[loser]; // loser compensation
  p.pop = { 0: 0, 1: 0 };
  for (const owner of ['0', '1']) { // Content on a captured platform goes to its owner's Trash; Rent Free stays in play
    const everywhere = G.platforms.every((pl) => pl.cards[owner].length > 0);
    for (const c of [...p.cards[owner]]) if (!(fxOf(c, 'undeletable').length && everywhere)) leaveCard(G, owner, idx, c, 'trash');
  }
  // The captured platform is replaced by a random card from the side deck of the player who did NOT get the subscribers
  // (the side decks are shuffled when the game starts, so the top card is a random one). With none left, it stays.
  const next = G.players[loser].platformCards.shift();
  if (next) applyPlatformCard(p, next);
  return true;
};

// Resolve the clash on one platform: compare stars, award popularity, Clash Reward, captures.
function resolveOne(G, idx) {
  const p = G.platforms[idx];
  const sum = (id) => sideInf(G, idx, id);
  const entry = { name: p.name, inf: { 0: sum('0'), 1: sum('1') }, winner: null, captured: false, pop: null };

  if (p.forceWin || entry.inf[0] !== entry.inf[1]) {
    const winner = p.forceWin || (entry.inf[0] > entry.inf[1] ? '0' : '1'); // forceWin: "you win this clash" (Pinata, Bonus Three Inches)
    // Scary Yandere Roleplay: gain 1 🌠 per card in your opponents' hands instead of 1. Year 0 Science: the loser's side can stop the gain.
    let gain = 1;
    if (p.cards[winner].some((c) => fxOf(c, 'popReplace').length)) gain = G.players[other(winner)].hand.length;
    if (!popBlocked(G, idx, winner)) p.pop[winner] += gain;
    entry.winner = winner;
    // Kickback: the loser's Content cards here pay out for losing the clash.
    const loser = other(winner);
    const kick = p.cards[loser].reduce((t, c) => t + kickbackFor(G, loser, c), 0);
    if (kick) { G.players[loser].bits += kick; entry.kickback = kick; entry.kickbackBy = loser; }
    // Persona Clash Reward: the persona's owner won the clash on the platform where the persona is.
    const per = activePersona(G, winner);
    const printed = per?.clashReward ? { effects: per.clashReward, text: per.clashRewardText } : fxOf(per, 'clashReward')[0]; // Mrs. Worldwide's is written by hand
    if (printed && G.personaLocations[winner] === idx) {
      for (const fx of printed.effects) applyEffect(G, winner, idx, fx);
      entry.reward = printed.text || '';
      entry.rewardBy = per.name;
    }
    // Clash Rewards a card gave the persona for this round (I'll Crush You!). Same trigger as the printed one.
    const given = G.personaLocations[winner] === idx ? G.roundRewards?.[winner] || [] : [];
    for (const r of given) {
      for (const fx of r.effects) applyEffect(G, winner, idx, fx, { source: r.source });
      entry.reward = [entry.reward, `${r.source}: ${r.text}`].filter(Boolean).join(' ');
      entry.rewardBy = per?.name;
    }
    const granted = [];
    for (const r of platformFx(G, idx, 'platformReward')) { // the Platform's own Clash Reward goes to whoever won the clash here
      for (const fx of r.effects) applyEffect(G, winner, idx, fx, { source: p.name });
      granted.push(`${p.name}: ${r.text || ''}`);
    }
    for (const c of [...p.cards[winner]]) {
      const rewards = [];
      if (c.clashReward) rewards.push({ effects: c.clashReward, text: c.clashRewardText }); // given by an Action (Sponsorship)
      for (const r of fxOf(c, 'clashReward')) if (conditionHolds(G, winner, idx, r.if)) rewards.push(r); // printed on the card
      for (const r of rewards) {
        for (const fx of r.effects) applyEffect(G, winner, idx, fx, { source: c.name, self: c });
        granted.push(`${c.name}: ${r.text || ''}`);
      }
    }
    if (granted.length) entry.cardRewards = granted;
    entry.pop = { ...p.pop };
    entry.captured = captureIfReady(G, idx, winner);
    if (entry.captured && G.platforms[idx].name !== entry.name) entry.replacedBy = G.platforms[idx].name;
  } else {
    entry.pop = { ...p.pop };
  }
  return entry;
}

// The persona's current card: the most recent Upgrade played on it, or the base Persona card.
// Upgrades replace the persona's stars and abilities (the base persona's NAME is still used for "If your Persona is X").
const activePersona = (G, id) => {
  const ups = G.players[id].upgrades;
  return ups.length ? ups[ups.length - 1] : G.players[id].persona;
};

// Card effects (stars and bits only). "bits" is what the sheet calls 💎.
const conditionHolds = (G, me, idx, cond) =>
  !cond ||
  ((!cond.persona || nameKey(G.players[me].persona?.name) === nameKey(cond.persona)) &&
    (!cond.independent || (idx != null && isIndependent(G, idx))) &&
    (!cond.platformTag || (cond.platformTag.toLowerCase() === 'independent' ? idx != null && isIndependent(G, idx) : (G.platforms[idx]?.type || '').toLowerCase().includes(cond.platformTag.toLowerCase()))) && // Independent = no rules text
    // Dominating = you have more Content cards than your opponent on this platform
    (!cond.dominating || (idx != null && dominating(G, me, idx))) &&
    (!cond.upgraded || G.players[me].upgrades.length > 0) &&
    (!cond.popBehind || (idx != null && G.platforms[idx].pop[other(me)] > G.platforms[idx].pop[me])) && // Joystick User: the opponent has more 🌠 here
    (!cond.contentEverywhere || G.platforms.every((pl) => pl.cards[me].length > 0)) && // Bonus Three Inches
    (!cond.oppPersonaHere || (idx != null && G.personaLocations[other(me)] === idx)) && // Queen Status
    (cond.starsLead === undefined || (idx != null && sideInf(G, idx, me) - sideInf(G, idx, other(me)) >= cond.starsLead)));

const applyEffect = (G, me, idx, fx, extra) => {
  if (!conditionHolds(G, me, idx, fx.if)) return;
  if (CHOICE_EFFECTS.includes(fx.type)) { startChoice(G, me, idx, fx, extra); return; }
  const who = fx.target === 'opponent' ? (me === '0' ? '1' : '0') : me;
  if (fx.type === 'bits') {
    G.players[who].bits = Math.max(0, G.players[who].bits + fx.amount);
  } else if (fx.type === 'personaInf') {
    const loc = G.personaLocations[who];
    let amt = fx.upgradedAmount !== undefined && G.players[who].upgrades.length ? fx.upgradedAmount : fx.amount || 0; // e.g. In Character
    if (fx.perContent) amt += fx.perContent * G.platforms.reduce((t, pl) => t + pl.cards[who].length, 0); // Unique Laughing Sounds: per Content card you have in play
    if (fx.perPopPlatform) amt += fx.perPopPlatform * G.platforms.filter((pl) => pl.pop[who] > 0).length; // Date Your Mom: per platform where you have 🌠
    if (fx.perOppHand) amt += fx.perOppHand * G.players[other(who)].hand.length; // Intended Flash: per card in your opponents' hands
    if (loc !== null && (who === me || idx == null || loc === idx)) G.platforms[loc].pmods[who] += amt; // "opposing" = the platform your Persona is on
  } else if (fx.type === 'personaInfSet') {
    // Bring the persona's current stars to fx.value; later gains still add on top.
    const loc = G.personaLocations[who];
    if (loc !== null && (who === me || idx == null || loc === idx)) {
      const p = G.platforms[loc];
      p.pmods[who] += fx.value - Math.max(0, (activePersona(G, who)?.inf || 0) + p.pmods[who]);
    }
  } else if (fx.type === 'discard') {
    requireDiscard(G, who, fx.amount);
  } else if (fx.type === 'draw') {
    let n = fx.perContentPlatform ? fx.amount * G.platforms.filter((pl) => pl.cards[who].length > 0).length : fx.amount;
    if (fx.perDominating) n = fx.amount * G.platforms.filter((pl, j) => dominating(G, who, j)).length; // Throbbing Egghead
    if (fx.untilHand !== undefined) n = Math.max(0, fx.untilHand - G.players[who].hand.length); // Soulslike Notes: draw until you have N cards
    for (let i = 0; i < n; i++) {
      const drawn = G.players[who].deck.shift();
      if (drawn) G.players[who].hand.push(drawn);
    }
  } else if (fx.type === 'costReduction') {
    // applied when the card is played (see playCost)
  } else if (fx.type === 'contentDiscount') {
    G.players[who].contentDiscount += fx.amount; // the next Content card you play costs this much less
  } else if (fx.type === 'contentInfAll') {
    const amt = fx.personaAmount && nameKey(G.players[me].persona?.name) === nameKey(fx.personaAmount.persona) ? fx.personaAmount.amount : fx.amount;
    for (const pl of G.platforms) for (const id of ['0', '1']) for (const c of pl.cards[id]) if (normKey(c.genre).startsWith(normKey(fx.genre))) c.mod = (c.mod || 0) + amt;
  } else if (fx.type === 'deleteContent') {
    const hit = (c) => (fx.costMin === undefined || c.cost >= fx.costMin) && (!fx.genreNot || normKey(c.genre) !== normKey(fx.genreNot)) && !(fx.excludeSelf && c.id === extra?.self?.id);
    G.platforms.forEach((pl, i) => {
      if (fx.scope === 'here' && i !== idx) return;
      for (const id of ['0', '1']) {
        if (fx.owner === 'mine' && id !== me) continue;
        for (const c of pl.cards[id].filter((c) => hit(c) && (fx.starsMax === undefined || starsOf(G, i, id, c) <= fx.starsMax))) deleteCard(G, id, i, c, me); // deleted cards go to their owner's Trash (Vine Boom: starsMax)
      }
    });
  } else if (fx.type === 'returnContent') {
    for (let i = 0; i < 3; i++) for (const id of ['0', '1']) for (const c of [...G.platforms[i].cards[id]]) leaveCard(G, id, i, c, 'hand');
  } else if (fx.type === 'gainPop') {
    if (popBlocked(G, idx, who)) return;
    G.platforms[idx].pop[who] += fx.amount;
    captureIfReady(G, idx, who);
  } else if (fx.type === 'stealPop') {
    if (popBlocked(G, idx, who)) return;
    const p = G.platforms[idx], opp = other(who), n = Math.min(fx.amount, p.pop[opp]);
    p.pop[opp] -= n;
    p.pop[who] += n;
    captureIfReady(G, idx, who);
  } else if (fx.type === 'selfMod') {
    if (extra?.self) extra.self.mod = (extra.self.mod || 0) + fx.amount; // "this card gains +N ⭐ this round"
  } else if (fx.type === 'bitsPer') {
    G.players[who].bits += fx.amount * G.platforms.filter((pl, j) => pl.cards[who].length > 0 && !(fx.other && j === idx)).length; // per platform where you have Content (other: not counting this one, Blockheads Big Adventure!)
  } else if (fx.type === 'winClash') {
    if (!G.platforms[idx].forceWin) G.platforms[idx].forceWin = me; // you win the clash on this platform, whatever the ⭐
  } else if (fx.type === 'noPopThisClash') {
    (G.platforms[idx].noPop ||= { 0: false, 1: false })[other(me)] = true; // Boymode: your opponent can't gain 🌠 from this clash
  } else if (fx.type === 'discardOppDraw') {
    const o = other(me), n = Math.min(fx.amount, G.players[o].hand.length); // Remove Ball-Jointed Head: they discard, you draw one per card discarded
    requireDiscard(G, o, fx.amount);
    applyEffect(G, me, idx, { type: 'draw', target: 'self', amount: n });
  } else if (fx.type === 'oppContentCostRound') {
    (G.costUp ||= { 0: 0, 1: 0 })[other(me)] += fx.amount; // Fashionista: your opponent's Content costs more to play this round
  } else if (fx.type === 'anyPlatformThisRound') {
    G.anyPlatform[who] = true; // Clip Out of Context: play Content on other platforms as though your Persona were there
  } else if (fx.type === 'movePersonaHere') {
    moveRef(G, { persona: true, owner: who }, idx);
  } else if (fx.type === 'revealTopCost') {
    const top = G.players[who].deck[0]; // Burned Toast Tart: this card gains ⭐ equal to the 🟡 of the top card (it stays on top)
    if (top && extra?.self) extra.self.mod = (extra.self.mod || 0) + (Number(top.cost) || 0);
  } else if (fx.type === 'actionLock') {
    G.actionLock[who] = true;
  } else if (fx.type === 'contentInf') {
    G.platforms[idx].mods[who] += fx.amount * G.platforms[idx].cards[who].length; // cards present now
  } else if (fx.type === 'personaReward') {
    // "For this round, your Persona gains: Clash Reward: ..." Stored on the game (not the card) so it survives Upgrades.
    (G.roundRewards[who] = G.roundRewards[who] || []).push({ effects: fx.effects, text: fx.text || '', source: extra?.source || '' });
  }
};

// Discarding: whenever a card is discarded for any reason, the player chooses which one.
// Effects only record how many cards a player owes; the player then picks them with discardCard.
const requireDiscard = (G, who, n) => { G.pendingDiscard[who] += n; };
// How many cards `id` still has to discard. At the end of a round (enforceLimit) the hand limit counts too.
export const discardNeed = (G, id, enforceLimit) => {
  const size = G.players[id].hand.length;
  const pending = Math.min(G.pendingDiscard[id], size);
  return pending + (enforceLimit && !G.sandbox ? Math.max(0, size - pending - HAND_LIMIT) : 0);
};
const discardCard = ({ G, ctx, playerID }, cardId) => {
  if (discardNeed(G, playerID, ctx.phase === 'clashResults') <= 0) return INVALID_MOVE;
  const hand = G.players[playerID].hand;
  const i = hand.findIndex((c) => c.id === cardId);
  if (i === -1) return INVALID_MOVE;
  G.players[playerID].trash.push(...hand.splice(i, 1));
  if (G.pendingDiscard[playerID] > 0) G.pendingDiscard[playerID] -= 1;
};

// Action cards whose text says "only during a clash" can't be played in the Content phase.
// "Play only if your Persona is X" and "only during a clash / the Content phase" (read from the card text by the importer).
export const cardPlayable = (card, persona, phase) => {
  const po = card.playOnly || {};
  // "Discard: ... Use only during a clash." (Upgrades, Spooky Town ...) limits the ability, not playing the card (see canDiscardAbility)
  const abilityTimed = (card.effects || []).some((fx) => (fx.type === 'discardAbility' || fx.type === 'activate' || fx.type === 'personaActivate') && fx.timing);
  const timing = abilityTimed ? undefined : po.timing || (/(?:only|on) during a clash/i.test(card.text || '') ? 'clash' : undefined);
  if (po.persona && !(persona && nameKey(persona.name) === nameKey(po.persona))) return false;
  if (timing === 'clash' && phase !== 'clash') return false;
  if (timing === 'content' && phase !== 'content') return false;
  return true;
};
// Some cards can only be played if their effect can be carried out (Watchalong needs a Content card you can play).
// bitsAfter = the Bits you would have left after paying for the card itself.
export const effectsPlayable = (G, id, card, idx, bitsAfter) => {
  for (const fx of card.effects || []) {
    if (fx.type !== 'playHand') continue;
    const player = G.players[id];
    const can = player.hand.some((c) => c.id !== card.id && c.type === 'Content' && cardPlayable(c, player.persona, 'content') && !contentBlocked(G, id, c, idx) && playCost(G, id, c, idx) <= bitsAfter);
    if (!can) return false;
  }
  return true;
};
// What a card costs this player right now (some cards cost less for certain personas, Freeze Spit discounts the next Content card).
export const playCost = (G, id, card, idx) => {
  let cost = card.cost;
  const at = idx ?? G.personaLocations[id];
  for (const fx of card.effects || []) if (fx.type === 'costReduction' && conditionHolds(G, id, at, fx.if)) cost -= fx.amount;
  if (card.type === 'Content') {
    cost -= G.players[id].contentDiscount;
    cost += G.costUp?.[id] || 0; // Fashionista: Content costs more this round
    for (const fx of card.effects || []) if (fx.type === 'selfCostPerContent') cost -= fx.amount * G.platforms.reduce((t, pl) => t + pl.cards[id].length, 0); // Sigma Alpha Dominant
    if (at != null) {
      for (const fx of platformFx(G, at, 'costReduce')) cost -= fx.amount; // Lia's Network
      for (const oc of G.platforms[at].cards[other(id)]) for (const fx of fxOf(oc, 'oppCostUp')) cost += fx.amount; // Math Stream
      G.platforms.forEach((pl, j) => { if (j !== at) for (const c of pl.cards[id]) for (const fx of fxOf(c, 'contentDiscountOther')) cost -= fx.amount; }); // Clip Out of Context
    }
  } else if (card.type === 'Action' && at != null && clashingNow(G) === at && cost > 0) {
    for (const c of G.platforms[at].cards[id]) for (const fx of fxOf(c, 'actionDiscount')) cost = Math.max(fx.min ?? 1, cost - fx.amount); // Speedrun
  }
  if (card.type === 'Action' && at != null && clashingNow(G) === at) for (const oc of G.platforms[at].cards[other(id)]) for (const fx of fxOf(oc, 'actionCostUp')) cost += fx.amount; // Trash Talk
  return Math.max(0, cost);
};

// Play a card if canPlay(card) allows it in the current phase. Content cards stay on the platform;
// Action cards count for one clash only. Only cost and influence are applied; other effects are ignored.
// Put a card that is being played onto the board and run what it does. (Cost and hand removal are the caller's job.)
// "When you play a Content/Action card ...": abilities on Content cards you have in play that react to a card being played.
const fireTriggers = (G, who, idx, played, event) => {
  const clash = G.phase === 'clash';
  for (let i = 0; i < 3; i++) for (const holder of [...G.platforms[i].cards[who]]) for (const trig of fxOf(holder, 'onPlay')) {
    if (trig.event !== event) continue;
    if (trig.here && i !== idx) continue;
    if (holder.id === played.id && !trig.includeSelf) continue;
    if (trig.during === 'clash' && !clash) continue;
    if (trig.minCost !== undefined && !(played.cost >= trig.minCost)) continue;
    if (trig.genre && !genreIs(played, trig.genre)) continue;
    for (const t of trig.then) {
      // pick.starsLtPlayed: "with less ⭐ than the Content card you just played"
      const fx = t.pick?.starsLtPlayed ? { ...t, pick: { ...t.pick, starsLt: starsOf(G, idx, who, played) } } : t;
      applyEffect(G, who, i, fx, { source: holder.name, self: holder, played });
    }
  }
};
const firePlatformTriggers = (G, who, idx, played, event) => {
  const p = G.platforms[idx];
  for (const fx of platformFx(G, idx, 'onPlayHere')) {
    if (fx.event !== event || (fx.during === 'clash' && G.phase !== 'clash')) continue;
    if (fx.once) { p.used = p.used || {}; const k = `${fx.once}:${who}`; if (p.used[k]) continue; p.used[k] = true; } // "the first time ..." (once per round)
    for (const t of fx.then) applyEffect(G, who, idx, t, { source: p.name, self: played, played });
  }
};
const placeCard = (G, playerID, card, platformIndex, extra) => {
  if (card.type === 'Upgrade') G.players[playerID].upgrades.push(card); // goes on top of your persona
  else G.platforms[platformIndex][card.type === 'Content' ? 'cards' : 'actions'][playerID].push(card);
  if (card.type === 'Content') { const ph = (G.platforms[platformIndex].playedHere ||= { 0: 0, 1: 0 }); ph[playerID] += 1; } // Brain Rot
  for (const fx of card.effects || []) applyEffect(G, playerID, platformIndex, fx, { ...extra, self: card });
  if (card.type === 'Action' || card.type === 'Content') {
    const played = G.players[playerID].played;
    const first = played[card.type] === 0;
    played[card.type] += 1;
    if (first) {
      for (const ps of activePersona(G, playerID)?.passives || []) {
        if (ps.kind !== 'firstPlay' || ps.play !== card.type) continue;
        G.platforms[platformIndex].pmods[playerID] += ps.amount; // "gains +N this round"
        if (ps.draw) applyEffect(G, playerID, platformIndex, { type: 'draw', target: 'self', amount: ps.draw });
      }
    }
    fireTriggers(G, playerID, platformIndex, card, card.type === 'Content' ? 'content' : 'action');
    firePlatformTriggers(G, playerID, platformIndex, card, card.type === 'Content' ? 'content' : 'action');
  }
};

export const canPlayAnywhere = (G, id, card) => card.type === 'Content' && (fxOf(card, 'playAnywhere').length > 0 || !!G.anyPlatform?.[id]);

// An Action with a "playFromTrash" effect may be played from the Trash too ("You may play this card from your Trash").
export const canPlayFromTrash = (card) => card.type === 'Action' && (card.effects || []).some((fx) => fx.type === 'playFromTrash');

// x: for cards with a cost of X, how many Bits the player chooses to spend.
// from: 'trash' plays the card from your Trash instead of your hand (only cards that say they can be).
const playCard = (canPlay) => ({ G, ctx, playerID, events }, cardId, platformIndex, x, from) => {
  if (G.choices.length) return INVALID_MOVE; // answer the pending decision first
  if (ctx.phase === 'clash' && platformIndex !== G.clashSequence[G.clashIndex]) return INVALID_MOVE; // only the platform clashing now
  if (discardNeed(G, playerID, false) > 0) return INVALID_MOVE; // choose your discards first
  if (![0, 1, 2].includes(platformIndex)) return INVALID_MOVE;
  const player = G.players[playerID];
  const fromTrash = from === 'trash';
  const zone = fromTrash ? player.trash : player.hand;
  const i = zone.findIndex((c) => c.id === cardId);
  if (i === -1) return INVALID_MOVE;
  const card = zone[i];
  if (!canPlay(card)) return INVALID_MOVE;
  if (fromTrash && !canPlayFromTrash(card)) return INVALID_MOVE;
  if (!cardPlayable(card, player.persona, ctx.phase)) return INVALID_MOVE; // persona and timing restrictions
  if (card.type === 'Upgrade' && !upgradeFits(card, G.players[playerID].persona)) return INVALID_MOVE;
  if (card.type === 'Action' && G.actionLock[playerID]) return INVALID_MOVE; // e.g. Chew on Cables
  const spent = card.xCost ? Math.max(0, Math.floor(Number(x) || 0)) : 0;
  const cost = card.xCost ? spent : playCost(G, playerID, card, platformIndex);
  if (player.bits < cost) return INVALID_MOVE;
  // Cards can only be played on the platform where your Persona is (unless the card or Clip Out of Context says otherwise).
  const anywhere = canPlayAnywhere(G, playerID, card);
  if (G.personaLocations[playerID] !== platformIndex && !(anywhere && G.personaLocations[playerID] !== null)) return INVALID_MOVE;
  if (contentBlocked(G, playerID, card, platformIndex)) return INVALID_MOVE; // Puzzling Puzzle, Craft Show
  if (!effectsPlayable(G, playerID, card, platformIndex, player.bits - cost)) return INVALID_MOVE; // e.g. Watchalong with no Content to play
  player.bits -= cost;
  if (card.type === 'Content') player.contentDiscount = 0; // a one-time discount is used up
  zone.splice(i, 1);
  placeCard(G, playerID, card, platformIndex, { x: spent, source: card.name });
  if (fromTrash) { // "put it on the bottom of your deck after resolving it" (it does not stay on the board)
    const acts = G.platforms[platformIndex].actions[playerID];
    const k = acts.findIndex((c) => c.id === card.id);
    if (k !== -1) acts.splice(k, 1);
    player.deck.push(card);
  }
  G.passed = { 0: false, 1: false }; // any play cancels earlier passes
  G.autoPass[playerID] = false;
  if (G.choices.length) G.afterChoices = { actor: playerID }; // the turn ends once every decision is made
  else endMyTurn(G, playerID, events);
};

// "Pass all": a player who passes for the rest of the phase is skipped; their opponent keeps taking actions.
// (A player who still owes a discard is not skipped, because they have a choice to make.)
const skippable = (G, id) => G.autoPass[id] && discardNeed(G, id, false) === 0;
const endMyTurn = (G, playerID, events) => {
  const opp = other(playerID);
  if (skippable(G, opp)) { G.passed[opp] = true; return; } // opponent is passing: my turn continues
  events.endTurn();
};

// Content phase pass. With all=true you also pass automatically for the rest of the phase.
const contentPass = (all) => ({ G, playerID, events }) => {
  if (discardNeed(G, playerID, false) > 0 || G.choices.length) return INVALID_MOVE;
  if (all) G.autoPass[playerID] = true;
  G.passed[playerID] = true;
  if (skippable(G, other(playerID))) G.passed[other(playerID)] = true;
  if (!(G.passed['0'] && G.passed['1'])) events.endTurn(); // otherwise both passed and the phase ends
};

// Clash phase pass: when both players pass, the current platform resolves and the next platform's clash begins.
// Windows where nobody wants to act (everyone is passing all) resolve straight away.
const clashPassMove = (all) => ({ G, playerID, events }) => {
  if (discardNeed(G, playerID, false) > 0 || G.choices.length) return INVALID_MOVE;
  if (all) G.autoPass[playerID] = true;
  G.passed[playerID] = true;
  if (skippable(G, other(playerID))) G.passed[other(playerID)] = true;
  if (!(G.passed['0'] && G.passed['1'])) { events.endTurn(); return; }
  for (;;) {
    G.clashLog.push(resolveOne(G, G.clashSequence[G.clashIndex]));
    G.clashIndex += 1;
    G.passed = { 0: false, 1: false };
    if (G.players['0'].subs >= WIN_SUBS || G.players['1'].subs >= WIN_SUBS) return; // the game is over
    if (G.clashIndex >= 3) return; // all three done: the phase ends
    const first = G.firstPlayer, second = other(first);
    if (skippable(G, first) && skippable(G, second)) { G.passed = { 0: true, 1: true }; continue; }
    if (skippable(G, first)) { G.passed[first] = true; events.endTurn({ next: second }); return; }
    events.endTurn({ next: first }); // every platform's clash starts with the turn player
    return;
  }
};

// "Pass all" is a toggle. Switched on during your turn it passes now and keeps passing; switched on while your
// opponent is acting it just marks you to be skipped. Switching it off lets you act again.
const togglePassAll = (passMove) => (args) => {
  const { G, ctx, playerID } = args;
  if (G.autoPass[playerID]) {
    G.autoPass[playerID] = false;
    G.passed[playerID] = false; // a pass that was made for you automatically no longer counts
    return;
  }
  if (ctx.currentPlayer === playerID) return passMove(true)(args);
  G.autoPass[playerID] = true;
};
// Turn setup for the Content and Clash phases: the current player has the phase moves; the other player can only toggle Pass all.
const inPlayTurns = (passMove) => ({
  ...alternatingTurns,
  activePlayers: { currentPlayer: Stage.NULL, others: 'sitting' },
  stages: { sitting: { moves: { togglePassAll: togglePassAll(passMove), makeChoice } } },
});

// ACTIVATE: an ability on your persona you can use on your turn (counts as your action for the turn).
// The Activate ability of your Persona (or its Upgrade). Sakana's coffee bean is the old +N ⭐ kind; Upgrades use `personaActivate` effects.
export const personaAbility = (G, id) => {
  const card = activePersona(G, id);
  return fxOf(card, 'personaActivate')[0] || card?.activate || null;
};
export const canPersonaActivate = (G, id) => {
  const ab = personaAbility(G, id), loc = G.personaLocations[id], me = G.players[id];
  if (!ab || loc === null || abilityBlocked(G, id)) return false;
  if (me.activations >= (ab.limitPerRound ?? 1)) return false;
  if (ab.limitTotal && me.activationsTotal >= ab.limitTotal) return false;
  return !ab.effects || (me.bits >= (ab.bits || 0) && ab.effects.every((fx) => feasible(G, id, loc, fx, null)));
};
const activate = ({ G, playerID, events }) => {
  if (!canPersonaActivate(G, playerID)) return INVALID_MOVE;
  const ab = personaAbility(G, playerID), loc = G.personaLocations[playerID], me = G.players[playerID];
  if (ab.effects) {
    me.bits -= ab.bits || 0;
    for (const fx of ab.effects) applyEffect(G, playerID, loc, fx, { source: ab.name });
  } else G.platforms[loc].pmods[playerID] += ab.amount;
  me.activations += 1;
  me.activationsTotal += 1;
  G.passed = { 0: false, 1: false };
  G.autoPass[playerID] = false;
  finishAction(G, playerID, events);
};

// ---- Content card abilities you use on your turn ----
// "Discard: ..." (from your hand) and "Activate: ..." (a Content card in play, once per round). Each counts as your action for the turn.
const finishAction = (G, playerID, events) => {
  if (G.choices.length) G.afterChoices = { actor: playerID }; // the turn ends once every decision is made
  else endMyTurn(G, playerID, events);
};
// Can this effect actually do something right now? (An ability isn't used up on an effect that would fizzle.)
const feasible = (G, me, idx, fx, card) => {
  const opp = other(me);
  switch (fx.type) {
    case 'revealTopCost': case 'lookTrashHand': return G.players[me].deck.length > 0;
    case 'oppMovePop': return G.platforms[idx].pop[opp] >= 1;
    case 'personaInf': return G.personaLocations[me] !== null;
    case 'movePersonaHere': return G.personaLocations[me] !== null && G.personaLocations[me] !== idx;
    case 'pickCard': return cardOptions(G, me, idx, { ...fx.pick, selfId: card?.id }).length > 0;
    case 'playTrashSpend': return trashSpendOptions(G, me, G.personaLocations[me] ?? idx, fx).length > 0;
    case 'playTrashAction': return G.personaLocations[me] !== null && trashActionOptions(G, me, G.personaLocations[me], fx).length > 0;
    default: return true;
  }
};
const abilityBlocked = (G, id) => G.choices.length > 0 || discardNeed(G, id, false) > 0;
// Can this hand card's "Discard: ..." ability be used right now (phase and card rules only; whose turn it is is checked by the game)?
export const canDiscardAbility = (G, phase, id, card) => {
  const ab = fxOf(card, 'discardAbility')[0];
  if (!ab || abilityBlocked(G, id) || (ab.timing && ab.timing !== phase) || !cardPlayable(card, G.players[id].persona, phase)) return false; // e.g. "Use only during a clash"
  const idx = phase === 'clash' ? G.clashSequence[G.clashIndex] : G.personaLocations[id]; // "this Platform" = the platform clashing now
  return idx != null && ab.effects.every((fx) => feasible(G, id, idx, fx, card));
};
// Can this Content card in play be Activated right now?
export const canActivate = (G, phase, id, cardId) => {
  const at = locate(G, cardId);
  if (!at || at.owner !== id) return false;
  const ab = fxOf(at.card, 'activate')[0];
  if (!ab || at.card.used || abilityBlocked(G, id) || (ab.timing && ab.timing !== phase)) return false; // once per round
  return G.players[id].bits >= (ab.bits || 0) && ab.effects.every((fx) => feasible(G, id, at.idx, fx, at.card));
};
const discardAbility = ({ G, ctx, playerID, events }, cardId) => {
  const me = G.players[playerID], i = me.hand.findIndex((c) => c.id === cardId);
  if (i === -1 || !canDiscardAbility(G, ctx.phase, playerID, me.hand[i])) return INVALID_MOVE;
  const card = me.hand[i], ab = fxOf(card, 'discardAbility')[0];
  const idx = ctx.phase === 'clash' ? G.clashSequence[G.clashIndex] : G.personaLocations[playerID];
  me.hand.splice(i, 1);
  me.trash.push(card);
  for (const fx of ab.effects) applyEffect(G, playerID, idx, fx, { source: card.name, self: card });
  G.passed = { 0: false, 1: false };
  G.autoPass[playerID] = false;
  finishAction(G, playerID, events);
};
const activateCard = ({ G, ctx, playerID, events }, cardId) => {
  if (!canActivate(G, ctx.phase, playerID, cardId)) return INVALID_MOVE;
  const { idx, card } = locate(G, cardId), ab = fxOf(card, 'activate')[0], me = G.players[playerID];
  me.bits -= ab.bits || 0;
  card.used = true;
  if (ab.selfTo) leaveCard(G, playerID, idx, card, ab.selfTo); // "Return this card to your hand / the top of your deck" is part of the cost
  for (const fx of ab.effects) applyEffect(G, playerID, idx, fx, { source: card.name, self: card });
  G.passed = { 0: false, 1: false };
  G.autoPass[playerID] = false;
  finishAction(G, playerID, events);
};

const alternatingTurns = {
  order: {
    first: ({ G }) => Number(G.firstPlayer),
    next: ({ ctx }) => (ctx.playOrderPos + 1) % ctx.numPlayers,
  },
};
const resetPassed = ({ G }) => {
  G.passed = { 0: false, 1: false };
  G.autoPass = { 0: false, 1: false }; // 'Pass all' lasts until the phase ends
};
const bothPassed = ({ G }) => G.passed['0'] && G.passed['1'];

// ---- Choices: effects that need a player to pick cards or platforms. They queue up and are answered one by one. ----
const pushChoice = (G, ch, front = false) => {
  const full = { id: G.choiceSeq++, min: 1, max: 1, ...ch };
  if (front) G.choices.unshift(full); else G.choices.push(full);
};
const platformOptions = (G, list) => list.map((i) => ({ key: String(i), kind: 'platform', platform: i, name: G.platforms[i].name }));
const zoneOption = (prefix, c) => ({ key: `${prefix}|${c.id}`, kind: 'card', name: c.name, art: c.art, cost: c.cost });
// Content (and optionally Persona) cards on the board that match `pick`.
const cardOptions = (G, me, idx, pick) => {
  const out = [];
  G.platforms.forEach((p, i) => {
    if (pick.platform !== undefined && i !== pick.platform) return;
    if (pick.scope === 'here' && i !== idx) return;
    if (pick.scope === 'other' && i === idx) return;
    if (pick.platformMinContent !== undefined && p.cards['0'].length + p.cards['1'].length < pick.platformMinContent) return; // No Prep, No Problem
    if (pick.scope === 'adjacent' && Math.abs(i - idx) !== 1) return; // CUSTODY BATTLE: a neighbouring platform
    for (const id of ['0', '1']) {
      if ((pick.owner === 'mine' && id !== me) || (pick.owner === 'opp' && id === me)) continue;
      for (const c of p.cards[id]) {
        if (pick.costMax !== undefined && c.cost > pick.costMax) continue;
        if (pick.costMin !== undefined && c.cost < pick.costMin) continue;
        if (pick.affordable && c.cost > G.players[me].bits) continue; // Toxic Gaming: you spend its 🟡
        if (pick.genreNot && genreIs(c, pick.genreNot)) continue;
        if (pick.excludeSelf && c.id === pick.selfId) continue;
        const stars = starsOf(G, i, id, c);
        if (pick.starsMax !== undefined && stars > pick.starsMax) continue;
        if (pick.starsLt !== undefined && stars >= pick.starsLt) continue;
        if (pick.costLtHand && !(c.cost < G.players[me].hand.length)) continue;
        const key = `c|${i}|${id}|${c.id}`;
        if (key === pick.exclude) continue;
        out.push({ key, kind: 'card', name: c.name, art: c.art, owner: id, platform: i, cost: c.cost, stars });
      }
      if (pick.persona && G.personaLocations[id] === i && `p|${id}` !== pick.exclude) {
        const per = activePersona(G, id);
        out.push({ key: `p|${id}`, kind: 'persona', name: per.name, art: per.art, owner: id, platform: i });
      }
    }
  });
  return out;
};
const refOf = (G, key) => {
  const [t, a, b, c] = key.split('|');
  if (t === 'p') return { persona: true, owner: a };
  if (t !== 'c') return null;
  const card = G.platforms[Number(a)]?.cards[b].find((x) => x.id === c);
  return card ? { card, idx: Number(a), owner: b } : null;
};
const removeFromPlatform = (G, ref) => { const arr = G.platforms[ref.idx].cards[ref.owner]; arr.splice(arr.indexOf(ref.card), 1); };
// Move a Content card (or a Persona, taking its this-round star changes with it) to another platform.
const moveRef = (G, ref, dest) => {
  if (ref.persona) {
    const from = G.personaLocations[ref.owner];
    if (from === null || from === dest) return;
    G.platforms[dest].pmods[ref.owner] += G.platforms[from].pmods[ref.owner];
    G.platforms[from].pmods[ref.owner] = 0;
    G.personaLocations[ref.owner] = dest;
    for (const fx of platformFx(G, dest, 'onPersonaMoveHere')) for (const t of fx.then) applyEffect(G, ref.owner, dest, t, { source: G.platforms[dest].name });
    for (const c of [...G.platforms[dest].cards[ref.owner]]) for (const fx of fxOf(c, 'onPersonaMoveHere')) for (const t of fx.then) applyEffect(G, ref.owner, dest, t, { source: c.name, self: c }); // VTuber HR
    return;
  }
  removeFromPlatform(G, ref);
  G.platforms[dest].cards[ref.owner].push(ref.card);
};
const refKey = (ref, dest) => (ref.persona ? `p|${ref.owner}` : `c|${dest}|${ref.owner}|${ref.card.id}`);

// ---- "Look at the top N cards, play 1 Content card from them, put the rest back on top in any order" (I'll Crush You!) ----
// The cards looked at are held in the choice (`stash`, `hold`) and hidden from the opponent (see playerView).
// Order of events: pick the card -> order the others -> they go back on top -> choose the platform -> play it.
const lookDests = (G, id, card) => [0, 1, 2].filter((i) => playCost(G, id, card, i) <= G.players[id].bits && !contentBlocked(G, id, card, i));
const finishLook = (G, actor, idx, source, ordered, held) => {
  const player = G.players[actor];
  player.deck.unshift(...ordered); // first in the list ends up on top
  if (!held) return;
  const dests = lookDests(G, actor, held);
  if (!dests.length) { player.deck.unshift(held); return; } // can't be paid for anywhere: it stays on top
  pushChoice(G, {
    actor, player: actor, idx, source, kind: 'platform', secret: true, options: platformOptions(G, dests), hold: { held },
    prompt: `${source}: play ${held.name} on which platform? (you pay its 🟡)`, action: { do: 'lookPlay2' },
  }, true);
};
const askOrder = (G, actor, idx, source, remaining, ordered, held) => {
  if (remaining.length <= 1) return finishLook(G, actor, idx, source, [...ordered, ...remaining], held);
  pushChoice(G, {
    actor, player: actor, idx, source, kind: 'card', secret: true, options: remaining.map((c) => zoneOption('r', c)), stash: remaining, hold: { ordered, held },
    prompt: `${source}: put the other cards back on top of your deck. Choose the card to go ${ordered.length === 0 ? 'on top' : 'next'}`, action: { do: 'lookOrder' },
  }, true);
};

const trashSpendOptions = (G, me, dest, fx) => G.players[me].trash.filter((c) => c.type === 'Content' && !c.xCost && (!fx.genre || genreIs(c, fx.genre)) && c.cost <= G.players[me].bits && cardPlayable(c, G.players[me].persona, 'content') && !contentBlocked(G, me, c, dest));
const trashActionOptions = (G, me, dest, fx) => G.players[me].trash.filter((c) => c.type === 'Action' && c.cost <= fx.costMax && !G.actionLock[me] && cardPlayable(c, G.players[me].persona, G.phase) && (G.phase !== 'clash' || dest === clashingNow(G)));

// Start the decision(s) an effect needs. Nothing is asked if there is nothing to choose from.
const startChoice = (G, me, idx, fx, extra = {}) => {
  const persona = G.players[me].persona, opp = other(me), player = G.players[me];
  const is = (name) => nameKey(persona?.name) === nameKey(name);
  const base = { actor: me, player: me, idx, source: extra.source || '', prompt: fx.prompt || 'Choose' };
  const ask = (more, front) => pushChoice(G, { ...base, ...more }, front);
  switch (fx.type) {
    case 'pickCard': { const options = cardOptions(G, me, idx, { ...fx.pick, selfId: extra.self?.id }); if (options.length) ask({ ...(fx.chooser === 'opp' ? { player: opp } : {}), kind: 'card', options, min: fx.optional ? 0 : 1, action: fx.then }); break; } // chooser: 'opp' = your opponent makes the choice (Kiss, Marry, Kill)
    case 'pullOppPop': { // Oversized Thighs: move 1 opposing 🌠 from another platform to this one
      const from = [0, 1, 2].filter((i) => i !== idx && G.platforms[i].pop[opp] >= 1);
      if (from.length && !popBlocked(G, idx, opp)) ask({ kind: 'platform', options: platformOptions(G, from), action: { do: 'pullOppPop' } });
      break;
    }
    case 'returnOrDeleteSelf': { // Boy Failure: return another of your Content cards here to your hand; if you cannot, delete this card
      const options = cardOptions(G, me, idx, { scope: 'here', owner: 'mine', excludeSelf: true, selfId: extra.self?.id });
      if (options.length) ask({ kind: 'card', options, action: { do: 'return' } });
      else if (extra.self) deleteCard(G, me, idx, extra.self, me);
      break;
    }
    case 'bearWithMe': { const options = cardOptions(G, me, idx, { scope: 'here', owner: 'any' }); if (options.length) ask({ kind: 'card', options, action: { do: 'bear1' } }); break; }
    case 'potion': { const options = cardOptions(G, me, idx, { scope: 'here', owner: 'any', persona: true }); if (options.length) ask({ kind: 'card', options, action: { do: 'potion1', bonus: fx.bonusPersona } }); break; }
    case 'noShow': {
      const n = Math.max(0, extra.x || 0);
      for (let i = 0; i < n; i++) {
        const options = cardOptions(G, me, idx, { scope: 'here', owner: 'opp' });
        if (!options.length) break;
        ask({ kind: 'card', options, prompt: `${fx.prompt} (${i + 1} of ${n})`, action: { do: 'mod', amount: -3 } });
      }
      break;
    }
    case 'revealPick': {
      const revealed = player.deck.splice(0, fx.count || 4);
      const n = fx.nIf && is(fx.nIf.persona) ? fx.nIf.n : fx.n;
      const acts = revealed.filter((c) => c.type === (fx.pickType || 'Action'));
      if (!acts.length) { if (fx.rest === 'trash') player.trash.push(...revealed); else player.deck.push(...revealed); break; } // fx.rest: 'trash' = the others are discarded (Off the Raelz)
      ask({ kind: 'card', options: acts.map((c) => zoneOption('r', c)), min: Math.min(n, acts.length), max: n, stash: revealed, revealed: revealed.map((c) => c.name), action: { do: 'revealPick', rest: fx.rest } });
      break;
    }
    case 'playHand': {
      const options = player.hand.filter((c) => c.type === 'Content' && cardPlayable(c, persona, 'content') && !contentBlocked(G, me, c, idx) && playCost(G, me, c, idx) <= player.bits).map((c) => zoneOption('h', c));
      if (options.length) ask({ kind: 'card', options, secret: true, action: { do: 'playHand' } }); // you must play one
      break;
    }
    case 'playTrash': {
      const options = player.trash.filter((c) => c.type === 'Content' && c.cost <= fx.maxTotal && cardPlayable(c, persona, 'content') && !contentBlocked(G, me, c, idx)).map((c) => zoneOption('t', c));
      if (options.length) ask({ kind: 'card', options, min: 0, max: 99, action: { do: 'playTrash', maxTotal: fx.maxTotal } });
      break;
    }
    case 'trashToHand': {
      const options = player.trash.filter((c) => fx.any || c.type === 'Content').map((c) => zoneOption('t', c)); // fx.any: Encore Performance takes any card
      const max = fx.maxIf && is(fx.maxIf.persona) ? fx.maxIf.max : fx.max;
      if (options.length) ask({ kind: 'card', options, min: Math.min(fx.min || 0, options.length, max), max, action: { do: 'trashToHand' } });
      break;
    }
    case 'discardDraw': {
      if (!player.hand.length) { applyEffect(G, me, idx, { type: 'draw', target: 'self', amount: fx.draw }); break; }
      ask({ kind: 'card', options: player.hand.map((c) => zoneOption('h', c)), secret: true, action: { do: 'discardDraw', draw: fx.draw } });
      break;
    }
    case 'lookPlay': {
      const revealed = player.deck.splice(0, fx.count || 3);
      if (!revealed.length) break;
      const options = revealed.filter((c) => c.type === 'Content' && !c.xCost && cardPlayable(c, persona, 'content') && lookDests(G, me, c).length).map((c) => zoneOption('r', c));
      const src = extra.source || fx.source || 'Look at the top cards';
      if (!options.length) { askOrder(G, me, idx, src, revealed, [], null); break; } // nothing to play: just put them back
      ask({ kind: 'card', options, min: 0, max: 1, secret: true, stash: revealed, source: src, prompt: `${src}: you may play 1 Content card from the top ${revealed.length} cards of your deck`, action: { do: 'lookPlay1' } });
      break;
    }
    case 'moveSelf': { // move this Content card to another platform (Depressed Single Divorced Fathers, Sus Gameplay, Mukbang ASMR)
      const at = extra.self ? locate(G, extra.self.id) : null;
      if (at) ask({ kind: 'platform', options: platformOptions(G, [0, 1, 2].filter((i) => i !== at.idx)), min: fx.optional ? 0 : 1, action: { do: 'moveSelf', key: keyOfCard(G, extra.self) } });
      break;
    }
    case 'oppMovePop': { // Disruption Stream: your OPPONENT moves one of their 🌠 from this platform and picks where it goes
      const dests = [0, 1, 2].filter((i) => i !== idx && !popBlocked(G, i, opp));
      if (G.platforms[idx].pop[opp] >= 1 && dests.length) ask({ player: opp, kind: 'platform', options: platformOptions(G, dests), prompt: `${base.source}: move 1 of your 🌠 from ${G.platforms[idx].name} to which platform?`, action: { do: 'movePop', mode: 'narrative' } });
      break;
    }
    case 'gainPopOther': { // Long Game: gain 1 🌠 on another platform
      const dests = [0, 1, 2].filter((i) => i !== idx && !popBlocked(G, i, me));
      if (dests.length) ask({ kind: 'platform', options: platformOptions(G, dests), action: { do: 'gainPopAt' } });
      break;
    }
    case 'moveOppAll': { // Thriller Story Reading: move all opposing Content from here to another platform
      if (G.platforms[idx].cards[opp].length) ask({ kind: 'platform', options: platformOptions(G, [0, 1, 2].filter((i) => i !== idx)), action: { do: 'moveOppAll' } });
      break;
    }
    case 'playHandFree': { // Pippa The Rippa / Soul Exciting!: play a cheap Content card from your hand for free (to: 'other' = to another platform, Chirpper)
      const dests = (c) => fx.to === 'other' ? [0, 1, 2].filter((i) => i !== idx && !contentBlocked(G, me, c, i)) : contentBlocked(G, me, c, idx) ? [] : [idx];
      const options = player.hand.filter((c) => c.type === 'Content' && !c.xCost && c.cost <= fx.costMax && cardPlayable(c, persona, 'content') && dests(c).length).map((c) => zoneOption('h', c));
      if (options.length) ask({ kind: 'card', options, min: 0, secret: true, action: { do: 'playHandFree', to: fx.to } });
      break;
    }
    case 'payThen': { // "You may pay 2 💎 to draw 1 card" (Nasa's Dream)
      if (player.bits >= fx.bits) ask({ kind: 'option', options: [{ key: 'yes', kind: 'option', name: fx.label }], min: 0, action: { do: 'payThen', bits: fx.bits, effects: fx.effects } });
      break;
    }
    case 'merchStars': { // Phase Warehouse: +1 ⭐ per piece of Phase Connect merch you are wearing (honor system, declared once per round)
      if (player.merch != null) { applyEffect(G, me, idx, { type: 'personaInf', target: 'self', amount: player.merch }); break; }
      ask({ kind: 'option', options: Array.from({ length: 11 }, (_, n) => ({ key: String(n), kind: 'option', name: `${n} piece${n === 1 ? '' : 's'}` })),
        prompt: `${base.source}: how many pieces of Phase Connect merch are you wearing right now? (honor system, counted for the whole round; your Persona gains +1 ⭐ each)`, action: { do: 'merch' } });
      break;
    }
    case 'copyPlatformReward': { // Bobby Bobby: copy the Clash Reward of another Platform in play
      const list = [0, 1, 2].filter((i) => i !== idx && platformFx(G, i, 'platformReward').some((r) => !r.effects.some((e) => e.type === 'copyPlatformReward')));
      if (list.length === 1) { for (const r of platformFx(G, list[0], 'platformReward')) for (const e of r.effects) applyEffect(G, me, idx, e, { source: base.source }); }
      else if (list.length) ask({ kind: 'platform', options: platformOptions(G, list), prompt: `${base.source}: copy the Clash Reward of which platform?`, action: { do: 'copyReward' } });
      break;
    }
    case 'moveOwnContent': { // Sketch Book: you may move 1 of your Content cards from this platform to another platform
      const options = cardOptions(G, me, idx, { scope: 'here', owner: 'mine', excludeSelf: fx.excludeSelf, selfId: extra.self?.id }); // excludeSelf: "another 1 of your Content cards" (Robot Vacuum, In Your Walls)
      if (options.length) ask({ kind: 'card', options, min: 0, action: { do: 'moveOwn1' } });
      break;
    }
    case 'playTrashSpend': { // Cover Song: spend X 💎 to play a Content card with 🟡X from your Trash
      const dest = G.personaLocations[me] ?? idx;
      const options = trashSpendOptions(G, me, dest, fx).map((c) => zoneOption('t', c));
      if (options.length) ask({ kind: 'card', options, min: 0, action: { do: 'playTrashSpend', dest } });
      break;
    }
    case 'playTrashAction': { // Halloween Special: play an Action card with 🟡3 or less from your Trash for free
      const dest = G.personaLocations[me];
      const options = dest == null ? [] : trashActionOptions(G, me, dest, fx).map((c) => zoneOption('t', c));
      if (options.length) ask({ kind: 'card', options, min: 0, action: { do: 'playTrashAction', dest } });
      break;
    }
    case 'lookTrashHand': { // Requested Song Stream: look at the top 2; 1 goes to the Trash, the other to your hand
      const revealed = player.deck.splice(0, fx.count || 2);
      if (!revealed.length) break;
      ask({ kind: 'card', options: revealed.map((c) => zoneOption('r', c)), secret: true, stash: revealed, prompt: `${base.source}: choose the card to put in your Trash (the other goes to your hand)`, action: { do: 'lookTrashHand' } });
      break;
    }
    case 'movePersona': {
      const here = G.personaLocations[me];
      const options = platformOptions(G, [0, 1, 2].filter((i) => i !== here));
      if (here !== null) ask({ kind: 'platform', options, min: 0, action: { do: 'movePersona' } });
      break;
    }
    case 'movePop': {
      const others = [0, 1, 2].filter((i) => i !== idx);
      const list = fx.from === 'other' ? others.filter((i) => G.platforms[i].pop[me] >= 1) : G.platforms[idx].pop[opp] >= 1 ? others : [];
      if (list.length) ask({ kind: 'platform', options: platformOptions(G, list), min: fx.optional ? 0 : 1, action: { do: 'movePop', mode: fx.from === 'other' ? 'gaslight' : 'narrative' } }); // optional: "you may" (Convulsive Movement)
      break;
    }
    case 'euclaseFrost': { // Euclase Frost: move any number of your Content cards with 🟡4 or less from this platform to other platforms
      const options = cardOptions(G, me, idx, { scope: 'here', owner: 'mine', costMax: fx.costMax ?? 4 });
      if (options.length) ask({ kind: 'card', options, min: 0, max: options.length, action: { do: 'euclase1' } });
      break;
    }
    case 'ashBlast': { // Ash Blasting: look at an opponent's hand and discard 1 card from it
      const options = G.players[opp].hand.map((c) => zoneOption('o', c));
      if (options.length) ask({ kind: 'card', options, secret: true, action: { do: 'ashBlast' } });
      break;
    }
    case 'hardPivot': { // Hard Pivot: discard any number of cards, then draw that many
      if (player.hand.length) ask({ kind: 'card', options: player.hand.map((c) => zoneOption('h', c)), min: 0, max: player.hand.length, secret: true, action: { do: 'hardPivot' } });
      break;
    }
    case 'waifuWheel': { // Waifu Wheel: you may put any 2 cards from your hand on top of your deck
      if (player.hand.length) ask({ kind: 'card', options: player.hand.map((c) => zoneOption('h', c)), min: 0, max: Math.min(2, player.hand.length), secret: true, action: { do: 'waifu1' },
        prompt: `${base.source}: you may put up to 2 cards from your hand on top of your deck` });
      break;
    }
    case 'beMoreCultured': { // Be More Cultured: reveal the top card; return an opposing Content card with 🟡 equal or less than it
      const top = player.deck[0];
      if (!top) break;
      const options = cardOptions(G, me, idx, { scope: 'here', owner: 'opp', costMax: top.cost }); // "opposing" = on the platform your Persona is on
      if (options.length) ask({ kind: 'card', options, revealed: [top.name], prompt: `${base.source}: you revealed ${top.name} (🟡${top.cost}). Return an opposing Content card with 🟡${top.cost} or less to its owner's hand`, action: { do: 'return' } });
      break;
    }
    case 'playTop': { // Lonely MILF: look at the top card of your deck. You may play it (paying its 🟡)
      const top = player.deck[0];
      if (!top) break;
      const playable = ['Content', 'Action'].includes(top.type) && !top.xCost && cardPlayable(top, persona, G.phase)
        && (top.type === 'Content' ? !contentBlocked(G, me, top, idx) : !G.actionLock[me] && (G.phase !== 'clash' || idx === clashingNow(G)));
      const cost = top.xCost ? null : playCost(G, me, top, idx);
      const canPay = cost !== null && cost <= player.bits;
      const what = `${top.name} (${top.type}${cost === null ? '' : `, 🟡${cost}`})`;
      const options = [];
      if (playable && canPay) options.push({ key: 'yes', kind: 'option', name: `Play ${top.name} (🟡${cost})` });
      options.push({ key: 'no', kind: 'option', name: playable && canPay ? 'Leave it on top of your deck' : 'OK (it stays on top of your deck)' });
      const why = !playable ? "It can't be played right now" : !canPay ? `You can't pay for it (you have 🟡${player.bits})` : 'You may play it (paying its 🟡)';
      ask({ kind: 'option', secret: true, options, min: 1, max: 1, prompt: `${base.source}: the top card of your deck is ${what}. ${why}.`, action: { do: 'playTop' } });
      break;
    }
    case 'moveAll': {
      const list = [0, 1, 2].filter((i) => i !== idx && G.platforms[i].cards[me].length > 0);
      if (list.length) ask({ kind: 'platform', options: platformOptions(G, list), action: { do: 'moveAll' } });
      break;
    }
    default: break;
  }
};
const CHOICE_EFFECTS = ['euclaseFrost', 'ashBlast', 'hardPivot', 'waifuWheel', 'beMoreCultured', 'playTop', 'pullOppPop', 'returnOrDeleteSelf', 'pickCard', 'lookPlay', 'payThen', 'merchStars', 'copyPlatformReward', 'moveOwnContent', 'moveSelf', 'oppMovePop', 'gainPopOther', 'moveOppAll', 'playHandFree', 'playTrashSpend', 'playTrashAction', 'lookTrashHand', 'bearWithMe', 'potion', 'noShow', 'revealPick', 'playHand', 'playTrash', 'trashToHand', 'discardDraw', 'movePersona', 'movePop', 'moveAll'];

// Carry out the player's answer.
const runChoice = (G, ch, keys) => {
  const a = ch.action, actor = ch.actor, opp = other(actor), player = G.players[actor];
  const refs = () => keys.map((k) => refOf(G, k)).filter(Boolean);
  const ask = (more, front = true) => pushChoice(G, { actor, player: actor, idx: ch.idx, source: ch.source, ...more }, front);
  const take = (list, id) => { const i = list.findIndex((c) => c.id === id); return i === -1 ? null : list.splice(i, 1)[0]; };
  switch (a.do) {
    case 'mod': {
      const amt = a.amountPer ? a.amountPer * G.platforms.filter((p) => p.cards[actor].length > 0).length : a.amountFrom === 'hand' ? player.hand.length : a.amountFrom === 'trash' ? player.trash.length : a.amount;
      for (const r of refs()) {
        if (r.persona) { const loc = G.personaLocations[r.owner]; if (loc !== null) G.platforms[loc].pmods[r.owner] += amt; continue; }
        r.card.mod = (r.card.mod || 0) + amt;
        if (a.drawIf && (a.drawIf.tag === 'Independent' ? isIndependent(G, r.idx) : (G.platforms[r.idx].type || '').toLowerCase().includes(a.drawIf.tag.toLowerCase()))) applyEffect(G, actor, r.idx, { type: 'draw', target: 'self', amount: a.drawIf.n });
      }
      break;
    }
    case 'zero': for (const r of refs()) r.card.mod = (r.card.mod || 0) - starsOf(G, r.idx, r.owner, r.card); break;
    case 'double': for (const r of refs()) r.card.mod = (r.card.mod || 0) + r.card.inf; break;
    case 'delete': { // payCost: Toxic Gaming spends the card's 🟡. draw: only if something was deleted (Gomi Kuma)
      let gone = 0;
      for (const r of refs()) { if (a.payCost) player.bits -= Math.min(player.bits, r.card.cost); if (deleteCard(G, r.owner, r.idx, r.card, actor)) gone++; }
      if (a.draw && gone) for (let k = 0; k < a.draw; k++) { const d = player.deck.shift(); if (d) player.hand.push(d); }
      break;
    }
    case 'return': for (const r of refs()) leaveCard(G, r.owner, r.idx, r.card, 'hand'); break;
    case 'reward': for (const r of refs()) { r.card.clashReward = a.effects; r.card.clashRewardText = a.text; } break;
    case 'moveHere': for (const r of refs()) moveRef(G, r, ch.idx); break;
    case 'bear1':
      ask({ player: opp, kind: 'card', options: cardOptions(G, actor, ch.idx, { scope: 'here', owner: 'any' }), prompt: ch.prompt, action: { do: 'bear2', first: keys[0] } });
      break;
    case 'bear2': {
      const keep = new Set([a.first, keys[0]]), p = G.platforms[ch.idx];
      for (const id of ['0', '1']) {
        for (const c of p.cards[id].filter((c) => !keep.has(`c|${ch.idx}|${id}|${c.id}`))) deleteCard(G, id, ch.idx, c, actor);
      }
      break;
    }
    case 'potion1':
      ask({ kind: 'platform', options: platformOptions(G, [0, 1, 2].filter((i) => i !== ch.idx)), prompt: 'Potion: move it to which platform?', action: { do: 'potion2', key: keys[0], bonus: a.bonus } });
      break;
    case 'potion2': {
      const r = refOf(G, a.key), dest = Number(keys[0]);
      if (!r) break;
      moveRef(G, r, dest);
      if (a.bonus && nameKey(player.persona?.name) === nameKey(a.bonus)) {
        const options = cardOptions(G, actor, ch.idx, { platform: dest, persona: true, exclude: refKey(r, dest) });
        if (options.length) ask({ kind: 'card', options, min: 0, prompt: 'Potion (Shisui Michiru): you may move another Persona or Content card from that platform back here', action: { do: 'potion3' } });
      }
      break;
    }
    case 'potion3': for (const r of refs()) moveRef(G, r, ch.idx); break;
    case 'movePersona': if (keys.length) moveRef(G, { persona: true, owner: actor }, Number(keys[0])); break; // "you may": declining picks nothing
    case 'movePop': {
      if (!keys.length) break; // "you may": declining picks nothing
      if (a.mode !== 'gaslight' && G.platforms[ch.idx].pop[opp] < 1) break; // nothing left to move (Accidental Flash asks twice)
      const target = Number(keys[0]);
      if (a.mode === 'gaslight') { if (popBlocked(G, ch.idx, actor)) break; G.platforms[target].pop[actor] -= 1; G.platforms[ch.idx].pop[actor] += 1; captureIfReady(G, ch.idx, actor); }
      else { if (popBlocked(G, target, opp)) break; G.platforms[ch.idx].pop[opp] -= 1; G.platforms[target].pop[opp] += 1; captureIfReady(G, target, opp); } // can complete a capture, but it is not a clash win, so no Clash Reward
      break;
    }
    case 'euclase1': // then ask where each chosen card goes
      for (const k of [...keys].reverse()) {
        const r = refOf(G, k);
        if (r) ask({ kind: 'platform', options: platformOptions(G, [0, 1, 2].filter((i) => i !== ch.idx)), prompt: `${ch.source}: move ${r.card.name} to which platform?`, action: { do: 'moveOwn2', key: k } });
      }
      break;
    case 'moveChosen': { // No Prep, No Problem: the chosen card goes to another platform
      const r = refOf(G, keys[0]);
      if (r) ask({ kind: 'platform', options: platformOptions(G, [0, 1, 2].filter((i) => i !== r.idx)), prompt: `${ch.source}: move ${r.card.name} to which platform?`, action: { do: 'moveOwn2', key: keys[0] } });
      break;
    }
    case 'modDelete': // Cage Chat: it loses ⭐; if it is down to 0, delete it
      for (const r of refs()) { if (r.persona) continue; r.card.mod = (r.card.mod || 0) + a.amount; if (starsOf(G, r.idx, r.owner, r.card) === 0) deleteCard(G, r.owner, r.idx, r.card, actor); }
      break;
    case 'ashBlast': { const card = take(G.players[opp].hand, keys[0].slice(2)); if (card) G.players[opp].trash.push(card); break; }
    case 'hardPivot': {
      let n = 0;
      for (const k of keys) { const card = take(player.hand, k.slice(2)); if (card) { player.trash.push(card); n++; } }
      applyEffect(G, actor, ch.idx, { type: 'draw', target: 'self', amount: n });
      break;
    }
    case 'waifu1': { // Waifu Wheel: the chosen cards leave your hand; with 2 you decide which goes on top
      const cards = keys.map((k) => take(player.hand, k.slice(2))).filter(Boolean);
      if (cards.length === 2) ask({ kind: 'card', options: cards.map((c) => zoneOption('r', c)), stash: cards, secret: true, prompt: `${ch.source}: which card goes on TOP of your deck? (the other goes just under it)`, action: { do: 'waifu2' } });
      else player.deck.unshift(...cards);
      break;
    }
    case 'waifu2': {
      const topCard = ch.stash.find((c) => c.id === keys[0].slice(2)), under = ch.stash.find((c) => c !== topCard);
      if (under) player.deck.unshift(under);
      if (topCard) player.deck.unshift(topCard);
      break;
    }
    case 'playTop': {
      if (keys[0] !== 'yes') break;
      const card = player.deck.shift();
      if (!card) break;
      player.bits -= Math.min(player.bits, playCost(G, actor, card, ch.idx));
      if (card.type === 'Content') player.contentDiscount = 0;
      placeCard(G, actor, card, ch.idx, { source: ch.source });
      break;
    }
    case 'pullOppPop': { const from = Number(keys[0]); G.platforms[from].pop[opp] -= 1; G.platforms[ch.idx].pop[opp] += 1; captureIfReady(G, ch.idx, opp); break; } // can complete a capture, but it is not a clash win, so no Clash Reward
    case 'moveAll': {
      const from = Number(keys[0]), cards = G.platforms[from].cards[actor];
      G.platforms[ch.idx].cards[actor].push(...cards);
      G.platforms[from].cards[actor] = [];
      break;
    }
    case 'playHand':
      for (const k of keys) {
        const card = take(player.hand, k.slice(2));
        if (!card) continue;
        player.bits -= Math.min(player.bits, playCost(G, actor, card, ch.idx));
        player.contentDiscount = 0;
        placeCard(G, actor, card, ch.idx, { source: ch.source });
      }
      break;
    case 'playTrash': for (const k of keys) { const card = take(player.trash, k.slice(2)); if (card) placeCard(G, actor, card, ch.idx, { source: ch.source }); } break; // free
    case 'trashToHand': for (const k of keys) { const card = take(player.trash, k.slice(2)); if (card) player.hand.push(card); } break;
    case 'moveSelf': { const r = refOf(G, a.key); if (r && keys.length) moveRef(G, r, Number(keys[0])); break; }
    case 'gainPopAt': { const t = Number(keys[0]); G.platforms[t].pop[actor] += 1; captureIfReady(G, t, actor); break; }
    case 'moveOppAll': { const dest = Number(keys[0]), from = G.platforms[ch.idx].cards[opp]; G.platforms[dest].cards[opp].push(...from); G.platforms[ch.idx].cards[opp] = []; break; }
    case 'playHandFree':
      for (const k of keys) {
        if (a.to === 'other') { // choose which other platform; the card stays in your hand until then (hidden from your opponent)
          const card = player.hand.find((c) => c.id === k.slice(2));
          const dests = card ? [0, 1, 2].filter((i) => i !== ch.idx && !contentBlocked(G, actor, card, i)) : [];
          if (dests.length) pushChoice(G, { actor, player: actor, idx: ch.idx, source: ch.source, kind: 'platform', secret: true, options: platformOptions(G, dests), hold: { cardId: card.id },
            prompt: `${ch.source}: play ${card.name} (for free) on which platform?`, action: { do: 'playHandFreeTo' } }, true);
        } else { const card = take(player.hand, k.slice(2)); if (card) placeCard(G, actor, card, ch.idx, { source: ch.source }); }
      }
      break;
    case 'playHandFreeTo': { const card = take(player.hand, ch.hold.cardId); if (card) placeCard(G, actor, card, Number(keys[0]), { source: ch.source }); break; }
    case 'payThen':
      if (keys.length && player.bits >= a.bits) { player.bits -= a.bits; for (const e of a.effects) applyEffect(G, actor, ch.idx, e, { source: ch.source }); }
      break;
    case 'merch': { const n = Number(keys[0]); player.merch = n; applyEffect(G, actor, ch.idx, { type: 'personaInf', target: 'self', amount: n }); break; }
    case 'copyReward': for (const r of platformFx(G, Number(keys[0]), 'platformReward')) for (const e of r.effects) applyEffect(G, actor, ch.idx, e, { source: ch.source }); break;
    case 'moveOwn1':
      if (keys.length) pushChoice(G, { actor, player: actor, idx: ch.idx, source: ch.source, kind: 'platform', options: platformOptions(G, [0, 1, 2].filter((i) => i !== ch.idx)), prompt: `${ch.source}: move it to which platform?`, action: { do: 'moveOwn2', key: keys[0] } }, true);
      break;
    case 'moveOwn2': { const r = refOf(G, a.key); if (r) moveRef(G, r, Number(keys[0])); break; }
    case 'playTrashSpend': for (const k of keys) { const card = take(player.trash, k.slice(2)); if (!card) continue; player.bits -= Math.min(player.bits, card.cost); placeCard(G, actor, card, a.dest, { source: ch.source }); } break;
    case 'playTrashAction': for (const k of keys) { const card = take(player.trash, k.slice(2)); if (card) placeCard(G, actor, card, a.dest, { source: ch.source }); } break;
    case 'lookTrashHand': {
      const toTrash = take(ch.stash, keys[0].slice(2));
      if (toTrash) player.trash.push(toTrash);
      player.hand.push(...ch.stash);
      break;
    }
    case 'lookPlay1': {
      const held = keys.length ? take(ch.stash, keys[0].slice(2)) : null;
      askOrder(G, actor, ch.idx, ch.source, ch.stash, [], held);
      break;
    }
    case 'lookOrder': {
      const card = take(ch.stash, keys[0].slice(2));
      askOrder(G, actor, ch.idx, ch.source, ch.stash, card ? [...ch.hold.ordered, card] : ch.hold.ordered, ch.hold.held);
      break;
    }
    case 'lookPlay2': {
      const card = ch.hold.held, dest = Number(keys[0]);
      player.bits -= Math.min(player.bits, playCost(G, actor, card, dest));
      player.contentDiscount = 0;
      placeCard(G, actor, card, dest, { source: ch.source }); // "any Platform": not limited to where your Persona is
      break;
    }
    case 'revealPick': {
      const chosen = new Set(keys.map((k) => k.slice(2)));
      for (const c of ch.stash) if (chosen.has(c.id)) player.hand.push(c); else if (a.rest === 'trash') player.trash.push(c); else player.deck.push(c); // the rest go to the bottom of the deck (or the Trash)
      break;
    }
    case 'discardDraw': {
      const card = take(player.hand, keys[0].slice(2));
      if (card) player.trash.push(card);
      applyEffect(G, actor, ch.idx, { type: 'draw', target: 'self', amount: a.draw });
      break;
    }
    default: break;
  }
};
const makeChoice = ({ G, playerID, events }, keys) => {
  const ch = G.choices[0];
  if (!ch || ch.player !== playerID) return INVALID_MOVE;
  const picked = Array.isArray(keys) ? keys : keys === undefined ? [] : [keys];
  if (new Set(picked).size !== picked.length || picked.length < ch.min || picked.length > ch.max) return INVALID_MOVE;
  if (!picked.every((k) => ch.options.some((o) => o.key === k))) return INVALID_MOVE;
  if (ch.action.do === 'playTrash') {
    const total = picked.reduce((t, k) => t + (G.players[ch.actor].trash.find((c) => `t|${c.id}` === k)?.cost || 0), 0);
    if (total > ch.action.maxTotal) return INVALID_MOVE;
  }
  G.choices.shift();
  runChoice(G, ch, picked);
  if (!G.choices.length && G.afterChoices) { // all decisions made: now the turn that played the card ends
    const actor = G.afterChoices.actor;
    G.afterChoices = null;
    endMyTurn(G, actor, events);
  }
};

// ---- Sandbox (test matches only): set up any situation to try a card ----
const sandboxOnly = (fn) => (args, ...rest) => (args.G.sandbox ? fn(args, ...rest) : INVALID_MOVE);
const isPlayer = (id) => id === '0' || id === '1';
const isPlatform = (i) => [0, 1, 2].includes(i);
const copyCard = (G, card) => ({ ...JSON.parse(JSON.stringify(card)), id: `sb${G.sbCounter++}_${card.id}` });
const debugMoves = {
  // Give a player any persona (optionally with an Upgrade on it) and, optionally, put it on a platform.
  dbgSetPersona: sandboxOnly(({ G }, id, personaId, upgradeId, platform) => {
    const per = CARDS_BY_ID.get(personaId), up = upgradeId ? CARDS_BY_ID.get(upgradeId) : null;
    if (!isPlayer(id) || per?.type !== 'Persona') return INVALID_MOVE;
    if (up && !upgradeFits(up, per)) return INVALID_MOVE;
    G.players[id].persona = { ...per };
    G.players[id].upgrades = up ? [{ ...up }] : [];
    if (isPlatform(platform)) G.personaLocations[id] = platform;
  }),
  dbgDeploy: sandboxOnly(({ G }, id, platform) => {
    if (!isPlayer(id) || !isPlatform(platform)) return INVALID_MOVE;
    G.personaLocations[id] = platform;
  }),
  dbgAddHand: sandboxOnly(({ G }, id, cardId, count = 1) => {
    const card = CARDS_BY_ID.get(cardId);
    if (!isPlayer(id) || !card) return INVALID_MOVE;
    for (let i = 0; i < Math.min(count, 10); i++) G.players[id].hand.push(copyCard(G, card));
  }),
  dbgAddHandType: sandboxOnly(({ G }, id, type) => {
    if (!isPlayer(id) || !['Content', 'Action', 'Upgrade'].includes(type)) return INVALID_MOVE;
    for (const card of CARDS) if (card.type === type) G.players[id].hand.push(copyCard(G, card));
  }),
  dbgClearHand: sandboxOnly(({ G }, id) => {
    if (!isPlayer(id)) return INVALID_MOVE;
    G.players[id].hand = [];
  }),
  dbgAddContent: sandboxOnly(({ G }, id, platform, cardId) => {
    const card = CARDS_BY_ID.get(cardId);
    if (!isPlayer(id) || !isPlatform(platform) || card?.type !== 'Content') return INVALID_MOVE;
    G.platforms[platform].cards[id].push(copyCard(G, card));
  }),
  dbgClearBoard: sandboxOnly(({ G }) => {
    for (const p of G.platforms) { p.cards = { 0: [], 1: [] }; p.actions = { 0: [], 1: [] }; p.mods = { 0: 0, 1: 0 }; p.pmods = { 0: 0, 1: 0 }; p.pop = { 0: 0, 1: 0 }; }
  }),
  dbgSet: sandboxOnly(({ G }, id, bits, subs) => {
    if (!isPlayer(id)) return INVALID_MOVE;
    if (Number.isFinite(bits)) G.players[id].bits = Math.max(0, bits);
    if (Number.isFinite(subs)) G.players[id].subs = Math.max(0, subs);
  }),
  dbgSetPop: sandboxOnly(({ G }, platform, id, n) => {
    if (!isPlatform(platform) || !isPlayer(id) || !Number.isFinite(n)) return INVALID_MOVE;
    G.platforms[platform].pop[id] = Math.max(0, n);
  }),
  // Jump to a phase (for example straight to the clash) and give a player the turn.
  dbgPhase: sandboxOnly(({ G, events }, phase) => {
    if (!['deployment', 'content', 'clashOrder', 'clash', 'clashResults'].includes(phase)) return INVALID_MOVE;
    G.passed = { 0: false, 1: false };
    G.autoPass = { 0: false, 1: false };
    G.pendingDiscard = { 0: 0, 1: 0 };
    G.choices = [];
    G.afterChoices = null;
    G.directionChosen = false;
    if (phase === 'deployment') G.personaLocations = { 0: null, 1: null };
    if (phase === 'clash') { G.clashSequence = [0, 1, 2]; G.clashIndex = 0; G.clashLog = []; G.clashDirection = 'LEFT_TO_RIGHT'; }
    events.setPhase(phase);
  }),
  dbgTurn: sandboxOnly(({ events }, id) => {
    if (!isPlayer(id)) return INVALID_MOVE;
    events.endTurn({ next: id });
  }),
};

export const OshiPush = {
  name: 'oshi-push',

  setup: (_ctx, setupData) => ({
    sandbox: !!(setupData && setupData.sandbox), // a test match: the debug moves below are allowed
    sbCounter: 0,
    choices: [], // decisions waiting for a player (pick a card or platform); the first one is active
    afterChoices: null, // whose turn ends once every decision is made
    choiceSeq: 0,
    round: 1,
    firstPlayer: '0', // swaps every round
    passed: { 0: false, 1: false },
    actionLock: { 0: false, 1: false },
    roundRewards: { 0: [], 1: [] }, // Clash Rewards cards gave a persona for this round
    anyPlatform: { 0: false, 1: false }, // Clip Out of Context: Content may be played on any platform this round
    costUp: { 0: 0, 1: 0 }, // Fashionista: extra 🟡 your Content costs this round
    phase: 'deckSelect', // the current phase's name (set when each phase begins), so card text can ask "during a clash"
    autoPass: { 0: false, 1: false }, // 'Pass all': passing automatically for the rest of the phase
    pendingDiscard: { 0: 0, 1: 0 }, // cards a player must still choose to discard (effects)
    clashLog: [],
    clashAcks: { 0: false, 1: false },
    clashDirection: 'LEFT_TO_RIGHT',
    clashChooser: null, // the turn player who chose the resolution order this round
    directionChosen: false,
    clashSequence: [0, 1, 2], // platform indexes in the order they clash this round
    clashIndex: 0, // which of them is clashing now (3 = all done)
    platforms: [
      { name: 'LEFT', type: 'Gaming', pop: { 0: 0, 1: 0 }, threshold: 3, subValue: 100000, cards: { 0: [], 1: [] }, actions: { 0: [], 1: [] }, mods: { 0: 0, 1: 0 }, pmods: { 0: 0, 1: 0 } },
      { name: 'CENTER', type: 'Music', pop: { 0: 0, 1: 0 }, threshold: 4, subValue: 200000, cards: { 0: [], 1: [] }, actions: { 0: [], 1: [] }, mods: { 0: 0, 1: 0 }, pmods: { 0: 0, 1: 0 } },
      { name: 'RIGHT', type: 'Lifestyle', pop: { 0: 0, 1: 0 }, threshold: 3, subValue: 100000, cards: { 0: [], 1: [] }, actions: { 0: [], 1: [] }, mods: { 0: 0, 1: 0 }, pmods: { 0: 0, 1: 0 } },
    ],
    personaLocations: { 0: null, 1: null },
    players: {
      0: { bits: 7, subs: 0, hand: [], deck: [], persona: null, upgrades: [], trash: [], played: { Action: 0, Content: 0 }, activations: 0, activationsTotal: 0, merch: null, contentDiscount: 0, platformCards: [], deckReady: false, mulliganDone: false, mulliganed: false },
      1: { bits: 7, subs: 0, hand: [], deck: [], persona: null, upgrades: [], trash: [], played: { Action: 0, Content: 0 }, activations: 0, activationsTotal: 0, merch: null, contentDiscount: 0, platformCards: [], deckReady: false, mulliganDone: false, mulliganed: false },
    },
  }),

  // The game ends the moment a player reaches WIN_SUBS subscribers (checked after every move).
  endIf: ({ G }) => {
    const s0 = G.players['0'].subs, s1 = G.players['1'].subs;
    if (s0 < WIN_SUBS && s1 < WIN_SUBS) return undefined;
    return s0 === s1 ? { draw: true } : { winner: s0 > s1 ? '0' : '1' };
  },

  playerView: ({ G, playerID }) => {
    const copy = JSON.parse(JSON.stringify(G));
    copy.choices = copy.choices.map((ch) => (ch.secret && ch.player !== playerID ? { ...ch, prompt: '', revealed: undefined, options: ch.options.map(() => ({ hidden: true })), stash: undefined, hold: undefined } : ch));
    for (const id of ['0', '1']) {
      copy.players[id].deck = copy.players[id].deck.map(() => ({ hidden: true }));
      if (id === playerID) continue;
      copy.players[id].hand = copy.players[id].hand.map(() => ({ hidden: true }));
      copy.players[id].platformCards = copy.players[id].platformCards.map(() => ({ hidden: true }));
    }
    return copy;
  },

  phases: {
    // 0. Each player submits a legal deck (40 main, 5 platforms, 1 persona), or takes a random one.
    deckSelect: {
      start: true,
      next: 'mulligan',
      turn: { activePlayers: ActivePlayers.ALL },
      moves: {
        submitDeck: ({ G, playerID, random }, deck) => {
          if (G.players[playerID].deckReady) return INVALID_MOVE;
          if (validateDeck(deck, CARDS_BY_ID).length) return INVALID_MOVE;
          setupPlayer(G, playerID, deck, random);
        },
        useRandomDeck: ({ G, playerID, random }) => {
          if (G.players[playerID].deckReady) return INVALID_MOVE;
          const deck = randomDeck(CARDS, (list) => random.Shuffle([...list]));
          if (validateDeck(deck, CARDS_BY_ID).length) return INVALID_MOVE;
          setupPlayer(G, playerID, deck, random);
        },
      },
      endIf: ({ G }) => G.players['0'].deckReady && G.players['1'].deckReady,
    },

    // 0b. Opening hand: keep it, or replace it once (a mulligan). A mulligan shuffles your hand back into your
    //     deck and draws a fresh hand. Both players decide at the same time.
    mulligan: {
      next: 'platformSetup',
      turn: { activePlayers: ActivePlayers.ALL },
      moves: {
        keepHand: ({ G, playerID }) => {
          if (G.players[playerID].mulliganDone) return INVALID_MOVE;
          G.players[playerID].mulliganDone = true;
        },
        mulligan: ({ G, playerID, random }) => {
          const p = G.players[playerID];
          if (p.mulliganDone) return INVALID_MOVE; // only once
          const pile = random.Shuffle([...p.deck, ...p.hand]);
          p.hand = pile.splice(0, STARTING_HAND);
          p.deck = pile;
          p.mulliganDone = true;
          p.mulliganed = true;
        },
      },
      endIf: ({ G }) => G.players['0'].mulliganDone && G.players['1'].mulliganDone,
    },

    // 0c. Setting up the field: the first player puts down a platform from their platform deck, then the second player,
    //     then the first player again, until there are 3 platforms on the field. The platform is drawn at random from the
    //     player's platform deck; the player chooses which empty slot it goes in.
    platformSetup: {
      next: 'deployment',
      turn: { order: { first: ({ G }) => Number(G.firstPlayer), next: ({ ctx }) => (ctx.playOrderPos + 1) % ctx.numPlayers } },
      moves: {
        ...debugMoves,
        // The platform is picked at random (the side deck is shuffled): you only choose which empty slot it goes in.
        putPlatform: ({ G, playerID, events }, slot) => {
          if (![0, 1, 2].includes(slot) || G.platforms[slot].card) return INVALID_MOVE; // the slot must be empty
          const deck = G.players[playerID].platformCards;
          if (!deck.length) return INVALID_MOVE;
          applyPlatformCard(G.platforms[slot], deck.shift());
          if (!G.platforms.every((p) => p.card)) events.endTurn(); // otherwise the field is full and the phase ends
        },
      },
      endIf: ({ G }) => G.platforms.every((p) => p.card),
    },

    // 1. Turn player deploys first (alternates each round), then the other player
    //    deploys with the first persona already visible.
    deployment: {
      next: 'content',
      turn: {
        order: {
          first: ({ G }) => Number(G.firstPlayer),
          next: ({ ctx }) => (ctx.playOrderPos + 1) % ctx.numPlayers,
        },
      },
      moves: {
        ...debugMoves,
        deployPersona: ({ G, playerID, events }, platformIndex) => {
          if (![0, 1, 2].includes(platformIndex)) return INVALID_MOVE;
          if (G.personaLocations[playerID] !== null) return INVALID_MOVE;
          G.personaLocations[playerID] = platformIndex;
          if (G.personaLocations[other(playerID)] === null) events.endTurn();
        },
      },
      endIf: ({ G }) => G.personaLocations['0'] !== null && G.personaLocations['1'] !== null,
    },

    // 2. Alternating turns; phase ends when both players pass in a row.
    content: {
      next: 'clashOrder',
      onBegin: ({ G }) => {
        G.passed = { 0: false, 1: false };
      },
      turn: inPlayTurns(contentPass),
      moves: {
        ...debugMoves,
        playCard: playCard((c) => c.type === 'Content' || c.type === 'Upgrade' || c.type === 'Action'),
        passTurn: contentPass(false),
        togglePassAll: togglePassAll(contentPass),
        makeChoice,
        discardCard,
        activate,
        activateCard,
        discardAbility,
      },
      endIf: bothPassed,
      onEnd: resetPassed, // so the next phase doesn't start with both players already passed
    },

    // 3. The turn player decides which end platform clashes first: left, middle, right or right, middle, left.
    clashOrder: {
      next: 'clash',
      turn: alternatingTurns, // the first player of the round is the current player, so only they can choose
      moves: {
        ...debugMoves,
        chooseClashOrder: ({ G, playerID }, direction) => {
          if (playerID !== G.firstPlayer) return INVALID_MOVE;
          if (direction !== 'LEFT_TO_RIGHT' && direction !== 'RIGHT_TO_LEFT') return INVALID_MOVE;
          G.clashDirection = direction;
          G.clashChooser = playerID;
          G.clashSequence = direction === 'LEFT_TO_RIGHT' ? [0, 1, 2] : [2, 1, 0];
          G.clashIndex = 0;
          G.clashLog = [];
          G.passed = { 0: false, 1: false };
          G.directionChosen = true;
        },
      },
      endIf: ({ G }) => G.directionChosen,
      onEnd: ({ G }) => { G.directionChosen = false; }, // reset on the way out so the next round waits for a new choice
    },

    // 3b. Clash: one clash per platform, in the chosen order. Players alternate playing Action cards on the platform
    //     that is clashing (or passing). When both pass, that platform resolves and the next platform's clash begins.
    clash: {
      next: 'clashResults',
      turn: inPlayTurns(clashPassMove),
      moves: { ...debugMoves, playCard: playCard((c) => c.type === 'Action'), passTurn: clashPassMove(false), togglePassAll: togglePassAll(clashPassMove), makeChoice, discardCard, activate, activateCard, discardAbility },
      endIf: ({ G }) => G.clashIndex >= 3 && !G.choices.length, // a Clash Reward decision must be answered first
      onEnd: resetPassed,
    },

    // 4. Results: income and draw, hand-limit discards, then wait for both players to continue.
    clashResults: {
      next: 'deployment',
      turn: { activePlayers: ActivePlayers.ALL },
      onBegin: ({ G }) => {
        G.clashAcks = { 0: false, 1: false };
        // "At the start of the Refresh Phase: ... you may return this card to your hand" (Dragon Deez)
        for (const id of ['0', '1']) G.platforms.forEach((pl, i) => pl.cards[id].forEach((c) => {
          for (const fx of fxOf(c, 'refreshReturn')) {
            if (fx.persona && nameKey(G.players[id].persona?.name) !== nameKey(fx.persona)) continue;
            pushChoice(G, { actor: id, player: id, idx: i, source: c.name, kind: 'card', min: 0, prompt: `${c.name}: you may return it to your hand`,
              options: [{ key: `c|${i}|${id}|${c.id}`, kind: 'card', name: c.name, art: c.art, owner: id, platform: i, cost: c.cost }], action: { do: 'return' } });
          }
        }));
        // Round income and draw, so the hand limit is checked with the new card included.
        for (const pId of ['0', '1']) {
          G.players[pId].bits += 3;
          const drawn = G.players[pId].deck.shift();
          if (drawn) G.players[pId].hand.push(drawn);
        }
      },
      moves: {
        ...debugMoves,
        discardCard,
        makeChoice,
        ackClash: ({ G, playerID }) => {
          if (discardNeed(G, playerID, true) > 0 || G.choices.length) return INVALID_MOVE; // answer Refresh Phase decisions first // discard down to the hand limit first
          G.clashAcks[playerID] = true;
        },
      },
      endIf: ({ G }) => G.clashAcks['0'] && G.clashAcks['1'],
      // Round reset: remove personas, swap first player.
      onEnd: ({ G }) => {
        for (const p of G.platforms) for (const id of ['0', '1']) { for (const c of p.actions[id]) delete c.mod; G.players[id].trash.push(...p.actions[id]); } // played Actions go to the Trash
        G.roundRewards = { 0: [], 1: [] };
        G.anyPlatform = { 0: false, 1: false };
        G.costUp = { 0: 0, 1: 0 };
        for (const p of G.platforms) { p.playedHere = { 0: 0, 1: 0 }; p.forceWin = null; p.noPop = { 0: false, 1: false }; }
        for (const pl of G.platforms) pl.used = {}; // "the first time ..." platform rules (Iori's Den) refresh
        for (const id of ['0', '1']) G.players[id].merch = null; // Phase Warehouse: declare your merch again next round
        for (const pl of G.platforms) for (const id of ['0', '1']) for (const c of pl.cards[id]) delete c.used; // Activate abilities refresh
        for (const p of G.platforms) { p.actions = { 0: [], 1: [] }; p.mods = { 0: 0, 1: 0 }; p.pmods = { 0: 0, 1: 0 }; }
        G.actionLock = { 0: false, 1: false }; // action cards, star changes and locks last one clash
        for (const pl of G.platforms) for (const id of ['0', '1']) for (const c of pl.cards[id]) delete c.mod; // this-round star changes on Content cards
        for (const id of ['0', '1']) G.players[id].contentDiscount = 0;
        G.personaLocations = { 0: null, 1: null };
        G.pendingDiscard = { 0: 0, 1: 0 };
        for (const pId of ['0', '1']) { G.players[pId].played = { Action: 0, Content: 0 }; G.players[pId].activations = 0; }
        G.clashLog = [];
        G.clashAcks = { 0: false, 1: false };
        G.passed = { 0: false, 1: false };
        G.firstPlayer = other(G.firstPlayer);
        G.round += 1;
      },
    },
  },
};

// Remember the current phase's name in G so card text ("during a clash", "only during the Content Phase") can be checked anywhere.
for (const [name, phase] of Object.entries(OshiPush.phases)) {
  const prev = phase.onBegin;
  phase.onBegin = (ctx) => { ctx.G.phase = name; if (prev) prev(ctx); };
}
