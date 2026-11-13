// ===== SNEAKING OPTIMIZER PRIMITIVES (W6) =====
import { NjEQ } from '../../data/game/custommaps.js';
import { charmStat, isGoldCharm, isTwinUntied, maxDropLevel } from './sneaking-math.js';
import { computeCoreStealth, computeNK11Extras, getTwinAllyContributions } from './sneaking-stealth.js';
import { emporiumBonus } from '../../../game-helpers.js';

export function ownedSneakingStealthTemplates(S, activeCharIdx = 0) {
  const nd = S.ninjaData;
  if (!Array.isArray(nd)) throw new Error('Saved Sneaking equipment is unavailable.');
  const count = Math.min(12, S.charNames?.length || S.lv0AllData?.length || 0);
  const twins = Array.from({ length: count }, (_, idx) => idx).filter(idx => nd[idx] && isTwinUntied(idx, nd));
  const keys = ['NjTr17', 'NjTr4', 'NjTr16'];
  const pool = [];
  function collect(slot) {
    const row = nd[slot];
    if (!keys.includes(row?.[0])) return;
    const level = Number(row[1]);
    if (!Number.isFinite(level) || level < 0) throw new Error('Saved stealth charm level is invalid.');
    pool.push({ key: row[0], level, slot });
  }
  for (const idx of twins) for (let part = 0; part < 2; part++) collect(14 + 4 * idx + part);
  for (let slot = 60; slot < 99; slot++) collect(slot);
  const byStrength = (a, b) => charmStat(b.key, b.level) - charmStat(a.key, a.level) || a.slot - b.slot;
  const rosaries = pool.filter(item => item.key === 'NjTr17').sort(byStrength)[0];
  const veil = pool.filter(item => item.key === 'NjTr4').sort(byStrength)[0];
  const lotuses = pool.filter(item => item.key === 'NjTr16').sort(byStrength);
  const symbols = S.spelunkData?.[14] || [];
  const weight = (idx, part) => 1 + 50 * (Number(symbols[2 * idx + part]) || 0) / 100;
  const charmed = emporiumBonus(3, nd[102]?.[9]) === 1;
  const results = [];
  for (const lead of twins) {
    const supportSlots = [];
    for (const idx of twins) {
      if (idx === lead) continue;
      const parts = charmed ? [0, 1] : [weight(idx, 1) > weight(idx, 0) ? 1 : 0];
      for (const part of parts) supportSlots.push({ idx, part, weight: weight(idx, part) });
    }
    supportSlots.sort((a, b) => b.weight - a.weight || a.idx - b.idx || a.part - b.part);
    // Both factors are positive: strongest copies paired with strongest Symbol slots
    // maximize this fixed Lotus template's additive ally bonus.
    const supports = supportSlots.slice(0, lotuses.length).map((target, i) => ({
      ...lotuses[i], destination: 14 + 4 * target.idx + target.part,
    }));
    const pairs = [[rosaries, veil]];
    if (rosaries || veil) pairs.push([veil, rosaries]);
    for (const pair of pairs) {
      const assignments = supports.slice();
      for (let part = 0; part < 2; part++) if (pair[part]) {
        assignments.push({ ...pair[part], destination: 14 + 4 * lead + part });
      }
      const ninjaData = nd.slice();
      for (const idx of twins) for (let part = 0; part < 2; part++) ninjaData[14 + 4 * idx + part] = ['Blank', 0];
      for (const item of assignments) ninjaData[item.slot] = ['Blank', 0];
      for (const item of assignments) ninjaData[item.destination] = [item.key, item.level];
      const state = { ...S, ninjaData };
      const coreStealth = computeCoreStealth(lead, state, activeCharIdx);
      const allyContribs = getTwinAllyContributions(state, activeCharIdx);
      let allyMulti = 1;
      for (const idx of twins) if (idx !== lead) {
        allyMulti += allyContribs[idx].type8 / 100;
        allyMulti += allyContribs[idx].type16 / 100;
      }
      if (!Number.isFinite(coreStealth) || !Number.isFinite(allyMulti)) throw new Error('Stealth template inputs are invalid.');
      results.push({ lead, coreStealth, allyMulti, allyContribs, assignments,
        lotusCount: supports.length, lotusSlots: supportSlots.length,
        missing: [!rosaries && 'Rosaries', !veil && 'Silk Veil'].filter(Boolean) });
    }
  }
  return results;
}

