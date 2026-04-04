// ===== COIN MULTI DESCRIPTOR =====
// MonsterCash formula: 20 multiplicative groups, each (1 + bonus/100).
// Scope: character (TotalStats is per-character).

import { companions, pristineBon, vaultUpgBonus,
  getSetBonus, votingBonusz, goldFoodBonuses, cardLv,
} from '../systems/common/goldenFood.js';
import { eventShopOwned } from '../../game-helpers.js';
import { getLOG, formulaEval } from '../../formulas.js';
import { label } from '../entity-names.js';
import { grid, mainframeBonus } from '../systems/w4/lab.js';
import { arcadeBonus } from '../systems/w2/arcade.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { legendPTSbonus } from '../systems/w7/spelunking.js';
import { computeTotalStat } from '../systems/common/stats.js';
import { isBubblePrismad, getPrismaBonusMult } from '../systems/w2/alchemy.js';
import { AlchemyDescription } from '../data/game/customlists.js';
import { cauldronInfoData, optionsListData, prayersPerCharData } from '../../save/data.js';
import { prayerBaseBonus } from '../data/w3/prayer.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { guild } from '../systems/common/guild.js';
import { friend } from '../systems/common/friend.js';
import { talent } from '../systems/common/talent.js';
import votingMultiDesc from './voting-multi.js';
import { saveData } from '../../state.js';

// Helper: compute bubble value by effect key (e.g. 'CashSTR')
function bubbleValByKey(key) {
  for (var c = 0; c < 4; c++) {
    var arr = AlchemyDescription[c];
    if (!arr) continue;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i][15] === key) {
        var lv = Number((cauldronInfoData && cauldronInfoData[c] && cauldronInfoData[c][i]) || 0);
        if (lv <= 0) return 0;
        var baseVal = formulaEval(arr[i][3], Number(arr[i][1]), Number(arr[i][2]), lv);
        var isPrisma = isBubblePrismad(c, i);
        var prismaMult = isPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
        return baseVal * prismaMult;
      }
    }
  }
  return 0;
}

// Helper: count unique collected cards
function countCardsCollected() {
  var c0 = saveData.cards0Data;
  if (!c0) return 0;
  var count = 0;
  for (var key in c0) {
    if (Number(c0[key]) >= 1) count++;
  }
  return count;
}

// Helper: safe resolve — returns .val or 0 if resolver throws
function rval(resolver, id, ctx, args) {
  try { return resolver.resolve(id, ctx, args).val || 0; }
  catch(e) { return 0; }
}

// Helper: safe function call — returns 0 on throw or NaN
function safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;  // NaN check: v !== v
  } catch(e) { return 0; }
}

