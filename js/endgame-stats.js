import { loadSaveData } from './save/loader.js';
import { saveData } from './state.js';
import { parseSaveKey } from './save/helpers.js';
import { createStatContext } from './stats/stat-context.js';
import { tomeQTY } from './stats/systems/w4/tome-score.js';
import { shinyPetLevel } from './stats/systems/w4/breeding.js';
import { computeArcaneMapMultiBon } from './stats/systems/mc/tesseract.js';
import { outpostResourceRateBreakdown, royalGuardianDerivedInputs } from './stats/systems/w7/royal-guardian.js';
import { MapDetails, HolesInfo, GrimoireUpg, DreamUpg } from './stats/data/game/customlists.js';
import { computeBUpg, cosmoBonus, computeMonumentROGbonus } from './stats/systems/w5/hole.js';
import { collectibleBonus, computeMeasurementBonus } from './stats/systems/w5/jar.js';
import { bonTOT } from './stats/systems/w5/fountain.js';
import { pristineBon } from './stats/systems/w5/pristine.js';
import { legendPTSbonus, computeLoreEpisodeBonus } from './stats/systems/w7/spelunking.js';
import { computeCompassBonus } from './stats/systems/w7/compass.js';
import { computeStatueBonusGiven } from './stats/systems/common/stats.js';
import { computeCardLv } from './stats/systems/common/cards.js';
import { companions } from './stats/systems/common/companions.js';
import { computeExoticBonus } from './stats/systems/w6/farming.js';
import { arcadeBonus } from './stats/systems/w2/arcade.js';
import { grimoireUpgBonus } from './stats/systems/mc/grimoire.js';
import { arcaneUpgBonus } from './stats/systems/mc/tesseract.js';
import { computeWinBonus } from './stats/systems/w6/summoning.js';
import { vaultUpgBonus } from './stats/systems/common/vault.js';
import { eventShopOwned } from './game-helpers.js';

// Offline inventory of the public Toolbox leaderboard metadata; no ranks or profile requests.
const CATEGORIES = {
  General: 'totalMoney totalLevels totalStatues totalBuildings totalGreenStacks logSample copperSample fliesSample sporeSample goldFishSample totalWaves totalMeals totalShrines totalVials totalCards bits godRank greenMushroomKills highestCropOg jadeCoins whiteEssence totalBoats logBook totalShinyLevels totalBreedabilityLevels totalPlotRanks totalDayMarketLevels totalNightMarketLevels totalPrimeKills highestPowerPet slab totalTomePoints totalPaletteLevels totalDivinityBlessingLevels totalSummoningUpgrades totalSpelunkingUpgrades totalZenithMarketUpgrades totalCoralKidUpgrades totalSushiStationUpgrades totalSushiKnowledgeLevels totalSushiPerfectos totalButtonPresses cookingMasteryLevel totalAdviceFishUpgrades totalEquinoxUpgrades bestJellyDps totalJellyCellLevels totalJellyUpgrades bestSushiCombo arenaWaves dkOrbKills sbPlunderousKills esWormholeKills vwPortals fractalHours dungeonCredits dungeonFlurbos endlessSummoningWins bestCrucibleRound menagerieRank totalMenagerieBoostLevels',
  Tasks: 'highestDamage afkTime monstersKilled postOfficeOrders refinedSalts totalMaterialPrinted trashedCogs plantsPicked totalBubbles totalStamps highestNugget',
  Skills: 'totalSkillsLevels mining smithing choppin fishing alchemy catching trapping construction worship cooking breeding laboratory sailing divinity gaming farming sneaking summoning spelunking research',
  Character: 'strength agility wisdom luck level dropRate cashMulti defence accuracy hp mp',
  Miscellaneous: 'w1Colo w2Colo w3Colo w4Colo w5Colo w6Colo choppingMinigame fishingMinigame catchingMinigame miningMinigame penpalMinigame hoopsMinigame dartsMinigame redoxSaltRank explosiveSaltRank spontaneitySaltRank dioxideSaltRank purpleSaltRank nulloSaltRank crosslinkSaltRank propagatedSaltRank anionicSaltRank highestCogExp highestConstructExp/hr highestCallMeBob highestCallMeAsh highestHammerHammer highestBigP highestShowdownLevel mostGiantsKilled biggestHaulSpelunking highestSpelunkingPower totalSpelunkingDepths totalManicSpelunkingDepths mineheadOpponentsDefeated totalGrandDiscoveries glimboTotalTrades totalGamingCrowns highestMegafeather highestMegaFish highestMegaFlesh',
  Masterclass: 'totalGrimoireUpgrades totalBonesCollected totalCompassUpgrades totalDustCollected totalMedallions totalArcanistUpgrades totalTachyonsCollected highestArcaneMapMulti totalRoyalArmoryUpgrades totalRoyalResourceGrades totalRoyalStatueLevels totalOutposts highestOutpostResourceRate',
  Caverns: 'totalMeasurementLevels totalOpals totalLayersDestroyed totalBarExpansions bestDenScore totalBraveryLevels totalJusticeLevels highestJusticeRound bellRings bellPings totalStringLevels brokenJars totalCollectibleLevels totalGambitTime highestVillagerExp/hr totalVillagerExp/hr highestColonyLevel highestSanctumLevel totalFountainUpgrades'
};

