// ===== JUSTICE MONUMENT RESPONSE ADVISOR (W5) =====
import { justiceCases } from '../../data/w5/hole.js';
import { monumentRunStats } from './monument.js';

const CASES = justiceCases();
const RESOURCES = { m: 'health', c: 'coins', h: 'popularity', d: 'dismissals', r: 'chests' };
export const JUSTICE_EFFECTS = [
  ['StudentLoanInvest', 'Student loan principal', 'Next Big Biz visit repays twice this amount.'],
  ['ScripticusLoan', 'Scripticus loan principal', 'Next Scripticus visit repays 1.25x, rounded up.'],
  ['PoppyLoan', 'Poppy loan principal', 'Next Scripticus visit repays 1.35x, rounded up.'],
  ['TimeBizInvestQ', 'Time business principal', 'Returns 2.5x when its case countdown expires.'],
  ['TimeBizInvestT', 'Time business cases left', 'Decreases at each new case, including the case immediately after purchase.'],
  ['CryptoInvest', 'Crypto cases left', 'One coin per new case.'],
  ['RetireInvest', 'Retirement fund cases left', 'Two coins per new case.'],
  ['BeanLoan', 'Bean loan principal', 'Returned at the next Bean visit, before your response.'],
  ['BeanDeal', 'Bean deal rejections left', 'Approvals give four coins; the last rejection wipes popularity; dismissal ends the deal.'],
  ['NoApprove', 'Approval ban cases left', 'Cannot approve; countdown decreases at each new case.'],
  ['ChestMag', 'Chest magnet cases left', 'Forces chest-seller cases on non-Harbinger turns.'],
  ['DrinksHad', 'Drinks since last Bean secret', 'Three drinks force the Bean secret case on an eligible turn.'],
  ['TimmyRejections', 'Timmy rejections', 'Three rejections can force his Harbinger guilt case.'],
  ['TimmyIceCream', 'Timmy ice creams given', 'Controls the next ice-cream request; the final hug grants mental health.'],
  ['RupieMagicz', 'Slug favors', 'Three unlock the Slug swap offer.'],
  ['HaveMoreCoinsOrLoseHP', 'Promised Chester coin balance', 'Next Chester visit loses one mental health if coins are below this.'],
  ['popularityExample', 'Poppy example popularity', 'Next Poppy visit adds round(1.6x this amount) popularity.'],
  ['RejectTimmyDeal', 'Must reject next Timmy', 'Blocks approval for Timmy until rejection or dismissal.'],
  ['ScripticusApprovePromise', 'Promised next approval', 'Rejecting or dismissing the next case loses one mental health.'],
  ['ScareLegal', 'Scaring is legal', 'Loses one popularity on each non-Harbinger case until repealed.'],
  ['HandLaw', 'Hand above the law', 'Each Hand visit gives four coins and costs two popularity.'],
  ['PermaPop', 'Permanent popularity floor', 'After each response, popularity is at least five.'],
  ['lifeInsurance', 'Life insurance', 'Next Big Biz visit sets mental health, coins and popularity to one.'],
  ['noDismissDeath', 'Never dismiss Harbinger', 'Blocks Harbinger dismissal.'],
  ['BrokeDeath', 'Already rescued from bankruptcy', 'The next broke Harbinger visit forces mental-health loss.'],
].map(([key, name, help]) => ({ key, name, help,
  flag: ['RejectTimmyDeal', 'ScripticusApprovePromise', 'ScareLegal', 'HandLaw', 'PermaPop', 'lifeInsurance', 'noDismissDeath', 'BrokeDeath'].includes(key) }));

function _validate(state) {
  for (const key of ['round', 'health', 'coins', 'popularity', 'dismissals', 'chests']) {
    if (!Number.isSafeInteger(state[key]) || (key !== 'popularity' && state[key] < 0))
      throw new Error('Justice ' + key + ' must be ' + (key === 'popularity' ? 'an integer.' : 'a nonnegative integer.'));
  }
  if (!state.effects || typeof state.effects !== 'object' || Array.isArray(state.effects)) throw new Error('Justice effects must be an object.');
  for (const [key, val] of Object.entries(state.effects)) {
    if (!JUSTICE_EFFECTS.some(e => e.key === key) || !Number.isSafeInteger(val) || val < 0)
      throw new Error('Invalid Justice effect: ' + key);
  }
}
function _copy(state) { return { ...state, effects: { ...state.effects } }; }
function _case(id) {
  if (!Number.isInteger(id) || !CASES[id]) throw new Error('Unknown Justice case.');
  return CASES[id];
}
function _has(state, key) { return Object.hasOwn(state.effects, key); }
function _delta(state, row, action, code) {
  let value = 0;
  for (const term of row[action].split('.')) if (term.startsWith(code)) value = Number(term.slice(1));
  if (row.scaling.includes(code)) value = Math.round(value * Math.ceil((state.round + 1) / 5));
  if (action === 'approve' && row.visitor === 4 && code === 'c')
    value = Math.round(value * (1 + .25 * Math.floor(state.round / 13)));
  return value;
}

