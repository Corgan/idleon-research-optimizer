// Owns loader state: run only in the dedicated speedrun worker.
import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';
import * as D from '../save/data.js';
import { createCombatSim, createRng } from './systems/common/combat-sim-core.js?v=vman-speedrun-3';
import { autoPlayer, clickGround, manualPressGate, hitscanning } from './systems/common/combat-sim-player.js?v=vman-speedrun-3';
import { talent } from './systems/common/talent.js';
import { computeMultiKillPerTier } from './systems/common/overkill.js';
import { createStatContext } from './stat-context.js';
import { classifyMap } from './systems/common/map-access.js';
import { companionBonusForSave } from './data/common/companions.js';
import { MONSTERS } from './data/game/monsters.js';
import { ITEMS } from './data/game/items.js';
import { SCENE_GEOMETRY, SCENE_SPAWNS } from './data/game/scenes.js';
import { VMAN_PORTALS } from './data/game/vman-portals.js';
import {
  mapDisplayName, mapPrimaryTarget, mapTransitions, mapIndexByInternalName,
  mapMultiCharRequirement,
} from './data/common/maps.js';
import {
  applyCombatSetup, readRawKey, rowValues, characterCount, characterName, readEquipment, ownedItemInstances,
} from './systems/common/combat-sim-setup.js';
import {
  startVmanSpeedrun, observeVmanPortal, finishVmanSpeedrun, awardVmanBoss, vmanBossRespawnDivisor,
} from './systems/common/vman-speedrun.js?v=vman-speedrun-1';
import {
  vmanBossChoices, vmanBossEntry, createVmanBossEncounter, vmanBossExit,
} from './systems/common/vman-speedrun-bosses.js?v=vman-speedrun-5';
import { vmanBossDefinition } from './data/common/vman-speedrun-bosses.js';

const clone = value => structuredClone(value);
const N = value => Number(value) || 0;
const note = (notes, text) => notes.add(text);
const value = (ci, tab, id) => Number(talent.resolve(id, { saveData, charIdx: ci }, { tab }).val);
const accountKey = raw => readRawKey(raw, 'OptionsListAccount') !== undefined ? 'OptionsListAccount' : 'OptLacc';
const patch = (raw, ci, changes) => applyCombatSetup(raw, { version: 1, charIdx: ci,
  patches: Object.entries(changes).map(([key, v]) => ({ system: 'raw', key, path: [], value: v })) });

function requiredNumber(input, label) {
  if ((typeof input !== 'number' && typeof input !== 'string') || String(input).trim() === '' || !Number.isFinite(Number(input)))
    throw new Error(label + ' is unavailable.');
  return Number(input);
}

export function vmanSpeedrunRoster(raw) {
  return Array.from({ length: characterCount(raw) }, (_, charIdx) => {
    const classId = Number(readRawKey(raw, 'CharacterClass_' + charIdx));
    const eligible = classId === 4 || classId === 5;
    return { charIdx, name: characterName(raw, charIdx), classId, eligible,
      reason: eligible ? '' : 'Void Trial requires a Voidwalker or Virtuoso.' };
  });
}

function multichar(run, map, database, ci) {
  return database.reduce((total, character, index) => {
    const n = requiredNumber((index === ci ? run.kla : character)?.[map]?.[0], 'Account portal progress');
    return total + (n <= 0 ? 1 : 0);
  }, 0);
}

function enterable(run, map, id, database, ci) {
  const requirement = run.kla[map]?.[id];
  const known = (typeof requirement === 'number' || typeof requirement === 'string') &&
    String(requirement).trim() !== '' && Number.isFinite(Number(requirement));
  return id < 0 || (known && Number(requirement) < 1 &&
    (id !== 0 || Math.round(mapMultiCharRequirement(map) - multichar(run, map, database, ci)) <= 0));
}

function selectable(run, database, ci, qc, options, S) {
  let worlds = 1;
  for (let world = 0; world < 6; world++)
    if (requiredNumber(run.kla[50 * world]?.[0], 'World portal requirement') <= 0) worlds = world + 2;
  const result = new Set([0, 6, 50, 51, 54, 100, 101, 102, 150, 200, 250, 300].filter(m => Math.floor(m / 50) < worlds));
  if (N(S.lv0AllData?.[0]?.[0]) > 16) result.add(41);
  if (N(options[265]) > 0) result.add(42);
  if (worlds >= 2 && N(options[266]) > 0) result.add(73);
  if (worlds >= 3 && N(D.dreamData?.[2]) >= 1) result.add(120);
  if (worlds >= 4 && N(qc.Rift_Ripper1) === 1) result.add(166);
  if (worlds >= 5 && N(S.holesData?.[1]?.[0]) >= 1) result.add(216);
  for (let map = 0; map < worlds * 50; map++) {
    const transitions = mapTransitions(map);
    for (let t = 1; t < transitions.length; t++) {
      const target = mapIndexByInternalName(transitions[t]?.[1]);
      if (target >= 0 && Math.floor(target / 50) === Math.floor(map / 50) && enterable(run, map, t - 1, database, ci))
        result.add(target);
    }
  }
  if (result.has(15)) result.add(8);
  if (enterable(run, 14, 1, database, ci)) result.add(17);
  return result;
}

function freeMaps(S) {
  const maps = new Set();
  for (const [achievement, map] of [[41, 27], [45, 11], [114, 65]])
    if (N(S.achieveRegData?.[achievement]) === -1) maps.add(map);
  if (N(S.holesData?.[13]?.[2]) >= 1) maps.add(216);
  return maps;
}

function teleportCost(current, target, charges, companion, options, free, qc) {
  if (target > 150 && N(qc.Gobo5) !== 1) return null;
  if (target > 250 && N(qc.Lafu_Shi6) !== 1) return null;
  const towns = current % 50 === 0 && target % 50 === 0 && N(options[95]) === 1;
  if (!(charges > 0 || companion === 1 || towns || free.has(target))) return null;
  return free.has(target) || companion === 1 || companion === 1.5 || towns ? 0 : 1;
}

