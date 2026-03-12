// ===== EXTERNAL BONUS COMPUTATION =====

import {  S, assignState  } from '../state.js';
import {
  klaData,
  numCharacters,
} from './data.js';
import {
  ARCADE_SHOP,
  ARCANE_FLAT_SET,
  ARTIFACT_BASE,
  CARD_BASE_REQ,
  COSMO_UPG_BASE,
  DANCING_CORAL_BASE,
  DN_MOB_DATA,
  EMPEROR_BON_TYPE,
  EMPEROR_BON_VAL_BY_TYPE,
  GODSHARD_SET_BONUS,
  HOLES_BOLAIA_PER_LV,
  HOLES_JAR_BONUS_PER_LV,
  HOLES_MEAS_BASE,
  HOLES_MEAS_TYPE,
  HOLES_MON_BONUS,
  LEGEND_TALENT_PER_PT,
  MERITOC_BASE,
  MINEHEAD_BONUS_QTY,
  PET_SHINY_TYPE,
  SHINY_BONUS_PER_LV,
  SHINY_TYPE_TO_CAT,
  STICKER_BASE,
  SUMMON_ENDLESS_TYPE,
  SUMMON_ENDLESS_VAL,
  SUMMON_NORMAL_BONUS,
} from '../game-data.js';
import { gbWith, deathNoteRank } from '../sim-math.js';
import {
  emporiumBonus,
  eventShopOwned,
  ribbonBonusAt,
  superBitType,
} from './helpers.js';
import { mainframeBonus } from './lab.js';
// Grid bonus helper - uses _gbWith directly to avoid circular dep with calculations.js
function _gridBonusFinal(idx) {
  return gbWith(S.gridLevels, S.shapeOverlay, idx, { abm: S.allBonusMulti });
}

export function grimoireUpgBonus22() {
  // "Superior Crop Research"  GrimoireUpg[22][5]=1
  // GrimoireUpgBonus(36) = Grimoire[36]*1 (exception set, no self-boost)
  // GrimoireUpgBonus(22) = Grimoire[22]*1*(1 + GrimoireUpgBonus(36)/100)
  const g22 = S.grimoireData?.[22] || 0;
  const g36 = S.grimoireData?.[36] || 0;
  return g22 * (1 + g36 / 100);
}

export function exoticBonusQTY40() {
  // MarketExoticInfo[40]="SCIENTERRIFIC" [3]=20 [4]=1(diminishing)
  // FarmUpg[20+40] = FarmUpg[60]
  const lv = S.farmUpgData?.[60] || 0;
  if (lv <= 0) return 0;
  return 20 * lv / (1000 + lv);
}

export function mineheadBonusQTY(t) {
  const mineFloor = S.stateR7[4] || 0;
  return mineFloor > t ? (MINEHEAD_BONUS_QTY[t] || 0) : 0;
}

export function computeCardLv(cardKey) {
  const qty = S.cards0Data[cardKey] || 0;
  if (qty <= 0) return 0;
  // Max stars = 4 + RiftStuff("5starCards") + Spelunk("6starCards")
  const rift5star = (S.riftData[0] || 0) >= 45 ? 1 : 0;
  const spelunk6star = (S.spelunkData?.[0]?.[2] || 0) >= 1 ? 1 : 0;
  const maxStars = Math.round(4 + rift5star + spelunk6star);
  const baseReq = CARD_BASE_REQ[cardKey] || 1;
  let lv = 1; // having > 0 qty = at least star 1
  for (let s = 0; s < maxStars; s++) {
    const thr = baseReq * Math.pow(s + 1 + Math.floor(s / 3) + 16 * Math.floor(s / 4) + 100 * Math.floor(s / 5), 2);
    if (qty > thr) lv = s + 2;
  }
  // OLA[155] 6-star override
  const ola155 = String(S.olaData[155] || '');
  if (ola155.split(',').includes(cardKey) && lv < 6) lv = 6;
  return lv;
}

function arcadeBonus(idx) {
  const params = ARCADE_SHOP[idx];
  if (!params) return 0;
  const lv = S.arcadeUpgData[idx] || 0;
  if (lv <= 0) return 0;
  const [type, base, denom] = params;
  const raw = type === 'add' ? (denom !== 0 ? ((base + denom) / denom + 0.5 * (lv - 1)) / (base / denom) * lv * base : base * lv) : base * lv / (lv + denom);
  const maxedM = lv >= 101 ? 2 : 1;
  const comp27M = S.companionIds.has(27) ? 2 : 1;
  return maxedM * comp27M * raw;
}

