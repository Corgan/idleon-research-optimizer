// ===== SKILL AFK GAINS DESCRIPTOR =====
// AFKgainrates("Mining"/"Choppin"/"Catching"/etc) formula.
// Returns skill AFK rate as a decimal.
// Scope: character (skill determined by current activity).

import { companions, vaultUpgBonus, goldFoodBonuses, sigilBonus, getBribeBonus,
  getSetBonus, cardLv, votingBonusz } from '../systems/common/goldenFood.js';
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
import { arcadeBonus } from '../systems/w2/arcade.js';
import { computeWinBonus } from '../systems/w6/summoning.js';
import { computeCardBonusByType } from '../systems/common/stats.js';
import { computeCompassBonus } from '../systems/w7/compass.js';
import { computeFlurboShop } from '../systems/w2/dungeon.js';
import { computeDivinityMinor, computeDivinityMajor } from '../systems/w5/divinity.js';
import { computeShrine } from '../systems/w3/construction.js';
import { computeRooBonus } from '../systems/w7/sushi.js';
import { computeArcaneMapMultiBon } from '../systems/mc/tesseract.js';
import { prayersPerCharData } from '../../save/data.js';
import { prayerBaseBonus } from '../data/w3/prayer.js';
import { saveData } from '../../state.js';
import { RANDOlist } from '../data/game/customlists.js';

// CalcTalentMAP[650]: count discovered cards across RANDOlist sets 82-86
function countDiscoveredCards(s) {
  var cards1 = s.cardsData && s.cardsData[1];
  if (!cards1) return 0;
  var count = 0;
  for (var setIdx = 82; setIdx <= 86; setIdx++) {
    var set = RANDOlist[setIdx];
    if (!set) continue;
    for (var j = 0; j < set.length; j++) {
      if (cards1[set[j]] !== undefined) count++;
    }
  }
  return count;
}

function rval(resolver, id, ctx, args) {
  try { return resolver.resolve(id, ctx, args).val || 0; }
  catch(e) { return 0; }
}

function safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;
  } catch(e) { return 0; }
}

function computePrayerReal(prayerIdx, costIdx, ci) {
  var s = saveData;
  var prayerLv = Number(s.prayOwnedData && s.prayOwnedData[prayerIdx]) || 0;
  if (prayerLv <= 0) return 0;
  var equipped = false;
  try { equipped = (prayersPerCharData[ci] || []).includes(prayerIdx); } catch(e) {}
  if (!equipped) return 0;
  var base = safe(prayerBaseBonus, prayerIdx, costIdx);
  var scale = Math.max(1, 1 + (prayerLv - 1) / 10);
  return Math.round(base * scale);
}

// Per-skill source table: { baseRate, boxKey, talentIds, cardType, starSignKey, bribeKey, bubbleKey }
var SKILL_SOURCES = {
  Mining:   { base: 0.5, boxKey: 'MinAFK',  talents: [89, 621],  cardType: 33, starSign: 'SkillAFK', bribe: '24', bubble: 'MinFshAFK', trapMG: 8 },
  Choppin:  { base: 0.5, boxKey: 'ChopAFK', talents: [449, 621], cardType: 36, starSign: 'SkillAFK', bribe: '24', bubble: 'MinFshAFK', trapMG: 8 },
  Fishing:  { base: 0.5, boxKey: 'FishAFK', talents: [89, 621],  cardType: 39, starSign: 'SkillAFK', bribe: '24', bubble: 'MinFshAFK', trapMG: 8 },
  Catching: { base: 0.5, boxKey: 'CatchAFK', talents: [449, 621], cardType: 42, starSign: 'SkillAFK', bribe: '24', bubble: 'MinFshAFK', trapMG: 8 },
};

export default {
  id: 'skill-afk',
  name: 'Skill AFK Rate',
  scope: 'character',
  category: 'rate',

  pools: {},

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
    var famBonus50 = safe(computeFamBonusQTY, 50);
    var card46 = 0; // 2 + CardBonusREAL(46)
    var _cb46 = safe(computeCardBonusByType, 46, ci);
    card46 = 2 + ((typeof _cb46 === 'object' && _cb46) ? (_cb46.val || 0) : Number(_cb46) || 0);
    var guild7 = rval(guild, 7, ctx);
    var cardSet7 = safe(computeCardSetBonus, ci, '7');
    var talentEnh79 = rval(talent, 79, ctx); // TalentEnh(79) — different from GetTalentNumber
    var sigilBonus16 = safe(sigilBonus, 16);
    var chipSafk = safe(computeChipBonus, 'safk');
    var etc24 = rval(etcBonus, '24', ctx);
    var etc59 = rval(etcBonus, '59', ctx);
    var prayer4 = computePrayerReal(4, 0, ci);
    var prayer12curse = computePrayerReal(12, 1, ci);

    afkAll += famBonus50 + card46 + guild7 + cardSet7 + talentEnh79
      + sigilBonus16 + chipSafk + etc24 + etc59 + prayer4 - prayer12curse;

    // Shared ALL-AFK sources
    var arcade6 = safe(arcadeBonus, 6);
    var comp6 = safe(companions, 6);
    var comp25 = safe(companions, 25);
    var winBonus11 = safe(computeWinBonus, 11);
    var _gfAFK = 0;
    try {
      var gf = goldFoodBonuses('AllAFK', ci);
      _gfAFK = (gf && typeof gf === 'object') ? (Number(gf.total) || 0) : (Number(gf) || 0);
    } catch(e) {}
    var evShop5 = 20 * eventShopOwned(5, s.cachedEventShopStr);
    var vault23 = safe(vaultUpgBonus, 23);

    // Remaining shared ALL-AFK sources
    var compassBonus57 = safe(computeCompassBonus, 57);
    var voidSet = safe(getSetBonus, 'VOID_SET');
    var flurbo7 = safe(computeFlurboShop, 7);
    var divMajor0 = 30 * safe(computeDivinityMajor, ci, 0);
    var divMinor5 = safe(computeDivinityMinor, -1, 5);
    var shrine8 = safe(computeShrine, 8);
    var talentCalc650 = rval(talent, 650, ctx) * countDiscoveredCards(s);
    var cardW6d3 = 1.5 * safe(cardLv, 'w6d3');
    var rooBonuses5 = safe(computeRooBonus, 5);
    var voting6 = safe(votingBonusz, 6);

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
    var trapMG = safe(computeTrapMGBonus, sk.trapMG);
    var starSign = safe(computeStarSignBonus, sk.starSign, ci);
    var bribe = safe(getBribeBonus, sk.bribe);
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
};
