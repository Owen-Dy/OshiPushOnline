// Headless tests for Upgrade cards (Discard / Activate abilities, Clash Rewards). Run: node tests/upgrades.test.mjs
import assert from 'assert';
import { CARDS } from '../cards.js';
import { canPersonaActivate, personaAbility } from '../game.js';
import { mk, test, finish, card, persona } from './harness.mjs';

const UPGRADES = CARDS.filter((c) => c.type === 'Upgrade' && c.set === 'Gen 1'); // these tests cover the Gen 1 Upgrades; Gen 2 Upgrades get their own tests
const baseOf = (u) => persona(u.name.split(',')[0]);
const up = (name) => card(name);

test('all 16 Upgrades have their abilities in the data', () => {
  assert.equal(UPGRADES.length, 16);
  for (const u of UPGRADES) assert.ok(/Discard:/.test(u.text) === (u.effects || []).some((f) => f.type === 'discardAbility'), `${u.name}: Discard ability`);
  const activates = UPGRADES.filter((u) => /Activate/.test(u.text)).map((u) => u.name).sort();
  assert.deepEqual(activates, UPGRADES.filter((u) => (u.effects || []).some((f) => f.type === 'personaActivate')).map((u) => u.name).sort());
  assert.equal(activates.length, 4);
});
test('every Upgrade can be played onto its Persona in the Content Phase', () => {
  for (const u of UPGRADES) {
    const t = mk({ p0: baseOf(u) }); t.bits('0', 20); t.play('0', u.name);
    assert.equal(t.G().players['0'].upgrades.length, 1, `${u.name} could not be played`);
  }
});
test('Content cards with "Discard: move your Persona" can be played as Content', () => {
  for (const n of ['Spooky Town', 'Debut Stream', 'Background Dogs Barking', 'UWU']) {
    const t = mk(); t.bits('0', 20); t.play('0', n); assert.equal(t.G().platforms[0].cards['0'].length, 1, n);
  }
});

// ---------- Discard abilities ----------
test('Discard: +2 ⭐ this clash (clash only)', () => {
  for (const n of ['Pipkin Pippa, Filippa', 'Pipkin Pippa, Shipkin Shippa', 'Pipkin Pippa, Yabbit', 'Fujikura Uruka, Urufu', 'Fujikura Uruka, Gomi Kuma']) {
    const t = mk(); const c = t.give('0', n); t.turn('0'); t.as('0', 'discardAbility', c.id);
    assert.equal(t.G().players['0'].hand.some((x) => x.id === c.id), true, n + ': not in the Content Phase');
    t.clash(); t.turn('0'); const before = t.G().platforms[0].pmods['0']; t.as('0', 'discardAbility', c.id);
    assert.equal(t.G().platforms[0].pmods['0'], before + 2, n); assert.equal(t.G().players['0'].trash.at(-1).name, n);
  }
});
test('Discard: gain 1 💎 (any time)', () => {
  for (const n of ['Hakushika Iori, Perfect Disguise', 'Hakushika Iori, Secret Agent', 'Tenma Maemi, Mii-chan', 'Tenma Maemi, 30ma', 'Tenma Maemi, Mrs. Worldwide']) {
    const t = mk(); t.bits('0', 0); const c = t.give('0', n); t.turn('0'); t.as('0', 'discardAbility', c.id);
    assert.equal(t.G().players['0'].bits, 1, n); assert.equal(t.G().players['0'].trash.at(-1).name, n);
  }
});
test('Discard: move your Persona to the clashing platform (clash only)', () => {
  for (const n of ['Utatane Nasa, Seiso Sleepy Dragon', 'Utatane Nasa, Kawaii Nasajira', 'Shisui Michiru, Da Michi', 'Shisui Michiru, Witch Half Cat', 'Rinkou Ashelia, Lia', 'Rinkou Ashelia, Cheerful Virus']) {
    const t = mk({ at0: 1 }); const c = t.give('0', n); t.turn('0'); t.as('0', 'discardAbility', c.id);
    assert.equal(t.G().personaLocations['0'], 1, n + ': not in the Content Phase');
    t.clash(); t.turn('0'); t.as('0', 'discardAbility', c.id); assert.equal(t.G().personaLocations['0'], 0, n);
  }
});

