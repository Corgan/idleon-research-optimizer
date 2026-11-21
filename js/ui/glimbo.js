import { optionsListData } from '../save/data.js';
import { initSaveLoader } from './save-loader.js';
import { glimboTrades } from '../stats/data/w7/glimbo.js';
import { glimboCostInputs, glimboCostProjection } from '../stats/systems/w7/glimbo.js?v=glimbo-cost-1';
import { entityName } from '../stats/entity-names.js';
import { fmtVal } from '../renderers/format.js';
import { iconHtml, loadUiAssets, installIconFallback, esc, showTip, hideTip } from './combat-sim-picker.js';

const cards = document.getElementById('cards');
const start = document.getElementById('start');
const count = document.getElementById('count');
const metric = document.getElementById('metric');
const search = document.getElementById('search');
let inputs = null;
let assetError = '';
const open = new Set();
const selected = new Map();
const definitions = glimboTrades();
installIconFallback(cards);

function tooltip(anchor, html) {
  showTip(anchor, html);
  const tip = document.getElementById('css-setup-tip');
  tip.setAttribute('role', 'tooltip');
  tip.style.top = Math.max(8, parseFloat(tip.style.top)) + 'px';
}

function chart(rows, account) {
  const cumulative = metric.value === 'cumulative';
  const value = row => cumulative ? row.cumulative : row.cost;
  const reference = row => cumulative ? row.referenceCumulative : row.reference;
  const values = rows.flatMap(row => account ? [value(row), reference(row)] : [reference(row)]);
  const low = Math.min(...values), high = Math.max(...values);
  const log = high / low > 20;
  const top = high;
  const bottom = log ? low : 0;
  const transform = v => log ? Math.log10(v) : v;
  const x = i => 64 + i / Math.max(1, rows.length - 1) * 540;
  const y = v => 210 - (transform(v) - transform(bottom)) / (transform(top) - transform(bottom)) * 186;
  let body = '';
  for (let i = 0; i <= 4; i++) {
    const v = i === 4 ? top : log ? 10 ** (transform(bottom) + i / 4 * (transform(top) - transform(bottom))) : top * (i / 4);
    body += `<line class="axis" x1="64" x2="604" y1="${y(v)}" y2="${y(v)}"/>
      <text x="58" y="${y(v) + 4}" text-anchor="end">${esc(fmtVal(v))}</text>`;
  }
  body += `<polyline class="reference" points="${rows.map((row, i) => x(i) + ',' + y(reference(row))).join(' ')}"/>`;
  if (account) body += `<polyline class="price" points="${rows.map((row, i) => x(i) + ',' + y(value(row))).join(' ')}"/>`;
  for (const i of [0, Math.floor((rows.length - 1) / 2), rows.length - 1])
    body += `<text x="${x(i)}" y="233" text-anchor="middle">${rows[i].after}</text>`;
  body += '<text x="334" y="255" text-anchor="middle">Paid trade number</text>';
  rows.forEach((row, i) => {
    const left = i === 0 ? 64 : (x(i - 1) + x(i)) / 2;
    const right = i === rows.length - 1 ? 604 : (x(i) + x(i + 1)) / 2;
    body += `<rect data-point="${i}" x="${left}" y="20" width="${right - left}" height="190" fill="transparent"/>`;
  });
  return `<svg class="chart" viewBox="0 0 620 264" tabindex="0" role="slider"
    aria-label="Inspect trade costs with arrow keys" aria-valuemin="1" aria-valuemax="${rows.length}" aria-valuenow="1">${body}</svg>
    <div class="legend">${account ? '<span class="account">Your account</span>' : ''}<span class="base">No discounts</span><span class="muted">${log ? 'Logarithmic' : 'Linear'} price axis</span></div>`;
}

