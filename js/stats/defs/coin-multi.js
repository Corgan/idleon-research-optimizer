// ===== COIN MULTI DESCRIPTOR =====
// MonsterCash formula: 23 multiplicative groups, each (1 + bonus/100).
// Scope: character (TotalStats is per-character).

import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { companion } from '../systems/common/companions.js';
import { vault } from '../systems/common/vault.js';
import { cardLv } from '../systems/common/cards.js';
import { pristine } from '../systems/w6/sneaking.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { eventShopOwned, emporiumBonus, ribbonBonusAt } from '../../game-helpers.js';
import { getLOG, formulaEval } from '../../formulas.js';
import { label } from '../entity-names.js';
import { grid, mainframeBonus, computePetArenaBonus } from '../systems/w4/lab.js';
import { arcade } from '../systems/w2/arcade.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { legendPTSbonus } from '../systems/w7/spelunking.js';
import { computeStatueBonusGiven, computeMealBonus, computeCardBonusByType, computeBoxReward, computeTotalStat } from '../systems/common/stats.js';
import { computeVialByKey, bubbleValByKey } from '../systems/w2/alchemy.js';
import { MealINFO, DungPassiveStats2, GodsInfo,
  StatueInfo, ArtifactInfo, HolesInfo, ZenithMarket } from '../data/game/customlists.js';
import { cauldronInfoData, optionsListData,
  numCharacters, klaData, divinityData, charClassData,
  cauldronBubblesData, currentMapData } from '../../save/data.js';
import { bubbleParams } from '../data/w2/alchemy.js';
import { computePrayerReal } from '../systems/w3/prayer.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { guild } from '../systems/common/guild.js';
import { friend } from '../systems/common/friend.js';
import { talent } from '../systems/common/talent.js';
import { computeMeritocBonusz } from '../systems/w7/meritoc.js';
import { winBonus } from '../systems/w6/summoning.js';
import { artifactBase } from '../data/w5/sailing.js';
import { grimoireUpgBonus22 } from '../systems/mc/grimoire.js';
import { exoticBonusQTY40 } from '../systems/w6/farming.js';
import { computeShinyBonusS } from '../systems/w4/breeding.js';
import { gambitPTSmulti, computeGambitBonus7 } from '../systems/w5/hole.js';
import { rogBonusQTY, computeRooBonus } from '../systems/w7/sushi.js';
import { computeDivinityMinor } from '../systems/w5/divinity.js';
import { computeCropSC } from '../systems/w6/farming.js';
import { cookingMealMulti } from '../systems/common/cooking.js';
import { computeVaultKillzTotal } from '../systems/common/vaultKillz.js';
import { safe, rval, createDescriptor } from './helpers.js';
import { computeFlurboShop } from '../systems/w2/dungeon.js';

// Compute ArtifactBonus(1): Maneki Kat - coins per highest class level
function computeArtifactBonus1(saveData) {
  var s = saveData;
  var sailing = s.sailingData;
  if (!sailing || !sailing[3]) return 0;
  var tier = Number(sailing[3][1]) || 0;
  if (tier <= 0) return 0;
  var base = artifactBase(1);
  var highestLv = 0;
  var lv0All = s.lv0AllData || [];
  for (var ci = 0; ci < lv0All.length; ci++) {
    var lv = Number(lv0All[ci] && lv0All[ci][0]) || 0;
    if (lv > highestLv) highestLv = lv;
  }
  var val = base * highestLv;
  if (tier >= 2) val *= tier;
  return val;
}

// Compute AlchVials.MonsterCash value (with full multiplier chain)
// Game: VialBonus = labMult * (1 + DNzz/100) * (1 + meritoc20/100) * formulaEval(...)
// labMult = mainframe10 == 2 ? 2 : 1
// DNzz = (rift[0]>34 ? 2*maxLvVials : 0) + VaultUpgBonus(42)

// Compute FlurboShop(4): DungPassiveStats2[4] = decay(75, 100, lv)

