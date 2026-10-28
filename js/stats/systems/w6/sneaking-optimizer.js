// ===== SNEAKING OPTIMIZER PRIMITIVES (W6) =====
import { NjEQ } from '../../data/game/custommaps.js';
import { isGoldCharm, maxDropLevel } from './sneaking-math.js';
import { computeNK11Extras } from './sneaking-stealth.js';

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
