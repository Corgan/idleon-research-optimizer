// Active combat simulator module worker.
// In:  { type: 'run', id, rawSave, charIdx, mapIdx, seconds, seed,
//        snapshotEveryMs = 100, maxSnapshots = 3000, snapshotUntilMs = Infinity, snapshotBatch = 50,
//        progressEveryMs = 250, player = 'auto' | 'idle' | 'scripted', playerOpts,
//        killEveryMs (scripted), timelineEveryMs = 10000, eventLogMax = 0, eventLogSkip = [names],
//        inputOverrides, toggles (combat-sim-toggles state; resolved per map, inputOverrides win),
//        termOverrides ({ termKey: { mode: 'off'|'set'|'scale', value } } component terms), buffs, lite, expBreakdown,
//        telemetry (detailed runs default true; lite always disables bounded diagnostics),
//        inputStatus (return lightweight partial/unavailable input notes, including in lite batches),
//        encodeReplay (post binary delta-encoded 'replay' batches instead of 'snapshots'; uncapped),
//        replayKeyframeEvery = 300,
//        stopOn ([{ event, match?, count?, label? }]; see combat-sim-core) }
//      { type: 'terms', id, rawSave?, charIdx, mapIdx, termOverrides } -> { type: 'terms', id, terms }
//      { type: 'fingerprint', id, ...same fields as run } -> { type: 'fingerprint', id, hash } (sim inputs only, no stepping)
//      { type: 'breakdowns', id, ...same loadout fields } -> { type: 'breakdowns', id, breakdowns }
//      initializes without stepping; canonical active/AFK trees, scalar provenance and per-def respawn.
//      run/fingerprint accept setup (patches applied first; its toggles/termOverrides
//      are used unless the message supplies explicit maps, including {} to disable)
//      { type: 'load', rawSave }  -> caches the save so later runs may omit rawSave (batch/all-maps runs)
//      { type: 'cancel', id }   -> stops after the current chunk and posts 'done' with cancelled: true
// Out: { type: 'progress', id, t, seconds, pct }
//      { type: 'snapshots', id, frames: [snapshot...] }   (batched, capped)
//      { type: 'replay', id, keysFrom, keys, buf, lens }  (encodeReplay: packed binary frames + new dictionary entries; feed to createReplayStore().append)
//      { type: 'done', id, summary, player, events, eventLog, timeline, inputs, timeMs, cancelled,
//        unmodelled, snapshotsSent, snapshotsDropped, replayBytes, replayOom, expStart }   (lite: inputs/eventLog/timeline omitted)
//      { type: 'error', id, message, unsupported?, timeMs? }
// The run yields every CHUNK_STEPS steps so cancel messages are processed; worker.terminate() also works.

import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';
import { createCombatSim, scriptedPlayer } from '../stats/systems/common/combat-sim-core.js';
import { defaultPlayerNode } from '../stats/systems/common/combat-sim-world.js';
import { autoPlayer } from '../stats/systems/common/combat-sim-player.js';
import { resolveToggleOverrides } from '../stats/systems/common/combat-sim-toggles.js';
import { withCombatTerms, collectCombatTerms } from '../stats/systems/common/combat-sim-terms.js';
import { createReplayEncoder, packReplayFrames } from '../stats/systems/common/combat-sim-replay.js';
import { applyCombatSetup } from '../stats/systems/common/combat-sim-setup.js';
import { stableHash } from '../stats/systems/common/combat-sim-setup-search.js';
import { captureCombatExpStart } from '../stats/systems/common/combat-sim-exp.js';
import { buildCombatInputs } from '../stats/systems/common/combat-sim-inputs.js';
import { buildCombatStatBreakdowns } from '../stats/systems/common/combat-sim-breakdowns.js';
import { createCombatAfkStatContext } from '../stats/systems/common/combat-afk.js';
import { getDef } from '../stats/systems/common/combat-sim-world.js';

const CHUNK_STEPS = 4000;
const cancelled = new Set();
let cachedRaw = null;

// Stand-in player target: a live crystal/giant/temporary mob first, otherwise the first live monster.
function standInPick(sim) {
  let first = null;
  for (const m of sim.monsters) {
    if (m.alive !== 1 || !(m.hp > 0) || m.recycled || m.willDie !== 0) continue;
    if (m.temp === 1) return m;
    if (!first) first = m;
  }
  return first;
}

