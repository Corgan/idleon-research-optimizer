// ===== ACTIVE COMBAT SIMULATOR — SAVE-DERIVED INPUTS =====
// Resolves every scalar the world/reward side of the active-combat simulator
// needs exactly once per (save, character, map). Each entry is
//   { value, source, partial?, unavailable?, default?, note? }
// so the UI can show provenance. Runtime-only values that are not stored in a
// save are explicit `unavailable` entries carrying a documented default.
//
// Pure: never mutates saveData. Mutable save structures used by the sim
// (inventory, Cards0, KLA, OLA counters, RoyalG marble streak) are deep-copied
// into `values.state` and the sim mutates only those copies.

import { createStatContext } from '../../stat-context.js';
import { buildCombatStatBreakdowns } from './combat-sim-breakdowns.js';
import * as D from '../../../save/data.js';
import { saveData as sharedSaveData } from '../../../state.js';
import { currentTermScope, withTermScope } from '../../term-overrides.js';
import { MONSTERS } from '../../data/game/monsters.js';
import { ITEMS } from '../../data/game/items.js';
import { combatTarget, effectiveMonsterHP, effectiveRespawnTime, actionWaitTimeAfk, computeHitChance, autoRespawnTime, healthFoodHealingPerHour } from './combat-outcomes.js';
import { computeOverkillActive, computeMultiKillBase, computeMultiKillPerTier } from './overkill.js';
import { computeFamBonusQTYs, computeCardBonusByType, computeBoxReward, computeStatueBonusGiven, computeTotalStat } from './stats.js';
import { computeCardSetBonus } from './cards.js';
import { vaultUpgBonus } from './vault.js';
import { computeStarSignBonus } from './starSign.js';
import { achieveStatus } from './achievement.js';
import { talent } from './talent.js';
import { computeShrine } from '../w3/construction.js';
import { computePrayerReal } from '../w3/prayer.js';
import { getBribeBonus } from '../w3/bribe.js';
import { sigilBonus, computeVialByKey, finalBubbleValByKey } from '../w2/alchemy.js';
import { computeChipBonus } from '../w4/lab.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { activeMarbleDropChance, marbleDropChance, outpostIsPurified, orbletBonus, statueFlairMultiplier } from '../w7/royal-guardian.js';
import { rogBonusQTY } from '../w7/sushi.js';
import { jellyRewardBonus } from '../../data/w7/jelly-operator.js';
import { eventShopOwned, emporiumBonus } from '../../../game-helpers.js';
import { computeMaxCapacity } from './carry-capacity.js';
import { arcaneUpgBonus } from '../mc/tesseract.js';
import { computePaletteBonus, computeBigFishBonus, shopUpgBonus } from '../w7/spelunking.js';
import { parchmentDropChance, parchmentDoubleChance, armoryBonus, XtraClearKillz } from '../w7/royal-guardian.js';
import { royalMapEligible } from '../../data/w7/royal-guardian.js';
import { holesBolaiaPerLv } from '../../data/w5/hole.js';
import { computeDivinityMinor } from '../w5/divinity.js';
import { maxTalentBonus } from './talent.js';
import { gridBonusFinal } from '../../defs/helpers.js';
import { GodsInfo, ZenithMarket, TaskShopDesc, RANDOlist, DeathNoteMobs } from '../../data/game/customlists.js';
import { computeCompassBonus } from '../w7/compass.js';
import { arcadeBonus } from '../w2/arcade.js';
import { MOB_SPRITES, PLAYER_ANIMS } from '../../data/game/combat-sprites.js';
import { etcBonus } from './etcBonus.js';
import { mainframeBonus } from '../w4/lab.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { createFishingEvaluator } from '../w2/fishing.js';
import { wraithStats, tempestStats, arcanistStats, ratDmg, ratResp, grimoireBonesDropDEC, windwalkerExtraDust, arcaneExtraTachyon } from './combat-forms.js';
import { computeKillroyBonus } from '../w4/rift.js';
import { computeButtonBonus } from '../w7/minehead.js';
import { companionBonusForSave } from '../../data/common/companions.js';
import { computeCardLv } from './cards.js';
import { pristineBon } from '../w5/pristine.js';
import { computeLoreEpisodeBonus } from '../w7/spelunking.js';
import { computeEmperorBon } from '../w6/emperor.js';
import { computeExoticBonus } from '../w6/farming.js';
import { computeGambitBonus, computeBUpg } from '../w5/hole.js';
import { respawnBonus as cglunkoRespawnBonus, withCglunkoLevels, UPGRADE_COUNT as CGLUNKO_UPGRADES } from '../w5/cglunko.js';
import { grimoireUpgBonus } from '../mc/grimoire.js';
import { GrimoireUpg } from '../../data/game/customlists.js';
import { combatProgressInputs } from './combat-sim-progress.js';
import { sideJellyUnlocked, obolAutoTrashRate } from '../w7/menagerie.js';

export const CRYSTAL_SPAWN_CAP_DEFAULT = 0.1;

// Loader assignments replace these arrays. Retain the run's bindings rather
// than consulting whichever save a later refresh/another simulation loaded.
export function captureCombatInputState(S) {
  const data = {};
  for (const [key, value] of Object.entries(D)) if (typeof value !== 'function') data[key] = value;
  return { save: { ...S }, data, termScope: currentTermScope() };
}

export function buildLiveLevelInputs(captured, ci, map, opts, level, exp, runtime = {}) {
  const S = { ...captured.save, lv0AllData: (captured.save.lv0AllData || []).slice(),
    exp0AllData: (captured.save.exp0AllData || []).slice() };
  S.lv0AllData[ci] = (S.lv0AllData[ci] || []).slice();
  S.lv0AllData[ci][0] = level;
  S.exp0AllData[ci] = (S.exp0AllData[ci] || []).slice();
  S.exp0AllData[ci][0] = exp;
  const data = { ...captured.data, buffsActiveData: (captured.data.buffsActiveData || []).slice() };
  if (runtime.buffs) data.buffsActiveData[ci] = runtime.buffs.map(b => b.slice());
  if (runtime.food) {
    data.equipOrderData = (data.equipOrderData || []).slice();
    data.equipQtyData = (data.equipQtyData || []).slice();
    data.equipOrderData[ci] = (data.equipOrderData[ci] || []).slice();
    data.equipQtyData[ci] = (data.equipQtyData[ci] || []).slice();
    data.equipOrderData[ci][2] = runtime.food.order.slice(0, runtime.food.count);
    data.equipQtyData[ci][2] = runtime.food.qty.slice(0, runtime.food.count);
  }
  const previousSave = { ...sharedSaveData }, previousData = {};
  for (const key of Object.keys(data)) previousData[key] = D[key];
  try {
    Object.assign(sharedSaveData, S);
    D.assignSaveData(data);
    return withTermScope(captured.termScope, () => buildCombatInputs(S, ci, map, { ...opts, live: true }));
  } finally {
    D.assignSaveData(previousData);
    Object.assign(sharedSaveData, previousSave);
  }
}

function _num(x) {
  if (x && typeof x === 'object') return Number(x.val ?? x.value ?? 0) || 0;
  return Number(x) || 0;
}

function _raw(raw, key) {
  if (!raw) return undefined;
  const v = raw.data?.[key] ?? raw[key];
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('{') || t.startsWith('[')) { try { return JSON.parse(t); } catch { return v; } }
  }
  return v;
}

function _clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function _childVal(node, name) {
  const kids = node?.children || [];
  for (const k of kids) if (k && (k.name === name || String(k.name || '').includes(name))) return Number(k.val) || 0;
  return null;
}

// Talent GetTalentNumber(tab, id) for the selected character.
function _talent(saveData, charIdx, tab, id) {
  return _num(talent.resolve(id, { saveData, charIdx }, { tab }));
}

// Divinity("Bonus_Minor", -1, style) for styles other than 3/5 (src Divinity):
// sums DivMinorBonus over every character whose linked god (Divinity[s+12]) has
// GodsInfo[god][13] == style.
function _divMinorAccount(S, style) {
  const div = D.divinityData || [];
  const n = Math.min(12, Number(D.numCharacters) || 0);
  let total = 0;
  for (let s = 0; s < n; s++) {
    const g = Number(div[s + 12]);
    if (!(g >= 0) || Number(GodsInfo[g]?.[13]) !== style) continue;
    total += _num(computeDivinityMinor(s, style, S));
  }
  return total;
}

/**
 * buildCombatInputs(saveData, charIdx, mapIdx, { rawSave, ctx, overrides })
 * Returns { entries, values, target, ok }.
 *   entries[key] = { value, source, partial?, unavailable?, default?, note? }
 *   values[key]  = the plain value (fast path for the hot loop)
 *   values.state = deep copies of mutable save structures
 * overrides.holeCavern also reaches ctx.holeCavern (Cove DR/Multikill gates);
 * overrides.coveUpgrades (24 levels, OLA[630..653]) replaces Cglunko upgrade
 * levels for every consumer evaluated during the build.
 */
export function buildCombatInputs(saveData, charIdx, mapIdx, opts = {}) {
  const build = () => _withStartBuffs(charIdx, opts, () => _buildCombatInputs(saveData, charIdx, mapIdx, opts));
  const cove = opts.overrides?.coveUpgrades;
  if (Array.isArray(cove)) return withCglunkoLevels(cove, build);
  return build();
}

// Permanent form toggles: the only AddBuffType(id, 999999999) callers (Wraith/Tempest/Arcanist).
const FORM_TOGGLE_BUFFS = new Set([195, 420, 585]);

// A sim starts as a fresh map entry. Scene init clears DNSM.TotStatMAP (src
// ActorEvents init), so cached TotalStats/DamageDealed read GetBuffBonuses from
// whatever BuffsActive holds at entry; AddBuffType never clears that cache.
// BuffsActive_X is an export-time snapshot, so unless overrides.useSavedBuffs is
// set, every timed buff is removed while the inputs (including those cached
// stats) are built, keeping only the permanent form toggles.
function _withStartBuffs(charIdx, opts, fn) {
  const ci = Number(charIdx) || 0;
  const all = D.buffsActiveData;
  const saved = Array.isArray(all) ? all[ci] : undefined;
  if (opts.live || opts.overrides?.useSavedBuffs || !Array.isArray(saved)) return fn(saved);
  const kept = saved.filter((b) => FORM_TOGGLE_BUFFS.has(Number(b?.[0])));
  if (kept.length === saved.length) return fn(saved);
  all[ci] = kept;
  try { return fn(saved); } finally { all[ci] = saved; }
}

