import { applyCombatSetupDetailed, characterOptions } from '../stats/systems/common/combat-sim-setup.js';
import { killroyMapIds } from '../stats/systems/common/combat-sim-killroy.js';

const PREFIX = 'killroy-replay:';

export function captureKillroyReplay(raw, job, label) {
  const applied = applyCombatSetupDetailed(raw, job.setup);
  return { version: 1, raw: applied.raw, charIdx: job.charIdx, mapIdx: job.mapIdx, seconds: job.seconds,
    seed: job.seed, label, keepBuffs: !!job.inputOverrides.useSavedBuffs,
    unlimitedInventory: !!job.inputOverrides.unlimitedInventory,
    toggles: job.setup?.toggles || {}, terms: job.setup?.termOverrides || {} };
}

export function storeKillroyReplay(store, token, payload) {
  _validate(payload);
  store.setItem(PREFIX + token, JSON.stringify(payload));
  return 'combat-sim-calc.html#killroy-replay=' + encodeURIComponent(token);
}

export function readKillroyReplay(store, hash) {
  if (!hash.startsWith('#killroy-replay=')) return null;
  const token = decodeURIComponent(hash.slice('#killroy-replay='.length));
  const text = store.getItem(PREFIX + token);
  if (!text) throw new Error('Captured Killroy replay is missing. Open it again from the Killroy results.');
  const payload = JSON.parse(text);
  _validate(payload);
  store.removeItem(PREFIX + token);
  return payload;
}

function _validate(p) {
  if (p?.version !== 1 || !p.raw || typeof p.label !== 'string'
    || !Number.isInteger(p.charIdx) || !characterOptions(p.raw).some(c => c.ci === p.charIdx)
    || !killroyMapIds().includes(p.mapIdx) || !Number.isFinite(p.seconds) || p.seconds < 1 || p.seconds > 86400
    || !Number.isInteger(p.seed) || p.seed < 1 || p.seed > 0xffffffff) {
    throw new Error('Invalid captured Killroy replay');
  }
}
