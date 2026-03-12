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
import { growMagPoolTyped } from './mags.js';
import { makeCtx } from '../save/context.js';
import { monoAssignBestQuick } from './monos.js';
import { reoptRegularMags } from '../sim-engine.js';
import { dtGridPointsAvail } from '../dt/dt-state.js';

function _detectExpRelevantNodes(gl, so, md, il, occ, rLv, ctx) {
  const relevant = new Set();
  const baseExpHr = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
  const baseMagCount = computeMagnifiersOwnedWith(gl, rLv, ctx);

  // Compute baseline insight rates for all monocle obs
  const monoObs = [];
  for (let mi = 0; mi < md.length; mi++) {
    if (md[mi].type === 1 && md[mi].slot >= 0 && monoObs.indexOf(md[mi].slot) < 0) monoObs.push(md[mi].slot);
  }
  const baseInsightRates = [];
  for (let oi = 0; oi < monoObs.length; oi++) {
    baseInsightRates.push(insightExpRate(monoObs[oi], md, il, gl, so, ctx));
  }

  const allSquares = Object.keys(RES_GRID_RAW).map(Number);
  for (let i = 0; i < allSquares.length; i++) {
    const idx = allSquares[i];
    const maxLv = RES_GRID_RAW[idx][1];
    const origLv = gl[idx] || 0;

    // Test each rank from 1 to maxLv
    for (let rank = 1; rank <= maxLv; rank++) {
      if (rank <= origLv) continue; // already at or past this rank
      gl[idx] = rank;
      const testCtx = { ...ctx, abm: calcAllBonusMultiWith(gl, ctx.hasComp55, ctx.hasComp0DivOk) };

      // Check 1: does research EXP rate change?
      const testExpHr = simTotalExpWith(gl, so, md, il, occ, rLv, testCtx);
      if (Math.abs(testExpHr - baseExpHr) > 1e-6) {
        relevant.add(idx);
        break;
      }

      // Check 2: does magnifier count change? (more mags = more obs coverage = more EXP)
      const testMagCount = computeMagnifiersOwnedWith(gl, rLv, ctx);
      if (testMagCount !== baseMagCount) {
        relevant.add(idx);
        break;
      }

      // Check 3: does any insight rate change?
      let insightChanged = false;
      for (let oi2 = 0; oi2 < monoObs.length; oi2++) {
        const testIR = insightExpRate(monoObs[oi2], md, il, gl, so, testCtx);
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
  const allSquares = new Set(Object.keys(RES_GRID_RAW).map(Number));
  const COLS = GRID_COLS;

  function adj(idx) {
    const col = idx % COLS, result = [];
    if (idx >= COLS) result.push(idx - COLS);
    if (idx < GRID_SIZE - COLS) result.push(idx + COLS);
    if (col > 0) result.push(idx - 1);
    if (col < COLS - 1) result.push(idx + 1);
    return result;
  }

  // BFS from targetIdx outward, looking for a node that's already unlocked
  // Cost = number of unowned nodes traversed (each needs 1 point to unlock)
  const queue = [{ idx: targetIdx, path: [], cost: 0 }];
  const visited = new Set([targetIdx]);
  while (queue.length > 0) {
    const cur = queue.shift();
    const neighbors = adj(cur.idx);
    for (let ni = 0; ni < neighbors.length; ni++) {
      const n = neighbors[ni];
      if (visited.has(n)) continue;
      visited.add(n);
      if (!allSquares.has(n)) continue; // not a grid node
      const owned = (gl[n] || 0) >= 1;
      const newCost = cur.cost + (owned ? 0 : 1);
      const newPath = cur.path.concat(owned ? [] : [n]);
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

export function expandSpendable(gl, totalPoints, so, md, il, occ, rLv, ctx) {
  // All params required - no global fallbacks.
  const allSquares = Object.keys(RES_GRID_RAW).map(Number);

  // Dynamically detect which nodes affect EXP at any rank
  const expNodes = _detectExpRelevantNodes(gl, so, md, il, occ, rLv, ctx);

  // Phase 1: Find directly reachable EXP-relevant nodes (already unlocked, not maxed)
  const directExpNodes = [];
  for (let i = 0; i < allSquares.length; i++) {
    const idx = allSquares[i];
    if ((gl[idx] || 0) >= RES_GRID_RAW[idx][1]) continue; // maxed
    if (!expNodes.has(idx)) continue;
    if (isGridCellUnlocked(idx, gl)) directExpNodes.push(idx);
  }

  // Phase 2: Find unreachable EXP-relevant nodes and their gateway paths
  const gatewayPaths = []; // { target, gateways: [idx,...], cost }
  for (let j = 0; j < allSquares.length; j++) {
    const tidx = allSquares[j];
    if ((gl[tidx] || 0) >= RES_GRID_RAW[tidx][1]) continue; // maxed
    if (!expNodes.has(tidx)) continue;
    if (isGridCellUnlocked(tidx, gl)) continue; // already directly reachable
    const path = _findGatewayPath(gl, tidx, totalPoints);
    if (path) {
      gatewayPaths.push({ target: tidx, gateways: path, cost: path.length });
    }
  }

  // Sort gateway paths by cost (cheapest first)
  gatewayPaths.sort(function(a, b) { return a.cost - b.cost; });

  // Phase 3: Greedily include gateway paths that fit within budget
  const spendableSet = new Set(directExpNodes);
  const gatewayBudget = totalPoints;
  // Subtract 1 per direct EXP node (minimum 1 point to be useful)
  // Actually, don't subtract - the combo enumerator handles allocation. Just include all reachable.
  for (let k = 0; k < gatewayPaths.length; k++) {
    const gp = gatewayPaths[k];
    // Include this target + its gateways
    spendableSet.add(gp.target);
    for (let g = 0; g < gp.gateways.length; g++) {
      spendableSet.add(gp.gateways[g]);
    }
  }

  const spendable = Array.from(spendableSet).sort(function(a, b) { return a - b; });

  // Compute how many total upgrade levels are possible across all spendable nodes
  let maxSpendable = 0;
  for (let s = 0; s < spendable.length; s++) {
    maxSpendable += RES_GRID_RAW[spendable[s]][1] - (gl[spendable[s]] || 0);
  }

  const freePoints = Math.max(0, totalPoints - maxSpendable);
  let notice = null;
  if (freePoints > 0) {
    notice = freePoints + ' point' + (freePoints > 1 ? 's' : '') + ' won\'t affect Research EXP - spend freely on other upgrades!';
  }
  if (spendable.length === 0 && totalPoints > 0) {
    notice = 'All ' + totalPoints + ' point' + (totalPoints > 1 ? 's' : '') + ' are free to spend - no remaining grid upgrades affect Research EXP!';
  }

  return { spendable: spendable, freePoints: freePoints, notice: notice };
}

function _isSeedCell(idx) {
  const col = idx % GRID_COLS;
  return (col === 9 || col === 10) && idx >= 100 && idx <= 140;
}

export function enumGridCombos(spendable, baseGL, numPoints) {
  const results = [];
  const caps = [];
  for (let i = 0; i < spendable.length; i++) {
    const idx = spendable[i];
    caps[i] = RES_GRID_RAW[idx][1] - (baseGL[idx] || 0);
  }
  const alloc = new Array(spendable.length).fill(0);

  function recurse(sqIdx, remaining) {
    if (remaining === 0) {
      const gl = baseGL.slice();
      const steps = [];
      const newNodes = [];
      for (let i = 0; i < spendable.length; i++) {
        if (alloc[i] > 0) {
          gl[spendable[i]] = (gl[spendable[i]] || 0) + alloc[i];
          for (let r = 0; r < alloc[i]; r++) steps.push(spendable[i]);
          if ((baseGL[spendable[i]] || 0) === 0) newNodes.push(spendable[i]);
        }
      }
      // Validate: every newly-leveled node must be reachable from existing grid.
      // Flood-fill from seed cells + baseGL owned cells through gl lv>=1 nodes.
      if (newNodes.length > 0) {
        const reachable = new Set();
        const queue = [];
        for (let si = 0; si < GRID_SIZE; si++) {
          if ((baseGL[si] || 0) >= 1 || _isSeedCell(si)) {
            reachable.add(si);
            queue.push(si);
          }
        }
        while (queue.length > 0) {
          const cur = queue.pop();
          const cc = cur % GRID_COLS;
          const neighbors = [];
          if (cur >= GRID_COLS) neighbors.push(cur - GRID_COLS);
          if (cur < GRID_SIZE - GRID_COLS) neighbors.push(cur + GRID_COLS);
          if (cc > 0) neighbors.push(cur - 1);
          if (cc < GRID_COLS - 1) neighbors.push(cur + 1);
          for (let ni = 0; ni < neighbors.length; ni++) {
            const n = neighbors[ni];
            if (reachable.has(n)) continue;
            if (!RES_GRID_RAW[n]) continue;
            if ((gl[n] || 0) >= 1) { reachable.add(n); queue.push(n); }
          }
        }
        let valid = true;
        for (let vi = 0; vi < newNodes.length; vi++) {
          if (!reachable.has(newNodes[vi])) { valid = false; break; }
        }
        if (!valid) return;
      }
      results.push({ steps: steps, gl: gl });
      return;
    }
    if (sqIdx >= spendable.length) return;
    const maxAdd = Math.min(remaining, caps[sqIdx]);
    for (let add = maxAdd; add >= 0; add--) {
      alloc[sqIdx] = add;
      recurse(sqIdx + 1, remaining - add);
    }
    alloc[sqIdx] = 0;
  }

  recurse(0, numPoints);
  return results;
}

function _exhaustiveSpendAtLevel(s, ctx) {
  const gl = s.gl, so = s.so, md = s.md, il = s.il, occ = s.occ, rLv = s.rLv, mMax = s.mMax;
  const avail = dtGridPointsAvail(gl, rLv);
  if (avail <= 0) return { changed: false, so: so, freePoints: 0 };

  const expandResult = expandSpendable(gl, avail, so, md, il, occ, rLv, ctx);
  const spendable = expandResult.spendable;
  const freePoints = expandResult.freePoints;

  if (spendable.length === 0) return { changed: false, so: so, freePoints: avail };

  const usefulPoints = Math.min(avail, avail - freePoints);
  if (usefulPoints <= 0) return { changed: false, so: so, freePoints: avail };

  const combos = enumGridCombos(spendable, gl, usefulPoints);
  if (combos.length === 0) return { changed: false, so: so, freePoints: avail };

  // Single combo - apply directly
  if (combos.length === 1) {
    for (let s0 = 0; s0 < combos[0].steps.length; s0++) gl[combos[0].steps[s0]] = (gl[combos[0].steps[s0]] || 0) + 1;
    refreshAbm(ctx, gl);
    const m0 = computeMagnifiersOwnedWith(gl, rLv, ctx);
    growMagPoolTyped(md, gl, rLv, m0, ctx);
    return { changed: true, so: so, steps: combos[0].steps, freePoints: freePoints };
  }

  // Score each combo by simTotalExpWith (immediate EXP/hr rate)
  let bestCombo = null, bestRate = -Infinity;
  for (let ci = 0; ci < combos.length; ci++) {
    const trialABM = calcAllBonusMultiWith(combos[ci].gl, ctx.hasComp55, ctx.hasComp0DivOk);
    const rate = simTotalExpWith(combos[ci].gl, so, md, il, occ, rLv, { ...ctx, abm: trialABM });
    if (rate > bestRate) { bestRate = rate; bestCombo = combos[ci]; }
  }

  if (!bestCombo) return { changed: false, so: so };

  // Apply winning allocation to live gl array
  for (let si = 0; si < bestCombo.steps.length; si++) {
    gl[bestCombo.steps[si]] = (gl[bestCombo.steps[si]] || 0) + 1;
  }
  refreshAbm(ctx, gl);

  // Handle magnifier pool growth (for #72 kaleidoscope or #91 monocle)
  const mOwned = computeMagnifiersOwnedWith(gl, rLv, ctx);
  growMagPoolTyped(md, gl, rLv, mOwned, ctx);

  return { changed: true, so: so, steps: bestCombo.steps, freePoints: freePoints };
}

function _beamForwardSim(initState, target, assumeObs, saveCtx) {
  const sc = cloneSimState(initState);
  const gl = sc.gl, il = sc.il, ip = sc.ip, occ = sc.occ;
  let so = sc.so, md = sc.md;
  let rLv = sc.rLv, rExp = sc.rExp, mMax = sc.mMax, mOwned = sc.mOwned;

  const ctx = makeCtx(sc.gl, saveCtx);

  let curExpHr = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
  let currentTime = 0;
  let totalExp = 0;
  const maxTime = target.type === 'hours' ? target.value : 1e9;

  for (let jump = 0; jump < 50000; jump++) {
    if (target.type === 'level' && rLv >= target.value) break;
    if (target.type === 'hours' && currentTime >= target.value) break;
    if (curExpHr <= 0) break;

    // Time to next research level-up
    const expToLv = researchExpReq(rLv, ctx.serverVarResXP) - rExp;
    let jumpHrs = expToLv / curExpHr;

    // Time to next insight level-up
    const monoObs = getMonoObsSet(md);
    const hrsToIns = hrsToNextInsightLv(monoObs, md, il, ip, gl, so, ctx);
    if (hrsToIns < jumpHrs) jumpHrs = hrsToIns;

    // Clamp to remaining time
    const remaining = maxTime - currentTime;
    if (target.type === 'hours' && remaining < jumpHrs) jumpHrs = remaining;
    if (jumpHrs <= 0) jumpHrs = 1e-9;
    if (jumpHrs > 1e8) break;

    // Advance time and accumulate EXP
    const jumpSec = jumpHrs * 3600;
    const expGained = curExpHr / 3600 * jumpSec;
    rExp += expGained;
    totalExp += expGained;
    currentTime += jumpHrs;

    // Advance insight EXP
    const insightLeveledUp = advanceInsightLevels(monoObs, md, il, ip, gl, so, ctx, jumpHrs);

    // Research level-ups
    const _adv = advanceResearchLevel(rExp, rLv, ctx.serverVarResXP);
    rExp = _adv.rExp; rLv = _adv.rLv; const rLeveledUp = _adv.changed;
    if (rLeveledUp) {
      const nm = magMaxForLevel(rLv);
      if (nm > mMax) mMax = nm;
    }

    // Handle research level-up: greedy grid spend + simplified reconfig
    if (rLeveledUp) {
      if (assumeObs) {
        for (let aoi = 0; aoi < OCC_DATA.length; aoi++) {
          if ((occ[aoi] || 0) < 1 && OCC_DATA[aoi].roll <= rLv) occ[aoi] = 1;
        }
      }
      const spendResult = _exhaustiveSpendAtLevel({gl:gl, so:so, md:md, il:il, occ:occ, rLv:rLv, mMax:mMax}, ctx);
      if (spendResult.changed) so = spendResult.so;
      mOwned = computeMagnifiersOwnedWith(gl, rLv, ctx);
      growMagPoolTyped(md, gl, rLv, mOwned, ctx);
      md = reoptRegularMags({gl, so, md, il, occ, rLv, mMax}, ctx);
      md = monoAssignBestQuick({gl, so, md, il, ip, occ, rLv, mMax}, ctx);
      curExpHr = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
    }

    // Handle insight level-up: reoptimize mags if insight affects EXP
    if (insightLeveledUp && insightAffectsExp(gl, so, ctx)) {
      md = reoptRegularMags({gl, so, md, il, occ, rLv, mMax}, ctx);
      curExpHr = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
    }
  }

  return { totalTimeHrs: currentTime, totalExp: totalExp, rLv: rLv };
}

export function beamSpendAtLevel(s, ctx, target, assumeObs, saveCtx) {
  const gl = s.gl, so = s.so, md = s.md, il = s.il, ip = s.ip, occ = s.occ;
  const rLv = s.rLv, rExp = s.rExp, mMax = s.mMax;
  const avail = dtGridPointsAvail(gl, rLv);
  if (avail <= 0) return { changed: false, so: so, freePoints: 0 };

  const expandResult = expandSpendable(gl, avail, so, md, il, occ, rLv, ctx);
  const spendable = expandResult.spendable;
  const freePoints = expandResult.freePoints;

  if (spendable.length === 0) return { changed: false, so: so, freePoints: avail };

  const usefulPoints = Math.min(avail, avail - freePoints);
  if (usefulPoints <= 0) return { changed: false, so: so, freePoints: avail };

  const combos = enumGridCombos(spendable, gl, usefulPoints);
  if (combos.length === 0) return { changed: false, so: so, freePoints: avail };

  // Single combo - apply directly, no scoring needed
  if (combos.length === 1) {
    for (let s0 = 0; s0 < combos[0].steps.length; s0++) gl[combos[0].steps[s0]] = (gl[combos[0].steps[s0]] || 0) + 1;
    refreshAbm(ctx, gl);
    const m0 = computeMagnifiersOwnedWith(gl, rLv, ctx);
    growMagPoolTyped(md, gl, rLv, m0, ctx);
    return { changed: true, so: so, steps: combos[0].steps, freePoints: freePoints };
  }

  // Score each combo by forward sim to target (lookahead scoring)
  let bestCombo = null, bestScore = target.type === 'level' ? Infinity : -Infinity;

  for (let ci = 0; ci < combos.length; ci++) {
    const trialMOwned = computeMagnifiersOwnedWith(combos[ci].gl, rLv, ctx);
    const trialMD = md.map(function(m) { return {type:m.type, slot:m.slot, x:m.x, y:m.y}; });
    growMagPoolTyped(trialMD, combos[ci].gl, rLv, trialMOwned, ctx);

    const result = _beamForwardSim({
      gl: combos[ci].gl, so: so, md: trialMD,
      il: il, ip: ip, occ: occ,
      rLv: rLv, rExp: rExp, mMax: mMax, mOwned: trialMOwned
    }, target, assumeObs, saveCtx);

    // Level target: lower time is better. Hours target: higher totalExp is better.
    if (target.type === 'level') {
      if (result.totalTimeHrs < bestScore) { bestScore = result.totalTimeHrs; bestCombo = combos[ci]; }
    } else {
      if (result.totalExp > bestScore) { bestScore = result.totalExp; bestCombo = combos[ci]; }
    }
  }

  if (!bestCombo) return { changed: false, so: so };

  // Apply winning allocation to live gl array
  for (let si = 0; si < bestCombo.steps.length; si++) {
    gl[bestCombo.steps[si]] = (gl[bestCombo.steps[si]] || 0) + 1;
  }
  refreshAbm(ctx, gl);

  const mOwned = computeMagnifiersOwnedWith(gl, rLv, ctx);
  growMagPoolTyped(md, gl, rLv, mOwned, ctx);

  return { changed: true, so: so, steps: bestCombo.steps, freePoints: freePoints };
}

