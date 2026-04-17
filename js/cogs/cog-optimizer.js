// ===== COG OPTIMIZER =====
// Simulated annealing optimizer for cog board placement.

import { BOARD_SIZE, BOARD_W, BOARD_H, computeBoardTotals, scoreBoard, slotToPos, posToSlot, _yinPiece } from './cog-board.js';  // same directory

/**
 * Run simulated annealing to optimize cog board for a given goal.
 * @param {Array} boardCogs - Current board-placed cogs (96 elements, null=empty)
 * @param {Array} shelfCogs - Available shelf cogs
 * @param {Array} playerCogs - All player cogs (board + off-board)
 * @param {'build'|'flaggy'|'conexp'} goal
 * @param {Object} [opts]
 * @param {number} [opts.iterations=80000]
 * @param {number} [opts.tempStart=1.0]
 * @param {number} [opts.tempEnd=0.001]
 * @param {Function} [opts.onProgress] - called with { iter, score, temp }
 * @returns {{ board, score, moves, improvement }}
 */
export function optimize(boardCogs, shelfCogs, playerCogs, goal, opts) {
  opts = opts || {};
  var iterations = opts.iterations || 80000;
  var tempStart = opts.tempStart || 1.0;
  var tempEnd = opts.tempEnd || 0.001;

  // Build working board (deep clone)
  var board = new Array(BOARD_SIZE);
  for (var i = 0; i < BOARD_SIZE; i++) {
    board[i] = boardCogs[i] ? _cloneCog(boardCogs[i]) : null;
  }

  // Build pool of available cogs: shelf cogs only (player cogs stay pinned)
  var pool = [];
  for (var i = 0; i < shelfCogs.length; i++) {
    pool.push(_cloneCog(shelfCogs[i]));
  }

  // No slots are locked — player, excogia, everything can be repositioned
  var lockedSlots = {};

  var onPhase = opts.onPhase || function() {};

  // Measure original score
  var originalScore = scoreBoard(computeBoardTotals(board), goal, board);

  // Phase 1: Greedy initial construction on a clone
  onPhase({ phase: 1, label: 'Greedy construction', progress: 0 });
  var greedyBoard = _cloneBoard(board);
  var greedyPool = pool.map(function(c) { return _cloneCog(c); });
  _greedyConstruct(greedyBoard, greedyPool, lockedSlots, goal, onPhase);
  var greedyScore = scoreBoard(computeBoardTotals(greedyBoard), goal, greedyBoard);

  var pctG = originalScore > 0 ? ((greedyScore - originalScore) / originalScore * 100).toFixed(4) : 'N/A';
  console.log('[Optimizer] Greedy: ' + greedyScore.toFixed(2) + ' vs Original: ' + originalScore.toFixed(2) + ' (' + pctG + '%)');
  console.log('[Optimizer] Using ' + (greedyScore > originalScore ? 'GREEDY' : 'ORIGINAL') + ' as SA starting point');

  if (greedyScore > originalScore) {
    board = greedyBoard;
    pool = greedyPool;
  }

  // Lock Yin cog slots that form valid 2x2 Excogia blocks so SA won't scatter them
  _lockYinBlocks(board, lockedSlots);

  // Compute initial score
  var bestScore = scoreBoard(computeBoardTotals(board), goal, board);
  var currentScore = bestScore;
  var bestBoard = _cloneBoard(board);
  var initialScore = originalScore;
  var moves = [];
  var moveLog = [];

  // Temperature schedule: exponential decay
  var logRatio = Math.log(tempEnd / tempStart);

  onPhase({ phase: 2, label: 'Simulated annealing', progress: 0 });
  for (var iter = 0; iter < iterations; iter++) {
    var temp = tempStart * Math.exp(logRatio * iter / iterations);

    // Generate a random move
    var move = _randomMove(board, pool, lockedSlots);
    if (!move) continue;

    // Apply move
    _applyMove(board, pool, move);

    // Evaluate
    var newScore = scoreBoard(computeBoardTotals(board), goal, board);
    var delta = newScore - currentScore;

    // Accept or reject
    var accept = false;
    if (delta > 0) {
      accept = true;
    } else if (delta === 0) {
      accept = false;
    } else {
      // Normalize delta relative to current score for temperature comparison
      var normalizedDelta = currentScore > 0 ? delta / currentScore : delta;
      accept = Math.random() < Math.exp(normalizedDelta / temp);
    }

    if (accept) {
      currentScore = newScore;
      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestBoard = _cloneBoard(board);
        moveLog.push({ move: move, score: bestScore, iter: iter });
      }
    } else {
      // Undo move
      _undoMove(board, pool, move);
    }

    if (opts.onProgress && iter % 5000 === 0) {
      opts.onProgress({ iter: iter, score: currentScore, best: bestScore, temp: temp });
    }
  }

  // Phase 3: Greedy finishing pass
  onPhase({ phase: 3, label: 'Greedy refinement', progress: 0 });
  // Exhaustive pairwise swap on the best board
  var greedyImproved = true;
  var greedyPasses = 0;
  while (greedyImproved && greedyPasses < 5) {
    greedyImproved = false;
    greedyPasses++;
    onPhase({ phase: 3, label: 'Greedy refinement', progress: greedyPasses / 5 });
    for (var i = 0; i < BOARD_SIZE; i++) {
      if (lockedSlots[i]) continue;
      for (var j = i + 1; j < BOARD_SIZE; j++) {
        if (lockedSlots[j]) continue;
        var prevScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);
        var tmp = bestBoard[i]; bestBoard[i] = bestBoard[j]; bestBoard[j] = tmp;
        var swapScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);
        if (swapScore > prevScore) {
          bestScore = swapScore;
          greedyImproved = true;
        } else {
          tmp = bestBoard[i]; bestBoard[i] = bestBoard[j]; bestBoard[j] = tmp;
        }
      }
    }
  }

  // Phase 4: Swap-back — restore original positions where score is unchanged
  _swapBackPass(bestBoard, boardCogs, lockedSlots, goal);
  bestScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);

  // Compute the diff between original and best boards
  var swaps = _computeSwapSequence(boardCogs, bestBoard);

  return {
    board: bestBoard,
    score: bestScore,
    initialScore: initialScore,
    improvement: bestScore - initialScore,
    improvementPct: initialScore > 0 ? ((bestScore - initialScore) / initialScore * 100) : 0,
    swaps: swaps,
    moveLog: moveLog,
  };
}

/**
 * Async version of optimize with three phases:
 *   1. Greedy initial construction — build a strong starting board
 *   2. SA with smart moves — explore from that starting point
 *   3. Enhanced greedy finish — board+pool pairwise swaps
 * Yields to the UI every `chunkSize` iterations for live progress.
 */
