// ===== SKILL AFK GAINS DESCRIPTOR =====
// AFKgainrates("Mining"/"Choppin"/"Catching"/etc) formula.
// Returns skill AFK rate as a decimal.
// Scope: character (skill determined by current activity).

import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { companion } from '../systems/common/companions.js';
import { vault } from '../systems/common/vault.js';
import { sigil } from '../systems/w2/alchemy.js';
import { getBribeBonus } from '../systems/w3/bribe.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { cardLv, countDiscoveredCards } from '../systems/common/cards.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { guild } from '../systems/common/guild.js';
import { computeFamBonusQTY } from '../systems/common/stats.js';
import { computeCardSetBonus } from '../systems/common/cards.js';
import { computeChipBonus } from '../systems/w4/lab.js';
import { computeTrapMGBonus } from '../systems/w3/trapping.js';
import { bubbleValByKey } from '../systems/w2/alchemy.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { eventShopOwned } from '../../game-helpers.js';
import { label } from '../entity-names.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { talent } from '../systems/common/talent.js';
import { arcade } from '../systems/w2/arcade.js';
import { winBonus } from '../systems/w6/summoning.js';
import { computeCardBonusByType } from '../systems/common/stats.js';
import { computeCompassBonus } from '../systems/w7/compass.js';
import { computeFlurboShop } from '../systems/w2/dungeon.js';
import { computeDivinityMinor, computeDivinityMajor } from '../systems/w5/divinity.js';
import { shrine } from '../systems/w3/construction.js';
import { computeRooBonus } from '../systems/w7/sushi.js';
import { computeArcaneMapMultiBon } from '../systems/mc/tesseract.js';
import { safe, rval, createDescriptor } from './helpers.js';
import { computePrayerReal } from '../systems/w3/prayer.js';

// Per-skill source table: { baseRate, boxKey, talentIds, cardType, starSignKey, bribeKey, bubbleKey }
var SKILL_SOURCES = {
  Mining:   { base: 0.5, boxKey: 'MinAFK',  talents: [89, 621],  cardType: 33, starSign: 'SkillAFK', bribe: '24', bubble: 'MinFshAFK', trapMG: 8 },
  Choppin:  { base: 0.5, boxKey: 'ChopAFK', talents: [449, 621], cardType: 36, starSign: 'SkillAFK', bribe: '24', bubble: 'MinFshAFK', trapMG: 8 },
  Fishing:  { base: 0.5, boxKey: 'FishAFK', talents: [89, 621],  cardType: 39, starSign: 'SkillAFK', bribe: '24', bubble: 'MinFshAFK', trapMG: 8 },
  Catching: { base: 0.5, boxKey: 'CatchAFK', talents: [449, 621], cardType: 42, starSign: 'SkillAFK', bribe: '24', bubble: 'MinFshAFK', trapMG: 8 },
};

