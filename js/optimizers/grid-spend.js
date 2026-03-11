// ===== GRID EXPANSION & BEAM SEARCH =====

import {
  GRID_COLS,
  GRID_SIZE,
  OCC_DATA,
  RES_GRID_RAW,
} from '../game-data.js';
import {
  advanceInsightLevels,
  advanceResearchLevel,
  calcAllBonusMultiWith,
  computeMagnifiersOwnedWith,
  getMonoObsSet,
  hrsToNextInsightLv,
  insightAffectsExp,
  insightExpRate,
  insightExpReqAt,
  isGridCellUnlocked,
  magMaxForLevel,
  refreshAbm,
  researchExpReq,
  simTotalExpWith,
} from '../sim-math.js';
import { cloneSimState } from '../sim-state.js';
import { _growMagPoolTyped } from './mags.js';
import { ctxFrom } from '../save/context.js';
import { _monoAssignBestQuick } from './monos.js';
import { _reoptRegularMags } from '../sim-engine.js';

export function _gridPointsAvail(gl, rLv) {
  const sq50 = gl[50] || 0;
  const earned = Math.floor(rLv + Math.floor(rLv / 10) * Math.round(1 + Math.min(1, Math.floor(rLv / 60)) + sq50));
  let spent = 0;
  for (const idx of Object.keys(RES_GRID_RAW)) spent += gl[Number(idx)] || 0;
  return Math.max(0, earned - spent);
}

function _detectExpRelevantNodes(gl, so, md, il, occ, rLv, ctx) {
  var relevant = new Set();
  var baseExpHr = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
  var baseMagCount = computeMagnifiersOwnedWith(gl, rLv, ctx);

  // Compute baseline insight rates for all monocle obs
  var monoObs = [];
  for (var mi = 0; mi < md.length; mi++) {
    if (md[mi].type === 1 && md[mi].slot >= 0 && monoObs.indexOf(md[mi].slot) < 0) monoObs.push(md[mi].slot);
  }
  var baseInsightRates = [];
  for (var oi = 0; oi < monoObs.length; oi++) {
    baseInsightRates.push(insightExpRate(monoObs[oi], md, il, gl, so, ctx));
  }

  var allSquares = Object.keys(RES_GRID_RAW).map(Number);
  for (var i = 0; i < allSquares.length; i++) {
    var idx = allSquares[i];
    var maxLv = RES_GRID_RAW[idx][1];
    var origLv = gl[idx] || 0;

    // Test each rank from 1 to maxLv
    for (var rank = 1; rank <= maxLv; rank++) {
      if (rank <= origLv) continue; // already at or past this rank
      gl[idx] = rank;
      var testCtx = { ...ctx, abm: calcAllBonusMultiWith(gl, ctx.hasComp55, ctx.hasComp0DivOk) };

      // Check 1: does research EXP rate change?
      var testExpHr = simTotalExpWith(gl, so, md, il, occ, rLv, testCtx);
      if (Math.abs(testExpHr - baseExpHr) > 1e-6) {
        relevant.add(idx);
        break;
      }

      // Check 2: does magnifier count change? (more mags = more obs coverage = more EXP)
      var testMagCount = computeMagnifiersOwnedWith(gl, rLv, ctx);
      if (testMagCount !== baseMagCount) {
        relevant.add(idx);
        break;
      }

      // Check 3: does any insight rate change?
      var insightChanged = false;
      for (var oi2 = 0; oi2 < monoObs.length; oi2++) {
        var testIR = insightExpRate(monoObs[oi2], md, il, gl, so, testCtx);
        if (Math.abs(testIR - baseInsightRates[oi2]) > 1e-6) { insightChanged = true; break; }
      }
      if (insightChanged) {
        relevant.add(idx);
        break;
      }
    }
    // Restore original level
    gl[idx] = origLv;
  }
  return relevant;
}

