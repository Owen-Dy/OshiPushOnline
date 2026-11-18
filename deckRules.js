// Deck rules shared by the deck builder, the client and the game server.
// A deck is { name, persona: cardId, platforms: [cardId x5], main: [cardId x40] } (46 cards in total).
export const RULES = { MAIN: 40, PLATFORMS: 5, MAX_COPIES: 3, MAX_PLATFORM_COPIES: 1 };

// Names are compared ignoring case, punctuation and word order ("Pippa Pipkin" = "Pipkin Pippa").
export const nameKey = (s = '') => s.toLowerCase().split(/\W+/).filter(Boolean).sort().join(' ');
// An Upgrade named "Pipkin Pippa, Filippa" belongs to the persona "Pipkin Pippa" and to no other.
export const upgradeFits = (card, persona) =>
  !!persona && card.type === 'Upgrade' && nameKey(card.name.split(',')[0]) === nameKey(persona.name);

// A main deck card must share the persona's type (Genre) or color (Style). Platforms have neither, so they are exempt.
const key = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, ''); // "⬤︎ Purple" -> "purple", "💬 Zatsudan" -> "zatsudan"
export const normKey = key;
export const fitsPersona = (card, persona) => {
  if (card.type === 'Upgrade') return upgradeFits(card, persona); // Upgrades: their own persona only (type and color don't matter)
  if (!persona || (!key(persona.style) && !key(persona.genre))) return true;
  if (!key(card.style) && !key(card.genre)) return true; // colorless / typeless cards fit any persona
  return (!!key(card.style) && key(card.style) === key(persona.style)) || (!!key(card.genre) && key(card.genre) === key(persona.genre));
};

// "X's deck only" Platforms (Pippa's Quarters, Nasa's Dream ... and Phase Warehouse: "Phase Connect deck only").
// The rule is written on the card's data as { type: 'deckOnly', persona } or { type: 'deckOnly', affiliation: 'Phase Connect' }.
// Sakana is counted as Phase Connect here: remove it from this list if that is wrong.
export const PHASE_CONNECT = ['Pipkin Pippa', 'Utatane Nasa', 'Hakushika Iori', 'Shisui Michiru', 'Fujikura Uruka', 'Rinkou Ashelia', 'Tenma Maemi', 'Sakana'];
export const platformFits = (card, persona) => {
  const rule = (card.effects || []).find((fx) => fx.type === 'deckOnly');
  if (!rule || !persona) return true; // no restriction, or no persona chosen yet
  if (rule.persona) return nameKey(persona.name) === nameKey(rule.persona);
  if (rule.affiliation === 'Phase Connect') return PHASE_CONNECT.some((n) => nameKey(n) === nameKey(persona.name));
  return true;
};

const tally = (cards) => cards.reduce((m, c) => ((m[c.name] = (m[c.name] || 0) + 1), m), {});
const tooMany = (cards, max) => Object.entries(tally(cards)).filter(([, n]) => n > max).map(([name]) => name);

// byId is a Map of card id -> card. Returns a list of problems (empty means the deck is legal).
export function validateDeck(deck, byId) {
  if (!deck || typeof deck !== 'object') return ['No deck'];
  const errors = [];
  const list = (v) => (Array.isArray(v) && v.length <= 200 ? v.map((id) => byId.get(id)) : null);
  const persona = byId.get(deck.persona);
  const plats = list(deck.platforms), main = list(deck.main);

  if (!persona || persona.type !== 'Persona') errors.push('Choose 1 Persona');

  if (!plats || plats.some((c) => !c || c.type !== 'Platform')) errors.push('Platform list has an unknown or non-Platform card');
  else {
    if (plats.length !== RULES.PLATFORMS) errors.push(`Need ${RULES.PLATFORMS} Platform cards (have ${plats.length})`);
    const dup = tooMany(plats, RULES.MAX_PLATFORM_COPIES);
    if (dup.length) errors.push(`Platform copy limit is ${RULES.MAX_PLATFORM_COPIES}: ${dup.join(', ')}`);
    const wrong = persona ? [...new Set(plats.filter((c) => !platformFits(c, persona)).map((c) => c.name))] : [];
    if (wrong.length) errors.push(`Platforms that are for another deck: ${wrong.join(', ')}`);
  }

  if (!main || main.some((c) => !c || c.type === 'Persona' || c.type === 'Platform')) errors.push('Main deck has an unknown card, a Persona or a Platform');
  else {
    if (main.length !== RULES.MAIN) errors.push(`Need ${RULES.MAIN} main deck cards (have ${main.length})`);
    const dup = tooMany(main, RULES.MAX_COPIES);
    if (dup.length) errors.push(`More than ${RULES.MAX_COPIES} copies of: ${dup.join(', ')}`);
    const wrongUpgrades = persona ? [...new Set(main.filter((c) => c.type === 'Upgrade' && !upgradeFits(c, persona)).map((c) => c.name))] : [];
    if (wrongUpgrades.length) errors.push(`Upgrades can only be used with their own persona: ${wrongUpgrades.slice(0, 3).join(', ')}${wrongUpgrades.length > 3 ? ` and ${wrongUpgrades.length - 3} more` : ''}`);
    const off = persona ? [...new Set(main.filter((c) => c.type !== 'Upgrade' && !fitsPersona(c, persona)).map((c) => c.name))] : [];
    if (off.length) errors.push(`Not ${persona.name}'s type or color: ${off.slice(0, 4).join(', ')}${off.length > 4 ? ` and ${off.length - 4} more` : ''}`);
  }
  return errors;
}

// A random legal deck from the Content and Action cards that fit the persona. `shuffle` takes and returns an array.
// Pass personaId to build the deck for a specific persona; otherwise a random persona is picked.
export function randomDeck(cards, shuffle, personaId) {
  const ofType = (t) => shuffle(cards.filter((c) => c.type === t));
  const persona = personaId ? cards.find((c) => c.id === personaId) : ofType('Persona')[0];
  const pool = shuffle(cards.filter((c) => (c.type === 'Content' || c.type === 'Action') && fitsPersona(c, persona)));
  const main = [], copies = {};
  for (let pass = 1; pass <= RULES.MAX_COPIES; pass++) {
    for (const c of pool) {
      if (main.length < RULES.MAIN && (copies[c.name] || 0) < pass) { main.push(c.id); copies[c.name] = pass; }
    }
  }
  return {
    name: 'Random deck',
    persona: persona?.id,
    platforms: ofType('Platform').filter((c) => platformFits(c, persona)).slice(0, RULES.PLATFORMS).map((c) => c.id),
    main,
  };
}