const LABELS = {
  totalMoney: 'Total money', totalLevels: 'Total character levels', totalSkillsLevels: 'Total skill levels',
  choppin: 'Chopping', cashMulti: 'Highest coin multiplier', totalTomePoints: 'Tome score',
  bestJellyDps: 'Best Jelly DPS', highestCropOg: 'Highest Crop OG', hp: 'HP', mp: 'MP',
  dkOrbKills: 'DK Orb kills', sbPlunderousKills: 'SB Plunderous kills',
  esWormholeKills: 'ES Wormhole kills', vwPortals: 'VW portals'
};

function _number(value, signed = false) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' ||
      !Number.isFinite(Number(value)) || (!signed && Number(value) < 0)) {
    throw new Error('Saved value is missing or invalid.');
  }
  return Number(value);
}

function _read(save, key, path = []) {
  let value = parseSaveKey(save, key);
  for (const index of path) value = value?.[index];
  if (value == null) throw new Error('Not included in this save.');
  return value;
}

function _entries(value) {
  if (!value || typeof value !== 'object') throw new Error('Saved table is invalid.');
  return Object.entries(value).filter(([key, entry]) => key !== 'length' && entry != null);
}

function _sum(value) {
  return _entries(value).reduce((sum, [, entry]) =>
    sum + (typeof entry === 'object' ? _sum(entry) : _number(entry, true)), 0);
}

function _max(value) {
  return Math.max(0, ..._entries(value).map(([, entry]) => _number(entry)));
}

function _characterCount(raw, save) {
  let count = Array.isArray(raw.charNames) ? raw.charNames.length : 0;
  for (const key of Object.keys(save)) {
    const match = /^(?:Lv0|Exp0|CharacterClass|SL|SM|PlayerStuff|PVtStarSign|PVFishingToolkit|FoodSlO|AttackLoadout|MaxCarryCap|EquipOrder|InventoryOrder|ItemQTY)_(\d+)$/.exec(key);
    if (match) count = Math.max(count, Number(match[1]) + 1);
  }
  return count;
}

