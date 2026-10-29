// ===== SPELUNKING EXPEDITIONS (W7) =====
import { SPELUNK_SPRITES } from '../../data/game/spelunk-sprites.js';
import { getLOG } from '../../../formulas.js';

const _lengths = [4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 11];
export const SPELUNK_POLICIES = ['auto', 'dive', 'efficient', 'clear'];
export const SPELUNK_REWARDS = ['Amber', 'Prisma Bubbles', 'Exalted Stamp Fragments',
  'Snail Mail', 'Blinding Lanterns', 'Sigil Syrup', 'Spirit Offerings', 'Strange Gold Pieces',
  'Rockenstone', 'Sheetmetal', 'Popcorn', 'Pillario'];
const _rewardImages = ['CaveAmber0', 'Quest99_x1', 'ExaltFrag', 'SnailMail', 'Quest90_x1',
  'SigilSyrup', 'Quest102_x1', 'CaveGoldPiece_x1', 'W7item0_x1', 'W7item1_x1', 'W7item2_x1', 'W7item3_x1'];

export function spelunkRewardImage(input, index) {
  if (index !== 0) return _rewardImages[index];
  const tier = [66, 51, 41, 20].findIndex(id => input.shop[id] >= 1);
  return `CaveAmber${tier < 0 ? 0 : 4 - tier}`;
}

