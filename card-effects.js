// Hand-written effects for Action cards that need a player to make a choice (or that the text parser can't read).
// The importer (npm run cards) uses these instead of parsing the card's text. Keys are exact card names.
//
// pickCard: the player picks card(s) on the board, then `then` happens to them.
//   pick:   scope 'here' | 'other' | 'any' (relative to the platform the card is played on), owner 'mine' | 'opp' | 'any',
//           optional costMax, starsMax, costLtHand (cost less than the cards in your hand), persona: true (Personas can be picked too)
// Other effect types used here: personaReward (gives the Persona a Clash Reward for this round), lookPlay (look at the top cards, play a Content card),
//   playFromTrash (the Action may be played from the Trash).
//   then:   do 'mod' (amount | amountPer | amountFrom: 'hand', drawIf), 'zero', 'double', 'delete', 'return', 'reward'
const hereAny = { scope: 'here', owner: 'any' };

export default {
  'Hype': [{ type: 'pickCard', prompt: 'Hype: choose a Content card on this platform to gain +5 ⭐ this clash', pick: hereAny, then: { do: 'mod', amount: 5 } }],
  'Diss Track': [{ type: 'pickCard', prompt: 'Diss Track: choose an opposing Content card on this platform; its ⭐ becomes 0 this clash', pick: { scope: 'here', owner: 'opp' }, then: { do: 'zero' } }],
  'Brother Lover': [{ type: 'pickCard', prompt: 'Brother Lover: choose a Content card; its printed ⭐ is doubled this clash', pick: { scope: 'any', owner: 'any' }, then: { do: 'double' } }],
  'Sound Alert Jumpscare': [{ type: 'pickCard', prompt: 'Sound Alert Jumpscare: choose one of your Content cards (+3 ⭐ this clash for each platform where you have Content)', pick: { scope: 'any', owner: 'mine' }, then: { do: 'mod', amountPer: 3 } }],
  'FAQ YU': [{ type: 'pickCard', prompt: 'FAQ YU: choose a Persona or Content card; it gains ⭐ equal to the cards in your hand this round', pick: { scope: 'any', owner: 'any', persona: true }, then: { do: 'mod', amountFrom: 'hand' } }],
  'Embrace Scuff': [{ type: 'pickCard', prompt: 'Embrace Scuff: choose a Content card to gain +7 ⭐ this clash (draw 1 if it is on an Independent platform)', pick: { scope: 'any', owner: 'any' }, then: { do: 'mod', amount: 7, drawIf: { tag: 'Independent', n: 1 } } }],
  'Vomit Drawer': [{ type: 'pickCard', prompt: 'Vomit Drawer: delete an opposing Content card with 6 ⭐ or less', pick: { scope: 'any', owner: 'opp', starsMax: 6 }, then: { do: 'delete' } }],
  'Desk Slam': [{ type: 'pickCard', prompt: 'Desk Slam: delete a Content card with 🟡3 or less', pick: { scope: 'any', owner: 'any', costMax: 3 }, then: { do: 'delete' } }],
  'Yell at Fish': [{ type: 'pickCard', prompt: 'Yell at Fish: delete a Content card with 🟡 less than the number of cards in your hand', pick: { scope: 'any', owner: 'any', costLtHand: true }, then: { do: 'delete' } }],
  'Succumb to Cringe': [{ type: 'pickCard', prompt: 'Succumb to Cringe: return a Content card with 🟡3 or less to its owner\'s hand', pick: { scope: 'any', owner: 'any', costMax: 3 }, then: { do: 'return' } }],
  'Sponsorship': [{ type: 'pickCard', prompt: 'Sponsorship: choose one of your Content cards on this platform to gain "Clash Reward: Gain 3 💎"', pick: { scope: 'here', owner: 'mine' }, then: { do: 'reward', effects: [{ type: 'bits', target: 'self', amount: 3 }], text: 'Gain 3 💎.' } }],
  'My Time': [{ type: 'pickCard', prompt: 'My Time: choose one of your Content cards on another platform to move here', pick: { scope: 'other', owner: 'mine' }, then: { do: 'moveHere' } }],
  'Bear With Me': [{ type: 'bearWithMe', prompt: 'Bear With Me: choose 1 Content card on this platform to keep (all others are deleted)' }],
  'Potion': [{ type: 'potion', bonusPersona: 'Shisui Michiru', prompt: 'Potion: choose a Persona or Content card on this platform to move' }],
  'No Show': [{ type: 'noShow', prompt: 'No Show: choose an opposing Content card to lose 3 ⭐ this clash' }],
  'Killer Hands': [{ type: 'revealPick', count: 4, n: 1, nIf: { persona: 'Hakushika Iori', n: 2 }, prompt: 'Killer Hands: draw an Action card from the revealed cards (the rest go to the bottom of your deck)' }],
  'Watchalong': [{ type: 'playHand', prompt: 'Watchalong: play a Content card from your hand on this platform (you pay its 🟡)' }],
  'LVL 2 Naked Club': [{ type: 'playTrash', maxTotal: 5, prompt: 'LVL 2 Naked Club: play Content cards from your Trash for free (combined 🟡 of 5 or less)' }],
  'Internet Historian': [{ type: 'trashToHand', max: 1, maxIf: { persona: 'Rinkou Ashelia', max: 2 }, prompt: 'Internet Historian: return Content cards from your Trash to your hand' }],
  'Sudden Rizz': [{ type: 'discardDraw', draw: 2, prompt: 'Sudden Rizz: choose a card to discard, then draw 2' }],
  'PIPIPIPIPI': [
    { type: 'personaInf', target: 'self', amount: 7 },
    { type: 'movePersona', if: { persona: 'Pipkin Pippa' }, prompt: 'PIPIPIPIPI: you may move Pipkin Pippa to another platform' },
  ],
  'Gaslight': [{ type: 'movePop', from: 'other', prompt: 'Gaslight: move 1 of your 🌠 from which platform to this one?' }],
  'Controlling The Narrative': [{ type: 'movePop', from: 'here', prompt: 'Controlling The Narrative: move 1 of your opponent\'s 🌠 from this platform to which platform?' }],
  // Utatane Nasa only. The Persona gets a Clash Reward for this round: look at the top 3, play 1 Content from them to any platform, reorder the rest.
  "I'll Crush You!": [{
    type: 'personaReward',
    text: 'Look at the top 3 cards of your deck. You may play 1 Content card you find there to any Platform (paying its 🟡 normally). Put the other cards back on top of your deck in any order.',
    effects: [{ type: 'lookPlay', count: 3 }],
  }],
  // Hakushika Iori only, during a clash. 'playFromTrash': it can also be played from the Trash (then it goes to the bottom of the deck).
  'Scary Story Writing': [{ type: 'playFromTrash' }, { type: 'personaInf', target: 'self', amount: 3 }],
  'ARA ARA': [{ type: 'moveAll', prompt: 'ARA ARA: move all of your Content cards from which platform to this one?' }],

  // ================= CONTENT CARDS =================
  // Effect types used below (all implemented in game.js):
  //   (plain effects)   run when the card is played ("When Played"): pickCard, draw, bits, discard, deleteContent, ...
  //   selfStars         "This card gains +N ⭐ while/for each ..."   when: dominating | noOppPop | independent | onlyContent | oppHandAtLeast;  per: hand | otherCheapContent | otherPlatformsGenre
  //   aura              other Content cards on this platform gain/lose ⭐ (affects: otherAll | opp)
  //   onPlay            "When you play a Content/Action card ...": event, here, includeSelf, during, minCost, genre, then: [effects]
  //   clashReward       "Clash Reward: ..."  (if: condition, effects: [...])
  //   discardAbility    "Discard: ..." (from your hand, uses your turn)            move: discardAbility(cardId)
  //   activate          "Activate: ..." (once per round, uses your turn)           move: activateCard(cardId)
  //   kickback          bits gained when you LOSE a clash at this card's platform (when: otherGenre = only while you have another card of that genre in play)
  //   restrictions      blockPlay, oneContentPerRound, oppCostUp, actionDiscount, contentDiscountOther, playAnywhere,
  //                     noOppPop, undeletable, returnInsteadOfDelete, oppZeroWhenDominating, popReplace, refreshReturn
  'Eat a Spider': [{ type: 'onPlay', event: 'content', here: true, includeSelf: true, then: [
    { type: 'pickCard', prompt: 'Eat a Spider: delete an opposing Content card on this platform with less ⭐ than the card you just played', pick: { scope: 'here', owner: 'opp', starsLtPlayed: true }, then: { do: 'delete' } }] }],
  'Dragon Deez': [
    { type: 'pickCard', prompt: 'Dragon Deez: choose an opposing Content card on this platform to lose -4 ⭐ this round', pick: { scope: 'here', owner: 'opp' }, then: { do: 'mod', amount: -4 } },
    { type: 'refreshReturn', persona: 'Utatane Nasa' }],
  'Japanese Lesson': [{ type: 'onPlay', event: 'action', here: true, during: 'clash', then: [
    { type: 'pickCard', prompt: 'Japanese Lesson: delete an opposing Content card on this platform with 5 ⭐ or less', pick: { scope: 'here', owner: 'opp', starsMax: 5 }, then: { do: 'delete' } }] }],
  'Witch Mommy Energy': [{ type: 'selfStars', amount: 3, per: 'otherCheapContent', costMax: 3 }],
  'The Cringe Song': [{ type: 'aura', affects: 'otherAll', amount: -3 }],
  'Feet: A Holy Deep Dive': [{ type: 'clashReward', if: { starsLead: 5 }, text: 'If you have at least 5 more ⭐ than your opponent at this Platform, draw 2 cards.', effects: [{ type: 'draw', target: 'self', amount: 2 }] }],
  'Cabbage Voice Pack': [{ type: 'selfStars', amount: 1, per: 'hand' }],
  'Pippa The Rippa': [{ type: 'clashReward', text: 'You may play 1 Content card with 🟡3 or less on this Platform for free.', effects: [
    { type: 'playHandFree', costMax: 3, prompt: "Pippa The Rippa: you may play a Content card with 🟡3 or less from your hand on this platform for free" }] }],
  'Depressed Single Divorced Fathers': [{ type: 'onPlay', event: 'content', here: true, then: [
    { type: 'moveSelf', optional: true, prompt: 'Depressed Single Divorced Fathers: you may move this card to another platform' }] }],
  'Game Flavor of the Week': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'personaInf', target: 'self', amount: 2 }] }],
  'Moldy Bread': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'personaInf', target: 'self', amount: 2 }] }],
  'Karaoke Night': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'personaInf', target: 'self', amount: 2 }] }],
  'Mega Capping': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'personaInf', target: 'self', amount: 2 }] }],
  'Continued Gameplay': [{ type: 'selfStars', amount: 3, when: { dominating: true } }],
  'Closed Beta': [{ type: 'onPlay', event: 'action', here: true, during: 'clash', then: [{ type: 'selfMod', amount: 3 }] }],
  'Long Game': [{ type: 'clashReward', if: { dominating: true }, text: 'If you are Dominating this Platform, gain 1 🌠 on another Platform.', effects: [
    { type: 'gainPopOther', prompt: 'Long Game: gain 1 🌠 on which other platform?' }] }],
  'Toxic Gaming': [{ type: 'pickCard', optional: true, prompt: 'Toxic Gaming: you may spend 🟡X to delete an opposing Content card on this platform with 🟡X or less (choose it; you pay its 🟡)', pick: { scope: 'here', owner: 'opp', affordable: true }, then: { do: 'delete', payCost: true } }],
  'Sweaty Gaming': [{ type: 'pickCard', optional: true, if: { dominating: true }, prompt: 'Sweaty Gaming: you may delete a Content card on this platform with 🟡5 or more', pick: { scope: 'here', owner: 'any', costMin: 5 }, then: { do: 'delete' } }],
  'Spooky Town': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'movePersonaHere' }] }],
  'Debut Stream': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'movePersonaHere' }] }],
  'Background Dogs Barking': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'movePersonaHere' }] }],
  'UWU': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'movePersonaHere' }] }],
  'Puzzling Puzzle': [{ type: 'blockPlay', costMin: 5 }],
  'Mahjong Tournament': [{ type: 'pickCard', if: { independent: true }, prompt: 'Mahjong Tournament: delete an opposing Content card on any platform', pick: { scope: 'any', owner: 'opp' }, then: { do: 'delete' } }],
  'Sus Gameplay': [{ type: 'clashReward', if: { dominating: true }, text: 'If you are Dominating this Platform, you may move this card to another Platform.', effects: [
    { type: 'moveSelf', optional: true, prompt: 'Sus Gameplay: you may move this card to another platform' }] }],
  'Gold Farming': [{ type: 'kickback', amount: 1, when: { otherGenre: 'Poggers' } }],
  'Suck on Copium': [{ type: 'discardAbility', effects: [{ type: 'bits', target: 'self', amount: 1 }] }],
  'Fund Raiser': [{ type: 'discardAbility', effects: [{ type: 'bits', target: 'self', amount: 1 }] }],
  'Anniversary Celebration': [{ type: 'discardAbility', effects: [{ type: 'bits', target: 'self', amount: 1 }] }],
  'VTuber Coffee': [{ type: 'discardAbility', effects: [{ type: 'bits', target: 'self', amount: 1 }] }],
  'Rage Game': [{ type: 'discard', target: 'opponent', amount: 1 }],
  'Batsu Bracket': [{ type: 'discard', target: 'opponent', amount: 2 }],
  'Gamer Fluid': [{ type: 'onPlay', event: 'content', here: true, includeSelf: true, genre: 'Poggers', then: [{ type: 'draw', target: 'self', amount: 1 }] }],
  'Speedrun': [{ type: 'actionDiscount', amount: 3, min: 1 }],
  'Guerrilla Stream': [{ type: 'playAnywhere' }],
  'Drop In Call': [{ type: 'playAnywhere' }],
  'You Laugh You Lose': [{ type: 'selfStars', amount: 3, when: { noOppPop: true } }],
  'Yapping': [{ type: 'selfStars', amount: 3, per: 'otherPlatformsGenre', genre: 'Zatsudan' }],
  'Burned Toast Tart': [{ type: 'activate', effects: [{ type: 'revealTopCost' }] }],
  'Rent Free': [{ type: 'undeletable' }],
  'Edgelord Behavior': [{ type: 'pickCard', prompt: 'Edgelord Behavior: delete an opposing Content card on this platform with 5 ⭐ or less', pick: { scope: 'here', owner: 'opp', starsMax: 5 }, then: { do: 'delete' } }],
  'Disruption Stream': [{ type: 'activate', bits: 3, effects: [{ type: 'oppMovePop' }] }],
  'Big Head Moment': [{ type: 'movePop', from: 'other', if: { independent: true }, prompt: 'Big Head Moment: move 1 of your 🌠 from which platform to this one?' }],
  'AD Break': [{ type: 'pickCard', prompt: 'AD Break: delete an opposing non-Zatsudan Content card in play', pick: { scope: 'any', owner: 'opp', genreNot: 'Zatsudan' }, then: { do: 'delete' } }],
  'Charity Event': [{ type: 'kickback', amount: 1 }],
  'Royalty Song': [{ type: 'kickback', amount: 2 }],
  'Marshmallows': [{ type: 'draw', target: 'self', amount: 1 }],
  'Donothon': [{ type: 'activate', effects: [{ type: 'bitsPer', amount: 1 }] }],
  'Math Stream': [{ type: 'oppCostUp', amount: 1 }],
  'Clip Out of Context': [{ type: 'contentDiscountOther', amount: 2 }, { type: 'anyPlatformThisRound' }],
  'Birthday Special': [{ type: 'selfStars', amount: 3, when: { independent: true } }],
  'From Our Hearts': [{ type: 'selfStars', amount: 5, when: { onlyContent: true } }],
  "Let 'em Cook": [{ type: 'deleteContent', scope: 'here', owner: 'mine', excludeSelf: true }],
  'Cover Song': [{ type: 'activate', effects: [{ type: 'playTrashSpend', genre: 'Creatives', prompt: 'Cover Song: play a Creatives Content card from your Trash (you spend its 🟡)' }] }],
  'Masterpiece': [{ type: 'clashReward', text: 'Steal 1 🌠 from an opponent on this Platform.', effects: [{ type: 'stealPop', target: 'self', amount: 1 }] }],
  'ADpocalypse': [{ type: 'pickCard', prompt: 'ADpocalypse: choose an opposing Content card on this platform to lose -2 ⭐ this round', pick: { scope: 'here', owner: 'opp' }, then: { do: 'mod', amount: -2 } }],
  'Original Song': [{ type: 'clashReward', text: 'Draw 1 card, then discard 1 card.', effects: [{ type: 'draw', target: 'self', amount: 1 }, { type: 'discard', target: 'self', amount: 1 }] }],
  'Dog Food Regret': [{ type: 'aura', affects: 'opp', amount: -2 }],
  'Campfire Guitar': [{ type: 'pickCard', prompt: 'Campfire Guitar: choose an opposing Content card on this platform; its ⭐ becomes 0 this round', pick: { scope: 'here', owner: 'opp' }, then: { do: 'zero' } }],
  'Craft Show': [{ type: 'oneContentPerRound' }],
  'Encore Performance': [{ type: 'trashToHand', any: true, min: 1, max: 1, prompt: 'Encore Performance: return 1 card from your Trash to your hand' }],
  'Requested Song Stream': [{ type: 'activate', bits: 3, effects: [{ type: 'lookTrashHand', count: 2 }] }],
  'Christmas Special': [{ type: 'onPlay', event: 'content', minCost: 4, then: [{ type: 'bits', target: 'self', amount: 1 }] }],
  'Halloween Special': [{ type: 'activate', effects: [{ type: 'playTrashAction', costMax: 3, prompt: 'Halloween Special: play an Action card with 🟡3 or less from your Trash for free' }] }],
  'Cinema Date': [{ type: 'oppZeroWhenDominating' }],
  'Origins Video': [{ type: 'onPlay', event: 'content', includeSelf: true, genre: 'Experience', then: [{ type: 'selfMod', amount: 2 }] }],
  'Court Room Roleplay': [{ type: 'selfStars', amount: 3, when: { oppHandAtLeast: 3 } }],
  'Mukbang ASMR': [{ type: 'activate', timing: 'content', effects: [{ type: 'moveSelf', prompt: 'Mukbang ASMR: move this card to which platform?' }] }],
  'Scary Yandere Roleplay': [{ type: 'popReplace', perOppHand: true }],
  'First Date': [{ type: 'activate', selfTo: 'deckTop', effects: [
    { type: 'pickCard', prompt: 'First Date: return a Content card with 🟡2 or less on this platform to its owner\'s hand', pick: { scope: 'here', owner: 'any', costMax: 2, excludeSelf: true }, then: { do: 'return' } }] }],
  'Thriller Story Reading': [{ type: 'moveOppAll', if: { independent: true }, prompt: 'Thriller Story Reading: move all opposing Content cards from this platform to which platform?' }],
  'Peaceful ASMR': [{ type: 'pickCard', optional: true, prompt: 'Peaceful ASMR: you may return 1 Content card from this platform to its owner\'s hand', pick: { scope: 'here', owner: 'any' }, then: { do: 'return' } }],
  'Confessional Stream': [{ type: 'pickCard', prompt: 'Confessional Stream: choose one of your other Content cards; it gains +4 ⭐ this round', pick: { scope: 'any', owner: 'mine', excludeSelf: true }, then: { do: 'mod', amount: 4 } }],
  'Year 0 Science': [{ type: 'noOppPop' }],
  'Puzzle Hand Cam': [{ type: 'returnInsteadOfDelete' }],
  'Mama Cameo': [{ type: 'activate', selfTo: 'hand', effects: [{ type: 'bits', target: 'self', amount: 2 }] }],
  'Updated Model Stream': [{ type: 'bits', target: 'self', amount: 2, if: { upgraded: true } }],
  'Menhara Club': [{ type: 'selfMod', amount: 10 }, { type: 'kickback', amount: 3 }],

  // ================= UPGRADE CARDS =================
  // Upgrades are played from your hand onto your Persona. Their abilities:
  //   discardAbility   "Discard: ..." (from your hand, uses your turn; timing 'clash' = only during a clash)   button under the card in your hand
  //   personaActivate  "Activate: ..." for your Persona once it has this Upgrade (bits = cost, once per round)   the Activate button above your hand
  //   clashReward      the Persona's Clash Reward when the importer could not read it
  // Printed Clash Rewards and passives that the importer already reads are not repeated here.
  'Pipkin Pippa, Filippa': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'personaInf', target: 'self', amount: 2 }] }],
  'Pipkin Pippa, Shipkin Shippa': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'personaInf', target: 'self', amount: 2 }] }],
  'Pipkin Pippa, Yabbit': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'personaInf', target: 'self', amount: 2 }] }],
  'Fujikura Uruka, Urufu': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'personaInf', target: 'self', amount: 2 }] }],
  'Fujikura Uruka, Gomi Kuma': [
    { type: 'discardAbility', timing: 'clash', effects: [{ type: 'personaInf', target: 'self', amount: 2 }] },
    { type: 'personaActivate', name: 'Delete 1 of your Content cards: draw 2 cards', limitPerRound: 1, effects: [
      { type: 'pickCard', prompt: 'Gomi Kuma: delete 1 of your Content cards on any platform, then draw 2 cards', pick: { scope: 'any', owner: 'mine' }, then: { do: 'delete', draw: 2 } }] }],
  'Hakushika Iori, Perfect Disguise': [{ type: 'discardAbility', effects: [{ type: 'bits', target: 'self', amount: 1 }] }],
  'Hakushika Iori, Secret Agent': [{ type: 'discardAbility', effects: [{ type: 'bits', target: 'self', amount: 1 }] }],
  'Tenma Maemi, Mii-chan': [{ type: 'discardAbility', effects: [{ type: 'bits', target: 'self', amount: 1 }] }],
  'Tenma Maemi, 30ma': [{ type: 'discardAbility', effects: [{ type: 'bits', target: 'self', amount: 1 }] }],
  'Tenma Maemi, Mrs. Worldwide': [
    { type: 'clashReward', text: 'Draw 2 cards, then discard 1 card.', effects: [{ type: 'draw', target: 'self', amount: 2 }, { type: 'discard', target: 'self', amount: 1 }] },
    { type: 'discardAbility', effects: [{ type: 'bits', target: 'self', amount: 1 }] }],
  'Utatane Nasa, Seiso Sleepy Dragon': [
    { type: 'discardAbility', timing: 'clash', effects: [{ type: 'movePersonaHere' }] },
    { type: 'personaActivate', name: 'Draw 1 card', bits: 2, limitPerRound: 1, effects: [{ type: 'draw', target: 'self', amount: 1 }] }],
  'Utatane Nasa, Kawaii Nasajira': [
    { type: 'discardAbility', timing: 'clash', effects: [{ type: 'movePersonaHere' }] },
    { type: 'personaActivate', name: 'Draw 2 cards', bits: 3, limitPerRound: 1, effects: [{ type: 'draw', target: 'self', amount: 2 }] }],
  'Shisui Michiru, Da Michi': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'movePersonaHere' }] }],
  'Shisui Michiru, Witch Half Cat': [
    { type: 'discardAbility', timing: 'clash', effects: [{ type: 'movePersonaHere' }] },
    { type: 'personaActivate', name: 'Delete a Content card with 🟡5 or more on this platform', limitPerRound: 1, effects: [
      { type: 'pickCard', prompt: 'Witch Half Cat: delete a Content card with 🟡5 or more on this platform', pick: { scope: 'here', owner: 'any', costMin: 5 }, then: { do: 'delete' } }] }],
  'Rinkou Ashelia, Lia': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'movePersonaHere' }] }],
  'Rinkou Ashelia, Cheerful Virus': [{ type: 'discardAbility', timing: 'clash', effects: [{ type: 'movePersonaHere' }] }],

  // ================= PLATFORM CARDS =================
  // Platform rules (game.js runs them for whichever platform card is in a slot):
  //   platformReward      "Clash Reward: ..." goes to the player who WINS the clash on this platform
  //   platformStars       your Persona gains +N ⭐ on this platform (when: contentEverywhere)
  //   blockPlay / costReduce      Content cards with 🟡N or more can't be played here / Content cards cost N less here
  //   onPlayHere          "When you play a Content/Action card on this Platform: ..."   (once: 'the first time ...', per round)
  //   onPersonaMoveHere   "When your Persona moves to this Platform: ..." (moving only, not the round's first deployment: ASSUMED)
  //   deckOnly            "X's deck only": enforced by the deck builder, deck validation and random decks (deckRules.js)
  'SwiftChat': [{ type: 'platformReward', text: 'Draw 1 card.', effects: [{ type: 'draw', target: 'self', amount: 1 }] }],
  'Chirpper': [{ type: 'platformReward', text: 'You may play 1 Content card with 🟡1 or less from your hand to another Platform for free.', effects: [{ type: 'playHandFree', costMax: 1, to: 'other' }] }],
  'Sudden Clips': [{ type: 'platformReward', text: 'Return 1 Content card from your Trash to your hand.', effects: [{ type: 'trashToHand', min: 1, max: 1, prompt: 'Sudden Clips: return 1 Content card from your Trash to your hand' }] }],
  'Sketch Book': [{ type: 'platformReward', text: 'You may move 1 of your Content cards from this Platform to another Platform.', effects: [{ type: 'moveOwnContent' }] }],
  'Yappers': [{ type: 'platformReward', text: 'Gain 1 💎.', effects: [{ type: 'bits', target: 'self', amount: 1 }] }],
  'Convulsive Movement': [{ type: 'platformReward', text: 'You may move 1 of your 🌠 from another Platform to this Platform without triggering its Clash Reward.', effects: [
    { type: 'movePop', from: 'other', optional: true, prompt: 'Convulsive Movement: you may move 1 of your 🌠 from which platform to this one?' }] }],
  'Bobby Bobby': [{ type: 'platformReward', text: 'Copy the Clash Reward of another Platform in play.', effects: [{ type: 'copyPlatformReward' }] }],
  'Historical Lion': [{ type: 'platformReward', text: 'You may delete 1 Content card with 🟡2 or less in play.', effects: [
    { type: 'pickCard', optional: true, prompt: 'Historical Lion: you may delete a Content card with 🟡2 or less in play', pick: { scope: 'any', owner: 'any', costMax: 2 }, then: { do: 'delete' } }] }],
  'Soul Exciting!': [{ type: 'platformReward', text: 'You may play 1 Content card with 🟡2 or less on this Platform for free.', effects: [{ type: 'playHandFree', costMax: 2 }] }],
  "Pippa's Quarters": [{ type: 'deckOnly', persona: 'Pipkin Pippa' }, { type: 'platformStars', amount: 5, when: { contentEverywhere: true } }],
  "Nasa's Dream": [{ type: 'deckOnly', persona: 'Utatane Nasa' }, { type: 'onPlayHere', event: 'content', then: [
    { type: 'payThen', bits: 2, label: 'Pay 2 💎 to draw 1 card', prompt: "Nasa's Dream: you may pay 2 💎 to draw 1 card", effects: [{ type: 'draw', target: 'self', amount: 1 }] }] }],
  "Iori's Den": [{ type: 'deckOnly', persona: 'Hakushika Iori' }, { type: 'onPlayHere', event: 'action', during: 'clash', once: 'den', then: [{ type: 'bits', target: 'self', amount: 1 }] }],
  "Michiru's Cabin": [{ type: 'deckOnly', persona: 'Shisui Michiru' }, { type: 'blockPlay', costMin: 5 }],
  "Uruka's Lounge": [{ type: 'deckOnly', persona: 'Fujikura Uruka' }, { type: 'onPlayHere', event: 'content', then: [{ type: 'deleteContent', scope: 'here', owner: 'mine', excludeSelf: true }] }],
  "Lia's Network": [{ type: 'deckOnly', persona: 'Rinkou Ashelia' }, { type: 'costReduce', amount: 1 }],
  "Tenma's Basement": [{ type: 'deckOnly', persona: 'Tenma Maemi' }, { type: 'onPersonaMoveHere', then: [{ type: 'draw', target: 'self', amount: 1 }] }],
  'Phase Warehouse': [{ type: 'deckOnly', affiliation: 'Phase Connect' }, { type: 'onPlayHere', event: 'action', then: [{ type: 'merchStars' }] }],
};
