// Usage: npm run cards            (reads cards.csv in the project folder)
//        npm run cards -- <file.csv | sheet-csv-url> [--ext=png]
// Reads your card sheet and writes cards.js (the game's card pool).
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
// Hand-written effects for cards that need choices (see card-effects.js). They take the place of parsing the card text.
let CARD_EFFECTS = {};
try { CARD_EFFECTS = (await import(pathToFileURL(path.join(root, 'card-effects.js')).href)).default || {}; }
catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') console.log(`card-effects.js could not be read: ${e.message}`); }
let handWritten = 0;
const unusedEffects = new Set(Object.keys(CARD_EFFECTS));

const src = arg && !arg.startsWith('--') ? arg : 'cards.csv'; // default: cards.csv in the project folder
const ext = (process.argv.find((a) => a.startsWith('--ext=')) || '--ext=png').slice(6);
const fail = (m) => { console.error(`\nERROR: ${m}\n`); process.exit(1); };
if (!/^https?:/.test(src) && !fs.existsSync(src)) {
  fail(`Can't find "${src}". In your Google Sheet open the Cards tab, choose File > Download > Comma-separated values (.csv), and save it in this folder as cards.csv. Then run: npm run cards`);
}

function parseCSV(t) {
  const rows = []; let row = [], f = '', q = false;
  t = t.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

let text;
if (/^https?:/.test(src)) {
  const res = await fetch(src);
  if (!res.ok) fail(`Download failed (HTTP ${res.status}). Is the sheet shared as "anyone with the link can view"?`);
  text = await res.text();
  if (text.trimStart().startsWith('<')) fail('Got a web page, not CSV. The sheet is probably private. Download it as CSV instead.');
} else {
  text = fs.readFileSync(src, 'utf8');
}

const ALIAS = {
  id: ['id', 'cardid', 'number', 'no'],
  name: ['name', 'card', 'cardname', 'title'],
  type: ['type', 'cardtype', 'kind'],
  cost: ['cost', 'bits', 'bitcost'],
  inf: ['inf', 'influence', 'power'],
  text: ['effect', 'effects', 'text', 'ability', 'description', 'rules'],
  art: ['art', 'image', 'artfile', 'img'],
  source: ['infosource', 'source'],
  gems: ['gems'], threshold: ['threshold'], subValue: ['subvalue', 'subs'],
  class: ['class'], style: ['style'], genre: ['genre'], set: ['set'], tags: ['tags'], flavour: ['flavour', 'flavor'],
};
// Sheet headers that are emoji: cost, gems, influence, platform capture threshold, platform subscriber value.
const EMOJI = { '🟡': 'cost', '💎': 'gems', '⭐': 'inf', '🌠': 'threshold', '👥': 'subValue' };
// Art is kept in one folder per generation: public/art/gen1, public/art/gen2, ... ("Gen 1 Promo" is still gen1).
const genFolder = (set) => { const m = /gen\s*(\d+)/i.exec(set || ''); return m ? `gen${m[1]}` : ''; };
const folderKey = (f) => String(f || '').toLowerCase().replace(/[^a-z0-9]/g, ''); // "Gen 2", "gen2" and "GEN2" are the same folder
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const [head, ...body] = parseCSV(text);
const col = {};
head.forEach((h, i) => {
  const clean = h.replace(/\uFE0F/g, '').trim();
  const key = EMOJI[clean] ?? Object.keys(ALIAS).find((k) => ALIAS[k].includes(norm(clean)));
  if (key && !(key in col)) col[key] = i;
});
if (col.name === undefined) fail(`No name column found. Headers seen: ${head.join(', ')}`);
const used = new Set(Object.values(col));


// ---- Effect parsing (Action cards only) ----
// A card gets `effects` only if EVERY sentence is a supported star/bit change; otherwise it stays text-only.
// Note: the sheet's 💎 is treated as the game's Bits.
const AMT = '(\\d+)', DUR = '(?: this (?:clash|round))?';
const rx = (p) => new RegExp(`^${p}$`, 'i');
const CLAUSES = [
  [rx(`your persona gains \\+?${AMT}\\s*⭐${DUR}`), (m) => ({ type: 'personaInf', target: 'self', amount: +m[1] })],
  [rx(`(?:an |each )?opposing persona(?:'s)? (?:gains -${AMT}|loses -?${AMT})\\s*⭐${DUR}`), (m) => ({ type: 'personaInf', target: 'opponent', amount: -(+(m[1] || m[2])) })],
  [rx(`(?:decrease|reduce) (?:an |each )?opposing persona(?:'s)? ⭐ by ${AMT}${DUR}`), (m) => ({ type: 'personaInf', target: 'opponent', amount: -(+m[1]) })],
  [rx(`each of your content cards on this platform gains \\+?${AMT}\\s*⭐${DUR}`), (m) => ({ type: 'contentInf', target: 'self', amount: +m[1] })],
  [rx(`each opposing content card on this platform (?:gains -${AMT}|loses -?${AMT})\\s*⭐${DUR}`), (m) => ({ type: 'contentInf', target: 'opponent', amount: -(+(m[1] || m[2])) })],
  [rx(`(?:you )?gain \\+?${AMT}\\s*💎`), (m) => ({ type: 'bits', target: 'self', amount: +m[1] })],
  [rx(`(?:you )?draw ${AMT} cards?`), (m) => ({ type: 'draw', target: 'self', amount: +m[1] })],
  [rx(`this costs ${AMT}\\s*💎 less to play`), (m) => ({ type: 'costReduction', amount: +m[1] })],
  [rx(`the next content card you play this round costs ${AMT}\\s*💎 less`), (m) => ({ type: 'contentDiscount', amount: +m[1] })],
  [rx(`(?:you )?draw ${AMT} cards? for each platform where you have at least 1 content card`), (m) => ({ type: 'draw', target: 'self', amount: +m[1], perContentPlatform: true })],
  [rx(`delete all non-(\\w+) content cards in play`), (m) => ({ type: 'deleteContent', scope: 'all', genreNot: m[1] })],
  [rx(`delete all content on this platform with (?:🟡\\s*|cost )${AMT} or more`), (m) => ({ type: 'deleteContent', scope: 'here', costMin: +m[1] })],
  [rx(`return all content cards in play to their owners' hands`), () => ({ type: 'returnContent' })],
  [rx(`steal ${AMT}\\s*🌠 at this platform`), (m) => ({ type: 'stealPop', amount: +m[1] })],
  [rx(`each opponent discards ${AMT} cards?(?: from their hand)?`), (m) => ({ type: 'discard', target: 'opponent', amount: +m[1] })],
  [rx(`you lose ${AMT}\\s*💎`), (m) => ({ type: 'bits', target: 'self', amount: -(+m[1]) })],
  [rx(`each opponent loses ${AMT}\\s*💎`), (m) => ({ type: 'bits', target: 'opponent', amount: -(+m[1]) })],
  [rx(`each opponent gains ${AMT}\\s*💎`), (m) => ({ type: 'bits', target: 'opponent', amount: +m[1] })],
  [rx(`set (?:an |each )?opposing persona(?:'s)? ⭐ to ${AMT}${DUR}`), (m) => ({ type: 'personaInfSet', target: 'opponent', value: +m[1] })],
  [rx(`(?:all opponents|each opponent) can't play actions${DUR}`), () => ({ type: 'actionLock', target: 'opponent' })],
];
const SPECIALS = [
  [rx(`your persona gains \\+?${AMT}\\s*⭐ this clash;? if you have an upgraded persona, it gains \\+?${AMT}\\s*⭐ this clash instead`),
    (m) => [{ type: 'personaInf', target: 'self', amount: +m[1], upgradedAmount: +m[2] }]],
  [rx(`every (\\w+) content cards? on all platforms gains \\+?${AMT}\\s*⭐ this round\\. if your persona is (.+?), they gain \\+?${AMT}\\s*⭐ instead`),
    (m) => [{ type: 'contentInfAll', genre: m[1], amount: +m[2], personaAmount: { persona: m[3].trim(), amount: +m[4] } }]],
  [rx(`if you are dominating this platform,? gain ${AMT}\\s*🌠 on this platform`), (m) => [{ type: 'gainPop', amount: +m[1], if: { dominating: true } }]],
];
function parseEffects(raw, opts = {}) {
  let t = raw.replace(/[\u2018\u2019]/g, "'").replace(/\uFE0F/g, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^Play only[^.]*\.\s*(?:-\s*)?/i, ''); // drop the "Play only ..." restriction line
  if (!t) return undefined; // nothing to parse
  for (const [re, make] of SPECIALS) { const sm = t.replace(/\.$/, '').match(re); if (sm) return make(sm); }
  const clauses = t.split(/(?<=\.)\s+/).flatMap((x) => x.replace(/\.$/, '').split(/,\s*and\s+|\s+and\s+(?=you )/i)).map((x) => x.trim()).filter(Boolean);
  const effects = [];
  for (let c of clauses) {
    let cond;
    const m = c.match(/^(?:then,?\s+)?if (.+?), (.+)$/i);
    if (m) {
      const p = m[1].match(/^your persona is (.+)$/i), pl = m[1].match(/^the current platform is (.+)$/i);
      if (p) cond = { persona: p[1].trim() };
      else if (pl) cond = { platformTag: pl[1].trim() };
      else return null;
      c = m[2].trim();
    }
    const hit = CLAUSES.map(([re, make]) => { const mm = c.match(re); return mm && make(mm); }).find(Boolean);
    if (!hit) return null;
    if (hit.type === 'draw' && !opts.draw) return null; // drawing is only enabled where asked for
    effects.push(cond ? { ...hit, if: cond } : hit);
  }
  return effects.length ? effects : null;
}

// ---- Persona / Upgrade abilities: Clash Reward, passive "While…" bonuses, "first time you play…" triggers, ACTIVATE ----
const STAR = '\\+?(\\d+)\\s*⭐';
const ABILITIES = [
  [rx(`while you have (\\d+)\\s*💎: .+? gains ${STAR}`), (m) => ({ kind: 'while', cond: { bitsEq: +m[1] }, amount: +m[2] })],
  [rx(`while you have at least (\\d+) content cards? on this platform with (?:🟡\\s*|cost )(\\d+) or less: .+? gains ${STAR}`), (m) => ({ kind: 'while', cond: { contentAtLeast: +m[1], costMax: +m[2] }, amount: +m[3] })],
  [rx(`while you have exactly (\\d+) content cards? on this platform: .+? gains ${STAR}`), (m) => ({ kind: 'while', cond: { contentExactly: +m[1] }, amount: +m[2] })],
  [rx(`while you have (\\d+) or more cards in your hand: .+? gains ${STAR}`), (m) => ({ kind: 'while', cond: { handAtLeast: +m[1] }, amount: +m[2] })],
  [rx(`.+? gains ${STAR} for each platform where you have (?:a|1 or more) content cards?`), (m) => ({ kind: 'perContentPlatform', amount: +m[1] })],
  [rx(`the first time you play an? (action|content) card each round: .+? gains ${STAR} this round(?: and you draw (\\d+) cards?)?`),
    (m) => ({ kind: 'firstPlay', play: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), amount: +m[2], ...(m[3] ? { draw: +m[3] } : {}) })],
];
function parseAbilities(raw) {
  const out = { passives: [], parsed: 0, total: 0 };
  const paras = raw.replace(/[\u2018\u2019]/g, "'").replace(/\uFE0F/g, '').split(/\n\s*\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const para of paras) {
    out.total++;
    if (/^clash reward/i.test(para)) {
      const rest = para.replace(/^clash reward:?\s*/i, '');
      const fx = parseEffects(rest, { draw: true });
      if (fx) { out.clashReward = fx; out.clashRewardText = rest; out.parsed++; } else out.rewardFailed = true;
      continue;
    }
    const act = para.match(/^activate:?\s*(.+?):\s*this card gains \+?(\d+)\s*⭐ this round\.\s*limit (\d+) per round\.(?:\s*limit (\d+) per 24 hours\.)?/i);
    if (act) { out.activate = { name: act[1].trim(), amount: +act[2], limitPerRound: +act[3], ...(act[4] ? { limitTotal: +act[4] } : {}) }; out.parsed++; continue; }
    const text = para.replace(/\.$/, '');
    const hit = ABILITIES.map(([re, make]) => { const m = text.match(re); return m && make(m); }).find(Boolean);
    if (hit) { out.passives.push(hit); out.parsed++; }
  }
  return out;
}
const abilityStats = [];
const restrictionNames = [];
const skippedActions = [];
let parsedActions = 0;
const skippedRewards = [];
let parsedRewards = 0;

