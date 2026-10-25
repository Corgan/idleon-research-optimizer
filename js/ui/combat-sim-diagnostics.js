import { TalentIconNames } from '../stats/data/game/customlists.js';
import { COMBAT_SPRITE_BASE, MAP_SCENES } from '../stats/data/game/combat-sprites.js';
import { SCENE_GEOMETRY } from '../stats/data/game/scenes.js';
import { combatHistogramQuantile, combatSpatialWindow } from '../stats/systems/common/combat-sim-telemetry.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const N = x => Number(x) || 0;
const COLORS = { dead: '#ef5350', placedWalk: '#ba68c8', casting: '#42a5f5', attacking: '#ffca28', travelling: '#26c6da', waiting: '#78909c', idle: '#bdbdbd' };
const LABELS = { dead: 'Dead / respawning', placedWalk: 'Placed-skill walk', casting: 'Casting / recovery queue', attacking: 'Basic attack / recovery', travelling: 'Travelling / jumping', waiting: 'Waiting for monsters', idle: 'Idle with monsters present' };
const MECHANICS = { WT9: 'Orb spawn totem', WT13: 'Wormhole', WT16: 'Graveyard', WT18: 'Reindeer', crystal0: 'Drop Rate crystal', crystal1: 'Monster EXP crystal', crystal2: 'AFK gains crystal', weakness: 'Matching Tempest weakness', orbPositive: 'Positive orb count' };
export const COMBAT_HEATMAPS = [['occupancy', 'Player time'], ['kills', 'Kills'], ['damage', 'Useful damage'], ['monsters', 'Monster density'], ['efficiency', 'Kills / minute of player presence'], ['damageEfficiency', 'Useful DPS during player presence'], ['idle', 'Idle / waiting time']];
const skillName = id => String(TalentIconNames[id] || 'Unknown skill').replace(/_/g, ' ');
const sourceName = key => /^skill\d+$/.test(key) ? skillName(Number(key.slice(5))) : ({ player: 'Basic melee', bow: 'Basic bow', wand: 'Basic wand', status: 'Poison / status', scripted: 'Fixed-interval stand-in', unattributed: 'Unattributed' })[key] || key.replace(/_/g, ' ');
const pct = x => (100 * N(x)).toFixed(1) + '%';
const sec = ms => (N(ms) / 1000).toFixed(2) + 's';
function histText(h, q) {
  const v = combatHistogramQuantile(h, q);
  return v ? sec(v.low) + ' - ' + sec(v.high) : 'Unavailable';
}
function table(headers, rows) {
  return '<div class="scroll"><table class="data-table"><thead><tr>' + headers.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>'
    + (rows.length ? rows.map(row => '<tr>' + row.map(x => '<td>' + x + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + headers.length + '">No observations.</td></tr>') + '</tbody></table></div>';
}
function panel(title, body, open = false) { return '<details class="ct-panel"' + (open ? ' open' : '') + '><summary>' + esc(title) + '</summary>' + body + '</details>'; }
function bar(value, total, color) { return '<span class="ct-bar"><i style="width:' + (100 * Math.min(1, total > 0 ? value / total : 0)) + '%;background:' + color + '"></i></span>'; }
function card(label, value, sub = '') { return '<div class="card"><div class="card-title">' + esc(label) + '</div><div class="card-val">' + value + '</div><div class="card-sub">' + sub + '</div></div>'; }

function chart(points, series, label, fmt, markers = []) {
  if (!points.length) return '<div class="note">No timeline samples.</div>';
  const W = 900, H = 220, left = 75, right = 15, top = 20, bottom = 32, end = Math.max(1, points.at(-1).t);
  const max = Math.max(1e-12, ...series.flatMap(s => points.map((p, i) => Math.max(0, N(s.value(p, i))))));
  const x = t => left + t / end * (W - left - right), y = v => H - bottom - Math.max(0, v) / max * (H - top - bottom);
  let svg = '<svg class="ct-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">';
  for (let i = 0; i <= 4; i++) {
    const yy = y(max * i / 4);
    svg += '<path d="M' + left + ',' + yy + 'H' + (W - right) + '" stroke="#394354"/><text x="' + (left - 5) + '" y="' + (yy + 4) + '" text-anchor="end" fill="#c0c0d4" font-size="11">' + esc(fmt(max * i / 4)) + '</text>';
    svg += '<text x="' + x(end * i / 4) + '" y="' + (H - 8) + '" text-anchor="middle" fill="#c0c0d4" font-size="11">' + sec(end * i / 4) + '</text>';
  }
  for (const m of markers.slice(0, 80)) svg += '<path d="M' + x(m.t) + ',' + top + 'V' + (H - bottom) + '" stroke="#ef5350" stroke-dasharray="3 4"/>';
  for (const s of series) {
    svg += '<polyline fill="none" stroke="' + s.color + '" stroke-width="2" points="' + points.map((p, i) => x(p.t) + ',' + y(N(s.value(p, i)))).join(' ') + '"/>';
  }
  // One focusable hit area per bucket; no replay decoding.
  points.forEach((p, i) => {
    const tip = sec(p.from ?? points[i - 1]?.t ?? 0) + ' - ' + sec(p.t) + ': ' + series.map(s => s.name + ' ' + fmt(N(s.value(p, i)))).join('; ');
    svg += '<rect x="' + x(p.from ?? points[i - 1]?.t ?? 0) + '" y="' + top + '" width="' + Math.max(1, x(p.t) - x(p.from ?? points[i - 1]?.t ?? 0)) + '" height="' + (H - top - bottom) + '" fill="transparent" tabindex="0" data-ct-tip="' + esc(tip) + '"/>';
  });
  return svg + '</svg><div class="ct-legend">' + series.map(s => '<span style="color:' + s.color + '">' + esc(s.name) + '</span>').join('') + '</div>';
}

export function combatRateSeries(data, metric, windowMs = 10000) {
  const points = data.points || [], out = [];
  let start = 0;
  const cumulative = p => metric === 'kills' ? N(p.totalKills) : N(p[metric]);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    while (start < i && points[start].t <= p.t - windowMs) start++;
    const from = start > 0 ? points[start - 1].t : 0, elapsed = Math.max(1, p.t - from);
    let value;
    if (metric === 'effective' || metric === 'damage') {
      value = 0;
      for (let k = start; k <= i; k++) value += N(points[k][metric]);
    } else value = cumulative(p) - (start > 0 ? cumulative(points[start - 1]) : 0);
    out.push({ ...p, value: value * (metric === 'effective' || metric === 'damage' ? 1000 : 60000) / elapsed });
  }
  return out;
}

function heatValue(key, value, d, fmt) {
  if (key === 'occupancy' || key === 'idle') return sec(value) + ' (' + pct(value / Math.max(1, d.sampledMs)) + ' of sampled time)';
  if (key === 'monsters') return fmt(value / Math.max(1, d.sampledMs)) + ' average monsters';
  if (key === 'efficiency') return fmt(value) + ' kills / minute of player presence';
  if (key === 'damageEfficiency') return fmt(value) + ' useful DPS during player presence';
  return fmt(value) + (key === 'damage' ? ' HP removed' : ' kills');
}
export function combatHeatmapValues(data, key) {
  if (key === 'efficiency' || key === 'damageEfficiency') {
    const numerator = data.grid[key === 'efficiency' ? 'playerKills' : 'playerDamage'];
    return data.grid.occupancy.map((ms, i) => ms > 0 ? numerator[i] * (key === 'efficiency' ? 60000 : 1000) / ms : 0);
  }
  return data.grid[key] || [];
}
export function combatHeatmapSvg(r, key = 'occupancy', fmt = String, route = false, range = null) {
  let d = r.summary?.telemetry; if (!d) return '<div class="note">Spatial history was not recorded.</div>';
  if (range && range.to > range.from) d = combatSpatialWindow(d, range.from, range.to);
  if (!d) return '<div class="note">Time-filtered spatial history was not recorded for this result.</div>';
  const g = d.grid, values = combatHeatmapValues(d, key), max = Math.max(0, ...values);
  const scene = MAP_SCENES[r.mapIdx], geo = SCENE_GEOMETRY[r.mapIdx];
  const w = g.cols * g.cellSize, h = g.rows * g.cellSize;
  let s = '<svg class="ct-map" viewBox="' + g.x + ' ' + g.y + ' ' + w + ' ' + h + '" role="img" aria-label="Spatial efficiency heatmap: ' + esc(COMBAT_HEATMAPS.find(x => x[0] === key)?.[1] || key) + '">';
  s += '<rect x="' + g.x + '" y="' + g.y + '" width="' + w + '" height="' + h + '" fill="#101726"/>';
  if (scene?.bg) s += '<image href="' + esc(COMBAT_SPRITE_BASE + scene.bg) + '" width="' + scene.w + '" height="' + scene.h + '" opacity=".25" preserveAspectRatio="none"/>';
  if (scene?.plat) s += '<image href="' + esc(COMBAT_SPRITE_BASE + scene.plat) + '" width="' + scene.w + '" height="' + scene.h + '" opacity=".65"/>';
  const cavern = r.inputs?.holeCavern?.value ?? r.cavern;
  for (const L of scene?.caverns?.[cavern] || []) s += '<image href="' + esc(COMBAT_SPRITE_BASE + L.file) + '" x="' + L.x + '" y="' + L.y + '" width="' + (L.w * L.scale) + '" height="' + (L.h * L.scale) + '" opacity=".5"/>';
  values.forEach((v, i) => {
    if (!(v > 0)) return;
    const x = g.x + i % g.cols * g.cellSize, y = g.y + Math.floor(i / g.cols) * g.cellSize, strength = v / max;
    s += '<rect x="' + x + '" y="' + y + '" width="' + g.cellSize + '" height="' + g.cellSize + '" fill="hsl(' + (240 - 240 * strength) + ',90%,58%)" fill-opacity=".65" tabindex="0" data-value="' + v + '" data-ct-tip="' + esc('x ' + x + ', y ' + y + ': ' + heatValue(key, v, d, fmt) + '; exact recorded total ' + v) + '"/>';
  });
  for (const [i, n] of (geo?.nodes || []).entries()) {
    if (r.mapIdx === 216 && i === 3) continue;
    s += '<path d="M' + n.x + ',' + n.y + 'H' + n.length + '" stroke="#dde4f0" stroke-width="2"/><text x="' + n.x + '" y="' + (n.y + 15) + '" fill="#fff" font-size="14">' + i + '</text>';
  }
  if (route) s += '<polyline points="' + d.routes.map(p => p[1] + ',' + p[2]).join(' ') + '" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>';
  return s + '</svg><div class="ct-heat-key"><span>Low</span><i></i><span>High: ' + esc(heatValue(key, max, d, fmt)) + '</span></div>'
    + '<div class="note">' + (d.range ? 'Retained spatial window: ' + sec(d.range.from) + ' - ' + sec(d.range.to) + '. Boundaries expand to complete recorded buckets; positions are never interpolated. ' : 'Whole-run totals. ') + g.cellSize + ' px cells; colors are relative to this layer\'s maximum. Efficiency attributes kills/damage to the player\'s position at the event, divided by sampled presence time; cells with no sampled presence are omitted, and brief visits can be noisy. These are observations, not causal recommendations. Monster density is time-weighted; hidden Hole staging actors and pets are excluded. Hover or focus a cell for its exact value. The optional route is a bounded, coarsened position trace.</div>';
}

export function combatTimelineSvg(data, from = 0, to = data.durationMs) {
  const points = data.points.filter(p => p.t > from && p.from < to);
  if (!points.length || !('attacks' in points[0])) return '<div class="note">Linked combat lanes were not recorded.</div>';
  const lanes = [
    ...Object.keys(COLORS).map(k => ({ name: LABELS[k], color: COLORS[k], value: p => N(p.activity[k]), unit: 'ms' })),
    { name: 'Basic attacks started', color: '#ffd700', value: p => p.attacks },
    { name: 'Deaths', color: '#ef5350', value: p => p.deaths },
    { name: 'HP at bucket end', color: '#ef5350', value: p => p.hpCap > 0 ? p.hp / p.hpCap : 0, unit: 'fraction' },
    { name: 'MP at bucket end', color: '#42a5f5', value: p => p.mpCap > 0 ? p.mp / p.mpCap : 0, unit: 'fraction' },
    { name: 'Monsters available', color: '#4caf50', value: p => p.availableMs, unit: 'ms' },
    { name: 'Live target selected', color: '#26c6da', value: p => p.targetMs, unit: 'ms' },
  ];
  for (const id of Object.keys(data.skills)) {
    lanes.push({ name: skillName(id) + ': casts', color: '#bb86fc', value: p => N(p.casts?.[id]) },
      { name: skillName(id) + ': cooldown', color: '#78909c', value: p => N(p.cooldown?.[id]), unit: 'ms' },
      { name: skillName(id) + ': ready', color: '#42a5f5', value: p => N(p.ready?.[id]), unit: 'ms' });
  }
  const W = 1100, left = 250, row = 24, top = 28, H = top + row * lanes.length + 28;
  const x = t => left + (t - from) / Math.max(1, to - from) * (W - left - 12);
  let h = '<svg class="ct-lanes" viewBox="0 0 ' + W + ' ' + H + '" aria-label="Linked combat timeline" role="img">';
  lanes.forEach((lane, i) => {
    const y = top + i * row;
    h += '<text x="4" y="' + (y + 15) + '" fill="#eee" font-size="12">' + esc(lane.name) + '</text><path d="M' + left + ',' + (y + 20) + 'H' + (W - 12) + '" stroke="#394354"/>';
    for (const p of points) {
      const v = lane.value(p); if (!(v > 0)) continue;
      const alpha = lane.unit ? .2 + .8 * Math.min(1, lane.unit === 'fraction' ? v : v / Math.max(1, p.t - p.from)) : .85;
      const tip = lane.name + ': ' + (lane.unit === 'fraction' ? pct(v) : lane.unit ? sec(v) : v) + ' in complete bucket ' + sec(p.from) + ' - ' + sec(p.t);
      h += '<rect x="' + x(Math.max(from, p.from)) + '" y="' + y + '" width="' + Math.max(.5, x(Math.min(to, p.t)) - x(Math.max(from, p.from))) + '" height="19" fill="' + lane.color + '" opacity="' + alpha + '" tabindex="0" role="button" data-ct-seek="' + p.from + '" data-ct-tip="' + esc(tip) + '"/>';
    }
  });
  for (let i = 0; i <= 4; i++) h += '<text x="' + x(from + (to - from) * i / 4) + '" y="18" fill="#c0c0d4" text-anchor="middle" font-size="12">' + sec(from + (to - from) * i / 4) + '</text>';
  return h + '</svg><div class="note">Click or press Enter on a lane bucket to seek replay. Zoom changes the visible window, not recording resolution. Colors indicate bucket occupancy; attacks, casts and deaths are counts within a bucket, not exact event timestamps. Cooldown, readiness and target availability are sampled. Mixed activity can occupy several lanes in the same bucket.</div>';
}

export function renderCombatDiagnostics(r, format) {
  const d = r.summary?.telemetry;
  if (!d) return '<div class="note">Diagnostics were not recorded for this result. Generate full details &amp; replay to capture them; opening this result does not resimulate it.</div>';
  const fmt = format.fmtNum, mon = format.monName, item = format.itemName;
  const seconds = d.durationMs / 1000, entries = Object.entries(d.sources), total = key => entries.reduce((n, [, s]) => n + N(s[key]), 0);
  const raw = total('raw'), effective = total('effective');
  const ui = r.diagnosticsUI || (r.diagnosticsUI = { from: 0, to: d.durationMs });
  let h = '<div class="combat-telemetry"><style>'
    + '.ct-panel{margin:14px 0;border:1px solid #394354;border-radius:6px;padding:12px}.ct-panel>summary{cursor:pointer;color:var(--cyan);font-weight:600;margin-bottom:10px}.ct-bar{display:inline-block;width:110px;max-width:25vw;height:9px;background:#333;vertical-align:middle;margin-right:8px}.ct-bar i{display:block;height:100%}.ct-chart{display:block;width:100%;max-height:280px;background:#111a29}.ct-legend{display:flex;gap:14px;flex-wrap:wrap;margin:6px 0}.ct-map{width:100%;max-height:650px;background:#101726}.ct-heat-key{display:flex;gap:10px;align-items:center}.ct-heat-key i{width:160px;height:12px;background:linear-gradient(90deg,#2040ec,#20eccc,#80ec20,#ec2020)}.ct-tip{position:fixed;z-index:10000;max-width:360px;white-space:pre-line;padding:9px;background:#101726;border:1px solid #4dd0e1;border-radius:5px;color:#eee;pointer-events:none;font-size:13px}.ct-activity{display:flex;min-height:24px;margin:8px 0}.ct-activity>span{min-width:0}.combat-telemetry td{font-variant-numeric:tabular-nums}.combat-telemetry summary:focus-visible,.combat-telemetry [tabindex]:focus-visible{outline:2px solid var(--accent)}'
    + '.combat-telemetry .toolbar label,.combat-telemetry .toolbar select{min-width:0;max-width:100%}.ct-lanes{width:100%;min-width:800px;display:block}.ct-timeline-scroll{overflow:auto;max-height:700px}'
    + '</style><div class="card-grid cols-4">'
    + card('Useful DPS', fmt(seconds ? effective / seconds : 0), 'Actual HP removed')
    + card('Raw DPS', fmt(seconds ? raw / seconds : 0), 'Includes excess damage')
    + card('Overkill', pct(raw ? (raw - effective) / raw : 0), fmt(raw - effective) + ' excess damage')
    + card('Travelling', pct(d.activity.travelling / Math.max(1, d.durationMs)), sec(d.activity.travelling)) + '</div>';
  h += panel('Linked combat timeline and time window', '<div class="toolbar"><label>From (seconds)<input data-ct-from type="number" min="0" step=".1" value="' + ui.from / 1000 + '"></label><label>To (seconds)<input data-ct-to type="number" min="0" step=".1" value="' + ui.to / 1000 + '"></label><label>Preset<select data-ct-range><option value="">Custom</option><option value="all">Whole run</option><option value="opening">First 30 seconds</option><option value="ending">Last 30 seconds</option>'
    + d.bookmarks.filter(b => b.kind === 'foodDepleted' || b.kind === 'denStart').map((b, i) => b.kind === 'foodDepleted'
      ? '<option value="before:' + b.t + '">Before food depletion at ' + sec(b.t) + '</option><option value="after:' + b.t + '">After food depletion at ' + sec(b.t) + '</option>'
      : '<option value="den:' + b.t + '">Den attempt starting ' + sec(b.t) + '</option>').join('') + '</select></label><button type="button" data-ct-zoom="in">Zoom in</button><button type="button" data-ct-zoom="out">Zoom out</button></div><div data-ct-range-error class="err" role="status"></div><div data-ct-lanes class="ct-timeline-scroll">' + combatTimelineSvg(d, ui.from, ui.to) + '</div><div class="note">This window also filters the heatmap below. Whole-run summary tables remain whole-run totals.</div>', true);
  const topRaw = Math.max(1, ...entries.map(([, s]) => s.raw));
  h += panel('Damage attribution', table(['Source', 'Useful / excess damage', 'Useful DPS', 'Hit attempts', 'Landed / missed', 'Crits', 'Last hits'], entries.sort((a, b) => b[1].effective - a[1].effective).map(([k, s]) => [
    esc(sourceName(k)), bar(s.effective, topRaw, '#4dd0e1') + fmt(s.effective) + ' / ' + fmt(s.overkill),
    fmt(seconds ? s.effective / seconds : 0), fmt(s.attempts), fmt(s.hits) + ' / ' + fmt(s.misses), fmt(s.crits), fmt(s.lastHits),
  ])) + '<div class="note">Last hits are killing-blow credit, not exclusive kill contribution. Damage events include repeated hits on already depleted HP as excess. Stand-in damage has no native hit/crit roll.</div>', true);
  h += panel('Activity and downtime', '<div class="ct-activity">' + Object.entries(COLORS).map(([k, c]) => '<span style="width:' + (100 * d.activity[k] / Math.max(1, d.durationMs)) + '%;background:' + c + '" tabindex="0" data-ct-tip="' + esc(LABELS[k] + ': ' + sec(d.activity[k])) + '"></span>').join('') + '</div>'
    + table(['Activity', 'Time', 'Share'], Object.entries(COLORS).map(([k]) => [esc(LABELS[k]), sec(d.activity[k]), pct(d.activity[k] / Math.max(1, d.durationMs))]))
    + chart(d.points, [{ name: 'Travelling %', color: COLORS.travelling, value: p => 100 * N(p.activity.travelling) / Math.max(1, p.t - p.from) }, { name: 'Attacking %', color: COLORS.attacking, value: p => 100 * N(p.activity.attacking) / Math.max(1, p.t - p.from) }], 'Activity over time', v => v.toFixed(0) + '%'));
  h += panel('Skill utilization', table(['Skill', 'Casts', 'Damage-observed casts', 'No damage observed yet', 'Targets / cast', 'Useful damage / cast', 'Mean cast interval', 'Mean selection delay', 'Mana spent', 'Cooldown-ready states'], Object.entries(d.skills).map(([id, s]) => {
    const src = d.sources['skill' + id], ready = Object.entries(s.readiness).filter(([k]) => k !== 'cooldown').map(([k, v]) => ({ ready: 'Ready / other conditions', mana: 'Insufficient raw MP', dead: 'Dead', castQueue: 'Cast queue busy', manualOnly: 'Manual-only skill', autoDisabled: 'Auto movement / casting disabled', noTarget: 'No live targets' })[k] + ': ' + sec(v)).join('; ');
    return [esc(skillName(id)), fmt(s.casts), fmt(s.damagingCasts), fmt(Math.max(0, s.casts - s.damagingCasts)), s.casts ? (s.uniqueTargets / s.casts).toFixed(2) : 'Unavailable',
      s.casts && src ? fmt(src.effective / s.casts) : 'Unavailable', s.intervals.count ? sec(s.intervals.sum / s.intervals.count) : 'Unavailable', s.selectionDelay.count ? sec(s.selectionDelay.sum / s.selectionDelay.count) : 'Unavailable', fmt(s.mp), esc(ready || 'No samples')];
  })) + '<div class="note">No-damage casts can be buffs, utility casts or effects still pending at run end; this is not a waste score. Cast-instance targets count each monster life once, including delayed effects. Source damage / cast also includes procs. Mana readiness uses the native selection gate\'s raw cost.</div>'
    + table(['Manual skill', 'Blocked press attempts'], (d.manualCasts || []).map(e => [esc(skillName(e.id)), esc(Object.entries(e.blocked).map(([k, v]) => k + ': ' + v).join('; ') || 'None')])));
  h += panel('Monster kill times', table(['Monster', 'Deaths observed', 'Mean spawn-to-death', 'Median spawn-to-death', 'p90 spawn-to-death', 'Mean first-hit-to-death', 'Longest life'], Object.entries(d.monsters).map(([key, m]) => [
    esc(mon(key)), fmt(m.kills), m.spawnToDeath.count ? sec(m.spawnToDeath.sum / m.spawnToDeath.count) : 'Unavailable', histText(m.spawnToDeath, .5), histText(m.spawnToDeath, .9), m.hitToDeath.count ? sec(m.hitToDeath.sum / m.hitToDeath.count) : 'Unavailable', m.spawnToDeath.count ? sec(m.spawnToDeath.max) : 'Unavailable',
  ])) + Object.entries(d.monsters).map(([key, m]) => '<details><summary>' + esc(mon(key)) + ' lifetime histogram</summary>' + table(['Duration bucket', 'Spawn-to-death', 'First-hit-to-death'], m.spawnToDeath.bins.map((count, i) => !count && !m.hitToDeath.bins[i] ? null : [
    sec(i ? 10 * 2 ** ((i - 1) / 2) : 0) + ' - ' + (i === 39 ? 'above' : sec(10 * 2 ** (i / 2))), fmt(count), fmt(m.hitToDeath.bins[i]),
  ]).filter(Boolean)) + '</details>').join('') + '<div class="note">Percentiles are histogram ranges, not exact retained samples. Living monsters are right-censored and excluded. Map-entry lives start at simulation time zero.</div>');
  h += panel('Survival and sustain', '<div class="card-grid cols-4">' + card('Lowest HP', fmt(d.sustain.minHp)) + card('Lowest MP', fmt(d.sustain.minMp))
    + card('Health-food healing', fmt(d.sustain.healing)) + card('Health-food overhealing', fmt(d.sustain.overhealing))
    + card('Time below 25% HP', sec(d.sustain.lowHpMs)) + card('Time below 25% MP', sec(d.sustain.lowMpMs))
    + card('Observed HP increases', fmt(d.sustain.hpRise)) + card('Observed MP increases', fmt(d.sustain.mpRise)) + '</div>'
    + chart(d.points, [{ name: 'HP minimum %', color: '#ef5350', value: p => p.hpCap ? 100 * p.hpMin / p.hpCap : 0 }, { name: 'MP minimum %', color: '#42a5f5', value: p => p.mpCap ? 100 * p.mpMin / p.mpCap : 0 }], 'Minimum HP and MP by time bucket', v => v.toFixed(0) + '%', d.bookmarks.filter(b => b.kind === 'playerDied'))
    + table(['Incoming damage source', 'HP loss requested'], Object.entries(d.sustain.incoming).map(([k, v]) => [esc(mon(k)), fmt(v)]))
    + table(['Food / potion', 'Consumed', 'Lab refilled', 'Useful health-food healing'], Object.entries(d.sustain.food).map(([k, f]) => [esc(item(k)), fmt(f.consumed), fmt(f.refilled), fmt(f.healing)]))
    + '<div class="note">Red dashed markers are deaths. Incoming HP-loss requests can exceed remaining HP. Attributed healing is health food only. Observed HP/MP increases sum positive net changes per 10 ms step, including respawns and levels; changes within the same step can cancel and these are not exact regeneration totals.</div>');
  h += panel('Rewards and consistency', '<div class="toolbar"><label>Rolling metric <select data-ct-rate>' + [['effective', 'Useful DPS'], ['damage', 'Raw DPS'], ['kills', 'Kills / minute'], ['exp', 'EXP / minute'], ['coins', 'Coins / minute'], ['items', 'Items / minute']].map(([k, v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select></label><label>Window <select data-ct-window><option value="10000">10 seconds</option><option value="60000">1 minute</option><option value="300000">5 minutes</option></select></label></div><div data-ct-rates></div>'
    + '<div class="card-grid cols-4">' + card('Longest kill gap', sec(d.rewards.longestKillGap)) + card('Longest item-drop gap', sec(d.rewards.longestItemGap)) + card('Crystal EXP', fmt(d.rewards.exp.crystal), 'Direct EXP on Crystal monster kills') + card('Chip respawns', fmt(d.rewards.chipRespawns)) + '</div>'
    + '<div class="note">Rolling windows use complete aggregated time buckets; long runs coarsen bucket resolution without dropping totals. Dry spells include the unfinished gap at run end. Omega gains are not extrapolated as steady hourly production.</div>');
  h += panel('Spatial efficiency and heatmap', '<div class="toolbar"><label>Heatmap <select data-ct-heat>' + COMBAT_HEATMAPS.map(([k, v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select></label><label><input type="checkbox" data-ct-route> Show route</label></div><div data-ct-map>' + combatHeatmapSvg(r, 'occupancy', fmt, false, ui) + '</div>'
    + table(['Platform', 'Player time', 'Time share', 'Sampled travel (px)', 'Kills', 'Useful damage'], Object.entries(d.platforms).map(([id, p]) => [esc(id), sec(p.ms), pct(p.ms / Math.max(1, d.sampledMs)), fmt(p.distance), fmt(p.kills), fmt(p.damage)]))
    + table(['Platform transition', 'Count'], Object.entries(d.transitions).map(([key, value]) => [esc(key.replace(':', ' to ')), fmt(value)])), true);
  h += panel('Buffs, statuses and class mechanics', table(['Buff / mechanic', 'Observed uptime', 'Share of sampled run'], [
    ...Object.entries(d.buffs).map(([id, ms]) => [esc(skillName(id)), sec(ms), pct(ms / Math.max(1, d.sampledMs))]),
    ...Object.entries(d.mechanics).map(([key, ms]) => [esc(MECHANICS[key] || key), sec(ms), pct(ms / Math.max(1, d.sampledMs))]),
  ]) + chart(d.points, [{ name: 'Orb count', color: '#ffd700', value: p => p.orb }], 'Orb count over time', fmt)
    + table(['Monster status', 'Monster-seconds'], Object.entries(d.statuses).map(([key, ms]) => [esc(key.replace(/^Status/, '').replace(/([a-z])([A-Z])/g, '$1 $2')), sec(ms)]))
    + '<div class="note">Status totals are monster-time, not player buff uptime, and can exceed run duration. Totem uptime includes its native fade. Saved initial buffs are included.</div>');
  h += panel('Loot collection', '<div class="card-grid cols-4">' + card('Pickup delay, mean', d.loot.pickupDelay.count ? sec(d.loot.pickupDelay.sum / d.loot.pickupDelay.count) : 'Unavailable')
    + card('Pickup delay, p90', histText(d.loot.pickupDelay, .9)) + card('Ground backlog peak', fmt(d.loot.groundPeak)) + card('Expired stacks', fmt(d.loot.expired)) + '</div>'
    + chart(d.points, [{ name: 'Ground actors', color: '#ffca28', value: p => p.ground }], 'Ground drop actors over time', fmt)
    + table(['Expired item', 'Quantity'], Object.entries(d.loot.expiredQty).map(([k, v]) => [esc(item(k)), fmt(v)]))
    + '<div class="note">Pickup delay is drop creation to completed collection. The backlog peak is sampled; the timeline counts ground actors, including short pickup animations. Full-inventory events: ' + fmt(d.loot.fullEvents) + '. Exact dropped/picked/lost quantities remain in Drops.</div>');
  return h + '<script type="application/json" class="ct-data">' + JSON.stringify(d).replace(/</g, '\\u003c') + '</script><div class="ct-tip" hidden role="tooltip"></div></div>';
}

export function mountCombatDiagnostics(host, r, format, seek) {
  const root = host.querySelector('.combat-telemetry'); if (!root) return;
  const fmt = format.fmtNum, tip = root.querySelector('.ct-tip');
  let current = null;
  function hide() { tip.hidden = true; current = null; }
  function show(target, x, y) {
    if (!target) return;
    current = target; tip.textContent = target.dataset.ctTip; tip.hidden = false;
    tip.style.left = Math.max(4, Math.min(innerWidth - tip.offsetWidth - 8, x + 12)) + 'px';
    tip.style.top = Math.max(4, Math.min(innerHeight - tip.offsetHeight - 8, y + 12)) + 'px';
  }
  root.addEventListener('pointerover', e => { const t = e.target.closest('[data-ct-tip]'); if (t !== current) show(t, e.clientX, e.clientY); });
  root.addEventListener('pointerout', e => { if (current && !current.contains(e.relatedTarget)) hide(); });
  root.addEventListener('focusin', e => { const t = e.target.closest('[data-ct-tip]'); if (t) { const b = t.getBoundingClientRect(); show(t, b.left, b.bottom); } });
  root.addEventListener('focusout', hide); root.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  root.querySelector('[data-ct-heat]').addEventListener('change', updateMap);
  root.querySelector('[data-ct-route]').addEventListener('change', updateMap);
  function bindSeeks() {
    root.querySelectorAll('[data-ct-seek]').forEach(b => {
      const unavailable = !r.snaps?.length || Number(b.dataset.ctSeek) > r.snaps.time(r.snaps.length - 1);
      if (b.tagName === 'BUTTON') b.disabled = unavailable;
      b.setAttribute('aria-disabled', String(unavailable));
    });
  }
  function updateMap() { hide(); root.querySelector('[data-ct-map]').innerHTML = combatHeatmapSvg(r, root.querySelector('[data-ct-heat]').value, fmt, root.querySelector('[data-ct-route]').checked, r.diagnosticsUI); }
  function range(from, to) {
    const end = r.summary.telemetry.durationMs;
    if (!(Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to > from && to <= end)) { root.querySelector('[data-ct-range-error]').textContent = 'Choose an increasing time range within this run.'; return; }
    root.querySelector('[data-ct-range-error]').textContent = '';
    r.diagnosticsUI = { from, to };
    root.querySelector('[data-ct-from]').value = from / 1000; root.querySelector('[data-ct-to]').value = to / 1000;
    root.querySelector('[data-ct-lanes]').innerHTML = combatTimelineSvg(r.summary.telemetry, from, to);
    updateMap(); bindSeeks();
  }
  for (const input of root.querySelectorAll('[data-ct-from],[data-ct-to]')) input.addEventListener('change', () => {
    root.querySelector('[data-ct-range]').value = '';
    range(Number(root.querySelector('[data-ct-from]').value) * 1000, Number(root.querySelector('[data-ct-to]').value) * 1000);
  });
  root.querySelector('[data-ct-range]').addEventListener('change', e => {
    const d = r.summary.telemetry, [kind, at] = e.target.value.split(':'), t = Number(at);
    if (kind === 'all') range(0, d.durationMs);
    else if (kind === 'opening') range(0, Math.min(30000, d.durationMs));
    else if (kind === 'ending') range(Math.max(0, d.durationMs - 30000), d.durationMs);
    else if (kind === 'before') range(0, t);
    else if (kind === 'after') range(t, d.durationMs);
    else if (kind === 'den') {
      const next = d.bookmarks.find(b => b.t > t && (b.kind === 'denEnd' || b.kind === 'denStart'));
      range(t, next?.t ?? d.durationMs);
    }
  });
  root.querySelectorAll('[data-ct-zoom]').forEach(b => b.addEventListener('click', () => {
    const d = r.summary.telemetry, ui = r.diagnosticsUI, span = Math.min(d.durationMs, (ui.to - ui.from) * (b.dataset.ctZoom === 'in' ? .5 : 2));
    const from = Math.max(0, Math.min(d.durationMs - span, (ui.from + ui.to - span) / 2));
    root.querySelector('[data-ct-range]').value = ''; range(from, from + span);
  }));
  function updateRates() {
    const key = root.querySelector('[data-ct-rate]').value, ms = Number(root.querySelector('[data-ct-window]').value);
    const p = combatRateSeries(r.summary.telemetry, key, ms);
    root.querySelector('[data-ct-rates]').innerHTML = chart(p, [{ name: key === 'coins' ? 'Copper / minute' : root.querySelector('[data-ct-rate]').selectedOptions[0].textContent, color: '#4dd0e1', value: p => p.value }], 'Rolling combat rates', fmt);
  }
  root.querySelector('[data-ct-rate]').addEventListener('change', updateRates);
  root.querySelector('[data-ct-window]').addEventListener('change', updateRates); updateRates();
  const jump = e => { const b = e.target.closest('[data-ct-seek]'); if (b && b.getAttribute('aria-disabled') !== 'true') seek(Number(b.dataset.ctSeek)); };
  root.addEventListener('click', jump);
  root.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('rect[data-ct-seek]')) { e.preventDefault(); jump(e); } });
  bindSeeks();
}

export function combatReplayIndex(snaps, timeMs) {
  let lo = 0, hi = Math.max(0, snaps.length - 1);
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (snaps.time(mid) <= timeMs) lo = mid; else hi = mid - 1; }
  return lo;
}

export function drawCombatHeatmap(ctx, data, key) {
  if (!data?.grid || !key) return;
  const g = data.grid, values = combatHeatmapValues(data, key); if (!values) return;
  const max = Math.max(0, ...values); if (!(max > 0)) return;
  ctx.save(); ctx.globalAlpha = .5;
  values.forEach((v, i) => {
    if (!(v > 0)) return;
    ctx.fillStyle = 'hsl(' + (240 - 240 * v / max) + ',90%,58%)';
    ctx.fillRect(g.x + i % g.cols * g.cellSize, g.y + Math.floor(i / g.cols) * g.cellSize, g.cellSize, g.cellSize);
  });
  ctx.restore();
}

export function drawCombatNavigation(ctx, snapshot, geo) {
  const p = snapshot.player, d = snapshot.diagnostics;
  if (!p || !d) return;
  ctx.save(); ctx.strokeStyle = '#4dd0e1'; ctx.fillStyle = '#4dd0e1'; ctx.lineWidth = 2;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  if (d.reach > 0) {
    ctx.beginPath(); ctx.moveTo(cx - d.reach, cy + 10); ctx.lineTo(cx + d.reach, cy + 10); ctx.stroke();
    ctx.font = '12px sans-serif'; ctx.fillText('Basic reach threshold', cx - d.reach, cy + 25);
  }
  const target = snapshot.monsters.find(m => m.uid === d.target);
  if (target) {
    ctx.strokeRect(target.x - 3, target.y - 3, target.w + 6, target.h + 6);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(target.x + target.w / 2, target.y + target.h / 2); ctx.stroke();
  }
  ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(cx, cy);
  let node = p.node;
  for (const index of d.path || []) {
    const nd = geo.nodes[node], next = nd?.neighbors?.[index];
    if (next == null || !geo.nodes[Number(next)]) break;
    const dest = geo.nodes[Number(next)];
    ctx.lineTo(N(nd.connectorX?.[index]) || (nd.x + nd.length) / 2, nd.y - 25);
    ctx.lineTo((dest.x + dest.length) / 2, dest.y - 25); node = Number(next);
  }
  ctx.stroke(); ctx.restore();
}
