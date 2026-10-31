import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';
import { currentMapDataAvailable, stampLvData, equipOrderData, equipQtyData, combatAfkInputDataAvailable,
  cauldronBubblesData } from '../save/data.js';
import { allDescriptors } from './registry.js';
import { createStatContext } from './stat-context.js';
import { statsInspectionCatalog } from './inspection-catalog.js';
import { readRawKey } from './systems/common/combat-sim-setup.js';
import { boatSpeed, routeMetrics, availableIslandCount, sailingChestArtifactOutcome } from './systems/w5/sailing-chests.js';
import { prismaPlan, prismaVariant, prismaChanges } from './prisma.js';
import { alchemy, getPrismaBonusMult, finalBubbleValByKey, bubbleUpgradeCosts } from './systems/w2/alchemy.js';
import { bubbleDefinitions } from './data/w2/alchemy.js';
import { companionBonusForSave } from './data/common/companions.js';
import { entityName } from './entity-names.js';
import { computeFreshTalentCalcBubbleCache, computeAllEfficiencies } from './defs/skill-helpers.js';
import { computeSkillPowerDetail } from './defs/skill-efficiency.js';
import { computeAllSkillProwessDetail } from './defs/skill-exp.js';
import { computeDivinityMinor, computeDivinityBless } from './systems/w5/divinity.js';
import { computePrayerReal } from './systems/w3/prayer.js';
import { GodsInfo } from './data/game/customlists.js';
import { worshipTdInputs, trialSummary, expRewards, worshipClaimOutcome } from './systems/w3/worship-td.js';
import { outpostResourceRateBreakdown, outpostRankExpBreakdown, outpostRangeBreakdown,
  royalGuardianDerivedInputs, hasCompleteRoyalData, resourceCapacity } from './systems/w7/royal-guardian.js';
import { cloneRoyalState, resourceAllocationMetrics } from './systems/w7/royal-guardian-optimizer.js';
import { royalCollectAll } from './systems/w7/royal-collect.js';
import { farmingAccountSnapshot, plotMetrics } from './systems/w6/farming-planner.js';
import { createFishingEvaluator, fishingClaim, fishingPoolBonusOutcomes } from './systems/w2/fishing.js';
import { computeTwinStealth, computeDoorDamageDetailed, computeUntieProgressDetailed } from './systems/w6/sneaking-stealth.js';
import { sneakingUpgradeCost, sneakingBatchItemFind } from './systems/w6/sneaking-stealth.js';
import { alchemyBrewSpeed, alchemyLiquidCapacity, alchemyLiquidBatch, krukDailyBubbleLevels,
  alchemyAssignedBrewPerHour, alchemyLiquidPerHour, alchemySigilSpeed, alchemyWorkerProduction,
  bubbleUpgradeLevelDistribution, alchemyActiveEffects } from './systems/w2/alchemy-production.js';
import { computeJadeCoin } from './systems/w6/sneaking-jade.js';
import { nkName, NK_COUNT } from './systems/w6/sneaking-math.js';
import { spelunkStaticInputs } from './systems/w7/spelunk-inputs.js';
import { spelunkExitDistribution } from './systems/w7/spelunk-depth.js';
import { statueLevelingInputs } from './systems/common/statue-leveling.js';
import { breedingEggSeconds, breedingHatchOutcome, breedingHatchSequence, breedingEggAutoUse,
  breedingEggAutoUseDistribution, breedingIncubation } from './systems/w4/breeding.js';
import { PET_STATS, PET_NAMES, BREEDING_WORLDS } from './data/w4/breeding.js';
import { cogCreationMultiplier, libraryBookSeconds, atomUpgradeCost } from './systems/w3/construction.js';
import { anvilProductionStats, anvilProductionBatch, anvilStorageSlots,
  anvilQuickDeposit, anvilQuickDepositAll } from './systems/w1/anvil.js';
import { atomUpgrades } from './data/w3/atoms.js';
import { summoningEssencePerHour } from './systems/w6/summoning.js';
import { gamingLogbookMultiplier } from './systems/w4/gaming.js';
import { buildCombatInputs } from './systems/common/combat-sim-inputs.js';
import { cookingRecipeFire, cookingRecipeDiscovery } from './systems/w4/cooking-ladle.js';
import { trappingCritters, trappingBoxOptions } from './data/w3/trapping.js';
import { trappingPlacementRarePct, trappingPlacement, trappingCollectionInputs, trappingCollection } from './systems/w3/trapping.js';
import { itemDef } from './systems/common/combat-sim-inputs.js';
import { levelUpGiftDistribution } from './systems/common/level-up-gifts.js';
import { classTalentPointPools } from './systems/common/talent-points.js';
import { offeringStats } from './systems/w5/coral-god-rank.js';
import { combatAfkGains } from './systems/common/combat-afk.js';
import { afkExpAcceptance, afkAccountBonusTime } from './systems/common/afk-acceptance.js';
import { attackDef, actionWaitTime } from './systems/common/combat-sim-player.js';
import { computeSneakingExpPerAction } from './systems/w6/sneaking-exp.js';
import { gatheringResources } from './data/common/gathering.js';
import { gatheringInputs, gatheringOutcome, gatheringClaim, gatheringCavernDeposit } from './systems/common/gathering.js';
import { lootDropOddsReset } from './systems/common/combat-sim-rewards.js';
import { classifyMap } from './systems/common/map-access.js';
import { dungeonCardTargets, dungeonCardDropChance } from './systems/w2/dungeon.js';
import { combatAfkProgress } from './systems/common/combat-afk-progress.js';
import { MAP_SCENES } from './data/game/combat-sprites.js';

const SKILLS = ['Mining', 'Choppin', 'Fishing', 'Catching', 'Trapping', 'Worship',
  'Smithing', 'Alchemy', 'Cooking', 'Laboratory', 'Divinity', 'Spelunking', 'Breeding'];
const STAT_NAMES = { 'total-str': 'Strength', 'total-agi': 'Agility', 'total-wis': 'Wisdom', 'total-luk': 'Luck',
  damage: 'Normal max damage' };
const EXTRA_KEYS = new Set(['cookingMealSpeed', 'globalResourceRateBreakdown',
  'jellyCellDamageBreakdown', 'jellyCellSpeedBreakdown', 'jellyCellExpBreakdown', 'jellyBloodcellBreakdown']);
const extras = statsInspectionCatalog().filter(entry => EXTRA_KEYS.has(entry.key));

function _snapshot(id, name, result, extra = {}) {
  const valid = typeof result?.val === 'number' && Number.isFinite(result.val);
  return { id, name, val: valid ? result.val : null,
    unavailable: !!result?.unavailable || !valid, notApplicable: !!result?.notApplicable,
    partial: !!result?.partial, reason: result?.reason || (!valid ? 'No finite calculated value.' : ''), ...extra };
}

