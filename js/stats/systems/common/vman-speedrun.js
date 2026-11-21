// ===== VOIDWALKER SPEEDRUN BOOKKEEPING =====
import { mapMultiCharRequirement, mapPortalRequirements } from '../../data/common/maps.js';

function _number(value, name, { integer = false, min = 0 } = {}) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw new Error(name + ' is unavailable.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))) throw new Error(name + ' is invalid.');
  return n;
}

function _active(run, buff45) {
  return run.active && (run.classId === 4 || run.classId === 5) && _number(buff45, 'Void Trial buff') > 0;
}

function _award(run, identity, count, boss) {
  const scored = run.scored.concat(Array(count).fill(identity));
  return {
    ...run, scored, highestScore: Math.max(run.highestScore, scored.length),
    bossPoints: run.bossPoints + (boss ? count : 0),
  };
}

export function startVmanSpeedrun({ classId, rerunSeconds, sailingLevel, highestScore, bossRespawnPct }) {
  classId = _number(classId, 'Character class', { integer: true });
  if (classId !== 4 && classId !== 5) throw new Error('Void Trial requires a Voidwalker or Virtuoso.');
  rerunSeconds = _number(rerunSeconds, 'Void Trial duration bonus');
  if (rerunSeconds <= 0) throw new Error('Void Trial must be learned.');
  sailingLevel = _number(sailingLevel, 'Sailing level', { integer: true });
  highestScore = _number(highestScore, 'Saved speedrun record', { integer: true });
  bossRespawnPct = _number(bossRespawnPct, 'Bossing Vain respawn bonus');
  const kla = mapPortalRequirements();
  if (sailingLevel > 1) kla[150][0] = 0;
  return {
    classId, active: true, startMap: 1, durationSeconds: Math.round(1 + rerunSeconds),
    kla, scored: [], highestScore, bossPoints: 0, bossRespawnPct,
  };
}

// Invoke only for a declared ordinary portal, or the separately timed map-16 observer.
// The returned cache must be retained even when a multichar gate rejects the award.
export function observeVmanPortal(run, {
  mapIdx, portalId, cachedRequirement, currentRequirement, buff45, expType,
  multicharProgress, ordinary, map16Observer = false,
}) {
  mapIdx = _number(mapIdx, 'Portal map', { integer: true });
  portalId = _number(portalId, 'Portal index', { integer: true });
  if (!run.kla[mapIdx] || portalId >= run.kla[mapIdx].length) throw new Error('Portal requirement does not exist.');
  const cachedValue = cachedRequirement, currentValue = currentRequirement;
  cachedRequirement = _number(cachedRequirement, 'Cached portal requirement', { min: -Infinity });
  currentRequirement = _number(currentRequirement, 'Current portal requirement', { min: -Infinity });
  buff45 = _number(buff45, 'Void Trial buff');
  expType = _number(expType, 'Portal EXP type', { integer: true, min: -Infinity });
  if (typeof ordinary !== 'boolean') throw new Error('Ordinary portal status is unavailable.');
  if (map16Observer && (mapIdx !== 16 || portalId !== 1)) throw new Error('The extra portal observer belongs to map 16, portal 1.');
  const result = { run, cachedRequirement: cachedValue, awarded: 0 };
  // The extra observer gates the cache write on class/buff, unlike the portal actor.
  if (map16Observer && !_active(run, buff45)) return result;
  if ((!ordinary && !map16Observer) || cachedRequirement <= 0 || currentRequirement === cachedRequirement) return result;
  result.cachedRequirement = map16Observer ? currentValue : currentRequirement;
  if (currentRequirement > 0) return result;
  if (!map16Observer && portalId === 0 && mapMultiCharRequirement(mapIdx) > 0) {
    const progress = _number(multicharProgress, 'Multichar portal progress');
    if (Math.round(mapMultiCharRequirement(mapIdx) - progress) > 0) return result;
  }
  const identity = Math.round(1000 * mapIdx + portalId);
  if (!_active(run, buff45) || expType !== 0 || mapIdx % 50 === 0 || run.scored.includes(identity)) return result;
  result.run = _award(run, identity, 1, false);
  result.awarded = 1;
  return result;
}

// This records a completed native boss-death event; it does not simulate an encounter.
export function awardVmanBoss(run, { bossId, bossInfo, buff45 }) {
  bossId = _number(bossId, 'Boss identity', { integer: true });
  if (bossId > 5) throw new Error('Unknown world boss.');
  const identity = 'Boss' + bossId;
  if (!_active(run, buff45) || run.bossRespawnPct <= 0 || run.scored.includes(identity)) return run;
  // Emperor also reads the current Kattlekruk difficulty.
  const scoreDifficulty = _number(bossInfo?.[bossId === 5 ? 4 : bossId]?.[0], 'Boss score difficulty', { integer: true });
  if (scoreDifficulty > 2) throw new Error('Unknown world boss difficulty.');
  return _award(run, identity, Math.round(scoreDifficulty + 1), true);
}

export function vmanBossRespawnDivisor(run) {
  return run.bossPoints > 0 ? Math.max(1, 1 + run.bossRespawnPct * run.bossPoints / 100) : 1;
}

export function finishVmanSpeedrun(run, databaseKla) {
  if (!Array.isArray(databaseKla) || databaseKla.length === 0) throw new Error('Account character portal requirements are unavailable.');
  const requirements = mapPortalRequirements();
  const kla = run.kla.map(row => row.slice());
  for (let map = 0; map < requirements.length; map++) {
    for (let portal = 0; portal < requirements[map].length; portal++) {
      let current = kla[map]?.[portal];
      _number(current, 'Run portal requirement', { min: -Infinity });
      for (const character of databaseKla) {
        const saved = _number(character?.[map]?.[portal], 'Account portal requirement', { min: -Infinity });
        if (saved <= 0 && saved < current) {
          current = -1;
          if (requirements[map][portal] - current < 2e6) current = requirements[map][portal] - 2e6;
        }
      }
      kla[map][portal] = current;
    }
  }
  return { ...run, active: false, kla, scored: [], bossPoints: 0 };
}
