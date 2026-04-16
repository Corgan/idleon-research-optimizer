// ===== COG BOARD SIMULATOR =====
// Replicates the game's 2-phase cog board computation.
// Given a board layout (array of cog objects), computes totals.

// CogMatrices: direction → array of [dx, dy] offsets
export var COG_MATRICES = [
  /* 0 adjacent */  [[0,1],[0,-1],[1,0],[-1,0]],
  /* 1 diagonal */  [[1,1],[1,-1],[-1,-1],[-1,1]],
  /* 2 left */      [[-1,0],[-2,0],[-1,1],[-1,-1],[-2,1],[-2,-1]],
  /* 3 right */     [[1,0],[2,0],[1,1],[1,-1],[2,1],[2,-1]],
  /* 4 up */        [[0,-1],[0,-2],[-1,-1],[1,-1],[-1,-2],[1,-2]],
  /* 5 down */      [[0,1],[0,2],[1,1],[-1,1],[1,2],[-1,2]],
  /* 6 */           [[0,0]],
  /* 7 */           [[0,0]],
  /* 8 corners */   [[2,2],[2,-2],[-2,2],[-2,-2]],
  /* 9 */           [[0,1],[0,-1],[1,0],[-1,0]],
  /* 10 around */   [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,-1],[-1,1],[0,2],[0,-2],[2,0],[-2,0]],
];

export var DIR_TO_INDEX = {
  adjacent: 0, diagonal: 1, left: 2, right: 3,
  up: 4, down: 5, corners: 8, around: 10,
};

export var BOARD_W = 12;
export var BOARD_H = 8;
export var BOARD_SIZE = 96;

// Convert slot index to col/row
export function slotToPos(slot) {
  return { col: slot % BOARD_W, row: Math.floor(slot / BOARD_W) };
}

// Convert col/row to slot index
export function posToSlot(col, row) {
  return col + row * BOARD_W;
}

/** Extract Yin/Excogia piece number (0-3) from cog name. Returns -1 if not a Yin cog. */
export function _yinPiece(cog) {
  if (!cog || !cog.l || !cog.name) return -1;
  return parseInt(cog.name.charAt(cog.name.length - 1)) || 0;
}

/**
 * Compute board totals from a board layout.
 * @param {Array} board - Array of 96 cog objects, each with: { a, b, c, d, e, f, g, j, h, i }
 *   a=base build speed, b=base con exp, c=base flaggy rate, d=%conExp (self)
 *   e=%buildSpd surround, f=%conExp surround, g=%flaggyRate surround, j=%flagSpeed surround
 *   h=direction string, i=flag speed base
 *   Any missing property defaults to 0.
 * @returns {{ totalBuild, totalConExp, totalFlaggy, perSlot }}
 */