export default createDescriptor({
  id: 'coin-multi',
  name: 'Coin Multiplier',
  scope: 'character+map',
  category: 'multiplier',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 1, children: null };
    var ci = ctx.charIdx || 0;

    // ===== GROUP 1: Alchemy bubbles x floor(stat/250) =====
    var cashSTR = safe(bubbleValByKey, 'CashSTR', ci, s);
    var cashAGI = safe(bubbleValByKey, 'CashAGI', ci, s);
    var cashWIS = safe(bubbleValByKey, 'CashWIS', ci, s);
    var _strR = computeTotalStat('STR', ci, ctx); var totalSTR = _strR.computed;
    var _agiR = computeTotalStat('AGI', ci, ctx); var totalAGI = _agiR.computed;
    var _wisR = computeTotalStat('WIS', ci, ctx); var totalWIS = _wisR.computed;
    var g1strPart = cashSTR * Math.floor(totalSTR / 250);
    var g1agiPart = cashAGI * Math.floor(totalAGI / 250);
    var g1wisPart = cashWIS * Math.floor(totalWIS / 250);
    var g1sum = g1strPart + g1agiPart + g1wisPart;
    var g1 = 1 + g1sum / 100;

    // ===== GROUPS 2-4: Companions (capped at 4) =====
    var comp24 = Math.min(4, rval(companion, 24, ctx));
    var comp45 = Math.min(4, rval(companion, 45, ctx));
    var comp159 = Math.min(4, rval(companion, 159, ctx));
    var g2 = 1 + comp24;
    var g3 = 1 + comp45;
    var g4 = 1 + comp159;

    // ===== GROUP 4b: CoinDropMulti = 1 + Companions(38) (no cap) =====
    var comp38 = rval(companion, 38, ctx);
    var g4b = 1 + comp38;

    // ===== GROUPS 5-6: EventShop =====
    var evStr = s.cachedEventShopStr;
    var evShop9 = eventShopOwned(9, evStr);
    var evShop20 = eventShopOwned(20, evStr);
    var g5 = 1 + 0.5 * evShop9;
    var g6 = 1 + 0.6 * evShop20;

    // ===== GROUP 7: EtcBonuses("77") = %_BONUS_MONEY =====
    var etc77 = rval(etcBonus, '77', ctx);
    var g7 = 1 + etc77 / 100;

    // ===== GROUP 8: RoG_BonusQTY(18) — Sushi bonus =====
    var rog18 = rogBonusQTY(18, s.cachedUniqueSushi || 0);
    var g8 = 1 + rog18 / 100;

    // ===== GROUP 9: RoG_BonusQTY(37) — Sushi bonus =====
    var rog37 = rogBonusQTY(37, s.cachedUniqueSushi || 0);
    var g9 = 1 + rog37 / 100;

    // ===== GROUP 10: Grid 149 + Grid 169 =====
    var grid149 = rval(grid, 149, ctx);
    var grid169 = rval(grid, 169, ctx);
    var g10 = 1 + (grid149 + grid169) / 100;

    // ===== GROUP 11: EtcBonuses("100") = %_EXTRA_MONEY =====
    var etc100 = rval(etcBonus, '100', ctx);
    var g11 = 1 + etc100 / 100;

    // ===== GROUP 12: GOLD_SET set bonus =====
    var goldSet = safe(getSetBonus, 'GOLD_SET', ci);
    var g12 = 1 + goldSet / 100;

    // ===== GROUP 13: Gambit bonus 7 =====
    var gambit7 = safe(computeGambitBonus7, s, ctx.saveData);
    var g13 = 1 + gambit7 / 100;

    // ===== GROUP 14: Bundle bun_y x 250 =====
    var bunY = (s.bundlesData && s.bundlesData.bun_y === 1) ? 1 : 0;
    var g14 = 1 + 250 * bunY / 100;

    // ===== GROUP 15: getbonus2(1,433,-1, ctx.saveData) x log(OLA[362]) =====
    var chipBonus433 = rval(talent, 433, ctx, { mode: 'max' });
    var ola362 = Number(optionsListData[362]) || 0;
    var g15val = Math.max(1, chipBonus433) * getLOG(ola362);
    var g15 = 1 + g15val / 100;

    // ===== GROUP 16: Meal + Artifact + Roo + Voting(34) =====
    var votingMulti = 1;
    try { var vmResult = ctx.resolve('voting-multi'); votingMulti = vmResult.val || 1; } catch(e) {}
    var voting34 = safe(votingBonusz, 34, votingMulti, s);
    var mealCash = safe(computeMealBonus, 'Cash', s, ci);
    var artifactBonus1 = safe(computeArtifactBonus1, s);
    var rooBonus6 = safe(computeRooBonus, 6, s);
    var g16sum = mealCash + artifactBonus1 + rooBonus6 + voting34;
    var g16 = 1 + g16sum / 100;

    // ===== GROUP 17: PetArena + Friend + Statue(19) =====
    var friend5 = rval(friend, 5, ctx);
    var petArena5 = safe(computePetArenaBonus, 5);
    var petArena14 = safe(computePetArenaBonus, 14);
    var statue19 = safe(computeStatueBonusGiven, 19, ci, ctx.saveData);
    var g17sum = 0.5 * petArena5 + friend5 + petArena14 + statue19 / 100;
    var g17 = 1 + g17sum;

    // ===== GROUP 18: Mainframe(9) + Vault x Killz =====
    var mf9 = safe(mainframeBonus, 9, s);
    var vault34 = rval(vault, 34, ctx);
    var vault37 = rval(vault, 37, ctx);
    var killz8 = safe(computeVaultKillzTotal, 8, s);
    var killz9 = safe(computeVaultKillzTotal, 9, s);
    var g18sum = mf9 + vault34 * killz8 + vault37 * killz9;
    var g18 = 1 + g18sum / 100;

    // ===== GROUP 19: Pristine(16) =====
    var pristine16 = rval(pristine, 16, ctx);
    var g19 = 1 + pristine16 / 100;

    // ===== GROUP 20: Prayer(8) =====
    var prayer8 = computePrayerReal(8, 0, ci, s);
    var prayer8val = Number(prayer8) || 0;
    var g20 = 1 + prayer8val / 100;

    // ===== GROUP 21: Divinity Minor + CropSC(4) =====
    var divMinor = safe(computeDivinityMinor, -1, 3, s, ci);
    var cropSC4 = safe(computeCropSC, 4, s);
    var g21 = 1 + (divMinor + cropSC4) / 100;

    // ===== GROUP 22: Big additive group =====
    // Game uses GetTalentNumber(1,X) for talents 657,22 (per-character)
    // and TalentCalc(X) for 643,644 (per-character, with multipliers)
    // TC(643) = OverkillStuffs("2") = raw overkill tier (1-50). Requires MaxDamage + MonsterHP.
    // TC(644) = Lv0[10] / 10 = charLevel / 10 (NOT GTN * Lv0 / 10)
    var talent657 = rval(talent, 657, ctx);
    var vialMC = safe(computeVialByKey, 'MonsterCash', s, ci);
    var etc3 = rval(etcBonus, '3', ctx);
    var _cb11 = safe(computeCardBonusByType, 11, ci, s);
    var cardBonus11 = (typeof _cb11 === 'object' && _cb11) ? (_cb11.val || 0) : Number(_cb11) || 0;
    var cardW5b1 = 7 * safe(cardLv, 'w5b1', s);
    var talent22 = rval(talent, 22, ctx);
    var flurboShop4 = safe(computeFlurboShop, 4, s);
    var arcade10 = rval(arcade, 10, ctx);
    var arcade11 = rval(arcade, 11, ctx);
    var _br13c = safe(computeBoxReward, ci, '13c');
    var boxReward13c = (typeof _br13c === 'object' && _br13c) ? (_br13c.val || 0) : Number(_br13c) || 0;
    var guild8 = rval(guild, 8, ctx);
    var mapIdx = ctx.mapIdx != null ? ctx.mapIdx : (currentMapData && currentMapData[ci]) || 0;
    var guildMapFactor = 1 + Math.floor(mapIdx / 50);
    var guildContrib = guild8 * guildMapFactor;
    var overkillResult = null;
    try { overkillResult = ctx.resolve && ctx.resolve('overkill-tier'); } catch(e) {}
    var overkillTier = overkillResult && !overkillResult.unavailable
      ? Number(overkillResult.val) || 1
      : 1;
    var talentCalc643 = rval(talent, 643, ctx) * overkillTier;
    var lv0_10 = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][10]) || 0;
    var talentCalc644 = rval(talent, 644, ctx) * lv0_10 / 10;
    var _gf = null;
    try { _gf = goldFoodBonuses('MonsterCash', ci, undefined, ctx.saveData); } catch(e) {}
    var gfoodMC = (_gf && typeof _gf === 'object') ? (Number(_gf.total) || 0) : (Number(_gf) || 0);
    var vault17 = rval(vault, 17, ctx);
    var ola340 = Number(optionsListData[340]) || 0;
    var vaultLog = vault17 * getLOG(ola340);
    var ach235 = 5 * safe(achieveStatus, 235, s);
    var ach350 = 10 * safe(achieveStatus, 350, s);
    var ach376 = 20 * safe(achieveStatus, 376, s);
    var vault2 = rval(vault, 2, ctx);
    var vault14 = rval(vault, 14, ctx);
    var killz4 = safe(computeVaultKillzTotal, 4, s);
    var vault31 = rval(vault, 31, ctx);
    var killz7 = safe(computeVaultKillzTotal, 7, s);
    var ola420 = Number(optionsListData[420]) || 0;
    var vault70 = rval(vault, 70, ctx);
    var cardsCollected = 0;
    var cardLevels = s.cards0Data || {};
    for (var cardKey in cardLevels) {
      if ((Number(cardLevels[cardKey]) || 0) >= 1) cardsCollected++;
    }

    var g22sum = talent657 + vialMC + etc3 + cardBonus11 + cardW5b1
      + talent22 + flurboShop4 + arcade10 + arcade11
      + boxReward13c + guildContrib + talentCalc643 + talentCalc644
      + gfoodMC + vaultLog + ach235 + ach350 + ach376
      + vault2 + vault14 * killz4 + vault31 * killz7
      + ola420 + vault70 * cardsCollected;
    if (g22sum !== g22sum) { g22sum = 0; }
    var g22 = 1 + g22sum / 100;

    // NaN guard — clamp broken groups to 1
    var groups = [g1,g2,g3,g4,g4b,g5,g6,g7,g8,g9,g10,g11,g12,g13,g14,g15,g16,g17,g18,g19,g20,g21,g22];
    for (var gi = 0; gi < groups.length; gi++) {
      if (groups[gi] !== groups[gi] || groups[gi] == null) {
        groups[gi] = 1;
      }
    }

    // ===== Final product =====
    var val = 1;
    for (var gi = 0; gi < groups.length; gi++) val *= groups[gi];

    // ===== Build breakdown tree =====
    var children = [];

    // G1: Alchemy x Stats
    var g1ch = [];
    if (g1strPart > 0) g1ch.push({ name: label('Bubble', 'O15'), val: g1strPart, fmt: 'raw',
      note: 'STR ' + Math.round(totalSTR) + ', bubble value ' + Number(cashSTR).toFixed(1) });
    if (g1agiPart > 0) g1ch.push({ name: label('Bubble', 'G15'), val: g1agiPart, fmt: 'raw',
      note: 'AGI ' + Math.round(totalAGI) + ', bubble value ' + Number(cashAGI).toFixed(1) });
    if (g1wisPart > 0) g1ch.push({ name: label('Bubble', 'P15'), val: g1wisPart, fmt: 'raw',
      note: 'WIS ' + Math.round(totalWIS) + ', bubble value ' + Number(cashWIS).toFixed(1) });
    children.push({ name: 'Cash Bubbles from Main Stats', val: groups[0], children: g1ch.length ? g1ch : null, fmt: 'x' });

    // G2-4: Companions
    children.push({ name: label('Companion', 24), val: groups[1], fmt: 'x', note: 'cap 4' });
    children.push({ name: label('Companion', 45), val: groups[2], fmt: 'x', note: 'cap 4' });
    children.push({ name: label('Companion', 159), val: groups[3], fmt: 'x', note: 'cap 4' });

    // G4b: CoinDropMulti
    children.push({ name: label('Companion', 38), val: groups[4], fmt: 'x' });

    // G5-6: EventShop
    children.push({ name: 'Event Shop: Monster Cash I', val: groups[5], fmt: 'x', note: '0.5 per purchase' });
    children.push({ name: 'Event Shop: Monster Cash II', val: groups[6], fmt: 'x', note: '0.6 per purchase' });

    // G7: EtcBonuses 77
    children.push({ name: 'Equip Bonus Money', val: groups[7],
      children: etc77 > 0 ? [{ name: label('EtcBonus', 77), val: etc77, fmt: 'raw' }] : null, fmt: 'x' });

    // G8-9: RoG Sushi bonuses
    children.push({ name: label('RoG', 18) + ' I', val: groups[8], fmt: 'x', note: rog18 + '%' });
    children.push({ name: label('RoG', 37) + ' II', val: groups[9], fmt: 'x', note: rog37 + '%' });

    // G10: Grid
    var g10ch = [];
    if (grid149 > 0) g10ch.push({ name: label('Grid', 149), val: grid149, fmt: 'raw' });
    if (grid169 > 0) g10ch.push({ name: label('Grid', 169), val: grid169, fmt: 'raw' });
    children.push({ name: 'Grid Bonus', val: groups[10], children: g10ch.length ? g10ch : null, fmt: 'x' });

    // G11: EtcBonuses 100
    children.push({ name: 'Equip Extra Money', val: groups[11],
      children: etc100 > 0 ? [{ name: label('EtcBonus', 100), val: etc100, fmt: 'raw' }] : null, fmt: 'x' });

    // G12: GOLD_SET
    children.push({ name: 'Gold Equipment Set', val: groups[12], fmt: 'x' });

    // G13: Gambit
    children.push({ name: label('Gambit', 7), val: groups[13], fmt: 'x',
      note: gambit7 > 0 ? gambit7.toFixed(1) + '%' : 'Not unlocked' });

    // G14: Bundle
    children.push({ name: 'Bundle: Monster Cash', val: groups[14], fmt: 'x', note: '+250% when owned' });

    // G15: Talent 433 x log
    var g15ch = [];
    if (chipBonus433 > 0) g15ch.push({ name: label('Talent', 433), val: chipBonus433, fmt: 'raw' });
    if (ola362 > 0) g15ch.push({ name: 'Cooking Level Scaling', val: getLOG(ola362), fmt: 'raw', note: 'Cooking level ' + ola362 });
    children.push({ name: label('Talent', 433) + ' and Cooking Level', val: groups[15], children: g15ch.length ? g15ch : null, fmt: 'x' });

    // G16: Meal + Artifact + Roo + Voting
    var g16ch = [];
    if (mealCash > 0) g16ch.push({ name: 'Meals: Monster Cash', val: mealCash, fmt: 'raw' });
    if (artifactBonus1 > 0) g16ch.push({ name: label('Artifact', 1), val: artifactBonus1, fmt: 'raw' });
    if (rooBonus6 > 0) g16ch.push({ name: 'Poppy: Monster Cash', val: rooBonus6, fmt: 'raw' });
    if (voting34 > 0) g16ch.push({ name: label('Voting', 34), val: voting34, fmt: 'raw' });
    children.push({ name: 'Meals, Maneki Kat, Poppy, and Voting', val: groups[16],
      children: g16ch.length ? g16ch : null, fmt: 'x' });

    // G17: PetArena + Friend + Statue
    var g17ch = [];
    if (friend5 > 0) g17ch.push({ name: 'Friend Bonus: Monster Cash', val: friend5, fmt: 'raw' });
    if (petArena5 > 0) g17ch.push({ name: 'Pet Arena: Cash I', val: 0.5 * petArena5, fmt: 'raw' });
    if (petArena14 > 0) g17ch.push({ name: 'Pet Arena: Cash II', val: petArena14, fmt: 'raw' });
    if (statue19 > 0) g17ch.push({ name: label('Statue', 19), val: statue19 / 100,
      fmt: 'raw', note: 'Statue bonus ' + Number(statue19).toFixed(1) });
    children.push({ name: 'Pet Arena, Friends, and Pecunia', val: groups[17],
      children: g17ch.length ? g17ch : null, fmt: 'x' });

    // G18: Mainframe + Vault x Killz
    var g18ch = [];
    if (mf9 > 0) g18ch.push({ name: label('Mainframe', 9), val: mf9, fmt: 'raw' });
    if (vault34 * killz8 > 0) g18ch.push({ name: label('Vault', 34), val: vault34 * killz8,
      fmt: 'raw', note: killz8 + ' completed tasks' });
    if (vault37 * killz9 > 0) g18ch.push({ name: label('Vault', 37), val: vault37 * killz9,
      fmt: 'raw', note: killz9 + ' capped bubble levels' });
    children.push({ name: 'Mainframe and Vault Progress', val: groups[18],
      children: g18ch.length ? g18ch : null, fmt: 'x' });

    // G19: Pristine
    children.push({ name: label('Pristine', 16), val: groups[19], fmt: 'x' });

    // G20: Prayer
    children.push({ name: label('Prayer', 8), val: groups[20],
      children: prayer8.children, fmt: 'x' });

    // G21: Divinity + CropSC
    var g21ch = [];
    if (divMinor > 0) g21ch.push({ name: 'Divinity Minor: Harriep', val: divMinor, fmt: 'raw' });
    if (cropSC4 > 0) g21ch.push({ name: 'Crop Scientist: Cash', val: cropSC4, fmt: 'raw',
      note: s.farmCropCount + ' crops' });
    children.push({ name: 'Divinity and Crop Scientist', val: groups[21],
      children: g21ch.length ? g21ch : null, fmt: 'x' });

    // G22: Big additive group
    var g22ch = [];
    if (talent657 > 0) g22ch.push({ name: label('Talent', 657), val: talent657, fmt: 'raw' });
    if (vialMC > 0) g22ch.push({ name: 'Vial: Monster Cash', val: vialMC, fmt: 'raw' });
    if (etc3 > 0) g22ch.push({ name: label('EtcBonus', 3), val: etc3, fmt: 'raw' });
    if (cardBonus11 > 0) g22ch.push({ name: 'Cards: Monster Cash', val: cardBonus11, fmt: 'raw' });
    if (cardW5b1 > 0) g22ch.push({ name: 'Card: Molti', val: cardW5b1, fmt: 'raw', note: '7 per card level' });
    if (talent22 > 0) g22ch.push({ name: label('Talent', 22), val: talent22, fmt: 'raw' });
    if (flurboShop4 > 0) g22ch.push({ name: label('Flurbo Shop', 4), val: flurboShop4, fmt: 'raw' });
    if (arcade10 + arcade11 > 0) g22ch.push({ name: 'Arcade: Cash from Mobs', val: arcade10 + arcade11, fmt: 'raw' });
    if (boxReward13c > 0) g22ch.push({ name: 'Box Rewards: Monster Cash', val: boxReward13c, fmt: 'raw' });
    if (guildContrib > 0) g22ch.push({ name: label('Guild', 8) + ' x map', val: guildContrib, children: [
      { name: 'Guild Base', val: guild8, fmt: 'raw' },
      { name: 'Map Factor', val: guildMapFactor, fmt: 'x', note: 'map=' + mapIdx },
    ], fmt: 'raw' });
    if (talentCalc643 > 0) g22ch.push({ name: label('Talent', 643), val: talentCalc643, fmt: 'raw', note: 'scales with overkill tier' });
    if (talentCalc644 > 0) g22ch.push({ name: label('Talent', 644), val: talentCalc644, fmt: 'raw', note: 'class level scaler ' + lv0_10 });
    if (gfoodMC > 0) g22ch.push({ name: 'Golden Food: Monster Cash', val: gfoodMC, fmt: 'raw' });
    if (vaultLog > 0) g22ch.push({ name: label('Vault', 17), val: vaultLog,
      fmt: 'raw', note: 'Vault scaling progress ' + ola340 });
    var achSum = ach235 + ach350 + ach376;
    if (achSum > 0) g22ch.push({ name: 'Achievements', val: achSum, fmt: 'raw', children: [
      { name: label('Achievement', 235) + ' x5', val: ach235, fmt: 'raw' },
      { name: label('Achievement', 350) + ' x10', val: ach350, fmt: 'raw' },
      { name: label('Achievement', 376) + ' x20', val: ach376, fmt: 'raw' },
    ] });
    if (vault2 > 0) g22ch.push({ name: label('Vault', 2), val: vault2, fmt: 'raw' });
    if (vault14 * killz4 > 0) g22ch.push({ name: label('Vault', 14), val: vault14 * killz4, fmt: 'raw', note: 'kill-count tier ' + killz4 });
    if (vault31 * killz7 > 0) g22ch.push({ name: label('Vault', 31), val: vault31 * killz7, fmt: 'raw', note: 'kill-count tier ' + killz7 });
    if (ola420 > 0) g22ch.push({ name: label('Ola', 420), val: ola420, fmt: 'raw' });
    if (vault70 * cardsCollected > 0) g22ch.push({ name: label('Vault', 70) + ' x Cards', val: vault70 * cardsCollected,
      fmt: 'raw', note: cardsCollected + ' cards' });
    children.push({ name: 'Other Additive Sources', val: groups[22], children: g22ch.length ? g22ch : null, fmt: 'x' });

    var missingMetadata = [];
    if (s.companionDataAvailable === false) missingMetadata.push('companion ownership');
    if (s.activeVoteDataAvailable === false) missingMetadata.push('current server vote');
    if (overkillResult && (overkillResult.partial || overkillResult.unavailable) && overkillResult.reason) {
      missingMetadata.push('Overkill: ' + overkillResult.reason);
    }
    return {
      val: val,
      children: children,
      partial: missingMetadata.length > 0,
      reason: missingMetadata.length > 0
        ? 'Partial total: the imported JSON does not include ' + missingMetadata.join(' or ') + ' metadata.'
        : '',
    };
  },
});