export function optimizeAsync(boardCogs, shelfCogs, playerCogs, goal, opts) {
  opts = opts || {};
  var iterations = opts.iterations || 80000;
  var tempStart = opts.tempStart || 1.0;
  var tempEnd = opts.tempEnd || 0.001;
  var chunkSize = opts.chunkSize || 10000;

  var board = new Array(BOARD_SIZE);
  for (var i = 0; i < BOARD_SIZE; i++) {
    board[i] = boardCogs[i] ? _cloneCog(boardCogs[i]) : null;
  }
  var pool = [];
  for (var i = 0; i < shelfCogs.length; i++) {
    pool.push(_cloneCog(shelfCogs[i]));
  }
  var lockedSlots = {};

  // Measure the ORIGINAL board score before any changes
  var originalScore = scoreBoard(computeBoardTotals(board), goal, board);

  // --- Phase 1: Greedy initial construction ---
  // Try greedy rebuild on a clone; only use if it's better than the original
  var greedyBoard = _cloneBoard(board);
  var greedyPool = pool.map(function(c) { return _cloneCog(c); });
  _greedyConstruct(greedyBoard, greedyPool, lockedSlots, goal);
  var greedyScore = scoreBoard(computeBoardTotals(greedyBoard), goal, greedyBoard);

  var pctDiff = originalScore > 0 ? ((greedyScore - originalScore) / originalScore * 100).toFixed(4) : 'N/A';
  console.log('[Optimizer] Phase 1 greedy: ' + greedyScore.toFixed(2) + ' vs original: ' + originalScore.toFixed(2) + ' (' + pctDiff + '%)');
  console.log('[Optimizer] Phase 1 used ' + (greedyScore > originalScore ? 'GREEDY' : 'ORIGINAL') + ' board as SA starting point');

  if (greedyScore > originalScore) {
    board = greedyBoard;
    pool = greedyPool;
  }

  // Lock Yin cog slots that form valid 2x2 Excogia blocks
  _lockYinBlocks(board, lockedSlots);

  var bestScore = scoreBoard(computeBoardTotals(board), goal, board);
  var currentScore = bestScore;
  var bestBoard = _cloneBoard(board);
  var bestPool = pool.map(function(c) { return _cloneCog(c); });
  var initialScore = originalScore;
  var moveLog = [];
  var logRatio = Math.log(tempEnd / tempStart);

  // Pre-compute goal-aware bias slots
  var _goalType = typeof goal === 'string' ? goal : _dominantGoal(goal);
  var biasSlots = {};
  if (_goalType === 'conexp') {
    for (var i = 0; i < BOARD_SIZE; i++) {
      if (board[i] && board[i].isPlayer) {
        var pp = slotToPos(i);
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var nr = pp.row + dr, nc = pp.col + dc;
            if (nr >= 0 && nr < BOARD_H && nc >= 0 && nc < BOARD_W) {
              biasSlots[posToSlot(nc, nr)] = true;
            }
          }
        }
      }
    }
  } else {
    var surrKey = _goalType === 'build' ? 'e' : 'g';
    var totals = computeBoardTotals(board);
    var surrField = _goalType === 'build' ? 'surroundBuild' : 'surroundFlaggy';
    for (var i = 0; i < BOARD_SIZE; i++) {
      if (board[i] && board[i].h && (board[i][surrKey] || 0) > 0) {
        biasSlots[i] = true;
      }
    }
    var surrVals = [];
    for (var i = 0; i < BOARD_SIZE; i++) {
      if (lockedSlots[i]) continue;
      surrVals.push({ idx: i, val: totals.perSlot[i][surrField] || 0 });
    }
    surrVals.sort(function(a, b) { return b.val - a.val; });
    var topN = Math.max(1, Math.floor(surrVals.length / 4));
    for (var k = 0; k < topN; k++) {
      if (surrVals[k].val > 0) biasSlots[surrVals[k].idx] = true;
    }
  }

  return new Promise(function(resolve) {
    var iter = 0;
    function runChunk() {
      var end = Math.min(iter + chunkSize, iterations);
      for (; iter < end; iter++) {
        var temp = tempStart * Math.exp(logRatio * iter / iterations);
        // --- Phase 2: Smart SA moves ---
        var move = _smartMove(board, pool, lockedSlots, goal, biasSlots);
        if (!move) continue;
        _applyMove(board, pool, move);
        var newScore = scoreBoard(computeBoardTotals(board), goal, board);
        var delta = newScore - currentScore;
        var accept = false;
        if (delta > 0) {
          accept = true;
        } else if (delta !== 0) {
          var nd = currentScore > 0 ? delta / currentScore : delta;
          accept = Math.random() < Math.exp(nd / temp);
        }
        if (accept) {
          currentScore = newScore;
          if (currentScore > bestScore) {
            bestScore = currentScore;
            bestBoard = _cloneBoard(board);
            bestPool = pool.map(function(c) { return _cloneCog(c); });
            moveLog.push({ move: move, score: bestScore, iter: iter });
          }
        } else {
          _undoMove(board, pool, move);
        }
      }
      if (opts.onProgress) {
        opts.onProgress({ iter: iter, score: currentScore, best: bestScore });
      }
      if (iter < iterations) {
        setTimeout(runChunk, 0);
      } else {
        // --- Phase 3: Enhanced greedy finish (board + pool swaps) ---
        _greedyFinish(bestBoard, bestPool, lockedSlots, goal);

        // Phase 4: Swap-back — restore original positions where score is unchanged
        _swapBackPass(bestBoard, boardCogs, lockedSlots, goal);
        bestScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);

        var swaps = _computeSwapSequence(boardCogs, bestBoard);
        resolve({
          board: bestBoard,
          score: bestScore,
          initialScore: initialScore,
          improvement: bestScore - initialScore,
          improvementPct: initialScore > 0 ? ((bestScore - initialScore) / initialScore * 100) : 0,
          swaps: swaps,
          moveLog: moveLog,
        });
      }
    }
    setTimeout(runChunk, 0);
  });
}

/**
 * Phase 1: Greedy initial construction.
 * 1. Collect all cogs, clear the board.
 * 2. For conexp: try every player position (96), build the best board around each.
 *    For build/flaggy: single pass — player first then directionals then filler.
 * 3. Exhaustive pairwise + pool refinement until convergence.
 */
