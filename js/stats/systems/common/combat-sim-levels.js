// ===== ACTIVE COMBAT SIMULATOR - LIVE CLASS LEVELS =====

import { captureCombatExpStart, classExpRequirement } from './combat-sim-exp.js';
import { captureCombatInputState, buildLiveLevelInputs } from './combat-sim-inputs.js';

const CACHED_STATS = new Set(['damageMax', 'damageMin', 'damageMastery', 'accuracy', 'hitChancePct', 'playerDefence', 'bossMulti']);
const START_ONLY = new Set(['state', 'initialBuffs', 'runtimeBuffs', 'initialCooldowns', 'initialHp', 'initialMp', 'savedCooldowns',
  'foodSlots', 'foodStorage', 'inventory', 'cards0', 'cards1', 'questComplete', 'levelUpGiftChance', 'levelUpGiftCount']);

export function initCombatLevels(sim) {
  const start = captureCombatExpStart(sim.saveData || {}, sim.charIdx, sim.inputs);
  const st = sim.state.classExp = { ...start, start: { ...start }, levels: [], rebuilds: 0, pendingStats: false,
    statsAvailable: !sim.options.inputs, giftCount: Number(sim.inputs.values.levelUpGiftCount) || 0 };
  if (!start.available) return;
  st.requirement = classExpRequirement(st.level);
  if (!Number.isFinite(st.requirement)) {
    st.available = false;
    st.reason = 'Class EXP requirement exceeds the numerical simulation range.';
    sim.emit('unmodelled', { key: 'classLevels', detail: st.reason, t: sim.timeMs });
    return;
  }
  const captured = !sim.options.inputs ? captureCombatInputState(sim.saveData) : null;
  const opts = { rawSave: sim.options.rawSave, overrides: sim.options.inputOverrides };
  const fixedHp = sim.state.food?.fixedHp || sim.player.hpMax !== sim.inputs.values.playerMaxHp;
  const fixedDefence = sim.player.defence !== sim.inputs.values.playerDefence;
  if (captured) sim.rebuildInputs = () => buildLiveLevelInputs(captured, sim.charIdx, sim.mapIdx, opts, st.level, st.exp,
    { food: sim.state.food, buffs: sim.state.buffsActive || sim.inputs.values.initialBuffs });
  sim.on('exp', ({ amount }) => {
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(st.exp + amount)) throw new Error('Class EXP award exceeds the numerical simulation range.');
    st.exp += amount;
  });
  const rebuild = cached => {
    if (!captured) {
      if (!st.notice) {
        st.notice = true;
        sim.emit('unmodelled', { key: 'levelUpStats', detail: 'Prebuilt inputs cannot rebuild level-dependent stats.', t: sim.timeMs });
      }
      return;
    }
    const next = sim.rebuildInputs(), v = sim.inputs.values, p = sim.player;
    const before = { level: v.level, damageMax: v.damageMax, maxHp: p.hpMax, defence: p.defence, expMulti: v.expMulti };
    for (const [key, value] of Object.entries(next.values)) {
      if (START_ONLY.has(key) || (!cached && CACHED_STATS.has(key))) continue;
      v[key] = value;
    }
    if (!fixedHp) p.hpMax = v.playerMaxHp;
    if (sim.playerModule.name === 'auto') p.mpMax = v.playerMaxMp;
    if (!fixedDefence) p.defence = v.playerDefence;
    p.invulnSeconds = v.invulnSeconds;
    // The previous form baseline belongs to the old level, not the live form.
    sim.state.formBase = null;
    sim.state.formKey = null;
    sim.rewards.applyFormStats(sim);
    if (fixedHp) p.hpMax = before.maxHp;
    if (fixedDefence) p.defence = before.defence;
    p.hp = Math.min(p.hp, p.hpMax);
    p.mp = Math.min(p.mp, p.mpMax);
    st.rebuilds++;
    sim.emit('levelStatsRecomputed', { cached, level: st.level, before,
      after: { level: v.level, damageMax: v.damageMax, maxHp: p.hpMax, expMulti: v.expMulti }, t: sim.timeMs });
  };
  // AE29 _event_LevelUps: one Class level per 150 ms callback, not a while loop.
  sim.every(150, () => {
    if (st.exp < st.requirement) return;
    const from = st.level;
    sim.player.hp = sim.player.hpMax; // LevelUp(0) heals before Lv0 is incremented; no MP refill.
    st.exp -= st.requirement;
    st.level++;
    st.requirement = classExpRequirement(st.level);
    if (!Number.isFinite(st.requirement)) throw new Error('Class EXP requirement exceeds the numerical simulation range.');
    st.pendingStats = true;
    rebuild(false);
    const event = { from, level: st.level, exp: st.exp, requirement: st.requirement, t: sim.timeMs };
    st.levels.push(event);
    sim.emit('levelUp', { ...event });
    _levelUpGift(sim, st);
  }, sim.player);
  // EveryScene._event_Every1sec clears TotStatMAP/TotStatSkMAP (src 120913).
  sim.every(1000, () => {
    if (!st.pendingStats) return;
    rebuild(true);
    st.pendingStats = false;
  }, sim.player);
}

function _levelUpGift(sim, st) {
  const v = sim.inputs.values, rng = sim.rng;
  if (!(rng.randomFloat() < Number(v.levelUpGiftChance || 0))) return;
  const roll = rng.randomFloat();
  let item;
  if (st.level > 30 && roll < .0003) item = 'EquipmentHats21';
  else if ((st.level < 20 && roll < .35) || roll < .32) item = 'PremiumGem';
  else if (roll < .36) item = 'ExpBalloon1';
  else if (roll < .4037) item = st.giftCount < 100
    ? roll < .39 ? 'Timecandy1' : roll < .4 ? 'Timecandy2' : roll < .403 ? 'Timecandy3' : roll < .4035 ? 'Timecandy4' : 'Timecandy5'
    : 'PremiumGem';
  else if (roll < .6) item = 'EquipmentStatues' + rng.randomInt(1, 8);
  else if (roll < .605 && Number(v.levelUpStampA23) === 0) item = 'StampA23';
  else if (roll < .615 && st.giftCount < 100) item = 'StoneZ1';
  else if (roll < .75) item = 'FoodPotYe' + Math.min(Math.ceil(st.level / 33), 3);
  else if (roll < .753 && Number(v.levelUpStampC9) === 0) item = 'StampC9';
  else item = 'Quest25';
  if (sim.inputs.entries.levelUpGiftCount?.unavailable && !st.giftNotice) {
    st.giftNotice = true;
    sim.emit('unmodelled', { key: 'levelUpGiftCount', detail: 'The unsaved session gift counter starts at zero; candy/stone eligibility can differ from an existing game session.', t: sim.timeMs });
  }
  const p = sim.player, x = p.xCenter ? p.xCenter() : p.x + p.width / 2;
  sim.rewards.dropSomething(sim, item, 1, 0, 0, 0, p.node, 0, x - 16, 'levelUp');
  st.giftCount++;
  if (sim.state.questComplete?.Goldric4 == 0) sim.rewards.dropSomething(sim, 'Quest26', 1, 0, 0, 0, p.node, 0, x - 36, 'levelUp');
}

export function combatLevelSummary(sim) {
  const st = sim.state.classExp;
  if (!st) return null;
  return { available: st.available, reason: st.reason, start: { ...st.start }, level: st.level, exp: st.exp,
    requirement: st.requirement, levelsGained: st.levels.length, levels: st.levels.map(e => ({ ...e })),
    statsAvailable: st.statsAvailable, rebuilds: st.rebuilds, pendingStats: st.pendingStats };
}