function makePlayer(msg) {
  if (msg.player === 'idle') return undefined;
  if (msg.player === 'scripted') {
    return scriptedPlayer(defaultPlayerNode(Number(msg.mapIdx), msg.inputOverrides?.holeCavern ?? saveData.holesData?.[0]?.[Number(msg.charIdx) || 0]), { killEveryMs: Math.max(10, Number(msg.killEveryMs) || 1500), pick: standInPick });
  }
  return autoPlayer(msg.playerOpts || {});
}

function cloneable(obj) {
  try { return structuredClone(obj); } catch (_) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (__) { return null; }
  }
}

// Load the (optionally setup-patched) save and build the sim without stepping it.
function prepare(msg) {
  let raw = msg.rawSave || cachedRaw;
  if (!raw) throw new Error('No save loaded in worker');
  if (msg.setup && Array.isArray(msg.setup.patches) && msg.setup.patches.length) raw = applyCombatSetup(raw, msg.setup);
  loadSaveData(raw);
  const opts = { rawSave: raw, expBreakdown: !!msg.expBreakdown, telemetry: !msg.lite && msg.telemetry !== false };
  const p = makePlayer(msg);
  if (p) opts.player = p;
  const ci = Number(msg.charIdx) || 0;
  const toggles = msg.toggles ?? msg.setup?.toggles;
  const terms = msg.termOverrides ?? msg.setup?.termOverrides ?? null;
  const ov = toggles
    ? withCombatTerms(terms, () => resolveToggleOverrides({ saveData, charIdx: ci, mapIdx: Number(msg.mapIdx), rawSave: raw, toggles, baseOverrides: msg.inputOverrides }))
    : msg.inputOverrides;
  if (ov) opts.inputOverrides = ov;
  if (msg.buffs) opts.buffs = msg.buffs;
  if (Array.isArray(msg.stopOn) && msg.stopOn.length) opts.stopOn = msg.stopOn;
  if (msg.type === 'breakdowns') opts.inputs = withCombatTerms(terms, () =>
    buildCombatInputs(saveData, ci, Number(msg.mapIdx), { rawSave: raw, overrides: ov, statBreakdowns: true }));
  const sim = withCombatTerms(terms, () => createCombatSim({ saveData, charIdx: ci, mapIdx: Number(msg.mapIdx), seed: Number(msg.seed) || 1, options: opts }));
  return { sim, terms, raw };
}

function breakdowns(msg) {
  const { sim, terms, raw } = prepare(msg);
  if (sim.unsupported) throw new Error(sim.unsupported);
  const afk = withCombatTerms(terms, () => {
    const r = createCombatAfkStatContext(saveData, sim.charIdx, sim.mapIdx, {
      rawSave: raw, toggles: msg.toggles ?? msg.setup?.toggles,
      holeCavern: msg.inputOverrides?.holeCavern,
    });
    return { rows: buildCombatStatBreakdowns(r.ctx, {}, { afk: true }), warnings: r.warnings,
      reason: !r.target.applicable ? r.target.reason : '' };
  });
  const values = sim.inputs.values;
  for (const row of sim.inputs.breakdowns) {
    const value = values[row.input];
    if (row.node && Number.isFinite(value) && value !== row.node.val) row.node = {
      name: row.name, val: value, fmt: row.node.fmt,
      note: 'Player initialization replaces the starting input (for example, an active form). The normal formula is not added.',
      children: [{ ...row.node, name: 'Input before player initialization' }],
    };
  }
  const respawn = [...new Set(sim.monsters.map(m => m.type))].map(type => {
    const def = getDef(sim, type), pct = values.respawnBonusPct?.[type] || 0;
    return { type, seconds: Number(def.RespawnTime), bonusPct: pct,
      breakdown: sim.inputs.entries.respawnBonusPct?.breakdowns?.[type] || null,
      note: type === 'caveC' ? 'Uses caveD base and Cove divisor (native assignment quirk).'
        : type === 'caveD' ? 'Native caveD definition stays unscaled.' : 'Per-definition respawn list, not the current map world.' };
  });
  const inputs = Object.fromEntries(Object.entries(sim.inputs.entries).filter(([key, e]) =>
    e.value == null || typeof e.value !== 'object' || ['formStats', 'respawnBonusPct', 'formDropCoef'].includes(key))
    .map(([key, e]) => {
      const { breakdowns, ...entry } = e;
      if (typeof values[key] === 'number' && values[key] !== e.value) {
        entry.value = values[key]; entry.initializedReplacement = true;
        entry.note = 'Player initialization replaced ' + e.value + '. ' + (entry.note || '');
      }
      return [key, entry];
    }));
  self.postMessage({ type: 'breakdowns', id: msg.id, breakdowns: {
    active: sim.inputs.breakdowns, afk, inputs, respawn,
    player: sim.player ? { damageMax: values.damageMax, damageMin: values.damageMin, mastery: values.damageMastery,
      accuracy: values.accuracy, hpMax: sim.player.hpMax, mpMax: sim.player.mpMax,
      defence: values.playerDefence, speed: values.playerSpeed, attackSpeedPct: values.attackSpeedPct } : null,
    forms: { wraith: sim.state.wraith, tempest: sim.state.tempest, arcanist: sim.state.arcanist },
    mapIdx: sim.mapIdx, charIdx: sim.charIdx, holeCavern: values.holeCavern,
    savedBuffs: !!msg.inputOverrides?.useSavedBuffs,
  } });
}