function _greedyConstruct(board, pool, lockedSlots, goal, onPhase) {
  onPhase = onPhase || function() {};
  // Collect all movable cogs into a unified set
  var allCogs = [];
  for (var i = 0; i < pool.length; i++) allCogs.push(pool[i]);
  var boardBefore = board.filter(Boolean).length;
  for (var i = 0; i < BOARD_SIZE; i++) {
    if (!lockedSlots[i] && board[i]) {
      allCogs.push(board[i]);
      board[i] = null;
    }
  }
  pool.length = 0;
  var boardAfterClear = board.filter(Boolean).length;
  console.log('[Greedy] Collected ' + allCogs.length + ' cogs. Board: ' + boardBefore + ' → ' + boardAfterClear + ' (should be 0)');
  if (allCogs.length === 0) return;

  // Goal-relevant keys — for weighted goals, pick the dominant goal's keys
  var _goalStr = typeof goal === 'string' ? goal : _dominantGoal(goal);
  var surrKey = _goalStr === 'build' ? 'e' : _goalStr === 'flaggy' ? 'g' : 'f';
  var baseKey = _goalStr === 'build' ? 'a' : _goalStr === 'flaggy' ? 'c' : 'd';
  var surrField = _goalStr === 'build' ? 'surroundBuild' : _goalStr === 'flaggy' ? 'surroundFlaggy' : 'surroundConExp';

  // For weighted goals with any conexp weight, capture ALL directional cogs (any surround key)
  var isWeighted = typeof goal === 'object';

  // Categorize cogs — Yin/excogia cogs (l=1) are separated for 2x2 block placement
  var players = [], directional = [], nonDir = [], yinCogs = [];
  for (var i = 0; i < allCogs.length; i++) {
    var c = allCogs[i];
    if (c.isPlayer) {
      players.push(c);
    } else if (c.l) {
      yinCogs.push(c);
    } else if (c.h && ((c[surrKey] || 0) > 0 || (isWeighted && ((c.e || 0) > 0 || (c.f || 0) > 0 || (c.g || 0) > 0)))) {
      directional.push(c);
    } else {
      nonDir.push(c);
    }
  }
  // Group yin cogs into blocks of 4 with correct piece order (0=TL,1=TR,2=BL,3=BR)
  // Sort by piece number, then group sequentially
  yinCogs.sort(function(a, b) { return _yinPiece(a) - _yinPiece(b); });
  // Bucket by piece number
  var yinByPiece = [[], [], [], []];
  for (var yi = 0; yi < yinCogs.length; yi++) {
    var p = _yinPiece(yinCogs[yi]);
    if (p >= 0 && p <= 3) yinByPiece[p].push(yinCogs[yi]);
  }
  var yinBlocks = [];
  var blockCount = Math.min(yinByPiece[0].length, yinByPiece[1].length, yinByPiece[2].length, yinByPiece[3].length);
  for (var bi = 0; bi < blockCount; bi++) {
    yinBlocks.push([yinByPiece[0][bi], yinByPiece[1][bi], yinByPiece[2][bi], yinByPiece[3][bi]]);
  }
  // Leftover yin cogs (incomplete blocks) go to nonDir for base-stat placement
  for (var p = 0; p < 4; p++) {
    for (var yi = blockCount; yi < yinByPiece[p].length; yi++) {
      nonDir.push(yinByPiece[p][yi]);
    }
  }
  directional.sort(function(a, b) { return (b[surrKey] || 0) - (a[surrKey] || 0); });
  nonDir.sort(function(a, b) { return (b[baseKey] || 0) - (a[baseKey] || 0); });
  players.sort(function(a, b) { return (b.b || 0) - (a.b || 0); });
  console.log('[Greedy] Categories: ' + players.length + ' players, ' + directional.length + ' directional (' + surrKey + '), ' + yinBlocks.length + ' yin blocks (' + yinCogs.length + ' cogs), ' + nonDir.length + ' non-dir')

  // For conexp or weighted goals with conexp, try all 96 player positions
  var needsPlayerSweep = players.length > 0 && (_goalStr === 'conexp' || (isWeighted && goal.conexp > 0));
  if (needsPlayerSweep) {
    var bestBoard = null, bestPool = null, bestSc = -Infinity;
    var bestPSlot = -1;
    var mainPlayer = players[0]; // highest-b player
    var otherPlayers = players.slice(1);
    console.log('[Greedy] Main player: ' + mainPlayer.name + ' b=' + mainPlayer.b + ' _slot=' + mainPlayer._slot);

    for (var pSlot = 0; pSlot < BOARD_SIZE; pSlot++) {
      if (lockedSlots[pSlot]) continue;
      if (pSlot % 12 === 0) onPhase({ phase: 1, label: 'Greedy construction', progress: pSlot / BOARD_SIZE });
      // Build a candidate board with player fixed at pSlot
      var cb = new Array(BOARD_SIZE);
      for (var i = 0; i < BOARD_SIZE; i++) cb[i] = null;
      var cp = [];
      var candLocked = {};  // fresh locked set per candidate
      cb[pSlot] = mainPlayer;

      // Place other players greedily
      for (var op = 0; op < otherPlayers.length; op++) {
        var pcog = otherPlayers[op];
        var bs2 = -1, bsc2 = -Infinity;
        for (var i = 0; i < BOARD_SIZE; i++) {
          if (candLocked[i] || cb[i]) continue;
          cb[i] = pcog;
          var sc = scoreBoard(computeBoardTotals(cb), goal, cb);
          cb[i] = null;
          if (sc > bsc2) { bsc2 = sc; bs2 = i; }
        }
        if (bs2 >= 0) cb[bs2] = pcog;
        else cp.push(pcog);
      }

      // Place Yin blocks as 2x2 (surround bonus only works in valid 2x2)
      _placeYinBlocks(cb, cp, yinBlocks, candLocked, goal);
      // Place directionals
      _placeGreedyList(cb, cp, directional, candLocked, goal);
      // Place non-directionals by rearrangement inequality
      _placeByRearrangement(cb, cp, nonDir, candLocked, surrField);
      // Quick refinement (3 passes to keep it fast, full refinement on the winner)
      _refine(cb, cp, candLocked, goal, 3);

      var sc = scoreBoard(computeBoardTotals(cb), goal, cb);
      if (sc > bestSc) { bestSc = sc; bestBoard = cb; bestPool = cp; bestPSlot = pSlot; }
    }

    console.log('[Greedy] Best player slot: ' + bestPSlot + ' (' + (bestPSlot % BOARD_W) + ',' + Math.floor(bestPSlot / BOARD_W) + ') score=' + bestSc.toFixed(2));

    // Copy winner into board/pool
    for (var i = 0; i < BOARD_SIZE; i++) board[i] = bestBoard[i];
    pool.length = 0;
    for (var i = 0; i < bestPool.length; i++) pool.push(bestPool[i]);

  } else {
    // build/flaggy: single pass
    // Place players
    _placeGreedyList(board, pool, players, lockedSlots, goal);
    console.log('[Greedy] After players: board=' + board.filter(Boolean).length + ', pool=' + pool.length);
    // Place Yin blocks as 2x2
    _placeYinBlocks(board, pool, yinBlocks, lockedSlots, goal);
    console.log('[Greedy] After yin blocks: board=' + board.filter(Boolean).length + ', pool=' + pool.length);
    // Place directionals
    _placeGreedyList(board, pool, directional, lockedSlots, goal);
    console.log('[Greedy] After directionals: board=' + board.filter(Boolean).length + ', pool=' + pool.length);
    // Place non-directional by rearrangement inequality
    _placeByRearrangement(board, pool, nonDir, lockedSlots, surrField);
    console.log('[Greedy] After rearrangement: board=' + board.filter(Boolean).length + ', pool=' + pool.length);
  }

  // Full refinement on the final board
  // Lock Yin 2x2 blocks so refinement can't scatter them
  _lockYinBlocks(board, lockedSlots);
  var preRefineScore = scoreBoard(computeBoardTotals(board), goal, board);
  _refine(board, pool, lockedSlots, goal, 15);
  var postRefineScore = scoreBoard(computeBoardTotals(board), goal, board);
  console.log('[Greedy] Refine: ' + preRefineScore.toFixed(2) + ' → ' + postRefineScore.toFixed(2) + ' (board=' + board.filter(Boolean).length + ', pool=' + pool.length + ')');

  // Log final layout summary
  var finalNames = [];
  for (var i = 0; i < BOARD_SIZE; i++) {
    if (board[i]) finalNames.push(i + ':' + board[i].name);
  }
  console.log('[Greedy] Final board (' + finalNames.length + ' cogs): ' + finalNames.slice(0, 20).join(', ') + (finalNames.length > 20 ? '...' : ''));
}

