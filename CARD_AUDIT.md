# Card implementation audit — Cameo pass

Audited the 335 cards in `cards.js`, generated from `cards.csv`.

## Cameos

All 12 Gen 2 Cameos now have structured effects and engine support:

- **Blobin** — Clash-only discard ability: Persona gains +2 ⭐ this clash.
- **CeriYun** — Persona gains +2 ⭐ while Dominating this Platform; Clash-only discard ability moves Persona here.
- **Blockheads** — When attached, each opponent discards 1 card; discard ability gains 1 💎.
- **Bellyr Adsala** — Persona gains +2 ⭐ per Platform where you have Content; Clash-only discard ability gives +2 ⭐.
- **Minky(e)** — When attached, you may move your Persona to another Platform; Clash-only discard ability moves Persona here.
- **Alter Ego** — Discard ability gains 1 💎.
- **Grubbies** — Opposing Content on the Persona's Platform loses 3 ⭐; Clash-only discard ability gives Persona +2 ⭐.
- **D.A.I.S.Y.** — Clash-only discard ability moves Persona to this Platform.
- **VTuberSenpai** — Persona gains +3 ⭐ while you have fewer Content cards here than an opponent; discard ability gains 1 💎.
- **Captain Chia** — Persona gains +2 ⭐ for each opposing 🌠 on its Platform; Clash-only discard ability gives +2 ⭐.
- **Beko Genning** — Negates opposing Persona abilities on the same Platform; Clash-only discard ability moves Persona here.
- **Pengu** — Discard ability gains 1 💎.

### Cameo rules implemented

- Cameos are main-deck cards and can be played during the Content Phase by paying their printed cost.
- A played Cameo attaches to its owner's Persona; its printed Influence and Bits are added to the active Persona's values.
- Only one Cameo can be attached at a time. Playing another replaces the old Cameo, which goes to its owner's Trash.
- Attached Cameo effects remain active alongside the Persona or Upgrade effects.
- Cameo Discard abilities are available from hand under their printed timing restrictions.
- Cameos are visible attached to the Persona in the board UI.
- Nose Pull can target and delete an opposing Cameo attached to a Persona on the current Platform.
- Random-deck generation now includes Cameos.

## Full database audit

| Type | Total | Text-bearing cards with structured effects |
|---|---:|---:|
| Persona | 14 | 14 |
| Upgrade | 30 | 30 |
| Action | 73 | 73 |
| Content | 161 | 161 |
| Platform | 45 | 31 (14 intentional no-text Platforms) |
| Cameo | 12 | 12 |

The 14 no-text Platforms and nine no-text Content cards listed below are intentional vanilla cards, not missing implementations.

### Intentional no-text Platforms

Click Clock, Gamble Punch, Phase Weekly, RapidTele, Heartbreaker Hotline, Sad Girl Company, Convention Circuit, CollabCast, Webflip, String, Festive, Scuff Pod, U-TOOB, U-JORTS.

### Intentional no-text Content

POGCHAMP, Gaming Marathon, NPC Carry, How's Your Mom?, No Survival Instinct, One Chip Challenge, Fan Art, Meow, Wear Thigh Highs.

## Validation status

- `node scripts/import-cards.js` regenerated `cards.js` with all 12 Cameos receiving structured effects.
- `node scripts/audit-cards.mjs` passes: no text-bearing card is missing structured effect data; no unexpected blank rules text.
- `node --check` passes for the edited JavaScript and test files.
- A new `tests/cameos.test.mjs` suite covers attachment, replacement, printed stats, play triggers, conditional abilities, Persona suppression, and Discard abilities.
- Full runtime tests and browser bundle rebuild remain unverified: dependency installation timed out and `boardgame.io` / `esbuild` are unavailable in this environment. Run `npm ci`, `npm test`, and `npm run build` before deployment.