// ---------- Activate abilities ----------
test('Activate: Seiso Sleepy Dragon (spend 2 💎, draw 1) / Kawaii Nasajira (spend 3 💎, draw 2)', () => {
  for (const [n, cost, draw] of [['Utatane Nasa, Seiso Sleepy Dragon', 2, 1], ['Utatane Nasa, Kawaii Nasajira', 3, 2]]) {
    const t = mk({ p0: persona('Utatane Nasa'), up0: card(n).id }); t.as('0', 'dbgClearHand', '0'); t.bits('0', cost - 1); t.turn('0');
    assert.equal(canPersonaActivate(t.G(), '0'), false, 'not enough 💎'); t.as('0', 'activate'); assert.equal(t.G().players['0'].hand.length, 0);
    t.bits('0', cost + 1); t.turn('0'); assert.equal(canPersonaActivate(t.G(), '0'), true);
    t.as('0', 'activate'); assert.equal(t.G().players['0'].bits, 1, n); assert.equal(t.G().players['0'].hand.length, draw, n);
    t.turn('0'); assert.equal(canPersonaActivate(t.G(), '0'), false, 'once per round'); t.as('0', 'activate'); assert.equal(t.G().players['0'].hand.length, draw);
  }
});
test('Activate: Witch Half Cat deletes a Content card with 🟡5+ on this platform', () => {
  const t = mk({ p0: persona('Shisui Michiru'), up0: card('Shisui Michiru, Witch Half Cat').id }); t.turn('0');
  assert.equal(canPersonaActivate(t.G(), '0'), false, 'nothing to delete'); t.put('1', 0, 'Rage Game'); t.put('1', 1, 'Royalty Song'); t.turn('0');
  assert.equal(canPersonaActivate(t.G(), '0'), false, 'Royalty Song is on another platform; Rage Game costs 4');
  t.put('1', 0, 'Royalty Song'); t.put('0', 0, 'Cover Song'); t.turn('0'); t.as('0', 'activate');
  assert.deepEqual(t.ch().options.map((o) => o.name).sort(), ['Cover Song', 'Royalty Song'], 'any owner, 🟡5 or more only'); t.pick('0', 'Royalty Song');
  assert.deepEqual(t.names(t.G().players['1'].trash), ['Royalty Song']);
});
test('Activate: Gomi Kuma deletes 1 of your Content cards on any platform, then draws 2', () => {
  const t = mk({ p0: persona('Fujikura Uruka'), up0: card('Fujikura Uruka, Gomi Kuma').id }); t.as('0', 'dbgClearHand', '0'); t.turn('0');
  assert.equal(canPersonaActivate(t.G(), '0'), false, 'no Content of your own'); t.put('1', 0, 'Rage Game'); t.turn('0'); assert.equal(canPersonaActivate(t.G(), '0'), false, 'opponent Content does not count');
  t.put('0', 2, 'Charity Event'); t.turn('0'); t.as('0', 'activate'); t.pick('0', 'Charity Event');
  assert.deepEqual(t.names(t.G().players['0'].trash), ['Charity Event']); assert.equal(t.G().players['0'].hand.length, 2);
});
test('Sakana\'s old-style Activate still works', () => {
  const t = mk({ p0: persona('Sakana') }); t.turn('0'); const b = t.G().platforms[0].pmods['0']; assert.ok(personaAbility(t.G(), '0'));
  t.as('0', 'activate'); assert.equal(t.G().platforms[0].pmods['0'], b + 5);
});

// ---------- Clash Reward ----------
test('Mrs. Worldwide: Clash Reward draw 2, then discard 1', () => {
  const t = mk({ p0: persona('Tenma Maemi'), up0: card('Tenma Maemi, Mrs. Worldwide').id }); t.put('0', 0, 'Charity Event'); t.as('0', 'dbgClearHand', '0');
  t.clash(); t.passBoth(); assert.equal(t.G().players['0'].hand.length, 2); assert.equal(t.G().pendingDiscard['0'], 1);
});

finish();
