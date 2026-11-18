// Import a deck list exported from another deck-building site into this game's deck format.
//
// Understands lines like        2x Tenma Maemi - OP01/PHC-038 - Supa!
// (count, name, SET/XXX-number, rarity). Headings such as "Persona:", "Platforms:" and "Main Deck:" are ignored: each card
// is sorted by its own type (Persona, Platform, everything else = main deck). A line with no code ("3x FAQ YU") works too.
//
// Cards are matched by their number first (OP01/PHC-038 is card op01-038 here; the Kickstarter set OPKS points at the
// same numbers), then checked against the name, because the other site shows Upgrades without their subtitle
// ("Tenma Maemi" for "Tenma Maemi, Mii-chan"). Anything that cannot be matched is reported, never guessed.
import { nameKey } from './deckRules.js';

const LINE = /^(\d+)\s*x?\s+(.+?)(?:\s+-\s+([A-Za-z0-9]+)\s*\/\s*[A-Za-z]+\s*-\s*(\d+))?(?:\s+-\s+[^-].*)?$/i;
const base = (name) => nameKey(String(name).split(',')[0]);
const numOf = (c) => { const m = /-(\d+)$/.exec(c.id); return m ? Number(m[1]) : null; };

export function resolveCard(cards, { name, set, num }) {
  const same = (c) => base(c.name) === base(name);
  let hits = num != null ? cards.filter((c) => numOf(c) === num && same(c)) : [];
  if (hits.length > 1 && set) { const pref = hits.filter((c) => c.id.toLowerCase().startsWith(`${set.toLowerCase()}-`)); if (pref.length) hits = pref; }
  if (hits.length) return { card: hits[0] };
  // No card with that number and name: fall back to the name alone, but only when that is unambiguous.
  const exact = cards.filter((c) => nameKey(c.name) === nameKey(name));
  if (exact.length === 1) return { card: exact[0] };
  const loose = cards.filter(same);
  if (loose.length === 1) return { card: loose[0] };
  if (loose.length > 1) return { error: `"${name}" matches several cards and the number ${num ?? '(none)'} did not settle which` };
  return { error: `"${name}" is not in this game's card list${set ? ` (${set.toUpperCase()}; is that set released here yet?)` : ''}` };
}

export function importDeckList(text, cards) {
  const deck = { name: 'Imported deck', persona: null, platforms: [], main: [] };
  const problems = [];
  let total = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /:$/.test(line)) continue; // blank lines and headings
    const m = LINE.exec(line);
    if (!m) { problems.push(`Could not read: ${line}`); continue; }
    const count = Number(m[1]), name = m[2].trim(), set = m[3], num = m[4] != null ? Number(m[4]) : null;
    const { card, error } = resolveCard(cards, { name, set, num });
    if (error) { problems.push(`${count}x ${error}`); continue; }
    total += count;
    if (card.type === 'Persona') { if (deck.persona && deck.persona !== card.id) problems.push(`More than one Persona in the list; kept ${deck.persona}, skipped ${card.name}`); else deck.persona = card.id; }
    else if (card.type === 'Platform') for (let i = 0; i < count; i++) deck.platforms.push(card.id);
    else for (let i = 0; i < count; i++) deck.main.push(card.id);
  }
  return { deck, problems, total };
}
