import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';
import { optionsListData, afkStartData } from '../save/data.js';
import { createStatContext } from './stat-context.js';
import { applyCombatSetup, rowValues } from './systems/common/combat-sim-setup.js';
import { computeDivinityPointsPerHour, computeDivinityExpPerHour } from './systems/w5/divinity-rate.js';
import { computeDivinityMajor } from './systems/w5/divinity.js';
import { computePrayerReal } from './systems/w3/prayer.js';
import { divinityStyles } from './data/w5/divinity.js';
import { coralKidUpgradeCost, coralKidUpgradeEffect, coralKidMetrics, CORAL_KID_UNLOCK_LEVELS,
  CORAL_KID_SINGULARITY_UNLOCK_LEVELS } from './systems/w5/coral-god-rank.js';
import { coralSpendingInputs, singularityTransmute, singularityPointReserve, singularityBreakpoints,
  divinityClaimOutcome, planCoralDivinitySpending, godRankConfidencePlan,
  projectDivinityBankClaims, planDivinityBankRedemption } from './systems/w5/coral-divinity-spending.js?v=spiral-bank-7';
import { MERITOC_BASE, meritocBonusName } from './data/w7/meritoc.js?v=spiral-bank-2';
import { votingBonusValue, votingBonusName } from './data/common/voting.js?v=spiral-bank-2';
import { computeMeritocBonusz } from './systems/w7/meritoc.js';