function render() {
  hideTip();
  const active = document.activeElement;
  const focused = active?.closest('.trade')?.dataset.index;
  const focusKey = active?.dataset.focus;
  const scroll = { x: window.scrollX, y: window.scrollY };
  const tableScroll = new Map([...cards.querySelectorAll('.table-wrap')].map(el =>
    [Number(el.closest('.trade').dataset.index), { top: el.scrollTop, left: el.scrollLeft }]));
  cards.querySelectorAll('details').forEach(el => {
    const key = Number(el.closest('.trade').dataset.index);
    if (el.open) open.add(key); else open.delete(key);
  });
  const account = inputs !== null;
  document.getElementById('status').textContent = !account
    ? 'Undiscounted reference from the first trade. Load a save for your counts and discounts.'
    : `Event discount: ${inputs.eventOwned ? '25%' : 'none assumed'}. Companion discount: ${inputs.companion}%. ${inputs.reasons.join(' ')}`;
  document.getElementById('status').className = inputs?.partial ? 'partial' : 'muted';
  if (assetError) {
    document.getElementById('status').textContent += ' Icon loading failed: ' + assetError;
    document.getElementById('status').className = 'error';
  }
  cards.replaceChildren();
  for (const definition of definitions) {
    const { index, material, upgrade, scale } = definition;
    const name = entityName('Item', material), upgradeName = entityName('Vault', upgrade);
    const card = document.createElement('article');
    card.className = 'trade'; card.dataset.index = index;
    card.dataset.search = (name + ' ' + upgradeName).toLowerCase();
    card.innerHTML = `<header>${iconHtml('items', material, name, { size: 40 })}
      <div><h2>${esc(name)}</h2><h3>${esc(upgradeName)}</h3>
      <div class="muted">${scale}x exponential scaling per paid trade</div></div></header>`;
    cards.appendChild(card);
    try {
      const n = start.value === 'saved' ? inputs?.trades[index] : 0;
      if (n == null) throw new Error('Saved paid-trade count is unavailable.');
      const rows = glimboCostProjection(index, n, Number(count.value), inputs || {});
      const first = rows[0], last = rows.at(-1);
      card.insertAdjacentHTML('beforeend', `<div class="quotes">
        <div><span class="muted">Completed paid trades</span><strong>${n}</strong></div>
        <div><span class="muted">${account ? 'Next quote' : 'First quote'}</span><strong tabindex="0" data-focus="quote" data-exact="${first.cost}">${esc(fmtVal(first.cost))}</strong></div>
        <div><span class="muted">Displayed total</span><strong tabindex="0" data-focus="total" data-exact="${last.cumulative}">${esc(fmtVal(last.cumulative))}</strong></div></div>
        ${inputs?.partial ? '<div class="partial">Partial: discounts may be missing.</div>' : ''}
        ${chart(rows, account)}
        <details><summary data-focus="details">Exact per-trade costs</summary><div class="table-wrap" data-focus="table" tabindex="0"></div></details>`);
      const details = card.querySelector('details');
      const mountTable = () => {
        if (!details.open || details.querySelector('table')) return;
        details.querySelector('.table-wrap').innerHTML = `<table><thead><tr><th>Trade</th><th>Quote</th><th>Cumulative</th><th>No discounts</th></tr></thead><tbody>${rows.map(row =>
          `<tr data-cost="${row.cost}" data-cumulative="${row.cumulative}"><td>${row.after}</td><td>${row.cost}</td><td>${row.cumulative}</td><td>${row.reference}</td></tr>`).join('')}</tbody></table>`;
      };
      details.addEventListener('toggle', () => {
        if (details.open) open.add(index); else open.delete(index);
        mountTable();
      });
      details.open = open.has(index);
      mountTable();
      const previousScroll = tableScroll.get(index);
      if (previousScroll) {
        details.querySelector('.table-wrap').scrollTop = previousScroll.top;
        details.querySelector('.table-wrap').scrollLeft = previousScroll.left;
      }
      const svg = card.querySelector('svg');
      svg.dataset.focus = 'chart';
      let position = Math.min(rows.length - 1, selected.get(index) || 0);
      svg.setAttribute('aria-valuenow', position + 1);
      svg.setAttribute('aria-valuetext', `Trade ${rows[position].after}, quote ${rows[position].cost}, cumulative ${rows[position].cumulative}`);
      function inspect(i, anchor = svg) {
        position = i; selected.set(index, i);
        const row = rows[i];
        svg.setAttribute('aria-valuenow', i + 1);
        svg.setAttribute('aria-valuetext', `Trade ${row.after}, quote ${row.cost}, cumulative ${row.cumulative}`);
        tooltip(anchor, `<b>${esc(name)}: trade ${row.after}</b><br>Quote: ${row.cost}<br>Cumulative: ${row.cumulative}<br>No discounts: ${row.reference}<br>Undiscounted cumulative: ${row.referenceCumulative}${row.high ? '<br>Billion-price branch (no rounding)' : ''}`);
      }
      svg.addEventListener('pointermove', e => { if (e.target.dataset.point != null) inspect(Number(e.target.dataset.point), e.target); });
      svg.addEventListener('pointerleave', hideTip);
      svg.addEventListener('focus', () => inspect(position));
      svg.addEventListener('blur', hideTip);
      svg.addEventListener('keydown', e => {
        if (e.key === 'Escape') { hideTip(); return; }
        const i = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1
          : ['ArrowRight', 'ArrowUp'].includes(e.key) ? Math.min(rows.length - 1, position + 1)
          : ['ArrowLeft', 'ArrowDown'].includes(e.key) ? Math.max(0, position - 1) : null;
        if (i !== null) { e.preventDefault(); inspect(i); }
      });
      card.querySelectorAll('[data-exact]').forEach(el => {
        const show = () => tooltip(el, esc(el.dataset.exact));
        el.addEventListener('pointerenter', show); el.addEventListener('focus', show);
        el.addEventListener('pointerleave', hideTip); el.addEventListener('blur', hideTip);
        el.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
      });
    } catch (error) {
      const text = document.createElement('p');
      text.className = 'error'; text.textContent = error.message; card.appendChild(text);
    }
  }
  filter();
  if (focused != null && focusKey)
    cards.querySelector(`[data-index="${focused}"] [data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
  window.scrollTo(scroll.x, scroll.y);
}

function filter() {
  const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let visible = 0;
  cards.querySelectorAll('.trade').forEach(card => {
    card.hidden = !words.every(word => card.dataset.search.includes(word));
    if (!card.hidden) visible++;
  });
  document.getElementById('empty').hidden = visible !== 0;
}

for (const control of [start, count, metric]) control.addEventListener('change', render);
search.addEventListener('input', filter);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
window.addEventListener('scroll', hideTip, true);
window.addEventListener('resize', hideTip);
render();
loadUiAssets().then(render).catch(error => {
  assetError = error.message;
  render();
});
initSaveLoader({ target: '#save-area', auth: true, onLoad(S) {
  const first = inputs === null;
  inputs = glimboCostInputs(S, optionsListData);
  start.querySelector('[value="saved"]').disabled = false;
  if (first) start.value = 'saved';
  render();
} });
