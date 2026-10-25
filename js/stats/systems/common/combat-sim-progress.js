// ===== ACTIVE COMBAT SIMULATOR - COMBAT-DRIVEN ACCOUNT PROGRESS =====

import * as D from '../../../save/data.js';
import { ITEMS } from '../../data/game/items.js';
import { PET_STATS, PET_NAMES } from '../../data/w4/breeding.js';
import { Spelunky } from '../../data/game/customlists.js';
import { computeShinyBonusS, shinyPetLevel } from '../w4/breeding.js';
import { computeCardLv } from './cards.js';
import { computeStarSignBonus } from './starSign.js';
import { achieveStatus } from './achievement.js';
import { getBribeBonus } from '../w3/bribe.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { arcadeBonus } from '../w2/arcade.js';
import { mainframeBonus } from '../w4/lab.js';
import { computeRiftSkillBonus } from '../w4/rift.js';
import { computeCropSC } from '../w6/farming.js';
import { computeWinBonus } from '../w6/summoning.js';
import { cosmoBonus, computeLampBonus } from '../w5/hole.js';
import { vaultUpgBonus } from './vault.js';
import { menagerieBoostQTY, menagerieUnlockOwned } from '../w7/menagerie.js';

const N = x => Number(x?.val ?? x) || 0;
const clone = x => JSON.parse(JSON.stringify(x));

export function combatProgressInputs(S, ci, read) {
  const order = read('ForgeItemOrder'), qty = read('ForgeItemQty'), progress = read('ForgeIntProg');
  const lv = S.forgeLvData || [], godshard = computeCardLv('Godshard', S);
  const cap = Math.min(2e9, cosmoBonus(S, 2, 1) * (20 + 10 + 10 * Math.round(N(lv[1])))
    * (1 + (N(arcadeBonus(26, S)) + 30 * godshard) / 100)
    * (1 + N(computeStampBonusOfTypeX('ForgeCap', S)) / 100)
    * (1 + (N(getBribeBonus(35, S)) + N(vaultUpgBonus(26, S))) / 100)
    * (1 + (50 * N(achieveStatus(281, S)) + 25 * computeRiftSkillBonus(1, 1, S)) / 100));
  let overLevels = 0;
  for (let w = 0; w < 4; w++) for (let p = 0; p < (PET_STATS[w]?.length || 0); p++)
    overLevels = Math.round(overLevels + Math.max(0, shinyPetLevel(N(S.breedingData?.[22 + w]?.[p]), S) - 20));
  const shinySpeed = (1 + (N(mainframeBonus(115, S)) + (computeShinyBonusS(16, S)
    + (N(computeCropSC(5, S)) + (N(computeStarSignBonus('57b', ci, S)) + 5 * N(S.breedingData?.[2]?.[12]))))) / 100)
    * (1 + N(computeWinBonus(17, { charIdx: ci }, S)) / 100) * (1 + 10 * overLevels / 100)
    * (1 + N(computeLampBonus(0, 1, S)) / 100);
  const chest = S.itemQuantityData?.chest;
  const storage = {};
  if (chest?.available) chest.order.forEach((k, i) => { storage[k] = N(storage[k]) + N(chest.quantity[i]); });
  const ola = D.optionsListData;
  const omega = [625, 626].map(i => {
    const v = ola[i];
    return v != null && String(v).trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
  });
  return {
    forge: {
      available: Array.isArray(order) && order.length >= 48 && Array.isArray(qty) && qty.length >= 48
        && Array.isArray(progress) && progress.length >= 16,
      order: order || [], qty: qty || [], progress: progress || [], storage, storageAvailable: !!chest?.available,
      slots: N(lv[0]), cap, refill: N(D.labData?.[16]?.[0]) === 1, gemSlots: N(S.gemItemsData?.[104]),
      speed: Math.round((5 * N(lv[2]) + 30 * godshard + 100) * (1 + menagerieBoostQTY(S, 11) / 100)) / 100,
      bars: 1 + Math.round(N(lv[4])) / 100, oilUse: 1 - N(getBribeBonus(9, S)) / 100,
    },
    pets: { available: Array.isArray(S.petsData) && Array.isArray(S.breedingData),
      deployed: S.petsData || [], breeding: S.breedingData || [], shinySpeed },
    scurge: { unlocked: menagerieUnlockOwned(S, 4) === 1, menagerie: S.menagerieData || [] },
    coral: { unlocked: menagerieUnlockOwned(S, 2) === 1, kills: N(ola[623]) },
    omega: { unlocked: menagerieUnlockOwned(S, 6) === 1, available: omega.every(v => v != null), balls: omega[0], drops: omega[1] },
  };
}

