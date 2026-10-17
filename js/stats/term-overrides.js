// ===== STAT TERM OVERRIDES =====
// Component-level overrides for the descriptor system. A "term" is one value
// that bubbles up into a final stat:
//   - a descriptor pool source, keyed by system + id (+ args), e.g. `card:10`,
//     `companion:50`, `arcaneMapMulti:0`; overridden in buildTree so every
//     descriptor's combine() keeps its literal source grouping, and the same
//     source changes consistently in every descriptor/pool that reads it;
//   - an inline source function, e.g. `arcaneMapMulti:1` for
//     ArcaneMapMulti_bon(1) inside the monster EXP chain, overridden where the
//     function returns.
//
// Overrides are scoped, never global: createStatContext() captures the active
// scope into ctx.termScope at creation, so only contexts built inside
// withTermScope() see them. A scope is { overrides: { key: rule }, trace?: [] }.
// Rules: { mode: 'off' } (neutral: 1 for multiplier-formatted terms, else 0),
// { mode: 'set', value }, { mode: 'scale', value } (saved × value).

var _ambient = null;

/** Runs fn with `scope` as the ambient term scope (synchronous). */
export function withTermScope(scope, fn) {
  var prev = _ambient;
  _ambient = scope || null;
  try { return fn(); } finally { _ambient = prev; }
}

/** The ambient scope captured by newly created stat contexts. */
export function currentTermScope() {
  return _ambient;
}

/** Stable key for a descriptor pool source. Resolvers may supply termKey(id, args). */
export function sourceTermKey(system, id, args, resolver) {
  if (resolver && typeof resolver.termKey === 'function') {
    var custom = resolver.termKey(id, args);
    if (custom) return custom;
  }
  var key = String(system);
  if (id !== undefined && id !== null) key += ':' + (Array.isArray(id) ? id.join(',') : String(id));
  if (Array.isArray(args) && args.length) key += ':' + args.join(',');
  return key;
}

export function neutralTermValue(fmt) {
  return fmt === 'x' ? 1 : 0;
}

/** Normalizes one rule; returns null when it should not apply. */
export function normalizeTermRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  if (rule.mode === 'off') return { mode: 'off' };
  if (rule.mode === 'set' || rule.mode === 'scale') {
    if (rule.value == null || (typeof rule.value === 'string' && rule.value.trim() === '')) return null;
    var v = Number(rule.value);
    if (!Number.isFinite(v)) return null;
    return { mode: rule.mode, value: v };
  }
  return null;
}

/** Drops invalid/saved rules from a { key: rule } map. */
export function normalizeTermOverrides(state) {
  var out = {};
  if (!state || typeof state !== 'object') return out;
  for (var k in state) {
    var r = normalizeTermRule(state[k]);
    if (r) out[k] = r;
  }
  return out;
}

export function termRuleValue(rule, saved, fmt) {
  var r = normalizeTermRule(rule);
  if (!r) return saved;
  if (r.mode === 'off') return neutralTermValue(fmt);
  if (r.mode === 'set') return r.value;
  return (Number(saved) || 0) * r.value;
}

function _scopeOf(ctx) {
  return (ctx && ctx.termScope) || null;
}

/**
 * Applies the context's override for `key` to `val` and records a trace entry.
 * meta: { name, fmt, group, desc, descName, pool }. Returns the effective value.
 */
export function applyTermOverride(ctx, key, val, meta) {
  var scope = _scopeOf(ctx);
  if (!scope) return val;
  meta = meta || {};
  var rule = scope.overrides && scope.overrides[key];
  var out = rule ? termRuleValue(rule, val, meta.fmt) : val;
  if (scope.trace) {
    var stack = scope.descStack;
    var top = stack && stack.length ? stack[stack.length - 1] : null;
    scope.trace.push({
      key: key, saved: val, val: out, overridden: !!rule,
      name: meta.name || key, fmt: meta.fmt || '', group: meta.group || meta.descName || (top && top.name) || '',
      desc: meta.desc || (top && top.id) || '', descName: meta.descName || (top && top.name) || '',
      pool: meta.pool || '', function: !!meta.function,
    });
  }
  return out;
}

/** Wraps a resolved pool item: returns it unchanged or an overridden copy. */
export function overrideSourceItem(ctx, key, item, meta) {
  var scope = _scopeOf(ctx);
  if (!scope || !item) return item;
  var saved = Number(item.val) || 0;
  var m = Object.assign({ name: item.name, fmt: item.fmt }, meta || {});
  var out = applyTermOverride(ctx, key, saved, m);
  if (!(scope.overrides && scope.overrides[key])) return item;
  return Object.assign({}, item, {
    val: out, overridden: true, savedVal: saved,
    note: 'override (saved ' + (+saved.toPrecision(6)) + ')' + (item.note ? ' · ' + item.note : ''),
  });
}