/** Place a list of cogs one at a time, each at the best empty slot. Overflow goes to pool. */
function _placeGreedyList(board, pool, cogs, lockedSlots, goal) {
  for (var d = 0; d < cogs.length; d++) {
    var dcog = cogs[d];
    var bestSlot = -1, bestSc = -Infinity;
    for (var i = 0; i < BOARD_SIZE; i++) {
      if (lockedSlots[i] || board[i]) continue;
      board[i] = dcog;
      var sc = scoreBoard(computeBoardTotals(board), goal, board);
      board[i] = null;
      if (sc > bestSc) { bestSc = sc; bestSlot = i; }
    }
    if (bestSlot >= 0) board[bestSlot] = dcog;
    else pool.push(dcog);
  }
}

/** Place non-directional cogs by rearrangement inequality: highest base → highest surround slot. */
function _placeByRearrangement(board, pool, cogs, lockedSlots, surrField) {
  var totals = computeBoardTotals(board);
  var emptySlots = [];
  for (var i = 0; i < BOARD_SIZE; i++) {
    if (!lockedSlots[i] && !board[i]) {
      emptySlots.push({ idx: i, surr: totals.perSlot[i][surrField] || 0 });
    }
  }
  emptySlots.sort(function(a, b) { return b.surr - a.surr; });
  var placed = Math.min(emptySlots.length, cogs.length);
  for (var i = 0; i < placed; i++) {
    board[emptySlots[i].idx] = cogs[i];
  }
  for (var i = placed; i < cogs.length; i++) pool.push(cogs[i]);
}

/**
 * Place Yin cog blocks as 2x2 groups. Each block of 4 Yin cogs is tried at every
 * valid 2x2 position; the best position (by full board score) is chosen, evicting
 * any existing non-player, non-Yin cogs to the pool.
 */
function _placeYinBlocks(board, pool, yinBlocks, lockedSlots, goal) {
  // Find player rows/cols to avoid — keep those rows/cols open for row/column directionals
  var playerRows = {}, playerCols = {};
  for (var i = 0; i < BOARD_SIZE; i++) {
    if (board[i] && board[i].isPlayer) {
      var pp = slotToPos(i);
      playerRows[pp.row] = true;
      playerCols[pp.col] = true;
    }
  }

  for (var bi = 0; bi < yinBlocks.length; bi++) {
    var block = yinBlocks[bi];
    var bestClear = -1, bestDist = -1, bestScore = -Infinity;
    var bestSlots = null, bestSaved = null;

    for (var r = 0; r < BOARD_H - 1; r++) {
      for (var c = 0; c < BOARD_W - 1; c++) {
        var s = [posToSlot(c, r), posToSlot(c + 1, r), posToSlot(c, r + 1), posToSlot(c + 1, r + 1)];
        var ok = true;
        for (var k = 0; k < 4; k++) {
          if (lockedSlots[s[k]]) { ok = false; break; }
          if (board[s[k]] && (board[s[k]].isPlayer || board[s[k]].l)) { ok = false; break; }
        }
        if (!ok) continue;

        // Count how many block rows/cols avoid sharing with player rows/cols
        // 2x2 block uses rows [r, r+1] and cols [c, c+1]
        var clear = 0;
        if (!playerRows[r]) clear++;
        if (!playerRows[r + 1]) clear++;
        if (!playerCols[c]) clear++;
        if (!playerCols[c + 1]) clear++;

        // Min Chebyshev distance as secondary metric
        var minDist = Infinity;
        for (var i = 0; i < BOARD_SIZE; i++) {
          if (board[i] && board[i].isPlayer) {
            var pp = slotToPos(i);
            for (var k = 0; k < 4; k++) {
              var kp = slotToPos(s[k]);
              var d = Math.max(Math.abs(kp.row - pp.row), Math.abs(kp.col - pp.col));
              if (d < minDist) minDist = d;
            }
          }
        }
        if (!isFinite(minDist)) minDist = 99;

        var saved = [board[s[0]], board[s[1]], board[s[2]], board[s[3]]];
        board[s[0]] = block[0]; board[s[1]] = block[1]; board[s[2]] = block[2]; board[s[3]] = block[3];
        var sc = scoreBoard(computeBoardTotals(board), goal, board);
        board[s[0]] = saved[0]; board[s[1]] = saved[1]; board[s[2]] = saved[2]; board[s[3]] = saved[3];

        // Primary: maximize clear rows/cols, secondary: maximize distance, tertiary: maximize score
        if (clear > bestClear ||
            (clear === bestClear && minDist > bestDist) ||
            (clear === bestClear && minDist === bestDist && sc > bestScore)) {
          bestClear = clear; bestDist = minDist; bestScore = sc;
          bestSlots = s.slice(); bestSaved = saved.slice();
        }
      }
    }

    if (bestSlots) {
      for (var k = 0; k < 4; k++) {
        if (bestSaved[k]) pool.push(bestSaved[k]);
        board[bestSlots[k]] = block[k];
        lockedSlots[bestSlots[k]] = true;
      }
    } else {
      for (var k = 0; k < 4; k++) pool.push(block[k]);
    }
  }
}

