// ===== KILLROY ENCOUNTERS (common) =====
import { MapName, MapAFKtarget, RANDOlist } from '../../data/game/customlists.js';

const ROOM_MAPS = [...new Set([68, 69, 70, 71, 72, 99].flatMap(i =>
  RANDOlist[i].map(name => MapName.indexOf(name))))].sort((a, b) => a - b);

export function killroyMapIds() { return ROOM_MAPS.slice(); }

export function killroySnapshot(sim) {
  const k = sim.state.killroy;
  return k ? {
    kills: k.kills, skullsDropped: k.skullsDropped, skullsPicked: k.skullsPicked,
    spawned: k.spawned, queued: k.queued, remaining: Math.max(0, k.remaining),
    duration: k.duration, finished: k.finished, finishedAt: k.finishedAt,
  } : null;
}

export function initKillroy(sim) {
  const v = sim.inputs.values;
  if (!v.killroy) return;
  if (!ROOM_MAPS.includes(sim.mapIdx)) throw new Error('This map is not a Killroy room.');
  const levels = v.killroyUpgrades;
  if (!Array.isArray(levels) || levels.length !== 7 ||
      levels.some(n => n == null || n === '' || !Number.isFinite(Number(n)) || Number(n) < 0) ||
      !Number.isFinite(v.killroyMeritoc)) {
    throw new Error('Killroy upgrades are missing or invalid in this save.');
  }
  const [time, talents, skulls, respawns, credits, pearls, talentDrops] = levels.map(Number);
  sim.state.nd46 = 1;
  sim.state.killroyRoom = 1;
  const k = sim.state.killroy = {
    kills: 0, skullsDropped: 0, skullsPicked: 0, spawned: 0, queued: 0,
    duration: 100 + time, remaining: 100 + time, finished: false, finishedAt: null, talentDrops,
  };
  sim.killroy = {
    onKill(mon) {
      if (k.finished) return;
      const rng = sim.rng, L = sim.rewardsState.ledger;
      if (rng.randomFloat() < .6) k.queued++;
      k.kills = Math.round(k.kills + 1);
      L.kills++;
      L.killsByType[mon.type] = (L.killsByType[mon.type] || 0) + 1;
      const drop = (name, n = 0, m = 0) => {
        sim.rewards.dropSomething(sim, name, 1, 0, n, m, mon.node, 0, mon.x + mon.offX - 18, 'killroy');
        if (name === 'Quest69') k.skullsDropped++;
      };
      // Source 63627: the bonus-skull short circuit changes the RNG stream.
      if (rng.randomFloat() < (1 + v.killroyMeritoc / 100) *
          Math.min(.25, .25 * (1 + skulls / 100) * Math.max(.1, 1 - .995 * k.kills / (k.kills + 50)))) {
        drop('Quest69');
        if (k.kills < 150 && ((k.kills < 50 && rng.randomFloat() < .16) || rng.randomFloat() < .06)) drop('Quest69');
      }
      if (talents > .5 && rng.randomFloat() < (1 + .05 * talents) /
          Math.max(10, Math.pow(k.talentDrops, 2) + 10 * (k.talentDrops + 1))) {
        drop(k.talentDrops % 9 === 7 ? 'TalentPoint6' :
          'TalentPoint' + Math.max(1, Math.min(4, Math.round(k.talentDrops - 4 * Math.floor(k.talentDrops / 4) + 1))), 2, 3);
        k.talentDrops++;
      }
      if (credits > .5 && rng.randomFloat() < .01 * (1 + credits / 100)) drop('DungCredits' + rng.randomInt(1, 2), 2, 3);
      if (pearls > .5 && rng.randomFloat() < .002 * (1 + pearls / 100)) {
        drop(rng.randomFloat() < .5 ? 'Pearl4' : rng.randomFloat() < .9 ? 'Pearl5' : 'Pearl6', 2, 3);
      }
      sim.emit('killroyKill', { kills: k.kills, t: sim.timeMs });
    },
  };
  // AE481 init (84268): all 300 arrivals are armed by the 50 ms callback.
  sim.later(50, () => {
    for (let i = 0; i < 300; i++) sim.later(1e3 * (.05 + .15 * Math.pow(i, 1.3)), () => {
      if (k.finished) return;
      k.queued++;
      if (respawns > 0) k.queued += Math.floor(sim.rng.randomFloat() + respawns / 100);
    });
  });
  // AE481 _event_01sec (83423): consume one queued spawn before checking time.
  sim.every(100, () => {
    if (!k.finished && k.queued >= 1) {
      k.queued--;
      const node = sim.rng.randomInt(0, sim.scene.numberOfNodes - 1);
      const nd = sim.scene.nodes[node];
      const x = sim.rng.randomInt((Number(nd.x) + 15) | 0, (Number(nd.length) - 15) | 0);
      sim.world.createMonster(sim, MapAFKtarget[sim.mapIdx], node, x);
      k.spawned++;
    }
    if (!k.finished && k.remaining < .1) {
      k.finished = true; k.finishedAt = sim.timeMs;
      sim.emit('killroyEnded', { kills: k.kills, t: sim.timeMs });
      for (const mon of sim.world.monsters(sim)) {
        sim.later(1e3 * (.01 + .015 * mon.id), () => { if (!mon.recycled) mon.hp = 0; });
      }
      // Results become selectable after 2 s; allow native pickups during that tail.
      sim.later(2000, () => {
        sim.ended = { reason: 'killroy', t: sim.timeMs, endAt: sim.timeMs };
        sim.emit('sessionEnded', { ...sim.ended });
      });
    } else k.remaining -= .1;
  });
}
