import { mountCombatFarming, farmingEscape as esc, farmingFormat as number, farmingWarnings } from './combat-farming.js';
import { buildStatueCombatPlan, summarizeStatueCombat } from '../stats/systems/common/statue-combat.js';
import { combatFarmingMaps } from '../stats/systems/common/combat-farming.js';
import { STATUE_COUNT, statueInfo } from '../stats/data/common/statues.js';

export function mountStatueCombat(host, { onApply }) {
  return mountCombatFarming(host, {
    title: 'Measure statue farming', characterControl: false, upgradeControl: false,
    intro: 'Uses the planner character above and a captured loadout. Measure one map or compare accessible maps, then explicitly copy one map\'s simultaneous raw pickup rates into the ETA table. Targets and deposit bonuses stay unchanged.',
    state: { mapId: '', allMaps: false, target: '0', manualDeposits: true },
    refreshControls: ['allMaps'],
    extraControls({ raw, state, select, checkbox }) {
      const maps = raw ? combatFarmingMaps(raw, state.charIdx) : [];
      if (!maps.some(m => String(m.id) === state.mapId)) state.mapId = String(maps[0]?.id ?? '');
      return select('mapId', 'Combat map', maps.map(m => ({ key: String(m.id), name: 'W' + m.world + ' - ' + m.name })), state.mapId)
        + checkbox('allMaps', 'Compare all accessible maps')
        + select('target', 'Rank by statue', Array.from({ length: STATUE_COUNT }, (_, i) => ({ key: String(i), name: statueInfo(i).name })), state.target)
        + checkbox('manualDeposits', 'Keep raw statues for manual deposits');
    },
    buildPlan: (raw, options) => buildStatueCombatPlan(raw, { ...options, target: Number(options.target) }),
    renderResults({ plan, records, identity, stale }) {
      const rows = summarizeStatueCombat(plan, records);
      const sorted = rows.map((row, index) => ({ row, index })).sort((a, b) => (b.row.rates['statue' + plan.target] ?? -1) - (a.row.rates['statue' + plan.target] ?? -1));
      return '<p class="cw-note"><strong>' + esc(identity) + '</strong> &middot; ' + plan.seconds / 60 + ' minutes &times; '
        + plan.seeds.length + ' seeds per map &middot; ' + (plan.keepBuffs ? 'saved buffs retained' : 'fresh map-entry buffs')
        + ' &middot; ' + (plan.unlimitedInventory ? 'unlimited inventory' : 'real inventory limits') + '</p>'
        + (plan.manualDeposits ? '<p class="cw-warning">Manual-deposit scenario: automatic Zenith Cluster conversion is disabled in these simulations only. Disable it in game to retain these raw statues for deposits.</p>'
          : plan.zenith ? '<p class="cw-warning">Zenith conversion is active. Gross pickups may be consumed automatically, so these rates cannot be applied to manual-deposit ETAs.</p>' : '')
        + '<table class="data-table cw-table"><thead><tr><th>Map</th><th>' + esc(statueInfo(plan.target).name) + '/hr</th><th>All statues/hr</th><th>Kills/hr</th><th>Runs / deaths</th><th>ETA inputs</th></tr></thead><tbody>'
        + sorted.map(({ row: r, index }) => '<tr><td data-label="Map">' + esc(r.label)
          + '<details class="cw-note"><summary>Raw statues/hr</summary>'
          + Array.from({ length: STATUE_COUNT }, (_, i) => '<div>' + esc(statueInfo(i).name) + ': ' + number(r.rates['statue' + i] ?? null) + '</div>').join('') + '</details></td>'
          + '<td class="num" data-label="Target statues/hr">' + number(r.rates['statue' + plan.target] ?? null) + '</td>'
          + '<td class="num" data-label="All statues/hr">' + number(r.rates.total ?? null) + '</td>'
          + '<td class="num" data-label="Kills/hr">' + number(r.killsPerHour) + '</td>'
          + '<td class="num" data-label="Runs / deaths">' + r.runs + '/' + plan.seeds.length + ' / ' + r.deaths + (r.errors.length ? ' - failed' : '') + '</td>'
          + '<td data-label="ETA inputs"><button type="button" data-farm-action="' + index + '"' + (stale || !r.complete || !plan.canApply ? ' disabled' : '') + '>Use this map\'s rates</button></td></tr>').join('')
        + '</tbody></table><p class="cw-note">Rates count newly picked statues, not inventory balances, dropped-but-uncollected items, or Zenith EXP. '
        + 'Use rates replaces every rate for this character with one map\'s measured rates, including observed zeros; it never combines the best rates from different maps. '
        + 'A zero means none observed, not an impossible drop. Short runs can miss rare statues. Incomplete or stale results cannot overwrite rates. '
        + 'These are active-combat samples, not offline claims.</p>' + farmingWarnings(plan, rows);
    },
    onAction(action, { plan, records, stale, state }, button) {
      const row = summarizeStatueCombat(plan, records)[Number(action)];
      if (!row?.complete || stale || !plan.canApply || plan.charIdx !== state.charIdx) throw new Error('Rerun a complete, current manual-deposit measurement before applying rates');
      onApply(plan.charIdx, Object.fromEntries(Array.from({ length: STATUE_COUNT }, (_, i) => [i, String(row.rates['statue' + i])])), row.label);
      button.textContent = 'Rates applied';
    },
  });
}