function _buildCombatInputs(saveData, charIdx, mapIdx, opts) {
  const ci = Number(charIdx) || 0;
  const map = Number(mapIdx) || 0;
  const raw = opts.rawSave || null;
  const overrides = opts.overrides || {};
  const entries = {};
  const values = {};
  let ctx = opts.ctx || null;
  const layer1 = { activeCombat: true };
  if (overrides.holeCavern != null) layer1.holeCavern = Number(overrides.holeCavern);
  try { ctx = ctx || createStatContext({ charIdx: ci, mapIdx: map, saveData, layer1 }); } catch (err) { ctx = null; }
  const S = saveData || {};
  const ola = D.optionsListData || S.optionsListData || [];

  function put(key, fn, source, extra = {}) {
    let entry;
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      entry = { value: overrides[key], source: 'override', overridden: true };
    } else {
      try {
        const v = fn();
        entry = { value: v, source, ...extra };
        if (typeof v === 'number' && !Number.isFinite(v)) entry = { value: extra.default ?? 0, source, partial: true, note: 'non-finite result' };
      } catch (err) {
        entry = { value: extra.default ?? 0, source, partial: true, note: 'resolver failed: ' + (err?.message || err) };
      }
    }
    entries[key] = entry;
    values[key] = entry.value;
    return entry.value;
  }
  function unavailable(key, def, source, note) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      entries[key] = { value: overrides[key], source: 'override', overridden: true };
    } else {
      entries[key] = { value: def, source, unavailable: true, default: def, note };
    }
    values[key] = entries[key].value;
    return values[key];
  }
  function notApplicable(key, def, source, note) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      entries[key] = { value: overrides[key], source: 'override', overridden: true };
    } else {
      entries[key] = { value: def, source, notApplicable: true, note };
    }
    values[key] = entries[key].value;
    return values[key];
  }
  function resolveId(id) {
    if (!ctx) throw new Error('stat context unavailable');
    return ctx.resolve(id);
  }

  // ---------------------------------------------------------------------------
  // Character / map identity
  // ---------------------------------------------------------------------------
  put('charClass', () => Number(D.charClassData?.[ci]) || 0, 'CharacterClass_X');
  put('level', () => Number(S.lv0AllData?.[ci]?.[0]) || 0, 'Lv0_X[0]');
  put('levelUpGiftChance', () => _num(finalBubbleValByKey('LevelUpACTIVE', ci, S)) / 100, 'DNSM.AlchBubbles.LevelUpACTIVE / 100 (src 76826)');
  unavailable('levelUpGiftCount', 0, 'OptionsList[32]', 'session-local level-up gift counter is not exported; starts at zero');
  put('levelUpStampA23', () => Number(D.stampLvData?.[0]?.[22]) || 0, 'StampLevel[0][22]');
  put('levelUpStampC9', () => Number(D.stampLvData?.[2]?.[8]) || 0, 'StampLevel[2][8]');
  if (!opts.live) put('combatProgress', () => combatProgressInputs(S, ci, key => _raw(raw, key)),
    'ForgeItemOrder/ForgeItemQty/ForgeIntProg, Pets/Breeding, Menagerie; native combat progress');
  unavailable('otherPlayersCount', 0, 'OtherPlayers', 'Nearby players are not exported; used by Scurge EXP upgrades.');
  const target = (() => { try { return combatTarget(S, ci, map); } catch { return null; } })();
  put('afkTarget', () => target?.key || '', 'MapAFKtarget (combatTarget)');

  // ---------------------------------------------------------------------------
  // Per-scene def rescaling (MonsterRespawnTimeReset, src 74344)
  // The target summary is separate from each definition's respawn-list divisor.
  // ---------------------------------------------------------------------------
  const respawnDetail = { note: 'target-only summary; the sim rescales each def by respawnBonusPct (per-list, as the source does)' };
  put('respawnRescale', () => {
    const r = effectiveRespawnTime(ci, ctx, target);
    if (opts.statBreakdowns) respawnDetail.breakdown = {
      name: 'Shared respawn bonus', val: r.commonBonusPct, fmt: '%', children: r.commonSources,
      note: 'Common sources only. The per-definition table adds the native world-list terms.',
    };
    const base = Number(r?.base ?? target?.monster?.RespawnTime) || 0;
    return base > 0 ? _num(r) / base : 1;
  }, 'effectiveRespawnTime(val/base)', respawnDetail);
  // MonsterRespawnTimeReset (src 74353): the divisor is chosen per DEF by list
  // membership (RANDOlist[0]/[1]/[15], DeathNoteMobs[3..6], caveB/C/D), in that
  // if-else order — not by the current map. Unlisted defs (crystals, bosses,
  // specials) keep their raw RespawnTime. Value: { type: bonusPct }.
  const respawnTrees = opts.statBreakdowns ? {} : null;
  put('respawnBonusPct', () => {
    const out = {};
    if (!(S.tasksGlobalData?.length)) return out;
    const r = effectiveRespawnTime(ci, ctx, target);
    const common = Number(r?.commonBonusPct) || 0;
    const tk = (w) => Number(S.tasksGlobalData?.[2]?.[w]?.[1]) || 0;
    const tsd = (w) => Number(TaskShopDesc[w]?.[1]?.[11]) || 0;
    const a44 = achieveStatus(44, S), a109 = achieveStatus(109, S), a308 = achieveStatus(308, S);
    const lists = [
      [RANDOlist[0], common + a44 + tsd(0) * tk(0)],
      [RANDOlist[1], common + a109 + tsd(1) * tk(1)],
      [RANDOlist[15], common + tsd(2) * tk(2)],
      [DeathNoteMobs[3], common + tsd(3) * tk(3)],
      [DeathNoteMobs[4], common + 2 * a308 + tsd(4) * tk(4)],
      [DeathNoteMobs[5], common + 2 * a308 + tsd(5) * tk(5)],
    ];
    const commonTree = respawnTrees && { name: 'Shared respawn bonus', val: common, fmt: '%', children: r.commonSources };
    for (let world = 0; world < lists.length; world++) {
      const [list, pct] = lists[world];
      const tree = respawnTrees && { name: 'W' + (world + 1) + ' respawn bonus', val: pct, fmt: '%', children: [
        commonTree,
        { name: 'World achievement bonus', val: world === 0 ? a44 : world === 1 ? a109 : world >= 4 ? 2 * a308 : 0, fmt: '%' },
        { name: 'World merit respawn', val: tsd(world) * tk(world), fmt: '%' },
      ], note: 'Sum of shared, achievement and merit terms in native order.' };
      for (const t of list || []) if (!(t in out)) {
        out[t] = pct;
        if (respawnTrees) respawnTrees[t] = tree;
      }
    }
    if (!('caveB' in out)) {
      out.caveB = common + a44 + tsd(0) * tk(4); // source reads Tasks[2][4][1] here
      if (respawnTrees) respawnTrees.caveB = { name: 'Grotto respawn bonus', val: out.caveB, fmt: '%', children: [
        commonTree, { name: 'W1 achievement bonus', val: a44, fmt: '%' },
        { name: 'W5 merit level at W1 coefficient', val: tsd(0) * tk(4), fmt: '%' },
      ], note: 'Native Grotto merit-index quirk.' };
    }
    // The caveC branch (TempleTorchBonuses(2,0) + common) is dead: the later
    // caveD branch writes into MonsterDefinitionsGET.caveC instead of caveD,
    // and caveD follows caveC in Object.keys order. Final caveC RespawnTime is
    // caveD's base / (1 + (Cglunko_Respawn + B_UPG(100,25))/100) — getDef
    // reads that base through RESPAWN_BASE_ALIAS — while caveD keeps its raw value.
    if (!('caveC' in out)) {
      const cove = _num(cglunkoRespawnBonus(S)), cavern = computeBUpg(100, 25, S);
      out.caveC = cove + cavern;
      if (respawnTrees) respawnTrees.caveC = { name: 'Temple respawn bonus', val: out.caveC, fmt: '%', children: [
        { name: 'Cove respawn upgrade', val: cove, fmt: '%' }, { name: 'Cavern respawn upgrade', val: cavern, fmt: '%' },
      ], note: 'The native Cove branch overwrites the Temple definition; shared bonuses are replaced.' };
    }
    if (Array.isArray(S.spelunkData) && S.spelunkData.length) {
      const bigFish = _num(computeBigFishBonus(0, S)), merit = tsd(6) * tk(6);
      const w7 = 0.65 * (common + 2 * a308) + (bigFish + merit);
      const tree = respawnTrees && { name: 'W7 respawn bonus', val: w7, fmt: '%', children: [
        { name: 'Scaled shared and achievement bonus', val: 0.65 * (common + 2 * a308), fmt: '%', children: [
          { name: 'Shared plus achievement', val: common + 2 * a308, fmt: '%', children: [
            commonTree, { name: 'World achievement bonus', val: 2 * a308, fmt: '%' },
          ] }, { name: 'W7 scaling', val: 0.65, fmt: 'x' },
        ], note: 'Shared plus achievement bonus multiplied by 0.65.' },
        { name: 'Spelunking and merit bonus', val: bigFish + merit, fmt: '%', children: [
          { name: 'Spelunking Big Fish respawn', val: bigFish, fmt: '%' }, { name: 'W7 merit respawn', val: merit, fmt: '%' },
        ] },
      ] };
      for (const t of DeathNoteMobs[6] || []) if (!(t in out)) {
        out[t] = w7;
        if (respawnTrees) respawnTrees[t] = tree;
      }
    }
    return out;
  }, 'MonsterRespawnTimeReset per-list divisors (src 74353)', {
    ...(respawnTrees ? { breakdowns: respawnTrees } : {}),
    note: 'caveC uses caveD\'s base with the Cglunko divisor (source caveD branch writes caveC); caveD stays raw. riftAll and the Vain-portal NONdummies[55] term are not rescaled; fm_rat uses ratRespawnSeconds',
  });
  put('ratRespawnSeconds', () => (Array.isArray(S.royalGData) && S.royalGData.length ? ratResp(S) : null),
    'MonsterRespawnTimeReset fm_rat (src 74353) = RoyalG("RatResp") when RoyalG is nonempty (src 92955)');
  put('monsterHpRescale', () => {
    const r = effectiveMonsterHP(ci, ctx, target);
    const base = Number(r?.base ?? target?.monster?.MonsterHPTotal) || 0;
    return base > 0 ? _num(r) / base : 1;
  }, 'effectiveMonsterHP(val/base)');

  // ---------------------------------------------------------------------------
  // Drop side
  // ---------------------------------------------------------------------------
  put('dropRate', () => _num(resolveId('drop-rate')), 'TotalStats("Drop_Rarity") via drop-rate descriptor');
  put('monsterCash', () => _num(resolveId('coin-multi')), 'ArbitraryCode("MonsterCash") via coin-multi descriptor');
  put('cardChanceMulti', () => _num(resolveId('card-drop-chance-multiplier')), 'ArbitraryCode("CardChanceMulti")');
  put('talent29', () => _talent(S, ci, 1, 29), 'GetTalentNumber(1,29) (DropTable row bonus)');
  put('bribe1', () => _num(getBribeBonus('1', S)), 'GetBribeBonus("1")');
  put('bribe8', () => _num(getBribeBonus('8', S)), 'GetBribeBonus("8")');
  put('multikillTotal', () => _num(resolveId('multikill-total')), 'MultiKillTOTAL via multikill-total descriptor');
  put('overkillActive', () => {
    const hp = target?.monster ? _num(effectiveMonsterHP(ci, ctx, target)) : 0;
    const r = computeOverkillActive(ci, ctx, { mapIdx: map, monsterHP: hp, afkTarget: target?.key });
    return r?.active ? 1 : 0;
  }, 'computeOverkillActive(...).active (monsterHP passed explicitly)', { note: 'player module should refresh with its live max damage' });
  put('filterSlots', () => {
    const es = S.cachedEventShopStr;
    const bonF = Number(S.bundlesData?.bon_f) === 1 ? 1 : 0;
    return Math.min(144, Math.round(16 * eventShopOwned(8, es) + 16 * eventShopOwned(17, es) + 32 * bonF + 64));
  }, 'Thingies("Filterslots") src 91952');
  put('printerFilter', () => {
    const px = _raw(raw, 'PrinterXtra');
    if (!Array.isArray(px)) throw new Error('PrinterXtra missing (pass rawSave)');
    const out = [];
    for (let k = 0; k < values.filterSlots; k++) out.push(px[120 + k] ?? null);
    return out;
  }, 'PrinterXtra[120+k]', { default: [] });
  put('printerSampleSize', () => _num(resolveId('printer-sample-size')), 'printer-sample-size (informational)');

  // ---------------------------------------------------------------------------
  // EXP side (AE1 KILL ~1226)
  // ---------------------------------------------------------------------------
  const expDetail = { note: 'descriptor resolved for ExpType 0 (combat)' };
  put('expMulti', () => {
    const node = resolveId('monster-exp');
    expDetail.breakdown = _clone({ ...node, fmt: 'x' });
    expDetail.partial = !!node.partial;
    if (node.reason) expDetail.note = node.reason;
    return _num(node);
  }, 'ExpMulti(ExpType) via monster-exp descriptor', expDetail);
  put('fam40', () => Number(computeFamBonusQTYs(ci, S)?.[40]) || 0, 'DNSM.FamBonusQTYs[40]');
  put('card20', () => _num(computeCardBonusByType(20, ci, S)), 'CardBonusREAL(20)');
  put('vault39', () => _num(vaultUpgBonus(39, S)), 'VaultUpgBonus(39)');
  put('vault43', () => _num(vaultUpgBonus(43, S)), 'VaultUpgBonus(43) (KLA multiplier)');
  put('expActive', () => _num(computeStarSignBonus('ExpActive', ci, S)), 'StarSigns.ExpActive');
  put('shrine6', () => _num(computeShrine(6, S, map)), 'Shrine(6) (map-gated: Moai Head, same map, or Shrine World Tour)');
  put('ringDrop', () => _num(computeStarSignBonus('RingDrop', ci, S)), 'StarSigns.RingDrop');
  put('talent318_2', () => _talent(S, ci, 2, 318), 'GetTalentNumber(2,318) plunder EXP/drop');
  put('talent318_1', () => _talent(S, ci, 1, 318), 'GetTalentNumber(1,318) plunder HP');
  put('talent319_1', () => _talent(S, ci, 1, 319), 'GetTalentNumber(1,319)');
  put('talent498_1', () => _talent(S, ci, 1, 498), 'GetTalentNumber(1,498) wormhole');
  put('talent280_1', () => _talent(S, ci, 1, 280), 'GetTalentNumber(1,280) forge roll');
  put('talent362_1', () => _talent(S, ci, 1, 362), 'GetTalentNumber(1,362)');
  put('talent529_1', () => _talent(S, ci, 1, 529), 'GetTalentNumber(1,529) raise-dead distance');
  put('talent468_2', () => _talent(S, ci, 2, 468), 'GetTalentNumber(2,468)');
  put('talent468Level', () => Number(D.skillLvData?.[ci]?.[468]) || 0, 'SkillLevels[468]');
  put('talent41_2', () => _talent(S, ci, 2, 41), 'GetTalentNumber(2,41) (KilledMonsterType Crystal randInt(1,9) gate)');
  put('talent627_1', () => _talent(S, ci, 1, 627), 'GetTalentNumber(1,627) (KilledMonsterType kill heal % of max HP)');

  // ---------------------------------------------------------------------------
  // Kill counters (MonsterKill)
  // ---------------------------------------------------------------------------
  put('killPerKill', () => _num(resolveId('kill-per-kill')), 'ArbitraryCode("KillPerKill")');
  // Live KillPerKill decomposition: KPK = chain * (1 + (addNoMK [+ MultiKillTOTAL])/100).
  // MultiKillTOTAL and OverkillStuffs(3) depend on DamageDealed("Max") and
  // PlayerAccTot, so the rewards module re-evaluates them on every kill.
  put('kpkParts', () => {
    const node = resolveId('kill-per-kill');
    const kids = Array.isArray(node?.children) ? node.children : [];
    const pool = kids.find((c) => c.name === 'Additive KpK Pool');
    if (!pool) throw new Error('kill-per-kill additive pool missing');
    let chain = 1;
    for (const c of kids) if (c !== pool) chain *= Number(c.val) || 0;
    const mk = (pool.children || []).find((c) => c.name === 'MultiKill TOTAL');
    const addNoMK = (Number(pool.val) - 1) * 100 - (Number(mk?.val) || 0);
    return { chain, addNoMK };
  }, 'kill-per-kill descriptor children (chain product, additive pool without MultiKillTOTAL)', { default: null });
  put('multiKillBase', () => _num(computeMultiKillBase(ci, ctx, { mapIdx: map })), 'WorkbenchStuff("MultiKill_base")');
  put('multiKillPerTier', () => _num(computeMultiKillPerTier(ci, ctx, { mapIdx: map })), 'WorkbenchStuff("MultiKill_perTier")');
  put('towerInfo2', () => Number(S.towerData?.[2]) || 0, 'TowerInfo[2] (OverkillStuffs(3) gate)');
  put('overkillExponent', () => (map >= 300 ? 5 : 2), 'DNSM.OverkillEXPONENT');
  put('multiKillPlay', () => _num(computeVialByKey('MultiKillPlay', S, ci)), 'DNSM.AlchVials.MultiKillPlay');

  // ---------------------------------------------------------------------------
  // Crystal / giant / plunder spawning
  // ---------------------------------------------------------------------------
  let csNode = null;
  try { csNode = resolveId('crystal-spawn'); } catch { csNode = null; }
  put('crystalSpawnRaw', () => {
    const raw2000 = _childVal(csNode, '÷ 2000');
    if (raw2000 == null) throw new Error('crystal-spawn raw child missing');
    return raw2000;
  }, 'ArbitraryCode("CrystalSpawn") uncapped (crystal-spawn child "÷ 2000")', { note: 'descriptor .val is capped; MonsterKill compares min(CrystalSpawnCAP, raw) > rand. crystalmob_DropMulti is CrystalEmbiggener for Crystal* types, else 1' });
  put('crystalSpawnCap', () => CRYSTAL_SPAWN_CAP_DEFAULT, 'ArbitraryCode("CrystalSpawnCAP") src 65948 (constant .1)');
  put('crystalEmbiggener', () => {
    const v = _childVal(csNode, 'Crystal Embiggener');
    if (v == null) throw new Error('Embiggener child missing');
    return v;
  }, 'ArbitraryCode("CrystalEmbiggener")', { default: 1 });
  put('guaranteedCrystalMobs', () => Math.ceil(
    (1 + _num(computeMeritocBonusz(15, S, ci)) / 100)
    * (1 + _num(legendPTSbonus(37, S)) / 100)
    * (_num(sigilBonus(7, S, ci)) + (Number(S.tasksGlobalData?.[2]?.[3]?.[0]) + 4 * _num(achieveStatus(285, S))))), 'Thingies("GuaranteedCrystalMobs") src 91952');
  put('chipCrys', () => _num(computeChipBonus('crys', ci)), 'chipBonuses("crys") (crystal-kill respawn chance %)');
  put('giantMob', () => _num(resolveId('giant-mob')), 'ArbitraryCode("GiantMob")');
  put('giantsActive', () => _num(finalBubbleValByKey('GiantsACTIVE', ci, S)), 'AlchBubbles.GiantsACTIVE');
  put('prayer18', () => _num(computePrayerReal(18, 0, ci, S)), 'prayersReal(18,0) (giant → crystals)');
  // Effective per-kill chance: src 67183 gates the roll on CharacterClass==16,
  // non-Crystal target, Armory 41 owned, RoyalG[3][1]==0 and RoyalMaps[map].length>2.
  put('marbleDropChance', () => {
    const rg = S.royalGData || [];
    const eligible = Number(D.charClassData?.[ci]) === 16 && Number(rg?.[2]?.[41]) >= 1
      && Number(rg?.[3]?.[1]) === 0 && (S.royalMapsData?.[map] || []).length > 2;
    return eligible ? _num(activeMarbleDropChance(S, Math.floor(map / 50))) : 0;
  }, 'class 16 + Armory 41 + RoyalG[3][1]==0 + RoyalMaps[map].length>2 gates × RoyalG("MarbleDrop") × max(1,100-RoyalG[3][5])');
  // The sim multiplies the base by its live max(1, 100 - RoyalG[3][5]) copy, which
  // the source re-reads (and the marble drop increments) on every kill.
  put('marbleDrop', () => _num(marbleDropChance(S, Math.floor(map / 50))), 'RoyalG("MarbleDrop", floor(map/50)) src 92957 (without the streak factor)');

  // ---------------------------------------------------------------------------
  // Loot table reset inputs (LootDropOddsReset src 74357)
  // ---------------------------------------------------------------------------
  put('tasksObol', () => Number(S.tasksGlobalData?.[2]?.[1]?.[0]) || 0, 'Tasks[2][1][0] (obol insertion)');
  put('emporium4', () => emporiumBonus(4, D.ninjaData?.[102]?.[9] ?? S.ninjaData?.[102]?.[9]), 'Ninja EmporiumBonus(4)');
  put('emporium7', () => emporiumBonus(7, D.ninjaData?.[102]?.[9] ?? S.ninjaData?.[102]?.[9]), 'Ninja EmporiumBonus(7) (MonsterKill Ninja[105] Emporium kill counter)');
  put('ninja106', () => _clone(S.ninjaData?.[106] || D.ninjaData?.[106] || []), 'Ninja[106]');
  put('anvilCraftStatus', () => { const v = _raw(raw, 'AnvilCraftStatus'); if (!Array.isArray(v)) throw new Error('AnvilCraftStatus missing (pass rawSave)'); return v; }, 'AnvilCraftStatus', { default: [] });
  put('stampLevelMax', () => { const v = _raw(raw, 'StampLvM'); if (!Array.isArray(v)) throw new Error('StampLvM missing (pass rawSave)'); return v; }, 'StampLvM', { default: [] });
  put('invStorageUsed', () => { const v = _raw(raw, 'InvStorageUsed'); if (!v || typeof v !== 'object') throw new Error('InvStorageUsed missing (pass rawSave)'); return v; }, 'InvStorageUsed', { default: {} });
  put('skillLevelsMax', () => { const v = D.skillLvMaxData?.[ci]; if (!v) throw new Error('SM_X missing'); return v; }, 'SM_X (SkillLevelsMAX)', { default: [] });
  put('kla100', () => Number(D.klaData?.[ci]?.[100]?.[0]) || 0, 'KillsLeft2Advance[100][0]');

  // ---------------------------------------------------------------------------
  // Auto loot / inventory (AE44)
  // ---------------------------------------------------------------------------
  put('bunI', () => Number(S.bundlesData?.bun_i) === 1 ? 1 : 0, 'BundlesReceived.bun_i');
  put('bonK', () => Number(S.bundlesData?.bon_k) === 1 ? 1 : 0, 'BundlesReceived.bon_k');
  put('ola83', () => Number(ola[83]) || 0, 'OptionsListAccount[83] (auto-loot off toggle)');
  values.autoLootEnabled = values.bunI === 1 && values.ola83 === 0;
  entries.autoLootEnabled = { value: values.autoLootEnabled, source: 'bun_i==1 && OLA[83]==0' };
  put('inventorySlotsOwned', () => {
    const es = S.cachedEventShopStr;
    const bonF = Number(S.bundlesData?.bon_f) === 1 ? 1 : 0;
    const bonX = Number(S.bundlesData?.bon_x) === 1 ? 1 : 0;
    const bonY = Number(S.bundlesData?.bon_y) === 1 ? 1 : 0;
    const bags = _raw(raw, 'InvBagsUsed_' + ci);
    if (!bags || typeof bags !== 'object') throw new Error('InvBagsUsed_X missing (pass rawSave)');
    let n = 16 + Math.round(3 * eventShopOwned(12, es) + (8 * bonF + (15 * bonX + (19 * bonY + 2 * eventShopOwned(59, es)))));
    for (const k of Object.keys(bags)) n += Number(bags[k]) || 0;
    if (Number(S.bundlesData?.bun_i) === 1) n += 5; // saved bundle, not the auto-loot toggle
    return Math.min(112, Math.round(n));
  }, 'InventorySlotsOwned (ExtraInventory = round(3·ES12 + 8·bon_f + 15·bon_x + 19·bon_y + 2·ES59))', { default: 16 });
  put('inventory', () => {
    const inv = S.itemQuantityData?.inventories?.[ci];
    if (!inv?.available) throw new Error('InventoryOrder_X/ItemQTY_X unavailable');
    return { order: inv.order.slice(), quantity: inv.quantity.map((q) => Number(q) || 0) };
  }, 'InventoryOrder_X + ItemQTY_X', { default: { order: [], quantity: [] } });
  values.inventoryUsed = (values.inventory?.order || []).slice(0, values.inventorySlotsOwned).filter((n) => n && n !== 'Blank' && n !== 'LockedInvSpace').length;
  entries.inventoryUsed = { value: values.inventoryUsed, source: 'derived occupancy' };
  // Calculator-only what-if: pickups that find no slot go to a virtual overflow
  // instead of failing (ItemPickupInTheFirstPlace full-bag branch never runs).
  put('unlimitedInventory', () => false, 'Calculator option (not a game value): treat the bag and obol pages as having unlimited Blank slots');
  // MaxCapacity(typeGen) for the carry-capacity categories (AE44 init "MaxCap").
  // Other typeGens use the fixed source branches in maxCapacityFor().
  put('maxCapacity', () => {
    const out = {};
    for (const t of CAPACITY_TYPES) out[t] = _num(computeMaxCapacity(S, ci, t, ctx));
    return out;
  }, 'MaxCapacity(typeGen) via computeMaxCapacity', { default: {} });

  // ---------------------------------------------------------------------------
  // Quests, cards, OLA counters
  // ---------------------------------------------------------------------------
  put('questComplete', () => _clone(S.questCompleteData?.[ci] || {}), 'QuestComplete_X');
  put('cards0', () => _clone(S.cards0Data || {}), 'Cards[0]');
  put('cards1', () => _clone(S.cards1Data || []), 'Cards[1]');
  const OLA_KEYS = [29, 57, 101, 107, 108, 110, 111, 114, 137, 138, 139, 152, 193, 216, 217, 325, 327, 336, 365, 367, 390, 393, 395, 396, 397, 398, 399, 400, 401, 452, 456, 487, 539, 598, 599, 605, 615];
  for (const k of OLA_KEYS) {
    put('ola' + k, () => Number(ola[k]) || 0, 'OptionsListAccount[' + k + ']');
  }
  put('kla', () => _clone(D.klaData?.[ci]?.[map] || []), 'KillsLeft2Advance[map]');
  put('royalG', () => _clone(S.royalGData || []), 'RoyalG');
  put('royalMapLen', () => (S.royalMapsData?.[map] || []).length, 'RoyalMaps[map].length');
  put('royalMapRow', () => _clone(S.royalMapsData?.[map] || []), 'RoyalMaps[map] (KMT adds ActiveKillClear to [0] while 0 < length < 2)', { default: [] });
  put('royalKingdomEnabled', () => (Number(D.charClassData?.[ci]) === 16 ? 1 : 0), 'RoyalG("KingdomEnabled") = CharacterClass==16');
  put('royalHasOutpost', () => (royalMapEligible(map) ? 1 : 0), 'RoyalG("HasOutpost", map) (static map eligibility, src RoyalG block)');
  put('royalMapWorldsUnlocked', () => Math.round(1 + [2, 3, 4, 5, 6, 7, 8].reduce((s, i) => s + (Number(armoryBonus(S, i)) || 0), 0)), 'RoyalG("MapWorldsUnlocked") = round(1+Σ ArmoryUpgBonus(2..8))');
  put('royalActiveKillClear', () => { const a58 = Number(armoryBonus(S, 58)) || 0; return 1 <= a58 ? _num((1 + a58 / 100) * XtraClearKillz(S)) : 0; }, 'RoyalG("ActiveKillClear") = ArmoryUpgBonus(58)>=1 ? (1+A58/100)*XtraClearKillz : 0');

  // ---------------------------------------------------------------------------
  // Runtime-only values (not in save). Explicit defaults, never silent zeros.
  // ---------------------------------------------------------------------------
  unavailable('gi77', 0, 'PixelHelperActor[8]._GenINFO[77]', 'Orb of Remembrance kill counter (EXP x(1+gi77/100), extra drop rolls); not saved, reset on orb cast/fade');
  unavailable('gi79', 0, 'PixelHelperActor[8]._GenINFO[79]', 'plunder pity bank; session-only');
  unavailable('gi80', 0, 'PixelHelperActor[8]._GenINFO[80]', 'plunder miss counter; session-only');
  unavailable('gi83', 0, 'PixelHelperActor[8]._GenINFO[83]', 'wormhole counter; session-only');
  unavailable('gi7_8', -1, 'PixelHelperActor[7]._GenINFO[8]', 'worship TD session (-1 = none)');
  unavailable('nonDummies46', 0, 'NONdummies[46]', 'Killroy room session flag (nonzero suppresses kill rewards); 0 in normal combat');
  unavailable('nonDummies3', 0, 'NONdummies[3]', 'T468 kill counter');
  unavailable('gi84', 0, 'PixelHelperActor[8]._GenINFO[84]', 'wormhole mob spawn counter (ActionBlock "WormholeMob"); session-only');
  unavailable('gi85', '', 'PixelHelperActor[8]._GenINFO[85]', 'last wormhole/reindeer spawn type; session-only');
  unavailable('gi19', 0, 'PixelHelperActor[2]._GeneralInfo[19]', 'T490 cauldron kill accumulator; session-only');
  unavailable('gi43', 0, 'PixelHelperActor[26]._GenINFO[43]', 'Prisma bubble drops this session (PrismaBubDropChance divisor); session-only');
  unavailable('gi26_20', 0, 'PixelHelperActor[26]._GenINFO[20]', 'Tempest weapon/ring drop allowance; session-only, set by the player module/user');
  unavailable('gi1_100', 0, 'PixelHelperActor[1]._GenINFO[100]', 'form-drop suppression timer (> 0 blocks bone/dust/tachyon drops); session-only');
  unavailable('nd58', 0, 'NONdummies[58]', 'map 72 crystal Timecandy minigame state (2 = active); session-only');
  // Form-drop quantity multipliers (bones/dust/tachyons) are built after the
  // Etc contexts below as `formDropCoef`; the sim evaluates them live.
  // Form-drop chance inputs (src 92322 Windwalker, 92409 ArcaneType).
  const COMPASS_IDS = [3, 4, 5, 7, 12, 33, 72, 82, 86, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118];
  put('compass', () => Object.fromEntries(COMPASS_IDS.map((i) => [i, _num(computeCompassBonus(i, S))])), 'CompassBonus(i) for Tempest drop formulas', { default: {} });
  put('compass3', () => _clone(S.compassData?.[3] || []), 'Compass[3] (medallion types already found)', { default: [] });
  put('arcane', () => Object.fromEntries([3, 5, 13, 23, 26, 51].map((i) => [i, _num(arcaneUpgBonus(i, S))])), 'ArcaneUpgBonus 3/5/13/23/26/51 (Prisma bubble, crystal charge/spawn count, wand/ring quality)', { default: {} });
  put('talent490_1', () => _talent(S, ci, 1, 490), 'GetTalentNumber(1,490) (cauldron kill bonus)');
  put('talent594_1', () => _talent(S, ci, 1, 594), 'GetTalentNumber(1,594) (PrismaBubDropChance)');
  put('alchemyActive', () => _num(finalBubbleValByKey('AlchemyACTIVE', ci, S)), 'AlchBubbles.AlchemyACTIVE');
  put('arcade48', () => _num(arcadeBonus(48, S)), 'ArcadeBonus(48) (Tempest medallion chance)');
  put('mapBon', () => { const v = _raw(raw, 'MapBon'); if (!Array.isArray(v)) throw new Error('MapBon missing (pass rawSave)'); return _clone(v); }, 'MapBon (arcanist StatusArc kill counters)', { default: [] });
  put('obolInvOrder', () => { const v = _raw(raw, 'ObolInvOr'); if (!Array.isArray(v)) throw new Error('ObolInvOr missing (pass rawSave)'); return _clone(v); }, 'ObolInvOr (obol inventory pages)', { default: [] });
  put('obolInvOwn', () => { const v = _raw(raw, 'ObolInvOwn'); if (!Array.isArray(v)) throw new Error('ObolInvOwn missing (pass rawSave)'); return v.map((x) => Number(x) || 0); }, 'ObolInvOwn (obol inventory rows owned per page)', { default: [] });
  put('obolAutoTrash', () => sideJellyUnlocked(S, 3) === 1, 'Menagerie SideJellyUnlocked(3): Silver Jellyfish, unlock 10');
  put('obolAutoTrashRate', () => obolAutoTrashRate(S), 'Menagerie ObolAutoTrashRate: (10 + Menagerie[0][10]) / 100');
  put('obolFragmentBalance', () => {
    const n = S.currenciesData?.ObolFragments;
    if (n == null || !Number.isFinite(Number(n))) throw new Error('CurrenciesOwned.ObolFragments missing or invalid');
    return Number(n);
  }, 'CYObolFragments / CurrenciesOwned.ObolFragments (2 billion cap)', { default: 0 });
  // Halloween event status uses the source's fixed expiry plus server bypass days.
  put('eventStatus', () => {
    const sv = raw?.serverVars;
    if (!sv || typeof sv !== 'object') throw new Error('serverVars missing (pass rawSave)');
    const now = Number(S.timeAwayData?.GlobalTime) || 0;
    const end = 17942112e5 + 864e5 * Math.max(0, Number(sv.EventTimerBypass) || 0);
    return sv.EventActive === 'SpoopyYes' && now * 1000 < end ? 'On' : 'NahOff';
  }, 'serverVars.EventActive + NONdummies[10]≈TimeAway.GlobalTime*1000 (eventStatus)', { default: 'NahOff' });
  // TenteyeclePCT (src 92409): TesseractArcanist==1 ? min(ArcaneUpgBonus(7), T483_1) : T483_1.
  // The arcanist form flag is runtime state (default 0), so the save value is T483_1.
  put('talent483_1', () => _talent(S, ci, 1, 483), 'GetTalentNumber(1,483) (TenteyeclePCT)');
  put('talent483_2', () => _talent(S, ci, 2, 483), 'GetTalentNumber(2,483) (Tenteyecle cooldown seconds, capped at 4)');
  put('arcaneUpg7', () => _num(arcaneUpgBonus(7, S)), 'ArcaneUpgBonus(7) (arcanist TenteyeclePCT cap)');
  put('tenteyeclePct', () => values.talent483_1, 'TenteyeclePCT src 92409 (non-arcanist branch)',
    { note: 'sim recomputes min(arcaneUpg7, talent483_1) when sim.state.arcanist==1; rand is always consumed' });
  put('talent199_1', () => _talent(S, ci, 1, 199), 'GetTalentNumber(1,199) (StatusGrave CastAttack 136 chance)');
  unavailable('sintimeElapsed', 0, 'ActorEvents_29._SintimeElapsed', 'global UI sine clock (+11 every 100 ms, wraps >35903); phase only shifts item landing by up to 3 px');
  // DoubleItemDropz src 92409: 0 = Arcane18 + (T647_1 + (Palette19 + min(10, Bonus_Minor(-1,8))));
  // 1 = Arcane30 + (Palette24 + BigFishBonuses(5)).
  put('doubleItemDropz0', () => _num(arcaneUpgBonus(18, S)) + (_talent(S, ci, 1, 647)
    + (_num(computePaletteBonus(19, S)) + Math.min(10, _divMinorAccount(S, 8)))), 'ArcaneType("DoubleItemDropz",0) src 92409');
  put('doubleItemDropz1', () => _num(arcaneUpgBonus(30, S)) + (_num(computePaletteBonus(24, S)) + _num(computeBigFishBonus(5, S))),
    'ArcaneType("DoubleItemDropz",1) src 92409');
  put('legend2', () => _num(legendPTSbonus(2, S)), 'Thingies("LegendPTS_bonus",2) (EquipmentStatues/FoodG doubling)');
  put('shopUpg48', () => _num(shopUpgBonus(48, S)), 'Spelunk("ShopUpgBonus",48) (EquipmentStatues doubling)');
  // TalentEnh(id) is getbonus2(1,49) thresholds (src 91536): 318 needs >=50, 362 needs >=150.
  const enh49 = (() => { try { return _num(maxTalentBonus(49, ci, S)); } catch { return 0; } })();
  put('talentEnh318', () => (enh49 >= 50 ? 1 : 0), 'TalentEnh(318) = getbonus2(1,49) >= 50 (src 91536)');
  put('talentEnh362', () => (enh49 >= 150 ? 1 : 0), 'TalentEnh(362) = getbonus2(1,49) >= 150 (src 91536)');
  put('talentEnh497', () => (enh49 >= 75 ? 1 : 0), 'TalentEnh(497) = getbonus2(1,49) >= 75 (src 91536)');
  put('talentEnh165', () => (enh49 >= 225 ? 1 : 0), 'TalentEnh(165) = getbonus2(1,49) >= 225 (src 91536)');
  // Form flags are derived at runtime from BuffsActive by combat-sim-rewards
  // updateFormState (src 91799/92324/92398); null = derive, 0/1 = force.
  put('wraith', () => null, 'Summoning("GrimoireWraith") src 91799: buff195>=1 && BuffsActive[195][1]>100 (runtime)');
  put('tempest', () => null, 'Windwalker("CompassTempest") src 92324: buff420>=.1 && NONdummies[67]==1 && BuffsActive[420][1]>100 (runtime)');
  put('arcanist', () => null, 'ArcaneType("TesseractArcanist") src 92398: buff585>=.1 && NONdummies[68]==1 && BuffsActive[585][1]>100 (runtime)');
  unavailable('killroyRoom', 0, 'KillroyRoom state', 'Killroy room session; Tenteyecle randInt(1,5) consumed only when nonzero');
  unavailable('initialRespawnCounters', null, 'MonsterRespawnTime[]', 'not exported in save; default all alive (0)');
  notApplicable('dungeonCreditBonus1', 1, 'DungeonCalc("DungeonCredit_Bonus")', 'Dungon() is -1 outside maps 39/40/70/71/118/119; dungeon credit is not reachable in normal combat');
  notApplicable('dungeonCreditBonus2', 1, 'DungeonCalc("DungeonCredit_Bonus2")', 'Dungon() is -1 outside maps 39/40/70/71/118/119; dungeon credit is not reachable in normal combat');
  // Actor width = animation frame width; frames = animation frame count (resources.mbs).
  // The world reads MOB_SPRITES per monster type; these are the map target's values.
  put('monsterWidth', () => { const sp = MOB_SPRITES[target?.key]; if (!sp) throw new Error('no sprite for ' + target?.key); return Number(sp.fw) || 60; }, 'MOB_SPRITES[type].fw (actor width)', { default: 60 });
  put('monsterNumFrames', () => { const sp = MOB_SPRITES[target?.key]; if (!sp) throw new Error('no sprite for ' + target?.key); return Number(sp.frames) || 28; }, 'MOB_SPRITES[type].frames (getNumFrames)', { default: 28 });
  put('defaultExpType', () => 0, 'SceneEvents_n._DefaultExpType', { note: 'scene attribute initialised to 0; only special minigame/event scenes override it (gates KLA decrement and StatusPtyMob credit)' });
  put('npcBanditBob', () => {
    const d = _raw(raw, 'NPCdialogue_' + ci);
    if (!d || typeof d !== 'object') throw new Error('NPCdialogue_X missing (pass rawSave)');
    return Number(d.Bandit_Bob) || 0;
  }, 'NPCdialogue_X.Bandit_Bob (mimicA Quest45 needs > 17)');
  put('grid191', () => _num(gridBonusFinal(S, 191)), 'ResearchStuff("Grid_Bonus",191) (StatusRoyal kill bonus)');
  put('parchmentDrop', () => _num(parchmentDropChance(S)), 'RoyalG("ParchmentDrop") src 92957');
  put('parchmentDouble', () => _num(parchmentDoubleChance(S)), 'RoyalG("ParchmentDouble") src 92958');
  // Holes("XtraMushKillz") = 1 + StudyBolaiaBonuses(8)/100 (plain per-level branch).
  put('xtraMushKillz', () => 1 + (Number(S.holesData?.[26]?.[8]) || 0) * holesBolaiaPerLv(8) / 100, 'Holes("XtraMushKillz") = 1 + Holes[26][8]*HolesInfo[70][8]/100 (caveB kill counters)');
  put('ninja105', () => _clone(S.ninjaData?.[105] || D.ninjaData?.[105] || []), 'Ninja[105] (Emporium per-monster kill counters, NinjaInfo[30] order)', { default: [] });
  // Map 216 (SceneEvents_135): the player's open cavern decides the player node
  // (1 inside a cavern, 0 on the surface) and which staged mobs leave node 3.
  put('holeCavern', () => { const c = S.holesData?.[0]?.[ci]; return c == null ? -1 : Number(c); }, 'Holes[0][char] (open cavern, -1 = surface; map 216 scene layout)', { default: -1 });
  // The Den amplifiers (Holes[12][0..7], each 0..AmpStoneMAX) and The Cove
  // Cglunko upgrade levels (OLA[630..653]); both are player-configurable.
  put('denAmps', () => Array.from({ length: 8 }, (_, i) => Number(S.holesData?.[12]?.[i]) || 0), 'Holes[12][0..7] (Den amplifier levels: AmpDebuff/AmpMulti)', { default: [] });
  put('coveUpgrades', () => Array.from({ length: CGLUNKO_UPGRADES }, (_, i) => Number(ola[630 + i]) || 0), 'OptionsListAccount[630..653] (Cglunko upgrade levels: Cglunko_DR/MK/Respawn/DoublePickup, upgBon 19 damage)', { default: [] });
  put('holes11Kills', () => ({ 27: Number(S.holesData?.[11]?.[27]) || 0, 28: Number(S.holesData?.[11]?.[28]) || 0, 63: Number(S.holesData?.[11]?.[63]) || 0 }), 'Holes[11][27/28/63] (caveB mushroom / caveC golem kill counters)', { default: {} });
  // Zenith Cluster forming (5 s scene timer, src 99811) when OLA[487]==1.
  put('zenithMarket3', () => Math.floor((Number(ZenithMarket[3]?.[4]) || 0) * (Number(S.spelunkData?.[45]?.[3]) || 0)),
    'Thingies("ZenithMarketBonus",3) = floor(ZenithMarket[3][4]*Spelunk[45][3]) src 91970 (extra cluster drop %)');
  // The roll (src 99828) calls RoyalG("ZenithAutoEXPchance"), but only Thingies
  // has that branch (src 91973, = OrbletMarketBonus(0), EMULSION). RoyalG falls
  // through to its final `return 69` (src 93046), so every formed cluster rolls
  // 69% regardless of EMULSION level.
  put('zenithAutoExpChance', () => 69,
    'RoyalG("ZenithAutoEXPchance") has no branch and returns 69 (src 93046); EMULSION (Thingies OrbletMarketBonus(0) = ' + orbletBonus(S, 0) + '%) is never read');
  // Per-statue gain multiplier on success (src 99828):
  // (1 + max(0, .1*StatueOnyxOwned + .15*StatueZenithOwned)) * RoyalG("StatueEXPmulti", id).
  put('zenithStatueExpMulti', () => {
    const g = Array.isArray(S.statueGData) ? S.statueGData : [];
    const ola69 = Number(S.optionsListData?.[69]) || 0;
    let onyx = 0, zen = 0;
    for (let i = 0; i < g.length; i++) { const t = Number(g[i]) || 0; if (t >= 2) onyx++; if (t >= 3) zen++; }
    // ArbitraryCode StatueOnyxOwned / StatueZenithOwned (src 65933-65942) return 0 below OLA[69] 2 / 3.
    const base = 1 + Math.max(0, 0.1 * (ola69 >= 2 ? onyx : 0) + 0.15 * (ola69 >= 3 ? zen : 0));
    const out = [];
    for (let id = 0; id < Math.max(32, g.length); id++) out.push(base * statueFlairMultiplier(S, id));
    return out;
  }, '(1 + max(0, .1*StatueOnyxOwned + .15*StatueZenithOwned)) * StatueEXPmulti(id) = 1 + SF_bonus(RoyalG[22][id])/100 (src 99828, 65933, 92936)', { default: [] });
  put('statueTiers', () => _clone(Array.isArray(S.statueGData) ? S.statueGData : []), 'StatueG (statue tier; >= 1 shares Zenith statue EXP with every character, src 99828)', { default: [] });
  put('tasks2_0_6', () => Number(S.tasksGlobalData?.[2]?.[0]?.[6]) || 0, 'Tasks[2][0][6] (Baba Yaga talent book unlock)');
  put('tasks2_1_6', () => Number(S.tasksGlobalData?.[2]?.[1]?.[6]) || 0, 'Tasks[2][1][6] (Baba Hour/Mummy talent book unlock)');
  put('rawSkillLevels', () => _clone(D.skillLvData?.[ci] || []), 'SkillLevels (raw, for SkillLevels[468] gate)', { default: [] });
  put('talent525_2', () => _talent(S, ci, 2, 525), 'GetTalentNumber(2,525) (Poison status tick damage %)');
  const BUFF_IDS = [19, 45, 107, 108, 122, 168, 195, 198, 302, 318, 319, 420, 423, 468, 469, 490, 585];
  const runtimeBuffs = {};
  for (const id of BUFF_IDS) runtimeBuffs[id] = unavailable('buff' + id, 0, 'GetBuffBonuses(' + id + ',1)', 'active buff; supplied by the player module');
  values.runtimeBuffs = runtimeBuffs;

  // ---------------------------------------------------------------------------
  // PLAYER-SIDE INPUTS (to be completed by the player module agent).
  // Defaults are informational for idle/scripted test players only.
  // ---------------------------------------------------------------------------
  put('playerMaxHp', () => _num(resolveId('max-hp')), 'PlayerHPmax via max-hp descriptor', { default: 1 });
  put('playerDefence', () => _num(resolveId('defence')), 'TotalStats("Defence") via defence descriptor');
  put('talent122_1', () => _talent(S, ci, 1, 122), 'GetTalentNumber(1,122) (b122 monster damage reduction)');
  _foodInputs({ S, ci, map, raw, put, values, ctx });
  _playerInputs({ S, ci, map, raw, put, unavailable, resolveId, values, entries, target, ola, ctx });

  // ---------------------------------------------------------------------------
  // Mutable sim-local state (copies)
  // ---------------------------------------------------------------------------
  values.state = {
    inventory: _clone(values.inventory),
    cards0: values.cards0, cards1: values.cards1, questComplete: values.questComplete,
    kla: values.kla, royalG: values.royalG, royalMapRow: _clone(values.royalMapRow || []),
    ola: Object.fromEntries(OLA_KEYS.map((k) => [k, values['ola' + k]])),
    mapBon: _clone(values.mapBon || []),
    obol: { order: _clone(values.obolInvOrder || []), own: (values.obolInvOwn || []).slice() },
    obolFragments: values.obolFragmentBalance,
    ninja105: _clone(values.ninja105 || []),
    holes11: { ...(values.holes11Kills || {}) },
  };

  const result = { ok: !!target?.monster, target, entries, values };
  if (opts.statBreakdowns) result.breakdowns = buildCombatStatBreakdowns(ctx, entries);
  return result;
}

