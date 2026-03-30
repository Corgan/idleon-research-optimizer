#!/usr/bin/env node
// Extracts breeding/shiny data from src/N.formatted.js → js/data/w4/breeding.js
// Usage: node js/extract/w4/breeding.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC  = path.join(ROOT, 'src', 'N.formatted.js');
const OUT  = path.join(ROOT, 'js', 'data', 'w4', 'breeding.js');

console.log('Reading', SRC);
const src = fs.readFileSync(SRC, 'utf8');

// ── helpers ──────────────────────────────────────────────────

/** Extract top-level element N from an array literal starting at openIdx.
 *  Handles nested brackets and quoted strings. */
function extractArrayElement(str, openIdx, elementIdx) {
  let pos = openIdx + 1;
  let depth = 0;
  let elemStart = pos;
  let currentIdx = 0;
  let inString = false;
  let stringChar = '';

  for (let i = pos; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === '[' || ch === '(' || ch === '{') { depth++; continue; }
    if (ch === ']' || ch === ')' || ch === '}') {
      if (depth === 0) {
        if (currentIdx === elementIdx) return str.substring(elemStart, i).trim();
        return null;
      }
      depth--;
      continue;
    }
    if (ch === ',' && depth === 0) {
      if (currentIdx === elementIdx) return str.substring(elemStart, i).trim();
      currentIdx++;
      elemStart = i + 1;
    }
  }
  return null;
}

/** Parse a RANDOlist element — either "str".split(" ") or a literal. */
function parseRandoElement(arrIdx, elementIdx) {
  const raw = extractArrayElement(src, arrIdx, elementIdx);
  if (!raw) return null;
  const m = raw.match(/^"([^"]*)"\.split\(" "\)$/);
  if (m) return m[1].split(' ');
  try { return JSON.parse(raw); } catch (e) {}
  return raw;
}

// ── PetStats ─────────────────────────────────────────────────
console.log('Extracting PetStats...');
const petStatsIdx = src.indexOf('PetStats = function');
const petStatsRetIdx = src.indexOf('return', petStatsIdx);
const petStatsArrIdx = src.indexOf('[', petStatsRetIdx);

// Extract worlds 0-3 (real pets). Format: "spriteId f1 f2 f3 f4 shinyTypeIdx".split(" ")
const PET_SPRITES = [];   // [world][pet] = spriteId
const PET_SHINY_TYPE = []; // [world][pet] = shinyTypeIdx

for (let w = 0; w < 4; w++) {
  const worldStr = extractArrayElement(src, petStatsArrIdx, w);
  const re = /"(\w+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)"/g;
  const sprites = [];
  const shinyTypes = [];
  let m;
  while ((m = re.exec(worldStr)) !== null) {
    sprites.push(m[1]);
    shinyTypes.push(parseInt(m[2]));
  }
  PET_SPRITES.push(sprites);
  PET_SHINY_TYPE.push(shinyTypes);
  console.log(`  World ${w}: ${sprites.length} pets`);
}

// ── RANDOlist ────────────────────────────────────────────────
console.log('Extracting RANDOlist...');
const randoIdx = src.indexOf('RANDOlist = function');
const randoRetIdx = src.indexOf('return', randoIdx);
const randoArrIdx = src.indexOf('[', randoRetIdx);

const SHINY_TYPE_TO_CAT = parseRandoElement(randoArrIdx, 90).map(Number);
console.log(`  [90] SHINY_TYPE_TO_CAT: ${SHINY_TYPE_TO_CAT.length} entries`);

const SHINY_CAT_NAMES_RAW = parseRandoElement(randoArrIdx, 91);
console.log(`  [91] SHINY_CAT_NAMES: ${SHINY_CAT_NAMES_RAW.length} entries`);
// Clean: "+{%_Drop_Rate" → "% Drop Rate"
const SHINY_CAT_NAMES = SHINY_CAT_NAMES_RAW.map(n =>
  n.replace(/^\+\{/, '').replace(/\}/g, '').replace(/_/g, ' ').trim()
);

const SHINY_CAT_BONUS_PER_LV = parseRandoElement(randoArrIdx, 92).map(Number);
console.log(`  [92] SHINY_CAT_BONUS_PER_LV: ${SHINY_CAT_BONUS_PER_LV.length} entries`);

// Pre-expand: bonus per level indexed by shinyTypeIdx
const maxType = Math.max(...PET_SHINY_TYPE.flat());
const SHINY_BONUS_PER_LV = [];
for (let t = 0; t <= maxType; t++) {
  const cat = SHINY_TYPE_TO_CAT[t];
  SHINY_BONUS_PER_LV[t] = (cat != null ? SHINY_CAT_BONUS_PER_LV[cat] : 0) || 0;
}

