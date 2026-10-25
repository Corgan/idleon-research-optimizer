import { buildClamworksCombatPlan, summarizeClamworksCombat } from '../stats/systems/w7/clamworks-combat.js';
import { mountCombatFarming, farmingEscape as esc, farmingFormat as number, farmingWarnings } from './combat-farming.js';

export function mountClamworksCombat(host, { characterControl = true } = {}) {
  return mountCombatFarming(host, {
    characterControl,
    title: 'Active farming comparison', runLabel: 'Compare farming',
    intro: 'Uses the active combat simulator on Clamworks, including movement, skills, Scurge damage reduction, '
      + 'live Multikill and actual pearl pickups. Analytical tables use the imported character; runs derive stats from their selected loadout and buff settings.',
    buildPlan: buildClamworksCombatPlan,
    renderResults({ plan, records, identity }) {
      const rows = summarizeClamworksCombat(plan, records);
      const sorted = [rows[0], ...rows.slice(1).sort((a, b) => (a.paybackHours ?? Infinity) - (b.paybackHours ?? Infinity))];
      return '<p class="cw-note"><strong>' + esc(identity) + '</strong> &middot; Promotion ' + plan.promotion
        + ' &middot; ' + plan.seconds / 60 + ' minutes &times; ' + plan.seeds.length + ' seeds per configuration'
        + ' &middot; ' + (plan.keepBuffs ? 'saved buffs retained' : 'fresh map-entry buffs')
        + ' &middot; ' + (plan.unlimitedInventory ? 'unlimited inventory' : 'real inventory limits') + '</p>'
        + '<table class="data-table cw-table"><thead><tr><th>Configuration</th><th class="num">Pearls/hr collected</th>'
        + '<th class="num">Kills/hr</th><th class="num">Gain/hr</th><th class="num">Purchase cost</th>'
        + '<th class="num">Sampled payback</th><th class="num">Runs / deaths</th></tr></thead><tbody>'
        + sorted.map(r => '<tr><td data-label="Configuration">' + esc(r.label)
          + (r.from != null ? '<small>Lv ' + r.from + ' &rarr; ' + r.to + (!r.affordable ? ' &middot; Not yet affordable' : '') + '</small>' : '<small>Baseline</small>')
          + '</td><td class="num" data-label="Pearls/hr collected">' + number(r.pearlsPerHour) + '</td>'
          + '<td class="num" data-label="Kills/hr">' + number(r.killsPerHour) + '</td>'
          + '<td class="num" data-label="Gain/hr">' + (r.gainPerHour == null ? '&mdash;' : (r.gainPerHour > 0 ? '+' : '') + number(r.gainPerHour)) + '</td>'
          + '<td class="num" data-label="Purchase cost">' + (r.cost == null ? '&mdash;' : number(r.cost)) + '</td>'
          + '<td class="num" data-label="Sampled payback">' + (r.paybackHours == null ? '&mdash;' : number(r.paybackHours) + ' h') + '</td>'
          + '<td class="num" data-label="Runs / deaths">' + r.runs + '/' + plan.seeds.length + ' / ' + r.deaths + (r.errors.length ? ' - failed' : '') + '</td></tr>').join('')
        + '</tbody></table><p class="cw-note">Collected pearl value, not item count or the saved balance. Rates pool actual simulated time. '
        + 'Each configuration starts independently from the same save and uses the same seeds; rewards remain random. '
        + 'Gains and payback appear only after both configurations finish every seed, and are noisy sample estimates, not confirmed upgrade rankings. '
        + 'Pure Pearls can be too rare to measure in short runs.</p>'
        + (records.length && rows[0].runs && rows[0].pearls === 0 ? '<p class="cw-warning">No baseline pearls collected. Try a longer run and check kills, deaths, pickup and input warnings.</p>' : '')
        + '<p class="cw-note">Tests saved-unlocked productive upgrades one level at a time, including extra clams. '
        + 'Unaffordable levels are hypothetical; nothing is purchased or applied to your save or loadouts. '
        + 'Cost-reduction upgrades remain in Upgrade Priority above. Promotions, Scurge allocation and purchase sequences are not optimized.</p>'
        + farmingWarnings(plan, rows);
    },
  });
}