function arcaneUpgBonus(idx) {
  const lv = S.arcaneData[idx] || 0;
  if (lv <= 0) return 0;
  if (ARCANE_FLAT_SET.has(idx)) return lv; // ArcaneUpg[t][5]=1 for all relevant indices
  return lv * (1 + arcaneUpgBonus(39) / 100);
}

export function legendPTSbonus(idx) {
  const lv = S.spelunkData?.[18]?.[idx] || 0;
  const perPt = LEGEND_TALENT_PER_PT[idx] || 0;
  return Math.round(lv * perPt);
}

export function achieveStatus(idx) {
  return S.achieveRegData[idx] === -1 ? 1 : 0;
}

export function computeShinyBonusS(catKey) {
  // Sum shiny pet contributions for a given bonus category
  let total = 0;
  for (let world = 0; world < 4; world++) {
    const shinyExps = S.breedingData[22 + world];
    const petTypes = PET_SHINY_TYPE[world];
    if (!shinyExps || !petTypes) continue;
    for (let pet = 0; pet < petTypes.length; pet++) {
      const exp = shinyExps[pet] || 0;
      if (exp <= 0) continue;
      const shinyTypeIdx = petTypes[pet];
      const cat = SHINY_TYPE_TO_CAT[shinyTypeIdx];
      if (cat !== catKey) continue;
      // SpecialPassives("Lv"): compute shiny level from EXP
      let shinyLv = 1;
      for (let e = 0; e < 19; e++) {
        if (exp > Math.floor((1 + Math.pow(e + 1, 1.6)) * Math.pow(1.7, e + 1)))
          shinyLv = e + 2;
      }
      const bonusPerLv = SHINY_BONUS_PER_LV[shinyTypeIdx] || 0;
      total += Math.round(shinyLv * bonusPerLv);
    }
  }
  return total;
}

export function computeSummWinBonus() {
  // Build SummWinBonus[0..31] from normal + endless summon wins
  const bonus = new Array(32).fill(0);
  // Normal wins: Summon[1] = array of defeated enemy names
  const normalWins = S.summonData[1] || [];
  for (let i = 0; i < normalWins.length; i++) {
    const name = normalWins[i];
    if (typeof name !== 'string' || name.startsWith('rift')) continue;
    const entry = SUMMON_NORMAL_BONUS[name];
    if (!entry) continue;
    const bonusIdx = Math.round(entry[0] - 1);
    if (bonusIdx >= 0 && bonusIdx < 32) bonus[bonusIdx] += entry[1];
  }
  // Endless wins (OLA[319] = total endless wins)
  const endlessWins = Number(S.olaData[319]) || 0;
  for (let i = 0; i < endlessWins; i++) {
    const idx = i % 40;
    const type = SUMMON_ENDLESS_TYPE[idx] - 1;
    if (type >= 0 && type < 32) bonus[type] += SUMMON_ENDLESS_VAL[idx];
  }
  return bonus;
}

export function computeEmperorBon(bonusIdx) {
  const emperorCount = Number(S.olaData[369]) || 0;
  let sum = 0;
  for (let r = 0; r < emperorCount; r++) {
    const slot = r % 48;
    if (EMPEROR_BON_TYPE[slot] === bonusIdx) sum += Number(EMPEROR_BON_VAL_BY_TYPE[bonusIdx]) || 0;
  }
  // mult = (1 + (ArcaneUpgBonus(48) + ArcadeBonus(51))/100)
  const mult = 1 + (arcaneUpgBonus(48) + arcadeBonus(51)) / 100;
  return Math.floor(sum * mult);
}