export function initCombatProgress(sim) {
  const source = sim.inputs.values.combatProgress;
  const st = sim.state.progress = {
    config: source ? clone(source) : null, gains: { forgeSeconds: 0, petSeconds: 0, alchemySeconds: 0, scurgeExp: 0, coralKills: 0, omegaBalls: 0 },
    bars: {}, oreUsed: {}, oilUsed: {}, storageUsed: {}, pets: [], petPendingSeconds: 0, notices: [],
  };
  if (st.config?.omega?.unlocked && st.config.omega.available === false)
    _notice(sim, 'omegaState', 'Omega drops are unavailable: saved ball balance or lifetime drop count is missing or invalid. Fresh-account odds are not assumed.');
  sim.progress = {
    grant: (kind, seconds) => {
      if (!['forge', 'pets', 'alchemy'].includes(kind)) throw new Error('Unknown combat progress grant: ' + kind);
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Combat progress grants must be finite nonnegative seconds.');
      st.gains[(kind === 'pets' ? 'pet' : kind) + 'Seconds'] += seconds;
      if (kind === 'forge') {
        if (st.config?.forge.available) _forgeGrant(sim, seconds);
        else _notice(sim, 'forgeState', 'Forge time is credited, but saved furnace contents/progress are unavailable.');
      } else if (kind === 'pets') {
        st.petPendingSeconds += seconds;
        if (!st.config?.pets.available) _notice(sim, 'petState', 'Pet time is credited, but deployed pets and Breeding progress are unavailable.');
        _notice(sim, 'petNonShiny', 'Pet boosts also affect spices, breedability and special pets; only shiny-pet progress is resolved here.');
      } else if (kind === 'alchemy') {
        _notice(sim, 'alchemyProduction', 'Alchemy time is credited; cauldron liquid/bubble production and upgrades are not simulated.');
      }
      sim.emit('combatProgress', { kind, seconds, t: sim.timeMs });
    },
    scurgeKill: () => {
      const m = st.config?.scurge;
      if (!m?.unlocked) return;
      const bonus = i => N(Spelunky[28]?.[i + 9]) * N(m.menagerie[5]?.[i]);
      const add = (1 + bonus(0)) * (1 + bonus(4) / 100) * (1 + bonus(2) / 100)
        * (1 + bonus(7) * Math.max(0, N(sim.inputs.values.otherPlayersCount) - 1) / 100);
      m.menagerie[0][7] = N(m.menagerie[0][7]) + add;
      st.gains.scurgeExp += add;
      if (bonus(7) && !sim.inputs.entries.otherPlayersCount?.overridden)
        _notice(sim, 'scurgeOtherPlayers', 'Scurge EXP uses no nearby-player bonus unless Other players count is overridden.');
      sim.emit('scurgeExp', { amount: add, exp: m.menagerie[0][7], t: sim.timeMs });
    },
    coralKill: credit => {
      const c = st.config?.coral;
      if (!c?.unlocked) return;
      c.kills += credit; st.gains.coralKills += credit;
      sim.state.ola[623] = c.kills;
    },
    omegaKill: mon => {
      const o = st.config?.omega;
      const scene = String(sim.scene.name);
      if (!o?.unlocked || o.available === false || sim.scene.map === 216 || scene.includes('Tutorial') || scene.includes('wLavaAhole')) return;
      const chance = 1 / (5e3 * (1 + 6 * Math.min(8, o.drops)) * Math.pow(3.5, o.drops));
      if (sim.rng.randomFloat() >= N(sim.inputs.values.dropRate) * chance) return;
      o.balls = Math.round(o.balls + 1); o.drops = Math.round(o.drops + 1); st.gains.omegaBalls++;
      sim.state.ola[625] = o.balls; sim.state.ola[626] = o.drops;
      sim.rewards.dropSomething(sim, 'ArcBallOmega', 1, 0, 0, 0, mon.node, 0, mon.x + mon.offX - 18, 'omega');
    },
  };
  if (st.config?.forge.available) sim.every(250, () => _forgeTick(sim));
  sim.sceneUpdaters.push(() => {
    if (!(st.petPendingSeconds > 10) || !st.config?.pets.available) return;
    const p = st.config.pets, seconds = st.petPendingSeconds;
    for (let i = 0; i < 27; i++) {
      const pet = p.deployed[i];
      if (!pet || pet[0] === 'none' || N(pet[1]) !== 5) continue;
      for (let w = 0; w < PET_STATS.length; w++) {
        const index = PET_STATS[w].findIndex(row => row[0] === pet[0]);
        if (index < 0) continue;
        const row = p.breeding[22 + w];
        if (!Array.isArray(row)) { _notice(sim, 'shinyProgress', 'A deployed shiny pet has no saved progress row.'); break; }
        const before = N(row[index]), add = seconds * p.shinySpeed / 86400;
        row[index] = before + add;
        let result = st.pets.find(r => r.world === w && r.index === index);
        if (!result) st.pets.push(result = { world: w, index, name: PET_NAMES[w][index], start: before, gained: 0,
          startLevel: shinyPetLevel(before, { menagerieData: st.config.scurge.menagerie }) });
        result.gained += add; result.end = row[index];
        result.level = shinyPetLevel(row[index], { menagerieData: st.config.scurge.menagerie });
        break;
      }
    }
    st.petPendingSeconds = 0;
  });
}

