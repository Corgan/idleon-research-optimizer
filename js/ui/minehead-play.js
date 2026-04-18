// ===== MINEHEAD PLAY SUBTAB — Interactive Depth Charge game =====
import { saveData } from '../state.js';
import { gbWith } from '../sim-math.js';
import { MINEHEAD_NAMES, TILE_MULTIPLIERS } from '../stats/data/w7/minehead.js';
import {
  upgradeQTY, gridDims, minesOnFloor, floorHP, maxHPYou,
  goldTilesTotal, blocksTotal, instaRevealsTotal,
  bluecrownOdds, jackpotTiles, bonusDMGperTilePCT,
  currentOutgoingDMG, WIGGLE_CHANCE, wiggleMaxPerGame,
} from '../stats/systems/w7/minehead.js';
import { generateGrid, _placeGoldens } from '../minehead/sim.js';
import { inferStrategy } from '../minehead/strategy-inferrer.js';
import { mhState, saveInferred, saveDecisions, clearInferred, mineReduction, _fmt } from './minehead-helpers.js';

export function renderPlayfield() {
  const container = document.getElementById('mh-play');
  if (!container) return;

  const lvs = saveData.mineheadUpgLevels || [];
  const floor = saveData.stateR7?.[4] || 0;
  const svarHP = saveData.serverVarMineHP || 1;
  const { cols, rows } = gridDims(lvs[2]);
  const numTiles = cols * rows;
  const mines = minesOnFloor(floor, mineReduction());
  const hp = floorHP(floor, svarHP);
  const maxLives = maxHPYou(lvs);
  const maxGoldens = goldTilesTotal(lvs);
  const maxBlocks = blocksTotal(lvs);
  const maxInstas = instaRevealsTotal(lvs);
  const crownOdds = bluecrownOdds(lvs);
  const jpTileCount = jackpotTiles(lvs);
  const bossName = (MINEHEAD_NAMES[floor] || 'Boss ' + floor).replace(/_/g, ' ');

  container.innerHTML = `
    <div style="text-align:center;margin-bottom:12px;">
      <h3 style="color:var(--accent);margin-bottom:4px;">Depth Charge — Floor ${floor}: ${bossName}</h3>
      <div id="mh-p-hud" style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap;font-size:.88em;margin:8px 0;"></div>
      <div id="mh-p-dmg-bar" style="max-width:400px;margin:8px auto;"></div>
      <div id="mh-p-turn-info" style="color:var(--text2);font-size:.82em;margin-bottom:6px;"></div>
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:10px;">
        <button class="btn" id="mh-p-attack" style="background:var(--accent);font-weight:700;">\u2694 Attack</button>
        <button class="btn" id="mh-p-insta" style="background:#1a6b1a;">\u26A1 Insta-Reveal</button>
        <button class="btn" id="mh-p-new" style="background:var(--bg3);">New Game</button>
      </div>
    </div>
    <div id="mh-p-grid" style="display:grid;grid-template-columns:repeat(${cols}, 48px);gap:3px;justify-content:center;"></div>
    <div id="mh-p-log" style="max-width:500px;margin:12px auto 0;max-height:160px;overflow-y:auto;font-size:.78em;color:var(--text2);"></div>
    <div id="mh-p-strategy" style="max-width:500px;margin:16px auto 0;">
      <div style="display:flex;align-items:center;gap:10px;justify-content:center;">
        <span id="mh-p-stats" style="font-size:.82em;color:var(--text2);">Games: 0 | Decisions: 0</span>
        <button class="btn" id="mh-p-clear-data" style="background:var(--bg3);font-size:.78em;">Reset</button>
      </div>
      <div id="mh-p-profile" style="margin-top:8px;"></div>
    </div>
  `;

  _initPlayGame(container, cols, rows, numTiles, mines, hp, maxLives, maxGoldens, maxBlocks, maxInstas, crownOdds, jpTileCount, lvs, svarHP);
}