// This module owns loader state. Run it in an isolated worker, never across main-thread awaits.
export async function evaluatePrismaOutcomes(raw, charIdx, { afkHours = 1 } = {}) {
  if (!Number.isFinite(afkHours) || afkHours * 3600 <= 120 || afkHours * 3600 > 2e8)
    throw new Error('Enter AFK claim hours above 2 minutes and at most 55,555.');
  loadSaveData(raw);
  const savedMap = readRawKey(raw, 'CurrentMap_' + charIdx);
  const mapKnown = currentMapDataAvailable[charIdx] && savedMap != null
    && String(savedMap).trim() !== '' && Number.isInteger(Number(savedMap)) && Number(savedMap) >= 0;
  const mapIdx = mapKnown ? Number(savedMap) : 0;
  function context(skill = 'Mining') {
    return createStatContext({
      saveData, charIdx, mapIdx, layer1: { skillType: skill, isActive: true },
    });
  }
  const metrics = [];
  let builtInputs;
  function combatInputs() {
    if (!mapKnown) throw new Error('Saved map is unavailable.');
    return builtInputs ||= buildCombatInputs(saveData, charIdx, mapIdx, { rawSave: raw });
  }
  function add(id, name, calculate, extra = {}) {
    try { metrics.push(_snapshot(id, name, calculate(), extra)); }
    catch (error) {
      metrics.push(_snapshot(id, name, { unavailable: true, reason: error.message || String(error) }, extra));
    }
  }
  function family(id, name, collect) {
    try { collect(); }
    catch (error) { metrics.push(_snapshot(id, name, { unavailable: true, reason: error.message || String(error) })); }
  }
  const purchasedBubbles = readRawKey(raw, 'CauldronInfo');
  const needsActiveEquipment = companionBonusForSave(4, saveData) !== 1 && bubbleDefinitions().some(bubble =>
    bubble.effect.includes('ACTIVE') && Number(purchasedBubbles?.[bubble.cauldron]?.[bubble.index]) > 0);
  const missingActiveEquipment = needsActiveEquipment
    && (readRawKey(raw, 'CauldronBubbles')?.[charIdx] == null || !Array.isArray(cauldronBubblesData[charIdx]));
  const partial = { partial: saveData.companionDataAvailable === false || saveData.activeVoteDataAvailable === false
      || missingActiveEquipment,
    reason: [saveData.companionDataAvailable === false ? 'Companion ownership metadata is missing.' : '',
      saveData.activeVoteDataAvailable === false ? 'Current server vote metadata is missing.' : '',
      missingActiveEquipment ? 'Equipped ACTIVE bubble metadata is missing; reconstructed active bonuses are uncertain.' : ''
    ].filter(Boolean).join(' ') };
  function skillClaimAcceptance(prefix, name, claim, claimInfo, ctx, map, target) {
    for (const event of claim.food?.events || []) {
      for (const [field, label] of [['used', 'consumed'], ['refilled', 'storage refill']])
        add(`${prefix}:food:${event.slot}:${field}`, `${name} - food slot ${event.slot + 1} ${label}`,
          () => ({ val: event[field], ...claimInfo }), { zeroWhenAbsent: prefix + ':dropBatch', lowerIsBetter: true });
    }
    family(prefix + ':acceptance', name + ' AFK acceptance', () => {
      const order = equipOrderData[charIdx][2], qty = equipQtyData[charIdx][2];
      let acceptance, time;
      try {
        if (claim.food) {
          equipOrderData[charIdx][2] = claim.food.order; equipQtyData[charIdx][2] = claim.food.qty;
        }
        acceptance = afkExpAcceptance(saveData, charIdx);
        time = afkAccountBonusTime(saveData, charIdx, claim.creditedSeconds);
      } finally {
        equipOrderData[charIdx][2] = order; equipQtyData[charIdx][2] = qty;
      }
      add(prefix + ':acceptedExp', name + ' - expected accepted skill EXP',
        () => ({ val: claim.exp * acceptance.expectedMultiplier, ...claimInfo }));
      for (const system of ['sailing', 'gaming']) for (const [field, label] of [
        ['chance', 'full-time bonus chance'], ['expected', 'expected credited bonus seconds'],
      ]) add(`${prefix}:time:${system}:${field}`, `${name} - ${system} ${label}`,
        () => ({ val: claim.eligible === false ? 0 : time[system][field], ...claimInfo,
          reason: claimInfo.reason + ' Final-food bonus time only; no unsaved queue, completed production or Harriep.' }));
    });
    family(prefix + ':progress', name + ' AFK progress', () => {
      const progress = combatAfkProgress(saveData, charIdx, map, {
        hours: afkHours, effectiveHours: claim.hours, creditedKills: 0, target,
        sceneName: MAP_SCENES[map]?.sceneName,
      }, ctx, raw);
      const progressInfo = { ...claimInfo, reason: claimInfo.reason + ' '
        + [...progress.warnings, ...progress.notes].join(' ') };
      for (const row of progress.rows.filter(row => row.amount > 0))
        add(`${prefix}:progress:${row.key}`, `${name} - ${row.name} (${row.unit})`,
          () => ({ val: row.amount, ...progressInfo }), { zeroWhenAbsent: prefix + ':dropBatch' });
      for (const drop of progress.bonusDrops) for (const [field, label] of [
        ['expected', 'expected bonus quantity'], ['chance', 'bonus chance'],
      ]) add(`${prefix}:bonus:${drop.key}:${field}`, `${name} - ${entityName('Item', drop.key)} ${label}`,
        () => ({ val: drop[field], ...progressInfo }), { zeroWhenAbsent: prefix + ':dropBatch' });
    });
  }
  family('dungeon-cards', 'Dungeon card drop scenarios', () => {
    const bonus = finalBubbleValByKey('CardDropz', charIdx, saveData);
    if (bonus.unavailable || !Number.isFinite(Number(bonus.val)))
      throw new Error('Processed dungeon card bubble is unavailable.');
    for (const target of dungeonCardTargets())
      for (const runCardChance of [1, 2])
        add(`dungeon-card:${target.key}:${runCardChance}`, `${target.key} - one dungeon kill card chance at run CardChance ${runCardChance}`,
          () => ({ val: dungeonCardDropChance(target.baseChance, bonus.val, runCardChance,
            raw.serverVars?.Dungeon_CardMulti), ...partial, partial: true,
            reason: 'Conditional one-kill chance at the named unsaved dungeon CardChance, using the saved server multiplier. '
              + (target.tierDependent ? 'Boss card identity depends on unsaved run tier. ' : '')
              + 'Not dungeon-run eligibility, pickup or an actual saved-run forecast. ' + partial.reason }));
  });
  family('walupiggy3', 'Walupiggy3 conditional quest gate', () => {
    const completed = readRawKey(raw, 'QuestComplete_' + charIdx)?.Walupiggy3;
    const stage = readRawKey(raw, 'QuestStatus_' + charIdx)?.Walupiggy3?.[0];
    if (completed == null || stage == null || !Number.isFinite(Number(completed)) || !Number.isFinite(Number(stage)))
      throw new Error('Saved Walupiggy3 quest completion/stage is missing or invalid.');
    const bubble = finalBubbleValByKey('MultiLogACTIVE', charIdx, saveData);
    if (bubble.unavailable || !Number.isFinite(Number(bubble.val)))
      throw new Error('Processed active multi-log bubble is unavailable.');
    const order = equipOrderData[charIdx];
    if ([order?.[1]?.[1], order?.[0]?.[4], order?.[0]?.[2]].some(key => key == null))
      throw new Error('Saved quest hatchet, pants or shirt slot is missing.');
    const ready = Number(completed) === 0 && Number(stage) === 7
      && order[1][1] === 'EquipmentToolsHatchet1' && order[0][4] === 'EquipmentPants15'
      && order[0][2] === 'EquipmentShirts23' && Number(bubble.val) >= 20;
    add('walupiggy3:advance', 'Walupiggy3 - advances stage 7 to 8 if standing on node 2 in map 53',
      () => ({ val: Number(ready), ...partial,
        reason: 'Saved quest stage and equipment; explicitly assumes the native map/node condition. '
          + 'Earlier monster-HP challenge and live position are not inferred. ' + partial.reason }));
  });
  for (const resource of gatheringResources()) {
    if (resource.mapIdx != null && !resource.equinoxLevel
      && ['internal', 'dungeon', 'runtime'].includes(classifyMap(resource.mapIdx).category)) continue;
    family(`gathering:${resource.key}:${resource.mapIdx}`, resource.name + ' gathering', () => {
      if (resource.mapIdx == null) throw new Error('No source-backed gathering location is available.');
      const availability = combatAfkInputDataAvailable[charIdx];
      if (!availability?.equipment || !availability?.equipmentQty || !availability?.foodSlots
        || !availability?.buffs || !availability?.skillLevels || !availability?.postOffice)
        throw new Error('Saved equipment, food quantities/slots, buffs, skill levels or Post Office inputs are missing.');
      if (resource.equinoxLevel) {
        const level = readRawKey(raw, 'Dream')?.[3];
        if (level == null || !Number.isInteger(Number(level)) || Number(level) < 0)
          throw new Error('Saved Equinox resource unlock level is missing or invalid.');
        if (Number(level) < resource.equinoxLevel) {
          add(`gathering:${resource.key}:${resource.mapIdx}:locked`, resource.name + ' - Equinox resource locked',
            () => ({ val: 0, notApplicable: true, reason: 'Requires Equinox Resources level ' + resource.equinoxLevel }));
          return;
        }
      }
      const ctx = createStatContext({ saveData, charIdx, mapIdx: resource.mapIdx,
        layer1: { skillType: resource.skill, isActive: true } });
      ctx.afkTarget = resource.key;
      const inputs = gatheringInputs(saveData, charIdx, resource, ctx);
      const result = gatheringOutcome(resource.skill, inputs, afkHours * 3600);
      const info = { ...partial, partial: true, reason: 'Independent resource/location potential with saved buffs and refreshed entry caches. '
        + 'Native gathering keeps cached SkillStats even after food depletion; rates are not phase-integrated. '
        + 'Ordinary inventory pickup and whole-account production are not resolved; cavern main-resource pickup is a separate conditional outcome. '
        + partial.reason };
      for (const [field, label] of [['chance', 'harvest chance'], ['perHarvest', 'items per successful harvest'],
        ['itemsPerHour', 'AFK items per hour'], ['expPerHour', 'AFK EXP per hour'],
        ['items', `${afkHours}h main-resource claim before pickup`], ['exp', `${afkHours}h skill EXP claim`]])
        add(`gathering:${resource.key}:${resource.mapIdx}:${field}`,
          `${resource.name} (map ${resource.mapIdx}) - ${label}`, () => ({ val: result[field], ...info }),
          { intermediate: field === 'chance' || field === 'perHarvest' });
      if (['Motherlode', 'Bug14', 'MotherlodeTREE'].includes(resource.key))
        family(`gathering-deposit:${resource.key}`, resource.name + ' cavern resource pickup', () => {
          const deposit = gatheringCavernDeposit(saveData, resource.key, result.items);
          const reason = 'Conditional pickup of every main-resource drop from this one claim. '
            + 'Native cavern resources bypass inventory capacity and add directly to the saved layer counter; '
            + 'no automatic layer clear, opal award or requirement change. ' + partial.reason;
          for (const [field, label, intermediate] of [
            ['quantity', 'picked layer progress', false], ['progressAfter', 'ending layer progress', true],
            ...(deposit.type === 0 ? [['lifetimeAfter', 'ending lifetime Motherlode collection', true]] : []),
          ]) add(`gathering-deposit:${resource.key}:${field}`, resource.name + ' - ' + label,
            () => ({ val: deposit[field], ...partial, partial: true, reason }), { intermediate });
        });
      family(`gathering-claim:${resource.key}:${resource.mapIdx}`, resource.name + ' AFK food and rare drops', () => {
        const built = buildCombatInputs(saveData, charIdx, resource.mapIdx,
          { rawSave: raw, ctx, overrides: { useSavedBuffs: true } });
        for (const key of ['foodNotConsume']) {
          const entry = built.entries[key];
          if (entry?.unavailable || !Number.isFinite(Number(entry?.value))
            || /resolver failed|non-finite/.test(entry?.note || ''))
            throw new Error('Gathering claim input unavailable: ' + key + '. ' + (entry?.note || ''));
        }
        if (built.values.labFoodRefill && !saveData.itemQuantityData?.chest?.available)
          throw new Error('Gathering Lab refill requires verified chest item quantities.');
        const claim = gatheringClaim(resource.skill, inputs, afkHours * 3600, built.values, null, { includeDrops: false });
        const notes = Object.entries(built.entries).filter(([key, entry]) =>
          ['anvilCraftStatus', 'stampLevelMax', 'invStorageUsed', 'skillLevelsMax', 'kla100',
            'tasksObol', 'emporium4', 'ninja106', 'talent29', 'bribe1', 'bribe8',
            'dropRate', 'cardChanceMulti', 'filterSlots', 'foodNotConsume', 'cFoodCap'].includes(key)
          && (entry.partial || entry.unavailable) && entry.note).map(([key, entry]) => key + ': ' + entry.note);
        const claimInfo = { ...info, reason: info.reason + ' One native food pass before pickup, not inventory-retained rewards. '
          + notes.join(' ') };
        const prefix = `gathering-claim:${resource.key}:${resource.mapIdx}`;
        add(prefix + ':dropBatch', resource.name + ' - rare-drop harvest batch',
          () => ({ val: claim.dropBatch, ...claimInfo }), { intermediate: true });
        skillClaimAcceptance(prefix, resource.name, claim, claimInfo, ctx, resource.mapIdx, resource.key);
        family(prefix + ':rare', resource.name + ' rare drops', () => {
          for (const key of ['dropRate', 'cardChanceMulti', 'filterSlots']) {
            const entry = built.entries[key];
            if (entry?.unavailable || !Number.isFinite(Number(entry?.value))
              || /resolver failed|non-finite/.test(entry?.note || ''))
              throw new Error('Gathering rare-drop input unavailable: ' + key + '. ' + (entry?.note || ''));
          }
          const tables = { ldorRuns: 0 };
          lootDropOddsReset({ inputs: built, state: { cards0: built.values.cards0 },
            rewardsState: tables, emit() {}, timeMs: 0 });
          const rolled = gatheringClaim(resource.skill, inputs, afkHours * 3600, built.values, tables);
          for (const drop of rolled.drops) for (const [field, label] of [
            ['expected', 'expected quantity'], ['chance', 'chance of at least one'],
          ]) add(`${prefix}:drop:${drop.key}:${field}`, `${resource.name} - ${entityName('Item', drop.key)} ${label}`,
            () => ({ val: drop[field], ...claimInfo }), { zeroWhenAbsent: prefix + ':rare:dropBatch' });
          add(prefix + ':rare:dropBatch', resource.name + ' - validated rare-drop harvest batch',
            () => ({ val: rolled.dropBatch, ...claimInfo }), { intermediate: true });
        });
      });
    });
  }
  family('divinity-offerings', 'Divinity offering outcomes', () => {
    const divinity = readRawKey(raw, 'Divinity');
    if (!Array.isArray(divinity) || divinity[25] == null || !Number.isInteger(Number(divinity[25]))
      || Number(divinity[25]) < 0)
      throw new Error('Saved Divinity rank is missing or invalid.');
    const y4 = Number(finalBubbleValByKey('Y4', charIdx, saveData));
    for (let choice = 0; choice < 3; choice++) {
      add(`divinity-offering:${choice}:free`, `Divinity offering ${choice + 1} - free cost chance`, () => {
        if (divinity[26 + choice] == null || !Number.isInteger(Number(divinity[26 + choice]))
          || Number(divinity[26 + choice]) < 0) throw new Error('Saved offering choice is missing or invalid.');
        const stats = offeringStats(choice, saveData, { y4 });
        return { val: stats.freeCostChance, ...partial };
      });
      for (const [field, label] of [['expectedSpendForOneSuccess', 'expected points per success at fixed choice']]) {
        add(`divinity-offering:${choice}:${field}`, `Divinity offering ${choice + 1} - ${label}`, () => {
          if (divinity[26 + choice] == null || !Number.isInteger(Number(divinity[26 + choice]))
            || Number(divinity[26 + choice]) < 0) throw new Error('Saved offering choice is missing or invalid.');
          const stats = offeringStats(choice, saveData, { y4,
            divCostAfter3: saveData.serverVarDivCostAfter3Available ? saveData.serverVarDivCostAfter3 : undefined });
          return { val: stats[field], unavailable: !stats.available, partial: true,
            reason: 'Free cost and success are independent. Entry still requires the full quoted cost. '
              + 'Repeated expectation holds choice and rank fixed; native choices rerandomize after each attempt. '
              + (stats.missing?.length ? 'Missing: ' + stats.missing.join(', ') + '. ' : '') + partial.reason };
        }, { lowerIsBetter: true });
      }
    }
  });
  family('afk-exp-acceptance', 'AFK EXP acceptance', () => {
    const acceptance = afkExpAcceptance(saveData, charIdx);
    add('afk-exp-double', 'AFK claim - double EXP chance per EXP row',
      () => ({ val: acceptance.chance, partial: true,
        reason: 'Uses saved bubble, bribe, guild, cards, Post Office and Superbit inputs; missing account inputs may be partial. '
          + partial.reason }));
  });
  family('afk-claim', 'Finite combat AFK claim', () => {
    if (!mapKnown) throw new Error('Saved map is unavailable.');
    const claim = combatAfkGains(saveData, charIdx, mapIdx, afkHours, { rawSave: raw });
    if (claim.unavailable) throw new Error(claim.reason);
    const info = { partial: true, reason: `${afkHours}h normal claim on the saved map, before inventory pickup limits. `
      + 'No normal rerolls or whole-account production. ' + claim.warnings.join(' ') + ' ' + partial.reason };
    for (const [field, label] of [['rewardKills', 'reward kills'], ['creditedKills', 'credited kills'],
      ['exp', 'Class EXP before claim doubling'], ['coins', 'expected coins']]) {
      add('afk-claim:' + field, 'Combat AFK claim - ' + label, () => ({ val: claim[field], ...info }));
    }
    add('afk-claim:acceptedExp', 'Combat AFK claim - expected accepted Class EXP',
      () => ({ val: claim.exp * afkExpAcceptance(saveData, charIdx).expectedMultiplier, ...info }));
    for (const drop of claim.drops.filter(row => row.key !== 'COIN')) {
      for (const [field, label] of [['expected', 'expected quantity'], ['chance', 'chance of at least one']])
        add(`afk-drop:${drop.key}:${field}`, `Combat AFK ${entityName('Item', drop.key)} - ${label}`,
          () => ({ val: drop[field], ...info }), { zeroWhenAbsent: 'afk-claim:rewardKills' });
    }
    if (claim.clamworks) {
      const cw = claim.clamworks;
      const note = info.reason + ' Clamworks assumes the settled in-session pearl table. '
        + 'Pearl values include Lucky Day and the Pure multiplier. Keep-Pure rerolls replace, never add, payouts. '
        + 'The policy retains a claim containing Pure and rerolls misses only when a native offer is available.';
      for (const [id, label, value] of [
        ['initialValue', 'initial expected pearl value', cw.expectedPearls],
        ['initialPureChance', 'initial Pure Pearl chance', cw.pure.chance],
        ['policyValue', 'keep-Pure policy expected pearl value', cw.strategy.expectedPearls],
        ['policyPureChance', 'keep-Pure policy Pure Pearl chance', cw.strategy.pureChance],
        ['policyRerolls', 'keep-Pure policy expected rerolls', cw.strategy.expectedRerolls],
      ]) add('afk-clamworks:' + id, 'Clamworks AFK - ' + label,
        () => ({ val: value, partial: true, reason: note }));
    }
    for (const row of claim.progress.rows) {
      add('afk-progress:' + row.key, `Combat AFK - ${row.name} (${row.unit})`,
        () => ({ val: row.amount, ...info }), { zeroWhenAbsent: 'afk-claim:rewardKills' });
    }
    let time;
    const foodOrder = equipOrderData[charIdx]?.[2], foodQty = equipQtyData[charIdx]?.[2];
    try {
      if (claim.food) {
        equipOrderData[charIdx][2] = claim.food.order; equipQtyData[charIdx][2] = claim.food.qty;
      }
      time = afkAccountBonusTime(saveData, charIdx, claim.effectiveHours * 3600);
    } finally {
      if (claim.food) { equipOrderData[charIdx][2] = foodOrder; equipQtyData[charIdx][2] = foodQty; }
    }
    for (const system of ['sailing', 'gaming']) for (const [field, label] of [
      ['chance', 'full-time bonus chance'], ['expected', 'expected credited bonus seconds'],
    ]) add(`afk-time:${system}:${field}`, `AFK ${system === 'sailing' ? 'Sailing' : 'Gaming'} - ${label}`,
      () => ({ val: time[system][field], ...info,
        reason: info.reason + ' Time credit only, not completed voyages or harvests; excludes existing unsaved queue and Harriep.' }));
  });
  for (const descriptor of allDescriptors()) {
    for (const skill of descriptor.scope.endsWith('+skill') ? SKILLS : ['']) {
      const id = descriptor.id + (skill ? ':' + skill : '');
      const name = STAT_NAMES[descriptor.id] || (skill ? skill.replace('Choppin', 'Chopping') + ' - ' : '') + descriptor.name;
      const tomePoints = saveData.totalTomePoints;
      try {
        const result = descriptor.scope.includes('+map') && !mapKnown
          ? { unavailable: true, reason: 'Saved map is unavailable.' } : context(skill || 'Mining').resolve(descriptor.id);
        metrics.push(_snapshot(id, name, result, {
          absolute: descriptor.id.startsWith('total-'),
          lowerIsBetter: descriptor.id === 'direct-card-average-time' || descriptor.id === 'accuracy-required',
        }));
      } catch (error) {
        metrics.push(_snapshot(id, name, { unavailable: true, reason: error.message || String(error) }));
      } finally {
        // The legacy Tome detail resolver writes its provisional score into shared stat inputs.
        if (descriptor.id === 'tome-score') saveData.totalTomePoints = tomePoints;
      }
    }
  }
  for (const entry of extras) {
    try { metrics.push(_snapshot(entry.key, entry.name, await entry.resolve(context()))); }
    catch (error) { metrics.push(_snapshot(entry.key, entry.name, { unavailable: true, reason: error.message || String(error) })); }
  }
  for (const skill of ['Mining', 'Choppin', 'Fishing', 'Catching', 'Trapping', 'Worship']) {
    add('skill-power:' + skill, skill.replace('Choppin', 'Chopping') + ' - Skill Power',
      () => ({ ...computeSkillPowerDetail(skill, charIdx, context(skill)), ...partial }));
  }
  add('skill-prowess', 'All-skill prowess', () =>
    ({ ...computeAllSkillProwessDetail(charIdx, context()), ...partial }));
  family('divinity-minors', 'Divinity minor bonuses', () => {
    if (!Array.isArray(readRawKey(raw, 'Divinity'))) throw new Error('Saved Divinity data is missing.');
    const styles = [...new Set(GodsInfo.slice(0, 10).map(row => Number(row[13])))];
    for (const style of styles) {
      for (const ci of [-1, charIdx]) add(`divinity-minor:${ci}:${style}`,
        `Divinity - minor type ${style} (${ci === -1 ? 'account total' : 'selected character'})`,
        () => ({ ...computeDivinityMinor(ci, style, saveData, { activeCharIdx: charIdx }), ...partial }),
        { intermediate: true });
    }
    add('divinity-blessing:2', 'Divinity - Purrmep blessing bonus', () => {
      const ctx = context(), stages = computeFreshTalentCalcBubbleCache(charIdx, ctx);
      const inputs = { allEfficiencies: computeAllEfficiencies(charIdx, ctx),
        minEff: Number(finalBubbleValByKey('MinEff', charIdx, saveData, stages)),
        chopEff: Number(finalBubbleValByKey('ChopEff', charIdx, saveData, stages)),
        str: ctx.resolve('total-str').val, agi: ctx.resolve('total-agi').val, wis: ctx.resolve('total-wis').val };
      if (Object.values(inputs).some(value => typeof value !== 'number' || !Number.isFinite(value)))
        throw new Error('Divinity blessing inputs are unavailable.');
      return { val: computeDivinityBless(2, saveData, inputs), ...partial };
    });
  });
  family('worship-charge', 'Worship charge and claim outcomes', () => {
    const totem = readRawKey(raw, 'TotemInfo'), player = readRawKey(raw, 'PlayerStuff_' + charIdx);
    if (!Array.isArray(totem?.[0]) || !Array.isArray(player)
      || player[0] == null || player[0] === '' || !Number.isFinite(Number(player[0])) || Number(player[0]) < 0)
      throw new Error('Saved Worship trials or charge are missing.');
    const inputs = worshipTdInputs(saveData, charIdx);
    for (const [field, name] of [['worshipSpeed', 'charge per hour'], ['chargeMax', 'maximum charge']])
      add('worship:' + field, 'Worship - ' + name, () => ({ val: inputs[field], ...partial,
        reason: 'Fresh placement/charge calculation; temporary Charge Siphon buff is not assumed. ' + partial.reason }));
    for (let trial = 0; trial < 8; trial++) {
      if (totem[0][trial] == null || totem[0][trial] === ''
        || !Number.isFinite(Number(totem[0][trial])) || Number(totem[0][trial]) < 0) {
        add(`worship:${trial}:unavailable`, `Worship trial ${trial + 1}`,
          () => ({ unavailable: true, reason: 'Saved best wave is missing or invalid.' }));
        continue;
      }
      const claim = trialSummary(inputs, trial);
      claim.exp = expRewards(inputs, trial, claim.best);
      for (const [field, label] of [['souls', 'souls per worship'], ['exp', 'EXP per worship'],
        ['soulsPerHour', 'souls per charge-generation hour'], ['expPerHour', 'EXP per charge-generation hour']])
        add(`worship:${trial}:${field}`, `Worship trial ${trial + 1} - ${label}`,
          () => ({ val: claim[field], ...partial }));
      family('worship-claim:' + trial, `Worship trial ${trial + 1} saved-charge claims`, () => {
        const options = readRawKey(raw, 'OptionsListAccount') ?? readRawKey(raw, 'OptLacc');
        if (options?.[501] == null || options[501] === '' || !Number.isFinite(Number(options[501])))
          throw new Error('Saved first-All-Quick reward flag is unavailable.');
        const result = worshipClaimOutcome(inputs, trial, claim.best, Number(player[0]));
        const info = { partial: true, reason: 'Independent single Worship or All Quick using saved charge and fixed reward inputs. '
          + 'All Quick uses native five-fold batches, four-stack caps and the first-use bonus for souls and EXP. '
          + 'Soul quantities are dropped/offered to storage, not guaranteed retained inventory. '
          + 'Assumes trial access; food depletion, card drops, level settlement and live cache changes are excluded. '
          + (!result.all.complete ? 'Native 1000-pass limit leaves charge unclaimed. ' : '') + partial.reason };
        for (const [mode, label] of [['single', 'single Worship'], ['all', 'All Quick']])
          for (const [field, name] of [['souls', 'souls offered'], ['exp', 'EXP awarded'], ['remainingCharge', 'remaining charge']])
            add(`worship-claim:${trial}:${mode}:${field}`, `Worship trial ${trial + 1} - ${label} ${name}`,
              () => ({ val: result[mode][field], ...info }), { intermediate: field === 'remainingCharge' });
      });
    }
  });
  family('combat-current-formulas', 'Current combat formula inputs', () => {
    const built = combatInputs();
    for (const [key, label] of [['damageMastery', 'damage mastery'], ['foodNotConsume', 'food non-consumption percent'],
      ['healthFoodEffect', 'health food effect multiplier'], ['boostFoodEffect', 'boost food effect multiplier'],
      ['atkCooldownDec', 'skill cooldown divisor'], ['bossMulti', 'boss damage multiplier'],
      ['attackSpeedPct', 'attack speed percent']])
      add('combat-formula:' + key, 'Combat - ' + label, () => {
        const entry = built.entries[key];
        return { val: entry?.value, unavailable: entry?.status === 'unavailable',
          partial: entry?.status === 'partial' || entry?.partial || partial.partial,
          reason: [entry?.note, partial.reason].filter(Boolean).join(' ') };
      }, { intermediate: true });
    for (const type of ['FISTICUFF', 'SPEAR', 'BOW', 'WAND']) add('action-wait:' + type,
      type + ' - native action wait seconds', () => ({
        val: actionWaitTime(type, { weaponSpeed: built.values.weaponSpeed,
          level: saveData.lv0AllData[charIdx][0], attackSpeedPct: built.values.attackSpeedPct,
          buff135: 0, buff468: 0 }), ...partial,
        reason: 'Formula with the saved weapon Speed, assuming neither temporary attack-speed buff. '
          + 'Not a simulated attack period; native animation ticks add cadence. ' + partial.reason,
      }), { lowerIsBetter: true });
  });
  family('alchemy-active-effects', 'Active Alchemy effects', () => {
    const effects = alchemyActiveEffects(saveData, charIdx, Number(attackDef(490)?.cooldown));
    for (const [field, label, lowerIsBetter] of [['secondsPerKill', 'seconds credited per kill while Cauldron is active', false],
      ['duration', 'Cauldron duration seconds if cast', false],
      ['manualCooldown', 'Cauldron cooldown seconds after manual cast', true],
      ['autoCooldown', 'Cauldron cooldown seconds after automatic cast', true]])
      add('alchemy-active:' + field, 'Alchemy - ' + label,
        () => ({ val: effects[field], ...partial,
          reason: 'Current-state formula only; assumes the named cast/buff condition, not cast eligibility or repeated combat. '
            + partial.reason }), { lowerIsBetter });
  });
  family('royal-outposts', 'Royal Guardian local formulas', () => {
    if (!hasCompleteRoyalData(saveData)) throw new Error('Complete Royal Guardian data is missing.');
    const derived = royalGuardianDerivedInputs(saveData), ext = { derivedInputs: derived };
    const info = { partial: !derived.available, reason: derived.missing?.join(', ') || '' };
    for (let map = 0; map < saveData.royalMapsData.length; map++) {
      if (!Array.isArray(saveData.royalMapsData[map]) || saveData.royalMapsData[map].length < 3) continue;
      add(`royal:${map}:resource`, `Royal outpost ${map} - pre-grade collection per hour`, () => {
        const d = outpostResourceRateBreakdown(saveData, map, ext);
        return { val: d.value, unavailable: !d.available, ...info };
      });
      add(`royal:${map}:range`, `Royal outpost ${map} - range`, () => {
        const d = outpostRangeBreakdown(saveData, map, ext);
        return { val: d.value, unavailable: !d.available, ...info };
      });
      const ranks = outpostRankExpBreakdown(saveData, map, ext);
      for (let bar = 0; bar < 5; bar++) add(`royal:${map}:rank:${bar}`,
        `Royal outpost ${map} - ${['Trading', 'Intel', 'Command', 'Military', 'Purity'][bar]} EXP per hour`,
        () => ({ val: ranks.factors[bar]?.value, unavailable: !ranks.available, ...info }));
    }
  });
  family('royal-nodes', 'Royal Guardian linked resource outcomes', () => {
        if (!hasCompleteRoyalData(saveData)) throw new Error('Complete Royal Guardian data is missing.');
        const derived = royalGuardianDerivedInputs(saveData), ext = { derivedInputs: derived };
        const allocation = resourceAllocationMetrics(saveData, { hours: afkHours, ext });
        if (!allocation.available) throw new Error(allocation.missing.join(', '));
        const info = { partial: allocation.partial || !derived.available || partial.partial,
          reason: 'Saved links and current grades, with fresh derived caches; no refill or grade rollover. '
            + [...(derived.missing || []), ...allocation.missing,
              ...allocation.invalid.map(link => link.reason)].join(', ') + ' ' + partial.reason };
        const nodes = allocation.details.filter(node => resourceCapacity(saveData, node.resourceIdx) > 0);
        function nodeAvailable(node) {
          const progress = saveData.royalGData[4]?.[node.resourceIdx], grade = saveData.royalGData[5]?.[node.resourceIdx];
          return progress != null && progress !== '' && Number.isFinite(Number(progress)) && Number(progress) >= -1
            && grade != null && grade !== '' && Number.isFinite(Number(grade)) && Number(grade) >= 0;
        }
        for (const node of nodes)
          for (const [field, label] of [['drainRate', 'linked grade-scaled drain per hour before depletion'],
            ['currencyRate', 'linked currency per hour before depletion'],
            ['collectedWithinWindow', `drain attainable in ${afkHours}h without refill`]])
            add(`royal-node:${node.resourceIdx}:${field}`, `Royal resource ${node.resourceIdx + 1} - ${label}`,
              () => ({ val: node[field], ...info, unavailable: !nodeAvailable(node),
                reason: nodeAvailable(node) ? info.reason : 'Saved resource progress or grade is missing or invalid.' }));
        family('royal-collect', 'Royal Guardian saved banked collection', () => {
          const seconds = saveData.royalGData[3]?.[0];
          if (seconds == null || seconds === '' || !Number.isFinite(Number(seconds)) || Number(seconds) < 0)
            throw new Error('Saved Royal banked collection seconds are missing or invalid.');
          if (nodes.some(node => node.streams.length > 0 && !nodeAvailable(node)))
            throw new Error('A linked resource has missing or invalid saved progress/grade.');
          const result = royalCollectAll(cloneRoyalState(saveData), Number(seconds) / 3600, ext);
          const collected = { ...info, reason: 'One collection of saved banked seconds, with fresh unit/stat caches. '
            + 'Native map/link and Trading/Intel/transient order is preserved, including mid-pass purification. '
            + 'No added elapsed time, reset, reassignment or spending. ' + info.reason };
          for (const slot of new Set(nodes.map(node => node.currencySlot).filter(slot => slot >= 0)))
            add(`royal-collect:currency:${slot}`, `Royal currency ${slot + 1} - gained in saved banked collection`,
              () => ({ val: result.currency[slot] ?? 0, ...collected }));
          for (const node of nodes)
            add(`royal-collect:drain:${node.resourceIdx}`,
              `Royal resource ${node.resourceIdx + 1} - native drain progress added before terminal sentinel`,
              () => ({ val: result.drain[node.resourceIdx] ?? 0, ...collected }));
          for (const outpost of result.exp)
            for (let bar = 0; bar < 5; bar++)
              add(`royal-collect:${outpost.mapIdx}:exp:${bar}`,
                `Royal outpost ${outpost.mapIdx} - ${['Trading', 'Intel', 'Command', 'Military', 'Purity'][bar]} EXP collected`,
                () => ({ val: outpost.gained[bar], ...collected }));
          for (const map of new Set(result.clears.map(clear => clear.mapIdx)))
            add(`royal-collect:${map}:clear`, `Royal outpost ${map} - clearing progress collected`,
              () => ({ val: result.clears.filter(entry => entry.mapIdx === map)
                .reduce((sum, entry) => sum + entry.gain, 0), ...collected }));
        });
  });
  family('bubble-cache', 'Processed bubble bonuses', () => {
    const stages = computeFreshTalentCalcBubbleCache(charIdx, context());
    for (const bubble of bubbleDefinitions()) {
      add('bubble-cache:' + bubble.effect, entityName('Bubble', [bubble.cauldron, bubble.index]) + ' - processed bonus',
        () => ({ ...finalBubbleValByKey(bubble.effect, charIdx, saveData, stages), ...partial }),
        { intermediate: true, effect: bubble.effect });
    }
  });
  add('statue-retention', 'Statue EXP retained on level-up', () =>
    ({ val: statueLevelingInputs(saveData, charIdx).retentionPct, ...partial }));
  add('breeding-egg-seconds', 'Breeding - seconds per egg', () =>
    ({ val: breedingEggSeconds(saveData, charIdx), ...partial }), { lowerIsBetter: true });
  for (const [phase, name] of [['entry', 'Map-entry'], ['online', 'Settled online']]) {
    family('breeding-incubation:' + phase, 'Breeding ' + name + ' incubation', () => {
      const result = breedingIncubation(saveData, charIdx, { seconds: afkHours * 3600, phase });
      const info = { partial: true, reason: result.reason + ' ' + partial.reason };
      for (const [field, label] of [['addedEggs', 'New eggs'], ['rarityGain', 'Total egg rarity gained (including new eggs)']])
        add(`breeding-incubation:${phase}:${field}`, `Breeding ${name} - ${label}`,
          () => ({ val: result[field], ...info }));
      for (let rarity = 1; rarity <= 11; rarity++)
        add(`breeding-incubation:${phase}:rarity:${rarity}`, `Breeding ${name} - Expected rarity ${rarity} eggs`,
          () => ({ val: result.rarities[rarity], ...info }));
      add(`breeding-incubation:${phase}:remainingSeconds`, `Breeding ${name} - Unprocessed egg seconds`,
        () => ({ val: result.remainingSeconds, ...info }), { intermediate: true });
      family(`breeding-incubation-use-all:${phase}`, `Breeding ${name} use all after incubation`, () => {
        const used = breedingEggAutoUseDistribution(saveData, result.outcomes, charIdx);
        for (const [field, label] of [['hatches', 'Expected eggs consumed'], ['dna', 'Expected DNA'],
          ['exp', 'Banked Breeding EXP']])
          add(`breeding-incubation-use-all:${phase}:${field}`, `Breeding ${name} - Use all after incubation - ${label}`,
            () => ({ val: used[field], unavailable: field === 'dna' && !!used.dnaUnavailable,
              partial: true, reason: (field === 'dna' && used.dnaUnavailable ? used.dnaUnavailable + ' ' : '')
                + result.reason + ' Then one native use-all action is evaluated separately for every possible nest, '
                + 'at most 100 front eggs. No incubation/hatch interleaving, discoveries, pity, refills, '
                + 'storage gate or EXP level settlement. ' + partial.reason }));
      });
    });
  }
  family('breeding-auto-use', 'Breeding use all saved eggs', () => {
    const result = breedingEggAutoUse(saveData, charIdx);
    for (const [field, name] of [['hatches', 'Eggs consumed'], ['dna', 'Expected DNA'], ['exp', 'Banked Breeding EXP']])
      add('breeding-auto-use:' + field, 'Breeding use all eggs - ' + name,
        () => ({ val: result[field], unavailable: field === 'dna' && !!result.dnaUnavailable,
          partial: true, reason: (field === 'dna' && result.dnaUnavailable ? result.dnaUnavailable + ' ' : '')
          + 'Native use-all action, at most 100 saved front eggs; '
          + 'stops at the first empty slot. No discovery, pity, refill or storage gate. '
          + 'EXP is banked without level settlement; achievements are not projected. ' + partial.reason }));
  });
  family('breeding-hatch', 'Breeding hatch probabilities', () => {
    if (!saveData.breedingData?.[1]) throw new Error('Saved Breeding species counts are missing.');
    for (const world of BREEDING_WORLDS) {
      const count = saveData.breedingData[1][world];
      if (count == null || !Number.isInteger(Number(count)) || Number(count) < 0)
        throw new Error('Saved Breeding species count is missing or invalid.');
      for (let pet = 0; pet < Math.min(Number(count), PET_STATS[world].length); pet++) {
        if (PET_STATS[world][pet][0] === '_') continue;
        for (const shiny of [false, true]) {
          if (!shiny && (pet + 2 <= Number(count) || pet >= PET_STATS[world].length - 1)) continue;
          add(`breeding-hatch:${world}:${pet}:${shiny ? 'shiny' : 'new'}`,
            `Breeding W${world + 1} ${PET_NAMES[world][pet]} - ${shiny ? 'shiny' : 'next species'} chance per egg`, () =>
              ({ val: breedingHatchOutcome(saveData, world, pet, charIdx, { shiny }).chance, partial: true,
                reason: 'Potential with the saved front egg, hatch-mode eligibility and failure counters. '
                  + 'Excludes the initial tutorial rig and sequential hatches. ' + partial.reason }));
          if (shiny && (Number(saveData.breedingData[2]?.[8]) === 0
            || (pet !== PET_STATS[world].length - 1 && pet + 2 > Number(count)))) continue;
          family(`breeding-sequence:${world}:${pet}:${shiny ? 'shiny' : 'new'}`,
            `Breeding W${world + 1} ${PET_NAMES[world][pet]} - ${shiny ? 'shiny' : 'next species'} sequence`, () => {
              const sequence = breedingHatchSequence(saveData, world, pet, charIdx, { shiny });
              for (const [field, label] of [['hatches', 'Expected hatches'], ['successes', 'Expected successes'],
                ['kept', 'Expected pets kept'], ['dna', 'Expected DNA'], ['exp', 'Banked Breeding EXP'],
                ['successChance', 'Chance of at least one success'], ['tailProbability', 'Unfinished probability']]) {
                for (const [policy, policyName] of [['keep', 'Keep successes'], ['trash', 'Trash all']]) {
                  add(`breeding-sequence:${world}:${pet}:${shiny ? 'shiny' : 'new'}:${policy}:${field}`,
                    `Breeding W${world + 1} ${PET_NAMES[world][pet]} - ${shiny ? 'shiny' : 'next species'} sequence - ${policyName} - ${label}`,
                    () => ({ val: sequence[policy][field], unavailable: field === 'dna' && !!sequence.dnaUnavailable,
                      partial: true, reason: (field === 'dna' && sequence.dnaUnavailable ? sequence.dnaUnavailable + ' ' : '')
                        + sequence.reason + ` Bound: ${sequence.maxHatches} hatches. `
                        + `Unfinished probability: ${sequence[policy].tailProbability}. ` + partial.reason }),
                    { intermediate: field === 'tailProbability' });
                }
              }
            });
        }
      }
    }
  });
  for (const critter of trappingCritters()) {
    add('trapping-rare:' + critter.index,
      'Trapping ' + entityName('Item', critter.key) + ' - new trap stored shiny chance (%)', () =>
        ({ val: trappingPlacementRarePct(saveData, charIdx, critter.index), partial: true,
          reason: 'Potential for a newly placed trap with rarity bonus 1. Existing traps keep their stored values. '
            + 'Not collected shiny quantity; excludes collection bonuses and trap-specific rarity multipliers. '
            + partial.reason }));
  }
  family('trapping-collection', 'Trapping placement and collection outcomes', () => {
    const presence = combatAfkInputDataAvailable[charIdx];
    if (!presence?.foodSlots || !presence?.equipment || !presence?.equipmentQty)
      throw new Error('Saved equipment and food inputs are required for Trapping collection.');
    const entries = combatInputs().entries;
    if (!entries.boostFoodEffect || entries.boostFoodEffect.status === 'unavailable')
      throw new Error('Boost-food multiplier is unavailable.');
    const slots = combatInputs().values.foodSlots;
    if (!slots || !Number.isInteger(slots.count) || slots.count < 0 || slots.order.length < slots.count
      || slots.qty.length < slots.count || slots.order.slice(0, slots.count).some(key => typeof key !== 'string')
      || slots.qty.slice(0, slots.count).some(qty => qty == null || !Number.isFinite(Number(qty))))
      throw new Error('Saved food slots or quantities are missing or malformed.');
    const inputs = trappingCollectionInputs(saveData, charIdx, entries.boostFoodEffect.value);
    const info = { partial: true, reason: 'One trap collection with fixed collector food and bonuses, before pickup limits. '
      + 'Collection does not reprice stored traps. Repeated food consumption and later level-ups are not projected. ' + partial.reason };
    function collect(id, name, trap, options, collectionInputs = inputs) {
      const result = trappingCollection(trap, collectionInputs, options);
      for (const [key, label] of [['quantity', 'normal critters'], ['exp', 'Trapping EXP'],
        ['rareExpected', 'expected shiny critters'], ['rareChance', 'shiny chance'], ['cardChance', 'card chance']])
        add(id + ':' + key, name + ' - ' + label, () => ({ val: result[key], ...info,
          reason: info.reason + (collectionInputs !== inputs
            ? ' New placement resets Compounder days to zero; later daily resets are not projected.' : '') }));
    }
    const tool = itemDef(equipOrderData[charIdx]?.[1]?.[4]);
    if (tool && tool.Type === 'TRAP_BOX_SET') {
      const newInputs = trappingCollectionInputs(saveData, charIdx, entries.boostFoodEffect.value, { compounderDays: 0 });
      for (let type = 0; type < Number(tool.ID); type++) for (const critter of trappingCritters())
        for (const box of trappingBoxOptions(type)) {
        const id = `trapping-new:${type}:${critter.index}:${box.index}`;
        const name = `New ${entityName('Item', critter.key)} ${entityName('Item', 'TrapBoxSet' + (type + 1))} (${box.seconds / 3600}h)`;
        family(id, name, () => {
          const trap = trappingPlacement(saveData, charIdx, critter.index, box);
          for (const mode of ['local', 'remote', 'all']) collect(id + ':' + mode,
            name + ' ' + ({ local: 'local opening', remote: 'remote opening', all: 'Collect All' }[mode]),
            trap, { mode }, newInputs);
        });
      }
    } else add('trapping-new', 'New Trapping placements', () => {
      throw new Error('A saved equipped trap box is required for duration-specific placements.');
    });
    for (let owner = 0; owner < saveData.lv0AllData.length; owner++) {
      const traps = readRawKey(raw, 'PlacedTraps_' + owner);
      if (!Array.isArray(traps)) {
        add('trapping-saved:' + owner, `Saved traps (${saveData.charNames[owner] || 'Character ' + (owner + 1)})`, () => {
          throw new Error('Saved trap rows are missing or malformed.');
        });
        continue;
      }
      for (let slot = 0; slot < Math.min(8, traps.length); slot++) {
        const row = traps[slot];
        if (Array.isArray(row) && row[0] != null && Number(row[0]) === -1) continue;
        const id = `trapping-saved:${owner}:${slot}`, name = `Saved trap ${slot + 1} (${saveData.charNames[owner] || 'Character ' + (owner + 1)})`;
        family(id, name, () => {
          if (!Array.isArray(row) || [0, 2, 4, 6, 7, 8].some(index =>
            row[index] == null || String(row[index]).trim() === '' || !Number.isFinite(Number(row[index]))))
            throw new Error('Saved trap timing or snapshot fields are missing.');
          const trap = { key: row[3], quantity: Number(row[4]), seconds: Number(row[6]), exp: Number(row[7]), rarePct: Number(row[8]) };
          for (const mode of owner === charIdx ? ['local', 'remote', 'all'] : ['remote', 'all'])
            collect(id + ':' + mode, name + ' ' + ({ local: 'local opening', remote: 'remote opening', all: 'Collect All' }[mode]),
              trap, { mode, currentOwner: owner === charIdx, ready: Number(row[2]) >= trap.seconds && trap.seconds > 50 });
        });
      }
    }
  });
  for (const giftCount of [0, 100]) {
    family('level-up-gifts:' + giftCount, 'Level Up Gift rewards', () => {
      const distribution = levelUpGiftDistribution({
        chance: Number(finalBubbleValByKey('LevelUpACTIVE', charIdx, saveData)) / 100,
        level: Number(saveData.lv0AllData?.[charIdx]?.[0]) + 1, giftCount,
        stampA23: stampLvData?.[0]?.[22] == null ? NaN : Number(stampLvData[0][22]),
        stampC9: stampLvData?.[2]?.[8] == null ? NaN : Number(stampLvData[2][8]),
      });
      for (const item of distribution.items) {
        add(`level-up-gifts:${giftCount}:${item.key}`,
          `Next active Class level - ${entityName('Item', item.key)} expected (${giftCount ? 'session gift limit reached' : 'fresh session'})`,
          () => ({ val: item.probability, partial: true,
            reason: 'One next active Class level, one item per successful gift. The unsaved session counter '
              + 'is explicitly assumed; excludes sequential levels and the additional Goldric quest drop. ' + partial.reason }));
      }
    });
  }
  family('class-talent-points', 'Class talent point pools', () => {
    const pools = classTalentPointPools(saveData, charIdx);
    for (let tab = 0; tab < pools.length; tab++) {
      add('class-talent-points:' + tab, `Class talent tab ${tab + 1} - total point pool before spending`,
        () => ({ val: pools[tab], ...partial }), { absolute: true });
    }
  });
  family('class-talent-points-extra', 'Fifth and Star talent point pools', () => {
    const pools = classTalentPointPools(saveData, charIdx, { allPools: true });
    for (const tab of [4, 5]) add('class-talent-points:' + tab,
      `${tab === 4 ? 'Class talent tab 5' : 'Star talents'} - total point pool before spending`,
      () => ({ val: pools[tab], ...partial }), { absolute: true });
  });
  add('cog-creation', 'Construction - cog creation multiplier', () =>
    ({ val: cogCreationMultiplier(saveData, charIdx), ...partial }));
  add('library-book-seconds', 'Library - seconds until next book', () =>
    ({ val: libraryBookSeconds(saveData, charIdx), ...partial }), { lowerIsBetter: true });
  family('anvil-deposit', 'Anvil quick deposit', () => {
    if (readRawKey(raw, 'BundlesReceived') == null) throw new Error('Saved storage bundle flags are missing.');
    const slots = anvilStorageSlots(saveData, readRawKey(raw, 'InvStorageUsed'));
    const deposit = anvilQuickDeposit(saveData, charIdx, { storageSlots: slots });
    const info = { ...partial, reason: 'One selected-character quick deposit of saved products, scanning unlocked storage only. '
      + 'EXP uses full product quantity and current multiplier, including quantity discarded by the storage cap. '
      + 'No new production, automatic all-character deposit or level settlement. ' + partial.reason };
    add('anvil-deposit:exp', 'Anvil - EXP awarded by quick deposit', () => ({ val: deposit.exp, ...info }));
    for (const product of deposit.products) {
      for (const [field, label] of [['retained', 'stored items retained'], ['discarded', 'items discarded at storage cap']])
        add(`anvil-deposit:${product.index}:${field}`, `Anvil ${product.key} - ${label}`,
          () => ({ val: product[field], ...info }));
    }
  });
  family('anvil-deposit-all', 'All-character Anvil quick deposit', () => {
    if (readRawKey(raw, 'BundlesReceived') == null) throw new Error('Saved storage bundle flags are missing.');
    const slots = anvilStorageSlots(saveData, readRawKey(raw, 'InvStorageUsed'));
    const deposit = anvilQuickDepositAll(saveData, charIdx, { storageSlots: slots });
    const info = { partial: true, reason: 'One all-character quick deposit in saved character-index order, '
      + 'with shared unlocked storage and its two-billion cap. Native database key order is not saved. '
      + 'The logged-in character uses current Smithing EXP; other characters use only their saved EXP points, capped at 25x. '
      + 'No production, deposit interleaving or level settlement. ' + partial.reason };
    add('anvil-deposit-all:exp', 'Anvil - total EXP awarded by all-character quick deposit',
      () => ({ val: deposit.exp, ...info }));
    for (const character of deposit.characters)
      add(`anvil-deposit-all:character:${character.charIdx}:exp`,
        `Anvil character ${character.charIdx + 1} - EXP awarded by all-character quick deposit`,
        () => ({ val: character.exp, ...info }));
    for (const product of deposit.products)
      for (const [field, label] of [['retained', 'stored items retained'], ['discarded', 'items discarded at storage cap']])
        add(`anvil-deposit-all:${product.index}:${field}`, `All-character Anvil ${product.key} - ${label}`,
          () => ({ val: product[field], ...info }));
  });
  family('anvil', 'Anvil production', () => {
    const anvil = anvilProductionStats(saveData, charIdx);
    for (const [field, label, lowerIsBetter] of [
      ['speed', 'production speed', false], ['expMulti', 'production EXP multiplier', false],
      ['capacity', 'product capacity', false], ['coinCost', 'coins per purchased point', true],
      ['materialCost', 'materials per purchased point', true],
    ]) add('anvil:' + field, 'Anvil - ' + label, () => ({ val: anvil[field], ...partial,
      reason: [partial.reason, field === 'capacity' ? anvil.capacityReason : ''].filter(Boolean).join(' ') }),
    { lowerIsBetter });
    for (const product of anvil.products) {
      for (const [field, label] of [['perHour', 'items /hr'], ['expPerHour', 'Smithing EXP /hr']]) {
        add(`anvil:${product.index}:${field}`,
          `Anvil ${entityName('Item', product.key)} - ${label} per hammer before storage fills`, () =>
            ({ val: product[field], partial: true,
              reason: 'Potential for one hammer; excludes current assignments, storage fill and collections. ' + partial.reason }));
      }
    }
    family('anvil-batch', 'Saved Anvil production batch', () => {
      const batch = anvilProductionBatch(saveData, charIdx, afkHours * 3600, { stats: anvil });
      for (const product of batch.products) {
        for (const [field, label] of [['items', 'new stored items'], ['exp', 'new stored Smithing EXP']])
          add(`anvil-batch:${product.index}:${field}`,
            `Anvil ${entityName('Item', product.key)} - ${label} after ${afkHours}h credited`, () =>
              ({ val: product[field], partial: true, reason: 'One native AFK production pass, '
                + 'in saved hammer order, with saved progress and product capacity. EXP is stored, not awarded. '
                + 'No collections, automatic deposit, level settlement or stat refresh. ' + partial.reason }));
      }
    });
  });
  for (let color = 0; color < 8; color++) {
    add('summoning-essence:' + color,
      'Summoning - ' + ['white', 'green', 'yellow', 'blue', 'purple', 'red', 'cyan', 'black'][color] + ' essence /hr', () =>
        ({ val: summoningEssencePerHour(saveData, color, charIdx), ...partial }));
  }
  add('gaming-logbook', 'Gaming - logbook Bits multiplier', () =>
    ({ val: gamingLogbookMultiplier(saveData, charIdx), ...partial }));
  family('cooking-recipe', 'Cooking recipe fire', () => {
    if (!saveData.cookingData?.length) throw new Error('Saved kitchens are missing.');
    for (let kitchen = 0; kitchen < saveData.cookingData.length; kitchen++) {
      if (Number(saveData.cookingData[kitchen]?.[0]) === 0) continue;
      add('cooking-recipe:' + kitchen, `Kitchen ${kitchen + 1} - recipe fire /hr if assigned`, () =>
        ({ val: cookingRecipeFire(saveData, kitchen, charIdx), ...partial }));
      family('cooking-discovery:' + kitchen, `Kitchen ${kitchen + 1} recipe discovery`, () => {
        const discovery = cookingRecipeDiscovery(saveData, kitchen, charIdx, afkHours);
        const info = { partial: true, reason: `One manual recipe claim after ${afkHours}h producing recipe fire `
          + 'with the saved ingredients and fixed account inputs. Recipes are rolled highest-first; known recipes can win. '
          + 'No repeated claims, automatic fire retention, ingredient edits or discovery-driven recalculation. ' + partial.reason };
        for (const [field, label] of [['fireLevel', 'projected fire level'], ['newRecipeChance', 'new recipe chance'],
          ['noRecipeChance', 'no recipe chance']])
          add(`cooking-discovery:${kitchen}:${field}`, `Kitchen ${kitchen + 1} - ${label}`, () =>
            ({ val: discovery[field], ...info }));
        for (const outcome of discovery.outcomes)
          add(`cooking-discovery:${kitchen}:meal:${outcome.meal}`,
            `Kitchen ${kitchen + 1} - ${entityName('Meal', outcome.meal)} recipe chance`, () =>
              ({ val: outcome.chance, ...info }));
      });
    }
  });
  family('atom-costs', 'Atom upgrade costs', () => {
    if (!saveData.atomsData?.length) throw new Error('Saved atom upgrade levels are missing.');
    for (const { index, name } of atomUpgrades()) {
      add('atom-cost:' + index, name + ' - particles per upgrade', () =>
        ({ val: atomUpgradeCost(saveData, index, charIdx), ...partial }), { lowerIsBetter: true });
    }
  });
  add('alchemy-kruk-daily', 'Alchemy - daily Kattlekruk bubble levels', () =>
    ({ val: krukDailyBubbleLevels(saveData, charIdx), ...partial }));
  for (const particles of [false, true]) {
    const kind = particles ? 'particles' : 'materials';
    for (const [field, label] of [['mean', 'expected'], ['minimum', 'guaranteed']]) {
      add(`alchemy-upgrade-levels:${kind}:${field}`, `Alchemy - ${label} levels per ${kind} bubble purchase`, () =>
        ({ val: bubbleUpgradeLevelDistribution(Number(finalBubbleValByKey('DoubleBubbleUpg', charIdx, saveData)),
          particles)[field], ...partial }));
    }
  }
  family('form-drops', 'Master Class form drops', () => {
    if (!mapKnown) throw new Error('Saved map is unavailable.');
    const built = combatInputs();
    for (const [key, label] of [['bonesDropDec', 'Wraith bones drop multiplier'],
      ['extraDust', 'Tempest dust drop multiplier'], ['extraTachyon', 'Arcanist tachyon drop multiplier']]) {
      const entry = built.entries[key];
      add('form-drop:' + key, label + ' at map entry', () => ({
        val: entry?.value, unavailable: entry?.status === 'unavailable', partial: true,
        reason: 'Form-specific quantity formula; assumes fresh-map unsaved kill counters. Not a reward rate. '
          + [entry?.note, partial.reason].filter(Boolean).join(' '),
      }));
    }
  });
  family('alchemy-costs', 'Alchemy bubble upgrade costs', () => {
    for (const cost of bubbleUpgradeCosts(saveData, charIdx)) {
      add(`alchemy-cost:${cost.cauldron}:${cost.index}:${cost.slot}`,
        entityName('Bubble', [cost.cauldron, cost.index]) + ' - '
          + (entityName('Item', cost.ingredient) || 'Alchemy liquid ' + cost.ingredient.slice(-1)) + ' per upgrade',
        () => ({ val: cost.value, ...partial }), { lowerIsBetter: true });
    }
  });
  add('alchemy-brew-speed', 'Alchemy - logged-in character brewing speed', () =>
    ({ val: alchemyBrewSpeed(saveData, charIdx), ...partial }));
  for (let cauldron = 0; cauldron < 4; cauldron++) {
    add('alchemy-brew:' + cauldron,
      'Alchemy - ' + ['orange', 'green', 'purple', 'yellow'][cauldron] + ' brewing contribution if assigned', () =>
        ({ val: alchemyBrewSpeed(saveData, charIdx, cauldron), ...partial }));
    add('alchemy-liquid-cap:' + cauldron, `Alchemy - liquid ${cauldron + 1} capacity`, () =>
      ({ val: alchemyLiquidCapacity(saveData, cauldron, charIdx), ...partial }));
    add('alchemy-assigned-brew:' + cauldron,
      'Alchemy - ' + ['orange', 'green', 'purple', 'yellow'][cauldron] + ' assigned brewing progress /hr', () =>
        ({ val: alchemyAssignedBrewPerHour(saveData, cauldron, charIdx), ...partial }));
    add('alchemy-liquid-rate:' + cauldron, `Alchemy - liquid ${cauldron + 1} /hr`, () =>
      ({ val: alchemyLiquidPerHour(saveData, cauldron, charIdx), ...partial }));
    family('alchemy-liquid-batch:' + cauldron, `Alchemy liquid ${cauldron + 1} production batch`, () => {
      const batch = alchemyLiquidBatch(saveData, cauldron, charIdx, afkHours * 3600);
      for (const [field, label] of [['change', 'net retained liquid change'],
        ['capacityProgress', 'expected capacity-upgrade progress from overflow'],
        ['speedProgress', 'expected speed-upgrade progress from overflow']])
        add(`alchemy-liquid-batch:${cauldron}:${field}`,
          `Alchemy liquid ${cauldron + 1} - ${label} after ${afkHours}h credited`, () =>
            ({ val: batch[field], partial: true,
              reason: 'One credited Alchemy production pass with saved balances and fixed rates/capacity. '
                + 'Dream overflow chooses either capacity or speed progress with equal probability, not both per pass. '
                + 'No liquid spending, upgrade claims, levels or cache refreshes. '
                + (field === 'change' ? '' : batch.spillUnavailable) + ' ' + partial.reason }));
    });
  }
  add('alchemy-sigil-speed', 'Alchemy - Sigil charging multiplier', () =>
    ({ val: alchemySigilSpeed(saveData, charIdx), ...partial }));
  family('alchemy-workers', 'Alchemy worker production', () => {
    if (!saveData.cauldronJobsData?.[1] || typeof saveData.cauldronJobsData[1] !== 'object')
      throw new Error('Saved Alchemy jobs are missing.');
    const count = Math.max(saveData.charNames.length,
      saveData.lv0AllData.findLastIndex(row => row?.length) + 1);
    for (let worker = 0; worker < count; worker++) add('alchemy-worker-exp:' + worker,
      `Alchemy - ${saveData.charNames[worker] || 'Character ' + (worker + 1)} EXP /hr in saved job`, () =>
        ({ val: alchemyWorkerProduction(saveData, worker, charIdx).expPerHour, ...partial }));
  });
  family('farming', 'Farming plot outcomes', () => {
    if (!saveData.farmPlotData?.length) throw new Error('Saved Farming plots are missing.');
    const snapshot = farmingAccountSnapshot(saveData, { activeCharIdx: charIdx });
    for (let plot = 0; plot < saveData.farmPlotData.length; plot++) {
      if (!saveData.farmPlotData[plot]?.length) continue;
      const calculate = () => plotMetrics(plot, saveData, snapshot);
      for (const [field, label, lowerIsBetter] of [
        ['growthSeconds', 'growth seconds', true], ['nextCropChance', 'next evolution chance', false],
        ['nextOvergrowthChance', 'next overgrowth chance', false], ['farmingExp', 'EXP per harvest', false],
        ['rankXp', 'Land Rank EXP per harvest', false],
      ]) add(`farming:${plot}:${field}`, `Farming plot ${plot + 1} - ${label}`,
        () => ({ val: calculate()[field], ...partial }), { lowerIsBetter });
    }
  });
  family('fishing', 'Fishing location outcomes', () => {
    const evaluator = createFishingEvaluator(saveData, charIdx);
    const results = evaluator.evaluateLocations(evaluator.base.savedSelection, 1);
    for (const location of results.locations) {
      for (const [field, label] of [['fishTotal', 'credited fish /hr'], ['exp', 'real EXP /hr'],
        ['panelExpPerHour', 'AFK panel EXP /hr']]) {
        add(`fishing:${location.id}:${field}`, `Fishing ${location.label} - ${label}`,
          () => ({ val: location.outcome[field], partial: results.partial || partial.partial,
            reason: [...results.reasons, partial.reason].filter(Boolean).join(' ') }));
      }
      family('fishing-claim:' + location.id, location.label + ' finite Fishing claim', () => {
        const map = location.mapIdx ?? (location.poolKey === 'MotherlodeFISH' ? 216
          : location.poolKey === 'FishEquinox' ? 120 : null);
        if (map == null) throw new Error('No source-backed Fishing map is available.');
        if (location.poolKey === 'FishEquinox') {
          const unlocked = readRawKey(raw, 'Dream')?.[3];
          if (unlocked == null || !Number.isInteger(Number(unlocked)) || Number(unlocked) < 3)
            throw new Error('Equinox Fishing requires saved Equinox Resources level 3.');
        }
        const availability = combatAfkInputDataAvailable[charIdx];
        if (!availability?.equipment || !availability?.equipmentQty || !availability?.foodSlots
          || !availability?.buffs || !availability?.skillLevels || !availability?.postOffice)
          throw new Error('Saved Fishing equipment, food, buffs, skill levels or Post Office inputs are missing.');
        const ctx = createStatContext({ saveData, charIdx, mapIdx: map,
          layer1: { skillType: 'Fishing', isActive: true } });
        ctx.afkTarget = location.poolKey;
        const built = buildCombatInputs(saveData, charIdx, map,
          { rawSave: raw, ctx, overrides: { useSavedBuffs: true } });
        for (const key of ['foodNotConsume']) {
          const entry = built.entries[key];
          if (entry?.unavailable || !Number.isFinite(Number(entry?.value))
            || /resolver failed|non-finite/.test(entry?.note || ''))
            throw new Error('Fishing claim input unavailable: ' + key + '. ' + (entry?.note || ''));
        }
        if (built.values.labFoodRefill && !saveData.itemQuantityData?.chest?.available)
          throw new Error('Fishing Lab refill requires verified chest item quantities.');
        const prayer = computePrayerReal(2, 1, charIdx, saveData);
        if (prayer.unavailable || !Number.isFinite(Number(prayer.val)))
          throw new Error('Fishing AFK prayer cap is unavailable.');
        const entryInputs = createFishingEvaluator(saveData, charIdx, { mapIdx: map, afkTarget: location.poolKey })
          .inputsFor(evaluator.base.savedSelection, location);
        const claim = fishingClaim(location.poolKey, { ...entryInputs, prayerCap: Number(prayer.val) > 2 },
          afkHours * 3600, built.values, null, { includeDrops: false });
        const prefix = 'fishing-claim:' + location.id;
        const info = { partial: true, reason: `${afkHours}h normal Fishing claim with rounded/prayer-capped time. `
          + 'Cached Fishing inputs stay fixed through the native one-pass food settlement. '
          + 'Main fish, pool-card bonus rolls and rare-table rolls are separate generated outputs before presentation/pickup caps; '
          + 'later positive same-item pool bonuses overwrite earlier ones. No bag-retention or whole-account production. '
          + [...entryInputs.reasons, partial.reason].filter(Boolean).join(' ') };
        for (const [field, label] of [['fishTotal', 'credited main fish before pickup'],
          ['exp', 'Fishing EXP before claim doubling'], ['dropBatch', 'rare-drop catch batch']])
          add(`${prefix}:${field}`, `${location.label} - ${label}`,
            () => ({ val: claim[field], ...info }), { intermediate: field === 'dropBatch' });
        skillClaimAcceptance(prefix, location.label, claim, info, ctx, map, location.poolKey);
        if (location.poolKey === 'MotherlodeFISH') family(prefix + ':deposit', 'Trench conditional resource pickup', () => {
          const deposit = gatheringCavernDeposit(saveData, 'Fish14', claim.fishTotal);
          for (const [field, label] of [['quantity', 'picked layer progress'], ['progressAfter', 'ending layer progress']])
            add(`${prefix}:deposit:${field}`, 'Trench - ' + label, () => ({ val: deposit[field], ...info,
              reason: info.reason + ' Assumes every retained Fish14 main drop is picked; '
                + 'duplicate fish types are overwritten, not summed. No automatic clear or opal.' }),
              { intermediate: field === 'progressAfter' });
        });
        family(prefix + ':poolBonus', location.label + ' Fishing pool-card bonuses', () => {
          const entry = built.entries.dropRate;
          if (entry?.unavailable || !Number.isFinite(Number(entry?.value))
            || /resolver failed|non-finite/.test(entry?.note || ''))
            throw new Error('Fishing pool-card input unavailable: Drop Rarity. ' + (entry?.note || ''));
          const bonuses = fishingPoolBonusOutcomes(claim, built.values.dropRate);
          for (const drop of bonuses) for (const [field, label] of [
            ['expected', 'expected generated quantity'], ['chance', 'chance of at least one'],
          ]) add(`${prefix}:poolBonus:${drop.key}:${field}`, `${location.label} - ${entityName('Item', drop.key)} ${label}`,
            () => ({ val: drop[field], ...info }), { zeroWhenAbsent: prefix + ':poolBonus:fishTotal' });
          add(prefix + ':poolBonus:fishTotal', location.label + ' - validated pool-card main fish',
            () => ({ val: claim.fishTotal, ...info }), { intermediate: true });
        });
        family(prefix + ':rare', location.label + ' Fishing rare-table drops', () => {
          for (const key of ['dropRate', 'cardChanceMulti', 'filterSlots']) {
            const entry = built.entries[key];
            if (entry?.unavailable || !Number.isFinite(Number(entry?.value))
              || /resolver failed|non-finite/.test(entry?.note || ''))
              throw new Error('Fishing rare-drop input unavailable: ' + key + '. ' + (entry?.note || ''));
          }
          const tables = { ldorRuns: 0 };
          lootDropOddsReset({ inputs: built, state: { cards0: built.values.cards0 },
            rewardsState: tables, emit() {}, timeMs: 0 });
          const rolled = fishingClaim(location.poolKey, { ...entryInputs, prayerCap: Number(prayer.val) > 2 },
            afkHours * 3600, built.values, tables);
          for (const drop of rolled.drops) for (const [field, label] of [
              ['expected', 'expected generated quantity'], ['chance', 'chance of at least one'],
            ]) add(`${prefix}:drop:${drop.key}:${field}`, `${location.label} - ${entityName('Item', drop.key)} ${label}`,
              () => ({ val: drop[field], ...info }), { zeroWhenAbsent: prefix + ':rare:dropBatch' });
          add(prefix + ':rare:dropBatch', location.label + ' - validated rare-drop catch batch',
            () => ({ val: rolled.dropBatch, ...info }), { intermediate: true });
        });
      });
    }
  });
  family('sneaking', 'Sneaking twin outcomes', () => {
    if (!saveData.ninjaData?.length) throw new Error('Saved Sneaking data is missing.');
    const count = saveData.lv0AllData?.length || 0;
    const floors = Array.from({ length: count }, (_, twin) => Number(saveData.ninjaData[twin]?.[0]));
    for (let twin = 0; twin < count; twin++) {
      if (!Number.isInteger(floors[twin]) || floors[twin] < 0 || floors[twin] > 11) continue;
      const prefix = 'Sneaking ' + (saveData.charNames?.[twin] || 'twin ' + (twin + 1));
      add(`sneaking:${twin}:stealth`, prefix + ' - Stealth', () =>
        ({ val: computeTwinStealth(twin, floors[twin], floors, saveData, charIdx).stealth, ...partial }));
      add(`sneaking:${twin}:door`, prefix + ' - door damage per action', () =>
        ({ val: computeDoorDamageDetailed(twin, saveData, charIdx).damage, ...partial }));
      add(`sneaking:${twin}:untie`, prefix + ' - untie progress per action', () =>
        ({ val: computeUntieProgressDetailed(twin, saveData, charIdx).progress, ...partial }));
      add(`sneaking:${twin}:jade`, prefix + ' - Jade per successful action', () =>
        ({ val: computeJadeCoin(twin, saveData, { activeCharIdx: charIdx }).coin, ...partial }));
      add(`sneaking:${twin}:exp`, prefix + ' - EXP per successful normal/training action', () =>
        ({ val: computeSneakingExpPerAction(twin, saveData, { activeCharIdx: charIdx }).exp, ...partial,
          reason: 'No EXP for door/untie actions. Award uses the native charm recipient; no level settlement. ' + partial.reason }));
      for (const actions of [1, 50, 1000]) {
        add(`sneaking:${twin}:item-find:${actions}`, prefix + ` - expected item-find rolls / ${actions} successful actions`, () =>
          ({ val: sneakingBatchItemFind(saveData, twin, actions, charIdx), ...partial }));
      }
    }
    for (let index = 0; index < Math.min(NK_COUNT, saveData.ninjaData[103]?.length || 0); index++) {
      add('sneaking-upgrade-cost:' + index, nkName(index) + ' - Jade upgrade cost', () =>
        ({ val: sneakingUpgradeCost(saveData, index, charIdx), ...partial }), { lowerIsBetter: true });
    }
  });
  family('spelunking-static', 'Static Spelunking outcomes', () => {
    const inputs = spelunkStaticInputs(saveData, charIdx);
    for (const [field, label] of [['regen', 'stamina regeneration per hour'],
      ['amber', 'Amber multiplier'], ['grand', 'Grand Discovery chance']]) {
      add('spelunking:' + field, 'Spelunking - ' + label,
        () => ({ val: inputs[field], ...partial }));
    }
    const exits = spelunkExitDistribution(inputs);
    add('spelunking:exits:mean', 'Spelunking - expected exit-bearing rocks requested per ordinary floor', () =>
      ({ val: exits.expected, ...partial }));
    for (let count = 1; count <= 3; count++) add('spelunking:exits:' + count,
      `Spelunking - chance of requesting ${count} exit-bearing ${count === 1 ? 'rock' : 'rocks'} on an ordinary floor`, () =>
        ({ val: exits.probabilities[count - 1], ...partial }), { lowerIsBetter: count === 1 });
  });
  family('sailing-chest-artifacts', 'Sailing saved chest artifact awards', () => {
    if (!readRawKey(raw, 'Rift') || !readRawKey(raw, 'Spelunk') || !readRawKey(raw, 'Ninja')
      || !readRawKey(raw, 'Research')) throw new Error('Saved artifact unlock gates are missing.');
    const chest = sailingChestArtifactOutcome(saveData, { serverVars: raw.serverVars });
    const info = { ...partial, partial: partial.partial || chest.partial,
      reason: 'One opening of the saved front chest. Its stored artifact multiplier stays fixed; '
      + 'native rolls stop at the first success. No repeated openings or artifact-bonus refresh after an award. '
      + [partial.reason, chest.reason].filter(Boolean).join(' ') };
    add('sailing-chest:noArtifact', 'Saved Sailing chest - no artifact chance',
      () => ({ val: chest.noArtifactChance, ...info }), { lowerIsBetter: true });
    for (const artifact of chest.artifacts) add('sailing-chest:artifact:' + artifact.artifactIdx,
      `Saved Sailing chest - ${artifact.name} tier ${artifact.nextTier} award chance`,
      () => ({ val: artifact.exactChance, ...info }));
  });
  for (let boat = 0; boat < (saveData.boatsData?.length || 0); boat++) {
    if (Number(saveData.boatsData[boat]?.[0]) < 0) continue;
    const id = 'boat-speed:' + boat, name = 'Boat ' + (boat + 1) + ' speed';
    try {
      metrics.push(_snapshot(id, name, { val: boatSpeed(boat, saveData, { activeCharIdx: charIdx }).value }));
    } catch (error) {
      metrics.push(_snapshot(id, name, { unavailable: true, reason: error.message || String(error) }));
    }
    for (let island = 0; island < availableIslandCount(saveData); island++) {
      family(`sailing:${boat}:${island}`, `Boat ${boat + 1}, island ${island + 1} outcomes`, () => {
        const route = routeMetrics(boat, island, saveData, { activeCharIdx: charIdx, serverVars: raw.serverVars });
        for (const [field, label] of [['generatedChestsPerHour', 'generated chests /hr'],
          ['treasurePerHour', 'direct treasure /hr'], ['artifactChancePerTrip', 'first-success artifact chance per trip'],
          ['captainExpPerHour', 'captain EXP /hr']]) {
          add(`sailing:${boat}:${island}:${field}`, `Boat ${boat + 1}, island ${island + 1} - ${label}`,
            () => ({ val: route[field], partial: true,
              reason: 'Independent route, unfiltered generated chests. Excludes shared pile replacements and sequential artifact awards. ' + partial.reason }));
        }
        for (const artifact of route.artifactOutcomes) add(`sailing:${boat}:${island}:artifact:${artifact.artifactIdx}`,
          `Boat ${boat + 1}, island ${island + 1} - ${artifact.name} tier ${artifact.nextTier} first-success chance per trip`,
          () => ({ val: artifact.chancePerTrip, partial: true,
            reason: 'One newly generated, unfiltered chest; tier probabilities and native first-success award order. '
              + 'Excludes pile replacements, earlier chest openings and award-driven cache refreshes. ' + partial.reason }));
      });
    }
  }
  return metrics;
}