function _findGatewayPath(gl, targetIdx, maxCost) {
  if (isGridCellUnlocked(targetIdx, gl)) return []; // already reachable, no gateways needed
  // BFS backwards from target through adjacency, looking for a path to an already-unlocked cell.
  // Each node on the path that isn't already owned is a gateway cost of 1.
  var allSquares = new Set(Object.keys(RES_GRID_RAW).map(Number));
  var COLS = GRID_COLS;

  function adj(idx) {
    var col = idx % COLS, result = [];
    if (idx >= COLS) result.push(idx - COLS);
    if (idx < GRID_SIZE - COLS) result.push(idx + COLS);
    if (col > 0) result.push(idx - 1);
    if (col < COLS - 1) result.push(idx + 1);
    return result;
  }

  // BFS from targetIdx outward, looking for a node that's already unlocked
  // Cost = number of unowned nodes traversed (each needs 1 point to unlock)
  var queue = [{ idx: targetIdx, path: [], cost: 0 }];
  var visited = new Set([targetIdx]);
  while (queue.length > 0) {
    var cur = queue.shift();
    var neighbors = adj(cur.idx);
    for (var ni = 0; ni < neighbors.length; ni++) {
      var n = neighbors[ni];
      if (visited.has(n)) continue;
      visited.add(n);
      if (!allSquares.has(n)) continue; // not a grid node
      var owned = (gl[n] || 0) >= 1;
      var newCost = cur.cost + (owned ? 0 : 1);
      var newPath = cur.path.concat(owned ? [] : [n]);
      if (owned && isGridCellUnlocked(cur.idx, (function() {
        // Check: if n is owned, would cur.idx be unlockable via n?
        // Since n is adjacent to cur.idx and n is owned, cur.idx is unlockable.
        return gl;
      })())) {
        // Found a connected owned node! But we need to check the full chain.
        // Actually - if n is owned, then cur.idx is adjacent to an owned node,
        // so cur.idx is unlockable if we own everything in newPath.
        if (newCost <= maxCost) return newPath;
        continue;
      }
      if (newCost > maxCost) continue;
      queue.push({ idx: n, path: newPath, cost: newCost });
    }
  }
  return null; // unreachable within maxCost
}

export function _expandSpendable(gl, totalPoints, so, md, il, occ, rLv, ctx) {
  // All params required - no global fallbacks.
  var allSquares = Object.keys(RES_GRID_RAW).map(Number);

  // Dynamically detect which nodes affect EXP at any rank
  var expNodes = _detectExpRelevantNodes(gl, so, md, il, occ, rLv, ctx);

  // Phase 1: Find directly reachable EXP-relevant nodes (already unlocked, not maxed)
  var directExpNodes = [];
  for (var i = 0; i < allSquares.length; i++) {
    var idx = allSquares[i];
    if ((gl[idx] || 0) >= RES_GRID_RAW[idx][1]) continue; // maxed
    if (!expNodes.has(idx)) continue;
    if (isGridCellUnlocked(idx, gl)) directExpNodes.push(idx);
  }

  // Phase 2: Find unreachable EXP-relevant nodes and their gateway paths
  var gatewayPaths = []; // { target, gateways: [idx,...], cost }
  for (var j = 0; j < allSquares.length; j++) {
    var tidx = allSquares[j];
    if ((gl[tidx] || 0) >= RES_GRID_RAW[tidx][1]) continue; // maxed
    if (!expNodes.has(tidx)) continue;
    if (isGridCellUnlocked(tidx, gl)) continue; // already directly reachable
    var path = _findGatewayPath(gl, tidx, totalPoints);
    if (path) {
      gatewayPaths.push({ target: tidx, gateways: path, cost: path.length });
    }
  }

  // Sort gateway paths by cost (cheapest first)
  gatewayPaths.sort(function(a, b) { return a.cost - b.cost; });

  // Phase 3: Greedily include gateway paths that fit within budget
  var spendableSet = new Set(directExpNodes);
  var gatewayBudget = totalPoints;
  // Subtract 1 per direct EXP node (minimum 1 point to be useful)
  // Actually, don't subtract - the combo enumerator handles allocation. Just include all reachable.
  for (var k = 0; k < gatewayPaths.length; k++) {
    var gp = gatewayPaths[k];
    // Include this target + its gateways
    spendableSet.add(gp.target);
    for (var g = 0; g < gp.gateways.length; g++) {
      spendableSet.add(gp.gateways[g]);
    }
  }

  var spendable = Array.from(spendableSet).sort(function(a, b) { return a - b; });

  // Compute how many total upgrade levels are possible across all spendable nodes
  var maxSpendable = 0;
  for (var s = 0; s < spendable.length; s++) {
    maxSpendable += RES_GRID_RAW[spendable[s]][1] - (gl[spendable[s]] || 0);
  }

  var freePoints = Math.max(0, totalPoints - maxSpendable);
  var notice = null;
  if (freePoints > 0) {
    notice = freePoints + ' point' + (freePoints > 1 ? 's' : '') + ' won\'t affect Research EXP - spend freely on other upgrades!';
  }
  if (spendable.length === 0 && totalPoints > 0) {
    notice = 'All ' + totalPoints + ' point' + (totalPoints > 1 ? 's' : '') + ' are free to spend - no remaining grid upgrades affect Research EXP!';
  }

  return { spendable: spendable, freePoints: freePoints, notice: notice };
}

