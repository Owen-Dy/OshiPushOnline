// Gen 2 Upgrade coverage: data completeness and the implemented rules hooks.
import assert from 'assert';
import { CARDS } from '../cards.js';
import { mk, test, finish, card, persona } from './harness.mjs';
import { sideInf } from '../game.js';

const NAMES = [
  'Edenia Euclase', 'Fluffy Crystal Dragon', 'Not a Vampire', 'Retired Captain',
  'Jowol the Caretaker', 'Damiya The Maternal', 'Scuff Cat', 'Lore Cat',
  'Sweaty Tomboy', 'Timeline B', 'The Bottom Line', 'Femboy Princess',
  'Dad That Stepped Up', 'Bepis Addict',
];
const get = (name) => CARDS.find((c) => c.name === name);
const fx = (name, type) => (get(name)?.effects || []).filter((e) => e.type === type);

test('all 14 Gen 2 Upgrades have implemented effect data', () => {
  for (const name of NAMES) {
    const c = get(name);
    assert.ok(c && c.type === 'Upgrade' && c.set === 'Gen 2', `${name} is a Gen 2 Upgrade`);
    assert.ok(c.effects?.length, `${name} has effects`);
    if (/DISCARD/i.test(c.text)) assert.ok(fx(name, 'discardAbility').length, `${name}: Discard`);
  }
  for (const name of ['Jowol the Caretaker', 'Damiya The Maternal', 'Scuff Cat', 'Lore Cat', 'Dad That Stepped Up'])
    assert.ok(fx(name, 'clashReward').length, `${name}: Clash Reward`);
});

test('Edenia Euclase and Fluffy Crystal Dragon give their cost-limited aura', () => {
  for (const [name, amount] of [['Edenia Euclase', 2], ['Fluffy Crystal Dragon', 3]]) {
    const a = fx(name, 'aura')[0];
    assert.equal(a.amount, amount);
    assert.equal(a.affects, 'otherOwn');
    assert.equal(a.costMax, 4);
  }
});

test('Not a Vampire and Retired Captain have their optional deletion and domination bonuses', () => {
  for (const [name, cost, amount] of [['Not a Vampire', 2, 2], ['Retired Captain', 4, 4]]) {
    assert.equal(fx(name, 'pickCard')[0].pick.costMax, cost);
    assert.equal(fx(name, 'pickCard')[0].pick.owner, 'opp');
    assert.equal(fx(name, 'pickCard')[0].optional, true);
    assert.equal(fx(name, 'personaWhile')[0].condition, 'dominatingAny');
    assert.equal(fx(name, 'personaWhile')[0].amount, amount);
  }
});

test('Scuff Cat and Lore Cat play discounted Content from Trash onto an empty platform', () => {
  assert.equal(fx('Scuff Cat', 'playTrashEmpty')[0].reduce, 3);
  assert.equal(fx('Lore Cat', 'playTrashEmpty')[0].reduce, 7);
  for (const name of ['Scuff Cat', 'Lore Cat']) assert.equal(fx(name, 'clashReward')[0].effects[0].type, 'millTopOptional');
});

test('Sweaty Tomboy and Timeline B reveal the top card and reorder the top three when played', () => {
  for (const name of ['Sweaty Tomboy', 'Timeline B']) {
    assert.ok(fx(name, 'revealTop').length);
    assert.ok(fx(name, 'topCostStars').length);
    assert.equal(fx(name, 'reorderTop')[0].count, 3);
  }
  assert.equal(fx('Timeline B', 'reorderTop')[0].draw, 1);
});

test('LineChu premium Upgrades grant the correct bonus and protect face-up Premium Content', () => {
  for (const [name, amount] of [['The Bottom Line', 2], ['Femboy Princess', 4], ['Bepis Addict', 3]]) {
    assert.equal(fx(name, 'personaBonus')[0].amount, amount);
    assert.ok(fx(name, 'protectPremiumHere').length);
    assert.ok(fx(name, 'discardAbility').length);
  }
});

finish();
