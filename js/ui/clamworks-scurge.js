import { buildClamworksScurgePlan, summarizeClamworksScurge } from '../stats/systems/w7/clamworks-scurge.js';
import { mountCombatFarming, farmingEscape as esc, farmingFormat as fmt, farmingWarnings } from './combat-farming.js';

export function mountClamworksScurge(host, { mode = 'affliction' } = {}) {
  if (mode !== 'affliction' && mode !== 'upgrades') throw new Error('Unknown Scurge comparison mode');
  const upgrades = mode === 'upgrades';
  return mountCombatFarming(host, {
    characterControl: false, upgradeControl: false,
    title: upgrades ? 'Scurge upgrade optimization' : 'Self Affliction comparison',
    runLabel: upgrades ? 'Optimize Scurge upgrades' : 'Compare Self Affliction',
    state: { minutes: 5, seeds: 3, maxAffliction: 12, otherPlayers: 0 },
    intro: upgrades
      ? 'Holds Self Affliction at the selected loadout level and allocates only unspent points to unlocked EXP upgrades. Compares against the unchanged loadout; does not use results from the Affliction comparison.'
      : 'Tests Self Affliction from zero to the selected limit while keeping every other upgrade exactly unchanged. Refunded points stay unspent; no upgrade allocation is performed.',
    extraControls: ({ state }) => (upgrades ? '' : '<label>Maximum Self Affliction level <input type="number" min="0" max="150" step="1" data-cw-field="maxAffliction" value="' + state.maxAffliction + '"></label>')
      + '<label>Other real players on map <input type="number" min="0" max="50" step="1" data-cw-field="otherPlayers" value="' + state.otherPlayers + '"></label>',
    buildPlan: (raw, options) => buildClamworksScurgePlan(raw, { ...options, mode }),
    renderResults({ plan, records, identity }) {
      const rows = summarizeClamworksScurge(plan, records);
      const done = rows.every(row => row.complete);
      const best = done ? rows.reduce((a, b) => b.expPerHour > a.expPerHour ? b : a) : null;
      const sorted = [rows[0], ...rows.slice(1).sort((a, b) => (b.expPerHour ?? -Infinity) - (a.expPerHour ?? -Infinity))];
      const delta = n => n == null ? '&mdash;' : (n > 0 ? '+' : '') + fmt(n);
      let html = '<p class="cw-note">' + esc(identity) + ' - Scurge level ' + plan.rank + ', ' + plan.available + ' unspent points; '
        + plan.seconds / 60 + ' minutes &times; ' + plan.seeds.length + ' seeds per allocation; '
        + plan.otherPlayers + ' other real players. '
        + (upgrades ? 'Self Affliction stays at ' + plan.rows[0].selfAffliction + ' for both configurations.'
          : 'Tests Self Affliction 0-' + plan.maximum + ' plus the saved baseline; every other upgrade stays unchanged.') + '</p>';
      if (best) html += '<p class="cw-note"><strong>Best measured Scurge EXP/hour: ' + esc(best.label) + '</strong> - ' + fmt(best.expPerHour)
        + ' EXP/hr; ' + delta(best.pearlGainPerHour) + ' pearl currency/hr versus current.</p>';
      else html += '<p class="cw-note">A recommendation appears only when every configuration completes all seeds.</p>';
      html += '<table class="data-table cw-table"><thead><tr><th>Allocation</th><th>Scurge EXP/kill</th><th>Scurge EXP/hr</th>'
        + '<th>EXP gain/hr</th><th>Pearl currency/hr</th><th>Pearl gain/hr</th><th>Kills/hr</th><th>Runs / deaths</th></tr></thead><tbody>';
      for (const row of sorted) {
        html += '<tr><td data-label="Allocation">' + esc(row.label) + '<small>Self Affliction ' + row.selfAffliction + '; ' + row.pointsLeft + ' points left</small>'
          + (row.complete ? '' : '<small>' + (row.errors.length ? 'Failed' : row.runs === plan.seeds.length ? 'Ended early' : 'Incomplete') + '</small>')
          + (upgrades ? '<details><summary>Upgrade changes</summary>' + (row.changes.length ? '<ul>' + row.changes.map(c => '<li>' + esc(c.name) + ': ' + c.from + ' &rarr; ' + c.to + '</li>').join('') + '</ul>' : 'Keep saved allocation') + '</details>' : '') + '</td>'
          + '<td data-label="Scurge EXP/kill">' + fmt(row.expPerKill) + '</td>'
          + '<td data-label="Scurge EXP/hr">' + fmt(row.expPerHour) + '</td>'
          + '<td data-label="EXP gain/hr">' + delta(row.expGainPerHour) + '</td>'
          + '<td data-label="Pearl currency/hr">' + fmt(row.pearlsPerHour) + '</td>'
          + '<td data-label="Pearl gain/hr">' + delta(row.pearlGainPerHour) + '</td>'
          + '<td data-label="Kills/hr">' + fmt(row.killsPerHour) + '</td>'
          + '<td data-label="Runs / deaths">' + row.runs + '/' + plan.seeds.length + ' / ' + row.deaths + (row.errors.length ? ' - failed' : '') + '</td></tr>';
      }
      return html + '</tbody></table><p class="cw-note">Self Affliction divides normal damage by 100 per level, not the actual clam HP. '
        + 'Saved form-specific damage is resolved by the combat simulator rather than applying a second penalty here. '
        + (upgrades ? 'Only unspent points are allocated across unlocked Reckoning, Even Better and effective Swarming to maximize immediate EXP per kill; Self Affliction and all other upgrades stay at their selected loadout levels. '
          : 'Only Self Affliction changes. Lower levels refund points without spending them elsewhere; higher levels use the available point budget. '
            + (plan.rows[0].selfAffliction > 0 ? 'To lower Self Affliction, hold it to reset, then buy the target level. Other upgrades are not refunded. ' : ''))
        + 'This does not optimize utility purchases, future level retention or promotions. Scurge EXP banks during combat; claim levels by opening the Scurge menu in game. '
        + 'Each trial holds the starting Scurge level/allocation fixed. This is best measured within the displayed configurations, not a global or statistically confirmed optimum; '
        + 'pearl income can be noisy when Pure Pearls are rare. No save, loadout or in-game allocation is changed.</p>' + farmingWarnings(plan, rows);
    },
  });
}
