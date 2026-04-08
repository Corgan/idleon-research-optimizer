// ===== DAMAGE DESCRIPTOR =====
// DamageDealed("Max") and DamageDealed("Mastery") — normal mode only.
// Skip: dungeon, grimoire wraith, compass tempest, arcane tesseract.
// Scope: character.

import { companions, vaultUpgBonus, goldFoodBonuses, getBribeBonus } from '../systems/common/goldenFood.js';
import { getLOG } from '../../formulas.js';
import { label } from '../entity-names.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { talent } from '../systems/common/talent.js';
import { arcadeBonus } from '../systems/w2/arcade.js';
import { computeCardBonusByType, computeBoxReward, computeTotalStat } from '../systems/common/stats.js';
import { mainframeBonus } from '../systems/w4/lab.js';
import { charClassData, optionsListData } from '../../save/data.js';
import { AlchemyDescription } from '../data/game/customlists.js';
import { cauldronInfoData } from '../../save/data.js';
import { isBubblePrismad, getPrismaBonusMult } from '../systems/w2/alchemy.js';
import { bubbleParams } from '../data/w2/alchemy.js';
import { formulaEval } from '../../formulas.js';
import { saveData } from '../../state.js';
import { computeStatueBonusGiven } from '../systems/common/stats.js';
import { computeCosmoBonus } from '../systems/w5/hole.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { sigilBonus } from '../systems/common/goldenFood.js';
import { computeOwlBonus } from '../systems/w1/owl.js';
import { computeRooBonus } from '../systems/w7/sushi.js';
import { computeWinBonus } from '../systems/w6/summoning.js';
import { computeDivinityMinor } from '../systems/w5/divinity.js';
import { computeVaultKillzTotal } from '../systems/common/vaultKillz.js';
import { bubbaRoGBonuses } from '../systems/w7/bubba.js';
import { farmRankUpgBonus } from '../systems/w6/farmRank.js';

function rval(resolver, id, ctx, args) {
  try { return resolver.resolve(id, ctx, args).val || 0; }
  catch(e) { return 0; }
}

function safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;
  } catch(e) { return 0; }
}

function bubbleValByKey(key, charIdx) {
  for (var c2 = 0; c2 < 4; c2++) {
    var arr = AlchemyDescription[c2];
    if (!arr) continue;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i][15] === key) {
        var lv = Number((cauldronInfoData && cauldronInfoData[c2] && cauldronInfoData[c2][i]) || 0);
        if (lv <= 0) return 0;
        var baseVal = formulaEval(arr[i][3], Number(arr[i][1]), Number(arr[i][2]), lv);
        var isPrisma = isBubblePrismad(c2, i);
        var prismaMult = isPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
        var val = baseVal * prismaMult;
        var cls = Number(charClassData && charClassData[charIdx]) || 0;
        if (cls > 6 && i !== 16 && i < 30 &&
            key.indexOf('passz') < 0 && key.indexOf('ACTIVE') < 0 && key.indexOf('AllCharz') < 0) {
          if (c2 === 0 && cls < 18 && key !== 'Construction') {
            val *= Math.max(1, bubbleValByKey('Opassz'));
          } else if (c2 === 1 && cls >= 18 && cls < 30) {
            val *= Math.max(1, bubbleValByKey('Gpassz'));
          } else if (c2 === 2 && cls >= 30 && cls < 42) {
            val *= Math.max(1, bubbleValByKey('Ppassz'));
          }
        }
        return val;
      }
    }
  }
  return 0;
}

// ClassStatTypes: maps class branch to primary stat
// Warriors → STR, Archers → AGI, Mages → WIS
function primaryStatForClass(charIdx) {
  var cls = Number(charClassData && charClassData[charIdx]) || 0;
  if (cls <= 0) return 'STR'; // Beginner default
  var family = (cls - 1) % 3; // 0=warrior, 1=archer, 2=mage
  if (family === 0) return 'STR';
  if (family === 1) return 'AGI';
  return 'WIS';
}

function primaryStatIdx(charIdx) {
  var stat = primaryStatForClass(charIdx);
  if (stat === 'STR') return 0;
  if (stat === 'AGI') return 1;
  return 2; // WIS
}