const CAPACITY_TYPES = ['bOre', 'bBar', 'cOil', 'bLog', 'bLeaf', 'dFish', 'dBugs', 'cFood', 'dCritters', 'dSouls', 'bCraft'];
const BIG_STACK_TYPES = new Set(['dCurrency', 'dQuest', 'dExpOrb', 'dStone', 'dFishToolkit']);

// MaxCapacity(typeGen) as consumed by ItemPickupInTheFirstPlace.
export function maxCapacityFor(values, typeGen) {
  const t = String(typeGen || '');
  if (values?.maxCapacity && Object.prototype.hasOwnProperty.call(values.maxCapacity, t)) return values.maxCapacity[t];
  if (t.charAt(0) === 'a') return 1;
  if (t === 'dStatueStone') return 999999999;
  if (BIG_STACK_TYPES.has(t) || t.charAt(0) === 'd') return 9999999;
  return 2;
}

export function itemDef(name) { return ITEMS[name] || null; }
export function monsterDef(name) { return MONSTERS[name] || null; }

// ---------------------------------------------------------------------------
// PLAYER-SIDE INPUTS (combat-sim-player.js). Formula sources:
//   _combat-src/spec-player.md (ActionWaitTime, Reach, Speed, HitChancePCT,
//   CreateDmgPixel, TakeDamage/Die) and spec-skills.md (cast pipeline, talents).
// ---------------------------------------------------------------------------
// Every talent read by a weapon Result, a CastAttackofID1 branch or a bullet.
export const PLAYER_TALENT_IDS = [
  15, 16, 18, 19, 33, 40, 45, 46, 48, 77, 90, 91, 93, 94, 105, 106, 107, 108, 120, 121, 122, 124, 135, 136,
  137, 138, 139, 165, 166, 167, 168, 169, 197, 198, 199, 227, 228, 266, 270, 271, 273, 274, 285, 286, 287,
  288, 289, 300, 301, 302, 303, 304, 315, 316, 317, 318, 360, 361, 362, 363, 364, 370, 422, 423, 424, 450,
  451, 453, 454, 460, 465, 466, 467, 469, 475, 481, 482, 484, 490, 495, 496, 497, 498, 499, 525, 526, 527,
  528, 529, 587, 588, 615, 629, 640, 195, 420, 585, 599,
];