function portalPosition(map, portal) {
  const geo = SCENE_GEOMETRY[map];
  const point = portal.position || geo?.portals?.[portal.geometryIndex];
  if (!point || !geo) return null;
  const x = Number(point[0]) + 20, y = Number(point[1]);
  let node = -1, distance = Infinity;
  geo.nodes.forEach((n, i) => {
    if (N(n.length) - N(n.x) < 50) return;
    const d = Math.abs(N(n.y) - y - 70) + Math.max(N(n.x) - x, 0, x - N(n.length));
    if (d < distance) { node = i; distance = d; }
  });
  return node < 0 ? null : { node, x: Math.max(Number(geo.nodes[node].x) + 25,
    Math.min(Number(geo.nodes[node].length) - 25, x)) };
}

function useful(run, map) {
  return classifyMap(map).visibility === 'default' &&
    SCENE_SPAWNS[map]?.mobs?.some(([type]) => MONSTERS[type]?.AFKtype === 'FIGHTING') &&
    VMAN_PORTALS[map]?.some(p => p.id >= 0 && N(run.kla[map]?.[p.id]) > 0);
}

function townUnlock(map, run, options) {
  const flag = map === 200 ? 194 : map === 250 || map === 300 ? 408 : null;
  const target = map === 300 ? 250 : map;
  return flag !== null && Number(options[flag]) === 1 && Number(run.kla[target]?.[0]) === 1 ? target : null;
}

function ringIdentity(ring) {
  return ring.key + ':' + JSON.stringify(Object.entries(ring.stats || {}).sort(([a], [b]) => a.localeCompare(b)));
}

function equipWorldRings(raw, ci, map, startingRings) {
  const world = Math.floor(map / 50) + 1, swaps = [];
  const effect = '%_KILLS_IN_WORLD_' + world;
  for (const slot of [5, 7]) {
    const equipped = readEquipment(raw, ci).armor;
    const current = equipped.find(r => r.slot === slot);
    const used = equipped.find(r => r.slot === 5);
    const bag = ownedItemInstances(raw, ci).filter(r => r.source === 'inventory' && r.ci === ci &&
      Number(rowValues(readRawKey(raw, 'ItemQTY_' + ci))[r.index]) === 1 && ITEMS[r.key]?.Type === 'RING' &&
      Number(ITEMS[r.key].lvReqToEquip) <= Number(rowValues(readRawKey(raw, 'Lv0_' + ci))[0]));
    const strength = ring => ['UQ1', 'UQ2'].reduce((sum, uq) => sum +
      (ITEMS[ring.key]?.[uq + 'txt'] === effect ? N(ITEMS[ring.key][uq + 'val']) : 0) +
      (ring.stats?.[uq + 'txt'] === effect ? N(ring.stats[uq + 'val']) : 0), 0);
    const pool = [{ key: current.item, stats: current.stats }, ...bag];
    const remaining = startingRings.slice();
    if (slot === 7) {
      const usedIndex = remaining.findIndex(r => ringIdentity(r) === ringIdentity({ key: used.item, stats: used.stats }));
      if (usedIndex >= 0) remaining.splice(usedIndex, 1);
    }
    const rank = ring => strength(ring) > 0 ? 1000 + strength(ring)
      : remaining.some(r => ringIdentity(r) === ringIdentity(ring)) ? 1 : 0;
    pool.sort((a, b) => rank(b) - rank(a));
    const target = pool[0];
    if (target.index === undefined || rank(target) <= rank(pool.find(r => r.index === undefined))) continue;
    raw = applyCombatSetup(raw, { version: 1, charIdx: ci, patches: [
      { system: 'raw', key: 'EquipOrder_' + ci, path: [0, slot], value: target.key },
      { system: 'raw', key: 'EMm0_' + ci, path: [slot], value: target.stats || {} },
      { system: 'raw', key: 'InventoryOrder_' + ci, path: [target.index], value: current.item },
      { system: 'raw', key: 'IMm_' + ci, path: [target.index], value: current.stats || {} },
    ] });
    swaps.push({ slot, from: current.item, to: target.key,
      name: ITEMS[target.key].displayName.replaceAll('_', ' '), inventorySlot: target.index });
  }
  return { raw, swaps };
}

function radiusWindow(sim, readyAt) {
  const remaining = Math.max(0, ...sim.state.kla.map(N));
  const credit = Math.max(1, sim.rewards.killCreditPerKill(sim));
  return sim.timeMs / 1000 >= readyAt && remaining > credit * 2;
}

function walkingEdges(run, map, database, ci) {
  const edges = [];
  for (const [t, transition] of mapTransitions(map).entries()) {
    const target = mapIndexByInternalName(transition?.[1]);
    if (target < 0 || !SCENE_GEOMETRY[target] || classifyMap(target).visibility !== 'default' ||
        !enterable(run, map, t - 1, database, ci)) continue;
    const portal = VMAN_PORTALS[map]?.find(p => p.id === t - 1);
    const position = portal && portalPosition(map, portal);
    if (position) edges.push({ map: target, cost: 0, method: 'Walk through portal', position, travel: .2, fadeIn: .2 });
  }
  return edges;
}

function bossCandidates(run, raw, ci, policy, attempted) {
  if (policy % 3 === 0 || run.bossRespawnPct <= 0) return [];
  const info = rowValues(readRawKey(raw, 'BossInfo')).map(rowValues);
  const result = [];
  for (let bossId = 0; bossId < 6; bossId++) {
    if (attempted.has(bossId) || run.scored.includes('Boss' + bossId) || !info[bossId === 5 ? 4 : bossId]?.length) continue;
    if (bossId === 3 && !(rowValues(readRawKey(raw, 'TaskZZ1'))[3]?.[6] > 2.5)) continue;
    const difficulty = bossId === 5 ? Number(info[4][0]) : 2 - Math.floor(policy / 3) % 3;
    const quote = vmanBossEntry(raw, ci, { bossId, difficulty });
    const options = rowValues(readRawKey(raw, accountKey(raw)));
    if (bossId === 5 ? quote.attemptsBefore === null || quote.attemptsBefore >= 1 ||
        !Number.isSafeInteger(Number(options[369])) || Number(options[369]) < 0
      : ![0, 1, 2].some(d => vmanBossEntry(raw, ci, { bossId, difficulty: d }).paymentAffordable === true)) continue;
    result.push({ bossId, difficulty, goal: quote.doorMap });
  }
  return result;
}