export function computeWinBonus(idx) {
  const swb = computeSummWinBonus();
  // Raw indices (no multiplier): 20, 22, 24, 31
  if (idx === 20 || idx === 22 || idx === 24 || idx === 31) return swb[idx] || 0;
  const raw = swb[idx] || 0;
  if (raw <= 0) return 0;
  // Pristine charm 8: Ninja[107][8]==1  NjTrP8[3]=30
  const pristine8 = (S.ninjaData?.[107]?.[8] === 1) ? 30 : 0;
  const gemItems11 = Number(S.gemItemsData[11]) || 0;
  // ArtifactBonus(32): base 25, rarity = Sailing[3][32], mult = rarity (2-6). 0 if not owned.
  const artRarity = Number(S.sailingData?.[3]?.[32]) || 0;
  const artBonus32 = artRarity > 0 ? (ARTIFACT_BASE[32] || 25) * artRarity : 0;
  // Tasks[2][5][4] = global W6 task shop item 4
  const taskVal = Math.min(10, Number(S.tasksGlobalData?.[2]?.[5]?.[4]) || 0);
  const wb31 = swb[31] || 0; // raw, no multiplier
  const empBon8 = computeEmperorBon(8);
  const godshardSet = String(S.olaData[379] || '').includes('GODSHARD_SET') ? GODSHARD_SET_BONUS : 0;

  // Index 19: 3.5x but NO wb31/empBon8
  if (idx === 19) {
    return 3.5 * raw
      * (1 + pristine8 / 100)
      * (1 + 10 * gemItems11 / 100)
      * (1 + (artBonus32 + taskVal + achieveStatus(379) + achieveStatus(373) + godshardSet) / 100);
  }
  // Indices 20-33 (except raw 20,22,24,31 handled above): 1x with wb31+empBon8
  if (idx >= 20 && idx <= 33) {
    return raw
      * (1 + pristine8 / 100)
      * (1 + 10 * gemItems11 / 100)
      * (1 + (artBonus32 + taskVal + achieveStatus(379) + achieveStatus(373) + wb31 + empBon8 + godshardSet) / 100);
  }
  // Everything else (0-18 except 19): 3.5x with wb31+empBon8
  return 3.5 * raw
    * (1 + pristine8 / 100)
    * (1 + 10 * gemItems11 / 100)
    * (1 + (artBonus32 + taskVal + achieveStatus(379) + achieveStatus(373) + wb31 + empBon8 + godshardSet) / 100);
}

export function computeMeritocBonusz(optionIdx) {
  // Returns bonus only for the active voted option
  const activeVote = Number(S.olaData[453]) || 0;
  if (optionIdx !== activeVote) return 0;
  const baseVal = MERITOC_BASE[optionIdx] || 0;
  if (baseVal <= 0) return 0;
  // MeritocCanVote: OLA[472]==1
  const canVote = Number(S.olaData[472]) === 1;
  // ClamWorkBonus(3): OLA[464] > 3 ? 1 : 0
  const clamWork3 = (Number(S.olaData[464]) || 0) > 3 ? 1 : 0;
  const comp39 = S.companionIds.has(39) ? 50 : 0;
  const legend24 = legendPTSbonus(24);
  const arcade59 = arcadeBonus(59);
  const eventShop23 = eventShopOwned(23);
  let multi;
  if (canVote) {
    multi = 1 + (5 * clamWork3 + comp39 + legend24 + arcade59 + 20 * eventShop23) / 100;
  } else {
    multi = 0.25 + (5 * clamWork3 + comp39 + legend24 + arcade59) / 100;
  }
  return baseVal * multi;
}

