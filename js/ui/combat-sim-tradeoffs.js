import { COMBAT_TRADEOFF_METRICS, combatTradeoffFrontier, setupCompareUnit } from '../stats/systems/common/combat-sim-setup-compare.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function _metrics(rows, itemName) {
  const items = [...new Set(rows.flatMap(r => Object.keys(r.items || {})))].sort();
  return [...COMBAT_TRADEOFF_METRICS, ...items.map(k => ({ key: 'item:' + k, label: itemName(k) + ' / ' + setupCompareUnit('item:' + k), direction: 1 }))];
}
function _points(rows, x, y) {
  const measured = rows.filter(r => r.statistics).map(r => ({ ...r.statistics, label: [r.character, r.loadout, r.mapLabel].filter(Boolean).join(' / ') }));
  return combatTradeoffFrontier(measured, x, y);
}
export function renderCombatTradeoffs(c, rows, { itemName, fmtNum }) {
  if (!rows.some(r => r.statistics)) return '';
  const metrics = _metrics(rows, itemName), ui = c.tradeoff || (c.tradeoff = { x: 'exp', y: 'deaths', open: false });
  const x = metrics.find(m => m.key === ui.x) || metrics[0], y = metrics.find(m => m.key === ui.y) || metrics[4];
  const points = _points(rows, x, y);
  const select = (axis, selected) => '<label>' + axis.toUpperCase() + ' axis<select id="cmp-tradeoff-' + axis + '">' + metrics.map(m => '<option value="' + esc(m.key) + '"' + (m === selected ? ' selected' : '') + '>' + esc(m.label) + '</option>').join('') + '</select></label>';
  const W = 1000, H = 440, L = 100, R = 20, T = 25, B = 80;
  const domain = axis => {
    const values = points.flatMap(p => [p[axis].mean, ...(p[axis].interval || [])]);
    const low = Math.min(0, ...values), high = Math.max(1, ...values);
    return [low, high + (high - low) * .05];
  };
  const xd = domain('x'), yd = domain('y');
  const px = n => L + (n - xd[0]) / (xd[1] - xd[0]) * (W - L - R);
  const py = n => H - B - (n - yd[0]) / (yd[1] - yd[0]) * (H - T - B);
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Observed combat trade-offs" style="width:100%;min-width:600px">';
  for (let i = 0; i <= 4; i++) {
    const xx = xd[0] + (xd[1] - xd[0]) * i / 4, yy = yd[0] + (yd[1] - yd[0]) * i / 4;
    svg += '<path d="M' + px(xx) + ',' + T + 'V' + (H - B) + 'M' + L + ',' + py(yy) + 'H' + (W - R) + '" stroke="#394354"/>'
      + '<text x="' + px(xx) + '" y="' + (H - B + 22) + '" text-anchor="middle" fill="#eee" font-size="12">' + esc(fmtNum(xx)) + '</text>'
      + '<text x="' + (L - 8) + '" y="' + (py(yy) + 4) + '" text-anchor="end" fill="#eee" font-size="12">' + esc(fmtNum(yy)) + '</text>';
  }
  const valueText = s => (s.censored ? 'at least ' : '') + fmtNum(s.mean) + (s.censored ? ' (' + s.censored + ' runs censored at their actual end)' : '') + '; ' + s.n + ' seeds';
  for (const p of points) {
    const color = p.frontier ? '#ffd700' : '#4dd0e1';
    if (p.x.interval) svg += '<path d="M' + px(p.x.interval[0]) + ',' + py(p.y.mean) + 'H' + px(p.x.interval[1]) + '" stroke="' + color + '" opacity=".45"/>';
    if (p.y.interval) svg += '<path d="M' + px(p.x.mean) + ',' + py(p.y.interval[0]) + 'V' + py(p.y.interval[1]) + '" stroke="' + color + '" opacity=".45"/>';
    const tip = p.label + '\n' + x.label + ': ' + valueText(p.x) + '\n' + y.label + ': ' + valueText(p.y) + '\n' + (p.frontier ? 'Observed non-dominated result' : 'Another measured result dominates on these axes');
    svg += '<circle cx="' + px(p.x.mean) + '" cy="' + py(p.y.mean) + '" r="7" fill="' + (p.x.censored || p.y.censored ? '#16213e' : color) + '" stroke="' + color + '" stroke-width="3" tabindex="0" role="button" data-tradeoff-open="' + esc(p.id) + '" data-tradeoff-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '"/>';
  }
  svg += '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 18) + '" text-anchor="middle" fill="#eee" font-size="13">' + esc(x.label) + '</text>'
    + '<text x="20" y="20" fill="#eee" font-size="13">' + esc(y.label) + '</text></svg>';
  return '<details data-cmp-tradeoffs' + (ui.open ? ' open' : '') + '><summary>Trade-offs &amp; observed Pareto frontier</summary><div class="toolbar">' + select('x', x) + select('y', y) + '</div>'
    + '<div class="scroll">' + svg + '</div>' + (!points.length ? '<div class="note">No rows have both axes available. Bag timing is unavailable with Unlimited inventory or without a recorded bag-full field; missing death counters are not assumed zero.</div>' : '')
    + '<div class="note">Gold: observed non-dominated on the selected axes. Cyan: dominated. This is a descriptive two-objective frontier, not an optimality or statistical proof. Error bars are approximate unadjusted 95% seed-mean intervals. Equal seed weights can differ from the main table. Deaths are minimized; all other axes are maximized. Open circles are bag-time lower bounds, not zero or a predicted fill time; domination requires the bounds to establish it. Mixed durations and early stops have different censoring horizons. World averages and rows with unavailable axes are excluded. Click or press Enter on a point to inspect its captured result. Overlapping points may coincide.</div>'
    + '<div class="scroll"><table class="data-table"><thead><tr><th>Captured result</th><th>' + esc(x.label) + '</th><th>' + esc(y.label) + '</th><th>Frontier</th></tr></thead><tbody>'
    + points.map(p => '<tr><td><button type="button" data-tradeoff-open="' + esc(p.id) + '">' + esc(p.label) + '</button></td><td>' + esc(valueText(p.x)) + '</td><td>' + esc(valueText(p.y)) + '</td><td>' + (p.frontier ? 'Non-dominated' : 'Dominated') + '</td></tr>').join('')
    + '</tbody></table></div><div data-tradeoff-tooltip role="tooltip" hidden style="position:fixed;z-index:10000;max-width:360px;background:#101726;border:1px solid #4dd0e1;padding:10px;white-space:pre-line;pointer-events:none"></div></details>';
}