/** Pairwise board swaps + pool↔board swaps for up to maxPasses. */
function _refine(board, pool, lockedSlots, goal, maxPasses) {
  var improved = true;
  var passes = 0;
  while (improved && passes < maxPasses) {
    improved = false;
    passes++;
    for (var i = 0; i < BOARD_SIZE; i++) {
      if (lockedSlots[i]) continue;
      var prevSc = scoreBoard(computeBoardTotals(board), goal, board);
      for (var j = i + 1; j < BOARD_SIZE; j++) {
        if (lockedSlots[j]) continue;
        if (!board[i] && !board[j]) continue;
        var tmp = board[i]; board[i] = board[j]; board[j] = tmp;
        var sc = scoreBoard(computeBoardTotals(board), goal, board);
        if (sc > prevSc) {
          prevSc = sc;
          improved = true;
        } else {
          tmp = board[i]; board[i] = board[j]; board[j] = tmp;
        }
      }
    }
    if (pool.length > 0) {
      for (var i = 0; i < BOARD_SIZE; i++) {
        if (lockedSlots[i]) continue;
        var baseSc = scoreBoard(computeBoardTotals(board), goal, board);
        var bestDelta = 0, bestPi = -1;
        for (var pi = 0; pi < pool.length; pi++) {
          var tmp = board[i]; board[i] = pool[pi]; pool[pi] = tmp;
          var sc = scoreBoard(computeBoardTotals(board), goal, board);
          var delta = sc - baseSc;
          if (delta > bestDelta) { bestDelta = delta; bestPi = pi; }
          tmp = board[i]; board[i] = pool[pi]; pool[pi] = tmp;
        }
        if (bestPi >= 0) {
          var tmp = board[i]; board[i] = pool[bestPi]; pool[bestPi] = tmp;
          improved = true;
        }
      }
    }
  }
}

/**
 * Phase 2: Smart SA move generation.
 * Biased toward productive moves:
 *   - 30%: swap a weak board cog (bottom quartile by contribution) with a random pool cog
 *   - 25%: swap two board cogs, biased toward player-adjacent slots
 *   - 20%: swap a board cog with a pool cog (random)
 *   - 25%: fully random board swap (exploration)
 */
function _smartMove(board, pool, locked, goal, biasSlots) {
  var r = Math.random();

  if (r < 0.30 && pool.length > 0) {
    // Swap weakest board cog with pool cog
    var slot = _weakSlot(board, locked, goal);
    if (slot < 0) slot = _randSlot(locked);
    if (slot < 0) return null;
    var pi = Math.floor(Math.random() * pool.length);
    return { type: 'poolSwap', slot: slot, poolIdx: pi };
  }

  if (r < 0.55) {
    // Board swap biased toward goal-relevant slots
    var a, b;
    if (Math.random() < 0.5) {
      a = _randBiasSlot(locked, biasSlots);
      if (a < 0) a = _randSlot(locked);
    } else {
      a = _randSlot(locked);
    }
    if (a < 0) return null;
    b = _randSlot(locked);
    if (b < 0) return null;
    var tries = 0;
    while ((b === a || (!board[a] && !board[b])) && tries < 20) {
      b = _randSlot(locked);
      if (b < 0) return null;
      tries++;
    }
    if (a === b) return null;
    return { type: 'boardSwap', a: a, b: b };
  }

  if (r < 0.75 && pool.length > 0) {
    // Random pool swap
    var slot = _randSlot(locked);
    if (slot < 0) return null;
    var pi = Math.floor(Math.random() * pool.length);
    return { type: 'poolSwap', slot: slot, poolIdx: pi };
  }

  // Fully random board swap
  var a = _randSlot(locked);
  if (a < 0) return null;
  var b = _randSlot(locked);
  if (b < 0) return null;
  if (a === b) return null;
  return { type: 'boardSwap', a: a, b: b };
}

/** Pick a random unlocked bias slot (player-adjacent for conexp, surround-relevant for build/flaggy). */
function _randBiasSlot(locked, biasSlots) {
  var slots = [];
  for (var s in biasSlots) {
    var si = parseInt(s);
    if (!locked[si]) slots.push(si);
  }
  if (slots.length === 0) return -1;
  return slots[Math.floor(Math.random() * slots.length)];
}

/** Pick a weak board slot — one with low contribution for the goal. Bottom quartile. */
function _weakSlot(board, locked, goal) {
  var g = typeof goal === 'string' ? goal : _dominantGoal(goal);
  var slots = [];
  for (var i = 0; i < BOARD_SIZE; i++) {
    if (locked[i] || !board[i]) continue;
    var c = board[i];
    var val;
    if (g === 'build') val = (c.a || 0) + (c.e || 0);  // base build + surround build
    else if (g === 'flaggy') val = (c.c || 0) + (c.g || 0);  // base flaggy + surround flaggy
    else val = (c.d || 0) + (c.f || 0) + (c.b || 0);  // conexp: d% + surround + base exp
    slots.push({ idx: i, val: val });
  }
  if (slots.length === 0) return -1;
  slots.sort(function(a, b) { return a.val - b.val; });
  // Pick from bottom quartile
  var cutoff = Math.max(1, Math.floor(slots.length / 4));
  return slots[Math.floor(Math.random() * cutoff)].idx;
}

/** For a weighted goal object, return the dominant goal string. */
function _dominantGoal(goal) {
  if (typeof goal === 'string') return goal;
  var best = 'build', bestW = goal.build || 0;
  if ((goal.conexp || 0) > bestW) { best = 'conexp'; bestW = goal.conexp; }
  if ((goal.flaggy || 0) > bestW) { best = 'flaggy'; }
  return best;
}

/**
 * Phase 3: Enhanced greedy finish.
 * Board pairwise swaps + board↔pool swaps. Up to 5 passes.
 */
function _greedyFinish(bestBoard, pool, lockedSlots, goal) {
  var improved = true;
  var passes = 0;
  while (improved && passes < 5) {
    improved = false;
    passes++;
    // Board pairwise swaps
    for (var i = 0; i < BOARD_SIZE; i++) {
      if (lockedSlots[i]) continue;
      var prevScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);
      for (var j = i + 1; j < BOARD_SIZE; j++) {
        if (lockedSlots[j]) continue;
        var tmp = bestBoard[i]; bestBoard[i] = bestBoard[j]; bestBoard[j] = tmp;
        var swapScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);
        if (swapScore > prevScore) {
          prevScore = swapScore;
          improved = true;
        } else {
          tmp = bestBoard[i]; bestBoard[i] = bestBoard[j]; bestBoard[j] = tmp;
        }
      }
    }
    // Board↔pool swaps
    if (pool.length > 0) {
      for (var i = 0; i < BOARD_SIZE; i++) {
        if (lockedSlots[i]) continue;
        var prevScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);
        for (var pi = 0; pi < pool.length; pi++) {
          var tmp = bestBoard[i]; bestBoard[i] = pool[pi]; pool[pi] = tmp;
          var swapScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);
          if (swapScore > prevScore) {
            prevScore = swapScore;
            improved = true;
          } else {
            tmp = bestBoard[i]; bestBoard[i] = pool[pi]; pool[pi] = tmp;
          }
        }
      }
    }
  }
}