function _rng(seed) {
  let state = seed >>> 0, calls = 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0; calls++;
      let n = Math.imul(state ^ state >>> 15, 1 | state);
      n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    },
    int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); },
    get calls() { return calls; },
  };
}
function _integer(value, lo, hi, name) {
  if (!Number.isInteger(value) || value < lo || value > hi) throw new Error(`Invalid ${name}.`);
  return value;
}
function _positive(value, lo, hi, name) {
  if (!Number.isFinite(value) || value < lo || value > hi) throw new Error(`Invalid ${name}.`);
  return value;
}
function _neighbors(slot) {
  const out = [];
  if (slot % 12) out.push(-1);
  if (slot > 11) out.push(-12);
  if (slot < 132) out.push(12);
  if ((slot + 1) % 12) out.push(1);
  return out;
}
function _grid(slot) { return [477 + 36 * (slot % 12) - 36 * Math.floor(slot / 12), 26 + 18 * (slot % 12) + 18 * Math.floor(slot / 12)]; }
function _distance(x, y, a, b) {
  const dx = Math.abs(x - a), dy = Math.abs(y - b);
  return .9604339 * Math.max(dx, dy) + .397824735 * Math.min(dx, dy);
}
function _quadOut(t) { return -t * (t - 2); }
function _elasticOut(t) {
  return t === 0 ? 0 : t === 1 ? 1
    : Math.exp(-6.931471805599453 * t) * Math.sin(6.283185307179586 * (.001 * t - 75e-6) / 3e-4) + 1;
}
function _tween(from, to, elapsed, duration, easing) {
  const q = easing(Math.max(0, Math.min(duration, elapsed)) / duration);
  return from * (1 - q) + to * q;
}
function _powerBoost(input, effects) {
  return effects[4] > .5 ? 5 / (1 + input.elixirs[4].quantity / 100) ** (effects[4] - 1) : 1;
}
function _amberBoost(input, effects) {
  return effects[3] > .5 ? 1 + .1 * input.elixirs[3].quantity * effects[3] / 100 : 1;
}
export function spelunkActiveBuffs(input, effects) {
  const rows = [];
  const add = (id, value, unit, detail = '') => rows.push({ id, value, unit, detail });
  if (effects[0] > 0) add(0, input.elixirs[2].quantity, '% refund', 'Stamina returned per dig, before its cost is subtracted.');
  if (effects[2] > 0) add(2, 100 * Math.min(.5, input.elixirs[2].quantity / 100), '% restore', '50% chance to restore this share of maximum stamina on exhaustion.');
  if (effects[3] > .5) add(3, _amberBoost(input, effects), 'x Amber');
  if (effects[4] > .5) add(4, _powerBoost(input, effects), 'x Power');
  if (effects[5] > 0) add(5, effects[5], ' floors', `${input.elixirs[5].quantity}% chance per adjacent rock to strike after a break.`);
  if (effects[6] > 0) add(6, 25 * effects[6] / (1 + 19 * input.shop[67]), '% extra Amber',
    `Added expected extra Amber stacks per Amber drop. Total: ${(5 + input.shop[42] + 25 * effects[6]) / (1 + 19 * input.shop[67])}%. Values above 100% can grant multiple extra stacks.`);
  if (effects[7] > 0) add(7, input.elixirs[7].quantity * effects[7] / 100, ' extra strikes',
    `${Math.min(100, input.shop[31] * (1 + Math.min(.5, effects[7])))}% Shadow Strike chance; ${1 + (input.shop[32] + input.elixirs[7].quantity * effects[7]) / 100} expected strikes per proc before available-rock limits.`);
  if (effects[9] > 0) add(9, 1 + Math.min(4, 4 * effects[9]), 'x Discovery', 'Power / 100; stamina cost x3.');
  if (effects[10] > 0) add(10, Math.max(1, 100 * effects[10]), 'x Power', `Stamina cost x${Math.max(1, 4 * effects[10])}.`);
  if (effects[12] > 0) add(12, 1 + 10 * effects[12] / 100, 'x Amber', 'Amber bags collected during this expedition.');
  return rows;
}
export function spelunkRockStats(cave, type, depth) {
  const r = cave.rocks[type];
  if (!r) throw new Error('Unknown cave rock.');
  return {
    hp: r.scaled ? Math.floor(r.hp + (r.growth - 1) * (depth - r.depth)) : Math.round(r.hp),
    requirement: 100 * cave.rocks[0].base * r.pow
      * (r.scaled ? r.growth ** Math.round(Math.max(0, depth - r.depth)) : 1),
    amber: Math.max(1, 2 * Math.min(2, cave.id)) * r.amber
      * (r.scaled ? 1 + .25 * (r.growth - 1) * (depth - r.depth) : 1),
  };
}
export function normalizeSpelunkConfig(input, requested = {}) {
  const cave = _integer(requested.cave ?? 0, 0, input.caves.length - 1, 'cave');
  const party = [...(requested.party ?? input.characters.filter(c => requested.stamina === 'full' || c.stamina >= c.max / 2)
    .slice(0, input.caves[cave].capacity).map(c => c.id))];
  if (!party.length || party.length > input.caves[cave].capacity || new Set(party).size !== party.length)
    throw new Error("Choose a unique, nonempty party within this cave's capacity.");
  for (const id of party) {
    _integer(id, 0, input.characters.length - 1, 'party member');
    if (requested.stamina !== 'full' && input.characters[id].stamina < input.characters[id].max / 2)
      throw new Error(`${input.characters[id].name} needs at least half maximum stamina to join.`);
  }
  const manic = requested.manic ?? input.savedManic;
  if (typeof manic !== 'boolean' || manic && !input.manic) throw new Error('Manic expeditions are locked.');
  const policy = requested.policy === 'push-farm' ? 'efficient' : requested.policy ?? (input.auto ? 'auto' : 'dive');
  if (!SPELUNK_POLICIES.includes(policy) || policy === 'auto' && !input.auto) throw new Error('This expedition policy is unavailable.');
  const speed = _integer(requested.speed ?? input.speedMax, 0, input.speedMax, 'Auto speed');
  const elixirs = [...(requested.elixirs ?? input.savedElixirs)];
  while (elixirs.length > input.slots && elixirs.at(-1) === -1) elixirs.pop();
  if (elixirs.length > input.slots) throw new Error('Too many equipped elixirs.');
  while (elixirs.length < input.slots) elixirs.push(-1);
  const counts = new Map();
  for (const id of elixirs) {
    if (id === -1) continue;
    _integer(id, 0, input.elixirOwned - 1, 'elixir');
    counts.set(id, (counts.get(id) || 0) + 1);
    if (counts.get(id) > input.dupes) throw new Error('This elixir exceeds the duplicate limit.');
  }
  const savedMemory = requested.memorized ?? input.memorized ?? [];
  if (!Array.isArray(savedMemory)) throw new Error('Invalid memorized elixirs.');
  const memorized = [...savedMemory].sort((a, b) => a - b);
  if (memorized.length > (input.memorySlots ?? Math.round(input.shop[57] || 0)))
    throw new Error('Too many memorized elixirs.');
  if (new Set(memorized).size !== memorized.length) throw new Error('Memorized elixirs must be different.');
  for (const id of memorized) _integer(id, 0, input.elixirOwned - 1, 'memorized elixir');
  const tool = requested.tool ?? 'adaptive';
  if (tool !== 'adaptive' && !input.tools.some(t => t.id === tool)) throw new Error('This tool is locked.');
  const entry = requested.entry ?? 'shortcut';
  if (!['surface', 'shortcut'].includes(entry)) throw new Error('Invalid entry.');
  const fullClear = requested.fullClear ?? input.fullClear;
  if (typeof fullClear !== 'boolean') throw new Error('Invalid full-clear setting.');
  return { cave, party, manic, policy, speed, elixirs, memorized, tool, entry, fullClear,
    reactionMs: _positive(requested.reactionMs ?? 350, 100, 5000, 'manual reaction time'),
    stamina: requested.stamina === 'full' ? 'full' : requested.stamina == null || requested.stamina === 'saved' ? 'saved' : (() => { throw new Error('Invalid starting stamina.'); })(),
  };
}

