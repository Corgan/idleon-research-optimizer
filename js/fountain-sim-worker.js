/**
 * Fountain Simulator Web Worker
 *
 * Receives: { saveData, uLvs, mLvs, desired, timeLimit, marbleBarSec, currencies, marbles }
 * Posts back:
 *   { type: 'progress', pct }           — progress update (0–100)
 *   { type: 'done', result }            — final result
 *   { type: 'error', message }          — error
 */
import * as F from './stats/systems/w5/fountain.js';

self.onmessage = function(e) {
  try {
    var result = runSim(e.data);
    self.postMessage({ type: 'done', result: result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};

function runSim(cfg) {
  var saveData   = cfg.saveData;
  var simULvs    = F.cloneUpgLvs(cfg.uLvs);
  var simMLvs    = F.cloneMarbleLvs(cfg.mLvs);
  var desired    = cfg.desired;
  var timeLimitS = cfg.timeLimit * 3600; // hours -> seconds
  var clock      = 0; // seconds elapsed

  // Currency balances (mutable)
  var currencies = cfg.currencies.slice();
  var marbles    = cfg.marbles;

  // Marble bar: REAL seconds accumulated toward next fill.
  // Save stores raw game seconds; convert to real seconds by dividing by active speed.
  var _initActiveSpeed = F.activeSpeedMulti(simULvs, simMLvs);
  var marbleBarSec = (cfg.marbleBarSec || 0) / _initActiveSpeed;

  // Current desired currency type being farmed
  var curDesired = desired;

  var events = []; // timeline events
  var stepCount = 0;

  // Snapshot marble/hr at start
  var startMarbleRate = F.marblePerHr(saveData, simULvs, simMLvs);
  var startBaseCurr   = F.baseCurrencyPerHr(saveData, simULvs, simMLvs);
  var startCurrRates  = F.earnRatesPerHr(saveData, simULvs, simMLvs);

  // ========== HELPERS ==========

  // Recalculate all dynamic rates for current state
  function _rates() {
    var earnRates = F.earnRatesPerHr(saveData, simULvs, simMLvs);
    var mRate     = F.marblePerHr(saveData, simULvs, simMLvs);
    var mFillSec  = F.marbleBarFillTime() / F.activeSpeedMulti(simULvs, simMLvs);
    return { earnRates: earnRates, marbleRate: mRate, marbleFillSec: mFillSec };
  }

  // Find the best marble/hr-boosting regular upgrade (for scoring currency-only upgrades).
  // Returns { mPct, ttaHrs } or null if no marble/hr upgrade is available.
  function _findBestMarbleTarget(rates) {
    var best = null;
    var bestScore = 0;
    for (var bw = 0; bw < F.WATERS_IMPLEMENTED; bw++) {
      for (var bu = 0; bu < 20; bu++) {
        if (!F.upgUnlocked(simULvs, bw, bu)) continue;
        var bLv = simULvs[bw][bu] || 0;
        var bTry = F.cloneUpgLvs(simULvs);
        bTry[bw][bu] = bLv + 1;
        var bNewM = F.marblePerHr(saveData, bTry, simMLvs);
        var bMGain = bNewM - rates.marbleRate;
        if (bMGain <= 0) continue;
        var bMPct = rates.marbleRate > 0 ? bMGain / rates.marbleRate : 0;
        var bType = F.UPG_DATA[bw][bu][3];
        var bCost = F.upgCost(bw, bu, bLv);
        var bRemaining = Math.max(0, bCost - currencies[bType]);
        var bEarnRate = rates.earnRates[bType];
        var bEarnSec = bEarnRate > 0 ? (bRemaining / bEarnRate) * 3600 : Infinity;
        var bSwitch = (bType !== curDesired && bRemaining > 0)
          ? F.flushTime(saveData, simULvs, simMLvs) : 0;
        var bTTA = bEarnSec + bSwitch;
        if (!isFinite(bTTA)) continue;
        var ttaHrs = Math.max(0.001, bTTA / 3600); // floor to avoid div-by-zero
        var s = bMPct / ttaHrs;
        if (s > bestScore) {
          bestScore = s;
          best = { mPct: bMPct, ttaHrs: ttaHrs };
        }
      }
    }
    return best;
  }

  // Score a regular upgrade candidate
  // marbleTarget: from _findBestMarbleTarget(), used to value currency-only upgrades
  function _scoreUpgrade(w, u, rates, marbleTarget) {
    var lv   = simULvs[w][u] || 0;
    var cost = F.upgCost(w, u, lv);
    var type = F.UPG_DATA[w][u][3];
    var have = currencies[type];
    var remaining = Math.max(0, cost - have);

    // Time to afford = earn time + switch cost if needed
    var earnRate = rates.earnRates[type];
    var earnTimeSec = earnRate > 0 ? (remaining / earnRate) * 3600 : Infinity;

    // If we're not farming this type, add flush time to switch
    var switchCost = 0;
    if (type !== curDesired && remaining > 0) {
      switchCost = F.flushTime(saveData, simULvs, simMLvs);
    }

    var ttaSec = earnTimeSec + switchCost;
    if (!isFinite(ttaSec) || ttaSec < 0) ttaSec = Infinity;

    // What does buying this upgrade do to marble rate AND optimal rate?
    var tryLvs = F.cloneUpgLvs(simULvs);
    tryLvs[w][u] = lv + 1;
    var newMRate = F.marblePerHr(saveData, tryLvs, simMLvs);
    var mGain = newMRate - rates.marbleRate;
    var mPct = rates.marbleRate > 0 ? mGain / rates.marbleRate : 0;

    var curOpt = F.measureGoal(saveData, 'optimal', simULvs, simMLvs, desired);
    var newOpt = F.measureGoal(saveData, 'optimal', tryLvs, simMLvs, desired);
    var optGain = curOpt > 0 ? (newOpt - curOpt) / curOpt : 0;

    // Effective gain depends on whether this directly boosts marble/hr.
    // Direct marble booster: mPct weighted 3x (primary goal) + optGain (secondary).
    // Currency-only (no mPct): value = how much it accelerates the next marble/hr
    // milestone. If earn rate goes up by optGain%, the marble target's TTA shrinks,
    // so we get marbleTarget.mPct sooner. Equivalent gain ≈ marbleTarget.mPct * optGain.
    // This naturally penalizes detours that cost more time than they save.
    var effectiveGain;
    if (mPct > 0) {
      effectiveGain = mPct * 3 + Math.max(0, optGain);
    } else if (optGain > 0 && marbleTarget) {
      effectiveGain = marbleTarget.mPct * 3 * optGain;
    } else if (optGain > 0) {
      effectiveGain = optGain; // no marble milestone — pure earn rate optimization
    } else {
      effectiveGain = 0;
    }

    // Investment hours: recoup time (affordable) or TTA (non-affordable).
    // Recoup = cost/earnRate — spending currency now delays other purchases
    // in the same pool, so cheaper upgrades score higher for equal gain.
    var investHrs;
    if (remaining > 0) {
      investHrs = ttaSec / 3600;
    } else {
      var recoupSec = earnRate > 0 ? (cost / earnRate) * 3600 : Infinity;
      investHrs = recoupSec / 3600;
    }
    var score = effectiveGain > 0 && investHrs > 0 && isFinite(investHrs)
      ? effectiveGain / investHrs : 0;

    // Don't target upgrades that can't be completed in remaining sim time
    if (ttaSec > timeLimitS - clock) score = 0;

    return {
      score: score, ttaSec: ttaSec, switchCost: switchCost,
      mGain: mGain, mPct: mPct, optGain: optGain,
      cost: cost, costType: type, remaining: remaining,
      isMarble: false, w: w, u: u, name: F.UPG_DATA[w][u][0],
      newLv: lv + 1,
    };
  }

  // Score a marble upgrade candidate
  // marbleTarget: from _findBestMarbleTarget(), for discounting optGain-only upgrades
  function _scoreMarble(w, u, rates, marbleTarget) {
    var mLv  = simMLvs[w][u] || 0;
    var cost = F.marbleCost(u, mLv);
    var have = marbles;
    var remaining = Math.max(0, cost - have);

    // Time to afford from marble income
    var ttaSec = rates.marbleRate > 0 ? (remaining / rates.marbleRate) * 3600 : Infinity;

    // What does this marble upgrade do to marble rate AND optimal rate?
    var tryMLvs = F.cloneMarbleLvs(simMLvs);
    tryMLvs[w][u] = mLv + 1;
    var newMRate = F.marblePerHr(saveData, simULvs, tryMLvs);
    var mGain = newMRate - rates.marbleRate;
    var mPct = rates.marbleRate > 0 ? mGain / rates.marbleRate : 0;

    var curOpt = F.measureGoal(saveData, 'optimal', simULvs, simMLvs, desired);
    var newOpt = F.measureGoal(saveData, 'optimal', simULvs, tryMLvs, desired);
    var optGain = curOpt > 0 ? (newOpt - curOpt) / curOpt : 0;

    // Effective gain: same marble-target discounting as regular upgrades.
    // Marble upgrades that only boost earn rate (optGain) are valued by how
    // much they accelerate the next marble/hr milestone (which requires currency).
    // Marble upgrades that directly boost marble/hr get full value.
    var effectiveGain;
    if (mPct > 0) {
      effectiveGain = mPct * 3 + Math.max(0, optGain);
    } else if (optGain > 0 && marbleTarget) {
      effectiveGain = marbleTarget.mPct * 3 * optGain;
    } else if (optGain > 0) {
      effectiveGain = optGain;
    } else {
      effectiveGain = 0;
    }

    // Investment: recoup time for affordable, TTA for non-affordable.
    var investHrs;
    if (remaining > 0) {
      investHrs = ttaSec / 3600;
    } else {
      var recoupSec = rates.marbleRate > 0 ? (cost / rates.marbleRate) * 3600 : Infinity;
      investHrs = recoupSec / 3600;
    }
    var score = effectiveGain > 0 && investHrs > 0 && isFinite(investHrs)
      ? effectiveGain / investHrs : 0;

    // Don't target upgrades that can't be completed in remaining sim time
    if (ttaSec > timeLimitS - clock) score = 0;

    return {
      score: score, ttaSec: ttaSec, switchCost: 0,
      mGain: mGain, mPct: mPct, optGain: optGain,
      cost: cost, costType: -1, remaining: remaining,
      isMarble: true, w: w, u: u, name: F.UPG_DATA[w][u][0],
      newMLv: mLv + 1,
    };
  }

  // Buy all currently affordable upgrades, best-first
  function _buyAffordable(rates) {
    var bought = true;
    while (bought) {
      bought = false;
      var bestScore = 0, bestC = null; // score must be > 0 to buy
      var mt = _findBestMarbleTarget(rates);

      // Check regular upgrades
      for (var w = 0; w < F.WATERS_IMPLEMENTED; w++) {
        for (var u = 0; u < 20; u++) {
          if (!F.upgUnlocked(simULvs, w, u)) continue;
          var lv = simULvs[w][u] || 0;
          var cost = F.upgCost(w, u, lv);
          var type = F.UPG_DATA[w][u][3];
          if (currencies[type] < cost) continue;
          var c = _scoreUpgrade(w, u, rates, mt);
          if (c.score > bestScore) {
            bestScore = c.score; bestC = c;
          }
        }
      }

      // Check marble upgrades
      for (var w = 0; w < F.WATERS_IMPLEMENTED; w++) {
        for (var u = 0; u < 20; u++) {
          if ((simULvs[w][u] || 0) <= 0) continue;
          if (!F.canMarble(w, u)) continue;
          var mLv = simMLvs[w][u] || 0;
          var cost = F.marbleCost(u, mLv);
          if (marbles < cost) continue;
          var c = _scoreMarble(w, u, rates, mt);
          if (c.score > bestScore) {
            bestScore = c.score; bestC = c;
          }
        }
      }

      if (bestC) {
        // Execute purchase
        if (bestC.isMarble) {
          marbles -= bestC.cost;
          simMLvs[bestC.w][bestC.u] = bestC.newMLv;
          events.push({
            time: clock, type: 'buy-marble',
            name: bestC.name, w: bestC.w, u: bestC.u,
            cost: bestC.cost, newLv: bestC.newMLv,
            marbleRate: F.marblePerHr(saveData, simULvs, simMLvs),
            baseCurrRate: F.baseCurrencyPerHr(saveData, simULvs, simMLvs),
            currRates: F.earnRatesPerHr(saveData, simULvs, simMLvs),
          });
        } else {
          currencies[bestC.costType] -= bestC.cost;
          simULvs[bestC.w][bestC.u] = bestC.newLv;
          events.push({
            time: clock, type: 'buy-upgrade',
            name: bestC.name, w: bestC.w, u: bestC.u,
            cost: bestC.cost, costType: bestC.costType, newLv: bestC.newLv,
            marbleRate: F.marblePerHr(saveData, simULvs, simMLvs),
            baseCurrRate: F.baseCurrencyPerHr(saveData, simULvs, simMLvs),
            currRates: F.earnRatesPerHr(saveData, simULvs, simMLvs),
          });
        }
        rates = _rates(); // recalculate rates after purchase
        // Don't increment stepCount here — affordable buys are instant
        // side effects, not separate planning steps.
        bought = true;
      }
    }
    return rates;
  }

  // ========== ADVANCE HELPER ==========
  // Advance time by dt seconds, processing marble fills incrementally.
  // After each fill, buy any affordable marble upgrades (they compound).
  // Earns curDesired currency throughout.
  // Returns { rates, earned } — updated rates and total currency earned.
  function _advanceTime(dt, rates) {
    var tRemaining = dt;
    var totalEarned = 0;
    while (tRemaining > 0) {
      // Time until next marble fill
      var timeToFill = rates.marbleFillSec - marbleBarSec;
      if (timeToFill <= 0) timeToFill = rates.marbleFillSec;

      if (timeToFill > tRemaining) {
        // No fill in remaining time — just earn and advance
        var seg = (rates.earnRates[curDesired] / 3600) * tRemaining;
        currencies[curDesired] += seg;
        totalEarned += seg;
        marbleBarSec += tRemaining;
        clock += tRemaining;
        tRemaining = 0;
      } else {
        // Advance to next fill
        var seg = (rates.earnRates[curDesired] / 3600) * timeToFill;
        currencies[curDesired] += seg;
        totalEarned += seg;
        clock += timeToFill;
        tRemaining -= timeToFill;
        marbleBarSec = 0;

        var marblesGained = F.marblePerFill(saveData, simULvs, simMLvs);
        marbles += marblesGained;
        events.push({
          time: clock, type: 'marble-fill',
          marbles: marblesGained, totalMarbles: marbles,
          marbleRate: rates.marbleRate,
          baseCurrRate: F.baseCurrencyPerHr(saveData, simULvs, simMLvs),
          currRates: F.earnRatesPerHr(saveData, simULvs, simMLvs),
        });

        // Buy any affordable marble upgrades after this fill
        var boughtMarble = true;
        while (boughtMarble) {
          boughtMarble = false;
          var bestMS = 0, bestMC = null;
          for (var mw = 0; mw < F.WATERS_IMPLEMENTED; mw++) {
            for (var mu = 0; mu < 20; mu++) {
              if ((simULvs[mw][mu] || 0) <= 0) continue;
              if (!F.canMarble(mw, mu)) continue;
              var mLv = simMLvs[mw][mu] || 0;
              var mCost = F.marbleCost(mu, mLv);
              if (marbles < mCost) continue;
              var mc = _scoreMarble(mw, mu, rates, null);
              if (mc.score > bestMS) { bestMS = mc.score; bestMC = mc; }
            }
          }
          if (bestMC) {
            marbles -= bestMC.cost;
            simMLvs[bestMC.w][bestMC.u] = bestMC.newMLv;
            events.push({
              time: clock, type: 'buy-marble',
              name: bestMC.name, w: bestMC.w, u: bestMC.u,
              cost: bestMC.cost, newLv: bestMC.newMLv,
              marbleRate: F.marblePerHr(saveData, simULvs, simMLvs),
              baseCurrRate: F.baseCurrencyPerHr(saveData, simULvs, simMLvs),
              currRates: F.earnRatesPerHr(saveData, simULvs, simMLvs),
            });
            rates = _rates();
            boughtMarble = true;
          }
        }
      }
    }
    return { rates: rates, earned: totalEarned };
  }

  // ========== MAIN SIM LOOP ==========
  var rates = _rates();
  var lastProgressPct = -1;

  // Buy anything affordable at start
  rates = _buyAffordable(rates);

  while (clock < timeLimitS) {
    // Score only CURRENCY upgrades for target selection.
    // Marble upgrades are NOT targets — they're bought opportunistically
    // during time advances as marble fills accumulate passively.
    var best = null;
    var mt = _findBestMarbleTarget(rates);

    for (var w = 0; w < F.WATERS_IMPLEMENTED; w++) {
      for (var u = 0; u < 20; u++) {
        if (!F.upgUnlocked(simULvs, w, u)) continue;
        var c = _scoreUpgrade(w, u, rates, mt);
        if (c.score > 0 && (!best || c.score > best.score)) best = c;
      }
    }

    if (!best) {
      // No currency upgrade worth targeting. Advance remaining time
      // in one block — marble fills + marble buys still happen.
      var remainingTime = timeLimitS - clock;
      if (remainingTime > 0) {
        // Emit claim for currency earned during idle
        var adv = _advanceTime(remainingTime, rates);
        rates = adv.rates;
        if (adv.earned > 0) {
          events.push({
            time: clock, type: 'claim',
            currType: curDesired, amount: adv.earned,
            total: currencies[curDesired], duration: remainingTime,
            marbleRate: rates.marbleRate,
            baseCurrRate: F.baseCurrencyPerHr(saveData, simULvs, simMLvs),
            currRates: F.earnRatesPerHr(saveData, simULvs, simMLvs),
          });
        }
      }
      break;
    }

    // Determine how long until we can buy this target
    var targetTtaSec = best.ttaSec;

    // If target is already affordable, buy it directly (no time advance needed)
    if (targetTtaSec <= 0) {
      currencies[best.costType] -= best.cost;
      simULvs[best.w][best.u] = best.newLv;
      events.push({
        time: clock, type: 'buy-upgrade',
        name: best.name, w: best.w, u: best.u,
        cost: best.cost, costType: best.costType, newLv: best.newLv,
        marbleRate: F.marblePerHr(saveData, simULvs, simMLvs),
        baseCurrRate: F.baseCurrencyPerHr(saveData, simULvs, simMLvs),
        currRates: F.earnRatesPerHr(saveData, simULvs, simMLvs),
      });
      stepCount++;
      rates = _rates();
      rates = _buyAffordable(rates);
      continue;
    }

    if (!isFinite(targetTtaSec)) break;

    // If target requires currency switch, handle flush
    var needSwitch = best.costType !== curDesired && best.remaining > 0;
    if (needSwitch) {
      var flushSec = F.flushTime(saveData, simULvs, simMLvs);
      if (clock + flushSec > timeLimitS) {
        clock = timeLimitS;
        break;
      }
      // Advance through flush (marble fills happen during flush too)
      var flushDt = flushSec;
      var flushAdv = _advanceTime(flushDt, rates);
      rates = flushAdv.rates;

      // Claim event for currency collected during flush
      if (flushAdv.earned > 0) {
        events.push({
          time: clock, type: 'claim',
          currType: curDesired, amount: flushAdv.earned,
          total: currencies[curDesired], duration: flushDt,
          marbleRate: rates.marbleRate,
          baseCurrRate: F.baseCurrencyPerHr(saveData, simULvs, simMLvs),
          currRates: F.earnRatesPerHr(saveData, simULvs, simMLvs),
        });
      }

      // Switch desired
      curDesired = best.costType;
      events.push({
        time: clock, type: 'switch',
        newDesired: curDesired,
        marbleRate: rates.marbleRate,
        baseCurrRate: F.baseCurrencyPerHr(saveData, simULvs, simMLvs),
        currRates: F.earnRatesPerHr(saveData, simULvs, simMLvs),
      });

      rates = _rates();
    }

    // How long to earn remaining cost from current state?
    var remaining = Math.max(0, best.cost - currencies[best.costType]);
    var earnRate = rates.earnRates[best.costType];
    var earnTimeSec = earnRate > 0 ? (remaining / earnRate) * 3600 : Infinity;

    if (!isFinite(earnTimeSec)) break;
    if (earnTimeSec < 0) earnTimeSec = 0;

    // Cap at time limit
    var advanceSec = Math.min(earnTimeSec, timeLimitS - clock);

    // Advance clock (marble fills + marble buys happen during advance)
    if (advanceSec > 0) {
      var earnAdv = _advanceTime(advanceSec, rates);
      rates = earnAdv.rates;

      // Claim event: currency collected during earning
      if (earnAdv.earned > 0) {
        events.push({
          time: clock, type: 'claim',
          currType: curDesired, amount: earnAdv.earned,
          total: currencies[curDesired], duration: advanceSec,
          marbleRate: rates.marbleRate,
          baseCurrRate: F.baseCurrencyPerHr(saveData, simULvs, simMLvs),
          currRates: F.earnRatesPerHr(saveData, simULvs, simMLvs),
        });
      }
    }

    // Check if we hit time limit
    if (clock >= timeLimitS) break;

    // Buy the currency target
    currencies[best.costType] -= best.cost;
    simULvs[best.w][best.u] = best.newLv;
    events.push({
      time: clock, type: 'buy-upgrade',
      name: best.name, w: best.w, u: best.u,
      cost: best.cost, costType: best.costType, newLv: best.newLv,
      marbleRate: F.marblePerHr(saveData, simULvs, simMLvs),
      baseCurrRate: F.baseCurrencyPerHr(saveData, simULvs, simMLvs),
      currRates: F.earnRatesPerHr(saveData, simULvs, simMLvs),
    });

    stepCount++;
    rates = _rates();

    // Buy any newly affordable upgrades (currency + marble)
    rates = _buyAffordable(rates);

    // Progress update
    var pct = Math.floor(clock / timeLimitS * 100);
    if (pct > lastProgressPct) {
      lastProgressPct = pct;
      self.postMessage({ type: 'progress', pct: pct });
    }
  }

  // Final snapshot
  var endMarbleRate  = F.marblePerHr(saveData, simULvs, simMLvs);
  var endBaseCurr    = F.baseCurrencyPerHr(saveData, simULvs, simMLvs);
  var endCurrRates   = F.earnRatesPerHr(saveData, simULvs, simMLvs);

  return {
    events: events,
    startMarbleRate: startMarbleRate,
    endMarbleRate: endMarbleRate,
    startBaseCurr: startBaseCurr,
    endBaseCurr: endBaseCurr,
    startCurrRates: startCurrRates,
    endCurrRates: endCurrRates,
    clockSec: clock,
    stepCount: stepCount,
    currencies: currencies,
    marbles: marbles,
    marbleBarSec: marbleBarSec,
    uLvs: simULvs,
    mLvs: simMLvs,
  };
}
