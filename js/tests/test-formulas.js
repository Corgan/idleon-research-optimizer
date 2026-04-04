// Test: exercise the formula module against saves/it.json
// Run: node --experimental-vm-modules js/tests/test-formulas.js
// Or:  node js/tests/test-formulas.js  (with type:module in package.json)

import { readFileSync } from 'fs';
import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';
import { equipOrderData, equipQtyData } from '../save/data.js';
import { createGFoodInputs, computeGFoodInputs } from '../stats/systems/common/goldenFood.js';
import { legendPTSbonus } from '../stats/systems/w7/spelunking.js';
import {
  getBribeBonus, pristineBon, sigilBonus,
  vaultUpgBonus, votingBonusz, companions, cardLv,
  gfoodBonusMULTI, goldFoodBonuses, gfoodBonusMULTIBreakdown,
} from '../stats/systems/common/goldenFood.js';
import { achieveStatus } from '../stats/systems/common/achievement.js';
import { getLOG } from '../formulas.js';

const raw = JSON.parse(readFileSync('saves/it.json', 'utf8'));
loadSaveData(raw);

console.log('=== Save State Basic Tests ===');
console.log('AchieveReg[37]:', saveData.achieveRegData[37], '(expect -1)');
console.log('BribeStatus[36]:', saveData.bribeStatusData[36] || 0, '(expect 1)');
console.log('Ninja[107][14]:', (saveData.ninjaData[107] || [])[14], '(expect 1)');
console.log('CauldronP2W[4][29]:', (saveData.cauldronP2WData[4] || [])[29], '(expect 3)');
console.log('Spelunk[18][25]:', (saveData.spelunkData[18] || [])[25], '(expect 3)');
console.log('UpgVault[86]:', saveData.vaultData[86], '(expect 46)');
console.log('Ninja[104][14]:', (saveData.ninjaData[104] || [])[14], '(expect 3, FoodG13 emp)');
console.log('HasCompanion(48):', saveData.companionIds.has(48), '(expect true)');
console.log('HasCompanion(155):', saveData.companionIds.has(155), '(expect true)');
console.log('Char3 food FoodG13:', equipOrderData[3]?.[2]?.[3], '(expect FoodG13)');

console.log('\n=== Individual Formula Tests ===');
console.log('AchieveStatus(37):', achieveStatus(37), '(expect 1)');
console.log('AchieveStatus(380):', achieveStatus(380), '(expect 1)');
console.log('AchieveStatus(383):', achieveStatus(383), '(expect 0)');
console.log('GetBribeBonus(36):', getBribeBonus(36), '(expect 10)');
console.log('PristineBon(14):', pristineBon(14), '(expect 50)');
console.log('LegendPTS_bonus(25):', legendPTSbonus(25), '(expect 1500)');
console.log('VaultUpgBonus(86):', vaultUpgBonus(86), '(expect 46)');
console.log('CardLv(cropfallEvent1):', cardLv('cropfallEvent1'));

// Test SigilBonus — no longer needs dnsm, computes artifact/meritoc inline
console.log('SigilBonus(14):', sigilBonus(14), '(with artifact+meritoc from save)');

console.log('\n=== GfoodBonusMULTI with zeros (no save data) ===');
const breakdown0 = gfoodBonusMULTIBreakdown(0);
console.log('Breakdown (char 0):');
breakdown0.items.forEach(it => {
  if (it.val !== 0) console.log('  ', it.name, '=', it.val);
});
console.log('Sum of known:', breakdown0.sum);
console.log('SetMul:', breakdown0.setMul);
console.log('GfoodBonusMULTI (char 0):', breakdown0.result);

console.log('\n=== GoldFoodBonuses("DropRatez", char 3) ===');
const dr0 = goldFoodBonuses('DropRatez', 3);
console.log('Total:', dr0.total);
console.log('Equipped:', dr0.equipped);
console.log('Emporium:', dr0.emporium);
console.log('Multi:', dr0.multi);