export function createSpelunkExpedition(input, requested = {}, options = {}) {
  const config = normalizeSpelunkConfig(input, requested);
  _integer(options.seed ?? 1, 0, 0xffffffff, 'seed');
  const cave = input.caves[config.cave], shop = input.shop, random = _rng(options.seed ?? 1);
  const stamina = input.characters.map(c => config.stamina === 'full' ? c.max : c.stamina);
  const start = [...stamina], effects = Array(13).fill(0);
  const startingStamina = config.party.reduce((sum, id) => sum + start[id], 0);
  const charges = config.elixirs.map(id => id < 0 ? 0 : input.elixirs[id].charges), ready = charges.map(() => 0);
  const tasks = [];
  const flags = Array(12).fill(0), rewards = Array(12).fill(0), rewardOrder = [];
  const records = [], discovered = new Set(input.discoveries), snapshots = [], replayEvents = [];
  let depth = !config.manic && input.shortcut && config.entry === 'shortcut'
    ? Math.max(0, 50 * Math.floor(Math.round(input.depths[cave.id] || 0) / 50) - 1) : 0;
  const startDepth = depth;
  let fullCount = depth, ropeThreshold = depth ? depth + 5 : 4;
  let rocks = [], mask = Array(144).fill(0), pending = [], time = 0, transition = true;
  let floorEnteredAt = 0, floorLeavingAt = null;
  let active = config.party[0], found = false, attempted = false;
  let countdown = 0, actions = 0, spent = 0, hits = 0, misses = 0, broken = 0;
  let toolId = input.tools.at(-1).id, status = 'running', settled = false;
  let replayManualTool = config.tool === 'adaptive' ? null : config.tool;
  let grandCount = input.grands[cave.id] || 0, exalt = 0, prisma = 0, bossCharged = false;
  let bossDefeated = Boolean(input.bosses?.[cave.id]);
  let lastAction = null, nextFrame = 0, replayDirty = false, grossRewards = null, eventCount = 0, exit = null;

  function replayEvent(type, detail = {}) {
    if (!options.replay) return;
    replayEvents.push({ type, ...detail, seconds: time / 100, depth: depth + 1 });
    replayDirty = true;
  }
  function record(type, detail = {}) {
    eventCount++;
    if (records.length < 2000) records.push({ time: time / 100, depth: depth + 1, type, ...detail });
    lastAction = { type, ...detail, seconds: time / 100, depth: depth + 1 };
    replayEvent(type, detail);
  }
  function later(ms, callback) { tasks.push({ remaining: ms, callback }); }
  function visualRolls(count) { for (let n = 0; n < count; n++) random.next(); }
  function dropVisual(r, reward, quantity) {
    // Reuse the six native cosmetic draws, including when replay is disabled.
    const dx = random.int(12, 16) * (-1) ** random.int(1, 2);
    const dy = random.int(8, 12) * (-1) ** random.int(1, 2);
    const moveSeconds = .6 + random.next() * (.8 - .6);
    const fadeSeconds = 2.5 + random.next() * (2.8 - 2.5);
    if (options.replay) {
      const [x, y] = _grid(r.slot);
      replayEvent('drop', { reward, quantity, slot: r.slot, x: x - 12, y: y - 16,
        name: reward === -1 ? 'Blingbag' : spelunkRewardImage(input, reward), dx, dy, moveSeconds, fadeSeconds });
    }
  }
  function celebration() {
    for (let group = 0; group < 7; group++) later(300 * group, () => {
      for (let n = 0; n < 30; n++) later(10 * n, () => visualRolls(5));
    });
  }
  for (const id of config.memorized) {
    const n = Math.floor(1 + shop[58] / 100);
    if ([0, 2, 4, 9].includes(id)) effects[id] = 1;
    else if ([3, 6, 7, 10].includes(id)) effects[id] += n;
    else if (id === 5) effects[id] += 2 * n;
  }
  const costMulti = () => (1 + Math.min(2, 2 * effects[9])) * Math.max(1, 4 * effects[10]) * (config.manic ? 30 : 1);
  const power = () => input.pow * Math.max(1, 100 * effects[10]) / (1 + Math.min(99, 99 * effects[9]))
    * _powerBoost(input, effects);
  function sprite(rock) {
    const name = rock.boss ? `CaveBoss${cave.id}` : rock.type >= 0
      ? `CaveRock${cave.letter}${rock.type}` : rock.type === -1 ? `CaveRockExit${cave.id}` : 'CaveRope';
    const art = SPELUNK_SPRITES[name];
    if (!art) throw new Error(`Missing native Spelunking dimensions: ${name}`);
    return { name, ...art };
  }
  function position(r) {
    const art = sprite(r), g = _grid(r.slot);
    const dy = r.riseAt == null ? 0 : _tween(0, -12, (time - r.riseAt) * 10, 300, _quadOut);
    const sx = r.hitAt == null ? 1 : _tween(1.32, 1, (time - r.hitAt) * 10, 800, _elasticOut);
    const sy = r.hitAt == null ? 1 : _tween(.82, 1, (time - r.hitAt) * 10, 800, _elasticOut);
    return {
      x: Math.round(g[0] - art.w / 2 + (r.boss ? 20 + cave.bossOffset[0] : 0)) + Math.round(art.w / 2),
      y: r.leaveAt != null ? _tween(r.leaveY, r.leaveY - 16, (time - r.leaveAt) * 10, 300, _quadOut)
        : Math.round(g[1] + (r.type === -1 ? 10 : 19) - art.h + (r.boss ? 40 + cave.bossOffset[1] : 0)) + art.h + dy,
      h: art.h * sy, w: art.w * sx, name: art.name,
    };
  }
  function within(r, x, y, radius) {
    const p = position(r);
    return _distance(p.x, p.y - p.h / 2, x, y) <= radius;
  }
  function generate() {
    floorEnteredAt = time; floorLeavingAt = null;
    flags[1] = flags[8] = 1;
    for (const n of mask) if (n === 1 && random.next() < .007) flags[5] = 1;
    mask = Array(144).fill(0);
    for (let n = 0; n < 16; n++) mask[52 + n + 8 * Math.floor(n / 4)] = 1;
    let cursor = 40;
    for (let ring = 0; ring < _lengths.length; ring++) for (let n = 0; n < _lengths[ring]; n++) {
      if (random.next() < (.97 - .02 * ring) * ((depth + 2) / (depth + 6 * (cave.id + 2 + Math.floor(cave.id / 2))))
        && _neighbors(cursor).some(d => mask[cursor + d] === 1)) mask[cursor] = 1;
      cursor += [1, 12, -1, -12][ring % 4];
    }
    let rope = -1, candidates = 0;
    for (let row = 2; row < 23; row++) if (rope === -1) {
      for (let j = 0; j < Math.round(row - Math.max(0, 2 * (row - 11)) + 1); j++) {
        const slot = 12 * row - 11 * j;
        if (slot % 13 !== 0 && mask[slot] === 1) {
          if ((random.next() < .1 + .05 * j || candidates === 7) && depth > 6 && depth > ropeThreshold) rope = slot;
          else candidates++;
        }
      }
    }
    let bossSlots = [];
    if (depth === cave.bossDepth) {
      const anchors = [];
      for (let s = 0; s < 132; s++) if (s % 12 < 10
        && Array.from({ length: 6 }, (_, k) => mask[s + k + 8 * Math.floor(k / 4)]).every(x => x === 1)) anchors.push(s);
      if (!anchors.length) throw new Error('The generated boss floor has no legal boss footprint.');
      const a = anchors[random.int(0, anchors.length - 1)];
      bossSlots = [a, a + 1, a + 2, a + 12, a + 13, a + 14];
    }
    rocks = [];
    function add(slot, type, boss = false) {
      const stats = type < 0 ? { hp: 1, requirement: 0, amber: 0 } : spelunkRockStats(cave, type, depth);
      if (!Number.isFinite(stats.hp) || stats.hp <= 0 || !Number.isFinite(stats.requirement)
        || !Number.isFinite(stats.amber)) throw new Error('Rock values exceed the supported numeric range.');
      const rock = { slot, type, boss, ...stats, maxHP: stats.hp, hidden: false, potion: false, riseAt: null, hitAt: null };
      rocks.push(rock);
      later(4 * slot, () => { rock.riseAt = time; });
    }
    for (let slot = 0; slot < 144; slot++) if (mask[slot] === 1 && !bossSlots.includes(slot)) {
      if (slot === rope && random.next() < .25 && depth !== 0) add(slot, -2);
      else {
        let type = 0;
        for (let n = 1; n < cave.rocks.length - 1; n++) {
          const threshold = cave.rocks[n].depth;
          if (depth >= threshold) {
            if (random.next() >= (depth - threshold) / Math.max(1, depth - threshold + 2 * threshold) * 1.5) break;
            type = n;
          }
        }
        add(slot, type);
      }
    }
    if (bossSlots.length) add(bossSlots[0], cave.rocks.length - 1, true);
    const exits = Math.floor(Math.min(3, Math.max(1, 1 + random.next() + (shop[18] + input.holesBonus) / 100)));
    if (rocks.filter(r => r.type >= 0 && !r.boss).length < exits) throw new Error('Too few rocks for native exit placement.');
    function choose(test) {
      let r;
      do { r = rocks[random.int(0, rocks.length - 1)]; } while (!test(r));
      return r;
    }
    for (let n = 0; n < exits; n++) choose(r => r.type >= 0 && !r.boss && !r.hidden).hidden = true;
    if ((depth + 1) % 5 === 0 && shop[36] >= 1 && config.elixirs.some(id => id >= 0))
      choose(r => r.type >= 0 && !r.boss && !r.hidden).potion = true;
    found = false;
    if (config.policy === 'auto') toolId = input.tools.filter(t => input.overuse || stamina[active] >= t.cost).at(-1)?.id ?? 0;
    record('floor');
  }
  function refill() {
    let slot = random.int(0, 4);
    for (let i = 0; i < 50 && !(config.elixirs[slot] >= 0); i++) slot = random.int(0, 4);
    if (config.elixirs[slot] >= 0) {
      charges[slot]++;
      visualRolls(6);
    }
  }
  function hit(r, damage, source = 'dig') {
    if (r.type < 0 || transition) return;
    attempted = true;
    for (const rope of rocks) if (rope.type === -2) { rope.type = -3; visualRolls(15 * 6); }
    const ratio = power() / r.requirement;
    if (random.next() > ratio ** .6) {
      misses++; flags[4] = 1;
      if (options.replay) replayEvent('miss', { ...position(r), slot: r.slot, source });
      return;
    }
    hits++;
    r.hitAt = time;
    if (shop[34] >= 1) damage *= 1 + Math.max(0, Math.floor(getLOG(ratio)) - 1);
    const dealt = damage * (1 + shop[33] / 100);
    r.hp -= dealt;
    if (options.replay) replayEvent('hit', { ...position(r), slot: r.slot, damage: dealt, source });
  }
  function destroy() {
    for (let index = 0; index < rocks.length; index++) {
      const r = rocks[index];
      if (r.type < 0 || r.hp > 0) continue;
      broken++;
      if (options.replay) replayEvent('break', { ...position(r), slot: r.slot });
      visualRolls(2 * 5);
      const drops = [];
      function drop(reward, quantity = 1) {
        if (!rewardOrder.includes(reward)) rewardOrder.push(reward);
        rewards[reward] += quantity;
        drops.push({ reward, quantity });
      }
      if (random.next() < Math.min(.8, (shop[7] + shop[52]) / 100 / (1 + 9 * shop[67]))) {
        const amount = input.amber * _amberBoost(input, effects)
          * (1 + 10 * effects[12] / 100) * (1 + shop[21] * (depth + 1) / 150)
          * (1 + shop[35] * fullCount / 100) * r.amber;
        drop(0, amount);
        const extra = Math.floor(random.next() + (5 + shop[42] + 25 * effects[6]) / 100 / (1 + 19 * shop[67]));
        for (let n = 0; n < extra; n++) drop(0, amount);
      }
      if (random.next() < (1 + shop[28] / 100) / (100 * 1.5 ** (input.prisma + prisma)) && shop[28] > 0) { drop(1); prisma = Math.round(exalt + 1); }
      if (random.next() < (1 + shop[27] / 100) / (60 * 8 ** (input.exalt + exalt)) && shop[27] > 0) { drop(2); exalt++; }
      if (random.next() < .002 * (1 + shop[29] / 100) && shop[29] > 0) {
        if (random.next() < .6) drop(3);
        else if (random.next() < .04) drop(4);
        else { random.next(); drop(5); }
      }
      if (random.next() < 1e-4 * (1 + shop[30] / 100) && shop[30] > 0) drop(7);
      if (random.next() < depth / (depth + 40) * .2 && [0, 2, 4, 6].includes(cave.id)) {
        drop(8 + cave.id / 2, Math.min(1e6, Math.max(1, Math.max(0, depth - 10) ** 2 + 2 * depth + 1)));
      }
      if (random.next() < (input.bags === 0 ? 0 : (.025 - depth / (depth + 50) * .014) * Math.max(1, 1 + 50 * (input.bags - 1) / 100))) {
        effects[12]++; dropVisual(r, -1, 1);
      }
      for (const d of drops) dropVisual(r, d.reward, d.quantity);
      if (r.potion) refill();
      if (r.boss && !bossCharged) { for (let n = 0; n < shop[37]; n++) refill(); bossCharged = true; record('boss'); }
      if (r.boss && !bossDefeated) { bossDefeated = true; celebration(); }
      if (!r.boss) {
        const name = cave.rocks[r.type].name;
        if (!discovered.has(name)) { discovered.add(name); record('discovery', { name }); }
        else if (r.type === cave.rocks.length - 2 && shop[43] >= 1 && grandCount < 10
          && random.next() < input.grand / 2 ** grandCount * (1 + Math.min(4, 4 * effects[9]))) {
          grandCount++; pending.push({ type: 'grand', remaining: 12000 }); record('grand-discovery');
        }
      }
      if (effects[5] > 0) _neighbors(r.slot).forEach((d, n) => {
        if (random.next() < input.elixirs[5].quantity / 100)
          pending.push({ type: 'adjacent', remaining: 202 + 5 * n, depth, slot: r.slot + d, damage: input.tools[0].damage });
      });
      if (r.hidden && !found) {
        r.type = -1; r.hp = 1; r.riseAt = r.hitAt = null; found = true;
        if (config.policy === 'auto') countdown = 130;
        record('exit-found');
      } else { rocks.splice(index, 1); index--; }
    }
  }
  function nova() {
    ropeThreshold += 4;
    pending.push({ type: 'nova', remaining: 600, start: time,
      damage: input.tools.find(t => t.id === (shop[40] >= 1 ? input.tools.at(-1).id : toolId)).damage, seen: new Set() });
  }
  function useElixir(slot) {
    const id = config.elixirs[slot];
    if (id < 0 || charges[slot] <= 0 || ready[slot] !== 0 || [0, 2].includes(id) && effects[id] >= 1) return false;
    if (random.next() >= input.nonconsume) charges[slot]--;
    if (random.next() < shop[39] / 100) nova();
    if ([0, 2, 4, 9].includes(id)) effects[id] = 1;
    else if (id === 3) effects[3] += spent;
    else if (id === 5) effects[5] += 2;
    else if ([6, 7, 10].includes(id)) effects[id]++;
    else if (id === 8) nova();
    else if (id === 1) {
      const target = rocks.find(r => r.hidden);
      if (target) {
        const angle = random.int(0, 359) * Math.PI / 180, radius = random.int(0, 150), g = _grid(target.slot);
        radar = { x: Math.round(g[0] + Math.cos(angle) * radius), y: Math.round(g[1] + Math.sin(angle) * radius), depth };
      }
    }
    if (charges[slot] <= 0) ready[slot] = 2;
    visualRolls(7 * random.int(4, 5));
    actions++; record('elixir', { id, slot });
    return true;
  }
  let radar = null;
  function chooseElixir() {
    const manual = config.policy !== 'auto';
    for (let slot = 0; slot < charges.length; slot++) {
      const id = config.elixirs[slot];
      if (id < 0 || charges[slot] <= 0 || ready[slot] !== 0) continue;
      let use = id === 0 && !effects[0] || id === 2 && !effects[2] || [6, 7].includes(id);
      if (id === 1 && flags[1]) { use = true; flags[1] = 0; }
      if (id === 3) use = spent > .6 * config.party.reduce((sum, _, i) => sum + input.characters[i].max, 0);
      if (id === 4) use = flags[4] === 1
        && (!effects[4] || 5 / (1 + input.elixirs[4].quantity / 100) ** (effects[4] - 1) < 1);
      if (id === 5 && flags[5]) { use = true; flags[5] = 0; }
      if (id === 8 && flags[8] && !effects[5]) { use = true; flags[8] = 0; }
      if (manual && id === 9) use = !effects[9];
      if (manual && id === 10) use = flags[4] === 1 && !effects[10];
      if (use && useElixir(slot)) return true;
    }
    return false;
  }
  function dig(x, y, tool) {
    const cost = tool.cost * costMulti();
    if (stamina[active] === 0 || !input.overuse && tool.id !== 0 && Math.ceil(stamina[active]) < cost) {
      if (config.policy === 'auto') while (toolId > 0 && (!input.tools.some(t => t.id === toolId)
        || stamina[active] < input.tools.find(t => t.id === toolId).cost)) toolId--;
      return;
    }
    attempted = false;
    for (const r of rocks) if (within(r, x, y, tool.radius)) hit(r, tool.damage);
    if (!attempted) return;
    const before = stamina[active];
    if (effects[0] > 0) stamina[active] += cost * input.elixirs[2].quantity / 100;
    stamina[active] = Math.max(0, stamina[active] - cost);
    spent += Math.min(input.characters[active].max, cost);
    actions++; record('dig', { x, y, tool: tool.id, character: active, used: before - stamina[active] });
    if (random.next() < shop[31] * (1 + Math.min(.5, effects[7])) / 100) {
      const count = Math.floor(1 + (shop[32] + input.elixirs[7].quantity * effects[7]) / 100 + random.next());
      for (let n = 0; n < count && n < rocks.length; n++) {
        const r = rocks[random.int(0, rocks.length - 1)];
        if (r.type < 0 || r.hp <= 0) continue;
        random.next();
        const facing = random.int(0, 1), p = position(r);
        const art = SPELUNK_SPRITES[`CaveTool${tool.id}`];
        pending.push({ type: 'shadow', depth, remaining: 202 + 5 * n, damage: tool.damage, tool: tool.id,
          x: Math.round(p.x + (20 * Number(r.boss) + (25 * facing - 4 - p.w / 2))) + Math.round(art.w / 4) + 14 * (-1) ** facing,
          y: Math.round(p.y + (40 * Number(r.boss) + (-20 - p.h))) + Math.round(art.h / 1.3) + 7 });
      }
    }
  }
  function descend() {
    if (!rocks.some(r => r.type >= 0)) fullCount++;
    effects[5] = Math.max(0, effects[5] - 1);
    if (effects[4] > 0) effects[4]++;
    transition = true; found = false; radar = null; record('descend');
    floorLeavingAt = time;
    const oldRocks = rocks;
    for (const r of oldRocks) later(4 * r.slot, () => {
      r.leaveY = position(r).y; r.leaveAt = time;
    });
    later(876.0000000000001, () => { rocks = []; });
    later(930, () => {
      depth++; generate();
      later(930, () => { transition = false; });
    });
  }
  function settle(reason) {
    status = reason;
    if (reason !== 'exhausted') return;
    settled = true;
    grossRewards = [...rewards];
    exit = { type: 'toll', retained: 1 - shop[19] / 100, items: [] };
    for (const i of rewardOrder) {
      rewards[i] *= 1 - shop[19] / 100;
      const expected = rewards[i], chance = expected - Math.floor(expected);
      const roundedUp = i === 0 ? null : random.next() < chance;
      if (i !== 0) rewards[i] = roundedUp ? Math.ceil(expected) : Math.floor(expected);
      exit.items.push({ reward: i, gross: grossRewards[i], expected, chance: i === 0 ? null : chance,
        roundedUp, collected: rewards[i] });
    }
    record(reason);
  }
  function decision() {
    const manual = config.policy !== 'auto';
    if (chooseElixir()) { countdown = manual ? -36 + Math.ceil(config.reactionMs / 10) : -15; return; }
    const live = rocks.filter(r => r.type >= 0);
    const clear = manual ? config.policy === 'clear' : config.fullClear;
    const grand = pending.some(p => p.type === 'grand');
    if (manual && found && !grand && (!clear || !live.length)) { descend(); return; }
    if (!manual && found && !clear) { if (!grand) descend(); return; }
    if (!live.length && (!found || manual)) {
      if (!found && !pending.some(p => ['nova', 'shadow', 'adjacent'].includes(p.type))) settle('blocked');
      return;
    }
    let best = null, bestScore = -1;
    const tools = manual ? input.tools.filter(t => (config.tool === 'adaptive' || t.id === config.tool)
      && (input.overuse || t.id === 0 || Math.ceil(stamina[active]) >= t.cost * costMulti())) : [input.tools.find(t => t.id === toolId)];
    if (manual && !tools.length) tools.push(input.tools[0]);
    for (const tool of tools) {
      const points = manual ? live.map(r => { const p = position(r); return [p.x, p.y - p.h / 2]; })
        : Array.from({ length: 25 }, () => { const g = _grid(random.int(0, 143)); return [g[0] + random.int(-20, 20), g[1] + random.int(-20, 20)]; });
      for (const [x, y] of points) {
        let count = 0, score = 0;
        for (const r of live) if (within(r, x, y, tool.radius)) {
          count++;
          const chance = Math.min(1, (power() / r.requirement) ** .6);
          const damage = tool.damage * (1 + shop[33] / 100);
          score += config.policy === 'dive'
            ? chance * (Number(damage >= r.hp) + .05 * Math.min(1, damage / r.hp))
            : Math.min(r.hp, damage) * chance;
        }
        if (!count) continue;
        if (!manual) score = count;
        else score /= tool.cost * costMulti() * (effects[0] ? .7 : 1);
        if (manual && radar?.depth === depth && !found && _distance(x, y, radar.x, radar.y) < 170) score *= 1.1;
        if (score > bestScore) { bestScore = score; best = { x, y, tool, count }; }
      }
    }
    if (best) {
      if (manual) replayManualTool = best.tool.id;
      dig(best.x, best.y, best.tool);
    }
    if (!manual && (best?.count || 0) < input.tools.find(t => t.id === toolId).cost && toolId > 0)
      toolId = input.tools.filter(t => t.id < toolId).at(-1).id;
    if (!manual && found && !grand && (!clear || !rocks.some(r => r.type >= 0))) descend();
    if (manual) countdown = -36 + Math.ceil(config.reactionMs / 10);
  }
  function frame() {
    return { seconds: time / 100, depth: depth + 1, active, tool: config.policy === 'auto' ? toolId : replayManualTool,
      stamina: config.party.map(id => stamina[id]),
      effects: [...effects], charges: [...charges], rewards: [...rewards], lastAction: lastAction && { ...lastAction },
      tiles: mask.flatMap((v, i) => v === 1 ? [i] : []),
      floorAnimation: { enteredAt: floorEnteredAt, samePass: floorEnteredAt > 0, leavingAt: floorLeavingAt },
      rocks: rocks.filter(r => r.type !== -3).map(r => ({ slot: r.slot, type: r.type, boss: r.boss, hp: r.hp, maxHP: r.maxHP, hitAt: r.hitAt,
        alpha: r.leaveAt != null ? _tween(1, 0, (time - r.leaveAt) * 10, 300, t => t)
          : r.type === -1 ? 1 : r.riseAt == null ? 0 : _tween(0, 1, (time - r.riseAt) * 10, 300, t => t),
        ...position(r) })),
      radar: radar && { ...radar } };
  }
  function capture() {
    if (!options.replay) return;
    snapshots.push(frame()); nextFrame = time + 10; replayDirty = false;
  }
  function advanceEffects() {
    for (const p of pending) {
      p.remaining--;
      if (p.type === 'nova' && p.remaining > 450 && p.remaining % 5 === 0) {
        const scale = _tween(.1, 2, (time - p.start) * 10, 1350, _quadOut);
        if (!transition) for (const r of rocks) {
          const g = _grid(r.slot);
          const size = 100 * scale;
          if (!p.seen.has(r.slot) && _distance(65 + size / 50 * 49, 520 + size / 50 * 49, ...g) < size / 50 * 193 + 30) {
            p.seen.add(r.slot); if (random.next() < shop[38] / 100) hit(r, p.damage, 'nova');
          }
        }
      } else if (!transition && p.depth === depth) {
        if (p.type === 'adjacent' && p.remaining === 185) {
          const r = rocks.find(r => r.slot === p.slot); if (r) hit(r, p.damage, 'adjacent');
        } else if (p.type === 'shadow' && p.remaining === 134)
          for (const r of rocks) if (within(r, p.x, p.y, input.tools.find(t => t.id === p.tool).radius)) hit(r, p.damage, 'shadow');
      }
    }
    pending = pending.filter(p => p.remaining >= 0);
  }
  later(930, () => { transition = false; });
  generate(); capture();
  return {
    get done() { return status !== 'running'; },
    get seconds() { return time / 100; },
    get progress() {
      return status !== 'running' ? 1 : Math.max(0, Math.min(.99,
        1 - config.party.reduce((sum, id) => sum + stamina[id], 0) / startingStamina));
    },
    step(count = 1000) {
      _integer(count, 1, 100000, 'step count');
      for (let n = 0; n < count && status === 'running'; n++) {
        time++;
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          task.remaining -= 10;
          if (task.remaining <= 0) { task.callback(); tasks.splice(i--, 1); }
        }
        if (!transition) destroy();
        advanceEffects();
        {
          if (stamina[active] <= 0) {
            if (effects[2] > 0 && random.next() < .5) {
              effects[2] = 0; stamina[active] = input.characters[active].max * Math.min(.5, input.elixirs[2].quantity / 100);
            } else {
              effects[0] = effects[2] = 0;
              const next = config.party.find(id => stamina[id] > 0);
              if (next == null) { if (!transition) settle('exhausted'); }
              else { active = next; if (input.switchNova) nova(); record('switch', { character: active }); }
            }
          }
          if (status === 'running' && !transition) {
            countdown = Math.round(countdown - (config.policy === 'auto' ? 1 + config.speed + Math.floor(config.speed / 4) : 1));
            if (countdown < -35) { countdown = 0; decision(); }
          }
        }
        for (let slot = 0; slot < charges.length; slot++) if (charges[slot] > 0 && ready[slot] === 2) {
          ready[slot] = 2.1;
          later(800, () => { ready[slot] = 0; });
        }
        if (options.replay && (replayDirty || time >= nextFrame)) capture();
      }
    },
    result() {
      return { config, seed: options.seed ?? 1, status, settled, seconds: time / 100, startDepth: startDepth + 1, depth: depth + 1,
        actions, spent, hits, misses, broken, rewards: [...rewards], grossRewards: [...(grossRewards || rewards)],
        rewardState: settled ? 'collected' : 'uncollected',
        exit: exit && { ...exit, items: exit.items.map(item => ({ ...item })) },
        stamina: config.party.map(id => ({ id, start: start[id], end: stamina[id], max: input.characters[id].max })),
        grands: grandCount - (input.grands[cave.id] || 0), discoveries: [...discovered].filter(n => !input.discoveries.includes(n)),
        rngCalls: random.calls, events: records.map(r => ({ ...r })), eventsDropped: eventCount - records.length,
        frames: options.replay ? [...snapshots.filter(f => f.seconds < time / 100), frame()] : [],
        replayEvents: replayEvents.map(e => ({ ...e })), frameIntervalSeconds: .1,
        notes: [...input.notes, ...(config.elixirs.includes(11) ? ['The unlabeled elixir has no effect branch in the current game source.'] : [])] };
    },
  };
}

export function simulateSpelunkExpedition(input, config, options = {}) {
  const run = createSpelunkExpedition(input, config, options);
  while (!run.done) run.step(5000);
  return run.result();
}
