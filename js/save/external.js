// ===== EXTERNAL BONUS COMPUTATION =====
// Aggregator functions that combine bonuses from multiple game systems.
// Domain-specific computations now live in js/stats/systems/.

import {  S, assignState  } from '../state.js';
import {
  klaData,
  numCharacters,
} from './data.js';
import {
  cosmoUpgBase, holesBolaiaPerLv, HOLES_JAR_BONUS_PER_LV,
  holesMeasBase, holesMeasType, holesMonBonus,
} from '../stats/data/w5/hole.js';
import { dancingCoralBase, stickerBase } from '../stats/data/w7/research.js';
import { MINEHEAD_BONUS_QTY } from '../stats/data/w7/minehead.js';
import { DN_MOB_DATA } from '../stats/data/w7/deathNote.js';
import { gbWith, deathNoteRank } from '../sim-math.js';
import {
  emporiumBonus,
  eventShopOwned,
  ribbonBonusAt,
  superBitType,
  cloudBonus,
} from '../game-helpers.js';
import { mainframeBonus } from '../stats/systems/w4/lab.js';
import { arcadeBonus } from '../stats/systems/w2/arcade.js';
import { arcaneUpgBonus } from '../stats/systems/mc/tesseract.js';
import { computeCardLv } from '../stats/systems/common/cards.js';
import { exoticBonusQTY40 } from '../stats/systems/w6/farming.js';
import { grimoireUpgBonus22 } from '../stats/systems/mc/grimoire.js';
import { computeMeritocBonusz } from '../stats/systems/w7/meritoc.js';
import { mineheadBonusQTY } from '../stats/systems/w7/minehead.js';
import { computeShinyBonusS } from '../stats/systems/w4/breeding.js';
import { legendPTSbonus } from '../stats/systems/w7/spelunking.js';
import { computeWinBonus } from '../stats/systems/w6/summoning.js';
import { rogBonusQTY } from '../stats/systems/w7/sushi.js';
import { getLOG } from '../formulas.js';
// Grid bonus helper - uses _gbWith directly to avoid circular dep with calculations.js
function _gridBonusFinal(idx) {
  return gbWith(S.gridLevels, S.shapeOverlay, idx, { abm: S.allBonusMulti });
}

function cosmoBonus(t, i) {
  const base = cosmoUpgBase(t, i);
  return Math.floor(base * (Number(S.holesData?.[4 + t]?.[i]) || 0));
}

function computeOverkillQTY() {
  // Returns sum of OverkillQTY(0..6): death note rank sums per world
  let total = 0;
  for (let w = 0; w < 7; w++) {
    const mobs = DN_MOB_DATA[w];
    if (!mobs) continue;
    for (let m = 0; m < mobs.length; m++) {
      const [klaIdx, killReq] = mobs[m];
      if (klaIdx < 0) continue;
      let kills = 0;
      for (let ci = 0; ci < numCharacters; ci++) {
        const kla = klaData[ci];
        const left = Number(kla?.[klaIdx]?.[0]) || 0;
        kills += killReq - left;
      }
      total += deathNoteRank(Math.max(0, kills), 0);
    }
  }
  return total;
}

function computeMeasurementMulti(typeIdx) {
  // MeasurementQTYfound(type, 99)  normalized quantity
  let qty = 0;
  switch (typeIdx) {
    case 0: { const raw = Number(S.holesData?.[11]?.[28]) || 0; qty = raw > 0 ? getLOG(raw) : 0; break; }
    case 1: qty = S.farmCropCount / 14; break;
    case 3: qty = S.totalTomePoints / 2500; break;
    case 6: qty = computeOverkillQTY() / 125; break;
    case 8: qty = (S.cards1Data.length || 0) / 150; break;
    case 9: {
      let sum = 0;
      const bolaia = S.holesData[26] || [];
      for (let i = 0; i < bolaia.length; i++) sum += Number(bolaia[i]) || 0;
      qty = sum / 6; break;
    }
    default: qty = 0;
  }
  if (qty < 5) return 1 + 18 * qty / 100;
  return 1 + (18 * qty + 8 * (qty - 5)) / 100;
}

