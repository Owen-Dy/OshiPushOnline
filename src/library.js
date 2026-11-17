// Card library: browse every card from cards.js (all types, whether or not their effects are implemented).
import { CARDS } from '../cards.js';

const $ = (id) => document.getElementById(id);
const esc = (s = '') => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const url = (p) => p.split('/').map(encodeURIComponent).join('/');
const FILTERS = ['type', 'class', 'style', 'genre', 'set'];

// ---- filters ----
const unique = (k) => [...new Set(CARDS.map((c) => c[k]).filter(Boolean))].sort();
for (const k of FILTERS) {
  $(`f-${k}`).innerHTML = `<option value="">All ${k}s</option>` + unique(k).map((v) => `<option>${esc(v)}</option>`).join('');
}

// ---- summary ----
const byType = {};
for (const c of CARDS) byType[c.type] = (byType[c.type] || 0) + 1;
$('summary').textContent = `${CARDS.length} cards: ` + Object.entries(byType).map(([t, n]) => `${t} ${n}`).join(' · ');

const effectBadge = (c) => (!c.text ? '' : c.effects ? '<span class="badge ok">effects active</span>' : '<span class="badge">text only</span>');

function render() {
  const q = $('search').value.trim().toLowerCase();
  const sel = Object.fromEntries(FILTERS.map((k) => [k, $(`f-${k}`).value]));
  const list = CARDS.filter((c) =>
    FILTERS.every((k) => !sel[k] || c[k] === sel[k]) &&
    (!q || [c.name, c.id, c.text, c.tags].some((v) => (v || '').toLowerCase().includes(q))) &&
    ($('f-art').value === 'with' ? c.hasArt !== false : $('f-art').value === 'without' ? c.hasArt === false : true));
  $('count').textContent = `${list.length} of ${CARDS.length} shown`;
  $('grid').innerHTML = list.map((c) => `
    <button class="tile" data-id="${esc(c.id)}">
      <div class="art"><img loading="lazy" src="${url(c.art)}" alt="" onerror="this.style.visibility='hidden'"></div>
      ${c.hasArt === false ? '<em class="noart">no art</em>' : ''}
      <b>${esc(c.name)}</b>
      <span>${esc(c.type)}${c.cost ? ' · 🟡' + c.cost : ''}${c.inf ? ' · ⭐' + c.inf : ''}</span>
    </button>`).join('') || '<p>No cards match.</p>';
}

// ---- detail view ----
function show(id) {
  const c = CARDS.find((x) => x.id === id);
  if (!c) return;
  const stat = (label, v) => (v ? `<tr><td>${label}</td><td>${esc(v)}</td></tr>` : '');
  $('detail').innerHTML = `
    <div class="panel">
      <button class="close" data-close>Close</button>
      <div class="big"><img src="${url(c.art)}" alt="" onerror="this.style.visibility='hidden'"></div>
      <div>
        <h2>${esc(c.name)}</h2>
        <p class="meta">${esc(c.id)} ${effectBadge(c)}</p>
        <table>${stat('Type', c.type)}${stat('Cost 🟡', c.cost)}${stat('Stars ⭐', c.inf)}${stat('💎', c.gems)}
          ${stat('Threshold 🌠', c.threshold)}${stat('Subs 👥', c.subValue && c.subValue.toLocaleString())}
          ${stat('Class', c.class)}${stat('Style', c.style)}${stat('Genre', c.genre)}${stat('Set', c.set)}${stat('Tags', c.tags)}${stat('Source', c.source)}${stat('Art file', c.hasArt === false ? 'not found in public/art' : '')}</table>
        <p class="fx">${esc(c.text).replace(/\n/g, '<br>')}</p>
        ${c.flavour ? `<p class="meta"><i>${esc(c.flavour)}</i></p>` : ''}
      </div>
    </div>`;
  $('detail').hidden = false;
}

$('grid').addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (t) show(t.dataset.id); });
$('detail').addEventListener('click', (e) => { if (e.target === $('detail') || e.target.closest('[data-close]')) $('detail').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('detail').hidden = true; });
for (const el of ['search', 'f-art', ...FILTERS.map((k) => `f-${k}`)]) $(el).addEventListener('input', render);
render();
