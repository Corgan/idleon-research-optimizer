// ===== VMAN SCRIPTED BOSS ENCOUNTERS (COMMON) =====
import { vmanBossDefinition } from '../../data/common/vman-speedrun-bosses.js';
import { SCENE_GEOMETRY } from '../../data/game/scenes.js';

function _decode(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
}

function _number(value, label, positive = false) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim()) ||
      !Number.isFinite(Number(value)) || (positive ? Number(value) <= 0 : Number(value) < 0)) {
    throw new Error(`${label} is unavailable.`);
  }
  return Number(value);
}

function _bossInfo(S) {
  const raw = S?.data || S;
  return _decode(S?.bossInfoData ?? S?.bossInfo ?? raw?.BossInfo);
}

function _row(info, bossId, difficulty) {
  const row = _decode(info?.[bossId === 5 ? 4 : bossId]);
  if (!row || _number(row[0], 'Saved boss difficulty') !== difficulty) throw new Error('Saved BossInfo does not match the selected difficulty.');
  return {
    hp: _number(row[1], 'Saved boss base HP', true),
    defence: _number(row[2], 'Saved boss Defence'),
  };
}

// Door clicks do not test KLA or quests again. The caller must actually reach
// the prerequisite map and its door, using the current run's legal route.
export function vmanBossEntry(S, charIdx = 0, options = {}) {
  if (!Number.isInteger(charIdx) || charIdx < 0) throw new Error('Invalid character index.');
  const { bossId, difficulty } = options;
  const def = vmanBossDefinition(bossId, difficulty);
  const raw = S?.data || S;
  const currencies = _decode(raw?.CurrenciesOwned);
  const keys = Object.hasOwn(options, 'keysAll') ? _decode(options.keysAll)
    : Object.hasOwn(raw || {}, 'CYKeysAll') ? _decode(raw.CYKeysAll)
      : _decode(S?.currenciesData?.KeysAll ?? currencies?.KeysAll);
  const unknown = [], blocked = [];
  let balance = null;
  try { if (bossId < 5) balance = _number(keys?.[bossId], 'Account boss-key balance'); }
  catch (error) { unknown.push(error.message); }
  let attempts = null;
  if (bossId === 5) {
    const optionsRow = _decode(Object.hasOwn(raw || {}, 'OptionsListAccount') ? raw.OptionsListAccount : raw?.OptLacc);
    const saved = optionsRow?.[370];
    if (!['number', 'string'].includes(typeof saved) || String(saved).trim() === '' || !Number.isFinite(Number(saved)))
      unknown.push('Saved Emperor attempts are unavailable.');
    else {
      attempts = Number(saved);
      if (attempts >= 1) blocked.push('The saved Emperor attempt is already used.');
    }
  }
  if (balance !== null && def.entryKeyCost !== null && balance < def.entryKeyCost) blocked.push('Insufficient account boss keys.');
  if (options.currentMap === undefined || options.currentMap === null) unknown.push('Current run map is unavailable.');
  else {
    try {
      if (_number(options.currentMap, 'Current run map') !== def.doorMap) blocked.push(`Reach prerequisite map ${def.doorMap} before entering.`);
    } catch (error) { unknown.push(error.message); }
  }
  for (const [key, expected, message] of [
    ['doorReached', true, `Reach door node ${def.doorNode}.`],
    ['movementAllowed', true, 'Native movement blocker rejects the door.'],
    ['killroyRoom', false, 'Boss doors cannot open in a Killroy room.'],
    ['transitioning', false, 'A scene transition is already active.'],
    ['compassTempest', false, 'Tempest cannot enter through the boss modal.'],
  ]) {
    if (typeof options[key] !== 'boolean') unknown.push(`${key} is unavailable.`);
    else if (options[key] !== expected) blocked.push(message);
  }
  const legal = blocked.length ? false : unknown.length ? null : true;
  return {
    bossId, difficulty, doorMap: def.doorMap, doorNode: def.doorNode, mapIdx: def.mapIdx,
    legal, reason: [...blocked, ...unknown].join(' ') || null, blocked, unknown,
    keyCost: def.entryKeyCost, keyCostKnown: def.entryKeyCost !== null,
    keysBefore: balance, keysAfter: legal === true && bossId < 5 ? balance - def.entryKeyCost : null,
    buff45ExemptsKeys: false, paymentVerified: false,
    paymentAffordable: balance === null || def.entryKeyCost === null ? null : balance >= def.entryKeyCost,
    attemptsBefore: attempts, attemptsAfter: legal === true && bossId === 5 ? Math.round(attempts + 1) : null,
    bossRow: [difficulty, def.hp, def.defence],
    fadeOutMs: 1500, fadeInMs: 700,
    route: 'Prerequisite-map access and walking to the door must use the current run state; saved BossInfo does not prove access.',
  };
}