/**
 * Generate a random move.
 * Move types: swap two board cogs, swap board cog with pool cog, move pool cog to empty slot.
 */
function _randomMove(board, pool, locked) {
  var r = Math.random();

  if (r < 0.6) {
    // Swap two board cogs (neither locked)
    var a = _randSlot(locked);
    if (a < 0) return null;
    var b = _randSlot(locked);
    if (b < 0) return null;
    var tries = 0;
    while ((b === a || (!board[a] && !board[b])) && tries < 20) {
      b = _randSlot(locked);
      if (b < 0) return null;
      tries++;
    }
    if (a === b) return null;
    return { type: 'boardSwap', a: a, b: b };
  }

  if (r < 0.85 && pool.length > 0) {
    // Swap board cog with pool cog
    var slot = _randSlot(locked);
    if (slot < 0) return null;
    var pi = Math.floor(Math.random() * pool.length);
    return { type: 'poolSwap', slot: slot, poolIdx: pi };
  }

  if (pool.length > 0) {
    // Place a pool cog on the board
    var slot = _randSlot(locked);
    if (slot < 0) return null;
    var pi = Math.floor(Math.random() * pool.length);
    return { type: 'poolSwap', slot: slot, poolIdx: pi };
  }

  // Fallback: swap two board cogs
  var a = _randSlot(locked);
  if (a < 0) return null;
  var b = _randSlot(locked);
  if (b < 0) return null;
  if (a === b) return null;
  return { type: 'boardSwap', a: a, b: b };
}

function _randSlot(locked) {
  var slot;
  var tries = 0;
  do {
    slot = Math.floor(Math.random() * BOARD_SIZE);
    tries++;
  } while (locked[slot] && tries < 50);
  if (locked[slot]) return -1;
  return slot;
}

function _applyMove(board, pool, move) {
  if (move.type === 'boardSwap') {
    var tmp = board[move.a];
    board[move.a] = board[move.b];
    board[move.b] = tmp;
  } else if (move.type === 'poolSwap') {
    var tmp = board[move.slot];
    board[move.slot] = pool[move.poolIdx];
    pool[move.poolIdx] = tmp;
  }
}

function _undoMove(board, pool, move) {
  // Same as apply (swaps are their own inverse)
  _applyMove(board, pool, move);
}

function _cloneCog(cog) {
  if (!cog) return null;
  return {
    name: cog.name, a: cog.a, b: cog.b, c: cog.c, d: cog.d,
    e: cog.e, f: cog.f, g: cog.g, j: cog.j,
    h: cog.h, i: cog.i, l: cog.l,
    _slot: cog._slot, isPlayer: cog.isPlayer || false,
  };
}

function _cloneBoard(board) {
  var out = new Array(board.length);
  for (var i = 0; i < board.length; i++) {
    out[i] = board[i] ? _cloneCog(board[i]) : null;
  }
  return out;
}

/** Scan the board for valid Yin 2x2 blocks and lock those slots. */
function _lockYinBlocks(board, lockedSlots) {
  for (var row = 0; row < BOARD_H - 1; row++) {
    for (var col = 0; col < BOARD_W - 1; col++) {
      var tl = posToSlot(col, row);
      var tr = posToSlot(col + 1, row);
      var bl = posToSlot(col, row + 1);
      var br = posToSlot(col + 1, row + 1);
      if (board[tl] && board[tr] && board[bl] && board[br] &&
          _yinPiece(board[tl]) === 0 && _yinPiece(board[tr]) === 1 &&
          _yinPiece(board[bl]) === 2 && _yinPiece(board[br]) === 3) {
        lockedSlots[tl] = true;
        lockedSlots[tr] = true;
        lockedSlots[bl] = true;
        lockedSlots[br] = true;
      }
    }
  }
}

/**
 * Stat fingerprint: two cogs with the same fingerprint are functionally identical
 * from the user's perspective — no swap needed.
 */
function _cogFingerprint(cog) {
  if (!cog) return 'Blank';
  return cog.name + '|' + (cog.a || 0) + '|' + (cog.c || 0) + '|' + (cog.d || 0)
    + '|' + (cog.e || 0) + '|' + (cog.f || 0) + '|' + (cog.g || 0) + '|' + (cog.h || '')
    + '|' + (cog.j || 0) + '|' + (cog.b || 0) + '|' + (cog.isPlayer ? 1 : 0);
}

/**
 * Swap-back pass: for each slot that differs from the original board,
 * try restoring the original cog. Keep it if the score is unchanged.
 * Uses stat fingerprints so any same-stat cog counts as a match.
 * This minimizes the number of user-visible swaps without losing any score.
 */