export default {
  id: 'coin-multi',
  name: 'Coin Multiplier',
  scope: 'character',
  category: 'multiplier',

  pools: {},

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 1, children: null };
    var ci = ctx.charIdx || 0;

    // ===== GROUP 1: Alchemy bubbles x floor(stat/250) =====
    var cashSTR = safe(bubbleValByKey, 'CashSTR');
    var cashAGI = safe(bubbleValByKey, 'CashAGI');
    var cashWIS = safe(bubbleValByKey, 'CashWIS');
    var totalSTR = 0, totalAGI = 0, totalWIS = 0;
    try {
      var _s = computeTotalStat('STR', ci, ctx); totalSTR = _s.computed || 0;
      var _a = computeTotalStat('AGI', ci, ctx); totalAGI = _a.computed || 0;
      var _w = computeTotalStat('WIS', ci, ctx); totalWIS = _w.computed || 0;
    } catch(e) { /* stats not available */ }
    var g1strPart = cashSTR * Math.floor(totalSTR / 250);
    var g1agiPart = cashAGI * Math.floor(totalAGI / 250);
    var g1wisPart = cashWIS * Math.floor(totalWIS / 250);
    var g1sum = g1strPart + g1agiPart + g1wisPart;
    var g1 = 1 + g1sum / 100;

    // ===== GROUPS 2-4: Companions (capped at 4) =====
    var comp24 = Math.min(4, safe(companions, 24));
    var comp45 = Math.min(4, safe(companions, 45));
    var comp159 = Math.min(4, safe(companions, 159));
    var g2 = 1 + comp24;
    var g3 = 1 + comp45;
    var g4 = 1 + comp159;

    // ===== GROUPS 5-6: EventShop =====
    var evStr = s.cachedEventShopStr;
    var evShop9 = eventShopOwned(9, evStr);
    var evShop20 = eventShopOwned(20, evStr);
    var g5 = 1 + 0.5 * evShop9;
    var g6 = 1 + 0.6 * evShop20;

    // ===== GROUP 7: EtcBonuses("77") = %_BONUS_MONEY =====
    var etc77 = rval(etcBonus, '77', ctx);
    var g7 = 1 + etc77 / 100;

    // ===== GROUP 8: Grid 149 + Grid 169 =====
    var grid149 = rval(grid, 149, ctx);
    var grid169 = rval(grid, 169, ctx);
    var g8 = 1 + (grid149 + grid169) / 100;

    // ===== GROUP 9: EtcBonuses("100") = %_EXTRA_MONEY =====
    var etc100 = rval(etcBonus, '100', ctx);
    var g9 = 1 + etc100 / 100;

    // ===== GROUP 10: GOLD_SET set bonus =====
    var goldSet = safe(getSetBonus, 'GOLD_SET');
    var g10 = 1 + goldSet / 100;

    // ===== GROUP 11: Gambit bonus 7 =====
    // TODO: requires generic gambit bonus computation
    var gambit7 = 0;
    var g11 = 1 + gambit7 / 100;

    // ===== GROUP 12: Bundle bun_y x 250 =====
    var bunY = (s.bundlesData && s.bundlesData.bun_y === 1) ? 1 : 0;
    var g12 = 1 + 250 * bunY / 100;

    // ===== GROUP 13: getbonus2(1,433,-1) x log(OLA[362]) =====
    var chipBonus433 = rval(talent, 433, ctx, { mode: 'max' });
    var ola362 = Number(optionsListData[362]) || 0;
    var g13val = Math.max(1, chipBonus433) * getLOG(ola362);
    var g13 = 1 + g13val / 100;

    // ===== GROUP 14: Meal + Artifact + Roo + Voting(34) =====
    var votingMulti = 1;
    try { var vmResult = votingMultiDesc.combine({}, ctx); votingMulti = vmResult.val || 1; } catch(e) {}
    var voting34 = safe(votingBonusz, 34, votingMulti);
    var mealCash = 0; // TODO: MealBonus("Cash")
    var artifactBonus1 = 0; // TODO: Sailing artifact 1
    var rooBonus6 = 0; // TODO: RooBonuses(6)
    var g14sum = mealCash + artifactBonus1 + rooBonus6 + voting34;
    var g14 = 1 + g14sum / 100;

    // ===== GROUP 15: PetArena + Friend + Statue(19) =====
    var friend5 = rval(friend, 5, ctx);
    var petArena5 = 0; // TODO: PetArenaBonus("0", 5)
    var petArena14 = 0; // TODO: PetArenaBonus("0", 14)
    var statue19 = 0; // TODO: StatueBonusGiven(19)
    var g15sum = 0.5 * petArena5 + friend5 + petArena14 + statue19 / 100;
    var g15 = 1 + g15sum;

    // ===== GROUP 16: Mainframe(9) + Vault x Killz =====
    var mf9 = safe(mainframeBonus, 9);
    var vault34 = safe(vaultUpgBonus, 34);
    var vault37 = safe(vaultUpgBonus, 37);
    var killz8 = 0; // TODO: VaultKillzTotal(8)
    var killz9 = 0; // TODO: VaultKillzTotal(9)
    var g16sum = mf9 + vault34 * killz8 + vault37 * killz9;
    var g16 = 1 + g16sum / 100;

    // ===== GROUP 17: Pristine(16) =====
    var pristine16 = safe(pristineBon, 16);
    var g17 = 1 + pristine16 / 100;

    // ===== GROUP 18: Prayer(8) =====
    var prayerLv8 = Number(s.prayOwnedData && s.prayOwnedData[8]) || 0;
    var prayEquipped8 = false;
    try { prayEquipped8 = (prayersPerCharData[ci] || []).includes(8); } catch(e) {}
    var prayer8val = 0;
    var pBase8 = safe(prayerBaseBonus, 8);
    if (prayerLv8 > 0 && prayEquipped8) {
      var pScale8 = Math.max(1, 1 + (prayerLv8 - 1) / 10);
      prayer8val = Math.round(pBase8 * pScale8);
    }
    var g18 = 1 + prayer8val / 100;

    // ===== GROUP 19: Divinity Minor + CropSC(4) =====
    var divMinor = 0; // TODO: Divinity("Bonus_Minor", -1, 3)
    var cropSC4 = 0; // TODO: CropSCbonus(4)
    var g19 = 1 + (divMinor + cropSC4) / 100;

    // ===== GROUP 20: Big additive group =====
    var talent657 = rval(talent, 657, ctx, { mode: 'max' });
    var vialMC = 0; // TODO: AlchVials.MonsterCash
    var etc3 = rval(etcBonus, '3', ctx);
    var cardBonus11 = 0; // TODO: CardBonusREAL(11)
    var cardW5b1 = 7 * safe(cardLv, 'w5b1');
    var talent22 = rval(talent, 22, ctx, { mode: 'max' });
    var flurboShop4 = 0; // TODO: FlurboShop(4)
    var arcade10 = safe(arcadeBonus, 10);
    var arcade11 = safe(arcadeBonus, 11);
    var boxReward13c = 0; // TODO: BoxRewards("13c")
    var guild8 = rval(guild, 8, ctx);
    var mapIdx = ctx.mapIdx || 0;
    var guildMapFactor = 1 + Math.floor(mapIdx / 50);
    var guildContrib = guild8 * guildMapFactor;
    var talentCalc643 = 0; // TODO: TalentCalc(643)
    var talentCalc644 = 0; // TODO: TalentCalc(644)
    var gfoodMC = 0;
    try { gfoodMC = goldFoodBonuses('MonsterCash', ci) || 0; } catch(e) {}
    var vault17 = safe(vaultUpgBonus, 17);
    var ola340 = Number(optionsListData[340]) || 0;
    var vaultLog = vault17 * getLOG(ola340);
    var ach235 = 5 * safe(achieveStatus, 235);
    var ach350 = 10 * safe(achieveStatus, 350);
    var ach376 = 20 * safe(achieveStatus, 376);
    var vault2 = safe(vaultUpgBonus, 2);
    var vault14 = safe(vaultUpgBonus, 14);
    var killz4 = 0; // TODO: VaultKillzTotal(4)
    var vault31 = safe(vaultUpgBonus, 31);
    var killz7 = 0; // TODO: VaultKillzTotal(7)
    var ola420 = Number(optionsListData[420]) || 0;
    var vault70 = safe(vaultUpgBonus, 70);
    var cardsCollected = safe(countCardsCollected);

    var g20sum = talent657 + vialMC + etc3 + cardBonus11 + cardW5b1
      + talent22 + flurboShop4 + arcade10 + arcade11
      + boxReward13c + guildContrib + talentCalc643 + talentCalc644
      + gfoodMC + vaultLog + ach235 + ach350 + ach376
      + vault2 + vault14 * killz4 + vault31 * killz7
      + ola420 + vault70 * cardsCollected;
    if (g20sum !== g20sum) {
      console.warn('[CoinMulti] g20sum is NaN. All terms:', JSON.stringify({
        talent657:talent657,vialMC:vialMC,etc3:etc3,cardBonus11:cardBonus11,cardW5b1:cardW5b1,
        talent22:talent22,flurboShop4:flurboShop4,arcade10:arcade10,arcade11:arcade11,
        boxReward13c:boxReward13c,guildContrib:guildContrib,guild8:guild8,guildMapFactor:guildMapFactor,
        talentCalc643:talentCalc643,talentCalc644:talentCalc644,
        gfoodMC:gfoodMC,vaultLog:vaultLog,vault17:vault17,ola340:ola340,
        ach235:ach235,ach350:ach350,ach376:ach376,
        vault2:vault2,vault14:vault14,killz4:killz4,vault31:vault31,killz7:killz7,
        ola420:ola420,vault70:vault70,cardsCollected:cardsCollected}));
      g20sum = 0;
    }
    var g20 = 1 + g20sum / 100;

    // NaN guard — log which group is broken and clamp to 1
    var groups = [g1,g2,g3,g4,g5,g6,g7,g8,g9,g10,g11,g12,g13,g14,g15,g16,g17,g18,g19,g20];
    for (var gi = 0; gi < groups.length; gi++) {
      if (groups[gi] !== groups[gi] || groups[gi] == null) {
        console.warn('[CoinMulti] Group ' + (gi + 1) + ' is NaN/null, clamping to 1. Raw value:', groups[gi],
          'g20=', g20, 'g20sum=', g20sum);
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
    if (g1strPart > 0) g1ch.push({ name: 'CashSTR x floor(STR/250)', val: g1strPart, fmt: 'raw',
      note: 'STR=' + Math.round(totalSTR) + ' bubble=' + cashSTR.toFixed(1) });
    if (g1agiPart > 0) g1ch.push({ name: 'CashAGI x floor(AGI/250)', val: g1agiPart, fmt: 'raw',
      note: 'AGI=' + Math.round(totalAGI) + ' bubble=' + cashAGI.toFixed(1) });
    if (g1wisPart > 0) g1ch.push({ name: 'CashWIS x floor(WIS/250)', val: g1wisPart, fmt: 'raw',
      note: 'WIS=' + Math.round(totalWIS) + ' bubble=' + cashWIS.toFixed(1) });
    children.push({ name: 'Alchemy x Stats', val: groups[0], children: g1ch.length ? g1ch : null, fmt: 'x' });

    // G2-4: Companions
    children.push({ name: label('Companion', 24), val: groups[1], fmt: 'x', note: 'cap 4' });
    children.push({ name: label('Companion', 45), val: groups[2], fmt: 'x', note: 'cap 4' });
    children.push({ name: label('Companion', 159), val: groups[3], fmt: 'x', note: 'cap 4' });

    // G5-6: EventShop
    children.push({ name: label('EventShop', 9) + ' x0.5', val: groups[4], fmt: 'x' });
    children.push({ name: label('EventShop', 20) + ' x0.6', val: groups[5], fmt: 'x' });

    // G7: EtcBonuses 77
    children.push({ name: 'Equip Bonus Money', val: groups[6],
      children: etc77 > 0 ? [{ name: 'EtcBonuses(77)', val: etc77, fmt: 'raw' }] : null, fmt: 'x' });

    // G8: Grid
    var g8ch = [];
    if (grid149 > 0) g8ch.push({ name: label('Grid', 149), val: grid149, fmt: 'raw' });
    if (grid169 > 0) g8ch.push({ name: label('Grid', 169), val: grid169, fmt: 'raw' });
    children.push({ name: 'Grid Bonus', val: groups[7], children: g8ch.length ? g8ch : null, fmt: 'x' });

    // G9: EtcBonuses 100
    children.push({ name: 'Equip Extra Money', val: groups[8],
      children: etc100 > 0 ? [{ name: 'EtcBonuses(100)', val: etc100, fmt: 'raw' }] : null, fmt: 'x' });

    // G10: GOLD_SET
    children.push({ name: label('SetBonus', 'GOLD_SET'), val: groups[9], fmt: 'x' });

    // G11: Gambit
    children.push({ name: label('Gambit', 7), val: groups[10], fmt: 'x', note: 'Not yet computed' });

    // G12: Bundle
    children.push({ name: label('Bundle', 'bun_y') + ' x250', val: groups[11], fmt: 'x' });

    // G13: Talent 433 x log
    var g13ch = [];
    if (chipBonus433 > 0) g13ch.push({ name: label('Talent', 433), val: chipBonus433, fmt: 'raw' });
    if (ola362 > 0) g13ch.push({ name: 'log(OLA[362])', val: getLOG(ola362), fmt: 'raw', note: 'raw=' + ola362 });
    children.push({ name: label('Talent', 433) + ' x log', val: groups[12], children: g13ch.length ? g13ch : null, fmt: 'x' });

    // G14: Meal + Artifact + Roo + Voting
    var g14ch = [];
    if (voting34 > 0) g14ch.push({ name: label('Voting', 34), val: voting34, fmt: 'raw' });
    if (mealCash > 0) g14ch.push({ name: 'Meal Cash', val: mealCash, fmt: 'raw' });
    if (artifactBonus1 > 0) g14ch.push({ name: label('Artifact', 1), val: artifactBonus1, fmt: 'raw' });
    if (rooBonus6 > 0) g14ch.push({ name: 'Roo Bonus 6', val: rooBonus6, fmt: 'raw' });
    children.push({ name: 'Meal + Artifact + Roo + Voting', val: groups[13],
      children: g14ch.length ? g14ch : null, fmt: 'x' });

    // G15: PetArena + Friend + Statue
    var g15ch = [];
    if (friend5 > 0) g15ch.push({ name: label('Friend', 5), val: friend5, fmt: 'raw' });
    if (petArena5 > 0) g15ch.push({ name: 'PetArena 5 x0.5', val: 0.5 * petArena5, fmt: 'raw' });
    if (petArena14 > 0) g15ch.push({ name: 'PetArena 14', val: petArena14, fmt: 'raw' });
    if (statue19 > 0) g15ch.push({ name: label('Statue', 19) + ' /100', val: statue19 / 100, fmt: 'raw' });
    children.push({ name: 'PetArena + Friend + Statue', val: groups[14],
      children: g15ch.length ? g15ch : null, fmt: 'x' });

    // G16: Mainframe + Vault x Killz
    var g16ch = [];
    if (mf9 > 0) g16ch.push({ name: label('Mainframe', 9), val: mf9, fmt: 'raw' });
    if (vault34 > 0) g16ch.push({ name: label('Vault', 34) + ' x Killz8', val: vault34 * killz8,
      fmt: 'raw', note: 'killz=' + killz8 });
    if (vault37 > 0) g16ch.push({ name: label('Vault', 37) + ' x Killz9', val: vault37 * killz9,
      fmt: 'raw', note: 'killz=' + killz9 });
    children.push({ name: 'Mainframe + Vault x Killz', val: groups[15],
      children: g16ch.length ? g16ch : null, fmt: 'x' });

    // G17: Pristine
    children.push({ name: label('Pristine', 16), val: groups[16], fmt: 'x' });

    // G18: Prayer
    children.push({ name: label('Prayer', 8), val: groups[17],
      children: prayer8val > 0 ? [
        { name: 'Prayer Level', val: prayerLv8, fmt: 'raw' },
        { name: 'Base Bonus', val: pBase8, fmt: 'raw' },
      ] : null, fmt: 'x', note: !prayEquipped8 ? 'Not equipped' : '' });

    // G19: Divinity + CropSC
    children.push({ name: 'Divinity + CropSC', val: groups[18], fmt: 'x', note: 'Not yet computed' });

    // G20: Big additive group
    var g20ch = [];
    if (talent657 > 0) g20ch.push({ name: label('Talent', 657), val: talent657, fmt: 'raw' });
    if (vialMC > 0) g20ch.push({ name: 'Vial MonsterCash', val: vialMC, fmt: 'raw' });
    if (etc3 > 0) g20ch.push({ name: 'EtcBonuses(3)', val: etc3, fmt: 'raw' });
    if (cardBonus11 > 0) g20ch.push({ name: 'CardBonus 11', val: cardBonus11, fmt: 'raw' });
    if (cardW5b1 > 0) g20ch.push({ name: '7 x CardLv(w5b1)', val: cardW5b1, fmt: 'raw' });
    if (talent22 > 0) g20ch.push({ name: label('Talent', 22), val: talent22, fmt: 'raw' });
    if (flurboShop4 > 0) g20ch.push({ name: 'FlurboShop 4', val: flurboShop4, fmt: 'raw' });
    if (arcade10 + arcade11 > 0) g20ch.push({ name: label('Arcade', '10+11'), val: arcade10 + arcade11, fmt: 'raw' });
    if (boxReward13c > 0) g20ch.push({ name: 'BoxRewards 13c', val: boxReward13c, fmt: 'raw' });
    if (guildContrib > 0) g20ch.push({ name: label('Guild', 8) + ' x map', val: guildContrib, children: [
      { name: 'Guild Base', val: guild8, fmt: 'raw' },
      { name: 'Map Factor', val: guildMapFactor, fmt: 'x', note: 'map=' + mapIdx },
    ], fmt: 'raw' });
    if (talentCalc643 + talentCalc644 > 0) g20ch.push({ name: 'TalentCalc 643+644', val: talentCalc643 + talentCalc644, fmt: 'raw' });
    if (gfoodMC > 0) g20ch.push({ name: 'GoldFood MonsterCash', val: gfoodMC, fmt: 'raw' });
    if (vaultLog > 0) g20ch.push({ name: label('Vault', 17) + ' x log', val: vaultLog,
      fmt: 'raw', note: 'OLA[340]=' + ola340 });
    var achSum = ach235 + ach350 + ach376;
    if (achSum > 0) g20ch.push({ name: 'Achievements', val: achSum, fmt: 'raw', children: [
      { name: label('Achievement', 235) + ' x5', val: ach235, fmt: 'raw' },
      { name: label('Achievement', 350) + ' x10', val: ach350, fmt: 'raw' },
      { name: label('Achievement', 376) + ' x20', val: ach376, fmt: 'raw' },
    ] });
    if (vault2 > 0) g20ch.push({ name: label('Vault', 2), val: vault2, fmt: 'raw' });
    if (vault14 * killz4 > 0) g20ch.push({ name: label('Vault', 14) + ' x Killz4', val: vault14 * killz4, fmt: 'raw' });
    if (vault31 * killz7 > 0) g20ch.push({ name: label('Vault', 31) + ' x Killz7', val: vault31 * killz7, fmt: 'raw' });
    if (ola420 > 0) g20ch.push({ name: 'OLA[420]', val: ola420, fmt: 'raw' });
    if (vault70 * cardsCollected > 0) g20ch.push({ name: label('Vault', 70) + ' x Cards', val: vault70 * cardsCollected,
      fmt: 'raw', note: cardsCollected + ' cards' });
    children.push({ name: 'Big Additive Group', val: groups[19], children: g20ch.length ? g20ch : null, fmt: 'x' });

    return { val: val, children: children };
  },
};