export default createDescriptor({
  id: 'skill-afk',
  name: 'Skill AFK Rate',
  scope: 'character',
  category: 'rate',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 0.01, children: null };
    var ci = ctx.charIdx || 0;
    var skillType = ctx.skillType || 'Mining';

    // === AFKgainzzALL (shared between fighting and skill) ===
    var afkAll = 0;

    // Tasks[2][1][2] check
    var tasks2_1_2 = Number(s.tasksGlobalData && s.tasksGlobalData[2] && s.tasksGlobalData[2][1] &&
      s.tasksGlobalData[2][1][2]) || 0;
    if (tasks2_1_2 > ci) afkAll += 2;

    // Skill-only sources (not for fighting)
    var famBonus50 = safe(computeFamBonusQTY, 50, s);
    var card46 = 0; // 2 + CardBonusREAL(46)
    var _cb46 = safe(computeCardBonusByType, 46, ci, s);
    card46 = 2 + ((typeof _cb46 === 'object' && _cb46) ? (_cb46.val || 0) : Number(_cb46) || 0);
    var guild7 = rval(guild, 7, ctx);
    var cardSet7 = safe(computeCardSetBonus, ci, '7');
    var talentEnh79 = rval(talent, 79, ctx); // TalentEnh(79) — different from GetTalentNumber
    var sigilBonus16 = rval(sigil, 16, ctx);
    var chipSafk = safe(computeChipBonus, 'safk');
    var etc24 = rval(etcBonus, '24', ctx);
    var etc59 = rval(etcBonus, '59', ctx);
    var prayer4 = computePrayerReal(4, 0, ci, ctx.saveData);
    var prayer12curse = computePrayerReal(12, 1, ci, ctx.saveData);

    afkAll += famBonus50 + card46 + guild7 + cardSet7 + talentEnh79
      + sigilBonus16 + chipSafk + etc24 + etc59 + prayer4 - prayer12curse;

    // Shared ALL-AFK sources
    var arcade6 = rval(arcade, 6, ctx);
    var comp6 = rval(companion, 6, ctx);
    var comp25 = rval(companion, 25, ctx);
    var winBonus11 = rval(winBonus, 11, ctx);
    var _gfAFK = 0;
    try {
      var gf = goldFoodBonuses('AllAFK', ci, undefined, ctx.saveData);
      _gfAFK = (gf && typeof gf === 'object') ? (Number(gf.total) || 0) : (Number(gf) || 0);
    } catch(e) {}
    var evShop5 = 20 * eventShopOwned(5, s.cachedEventShopStr);
    var vault23 = rval(vault, 23, ctx);

    // Remaining shared ALL-AFK sources
    var compassBonus57 = safe(computeCompassBonus, 57, s);
    var voidSet = safe(getSetBonus, 'VOID_SET');
    var flurbo7 = safe(computeFlurboShop, 7, s);
    var divMajor0 = 30 * safe(computeDivinityMajor, ci, 0, s);
    var divMinor5 = safe(computeDivinityMinor, -1, 5, s);
    var shrine8 = rval(shrine, 8, ctx);
    var talentCalc650 = rval(talent, 650, ctx) * countDiscoveredCards(ctx.saveData);
    var cardW6d3 = 1.5 * safe(cardLv, 'w6d3', s);
    var rooBonuses5 = safe(computeRooBonus, 5, s);
    var voting6 = safe(votingBonusz, 6, 1, s);

    afkAll += arcade6 + comp6 + comp25 + winBonus11 + _gfAFK + evShop5 + vault23
      + compassBonus57 + voidSet + flurbo7 + divMajor0 + divMinor5 + shrine8
      + talentCalc650 + cardW6d3 + rooBonuses5 + voting6;

    if (s.bundlesData && s.bundlesData.bun_u === 1) afkAll += 30;

    // === AFKgainzzALLmulti ===
    var etc92 = rval(etcBonus, '92', ctx);
    var arcaneMapMulti2 = safe(computeArcaneMapMultiBon, 2, ctx);
    var afkAllMulti = (1 + arcaneMapMulti2 / 100) * (1 + etc92 / 100);

    // === Per-skill sources ===
    var sk = SKILL_SOURCES[skillType];
    if (!sk) return { val: 0.01, children: null };

    var skillSum = 0;
    for (var ti = 0; ti < sk.talents.length; ti++) {
      skillSum += rval(talent, sk.talents[ti], ctx);
    }
    var trapMG = safe(computeTrapMGBonus, sk.trapMG, s);
    var starSign = safe(computeStarSignBonus, sk.starSign, ci, s);
    var bribe = safe(getBribeBonus, sk.bribe, s);
    skillSum += trapMG + starSign + bribe;

    var val = (sk.base + (skillSum + afkAll) / 100) * afkAllMulti;
    val = Math.max(0.01, val);

    if (val !== val || val == null) val = 0.01;

    var children = [];
    children.push({ name: 'Base', val: sk.base, fmt: 'raw' });
    children.push({ name: 'Skill Sources (' + skillType + ')', val: skillSum, fmt: 'raw' });
    children.push({ name: 'Shared AFK Sources', val: afkAll, fmt: 'raw' });
    children.push({ name: 'ALL AFK multiplier', val: afkAllMulti, fmt: 'x' });

    return { val: val, children: children };
  }
});