function _isSeedCell(idx) {
  var col = idx % GRID_COLS;
  return (col === 9 || col === 10) && idx >= 100 && idx <= 140;
}

export function _enumGridCombos(spendable, baseGL, numPoints) {
  var results = [];
  var caps = [];
  for (var i = 0; i < spendable.length; i++) {
    var idx = spendable[i];
    caps[i] = RES_GRID_RAW[idx][1] - (baseGL[idx] || 0);
  }
  var alloc = new Array(spendable.length).fill(0);

  function recurse(sqIdx, remaining) {
    if (remaining === 0) {
      var gl = baseGL.slice();
      var steps = [];
      var newNodes = [];
      for (var i = 0; i < spendable.length; i++) {
        if (alloc[i] > 0) {
          gl[spendable[i]] = (gl[spendable[i]] || 0) + alloc[i];
          for (var r = 0; r < alloc[i]; r++) steps.push(spendable[i]);
          if ((baseGL[spendable[i]] || 0) === 0) newNodes.push(spendable[i]);
        }
      }
      // Validate: every newly-leveled node must be reachable from existing grid.
      // Flood-fill from seed cells + baseGL owned cells through gl lv>=1 nodes.
      if (newNodes.length > 0) {
        var reachable = new Set();
        var queue = [];
        for (var si = 0; si < GRID_SIZE; si++) {
          if ((baseGL[si] || 0) >= 1 || _isSeedCell(si)) {
            reachable.add(si);
            queue.push(si);
          }
        }
        while (queue.length > 0) {
          var cur = queue.pop();
          var cc = cur % GRID_COLS;
          var neighbors = [];
          if (cur >= GRID_COLS) neighbors.push(cur - GRID_COLS);
          if (cur < GRID_SIZE - GRID_COLS) neighbors.push(cur + GRID_COLS);
          if (cc > 0) neighbors.push(cur - 1);
          if (cc < GRID_COLS - 1) neighbors.push(cur + 1);
          for (var ni = 0; ni < neighbors.length; ni++) {
            var n = neighbors[ni];
            if (reachable.has(n)) continue;
            if (!RES_GRID_RAW[n]) continue;
            if ((gl[n] || 0) >= 1) { reachable.add(n); queue.push(n); }
          }
        }
        var valid = true;
        for (var vi = 0; vi < newNodes.length; vi++) {
          if (!reachable.has(newNodes[vi])) { valid = false; break; }
        }
        if (!valid) return;
      }
      results.push({ steps: steps, gl: gl });
      return;
    }
    if (sqIdx >= spendable.length) return;
    var maxAdd = Math.min(remaining, caps[sqIdx]);
    for (var add = maxAdd; add >= 0; add--) {
      alloc[sqIdx] = add;
      recurse(sqIdx + 1, remaining - add);
    }
    alloc[sqIdx] = 0;
  }

  recurse(0, numPoints);
  return results;
}