function run(msg) {
  const id = msg.id;
  const { sim, terms } = prepare(msg);
  const inputIssues = msg.inputStatus ? Object.entries(sim.inputs?.entries || {})
    .filter(([, entry]) => entry.partial || entry.unavailable)
    .map(([key, entry]) => ({ key, status: entry.unavailable ? 'unavailable' : 'partial', source: entry.source, note: entry.note })) : undefined;
  const expStart = msg.expBreakdown ? captureCombatExpStart(saveData, sim.charIdx, sim.inputs) : null;
  if (sim.unsupported) {
    self.postMessage({ type: 'error', id, message: sim.unsupported, unsupported: true });
    return;
  }
  const seconds = Math.max(0, Number(msg.seconds) || 60);
  const endMs = seconds * 1000;
  const snapEvery = Math.max(10, Number(msg.snapshotEveryMs) || 100);
  const maxSnaps = Math.max(0, Number(msg.maxSnapshots ?? 3000));
  const snapUntil = Number(msg.snapshotUntilMs ?? Infinity);
  const batchSize = Math.max(1, Number(msg.snapshotBatch) || 50);
  const progressEvery = Math.max(10, Number(msg.progressEveryMs) || 250);
  const timelineEvery = Math.max(100, Number(msg.timelineEveryMs) || 10000);
  const logMax = Math.max(0, Number(msg.eventLogMax) || 0);
  const logSkip = new Set(msg.eventLogSkip || []);

  const events = {};
  const eventLog = [];
  const timeline = [];
  const player = { attacks: 0, casts: {}, deaths: 0, respawns: 0, nodeChanges: 0, damageDealt: 0, misses: 0, crits: 0, daggerangCatches: 0 };
  sim.on('*', (name, pl) => {
    events[name] = (events[name] || 0) + 1;
    if (name === 'playerAttack') player.attacks++;
    else if (name === 'cast') player.casts[pl.id] = (player.casts[pl.id] || 0) + 1;
    else if (name === 'playerDied') player.deaths++;
    else if (name === 'playerRespawn') player.respawns++;
    else if (name === 'nodeChange') player.nodeChanges++;
    else if (name === 'daggerangCatch') player.daggerangCatches++;
    else if (name === 'playerDmg') { player.damageDealt += Number(pl.dmg) || 0; if (pl.missed) player.misses++; if (pl.crit !== 1) player.crits++; }
    if (eventLog.length < logMax && !logSkip.has(name)) {
      const c = cloneable(pl);
      eventLog.push({ name, p: c == null ? { t: sim.timeMs } : c });
    }
  });

  let batch = [];
  let sent = 0, dropped = 0;
  let nextSnap = 0, nextProgress = progressEvery, nextTimeline = timelineEvery;
  const lite = !!msg.lite;
  const enc = msg.encodeReplay ? createReplayEncoder({ keyframeEvery: Number(msg.replayKeyframeEvery) || 300 }) : null;
  let replayOom = false;
  const record = () => {
    if (replayOom) { dropped++; return; }
    try { batch.push(enc ? enc.push(sim.snapshot()) : sim.snapshot()); }
    catch (e) { if (!(e instanceof RangeError)) throw e; replayOom = true; dropped++; return; }
    sent++;
    if (batch.length >= batchSize) flush();
  };
  const flush = () => {
    if (!batch.length) return;
    if (enc) {
      const k = enc.newKeys(), p = packReplayFrames(batch);
      self.postMessage({ type: 'replay', id, keysFrom: k.keysFrom, keys: k.keys, buf: p.buf, lens: p.lens }, [p.buf.buffer, p.lens.buffer]);
    } else self.postMessage({ type: 'snapshots', id, frames: batch });
    batch = [];
  };
  const ledgerPoint = () => {
    const L = sim.rewardsState && sim.rewardsState.ledger;
    timeline.push({ t: sim.timeMs, kills: L ? L.kills : 0, exp: L ? L.expTotal : 0, coins: L ? L.coins : 0 });
  };
  const finish = (wasCancelled) => {
    flush();
    self.postMessage({
      type: 'done', id, summary: cloneable(sim.summary()), player, events, eventLog: lite ? [] : eventLog, timeline: lite ? [] : timeline,
      inputs: lite ? {} : (cloneable(sim.inputs && sim.inputs.entries) || {}), timeMs: sim.timeMs, cancelled: wasCancelled, ended: sim.ended ? cloneable(sim.ended) : null,
      expStart,
      ...(inputIssues ? { inputIssues } : {}),
      unmodelled: Object.assign({}, sim.state.unmodelled || {}), snapshotsSent: sent, snapshotsDropped: dropped, replayBytes: enc ? enc.bytes : 0, replayOom,
    });
  };

  const chunk = () => {
    try {
      withCombatTerms(terms, () => {
        let n = 0;
        while (!sim.ended && sim.timeMs < endMs && n++ < CHUNK_STEPS) {
          sim.step();
          if (sim.timeMs >= nextSnap) {
            nextSnap += snapEvery;
            if (sent < maxSnaps && sim.timeMs <= snapUntil) record();
            else dropped++;
          }
          if (sim.timeMs >= nextTimeline) { nextTimeline += timelineEvery; ledgerPoint(); }
          if (sim.timeMs >= nextProgress) {
            nextProgress += progressEvery;
            self.postMessage({ type: 'progress', id, t: sim.timeMs / 1000, seconds, pct: endMs ? sim.timeMs / endMs : 1 });
          }
        }
      });
    } catch (error) {
      flush();
      self.postMessage({ type: 'error', id, timeMs: sim.timeMs, message: error && error.message ? error.message : String(error), stack: error && error.stack });
      return;
    }
    if (cancelled.has(id)) { cancelled.delete(id); finish(true); return; }
    if (sim.ended || sim.timeMs >= endMs) { if (sim.ended && sim.timeMs > nextSnap - snapEvery && sent < maxSnaps) record(); if (sim.ended) ledgerPoint(); finish(false); return; }
    setTimeout(chunk, 0);
  };
  // Snapshot at t=0 so replays start before the first step.
  if (maxSnaps > 0) { withCombatTerms(terms, record); nextSnap = snapEvery; }
  chunk();
}