export function justiceInitialState(S) {
  const s = monumentRunStats(S, 1);
  return { round: 0, health: s.health, coins: s.coins, popularity: s.popularity,
    dismissals: s.dismissals, chests: 0, effects: {} };
}

export function justiceCaseText(state, id) {
  _validate(state);
  const row = _case(id);
  return { ...row, text: row.text.replaceAll('{', String(Math.max(Math.abs(_delta(state, row, 'approve', 'c')), Math.abs(_delta(state, row, 'reject', 'c')))))
    .replaceAll('}', String(Math.max(Math.abs(_delta(state, row, 'approve', 'h')), Math.abs(_delta(state, row, 'reject', 'h'))))) };
}

function _blocked(s, row, action) {
  if (s.health <= 0) return 'The story has ended.';
  if (action === 'dismiss') {
    if (s.dismissals <= 0) return 'No dismissals remain.';
    if (row.visitor === 4 && _has(s, 'noDismissDeath')) return 'Your Harbinger contract blocks dismissal.';
  }
  if (action === 'approve') {
    if (_has(s, 'NoApprove')) return 'Approval ban is active.';
    if (row.visitor === 0 && _has(s, 'RejectTimmyDeal')) return 'You promised not to approve Timmy.';
    const gate = { coincheck: ['coins', 'c'], popcheck: ['popularity', 'h'], chestcheck: ['chests', 'r'] }[row.gate];
    if (gate && s[gate[0]] < Math.abs(_delta(s, row, action, gate[1]))) return 'Not enough ' + gate[0] + '.';
    if (row.gate === 'dismisscheck' && s.dismissals <= 0) return 'This offer requires a dismissal.';
  }
  return null;
}

function _apply(s, row, action, variant) {
  const id = row.id, f = s.effects, has = key => _has(s, key);
  const delta = code => _delta(s, row, action, code);
  if (action === 'approve') {
    if (id === 2) f.StudentLoanInvest = Math.abs(delta('c'));
    if (id === 34) f.ScripticusLoan = Math.abs(delta('c'));
    if (id === 36) { f.TimeBizInvestQ = Math.abs(delta('c')); f.TimeBizInvestT = 15; }
    if (id === 63) f.NoApprove = 3;
    if (id === 62) f.HandLaw = 1;
    if (id === 26) { f.BeanLoan = s.coins; s.coins = 0; }
    if (id === 27) s.coins = Math.floor(s.coins / 2);
    if (id === 60 && variant === 1) s.coins = Math.round(s.coins + Math.abs(6 * delta('c')));
    if (id === 58) f.PermaPop = 1;
    if (id === 29) f.BeanDeal = 2;
    if (row.visitor === 13) f.DrinksHad = (f.DrinksHad || 0) + 1;
    if (id === 43) f.CryptoInvest = 15;
    if (id === 53) f.RetireInvest = 10;
    if (id === 55) f.ChestMag = 3;
    if (variant === 1) {
      if (id === 40) s.coins = Math.round(s.coins - 1.65 * delta('c'));
      if (id === 41) s.popularity = Math.round(s.popularity - 1.65 * delta('h'));
      if (id === 42) s.chests = Math.max(-2, Math.round(s.chests - 3));
      if (id === 54) s.health = Math.max(-1, Math.round(s.health - 3));
    }
    if (id === 31) f.RejectTimmyDeal = 1;
    if (id === 33 && s.health >= 2) s.health = Math.round(s.health - 1);
    if (id === 50) f.ScareLegal = 1;
    if (id === 59) delete f.ScareLegal;
    delete f.ScripticusApprovePromise;
    if (id === 24) f.ScripticusApprovePromise = 1;
    if (id === 3) { s.coins = Math.round(s.coins + 2 * s.popularity); s.popularity = 0; }
    if (has('BeanDeal')) s.coins = Math.round(s.coins + 4);
    if (id === 64) f.HaveMoreCoinsOrLoseHP = s.coins;
    if (id === 65) { s.coins = Math.ceil(s.coins + .3 * s.popularity); s.popularity = Math.ceil(s.popularity - .2 * s.popularity); }
    if (id === 66) { s.popularity = Math.ceil(s.popularity + Math.min(s.popularity / 3, .3 * s.coins)); s.coins = Math.ceil(s.coins - .2 * s.coins); }
    if (id === 72) f.lifeInsurance = 1;
    if (id === 74) { f.popularityExample = s.popularity; s.popularity = 1; }
    if (id === 75) f.PoppyLoan = Math.abs(delta('c'));
    if (id === 80) {
      if (variant < 2) s.chests = Math.round(s.chests + (variant === 0 ? 2 : 3));
      else if (variant === 2) s.dismissals = Math.round(s.dismissals + 2);
      else s.coins = Math.round(s.coins + 2);
    }
    if (id === 85) f.noDismissDeath = 1;
    if (id === 86) { const coins = s.coins; s.coins = Math.ceil(s.popularity); s.popularity = Math.ceil(coins); delete f.RupieMagicz; }
    if (id >= 65 && id <= 69) f.RupieMagicz = (f.RupieMagicz || 0) + 1;
    if (id >= 81 && id <= 84) f.TimmyIceCream = Math.round((f.TimmyIceCream || 0) + 1);
    // Native applies the table effects after every special-case mutation.
    for (const [code, key] of Object.entries(RESOURCES)) s[key] = Math.round(s[key] + delta(code));
  } else if (action === 'reject') {
    for (const [code, key] of Object.entries(RESOURCES)) s[key] = Math.round(s[key] + delta(code));
    if (has('ScripticusApprovePromise')) { s.health--; delete f.ScripticusApprovePromise; }
    if (row.visitor === 0) { f.TimmyRejections = (f.TimmyRejections || 0) + 1; delete f.RejectTimmyDeal; }
    if (has('BeanDeal')) {
      f.BeanDeal = Math.round(f.BeanDeal - 1);
      if (f.BeanDeal === 0) { s.popularity = 0; delete f.BeanDeal; }
    }
  } else {
    s.dismissals--;
    if (id === 15) s.health--;
    if (id === 28) s.chests++;
    if (has('ScripticusApprovePromise')) { s.health--; delete f.ScripticusApprovePromise; }
    delete f.BeanDeal;
    if (row.visitor === 0) delete f.RejectTimmyDeal;
  }
  for (const key of ['health', 'coins', 'popularity', 'dismissals']) s[key] = Math.round(Math.max(0, s[key]));
  if (has('PermaPop')) s.popularity = Math.max(5, s.popularity);
  if (s.health > 0) s.round++;
  return s;
}