export function hypotheticalSneakingCharms(S, { activeCharIdx = 0, copies = 1 } = {}) {
  if (!Number.isInteger(copies) || copies < 1 || copies > 24) throw new Error('Hypothetical charm copies must be 1 to 24');
  const extras = computeNK11Extras(S, activeCharIdx);
  const pool = [];
  for (const [key, def] of Object.entries(NjEQ)) {
    if (Number(def[0]) !== 2 || isGoldCharm(key)) continue;
    const level = maxDropLevel(key, S.ninjaData?.[103] || [], Number(S.olaData?.[231]) || 0, extras);
    if (!Number.isFinite(level) || level < 0) throw new Error('Maximum findable charm level is unavailable');
    for (let i = 0; i < (key === 'NjTr7' ? 1 : copies); i++) {
      pool.push({ key, level, source: -pool.length - 1, type: 2, bonusType: Number(def[1]), hypothetical: true });
    }
  }
  return pool;
}

export function canEquipCharmPair(first, second, hasCharmedPerk) {
  if (!first || first._empty || !second || second._empty) return true;
  if (first.key === 'NjTr7' && second.key === 'NjTr7') return false;
  return first.key !== second.key || !!hasCharmedPerk;
}

export function charmPairOrders(first, second, hasCharmedPerk) {
  if (!canEquipCharmPair(first, second, hasCharmedPerk)) return [];
  if (!first || !second || first._empty || second._empty || first.key === second.key) {
    return [[first, second]];
  }
  return [[first, second], [second, first]];
}

export function bestItemByScore(items, score) {
  var best = null;
  var bestScore = -Infinity;
  for (var index = 0; index < (items || []).length; index++) {
    var candidate = items[index];
    var candidateScore = Number(score(candidate));
    if (!Number.isFinite(candidateScore)) continue;
    if (!best || candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  return best;
}

export function allocateExactCopies(pool, requests) {
  var remaining = (pool || []).map(function(item, index) {
    return Object.assign({ _copyId: index }, item);
  });
  var allocations = [];
  for (var requestIdx = 0; requestIdx < (requests || []).length; requestIdx++) {
    var request = requests[requestIdx];
    if (!request || request._empty) {
      allocations.push(request);
      continue;
    }
    var selected = -1;
    for (var copyIdx = 0; copyIdx < remaining.length; copyIdx++) {
      var copy = remaining[copyIdx];
      if (request._copyId != null && copy._copyId === request._copyId) {
        selected = copyIdx;
        break;
      }
      if (request._copyId == null && copy.key === request.key
        && (request.level == null || Number(copy.level) === Number(request.level))) {
        selected = copyIdx;
        break;
      }
    }
    allocations.push(selected >= 0 ? remaining.splice(selected, 1)[0] : null);
  }
  return { allocations: allocations, remaining: remaining };
}

export function topCandidates(items, score, count) {
  return (items || []).map(function(item) {
    return { item: item, score: Number(score(item)) || 0 };
  }).sort(function(a, b) {
    return b.score - a.score;
  }).slice(0, Math.max(0, Number(count) || 0));
}

export function bestCharmPairFromPool(pool, first, second, hasCharmedPerk, score, slotMultipliers, scrollAlreadyEquipped) {
  var empty = { key: 'Blank', level: 0, _empty: true };
  var multipliers = slotMultipliers || [1, 1];
  var itemScore = typeof score === 'function' ? score : function(item) { return Number(item && item.level) || 0; };
  function candidates(request) {
    if (!request || request._empty) return [empty];
    return (pool || []).filter(function(item) {
      if (!item || item._empty || Number(item.type) !== 2) return false;
      if (request._copyId != null) return item._copyId === request._copyId;
      if (request._family) return Number(item.bonusType) === Number(request.bonusType);
      return item.key === request.key && (request.level == null || Number(item.level) === Number(request.level));
    });
  }
  var firstCandidates = candidates(first);
  var secondCandidates = candidates(second);
  var best = null;
  var bestScore = -Infinity;
  for (var firstIdx = 0; firstIdx < firstCandidates.length; firstIdx++) {
    for (var secondIdx = 0; secondIdx < secondCandidates.length; secondIdx++) {
      var firstItem = firstCandidates[firstIdx];
      var secondItem = secondCandidates[secondIdx];
      if (!firstItem._empty && !secondItem._empty && firstItem._copyId === secondItem._copyId) continue;
      if (!canEquipCharmPair(firstItem, secondItem, hasCharmedPerk)) continue;
      var scrollCount = Number(firstItem.key === 'NjTr7') + Number(secondItem.key === 'NjTr7');
      if (scrollCount > 1 || (scrollAlreadyEquipped && scrollCount > 0)) continue;
      var firstScore = Number(itemScore(firstItem)) || 0;
      var secondScore = Number(itemScore(secondItem)) || 0;
      var direct = firstScore * (Number(multipliers[0]) || 1) + secondScore * (Number(multipliers[1]) || 1);
      var swapped = firstScore * (Number(multipliers[1]) || 1) + secondScore * (Number(multipliers[0]) || 1);
      var pairScore = Math.max(direct, swapped);
      if (!best || pairScore > bestScore) {
        best = [firstItem, secondItem];
        bestScore = pairScore;
      }
    }
  }
  return best;
}
