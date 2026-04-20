import fs from 'fs';
import { buildTree } from './js/stats/tree-builder.js';
import { getCatalog } from './js/stats/registry.js';

const saves = fs.readdirSync('./saves').filter(f => f.endsWith('.json'));
if (!saves.length) { console.log('No saves found'); process.exit(1); }
const save = JSON.parse(fs.readFileSync('./saves/' + saves[0], 'utf-8'));
const catalog = getCatalog();

const ctx = { saveData: save, charIdx: 0, resolve: function(id) { 
  const d = catalog[id]; 
  if (d && d.pools) return buildTree(d, catalog, ctx); 
  return { name: id, val: 0 }; 
}};

function maxDepth(node, d = 0) {
  if (!node || !node.children || !node.children.length) return d;
  let m = d;
  for (const c of node.children) {
    const cd = maxDepth(c, d + 1);
    if (cd > m) m = cd;
  }
  return m;
}

function countNodes(node) {
  if (!node) return 0;
  let n = 1;
  if (node.children) for (const c of node.children) n += countNodes(c);
  return n;
}

const ids = ['crit-chance','accuracy','defence','max-hp','movement-speed','crit-damage','max-mp','crystal-spawn','giant-mob'];
for (const id of ids) {
  const desc = catalog[id];
  if (!desc) { console.log(id + ': NOT FOUND'); continue; }
  try {
    const tree = buildTree(desc, catalog, ctx);
    const depth = maxDepth(tree);
    const nodes = countNodes(tree);
    console.log(id + ': depth=' + depth + ' nodes=' + nodes + ' val=' + (tree.val != null ? Number(tree.val).toFixed(2) : 'null'));
  } catch(e) {
    console.log(id + ': ERROR - ' + e.message);
  }
}