function _swapBackPass(bestBoard, originalBoard, lockedSlots, goal) {
  var bestScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);
  var restored = 0;

  // Build set of player-adjacent slots — cogs here with directionals should not be displaced
  var playerSlots = [];
  for (var i = 0; i < BOARD_SIZE; i++) {
    if (bestBoard[i] && bestBoard[i].isPlayer) playerSlots.push(i);
  }

  // Check if a directional cog at slot j actively reaches any player
  function _directionalReachesPlayer(cog, j) {
    if (!cog || !cog.h) return false;
    var jp = slotToPos(j);
    for (var pi = 0; pi < playerSlots.length; pi++) {
      var pp = slotToPos(playerSlots[pi]);
      if (cog.h === 'around' || cog.h === 'adjacent') {
        if (Math.abs(jp.row - pp.row) <= 1 && Math.abs(jp.col - pp.col) <= 1) return true;
      } else if (cog.h === 'row') {
        if (jp.row === pp.row) return true;
      } else if (cog.h === 'column') {
        if (jp.col === pp.col) return true;
      } else if (cog.h === 'everything') {
        return true;
      }
    }
    return false;
  }

  // Multiple passes: forward then reverse, to catch displacement cascades
  var passes = 0;
  var changed = true;
  while (changed && passes < 4) {
    changed = false;
    passes++;
    var start = (passes % 2 === 1) ? 0 : BOARD_SIZE - 1;
    var end = (passes % 2 === 1) ? BOARD_SIZE : -1;
    var step = (passes % 2 === 1) ? 1 : -1;
    for (var i = start; i !== end; i += step) {
      if (lockedSlots[i]) continue;
      var origFP = _cogFingerprint(originalBoard[i]);
      var curFP = _cogFingerprint(bestBoard[i]);
      if (origFP === curFP) continue;
      // Find any cog on the best board with the same fingerprint as the original
      // Prefer non-directional sources; only use directional if no alternative
      var srcIdx = -1;
      var dirFallback = -1;
      for (var j = 0; j < BOARD_SIZE; j++) {
        if (j === i) continue;
        if (lockedSlots[j]) continue;
        if (_cogFingerprint(bestBoard[j]) !== origFP) continue;
        // Don't displace a directional cog from player-affecting slot to non-affecting slot
        if (_directionalReachesPlayer(bestBoard[j], j) && !_directionalReachesPlayer(bestBoard[j], i)) continue;
        if (bestBoard[j].h && _directionalReachesPlayer(bestBoard[j], j)) {
          if (dirFallback < 0) dirFallback = j;  // remember as fallback
          continue;                                // keep looking for non-dir
        }
        srcIdx = j;
        break;
      }
      if (srcIdx < 0) srcIdx = dirFallback;
      if (srcIdx < 0) continue;
      // Try swapping them
      var tmp = bestBoard[i]; bestBoard[i] = bestBoard[srcIdx]; bestBoard[srcIdx] = tmp;
      var newScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);
      if (newScore < bestScore) {
        tmp = bestBoard[i]; bestBoard[i] = bestBoard[srcIdx]; bestBoard[srcIdx] = tmp;
      } else {
        bestScore = newScore;
        restored++;
        changed = true;
      }
    }
  }
  if (restored > 0) console.log('[SwapBack] Restored ' + restored + ' cogs to original positions');

  // Yin block swap-back: Yin effects are global, so their 2x2 position doesn't matter.
  // Try swapping entire Yin blocks back to their original positions.
  // Find Yin blocks on the original board
  var origYinBlocks = [];
  for (var row = 0; row < BOARD_H - 1; row++) {
    for (var col = 0; col < BOARD_W - 1; col++) {
      var tl = posToSlot(col, row);
      var tr = posToSlot(col + 1, row);
      var bl = posToSlot(col, row + 1);
      var br = posToSlot(col + 1, row + 1);
      if (originalBoard[tl] && originalBoard[tr] && originalBoard[bl] && originalBoard[br] &&
          _yinPiece(originalBoard[tl]) === 0 && _yinPiece(originalBoard[tr]) === 1 &&
          _yinPiece(originalBoard[bl]) === 2 && _yinPiece(originalBoard[br]) === 3) {
        origYinBlocks.push([tl, tr, bl, br]);
      }
    }
  }
  // Find Yin blocks on the current best board
  var curYinBlocks = [];
  for (var row = 0; row < BOARD_H - 1; row++) {
    for (var col = 0; col < BOARD_W - 1; col++) {
      var tl = posToSlot(col, row);
      var tr = posToSlot(col + 1, row);
      var bl = posToSlot(col, row + 1);
      var br = posToSlot(col + 1, row + 1);
      if (bestBoard[tl] && bestBoard[tr] && bestBoard[bl] && bestBoard[br] &&
          _yinPiece(bestBoard[tl]) === 0 && _yinPiece(bestBoard[tr]) === 1 &&
          _yinPiece(bestBoard[bl]) === 2 && _yinPiece(bestBoard[br]) === 3) {
        curYinBlocks.push([tl, tr, bl, br]);
      }
    }
  }
  // Try to move each current Yin block back to its original position
  var yinRestored = 0;
  var usedOrig = {};
  for (var ci = 0; ci < curYinBlocks.length; ci++) {
    var cur = curYinBlocks[ci];
    // Check if it's already in an original position
    var alreadyHome = false;
    for (var oi = 0; oi < origYinBlocks.length; oi++) {
      if (cur[0] === origYinBlocks[oi][0]) { alreadyHome = true; break; }
    }
    if (alreadyHome) continue;
    // Find an original position that isn't already taken
    for (var oi = 0; oi < origYinBlocks.length; oi++) {
      if (usedOrig[oi]) continue;
      var orig = origYinBlocks[oi];
      // Check if original slots are currently occupied by non-Yin cogs we can displace
      var blocked = false;
      for (var k = 0; k < 4; k++) {
        var oc = bestBoard[orig[k]];
        if (oc && oc.l) {
          // Another Yin block is here — can't swap into it
          blocked = true; break;
        }
      }
      if (blocked) continue;
      // Try the swap: save the 8 cells, put Yin in orig slots, displaced cogs in cur slots
      var savedCur = [bestBoard[cur[0]], bestBoard[cur[1]], bestBoard[cur[2]], bestBoard[cur[3]]];
      var savedOrig = [bestBoard[orig[0]], bestBoard[orig[1]], bestBoard[orig[2]], bestBoard[orig[3]]];
      for (var k = 0; k < 4; k++) {
        bestBoard[orig[k]] = savedCur[k]; // Yin pieces go to original positions
        bestBoard[cur[k]] = savedOrig[k]; // displaced cogs go to where Yin was
      }
      var newScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);
      if (newScore < bestScore) {
        // Undo
        for (var k = 0; k < 4; k++) {
          bestBoard[cur[k]] = savedCur[k];
          bestBoard[orig[k]] = savedOrig[k];
        }
      } else {
        bestScore = newScore;
        usedOrig[oi] = true;
        yinRestored++;
        // Update lockedSlots: unlock old positions, lock new (original) positions
        for (var k = 0; k < 4; k++) {
          delete lockedSlots[cur[k]];
          lockedSlots[orig[k]] = true;
        }
        break;
      }
    }
  }
  if (yinRestored > 0) console.log('[SwapBack] Restored ' + yinRestored + ' Yin blocks to original positions');

  // Cosmetic pass: directional cogs in positions where they can't reach any player
  // look odd. Swap them with non-directional cogs elsewhere if score doesn't drop.
  var cosmeticSwaps = 0;
  for (var i = 0; i < BOARD_SIZE; i++) {
    var cog = bestBoard[i];
    if (!cog || !cog.h || cog.h === 'everything') continue;
    if (cog.l || cog.isPlayer) continue;
    if (_directionalReachesPlayer(cog, i)) continue;  // useful here, leave it
    // Wasted directional at slot i — find a non-directional to swap with
    for (var j = 0; j < BOARD_SIZE; j++) {
      if (j === i || lockedSlots[j]) continue;
      var other = bestBoard[j];
      if (!other || other.h || other.l || other.isPlayer) continue;
      if (_cogFingerprint(cog) === _cogFingerprint(other)) continue;  // same cog, pointless
      bestBoard[i] = other; bestBoard[j] = cog;
      var newScore = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);
      if (newScore < bestScore) {
        bestBoard[i] = cog; bestBoard[j] = other;
      } else {
        bestScore = newScore;
        cosmeticSwaps++;
        break;
      }
    }
  }
  if (cosmeticSwaps > 0) console.log('[SwapBack] Cosmetic: relocated ' + cosmeticSwaps + ' wasted directionals');

  // Post-cosmetic swap-back: the cosmetic pass may have created new diffs. Clean up.
  if (cosmeticSwaps > 0) {
    var postRestored = 0;
    for (var pass2 = 0; pass2 < 2; pass2++) {
      var start2 = (pass2 === 0) ? 0 : BOARD_SIZE - 1;
      var end2 = (pass2 === 0) ? BOARD_SIZE : -1;
      var step2 = (pass2 === 0) ? 1 : -1;
      for (var i = start2; i !== end2; i += step2) {
        if (lockedSlots[i]) continue;
        var origFP2 = _cogFingerprint(originalBoard[i]);
        if (origFP2 === _cogFingerprint(bestBoard[i])) continue;
        var srcIdx2 = -1;
        for (var j = 0; j < BOARD_SIZE; j++) {
          if (j === i || lockedSlots[j]) continue;
          if (_cogFingerprint(bestBoard[j]) !== origFP2) continue;
          if (bestBoard[j].h && _directionalReachesPlayer(bestBoard[j], j)) continue;
          srcIdx2 = j;
          break;
        }
        if (srcIdx2 < 0) continue;
        var tmp2 = bestBoard[i]; bestBoard[i] = bestBoard[srcIdx2]; bestBoard[srcIdx2] = tmp2;
        var ns2 = scoreBoard(computeBoardTotals(bestBoard), goal, bestBoard);
        if (ns2 < bestScore) {
          tmp2 = bestBoard[i]; bestBoard[i] = bestBoard[srcIdx2]; bestBoard[srcIdx2] = tmp2;
        } else {
          bestScore = ns2;
          postRestored++;
        }
      }
    }
    if (postRestored > 0) console.log('[SwapBack] Post-cosmetic cleanup: restored ' + postRestored + ' more cogs');
  }
}