function _bestCharacter(raw, save, count, contexts, descriptor) {
  let best;
  const missing = [];
  for (let ci = 0; ci < count; ci++) {
    try {
      _number(_read(save, 'Lv0_' + ci, [0]));
      const mapIdx = _number(_read(save, 'CurrentMap_' + ci));
      _number(_read(save, 'CharacterClass_' + ci));
      _read(save, 'SL_' + ci);
      _read(save, 'EquipOrder_' + ci);
      contexts[ci] ||= createStatContext({ charIdx: ci, mapIdx, saveData, layer1: { isActive: true } });
      const tree = contexts[ci].resolve(descriptor);
      if (tree.unavailable || tree.notApplicable) throw new Error(tree.reason || 'Unavailable at the saved location.');
      const value = _number(tree.val);
      if (!best || value > best.value) best = {
        value, partial: Boolean(tree.partial),
        detail: raw.charNames?.[ci] || 'Character ' + (ci + 1)
      };
      if (tree.partial) missing.push(tree.reason || 'Incomplete character inputs.');
    } catch (error) {
      missing.push(error.message);
    }
  }
  if (!best) throw new Error(missing.join(' ') || 'No character data available.');
  if (missing.length) {
    best.partial = true;
    best.detail += '. ' + missing.join(' ');
  }
  return best;
}

function _villagerRates(read, option) {
  const S = saveData;
  const levels = read('Holes', 1);
  const opals = read('Holes', 3);
  const parallel = read('Holes', 23);
  for (const index of [4, 5, 6, 13, 15, 17, 22, 24]) read('Holes', index);
  const owned = Array.from({ length: 5 }, (_, i) => i).filter(i => _number(levels[i]) >= 1);
  if (!owned.length) return [];
  const least = Math.min(...owned.map(i => _number(opals[i])));
  const jar = i => collectibleBonus(S, i);
  const cosmo = i => cosmoBonus(S, 1, i);
  const schematics = _entries(read('Holes', 13)).filter(([, value]) => Number(value) === 1).length;
  const common = (100 + computeBUpg(0, 25, S)) * Math.max(1,
    (1 + computeCompassBonus(59, S) / 100) *
    (1 + legendPTSbonus(12, S) / 100) *
    (1 + pristineBon(21, S) / 100) *
    (1 + 2 * companions(13, S)) *
    (1 + computeStatueBonusGiven(28, 0, S) / 100) *
    (1 + (jar(4) + (jar(10) + (jar(12) + (jar(22) + (jar(29) + jar(35)))))) / 100) *
    (1 + 25 * eventShopOwned(6, S.cachedEventShopStr) / 100) *
    (1 + computeLoreEpisodeBonus(1, S) / 100) *
    (1 + 50 * Number(S.bundlesData?.bun_u || 0) / 100));
  return owned.map(i => {
    let special = i === 0 && Math.min(18, _number(levels[0])) < 13 ? Math.pow(1.5, option(355)) : 1;
    if (i === 2) special = 1 + bonTOT(read('Holes', 31), read('Holes', 32), 0, 14) / 100;
    const additive = computeMonumentROGbonus(0, 3, S) +
      (computeMonumentROGbonus(1, 3, S) + computeMonumentROGbonus(2, 3, S) +
      (computeMeasurementBonus(S, 7) +
      (Math.floor(_number(opals[i]) / 10) * cosmo(0) +
      (cosmo(1) * schematics + (cosmo(2) +
      (Math.min(4 * computeCardLv('caveB', S), 50) +
      (_number(read('Holes', 17, 1)) * Number(HolesInfo[59][3]) +
      (computeMeasurementBonus(S, 0) + (computeWinBonus(21, { charIdx: 0 }, S) + vaultUpgBonus(73, S))))))))));
    return _number(Math.max(1, special) * common * _number(opals[i]) * (1 + _number(parallel[i])) *
      (1 + computeExoticBonus(51, S) / 100) * (1 + arcadeBonus(38, S) / 100) *
      (1 + grimoireUpgBonus(29, GrimoireUpg, S) / 100) * (1 + arcaneUpgBonus(32, S) / 100) *
      (1 + cosmo(5) * Math.floor(least / 5) / 100) * (1 + additive / 100));
  });
}