export function computeBoardTotals(board) {
  // Phase 1: accumulate surround bonuses
  var accum = new Array(BOARD_SIZE);
  for (var i = 0; i < BOARD_SIZE; i++) {
    accum[i] = { eT: 0, fT: 0, gT: 0, jT: 0 };
  }

  // Pre-scan: find Yin cogs (l=1) in valid 2x2 Excogia blocks.
  // Yin surround bonus only activates when the 4 pieces are in correct positions:
  //   TL=piece0, TR=piece1, BL=piece2, BR=piece3
  var excogiActive = {};
  for (var r = 0; r < BOARD_H - 1; r++) {
    for (var c = 0; c < BOARD_W - 1; c++) {
      var s0 = posToSlot(c, r), s1 = posToSlot(c + 1, r);
      var s2 = posToSlot(c, r + 1), s3 = posToSlot(c + 1, r + 1);
      if (board[s0] && board[s0].l && board[s1] && board[s1].l &&
          board[s2] && board[s2].l && board[s3] && board[s3].l &&
          _yinPiece(board[s0]) === 0 && _yinPiece(board[s1]) === 1 &&
          _yinPiece(board[s2]) === 2 && _yinPiece(board[s3]) === 3) {
        excogiActive[s0] = true;
        excogiActive[s1] = true;
        excogiActive[s2] = true;
        excogiActive[s3] = true;
      }
    }
  }

  for (var src = 0; src < BOARD_SIZE; src++) {
    var cog = board[src];
    if (!cog || !cog.h) continue;
    // Yin cogs only get surround bonus when in a valid 2x2 block
    if (cog.l && !excogiActive[src]) continue;
    var se = cog.e || 0, sf = cog.f || 0, sg = cog.g || 0, sj = cog.j || 0;
    if (se === 0 && sf === 0 && sg === 0 && sj === 0) continue;

    var dir = cog.h;
    var pos = slotToPos(src);

    if (dir === 'everything') {
      for (var t = 0; t < BOARD_SIZE; t++) {
        accum[t].eT += se;
        accum[t].fT += sf;
        accum[t].gT += sg;
        accum[t].jT += sj;
      }
    } else if (dir === 'row') {
      for (var col = 0; col < BOARD_W; col++) {
        var t = posToSlot(col, pos.row);
        accum[t].eT += se;
        accum[t].fT += sf;
        accum[t].gT += sg;
        accum[t].jT += sj;
      }
    } else if (dir === 'column') {
      for (var row = 0; row < BOARD_H; row++) {
        var t = posToSlot(pos.col, row);
        accum[t].eT += se;
        accum[t].fT += sf;
        accum[t].gT += sg;
        accum[t].jT += sj;
      }
    } else {
      var mIdx = DIR_TO_INDEX[dir];
      if (mIdx === undefined) continue;
      var offsets = COG_MATRICES[mIdx];
      for (var oi = 0; oi < offsets.length; oi++) {
        var tc = pos.col + offsets[oi][0];
        var tr = pos.row + offsets[oi][1];
        if (tc < 0 || tc >= BOARD_W || tr < 0 || tr >= BOARD_H) continue;
        var t = posToSlot(tc, tr);
        accum[t].eT += se;
        accum[t].fT += sf;
        accum[t].gT += sg;
        accum[t].jT += sj;
      }
    }
  }

  // Phase 2: apply surround multipliers and sum totals
  var totalBuild = 0, totalConExp = 0, totalFlaggy = 0;
  var perSlot = new Array(BOARD_SIZE);

  for (var i = 0; i < BOARD_SIZE; i++) {
    var cog = board[i];
    var ba = (cog && cog.a) || 0;
    var bb = (cog && cog.b) || 0;
    var bc = (cog && cog.c) || 0;
    var bd = (cog && cog.d) || 0;

    // Apply surround multipliers
    var fa = ba * (1 + accum[i].eT / 100);
    var fb = bb * (1 + accum[i].fT / 100);
    var fc = bc * (1 + accum[i].gT / 100);

    perSlot[i] = {
      buildSpd: fa,
      conExp: fb,
      flaggyRate: fc,
      conExpPct: bd,
      surroundBuild: accum[i].eT,
      surroundConExp: accum[i].fT,
      surroundFlaggy: accum[i].gT,
      surroundFlagSpd: accum[i].jT,
    };

    totalBuild += fa;
    totalConExp += bd;
    totalFlaggy += fc;
  }

  // Compute actual player con EXP/hr: playerB × (1 + fT/100) × (1 + totalD/100)
  // Find the best player cog (highest b) and compute their effective exp/hr
  var bestPlayerExpHr = 0;
  var bestPlayerSlot = -1;
  for (var i = 0; i < BOARD_SIZE; i++) {
    var cog = board[i];
    if (cog && cog.isPlayer && (cog.b || 0) > 0) {
      var playerExpHr = (cog.b || 0) * (1 + (accum[i].fT || 0) / 100) * (1 + totalConExp / 100);
      if (playerExpHr > bestPlayerExpHr || bestPlayerSlot < 0) {
        bestPlayerExpHr = playerExpHr;
        bestPlayerSlot = i;
      }
    }
  }

  return {
    totalBuild: totalBuild,
    totalConExp: totalConExp,
    totalFlaggy: totalFlaggy,
    playerConExpHr: bestPlayerExpHr,
    playerSlot: bestPlayerSlot,
    perSlot: perSlot,
  };
}

