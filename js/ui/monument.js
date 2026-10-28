import { initSaveLoader } from './save-loader.js';
import { saveData } from '../state.js';
import { numCharacters } from '../save/data.js';
import { fmtVal } from '../renderers/format.js';
import { monumentSnapshot, monumentMilestones, monumentRunStats, braverySwordOdds } from '../stats/systems/w5/monument.js';
import { justiceCases } from '../stats/data/w5/hole.js';
import { JUSTICE_EFFECTS, justiceInitialState, justiceCaseText, justiceResponses, justiceDelayedEffects, justiceOpenCase } from '../stats/systems/w5/monument-justice.js';

const $ = id => document.getElementById(id);
const escHtml = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const fmt = n => fmtVal(n);
const pct = n => n > 0 && n < .000001 ? '<0.0001%' : (100 * n).toLocaleString(undefined, { maximumFractionDigits: 3 }) + '%';
const clean = text => String(text).replaceAll('_', ' ').replaceAll('|', ' ');
const card = (name, value, sub = '') => `<div class="card"><div class="card-title">${escHtml(name)}</div><div class="card-val">${escHtml(value)}</div><div class="card-sub">${escHtml(sub)}</div></div>`;
const table = (heads, rows, numericColumns = heads.map((_, i) => i).slice(1)) => `<div class="table-wrap"><table><thead><tr>${heads.map(s => `<th>${escHtml(s)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((s, i) => `<td${numericColumns.includes(i) ? ' class="num"' : ''}>${escHtml(s)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const names = ['bravery', 'justice', 'wisdom'];
const fields = [['round', 'Case number'], ['health', 'Mental health'], ['coins', 'Coins'], ['popularity', 'Popularity'], ['dismissals', 'Dismissals'], ['chests', 'Retirement chests']];
const cases = [...new Map(justiceCases().map(c => [c.visitor + ':' + c.text, c])).values()];
let snapshot = null, state = null, caseId = 0, awaitingCase = false, report = null, history = [], capturedSave = null;
let ci = 0;

function guard(id, fn) {
  $(id).textContent = '';
  try { fn(); } catch (error) {
    $(id).textContent = error.message;
    if (id === 'page-error') $('loaded').hidden = true;
    if (id === 'bravery-error') $('bravery-odds').replaceChildren();
    if (id === 'justice-error') { report = null; $('justice-responses').replaceChildren(); $('justice-next').disabled = true; }
  }
}
function numeric(id) {
  const el = $(id);
  if (!el.value.trim() || !Number.isFinite(el.valueAsNumber)) throw new Error('Enter a valid ' + (el.closest('label')?.firstChild?.textContent || 'number') + '.');
  return el.valueAsNumber;
}
function bonusTable(rows, id) {
  $(id).innerHTML = '<h3>Permanent reward levels &amp; total effects</h3>' + table(['Reward', 'Saved level', 'Current effect', 'Effect at +1 level'], rows.map(r => {
    const text = value => clean(r.text).replaceAll('{', fmt(value)).replaceAll('}', fmt(1 + value / 100));
    const label = clean(r.text).replace(/[+{}%]/g, '').replace(/^x /, '').trim();
    return [label, fmt(r.level), text(r.value), text(r.next)];
  }), [1]);
}
function milestones(t) {
  const stats = snapshot.monuments[t].stats;
  $(names[t] + '-milestones').innerHTML = '<h3>Paying Respect milestones</h3>' + table(
    ['Milestone', 'Training hours required', 'Saved status', 'One-character ETA'], monumentMilestones(saveData, t, snapshot.training.rate).map((r, i) => {
      let text = clean(r.text);
      if (i === 0) text = t === 0 ? text.replace('{', fmt(stats.minDmg)).replace('}', fmt(stats.maxDmg))
        : t === 1 ? text.replace('$', fmt(stats.coins)) : text.replace('#', fmt(stats.attempts));
      return [text, fmt(r.hours), r.unlocked ? 'Unlocked' : r.ready ? 'Ready: unlock in game' : 'Not reached',
        r.unlocked || r.ready ? '-' : fmt(r.realHours) + ' real hours'];
    }), [1, 3]);
}
function renderSave() {
  guard('page-error', () => {
    snapshot = monumentSnapshot(saveData, ci);
    $('loaded').hidden = !snapshot.available;
    $('empty-note').hidden = snapshot.available;
    if (!snapshot.available) { $('empty-note').textContent = 'This save is missing Monument charge, training or reward data.'; return; }
    $('partial-note').textContent = snapshot.notes.join(' ');
    $('permanent-summary').innerHTML = snapshot.monuments.map(m => card(m.name, fmt(m.bonuses.reduce((sum, r) => sum + r.level, 0)) + ' levels', 'Sum of its ten saved permanent reward levels')).join('')
      + card('Reward-level multiplier', fmt(snapshot.rewardLevelMulti) + 'x', 'Companion bonus; applied after each reward roll');
    $('charge-summary').innerHTML = snapshot.monuments.map(m => card(m.name, fmt(m.charge.multi) + 'x',
      `${fmt(m.charge.seconds / 3600)} real hours waited; ${m.charge.canStart ? 'story ready' : 'needs at least 1x to start'}. After another 24h: ${fmt(m.tomorrow.multi)}x.`)).join('');
    const tr = snapshot.training;
    $('training-summary').innerHTML = card('One-character training rate', fmt(tr.rate) + 'x', 'Training hours per real hour, before claim flooring')
      + card('Training per 24-hour claim', fmt(tr.perDay) + ' hours', 'One character Paying Respect for the full claim')
      + card('Additive training gain', '+' + fmt(tr.pct) + '%', 'All integrated Monument AFK sources')
      + card('Clutch Overtime Block', fmt(tr.multi) + 'x', 'Saved Minehead reward');
    for (let t = 0; t < 3; t++) {
      const m = snapshot.monuments[t], s = m.stats;
      let cards = card('Saved training', fmt(s.hours) + ' hours', 'Paying Respect; not reward levels')
        + card('Unlocked milestones', s.milestones + ' / 8') + card('Next opal offer chance', pct(s.opalChance), 'Uses saved opals; each additional opal lowers subsequent offers');
      if (t === 0) cards += card('Swords', s.swords, 'All current milestones give eight, not nine')
        + card('Initial sword damage', fmt(s.minDmg) + ' - ' + fmt(s.maxDmg), 'Fresh story: zero boosts, full rethrows')
        + card('Rethrows / retellings', s.maxRerolls + ' / ' + s.retellings, 'Per story');
      if (t === 1) cards += card('Start coins', s.coins) + card('Start mental health', s.health) + card('Start popularity', s.popularity) + card('Start dismissals', s.dismissals);
      if (t === 2) cards += card('Start attempts', s.attempts) + card('Attempts per board clear', s.attemptsPerBoard)
        + card('Insta-matches per story', s.instamatches) + card('Time per match', s.secondsPerMatch + ' seconds')
        + card('Reveal aids', [s.revealRow ? 'First attempt: row' : '', s.revealSquare ? 'Fourth attempt: square' : ''].filter(Boolean).join('; ') || 'None');
      $(names[t] + '-stats').innerHTML = cards;
      milestones(t); bonusTable(m.bonuses, names[t] + '-bonuses');
    }
    $('sources').innerHTML = '<h3>Paying Respect: additive pool</h3>' + table(['Source', 'Bonus'], tr.sources.map(s => [s.name, '+' + fmt(s.val) + '%']))
      + '<h3>Reward-charge factors (separate from training)</h3>' + table(['Monument', 'Linear window', 'Meritoc 7', 'Legend 27'], snapshot.monuments.map(m =>
        [m.name, fmt(m.charge.maxLinear / 86400) + ' days', '+' + fmt(m.charge.meritoc) + '%', '+' + fmt(m.charge.legend) + '%']))
      + '<p class="muted">The linear window includes both storage schematics, Monumental Gaming superbit, Legend 27, and Justice study ownership. Waiting beyond it still contributes diminished charge.</p>';
    renderBravery();
  });
}
function renderBravery() {
  if (!snapshot?.available) return;
  guard('bravery-error', () => {
    const hp = $('bravery-hp').value.trim() ? numeric('bravery-hp') : null;
    const o = braverySwordOdds(saveData, { wave: numeric('bravery-wave') - 1, boosts: numeric('bravery-boosts'), rerolls: numeric('bravery-rerolls'), remainingHP: hp });
    $('bravery-odds').innerHTML = '<div class="card-grid">' + card('Enemy HP', fmt(o.hp))
      + card('This roll damage', fmt(o.minDmg) + ' - ' + fmt(o.maxDmg), 'Per sword; based on the entered run state')
      + card('Fresh full-volley kill', pct(o.kill), 'Independent rolls; before any rethrows')
      + card('Right-most finishing / boost', pct(o.boostChance), o.automatic ? 'Study guarantees the skip and grants a stack' : o.rightmost ? 'Others do not kill; right-most finishes' : 'Right-most boost schematic not owned')
      + (o.lastSwordChance != null ? card('One last-sword kill', pct(o.lastSwordChance), 'Conditional on the HP entered; boost requires the schematic and the other swords to have landed') : '')
      + card('Next stack damage gain', '+' + ((o.nextDamageFactor - 1) * 100).toFixed(2) + '%', '10 percentage points added to the boost factor')
      + '</div><p class="muted">' + (o.automatic ? 'A guaranteed one-hit study skip overrides normal sword timing.' : 'Boost odds exclude early kills. They assume the right-most sword lands strictly later, not simultaneous animation completions.')
      + ' Existing stacks multiply maximum damage by 1 + 0.1 × stacks; the study-linked part of minimum damage follows it. A nonlethal right-most landing after all others resets stacks to zero.</p>';
  });
}

function saveHistory() {
  history.push({ state: structuredClone(state), caseId, awaitingCase });
  if (history.length > 30) history.shift();
}
function renderStateInputs() {
  $('justice-state').innerHTML = fields.map(([key, title]) => `<label>${title}<input id="j-${key}" type="number" ${key === 'popularity' ? '' : `min="${key === 'round' ? 1 : 0}"`} step="1" data-state="${key}" value="${state[key] + (key === 'round' ? 1 : 0)}"></label>`).join('');
  $('justice-effects').innerHTML = JUSTICE_EFFECTS.map(e => `<label><input type="checkbox" data-effect="${e.key}" ${Object.hasOwn(state.effects, e.key) ? 'checked' : ''}>${escHtml(e.name)}${e.flag ? '' : `<input type="number" min="0" step="1" aria-label="${escHtml(e.name)} value" data-effect-value="${e.key}" value="${state.effects[e.key] ?? 0}">`}<small>${escHtml(e.help)}</small></label>`).join('');
}
function readJusticeInputs() {
  const next = { ...state, effects: {} };
  for (const [key] of fields) next[key] = numeric('j-' + key) - (key === 'round' ? 1 : 0);
  for (const effect of JUSTICE_EFFECTS) if (document.querySelector(`[data-effect="${effect.key}"]`).checked) {
    const input = document.querySelector(`[data-effect-value="${effect.key}"]`);
    if (!effect.flag && (!input.value.trim() || !Number.isSafeInteger(input.valueAsNumber) || input.valueAsNumber < 0))
      throw new Error('Enter a nonnegative integer for ' + effect.name + '.');
    next.effects[effect.key] = effect.flag ? 1 : input.valueAsNumber;
  }
  justiceResponses(next, caseId);
  return next;
}
function caseOptions() {
  const query = $('justice-search').value.toLowerCase().trim();
  const selected = cases.find(c => c.id === caseId);
  const visible = cases.filter(c => !query || (c.name + ' ' + c.text).toLowerCase().includes(query));
  if (!visible.includes(selected)) visible.unshift(selected);
  $('justice-case').innerHTML = visible.map(c => `<option value="${c.id}">${escHtml(c.name + ' - ' + justiceCaseText(state, c.id).text)}</option>`).join('');
  $('justice-case').value = String(caseId);
}
function renderJustice() {
  guard('justice-error', () => {
    state = readJusticeInputs();
    report = justiceResponses(state, caseId);
    caseOptions();
    $('justice-request').textContent = report.row.name + ': ' + report.row.text;
    $('justice-next').hidden = !awaitingCase || state.health <= 0;
    $('justice-next').disabled = false;
    $('justice-undo').disabled = history.length === 0;
    $('justice-responses').innerHTML = awaitingCase ? '' : report.responses.map(r => `<div class="card ${r.action === report.recommended ? 'recommended' : ''}">
      <h3>${escHtml(r.action[0].toUpperCase() + r.action.slice(1))}${r.action === report.recommended ? ' - suggested' : ''}</h3>
      ${r.blocked ? `<p>${escHtml(r.blocked)}</p>` : `<small>Survive this response: ${escHtml(pct(r.survival))}</small>` + r.outcomes.map((o, i) => {
        const changes = fields.filter(([key]) => key !== 'round').map(([key, label]) => {
          const d = o.state[key] - state[key];
          return `${label}: ${o.state[key]} (${d >= 0 ? '+' : ''}${d})`;
        }).join(' / ');
        const effects = justiceDelayedEffects(o.state).filter(e => state.effects[e.key] !== e.value).map(e => `${e.name}: ${e.value}. ${e.help}`).join(' ');
        const removed = justiceDelayedEffects(state).filter(e => !Object.hasOwn(o.state.effects, e.key)).map(e => e.name + ' ends.').join(' ');
        return `<div class="outcome"><strong>${escHtml(o.label)} - ${escHtml(pct(o.probability))}</strong><p>${escHtml(changes)}</p>${o.state.health <= 0 ? '<p class="error">Story ends; existing retirement chests remain available to open.</p>' : ''}
          <p class="muted">${escHtml(effects + ' ' + removed)}</p><button data-record="${r.action}:${i}">Record ${escHtml(r.action)}${r.outcomes.length > 1 ? ' - ' + escHtml(o.label) : ''}</button></div>`;
      }).join('')}</div>`).join('');
    $('justice-heuristic').textContent = report.heuristic + (report.ambiguous
      ? ' Grumblo uses identical wording for hidden gifts. These outcomes use their equally likely native case variants; record only the actual result.' : '');
    const effects = justiceDelayedEffects(state);
    $('justice-delayed').innerHTML = '<h3>Delayed effects currently active</h3>' + (effects.length ? table(['Effect', 'Value', 'When / consequence'], effects.map(e => [e.name, e.value, e.help]), [1]) : '<p class="muted">No active deals or investments recorded.</p>');
  });
}
function resetJustice() {
  if (!snapshot?.available) return;
  state = justiceInitialState(saveData); history = []; awaitingCase = false; caseId = 0;
  $('justice-search').value = ''; $('justice-notice').textContent = 'Fresh-story stats loaded. Select the first visitor you actually received.';
  renderStateInputs(); renderJustice();
}
function load() {
  const refreshed = capturedSave !== null;
  capturedSave = saveData;
  ci = Math.min(ci, Math.max(0, numCharacters - 1));
  $('character').innerHTML = Array.from({ length: numCharacters }, (_, i) => `<option value="${i}">${escHtml(saveData.charNames?.[i] || 'Character ' + (i + 1))}</option>`).join('');
  $('character').value = String(ci);
  if (!refreshed) $('bravery-rerolls').value = String(monumentRunStats(saveData, 0).maxRerolls);
  renderSave();
  if (!state && snapshot?.available) resetJustice();
  else if (state) $('justice-notice').textContent = 'Save refreshed. Your manual worksheet is unchanged; Fresh story loads the new starting stats.';
}
$('character').addEventListener('change', () => { ci = Number($('character').value); renderSave(); });
for (const id of ['bravery-wave', 'bravery-boosts', 'bravery-rerolls', 'bravery-hp']) $(id).addEventListener('input', renderBravery);
$('justice-search').addEventListener('input', caseOptions);
$('justice-case').addEventListener('change', () => { caseId = Number($('justice-case').value); renderJustice(); });
for (const id of ['justice-state', 'justice-effects']) {
  $(id).addEventListener('input', () => {
    report = null; $('justice-responses').replaceChildren(); $('justice-next').disabled = true;
    $('justice-error').textContent = 'Finish editing the current field to update the advice.';
  });
  $(id).addEventListener('change', () => guard('justice-error', () => {
    const next = readJusticeInputs();
    saveHistory(); state = next; renderJustice();
  }));
}
$('justice-responses').addEventListener('click', event => {
  const record = event.target.closest('[data-record]')?.dataset.record;
  if (!record || !report || awaitingCase) return;
  const [action, index] = record.split(':'), outcome = report.responses.find(r => r.action === action).outcomes[Number(index)];
  saveHistory(); state = structuredClone(outcome.state); awaitingCase = true;
  $('justice-notice').textContent = state.health > 0 ? 'Response recorded. Select the next case, then open it to settle delayed effects.' : 'Story ended. Fresh story starts another worksheet.';
  renderStateInputs(); renderJustice();
});
$('justice-next').addEventListener('click', () => guard('justice-error', () => {
  if (!awaitingCase) return;
  const next = justiceOpenCase(readJusticeInputs(), caseId);
  saveHistory(); state = next.state; awaitingCase = false;
  $('justice-notice').textContent = next.notes.join(' ') || 'Next case opened; no delayed payments this turn.';
  renderStateInputs(); renderJustice();
}));
$('justice-reset').addEventListener('click', resetJustice);
$('justice-undo').addEventListener('click', () => {
  if (!history.length) return;
  ({ state, caseId, awaitingCase } = history.pop());
  $('justice-notice').textContent = 'Worksheet step undone.';
  renderStateInputs(); renderJustice();
});
document.querySelectorAll('.tab-btn').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab-btn').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-selected', String(b === button)); });
  document.querySelectorAll('.tab-content').forEach(p => p.classList.toggle('active', p.id === 'tab-' + button.dataset.tab));
}));
initSaveLoader({ target: '#save-area', onLoad: load, auth: true });
