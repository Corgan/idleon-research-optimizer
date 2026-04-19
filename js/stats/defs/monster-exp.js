// ===== MONSTER EXP DESCRIPTOR =====
// MonsterEXP formula from ExpMulti(e=0).
// 7-stage computation: ExpGainLUK through ExpGainLUK6, then final combine.
// Scope: character (TotalStats and talents are per-character).

import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { companion } from '../systems/common/companions.js';
import { vault } from '../systems/common/vault.js';
import { sigil } from '../systems/w2/alchemy.js';
import { pristine } from '../systems/w6/sneaking.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { cardLv } from '../systems/common/cards.js';
import { eventShopOwned, superBitType, cloudBonus as _cloudBonus } from '../../game-helpers.js';
import { getLOG } from '../../formulas.js';
import { label } from '../entity-names.js';
import { grid, mainframeBonus, computePetArenaBonus } from '../systems/w4/lab.js';
import { arcade } from '../systems/w2/arcade.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { legendPTSbonus, computeBigFishBonus } from '../systems/w7/spelunking.js';
import { computeStatueBonusGiven, computeMealBonus, computeCardBonusByType, computeBoxReward, computeTotalStat } from '../systems/common/stats.js';
import { computeVialByKey, bubbleValByKey, getPrismaBonusMult } from '../systems/w2/alchemy.js';
import { DungPassiveStats2, StatueInfo,
  SaltLicks } from '../data/game/customlists.js';
import { optionsListData } from '../../save/data.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { guild } from '../systems/common/guild.js';
import { friend } from '../systems/common/friend.js';
import { talent } from '../systems/common/talent.js';
import { computeMeritocBonusz } from '../systems/w7/meritoc.js';
import { winBonus } from '../systems/w6/summoning.js';
import { grimoireUpgBonus22, grimoire } from '../systems/mc/grimoire.js';
import { GrimoireUpg } from '../data/game/customlists.js';
import { exoticBonusQTY40 } from '../systems/w6/farming.js';
import { computeShinyBonusS } from '../systems/w4/breeding.js';
import { gambitPTSmulti } from '../systems/w5/hole.js';
import { holes } from '../systems/w5/hole.js';
import { computeDivinityMinor } from '../systems/w5/divinity.js';
import { rogBonusQTY } from '../systems/w7/sushi.js';
import { dancingCoralBase } from '../data/w7/research.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { cookingMealMulti } from '../systems/common/cooking.js';
import { computeOwlBonus } from '../systems/w1/owl.js';
import { computeExoticBonus, computeStickerBonus } from '../systems/w6/farming.js';
import { computeMSABonus } from '../systems/w4/gaming.js';
import { computeAllShimmerBonuses } from '../systems/w3/equinox.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { computeWorkbenchStuff as _computeWorkbenchStuff } from '../systems/common/stats.js';
import { computeCompassBonus, computeTotalTitanKills } from '../systems/w7/compass.js';
import { computeArcaneMapMultiBon } from '../systems/mc/tesseract.js';
import { bubbaRoGBonuses } from '../systems/w7/bubba.js';
import { computeCardSetBonusRaw } from '../systems/common/cards.js';
import { safe, rval, createDescriptor, computeButtonBonus } from './helpers.js';
import { computeFlurboShop } from '../systems/w2/dungeon.js';
import { computeSaltLick, shrine } from '../systems/w3/construction.js';
import { computePrayerReal } from '../systems/w3/prayer.js';

// Compute StatueBonusGiven for any statue index (same as coin-multi.js)

// Compute FlurboShop(idx): DungPassiveStats2[idx] = formulaEval(info, lv)

// Compute SaltLick(idx)

// Compute prayersReal(prayerIdx, costIdx): 0=bonus, 1=curse
// For bonus (costIdx=0): base * max(1, 1+(lv-1)/10), equipped only
// For curse (costIdx=1): curseBase * max(1, 1+(lv-1)/10), equipped only (negative effect)