function computeGambitPTSmulti() {
  // MeasurementBonusTOTAL(13)
  const cosmo13 = cosmoBonus(1, 3);
  const measBaseStr = holesMeasBase(13) || '0';
  const isTOT = measBaseStr.includes('TOT');
  const measBaseNum = parseFloat(measBaseStr) || 0;
  const measLv = Number(S.holesData?.[22]?.[13]) || 0;
  let measBase;
  if (isTOT) {
    measBase = (1 + cosmo13 / 100) * (measBaseNum * measLv / (100 + measLv));
  } else {
    measBase = (1 + cosmo13 / 100) * measBaseNum * measLv;
  }
  const measType = holesMeasType(13);
  const measMulti = computeMeasurementMulti(measType);
  const measTotal = measBase * measMulti;

  // StudyBolaiaBonuses(13)
  const bolaiaLv = Number(S.holesData?.[26]?.[13]) || 0;
  const bolaiaPerLv = holesBolaiaPerLv(13);
  const studyBolaia = bolaiaLv * bolaiaPerLv;

  // B_UPG(78, 10)
  const bUpg78 = (Number(S.holesData?.[13]?.[78]) || 0) === 1 ? 10 : 0;

  // MonumentROGbonuses(2, 7)
  const mon29Lv = Number(S.holesData?.[15]?.[29]) || 0;
  const mon29Bonus = holesMonBonus(29);
  const mon29 = mon29Bonus >= 30
    ? 0.1 * Math.ceil(mon29Lv / (250 + mon29Lv) * 10 * mon29Bonus)
    : mon29Lv * mon29Bonus;
  const cosmo00 = cosmoBonus(0, 0);
  const holeozDN = (1 + mon29 / 100) + cosmo00 / 100;
  const mon27Lv = Number(S.holesData?.[15]?.[27]) || 0;
  const mon27Bonus = holesMonBonus(27);
  let monROG27;
  if (mon27Bonus >= 30) {
    monROG27 = 0.1 * Math.ceil(mon27Lv / (250 + mon27Lv) * 10 * mon27Bonus * Math.max(1, holeozDN));
  } else {
    monROG27 = mon27Lv * mon27Bonus * Math.max(1, holeozDN);
  }

  // JarCollectibleBonus(23) and (30)
  const legend29 = legendPTSbonus(29);
  const jar23 = (Number(S.holesData?.[24]?.[23]) || 0) * (HOLES_JAR_BONUS_PER_LV[23] || 0) * (1 + legend29 / 100);
  const jar30 = (Number(S.holesData?.[24]?.[30]) || 0) * (HOLES_JAR_BONUS_PER_LV[30] || 0) * (1 + legend29 / 100);

  // ArcaneUpgBonus(47)
  const arcane47 = arcaneUpgBonus(47);

  const sum = measTotal + studyBolaia + bUpg78 + monROG27 + jar23 + jar30 + arcane47;
  return { multi: 1 + sum / 100, parts: { measTotal, studyBolaia, bUpg78, monROG27, jar23, jar30, arcane47 } };
}

