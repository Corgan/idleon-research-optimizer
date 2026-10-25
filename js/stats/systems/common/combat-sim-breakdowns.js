// ===== COMBAT STAT INSPECTION (common) =====
import { allDescriptors } from '../../registry.js';

const INPUTS = {
  'drop-rate': 'dropRate', 'coin-multi': 'monsterCash', 'monster-exp': 'expMulti',
  'card-drop-chance-multiplier': 'cardChanceMulti', 'kill-per-kill': 'killPerKill',
  'multikill-total': 'multikillTotal', damage: 'damageMax', accuracy: 'accuracy',
  defence: 'playerDefence', 'max-hp': 'playerMaxHp', 'max-mp': 'playerMaxMp',
  'crit-chance': 'critChance', 'crit-damage': 'critDamage',
  'movement-speed': 'playerSpeedBonus', 'giant-mob': 'giantMob',
  'printer-sample-size': 'printerSampleSize',
};
const GROUPS = [
  ['Rewards', ['drop-rate', 'coin-multi', 'monster-exp', 'card-drop-chance-multiplier']],
  ['Damage & accuracy', ['damage', 'accuracy', 'hit-chance', 'accuracy-required', 'crit-chance', 'crit-damage']],
  ['Character stats', ['total-str', 'total-agi', 'total-wis', 'total-luk', 'max-hp', 'max-mp', 'defence', 'movement-speed']],
  ['Kill credit', ['overkill-tier', 'multikill-base', 'multikill-per-tier', 'multikill-total', 'kill-per-kill']],
  ['Spawns & inventory', ['crystal-spawn', 'giant-mob', 'printer-sample-size']],
  ['AFK estimates', ['fighting-afk', 'raw-combat-kills-per-hour', 'combat-survivability',
    'reward-roll-kills-per-hour', 'credited-kills-per-hour', 'class-exp-per-hour', 'panel-coins-per-hour', 'direct-card-average-time']],
];

function _plainTree(node) {
  return {
    name: node.name, val: Number(node.val), fmt: node.fmt, note: node.note || node.reason || '',
    children: node.children?.map(_plainTree) || null,
  };
}

export function combatBreakdownStatus(node) {
  if (node?.error) return 'error';
  if (node?.notApplicable) return 'not applicable';
  if (node?.unavailable) return 'unavailable';
  if (node?.partial) return 'partial';
  if (node?.overridden) return 'override';
  return 'ok';
}

// Called while the input builder's buff/Cove/term scopes are still installed.
export function buildCombatStatBreakdowns(ctx, entries = {}, { afk = false } = {}) {
  if (!ctx) throw new Error('Stat breakdown context unavailable.');
  const catalog = allDescriptors();
  const groups = GROUPS.map(([name, ids]) => [name, ids.slice()]);
  groups.find(([name]) => name === 'Spawns & inventory')[1].push(
    ...catalog.filter(d => d.id.startsWith('carry-capacity-')).map(d => d.id));
  const rows = [];
  for (const [group, ids] of groups) {
    if (!afk && group === 'AFK estimates') continue;
    for (const id of ids) {
      const desc = catalog.find(d => d.id === id);
      try {
        if (!desc) throw new Error('Unknown combat descriptor: ' + id);
        const formula = ctx.resolve(id);
        if (!formula.unavailable && !formula.notApplicable && !Number.isFinite(formula.val))
          throw new Error('Non-finite stat result: ' + id);
        const key = !afk && INPUTS[id], entry = key && entries[key];
        const changed = entry && (entry.overridden || entry.value !== formula.val);
        const node = changed ? {
          name: desc.name, val: entry.value, fmt: formula.fmt,
          note: 'Effective simulator input; the formula below is replaced, not added. ' + (entry.note || ''),
          children: [{ ...formula, name: 'Formula before final input replacement' }],
        } : { ...formula };
        rows.push({
          id, group, name: desc.name, input: key || null, node: _plainTree(node),
          status: combatBreakdownStatus(entry ? { ...formula, ...entry } : formula),
          reason: [formula.reason, entry?.note].filter(Boolean).join(' '),
          source: entry?.source || id,
        });
      } catch (error) {
        rows.push({ id, group, name: desc?.name || id, status: 'error', reason: error.message, node: null });
      }
    }
  }
  return rows;
}
