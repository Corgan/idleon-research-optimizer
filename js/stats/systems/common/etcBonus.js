// ===== ETC BONUS SYSTEM =====
// Sums equipment + nametag + trophy + premhat for a single EtcBonuses stat type.
// In-game, EtcBonuses(X) is one total across ALL gear sources, applied as a
// single (1 + total/100) multiplier.  Using separate entries would incorrectly
// multiply them together.

import { node } from '../../node.js';
import { equipment } from './equipment.js';
import { obol } from '../w2/obols.js';
import { nametag, trophy, premhat } from '../../systems/w7/gallery.js';

export var etcBonus = {
  resolve: function(id, ctx) {
    var eqNode = equipment.resolve(id, ctx);
    var obNode = obol.resolve(id, ctx);
    var ntNode = nametag.resolve(id, ctx);
    var trNode = trophy.resolve(id, ctx);
    var phNode = premhat.resolve(id, ctx);
    var total = (eqNode.val || 0) + (obNode.val || 0) + (ntNode.val || 0) + (trNode.val || 0) + (phNode.val || 0);
    var children = [];
    if (eqNode.val) children.push(eqNode);
    if (obNode.val) children.push(obNode);
    if (ntNode.val) children.push(ntNode);
    if (trNode.val) children.push(trNode);
    if (phNode.val) children.push(phNode);
    return node('EtcBonuses(' + id + ')', total, children, { fmt: '+', note: 'etcBonus ' + id });
  },
};
