import { formulaConstant as c, formulaInput, formulaOperation as op } from './stats/formula-tree.js';

/**
 * Detailed ArbitraryCode5Inputs arithmetic. Inputs can carry their own upstream
 * trees; an unsourced input remains explicitly unexpanded.
 */
export function formulaEvalDetail(type, x1, x2, lv, inputs = {}) {
  function input(key, value, name) {
    const supplied = inputs[key];
    if (supplied && !Object.is(supplied.val, value)) {
      throw new Error('Formula input does not match ' + key);
    }
    return supplied || formulaInput(name, value);
  }
  const a = input('x1', x1, 'First coefficient');
  const b = input('x2', x2, 'Second coefficient');
  const l = input('lv', lv, 'Level');
  const add = (a, b) => op('Addition', 'add', a, b);
  const sub = (a, b) => op('Subtraction', 'subtract', a, b);
  const mul = (a, b) => op('Multiplication', 'multiply', a, b);
  const div = (a, b) => op('Division', 'divide', a, b);
  const floor = a => op('Round down', 'floor', a);
  const max = (a, b) => op('Maximum', 'max', a, b);
  const next = () => add(l, c(1));
  const rising = () => mul(mul(div(add(div(add(a, b), b), mul(c(0.5), sub(l, c(1)))), div(a, b)), l), a);
  let result;
  let branch = '';
  switch (type) {
    case 'add':
      branch = 'Second coefficient !== 0 is ' + (x2 !== 0) + '.';
      result = x2 !== 0 ? rising() : mul(a, l);
      break;
    case 'addLower': result = add(a, mul(b, next())); break;
    case 'addDECAY':
      branch = 'Level < 50001 is ' + (lv < 50001) + '.';
      result = lv < 50001 ? mul(a, l)
        : add(mul(a, op('Linear level cap', 'min', c(50000), l)),
          mul(mul(div(sub(l, c(50000)), add(sub(l, c(50000)), c(150000))), a), c(50000)));
      break;
    case 'decay': result = div(mul(a, l), add(l, b)); break;
    case 'decayLower':
    case 'decayMultiLower':
      result = sub(div(mul(a, next()), add(next(), b)), div(mul(a, l), add(l, b)));
      break;
    case 'decayMulti': result = add(c(1), div(mul(a, l), add(l, b))); break;
    case 'bigBase': result = add(a, mul(b, l)); break;
    case 'bigBaseLower': result = { ...b }; break;
    case 'intervalAdd': result = add(a, floor(div(l, b))); break;
    case 'intervalAddLower':
      result = sub(max(floor(div(next(), b)), c(0)), max(floor(div(l, b)), c(0)));
      break;
    case 'reduce': result = sub(a, mul(b, l)); break;
    case 'reduceLower': result = sub(a, mul(b, next())); break;
    case 'PtsSpentOnGuildBonus': result = sub(rising(), mul(b, l)); break;
    default:
      return {
        name: 'Unsupported formula: ' + type, val: 0, kind: 'unexpanded',
        unavailable: true, reason: 'The scalar evaluator falls through to zero; no formula is defined.',
        children: [a, b, l],
      };
  }
  return { ...result, name: type + ' formula', ...(branch ? { note: branch } : {}) };
}

export function getLOGDetail(input) {
  return op('Game logarithm', 'divide',
    op('Natural logarithm', 'log',
      op('Minimum logarithm input', 'max', input, c(1))),
    c(2.30259, 'Native logarithm divisor'));
}
