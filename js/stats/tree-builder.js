// ===== TREE-BUILDER.JS — Generic stat breakdown tree builder =====
// Resolves all sources in a descriptor's pools via the catalog,
// then calls the descriptor's combine() to produce the final tree.
//
// Node shape (plain data, rendering-agnostic):
//   { name: string, val: number, children?: Array, note?: string, fmt?: string }

import { _bNode } from '../ui/dash-breakdowns.js';

/**
 * Build a breakdown tree for a stat descriptor.
 *
 * @param {object} desc    - { id, name, scope, pools, combine(pools) }
 * @param {object} catalog - { systemName: { resolve(id, ctx, args?) → node } }
 * @param {object} ctx     - { charIdx, mapIdx, S, dnsm, mapBon? }
 * @returns {{ name: string, val: number, children: Array }}
 */
export function buildTree(desc, catalog, ctx) {
  var pools = {};

  for (var poolName in desc.pools) {
    var sources = desc.pools[poolName];
    var items = [];
    var sum = 0, product = 1;

    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      var system = catalog[src.system];

      if (!system) {
        items.push({ name: '[' + src.system + '] not implemented', val: 0 });
        continue;
      }

      var result = system.resolve(src.id, ctx, src.args);
      items.push(result);

      var v = result.val || 0;
      sum += v;
      product *= (v !== 0 ? v : 1);
    }

    pools[poolName] = { items: items, sum: sum, product: product };
  }

  var result = desc.combine(pools);
  return { name: desc.name, val: result.val, children: result.children };
}

/**
 * Convert a plain tree node to a _bNode for renderBreakdownTree().
 * Recursively wraps { name, val, children, fmt, note } → _bNode(label, val, children, opts).
 */
export function toRenderNode(n) {
  if (!n) return null;
  var ch = null;
  if (n.children && n.children.length > 0) {
    ch = [];
    for (var i = 0; i < n.children.length; i++) {
      ch.push(toRenderNode(n.children[i]));
    }
  }
  return _bNode(n.name, n.val, ch, { fmt: n.fmt, note: n.note });
}
