// ===== COMBAT DIAGNOSTICS (common) =====
import { ATTACKS } from '../../data/game/attacks.js';
import { TalentIconNames } from '../../data/game/customlists.js';

const N = x => Number(x) || 0;
export const COMBAT_TELEMETRY_LIMITS = Object.freeze({ points: 1024, bookmarks: 256, gridCells: 4096, sampleMs: 100, histogramBins: 40, spatialWindows: 128, spatialEntries: 32768, decisions: 256 });
const ACTIVITIES = ['dead', 'placedWalk', 'casting', 'attacking', 'travelling', 'waiting', 'idle'];
const SPATIAL_KEYS = ['occupancy', 'kills', 'damage', 'monsters', 'playerKills', 'playerDamage', 'idle'];
function _sumMaps(a, b) {
  const out = { ...a };
  for (const k in b) out[k] = N(out[k]) + b[k];
  return out;
}
function _mergeSpatial(a, b) {
  const cells = {};
  for (const part of [a, b]) for (const k in part.cells) {
    const dst = cells[k] || (cells[k] = Array(7).fill(0));
    part.cells[k].forEach((v, i) => { dst[i] += v; });
  }
  return { from: a.from, t: b.t, sampledMs: a.sampledMs + b.sampledMs, cells };
}

/** Select whole retained buckets; never interpolate unknown event positions. */
export function combatSpatialWindow(data, from = 0, to = data.durationMs) {
  if (!(Number.isFinite(from) && Number.isFinite(to) && to > from && from >= 0)) throw new Error('Select a valid increasing time range.');
  if (from === 0 && to >= data.durationMs) return data;
  if (!data.spatialWindows) return null;
  const windows = data.spatialWindows.filter(w => w.t > from && w.from < to);
  const grid = { ...data.grid };
  for (const key of SPATIAL_KEYS) grid[key] = Array(data.grid.occupancy.length).fill(0);
  for (const w of windows) for (const cell in w.cells) w.cells[cell].forEach((v, i) => { grid[SPATIAL_KEYS[i]][cell] += v; });
  const start = windows[0]?.from ?? from, end = windows.at(-1)?.t ?? to;
  return { ...data, grid, sampledMs: windows.reduce((n, w) => n + w.sampledMs, 0),
    range: { from: start, to: end, requestedFrom: from, requestedTo: to },
    routes: data.routes.filter(p => p[0] >= start && p[0] <= end) };
}

function _hist() { return { count: 0, sum: 0, min: null, max: null, bins: Array(40).fill(0) }; }
function _add(h, ms) {
  ms = Math.max(0, N(ms));
  h.count++; h.sum += ms; h.min = h.min == null ? ms : Math.min(h.min, ms); h.max = Math.max(h.max ?? 0, ms);
  h.bins[Math.min(39, Math.max(0, Math.ceil(2 * Math.log2(Math.max(10, ms) / 10))))]++;
}
export function combatHistogramQuantile(h, q) {
  if (!h?.count) return null;
  let n = 0;
  for (let i = 0; i < h.bins.length; i++) {
    n += h.bins[i];
    if (n >= Math.max(1, Math.ceil(h.count * q))) return { low: i ? 10 * 2 ** ((i - 1) / 2) : 0, high: i === 39 ? h.max : Math.min(h.max, 10 * 2 ** (i / 2)) };
  }
  return null;
}
function _source() { return { raw: 0, effective: 0, overkill: 0, attempts: 0, hits: 0, misses: 0, crits: 0, lastHits: 0 }; }
function _def(id) { return ATTACKS[TalentIconNames[id]]; }
function _eligible(sim, m) {
  return !m.recycled && m.alive === 1 && m.hp > 0 && !m.pet && m.monType === 'Monster'
    && !(sim.mapIdx === 216 && m.node === 3);
}