function _initPlayGame(container, cols, rows, numTiles, mines, bossHP, maxLives, maxGoldens, maxBlocks, maxInstas, crownOdds, jpTileCount, lvs, svarHP) {
  const gridEl = document.getElementById('mh-p-grid');
  const hudEl = document.getElementById('mh-p-hud');
  const dmgBarEl = document.getElementById('mh-p-dmg-bar');
  const turnInfoEl = document.getElementById('mh-p-turn-info');
  const logEl = document.getElementById('mh-p-log');
  const attackBtn = document.getElementById('mh-p-attack');
  const instaBtn = document.getElementById('mh-p-insta');
  const newBtn = document.getElementById('mh-p-new');

  const _gbCtxPlay = { abm: saveData.allBonusMulti || 1 };
  const _gbPlay = idx => gbWith(saveData.gridLevels, saveData.shapeOverlay, idx, _gbCtxPlay);
  const gridBonus167 = _gbPlay(167);
  const gridBonus146 = _gbPlay(146);
  const wepPowDmgPCT = 0;
  const playSail38 = Number(saveData.sailingData?.[3]?.[38]) || 0;

  const _gbCtx = { abm: saveData.allBonusMulti || 1 };
  const _gb166_1 = saveData.gridLevels?.[166] || 0;
  const maxWiggles = wiggleMaxPerGame(_gb166_1);

  let _rng = _makeRng();
  let lives, goldens, blocks, instas, totalDmg, turnsPlayed, totalCommits;
  let grid, crowns, goldenPos, revealed, turnValues, crownProgress, crownSets;
  let safeRevealed, gameOver, turnActive, minesFound, wigglesUsed, firstClickDone;
  let _lastTurnMineHit = false;

  function _makeRng() {
    let s = (Date.now() ^ 0xDEADBEEF) | 0;
    return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  const stratStatsEl = document.getElementById('mh-p-stats');
  const clearDataBtn = document.getElementById('mh-p-clear-data');
  const profileEl = document.getElementById('mh-p-profile');

  function _collectDecision(choice, tileIdx) {
    const estMinesLeft = Math.max(0, mines - minesFound);
    const unrevealed = revealed.filter(r => !r).length;
    const goldensOnGrid = goldenPos.filter(p => !revealed[p]).length;

    let spatial = null;
    if (tileIdx != null) {
      const r = Math.floor(tileIdx / cols), c = tileIdx % cols;
      const isEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
      let adjMines = 0, adjSafe = 0, adjUnrevealed = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const ni = nr * cols + nc;
          if (revealed[ni]) {
            if (grid[ni] === 0) adjMines++;
            else adjSafe++;
          } else adjUnrevealed++;
        }
      }
      spatial = {
        idx: tileIdx, r, c, cols, rows,
        isCorner, isEdge: isEdge && !isCorner,
        isCenter: !isEdge,
        adjMines, adjSafe, adjUnrevealed,
        clickOrder: safeRevealed,
      };
    }

    mhState.playDecisions.push({
      safeRevealedThisTurn: safeRevealed,
      minesTotal: mines,
      minesRemaining: estMinesLeft,
      unrevealedCount: unrevealed,
      livesLeft: lives,
      totalDmgSoFar: totalDmg,
      bossHP,
      turnsPlayed,
      blocksLeft: blocks,
      goldensOnGrid,
      currentTurnDmg: _calcTurnDmg(),
      remainingHP: bossHP - totalDmg,
      perTilePct: bonusDMGperTilePCT(lvs, gridBonus146),
      tileCount: turnValues.length,
      crownProgress,
      lastTurnMineHit: _lastTurnMineHit,
      choice,
      spatial,
    });
    _updateStrategyStats();
  }

  function _updateStrategyStats() {
    const need = Math.max(0, 3 - mhState.playGames);
    if (need > 0) {
      if (stratStatsEl) stratStatsEl.textContent = `Games: ${mhState.playGames} | Decisions: ${mhState.playDecisions.length} \u2014 play ${need} more game${need > 1 ? 's' : ''} to start learning`;
    } else {
      if (stratStatsEl) stratStatsEl.textContent = `Games: ${mhState.playGames} | Decisions: ${mhState.playDecisions.length} \u2014 auto-analyzing after each game`;
    }
  }

  _updateStrategyStats();

  function _log(msg, color) {
    const d = document.createElement('div');
    if (color) d.style.color = color;
    d.textContent = msg;
    logEl.prepend(d);
  }

  function _hudItem(label, val, color) {
    return `<div><span style="color:var(--text2);">${label}:</span> <b style="color:${color};">${val}</b></div>`;
  }

  function _updateHud() {
    let h = '';
    h += _hudItem('Lives', '\u2764'.repeat(lives) + '\uD83D\uDDA4'.repeat(Math.max(0, maxLives - lives)), 'var(--accent)');
    if (maxBlocks > 0) h += _hudItem('Blocks', blocks, 'var(--cyan)');
    if (maxGoldens > 0) h += _hudItem('Goldens', goldens, 'var(--gold)');
    if (maxInstas > 0) h += _hudItem('Instas', instas, '#4caf50');
    if (maxWiggles > 0) h += _hudItem('Wiggles', `${maxWiggles - wigglesUsed}/${maxWiggles}`, '#ff9800');
    h += _hudItem('Turn', turnsPlayed, 'var(--text)');
    if (crownOdds > 0) h += _hudItem('Crowns', `${crownProgress}/3 (${crownSets} sets)`, 'var(--purple)');
    hudEl.innerHTML = h;
    instaBtn.style.display = maxInstas > 0 ? '' : 'none';

    const pct = Math.min(100, totalDmg / bossHP * 100);
    const turnDmg = _calcTurnDmg();
    const turnPct = Math.min(100 - pct, turnDmg / bossHP * 100);
    dmgBarEl.innerHTML = `<div style="background:var(--bg3);border-radius:4px;height:16px;overflow:hidden;position:relative;">
      <div style="width:${pct}%;height:100%;background:var(--green);position:absolute;left:0;top:0;transition:width .3s;"></div>
      <div style="width:${turnPct}%;height:100%;background:var(--gold);opacity:.6;position:absolute;left:${pct}%;top:0;transition:width .2s;"></div>
      <div style="position:absolute;width:100%;text-align:center;font-size:.72em;line-height:16px;color:#fff;font-weight:600;">${_fmt(totalDmg)} / ${_fmt(bossHP)} ${turnDmg > 0 ? '(+' + _fmt(turnDmg) + ')' : ''}</div>
    </div>`;

    const estMinesLeft = Math.max(0, mines - minesFound);
    const unrevealed = grid ? revealed.filter(r => !r).length : 0;
    const mPct = unrevealed > 0 ? (estMinesLeft / unrevealed * 100).toFixed(0) : 0;
    turnInfoEl.textContent = `Tiles: ${safeRevealed} revealed | Mines left: ~${estMinesLeft}/${unrevealed} (${mPct}%) | Turn dmg: ${_fmt(_calcTurnDmg())}`;

    attackBtn.disabled = gameOver || !turnActive || safeRevealed === 0;
    instaBtn.disabled = gameOver || !turnActive || instas <= 0;
    attackBtn.style.opacity = attackBtn.disabled ? '.4' : '1';
    if (maxInstas > 0) instaBtn.style.opacity = instaBtn.disabled ? '.4' : '1';
  }

  function _calcTurnDmg() {
    if (turnValues.length === 0) return 0;
    return currentOutgoingDMG(turnValues, crownSets, lives <= 1, lvs, gridBonus167, gridBonus146, wepPowDmgPCT, playSail38);
  }

  function _newGame() {
    _rng = _makeRng();
    lives = maxLives;
    goldens = maxGoldens;
    blocks = maxBlocks;
    instas = maxInstas;
    totalDmg = 0;
    turnsPlayed = 0;
    totalCommits = 0;
    wigglesUsed = 0;
    _lastTurnMineHit = false;
    gameOver = false;
    logEl.innerHTML = '';
    _log('Game started! Click tiles to reveal them.', 'var(--green)');
    _newTurn(true);
  }

  function _newTurn(skipDispose) {
    const setup = () => {
      turnsPlayed++;
      const g = generateGrid(numTiles, mines, lvs, crownOdds, _rng);
      grid = g.grid;
      crowns = g.crowns;
      goldenPos = _placeGoldens(grid, numTiles, goldens, maxGoldens, _rng);
      if (mhState.PLAY_RIGGED) {
        const goldSet = new Set(goldenPos);
        for (let i = 0; i < numTiles; i++) { if (!goldSet.has(i)) grid[i] = 0; }
      }
      revealed = new Array(numTiles).fill(false);
      turnValues = [];
      minesFound = 0;
      crownProgress = 0;
      crownSets = 0;
      safeRevealed = 0;
      firstClickDone = false;
      turnActive = true;
      _log(`\u2500\u2500 Turn ${turnsPlayed} \u2500\u2500`, 'var(--purple)');
      _renderGrid(true);
      _updateHud();
    };
    if (skipDispose) { setup(); return; }
    _disposeTiles().then(setup);
  }

  function _tileStyle(i) {
    if (!revealed[i]) {
      const isGolden = goldenPos.includes(i);
      return isGolden
        ? 'background:linear-gradient(135deg,#8b6914,#c9a227);border-color:#daa520;color:#fff;cursor:pointer;'
        : 'background:var(--bg3);border-color:#444;color:var(--text2);cursor:pointer;';
    }
    const v = grid[i];
    if (v === 0) return 'background:rgba(233,69,96,.25);border-color:var(--accent);color:var(--accent);cursor:default;';
    if (v === 30) return 'background:rgba(255,215,0,.2);border-color:var(--gold);color:var(--gold);cursor:default;';
    if (v >= 40) return 'background:rgba(0,188,212,.15);border-color:var(--cyan);color:var(--cyan);cursor:default;';
    if (v >= 20) return 'background:rgba(156,39,176,.2);border-color:var(--purple);color:var(--purple);cursor:default;';
    return 'background:rgba(76,175,80,.15);border-color:var(--green);color:var(--green);cursor:default;';
  }

  function _tileLabel(i) {
    if (!revealed[i]) return goldenPos.includes(i) ? '\u2605' : '?';
    const v = grid[i];
    if (v === 0) return '\uD83D\uDCA3';
    if (v === 30) return '\uD83C\uDFB0';
    if (v >= 40) return '$' + (v - 39);
    if (v >= 20) return '\u00d7' + TILE_MULTIPLIERS[v - 20];
    return v;
  }

  function _disposeTiles() {
    return new Promise(resolve => {
      const tiles = gridEl.children;
      if (!tiles.length) { resolve(); return; }
      const indices = Array.from({length: tiles.length}, (_, i) => i);
      for (let j = indices.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [indices[j], indices[k]] = [indices[k], indices[j]]; }
      const stagger = Math.min(30, 400 / tiles.length);
      indices.forEach((idx, order) => {
        const t = tiles[idx];
        if (!t) return;
        setTimeout(() => {
          t.style.transition = 'transform .3s ease-in, opacity .3s ease-in';
          t.style.transform = `scale(0.3) rotate(${(Math.random() - 0.5) * 40}deg)`;
          t.style.opacity = '0';
        }, order * stagger);
      });
      setTimeout(resolve, indices.length * stagger + 320);
    });
  }

  function _renderGrid(animate) {
    gridEl.innerHTML = '';
    for (let i = 0; i < numTiles; i++) {
      const tile = document.createElement('div');
      const baseStyle = `width:48px;height:48px;border:2px solid;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:1.2em;font-weight:700;user-select:none;`;
      if (animate) {
        tile.style.cssText = baseStyle + `opacity:0;transform:scale(0) rotate(${(Math.random()-0.5)*30}deg);transition:transform .3s cubic-bezier(.34,1.56,.64,1), opacity .25s ease-out;${_tileStyle(i)}`;
      } else {
        tile.style.cssText = baseStyle + `transition:all .15s;${_tileStyle(i)}`;
      }
      tile.textContent = _tileLabel(i);
      if (crowns[i] && revealed[i] && grid[i] !== 0) {
        tile.innerHTML = _tileLabel(i) + '<span style="position:absolute;top:-2px;right:1px;font-size:.55em;">\uD83D\uDC51</span>';
        tile.style.position = 'relative';
      }
      if (!revealed[i] && turnActive && !gameOver) {
        tile.addEventListener('mouseenter', () => { tile.style.transform = 'scale(1.08)'; });
        tile.addEventListener('mouseleave', () => { tile.style.transform = ''; });
        tile.addEventListener('click', () => _onTileClick(i));
      }
      gridEl.appendChild(tile);
    }
    if (animate) {
      const stagger = Math.min(25, 350 / numTiles);
      const shuffled = Array.from({length: numTiles}, (_, i) => i);
      for (let j = shuffled.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]]; }
      shuffled.forEach((idx, order) => {
        const t = gridEl.children[idx];
        if (!t) return;
        setTimeout(() => { t.style.opacity = '1'; t.style.transform = 'scale(1) rotate(0deg)'; }, order * stagger + 30);
      });
    }
  }

  function _revealTile(i, isInsta) {
    if (revealed[i]) return 'already';
    revealed[i] = true;

    if (crowns[i]) {
      crownProgress++;
      if (crownProgress >= 3) { crownProgress = 0; crownSets++; _log('\uD83D\uDC51 Crown 3-match! Sets: ' + crownSets, 'var(--purple)'); }
    }
    if (goldenPos.includes(i)) { goldens--; }

    const v = grid[i];
    if (v === 0) {
      minesFound++;
      if (isInsta) { _log('\u26A1 Insta-reveal found a mine safely!', '#4caf50'); return 'mine-insta'; }
      if (!firstClickDone && wigglesUsed < maxWiggles && _rng() < WIGGLE_CHANCE) {
        wigglesUsed++;
        _log('Wiggle! Mine dodged! (' + (maxWiggles - wigglesUsed) + ' left)', '#ff9800');
        return 'mine-wiggle';
      }
      if (blocks > 0) { blocks--; _log('\uD83D\uDEE1 Block absorbed a mine hit!', 'var(--cyan)'); return 'mine-blocked'; }
      lives--;
      if (lives === 1 && upgradeQTY(19, lvs[19]) >= 1) { blocks = 1; _log('\uD83D\uDC80 Revival! Gained 1 block.', 'var(--gold)'); }
      _log('\uD83D\uDCA3 MINE HIT! Lives: ' + lives, 'var(--accent)');
      return 'mine-hit';
    }
    if (v === 30) {
      _log('\uD83C\uDFB0 JACKPOT! Cascade-revealing tiles...', 'var(--gold)');
      let jpLeft = jpTileCount;
      for (let attempt = 0; attempt < 1000 && jpLeft > 0; attempt++) {
        const jPos = Math.floor(_rng() * numTiles);
        if (grid[jPos] !== 0 && !revealed[jPos]) { _revealTile(jPos, false); jpLeft--; }
      }
      return 'jackpot';
    }
    if (v >= 1 && v <= 29) { turnValues.push(v); safeRevealed++; }
    else if (v >= 40) { safeRevealed++; _log('\uD83D\uDCB0 Currency tile +' + (v - 39), 'var(--cyan)'); }
    return 'safe';
  }

  function _onTileClick(i) {
    if (gameOver || !turnActive || revealed[i]) return;
    const isGolden = goldenPos.includes(i);
    _collectDecision(isGolden ? 'golden' : 'reveal', i);
    const wasFirstClick = !firstClickDone;
    firstClickDone = true;
    const result = _revealTile(i, false);

    if (result === 'mine-hit') {
      _lastTurnMineHit = true;
      if (lives <= 0) {
        turnActive = false;
        gameOver = true;
        mhState.playGames++;
        saveDecisions();
        _autoAnalyze();
        _updateStrategyStats();
        _log('\u2620 GAME OVER \u2014 All lives lost!', 'var(--accent)');
      } else {
        turnActive = false;
        _log('Turn lost \u2014 0 damage committed.', 'var(--accent)');
        setTimeout(() => { if (!gameOver) _newTurn(false); }, 600);
      }
    }

    if (turnActive && revealed.every(r => r)) {
      _commitDamage();
      return;
    }

    _renderGrid();
    _updateHud();

    if (totalDmg >= bossHP) {
      gameOver = true;
      turnActive = false;
      _log('\uD83C\uDF89 BOSS DEFEATED! Total damage: ' + _fmt(totalDmg), 'var(--green)');
    }
  }

  function _commitDamage() {
    const dmg = _calcTurnDmg();
    if (dmg > 0) {
      totalDmg += dmg;
      totalCommits++;
      _log(`\u2694 Attack! Dealt ${_fmt(dmg)} damage (${totalCommits} commits, total: ${_fmt(totalDmg)})`, 'var(--green)');
    }
    _lastTurnMineHit = false;
    turnActive = false;

    if (totalDmg >= bossHP) {
      gameOver = true;
      mhState.playGames++;
      saveDecisions();
      _autoAnalyze();
      _updateStrategyStats();
      _log(`\uD83C\uDF89 BOSS DEFEATED in ${turnsPlayed} turns!`, 'var(--green)');
    } else {
      setTimeout(() => { if (!gameOver) _newTurn(false); }, 400);
    }
    _renderGrid();
    _updateHud();
  }

  function _useInsta() {
    if (gameOver || !turnActive || instas <= 0) return;
    const unrevealed = [];
    for (let i = 0; i < numTiles; i++) { if (grid[i] === 0 && !revealed[i]) unrevealed.push(i); }
    if (unrevealed.length === 0) { _log('No mines left to reveal!', 'var(--text2)'); return; }
    const attempts = maxInstas - instas;
    if (_rng() < Math.min(0.7, 0.2 + 0.15 * attempts)) {
      instas = 0;
      _log('\u26A1 Insta-reveal locked out!', 'var(--accent)');
      _renderGrid();
      _updateHud();
      return;
    }
    instas--;
    const target = unrevealed[Math.floor(_rng() * unrevealed.length)];
    _revealTile(target, true);
    _renderGrid();
    _updateHud();
  }

  attackBtn.addEventListener('click', () => {
    if (turnActive && safeRevealed > 0) {
      _collectDecision('attack');
      _commitDamage();
    }
  });
  instaBtn.addEventListener('click', _useInsta);
  newBtn.addEventListener('click', _newGame);

  function _autoAnalyze() {
    if (mhState.playGames < 3 || mhState.playDecisions.length < 10) return;
    mhState.inferResult = inferStrategy(mhState.playDecisions);
    saveInferred();
    _renderProfile();
  }

  clearDataBtn.addEventListener('click', () => {
    clearInferred();
    _updateStrategyStats();
    if (profileEl) profileEl.innerHTML = '';
  });

  function _renderProfile() {
    if (!profileEl || !mhState.inferResult || !mhState.inferResult.params) return;
    const r = mhState.inferResult;
    const pct = (r.agreement * 100).toFixed(1);
    const p = r.params;
    const knobRows = Object.entries(p).map(([k, v]) => {
      const isDefault = v === 0 || v === false || v === 1.0 || (k === 'blockAggro' && v === true);
      const color = isDefault ? 'var(--text2)' : 'var(--gold)';
      return `<tr><td style="padding:2px 8px;color:${color};">${k}</td><td style="padding:2px 8px;color:${color};font-weight:600;">${v}</td></tr>`;
    }).join('');

    let spatialHtml = '';
    const sp = r.spatial;
    if (sp) {
      const zb = sp.zoneBias;
      const _zbBadge = (label, val) => {
        const color = val > 1.3 ? 'var(--gold)' : val < 0.7 ? 'var(--cyan)' : 'var(--text2)';
        return `<span style="display:inline-block;background:var(--bg3);border-radius:4px;padding:2px 6px;margin:2px;font-size:.82em;"><span style="color:var(--text2);">${label}</span> <b style="color:${color};">${val.toFixed(2)}\u00d7</b></span>`;
      };

      spatialHtml += `<div style="margin-top:6px;">`;
      spatialHtml += `<div style="color:var(--text2);font-size:.75em;margin-bottom:3px;">Zone Bias (1.0 = random)</div>`;
      spatialHtml += _zbBadge('Corner', zb.corner) + _zbBadge('Edge', zb.edge) + _zbBadge('Center', zb.center);
      spatialHtml += `</div>`;

      if (sp.firstClickZone) {
        const fc = sp.firstClickZone;
        spatialHtml += `<div style="margin-top:4px;">`;
        spatialHtml += `<div style="color:var(--text2);font-size:.75em;margin-bottom:3px;">First Click Bias</div>`;
        spatialHtml += _zbBadge('Corner', fc.corner) + _zbBadge('Edge', fc.edge) + _zbBadge('Center', fc.center);
        spatialHtml += `</div>`;
      }

      spatialHtml += `<div style="margin-top:4px;font-size:.82em;">`;
      const mColor = sp.adjMineBias > 0.15 ? 'var(--accent)' : sp.adjMineBias < 0.03 ? 'var(--green)' : 'var(--text2)';
      const sColor = sp.adjSafeBias > 0.5 ? 'var(--cyan)' : 'var(--text2)';
      spatialHtml += `<span style="color:var(--text2);">Adj. Mines:</span> <b style="color:${mColor};">${(sp.adjMineBias * 100).toFixed(0)}%</b> &nbsp; `;
      spatialHtml += `<span style="color:var(--text2);">Adj. Safe:</span> <b style="color:${sColor};">${(sp.adjSafeBias * 100).toFixed(0)}%</b>`;
      spatialHtml += `</div>`;

      if (sp.heatmap) {
        const maxVal = Math.max(...sp.heatmap.flat(), 0.001);
        let hmHtml = `<div style="margin-top:6px;"><div style="color:var(--text2);font-size:.75em;margin-bottom:3px;">Click Heatmap</div>`;
        hmHtml += `<div style="display:inline-grid;grid-template-columns:repeat(${sp.heatmapSize},20px);gap:1px;">`;
        for (const row of sp.heatmap) {
          for (const v of row) {
            const intensity = v / maxVal;
            const r = Math.round(50 + intensity * 205);
            const g = Math.round(50 + (1 - intensity) * 100);
            const b = 50;
            const a = 0.3 + intensity * 0.7;
            hmHtml += `<div style="width:20px;height:20px;border-radius:2px;background:rgba(${r},${g},${b},${a});" title="${(v * 100).toFixed(1)}%"></div>`;
          }
        }
        hmHtml += `</div></div>`;
        spatialHtml += hmHtml;
      }

      if (sp.traits.length > 0) {
        spatialHtml += `<div style="margin-top:4px;font-size:.8em;color:var(--purple);">${sp.traits.join(' \u00b7 ')}</div>`;
      }
    }

    profileEl.innerHTML = `
      <div class="opt-card" style="padding:10px 14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:700;color:var(--purple);font-size:1.05em;">${r.profile}</span>
          <span style="color:var(--green);font-weight:600;">${pct}% match</span>
        </div>
        <div style="font-size:.78em;color:var(--text2);margin-bottom:6px;">${r.totalDecisions} decisions from ${mhState.playGames} games</div>
        <details style="font-size:.82em;" open>
          <summary style="cursor:pointer;color:var(--blue);margin-bottom:4px;">Click Tendencies</summary>
          ${spatialHtml || '<div style="color:var(--text2);font-size:.82em;">Not enough reveal data yet</div>'}
        </details>
        <details style="font-size:.82em;">
          <summary style="cursor:pointer;color:var(--blue);margin-bottom:4px;">Inferred Knobs</summary>
          <table style="font-size:.85em;"><tbody>${knobRows}</tbody></table>
        </details>
      </div>`;
  }

  if (mhState.inferResult && mhState.inferResult.params) _renderProfile();

  _newGame();
}
