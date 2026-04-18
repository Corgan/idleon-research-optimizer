// ===== FIGHTING AFK GAINS DESCRIPTOR =====
// AFKgainrates("Fighting") formula.
// Returns fighting AFK rate as a decimal (e.g. 0.5 = 50%).
// Scope: character.

import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { companion } from '../systems/common/companions.js';
import { vault } from '../systems/common/vault.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { cardLv } from '../systems/common/cards.js';
import { getBribeBonus } from '../systems/w3/bribe.js';
import { guild } from '../systems/common/guild.js';
import { computeBoxReward } from '../systems/common/stats.js';
import { computeFlurboShop } from '../systems/w2/dungeon.js';
import { computeDivinityMajor, computeDivinityMinor } from '../systems/w5/divinity.js';
import { shrine } from '../systems/w3/construction.js';
import { computeFamBonusQTY } from '../systems/common/stats.js';
import { computeCardSetBonus } from '../systems/common/cards.js';
import { computeChipBonus } from '../systems/w4/lab.js';
import { computeRooBonus } from '../systems/w7/sushi.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { computeCompassBonus } from '../systems/w7/compass.js';
import { computeArcaneMapMultiBon } from '../systems/mc/tesseract.js';
import { eventShopOwned } from '../../game-helpers.js';
import { label } from '../entity-names.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { talent } from '../systems/common/talent.js';
import { arcade } from '../systems/w2/arcade.js';
import { winBonus } from '../systems/w6/summoning.js';
import { computeCardBonusByType } from '../systems/common/stats.js';
import { currentMapData } from '../../save/data.js';
import { rogBonusQTY } from '../systems/w7/sushi.js';
import { saveData } from '../../state.js';
import { safe, rval, createDescriptor } from './helpers.js';
import { computePrayerReal } from '../systems/w3/prayer.js';

export default createDescriptor({
  id: 'fighting-afk',
  name: 'Fighting AFK Rate',
  scope: 'character',
  category: 'rate',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 0.01, children: null };
    var ci = ctx.charIdx || 0;
    var mapIdx = ctx.mapIdx != null ? ctx.mapIdx : (currentMapData && currentMapData[ci]) || 0;

    // === AFKgainzzALL (shared between fighting and skill) ===
    var afkAll = 0;

    // Tasks[2][1][2] check: bonus for being in top N characters
    var tasks2_1_2 = Number(s.tasksGlobalData && s.tasksGlobalData[2] && s.tasksGlobalData[2][1] &&
      s.tasksGlobalData[2][1][2]) || 0;
    var charPosition = ci; // simplified — real game checks position in username list
    if (tasks2_1_2 > charPosition) afkAll += 2;

    // Shared ALL-AFK sources
    var arcade6 = rval(arcade, 6, ctx);
    var compassBonus57 = safe(computeCompassBonus, 57, s);
    var voidSet = safe(getSetBonus, 'VOID_SET');
    var flurbo7 = safe(computeFlurboShop, 7, s);
    var divMajor0 = 30 * safe(computeDivinityMajor, ci, 0, s);
    var divMinor5 = safe(computeDivinityMinor, -1, 5, s);
    var comp6 = rval(companion, 6, ctx);
    var comp25 = rval(companion, 25, ctx);
    var shrine8 = rval(shrine, 8, ctx);
    var talentCalc650 = rval(talent, 650, ctx);
    var winBonus11 = rval(winBonus, 11, ctx);
    var _gfAFK = 0;
    try {
      var gf = goldFoodBonuses('AllAFK', ci, ctx.saveData);
      _gfAFK = (gf && typeof gf === 'object') ? (Number(gf.total) || 0) : (Number(gf) || 0);
    } catch(e) {}
    var cardW6d3 = 1.5 * safe(cardLv, 'w6d3', s);
    var rooBonus5 = safe(computeRooBonus, 5, s);
    var voting6 = safe(votingBonusz, 6, 1, s);
    var evShop5 = 20 * eventShopOwned(5, s.cachedEventShopStr);
    var vault23 = rval(vault, 23, ctx);

    afkAll += arcade6 + compassBonus57 + voidSet + flurbo7 + divMajor0
      + divMinor5 + comp6 + comp25 + shrine8 + talentCalc650 + winBonus11
      + _gfAFK + cardW6d3 + rooBonus5 + voting6 + evShop5 + vault23;

    // Bundle bun_u: +30
    if (s.bundlesData && s.bundlesData.bun_u === 1) afkAll += 30;

    // === AFKgainzzALLmulti ===
    var arcaneMapMulti2 = safe(computeArcaneMapMultiBon, 2, ctx);
    var etc92 = rval(etcBonus, '92', ctx);
    var afkAllMulti = (1 + arcaneMapMulti2 / 100) * (1 + etc92 / 100);

    // === Fighting-specific sources ===
    var famBonus8 = safe(computeFamBonusQTY, 8, s);
    var _brFAFK = safe(computeBoxReward, ci, 'fightAFK');
    var boxFightAFK = (typeof _brFAFK === 'object' && _brFAFK) ? (_brFAFK.val || 0) : Number(_brFAFK) || 0;
    var talent88 = rval(talent, 88, ctx);
    var bribe3 = safe(getBribeBonus, 3, s);
    var talent268 = rval(talent, 268, ctx);
    var cardSet10 = safe(computeCardSetBonus, ci, '10');
    var talent448 = rval(talent, 448, ctx);
    var talent621 = rval(talent, 621, ctx);
    var _cb43 = safe(computeCardBonusByType, 43, ci, s);
    var card43 = (typeof _cb43 === 'object' && _cb43) ? (_cb43.val || 0) : Number(_cb43) || 0;
    var talent79 = rval(talent, 79, ctx);
    var etc20 = rval(etcBonus, '20', ctx);
    var etc59 = rval(etcBonus, '59', ctx);
    var starSignFightAFK = safe(computeStarSignBonus, 'FightAFK', ci, s);
    var guild4 = rval(guild, 4, ctx);
    var prayer4 = computePrayerReal(4, 0, ci, ctx.saveData);
    var prayer12curse = computePrayerReal(12, 1, ci, ctx.saveData);
    var chipFafk = safe(computeChipBonus, 'fafk');
    var cardW6d1 = safe(cardLv, 'w6d1', s);

    var fightSum = famBonus8 + boxFightAFK + talent88 + bribe3
      + talent268 + cardSet10 + talent448 + talent621 + afkAll
      + card43 + talent79 + etc20 + etc59 + starSignFightAFK
      + guild4 + prayer4 - prayer12curse + chipFafk + cardW6d1;

    // Penumbra map (306) special: 0.2x multiplier
    var penumbraMulti = (mapIdx === 306) ? 0.2 : 1;

    var val = penumbraMulti * (0.4 + fightSum / 100) * afkAllMulti;
    val = Math.max(0.01, val);

    if (val !== val || val == null) val = 0.01;

    var children = [];
    children.push({ name: 'Base', val: 0.4, fmt: 'raw' });
    children.push({ name: 'Fighting Sources', val: fightSum, fmt: 'raw',
      note: 'sum/100 added to base' });
    children.push({ name: 'ALL AFK multiplier', val: afkAllMulti, fmt: 'x' });
    if (penumbraMulti !== 1) children.push({ name: 'Penumbra 0.2x', val: penumbraMulti, fmt: 'x' });

    return { val: val, children: children };
  }
});