export function mountCombatTradeoffs(host, c, open, onChange) {
  const root = host.querySelector('[data-cmp-tradeoffs]'); if (!root) return;
  const tip = root.querySelector('[data-tradeoff-tooltip]');
  const hide = () => { tip.hidden = true; };
  const show = (target, x, y) => {
    if (!target?.dataset.tradeoffTip) return;
    tip.textContent = target.dataset.tradeoffTip; tip.hidden = false;
    tip.style.left = Math.max(4, Math.min(innerWidth - tip.offsetWidth - 8, x + 12)) + 'px';
    tip.style.top = Math.max(4, Math.min(innerHeight - tip.offsetHeight - 8, y + 12)) + 'px';
  };
  root.addEventListener('toggle', () => { c.tradeoff.open = root.open; if (!root.open) hide(); });
  root.addEventListener('change', e => {
    if (e.target.id === 'cmp-tradeoff-x' || e.target.id === 'cmp-tradeoff-y') {
      c.tradeoff[e.target.id.endsWith('-x') ? 'x' : 'y'] = e.target.value; c.tradeoff.open = true; onChange();
    }
  });
  const jump = e => { const target = e.target.closest('[data-tradeoff-open]'); if (target) open(target.dataset.tradeoffOpen); };
  root.addEventListener('click', jump);
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') hide();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('circle[data-tradeoff-open]')) { e.preventDefault(); jump(e); }
  });
  root.addEventListener('pointerover', e => show(e.target.closest('[data-tradeoff-tip]'), e.clientX, e.clientY));
  root.addEventListener('pointerout', hide); root.addEventListener('focusout', hide);
  root.addEventListener('focusin', e => { const b = e.target.getBoundingClientRect(); show(e.target, b.left, b.bottom); });
}