export function combatActivity(sim, liveTargets) {
  const p = sim.player, st = sim.state;
  if (p.dead || p.animation === 'Da') return 'dead';
  if (st.manualCasts?.some(e => e.walk)) return 'placedWalk';
  if (st.attackQueue > 0) return 'casting';
  if (p.pmm?.[0] === 2) return 'attacking';
  if (p.vx || p.vy || [0, 3, 4, 5, 6].includes(p.pmm?.[0])) return 'travelling';
  if (liveTargets == null) liveTargets = sim.monsters.some(m => _eligible(sim, m)) ? 1 : 0;
  if (liveTargets === 0) return 'waiting';
  return 'idle';
}

/** Opt-in, bounded observation. No timers, gameplay writes, or RNG reads. */
export function createCombatTelemetry(sim) {
  const limits = COMBAT_TELEMETRY_LIMITS, lives = new WeakMap();
  const actorCasts = new WeakMap();
  const dropTypes = new Set();
  let context = null;
  const recentHits = [];
  const nodes = sim.scene.nodes;
  const minX = Math.min(0, ...nodes.map(n => N(n.x)));
  const minY = Math.min(0, ...nodes.map(n => N(n.y) - 200));
  const maxX = Math.max(960, ...nodes.map(n => N(n.length) + 60));
  const maxY = Math.max(540, ...nodes.filter((_, i) => !(sim.mapIdx === 216 && i === 3)).map(n => N(n.y) + 80));
  let cellSize = Math.max(32, Math.ceil(Math.sqrt((maxX - minX) * (maxY - minY) / 3900)));
  while (Math.ceil((maxX - minX) / cellSize) * Math.ceil((maxY - minY) / cellSize) > limits.gridCells) cellSize++;
  const cols = Math.ceil((maxX - minX) / cellSize), rows = Math.ceil((maxY - minY) / cellSize);
  const grid = { x: minX, y: minY, cellSize, cols, rows };
  for (const key of SPATIAL_KEYS) grid[key] = Array(cols * rows).fill(0);
  const data = {
    version: 2, durationMs: 0, sampleMs: limits.sampleMs, sampledMs: 0,
    sources: {}, monsters: {}, skills: {}, activity: Object.fromEntries(ACTIVITIES.map(k => [k, 0])),
    platforms: {}, transitions: {}, buffs: {}, statuses: {}, mechanics: {}, grid,
    sustain: { incoming: {}, food: {}, healing: 0, overhealing: 0, manaSpent: 0, minHp: sim.player.hp, minMp: sim.player.mp, hpRise: 0, mpRise: 0, lowHpMs: 0, lowMpMs: 0 },
    loot: { pickupDelay: _hist(), pickups: 0, expired: 0, expiredQty: {}, fullEvents: 0, groundPeak: 0 },
    points: [], bookmarks: [], bookmarksOmitted: 0, routes: [], routesOmitted: 0,
    spatialWindows: [], decisions: [], decisionsOmitted: 0, decisionCounts: {},
    rewards: { itemQty: 0, crystals: 0, chipRespawns: 0, exp: { crystal: 0, other: 0 }, longestKillGap: 0, longestItemGap: 0 },
    notes: [
      'Activity is classified from each 10 ms step; occupancy, readiness, buff/status uptime and monster density are sampled every 100 ms.',
      'Ready time is not automatically wasted time. Cooldown-ready states are partitioned by observed blockers, not hypothetical cast eligibility.',
      'Source damage per cast includes same-skill procs. Cast-instance outcomes follow effects, actors and scheduled callbacks; no-damage casts include utility skills and effects still pending at run end.',
      'Kill attribution is last-hit credit, not sole contribution. Spawn-to-death excludes unobserved time before map entry; unfinished lives are not counted as kills.',
    ],
  };
  let lastSample = 0, lastPoint = 0, pointEvery = 1000, nextPoint = 1000, prevPos = null;
  let lastKill = 0, lastItem = 0, routeEvery = 100, nextRoute = 100;
  let previousHp = sim.player.hp, previousMp = sim.player.mp;
  let spatialBin = { from: 0, t: 0, sampledMs: 0, cells: {} }, spatialEvery = 1000, nextSpatial = 1000;
  let decisionSignature = null, latestDecision = null;
  function newBin() { const p = sim.player; return { damage: 0, effective: 0, kills: 0, attacks: 0, deaths: 0, casts: {}, cooldown: {}, ready: {}, availableMs: 0, targetMs: 0, hpMin: p.hp, hpMax: p.hp, mpMin: p.mp, mpMax: p.mp, activity: {} }; }
  let bin = newBin();
  const skillIds = [...new Set((sim.inputs.values.attackLoadout || []).flat().filter(x => x != null && x !== 'Null').map(Number))];
  function newSkill() { return { casts: 0, damagingCasts: 0, attributedHits: 0, uniqueTargets: 0, mp: 0, intervals: _hist(), selectionDelay: _hist(), lastCast: null, selectedAt: null, readiness: {} }; }
  for (const id of skillIds) if (_def(id)) data.skills[id] = newSkill();
  function source(key) { return data.sources[key || 'unattributed'] || (data.sources[key || 'unattributed'] = _source()); }
  function monster(m) { return data.monsters[m.type] || (data.monsters[m.type] = { kills: 0, spawnToDeath: _hist(), hitToDeath: _hist() }); }
  function life(m) {
    let l = lives.get(m);
    if (!l) { l = { born: sim.timeMs, firstHit: null, lastSource: null, killed: false }; lives.set(m, l); }
    return l;
  }
  function mark(kind, label, extra = {}) {
    const same = data.bookmarks.map((b, i) => b.kind === kind ? i : -1).filter(i => i >= 0);
    if (same.length >= 24) { data.bookmarks.splice(same[1], 1); data.bookmarksOmitted++; }
    if (data.bookmarks.length >= limits.bookmarks) {
      const counts = {};
      for (const b of data.bookmarks) counts[b.kind] = N(counts[b.kind]) + 1;
      const crowded = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      const first = data.bookmarks.findIndex(b => b.kind === crowded);
      const remove = data.bookmarks.findIndex((b, i) => i > first && b.kind === crowded);
      data.bookmarks.splice(remove >= 0 ? remove : 0, 1); data.bookmarksOmitted++;
    }
    data.bookmarks.push({ t: sim.timeMs, kind, label, ...extra });
  }
  function spatial(key, x, y, amount) {
    const col = Math.floor((x - minX) / cellSize), row = Math.floor((y - minY) / cellSize);
    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      const index = row * cols + col;
      grid[key][index] += amount;
      const values = spatialBin.cells[index] || (spatialBin.cells[index] = Array(7).fill(0));
      values[SPATIAL_KEYS.indexOf(key)] += amount;
    }
  }
  function commitSpatial(t) {
    if (!(t > spatialBin.from)) return;
    data.spatialWindows.push({ ...spatialBin, t });
    spatialBin = { from: t, t, sampledMs: 0, cells: {} };
    while (data.spatialWindows.length >= limits.spatialWindows || data.spatialWindows.reduce((n, w) => n + Object.keys(w.cells).length, 0) > limits.spatialEntries - limits.gridCells) {
      const merged = [];
      for (let i = 0; i < data.spatialWindows.length; i += 2) merged.push(data.spatialWindows[i + 1] ? _mergeSpatial(data.spatialWindows[i], data.spatialWindows[i + 1]) : data.spatialWindows[i]);
      data.spatialWindows = merged; spatialEvery *= 2;
    }
    nextSpatial = t + spatialEvery;
  }
  function commit(t) {
    if (!(t > lastPoint)) return;
    const L = sim.rewardsState?.ledger || {}, p = sim.player;
    data.points.push({ from: lastPoint, t, ...bin, hp: p.hp, mp: p.mp, hpCap: p.hpMax, mpCap: p.mpMax,
      exp: N(L.expTotal), coins: N(L.coins), items: data.rewards.itemQty, totalKills: N(L.kills), orb: N(sim.state.gi?.[77]), ground: sim.items.length });
    lastPoint = t;
    bin = newBin();
    if (data.points.length >= limits.points) {
      const merged = [];
      for (let i = 0; i < data.points.length; i += 2) {
        const a = data.points[i], b = data.points[i + 1];
        if (!b) { merged.push(a); continue; }
        const activity = { ...a.activity };
        for (const k in b.activity) activity[k] = N(activity[k]) + b.activity[k];
        merged.push({ ...b, from: a.from, damage: a.damage + b.damage, effective: a.effective + b.effective, kills: a.kills + b.kills,
          attacks: a.attacks + b.attacks, deaths: a.deaths + b.deaths, casts: _sumMaps(a.casts, b.casts), cooldown: _sumMaps(a.cooldown, b.cooldown), ready: _sumMaps(a.ready, b.ready),
          availableMs: a.availableMs + b.availableMs, targetMs: a.targetMs + b.targetMs,
          hpMin: Math.min(a.hpMin, b.hpMin), hpMax: Math.max(a.hpMax, b.hpMax), mpMin: Math.min(a.mpMin, b.mpMin), mpMax: Math.max(a.mpMax, b.mpMax), activity });
      }
      data.points = merged; pointEvery *= 2;
    }
    nextPoint = t + pointEvery;
  }
  function sample(t) {
    const dt = t - lastSample;
    if (!(dt > 0)) return;
    lastSample = t; data.sampledMs += dt;
    spatialBin.sampledMs += dt;
    const p = sim.player, st = sim.state;
    spatial('occupancy', p.x + p.width / 2, p.y + p.height / 2, dt);
    if (['idle', 'waiting'].includes(combatActivity(sim))) spatial('idle', p.x + p.width / 2, p.y + p.height / 2, dt);
    const platform = data.platforms[p.node] || (data.platforms[p.node] = { ms: 0, distance: 0, kills: 0, damage: 0 });
    platform.ms += dt;
    if (prevPos && prevPos.node === p.node && !p.dead) platform.distance += Math.hypot(p.x - prevPos.x, p.y - prevPos.y);
    prevPos = { x: p.x, y: p.y, node: p.node };
    let live = 0;
    for (const m of sim.monsters) if (_eligible(sim, m)) {
      live++;
      life(m);
      spatial('monsters', m.x + m.width / 2, m.y + m.height / 2, dt);
      for (const s of m.statusList || []) if (s.dur > 0) data.statuses[s.name] = N(data.statuses[s.name]) + dt;
    }
    if (live) bin.availableMs += dt;
    if (p.target && _eligible(sim, p.target)) bin.targetMs += dt;
    const buffs = new Set((st.buffsActive || []).filter(b => b[1] > 0).map(b => Number(b[0])));
    for (const id of buffs) data.buffs[id] = N(data.buffs[id]) + dt;
    const active = new Set();
    for (const a of sim.actors) if (!a.recycled && a.kind === 'bullet' && ['WT9', 'WT13', 'WT16', 'WT18', 'WT19'].includes(a.anim)) active.add(a.anim === 'WT19' ? 'crystal' + a.crystal : a.anim);
    const fs = sim.inputs.values.formStats?.tempest;
    if (st.tempest === 1 && fs && Number(fs.currentEffect) === Number(st.wwWeakness) && st.wwWeakness >= 0) active.add('weakness');
    if (N(st.gi?.[77]) > 0) active.add('orbPositive');
    for (const key of active) data.mechanics[key] = N(data.mechanics[key]) + dt;
    for (const id of skillIds) {
      const sk = data.skills[id], def = _def(id); if (!sk) continue;
      const cd = N(st.attackCooldowns?.[id]);
      const key = cd > 0 ? 'cooldown' : p.dead ? 'dead' : st.attackQueue !== 0 ? 'castQueue'
        : p.mp < N(def.manaCost) ? 'mana' : Number(def.AFKactivity) === -2 ? 'manualOnly'
          : !p.autoMove || N(sim.inputs.values.ola25) !== 1 ? 'autoDisabled' : !sim.monsters.some(m => _eligible(sim, m)) ? 'noTarget' : 'ready';
      sk.readiness[key] = N(sk.readiness[key]) + dt;
      if (key === 'cooldown' || key === 'ready') {
        const dest = key === 'cooldown' ? bin.cooldown : bin.ready;
        dest[id] = N(dest[id]) + dt;
      }
    }
    data.loot.groundPeak = Math.max(data.loot.groundPeak, sim.items.filter(it => !it.recycled && it.collectedStatus < 1).length);
    if (t >= nextRoute) {
      data.routes.push([t, p.x + p.width / 2, p.y + p.height / 2]);
      if (data.routes.length >= 1024) { data.routes = data.routes.filter((_, i) => i % 2 === 0); routeEvery *= 2; data.routesOmitted++; }
      nextRoute = t + routeEvery;
    }
  }
  sim.on('*', (name, e) => {
    if (name === 'attackStart') bin.attacks++;
    if (name === 'playerDied') bin.deaths++;
    if (name === 'playerDmg') {
      const s = source(e.source); s.attempts++; if (e.missed) s.misses++; else s.hits++;
      if (e.crit != null && e.crit !== 1) s.crits++;
    } else if (name === 'cast') {
      const sk = data.skills[e.id] || (data.skills[e.id] = newSkill());
      if (sk.lastCast != null) _add(sk.intervals, e.t - sk.lastCast);
      if (sk.selectedAt != null) _add(sk.selectionDelay, e.t - sk.selectedAt);
      sk.casts++; sk.mp += N(e.mp); sk.lastCast = e.t; sk.selectedAt = null;
      bin.casts[e.id] = N(bin.casts[e.id]) + 1;
      data.sustain.manaSpent += N(e.mp);
      mark('cast', 'Cast', { id: e.id });
    } else if (name === 'autoSelect' || name === 'manualPress') {
      const sk = data.skills[e.id]; if (sk && sk.selectedAt == null) sk.selectedAt = e.t;
    } else if (name === 'monsterKilled') {
      const m = sim.monsters.find(m => m.uid === e.uid);
      if (!m || m.pet || !(m.hpTot > 0)) return;
      const l = life(m); if (l.killed) return; l.killed = true;
      const r = monster(m); r.kills++; _add(r.spawnToDeath, e.t - l.born);
      data.rewards.longestKillGap = Math.max(data.rewards.longestKillGap, e.t - lastKill); lastKill = e.t;
      if (l.firstHit != null) _add(r.hitToDeath, e.t - l.firstHit);
      source(l.lastSource).lastHits++; bin.kills++;
      spatial('kills', m.x + m.width / 2, m.y + m.height / 2, 1);
      spatial('playerKills', sim.player.x + sim.player.width / 2, sim.player.y + sim.player.height / 2, 1);
      const pl = data.platforms[m.node] || (data.platforms[m.node] = { ms: 0, distance: 0, kills: 0, damage: 0 }); pl.kills++;
      if (e.t - l.born > 30000) mark('longKill', 'Long-lived monster defeated', { monster: m.type });
    } else if (name === 'exp') {
      data.rewards.exp[String(e.type).startsWith('Crystal') ? 'crystal' : 'other'] += N(e.amount);
    } else if (name === 'crystalSpawn') { data.rewards.crystals++; mark(name, 'Crystal spawned', { monster: e.type }); }
    else if (name === 'crystalRespawn') { data.rewards.chipRespawns++; mark(name, 'Chocolatey Chip respawn', { monster: e.type }); }
    else if (name === 'drop' && e.name !== 'COIN') {
      data.rewards.itemQty += N(e.qty); data.rewards.longestItemGap = Math.max(data.rewards.longestItemGap, e.t - lastItem); lastItem = e.t;
      if (!dropTypes.has(e.name)) { dropTypes.add(e.name); mark('firstDrop', 'First drop of item', { item: e.name }); }
    } else if (name === 'playerHit') {
      data.sustain.incoming[e.type] = N(data.sustain.incoming[e.type]) + N(e.hpLoss);
    } else if (name === 'foodEaten') {
      const effective = Math.min(N(e.heal), Math.max(0, sim.player.hpMax - (N(e.hp) - N(e.heal))));
      data.sustain.healing += effective; data.sustain.overhealing += Math.max(0, N(e.heal) - effective);
      const f = data.sustain.food[e.item] || (data.sustain.food[e.item] = { consumed: 0, refilled: 0, healing: 0 }); f.healing += effective;
    } else if (name === 'foodConsumed' || name === 'foodRefilled') {
      const f = data.sustain.food[e.item] || (data.sustain.food[e.item] = { consumed: 0, refilled: 0, healing: 0 });
      f[name === 'foodConsumed' ? 'consumed' : 'refilled'] += name === 'foodConsumed' ? 1 : N(e.qty);
    } else if (name === 'itemExpired') {
      data.loot.expired++; data.loot.expiredQty[e.name] = N(data.loot.expiredQty[e.name]) + N(e.qty);
    } else if (name === 'inventoryFull') {
      if (!data.loot.fullEvents) mark(name, 'Inventory first full');
      data.loot.fullEvents++;
    } else if (name === 'nodeChange') {
      const key = e.from + ':' + e.to; data.transitions[key] = N(data.transitions[key]) + 1;
    } else if (['playerDied', 'playerRespawn', 'foodDepleted', 'spawnSkillExpired', 'manualWalkAbort', 'orbReset', 'denStart', 'denEnd'].includes(name)) {
      mark(name, ({ playerDied: 'Player died', playerRespawn: 'Player respawned', foodDepleted: 'Food depleted', spawnSkillExpired: 'Spawn skill expired', manualWalkAbort: 'Placed walk aborted', orbReset: 'Orb reset', denStart: 'Den attempt started', denEnd: 'Den attempt ended' })[name], { item: e.item, id: e.skill });
    }
  });
  for (const name of ['spawn', 'tempSpawn']) sim.on(name, e => {
    const m = sim.monsters.find(m => m.uid === e.uid);
    if (m && !m.pet && m.alive === 1 && m.hp > 0) lives.set(m, { born: sim.timeMs, firstHit: null, lastSource: null, killed: false });
  });
  return {
    activity() { return combatActivity(sim); },
    decision(record) {
      const signature = JSON.stringify(record);
      data.decisionCounts[record.reason] = N(data.decisionCounts[record.reason]) + 1;
      if (signature === decisionSignature) return;
      decisionSignature = signature;
      latestDecision = { ...record, t: sim.timeMs };
      if (data.decisions.length >= limits.decisions) { data.decisions.splice(1, 1); data.decisionsOmitted++; }
      data.decisions.push(latestDecision);
    },
    latestDecision() {
      if (!latestDecision) return null;
      const { candidates, ...compact } = latestDecision;
      return structuredClone(compact);
    },
    recentHits() { return recentHits.filter(h => sim.timeMs - h.t <= 100).map(h => ({ ...h })); },
    beginCast(id) {
      const previous = context;
      context = { id, targets: new WeakSet(), targetCount: 0, damaged: false };
      if (!data.skills[id]) data.skills[id] = newSkill();
      return previous;
    },
    endCast(previous) { context = previous; },
    actor(actor) { if (context) actorCasts.set(actor, context); },
    wrap(fn, actor) {
      const captured = context || (actor && actorCasts.get(actor));
      if (!captured) return fn;
      return function (...args) {
        const previous = context; context = captured;
        try { return fn.apply(this, args); } finally { context = previous; }
      };
    },
    frame(actor, fn) {
      const previous = context; context = actorCasts.get(actor) || null;
      try { return fn.call(actor, sim, actor); } finally { context = previous; }
    },
    spawn(m) { if (!m.pet && m.alive === 1 && m.hp > 0) lives.set(m, { born: sim.timeMs, firstHit: null, lastSource: null, killed: false }); },
    damage(m, amount, hpBefore, meta) {
      if (m.pet || !(amount > 0) || !Number.isFinite(amount)) return;
      const s = source(meta.source), effective = Math.min(Math.max(0, hpBefore), amount), l = life(m);
      s.raw += amount; s.effective += effective; s.overkill += amount - effective;
      bin.damage += amount; bin.effective += effective;
      if (effective > 0) { if (l.firstHit == null) l.firstHit = sim.timeMs; l.lastSource = meta.source || 'unattributed'; }
      if (effective > 0 && context) {
        const sk = data.skills[context.id];
        sk.attributedHits++;
        if (!context.damaged) { context.damaged = true; sk.damagingCasts++; }
        if (!context.targets.has(l)) {
          context.targets.add(l); context.targetCount++; sk.uniqueTargets++;
        }
      }
      if (recentHits.length >= 16) recentHits.shift();
      recentHits.push({ t: sim.timeMs, x: m.x, y: m.y, w: m.width, h: m.height, source: meta.source || 'unattributed' });
      spatial('damage', m.x + m.width / 2, m.y + m.height / 2, effective);
      spatial('playerDamage', sim.player.x + sim.player.width / 2, sim.player.y + sim.player.height / 2, effective);
      const pl = data.platforms[m.node] || (data.platforms[m.node] = { ms: 0, distance: 0, kills: 0, damage: 0 }); pl.damage += effective;
    },
    pickup(item) { data.loot.pickups++; _add(data.loot.pickupDelay, sim.timeMs - item.createdAt); },
    step(dt) {
      const p = sim.player, key = combatActivity(sim);
      data.activity[key] += dt; bin.activity[key] = N(bin.activity[key]) + dt;
      bin.hpMin = Math.min(bin.hpMin, p.hp); bin.hpMax = Math.max(bin.hpMax, p.hp);
      bin.mpMin = Math.min(bin.mpMin, p.mp); bin.mpMax = Math.max(bin.mpMax, p.mp);
      data.sustain.minHp = Math.min(data.sustain.minHp, p.hp); data.sustain.minMp = Math.min(data.sustain.minMp, p.mp);
      data.sustain.hpRise += Math.max(0, p.hp - previousHp); data.sustain.mpRise += Math.max(0, p.mp - previousMp);
      previousHp = p.hp; previousMp = p.mp;
      if (p.hpMax > 0 && p.hp / p.hpMax < .25) data.sustain.lowHpMs += dt;
      if (p.mpMax > 0 && p.mp / p.mpMax < .25) data.sustain.lowMpMs += dt;
      if (sim.timeMs - lastSample >= limits.sampleMs) sample(sim.timeMs);
      if (sim.timeMs >= nextSpatial) commitSpatial(sim.timeMs);
      if (sim.timeMs >= nextPoint) commit(sim.timeMs);
      data.durationMs = sim.timeMs;
    },
    summary() {
      const out = structuredClone(data);
      if (sim.timeMs > spatialBin.from) out.spatialWindows.push({ ...structuredClone(spatialBin), t: sim.timeMs });
      out.durationMs = sim.timeMs;
      out.rewards.longestKillGap = Math.max(out.rewards.longestKillGap, sim.timeMs - lastKill);
      out.rewards.longestItemGap = Math.max(out.rewards.longestItemGap, sim.timeMs - lastItem);
      out.manualCasts = (sim.state.manualCasts || []).map(e => ({ id: e.id, blocked: { ...e.blocked } }));
      if (sim.timeMs > lastPoint) {
        const L = sim.rewardsState?.ledger || {}, p = sim.player;
        out.points.push({ from: lastPoint, t: sim.timeMs, ...structuredClone(bin), hp: p.hp, mp: p.mp, hpCap: p.hpMax, mpCap: p.mpMax,
          exp: N(L.expTotal), coins: N(L.coins), items: data.rewards.itemQty, totalKills: N(L.kills), orb: N(sim.state.gi?.[77]), ground: sim.items.length });
      }
      return out;
    },
  };
}
