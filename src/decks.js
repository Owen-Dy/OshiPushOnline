// Deck builder: 1 Persona + 5 Platforms + 40 main deck cards (max 4 copies, each matching the persona's type or color). Decks are saved in this browser.
import { CARDS } from '../cards.js';
import { RULES, validateDeck, randomDeck, fitsPersona, platformFits, personaOnly, copyLimit } from '../deckRules.js';

const $ = (id) => document.getElementById(id);
const esc = (s = '') => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const url = (p) => p.split('/').map(encodeURIComponent).join('/');
const byId = new Map(CARDS.map((c) => [c.id, c]));
const KEY = 'oshi-decks';
const FILTERS = ['type', 'class', 'style', 'genre'];

const loadSaved = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const blank = () => ({ name: 'New deck', persona: null, platforms: [], main: [] });
let saved = loadSaved();
let deck = blank();

const say = (m) => { $('msg').textContent = m; };
const countName = (ids, name) => ids.filter((id) => byId.get(id)?.name === name).length;
const countId = (id) => (deck.persona === id ? 1 : 0) + deck.platforms.filter((x) => x === id).length + deck.main.filter((x) => x === id).length;

// Can this card go in the deck for the chosen persona? (Persona and Platform cards are always listed.)
const mayAdd = (c) => c.type === 'Persona' ? !deck.persona || c.id === deck.persona : !deck.persona || (c.type === 'Platform' ? platformFits(c, byId.get(deck.persona)) : fitsPersona(c, byId.get(deck.persona))); // a "deck only" Platform fits only its own deck
let shownPersona;
// ---- pool ----
const unique = (k) => [...new Set(CARDS.map((c) => c[k]).filter(Boolean))].sort();
for (const k of FILTERS) $(`f-${k}`).innerHTML = `<option value="">All ${k}s</option>` + unique(k).map((v) => `<option>${esc(v)}</option>`).join('');

function renderPool() {
  const q = $('search').value.trim().toLowerCase();
  const sel = Object.fromEntries(FILTERS.map((k) => [k, $(`f-${k}`).value]));
  const list = CARDS.filter((c) => FILTERS.every((k) => !sel[k] || c[k] === sel[k]) &&
    (!q || [c.name, c.id, c.text, c.tags].some((v) => (v || '').toLowerCase().includes(q))) &&
    (!$('hide-off').checked || mayAdd(c)) &&
    ($('f-art').value === 'with' ? c.hasArt !== false : $('f-art').value === 'without' ? c.hasArt === false : true));
  $('grid').innerHTML = list.map((c) => `
    <button class="tile" data-add="${esc(c.id)}" title="${esc(c.text)}">
      <div class="art"><img loading="lazy" src="${url(c.art)}" alt="" onerror="this.style.visibility='hidden'"></div>
      ${c.hasArt === false ? '<em class="noart">no art</em>' : ''}
      <b>${esc(c.name)}</b><span>${esc(c.type)}${c.cost ? ' · 🟡' + c.cost : ''}${c.inf ? ' · ⭐' + c.inf : ''}</span>
      <i class="in" data-in="${esc(c.id)}"></i>
    </button>`).join('') || '<p>No cards match.</p>';
  badges();
}
function badges() {
  for (const el of document.querySelectorAll('[data-in]')) { const n = countId(el.dataset.in); el.textContent = n ? `×${n}` : ''; }
}

// ---- deck editing ----
function add(id) {
  const c = byId.get(id);
  if (!c) return;
  if (c.type === 'Persona') {
    if (deck.persona && deck.persona !== id) return say(`Your deck already has ${byId.get(deck.persona).name}. Press Remove next to the Persona first to choose a different one.`);
    const changed = deck.persona !== id;
    deck.persona = id;
    if (changed) { // choosing a persona clears out cards that persona cannot use
      const per = byId.get(id), gone = [];
      deck.main = deck.main.filter((cid) => { const k = byId.get(cid); const ok = k && fitsPersona(k, per); if (!ok && k) gone.push(k.name); return ok; });
      deck.platforms = deck.platforms.filter((cid) => { const k = byId.get(cid); const ok = k && platformFits(k, per); if (!ok && k) gone.push(k.name); return ok; });
      renderDeck();
      return say(gone.length ? `Removed ${gone.length} card${gone.length > 1 ? 's' : ''} ${per.name} cannot use: ${[...new Set(gone)].join(', ')}.` : '');
    }
  }
  else if (c.type === 'Platform') {
    if (!mayAdd(c)) return say(`${c.name} can only be used in a deck with ${(c.effects.find((fx) => fx.type === 'deckOnly') || {}).persona || (c.effects.find((fx) => fx.type === 'deckOnly') || {}).affiliation}.`);
    if (deck.platforms.length >= RULES.PLATFORMS) return say(`Platform slots are full (${RULES.PLATFORMS}).`);
    if (countName(deck.platforms, c.name) >= RULES.MAX_PLATFORM_COPIES) return say(`Only ${RULES.MAX_PLATFORM_COPIES} copy of a Platform card.`);
    deck.platforms.push(id);
  } else {
    if (!mayAdd(c) && c.type === 'Upgrade') return say(`${c.name} is an Upgrade for ${c.name.split(',')[0]} and can only be used with that persona.`);
    if (personaOnly(c, byId.get(deck.persona))) return say(`${c.name} can only be used in a deck with ${c.playOnly.persona}.`);
    if (!mayAdd(c)) { const per = byId.get(deck.persona); return say(`${c.name} is not ${per.name}'s type (${per.genre || '-'}) or color (${per.style || '-'}).`); }
    if (deck.main.length >= RULES.MAIN) return say(`Main deck is full (${RULES.MAIN}).`);
    if (countName(deck.main, c.name) >= copyLimit(c)) return say(`Max ${copyLimit(c)} cop${copyLimit(c) === 1 ? 'y' : 'ies'} of ${c.name}.`);
    deck.main.push(id);
  }
  say('');
  renderDeck();
}
const removeOne = (list, id) => { const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); };

