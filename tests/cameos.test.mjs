import assert from 'node:assert/strict';
import { sideInf, starsOf } from '../game.js';
import { mk, test, finish } from './harness.mjs';

const attach = (t, id, name) => t.play(id, name);

test('Cameo attaches to Persona and adds its printed Influence and Bits', () => {
  const t = mk(); t.bits('0', 20); attach(t, '0', 'Blobin');
  assert.equal(t.G().players['0'].cameo.name, 'Blobin');
  assert.equal(sideInf(t.G(), 0, '0'), 10, 'Pippa 4 + Blobin 6');
});

test('playing a new Cameo replaces the old one and trashes it', () => {
  const t = mk(); t.bits('0', 20); attach(t, '0', 'Pengu'); attach(t, '0', 'Alter Ego');
  assert.equal(t.G().players['0'].cameo.name, 'Alter Ego');
  assert.ok(t.G().players['0'].trash.some(c => c.name === 'Pengu'));
  assert.equal(sideInf(t.G(), 0, '0'), 4, 'Alter Ego contributes no printed Influence');
});

test('Blockheads makes each opponent discard one card when attached', () => {
  const t = mk(); t.bits('0', 20); const before = t.G().players['1'].hand.length;
  attach(t, '0', 'Blockheads');
  assert.equal(t.G().pendingDiscard['1'], 1);
  assert.equal(t.G().players['1'].hand.length, before);
});

test('Minky(e) offers an optional move to another Platform when played', () => {
  const t = mk(); t.bits('0', 20); attach(t, '0', 'Minky(e)');
  assert.equal(t.ch().kind, 'platform');
  assert.deepEqual(t.ch().options.map(o => o.platform).sort(), [1, 2]);
  t.pick('0', '1');
  assert.equal(t.G().personaLocations['0'], 1);
  assert.equal(t.G().players['0'].cameo.name, 'Minky(e)');
});

test('CeriYun grants +2 Persona Influence while dominating this Platform', () => {
  const t = mk(); t.bits('0', 20); t.put('0', 0, 'Rage Game'); t.bits('1', 0); attach(t, '0', 'CeriYun');
  assert.equal(sideInf(t.G(), 0, '0'), 12, 'Pippa 4 + Cameo 0 + dominating bonus 2 + Rage Game 6');
});

test('Bellyr Adsala grants +2 per Platform with your Content', () => {
  const t = mk(); t.bits('0', 20); t.put('0', 0, 'Rage Game'); t.put('0', 1, 'Rage Game'); attach(t, '0', 'Bellyr Adsala');
  assert.equal(sideInf(t.G(), 0, '0'), 14, 'Pippa 4 + two Content Platforms x2 + Rage Game 6');
});

test('Grubbies reduces opposing Content Influence by 3 only on its Persona Platform', () => {
  const t = mk(); t.bits('0', 20); t.put('1', 0, 'Rage Game'); attach(t, '0', 'Grubbies');
  const c = t.G().platforms[0].cards['1'][0];
  assert.equal(starsOf(t.G(), 0, '1', c), 3, 'Rage Game 6 - 3');
});

test('VTuberSenpai grants +3 when you have fewer Content cards here', () => {
  const t = mk(); t.bits('0', 20); t.put('1', 0, 'Rage Game'); attach(t, '0', 'VTuberSenpai');
  assert.equal(sideInf(t.G(), 0, '0'), 10, 'Pippa 4 + Cameo 3 + conditional bonus 3');
});

test('Captain Chia gains Persona Influence for each opposing Popularity marker here', () => {
  const t = mk(); t.bits('0', 20); t.as('0', 'dbgSetPop', 0, '1', 2); attach(t, '0', 'Captain Chia');
  assert.equal(sideInf(t.G(), 0, '0'), 10, 'Pippa 4 + Captain Chia 2 + 2 markers x2');
});

test('DISCARD Cameo abilities are usable in hand and move to the Trash', () => {
  const t = mk(); t.bits('0', 20); t.clash(); const c = t.give('0', 'Blobin'); t.turn('0');
  t.as('0', 'discardAbility', c.id);
  assert.ok(t.G().players['0'].trash.some(x => x.name === 'Blobin'));
  assert.equal(t.G().platforms[0].pmods['0'], 2);
});

test('Beko Genning suppresses opposing Persona abilities on the shared Platform', () => {
  const t = mk({ p0: 'Pipkin Pippa', p1: 'Captain Camille' });
  t.bits('0', 20); t.put('1', 0, 'Rage Game'); t.put('1', 0, 'Rage Game'); attach(t, '0', 'Beko Genning');
  const before = sideInf(t.G(), 0, '1');
  assert.equal(before, 15, 'Captain Camille and its two Content cards remain, but the dominating bonus is negated');
});

test('Cameo discard abilities gain Bits for Blockheads, Alter Ego, VTuberSenpai and Pengu', () => {
  for (const name of ['Blockheads', 'Alter Ego', 'VTuberSenpai', 'Pengu']) {
    const t = mk(); const before = t.G().players['0'].bits; t.give('0', name); t.turn('0');
    const c = t.G().players['0'].hand.find(x => x.name === name);
    t.as('0', 'discardAbility', c.id);
    assert.equal(t.G().players['0'].bits, before + 1, `${name} gains 1 💎`);
    assert.ok(t.G().players['0'].trash.some(x => x.name === name));
  }
});

test('Cameo Clash discard abilities move the Persona here for CeriYun, Minky(e), D.A.I.S.Y. and Beko Genning', () => {
  for (const name of ['CeriYun', 'Minky(e)', 'D.A.I.S.Y.', 'Beko Genning']) {
    const t = mk({ at0: 1 }); t.clash(); t.give('0', name); t.turn('0');
    const c = t.G().players['0'].hand.find(x => x.name === name);
    t.as('0', 'discardAbility', c.id);
    assert.equal(t.G().personaLocations['0'], 0, `${name} moves Persona to the clashing Platform`);
  }
});

test('Nose Pull can delete an opposing attached Cameo', () => {
  const t = mk(); t.bits('1', 20); t.turn('1'); t.play('1', 'Pengu');
  t.clash(); t.give('0', 'Nose Pull'); t.turn('0');
  const action = t.G().players['0'].hand.find(c => c.name === 'Nose Pull');
  t.as('0', 'playCard', action.id, 0);
  assert.ok(t.ch().options.some(o => o.name === 'Pengu'));
  t.pick('0', 'Pengu');
  assert.equal(t.G().players['1'].cameo, null);
  assert.ok(t.G().players['1'].trash.some(c => c.name === 'Pengu'));
});

test('Beko Genning suppresses opposing Persona abilities but does not suppress the opposing Cameo ability', () => {
  const t = mk({ p0: 'Pipkin Pippa', p1: 'Captain Camille' });
  t.bits('0', 20); t.bits('1', 20);
  // Player 0 has Beko on the shared Platform; player 1's attached Cameo must
  // still contribute its own passive even though Captain Camille is negated.
  t.turn('1'); t.play('1', 'CeriYun');
  t.turn('0'); t.play('0', 'Beko Genning');
  assert.equal(sideInf(t.G(), 0, '1'), 4, 'CeriYun is not dominating, so its conditional is off; base Persona ability is suppressed');
  t.put('1', 0, 'Rage Game');
  assert.equal(sideInf(t.G(), 0, '1'), 12, 'Cameo stats and its own abilities remain active');
});

finish();