export function vmanBossChoices(S, charIdx = 0) {
  if (!Number.isInteger(charIdx) || charIdx < 0) throw new Error('Invalid character index.');
  const info = _bossInfo(S);
  return Array.from({ length: 6 }, (_, bossId) => {
    const difficulties = Array.from({ length: 3 }, (_, difficulty) => {
      const def = vmanBossDefinition(bossId, difficulty);
      let reason = def.unavailable;
      let saved = null, maxHp = null;
      try {
        saved = _row(info, bossId, difficulty);
        if (bossId === 5) {
          const raw = S?.data || S;
          const options = _decode(Object.hasOwn(raw || {}, 'OptionsListAccount') ? raw.OptionsListAccount : raw?.OptLacc);
          maxHp = 135e12 * Math.pow(1.52, _number(options?.[369], 'Saved Emperor showdown'));
        } else {
          maxHp = (bossId === 4 ? [100, 2500, 1e6][difficulty] : 1) * saved.hp;
        }
        if (!Number.isFinite(maxHp)) throw new Error('Boss HP overflow.');
        if (bossId === 3 && !(_decode(S?.tasksGlobalData?.[1] ?? (S?.data || S)?.TaskZZ1)?.[3]?.[6] > 2.5))
          reason = 'Troll needs the saved task unlock for its five-hit opening; minigames are not simulated.';
      } catch (error) { reason = reason ? `${reason} ${error.message}` : error.message; }
      return {
        ...def, staticHp: def.hp, hp: maxHp, baseHp: saved?.hp ?? null, maxHp,
        defence: saved?.defence ?? def.defence, available: !reason, reason,
        entry: vmanBossEntry(S, charIdx, { bossId, difficulty }),
      };
    });
    const { name, mapIdx } = difficulties[0];
    return {
      bossId, name, mapIdx, difficulties,
      available: difficulties.some((d) => d.available),
      reason: difficulties.some((d) => d.available) ? null : difficulties.map((d) => d.reason).filter((r, i, a) => a.indexOf(r) === i).join(' '),
      access: 'Caller must separately verify map access and native entry costs; these are encounter capabilities, not free entry permissions.',
    };
  });
}

export function vmanKrukExit(options = {}) {
  const unknown = [], blocked = [];
  if (options.currentMap == null) unknown.push('Current run map is unavailable.');
  else {
    try {
      if (_number(options.currentMap, 'Current run map') !== 214) blocked.push('Kruk return starts on map 214.');
    } catch (error) { unknown.push(error.message); }
  }
  if (options.movementState == null) unknown.push('Player movement state is unavailable.');
  else if (![0, 5].includes(options.movementState)) blocked.push('Player has not reached the native exit-connection movement branch.');
  for (const [key, expected] of [
    ['movementAllowed', true], ['localPlayer', true], ['exitConnectionReached', true],
    ['transitioning', false], ['killroyRoom', false],
  ]) {
    if (typeof options[key] !== 'boolean') unknown.push(`${key} is unavailable.`);
    else if (options[key] !== expected) blocked.push(`Native return gate rejected: ${key}.`);
  }
  return {
    legal: blocked.length ? false : unknown.length ? null : true,
    reason: [...blocked, ...unknown].join(' ') || null, blocked, unknown,
    bossId: 4, mapIdx: 214, destinationMap: 211, destinationScene: 'wLavaB6',
    portal: { x: 140, y: 586 }, target: { node: 2, x: 162, y: 663 },
    requestMovementStates: [0, 1, 2, 5],
    pathFromBossNode: [0, 1, 2], fadeOutMs: 200, fadeInMs: 200,
    takeDmgTimer: 15, requiresVictory: false, klaWrites: [],
    returnSpawn: { node: 3, x: 421, y: 444 },
    transitionPerformed: false,
  };
}