// Only these sets are imported. Cards from other sets (such as Gen 3, which has no art yet) are left out.
// Add a set here when it is ready, or override once with:  npm run cards -- --sets=Gen1,Gen2,Gen3  or  --all-sets
// (spaces and capitals in set names do not matter, so --sets=Gen1,Gen2 works without quotes on every system)
const DEFAULT_SETS = ['Gen 1', 'Gen 2']; // add 'Gen 3' here when it is ready
const setsArg = process.argv.find((a) => a.startsWith('--sets='));
const squash = (v) => v.toLowerCase().replace(/\s+/g, '');
const wantedSets = (setsArg ? setsArg.slice(7).split(',') : DEFAULT_SETS).map(squash);
const allSets = process.argv.includes('--all-sets');
const setAllowed = (v) => {
  if (allSets || col.set === undefined) return true;
  const k = squash(v);
  return !k || wantedSets.some((w) => k.startsWith(w) && !/\d/.test(k[w.length] || '')); // "Gen 1 Promo" counts as Gen 1; "Gen 10" does not
};
const skippedSets = {};
const warnings = [], seen = new Map(), types = {};
const cards = [];
body.forEach((r, n) => {
  const get = (k) => (col[k] === undefined ? '' : (r[col[k]] ?? '').trim());
  const name = get('name');
  if (!name) { warnings.push(`row ${n + 2}: no name, skipped`); return; }
  if (!setAllowed(get('set'))) { skippedSets[get('set')] = (skippedSets[get('set')] || 0) + 1; return; }

  let id = slug(get('id') || name);
  const count = (seen.get(id) || 0) + 1;
  seen.set(id, count);
  if (count > 1) { warnings.push(`row ${n + 2}: duplicate id "${id}", renamed "${id}-${count}"`); id = `${id}-${count}`; }

  const num = (k) => {
    const raw = get(k).replace(/,/g, '');
    if (raw === '') return 0; // blank is normal (Actions have no influence, Personas no cost)
    const v = Number(raw);
    if (Number.isNaN(v)) { warnings.push(`row ${n + 2} (${name}): ${k} is "${raw}", using 0`); return 0; }
    return v;
  };
  const rawType = get('type') || 'Content';
  const type = rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase();
  types[type] = (types[type] || 0) + 1;

  // Default art file is "<card name>.<ext>" (characters Windows can't use in filenames are dropped).
  let art = get('art');
  if (!art) art = `${name.replace(/[<>:"/\\|?*]/g, '')}.${ext}`;
  else if (!/\.\w+$/.test(art)) art += `.${ext}`;
  const folder = genFolder(get('set'));
  if (!art.includes('/')) art = `art/${folder ? folder + '/' : ''}${art}`; // e.g. art/gen2/Card Name.png

  const extra = {};
  head.forEach((h, i) => { if (!used.has(i) && h.trim() && (r[i] ?? '').trim() !== '') extra[h.trim()] = r[i].trim(); });

  const card = { id, name, type, cost: /^x$/i.test(get('cost')) ? 0 : num('cost'), inf: num('inf'), gems: num('gems'), text: get('text'), art };
  if (/^x$/i.test(get('cost'))) card.xCost = true; // a cost of X: the player chooses how many Bits to spend when playing it
  card._explicit = Boolean(get('art')); // art path came from the sheet (removed before saving)
  card._folder = folder; // which generation's art folder to look in (removed before saving)
  for (const k of ['class', 'style', 'genre', 'set', 'tags', 'flavour', 'source']) if (get(k)) card[k] = get(k);
  if (get('threshold')) { card.threshold = num('threshold'); card.subValue = num('subValue'); }
  if (Object.keys(extra).length) card.extra = extra;
  if (type === 'Content' || type === 'Action') {
    const flat = card.text.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ');
    const po = {};
    const mp = flat.match(/play only if your persona is ([^.]*?)(?: and only| and|\.|$)/i);
    if (mp) po.persona = mp[1].trim();
    if (/only during a clash/i.test(flat)) po.timing = 'clash';
    else if (/only during the content phase/i.test(flat)) po.timing = 'content';
    if (po.persona || po.timing) { card.playOnly = po; if (po.persona) restrictionNames.push([name, po.persona]); }
  }
  if (type === 'Persona' || type === 'Upgrade') {
    const res = parseAbilities(card.text);
    if (res.clashReward) { card.clashReward = res.clashReward; card.clashRewardText = res.clashRewardText; }
    if (res.rewardFailed) skippedRewards.push(name); else if (res.clashReward) parsedRewards++;
    if (res.passives.length) card.passives = res.passives;
    if (res.activate) card.activate = res.activate;
    abilityStats.push({ name, type, parsed: res.parsed, total: res.total });
  }
  if (CARD_EFFECTS[name]) { card.effects = CARD_EFFECTS[name]; handWritten++; unusedEffects.delete(name); }
  else if (type === 'Action') {
    const fx = parseEffects(card.text, { draw: true });
    if (fx) { card.effects = fx; parsedActions++; } else if (fx === null) skippedActions.push(name);
  }
  cards.push(card);
});

