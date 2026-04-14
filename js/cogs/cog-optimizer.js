// ===== COG OPTIMIZER =====
// Simulated annealing optimizer for cog board placement.

import { BOARD_SIZE, BOARD_W, BOARD_H, computeBoardTotals, scoreBoard, slotToPos, posToSlot } from './cog-board.js';  // same directory

/**
 * Run simulated annealing to optimize cog board for a given goal.
 * @param {Array} boardCogs - Current board-placed cogs (96 elements, null=empty)
 * @param {Array} shelfCogs - Available shelf cogs
 * @param {Array} playerCogs - All player cogs (board + off-board)
 * @param {'build'|'flaggy'|'conExp'} goal
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

  // Lock Excogia 2×2 and player cog slots — players don't impact rates enough to move
  var lockedSlots = {};
  for (var i = 0; i < BOARD_SIZE; i++) {
    if (board[i] && board[i].name && (
        board[i].name.indexOf('CogZA') === 0 ||
        board[i].isPlayer)) {
      lockedSlots[i] = true;
    }
  }

  // Compute initial score
  var bestScore = scoreBoard(computeBoardTotals(board), goal, board);
  var currentScore = bestScore;
  var bestBoard = _cloneBoard(board);
  var initialScore = bestScore;
  var moves = [];
  var moveLog = [];

  // Temperature schedule: exponential decay
  var logRatio = Math.log(tempEnd / tempStart);

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

  // Greedy finishing pass: exhaustive pairwise swap on the best board
  var greedyImproved = true;
  var greedyPasses = 0;
  while (greedyImproved && greedyPasses < 5) {
    greedyImproved = false;
    greedyPasses++;
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

/**
 * Compute a swap sequence to transform `from` board into `to` board.
 * Each step tells the user where to place a cog and where it came from.
 * Tracks the evolving board state so source locations are always correct.
 */
function _computeSwapSequence(from, to) {
  var steps = [];

  // Working copy of current board state (mutated as we generate steps)
  var current = new Array(BOARD_SIZE);
  for (var i = 0; i < BOARD_SIZE; i++) {
    current[i] = (from[i] && from[i].name) || 'Blank';
  }

  // Target board state
  var target = new Array(BOARD_SIZE);
  for (var i = 0; i < BOARD_SIZE; i++) {
    target[i] = (to[i] && to[i].name) || 'Blank';
  }

  // Find all slots that differ (skip pinned player/yin cogs)
  var changed = [];
  for (var i = 0; i < BOARD_SIZE; i++) {
    if (current[i] !== target[i] &&
        !(from[i] && from[i].isPlayer) &&
        !(to[i] && to[i].isPlayer) &&
        !(from[i] && from[i].name && from[i].name.indexOf('CogZA') === 0) &&
        !(to[i] && to[i].name && to[i].name.indexOf('CogZA') === 0)) {
      changed.push(i);
    }
  }

  if (changed.length === 0) return steps;

  // Process each changed slot, updating current state as we go
  for (var ci = 0; ci < changed.length; ci++) {
    var slot = changed[ci];
    var toName = target[slot];
    var fromName = current[slot];

    // If this slot already has the right cog (from a previous swap), skip
    if (current[slot] === toName) continue;

    // Find source: where the needed cog currently lives in the evolving board
    var srcSlot = -1;
    if (toName !== 'Blank') {
      for (var j = 0; j < BOARD_SIZE; j++) {
        if (j === slot) continue;
        if (current[j] === toName) {
          srcSlot = j;
          break;
        }
      }
    }

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
    current[slot] = toName;
    // If the source was another board slot, put the displaced cog there
    if (srcSlot >= 0) {
      current[srcSlot] = fromName;
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
  for (var i = 0; i < BOARD_SIZE; i++) {
    if (board[i] && board[i].name && (
        board[i].name.indexOf('CogZA') === 0 ||
        board[i].isPlayer)) {
      lockedSlots[i] = true;
    }
  }

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