function _exhaustiveSpendAtLevel(s, ctx) {
  var gl = s.gl, so = s.so, md = s.md, il = s.il, occ = s.occ, rLv = s.rLv, mMax = s.mMax;
  var avail = _gridPointsAvail(gl, rLv);
  if (avail <= 0) return { changed: false, so: so, freePoints: 0 };

  var expandResult = _expandSpendable(gl, avail, so, md, il, occ, rLv, ctx);
  var spendable = expandResult.spendable;
  var freePoints = expandResult.freePoints;

  if (spendable.length === 0) return { changed: false, so: so, freePoints: avail };

  var usefulPoints = Math.min(avail, avail - freePoints);
  if (usefulPoints <= 0) return { changed: false, so: so, freePoints: avail };

  var combos = _enumGridCombos(spendable, gl, usefulPoints);
  if (combos.length === 0) return { changed: false, so: so, freePoints: avail };

  // Single combo - apply directly
  if (combos.length === 1) {
    for (var s0 = 0; s0 < combos[0].steps.length; s0++) gl[combos[0].steps[s0]] = (gl[combos[0].steps[s0]] || 0) + 1;
    refreshAbm(ctx, gl);
    var m0 = computeMagnifiersOwnedWith(gl, rLv, ctx);
    _growMagPoolTyped(md, gl, rLv, m0, ctx);
    return { changed: true, so: so, steps: combos[0].steps, freePoints: freePoints };
  }

  // Score each combo by simTotalExpWith (immediate EXP/hr rate)
  var bestCombo = null, bestRate = -Infinity;
  for (var ci = 0; ci < combos.length; ci++) {
    var trialABM = calcAllBonusMultiWith(combos[ci].gl, ctx.hasComp55, ctx.hasComp0DivOk);
    var rate = simTotalExpWith(combos[ci].gl, so, md, il, occ, rLv, { ...ctx, abm: trialABM });
    if (rate > bestRate) { bestRate = rate; bestCombo = combos[ci]; }
  }

  if (!bestCombo) return { changed: false, so: so };

  // Apply winning allocation to live gl array
  for (var si = 0; si < bestCombo.steps.length; si++) {
    gl[bestCombo.steps[si]] = (gl[bestCombo.steps[si]] || 0) + 1;
  }
  refreshAbm(ctx, gl);

  // Handle magnifier pool growth (for #72 kaleidoscope or #91 monocle)
  var mOwned = computeMagnifiersOwnedWith(gl, rLv, ctx);
  _growMagPoolTyped(md, gl, rLv, mOwned, ctx);

  return { changed: true, so: so, steps: bestCombo.steps, freePoints: freePoints };
}

function _beamForwardSim(initState, target, assumeObs) {
  var sc = cloneSimState(initState);
  var gl = sc.gl, so = sc.so, md = sc.md, il = sc.il, ip = sc.ip, occ = sc.occ;
  var rLv = sc.rLv, rExp = sc.rExp, mMax = sc.mMax, mOwned = sc.mOwned;

  var ctx = ctxFrom(sc);

  var curExpHr = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
  var currentTime = 0;
  var totalExp = 0;
  var maxTime = target.type === 'hours' ? target.value : 1e9;

  for (var jump = 0; jump < 50000; jump++) {
    if (target.type === 'level' && rLv >= target.value) break;
    if (target.type === 'hours' && currentTime >= target.value) break;
    if (curExpHr <= 0) break;

    // Time to next research level-up
    var expToLv = researchExpReq(rLv, ctx.serverVarResXP) - rExp;
    var jumpHrs = expToLv / curExpHr;

    // Time to next insight level-up
    var monoObs = getMonoObsSet(md);
    var hrsToIns = hrsToNextInsightLv(monoObs, md, il, ip, gl, so, ctx);
    if (hrsToIns < jumpHrs) jumpHrs = hrsToIns;

    // Clamp to remaining time
    var remaining = maxTime - currentTime;
    if (target.type === 'hours' && remaining < jumpHrs) jumpHrs = remaining;
    if (jumpHrs <= 0) jumpHrs = 1e-9;
    if (jumpHrs > 1e8) break;

    // Advance time and accumulate EXP
    var jumpSec = jumpHrs * 3600;
    var expGained = curExpHr / 3600 * jumpSec;
    rExp += expGained;
    totalExp += expGained;
    currentTime += jumpHrs;

    // Advance insight EXP
    var insightLeveledUp = advanceInsightLevels(monoObs, md, il, ip, gl, so, ctx, jumpHrs);

    // Research level-ups
    var _adv = advanceResearchLevel(rExp, rLv, ctx.serverVarResXP);
    rExp = _adv.rExp; rLv = _adv.rLv; var rLeveledUp = _adv.changed;
    if (rLeveledUp) {
      var nm = magMaxForLevel(rLv);
      if (nm > mMax) mMax = nm;
    }

    // Handle research level-up: greedy grid spend + simplified reconfig
    if (rLeveledUp) {
      if (assumeObs) {
        for (var aoi = 0; aoi < OCC_DATA.length; aoi++) {
          if ((occ[aoi] || 0) < 1 && OCC_DATA[aoi].roll <= rLv) occ[aoi] = 1;
        }
      }
      var spendResult = _exhaustiveSpendAtLevel({gl:gl, so:so, md:md, il:il, occ:occ, rLv:rLv, mMax:mMax}, ctx);
      if (spendResult.changed) so = spendResult.so;
      mOwned = computeMagnifiersOwnedWith(gl, rLv, ctx);
      _growMagPoolTyped(md, gl, rLv, mOwned, ctx);
      md = _reoptRegularMags({gl, so, md, il, occ, rLv, mMax}, ctx);
      md = _monoAssignBestQuick({gl, so, md, il, ip, occ, rLv, mMax}, ctx);
      curExpHr = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
    }

    // Handle insight level-up: reoptimize mags if insight affects EXP
    if (insightLeveledUp && insightAffectsExp(gl, so, ctx)) {
      md = _reoptRegularMags({gl, so, md, il, occ, rLv, mMax}, ctx);
      curExpHr = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
    }
  }

  return { totalTimeHrs: currentTime, totalExp: totalExp, rLv: rLv };
}