/**
 * Compute board-level context needed for cog grading.
 * Returns { totalBaseD, totalSurround } where:
 *   totalBaseD = sum of all cog d values on the board
 *   totalSurround = sum of surround con exp % (fT) reaching player cogs
 */
export function boardGradeContext(board) {
  var totalBaseD = 0;
  var playerFT = 0;
  var totals = computeBoardTotals(board);
  for (var i = 0; i < BOARD_SIZE; i++) {
    var cog = board[i];
    if (cog) {
      totalBaseD += cog.d || 0;
      if (cog.isPlayer) {
        playerFT += totals.perSlot[i].surroundConExp || 0;
      }
    }
  }
  return { totalBaseD: totalBaseD, totalSurround: playerFT };
}

/**
 * Check if a directional cog at `slot` affects any player cog on the board.
 * Returns true if any of the cog's direction targets contains a player cog.
 */
export function cogAffectsPlayer(board, slot) {
  var cog = board[slot];
  if (!cog || !cog.h) return false;
  var dir = cog.h;
  var pos = slotToPos(slot);

  if (dir === 'everything') {
    for (var t = 0; t < BOARD_SIZE; t++) {
      if (board[t] && board[t].isPlayer) return true;
    }
    return false;
  }
  if (dir === 'row') {
    for (var col = 0; col < BOARD_W; col++) {
      var t = posToSlot(col, pos.row);
      if (board[t] && board[t].isPlayer) return true;
    }
    return false;
  }
  if (dir === 'column') {
    for (var row = 0; row < BOARD_H; row++) {
      var t = posToSlot(pos.col, row);
      if (board[t] && board[t].isPlayer) return true;
    }
    return false;
  }
  var mIdx = DIR_TO_INDEX[dir];
  if (mIdx === undefined) return false;
  var offsets = COG_MATRICES[mIdx];
  for (var oi = 0; oi < offsets.length; oi++) {
    var tc = pos.col + offsets[oi][0];
    var tr = pos.row + offsets[oi][1];
    if (tc < 0 || tc >= BOARD_W || tr < 0 || tr >= BOARD_H) continue;
    var t = posToSlot(tc, tr);
    if (board[t] && board[t].isPlayer) return true;
  }
  return false;
}

/**
 * Recover raw player base stats from a save-loaded board.
 * The game stores b = rawB × (1+fT/100) × (1+totalD/100).
 * This function divides out the board bonuses so that subsequent
 * computeBoardTotals calls produce correct absolute values.
 * Call ONCE after boardFromSave, before any scoring.
 */
export function recoverRawPlayerStats(board) {
  var totals = computeBoardTotals(board);
  for (var i = 0; i < BOARD_SIZE; i++) {
    var cog = board[i];
    if (cog && cog.isPlayer && cog.b > 0) {
      var fT = totals.perSlot[i].surroundConExp || 0;
      var totalD = totals.totalConExp || 0;
      var divisor = (1 + fT / 100) * (1 + totalD / 100);
      if (divisor > 1) {
        cog.b = cog.b / divisor;
      }
    }
  }
}

/**
 * Create a board array from save data (CogOrder + CogMap).
 * @param {Array} cogOrder - CogO data (252 entries)
 * @param {Object} cogMap - CogM data (keyed by slot index)
 * @returns {Array} 96-element board array
 */
