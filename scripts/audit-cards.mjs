import { CARDS } from '../cards.js';

const structured = (c) => Boolean(
  (c.effects || []).length || (c.passives || []).length || (c.clashReward || []).length ||
  c.activate || c.playOnly || (c.abilities || []).length
);
const byType = (type) => CARDS.filter((c) => c.type === type);
const textMissingEffects = CARDS.filter((c) => c.text?.trim() && !structured(c));
const noRulesText = CARDS.filter((c) => !c.text?.trim());
const knownVanilla = {
  Platform: ['Click Clock', 'Gamble Punch', 'Phase Weekly', 'RapidTele', 'Heartbreaker Hotline', 'Sad Girl Company', 'Convention Circuit', 'CollabCast', 'Webflip', 'String', 'Festive', 'Scuff Pod', 'U-TOOB', 'U-JORTS'],
  Content: ['POGCHAMP', 'Gaming Marathon', 'NPC Carry', "How's Your Mom?", 'No Survival Instinct', 'One Chip Challenge', 'Fan Art', 'Meow', 'Wear Thigh Highs'],
};
const unexpectedBlank = noRulesText.filter((c) => !(knownVanilla[c.type] || []).includes(c.name));
const unimplemented = textMissingEffects;

console.log(`Cards audited: ${CARDS.length}`);
for (const type of ['Persona', 'Upgrade', 'Action', 'Content', 'Platform', 'Cameo']) {
  const list = byType(type);
  const missing = textMissingEffects.filter((c) => c.type === type);
  console.log(`${type}: ${list.length} total; ${list.length - missing.length} with structured effects; ${missing.length} text-only`);
}
console.log(`Blank rules text: ${noRulesText.length} (${unexpectedBlank.length} unexpected)`);
for (const [type, names] of Object.entries(knownVanilla)) console.log(`Intentional no-text ${type}: ${names.join(', ')}`);
if (textMissingEffects.length) {
  console.log('Text-bearing cards without structured effects:');
  for (const c of textMissingEffects) console.log(`  ${c.id} ${c.type}: ${c.name}`);
}
if (unexpectedBlank.length || unimplemented.length) process.exitCode = 1;