// Food-dependent stats the source recomputes live on every call rather than
// reading from DNSM.TotStatMAP: PlayerHPmax (src 66210, TotalFoodBonuses
// HpBaseBoosts), PlayerSpeedBonus/PlayerSpeed (66171, inline MoveSpdBoosts
// scan), PctMPperSec (65953, ManaRegenBoosts) and ExpMulti(0) per kill (63654,
// TotalFoodBonuses ClassEXP). DamageDealed("Max") and TotalStats(...) are
// cached in TotStatMAP (66091, 66238), which food depletion never clears, so
// their food terms stay at the run-start value until a scene/UI reset.
export const LIVE_FOOD_KEYS = ['playerMaxHp', 'playerSpeedBonus', 'playerSpeed', 'foodManaRegen', 'pctMpPerSec', 'expMulti'];

/**
 * Rebuilds the live food-dependent inputs with the character's food bag
 * temporarily replaced by the sim's current `order`/`qty` (depleted slots are
 * 'Blank'). Returns { [LIVE_FOOD_KEYS]: value }. The save module state is
 * restored before returning.
 */
export function buildLiveFoodInputs(saveData, charIdx, mapIdx, opts = {}, order = [], qty = []) {
  const ci = Number(charIdx) || 0;
  const bagO = D.equipOrderData?.[ci]?.[2], bagQ = D.equipQtyData?.[ci]?.[2];
  if (!bagO || !bagQ) return null;
  const saveO = {}, saveQ = {};
  const lenO = Array.isArray(bagO) ? bagO.length : -1, lenQ = Array.isArray(bagQ) ? bagQ.length : -1;
  for (let i = 0; i < order.length; i++) {
    saveO[i] = Object.prototype.hasOwnProperty.call(bagO, i) ? bagO[i] : undefined;
    saveQ[i] = Object.prototype.hasOwnProperty.call(bagQ, i) ? bagQ[i] : undefined;
    bagO[i] = order[i];
    bagQ[i] = qty[i];
  }
  try {
    const built = buildCombatInputs(saveData, ci, mapIdx, opts);
    const out = {};
    for (const k of LIVE_FOOD_KEYS) out[k] = built.values[k];
    return out;
  } finally {
    for (const i in saveO) {
      if (saveO[i] === undefined) delete bagO[i]; else bagO[i] = saveO[i];
      if (saveQ[i] === undefined) delete bagQ[i]; else bagQ[i] = saveQ[i];
    }
    if (lenO >= 0) bagO.length = lenO;
    if (lenQ >= 0) bagQ.length = lenQ;
  }
}