export function vmanBossExit(bossId, options = {}) {
  if (bossId === 4) return vmanKrukExit(options);
  const definition = vmanBossDefinition(bossId, 0);
  const nodes = [7, 16, 5, 12, 2, 5];
  const portals = [[16, 471], [1329, 352], [1336, 464], [0, 336], [140, 586], [6, 580]];
  const returnNodes = [1, 0, 9, 4, 3, 0];
  const returnX = bossId === 3 ? 436 : bossId === 5 ? 826
    : SCENE_GEOMETRY[definition.doorMap]?.portals?.[1]?.[0] - 24;
  if (!Number.isFinite(returnX)) throw new Error('Native boss return spawn is unavailable.');
  const base = vmanKrukExit({ ...options, currentMap: options.currentMap == null ? undefined
    : options.currentMap === definition.mapIdx ? 214 : -1 });
  const node = nodes[bossId], geometry = SCENE_GEOMETRY[definition.mapIdx].nodes[node];
  return { ...base, bossId, mapIdx: definition.mapIdx, destinationMap: definition.doorMap,
    portal: { x: portals[bossId][0], y: portals[bossId][1] },
    target: { node, x: geometry.x, y: geometry.y }, pathFromBossNode: null,
    destinationScene: null,
    returnSpawn: { node: returnNodes[bossId], x: returnX,
      y: SCENE_GEOMETRY[definition.doorMap].nodes[returnNodes[bossId]].y - 49 } };
}