function cosmoBonus(t, i) {
  const key = t + '_' + i;
  const base = COSMO_UPG_BASE[key] || 0;
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
    case 0: { const raw = Number(S.holesData?.[11]?.[28]) || 0; qty = raw > 0 ? Math.log(raw) : 0; break; }
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
  const measBaseStr = HOLES_MEAS_BASE[13] || '0';
  const isTOT = measBaseStr.includes('TOT');
  const measBaseNum = parseFloat(measBaseStr) || 0;
  const measLv = Number(S.holesData?.[22]?.[13]) || 0;
  let measBase;
  if (isTOT) {
    measBase = (1 + cosmo13 / 100) * (measBaseNum * measLv / (100 + measLv));
  } else {
    measBase = (1 + cosmo13 / 100) * measBaseNum * measLv;
  }
  const measType = Number(HOLES_MEAS_TYPE[13]) || 0;
  const measMulti = computeMeasurementMulti(measType);
  const measTotal = measBase * measMulti;

  // StudyBolaiaBonuses(13)
  const bolaiaLv = Number(S.holesData?.[26]?.[13]) || 0;
  const bolaiaPerLv = HOLES_BOLAIA_PER_LV[13] || 0;
  const studyBolaia = bolaiaLv * bolaiaPerLv;

  // B_UPG(78, 10)
  const bUpg78 = (Number(S.holesData?.[13]?.[78]) || 0) === 1 ? 10 : 0;

  // MonumentROGbonuses(2, 7)
  const mon29Lv = Number(S.holesData?.[15]?.[29]) || 0;
  const mon29Bonus = HOLES_MON_BONUS[29] || 0;
  const mon29 = mon29Bonus >= 30
    ? 0.1 * Math.ceil(mon29Lv / (250 + mon29Lv) * 10 * mon29Bonus)
    : mon29Lv * mon29Bonus;
  const cosmo00 = cosmoBonus(0, 0);
  const holeozDN = (1 + mon29 / 100) + cosmo00 / 100;
  const mon27Lv = Number(S.holesData?.[15]?.[27]) || 0;
  const mon27Bonus = HOLES_MON_BONUS[27] || 0;
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

  // Compute S.allBonusMulti early so getGridBonusFinal calls below use the correct value
  const _comp55val = S.companionIds.has(55) ? 15 : 0;
  const _comp0val = S.companionIds.has(0) && S.cachedComp0DivOk && (S.gridLevels[173] || 0) > 0 ? 5 : 0;
  assignState({ allBonusMulti: 1 + (_comp55val + _comp0val) / 100 });

  // 1. StickerBonus(1) = (1 + (Grid_Bonus(68,2) + 30*EventShop(37))/100) * (1 + 20*SuperBit(62)/100) * R[9][1] * base
  const stkLv = S.research?.[9]?.[1] || 0;
  const stkBase = STICKER_BASE[1] || 5;
  // Grid_Bonus(68, mode 2) = Grid_Bonus(68,0) * Research[11].length (boony crown count)
  const boonyCount = S.research?.[11]?.length || 0;
  const gridBonus68mode2 = _gridBonusFinal(68) * boonyCount;
  const stkCrownMulti = 1 + (gridBonus68mode2 + 30 * eventShopOwned(37)) / 100;
  const stkSuperbit62 = 1 + 20 * superBitType(62) / 100;
  const autoSticker = stkCrownMulti * stkSuperbit62 * stkLv * stkBase;
  b.sticker = { val: autoSticker, label: 'Sticker Bonus', note: `LV${stkLv}x${stkBase}xcrown(${stkCrownMulti.toFixed(2)})xsb62(${stkSuperbit62.toFixed(2)})` };
  // Cache components for dynamic recalculation in sim
  assignState({
    cachedStickerFixed: stkSuperbit62 * stkLv * stkBase,
    cachedBoonyCount: boonyCount,
    cachedEvShop37: eventShopOwned(37),
  });

  // 2. Dancing Coral (index 4 = Research EXP)
  const tower22 = S.towerData[22] || 0;
  const dcBase = DANCING_CORAL_BASE[4] || 3;
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
  const hasSB34 = superBitType(34);
  const c1len = S.cards1Data.length || 0;
  const slabboBase = Math.floor(Math.max(0, c1len - 1300) / 5);
  // mult = (1 + MainframeBonus(15)/100) * (1 + MeritocBonusz(23)/100) * (1 + LegendPTS_bonus(28)/100)
  const slabboMF15 = mainframeBonus(15);
  const slabboMeritoc23 = computeMeritocBonusz(23);
  const slabboLegend28 = legendPTSbonus(28);
  const slabboMult = (1 + slabboMF15 / 100) * (1 + slabboMeritoc23 / 100) * (1 + slabboLegend28 / 100);
  const autoSlabbo = hasSB34 ? 0.1 * slabboMult * slabboBase : 0;
  b.slabbo = { val: autoSlabbo, label: 'Slab Bonus', note: hasSB34 ? `0.1x${slabboBase}xmulti(${slabboMult.toFixed(2)}) [MF15=${slabboMF15.toFixed(0)},merit=${slabboMeritoc23.toFixed(0)},leg=${slabboLegend28}]` : 'SuperBit(34) not unlocked' };

  // 7. ArcadeBonus(63)  uses shared arcadeBonus helper
  const autoArcade = arcadeBonus(63);
  const arcLv = S.arcadeUpgData[63] || 0;
  b.arcade = { val: autoArcade, label: 'Arcade Bonus', note: `arcadeBonus(63) lv=${arcLv}  ${autoArcade.toFixed(2)}` };

  // 8. MealBonusesS  Giga_Chip (Meals[0][72], base 0.01, MealINFO[72][5]="ResearchXP")
  const mealLv = S.mealsData?.[0]?.[72] || 0;
  const ribT = S.ribbonData[100] || 0;
  const ribBon = ribbonBonusAt(100);
  const mealBase = ribBon * mealLv * 0.01;
  // CookingMealBonusMultioo = (1 + (MainframeBonus(116) + ShinyBonusS(20))/100) x (1 + WinBonus(26)/100)
  const mfb116 = mainframeBonus(116);
  const shinyS20 = computeShinyBonusS(20);
  const winBon26 = computeWinBonus(26);
  const cookMulti = (1 + (mfb116 + shinyS20) / 100) * (1 + winBon26 / 100);
  const autoMeal = mealBase * cookMulti;
  b.meal = { val: autoMeal, label: 'Meal (Giga Chip)', note: `LV${mealLv}x0.01xrib=${ribBon.toFixed(3)}xcook(mfb=${mfb116},shiny=${shinyS20.toFixed(1)},win=${winBon26.toFixed(1)})=${autoMeal.toFixed(2)}` };

  // 9. CropSCbonus(9)  EmporiumBonus(44), floor(max(0,(crops-200)/10))
  const hasEmp44 = emporiumBonus(44);
  const cropRaw = hasEmp44 ? Math.floor(Math.max(0, (S.farmCropCount - 200) / 10)) : 0;
  // CropSCbonMulti = (1 + MainframeBonus(17)/100) x (1 + (GrimoireUpgBonus(22)+ExoticBonusQTY(40))/100)
  const mf17 = mainframeBonus(17);
  const gub22 = grimoireUpgBonus22();
  const exo40 = exoticBonusQTY40();
  const cropSCmulti = (1 + mf17 / 100) * (1 + (gub22 + exo40) / 100);
  const autoCropSC = cropRaw * cropSCmulti;
  b.cropSC = { val: autoCropSC, label: 'Crop Scientist', note: hasEmp44 ? `floor((${S.farmCropCount}-200)/10)=${cropRaw}xmulti(${cropSCmulti.toFixed(2)}) [MF17=${mf17.toFixed(0)}]` : 'Emporium(44) not unlocked' };

  // 10. MSA_Bonus(10)  SuperBitType(44), sum(TotemInfo[0]) = gaming stars
  const hasSB44 = superBitType(44);
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

  // Grid_Bonus_Allmulti: 1 + (Companions(55) + 5*min(1, R[0][173]*Companions(0)))/100
  const comp55owned = S.companionIds.has(55);
  const comp55val = comp55owned ? 15 : 0; // CompanionDB[55][2] = 15  1.15x all grid bonuses
  const comp0owned = S.companionIds.has(0);
  const comp0val = comp0owned && (S.lv0AllData[0]?.[14] || 0) >= 2 && (S.gridLevels[173] || 0) > 0 ? 5 : 0; // 5*min(1, lv*1)
  b._allMulti = { val: 1 + (comp55val + comp0val) / 100, label: 'Grid AllBonusMulti', note: `1 + (${comp55val}+${comp0val})/100` };

  return b;
}

export function calcAllBonusMulti(gl) {
  const comp55val = S.companionIds.has(55) ? 15 : 0;
  const comp0val = S.companionIds.has(0) && S.cachedComp0DivOk && (gl[173] || 0) > 0 ? 5 : 0;
  return 1 + (comp55val + comp0val) / 100;
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

  // GambitBonuses(15)  flat 3 if unlocked
  const gambit = computeGambitBonus15();
  parts.gambit15 = { val: gambit.val, label: 'Gambit Milestone', note: gambit.note };

  // Minehead("BonusQTY", 1) = MINEHEAD_BONUS_QTY[1] = 2
  parts.minehead1 = { val: mineheadBonusQTY(1), label: 'Minehead Floor 2', note: `${MINEHEAD_BONUS_QTY[1]}` };

  // Minehead("BonusQTY", 10) = MINEHEAD_BONUS_QTY[10] = 3
  parts.minehead10 = { val: mineheadBonusQTY(10), label: 'Minehead Floor 11', note: `${MINEHEAD_BONUS_QTY[10]}` };

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

  let sum = 0;
  for (const k of Object.keys(parts)) sum += parts[k].val;
  const rate = Math.min(1, 0.01 + sum / 100);

  return { rate, pct: rate * 100, sum, parts };
}