export function computeExternalBonuses() {
  const b = {};
  const _eventShopStr = S.cachedEventShopStr;
  const _gamingData12 = S.gamingData[12];
  const _ninjaData102_9 = S.ninjaData?.[102]?.[9];
  const _olaStr379 = S.olaData[379];

  // Compute S.allBonusMulti early so getGridBonusFinal calls below use the correct value
  const _comp55val = S.companionIds.has(55) ? 15 : 0;
  const _comp0val = S.companionIds.has(0) && S.cachedComp0DivOk && (S.gridLevels[173] || 0) > 0 ? 5 : 0;
  const _cbGridAll = cloudBonus(71, S.weeklyBossData) + cloudBonus(72, S.weeklyBossData) + cloudBonus(76, S.weeklyBossData);
  const _rog53val = S.cachedUniqueSushi > 53 ? 1 : 0;
  assignState({ allBonusMulti: 1 + (_comp55val + _comp0val + _cbGridAll + _rog53val) / 100 });

  // 1. StickerBonus(1) = (1 + (Grid_Bonus(68,2) + 30*EventShop(37))/100) * (1 + 20*SuperBit(62)/100) * R[9][1] * base
  const stkLv = S.research?.[9]?.[1] || 0;
  const stkBase = stickerBase(1) || 5;
  // Grid_Bonus(68, mode 2) = Grid_Bonus(68,0) * Research[11].length (boony crown count)
  const boonyCount = S.research?.[11]?.length || 0;
  const gridBonus68mode2 = _gridBonusFinal(68) * boonyCount;
  const stkCrownMulti = 1 + (gridBonus68mode2 + 30 * eventShopOwned(37, _eventShopStr)) / 100;
  const stkSuperbit62 = 1 + 20 * superBitType(62, _gamingData12) / 100;
  const autoSticker = stkCrownMulti * stkSuperbit62 * stkLv * stkBase;
  b.sticker = { val: autoSticker, label: 'Sticker Bonus', note: `LV${stkLv}x${stkBase}xcrown(${stkCrownMulti.toFixed(2)})xsb62(${stkSuperbit62.toFixed(2)})` };
  // Cache components for dynamic recalculation in sim
  assignState({
    cachedStickerFixed: stkSuperbit62 * stkLv * stkBase,
    cachedBoonyCount: boonyCount,
    cachedEvShop37: eventShopOwned(37, _eventShopStr),
  });

  // 2. Dancing Coral (index 4 = Research EXP)
  const tower22 = S.towerData[22] || 0;
  const dcBase = dancingCoralBase(4) || 3;
  b.dancingCoral = { val: dcBase * Math.max(0, tower22 - 200), label: 'Dancing Coral/Clover Shrine', note: `${dcBase} x max(0, ${tower22}-200)` };

  // 3. ZenithMarket (index 8)
  // ZenithMarket[8][4] = 1 (static), Spelunk[45][8] = purchase level
  const zmLevel = S.spelunkData?.[45]?.[8] || 0;
  b.zenithMarket = { val: Math.floor(1 * zmLevel), label: 'Zenith', note: `1 x ${zmLevel}` };

  // 4. Card levels
  const clvW7b1 = computeCardLv('w7b1');
  const clvW7b4 = computeCardLv('w7b4');
  b.cardW7b1 = { val: Math.min(clvW7b1, 10), label: 'Trench Fish Card', note: `min(${clvW7b1}, 10)` };
  b.cardW7b4 = { val: Math.min(2 * clvW7b4, 10), label: 'Eggroll Card', note: `min(2x${clvW7b4}, 10)` };

  // 5. GetSetBonus("PREHISTORIC_SET")  set value=100, capped at 50 in ResearchEXPmulti
  const ola379 = String(S.olaData[379] || '');
  b.prehistoricSet = { val: ola379.includes('PREHISTORIC_SET') ? 50 : 0, label: 'Prehistoric Set', note: ola379.includes('PREHISTORIC_SET') ? 'Unlocked: min(50, 100) = 50' : 'Not unlocked' };

  // 6. SlabboBonus(7) = 0.1 * mult * floor(max(0, Cards1.length-1300)/5). Requires SuperBit(34).
  const hasSB34 = superBitType(34, _gamingData12);
  const c1len = S.cards1Data.length || 0;
  const slabboBase = Math.floor(Math.max(0, c1len - 1300) / 5);
  // SlabboBonus_AllMulti = (1 + MeritocBonusz(23)/100) * (1 + LegendPTS_bonus(28)/100) * (1 + VaultUpgBonus(74)/100)
  // mult = (1 + MainframeBonus(15)/100) * SlabboBonus_AllMulti
  const slabboMF15 = mainframeBonus(15);
  const slabboMeritoc23 = computeMeritocBonusz(23);
  const slabboLegend28 = legendPTSbonus(28);
  const vub74 = S.vaultData[74] || 0;  // Super Slab — BonusPerLevel=1
  const slabboMult = (1 + slabboMF15 / 100) * (1 + slabboMeritoc23 / 100) * (1 + slabboLegend28 / 100) * (1 + vub74 / 100);
  const autoSlabbo = hasSB34 ? 0.1 * slabboMult * slabboBase : 0;
  b.slabbo = { val: autoSlabbo, label: 'Slab Bonus', note: hasSB34 ? `0.1x${slabboBase}xmulti(${slabboMult.toFixed(2)}) [MF15=${slabboMF15.toFixed(0)},merit=${slabboMeritoc23.toFixed(0)},leg=${slabboLegend28},vub74=${vub74}]` : 'SuperBit(34) not unlocked' };

  // 7. ArcadeBonus(63)  uses shared arcadeBonus helper
  const autoArcade = arcadeBonus(63);
  const arcLv = S.arcadeUpgData[63] || 0;
  b.arcade = { val: autoArcade, label: 'Arcade Bonus', note: `arcadeBonus(63) lv=${arcLv}  ${autoArcade.toFixed(2)}` };

  // 8. MealBonusesS  Giga_Chip (Meals[0][72], base 0.01, MealINFO[72][5]="ResearchXP")
  const mealLv = S.mealsData?.[0]?.[72] || 0;
  const ribT = S.ribbonData[100] || 0;
  const ribBon = ribbonBonusAt(100, S.ribbonData, _olaStr379, S.weeklyBossData);
  const mealBase = ribBon * mealLv * 0.01;
  // CookingMealBonusMultioo = (1 + (MainframeBonus(116) + ShinyBonusS(20))/100) x (1 + WinBonus(26)/100)
  const mfb116 = mainframeBonus(116);
  const shinyS20 = computeShinyBonusS(20);
  const winBon26 = computeWinBonus(26);
  const cookMulti = (1 + (mfb116 + shinyS20) / 100) * (1 + winBon26 / 100);
  const autoMeal = mealBase * cookMulti;
  b.meal = { val: autoMeal, label: 'Meal (Giga Chip)', note: `LV${mealLv}x0.01xrib=${ribBon.toFixed(3)}xcook(mfb=${mfb116},shiny=${shinyS20.toFixed(1)},win=${winBon26.toFixed(1)})=${autoMeal.toFixed(2)}` };

  // 9. CropSCbonus(9)  EmporiumBonus(44), floor(max(0,(crops-200)/10))
  const hasEmp44 = emporiumBonus(44, _ninjaData102_9);
  const cropRaw = hasEmp44 ? Math.floor(Math.max(0, (S.farmCropCount - 200) / 10)) : 0;
  // CropSCbonMulti = (1 + MainframeBonus(17)/100) x (1 + (GrimoireUpgBonus(22)+ExoticBonusQTY(40)+VaultUpgBonus(79))/100)
  const mf17 = mainframeBonus(17);
  const gub22 = grimoireUpgBonus22();
  const exo40 = exoticBonusQTY40();
  const vub79 = S.vaultData[79] || 0;  // Properly Funded Research — BonusPerLevel=1
  const cropSCmulti = (1 + mf17 / 100) * (1 + (gub22 + exo40 + vub79) / 100);
  const autoCropSC = cropRaw * cropSCmulti;
  b.cropSC = { val: autoCropSC, label: 'Crop Scientist', note: hasEmp44 ? `floor((${S.farmCropCount}-200)/10)=${cropRaw}xmulti(${cropSCmulti.toFixed(2)}) [MF17=${mf17.toFixed(0)},vub79=${vub79}]` : 'Emporium(44) not unlocked' };

  // 10. MSA_Bonus(10)  SuperBitType(44), sum(TotemInfo[0]) = gaming stars
  const hasSB44 = superBitType(44, _gamingData12);
  const gamingStars = Array.isArray(S.totemInfoData[0]) ? S.totemInfoData[0].reduce((a,v) => a + (Number(v)||0), 0) : 0;
  const autoMSA = hasSB44 ? 0.3 * Math.max(0, Math.floor((gamingStars - 300) / 10)) : 0;
  b.msa = { val: autoMSA, label: 'MSA Bonus', note: hasSB44 ? `0.3 x max(0,floor((${gamingStars}-300)/10)) = ${autoMSA.toFixed(1)}` : 'SuperBit(44) not unlocked' };

  // 11. LoreEpiBon(7)  Research EXP from Lore Episode 7
  // Spelunky[21][7] = "20|16000"  base=20, threshold=16000
  // Requires Spelunk[13][2] > 7 (at least 8 lore episodes completed)
  // mult = (1 + (GrimoireUpgBonus(17) + GetSetBonus("TROLL_SET")) / 100)
  // GrimoireUpgBonus(17) = Grimoire[17] * GrimoireUpg[17][5]=1 (in exception set, no recursive boost)
  // TROLL_SET bonus = 25 if permanently unlocked via OLA[379], else 0
  const loreEpisodes = S.spelunkData?.[13]?.[2] || 0;
  if (loreEpisodes > 7 && S.totalTomePoints > 0) {
    const g17 = S.grimoireData?.[17] || 0;
    const trollSet = String(S.olaData[379] || '').includes('TROLL_SET') ? 25 : 0;
    const loreMult = 1 + (g17 + trollSet) / 100;
    const x = Math.floor(Math.max(0, S.totalTomePoints - 16000) / 100);
    const xp = Math.pow(x, 0.7);
    const loreVal = loreMult * 20 * Math.max(0, xp / (25 + xp));
    b.loreEpi = { val: loreVal, label: 'Tome Bonus', note: `TomePTS=${S.totalTomePoints} x=${x} grey=${g17} troll=${trollSet}  ${loreVal.toFixed(2)}%` };
  } else if (S.totalTomePoints <= 0) {
    b.loreEpi = { val: parseFloat(S.extBonusOverrides.loreEpi) || 0, label: 'Tome Bonus', note: 'Use it.json for auto (needs TomePTS)', override: true };
  } else {
    b.loreEpi = { val: 0, label: 'Tome Bonus' };
  }

  // --- Compute total additive ---
  let totalAdd = 0;
  for (const k of Object.keys(b)) totalAdd += b[k].val;
  b._total = totalAdd;
  assignState({ cachedExtPctExSticker: totalAdd - (b.sticker?.val || 0) });

  // --- TRUE multipliers (not additive) ---
  // Companion ownership auto-detected from it.json companion.l data
  const comp52owned = S.companionIds.has(52);
  const comp52val = comp52owned ? 0.5 : 0; // CompanionDB[52][2] = 0.5  1.5x Research EXP
  b._comp52 = { val: comp52val, label: 'Jellofish (1.5x Research EXP)', note: comp52owned ? 'Owned ' : 'Not owned', isTrueMult: true };

  // Companion 153 (rift5 Nightmare): 2x Research EXP
  const comp153owned = S.companionIds.has(153);
  const comp153val = comp153owned ? 1 : 0; // CompanionDB[153] = 2x Research EXP
  b._comp153 = { val: comp153val, label: 'Nightmare (2x Research EXP)', note: comp153owned ? 'Owned' : 'Not owned', isTrueMult: true };

  // Sushi RoG_BonusQTY(0) = 100% Research EXP true multiplier (2x when unlocked)
  const rog0val = S.cachedUniqueSushi > 0 ? 1 : 0;  // RoG[0] = 100, so (1 + 100/100) = 2x → val = 1 for the multiplier chain
  b._rog0 = { val: rog0val, label: 'Sushi RoG (2x Research EXP)', note: S.cachedUniqueSushi > 0 ? `Unlocked (${S.cachedUniqueSushi} unique sushi)` : 'No sushi tiers discovered', isTrueMult: true };

  // Grid_Bonus_Allmulti: 1 + (Companions(55) + 5*min(1, R[0][173]*Companions(0)))/100
  const comp55owned = S.companionIds.has(55);
  const comp55val = comp55owned ? 15 : 0; // CompanionDB[55][2] = 15  1.15x all grid bonuses
  const comp0owned = S.companionIds.has(0);
  const comp0val = comp0owned && (S.lv0AllData[0]?.[14] || 0) >= 2 && (S.gridLevels[173] || 0) > 0 ? 5 : 0; // 5*min(1, lv*1)
  const cbGridAll = cloudBonus(71, S.weeklyBossData) + cloudBonus(72, S.weeklyBossData) + cloudBonus(76, S.weeklyBossData);
  const rog53val = S.cachedUniqueSushi > 53 ? 1 : 0;
  b._allMulti = { val: 1 + (comp55val + comp0val + cbGridAll + rog53val) / 100, label: 'Grid AllBonusMulti', note: `1 + (${comp55val}+${comp0val}+${cbGridAll}+${rog53val})/100` };

  return b;
}