function choose(run, current, database, ci, S, raw, policy, damage, attempted = new Set(), tactics = {}) {
  const options = rowValues(readRawKey(raw, accountKey(raw)));
  const qc = readRawKey(raw, 'QuestComplete_' + ci) || {};
  const choices = [], free = freeMaps(S), companion = companionBonusForSave(30, S);
  const charges = N(readRawKey(raw, 'CYWorldTeleports'));
  const maps = selectable(run, database, ci, qc, options, S);
  const bosses = bossCandidates(run, raw, ci, policy, attempted);
  const bossGoals = new Map(bosses.map(b => [b.goal, b]));
  for (const boss of bosses) if (current === boss.goal) {
    const definition = vmanBossDefinition(boss.bossId, boss.difficulty);
    choices.push({ ...boss, map: definition.mapIdx, cost: 0, method: 'Enter ' + definition.name,
      kind: 'boss-entry', position: { node: definition.doorNode, x: Number(SCENE_GEOMETRY[current].nodes[definition.doorNode].x) },
      travel: 1.5, fadeIn: .7, hops: 0 });
  }
  for (const map of maps) {
    if (map === current || (!useful(run, map) && !bossGoals.has(map) && townUnlock(map, run, options) === null)) continue;
    const cost = teleportCost(current, map, charges, companion, options, free, qc);
    if (cost !== null) choices.push({ map, goal: map, cost, method: 'World-map teleport', travel: .3, fadeIn: .3, hops: 0,
      ...(bossGoals.has(map) ? bossGoals.get(map) : {}) });
  }
  // Traverse already open maps only toward a still-productive frontier.
  const queue = [{ map: current, first: null, hops: 0 }], seen = new Set([current]);
  for (let q = 0; q < queue.length; q++) {
    const path = queue[q];
    for (const edge of walkingEdges(run, path.map, database, ci)) {
      if (seen.has(edge.map)) continue;
      seen.add(edge.map);
      const first = path.first || edge, hops = path.hops + 1;
      if (useful(run, edge.map) || townUnlock(edge.map, run, options) !== null)
        choices.push({ ...first, goal: edge.map, hops });
      else queue.push({ map: edge.map, first, hops });
      if (bossGoals.has(edge.map)) choices.push({ ...first, ...bossGoals.get(edge.map), hops });
    }
  }
  for (const c of choices) {
    if (townUnlock(c.goal, run, options) !== null) { c.rank = -3 / (1 + c.hops + c.cost); continue; }
    // Independent policies reserve a detour for each native difficulty. This is
    // route ordering only: only the real engine's death event can award points.
    if (c.bossId !== undefined) { c.rank = -1 / (1 + c.hops + c.cost); continue; }
    const needs = (VMAN_PORTALS[c.goal] || []).filter(p => p.id >= 0).map(p => Math.max(0, N(run.kla[c.goal]?.[p.id])));
    const hp = N(MONSTERS[mapPrimaryTarget(c.goal)]?.MonsterHPTotal);
    const required = Math.max(1, Math.min(...needs.filter(n => n > 0)));
    const effort = required * Math.max(.02, hp / Math.max(1, damage));
    const world = Math.floor(c.goal / 50);
    c.rank = effort / (1 + world * (policy % 4) * .5)
      + c.hops * 2 + c.cost * (Math.floor(policy / 4) + 1);
    if (policy % 3 !== 0 && (tactics.radiusReady || tactics.buffSeconds > 2) && hp <= damage) {
      // Ranking proxy only; the engine still has to land every hit and kill.
      const window = tactics.radiusReady ? 'Screen-clear high-count map' : 'Use remaining Multikill window';
      c.rank = c.hops * 2 + c.cost + Math.max(.02, hp / Math.max(1, damage)) + 100 / Math.sqrt(required);
      c.tactic = window;
    }
  }
  return choices.sort((a, b) => a.rank - b.rank || ((policy % 2 ? b.map - a.map : a.map - b.map)))[0] || null;
}

function carry(raw, sim, run, ci) {
  const st = sim.state, food = st.food, changes = {
    ['KLA_' + ci]: run.kla,
    ['BuffsActive_' + ci]: st.buffsActive,
    ['AtkCD_' + ci]: st.attackCooldowns,
  };
  const options = rowValues(readRawKey(raw, accountKey(raw)));
  for (const [key, v] of Object.entries(st.ola || {})) options[key] = v;
  options[158] = run.highestScore;
  changes[accountKey(raw)] = options;
  if (st.classExp?.available) {
    const levels = rowValues(readRawKey(raw, 'Lv0_' + ci)), exp = rowValues(readRawKey(raw, 'Exp0_' + ci));
    levels[0] = st.classExp.level; exp[0] = st.classExp.exp;
    changes['Lv0_' + ci] = levels; changes['Exp0_' + ci] = exp;
  }
  if (food) {
    const order = rowValues(readRawKey(raw, 'EquipOrder_' + ci)).map(rowValues);
    const qty = rowValues(readRawKey(raw, 'EquipQTY_' + ci)).map(rowValues);
    order[2] = food.order.slice(); qty[2] = food.qty.slice();
    changes['EquipOrder_' + ci] = order; changes['EquipQTY_' + ci] = qty;
    const chest = rowValues(readRawKey(raw, 'ChestOrder')), quantities = rowValues(readRawKey(raw, 'ChestQuantity'));
    for (const [key, remaining] of Object.entries(food.storage || {})) {
      let debit = chest.reduce((sum, item, i) => sum + (item === key ? N(quantities[i]) : 0), 0) - N(remaining);
      for (let i = 0; i < chest.length && debit > 0; i++) if (chest[i] === key) {
        const take = Math.min(debit, N(quantities[i])); quantities[i] = N(quantities[i]) - take; debit -= take;
      }
    }
    if (quantities.length) changes.ChestQuantity = quantities;
  }
  if (st.inventory) {
    changes['InventoryOrder_' + ci] = st.inventory.order;
    changes['ItemQTY_' + ci] = st.inventory.quantity;
  }
  if (st.cards0) changes.Cards0 = st.cards0;
  if (st.obol) changes.ObolInvOr = st.obol.order;
  if (st.obolFragments != null) changes.CYObolFragments = st.obolFragments;
  return patch(raw, ci, changes);
}