export async function evaluatePrismaCauldron(raw, options, report = () => {}) {
  const plan = prismaPlan(raw, options);
  const baseline = await evaluatePrismaOutcomes(raw, plan.charIdx, options);
  const multiplier = getPrismaBonusMult(saveData);
  const multiplierPartial = saveData.companionDataAvailable === false;
  if (!Number.isFinite(multiplier)) throw new Error('Prisma multiplier could not be calculated.');
  const results = [];
  const eligible = plan.rows.filter(row => row.comparable);
  const bonuses = new Map(eligible.map(row => [row.id, alchemy.resolve([row.cauldron, row.index], { saveData }).val]));
  report({ type: 'baseline', plan, baseline, multiplier, multiplierPartial, total: eligible.length });
  for (const row of eligible) {
    let result;
    try {
      const retained = row.status === 'already';
      const changed = await evaluatePrismaOutcomes(prismaVariant(raw, row.cauldron, row.index,
        { prismad: !retained }), plan.charIdx, options);
      const changedBonus = alchemy.resolve([row.cauldron, row.index], { saveData }).val;
      result = { id: row.id, status: 'done', comparison: retained ? 'retained' : 'added',
        ...prismaChanges(retained ? changed : baseline, retained ? baseline : changed),
        bubbleBefore: retained ? changedBonus : bonuses.get(row.id),
        bubbleAfter: retained ? bonuses.get(row.id) : changedBonus };
      if (multiplierPartial) {
        result.partial = true;
        result.reason = 'Prisma multiplier is partial: companion ownership metadata is missing.';
        for (const change of [...result.changes, ...result.intermediates]) {
          change.partial = true; change.reason = [change.reason, result.reason].filter(Boolean).join(' ');
        }
      }
    } catch (error) { result = { id: row.id, status: 'error', error: error.message || String(error) }; }
    results.push(result);
    report({ type: 'row', result, completed: results.length, total: eligible.length });
  }
  return { plan, baseline, multiplier, multiplierPartial, results };
}
