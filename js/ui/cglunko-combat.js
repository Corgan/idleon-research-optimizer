import { mountCombatFarming, farmingEscape as esc, farmingFormat as number, farmingWarnings } from './combat-farming.js';
import { buildCoveCombatPlan, summarizeCoveCombat, COVE_STONE_NAMES } from '../stats/systems/w5/cglunko-combat.js';

export function mountCoveCombat(host) {
  return mountCombatFarming(host, {
    title: 'Active Cove farming comparison', runLabel: 'Compare Cove farming',
    intro: 'Simulates the selected loadout on The Cove (C18), including movement, skills, Multikill, focused stones and actual pickups. Each configuration starts independently; nothing is purchased or saved.',
    state: { focuses: false },
    extraControls: ({ checkbox }) => checkbox('focuses', 'Compare stone focuses'),
    buildPlan: buildCoveCombatPlan,
    renderResults({ plan, records, identity }) {
      const rows = summarizeCoveCombat(plan, records);
      const cell = (label, text) => '<td class="num" data-label="' + label + '">' + text + '</td>';
      return '<p class="cw-note"><strong>' + esc(identity) + '</strong> &middot; The Cove &middot; '
        + plan.seconds / 60 + ' minutes &times; ' + plan.seeds.length + ' seeds &middot; '
        + (plan.keepBuffs ? 'saved buffs retained' : 'fresh map-entry buffs') + ' &middot; '
        + (plan.unlimitedInventory ? 'unlimited inventory' : 'real inventory limits') + '</p>'
        + '<table class="data-table cw-table"><thead><tr><th>Configuration</th><th>Stones/hr</th><th>Glunkos/hr</th><th>Gain/hr</th><th>Cost</th><th>Same-stone payback</th><th>Runs / deaths</th></tr></thead><tbody>'
        + rows.map(r => '<tr><td data-label="Configuration">' + esc(r.label)
          + (r.from != null ? '<small>Lv ' + r.from + ' &rarr; ' + r.to + (!r.affordable ? ' &middot; Not yet affordable' : '') + '</small>' : '')
          + '<details class="cw-note"><summary>Collected stones/hr</summary>'
          + COVE_STONE_NAMES.map((name, i) => '<div>' + name + ': ' + number(r.rates['stone' + i] ?? null) + '</div>').join('') + '</details></td>'
          + cell('Stones/hr', number(r.rates.total ?? null)) + cell('Glunkos/hr', number(r.rates.coveKills ?? null))
          + cell('Gain/hr', r.gainPerHour == null || r.key === 'current' ? '&mdash;' : (r.gainPerHour > 0 ? '+' : '') + number(r.gainPerHour))
          + cell('Cost', r.cost == null ? '&mdash;' : number(r.cost) + '<small>' + COVE_STONE_NAMES[r.stone] + '</small>')
          + cell('Same-stone payback', r.paybackHours == null ? '&mdash;' : number(r.paybackHours) + ' h')
          + cell('Runs / deaths', r.runs + '/' + plan.seeds.length + ' / ' + r.deaths + (r.errors.length ? ' - failed' : '')) + '</tr>').join('')
        + '</tbody></table><p class="cw-note">Stone types are not interchangeable. Total stones/hr is descriptive, not a currency-value ranking. '
        + 'Payback divides the native current-level purchase cost by the sampled increase in that same paid stone. '
        + 'Only complete baseline/candidate batches receive gains. Rare stones and small differences need longer runs; these are noisy estimates, not confirmed rankings. '
        + 'Balances are not spent, so purchase-induced digit changes and purchase sequences are not modeled. '
        + 'Cost-only, offline-only and unrelated upgrades remain in the analytical tools above; AFK gains use a separate native path.</p>'
        + farmingWarnings(plan, rows);
    },
  });
}