export function boardFromSave(cogOrder, cogMap) {
  var board = new Array(BOARD_SIZE);
  for (var i = 0; i < BOARD_SIZE; i++) {
    var name = cogOrder[i] || 'Blank';
    if (name === 'Blank') {
      board[i] = null;
      continue;
    }
    var m = cogMap[i];
    if (!m) {
      board[i] = { name: name, a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, j: 0, h: null, i: 0, isPlayer: name.indexOf('Player_') === 0 };
      continue;
    }
    board[i] = {
      name: name,
      a: m.a || 0,
      b: m.b || 0,
      c: m.c || 0,
      d: m.d || 0,
      e: m.e || 0,
      f: m.f || 0,
      g: m.g || 0,
      j: m.j || 0,
      h: m.h || null,
      i: m.i || 0,
      l: m.l || 0, // CogZA marker
      _slot: i,
      isPlayer: name.indexOf('Player_') === 0,
    };
  }
  return board;
}

/**
 * Extract all available cogs (board + shelf) from save data.
 * @param {Array} cogOrder
 * @param {Object} cogMap
 * @param {Array} [flagUnlock] - FlagU save data; indices 96-119 = tiny cog slots (-11 = unlocked)
 * @returns {{ boardCogs, shelfCogs, shelfSlots, shelfSmallCogs, tinyBoard, tinyLocked, playerCogs }}
 */
export function extractAllCogs(cogOrder, cogMap, flagUnlock) {
  var boardCogs = [];
  var shelfCogs = [];
  var playerCogs = [];

  // Board cogs (0-95)
  for (var i = 0; i < BOARD_SIZE; i++) {
    var name = cogOrder[i] || 'Blank';
    if (name === 'Blank') continue;
    var m = cogMap[i] || {};
    var cog = _makeCog(name, m, i);
    if (name.indexOf('Player_') === 0) {
      cog.isPlayer = true;
      playerCogs.push(cog);
    }
    boardCogs.push(cog);
  }

  // Player slots (96-107) — not on board
  for (var i = 96; i < 108; i++) {
    var name = cogOrder[i] || 'Blank';
    if (name === 'Blank' || name.indexOf('Player_') !== 0) continue;
    var m = cogMap[i] || {};
    var cog = _makeCog(name, m, i);
    cog.isPlayer = true;
    playerCogs.push(cog);
  }

  // Shelf cogs (108-227) — all 120 slots, null for blanks
  var shelfSlots = [];
  var shelfSmallCogs = [];
  for (var i = 108; i < 228; i++) {
    var name = cogOrder[i] || 'Blank';
    if (name === 'Blank') {
      shelfSlots.push(null);
    } else if (name.indexOf('CogSm') === 0) {
      var cog = _makeCog(name, cogMap[i] || {}, i);
      shelfSmallCogs.push(cog);
      shelfSlots.push(cog);
    } else {
      var m = cogMap[i] || {};
      var cog = _makeCog(name, m, i);
      shelfCogs.push(cog);
      shelfSlots.push(cog);
    }
  }

  // Tiny cog board (228-251) — 24 slots
  // FlagUnlock[96+t] === -11 means the slot is unlocked
  var tinyBoard = [];
  var tinyLocked = [];
  for (var i = 228; i < 252; i++) {
    var t = i - 228;
    var flagVal = (flagUnlock && flagUnlock.length > 96 + t) ? flagUnlock[96 + t] : 0;
    var locked = flagVal !== -11;
    tinyLocked.push(locked);
    var name = cogOrder[i] || 'Blank';
    if (name === 'Blank' || name.indexOf('CogSm') !== 0) {
      tinyBoard.push(null);
    } else {
      tinyBoard.push(_makeCog(name, cogMap[i] || {}, i));
    }
  }

  return {
    boardCogs: boardCogs, shelfCogs: shelfCogs, shelfSlots: shelfSlots,
    shelfSmallCogs: shelfSmallCogs, tinyBoard: tinyBoard, tinyLocked: tinyLocked,
    playerCogs: playerCogs
  };
}

function _makeCog(name, m, slot) {
  return {
    name: name,
    a: m.a || 0, b: m.b || 0, c: m.c || 0, d: m.d || 0,
    e: m.e || 0, f: m.f || 0, g: m.g || 0, j: m.j || 0,
    h: m.h || null, i: m.i || 0, l: m.l || 0,
    _slot: slot,
    isPlayer: false,
  };
}