function _number(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function _row(value) {
  if (typeof value === 'string') value = JSON.parse(value);
  return rowValues(value);
}

function _characters(raw) {
  const data = raw.data ?? raw;
  const keys = Object.keys(data).filter(key => /^(?:Lv0|Exp0|CharacterClass|SL|SM|PlayerStuff|PVtStarSign|PVFishingToolkit|PVStatList|FoodSlO|AttackLoadout|MaxCarryCap|InventoryOrder|ItemQTY|AnvilPAstats|AnvilPA|AnvilPAselect)_\d+$/.test(key));
  const count = Math.max(raw.charNames?.length ?? 0, 0, ...keys.map(key => Number(key.split('_').at(-1)) + 1));
  if (!count || count > 1000) throw new Error('Real saved characters are missing or invalid.');
  return Array.from({ length: count }, (_, ci) => ({ ci, name: raw.charNames?.[ci] ?? 'Character ' + (ci + 1) }));
}

function _loadRaw(raw) {
  const data = raw.data ?? raw;
  // Bind legacy singleton readers and loader caches to the native options key too.
  const loadData = Object.hasOwn(data, 'OptionsListAccount') ? { ...data, OptLacc: data.OptionsListAccount } : data;
  loadSaveData(raw.data ? { ...raw, data: loadData } : loadData);
}

function _measure(raw, characters, styles = false) {
  const data = raw.data ?? raw;
  _loadRaw(raw);
  let classFactor = null, classFactorError = null;
  try {
    const rank = _number(_row(data.Divinity)[25]), level = _number(optionsListData[429]);
    if (!Number.isInteger(rank) || !Number.isInteger(level))
      throw new Error('Saved God Rank or Coral Class EXP upgrade is unavailable.');
    classFactor = coralKidMetrics(saveData, { godRank: rank, levels: [0, 0, level, 0, 0, 0] }).classExp;
    if (!Number.isFinite(classFactor)) throw new Error('Coral / God Rank Class EXP factor exceeds the numeric range.');
  } catch (error) { classFactor = null; classFactorError = error.message; }
  return characters.map(({ ci, name }) => {
    const result = { ci, name, activity: data['AFKtarget_' + ci] ?? null, style: null,
      pointsPerHour: null, expPerHour: null, classFactor, classFactorError, claim: null, errors: [] };
    try {
      const style = _number(_row(data.Divinity)[ci]), level = _number(_row(data['Lv0_' + ci])[14]);
      if (!Number.isInteger(style) || style > 7 || !Number.isInteger(level)) throw new Error('Saved Divinity style or level is missing or invalid.');
      result.style = style;
      result.level = level;
      const ctx = createStatContext({ saveData, charIdx: ci });
      const rate = kind => {
        try {
          if (_number(_row(data.GemItemsPurchased)[130]) == null)
            throw new Error('Saved Gem Shop Divinity multiplier is missing or invalid.');
          const indices = kind === 'points' ? [431, 616] : [427, 618];
          if (indices.some(index => !Number.isInteger(_number(optionsListData[index]))))
            throw new Error('Saved Coral upgrades for Divinity ' + kind + ' are missing or invalid.');
          if (kind === 'points' && Array.from({ length: 6 }, (_, i) => _number(saveData.spelunkData?.[13]?.[i])).some(value => value == null))
            throw new Error('Saved Reef upgrade counts for Divinity points are missing or invalid.');
          if (kind === 'points' && [25, 28, 29, 31, 33].some(index => !Number.isInteger(_number(_row(data.Divinity)[index]))))
            throw new Error('Saved rank or blessings for Divinity points are missing or invalid.');
          if (kind === 'exp' && !Number.isInteger(_number(_row(data.Divinity)[25])))
            throw new Error('Saved God Rank for Divinity EXP is missing or invalid.');
          const value = Number(kind === 'points' ? computeDivinityPointsPerHour(ci, ctx) : computeDivinityExpPerHour(ci, ctx));
          if (!Number.isFinite(value) || value < 0) throw new Error('Divinity ' + kind + ' rate is invalid.');
          return value;
        } catch (error) {
          if (!result.errors.includes(error.message)) result.errors.push(error.message);
          return null;
        }
      };
      result.pointsPerHour = rate('points');
      result.expPerHour = rate('exp');
      if (styles) {
        result.styles = divinityStyles().filter(row => row.level <= level).map(row => {
          ctx.divinityStyle = row.index;
          return { ...row, pointsPerHour: rate('points'), expPerHour: rate('exp') };
        });
        delete ctx.divinityStyle;
      }
    } catch (error) { result.errors.push(error.message); }
    try {
      const target = result.activity;
      if (target == null) throw new Error('Saved AFK activity is missing.');
      let activity = 0;
      if (target === 'Divinity') activity = 1;
      else if (target === 'Laboratory') {
        if (saveData.companionDataAvailable !== true) {
          activity = null;
          result.errors.push('Laboratory Divinity eligibility needs companion metadata.');
        } else activity = computeDivinityMajor(ci, 5, saveData) === 1 ? 1 : 0;
      }
      const ctx = createStatContext({ saveData, charIdx: ci });
      ctx.divinityActivity = activity;
      result.claimPointsPerHour = activity === 0 ? 0 : activity == null || result.pointsPerHour == null ? null
        : Number(computeDivinityPointsPerHour(ci, ctx));
      result.claimExpPerHour = activity === 0 ? 0 : activity == null ? null : result.expPerHour;
      result.tranqiPerHour = result.style == null ? null : result.style === 5 ? result.expPerHour : 0;
      const prayers = _row(data['Prayers_' + ci]);
      if (data['Prayers_' + ci] == null) throw new Error('Saved equipped prayers are missing.');
      if (prayers.some(value => Number(value) === 2) && _number(saveData.prayOwnedData?.[2]) == null)
        throw new Error('Saved ten-hour prayer level is missing.');
      result.capped = Number(computePrayerReal(2, 1, ci, saveData)) > 2;
      const unlocked = _number(saveData.menagerieData?.[2]?.[2]);
      const nonDivLevel = _number(optionsListData[619]);
      result.hourMultiplier = unlocked == null ? null : unlocked < 1 ? 0 : target === 'Divinity' ? 1
        : nonDivLevel == null ? null : Math.max(0, Math.min(1, coralKidUpgradeEffect(9, nonDivLevel) / 100));
      const clock = _number(saveData.timeAwayData?.GlobalTime), start = _number(afkStartData[ci]);
      if (clock == null || start == null) throw new Error('Saved AFK start or snapshot time is missing or invalid.');
      result.pendingSeconds = Math.max(0, clock - start);
      result.claim = divinityClaimOutcome({ seconds: result.pendingSeconds, pointsPerHour: result.claimPointsPerHour,
        expPerHour: result.claimExpPerHour, capped: result.capped, hourMultiplier: result.hourMultiplier, tranqiPerHour: result.tranqiPerHour });
    } catch (error) { result.errors.push(error.message); }
    return result;
  });
}

function _total(rows, key) {
  if (!rows.every(row => Number.isFinite(row[key]))) return null;
  const total = rows.reduce((sum, row) => sum + row[key], 0);
  if (!Number.isFinite(total)) throw new Error('Divinity rate total exceeds the supported numeric range.');
  return total;
}

// Owns full loader state; invoke only in an isolated worker or a synchronous test.
export function evaluateCoralDivinityAdvisor(raw) {
  const characters = _characters(raw), baseline = _measure(raw, characters, true);
  const input = coralSpendingInputs(saveData, { rawSave: raw });
  const result = { input, characters: baseline, upgrades: [], errors: [],
    partial: saveData.companionDataAvailable !== true || saveData.activeVoteDataAvailable !== true,
    pointRate: _total(baseline, 'claimPointsPerHour'), expRate: _total(baseline, 'claimExpPerHour') };
  try {
    result.now = singularityTransmute(input);
    result.reserve = singularityPointReserve(input, result.now.spirals);
    result.breakpoints = singularityBreakpoints(input);
    result.offeringPlan = planCoralDivinitySpending(input, { rankTarget: input.rank + 1 });
  } catch (error) { result.errors.push(error.message); }
  const data = raw.data ?? raw, optionKey = Object.hasOwn(data, 'OptionsListAccount') ? 'OptionsListAccount' : 'OptLacc';
  const candidates = input.levels.map((level, index) => ({
    id: 'coral-' + index, index, level, cost: level == null ? null : coralKidUpgradeCost(index, level),
    unlocked: input.activated === true && (index === 0 || input.totalLevels != null && input.totalLevels >= CORAL_KID_UNLOCK_LEVELS[index]),
    patch: { system: 'raw', key: optionKey, path: [427 + index], value: level == null ? null : level + 1 },
  }));
  if (Number.isInteger(input.rank)) candidates.push({ id: 'rank', level: input.rank,
    cost: result.offeringPlan?.rankEstimate?.expectedSpend ?? null, unlocked: true,
    patch: { system: 'raw', key: 'Divinity', path: [25], value: input.rank + 1 } });
  const purchaseMeasurements = new Map();
  for (const candidate of candidates) {
    const row = { ...candidate };
    delete row.patch;
    row.safe = candidate.id === 'rank' ? result.offeringPlan?.offers.some(offer => offer.affordable) === true
      : candidate.unlocked && candidate.cost != null && result.reserve?.available === true
        && input.points >= candidate.cost
        && singularityTransmute({ ...input, points: input.points - candidate.cost }).spirals >= result.now.spirals;
    if (candidate.unlocked && candidate.level != null) {
      try {
        const variant = applyCombatSetup(raw, { charIdx: 0, patches: [candidate.patch] });
        const measured = _measure(variant, characters);
        if (candidate.id !== 'rank') purchaseMeasurements.set(candidate.index, measured);
        row.pointRate = _total(measured, 'claimPointsPerHour');
        row.expRate = _total(measured, 'claimExpPerHour');
        row.classFactorGain = Number.isFinite(measured[0].classFactor) && baseline[0].classFactor > 0
          ? measured[0].classFactor / baseline[0].classFactor - 1 : null;
        row.errors = [...new Set(measured.flatMap(entry => entry.errors))];
        if (measured[0].classFactorError) row.errors.push(measured[0].classFactorError);
      } catch (error) { row.error = error.message; }
    }
    result.upgrades.push(row);
  }
  result.purchaseUpgrades = [];
  for (let index = 0; index < 12; index++) {
    const level = index < 6 ? input.levels[index] : _number(_row(data[optionKey])[616 + index - 6]);
    const gate = index < 6 ? CORAL_KID_UNLOCK_LEVELS[index] : CORAL_KID_SINGULARITY_UNLOCK_LEVELS[index - 6];
    const row = { index, level, cost: Number.isInteger(level) ? coralKidUpgradeCost(index, level) : null,
      currency: index < 6 ? 'points' : 'spirals',
      unlocked: input.activated === true && (index < 6 || input.singularityUnlocked === true)
        && (gate === 0 || input.totalLevels != null && input.totalLevels >= gate) };
    if (row.unlocked && Number.isInteger(level)) {
      try {
        const variant = applyCombatSetup(raw, { charIdx: 0, patches: [
          { system: 'raw', key: optionKey, path: [index < 6 ? 427 + index : 616 + index - 6], value: level + 1 },
        ] });
        const measured = purchaseMeasurements.get(index) ?? _measure(variant, characters);
        row.characters = measured.map(c => ({ ci: c.ci, capped: c.capped,
          pointsPerHour: c.claimPointsPerHour, hourMultiplier: c.hourMultiplier }));
        row.pointRate = _total(measured, 'claimPointsPerHour');
        row.expRate = _total(measured, 'claimExpPerHour');
        row.valueLevel = index === 7 ? level + 1 : input.valueLevel;
        row.effectBefore = coralKidUpgradeEffect(index, level);
        row.effectAfter = coralKidUpgradeEffect(index, level + 1);
        row.errors = [...new Set(measured.flatMap(c => c.errors))];
      } catch (error) { row.error = error.message; }
    }
    result.purchaseUpgrades.push(row);
  }
  result.banking = coralDivinityBankingWeeks(raw);
  result.banking.bonusScenarios = _bankingBonusScenarios(raw, characters, result.banking);
  return result;
}

function _bankingBonusScenarios(raw, characters, weeks) {
  const data = raw.data ?? raw;
  const optionKey = Object.hasOwn(data, 'OptionsListAccount') ? 'OptionsListAccount' : 'OptLacc';
  const merits = [null, ...new Set([...weeks.meritCandidates.map(row => row.id), 9])];
  const ballots = [...new Set([...weeks.ballotCandidates.map(row => row.id), 23])];
  try {
    return merits.map(merit => {
      const variant = merit == null ? raw : applyCombatSetup(raw, { charIdx: 0, patches: [
        { system: 'raw', key: optionKey, path: [453], value: merit },
      ] });
      _loadRaw(variant);
      return { merit, characters: characters.map(({ ci }) => {
        try {
          const activeMerit = _number(optionsListData[453]);
          if (!Number.isInteger(activeMerit)) throw new Error('Saved Merit winner is unavailable.');
          const gate = _row(_row(data['KLA_' + ci])[250])[0];
          if (gate == null || typeof gate === 'string' && !gate.trim() || !Number.isFinite(Number(gate)))
            throw new Error('Saved World 6 portal progress is unavailable.');
          const ctx = createStatContext({ saveData, charIdx: ci });
          const votingMulti = Number(ctx.resolve('voting-multi').val);
          const meritValue = computeMeritocBonusz(activeMerit, saveData, ci);
          if (!Number.isFinite(votingMulti) || !Number.isFinite(meritValue))
            throw new Error('Claim-time bonus exceeds the numeric range.');
          return { ci, meritValue, partial: saveData.companionDataAvailable !== true,
            ballots: ballots.map(id => {
              const value = votingBonusValue(id) * votingMulti;
              if (!Number.isFinite(value)) throw new Error('Claim-time ballot exceeds the numeric range.');
              return { id, value };
            }) };
        } catch (error) { return { ci, error: error.message, meritValue: null, ballots: [] }; }
      }) };
    });
  } finally { _loadRaw(raw); }
}

export function coralDivinityBankingWeeks(raw) {
  const data = raw.data ?? raw;
  const time = typeof data.TimeAway === 'string' ? JSON.parse(data.TimeAway) : data.TimeAway;
  const clock = _number(time?.GlobalTime);
  const errors = [];
  const choices = (key, name, valid) => {
    if (raw.serverVars?.[key] == null) return [];
    try {
      return _row(raw.serverVars[key]).slice(1, 4).map(_number)
        .filter(id => Number.isInteger(id) && valid(id)).map(id => ({ id, name: name(id) }));
    } catch (error) { errors.push('Saved ' + key + ' candidates are malformed: ' + error.message); return []; }
  };
  const boundary = offset => clock == null ? null : 604800 - ((clock + offset) % 604800);
  return { clock, ballotSeconds: boundary(197860), meritSeconds: boundary(543460),
    ballotCandidates: choices('voteCategories', votingBonusName, id => votingBonusValue(id) > 0),
    meritCandidates: choices('voteCat2', meritocBonusName, id => MERITOC_BASE[id] > 0),
    errors, confirmedFutureWinners: false };
}

// Like the advisor, this owns loader state and must run in an isolated worker.
export function evaluateCoralDivinityBanking(raw, options = {}) {
  const characters = _characters(raw), metadata = coralDivinityBankingWeeks(raw);
  const number = (value, name, min, max, integer = false) => {
    const n = _number(value);
    if (n == null || n < min || n > max || integer && !Number.isInteger(n)) throw new Error(name + ' is missing or invalid.');
    return n;
  };
  const seconds = number(options.seconds ?? 0, 'Banking delay', 0, 365 * 86400);
  const horizonHours = number(options.horizonHours ?? 168, 'Future comparison hours', 0, 8760);
  const gapSeconds = number(options.gapSeconds ?? 121, 'Rotating visit gap', 121, 604800, true);
  const killCreditPerHour = number(options.killCreditPerHour ?? 0, 'Fixed active kill credit/hour', 0, Number.MAX_VALUE);
  const killCredit = number(options.killCredit ?? 0, 'Additional kill bank', 0, Number.MAX_VALUE);
  const maxPurchases = number(options.maxPurchases ?? 3, 'Coral purchase search depth', 0, 6, true);
  const orderMaxPurchases = Object.hasOwn(options, 'orderMaxPurchases') ? options.orderMaxPurchases : options.maxPurchases ?? null;
  if (orderMaxPurchases != null) number(orderMaxPurchases, 'Redemption purchase ceiling', 0, Number.MAX_SAFE_INTEGER, true);
  const orderKillCreditPerHour = number(options.orderKillCreditPerHour ?? 0, 'Redemption active kill credit/hour', 0, Number.MAX_VALUE);
  const farmerCi = options.orderFarmer ?? null;
  if (orderKillCreditPerHour > 0 && !characters.some(c => c.ci === farmerCi))
    throw new Error('Select a saved active farmer for the redemption sequence.');
  const orderObjective = options.orderObjective ?? 'points';
  if (!['points', 'spirals'].includes(orderObjective)) throw new Error('Invalid banked-claim objective.');
  const probability = number(options.probability ?? .95, 'Rank success probability', .001, .999999);
  const selected = options.characters ?? characters.map(c => c.ci);
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length
    || selected.some(ci => !characters.some(c => c.ci === ci))) throw new Error('Select unique saved characters to bank.');
  const ballot = options.ballot ?? null, merit = options.merit ?? null;
  if (ballot != null && (!Number.isInteger(ballot) || votingBonusValue(ballot) <= 0)) throw new Error('Invalid ballot scenario.');
  if (merit != null && (!Number.isInteger(merit) || !(MERITOC_BASE[merit] > 0))) throw new Error('Invalid Merit scenario.');
  const data = raw.data ?? raw, optionKey = Object.hasOwn(data, 'OptionsListAccount') ? 'OptionsListAccount' : 'OptLacc';
  let scenarioRaw = raw;
  if (ballot != null) scenarioRaw = { ...scenarioRaw, serverVars: { ...raw.serverVars,
    voteCategories: [ballot, ..._row(raw.serverVars?.voteCategories).slice(1)] } };
  if (merit != null) {
    for (const c of characters.filter(c => selected.includes(c.ci))) {
      const gate = _row(_row(data['KLA_' + c.ci])[250])[0];
      if (gate == null || gate === '' || !Number.isFinite(Number(gate)))
        throw new Error('Claim-time Merit eligibility is unavailable for ' + c.name + ' (saved World 6 portal progress missing).');
    }
    scenarioRaw = applyCombatSetup(scenarioRaw, { charIdx: 0, patches: [
      { system: 'raw', key: optionKey, path: [453], value: merit },
    ] });
  }
  const current = _measure(raw, characters), savedInput = coralSpendingInputs(saveData, { rawSave: raw });
  const measured = _measure(scenarioRaw, characters);
  const input = coralSpendingInputs(saveData, { rawSave: scenarioRaw });
  const chosen = rows => rows.filter(c => selected.includes(c.ci));
  const claimNow = projectDivinityBankClaims(savedInput, chosen(current));
  const sameBonusesLater = projectDivinityBankClaims(savedInput, chosen(current), { seconds, killCredit });
  const forecast = projectDivinityBankClaims(input, chosen(measured), { seconds, killCredit });
  const payout = bank => {
    try { return singularityTransmute(bank); }
    catch (error) { return { spirals: null, reason: error.message }; }
  };
  const target = number(options.rankTarget ?? input.rank + 1, 'God Rank target', input.rank, input.rank + 100, true);
  let rankPlan = null, rankError = null;
  try { rankPlan = godRankConfidencePlan(input, target, probability); }
  catch (error) { rankError = error.message; }
  const rows = [], cache = new Map(), errors = [...new Set([...metadata.errors, ...chosen(measured).flatMap(c => c.errors)])];
  const rateMeasure = (levels, rank, spiral) => {
    const key = JSON.stringify([levels, rank, spiral]);
    if (cache.has(key)) return cache.get(key);
    const patches = levels.flatMap((value, i) => value === input.levels[i] ? [] :
      [{ system: 'raw', key: optionKey, path: [427 + i], value }]);
    if (rank !== input.rank) patches.push({ system: 'raw', key: 'Divinity', path: [25], value: rank });
    if (spiral) patches.push({ system: 'raw', key: optionKey, path: [616 + spiral.index - 6], value: spiral.level });
    const variant = applyCombatSetup(scenarioRaw, { charIdx: 0, patches });
    const result = _measure(variant, characters);
    const compact = { characters: chosen(result), pointRate: _total(chosen(result), 'claimPointsPerHour'),
      expRate: _total(chosen(result), 'claimExpPerHour'), classFactor: chosen(result)[0].classFactor,
      errors: [...new Set(chosen(result).flatMap(c => c.errors))], classFactorError: chosen(result)[0].classFactorError };
    cache.set(key, compact);
    return compact;
  };
  const describe = (state, spiral = null) => {
    const rates = rateMeasure(state.levels, state.rank, spiral);
    const valueLevel = spiral?.index === 7 ? spiral.level : input.valueLevel;
    const immediate = payout({ ...forecast.bank, points: state.points });
    let retained = immediate.spirals;
    if (spiral) retained = retained == null || retained < spiral.cost ? null : Math.round(retained - spiral.cost);
    let futureSpirals = null, futureError = null;
    try {
      const lap = gapSeconds * selected.length, cycles = Math.floor(horizonHours * 3600 / lap);
      const claims = cycles === 0 ? [] : rates.characters.map(c => divinityClaimOutcome({ seconds: lap,
        pointsPerHour: c.claimPointsPerHour, capped: c.capped, hourMultiplier: c.hourMultiplier }));
      if (claims.some(c => c.points == null || c.hours == null)) throw new Error('Future claim inputs are unavailable.');
      const perLap = claims.reduce((sum, c) => {
        const result = singularityTransmute({ points: c.points, hours: c.hours,
          kills: killCreditPerHour * gapSeconds / 3600, valueLevel });
        if (!result.canTransmute) throw new Error('This rotation cannot transmute every claim; choose a longer visit gap.');
        return sum + result.spirals;
      }, 0);
      futureSpirals = cycles * perLap;
      if (!Number.isFinite(futureSpirals)) throw new Error('Future Spiral total exceeds the numeric range.');
    } catch (error) { futureError = error.message; }
    return { ...state, spiral, ...rates, immediateSpirals: immediate.spirals, retainedSpirals: retained,
      spiralLoss: rows[0]?.retainedSpirals == null || retained == null ? null : rows[0].retainedSpirals - retained,
      futureSpirals, totalSpirals: retained == null || futureSpirals == null ? null : retained + futureSpirals,
      futureError, conditional: state.rank !== input.rank };
  };
  const start = { levels: input.levels.slice(), rank: input.rank, points: forecast.bank.points, actions: [], rankBudget: 0 };
  if (forecast.bank.points != null && forecast.bank.hours != null && forecast.bank.kills != null) {
    rows.push(describe(start));
    let beam = [start];
    const seen = new Set(), candidates = [start], limit = 256;
    const eligible = i => input.activated === true && (i === 0 || input.totalLevels >= CORAL_KID_UNLOCK_LEVELS[i]);
    for (let depth = 0; depth < maxPurchases && cache.size < limit; depth++) {
      const expanded = [];
      for (const state of beam) for (let i = 0; i < 6 && cache.size < limit; i++) {
        if (!eligible(i) || !Number.isInteger(state.levels[i])) continue;
        const cost = coralKidUpgradeCost(i, state.levels[i]);
        if (!(cost <= state.points)) continue;
        const next = { ...state, points: state.points - cost, levels: state.levels.slice(),
          actions: [...state.actions, { index: i, level: state.levels[i] + 1, cost }] };
        next.levels[i]++;
        const key = JSON.stringify([next.levels, next.points]);
        if (seen.has(key)) continue;
        seen.add(key);
        expanded.push(describe(next));
        candidates.push(next);
      }
      const leaders = new Set();
      for (const metric of ['totalSpirals', 'pointRate', 'expRate', 'classFactor'])
        for (const reserveRank of [false, true])
          expanded.filter(r => Number.isFinite(r[metric]) && (!reserveRank || rankPlan && r.points >= rankPlan.budget))
            .sort((a, b) => b[metric] - a[metric] || b.points - a.points).slice(0, 2).forEach(r => leaders.add(r));
      beam = [...leaders];
      if (!beam.length) break;
    }
    // Keep each goal's leaders, plus the no-purchase reference.
    const finalists = new Map();
    for (const metric of ['totalSpirals', 'pointRate', 'expRate', 'classFactor'])
      for (const reserveRank of [false, true])
        candidates.map(c => describe(c)).filter(r => Number.isFinite(r[metric]) && (!reserveRank || rankPlan && r.points >= rankPlan.budget))
          .sort((a, b) => b[metric] - a[metric] || b.points - a.points).slice(0, 3)
          .forEach(r => finalists.set(JSON.stringify([r.levels, r.points]), r));
    for (const row of finalists.values()) {
      if (row.actions.length) rows.push(row);
      if (rankPlan?.budget <= row.points && target > input.rank)
        rows.push(describe({ ...row, rank: target, points: row.points - rankPlan.budget, rankBudget: rankPlan.budget }));
    }
    if (rankPlan?.budget <= start.points && target > input.rank
      && !rows.some(r => r.conditional && !r.actions.length))
      rows.push(describe({ ...start, rank: target, points: start.points - rankPlan.budget, rankBudget: rankPlan.budget }));
    const spiralLevels = _row(data[optionKey]);
    for (const state of rows.slice()) for (let i = 6; i < 12; i++) {
      const level = _number(spiralLevels[616 + i - 6]), cost = level == null ? null : coralKidUpgradeCost(i, level);
      if (input.activated !== true || input.singularityUnlocked !== true || !Number.isInteger(level)
        || !(i === 6 || input.totalLevels >= CORAL_KID_SINGULARITY_UNLOCK_LEVELS[i - 6])
        || cost > state.immediateSpirals) continue;
      rows.push(describe(state, { index: i, level: level + 1, cost }));
    }
  }
  const best = {};
  for (const metric of ['totalSpirals', 'pointRate', 'expRate', 'classFactor']) {
    const ranked = rows.filter(r => Number.isFinite(r[metric]) && r.retainedSpirals != null)
      .sort((a, b) => b[metric] - a[metric] || b.retainedSpirals - a.retainedSpirals
        || a.actions.length - b.actions.length || Number(a.conditional) - Number(b.conditional));
    best[metric] = ranked.length ? rows.indexOf(ranked[0]) : null;
  }
  const curves = [current, measured].map(characterRows => Array.from({ length: 33 }, (_, i) => {
    const delay = seconds * i / 32;
    const projection = projectDivinityBankClaims(input, chosen(characterRows), { seconds: delay, killCredit });
    return { seconds: delay, hours: delay / 3600, points: projection.bank.points, ...payout(projection.bank) };
  }));
  let redemption = null, redemptionError = null;
  if (options.order === true) {
    try {
      const savedOptions = _row(data[optionKey]);
      redemption = planDivinityBankRedemption({ ...input,
        levels: [...input.levels, ...Array.from({ length: 6 }, (_, i) => _number(savedOptions[616 + i]))] },
      chosen(measured), { seconds, killCredit, maxPurchases:orderMaxPurchases, objective: orderObjective,
        killCreditPerHour:orderKillCreditPerHour, farmerCi,
        maxElapsedSeconds: Math.max(0, Math.min(...[metadata.ballotSeconds,metadata.meritSeconds].map(reset =>
          reset == null ? 0 : reset > seconds ? reset-seconds : 604800-(seconds-reset)%604800))-1),
        rankPlan: options.orderRank === true ? rankPlan : null,
        rankRisk: true,
        measure: (levels, rank) => {
          const patches = levels.flatMap((value, i) => [{ system: 'raw', key: optionKey,
            path: [i < 6 ? 427 + i : 616 + i - 6], value }]);
          patches.push({ system: 'raw', key: 'Divinity', path: [25], value: rank });
          return chosen(_measure(applyCombatSetup(scenarioRaw, { charIdx: 0, patches }), characters));
        } });
      if (options.orderRank === true && !rankPlan) redemptionError = 'God Rank order unavailable: ' + rankError;
    } catch (error) { redemptionError = error.message; }
    finally { _loadRaw(scenarioRaw); }
  }
  return { metadata, options: { seconds, horizonHours, gapSeconds, killCredit, killCreditPerHour, maxPurchases, probability,
    characters: selected, ballot, merit, rankTarget: target, order: options.order === true,
    orderRank: options.orderRank === true, orderObjective, orderMaxPurchases, orderKillCreditPerHour, orderFarmer:farmerCi,
    orderCombatMap:options.orderCombatMap ?? null, orderCombatMeasured:options.orderCombatMeasured === true,
    orderCombatNotes:options.orderCombatNotes ?? [] }, claimNow, sameBonusesLater, forecast,
    payouts: [payout(claimNow.bank), payout(sameBonusesLater.bank), payout(forecast.bank)],
    rows, best, rankPlan, rankError, errors, evaluated: cache.size, curves,
    redemption, redemptionError,
    partial: saveData.companionDataAvailable !== true || ballot == null && raw.serverVars?.voteCategories == null,
    scope: 'Bounded Coral beam (two leaders per goal plus two retaining rank funding, up to six purchases / 256 ordinary states), then one Spiral purchase. Rates and levels stay fixed after spending; rank benefits are conditional on success.' };
}
