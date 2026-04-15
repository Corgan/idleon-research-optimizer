// Web Worker for Monte Carlo cog simulation.
// Receives { tier, conLv, n } and posts back sorted Float32Arrays.

function _rawMag(tier, conLv) {
  return Math.pow(3, Math.min(3.4, tier)) + 0.25 * Math.pow(conLv / 3 + 0.7, 1.4 + 0.05 * tier);
}
function _minRolls(tier) { return tier < 2 ? 2 : 3; }

function _simFullRoll(tier, conLv) {
  var base = _rawMag(tier, conLv);
  var nRolls = _minRolls(tier) + (Math.random() < 0.5 ? 1 : 0);
  var a = 0, c = 0, d = 0;
  var maxBucket = 100 + 40 * Math.floor(tier / 4);
  for (var r = 0; r < nRolls; r++) {
    var bucket = Math.floor(Math.random() * maxBucket) + 1;
    var mult;
    if (bucket < 50) mult = 0.4 + Math.random() * 1.1;
    else if (bucket < 75) mult = 0.4 + Math.random() * 1.6;
    else mult = 0.4 + Math.random() * 2.6;
    var val = Math.floor(mult * base);
    var statRoll = Math.floor(Math.random() * 100) + 1;
    if (statRoll < 69) {
      a += Math.round(val);
    } else if (statRoll < 89 && tier !== 4) {
      c += Math.round(Math.pow(val, 0.8));
    } else {
      d += Math.max(Math.floor(Math.pow(val, 0.4) + 10 * Math.log(Math.max(val, 1)) / 2.30259 - 5), 2);
    }
  }

  var dirE = 0;
  var cryLevel = 0;

  if (tier >= 4) {
    for (var s = 0; s < 5; s++) {
      if (Math.random() >= 0.35) break;
      cryLevel = s + 1;
      dirE = 0;
      var gotDir = Math.random() < 0.25 || Math.random() < 0.334;
      if (gotDir) {
        if (Math.random() < 0.5) {
          dirE = Math.floor(Math.random() * 11) + 30 + 23 * (s + 1);
        }
      }
    }
  } else {
    var dirChance = tier === 1 ? 0.25 : 0.1;
    if (Math.random() < dirChance) {
      var eChance, eMin, eMax;
      if (tier === 0) { eChance = 1; eMin = 5; eMax = 10; }
      else if (tier === 1) { eChance = 0.7; eMin = 8; eMax = 15; }
      else if (tier === 2) { eChance = 0.65; eMin = 12; eMax = 40; }
      else { eChance = 0.5; eMin = 20; eMax = 65; }
      if (Math.random() < eChance) {
        dirE = Math.floor(Math.random() * (eMax - eMin + 1)) + eMin;
      }
    }
  }

  return { a: a, c: c, d: d, dirE: dirE, cryLevel: cryLevel };
}

self.onmessage = function(ev) {
  var tier = ev.data.tier;
  var conLv = ev.data.conLv;
  var n = ev.data.n;

  // Sample 1M tuples (a,c,d,surr) for joint odds queries
  var PAIR_N = Math.min(n, 1000000);
  var sampleRate = Math.max(1, Math.floor(n / PAIR_N));
  var pairA = new Float32Array(PAIR_N);
  var pairC = new Float32Array(PAIR_N);
  var pairD = new Float32Array(PAIR_N);
  var pairS = new Float32Array(PAIR_N);
  var pi = 0;

  for (var i = 0; i < n; i++) {
    var sim = _simFullRoll(tier, conLv);
    if (i % sampleRate === 0 && pi < PAIR_N) {
      pairA[pi] = sim.a;
      pairC[pi] = sim.c;
      pairD[pi] = sim.d;
      pairS[pi] = sim.dirE;
      pi++;
    }
  }

  // Transfer the large buffers for zero-copy
  var transfers = [pairA.buffer, pairC.buffer, pairD.buffer, pairS.buffer];

  self.postMessage({ tier: tier, pairA: pairA, pairC: pairC, pairD: pairD, pairS: pairS, pairN: pi }, transfers);
};