// ----- Resolver names (for descriptor rval() terms) -----
// Catalog resolvers are plain objects; rval() only has the object, so the
// stat context registers the catalog's name for each resolver.
var _resolverNames = new WeakMap();

export function registerTermResolvers(catalog) {
  if (!catalog) return;
  for (var name in catalog) {
    var r;
    try { r = catalog[name]; } catch (e) { continue; }
    if (r && typeof r === 'object' && !_resolverNames.has(r)) _resolverNames.set(r, name);
  }
}

export function resolverTermName(resolver) {
  return (resolver && _resolverNames.get(resolver)) || '';
}

// ----- Active descriptor contexts (for descriptor safe(fn, ...) terms) -----
var _activeCtx = [];

/** The stat context whose descriptor combine() is currently running, if it has a term scope. */
export function activeTermContext() {
  return _activeCtx.length ? _activeCtx[_activeCtx.length - 1] : null;
}

/** Marks descriptor entry/exit so inline function terms know their consumer. */
export function enterTermDescriptor(ctx, desc) {
  var scope = _scopeOf(ctx);
  if (!scope) return;
  _activeCtx.push(ctx);
  if (scope.trace) (scope.descStack || (scope.descStack = [])).push({ id: desc.id, name: desc.name });
}

export function exitTermDescriptor(ctx) {
  var scope = _scopeOf(ctx);
  if (!scope) return;
  if (_activeCtx.length && _activeCtx[_activeCtx.length - 1] === ctx) _activeCtx.pop();
  if (scope.descStack && scope.descStack.length) scope.descStack.pop();
}

// ----- Function terms: safe(fn, ...args) inside descriptor combine() -----
// Key: `fn:<name>[:<identifying args>]`. Identifying args are primitive args
// whose parameter name is not a character index, save/context object, or a
// derived multiplier, so a term is stable across characters and overrides.
var _fnParams = new WeakMap();
var _SKIP_PARAM = /^(ci|charidx|charindex|playeridx|activecharidx|currentcharidx|characteridx|s|S|savedata|ctx|opts|options|cache|ext|inputs|premulti|.*multi.*|.*mult)$/i;

function _paramNames(fn) {
  var names = _fnParams.get(fn);
  if (names) return names;
  names = [];
  try {
    var src = Function.prototype.toString.call(fn);
    var m = src.match(/^[^(]*\(([^)]*)\)/);
    if (m) names = m[1].split(',').map(function(p) { return p.replace(/=.*$/, '').trim(); });
  } catch (e) { /* native or bound */ }
  _fnParams.set(fn, names);
  return names;
}

export function functionTermKey(fn, args) {
  if (typeof fn !== 'function' || !fn.name) return '';
  var names = _paramNames(fn), parts = [];
  for (var i = 0; i < args.length; i++) {
    var a = args[i], t = typeof a;
    if (t !== 'string' && t !== 'number' && t !== 'boolean') continue;
    if (t === 'string' && a.length > 24) continue;
    if (_SKIP_PARAM.test(names[i] || '')) continue;
    if (!names[i] && t === 'number' && !Number.isInteger(a)) continue;
    parts.push(String(a));
  }
  return 'fn:' + fn.name.replace(/^bound /, '') + (parts.length ? ':' + parts.join(',') : '');
}

/** Human label for a function term key, e.g. `computeMealBonus (Cash)`. */
export function functionTermName(key) {
  var p = String(key).split(':');
  var n = (p[1] || '').replace(/^(compute|get)/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return n + (p.length > 2 ? ' (' + p.slice(2).join(':') + ')' : '');
}

/**
 * Collapses a trace into one row per key: { key, name, fmt, group, saved,
 * val, overridden, function, usedIn: [descName/pool...], varies }.
 */
export function summarizeTermTrace(trace) {
  var byKey = Object.create(null), order = [];
  for (var i = 0; i < (trace || []).length; i++) {
    var t = trace[i];
    var row = byKey[t.key];
    if (!row) {
      row = byKey[t.key] = {
        key: t.key, name: t.name, fmt: t.fmt, group: t.group, saved: t.saved, val: t.val,
        overridden: t.overridden, function: t.function, usedIn: [], descs: [], varies: false,
      };
      order.push(row);
    } else if (row.saved !== t.saved) {
      row.varies = true;
    }
    var where = (t.descName || t.desc || '') + (t.pool ? ' › ' + t.pool : '');
    if (where && row.usedIn.indexOf(where) < 0) row.usedIn.push(where);
    if (t.descName && row.descs.indexOf(t.descName) < 0) row.descs.push(t.descName);
  }
  return order;
}
