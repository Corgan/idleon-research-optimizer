// ===== VOTING SYSTEM (W2) =====
// Summoning voting bonuses — only active when the vote is the current winner.

import { node } from '../../node.js';
import { S } from '../../../state.js';

var VOTING_DATA = {
  27: { base: 10, name: 'Voting Bonus (DR)' },
};

export var voting = {
  resolve: function(id, ctx) {
    var data = VOTING_DATA[id];
    if (!data) return node('Voting ' + id, 0, null, { note: 'voting ' + id });
    // Only active when this vote index is the current server-wide winner
    if (S.activeVoteIdx !== id) return node(data.name, 0, [
      node('Not active vote', 0, null, { fmt: 'raw', note: 'active=' + S.activeVoteIdx }),
    ], { note: 'voting ' + id });
    var multi = (ctx.dnsm && ctx.dnsm.votingBonuszMulti) || 1;
    var multiTree = ctx.dnsm && ctx.dnsm._trees && ctx.dnsm._trees.votingBonuszMulti;
    var val = data.base * multi;
    return node(data.name, val, [
      node('Base', data.base, null, { fmt: 'raw' }),
      node('Voting Multi', multi, multiTree ? multiTree.children : null, { fmt: 'x' }),
    ], { fmt: '+', note: 'voting ' + id });
  },
};