// computeStatueBonusGiven is now in systems/common/stats.js

export default {
  id: 'damage',
  name: 'Damage (Normal)',
  scope: 'character',
  category: 'stat',

  pools: {},

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 0, children: null };
    var ci = ctx.charIdx || 0;

    // === MASTERY (min damage ratio) ===
    // Math.min(0.8, 0.35 - talent(2,113)/100 + (Mastery_bubble + CardBonus(21) + talent(1,123) + EtcBonuses("21"))/100)
    var talent113 = rval(talent, 113, ctx); // GetTalentNumber(2, 113) — negative effect
    var masteryBubble = safe(bubbleValByKey, 'Mastery', ci);
    var _cb21 = safe(computeCardBonusByType, 21, ci);
    var card21 = (typeof _cb21 === 'object' && _cb21) ? (_cb21.val || 0) : Number(_cb21) || 0;
    var talent123 = rval(talent, 123, ctx);
    var etc21 = rval(etcBonus, '21', ctx);
    var mastery = Math.min(0.8, 0.35 - talent113 / 100 + (masteryBubble + card21 + talent123 + etc21) / 100);

    // === MAX DAMAGE (MaxDmg812) ===
    // Step 1: DamageDealtSTATtype = TotalStats(primaryStat) * (1 + (talent95+talent455+talent20 + bubbles W6+A6+M6)/100)
    var pStatName = primaryStatForClass(ci);
    var pStatResult = computeTotalStat(pStatName, ci, ctx);
    var pStatVal = pStatResult.computed || pStatResult.fromSave;
    var talent95 = rval(talent, 95, ctx);
    var talent455 = rval(talent, 455, ctx);
    var talent20 = rval(talent, 20, ctx);
    var bubbleW6 = safe(bubbleValByKey, 'W6', ci);
    var bubbleA6 = safe(bubbleValByKey, 'A6', ci);
    var bubbleM6 = safe(bubbleValByKey, 'M6', ci);
    var statType = pStatVal * (1 + (talent95 + talent455 + talent20 + bubbleW6 + bubbleA6 + bubbleM6) / 100);

    // Step 2: DamageDealtLIST[0] = base damage
    // pow((WP * (1 + talent97+talent277+talent457+CosmoBonusQTY(2,4))/100 + talent5) / 3, 2)
    // + (statType + GoldFood("BaseDamage") + min(150, 2*WP + statType))
    // + (Arcade(0) + OwlBonuses(1) + Vault(0) + Vault(20)*VaultKillzTotal(5))
    // Then add: stamps, EtcBonuses(16), Statue(0), BoxRewards.basedmg, bubble formulas, Card(4), Sigil(4)
    // Then cap: if > 4000, apply pow(.91) softcap; if > 15000, apply pow(.84) softcap
    // Then add food bonuses (BaseDmgBoosts equipped food items)
    // Then LIST[1] = pct multiplier from stat^.7 + vaults + stamps + statues + talents + etc

    // Simplified computation (getting the broad structure right)
    var _wpResult = safe(computeTotalStat, 'Weapon_Power', ci, ctx);
    var wpRaw = (typeof _wpResult === 'object' && _wpResult) ? (_wpResult.computed || 0) : Number(_wpResult) || 0;
    var talent97 = rval(talent, 97, ctx);
    var talent277 = rval(talent, 277, ctx);
    var talent457 = rval(talent, 457, ctx);
    var cosmoBonus24 = safe(computeCosmoBonus, 2, 4);
    var talent5 = rval(talent, 5, ctx);
    var wp = wpRaw * (1 + (talent97 + talent277 + talent457 + cosmoBonus24) / 100) + talent5;

    var gfBaseDmg = 0;
    try {
      var gf = goldFoodBonuses('BaseDamage', ci);
      gfBaseDmg = (gf && typeof gf === 'object') ? (Number(gf.total) || 0) : (Number(gf) || 0);
    } catch(e) {}

    var baseDmgRaw = Math.pow(wp / 3, 2)
      + statType + gfBaseDmg + Math.min(150, 2 * wpRaw + statType);

    // Additive sources
    var arcade0 = safe(arcadeBonus, 0);
    var vault0 = safe(vaultUpgBonus, 0);
    // VaultUpgBonus(20) * VaultKillzTotal(5) — VaultKillzTotal counts total kills across vault maps
    var vault20 = safe(vaultUpgBonus, 20) * safe(computeVaultKillzTotal, 5);

    baseDmgRaw += arcade0 + vault0 + vault20;

    // Additional additive sources (from game DDL[0] += section)
    var statue0 = safe(computeStatueBonusGiven, 0);
    var _brBaseDmg = safe(computeBoxReward, ci, 'basedmg');
    var boxBaseDmg = (typeof _brBaseDmg === 'object' && _brBaseDmg) ? (_brBaseDmg.val || 0) : Number(_brBaseDmg) || 0;
    var etc16 = rval(etcBonus, '16', ctx);
    var _cb4 = safe(computeCardBonusByType, 4, ci);
    var card4 = (typeof _cb4 === 'object' && _cb4) ? (_cb4.val || 0) : Number(_cb4) || 0;
    baseDmgRaw += statue0 + boxBaseDmg + etc16 + card4;

    // Stamp, bubble, sigil, owl sources (from game: DamageDealtLIST[0] additive)
    var stampBaseDmg = safe(computeStampBonusOfTypeX, 'BaseDmg');
    var owlBonus1 = safe(computeOwlBonus, 1);
    var sigil4 = safe(sigilBonus, 4);
    // Bubble formulas: bdmgHP * LOG(max(HPmax-250,1)), bdmgSPD * (Log2(max(Speed-0.1,0))/0.25), bdmgMP * LOG(max(MPmax-150,1))
    var bdmgHP = safe(bubbleValByKey, 'bdmgHP', ci);
    var bdmgSPD = safe(bubbleValByKey, 'bdmgSPD', ci);
    var bdmgMP = safe(bubbleValByKey, 'bdmgMP', ci);
    // PlayerHPmax, PlayerMPmax: use lv0AllData or default
    var hpMax = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][6]) || 250;
    var mpMax = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][7]) || 150;
    var bubbleHP = bdmgHP * getLOG(Math.max(hpMax - 250, 1));
    var bubbleMP = bdmgMP * getLOG(Math.max(mpMax - 150, 1));
    // Speed bonus not easily available from save — skip for now
    var bubbleSPD = 0;
    baseDmgRaw += stampBaseDmg + owlBonus1 + sigil4 + bubbleHP + bubbleMP + bubbleSPD;

    // Softcap
    if (baseDmgRaw > 4000) {
      baseDmgRaw = 4000 + Math.max(Math.pow(baseDmgRaw - 4000, 0.91), 0);
      if (baseDmgRaw > 15000) {
        baseDmgRaw = 15000 + Math.max(Math.pow(baseDmgRaw - 15000, 0.84), 0);
      }
    }

    // === Percent multiplier (LIST[1]) ===
    // Game: DDL.push(1 + (STATtype^0.7 + vault27*killz6 + vault15*OLA338 + 0.4*vault10 + bribe30 + bribe20
    //   + stampPctDmg + FarmRankUpg14 + statue22 + talent113 + log(HP)*talent86 + log(MP)*talent446
    //   + owl2 + roo4 + bubbaRoG4 + vault80) / 100)
    // Then: *= (1+T284*min(100,Lv0[2])/10/100) * (1+WinBonus0/100)
    //         * (1+(talentCalcChain+divMinor7)/100) * GoldFood("Damage")

    var statPow = Math.pow(statType, 0.7);
    var vault27 = safe(vaultUpgBonus, 27) * safe(computeVaultKillzTotal, 6);
    var vault15 = safe(vaultUpgBonus, 15);
    var ola338 = Number(optionsListData[338]) || 0;
    var vault10 = safe(vaultUpgBonus, 10);
    var bribe30 = safe(getBribeBonus, '30');
    var bribe20 = safe(getBribeBonus, '20');
    var stampPctDmg = safe(computeStampBonusOfTypeX, 'PctDmg');
    var farmRank14 = safe(farmRankUpgBonus, 14);
    var statue22 = safe(computeStatueBonusGiven, 22);
    var talent113 = rval(talent, 113, ctx);
    var talent86 = rval(talent, 86, ctx);
    var talent446 = rval(talent, 446, ctx);
    var hpLog = getLOG(Math.max(hpMax, 1));
    var mpLog = getLOG(Math.max(mpMax, 1));
    var owlBonus2 = safe(computeOwlBonus, 2);
    var rooBonus4 = safe(computeRooBonus, 4);
    var bubbaRoG4 = safe(bubbaRoGBonuses, 4);
    var vault80 = safe(vaultUpgBonus, 80);

    var addBase = statPow + vault27 + vault15 * ola338 + 0.4 * vault10
      + bribe30 + bribe20 + stampPctDmg + farmRank14 + statue22 + talent113
      + hpLog * talent86 + mpLog * talent446
      + owlBonus2 + rooBonus4 + bubbaRoG4 + vault80;
    var pctMultBase = 1 + addBase / 100;

    // Sequential multipliers applied to DDL[1]
    var talent284 = rval(talent, 284, ctx);
    var smithingLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][2]) || 0;
    var smithMult = 1 + talent284 * (Math.min(100, smithingLv) / 10) / 100;

    var winBonus0 = safe(computeWinBonus, 0);
    var winMult = 1 + winBonus0 / 100;

    // Huge TalentCalc chain: T463*floor(minigame/25) + W12+A12+M12 + TalentCalc(31,110,125,485,305/50,470/10)
    //   + B_UPG(57) + T290*floor(min(speed-1,10)/0.15) + TalentCalc(656)
    //   + log(OLA161)*T649 + log(OLA71)*T638 + min(quests,T658) + divMinor(ci,7)
    var talentChainSum = 0;
    var bubbleW12 = safe(bubbleValByKey, 'W12', ci);
    var bubbleA12 = safe(bubbleValByKey, 'A12', ci);
    var bubbleM12 = safe(bubbleValByKey, 'M12', ci);
    talentChainSum += bubbleW12 + bubbleA12 + bubbleM12;
    // TalentCalc() terms: each is a computed talent value, used via rval(talent,...)
    var tc31 = rval(talent, 31, ctx);
    var tc110 = rval(talent, 110, ctx);
    // T125 in multiplier chain: GetTalentNumber(1,125) * TalentCalc(125) — approx as talent^2 or just talent
    var tc125 = rval(talent, 125, ctx);
    var tc485 = rval(talent, 485, ctx);
    var tc305 = rval(talent, 305, ctx) / 50;
    var tc470 = rval(talent, 470, ctx) / 10;
    talentChainSum += tc31 + tc110 + tc125 + tc485 + tc305 + tc470;
    // DivinityMinor(ci, 7)
    var divMinor7 = safe(computeDivinityMinor, ci, 7);
    talentChainSum += divMinor7;
    // TODO: T463*floor(minigame/25), B_UPG(57), T290*floor(min(speed-1,10)/0.15), T656
    //       log(OLA161)*T649, log(OLA71)*T638, min(quests,T658)
    var talentChainMult = 1 + talentChainSum / 100;

    var gfDamage = 1;
    try {
      var gfd = goldFoodBonuses('Damage', ci);
      gfDamage = (gfd && typeof gfd === 'object') ? (Number(gfd.total) || 1) : (Number(gfd) || 1);
    } catch(e) {}

    var pctMult = pctMultBase * smithMult * winMult * talentChainMult * gfDamage;

    // Final max damage
    var maxDmg = baseDmgRaw * pctMult;

    // Min damage
    var minDmg = maxDmg * mastery;

    var val = maxDmg;
    if (val !== val || val == null) val = 0;

    var children = [];
    children.push({ name: 'Max Damage', val: maxDmg, fmt: 'raw' });
    children.push({ name: 'Min Damage', val: minDmg, fmt: 'raw' });
    children.push({ name: 'Mastery', val: mastery, fmt: 'raw', note: 'cap 0.8' });
    children.push({ name: 'Primary Stat (' + primaryStatForClass(ci) + ')', val: statType, fmt: 'raw',
      note: 'raw=' + Math.round(pStatVal) });
    children.push({ name: 'Base Damage (with softcap)', val: baseDmgRaw, fmt: 'raw' });
    children.push({ name: 'Percent Multiplier', val: pctMult, fmt: 'x' });

    return { val: val, children: children };
  }
};
