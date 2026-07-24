import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { label } from '../stats/entity-names.js';
import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';
import { createStatContext } from '../stats/stat-context.js';
import { allDescriptors } from '../stats/registry.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function forbid(relativePath, patterns) {
  const source = read(relativePath);
  for (const pattern of patterns) {
    const found = typeof pattern === 'string' ? source.includes(pattern) : pattern.test(source);
    if (found) failures.push(`${relativePath}: retired label matched ${String(pattern)}`);
  }
}

function requireText(relativePath, expected) {
  const source = read(relativePath);
  for (const text of expected) {
    if (!source.includes(text)) failures.push(`${relativePath}: expected canonical text ${JSON.stringify(text)}`);
  }
}

const htmlFiles = readdirSync(root).filter((name) => name.endsWith('.html'));
const mojibakeCodepoints = ['\uFFFD', '\u00E2', '\u00C3', '\u00C2', '\u00F0'];
for (const file of htmlFiles) {
  const source = read(file);
  for (const codepoint of mojibakeCodepoints) {
    if (source.includes(codepoint)) failures.push(`${file}: contains mojibake code point U+${codepoint.charCodeAt(0).toString(16).toUpperCase()}`);
  }
}

forbid('fountain-calc.html', [
  /['"`]([^'"`\r\n]*\bTTA\b)/,
  /['"`]([^'"`\r\n]*\bMBG\b)/,
  'Moolah Discovery',
  'Shilling Discovery',
  'Greane Discovery',
  'ActiveSpdMulti',
  '_upgRoyalWeight',
]);
requireText('fountain-calc.html', [
  '_formatUpgradeDescription',
  'Time to Afford',
  'Money Back Guarantee',
  'F.UPG_DATA[2][2][0]',
  'F.earnRatesPerHr(saveData, uLvs, mLvs)',
  'Estimated Optimal /hr: active play, full royal stacks, desired bonus, and full focus on the required currency.',
]);

forbid('clamworks-calc.html', [
  /return desc\.replace\(\/\\\$\/g/,
  'black pearls',
]);
requireText('clamworks-calc.html', [
  'Pure Pearls are worth',
  'Divides all upgrade costs by',
  'CW.pearl10xChance()',
]);

forbid('jar-calc.html', [
  'cd[1] + cd[3]',
  'cdesc.replace',
  "'C' + ci",
]);
requireText('jar-calc.html', [
  '_collectibleEffect',
  'Current effect:',
  'Average simulated effect:',
]);

forbid('sneaking-calc.html', [
  "|| 'T' +",
  "|| ('T' +",
  'ActionSpd=',
  "'(char '",
  '>Det<',
  '>Wt<',
]);
requireText('sneaking-calc.html', [
  'Unknown charm bonus',
  'Funeral Flowers',
  'Drop Weight',
]);

forbid('research-optimizer-v2.html', [
  '>Nightmare<',
  'A_ResXP',
  'A_MineHP',
  '>Obs Unlock<',
  '>Shape Opt<',
  '>Lvl Only<',
  '>Opt Shapes<',
  '>Opt Mags<',
]);
requireText('research-optimizer-v2.html', [
  'Rift Stalker',
  'Observation Unlocks',
  'Shape Optimization',
  'Research EXP curve scaling after level 20',
]);

forbid('cog-optimizer.html', [
  "'ConXP'",
  "'ConExp'",
  '>Con EXP<',
  'Grid 69 bonus:',
  'CogO/CogM',
  'Phase 2/3: SA',
]);
requireText('cog-optimizer.html', [
  "var SM_TYPE_NAMES = ['Flaggy Rate', 'Build Speed', 'Construction EXP'];",
  "+ ' Tiny Cog T'",
  'Adequate Sized, Actually',
  'Simulated annealing',
  'Construction EXP Surround',
]);

forbid('sailing-calc.html', [
  "'Sushi 57'", "'Sushi 7'", 'Voting Bonus 24', 'Vault 62', 'Artifact 3',
  'Shiny Breeding Pets 21', 'Fractal Island Bonus 3', 'Bribe 34', 'Arcade 32',
  'Arcade 66', 'Hole Upgrade 55', 'Farming Sticker 2', 'Research Grid 106',
  'Mainframe 14', 'Lore Episode 3', 'Pristine Charm 2', 'Voting Bonus 20',
  'Companion 43', 'Monument 1 / 2', 'Exotic 45',
  'Talent 325',
]);
requireText('sailing-calc.html', [
  "label('RoG',57)", "label('RoG',7)", "label('Artifact',3)",
  'Tune of Artifaction (The Hole)', 'Summoning Winner Bonus: Artifact Find Chance',
]);

forbid('cooking-mastery-calc.html', ['Cooking Mastery Zuperbit', 'SuperBit 68']);
requireText('cooking-mastery-calc.html', ['Cooking Master (Zuperbit)']);

forbid('index.html', ['STARTUE_EXP', 'C18 upgrades', 'ROG bonuses']);
requireText('index.html', ['STARTUE EXP bubble', 'Cglunko upgrades', 'permanent bonuses']);

forbid('damage-calc.html', [
  'Bubble W4:',
  'Bubble A4:',
  'Bubble M4:',
  'Card Bonus (4)',
  'Card Bonus (18)',
  'Card Level w5b2',
  'Statue 22',
  'Minigame HS',
  'Rog Bonus (49)',
  'Bubba RoG (4)',
  'Super Bit (64)',
  'Tome Bonus (6)',
  'Crystal Card LV 6',
  'Meritocracy (5)',
  'Family Bonus (80)',
]);
requireText('damage-calc.html', [
  "label('Bubble', 'O4')",
  'Purgatory Stalker Card Level',
  "label('Statue', 22)",
  "label('RoG', 49)",
  'Bubba Restaurant of Gains: Total Damage',
  "label('Super Bit', 64)",
  "label('Tome', 6)",
  'Crystal6 Card: Damage Multiplier',
  "label('Meritoc', 5)",
  "label('Family', 80)",
]);

forbid('stats-all.html', [
  /'build-rate':\s*function\(v\)\s*\{\s*return v\.toFixed\(2\) \+ 'x'/,
  /'construction-exp':\s*function\(v\)\s*\{\s*return v\.toFixed\(2\) \+ 'x'/,
]);
requireText('stats-all.html', [
  "'build-rate':   function(v) { return fmtVal(v) + '/hr'; }",
  "'construction-exp': function(v) { return fmtVal(v) + '/hr'; }",
]);

forbid('js/stats/defs/coin-multi.js', [
  "name: 'log(OLA[362])'",
  "name: 'RoG Bonus:",
  "name: 'PetArena",
  "name: 'Mainframe + Vault x Killz'",
  "name: 'Divinity + CropSC'",
  "name: 'Card: 7 x Card Level'",
  "name: 'Big Additive Group'",
]);
requireText('js/stats/defs/coin-multi.js', [
  "label('Bubble', 'O15')",
  "label('RoG', 18)",
  'Cooking Level Scaling',
  'Card: Molti',
  'Other Additive Sources',
]);

forbid('js/stats/systems/common/etcBonus.js', ["node('EtcBonuses("]);
forbid('js/stats/systems/w7/sushi.js', ["node('RoG Bonus '"]);
requireText('js/stats/systems/common/etcBonus.js', ["label('EtcBonus', id)"]);
requireText('js/stats/systems/w7/sushi.js', ["label('RoG', id)"]);

const descriptorDir = resolve(root, 'js', 'stats', 'defs');
const rawDescriptorName = /name\s*:\s*(['"`])([^'"`\r\n]*\b(?:OLA\[\d+\]|EtcBonus(?:es)?(?:\(\d+|\s+\d+)|Talent \d+|Statue \d+|Grid \d+|Sushi \d+|RoG Bonus \d+|Card Bonus \d+|Cards \(type \d+\)|LIST\[\d+\]|WorkbenchStuff|EGL\d+|ConExp|ConXP|bspd|constLv)[^'"`\r\n]*)\1/i;
for (const file of readdirSync(descriptorDir).filter((name) => name.endsWith('.js'))) {
  const relativePath = `js/stats/defs/${file}`;
  const source = read(relativePath);
  const match = source.match(rawDescriptorName);
  if (match) failures.push(`${relativePath}: raw rendered descriptor label ${JSON.stringify(match[2])}`);
}

const labelCases = [
  ['EtcBonus', 2, 'Combined Item Sources: DROP RATE'],
  ['EtcBonus', 102, 'Combined Item Sources: DROP CHANCE'],
  ['RoG', 7, 'Ring of Glory: artifact find chance'],
  ['RoG', 57, 'Ring of Glory: extra Treasure found from opening Sailing Chests'],
  ['Statue', 22, 'Statue: Battleaxe'],
  ['Prayer', 5, 'Prayer: Tachion of the Titans'],
  ['Grid', 89, 'Grid: J8 Tiny Cogs'],
  ['Super Bit', 68, 'Super Bit: Cooking Master'],
  ['Super Bit', 64, 'Super Bit: Destructive Gamer'],
  ['Tome', 6, 'Tome: Damage Multiplier'],
  ['Meritoc', 5, 'Meritoc: Total Damage'],
  ['Family', 80, 'Family: Total Damage Multiplier'],
];
for (const [system, id, expected] of labelCases) {
  const actual = label(system, id);
  if (actual !== expected) failures.push(`entity label ${system} ${id}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

loadSaveData(JSON.parse(read('saves/it.json')));
const rawRuntimeLabel = /(?:\b(?:Talent|Statue|Grid|Companion|Prayer|Shrine|Arcade|Vault|Achievement|Card|EtcBonus(?:es)?|Mainframe|Sushi|RoG|Ola|Super Bit|Meritoc|Family|Hole Upgrade|B_UPG)\s*(?:#|\(|\[)?\d+|OLA\[\d+\]|LIST\[\d+\]|\b(?:DN|EGL\d+)\b)/i;
for (const descriptor of allDescriptors()) {
  try {
    const ctx = createStatContext({ charIdx: 0, mapIdx: 0, saveData });
    const rootNode = ctx.resolve(descriptor.id);
    const visit = (node, path) => {
      if (!node || typeof node !== 'object') return;
      const nodeName = node.name || '?';
      const nodePath = `${path} > ${nodeName}`;
      if (rawRuntimeLabel.test(String(nodeName))) failures.push(`${descriptor.id}: raw runtime name ${nodePath}`);
      if (rawRuntimeLabel.test(String(node.note || ''))) failures.push(`${descriptor.id}: raw runtime note ${nodePath} :: ${node.note}`);
      for (const child of node.children || []) visit(child, nodePath);
    };
    visit(rootNode, descriptor.name);
  } catch (error) {
    failures.push(`${descriptor.id}: runtime resolution failed: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`UI label validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`UI label validation passed: ${htmlFiles.length} calculator pages plus static and runtime descriptor labels checked.`);