function refreshMultikill(sim, run, ci) {
  const beforeBuffs = D.buffsActiveData, beforeOptions = D.optionsListData;
  const buffs = beforeBuffs.slice(), options = beforeOptions.slice();
  buffs[ci] = sim.state.buffsActive; options[158] = run.highestScore;
  try {
    D.assignSaveData({ buffsActiveData: buffs, optionsListData: options });
    const ctx = createStatContext({ saveData: sim.saveData, charIdx: ci, mapIdx: sim.mapIdx, layer1: { activeCombat: true } });
    const result = computeMultiKillPerTier(ci, ctx, { mapIdx: sim.mapIdx });
    const amount = requiredNumber(typeof result === 'object' ? result.val : result, 'Live Multikill per tier');
    sim.inputs.values.multiKillPerTier = amount;
  } finally { D.assignSaveData({ buffsActiveData: beforeBuffs, optionsListData: beforeOptions }); }
}

function* selectBossOpening(raw, ci, candidate, run, previous, rng, elapsed, startingRings) {
  const { bossId } = candidate;
  const reports = [];
  const tasks = [0, 1, 2].map(i => rowValues(readRawKey(raw, 'TaskZZ' + i)).map(rowValues));
  const info = rowValues(readRawKey(raw, 'BossInfo')).map(rowValues);
  const options = rowValues(readRawKey(raw, accountKey(raw)));
  const savedShowdown = bossId === 5 ? requiredNumber(options[369], 'Saved Emperor showdown') : null;
  function* check(difficulty, showdown = null) {
    const definition = vmanBossDefinition(bossId, difficulty);
    const admission = vmanBossEntry(raw, ci, { bossId, difficulty });
    if (bossId < 5 && admission.paymentAffordable !== true) {
      reports.push({ difficulty, available: false, reason: admission.reason });
      return null;
    }
    const trialInfo = clone(info), trialOptions = options.slice(), trialKla = clone(run.kla);
    const changes = {};
    if (bossId < 5) {
      trialInfo[bossId] = admission.bossRow;
      const keys = rowValues(readRawKey(raw, 'CYKeysAll') !== undefined
        ? readRawKey(raw, 'CYKeysAll') : readRawKey(raw, 'CurrenciesOwned')?.KeysAll).slice();
      keys[bossId] = admission.keysBefore - admission.keyCost;
      changes.CYKeysAll = keys;
      trialOptions[195] = N(trialOptions[195]) + 4;
    } else {
      trialOptions[369] = showdown;
      trialOptions[370] = Math.round(admission.attemptsBefore + 1);
    }
    trialKla[[29, 66, 114, 165, 114, 114][bossId]][0] = 1;
    let trialRaw = patch(raw, ci, { BossInfo: trialInfo, [accountKey(raw)]: trialOptions,
      ...changes, ['KLA_' + ci]: trialKla,
      ['CurrentMap_' + ci]: definition.mapIdx, ['AFKtarget_' + ci]: mapPrimaryTarget(definition.mapIdx) });
    trialRaw = equipWorldRings(trialRaw, ci, definition.mapIdx, startingRings).raw;
    loadSaveData(trialRaw);
    const radiusRange = value(ci, 1, 46);
    const encounter = createVmanBossEncounter({ bossId, difficulty, bossInfo: trialInfo, tasks, showdown });
    const fork = createRng(rng.state() || ((0 - 0x6d2b79f5) >>> 0));
    if (rng.state() === 0) { fork.next(); fork.calls = 0; }
    let returned = false, walking = false, active = false;
    const exit = vmanBossExit(bossId);
    const player = autoPlayer({ useSavedCooldowns: true, useSavedFoodCooldowns: true,
      clockOffsetMs: Math.round(elapsed * 1000), autoCastFilter: (_sim, id) => id !== 45 });
    const step = player.step, init = player.init;
    player.init = sim => { init(sim); sim.player.autoMove = false; };
    player.step = sim => {
      if (sim.timeMs < 700) return;
      if (!active) { active = true; sim.player.autoMove = true; }
      step(sim);
    };
    const sim = createCombatSim({ saveData, charIdx: ci, mapIdx: definition.mapIdx, options: {
      rawSave: trialRaw, rng: fork, transit: true, encounter, player,
      inputOverrides: { useSavedBuffs: true, initialHp: previous.player.hp, initialMp: previous.player.mp },
      sceneRespawnDivisor: vmanBossRespawnDivisor(run),
      onPortalConnection: (_sim, connection) => { if (walking && connection.to === exit.target.node) returned = true; },
    } });
    if (previous.state.food) sim.state.food.cd = previous.state.food.cd.slice();
    if (previous.state.classExp) sim.state.classExp.giftCount = previous.state.classExp.giftCount;
    refreshMultikill(sim, run, ci);
    sim.on('buff', event => { if (event.id === 46) refreshMultikill(sim, run, ci); });
    sim.on('buffExpired', event => { if (event.id === 46) refreshMultikill(sim, run, ci); });
    const limit = Math.min(45, run.durationSeconds - elapsed);
    while (!sim.unsupported && !sim.ended && sim.timeMs < limit * 1000) {
      if (!walking && sim.timeMs >= 700 && sim.state.attackSelected === -1 &&
          manualPressGate(sim, 46) === null && sim.world.monsters(sim).some(mon => hitscanning(sim, mon,
            sim.player.x + sim.player.width / 2, sim.player.y + sim.player.height / 2, radiusRange))) {
        sim.state.attackSelected = 46;
      }
      sim.step();
      const state = encounter.summary();
      if (state.failedAt != null || sim.player.dead) break;
      if (state.status === 'defeated' && !walking && sim.timeMs >= 700) {
        sim.player.autoMove = false;
        walking = clickGround(sim, exit.target.node, exit.target.x);
      }
      if (returned) {
        for (let i = 0; i < 20; i++) sim.step();
        break;
      }
      if (sim.timeMs % 1000 === 0) yield { boss: definition.name, difficulty, showdown, seconds: sim.timeMs / 1000 };
    }
    const state = encounter.summary();
    const available = returned && sim.timeMs <= limit * 1000 && !sim.player.dead &&
      state.status === 'defeated' && state.failedAt == null &&
      (bossId !== 5 || state.hits === 1);
    reports.push({ difficulty, showdown, available, seconds: sim.timeMs / 1000,
      reason: available ? null : state.reason || sim.unsupported ||
        (bossId === 5 && state.status === 'defeated' && state.hits !== 1 ? 'Not a one-hit Emperor kill.'
          : 'No opening victory and physical return within the probe window.') });
    return available ? { difficulty, showdown, seconds: sim.timeMs / 1000 } : null;
  }
  try {
    let selected = null;
    if (bossId < 5) {
      for (let difficulty = candidate.difficulty; difficulty >= 0 && !selected; difficulty--)
        selected = yield* check(difficulty);
    } else {
      selected = yield* check(candidate.difficulty, savedShowdown);
      if (!selected && savedShowdown > 0) {
        selected = yield* check(candidate.difficulty, 0);
        if (selected) {
          let lo = 0, hi = savedShowdown;
          while (hi - lo > 1) {
            const mid = Math.floor(lo + (hi - lo) / 2);
            const measured = yield* check(candidate.difficulty, mid);
            if (measured) { lo = mid; selected = measured; } else hi = mid;
          }
        }
      }
    }
    return { selected, reports, savedShowdown };
  } finally { loadSaveData(raw); }
}