/**
 * Classify a cog name into its type and tier.
 */
export function classifyCog(name) {
  if (!name || name === 'Blank') return { type: 'empty', tier: -1 };
  if (name.indexOf('Player_') === 0) return { type: 'player', tier: -1, charName: name.substring(7) };
  if (name === 'CogY') return { type: 'yellow', tier: -1 };
  if (name.indexOf('CogZA') === 0) return { type: 'excogia', tier: -1, piece: parseInt(name.charAt(5)) || 0 };
  if (name.indexOf('CogCry') === 0) {
    var suffix = parseInt(name.substring(6)) || 0;
    return { type: 'crystal', tier: 4, variant: suffix };
  }
  // Standard cogs: Cog{tier}{variant}  e.g. Cog3A00, Cog2ad
  var match = name.match(/^Cog(\d)(.+)$/);
  if (match) return { type: 'standard', tier: parseInt(match[1]), variant: match[2] };
  if (name.indexOf('CogSm') === 0) return { type: 'small', tier: -1 };
  return { type: 'unknown', tier: -1 };
}

/**
 * Compute a score for board totals given a goal.
 * For conExp: maximizes playerB × (1 + fT/100) × (1 + totalD/100),
 * which is the actual construction EXP/hr formula.
 * @param {{ totalBuild, totalConExp, totalFlaggy, playerConExpHr, perSlot }} totals
 * @param {'build'|'flaggy'|'conexp'} goal
 * @param {Array} [board] - needed for conexp goal to find player slots
 */
export function scoreBoard(totals, goal, board) {
  if (goal === 'build') return totals.totalBuild;
  if (goal === 'flaggy') return totals.totalFlaggy;
  if (goal === 'conexp') {
    // Use the pre-computed player con EXP/hr which includes:
    // playerB × (1 + surroundF/100) × (1 + totalD/100)
    return totals.playerConExpHr || 0;
  }
  // Weighted multi-objective: goal = { build: w, conexp: w, flaggy: w, ref: { build, conexp, flaggy } }
  if (typeof goal === 'object' && goal.ref) {
    var score = 0;
    if (goal.build && goal.ref.build > 0)
      score += goal.build * (totals.totalBuild / goal.ref.build);
    if (goal.conexp && goal.ref.conexp > 0)
      score += goal.conexp * ((totals.playerConExpHr || 0) / goal.ref.conexp);
    if (goal.flaggy && goal.ref.flaggy > 0)
      score += goal.flaggy * (totals.totalFlaggy / goal.ref.flaggy);
    return score;
  }
  return totals.totalBuild;
}

/**
 * Optimize tiny cog board (24 slots).
 * Only swaps out the weakest NON-target-type cogs for target-type cogs from shelf.
 * Respects locked slots (FlagUnlock !== -11).
 *
 * @param {Array} tinyBoard - 24-element array (null = empty, cog object for filled)
 * @param {Array} tinyLocked - 24-element boolean array (true = locked)
 * @param {Array} shelfSmallCogs - CogSm items found in shelf slots
 * @param {'build'|'flaggy'|'conexp'} goal
 * @param {Function} parseFn - parseSmallCog function
 * @returns {{ newTinyBoard, moves, bonusBefore, bonusAfter }}
 */