// ---- Resolve each card's art against the files that really exist in public/art ----
// Matching ignores case, punctuation, accents and curly quotes, so "Feet: A Holy Deep Dive" finds "Feet - A Holy Deep Dive.png".
const artDir = path.join(root, 'public', 'art');
const normKey = (t) => t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
let overrides = {};
try { overrides = JSON.parse(fs.readFileSync(path.join(root, 'art-overrides.json'), 'utf8')); } catch { /* optional file */ }
const isArt = (f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f);
const folders = fs.existsSync(artDir) ? ['', ...fs.readdirSync(artDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)] : null;
// Every art file as a path relative to public/art, e.g. "gen1/Eat a Spider.png" (or "Eat a Spider.png" in the old flat layout).
const artFiles = folders ? folders.flatMap((fo) => fs.readdirSync(path.join(artDir, fo), { withFileTypes: true }).filter((d) => d.isFile() && isArt(d.name)).map((d) => (fo ? `${fo}/${d.name}` : d.name))) : null;
const artSet = new Set(artFiles || []);
const fileByKey = new Map(); // "folder|normalised name" -> relative path
const anyFolder = new Map(); // normalised name -> relative path, whichever folder it is in (last resort, so no card loses art it had before)
for (const rel of artFiles || []) {
  const fo = path.posix.dirname(rel) === '.' ? '' : folderKey(path.posix.dirname(rel));
  const nk = normKey(path.posix.basename(rel).replace(/\.[^.]+$/, ''));
  if (!fileByKey.has(`${fo}|${nk}`)) fileByKey.set(`${fo}|${nk}`, rel);
  if (!anyFolder.has(nk)) anyFolder.set(nk, rel); // first file with this name in any folder
}
const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const missingArt = [], usedFiles = new Set();
for (const c of cards) {
  const folder = c._folder || '';
  delete c._folder;
  const explicitOk = c._explicit && fs.existsSync(path.join(root, 'public', c.art));
  delete c._explicit;
  if (!artFiles) continue;
  if (explicitOk) { c.hasArt = true; usedFiles.add(c.art.replace(/^art\//, '')); continue; }
  // A card looks in its own generation's folder first, then in the old flat public/art folder.
  const find = (key) => fileByKey.get(`${folderKey(folder)}|${key}`) ?? fileByKey.get(`|${key}`) ?? anyFolder.get(key);
  const ov = overrides[c.name] ?? overrides[c.id];
  const fromOverride = ov === undefined ? undefined : [ov.replace(/^art\//, ''), folder ? `${folder}/${ov}` : ov, ...(artFiles || []).filter((r) => r.endsWith(`/${ov}`))].find((r) => artSet.has(r));
  const hit = fromOverride ?? find(normKey(c.name)) ?? find(normKey(c.id));
  if (hit) { c.art = `art/${hit}`; c.hasArt = true; usedFiles.add(hit); }
  else { c.hasArt = false; missingArt.push(c); }
}
// Second pass, for cards that still have no art: look only at art files that no card has claimed, and accept a file whose
// name is a clear near-match (the card name with something left off or added, or a small typo). Every guess is printed.
const looseMatches = [];
if (artFiles && missingArt.length) {
  const loose = (c) => {
    const k = normKey(c.name), folder = c.set ? genFolder(c.set) : '';
    const scored = artFiles.filter((f) => !usedFiles.has(f)).map((f) => {
      const dir = path.posix.dirname(f), fk = normKey(path.posix.basename(f).replace(/\.[^.]+$/, ''));
      const near = dir === '.' || folderKey(dir) === folderKey(folder) ? 0 : 0.5; // prefer the card's own generation folder
      if (fk.length >= 4 && k.length >= 4 && (fk.includes(k) || k.includes(fk))) return { f, score: Math.abs(fk.length - k.length) / 100 + near };
      const d = lev(k, fk);
      return d <= Math.max(2, Math.floor(k.length / 8)) ? { f, score: d + near } : null;
    }).filter(Boolean).sort((a, b) => a.score - b.score);
    return scored.length && (scored.length === 1 || scored[1].score - scored[0].score >= 0.5) ? scored[0].f : null;
  };
  for (const c of [...missingArt]) {
    const f = loose(c);
    if (!f) continue;
    c.art = `art/${f}`; c.hasArt = true; usedFiles.add(f);
    looseMatches.push(`${c.name}  ->  ${f}`);
    missingArt.splice(missingArt.indexOf(c), 1);
  }
}
fs.writeFileSync(
  path.join(root, 'cards.js'),
  `// Generated by scripts/import-cards.js. Do not edit by hand; re-run the import instead.\nexport const CARDS = ${JSON.stringify(cards, null, 2)};\n`
);
console.log(`Imported ${cards.length} cards:`, types);
if (looseMatches.length) console.log(`Matched by a close file name (please check these ${looseMatches.length}):\n  ` + looseMatches.join('\n  '));
if (artFiles) {
  const gens = {};
  for (const c of cards) { const g = c.set || '(no set)'; (gens[g] ||= { n: 0, art: 0 }).n++; if (c.hasArt) gens[g].art++; }
  console.log('Per set:', Object.entries(gens).map(([g, v]) => `${g} ${v.art}/${v.n} with art`).join(', '));
  console.log('Art folders found in public/art:', folders.map((f) => f || '(loose files)').join(', '));
}
if (Object.keys(skippedSets).length) console.log(`Left out (not in ${allSets ? 'all' : wantedSets.length ? (setsArg ? setsArg.slice(7) : DEFAULT_SETS.join(', ')) : ''}): ` + Object.entries(skippedSets).map(([k, v]) => `${k} ${v}`).join(', '));
console.log(`Columns used: ${Object.keys(col).join(', ')}${used.size < head.length ? ` | kept as "extra": ${head.filter((_, i) => !used.has(i)).join(', ')}` : ''}`);
if (!artFiles) {
  console.log('Art: no public/art folder found, so art paths were not checked.');
} else {
  console.log(`Art: ${cards.length - missingArt.length} of ${cards.length} cards matched a file in public/art (each generation's art goes in its own folder, e.g. public/art/gen2/).`);
  const unused = artFiles.filter((f) => !usedFiles.has(f));
  const lines = missingArt.map((c) => {
    const k = normKey(c.name), fo = genFolder(c.set);
    const near = [...fileByKey.entries()]
      .filter(([key]) => key.startsWith(`${folderKey(fo)}|`) || key.startsWith('|'))
      .map(([key, f]) => { const fk = key.split('|')[1]; return { f, score: fk.length >= 4 && k.length >= 4 && (fk.includes(k) || k.includes(fk)) ? 0 : lev(k, fk) }; })
      .filter((x) => x.score <= Math.max(2, Math.floor(k.length / 6))).sort((a, b) => a.score - b.score).slice(0, 2).map((x) => x.f);
    return `${c.name} [${c.type}${fo ? ', ' + fo : ''}]${near.length ? `  -> maybe: ${near.join(' | ')}` : ''}`;
  });
  fs.writeFileSync(path.join(root, 'art-report.txt'),
    `Cards with no art file (${missingArt.length}):\n${lines.join('\n')}\n\nArt files not used by any card (${unused.length}):\n${unused.join('\n')}\n\n` +
    `To fix a mismatch, rename the file to the card name, or add it to art-overrides.json like {"Card Name": "file name.png"}, then run npm run cards again.\n`);
  if (missingArt.length) console.log(`  ${missingArt.length} cards have no art. First ones:\n` + lines.slice(0, 15).map((l) => '    ' + l).join('\n') + (lines.length > 15 ? '\n    …' : '') + '\n  Full list with suggestions: art-report.txt');
}
{
  const nk = (t) => t.toLowerCase().split(/\W+/).filter(Boolean).sort().join(' ');
  const known = new Set(cards.filter((c) => c.type === 'Persona').map((c) => nk(c.name)));
  const bad = restrictionNames.filter(([, p]) => !known.has(nk(p)));
  const used = restrictionNames.length;
  console.log(`"Play only if your Persona is X" restrictions: ${used} cards${bad.length ? `. UNKNOWN persona names (these cards can never be played): ${bad.map(([c, p]) => `${c} -> "${p}"`).join('; ')}` : ', all name a real persona'}`);
}
{
  const personas = abilityStats.filter((a) => a.type === 'Persona');
  const notFull = personas.filter((a) => a.parsed < a.total).map((a) => a.name);
  console.log(`Persona abilities fully understood: ${personas.length - notFull.length} of ${personas.length}${notFull.length ? ' (not yet: ' + notFull.join(', ') + ')' : ''}`);
  const ups = abilityStats.filter((a) => a.type === 'Upgrade');
  console.log(`Upgrades with at least one working ability: ${ups.filter((a) => a.parsed > 0).length} of ${ups.length} (their Discard:/Activate: abilities are still text-only)`);
}
console.log(`Persona/Upgrade Clash Rewards understood: ${parsedRewards} | text-only: ${skippedRewards.length}${skippedRewards.length ? ' (' + skippedRewards.join(', ') + ')' : ''}`);
console.log(`Hand-written effects used (card-effects.js): ${handWritten}${unusedEffects.size ? ' | NOT FOUND in the sheet: ' + [...unusedEffects].join(', ') : ''}`);
console.log(`Action effects understood: ${parsedActions} | text-only (other effects): ${skippedActions.length}`);
if (skippedActions.length) console.log('  Text-only Actions: ' + skippedActions.slice(0, 25).join(', ') + (skippedActions.length > 25 ? ', …' : ''));
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n` + warnings.slice(0, 20).map((w) => '  ' + w).join('\n') + (warnings.length > 20 ? '\n  …' : ''));