function _openingEncounter({ bossId, difficulty, bossInfo, tasks, showdown }) {
  const definition = vmanBossDefinition(bossId, difficulty), row = _row(_decode(bossInfo), bossId, difficulty);
  const maxHp = bossId === 5 ? 135e12 * Math.pow(1.52, _number(showdown, 'Emperor showdown')) : row.hp;
  if (!Number.isFinite(maxHp)) throw new Error('Boss HP overflow.');
  const trollReady = Number(tasks?.[1]?.[3]?.[6]) > 2.5;
  if (bossId === 3 && !trollReady) throw new Error('Troll five-hit opening is locked; minigames are not simulated.');
  const state = { bossId, difficulty, maxHp, hp: maxHp, damage: 0, status: 'pending',
    defeatedAt: null, failedAt: null, reason: null, hits: 0,
    openingHits: bossId === 3 ? 5 : null, armsRemaining: bossId === 1 ? 6 : 0 };
  const parts = [], arms = [];
  let owner = null, started = false, headOpen = bossId !== 1;
  const fail = (sim, reason) => {
    if (state.failedAt !== null) return;
    state.failedAt = sim.timeMs; state.reason = reason;
    if (state.status !== 'defeated') state.status = 'unsupported-opening';
    sim.emit('bossOpeningUnavailable', { bossId, reason, t: sim.timeMs });
  };
  const boundary = (sim, ms, reason, aliveOnly = true) => sim.later(ms, () => {
    if (!aliveOnly || state.status === 'fighting') fail(sim, reason);
  });
  function victory(sim) {
    if (state.status !== 'fighting' || !(state.hp <= 0) || state.failedAt !== null) return;
    state.status = 'defeated'; state.defeatedAt = sim.timeMs;
    for (const mon of [...parts, ...arms]) if (!mon.recycled) sim.recycleActor(mon);
    if (bossId === 5) sim.scene.nodes[4].length = 1300;
    sim.emit('bossDefeated', { bossId, difficulty, t: sim.timeMs });
  }
  function part(sim, type, node, x, hp, shield = false) {
    const mon = sim.world.createMonster(sim, type, node, x);
    if (!mon) throw new Error('Unable to create ' + definition.name + ' hitbox.');
    mon.hp = hp; mon.hpTot = hp;
    mon.vx = 0; mon.moving = 0;
    if (shield) mon.statusList.push({ name: 'StatusBlockFull', dur: 360000 });
    (type === 'EfauntArm' ? arms : parts).push(mon);
    return mon;
  }
  function shield(mon, on) {
    mon.statusList = mon.statusList.filter(s => s.name !== 'StatusBlockFull');
    if (on) mon.statusList.push({ name: 'StatusBlockFull', dur: 360000 });
  }
  return {
    spawns: { mobs: [] },
    configure(sim) {
      if (owner || sim.mapIdx !== definition.mapIdx) throw new Error('Boss encounter owner/map mismatch.');
      owner = sim;
      sim.scene.nodes = sim.scene.nodes.map(n => ({ ...n, neighbors: n.neighbors.slice() }));
      for (const type of ['BossPart', 'EfauntArm']) sim.scene.defs[type] = {
        ...sim.world.getDef(sim, type), Defence: row.defence, MonsterMoving: 0,
        ...(type === 'BossPart' ? { MonsterHPTotal: 69420, DeathFrame: -1 } : {}),
      };
      sim.scene.numberOfNodes = [7, 12, 5, 12, 2, 5][bossId];
    },
    start(sim) {
      if (owner !== sim || started) throw new Error('Boss encounter must start once.');
      started = true; state.status = 'fighting';
      const [node, x] = [[4, -8], [9, 1305], [4, 1312], [11, -24], [], [4, -18]][bossId];
      Object.assign(sim.player, { node, x, y: sim.scene.nodes[node].y - 49, vx: 0, vy: 0, target: null });
      sim.player.mouseClickX = x + 35;
      if (sim.player.pmm) sim.player.pmm[2] = node;
      if (bossId === 0) {
        part(sim, 'BossPart', 1, 720, 69420); part(sim, 'BossPart', 5, 791, 69420);
        // First attack is always 5 at the native x < 128 entry. Its first
        // projectile cannot hurt before 50 + 1600 + 2250 ms (AE198).
        const nextAttack = 1000 * (sim.rng.randomInt(3, 6) + [3, 1, 0][difficulty]);
        boundary(sim, nextAttack, 'Amarok opening reached its next unsupported attack.');
        boundary(sim, 3800, 'Amarok projectile collision is outside the opening model.', false);
      } else if (bossId === 1) {
        for (const [n, px, share] of [[0, 494, .2], [3, 534, .13], [6, 607, .15],
          [1, 957, .17], [4, 993, .15], [7, 965, .13]]) part(sim, 'EfauntArm', n, px, maxHp * share);
        part(sim, 'BossPart', 12, 775, 69420, true);
        sim.later(200, () => {
          if (state.status !== 'fighting') return;
          const alive = index => arms[index].hp > 0;
          const n = sim.player.node;
          let attack = -1;
          if ([0, 3].includes(n) && sim.rng.randomFloat() < .4 && alive(0)) attack = 0;
          else if (difficulty !== 0 && [7, 9].includes(n) && sim.rng.randomFloat() < .3) attack = 10;
          else if (difficulty !== 0 && [6, 8].includes(n) && sim.rng.randomFloat() < .3) attack = 11;
          else if ([1, 2, 4, 7].includes(n) && sim.rng.randomFloat() < 1 && alive(5)) attack = 5;
          else if (sim.rng.randomFloat() < .25 && alive(1)) attack = sim.rng.randomFloat() < .64 ? 1 : 6;
          else if (sim.rng.randomFloat() < .33 && alive(4)) { sim.rng.randomFloat(); attack = 4; }
          else if (n === 6 && sim.rng.randomFloat() < .3 && alive(2)) attack = 2;
          else if (n === 1 && sim.rng.randomFloat() < .6 && alive(3)) attack = 3;
          else if (!arms.some(m => m.hp > 0)) attack = 8;
          else {
            const roll = sim.rng.randomFloat();
            if (alive(0) && roll < .3) attack = 0;
            else if (alive(5) && roll < .7) attack = 5;
            else if (alive(2)) attack = 2;
          }
          state.firstAttack = attack;
          if (attack === -1) {
            boundary(sim, 1000, 'Efaunt opening reached another attack selection.');
            return;
          }
          const nextAttack = 1000 * (sim.rng.randomInt(2, 4) + [2, 1, 0][difficulty] + (attack === 4 ? 2 : 0));
          // Stop before the first unported damaging callback, never give the
          // player a harmless stand-in for a prolonged Efaunt phase.
          boundary(sim, nextAttack, 'Efaunt opening reached another attack selection.');
          sim.later([2, 10, 11].includes(attack) ? 150 : 1790, () => {
            const arm = [0, 1, 2, 3, 4, 5, 1, 4][attack];
            if (state.status === 'fighting' && (arm === undefined || alive(arm)))
              fail(sim, 'Efaunt opening reached an unsupported arm attack.');
          });
        });
      } else if (bossId === 2) {
        for (const px of [143, 278, 409, 500]) part(sim, 'BossPart', 3, px, 69420, true);
        // Initial clock is zero when NewAttackG first runs: entry position
        // chooses attack 3. First falling actor appears after 200+100+100 ms.
        sim.later(200, () => {
          const nextAttack = 1000 * (sim.rng.randomInt(3, 5) + [3, 1, 0][difficulty]);
          boundary(sim, nextAttack, 'Chizoar reached its next unsupported attack.');
          for (let i = 0; i < 15; i++) sim.later(190 + 500 * i, () => {
            const projectile = sim.addActor({ kind: 'bullet', x: sim.player.x + sim.player.width / 2
              + sim.rng.randomInt(-180, 180), y: 0, vx: 0, vy: 2 });
            sim.every(300, () => {
              const px = sim.player.x + sim.player.width / 2, py = sim.player.y + sim.player.height / 2;
              if (px + 7 > projectile.x - 25 && px - 7 < projectile.x + 50
                && py + 30 > projectile.y - 10 && py - 2 < projectile.y + 50)
                fail(sim, 'Chizoar falling projectile contact needs the unported boss damage handler.');
              projectile.vy++;
            }, projectile);
          });
        });
        sim.every(200, () => { if (state.status === 'fighting') for (const mon of parts) shield(mon, false); });
      } else {
        sim.later(40, () => {
          if (bossId === 3) part(sim, 'BossPart', 11, 780, 69420);
          else { part(sim, 'BossPart', 1, 715, 69420); part(sim, 'BossPart', 4, 750, 69420); }
        });
        if (bossId === 5) boundary(sim, 3680, 'Emperor was not defeated before its first attack choice.');
      }
      sim.addActor({ kind: 'bullet', x: 0, y: 0, vx: 0, vy: 0, onFrame() {
        if (bossId === 1) {
          for (const [arm, from, to] of [[arms[1], 3, 13], [arms[4], 4, 14]]) if (arm.hp <= 0) {
            for (const node of [from, 12]) if (!sim.scene.nodes[node].neighbors.includes(to))
              sim.scene.nodes[node].neighbors.push(to);
          }
          state.armsRemaining = arms.filter(m => m.hp > 0).length;
          if (!headOpen && !state.armsRemaining) { headOpen = true; for (const mon of parts) shield(mon, false); }
        }
        if (bossId < 3) victory(sim);
      } });
      if (bossId === 5) sim.every(250, () => victory(sim));
    },
    damage(sim, mon, amount, meta = {}) {
      if (owner !== sim) throw new Error('Boss encounter owner mismatch.');
      if (!parts.includes(mon) && !arms.includes(mon)) return false;
      if (state.status !== 'fighting' || state.failedAt !== null || mon.recycled || mon.hp <= 0) return true;
      amount = _number(amount, 'Boss hit damage');
      if (arms.includes(mon)) {
        mon.hp -= amount;
        if (mon.hp <= 0) { mon.alive = 0; mon.willDie = 0; }
        return true;
      }
      if (bossId === 1 && !headOpen) return true;
      const before = state.hp;
      if (before > 0) state.hits++;
      state.hp -= amount; state.damage += amount; mon.willDie = 0;
      sim.telemetry?.damage(mon, amount, before, meta);
      sim.emit('damage', { id: mon.id, uid: mon.uid, amount, hp: state.hp, meta, t: sim.timeMs });
      if (bossId === 3) {
        state.openingHits--;
        if (state.hp <= 0) victory(sim);
        else if (!state.openingHits) fail(sim, 'Troll survived its five native opening hits; minigames are not simulated.');
      }
      return true;
    },
    summary() { return { ...state, implemented: true, nativeComplete: false, exclusions: [
      'Opening-kill encounter only; unsupported attacks/minigames stop explicitly.',
      'Boss reward, task and achievement settlement and exact client-global cosmetic RNG are excluded.',
    ] }; },
  };
}