export function optimizeTinyCogs(tinyBoard, tinyLocked, shelfSmallCogs, goal, parseFn) {
  // Goal → preferred tiny cog type index (0=flaggy, 1=build, 2=conexp)
  var goalType = goal === 'flaggy' ? 0 : goal === 'conexp' ? 2 : 1;
  var smTypes = ['Flaggy', 'Build', 'ConXP'];

  // Collect target-type shelf cogs, sorted strongest first
  var targetAvail = [];
  for (var i = 0; i < shelfSmallCogs.length; i++) {
    var p = parseFn(shelfSmallCogs[i].name);
    if (p && p.type === goalType) {
      targetAvail.push({ cog: shelfSmallCogs[i], parsed: p, bonus: p.bonus });
    }
  }
  targetAvail.sort(function(a, b) { return b.bonus - a.bonus; });

  // Compute bonus before
  var bonusBefore = [0, 0, 0];
  for (var i = 0; i < 24; i++) {
    if (tinyBoard[i]) {
      var p = parseFn(tinyBoard[i].name);
      if (p) bonusBefore[p.type] += p.bonus;
    }
  }

  // Build the new tiny board (clone)
  var newBoard = new Array(24);
  for (var i = 0; i < 24; i++) newBoard[i] = tinyBoard[i] || null;

  var moves = [];

  // Step 1: Fill unlocked empty slots with target-type cogs
  for (var i = 0; i < 24 && targetAvail.length > 0; i++) {
    if (newBoard[i] || tinyLocked[i]) continue;
    var avail = targetAvail.shift();
    newBoard[i] = avail.cog;
    moves.push({
      type: 'place',
      slot: 228 + i,
      cogName: avail.cog.name,
      desc: 'Place ' + smTypes[goalType] + ' T' + (avail.parsed.level + 1) +
            ' in tiny slot ' + i
    });
  }

  // Step 2: Swap out weakest non-target cogs in unlocked slots
  // Collect non-target placed cogs sorted by bonus ascending (weakest first)
  var nonTarget = [];
  for (var i = 0; i < 24; i++) {
    if (!newBoard[i] || tinyLocked[i]) continue;
    var p = parseFn(newBoard[i].name);
    if (p && p.type !== goalType) {
      nonTarget.push({ slot: i, parsed: p, bonus: p.bonus });
    }
  }
  nonTarget.sort(function(a, b) { return a.bonus - b.bonus; });

  // Replace weakest non-target cogs with available target-type cogs
  for (var ni = 0; ni < nonTarget.length && targetAvail.length > 0; ni++) {
    var victim = nonTarget[ni];
    var avail = targetAvail.shift();
    var oldP = victim.parsed;
    moves.push({
      type: 'swap',
      slot: 228 + victim.slot,
      cogName: avail.cog.name,
      oldCogName: newBoard[victim.slot].name,
      desc: 'Replace ' + smTypes[oldP.type] + ' T' + (oldP.level + 1) +
            ' with ' + smTypes[goalType] + ' T' + (avail.parsed.level + 1) +
            ' in tiny slot ' + victim.slot
    });
    newBoard[victim.slot] = avail.cog;
  }

  // Step 3: Upgrade existing target-type cogs if shelf has stronger ones
  for (var ai = 0; ai < targetAvail.length; ai++) {
    var avail = targetAvail[ai];
    var weakestIdx = -1, weakestBonus = avail.bonus;
    for (var i = 0; i < 24; i++) {
      if (!newBoard[i] || tinyLocked[i]) continue;
      var p = parseFn(newBoard[i].name);
      if (p && p.type === goalType && p.bonus < weakestBonus) {
        weakestBonus = p.bonus;
        weakestIdx = i;
      }
    }
    if (weakestIdx >= 0) {
      var oldP = parseFn(newBoard[weakestIdx].name);
      moves.push({
        type: 'swap',
        slot: 228 + weakestIdx,
        cogName: avail.cog.name,
        oldCogName: newBoard[weakestIdx].name,
        desc: 'Upgrade ' + smTypes[goalType] + ' T' + (oldP.level + 1) +
              ' to T' + (avail.parsed.level + 1) + ' in tiny slot ' + weakestIdx
      });
      newBoard[weakestIdx] = avail.cog;
    }
  }

  // Compute bonus after
  var bonusAfter = [0, 0, 0];
  for (var i = 0; i < 24; i++) {
    if (newBoard[i]) {
      var p = parseFn(newBoard[i].name);
      if (p) bonusAfter[p.type] += p.bonus;
    }
  }

  return {
    newTinyBoard: newBoard,
    moves: moves,
    bonusBefore: bonusBefore,
    bonusAfter: bonusAfter,
  };
}