// Now test with computed inputs from save to see impact
console.log('\n=== GfoodBonusMULTI with computed inputs (char 3) ===');
const inputsEx = computeGFoodInputs(3);
console.log('famBonusQTYs66:', inputsEx.famBonusQTYs66);
console.log('etcBonuses8:', inputsEx.etcBonuses8);
console.log('getTalentNumber1_99:', inputsEx.getTalentNumber1_99);
console.log('stampBonusGFood:', inputsEx.stampBonusGFood);
console.log('alchBubblesGFoodz:', inputsEx.alchBubblesGFoodz);
console.log('mealBonusZGoldFood:', inputsEx.mealBonusZGoldFood);
console.log('starSigns69:', inputsEx.starSigns69);
console.log('getbonus2_1_209:', inputsEx.getbonus2_1_209);
console.log('calcTalentMAP209:', inputsEx.calcTalentMAP209);
console.log('votingBonuszMulti:', inputsEx.votingBonuszMulti);
console.log('artifactBonus16:', inputsEx.artifactBonus16);
console.log('meritocBonusz21:', inputsEx.meritocBonusz21);
const breakdownEx = gfoodBonusMULTIBreakdown(3);
console.log('Breakdown (char 3):');
breakdownEx.items.forEach(it => {
  console.log('  ', it.name, '=', it.val.toFixed(2));
});
console.log('Sum:', breakdownEx.sum.toFixed(2));
console.log('GfoodBonusMULTI (char 3):', breakdownEx.result.toFixed(4));

const drEx = goldFoodBonuses('DropRatez', 3);
console.log('\nDropRatez DR (char 3):');
console.log('Total:', drEx.total.toFixed(4));
console.log('Multi:', drEx.multi.toFixed(4));
if (drEx.equipped) console.log('Equipped:', drEx.equipped.item, 'val=', drEx.equipped.val.toFixed(4));
if (drEx.emporium) console.log('Emporium:', drEx.emporium.item, 'val=', drEx.emporium.val.toFixed(4));

// === computeGFoodInputs() tests ===
console.log('\n=== computeGFoodInputs() for char 3 (FORTNUTTER) ===');
const inputsAuto = computeGFoodInputs(3);
console.log('meritocBonusz21:', inputsAuto.meritocBonusz21);
console.log('getTalentNumber1_99:', inputsAuto.getTalentNumber1_99.toFixed(4), '(talent 99 decay(55,80,lv))');
console.log('getbonus2_1_209:', inputsAuto.getbonus2_1_209.toFixed(4), '(max across chars)');
console.log('artifactBonus16:', inputsAuto.artifactBonus16, '(Chilled Yarn)');
console.log('calcTalentMAP209:', inputsAuto.calcTalentMAP209, '(maps with 1B+ overkill)');
console.log('votingBonuszMulti:', inputsAuto.votingBonuszMulti.toFixed(4));

console.log('\n=== GfoodBonusMULTI with auto-computed inputs ===');
const breakdownAuto = gfoodBonusMULTIBreakdown(3);
breakdownAuto.items.forEach(it => {
  if (it.val !== 0) console.log('  ', it.name, '=', it.val.toFixed(2));
});
console.log('Sum:', breakdownAuto.sum.toFixed(2));
console.log('GfoodBonusMULTI (auto):', breakdownAuto.result.toFixed(4));

const drAuto = goldFoodBonuses('DropRatez', 3);
console.log('DropRatez (auto):', drAuto.total.toFixed(4));

// Also test for char 1 which has talent 209
console.log('\n=== computeGFoodInputs() for char 1 ===');
const inputs1 = computeGFoodInputs(1);
console.log('getTalentNumber1_99:', inputs1.getTalentNumber1_99.toFixed(4));
console.log('getbonus2_1_209:', inputs1.getbonus2_1_209.toFixed(4));