// Shrine(idx): game uses ShrineBonusGiven logic
// For simplicity, use the shrine resolver through the registry

// Vial value by effect key

// CardSetBonuses(0, setId) — card set bonuses (via cards.js)

// WorkbenchStuff("AdditionExtraEXPnDR")
// Game: if Tasks[2][1][2]>0 with world boss check

// MealBonus("Clexp") — sum meals with "Clexp" effect

// Companions count check

export default createDescriptor({
  id: 'monster-exp',
  name: 'Monster EXP Multiplier',
  scope: 'character',
  category: 'multiplier',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 1, children: null };
    var ci = ctx.charIdx || 0;

    // ======= STAGE 1: ExpGainLUK = TotalStats("LUK") → piecewise transform =======
    var _lukR = computeTotalStat('LUK', ci, ctx); var totalLUK = _lukR.computed;
    var expGainLUK;
    if (totalLUK < 1000) {
      expGainLUK = (Math.pow(totalLUK + 1, 0.37) - 1) / 30;
    } else {
      expGainLUK = (totalLUK - 1000) / (totalLUK + 2500) * 0.8 + 0.3963;
    }

    // ======= STAGE 2: ExpGainLUK2 (conditional additive bonuses) =======
    var egl2 = 0;
    var charLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][0]) || 0;

    // Highest level check: Tasks[2][0][2] > 0, and char is highest level among all
    var tasks2_0_2 = Number(s.tasksGlobalData && s.tasksGlobalData[2] && s.tasksGlobalData[2][0] &&
      s.tasksGlobalData[2][0][2]) || 0;
    if (tasks2_0_2 > 0) {
      // Check if this char has the highest class level
      var isHighest = true;
      var allUsernames = s.usernamesData || [];
      for (var ui = 0; ui < allUsernames.length; ui++) {
        if (ui === ci) continue;
        var otherLv = Number(s.lv0AllData && s.lv0AllData[ui] && s.lv0AllData[ui][0]) || 0;
        if (otherLv > charLv) { isHighest = false; break; }
      }
      if (isHighest) {
        egl2 += 3 * tasks2_0_2 + rval(vault, 12, ctx);
        if (superBitType(19, s.gamingData) === 1) {
          // ExpGainLUK3 gets +50 later
        }
      }
    }

    // Level-based flat bonuses
    if (charLv < 50) egl2 += computeCardSetBonusRaw('0', ctx.saveData);
    if (charLv < 120) egl2 += safe(computeMealBonus, 'Clexp', s);

    // WeeklyBoss.c bonus
    var weeklyBossC = Number(s.weeklyBossData && s.weeklyBossData.c) || 0;
    if (weeklyBossC > 0) egl2 += Math.min(150, weeklyBossC);

    // Level-based flat adds
    if (charLv < 10) egl2 += 150;
    else if (charLv < 30) egl2 += 100;
    else if (charLv < 50) egl2 += 50;

    // Divinity Minor bonus for god style 4
    egl2 += computeDivinityMinor(ci, 4, ctx.saveData);

    // CardSetBonuses(0, "5")
    egl2 += computeCardSetBonusRaw('5', ctx.saveData);

    // ======= STAGE 3: ExpGainLUK3 (SuperBit + Bundle) =======
    var egl3 = 0;
    if (tasks2_0_2 > 0 && superBitType(19, s.gamingData) === 1) egl3 += 50;
    if (s.bundlesData && s.bundlesData.bun_q === 1) egl3 += 20;

    // ======= STAGE 4: ExpGainLUK4 (compass/gambit/vault/grid/grimoire) =======
    var compassBonus51 = safe(computeCompassBonus, 51, s);

    var holesB47 = rval(holes, 47, ctx);
    var expMulti999 = rval(winBonus, 23, ctx); // ExpMulti(999) = WinBonus(23) per game source
    // GrimoireUpgBonus(24): level * perLevel * (1 + grimoire36/100)
    var grimLv24 = Number(s.grimoireData && s.grimoireData[24]) || 0;
    var grimPerLv24 = Number(GrimoireUpg[24] && GrimoireUpg[24][5]) || 0;
    var grimLv36 = Number(s.grimoireData && s.grimoireData[36]) || 0;
    var grimoireUpg24 = grimLv24 * grimPerLv24 * (1 + grimLv36 / 100);
    var vault3 = rval(vault, 3, ctx);
    var vault35 = rval(vault, 35, ctx);
    var ola345 = Number(optionsListData[345]) || 0;
    var holesB83 = Math.min(40, rval(holes, 83, ctx)); // B_UPG(83, 40) — capped at 40

    var egl4 = compassBonus51 + holesB47 + expMulti999 + grimoireUpg24
      + vault3 + vault35 * getLOG(ola345) + holesB83;

    // ======= STAGE 5: ExpGainLUK5 (massive multiplicative chain) =======
    // GenINFO[17] check — this is a server-side flag, use opt-in default
    var genInfo17 = 1; // Assume active (server-controlled)
    var talent429 = rval(talent, 429, ctx, { mode: 'max' });
    var egl5_talentMult = genInfo17 ? Math.max(1, talent429) : 1;

    // Companions multiplicative chain
    var comp37 = rval(companion, 37, ctx);
    var comp33 = rval(companion, 33, ctx);
    var comp160 = rval(companion, 160, ctx);
    var comp32 = rval(companion, 32, ctx);
    var comp34 = rval(companion, 34, ctx);
    var comp145 = rval(companion, 145, ctx);
    var comp50 = rval(companion, 50, ctx);
    var compMult = (1 + 9 * comp37) * (1 + comp33) * (1 + 4 * comp160)
      * (1 + comp32) * (1 + comp34) * (1 + comp145);

    // Grid bonuses 130, 131, 132, 152
    var grid130 = rval(grid, 130, ctx);
    var grid131 = rval(grid, 131, ctx);
    var grid132 = rval(grid, 132, ctx);
    var grid152 = rval(grid, 152, ctx);
    var gridMult = 1 + (grid130 + grid131 + grid132 + grid152) / 100;

    // StickerBonus(0)
    var stickerBonus0 = safe(computeStickerBonus, 0, s);
    // Stickers are stored in farming data

    // SuperBit(63)
    var superBit63 = superBitType(63, s.gamingData) === 1 ? 0.1 : 0;

    // ZenithMarketBonus(9)
    var zenithMarket9 = 0;
    if (s.spelunkData && s.spelunkData[45]) {
      var zmLv = Number(s.spelunkData[45][9]) || 0;
      var zmMulti = 1;
      try { var ZM = require('../data/game/customlists.js').ZenithMarket; zmMulti = Number(ZM[9] && ZM[9][4]) || 1; } catch(e) {}
      zenithMarket9 = Math.floor(zmMulti * zmLv);
    }

    // Comp50 (min 1.01 cap)
    var comp50capped = Math.max(1, Math.min(1.01, 1 + comp50 / 2500));

    var egl5_inner = egl5_talentMult * Math.max(1, compMult * gridMult
      * (1 + stickerBonus0 / 100) * (1 + superBit63) * (1 + zenithMarket9 / 100)
      * comp50capped);

    // EtcBonuses(84), CardBonusREAL(100), Arcade(60), Vials.7classexp
    var etc84 = rval(etcBonus, '84', ctx);
    var _cb100 = safe(computeCardBonusByType, 100, ci, s);
    var card100 = (typeof _cb100 === 'object' && _cb100) ? (_cb100.val || 0) : Number(_cb100) || 0;
    var arcade60 = rval(arcade, 60, ctx);
    var vial7classexp = safe(computeVialByKey, '7classexp', s);

    // Talent 434 ^ TotalTitanKills
    var talent434 = rval(talent, 434, ctx, { mode: 'max' });
    var titanKills = safe(computeTotalTitanKills, s);
    // Total titan kills stored in OLA
    var titanKillsPow = Math.pow(Math.max(1, talent434), titanKills);

    var egl5 = egl5_inner
      * (1 + etc84 / 100) * (1 + card100 / 100) * (1 + arcade60 / 100)
      * (1 + vial7classexp / 100) * titanKillsPow;

    // Second multiplication chain: ArcaneMapMulti(1), BigFishBonuses(4), DancingCoralBonus(3)
    // CoralKidUpgBonus(2) ^ max(0, Divinity[25]-10), CardSetBonuses(0,"12"),
    // BubbaRoG(6), RoG(15)
    var arcaneMapMulti1 = safe(computeArcaneMapMultiBon, 1, ctx);
    var bigFish4 = safe(computeBigFishBonus, 4, s);
    var dancingCoral3 = dancingCoralBase(3);
    var coralKid2 = Number(optionsListData[430] || 0) || 0; // CoralKidUpgBonus(2) = OLA[428+2] = OLA[430]
    var div25 = Number(s.divinityAllData && s.divinityAllData[25]) || 0;
    var coralKidPow = Math.pow(1 + coralKid2 / 100, Math.max(0, div25 - 10));
    var cardSet12 = computeCardSetBonusRaw('12', ctx.saveData);
    var bubbaRoG6 = safe(bubbaRoGBonuses, 6, s); // BubbaRoG_Bonuses(6) — NOT sushi RoG
    var rog15 = rogBonusQTY(15, s.cachedUniqueSushi || 0);

    // DancingCoralBonus(3): base * max(0, tower22 - 200)
    var tower22 = Number(s.towerData && s.towerData[22]) || 0;
    var dancingCoralVal = dancingCoral3 * Math.max(0, tower22 - 200);

    egl5 *= (1 + arcaneMapMulti1 / 100) * (1 + bigFish4 / 100)
      * (1 + dancingCoralVal / 100) * coralKidPow
      * (1 + cardSet12 / 100) * (1 + bubbaRoG6 / 100) * (1 + rog15 / 100)
      * (1 + 5 * _cloudBonus(70, s.weeklyBossData) / 100);

    // Third chain: Spelunk6.length as pow(1.03, count), SuperBit(24), MeritocBonusz(27), OLA[464]
    var spelunk6len = (s.spelunkData && s.spelunkData[6]) ? s.spelunkData[6].length : 0;
    var superBit24 = superBitType(24, s.gamingData) === 1 ? 1 : 0;
    var meritoc27 = safe(computeMeritocBonusz, 27, s);
    var ola464 = Number(optionsListData[464]) || 0;
    var ola464bonus = Math.max(0, 5 * (ola464 - 8));
    egl5 *= Math.max(1, Math.pow(1.03, spelunk6len) * superBit24
      * (1 + meritoc27 / 100) * (1 + ola464bonus / 100));

    // ======= STAGE 6: ExpGainLUK6 (additive pool) =======
    var cardSpringEvent1 = 2 * safe(cardLv, 'springEvent1', s);
    var comp3 = rval(companion, 3, ctx);
    var comp50add = rval(companion, 50, ctx);
    var shimmerOla179 = Number(optionsListData[179]) || 0;
    var shimmerBonus = safe(computeAllShimmerBonuses, s);
    var gfoodClassEXP = 0;
    try {
      var _gf = goldFoodBonuses('ClassEXPz', ci, undefined, ctx.saveData);
      gfoodClassEXP = (_gf && typeof _gf === 'object') ? (Number(_gf.total) || 0) : (Number(_gf) || 0);
    } catch(e) {}
    var owlBonus0 = safe(computeOwlBonus, 0, s);
    var voting15 = safe(votingBonusz, 15, 1, s); // VotingBonusz(15)
    var monumentROG16 = rval(holes, 'monument6', ctx);
    var ironSet = safe(getSetBonus, 'IRON_SET');
    var exotic50 = safe(computeExoticBonus, 50, s);
    var ola421 = Number(optionsListData[421]) || 0;
    var stampClassXP = safe(computeStampBonusOfTypeX, 'classxp', s);
    var friendStatz1 = 0; // FriendBonusStatz(1)
    try { friendStatz1 = rval(friend, 1, ctx); } catch(e) {}
    var comp47 = rval(companion, 47, ctx);
    var comp111 = rval(companion, 111, ctx);
    var bb8 = computeButtonBonus(8, s);

    var egl6 = cardSpringEvent1 + comp3 + comp50add
      + shimmerOla179 * shimmerBonus + gfoodClassEXP + owlBonus0 + voting15
      + monumentROG16 + egl4 + ironSet + exotic50 + ola421
      + stampClassXP + friendStatz1 + comp47 + comp111 + bb8;

    // ======= FINAL: MonsterEXP combine =======
    // WorkbenchStuff × (1+EGL3/100) × EGL5 × (1+EtcBonuses("78")/100)
    // × (EGL/1.8 × (1+talent35/100) + additivePool/100 + 1)
    var wb = safe(_computeWorkbenchStuff, s);
    var etc78 = rval(etcBonus, '78', ctx);
    var talent35 = rval(talent, 35, ctx);

    // Additive pool
    var etc4 = rval(etcBonus, '4', ctx);
    var _br = safe(computeBoxReward, ci, 'monsterExp');
    var boxMonsterExp = (typeof _br === 'object' && _br) ? (_br.val || 0) : Number(_br) || 0;
    var totalFoodClassEXP = 0;
    try {
      var _gfCE = goldFoodBonuses('ClassEXP', ci, undefined, ctx.saveData);
      totalFoodClassEXP = (_gfCE && typeof _gfCE === 'object') ? (Number(_gfCE.total) || 0) : (Number(_gfCE) || 0);
    } catch(e) {}
    var starSignMainXP = safe(computeStarSignBonus, 'MainXP', ci, s);
    var vialMonsterEXP = safe(computeVialByKey, 'MonsterEXP', s);
    var bubbleExpActive = safe(bubbleValByKey, 'expACTIVE', ci, s);
    var _cb44 = safe(computeCardBonusByType, 44, ci, s);
    var card44 = (typeof _cb44 === 'object' && _cb44) ? (_cb44.val || 0) : Number(_cb44) || 0;
    var statue10 = safe(computeStatueBonusGiven, 10, ci, s);
    var talent632 = rval(talent, 632, ctx);
    var shrine5 = rval(shrine, 5, ctx);
    var saltLick3val = safe(computeSaltLick, 3, s);
    var prayer0 = computePrayerReal(0, 0, ci, ctx.saveData);
    var prayer2 = computePrayerReal(2, 0, ci, ctx.saveData);
    var prayer9curse = computePrayerReal(9, 1, ci, ctx.saveData);
    var flurbo2 = safe(computeFlurboShop, 2, s);
    var ach57 = safe(achieveStatus, 57, s);
    var ach357 = 20 * safe(achieveStatus, 357, s);
    var ach61 = 3 * safe(achieveStatus, 61, s);
    var ach124 = 2 * safe(achieveStatus, 124, s);
    var ach188 = 5 * safe(achieveStatus, 188, s);
    var arcade12 = rval(arcade, 12, ctx);
    var sigilBonus8 = rval(sigil, 8, ctx);
    var ach286 = 25 * safe(achieveStatus, 286, s);
    var shinyBonus1 = safe(computeShinyBonusS, 1, s);
    var gamingMSA4 = safe(computeMSABonus, 4, s);
    var talent55 = rval(talent, 55, ctx, { mode: 'max' });

    var additivePool = etc4 + boxMonsterExp + totalFoodClassEXP + starSignMainXP
      + vialMonsterEXP + bubbleExpActive + card44 + egl2 + statue10
      + talent632 + shrine5 + saltLick3val
      + prayer0 + prayer2 - prayer9curse + flurbo2
      + ach57 + ach357 + ach61 + ach124 + ach188
      + arcade12 + sigilBonus8 + ach286 + shinyBonus1
      + gamingMSA4 + talent55 + egl6;

    var lukContrib = expGainLUK * (1 + talent35 / 100) / 1.8;
    var val = wb * (1 + egl3 / 100) * egl5 * (1 + etc78 / 100)
      * (lukContrib + additivePool / 100 + 1);

    // NaN guard
    if (val !== val || val == null) val = 1;

    // ======= Build breakdown tree =======
    var children = [];

    children.push({ name: 'WorkbenchStuff', val: wb, fmt: 'x' });
    children.push({ name: 'SuperBit + Bundle', val: 1 + egl3 / 100, fmt: 'x',
      note: 'EGL3=' + egl3 });
    children.push({ name: 'ExpGainLUK5 (multiplicative)', val: egl5, fmt: 'x' });
    children.push({ name: label('EtcBonus', 78), val: 1 + etc78 / 100, fmt: 'x' });

    var lukPart = { name: 'LUK contribution', val: lukContrib, fmt: 'raw',
      note: 'LUK=' + Math.round(totalLUK) + ' EGL=' + expGainLUK.toFixed(4) };

    var addCh = [];
    if (etc4 > 0) addCh.push({ name: label('EtcBonus', 4), val: etc4, fmt: 'raw' });
    if (boxMonsterExp > 0) addCh.push({ name: 'Box Rewards: Monster EXP', val: boxMonsterExp, fmt: 'raw' });
    if (gfoodClassEXP > 0) addCh.push({ name: 'GoldFood ClassEXP', val: gfoodClassEXP, fmt: 'raw' });
    if (vialMonsterEXP > 0) addCh.push({ name: 'Vial: Monster EXP', val: vialMonsterEXP, fmt: 'raw' });
    if (bubbleExpActive > 0) addCh.push({ name: 'Bubble: Active EXP', val: bubbleExpActive, fmt: 'raw' });
    if (card44 > 0) addCh.push({ name: 'Card Bonus: Monster EXP', val: card44, fmt: 'raw' });
    if (egl2 > 0) addCh.push({ name: 'EGL2 (level/boss/div bonuses)', val: egl2, fmt: 'raw' });
    if (statue10 > 0) addCh.push({ name: label('Statue', 10) + ' (Spiritus)', val: statue10, fmt: 'raw' });
    if (talent632 > 0) addCh.push({ name: label('Talent', 632), val: talent632, fmt: 'raw' });
    if (shrine5 > 0) addCh.push({ name: label('Shrine', 5), val: shrine5, fmt: 'raw' });
    if (saltLick3val > 0) addCh.push({ name: label('SaltLick', 3), val: saltLick3val, fmt: 'raw' });
    if (prayer0 + prayer2 - prayer9curse !== 0) addCh.push({ name: 'Prayers (0+2-9)',
      val: prayer0 + prayer2 - prayer9curse, fmt: 'raw' });
    if (flurbo2 > 0) addCh.push({ name: label('Flurbo Shop', 2), val: flurbo2, fmt: 'raw' });
    var achTotal = ach57 + ach357 + ach61 + ach124 + ach188 + ach286;
    if (achTotal > 0) addCh.push({ name: 'Achievements', val: achTotal, fmt: 'raw' });
    if (arcade12 > 0) addCh.push({ name: label('Arcade', 12), val: arcade12, fmt: 'raw' });
    if (shinyBonus1 > 0) addCh.push({ name: label('Breeding', 1), val: shinyBonus1, fmt: 'raw' });
    if (talent55 > 0) addCh.push({ name: label('Talent', 55), val: talent55, fmt: 'raw' });
    if (egl6 > 0) addCh.push({ name: 'EGL6 (cards/companions/food/stamps)', val: egl6, fmt: 'raw' });

    children.push({ name: 'Base + Additive Pool', val: lukContrib + additivePool / 100 + 1, fmt: 'x',
      children: [lukPart].concat(addCh) });

    return { val: val, children: children };
  }
});