function _variants(row, action) {
  if (action !== 'approve') return [{ probability: 1, label: 'Outcome' }];
  if ([40, 41, 42, 54].includes(row.id)) return [
    { probability: .5, label: 'Heads' }, { probability: .5, label: 'Tails' },
  ];
  if (row.id === 60) return [{ probability: 2 / 3, label: 'Ordinary glass' }, { probability: 1 / 3, label: 'Limited glass' }];
  if (row.id === 80) return [
    { probability: .3, label: 'Two chests' }, { probability: .63, label: 'Three chests' },
    { probability: .035, label: 'Two dismissals' }, { probability: .035, label: 'Two coins' },
  ];
  return [{ probability: 1, label: 'Outcome' }];
}

export function justiceDelayedEffects(state) {
  _validate(state);
  return JUSTICE_EFFECTS.filter(e => _has(state, e.key)).map(e => ({ ...e, value: state.effects[e.key] }));
}

function _value(s) {
  const f = s.effects;
  const scheduledCoins = Math.min(10, f.CryptoInvest || 0) + 2 * Math.min(10, f.RetireInvest || 0)
    + ((f.TimeBizInvestT || Infinity) <= 10 ? 2.5 * (f.TimeBizInvestQ || 0) : 0);
  return 30 * s.health + 12 * s.chests + 6 * s.dismissals
    + 8 * Math.log1p(s.coins + scheduledCoins) + 8 * Math.log1p(s.popularity)
    - (_has(s, 'lifeInsurance') ? 30 * Math.max(0, s.health - 1) : 0)
    - (_has(s, 'ScareLegal') ? 8 : 0) - 3 * (f.NoApprove || 0)
    + (_has(s, 'PermaPop') ? 8 : 0);
}