function renderDeck() {
  $('name').value = deck.name;
  if (deck.persona !== shownPersona) { shownPersona = deck.persona; renderPool(); } // the pool follows the persona's type and color
  const p = byId.get(deck.persona);
  const chip = (label, n, max) => `<span class="chip${n === max ? ' ok' : ''}">${label} ${n}/${max}</span>`;
  $('counts').innerHTML = chip('Persona', p ? 1 : 0, 1) + chip('Platforms', deck.platforms.length, RULES.PLATFORMS) + chip('Main', deck.main.length, RULES.MAIN);
  $('persona').innerHTML = p ? `<div class="row"><b>${esc(p.name)}</b><span>⭐${p.inf || 0} · 💎${p.gems || 0}</span><button data-rm-persona>Remove</button></div>` : '<p class="meta">Click a Persona card to choose it.</p>';
  $('platforms').innerHTML = deck.platforms.map((id) => `<div class="row"><b>${esc(byId.get(id).name)}</b><span>🌠${byId.get(id).threshold || ''}</span><button data-rm-plat="${esc(id)}">Remove</button></div>`).join('') || '<p class="meta">Click Platform cards to add them.</p>';
  const groups = [...new Set(deck.main)].map((id) => byId.get(id)).sort((a, b) => (a.cost || 0) - (b.cost || 0) || a.name.localeCompare(b.name));
  $('main').innerHTML = groups.map((c) => `<div class="row${mayAdd(c) ? '' : ' bad'}"><b>×${countId(c.id) - 0}</b><span class="nm">${esc(c.name)}</span><span>${esc(c.type)} · 🟡${c.cost || 0}</span>
    <button data-minus="${esc(c.id)}">−</button><button data-plus="${esc(c.id)}">+</button></div>`).join('') || '<p class="meta">Click cards in the pool to add them.</p>';
  const errs = validateDeck(deck, byId);
  $('problems').innerHTML = errs.length ? errs.map((e) => `<li>${esc(e)}</li>`).join('') : '<li class="good">Deck is legal (46 cards).</li>';
  renderSaved();
  badges();
}

// ---- saved decks ----
function renderSaved() {
  $('saved').innerHTML = '<option value="">Saved decks…</option>' + saved.map((d, i) => `<option value="${i}"${d.name === deck.name ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
}
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { say('Could not save (browser storage is blocked).'); } };

$('save').onclick = () => {
  deck.name = $('name').value.trim() || 'Untitled deck';
  const i = saved.findIndex((d) => d.name === deck.name);
  const copy = JSON.parse(JSON.stringify(deck));
  if (i >= 0) saved[i] = copy; else saved.push(copy);
  persist(); say(`Saved "${deck.name}".`); renderDeck();
};
$('new').onclick = () => { deck = blank(); say(''); renderDeck(); };
$('delete').onclick = () => { saved = saved.filter((d) => d.name !== deck.name); persist(); say(`Deleted "${deck.name}" from saved decks.`); renderDeck(); };
$('random').onclick = () => {
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  deck = { ...randomDeck(CARDS, shuffle, deck.persona || undefined), name: $('name').value.trim() || 'Random deck' };
  say('Filled with a random legal deck. Edit it, then Save.'); renderDeck();
};
$('saved').onchange = (e) => { if (e.target.value !== '') { deck = JSON.parse(JSON.stringify(saved[Number(e.target.value)])); say(''); renderDeck(); } };
$('name').oninput = (e) => { deck.name = e.target.value; };

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.add) add(t.dataset.add);
  else if (t.dataset.plus) add(t.dataset.plus);
  else if (t.dataset.minus) { removeOne(deck.main, t.dataset.minus); say(''); renderDeck(); }
  else if (t.dataset.rmPlat) { removeOne(deck.platforms, t.dataset.rmPlat); say(''); renderDeck(); }
  else if (t.dataset.rmPersona !== undefined) { deck.persona = null; renderDeck(); }
});
for (const el of ['search', 'f-art', 'hide-off', ...FILTERS.map((k) => `f-${k}`)]) $(el).addEventListener('input', renderPool);
renderPool();
renderDeck();