// TotalFoodBonuses(effect) src 69253: Σ Amount * FoodBonuses(Effect+"EffectBonus")
// over owned non-Blank slots with nonzero quantity (no dungeon filter).
function _foodAmount(ci, effect, mult = 1) {
  const order = D.equipOrderData?.[ci]?.[2] || {};
  const qty = D.equipQtyData?.[ci]?.[2] || {};
  const slots = Number(D.foodSlotsOwnedData?.[ci]) || 0;
  let amt = 0;
  for (let i = 0; i < slots; i++) {
    const key = order[i];
    if (!key || key === 'Blank' || Number(qty[i]) === 0) continue;
    const it = ITEMS[key];
    if (it && it.Effect === effect) amt += (Number(it.Amount) || 0) * mult;
  }
  return amt;
}

// Food slots, effect multipliers and consumption inputs for the sim's
// ConsumeFoodNEW / ConsumeFoods / mana-potion / movement-potion paths.
function _foodInputs({ S, ci, map, raw, put, values, ctx }) {
  const etc9 = () => _num(ctx ? etcBonus.resolve('9', ctx) : 0);
  put('healthFoodEffect', () => healthFoodHealingPerHour(ci, { saveData: S, charIdx: ci, mapIdx: map }).effectMultiplier,
    'FoodBonuses("HealthEffectBonus") src 66105 = GoldFoodBonuses("HealthFoods")+(Box.HealthFoodEffect+Statue3+Etc9+Stamp HFood+StarSign FoodEffect+CardSet 1)/100');
  put('boostFoodEffect', () => 1 + (_num(computeBoxReward(ci, 'PowerFoodEffect')) + (_num(computeStatueBonusGiven(3, ci, S)) + (etc9()
    + (_num(computeStampBonusOfTypeX('BFood', S, ci)) + (_num(computeStarSignBonus('FoodEffect', ci, S)) + (_num(computeCardBonusByType(48, ci, S))
    + (_num(computeCardSetBonus(ci, '1')) + _talent(S, ci, 1, 631)))))))) / 100,
  'FoodBonuses("*BoostsEffectBonus") src 66105 = 1+(Box.PowerFoodEffect+Statue3+Etc9+Stamp BFood+StarSign FoodEffect+Card48+CardSet 1+TN(1,631))/100', { default: 1 });
  put('foodNotConsume', () => {
    const mf = _num(mainframeBonus(108, S));
    const bub = _num(finalBubbleValByKey('nonFoodACTIVE', ci, S));
    return Math.min(Math.min(90 + 5 * mf, 98 + Math.min(bub, 1)),
      Math.max(1, mf) * (_talent(S, ci, 1, 458) + (_num(computeBoxReward(ci, 'NonConsume')) + (_num(computeCardBonusByType(16, ci, S))
        + _num(computeStarSignBonus('NoConsumeFood', ci, S)) + bub))));
  }, 'ArbitraryCode("FoodNOTconsume") src 65944');
  put('foodSlots', () => {
    const order = D.equipOrderData?.[ci]?.[2] || {}, qty = D.equipQtyData?.[ci]?.[2] || {};
    const count = Math.max(0, Math.floor(Number(D.foodSlotsOwnedData?.[ci]) || 0));
    const n = Math.max(16, count);
    const o = [], q = [];
    for (let i = 0; i < n; i++) { o.push(String(order[i] ?? 'Blank')); q.push(Number(qty[i]) || 0); }
    return { count, order: o, qty: q };
  }, 'EquipOrder_X[2] / EquipQTY_X[2] / FoodSlO_X', { partial: !D.combatAfkInputDataAvailable?.[ci]?.foodSlots });
  put('savedFoodCooldowns', () => {
    const r = _raw(raw, 'FoodCD_' + ci);
    if (!Array.isArray(r)) throw new Error('FoodCD_' + ci + ' not supplied (pass rawSave)');
    return r.map((x) => Number(x) || 0);
  }, 'FoodCD_X', { default: [], note: 'provenance only; the sim starts every FoodCooldowns timer at 0 unless autoPlayer({ useSavedFoodCooldowns: true })' });
  put('labFoodRefill', () => Number(D.labData?.[16]?.[1]) === 1, 'Lab[16][1] == 1 (depleted food slot refills from storage)');
  put('foodStorage', () => {
    const chest = S.itemQuantityData?.chest;
    const out = {};
    if (!chest?.available) throw new Error('ChestOrder/ChestQuantity unavailable');
    const want = new Set(values.foodSlots?.order || []);
    const o = chest.order || [], q = chest.quantity || [];
    for (let i = 0; i < o.length; i++) {
      if (want.has(o[i]) && o[i] !== 'Blank') out[o[i]] = (out[o[i]] || 0) + (Number(q[i]) || 0);
    }
    return out;
  }, 'JustStorageOWNED (ChestOrder/ChestQuantity) for equipped food items', { default: {} });
  put('cFoodCap', () => _num(computeMaxCapacity(S, ci, 'cFood')), 'MaxCapacity("cFood") (storage refill cap)');
}