function _notice(sim, key, text) {
  const st = sim.state.progress;
  if (st.notices.some(n => n.key === key)) return;
  st.notices.push({ key, text });
  sim.emit('unmodelled', { key, detail: text, t: sim.timeMs });
}

function _forgeStats(f, slot) {
  const oil = ITEMS[f.order[3 * slot + 1]] || {};
  const gem = f.gemSlots > slot ? 1.5 : 1;
  return { interval: N(ITEMS[f.order[3 * slot]]?.Cooldown) || 9999999,
    speed: .25 * f.speed * (oil.Effect === 'SpeedForge' ? 1 + N(oil.Amount) / 100 : 1) * gem,
    bars: f.bars * (oil.Effect === 'DoubleBarsForge' ? 1 + N(oil.Amount) / 100 : 1) * gem,
    cost: N(ITEMS[f.order[3 * slot]]?.Amount), oilCost: N(oil.Cooldown) * f.oilUse / 100 };
}

function _refill(sim, slot, index, emptyOnly, resetProgress = true) {
  const st = sim.state.progress, f = st.config.forge, at = 3 * slot + index, key = f.order[at], qty = N(f.qty[at]);
  const cost = Math.max(Math.ceil(N(ITEMS[key]?.Amount)), 1);
  if (qty > 0 && (emptyOnly || qty > cost)) return;
  if (f.refill && !f.storageAvailable) _notice(sim, 'forgeStorage', 'Forge refill storage is unavailable; no replacement ore or oil is assumed.');
  if (f.refill && N(f.storage[key]) > 0) {
    const add = Math.min(f.cap, f.storage[key]);
    f.qty[at] = add; f.storage[key] -= add;
    if (resetProgress) f.progress[slot] = 0;
    st.storageUsed[key] = N(st.storageUsed[key]) + add;
  } else if (qty <= 0) { f.qty[at] = 0; f.order[at] = 'Blank'; }
}

