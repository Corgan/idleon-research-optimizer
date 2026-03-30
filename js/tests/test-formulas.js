// Test: exercise the formula module against saves/it.json
// Run: node --experimental-vm-modules js/tests/test-formulas.js
// Or:  node js/tests/test-formulas.js  (with type:module in package.json)

import { readFileSync } from 'fs';
import { loadSaveData } from '../save/loader.js';
import { S } from '../state.js';
import { equipOrderData, equipQtyData } from '../save/data.js';
import { createDNSM, computeDNSM } from '../save/dnsm-context.js';
import { legendPTSbonus } from '../stats/systems/w7/spelunking.js';
import {
  achieveStatus, getBribeBonus, pristineBon, sigilBonus,
  vaultUpgBonus, votingBonusz, companions, cardLv,
  gfoodBonusMULTI, goldFoodBonuses, gfoodBonusMULTIBreakdown,
} from '../stats/systems/common/goldenFood.js';
import { getLOG } from '../save/engine.js';

const raw = JSON.parse(readFileSync('saves/it.json', 'utf8'));
loadSaveData(raw);

console.log('=== Save State Basic Tests ===');
console.log('AchieveReg[37]:', S.achieveRegData[37], '(expect -1)');
console.log('BribeStatus[36]:', S.bribeStatusData[36] || 0, '(expect 1)');
console.log('Ninja[107][14]:', (S.ninjaData[107] || [])[14], '(expect 1)');
console.log('CauldronP2W[4][29]:', (S.cauldronP2WData[4] || [])[29], '(expect 3)');
console.log('Spelunk[18][25]:', (S.spelunkData[18] || [])[25], '(expect 3)');
console.log('UpgVault[86]:', S.vaultData[86], '(expect 46)');
console.log('Ninja[104][14]:', (S.ninjaData[104] || [])[14], '(expect 3, FoodG13 emp)');
console.log('HasCompanion(48):', S.companionIds.has(48), '(expect true)');
console.log('HasCompanion(155):', S.companionIds.has(155), '(expect true)');
console.log('Char3 food FoodG13:', equipOrderData[3]?.[2]?.[3], '(expect FoodG13)');

console.log('\n=== Individual Formula Tests ===');
console.log('AchieveStatus(37):', achieveStatus(37), '(expect 5)');
console.log('AchieveStatus(380):', achieveStatus(380), '(expect 1)');
console.log('AchieveStatus(383):', achieveStatus(383), '(expect 1)');
console.log('GetBribeBonus(36):', getBribeBonus(36), '(expect 10)');
console.log('PristineBon(14):', pristineBon(14), '(expect 50)');
console.log('LegendPTS_bonus(25):', legendPTSbonus(25), '(expect 1500)');
console.log('VaultUpgBonus(86):', vaultUpgBonus(86), '(expect 46)');
console.log('CardLv(cropfallEvent1):', cardLv('cropfallEvent1'));

// Test SigilBonus with minimal dnsm
const dnsmMinimal = createDNSM();
console.log('SigilBonus(14) no artifact/meritoc:', sigilBonus(dnsmMinimal, 14), '(expect 60, tier 3)');

console.log('\n=== GfoodBonusMULTI with zeros for DNSM ===');
const dnsm0 = createDNSM();
const breakdown0 = gfoodBonusMULTIBreakdown(dnsm0);
console.log('Breakdown (DNSM=0):');
breakdown0.items.forEach(it => {
  if (it.val !== 0) console.log('  ', it.name, '=', it.val);
});
console.log('Sum of known:', breakdown0.sum);
console.log('SetMul:', breakdown0.setMul);
console.log('GfoodBonusMULTI (DNSM=0):', breakdown0.result);

console.log('\n=== GoldFoodBonuses("DropRatez", char 3) with DNSM=0 ===');
const dr0 = goldFoodBonuses(dnsm0, 'DropRatez', 3);
console.log('Total:', dr0.total);
console.log('Equipped:', dr0.equipped);
console.log('Emporium:', dr0.emporium);
console.log('Multi:', dr0.multi);

// Now test with example DNSM values to see impact
console.log('\n=== GfoodBonusMULTI with example DNSM values ===');
const dnsmExample = createDNSM({
  famBonusQTYs66: 50,
  etcBonuses8: 30,
  getTalentNumber1_99: 100,
  stampBonusGFood: 80,
  alchBubblesGFoodz: 200,
  mealBonusZGoldFood: 150,
  starSigns69: 40,
  getbonus2_1_209: 5,
  calcTalentMAP209: 20,
  votingBonuszMulti: 2,
  companionBon: { 48: 25, 155: 15 },
});
const breakdownEx = gfoodBonusMULTIBreakdown(dnsmExample);
console.log('Breakdown (example DNSM):');
breakdownEx.items.forEach(it => {
  console.log('  ', it.name, '=', it.val.toFixed(2));
});
console.log('Sum:', breakdownEx.sum.toFixed(2));
console.log('GfoodBonusMULTI (example):', breakdownEx.result.toFixed(4));

const drEx = goldFoodBonuses(dnsmExample, 'DropRatez', 3);
console.log('\nDropRatez DR with example DNSM:');
console.log('Total:', drEx.total.toFixed(4));
console.log('Multi:', drEx.multi.toFixed(4));
if (drEx.equipped) console.log('Equipped:', drEx.equipped.item, 'val=', drEx.equipped.val.toFixed(4));
if (drEx.emporium) console.log('Emporium:', drEx.emporium.item, 'val=', drEx.emporium.val.toFixed(4));

// === computeDNSM() auto-computation tests ===
console.log('\n=== computeDNSM() for char 3 (FORTNUTTER) ===');
const dnsmAuto = computeDNSM(3);
console.log('meritocBonusz21:', dnsmAuto.meritocBonusz21);
console.log('getTalentNumber1_99:', dnsmAuto.getTalentNumber1_99.toFixed(4), '(talent 99 decay(55,80,lv))');
console.log('getbonus2_1_209:', dnsmAuto.getbonus2_1_209.toFixed(4), '(max across chars)');
console.log('artifactBonus16:', dnsmAuto.artifactBonus16, '(Chilled Yarn)');
console.log('calcTalentMAP209:', dnsmAuto.calcTalentMAP209, '(maps with 1B+ overkill)');
console.log('companionBon:', dnsmAuto.companionBon);
console.log('votingBonuszMulti:', dnsmAuto.votingBonuszMulti.toFixed(4));
console.log('emporiumBonusUnlocked:', dnsmAuto.emporiumBonusUnlocked);
console.log('_uncomputed:', dnsmAuto._uncomputed);

console.log('\n=== GfoodBonusMULTI with auto-computed DNSM ===');
const breakdownAuto = gfoodBonusMULTIBreakdown(dnsmAuto);
breakdownAuto.items.forEach(it => {
  if (it.val !== 0) console.log('  ', it.name, '=', it.val.toFixed(2));
});
console.log('Sum:', breakdownAuto.sum.toFixed(2));
console.log('GfoodBonusMULTI (auto):', breakdownAuto.result.toFixed(4));

const drAuto = goldFoodBonuses(dnsmAuto, 'DropRatez', 3);
console.log('DropRatez (auto DNSM):', drAuto.total.toFixed(4));

// Also test for char 1 which has talent 209
console.log('\n=== computeDNSM() for char 1 ===');
const dnsm1 = computeDNSM(1);
console.log('getTalentNumber1_99:', dnsm1.getTalentNumber1_99.toFixed(4));
console.log('getbonus2_1_209:', dnsm1.getbonus2_1_209.toFixed(4));