export function _beamSpendAtLevel(s, ctx, target, assumeObs) {
  var gl = s.gl, so = s.so, md = s.md, il = s.il, ip = s.ip, occ = s.occ;
  var rLv = s.rLv, rExp = s.rExp, mMax = s.mMax;
  var avail = _gridPointsAvail(gl, rLv);
  if (avail <= 0) return { changed: false, so: so, freePoints: 0 };

  var expandResult = _expandSpendable(gl, avail, so, md, il, occ, rLv, ctx);
  var spendable = expandResult.spendable;
  var freePoints = expandResult.freePoints;

  if (spendable.length === 0) return { changed: false, so: so, freePoints: avail };

  var usefulPoints = Math.min(avail, avail - freePoints);
  if (usefulPoints <= 0) return { changed: false, so: so, freePoints: avail };

  var combos = _enumGridCombos(spendable, gl, usefulPoints);
  if (combos.length === 0) return { changed: false, so: so, freePoints: avail };

  // Single combo - apply directly, no scoring needed
  if (combos.length === 1) {
    for (var s0 = 0; s0 < combos[0].steps.length; s0++) gl[combos[0].steps[s0]] = (gl[combos[0].steps[s0]] || 0) + 1;
    refreshAbm(ctx, gl);
    var m0 = computeMagnifiersOwnedWith(gl, rLv, ctx);
    _growMagPoolTyped(md, gl, rLv, m0, ctx);
    return { changed: true, so: so, steps: combos[0].steps, freePoints: freePoints };
  }

  // Score each combo by forward sim to target (lookahead scoring)
  var bestCombo = null, bestScore = target.type === 'level' ? Infinity : -Infinity;

  for (var ci = 0; ci < combos.length; ci++) {
    var trialMOwned = computeMagnifiersOwnedWith(combos[ci].gl, rLv, ctx);
    var trialMD = md.map(function(m) { return {type:m.type, slot:m.slot, x:m.x, y:m.y}; });
    _growMagPoolTyped(trialMD, combos[ci].gl, rLv, trialMOwned, ctx);

    var result = _beamForwardSim({
      gl: combos[ci].gl, so: so, md: trialMD,
      il: il, ip: ip, occ: occ,
      rLv: rLv, rExp: rExp, mMax: mMax, mOwned: trialMOwned
    }, target, assumeObs);

    // Level target: lower time is better. Hours target: higher totalExp is better.
    if (target.type === 'level') {
      if (result.totalTimeHrs < bestScore) { bestScore = result.totalTimeHrs; bestCombo = combos[ci]; }
    } else {
      if (result.totalExp > bestScore) { bestScore = result.totalExp; bestCombo = combos[ci]; }
    }
  }

  if (!bestCombo) return { changed: false, so: so };

  // Apply winning allocation to live gl array
  for (var si = 0; si < bestCombo.steps.length; si++) {
    gl[bestCombo.steps[si]] = (gl[bestCombo.steps[si]] || 0) + 1;
  }
  refreshAbm(ctx, gl);

  var mOwned = computeMagnifiersOwnedWith(gl, rLv, ctx);
  _growMagPoolTyped(md, gl, rLv, mOwned, ctx);

  return { changed: true, so: so, steps: bestCombo.steps, freePoints: freePoints };
}

