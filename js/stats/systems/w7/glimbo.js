// ===== GLIMBO TRADE COSTS (W7) =====
import { glimboTrades } from '../../data/w7/glimbo.js';
import { companionBonusForSave } from '../../data/common/companions.js';
import { eventShopOwned } from '../../../game-helpers.js';

const _trades = glimboTrades();

function _integer(value, name) {
  if (!['number', 'string'].includes(typeof value) || value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0)
    throw new Error(name + ' must be a nonnegative safe integer.');
  return Number(value);
}

export function glimboCostInputs(S, accountOptions = []) {
  const reasons = [];
  const shop = accountOptions[311];
  const eventKnown = typeof shop === 'string';
  if (!eventKnown) reasons.push('Event Shop ownership is missing; no event discount is assumed.');
  if (!S.companionDataAvailable)
    reasons.push('Companion ownership is missing; only known bonus-token ownership is included.');
  const trades = _trades.map(({ index }) => {
    const value = S.research?.[12]?.[index];
    return ['number', 'string'].includes(typeof value) && value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0
      ? Number(value) : null;
  });
  return {
    trades, eventOwned: eventKnown ? eventShopOwned(38, shop) : 0,
    companion: companionBonusForSave(57, S), partial: reasons.length > 0, reasons,
  };
}

export function glimboCost(index, trades, { eventOwned = 0, companion = 0 } = {}) {
  const definition = _trades[_integer(index, 'Trade index')];
  if (!definition) throw new Error('Unknown Glimbo trade.');
  const n = _integer(trades, 'Paid trade count');
  if (eventOwned !== 0 && eventOwned !== 1) throw new Error('Event ownership must be zero or one.');
  if (!Number.isFinite(companion) || companion < 0) throw new Error('Invalid companion discount.');
  const eventAdjusted = (1 + n + 1.5 * n) * Math.pow(definition.scale, n)
    * Math.max(.1, 1 - 25 * eventOwned / 100);
  // The branch tests the event-adjusted price, before the companion discount.
  const high = eventAdjusted >= 1e9;
  const cost = high ? eventAdjusted * Math.max(.01, 1 - companion / 100)
    : Math.floor(Math.max(1, eventAdjusted * Math.max(.2, 1 - companion / 100)));
  if (!Number.isFinite(cost)) throw new Error('Glimbo cost exceeds the numeric range.');
  return { cost, eventAdjusted, high };
}

export function glimboCostProjection(index, start, count = 50, reductions = {}) {
  start = _integer(start, 'Starting paid trade count');
  count = _integer(count, 'Projection length');
  if (count < 1 || count > 500) throw new Error('Project between 1 and 500 trades.');
  _integer(start + count, 'Ending paid trade count');
  let cumulative = 0, referenceCumulative = 0;
  const rows = [];
  for (let offset = 0; offset < count; offset++) {
    const trades = start + offset;
    const quote = glimboCost(index, trades, reductions);
    const reference = glimboCost(index, trades);
    cumulative += quote.cost;
    referenceCumulative += reference.cost;
    if (!Number.isFinite(cumulative) || !Number.isFinite(referenceCumulative))
      throw new Error('Cumulative Glimbo costs exceed the numeric range.');
    rows.push({ trades, after: trades + 1, ...quote, cumulative,
      reference: reference.cost, referenceCumulative });
  }
  return rows;
}