/**
 * Compute a swap sequence to transform `from` board into `to` board.
 * Each step tells the user where to place a cog and where it came from.
 * Tracks the evolving board state so source locations are always correct.
 */
function _computeSwapSequence(from, to) {
  var steps = [];

  // Use stat fingerprint: two cogs with the same stats don't need a swap
  var current = new Array(BOARD_SIZE);
  for (var i = 0; i < BOARD_SIZE; i++) {
    current[i] = _cogFingerprint(from[i]);
  }

  var target = new Array(BOARD_SIZE);
  for (var i = 0; i < BOARD_SIZE; i++) {
    target[i] = _cogFingerprint(to[i]);
  }

  // Find all slots that differ
  var changed = [];
  for (var i = 0; i < BOARD_SIZE; i++) {
    if (current[i] !== target[i]) {
      changed.push(i);
    }
  }

  if (changed.length === 0) return steps;

  // Process each changed slot, updating current state as we go
  for (var ci = 0; ci < changed.length; ci++) {
    var slot = changed[ci];
    var toKey = target[slot];
    var fromKey = current[slot];

    // If this slot already has the right cog (from a previous swap), skip
    if (current[slot] === toKey) continue;

    // Find source: where the needed cog currently lives in the evolving board
    // Prefer a source slot that also needs to change (to avoid cascading extra swaps)
    var srcSlot = -1;
    if (toKey !== 'Blank') {
      var bestSrc = -1, bestIsChanging = false;
      for (var j = 0; j < BOARD_SIZE; j++) {
        if (j === slot) continue;
        if (current[j] === toKey) {
          var isChanging = current[j] !== target[j];
          if (bestSrc < 0 || (isChanging && !bestIsChanging)) {
            bestSrc = j;
            bestIsChanging = isChanging;
          }
        }
      }
      srcSlot = bestSrc;
    }

    // Display names (extract cog name from fingerprint)
    var fromName = fromKey === 'Blank' ? 'Blank' : fromKey.substring(0, fromKey.indexOf('|'));
    var toName = toKey === 'Blank' ? 'Blank' : toKey.substring(0, toKey.indexOf('|'));

    steps.push({
      slot: slot,
      from: fromName,
      to: toName,
      srcSlot: srcSlot,
      col: slot % BOARD_W,
      row: Math.floor(slot / BOARD_W),
    });

    // Update the working board state:
    // Place the target cog at this slot
    current[slot] = toKey;
    // If the source was another board slot, put the displaced cog there
    if (srcSlot >= 0) {
      current[srcSlot] = fromKey;
    }
  }

  return steps;
}

/**
 * Simple optimization: just try swapping each cog with every other cog.
 * Useful for a "quick" mode.
 */
export function optimizeGreedy(boardCogs, shelfCogs, playerCogs, goal) {
  var board = new Array(BOARD_SIZE);
  for (var i = 0; i < BOARD_SIZE; i++) {
    board[i] = boardCogs[i] ? _cloneCog(boardCogs[i]) : null;
  }

  var lockedSlots = {};

  var initialScore = scoreBoard(computeBoardTotals(board), goal, board);
  var improved = true;
  var passes = 0;

  while (improved && passes < 10) {
    improved = false;
    passes++;

    for (var i = 0; i < BOARD_SIZE; i++) {
      if (lockedSlots[i]) continue;

      for (var j = i + 1; j < BOARD_SIZE; j++) {
        if (lockedSlots[j]) continue;

        // Score before swap
        var prevScore = scoreBoard(computeBoardTotals(board), goal, board);

        // Try swap
        var tmp = board[i];
        board[i] = board[j];
        board[j] = tmp;

        var swapScore = scoreBoard(computeBoardTotals(board), goal, board);

        if (swapScore > prevScore) {
          improved = true;
        } else {
          // Revert
          tmp = board[i];
          board[i] = board[j];
          board[j] = tmp;
        }
      }
    }
  }

  var finalScore = scoreBoard(computeBoardTotals(board), goal, board);
  var swaps = _computeSwapSequence(boardCogs, board);

  return {
    board: board,
    score: finalScore,
    initialScore: initialScore,
    improvement: finalScore - initialScore,
    improvementPct: initialScore > 0 ? ((finalScore - initialScore) / initialScore * 100) : 0,
    swaps: swaps,
  };
}