function _playerInputs({ S, ci, map, raw, put, unavailable, resolveId, values, entries, target, ola, ctx }) {
  const dmg = (() => { try { return resolveId('damage'); } catch { return null; } })();
  // Map 43 (Royal Guardian vermin) overrides DamageDealed before every form
  // (src 66085) and CritChance/CritDamage after every form (src 66064/66073).
  const vermin = map === 43;
  if (vermin) {
    put('damageMax', () => ratDmg(S), 'DamageDealed("Max") map 43 = RoyalG("RatDMG") (src 92956)');
    put('damageMastery', () => 0.2, 'DamageDealed("Mastery") map 43 = .2');
    put('damageMin', () => values.damageMax * values.damageMastery, 'DamageDealed("Min") = Max*Mastery');
    put('critChance', () => 10, 'CritChance map 43 = 10');
    put('critDamage', () => 1.65, 'CritDamage map 43 = 1.65');
  } else {
    put('damageMax', () => _num(dmg), 'DamageDealed("Max") via damage descriptor');
    put('damageMastery', () => Number(dmg?.mastery ?? dmg?.minDamage / Math.max(1, _num(dmg))) || 0, 'DamageDealed mastery (min/max ratio)');
    put('damageMin', () => Number(dmg?.minDamage) || 0, 'DamageDealed("Min") via damage descriptor');
    put('critChance', () => _num(resolveId('crit-chance')), 'CritChance via crit-chance descriptor (percent)');
    put('critDamage', () => _num(resolveId('crit-damage')), 'CritDamage multiplier via crit-damage descriptor');
  }
  put('accuracy', () => _num(resolveId('accuracy')), 'TotalStats("Accuracy") via accuracy descriptor');
  put('hitChancePct', () => {
    const def = Number(target?.monster?.Defence) || 0;
    return computeHitChance(values.accuracy, def, target?.monster?.Type || 'Monster');
  }, 'HitChancePCT(AFK target Defence) via computeHitChance');
  // HitChancePCT (src 65943) reads the live def Defence of the hit monster /
  // _TargetEnemy; the sim recomputes per monster when its def differs from these.
  put('hitChanceDefence', () => Number(target?.monster?.Defence) || 0, 'AFK target def Defence used by hitChancePct');
  put('hitChanceType', () => target?.monster?.Type || 'Monster', 'AFK target def Type used by hitChancePct');
  put('playerMaxMp', () => _num(resolveId('max-mp')), 'PlayerMPmax via max-mp descriptor', { default: 1 });
  put('playerSpeedBonus', () => _num(resolveId('movement-speed')), 'PlayerSpeedBonus via movement-speed descriptor',
    { note: 'PlayerSpeed = 16*min(2.19, bonus); descriptor value is used uncapped here and capped by the sim' });
  put('playerSpeed', () => 16 * Math.min(2.19, values.playerSpeedBonus), 'PlayerSpeed (src 66169) = 16*min(2.19, PlayerSpeedBonus)');

  put('weaponName', () => String(D.equipOrderData?.[ci]?.[0]?.[1] || ''), 'EquipOrder_X[0][1]');
  put('weaponType', () => String(ITEMS[values.weaponName]?.Type || 'FISTICUFF'), 'ItemDefinitions[weapon].Type');
  put('weaponSpeed', () => Number(ITEMS[values.weaponName]?.Speed) || 0, 'ItemDefinitions[weapon].Speed');
  put('weaponReach', () => {
    const r = ITEMS[values.weaponName]?.Reach;
    return r == null || r === 'Null' ? null : Number(r) || 0;
  }, 'ItemDefinitions[weapon].Reach (null = 200 fallback in PlayerReach)');
  put('compassRange', () => _num(computeCompassBonus(32, S)) + _num(computeCompassBonus(65, S)),
    'Windwalker("Compass_Range") src 92346 = CompassBonus(32)+CompassBonus(65); replaces buff 288 reach while CompassTempest');
  put('attackSpeedPct', () => actionWaitTimeAfk(ci, { saveData: S, charIdx: ci, mapIdx: map }, { buffs: [] }).attackSpeedPct,
    'ActionWaitTime speed pool (EtcBonus56+Meal AtkSpd+chip atkspd+bubble BAspd+Box 12b) via actionWaitTimeAfk');

  const T1 = {}, T2 = {};
  for (const id of PLAYER_TALENT_IDS) {
    T1[id] = put('talent' + id + '_1', () => _talent(S, ci, 1, id), 'GetTalentNumber(1,' + id + ')');
    T2[id] = put('talent' + id + '_2', () => _talent(S, ci, 2, id), 'GetTalentNumber(2,' + id + ')');
  }
  values.talentN = { 1: T1, 2: T2 };
  put('skillLevels', () => {
    const sl = D.skillLvData?.[ci] || {};
    const out = {};
    for (const id of PLAYER_TALENT_IDS) out[id] = Number(sl[id]) || 0;
    return out;
  }, 'SL_X (SkillLevels; SL640 gates super crit)');

  put('attackLoadout', () => (D.attackLoadoutData?.[ci] || []).map((row) => (row || []).map((v) => (v === 'Null' || v == null ? 'Null' : Number(v)))),
    'AttackLoadout_X', { partial: !D.attackLoadoutDataAvailable?.[ci] });
  put('atkCooldownDec', () => 1 + (T1[289] + _num(computeBoxReward(ci, 'cooldown'))) / 100,
    'ArbitraryCode("AtkCooldownDEC") src 65957 = 1+(TN(1,289)+BoxRewards.cooldown)/100');
  put('mpCostBoost', () => {
    if (map !== 216 || Number(values.holeCavern) !== 2) return 1;
    const lv = Number(values.denAmps?.[4]) || 0;
    return (1 + lv) * Math.pow(1.07, lv);
  }, 'Holes("MPcostboost") src 92176 = map 216 && Holes[0][char]==2 ? AmpDebuff(4)=(1+Holes[12][4])*1.07^Holes[12][4] : 1 (Holes[12] via denAmps)');
  put('foodManaRegen', () => _foodAmount(ci, 'ManaRegenBoosts', values.boostFoodEffect),
    'DNSM.ManaRegen = TotalFoodBonuses("ManaRegenBoosts") (src 65953)');
  put('sigil5', () => _num(sigilBonus(5, S, ci)), 'Labb("SigilBonus",5)');
  put('card51', () => _num(computeCardBonusByType(51, ci, S)), 'CardBonusREAL(51)');
  put('pctMpPerSec', () => (1 + (values.foodManaRegen + values.sigil5) / 100) * (1 + (T1[629] + (T2[469] + values.card51)) / 100),
    'ArbitraryCode("PctMPperSec") src 65953');
  put('invulnSeconds', () => 2.65 + T1[484], 'ActionWaitTime("Invuln") = 2.65 + TN(1,484)');
  put('selfHeal', () => _num(computeBoxReward(ci, 'SelfHeal')), 'BoxRewards.SelfHeal');
  put('autoRespawnSec', () => autoRespawnTime(T1[615], values.selfHeal), 'AutoRespawnTime() via autoRespawnTime');
  put('expType', () => 0, 'ExpType', { note: 'combat maps use ExpType 0; AutoCast AFKactivity gate' });
  put('afkTargetFighting', () => String(MONSTERS[values.afkTarget]?.AFKtype || '') === 'FIGHTING', 'MonsterDefinitions[AFKtarget].AFKtype == "FIGHTING"');
  put('initialBuffs', () => (D.buffsActiveData?.[ci] || []).map((b) => [Number(b[0]), Number(b[1]), Number(b[2] ?? b[1])]), 'BuffsActive_X',
    { note: 'filtered to the permanent form toggles (195/420/585) unless useSavedBuffs is set; cached stats use the same list' });
  // Saved timed buffs are a snapshot of whatever was running at export time. AutoCast
  // skips a buff skill while that buff has > 10 s left (src AutoCast BuffsActive gate),
  // so carrying them in would delay the first cast by a leftover save timer.
  put('useSavedBuffs', () => false, 'Calculator option (not a game value): start with every saved BuffsActive_X timer instead of only form toggles');
  // Saved cooldowns are provenance only. Every sim starts with all skills off
  // cooldown: no scene-entry code writes AttackCooldowns (the only load-time
  // writers are the login time-away decrement src 120337-120342 and the
  // >4x-cooldown clamp src 120912-120920, both of which only shorten timers).
  put('savedCooldowns', () => {
    const raw0 = _raw(raw, 'AtkCD_' + ci);
    if (!raw0 || typeof raw0 !== 'object') throw new Error('AtkCD_' + ci + ' not supplied (pass rawSave)');
    const out = {};
    for (const k of Object.keys(raw0)) out[k] = Number(raw0[k]) || 0;
    return out;
  }, 'AtkCD_X', { default: {}, note: 'not applied; pass autoPlayer({ useSavedCooldowns: true }) to start from it' });
  put('initialCooldowns', () => ({}), 'sim start: every AttackCooldowns timer is 0 at t=0',
    { note: 'no source map-entry cooldown delay exists (scene load never writes AttackCooldowns)' });
  unavailable('initialMp', null, 'PlayerMP', 'not exported; default PlayerMPmax');
  unavailable('initialHp', null, 'PlayerHP', 'not exported; default PlayerHPmax');
  unavailable('ola25', 1, 'OptionsList[25]', 'auto-cast toggle (per-device option, not in save)');
  put('bowFrameMs', () => Number(PLAYER_ANIMS?.['2b']?.ms?.[0]) || 100, 'player anim "2b" frameDuration[0] (resources.mbs via combat-sprites.js)',
    { default: 100, note: 'AE20:1339 rewrites frames 0..6 to max(50,100-70*max(0,1-AWT)) after the first fire when AWT("BOW")<.5' });
  put('vaultUpg7', () => _num(vaultUpgBonus(7, S)), 'VaultUpgBonus(7) (Whirl 91 targets/radius, AE148:287)');
  put('vaultUpg8', () => _num(vaultUpgBonus(8, S)), 'VaultUpgBonus(8) (Piercing Arrow 270 second arrow, AE148:704)');
  put('vaultUpg9', () => _num(vaultUpgBonus(9, S)), 'VaultUpgBonus(9) (Fireball 451 mirrored second fireball, AE148:1018)');
  put('arcane13', () => _num(arcaneUpgBonus(13, S)), 'ArcaneUpgBonus(13) (Arcane Crystal charge requirement)');
  put('arcane20', () => _num(arcaneUpgBonus(20, S)), 'ArcaneUpgBonus(20) (wand may hit StatusArc mobs)');
  put('arcane26', () => _num(arcaneUpgBonus(26, S)), 'ArcaneUpgBonus(26) (extra Arcane Crystal mob chance)');
  unavailable('gi81', 1, 'GenINFO7[81]', 'Tampered Injection 527 hit-count runtime counter (not saved); max(1,min(10,1^0.3)) = 1 hit');
  put('cookTimeBox', () => _num(computeBoxReward(ci, 'CookTime')), 'BoxRewards.CookTime (Cauldron buff 490 duration, src 67148)');
  // CreateDmgPixel src 66736 (non-dungeon boss branch): DamageMultipliers("Boss")[0] (src 66755)
  // * (1 + (StarSigns.BossDamage + StampBonusOfTypeX("BossDmg") + VaultUpgBonus(22)) / 100).
  put('bossMulti', () => {
    if (!ctx) throw new Error('stat context unavailable');
    const wis = _num(computeTotalStat('WIS', ci, ctx)?.computed);
    const wisTerm = wis < 1e3 ? (Math.pow(wis + 1, 0.37) - 1) / 40 : (wis - 1e3) / (wis + 2500) * 0.5 + 0.255;
    const dmgMulti = 1 + (wisTerm / 1.2 + _num(etcBonus.resolve('5', ctx))) / 100;
    return dmgMulti * (1 + (_num(computeStarSignBonus('BossDamage', ci, S)) + (_num(computeStampBonusOfTypeX('BossDmg', S, ci)) + _num(vaultUpgBonus(22, S)))) / 100);
  }, 'DamageMultipliers("Boss")[0]*(1+(StarSigns.BossDamage+Stamp BossDmg+VaultUpg22)/100) src 66736/66755', { default: 1 });
  unavailable('playerWidth', 94, 'player actor width', 'live 94x50');
  unavailable('playerHeight', 50, 'player actor height', 'live 94x50');
  // Royal Intervention (src 92962/92963), consumed by the buff-167 all-mob-dead respawn.
  put('talent229_1', () => _talent(S, ci, 1, 229), 'GetTalentNumber(1,229)');
  put('talent229_2', () => _talent(S, ci, 2, 229), 'GetTalentNumber(2,229)');
  T1[229] = values.talent229_1; T2[229] = values.talent229_2;
  put('riChance', () => values.talent229_1 / 100 * (1 + _num(orbletBonus(S, 5)) / 100) + _num(jellyRewardBonus(S, 56)) / 1e3,
    'RoyalG("RI_chance") src 92962 = TN(1,229)/100*(1+OrbletMarketBonus(5)/100)+JellyRoG56/1000');
  put('riMobs', () => Math.floor(values.talent229_2 + (10 * (outpostIsPurified(S, map) ? 1 : 0) + (_num(rogBonusQTY(61, _num(S.cachedUniqueSushi))) + _num(jellyRewardBonus(S, 35))))),
    'RoyalG("RI_mobs") src 92963 = floor(TN(2,229)+(10*isMapPurified+(SushiRoG61+JellyRoG35)))');

  // ---- Skill contexts (Etc bonuses and Wraith's FishingEfficiency); skilling itself is not simulated ----
  const skillCtx = {};
  const sctx = (type) => skillCtx[type] || (skillCtx[type] = createStatContext({ charIdx: ci, mapIdx: map, saveData: S, layer1: { skillType: type } }));
  const etc = (k) => _num(etcBonus.resolve(k, sctx('Mining')));
  let fishEv = null;
  const fev = () => fishEv || (fishEv = createFishingEvaluator(S, ci));
  const fin = (spotIdx) => fev().inputsFor(fev().base.savedSelection, { mapIdx: map, spotIdx });
  put('fishingEfficiency', () => _num(fin(0).efficiency), 'SkillStats("FishingEfficiency") src 66343 (saved toolkit; Wraith form stats)');

  // ---- Form stats (Wraith / Tempest / Arcanist), applied by the sim while the form is active ----
  put('formStats', () => {
    const tn = (tab, id) => _talent(S, ci, tab, id);
    const etcN = (id) => etc(String(id));
    const eqOrder = D.equipOrderData?.[ci], emm = D.emmData?.[ci];
    const tDef = Number(target?.monster?.Defence) || 0, tType = target?.monster?.Type || 'Monster';
    const out = {
      wraith: wraithStats(S, { tn, ola, fishingEfficiency: values.fishingEfficiency }),
      tempest: tempestStats(S, { tn, ola, etc: etcN, eqOrder, emm }),
      arcanist: arcanistStats(S, { tn, ola, etc: etcN, eqOrder, emm, lv0: S.lv0AllData?.[ci] }),
    };
    for (const f of Object.values(out)) f.hitChancePct = computeHitChance(f.accuracy, tDef, tType);
    return out;
  }, 'Summoning Grimoire_* (src 91814), Windwalker Compass_* (src 92324), ArcaneType Arcane_* (src 92404)');
  put('grimoire21', () => _num(values.formStats?.wraith?.grimoire21), 'GrimoireUpgBonus(21) (wraith elimination gate, src 83272)');

  // ---- Form-drop quantity coefficients (src 91804/91805/92322/92409) ----
  const companionsKnown = S.companionDataAvailable !== false;
  put('formDropCoef', () => {
    const tn1 = (id) => _talent(S, ci, 1, id);
    const cmp = {};
    for (const i of [31, 34, 38, 68, 89, 93, 139, 142, 145, 148, 150]) cmp[i] = _num(computeCompassBonus(i, S));
    const arc = {};
    for (const i of [17, 34, 56]) arc[i] = _num(arcaneUpgBonus(i, S));
    return {
      killroy4: _num(computeKillroyBonus(4, S)), shopUpg49: _num(shopUpgBonus(49, S)),
      vial7masta: _num(computeVialByKey('7masta', S, ci)), button4: _num(computeButtonBonus(4, S)),
      companion38: _num(companionBonusForSave(38, S)), etc101: etc('101'), etc106: etc('106'),
      cardFmRat: _num(computeCardLv('fm_rat', S)),
      meritoc25: _num(computeMeritocBonusz(25, S, ci)),
      pristine18: _num(pristineBon(18, S)), pristine19: _num(pristineBon(19, S)), pristine22: _num(pristineBon(22, S)),
      lore0: _num(computeLoreEpisodeBonus(0, S)), lore2: _num(computeLoreEpisodeBonus(2, S)), lore6: _num(computeLoreEpisodeBonus(6, S)),
      emperor1: _num(computeEmperorBon(1, S)), emperor4: _num(computeEmperorBon(4, S)), emperor6: _num(computeEmperorBon(6, S)),
      bubbleW13: _num(finalBubbleValByKey('W13', ci, S)), bubbleA13: _num(finalBubbleValByKey('A13', ci, S)), bubbleM13: _num(finalBubbleValByKey('M13', ci, S)),
      gambit12: _num(computeGambitBonus(12, S)), etc76: etc('76'), etc79: etc('79'), etc85: etc('85'), etc95: etc('95'),
      grimoire23: _num(grimoireUpgBonus(23, GrimoireUpg, S)), grimoire48: _num(grimoireUpgBonus(48, GrimoireUpg, S)),
      arcade40: _num(arcadeBonus(40, S)), arcade47: _num(arcadeBonus(47, S)), arcade50: _num(arcadeBonus(50, S)),
      mf121: _num(mainframeBonus(121, S)), mf122: _num(mainframeBonus(122, S)), mf123: _num(mainframeBonus(123, S)),
      palette4: _num(computePaletteBonus(4, S)), palette22: _num(computePaletteBonus(22, S)), palette29: _num(computePaletteBonus(29, S)),
      exotic53: _num(computeExoticBonus(53, S)), exotic54: _num(computeExoticBonus(54, S)), exotic55: _num(computeExoticBonus(55, S)),
      tn196: tn1(196), tn198: tn1(198), tn421: tn1(421), tn423: tn1(423), tn586: tn1(586), tn599: tn1(599),
      compass: cmp, arcane: arc, bunX: Number(S.bundlesData?.bun_x) === 1 ? 1 : 0,
    };
  }, 'AllMasterclassDropz/GrimoireBonesDropDEC/ExtraDust/ExtraTachyon static terms; OLA 333/359/390/393 logs and GenINFO 125/132 are applied live',
  companionsKnown ? {} : { partial: true, note: 'companion ownership metadata missing: Companion 38 taken as unowned' });
  const live0 = { ola333: ola[333], ola359: ola[359], ola390: ola[390], ola393: ola[393], gi125: 0, gi132: 0 };
  const coefEntry = entries.formDropCoef;
  const atStart = (key, fn, src) => put(key, () => fn(values.formDropCoef, live0), src + ' at run start (live during the run)',
    coefEntry?.partial ? { partial: true, note: coefEntry.note } : {});
  atStart('bonesDropDec', grimoireBonesDropDEC, 'Summoning("GrimoireBonesDropDEC") src 91805');
  atStart('extraDust', windwalkerExtraDust, 'Windwalker("ExtraDust") src 92322');
  atStart('extraTachyon', arcaneExtraTachyon, 'ArcaneType("ExtraTachyon") src 92409');
}

// Dungon() (src 79835): dungeon scene index by map.
export const DUNGON = { 39: 0, 70: 0, 118: 0, 40: 1, 71: 2, 119: 3 };