function* simulateRoute(original, settings, policy) {
  const { charIdx: ci, seed } = settings;
  let raw = clone(original);
  loadSaveData(raw);
  const database = Array.from({ length: characterCount(raw) }, (_, i) =>
    rowValues(readRawKey(raw, 'KLA_' + i)).map(rowValues));
  let run = startVmanSpeedrun({ classId: readRawKey(raw, 'CharacterClass_' + ci),
    rerunSeconds: value(ci, 1, 45), sailingLevel: saveData.lv0AllData?.[ci]?.[13],
    highestScore: requiredNumber(D.optionsListData[158], 'Saved speedrun record'), bossRespawnPct: value(ci, 2, 47) });
  const notes = new Set([
    'Experimental routing checks all six bosses with real engine hits and physical returns. Non-Kruk encounters are bounded opening kills, not complete prolonged fights.',
    'Fresh activation assumes full HP/MP and a ready Void Trial. Export-time temporary buffs and cooldowns are retained; Void Trial itself is not recast.',
    'Buff/cooldown clocks use one nominal continuous one-second phase across maps. Other scene callbacks restart; the client-global phase and loading stalls are unknown.',
    'Combat uses the existing Auto player. Account production, cross-map summoned actors and progression-dependent account cache refreshes are excluded.',
    'Only source-extracted ordinary portal actors score. Conditional scene initialization has not been exhaustively reconciled.',
    'Bounded deterministic route policies are best-found samples, not a global optimum or a guaranteed in-game score.',
    'Boss policies try their highest allowed affordable difficulty first, falling back only after engine checks. Emperor lowering uses rebuilt isolated saves and a bounded sampled threshold search, not an optimality proof.',
    'World kill-ring swaps use only equipped rings and single physical copies carried by the selected character, preserving their upgrade maps. Storage and other characters are not accessed.',
  ]);
  const bosses = vmanBossChoices({ ...saveData, bossInfoData: readRawKey(raw, 'BossInfo'),
    OptionsListAccount: D.optionsListData }, ci);
  for (const boss of bosses) if (!boss.available && boss.reason) note(notes, boss.reason);
  const inventory = rowValues(readRawKey(raw, 'InventoryOrder_' + ci));
  const quantities = rowValues(readRawKey(raw, 'ItemQTY_' + ci));
  if (inventory.some((key, i) => key === 'Quest105' && N(quantities[i]) > 0))
    throw new Error('Remove the Unstable Reliquarium before a speedrun: native world-map travel destroys it and kills the character.');
  const rng = createRng(seed), attempted = new Set(), route = [];
  const startingRings = readEquipment(raw, ci).armor.filter(r => r.slot === 5 || r.slot === 7)
    .map(r => ({ key: r.item, stats: r.stats }));
  // Activation's Teleport(1) has a 1.5 s outgoing and 0.8 s incoming fade.
  // The old scene's combat during activation is outside this map-entry model.
  let elapsed = Math.min(1.5, run.durationSeconds), map = 1, previous = null, next = null, status = 'time-expired';
  let bossVisit = null, arrival = { fadeIn: .8 };
  const buffs = rowValues(readRawKey(raw, 'BuffsActive_' + ci)).map(rowValues).filter(b => N(b[0]) !== 45)
    .concat([[45, run.durationSeconds, run.durationSeconds]]);
  const cooldowns = clone(readRawKey(raw, 'AtkCD_' + ci) || {});
  for (const buff of buffs) buff[1] = Math.max(0, N(buff[1]) - Math.floor(elapsed));
  for (const key of Object.keys(cooldowns)) if (N(cooldowns[key]) > 0)
    cooldowns[key] = Math.round(Math.max(0, N(cooldowns[key]) - Math.floor(elapsed)));
  raw = patch(raw, ci, { ['KLA_' + ci]: run.kla, ['BuffsActive_' + ci]:
    buffs.filter(b => N(b[1]) > 0), ['AtkCD_' + ci]: cooldowns });
  while (elapsed < run.durationSeconds) {
    if (bossVisit) run.kla[[29, 66, 114, 165, 114, 114][bossVisit.bossId]][0] = 1;
    const rings = equipWorldRings(raw, ci, map, startingRings);
    raw = patch(rings.raw, ci, { ['CurrentMap_' + ci]: map, ['AFKtarget_' + ci]: mapPrimaryTarget(map) });
    if (bossVisit) raw = patch(raw, ci, { ['KLA_' + ci]: run.kla });
    loadSaveData(raw);
    const radiusRange = value(ci, 1, 46);
    const overrides = { useSavedBuffs: true };
    if (previous) { overrides.initialHp = previous.player.hp; overrides.initialMp = previous.player.mp; }
    const encounter = bossVisit && createVmanBossEncounter({ bossId: bossVisit.bossId,
      difficulty: bossVisit.difficulty, bossInfo: readRawKey(raw, 'BossInfo'),
      tasks: saveData.tasksGlobalData, showdown: bossVisit.showdown });
    const readyAt = arrival?.fadeIn || 0;
    const player = autoPlayer({ useSavedCooldowns: true, useSavedFoodCooldowns: true,
      clockOffsetMs: Math.round(elapsed * 1000),
      autoCastFilter: (active, id) => id !== 45 && (id !== 46 || encounter || radiusWindow(active, readyAt)) });
    const playerInit = player.init, playerStep = player.step;
    let active = false;
    player.init = sim => { playerInit(sim); sim.player.autoMove = false; };
    player.step = sim => {
      if (sim.timeMs / 1000 < readyAt) return;
      if (!active) { active = true; sim.player.autoMove = true; }
      playerStep(sim);
    };
    let exitConnection = null;
    const sim = createCombatSim({ saveData, charIdx: ci, mapIdx: map, seed,
      options: { rawSave: raw, rng, transit: true, inputOverrides: overrides,
        encounter: encounter || undefined, sceneRespawnDivisor: vmanBossRespawnDivisor(run),
        onPortalConnection: encounter ? (active, connection) => {
          if (next?.kind === 'boss-return' && connection.to === next.position.node)
            exitConnection = { ...connection, movementState: active.player.pmm[0] };
        } : undefined,
        player } });
    if (sim.unsupported) { status = 'unsupported-map'; note(notes, sim.unsupported); break; }
    if (previous?.state.food) sim.state.food.cd = previous.state.food.cd.slice();
    if (previous?.state.classExp) sim.state.classExp.giftCount = previous.state.classExp.giftCount;
    if (arrival?.spawn) {
      Object.assign(sim.player, arrival.spawn, { vx: 0, vy: 0, target: null });
      sim.player.mouseClickX = sim.player.x + 35;
      sim.player.pmm[0] = 1; sim.player.pmm[2] = sim.player.node; sim.player.pmm[3] = [];
      sim.player.takeDmgTimer = previous.player.takeDmgTimer;
    }
    arrival = null;
    for (const [key, entry] of Object.entries(sim.inputs.entries)) if (entry.partial || entry.unavailable)
      note(notes, key + ': ' + (entry.reason || entry.note || entry.source || 'input unavailable'));
    const cached = new Map((encounter ? [] : VMAN_PORTALS[map] || []).filter(p => p.id >= 0 &&
      p.id < run.kla[map].length).map(p => [p.id, run.kla[map][p.id]]));
    if (map === 16) cached.set(1, run.kla[map][1]);
    const row = { mapIdx: map, name: mapDisplayName(map).replaceAll('_', ' '), enteredAt: elapsed,
      scoreBefore: run.scored.length, scoreAfter: run.scored.length, kills: 0, reason: 'Farm portal requirements',
      ringSwaps: rings.swaps, radiusCasts: [], multikillSeconds: 0 };
    sim.on('buff', event => { if (event.id === 46) refreshMultikill(sim, run, ci); });
    sim.on('buffExpired', event => { if (event.id === 46) refreshMultikill(sim, run, ci); });
    sim.on('cast', event => {
      if (Number(event.id) === 46) row.radiusCasts.push(elapsed + sim.timeMs / 1000);
    });
    const options = rowValues(readRawKey(raw, accountKey(raw)));
    const unlock = townUnlock(map, run, options);
    if (unlock !== null) sim.later(1000, () => {
      run.kla[unlock][0] = 0;
      if (unlock === map) sim.state.kla[0] = 0;
      sim.player.hp = sim.player.hpMax;
      row.worldUnlock = Math.floor(unlock / 50) + 2;
    });
    if (encounter) {
      const bossId = bossVisit.bossId;
      Object.assign(row, { bossId, difficulty: bossVisit.difficulty, showdown: bossVisit.showdown,
        admission: bossVisit.admission, openingChecks: bossVisit.checks,
        reason: 'Fight scripted ' + vmanBossDefinition(bossId, bossVisit.difficulty).name });
      sim.on('bossOpeningUnavailable', event => { row.openingFailure = event.reason; });
      sim.on('bossDefeated', event => {
        if (event.bossId !== bossId || event.difficulty !== bossVisit.difficulty) return;
        const remaining = Math.min(Math.max(0, run.durationSeconds - elapsed - sim.timeMs / 1000),
          Math.max(0, N(sim.state.buffsActive.find(b => N(b[0]) === 45)?.[1])));
        run = awardVmanBoss(run, { bossId, bossInfo: readRawKey(raw, 'BossInfo'), buff45: remaining });
        if (bossId >= 4) sim.state.ola[117] = Math.max(4, N(sim.state.ola[117] ?? D.optionsListData[117]));
        if (bossId === 5) sim.state.ola[369] = Math.round(bossVisit.showdown + 1);
      });
    }
    route.push(row);
    const fighting = SCENE_SPAWNS[map]?.mobs?.some(([type]) => MONSTERS[type]?.AFKtype === 'FIGHTING');
    let walking = false, arrived = false, lastRefresh = '', ticks = 0, chooseAfter = 0;
    sim.on('unmodelled', e => note(notes, e.key + ': ' + String(e.detail || 'not modelled')));
    while (elapsed + sim.timeMs / 1000 < run.durationSeconds && !sim.ended) {
      if (!next && sim.state.attackSelected === -1 &&
          manualPressGate(sim, 46) === null && (encounter ? sim.timeMs / 1000 >= readyAt : radiusWindow(sim, readyAt)) &&
          sim.world.monsters(sim).some(mon => hitscanning(sim, mon,
            sim.player.x + sim.player.width / 2, sim.player.y + sim.player.height / 2, radiusRange)))
        sim.state.attackSelected = 46;
      if (sim.state.buffsActive.some(b => N(b[0]) === 46 && N(b[1]) > 0)) row.multikillSeconds += .01;
      sim.step();
      if (row.openingFailure) {
        status = 'boss-opening-unavailable'; row.reason = row.openingFailure;
        row.encounter = encounter.summary();
        break;
      }
      run.kla[map] = clone(sim.state.kla);
      for (const [id, cache] of cached) {
        if (map === 16 && id === 1 && (sim.timeMs < 1100 || sim.timeMs % 1000 !== 100)) continue;
        const out = observeVmanPortal(run, { mapIdx: map, portalId: id, cachedRequirement: cache,
          currentRequirement: run.kla[map][id], buff45: N(sim.state.buffsActive.find(b => N(b[0]) === 45)?.[1]),
          expType: sim.inputs.values.defaultExpType, ordinary: !(map === 16 && id === 1),
          map16Observer: map === 16 && id === 1, multicharProgress: multichar(run, map, database, ci) });
        run = out.run; cached.set(id, out.cachedRequirement);
      }
      const refresh = run.highestScore + ':' + sim.state.buffsActive.some(b => N(b[0]) === 46 && N(b[1]) > 0);
      if (refresh !== lastRefresh) { refreshMultikill(sim, run, ci); lastRefresh = refresh; }
      if (elapsed + sim.timeMs / 1000 >= run.durationSeconds) break;
      const done = [...cached.keys()].every(id => N(run.kla[map]?.[id]) <= 0);
      const buffSeconds = N(sim.state.buffsActive.find(b => N(b[0]) === 46)?.[1]);
      const farmed = sim.timeMs / 1000 - readyAt;
      const left = Math.max(0, ...[...cached.keys()].map(id => N(run.kla[map]?.[id])));
      const costlySidePortal = run.scored.length > row.scoreBefore &&
        left > Math.max(1, sim.rewards.killCreditPerKill(sim)) * 10;
      const windowOver = farmed > 20 && buffSeconds <= 0;
      if (encounter && !next && encounter.summary().status === 'defeated' && sim.timeMs / 1000 >= readyAt) {
        const exit = vmanBossExit(bossVisit.bossId);
        next = { kind: 'boss-return', map: exit.destinationMap, cost: 0,
          method: 'Native boss return', travel: exit.fadeOutMs / 1000, fadeIn: exit.fadeInMs / 1000,
          position: { node: exit.target.node, x: exit.target.x }, spawn: exit.returnSpawn };
      }
      if (!encounter && !next && sim.timeMs >= chooseAfter &&
          sim.timeMs / 1000 >= Math.max(readyAt, unlock !== null ? 1 : 0) &&
          (done || costlySidePortal || windowOver || !SCENE_SPAWNS[map]?.mobs?.length)) {
        raw = carry(raw, sim, run, ci);
        next = choose(run, map, database, ci, saveData, raw, policy,
          requiredNumber(sim.inputs.values.damageMax, 'Route damage'), attempted, {
            radiusReady: manualPressGate(sim, 46) === null,
            buffSeconds: N(sim.state.buffsActive.find(b => N(b[0]) === 46)?.[1]),
          });
        if (!next) {
          if (!done && fighting) {
            // A failed tactical switch must not abandon the current portal.
            chooseAfter = sim.timeMs + 1000;
          } else {
            status = 'modelled-route-exhausted';
            row.reason = 'Stopped: no modeled next move; Void Trial still has time remaining';
            note(notes, 'No productive route remains within the implemented graph and proved boss admissions; this is not proof that the native speedrun has no legal continuation.');
            break;
          }
        }
      }
      if (next && !walking && next.position) {
        sim.player.autoMove = false;
        walking = clickGround(sim, next.position.node, next.position.x);
      }
      if (next?.kind === 'boss-return' && exitConnection) {
        const exit = vmanBossExit(bossVisit.bossId, { currentMap: map, movementState: exitConnection.movementState,
          movementAllowed: !sim.player.dead && !sim.player.menuOpen, localPlayer: true,
          exitConnectionReached: true, transitioning: false, killroyRoom: N(sim.state.killroyRoom) !== 0 });
        if (exit.legal !== true) { status = 'boss-exit-unavailable'; note(notes, exit.reason); break; }
        sim.player.takeDmgTimer = exit.takeDmgTimer;
        arrived = true; break;
      }
      if (next?.kind !== 'boss-return' && next && (!next.position || (sim.player.node === next.position.node &&
        Math.abs(sim.player.x + sim.player.width / 2 - next.position.x) < 30 && [1, 2].includes(sim.player.pmm[0])))) {
        arrived = true; break;
      }
      if (++ticks % 1000 === 0) yield { phase: 'Simulating route ' + (policy + 1), seconds: elapsed + sim.timeMs / 1000,
        score: run.scored.length, fraction: (elapsed + sim.timeMs / 1000) / run.durationSeconds };
    }
    elapsed += sim.timeMs / 1000;
    row.leftAt = elapsed; row.scoreAfter = run.scored.length; row.kills = N(sim.rewardsState.ledger.kills);
    if (!encounter && elapsed >= run.durationSeconds) row.reason = 'Void Trial timer expired';
    if (encounter) {
      row.encounter = encounter.summary();
      for (const exclusion of row.encounter.exclusions) note(notes, exclusion);
      if (!arrived && !row.openingFailure) row.reason = row.encounter.status === 'defeated'
        ? 'Trial ended before the native return completed' : 'Trial ended before the boss was defeated';
    }
    if (sim.ended) { status = sim.ended.reason; row.reason = status; break; }
    raw = carry(raw, sim, run, ci);
    if (elapsed >= run.durationSeconds || !arrived || !next) break;
    let pendingAdmission = null;
    if (next.kind === 'boss-entry') {
      const admission = vmanBossEntry(raw, ci, { bossId: next.bossId, difficulty: next.difficulty, currentMap: map,
        doorReached: sim.player.node === next.position.node && [1, 2].includes(sim.player.pmm[0]),
        movementAllowed: !sim.player.dead && !sim.player.menuOpen,
        killroyRoom: N(sim.state.killroyRoom) !== 0, transitioning: false,
        compassTempest: N(sim.state.tempest) !== 0 });
      // A lower affordable difficulty may pass even when this policy's ceiling does not.
      if (admission.legal !== true && !(admission.blocked.length === 1 &&
          admission.blocked[0] === 'Insufficient account boss keys.' && admission.unknown.length === 0)) {
        status = 'boss-entry-unavailable'; row.reason = status; note(notes, admission.reason); break;
      }
      pendingAdmission = admission;
    }
    row.reason = (next.tactic ? next.tactic + ' · ' : '') + next.method + ' to ' + mapDisplayName(next.map).replaceAll('_', ' ');
    const travel = Math.min(next.travel, Math.max(0, run.durationSeconds - elapsed));
    for (let i = 0; i < Math.round(travel * 100); i++) sim.step();
    elapsed += travel; row.leftAt = elapsed;
    raw = carry(raw, sim, run, ci);
    if (row.openingFailure) { status = 'boss-opening-unavailable'; row.reason = row.openingFailure; break; }
    if (pendingAdmission && elapsed < run.durationSeconds) {
      attempted.add(next.bossId);
      const probe = selectBossOpening(raw, ci, next, run, sim, rng, elapsed, startingRings);
      let step = probe.next();
      while (!step.done) {
        yield { phase: 'Checking ' + step.value.boss + ' opening', seconds: elapsed, score: run.scored.length,
          fraction: elapsed / run.durationSeconds };
        step = probe.next();
      }
      const { selected, reports, savedShowdown } = step.value;
      row.bossChecks = reports;
      if (!selected) {
        row.reason = 'Boss approach and outgoing fade; skipped after opening check';
        for (const report of reports) if (report.reason) note(notes, report.reason);
        previous = sim; next = null; arrival = { fadeIn: 0, spawn: {
          node: sim.player.node, x: sim.player.x, y: sim.player.y } };
        continue;
      }
      const admission = vmanBossEntry(raw, ci, { ...pendingAdmission, ...selected,
        bossId: next.bossId, currentMap: map, doorReached: true, movementAllowed: true,
        killroyRoom: false, transitioning: false, compassTempest: false });
      if (admission.legal !== true) throw new Error('Verified boss admission changed: ' + admission.reason);
      const info = rowValues(readRawKey(raw, 'BossInfo')), options = rowValues(readRawKey(raw, accountKey(raw)));
      const changes = {};
      if (next.bossId < 5) {
        const keys = rowValues(readRawKey(raw, 'CYKeysAll') !== undefined
          ? readRawKey(raw, 'CYKeysAll') : readRawKey(raw, 'CurrenciesOwned')?.KeysAll);
        keys[next.bossId] = admission.keysAfter; info[next.bossId] = admission.bossRow;
        options[195] = N(options[195]) + 4;
        changes.CYKeysAll = keys; changes.BossInfo = info;
      } else {
        options[369] = selected.showdown; options[370] = admission.attemptsAfter;
      }
      raw = patch(raw, ci, { ...changes, [accountKey(raw)]: options });
      bossVisit = { bossId: next.bossId, difficulty: selected.difficulty, showdown: selected.showdown,
        checks: reports, admission: { ...admission, paymentVerified: true,
          ...(next.bossId === 5 ? { showdownBefore: savedShowdown, showdown: selected.showdown,
            lowerActions: savedShowdown - selected.showdown } : {}) } };
      row.bossEntry = bossVisit.admission;
    }
    const charges = readRawKey(raw, 'CYWorldTeleports');
    if (next.cost) raw = patch(raw, ci, { CYWorldTeleports: Math.round(requiredNumber(charges, 'Teleport charges') - next.cost) });
    if (next.kind === 'boss-return') bossVisit = null;
    arrival = { fadeIn: next.fadeIn || 0, spawn: next.spawn || null };
    map = next.map; previous = sim; next = null;
  }
  const score = run.scored.length, highestScore = run.highestScore;
  let restoration;
  if (elapsed < run.durationSeconds) {
    restoration = { available: false, reason: 'The route stopped before Void Trial expired.' };
  } else {
    try { restoration = { available: true, kla: finishVmanSpeedrun(run, database).kla }; }
    catch (error) {
      restoration = { available: false, reason: error.message };
      note(notes, 'End-of-run portal restoration unavailable: ' + error.message);
    }
  }
  return { charIdx: ci, seconds: Math.min(elapsed, run.durationSeconds), durationSeconds: run.durationSeconds,
    remainingSeconds: Math.max(0, run.durationSeconds - elapsed),
    score, bossPoints: run.bossPoints, highestScore, route, notes: [...notes], partial: true,
    complete: false, status, policy, restoration };
}

