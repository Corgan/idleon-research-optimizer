// ===== NODE.JS — Plain-data tree node helper =====
// Used by all systems. Rendering-agnostic.
// toRenderNode() in tree-builder.js converts to _bNode for display.

export function node(name, val, children, opts) {
  var r = { name: name, val: val || 0 };
  if (children && children.length) r.children = children;
  if (opts) {
    if (opts.fmt) r.fmt = opts.fmt;
    if (opts.note) r.note = opts.note;
  }
  return r;
}

// Numeric tree result — acts as a number via valueOf() for backward compat,
// but carries .children for tree propagation.
export function treeResult(val, children) {
  val = val || 0;
  return {
    val: val,
    children: (children && children.length) ? children : null,
    valueOf: function() { return val; },
    toString: function() { return String(val); }
  };
}