// ── Monster display names via addNewMonster() ───────────────
console.log('Extracting monster display names from addNewMonster...');
const SPRITE_TO_NAME = {};
const monsterRe = /G\.addNewMonster\("(\w+)",\s*\{[^}]*?Name:\s*"([^"]+)"/g;
let mm;
while ((mm = monsterRe.exec(src)) !== null) {
  SPRITE_TO_NAME[mm[1]] = mm[2].replace(/_/g, ' ');
}
console.log(`  Found ${Object.keys(SPRITE_TO_NAME).length} sprite→name mappings`);

// Build PET_NAMES: [world][pet] = display name
const PET_NAMES = [];
for (let w = 0; w < 4; w++) {
  const names = [];
  for (let p = 0; p < PET_SPRITES[w].length; p++) {
    const sprite = PET_SPRITES[w][p];
    const name = SPRITE_TO_NAME[sprite] || sprite;
    names.push(name);
  }
  PET_NAMES.push(names);
  console.log(`  World ${w} names: ${names.join(', ')}`);
}

// ── Verify against current hardcoded values ──────────────────
console.log('\nVerification:');
const oldTypeTocat = [0,16,3,5,15,20,0,1,3,4,10,22,2,3,13,19,16,6,5,22,21,20,7,12,15,3,8,0,23,9,22,4,21,5,1,13,3,2,24,16,14,17,25,6,4,15,24,7,18,21,5,3,0,9,24,1,6,2,4,23,16,24,25,7,5,8,9,20,16,1];
const diffs = [];
for (let i = 0; i < Math.max(SHINY_TYPE_TO_CAT.length, oldTypeTocat.length); i++) {
  if (SHINY_TYPE_TO_CAT[i] !== oldTypeTocat[i])
    diffs.push(`  [${i}] old=${oldTypeTocat[i]} new=${SHINY_TYPE_TO_CAT[i]}`);
}
if (diffs.length) console.log('SHINY_TYPE_TO_CAT diffs:\n' + diffs.join('\n'));
else console.log('  SHINY_TYPE_TO_CAT: matches old data ✓');

const oldShinyTypes = [
  [1,2,3,4,5,6,8,9,11,13,16,19,22,28,33,38,44],
  [7,10,12,14,15,17,18,19,20,24,26,30,35,46,53,60,62],
  [21,23,25,27,29,31,32,34,36,37,39,40,43,51,54,58,61,64],
  [38,41,42,45,47,48,49,50,52,55,56,57,59,63,65,66]
];
let shinyMatch = true;
for (let w = 0; w < 4; w++) {
  for (let p = 0; p < oldShinyTypes[w].length; p++) {
    if (PET_SHINY_TYPE[w][p] !== oldShinyTypes[w][p]) {
      console.log(`  PET_SHINY_TYPE mismatch: W${w}P${p} old=${oldShinyTypes[w][p]} new=${PET_SHINY_TYPE[w][p]}`);
      shinyMatch = false;
    }
  }
}
if (shinyMatch) console.log('  PET_SHINY_TYPE: matches old data ✓');

// ── Write output ─────────────────────────────────────────────
const outDir = path.dirname(OUT);
fs.mkdirSync(outDir, { recursive: true });

const out = `// Auto-generated by js/extract/w4/breeding.js — do not edit manually.
// Source: src/N.formatted.js
// Re-run: node js/extract/w4/breeding.js

// ── PetStats: [world][pet] = [spriteId, shinyTypeIdx] ──
export const PET_STATS = ${JSON.stringify(
  PET_SPRITES.map((world, w) => world.map((sprite, p) => [sprite, PET_SHINY_TYPE[w][p]])),
  null, 2)};

// ── Pet display names: [world][pet] = name ──
export const PET_NAMES = ${JSON.stringify(PET_NAMES, null, 2)};

// ── Shiny type index per pet: [world][pet] ──
export const PET_SHINY_TYPE = ${JSON.stringify(PET_SHINY_TYPE)};

// ── RANDOlist[90]: shinyTypeIdx → category (${SHINY_TYPE_TO_CAT.length} entries) ──
export const SHINY_TYPE_TO_CAT = ${JSON.stringify(SHINY_TYPE_TO_CAT)};

// ── RANDOlist[91]: shiny category display names (${SHINY_CAT_NAMES.length} entries) ──
export const SHINY_CAT_NAMES = ${JSON.stringify(SHINY_CAT_NAMES)};

// ── RANDOlist[92]: bonus per shiny level per category (${SHINY_CAT_BONUS_PER_LV.length} entries) ──
export const SHINY_CAT_BONUS_PER_LV = ${JSON.stringify(SHINY_CAT_BONUS_PER_LV)};

// ── Derived: bonus per shiny level indexed by shinyTypeIdx ──
// SHINY_CAT_BONUS_PER_LV[SHINY_TYPE_TO_CAT[typeIdx]]
export const SHINY_BONUS_PER_LV = ${JSON.stringify(SHINY_BONUS_PER_LV)};
`;

fs.writeFileSync(OUT, out);
console.log(`\nWrote ${OUT}`);