export function createVmanBossEncounter({ bossId, difficulty, bossInfo, tasks, showdown } = {}) {
  if (bossId !== 4) return _openingEncounter({ bossId, difficulty, bossInfo, tasks, showdown });
  const definition = vmanBossDefinition(bossId, difficulty);
  if (definition.unavailable) throw new Error(definition.unavailable);
  const row = _row(_decode(bossInfo), bossId, difficulty);
  // SceneEvents_112 init (155155): the saved base is scaled again on entry.
  const maxHp = [100, 2500, 1e6][difficulty] * row.hp;
  if (!Number.isFinite(maxHp)) throw new Error('Boss HP overflow.');
  const state = {
    bossId, difficulty, status: 'pending', hp: maxHp, maxHp, damage: 0,
    spawned: 0, healed: 0, healing: 0, defeatedAt: null,
  };
  let owner = null, started = false, boss = null;
  const exclusions = [
    'Boss rewards, entry costs, quests, achievements and account writes belong to the caller.',
    'Cosmetic boss growth, dialogue and particle actors are omitted; no exact client-global RNG replay claim.',
  ];

  function _sync() {
    if (boss && !boss.recycled) {
      // BossPart keeps an independent positive actor HP; DeathFrame -1 hits
      // write shared BossHP, never the ordinary monster kill/reward path.
      boss.hp = 69420;
      boss.willDie = 0;
    }
  }

  function _heal(sim, mon) {
    // AE1 init (63870-63881): this is a 15-second lifetime check, not
    // collision with the boss, and its strict HP gates matter.
    if (state.status !== 'fighting' || mon.recycled || !(mon.hp > .5) || !(state.hp > 1)) return;
    const before = state.hp;
    state.hp = Math.min(maxHp, state.hp + maxHp * ((difficulty === 0 ? 1.5 : 2) / 100));
    state.healed++;
    state.healing += state.hp - before;
    mon.hp = -69.42069;
    mon.willDie = 1;
    sim.emit('bossHealed', { bossId, difficulty, amount: state.hp - before, hp: state.hp, uid: mon.uid, t: sim.timeMs });
  }

  function _spawn(sim) {
    if (state.status !== 'fighting' || !(state.hp > .5)) return;
    const right = sim.rng.randomInt(0, 1) === 1;
    const mon = sim.world.createMonster(sim, 'w5b6', 0, right ? 1203 : 70, '', {
      onInit(actor) { sim.later(15000, () => _heal(sim, actor), actor); },
    });
    if (!mon) throw new Error('Unable to create Kattlekruk arrival.');
    mon.worship = 2;
    mon.vx = right ? -3 : 3; // SceneEvents_112 overrides AE1's -3.3/+2.8.
    state.spawned++;
  }

  return {
    spawns: { mobs: [] },
    configure(sim) {
      if (owner) throw new Error('A boss encounter adapter cannot be reused.');
      if (Number(sim.mapIdx) !== definition.mapIdx) throw new Error('Boss encounter map mismatch.');
      owner = sim;
      const original = sim.world.getDef(sim, 'BossPart');
      sim.scene.defs.BossPart = {
        ...original, Defence: row.defence, MonsterHPTotal: 69420,
        MonsterMoving: 0, DeathFrame: -1,
      };
      sim.scene.numberOfNodes = 2;
    },
    start(sim) {
      if (owner !== sim || started) throw new Error('Boss encounter must be configured and started once.');
      started = true;
      state.status = 'fighting';
      const player = sim.player;
      player.node = 1;
      player.x = 116;
      player.y = sim.scene.nodes[1].y - 49;
      player.mouseClickX = player.x + 35;
      if (Array.isArray(player.pmm)) player.pmm[2] = 1;
      sim.later(40, () => {
        if (state.status !== 'fighting') return;
        boss = sim.world.createMonster(sim, 'BossPart', 0, 641);
        if (!boss) throw new Error('Unable to create Kattlekruk hitbox.');
        _sync();
      });
      sim.later(3000, () => {
        if (state.status === 'fighting') sim.every([4000, 1500, 750][difficulty], () => _spawn(sim));
      });
      // SceneEvents_112._event_EveryNsecs (155145), registered at 250 ms.
      sim.every(250, () => {
        if (state.status !== 'fighting' || !(state.hp <= 0)) return;
        state.status = 'defeated';
        state.defeatedAt = sim.timeMs;
        sim.recycleActor(boss);
        for (const mon of sim.world.monsters(sim)) if (mon.type !== 'BossPart') mon.hp = -69.42069;
        sim.emit('bossDefeated', { bossId, difficulty, t: sim.timeMs });
      });
    },
    damage(sim, mon, amount, meta = {}) {
      if (owner !== sim) throw new Error('Boss damage received from a different simulation.');
      if (mon?.type !== 'BossPart') return false;
      if (state.status !== 'fighting' || !started || mon !== boss || mon.recycled || mon.alive !== 1) return true;
      amount = _number(amount, 'Boss hit damage');
      const before = state.hp;
      state.hp -= amount;
      state.damage += amount;
      _sync();
      sim.telemetry?.damage(mon, amount, before, meta);
      sim.emit('damage', { id: mon.id, uid: mon.uid, amount, hp: state.hp, meta, t: sim.timeMs });
      return true;
    },
    summary() {
      return { ...state, implemented: true, nativeComplete: false, exclusions: exclusions.slice() };
    },
  };
}