export function* createVmanSpeedrunSearch(raw, { charIdx, seed = 1, routeBudget = 12 } = {}) {
  if (!Number.isInteger(charIdx) || !vmanSpeedrunRoster(raw)[charIdx]?.eligible) throw new Error('Select a Voidwalker or Virtuoso.');
  if (!Number.isInteger(routeBudget) || routeBudget < 1 || routeBudget > 32) throw new Error('Route budget must be from 1 to 32.');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer.');
  const candidates = [];
  let best = null;
  for (let policy = 0; policy < routeBudget; policy++) {
    const iterator = simulateRoute(raw, { charIdx, seed }, policy);
    let step = iterator.next();
    while (!step.done) {
      yield { ...step.value, completed: policy, total: routeBudget, fraction: (policy + step.value.fraction) / routeBudget };
      step = iterator.next();
    }
    const candidate = step.value;
    candidates.push({ score: candidate.score, seconds: candidate.seconds, durationSeconds: candidate.durationSeconds,
      remainingSeconds: candidate.remainingSeconds, status: candidate.status, route: candidate.route, policy });
    if (!best || candidate.score > best.score) best = candidate;
    yield { phase: 'Measured route ' + (policy + 1), completed: policy + 1, total: routeBudget, fraction: (policy + 1) / routeBudget };
  }
  return { ...best, candidates };
}