function computeGambitBonus15() {
  if (!Array.isArray(S.holesData[11])) return { val: 0, note: 'No Holes data' };
  let rawPts = 0;
  for (let i = 0; i < 6; i++) {
    const score = Number(S.holesData[11][65 + i]) || 0;
    const base = score + 3 * Math.floor(score / 10) + 10 * Math.floor(score / 60);
    rawPts += (i === 0 ? 100 : 200) * base;
  }
  const gambitMulti = computeGambitPTSmulti();
  const totalPts = rawPts * gambitMulti.multi;
  const req = 2000 + 1000 * 16 * (1 + 15 / 5) * Math.pow(1.26, 15); // ~1.82M
  if (totalPts < req) return { val: 0, note: `Gambit pts ${totalPts.toFixed(0)} < ${req.toFixed(0)} req (raw=${rawPts.toFixed(0)}x${gambitMulti.multi.toFixed(2)})` };
  return { val: 3, note: `Unlocked (pts ${totalPts.toFixed(0)}  ${req.toFixed(0)}, multi=${gambitMulti.multi.toFixed(2)})` };
}

export function computeAFKGainsRate() {
  const parts = {};

  // Companion(28) = CompanionDB[28] w7d1, bonus=30
  const comp28owned = S.companionIds.has(28);
  parts.comp28 = { val: comp28owned ? 30 : 0, label: 'RIP Tide (Companion)', note: comp28owned ? 'Owned (30%)' : 'Not owned' };

  // Companion(153) = CompanionDB[153] rift5 Nightmare, bonus=20
  const comp153afk = S.companionIds.has(153);
  parts.comp153 = { val: comp153afk ? 20 : 0, label: 'Nightmare (Companion)', note: comp153afk ? 'Owned (20%)' : 'Not owned' };

  // GambitBonuses(15)  flat 3 if unlocked
  const gambit = computeGambitBonus15();
  parts.gambit15 = { val: gambit.val, label: 'Gambit Milestone', note: gambit.note };

  // Minehead("BonusQTY", 1) = MINEHEAD_BONUS_QTY[1] = 2
  const _mineFloor = S.stateR7[4] || 0;
  parts.minehead1 = { val: mineheadBonusQTY(1, _mineFloor), label: 'Minehead Floor 2', note: `${MINEHEAD_BONUS_QTY[1]}` };

  // Minehead("BonusQTY", 10) = MINEHEAD_BONUS_QTY[10] = 3
  parts.minehead10 = { val: mineheadBonusQTY(10, _mineFloor), label: 'Minehead Floor 11', note: `${MINEHEAD_BONUS_QTY[10]}` };

  // Grid_Bonus(71, 0)  Powered Down Research
  const gb71 = _gridBonusFinal(71);
  parts.gridBonus71 = { val: gb71, label: 'Grid L4: Powered Down Research', note: `LV${S.gridLevels[71]||0}` };

  // Grid_Bonus(111, 0)  AFK Research grid bonus
  const gb111 = _gridBonusFinal(111);
  parts.gridBonus111 = { val: gb111, label: 'Grid L6: Research AFK Gains', note: `LV${S.gridLevels[111]||0}` };

  // min(6, Sailing[3][36])
  const sail36 = Number(S.sailingData?.[3]?.[36]) || 0;
  parts.sailing36 = { val: Math.min(6, sail36), label: 'Ender Pearl (Artifact)', note: `min(6, ${sail36})` };

  // min(CardLv("w7b11"), 10)
  const clvW7b11 = computeCardLv('w7b11');
  parts.cardW7b11 = { val: Math.min(clvW7b11, 10), label: 'Pirate Deckhand Card', note: `min(${clvW7b11}, 10)` };

  // Sushi RoG_BonusQTY(4) + RoG_BonusQTY(24) additive AFK
  const rog4 = rogBonusQTY(4, S.cachedUniqueSushi);
  const rog24 = rogBonusQTY(24, S.cachedUniqueSushi);
  if (rog4 + rog24 > 0) {
    parts.rog4_24 = { val: rog4 + rog24, label: 'Sushi RoG AFK', note: `RoG(4)=${rog4} + RoG(24)=${rog24}` };
  }

  let sum = 0;
  for (const k of Object.keys(parts)) sum += parts[k].val;
  const rate = Math.min(1, 0.01 + sum / 100);

  return { rate, pct: rate * 100, sum, parts };
}