// Capture detached values before the page awaits its analysis animation.
export function collectEndgameStats(raw) {
  const save = raw?.data || raw;
  if (!save || typeof save !== 'object') throw new Error('No save data provided.');
  const research = _read(save, 'Research');
  if (!Array.isArray(research) || [0, 1, 2, 3, 4, 7, 8].some(index => !Array.isArray(research[index]))) {
    throw new Error('Research data is missing or incomplete.');
  }
  loadSaveData(raw);
  const count = _characterCount(raw, save);
  const optionsKey = save.OptionsListAccount != null ? 'OptionsListAccount' : 'OptLacc';
  const read = (key, ...path) => _read(save, key, path);
  const option = index => _number(read(optionsKey, index));
  const table = (key, ...path) => _sum(read(key, ...path));
  const characters = compute => {
    if (!count) throw new Error('No character data available.');
    return Array.from({ length: count }, (_, ci) => compute(ci));
  };
  const contexts = [];
  const compute = {};
  const bind = (id, fn) => { compute[id] = fn; };
  for (const [id, key, path] of [
    ['totalStamps', 'StampLv', []], ['totalVials', 'CauldronInfo', [4]],
    ['totalMeals', 'Meals', [0]], ['totalSummoningUpgrades', 'Summon', [0]],
    ['totalPlotRanks', 'FarmRank', [0]], ['totalPaletteLevels', 'Spelunk', [9]],
    ['totalSpelunkingUpgrades', 'Spelunk', [5]], ['totalZenithMarketUpgrades', 'Spelunk', [45]],
    ['totalSushiStationUpgrades', 'Sushi', [2]], ['totalSushiKnowledgeLevels', 'Sushi', [7]],
    ['totalAdviceFishUpgrades', 'Spelunk', [11]],
    ['totalJellyCellLevels', 'Research', [16]], ['totalJellyUpgrades', 'Research', [17]],
    ['totalGrimoireUpgrades', 'Grimoire', []], ['totalCompassUpgrades', 'Compass', [0]],
    ['totalArcanistUpgrades', 'Arcane', []], ['totalRoyalArmoryUpgrades', 'RoyalG', [2]],
    ['totalRoyalResourceGrades', 'RoyalG', [5]], ['totalRoyalStatueLevels', 'RoyalG', [0]],
    ['totalMenagerieBoostLevels', 'Menagerie', [3]], ['totalMeasurementLevels', 'Holes', [22]],
    ['totalOpals', 'Holes', [7]], ['totalBarExpansions', 'Holes', [8]],
    ['totalCollectibleLevels', 'Holes', [24]], ['totalFountainUpgrades', 'Holes', [31]],
    ['totalSpelunkingDepths', 'Spelunk', [1]], ['totalManicSpelunkingDepths', 'Spelunk', [47]]
  ]) bind(id, () => table(key, ...path));
  for (const [id, index] of Object.entries({
    totalGreenStacks: 224, logSample: 211, copperSample: 212, fliesSample: 215,
    sporeSample: 213, goldFishSample: 214, totalButtonPresses: 594, arenaWaves: 89,
    dkOrbKills: 138, sbPlunderousKills: 139, esWormholeKills: 152, vwPortals: 158,
    fractalHours: 184, dungeonCredits: 72, dungeonFlurbos: 73, endlessSummoningWins: 319,
    bestCrucibleRound: 628, highestShowdownLevel: 369, mostGiantsKilled: 217,
    highestMegafeather: 262, highestMegaFish: 279, totalBonesCollected: 329,
    totalDustCollected: 362, penpalMinigame: 99, hoopsMinigame: 242, dartsMinigame: 442
  })) bind(id, () => option(index));
  for (const [id, key, path] of [
    ['bits', 'Gaming', [0]], ['jadeCoins', 'Ninja', [102, 0]],
    ['whiteEssence', 'Summon', [2, 0]], ['highestNugget', 'Gaming', [8]],
    ['cookingMasteryLevel', 'CookMaster', [1, 0]], ['bestJellyDps', 'Research', [7, 12]],
    ['bestSushiCombo', 'Sushi', [4, 8]], ['menagerieRank', 'Menagerie', [0, 2]],
    ['mineheadOpponentsDefeated', 'Research', [7, 4]], ['highestMegaFlesh', 'Bubba', [1, 8]],
    ['bestDenScore', 'Holes', [11, 8]], ['highestJusticeRound', 'Holes', [11, 74]],
    ['bellRings', 'Holes', [18, 1]], ['bellPings', 'Holes', [18, 3]]
  ]) bind(id, () => _number(read(key, ...path)));
  const sumSlice = (key, path, start, end) => _sum(
    Object.fromEntries(_entries(read(key, ...path)).filter(([index]) => Number(index) >= start && Number(index) < end)));
  bind('totalDayMarketLevels', () => sumSlice('FarmUpg', [], 2, 10));
  bind('totalNightMarketLevels', () => sumSlice('FarmUpg', [], 10, 18));
  bind('totalCoralKidUpgrades', () => Array.from({ length: 6 }, (_, i) => option(616 + i))
    .reduce((sum, value) => sum + value, 0));
  bind('totalTachyonsCollected', () => Array.from({ length: 7 }, (_, i) => option(388 + i))
    .reduce((sum, value) => sum + value, 0));
  bind('totalBraveryLevels', () => sumSlice('Holes', [15], 0, 10));
  bind('totalJusticeLevels', () => sumSlice('Holes', [15], 10, 20));
  bind('brokenJars', () => sumSlice('Holes', [11], 40, 50));
  bind('totalGambitTime', () => sumSlice('Holes', [11], 65, 71));
  bind('totalDivinityBlessingLevels', () => sumSlice('Divinity', [], 28, 38));
  bind('totalBuildings', () => sumSlice('Tower', [], 0, 27));
  bind('totalEquinoxUpgrades', () => sumSlice('Dream', [], 2, 2 + DreamUpg.length));
  bind('totalBubbles', () => sumSlice('CauldronInfo', [], 0, 4));
  bind('godRank', () => Math.max(0, _number(read('Divinity', 25), true) - 10));
  bind('highestCropOg', () => Math.pow(2, option(219)));
  bind('highestColonyLevel', () => _number(read('Holes', 11, 26)) + 1);
  bind('highestSanctumLevel', () => _number(read('Holes', 11, 55)) + 1);
  bind('totalStringLevels', () => _entries(read('Holes', 19))
    .filter(([index]) => Number(index) < 12 && Number(index) % 2 === 0)
    .reduce((sum, [, value]) => sum + _number(value), 0));
  bind('totalLayersDestroyed', () => [1, 3, 5, 7].reduce((sum, index) =>
    sum + _number(read('Holes', 11, index)), 0));
  bind('totalShrines', () => _entries(read('Shrine')).reduce((sum, [, row]) => sum + _number(row[3]), 0));
  bind('totalWaves', () => table('TotemInfo', 0));
  bind('totalMedallions', () => _entries(read('Compass', 3)).length);
  bind('totalGrandDiscoveries', () => _entries(read('Spelunk', 6)).length);
  bind('totalGamingCrowns', () => _entries(read('Research', 11)).length);
  bind('slab', () => _entries(read('Cards1')).length);
  bind('glimboTotalTrades', () => table('Research', 12));
  bind('totalSushiPerfectos', () => _entries(read('Sushi', 5)).filter(([, value]) => _number(value, true) >= 1).length);
  bind('totalPrimeKills', () => _entries(read('KRbest')).filter(([key]) => !key.includes('SummzTrz'))
    .reduce((sum, [, value]) => sum + _number(value), 0));
  bind('logBook', () => {
    const encoded = read('Gaming', 11);
    if (typeof encoded !== 'string' || encoded.length !== 10 || /[^_a-zA-Z]/.test(encoded)) {
      throw new Error('Saved Gaming logbook is invalid.');
    }
    return [...encoded].reduce((sum, digit) => sum + Math.min(10, '_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(digit)), 0);
  });
  bind('highestCogExp', () => Math.max(0, ..._entries(read('CogM')).map(([, row]) => _number(row.d ?? 0))));
  bind('totalBoats', () => _entries(read('Boats')).reduce((sum, [, row]) =>
    sum + _number(row[3]) + _number(row[5]), 0));
  bind('totalLevels', () => characters(ci => _number(read('Lv0_' + ci, 0))).reduce((a, b) => a + b, 0));
  bind('totalSkillsLevels', () => characters(ci => sumSlice('Lv0_' + ci, [], 1, 22)).reduce((a, b) => a + b, 0));
  bind('level', () => Math.max(...characters(ci => _number(read('Lv0_' + ci, 0)))));
  CATEGORIES.Skills.split(' ').slice(1).forEach((id, offset) => {
    const index = offset + 1;
    bind(id, () => Math.max(...characters(ci => _number(read('Lv0_' + ci, Number(index))))));
  });
  bind('totalMoney', () => _number(read('MoneyBANK')) +
    characters(ci => _number(read('Money_' + ci))).reduce((a, b) => a + b, 0));
  bind('greenMushroomKills', () => Math.max(0, characters(ci => {
    const row = read('KLA_' + ci, 2);
    return _number(MapDetails[2][0][0]) - _number(Array.isArray(row) ? row[0] : row, true);
  }).reduce((a, b) => a + b, 0)));
  bind('highestPowerPet', () => Math.max(0, ...['Pets', 'PetsStored'].flatMap(key =>
    _entries(read(key)).map(([, row]) => _number(row[2])))));
  bind('biggestHaulSpelunking', () => _max(read('Spelunk', 2)));
  bind('totalShinyLevels', () => {
    if (save.Menagerie != null) read('Menagerie');
    const value = _entries(read('Breeding')).filter(([index]) => Number(index) >= 22 && Number(index) <= 30)
      .reduce((sum, [, row]) => sum + _entries(row).reduce((s, [, exp]) =>
        s + shinyPetLevel(_number(exp), saveData), 0), 0);
    return { value, partial: save.Menagerie == null, detail: save.Menagerie == null
      ? 'Menagerie shiny overlevel unlock is unavailable; using ordinary shiny levels.' : undefined };
  });
  for (const [id, slot, key] of [
    ['totalStatues', 1, 'StatueLevels_0'], ['totalCards', 2, 'Cards0'],
    ['totalBreedabilityLevels', 51, 'Breeding']
  ]) bind(id, () => { read(key); return tomeQTY(slot, saveData); });
  bind('postOfficeOrders', () => ['CYDeliveryBoxComplete', 'CYDeliveryBoxStreak', 'CYDeliveryBoxMisc']
    .reduce((sum, key) => sum + _number(read(key)), 0));
  for (const [id, world, index] of [
    ['highestDamage', 1, 0], ['afkTime', 0, 2], ['monstersKilled', 0, 0],
    ['refinedSalts', 2, 0], ['trashedCogs', 2, 1], ['totalMaterialPrinted', 2, 3], ['plantsPicked', 4, 3]
  ]) bind(id, () => _number(save.Tasks != null ? read('Tasks', 0, world, index) : read('TaskZZ0', world, index)));
  for (let world = 0; world < 6; world++) bind('w' + (world + 1) + 'Colo', () =>
    _number(read('FamValColosseumHighscores', world)));
  for (const [id, index] of [['choppingMinigame', 0], ['fishingMinigame', 1],
    ['catchingMinigame', 2], ['miningMinigame', 3]]) {
    bind(id, () => _number(read('FamValMinigameHiscores', index)));
  }
  for (const [index, color] of ['redox', 'explosive', 'spontaneity', 'dioxide', 'purple', 'nullo',
    'crosslink', 'propagated', 'anionic'].entries()) bind(color + 'SaltRank', () =>
    _number(read('Refinery', 3 + index, 1)));
  for (const [id, descriptor] of Object.entries({
    strength: 'total-str', agility: 'total-agi', wisdom: 'total-wis', luck: 'total-luk',
    dropRate: 'drop-rate', cashMulti: 'coin-multi', defence: 'defence', accuracy: 'accuracy',
    hp: 'max-hp', mp: 'max-mp', 'highestConstructExp/hr': 'construction-exp',
    highestSpelunkingPower: 'spelunking-pow'
  })) bind(id, () => {
    const result = _bestCharacter(raw, save, count, contexts, descriptor);
    if (id === 'dropRate') {
      try { result.value = Math.max(result.value, option(200)); }
      catch (error) { result.partial = true; result.detail += '. ' + error.message; }
    }
    if (id === 'highestConstructExp/hr') result.detail += '. Active-character Construction EXP/hr.';
    return result;
  });
  for (const [id, cauldron, bubble] of [
    ['highestCallMeBob', 0, 11], ['highestCallMeAsh', 1, 11],
    ['highestHammerHammer', 1, 2], ['highestBigP', 3, 21]
  ]) bind(id, () => _number(read('CauldronInfo', cauldron, bubble)));
  bind('highestArcaneMapMulti', () => {
    const maps = _entries(read('MapBon')).map(([index]) => Number(index));
    const best = Math.max(0, ...characters(ci => Math.max(0, ...maps.map(mapIdx =>
      computeArcaneMapMultiBon(0, createStatContext({ charIdx: ci, mapIdx, saveData }))))));
    return best > 0 ? 1 + best / 100 : 0;
  });
  bind('totalOutposts', () => _entries(read('RoyalMaps')).filter(([, row]) => Array.isArray(row) && row.length >= 3).length);
  bind('highestOutpostResourceRate', () => {
    read('RoyalG');
    const ext = royalGuardianDerivedInputs(saveData);
    return Math.max(0, ..._entries(read('RoyalMaps')).filter(([, row]) => Array.isArray(row) && row.length >= 3)
      .map(([index]) => outpostResourceRateBreakdown(saveData, Number(index), ext).value));
  });
  bind('totalTomePoints', () => ({
    value: saveData.totalTomePoints,
    partial: ['StampLv', 'CauldronInfo', 'Tower', 'Meals', 'Boats', 'Sailing', 'Ninja',
      'Spelunk', 'RoyalG', 'Menagerie', optionsKey].some(key => save[key] == null) ||
      !saveData.companionDataAvailable || !saveData.activeVoteDataAvailable
  }));
  let villagerRates;
  for (const id of ['highestVillagerExp/hr', 'totalVillagerExp/hr']) bind(id, () => {
    villagerRates ||= _villagerRates(read, option);
    return {
      value: id === 'highestVillagerExp/hr' ? Math.max(0, ...villagerRates) : villagerRates.reduce((a, b) => a + b, 0),
      partial: !saveData.companionDataAvailable || !saveData.activeVoteDataAvailable ||
        ['Compass', 'Spelunk', 'FarmUpg', 'ArcadeUpg', 'Arcane', 'Grimoire', 'BundlesReceived',
          'StampLv', 'CauldronInfo', 'Summon', 'UpgVault', 'StatueLevels_0'].some(key => save[key] == null)
    };
  });
  return Object.entries(CATEGORIES).flatMap(([group, ids]) => ids.split(' ').map(id => {
    const label = LABELS[id] || id.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/^w(\d) Colo$/, 'W$1 Colosseum').replace(/^./, c => c.toUpperCase());
    const format = ['cashMulti', 'dropRate', 'highestArcaneMapMulti'].includes(id) ? 'multiplier' : undefined;
    try {
      if (!compute[id]) throw new Error('Leaderboard metric has no computation: ' + id);
      const result = compute[id]();
      const record = typeof result === 'object' ? result : { value: result };
      return { id, label, group, format, ...record, value: _number(record.value) };
    } catch (error) {
      return { id, label, group, format, value: null, detail: error.message };
    }
  }));
}