function _forgeProduce(sim, slot, count, afk) {
  const st = sim.state.progress, f = st.config.forge, at = 3 * slot, stats = _forgeStats(f, slot);
  const ore = f.order[at], oil = f.order[at + 1];
  f.progress[slot] = N(f.progress[slot]) - stats.interval * count;
  if (f.order[at + 2] === 'Blank') f.order[at + 2] = ore + 'Bar';
  const amount = stats.bars * count, previous = N(f.qty[at + 2]), value = previous + amount;
  f.qty[at + 2] = sim.rng.randomFloat() > amount - Math.floor(amount) ? Math.floor(value) : Math.ceil(value);
  const bar = f.order[at + 2];
  st.bars[bar] = N(st.bars[bar]) + f.qty[at + 2] - previous;
  const used = Math.max(Math.ceil(stats.cost), 1) * count;
  f.qty[at] = N(f.qty[at]) - used; st.oreUsed[ore] = N(st.oreUsed[ore]) + used;
  _refill(sim, slot, 0, afk);
  if (oil !== 'Blank') {
    const before = N(f.qty[at + 1]);
    if (afk) {
      const use = count * stats.oilCost;
      f.qty[at + 1] = sim.rng.randomFloat() > use - Math.floor(use) ? Math.floor(before - use) : Math.ceil(before - use);
    } else if (sim.rng.randomFloatBetween(0, 100) < stats.oilCost * 100) f.qty[at + 1] = before - 1;
    st.oilUsed[oil] = N(st.oilUsed[oil]) + before - f.qty[at + 1];
    _refill(sim, slot, 1, true, afk);
  }
}

function _forgeGrant(sim, seconds) {
  const f = sim.state.progress.config.forge;
  for (let slot = 0; slot < 16; slot++) {
    if (f.order[3 * slot] === 'Blank') continue;
    let s = _forgeStats(f, slot), v = s.interval / (4 * s.speed);
    const q = N(f.qty[3 * slot + 1]) !== 0 && f.order[3 * slot + 1] !== 'Blank'
      ? N(f.qty[3 * slot + 1]) * (1 / s.oilCost) : 0;
    const q2 = q * v;
    let count = Math.floor(Math.min(seconds * (1 / v), N(f.qty[3 * slot]) / s.cost));
    const passes = count < q || q === 0 ? 1 : 2;
    f.progress[slot] = N(f.progress[slot]) + (passes === 1 ? 4 * s.speed * seconds : 4 * s.speed * q * v);
    if (passes === 2) count = q;
    for (let pass = 0; pass < passes; pass++) {
      if (!(count >= 1)) continue;
      _forgeProduce(sim, slot, count, true);
      if (passes === 2 && pass === 0) {
        s = _forgeStats(f, slot); v = s.interval / (4 * s.speed);
        count = Math.floor(Math.min((seconds - q2) * (1 / v), N(f.qty[3 * slot]) / s.cost));
        f.progress[slot] = N(f.progress[slot]) + 4 * s.speed * (seconds - q2);
      }
    }
  }
}

function _forgeTick(sim) {
  const f = sim.state.progress.config.forge;
  for (let slot = 0; slot < 16; slot++) {
    const s = _forgeStats(f, slot);
    if (f.slots > slot) {
      if (f.order[3 * slot] !== 'Blank') {
        if (N(f.qty[3 * slot]) >= s.cost) f.progress[slot] = N(f.progress[slot]) + s.speed;
      } else if (N(f.progress[slot]) > 0) f.progress[slot] = 0;
    }
    if (N(f.progress[slot]) >= s.interval) _forgeProduce(sim, slot, 1, false);
  }
}

export function combatProgressSummary(sim) {
  const st = sim.state.progress;
  if (!st) return null;
  const f = st.config?.forge, s = st.config?.scurge, o = st.config?.omega;
  return clone({ ...st.gains, bars: st.bars, oreUsed: st.oreUsed, oilUsed: st.oilUsed, storageUsed: st.storageUsed,
    pets: st.pets, notices: st.notices,
    state: { petPendingSeconds: st.petPendingSeconds, forgeAvailable: !!f?.available,
      forge: f?.available ? { order: f.order, qty: f.qty, progress: f.progress, storage: f.storage } : null,
      scurge: s?.unlocked ? { level: N(s.menagerie[0]?.[8]), exp: N(s.menagerie[0]?.[7]),
        requirement: (50 + 15 * N(s.menagerie[0]?.[8])) * Math.pow(1.08, N(s.menagerie[0]?.[8])),
        menuRequired: true } : null,
      coral: st.config?.coral?.unlocked ? { kills: st.config.coral.kills } : null,
      omega: o?.unlocked ? { balls: o.balls, drops: o.drops } : null } });
}
