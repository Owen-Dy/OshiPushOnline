# Gameplay Regression Pass

## Scope
Reviewed the latest Cameo-updated project across the card database, game rules, effect handling, client rendering, deck rules, and the existing automated test suites.

## Static checks completed
- `node --check` passed for every project `.js` and `.mjs` source/test file.
- `npm run audit:cards` passed: 335 cards audited; no text-bearing cards without structured effects; 23 intentional blank-text cards (14 Platforms and 9 Content cards); no unexpected blank-text cards.
- Confirmed the test runner includes the Cameo suite and the suite now calls `finish()` only after all test declarations (two regression tests had previously been placed after the early `finish()` call and were therefore never executed).

## Gameplay correction
- Fixed Beko Genning interaction: it now suppresses the opposing Persona/Upgrade abilities on the shared Platform without also suppressing the opposing attached Cameo's own effects. Cameo stats and Cameo effects remain active.
- Added a regression test covering Beko Genning versus a Persona with an attached conditional Cameo ability.

## Runtime test/build status
The full automated gameplay suite and browser build could not be completed in this environment because dependencies could not be installed. `npm ci` timed out; the offline retry failed because required packages were not present in the local npm cache. The first test invocation consequently stopped at the missing `boardgame.io` dependency. No runtime pass is claimed.

## Commands to complete locally
```bash
npm ci
npm test
npm run test:bot-server
npm run build
npm run audit:cards
```

Resolve any failing tests before deploying. In particular, the new Beko regression and the full Cameo suite should be run in the installed environment.
