// Enchant simulation web worker
// Receives: { simCount, enchCount, levels, foundList, focusChance, strategy, focusIdx, targets, targetList }
// Posts progress: { type: 'progress', done, total }
// Posts result:   { type: 'done', spreadSums, spreadMins, spreadMaxs, allHit, perTarget }

self.onmessage = function(e) {
  var d = e.data;
  var simCount = d.simCount;
  var enchCount = d.enchCount;
  var levels = d.levels;
  var foundList = d.foundList;
  var focusChance = d.focusChance;
  var strategy = d.strategy;
  var focusIdx = d.focusIdx;
  var targets = d.targets;
  var targetList = d.targetList;
  var hasTargets = targetList.length > 0;

  var spreadSums = new Array(40); for (var i = 0; i < 40; i++) spreadSums[i] = 0;
  var spreadMins = new Array(40); for (var i = 0; i < 40; i++) spreadMins[i] = Infinity;
  var spreadMaxs = new Array(40); for (var i = 0; i < 40; i++) spreadMaxs[i] = 0;
  var allHit = 0;
  var perTarget = {};
  if (hasTargets) { for (var ci in targets) perTarget[ci] = 0; }

  var BATCH = 500;
  var done = 0;

  function runBatch() {
    var end = Math.min(done + BATCH, simCount);
    for (var sim = done; sim < end; sim++) {
      var simLevels = new Array(40);
      for (var i = 0; i < 40; i++) simLevels[i] = levels[i] >= 1 ? 1 : 0;

      for (var e = 0; e < enchCount; e++) {
        var curFocus = -1;
        if (strategy === 'smart') {
          if (hasTargets) {
            var allMet = true;
            var worstRatio = Infinity;
            for (var ti = 0; ti < targetList.length; ti++) {
              var ci = targetList[ti];
              var curLv = Math.max(0, simLevels[ci] - 1);
              if (curLv < targets[ci]) {
                allMet = false;
                var ratio = targets[ci] > 0 ? curLv / targets[ci] : 1;
                if (ratio < worstRatio) { worstRatio = ratio; curFocus = ci; }
              }
            }
          }
          // No targets or all met → fall back to dropdown
          if (curFocus === -1 && focusIdx >= 0) curFocus = focusIdx;
        } else if (strategy === 'fixed') {
          curFocus = focusIdx;
        }

        var target;
        if (curFocus >= 0 && Math.random() < focusChance) {
          target = curFocus;
        } else {
          target = foundList[Math.floor(Math.random() * foundList.length)];
        }
        simLevels[target]++;
      }

      for (var i = 0; i < 40; i++) {
        var enchLv = Math.max(0, simLevels[i] - 1);
        spreadSums[i] += enchLv;
        if (enchLv < spreadMins[i]) spreadMins[i] = enchLv;
        if (enchLv > spreadMaxs[i]) spreadMaxs[i] = enchLv;
      }

      if (hasTargets) {
        var hitAll = true;
        for (var ci in targets) {
          var enchLv = Math.max(0, simLevels[Number(ci)] - 1);
          if (enchLv >= targets[ci]) perTarget[ci]++;
          else hitAll = false;
        }
        if (hitAll) allHit++;
      }
    }
    done = end;

    if (done < simCount) {
      self.postMessage({ type: 'progress', done: done, total: simCount });
      setTimeout(runBatch, 0);
    } else {
      self.postMessage({ type: 'progress', done: simCount, total: simCount });
      // Fix Infinity mins
      for (var i = 0; i < 40; i++) { if (spreadMins[i] === Infinity) spreadMins[i] = 0; }
      self.postMessage({
        type: 'done',
        spreadSums: spreadSums,
        spreadMins: spreadMins,
        spreadMaxs: spreadMaxs,
        allHit: allHit,
        perTarget: perTarget,
        simCount: simCount
      });
    }
  }

  runBatch();
};
