// ===== RESEARCH AFK GAINS DESCRIPTOR =====
// Replaces computeAFKGainsRate() from save/external.js.
// Computes the AFK gains rate from companions, gambit, minehead,
// grid bonuses, sailing, cards, and sushi.

import { MINEHEAD_BONUS_QTY } from '../data/w7/minehead.js';
import { rogBonusQTY } from '../systems/w7/sushi.js';
import { computeCardLv } from '../systems/common/cards.js';
import { mineheadBonusQTY } from '../systems/w7/minehead.js';
import { createDescriptor, gridBonusFinal } from './helpers.js';
import { gambitBonus15 } from '../systems/w5/hole.js';
import { companionBonus } from '../data/common/companions.js';
import { label } from '../entity-names.js';

export default createDescriptor({
  id: 'research-afk-gains',
  name: 'Research AFK Gains Rate',
  scope: 'account',
  category: 'research',

  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    if (!saveData) return { val: 0, children: null };
    var items = [];

    // Companion 28 (RIP Tide)
    var comp28 = saveData.companionIds.has(28) ? companionBonus(28) : 0;
    items.push({ name: label('Companion', 28), val: comp28 });

    // Companion 153 (Rift Stalker) = 20%
    var comp153 = saveData.companionIds.has(153) ? 20 : 0;
    items.push({ name: label('Companion', 153), val: comp153 });

    // Gambit Milestone 15 = flat 3
    var gambit = gambitBonus15(saveData, saveData);
    items.push({ name: 'Gambit Milestone', val: gambit });

    // Minehead floor bonuses
    var mineFloor = saveData.stateR7[4] || 0;
    items.push({ name: label('Minehead Floor', 1), val: mineheadBonusQTY(1, mineFloor) });
    items.push({ name: label('Minehead Floor', 10), val: mineheadBonusQTY(10, mineFloor) });

    // Grid bonuses
    var gb71 = gridBonusFinal(saveData, 71);
    items.push({ name: 'Grid: Powered Down Research', val: gb71 });
    var gb111 = gridBonusFinal(saveData, 111);
    items.push({ name: 'Grid: Research AFK Gains', val: gb111 });

    // Sailing artifact 36 (Ender Pearl)
    var sail36 = Number(saveData.sailingData && saveData.sailingData[3] && saveData.sailingData[3][36]) || 0;
    items.push({ name: 'Ender Pearl (Artifact)', val: Math.min(6, sail36) });

    // Card w7b11 (Pirate Deckhand)
    var clvW7b11 = computeCardLv('w7b11', ctx.saveData);
    items.push({ name: 'Pirate Deckhand Card', val: Math.min(clvW7b11, 10) });

    // Gem Shop slot: 2 * GemItemsPurchased[45]
    var gemShop45 = Number(saveData.gemItemsData && saveData.gemItemsData[45]) || 0;
    items.push({ name: 'Gem Shop (Research AFK)', val: 2 * gemShop45 });

    // Sushi RoG
    var rog4 = rogBonusQTY(4, saveData.cachedUniqueSushi);
    var rog24 = rogBonusQTY(24, saveData.cachedUniqueSushi);
    if (rog4 + rog24 > 0) {
      items.push({ name: 'Sushi RoG AFK', val: rog4 + rog24 });
    }

    // Sum and compute rate
    var sum = 0;
    for (var i = 0; i < items.length; i++) sum += items[i].val;
    var rate = Math.min(1, 0.01 + sum / 100);

    var children = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].val > 0) children.push(items[i]);
    }

    return { val: rate, children: children };
  },
});