self.onmessage = function(event) {
  const msg = event.data || {};
  if (msg.type === 'cancel') { cancelled.add(msg.id); return; }
  if (msg.type === 'load') { cachedRaw = msg.rawSave || null; return; }
  if (msg.type === 'breakdowns') {
    try { breakdowns(msg); }
    catch (error) {
      self.postMessage({ type: 'error', id: msg.id, message: error.message, stack: error.stack });
    }
    return;
  }
  if (msg.type === 'terms') {
    try {
      const raw = msg.rawSave || cachedRaw;
      if (!raw) throw new Error('No save loaded in worker');
      loadSaveData(raw);
      const r = collectCombatTerms(saveData, Number(msg.charIdx) || 0, Number(msg.mapIdx), { rawSave: raw, overrides: msg.termOverrides });
      self.postMessage({ type: 'terms', id: msg.id, terms: r.terms });
    } catch (error) {
      self.postMessage({ type: 'error', id: msg.id, message: error && error.message ? error.message : String(error), stack: error && error.stack });
    }
    return;
  }
  if (msg.type === 'fingerprint') {
    try {
      const { sim } = prepare(msg);
      if (sim.unsupported) self.postMessage({ type: 'error', id: msg.id, message: sim.unsupported, unsupported: true });
      else self.postMessage({ type: 'fingerprint', id: msg.id, hash: stableHash(sim.inputs && sim.inputs.values) });
    } catch (error) {
      self.postMessage({ type: 'error', id: msg.id, message: error && error.message ? error.message : String(error), stack: error && error.stack });
    }
    return;
  }
  if (msg.type !== 'run') return;
  try { run(msg); }
  catch (error) {
    self.postMessage({ type: 'error', id: msg.id, message: error && error.message ? error.message : String(error), stack: error && error.stack });
  }
};