export function justiceResponses(state, id) {
  _validate(state);
  const row = _case(id);
  const group = CASES.filter(c => c.visitor === row.visitor && c.text === row.text);
  const responses = ['approve', 'reject', 'dismiss'].map(action => {
    const blocked = _blocked(state, row, action);
    if (blocked) return { action, blocked, outcomes: [] };
    const outcomes = [];
    for (const candidate of group) for (const [variant, v] of _variants(candidate, action).entries()) {
      const next = _apply(_copy(state), candidate, action, variant);
      const same = outcomes.find(o => JSON.stringify(o.state) === JSON.stringify(next));
      if (same) { same.probability += v.probability / group.length; same.caseIds.push(candidate.id); }
      else outcomes.push({ ...v, probability: v.probability / group.length, state: next, caseIds: [candidate.id],
        label: group.length === 1 ? v.label : Object.entries(RESOURCES).filter(([, key]) => next[key] !== state[key])
          .map(([, key]) => (next[key] - state[key] > 0 ? '+' : '') + (next[key] - state[key]) + ' ' + key).join(', ') || 'No resource change' });
    }
    const survival = outcomes.reduce((sum, o) => sum + o.probability * (o.state.health > 0 ? 1 : 0), 0);
    const value = outcomes.reduce((sum, o) => sum + o.probability * _value(o.state), 0);
    return { action, blocked: null, outcomes, survival, value };
  });
  const legal = responses.filter(r => !r.blocked).sort((a, b) => b.survival - a.survival || b.value - a.value);
  return { row: justiceCaseText(state, id), ambiguous: group.length > 1, responses, recommended: legal[0]?.action ?? null,
    heuristic: 'Survival-first heuristic, then mental health, chests, dismissals and balanced coin/popularity reserves. Includes up to ten cases of scheduled investment income; visitor-dependent repayments are listed, not treated as guaranteed. Not a whole-story optimum.' };
}

// Call once when the next observed case opens, never when inspecting response choices.
export function justiceOpenCase(state, id) {
  _validate(state);
  if (state.health <= 0) throw new Error('The Justice story has ended.');
  const s = _copy(state), f = s.effects, row = _case(id), notes = [];
  const has = key => _has(s, key);
  if (has('TimeBizInvestT')) {
    f.TimeBizInvestT = Math.round(f.TimeBizInvestT - 1);
    if (f.TimeBizInvestT <= 0) {
      const before = s.coins;
      s.coins = Math.round(s.coins + 2.5 * (f.TimeBizInvestQ || 0));
      notes.push('Time business paid ' + (s.coins - before) + ' coins.');
      delete f.TimeBizInvestT; delete f.TimeBizInvestQ;
    }
  }
  for (const [key, coins] of [['CryptoInvest', 1], ['RetireInvest', 2]]) if (has(key)) {
    f[key] = Math.round(f[key] - 1); s.coins = Math.round(s.coins + coins);
    notes.push((key === 'CryptoInvest' ? 'Crypto' : 'Retirement fund') + ' paid ' + coins + ' coins.');
    if (f[key] <= 0) delete f[key];
  }
  if (has('NoApprove')) { f.NoApprove = Math.round(f.NoApprove - 1); if (f.NoApprove <= 0) delete f.NoApprove; }
  const harbingerTurn = (s.round + 1) % 5 === 0;
  if (harbingerTurn) {
    if (row.id === 14) f.BrokeDeath = 1;
    if (row.id === 15) delete f.BrokeDeath;
    if (row.id === 13) delete f.TimmyRejections;
  } else {
    if (has('ScareLegal')) { s.popularity = Math.max(0, s.popularity - 1); notes.push('Legal scaring cost one popularity.'); }
    if (has('ChestMag')) { f.ChestMag--; if (f.ChestMag <= 0) delete f.ChestMag; }
    else if (has('DrinksHad') && f.DrinksHad >= 3) delete f.DrinksHad;
  }
  if (row.visitor === 2) {
    if (has('StudentLoanInvest')) { s.coins = Math.round(s.coins + 2 * f.StudentLoanInvest); delete f.StudentLoanInvest; notes.push('Student loan repaid.'); }
    if (has('lifeInsurance')) { s.health = 1; s.coins = 1; s.popularity = 1; delete f.lifeInsurance; notes.push('Life insurance reset mental health, coins and popularity to one.'); }
  }
  if (row.visitor === 7 && has('BeanLoan')) { s.coins = Math.round(s.coins + f.BeanLoan); delete f.BeanLoan; notes.push('Bean loan repaid.'); }
  if (row.visitor === 6) for (const [key, factor] of [['ScripticusLoan', 1.25], ['PoppyLoan', 1.35]]) if (has(key)) {
    s.coins = Math.ceil(s.coins + factor * f[key]); delete f[key]; notes.push('Scripticus repaid ' + (key === 'PoppyLoan' ? "Poppy's" : 'his') + ' loan.');
  }
  if (row.visitor === 1 && has('HandLaw')) { s.coins = Math.ceil(s.coins + 4); s.popularity = Math.ceil(s.popularity - 2); notes.push('Hand law: +4 coins, -2 popularity.'); }
  if (row.visitor === 5 && has('HaveMoreCoinsOrLoseHP')) {
    if (s.coins < f.HaveMoreCoinsOrLoseHP) { s.health--; notes.push('Chester coin promise cost one mental health.'); }
    delete f.HaveMoreCoinsOrLoseHP;
  }
  if (row.visitor === 15 && has('popularityExample')) {
    s.popularity += Math.round(1.6 * f.popularityExample); delete f.popularityExample; notes.push('Poppy returned example popularity.');
  }
  return { state: s, notes };
}
