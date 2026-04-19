// ===== DAMAGE DESCRIPTOR =====
// DamageDealed("Max") and DamageDealed("Mastery") — normal mode only.
// Skip: dungeon, grimoire wraith, compass tempest, arcane tesseract.
// Scope: character.

import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { companion } from '../systems/common/companions.js';
import { vault } from '../systems/common/vault.js';
import { getBribeBonus } from '../systems/w3/bribe.js';
import { grimoireUpgBonus } from '../systems/mc/grimoire.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { pristine } from '../systems/w6/sneaking.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { getLOG } from '../../formulas.js';
import { label } from '../entity-names.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { talent } from '../systems/common/talent.js';
import { arcade } from '../systems/w2/arcade.js';
import { computeCardBonusByType, computeBoxReward, computeTotalStat, computeWorkbenchStuff, computeMealBonus, computeFamBonusQTYs, computeObolBaseStat, computeGalleryBaseStat } from '../systems/common/stats.js';
import { mainframeBonus, computePetArenaBonus, computeChipBonus } from '../systems/w4/lab.js';
import { charClassData, optionsListData, dreamData, divinityData } from '../../save/data.js';
import { GrimoireUpg, ArtifactInfo } from '../data/game/customlists.js';
import { cauldronInfoData, klaData, stampLvData } from '../../save/data.js';
import { MapDetails, MapAFKtarget } from '../data/game/customlists.js';
import { computeVialByKey, bubbleValByKey } from '../systems/w2/alchemy.js';
import { bubbleParams } from '../data/w2/alchemy.js';
import { computeStatueBonusGiven, primaryStatForClass } from '../systems/common/stats.js';
import { computeCosmoBonus, computeMonumentROGbonus } from '../systems/w5/hole.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { sigil } from '../systems/w2/alchemy.js';
import { computeOwlBonus, owl as owlResolver } from '../systems/w1/owl.js';
import { computeRooBonus, rogBonusQTY } from '../systems/w7/sushi.js';
import { winBonus, computeSummUpgBonus } from '../systems/w6/summoning.js';
import { computeDivinityMinor, computeDivinityBless } from '../systems/w5/divinity.js';
import { computeVaultKillzTotal } from '../systems/common/vaultKillz.js';
import { bubbaRoGBonuses } from '../systems/w7/bubba.js';
import { farmRankUpgBonus } from '../systems/w6/farmRank.js';
import { computeRiftSkillETC, computeEclipseSkulls, computeKillroyDMG } from '../systems/w4/rift.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { shrine, computeSaltLick } from '../systems/w3/construction.js';
import { computeArtifactBonus } from '../systems/w5/sailing.js';
import { computeShinyBonusS } from '../systems/w4/breeding.js';
import { computeMSABonus } from '../systems/w4/gaming.js';
import { computeCropSC, computeExoticBonus, computeStickerBonus } from '../systems/w6/farming.js';
import { computeAllShimmerBonuses } from '../systems/w3/equinox.js';
import { AtomInfo } from '../data/game/customlists.js';
import { superBitType } from '../../game-helpers.js';
import { computeCompassBonus } from '../systems/w7/compass.js';
import { computePrayerReal } from '../systems/w3/prayer.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { computeCardSetBonus, computeCardLv } from '../systems/common/cards.js';
import { computeMeritocBonusz } from '../systems/w7/meritoc.js';
import { friend } from '../systems/common/friend.js';
import { computePaletteBonus } from '../systems/w7/spelunking.js';
import { tome } from '../systems/w4/tome.js';
import { mineheadBonusQTY } from '../systems/w7/minehead.js';
import { ITEMS } from '../data/game/items.js';
import { equipOrderData, equipQtyData, emmData, obolNamesData, obolMapsData, obolFamilyNames, obolFamilyMaps } from '../../save/data.js';
import { computeFlurboShop } from '../systems/w2/dungeon.js';
import { computeCalcTalent } from '../systems/common/calcTalent.js';
import { guild } from '../systems/common/guild.js';
import { safe, rval, createDescriptor } from './helpers.js';

// computeStatueBonusGiven is now in systems/common/stats.js

export default createDescriptor({
  id: 'damage',
  name: 'Damage (Normal)',
  scope: 'character',
  category: 'stat',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 0, children: null };
    var ci = ctx.charIdx || 0;

    // === MASTERY (min damage ratio) ===
    // Math.min(0.8, 0.35 - talent(2,113)/100 + (Mastery_bubble + CardBonus(21) + talent(1,123) + EtcBonuses("21"))/100)
    var talent113 = rval(talent, 113, ctx); // GetTalentNumber(2, 113) — negative effect
    var masteryBubble = safe(bubbleValByKey, 'Mastery', ci, s);
    var _cb21 = safe(computeCardBonusByType, 21, ci, s);
    var card21 = (typeof _cb21 === 'object' && _cb21) ? (_cb21.val || 0) : Number(_cb21) || 0;
    var talent123 = rval(talent, 123, ctx);
    var etc21 = rval(etcBonus, '21', ctx);
    var mastery = Math.min(0.8, 0.35 - talent113 / 100 + (masteryBubble + card21 + talent123 + etc21) / 100);

    // === MAX DAMAGE (MaxDmg812) ===
    // Step 1: DamageDealtSTATtype = TotalStats(primaryStat) * (1 + (talent95+talent455+talent20 + bubbles W6+A6+M6)/100)
    var pStatName = primaryStatForClass(ci);
    var pStatResult = computeTotalStat(pStatName, ci, ctx);
    var pStatVal = pStatResult.computed;
    var talent95 = rval(talent, 95, ctx);
    var talent455 = rval(talent, 455, ctx);
    var talent20 = rval(talent, 20, ctx);
    var bubbleW6 = safe(bubbleValByKey, 'W6', ci, s);
    var bubbleA6 = safe(bubbleValByKey, 'A6', ci, s);
    var bubbleM6 = safe(bubbleValByKey, 'M6', ci, s);
    // Game zeros class-mismatched bubbles (W6/A6/M6)
    // Beginners/Journeyman/Maestro (class < 6, LUK primary) keep ALL three bubbles.
    // Warriors (6-17) keep only W6, Archers (18-29) keep only A6, Mages (30+) keep only M6.
    var _stCls = Number(charClassData && charClassData[ci]) || 0;
    if (_stCls >= 6 && _stCls < 18) { bubbleA6 = 0; bubbleM6 = 0; }
    else if (_stCls >= 18 && _stCls < 30) { bubbleW6 = 0; bubbleM6 = 0; }
    else if (_stCls >= 30) { bubbleW6 = 0; bubbleA6 = 0; }
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
    // Compute Weapon_Power inline since computeTotalStat doesn't support it
    var wpRaw = 0;
    try {
      // Equipment WP: sum all gear items' base + affix WP
      var _eo = equipOrderData && equipOrderData[ci];
      var _equipWP = 0;
      // Row 0: equipment — skip gallery slots (8=hat, 10=trophy, 14=nametag) when gallery active
      var _em0 = emmData && emmData[ci] && emmData[ci][0];
      var _galleryActive = s.spelunkData && s.spelunkData[16] && s.spelunkData[16].length > 0;
      if (_eo && _eo[0]) {
        for (var _si = 0; _si < 16; _si++) {
          if (_galleryActive && (_si === 8 || _si === 10 || _si === 14)) continue;
          var _iname = _eo[0][_si];
          if (_iname && _iname !== 'Blank') {
            _equipWP += (ITEMS[_iname] ? Number(ITEMS[_iname].Weapon_Power) || 0 : 0)
              + (_em0 && _em0[_si] ? Number(_em0[_si].Weapon_Power) || 0 : 0);
          }
        }
      }
      // Gallery base WP: trophy + nametag + premhat contributions
      var _galleryWP = 0;
      try {
        var _galResult = computeGalleryBaseStat(ci, ctx, 'Weapon_Power');
        _galleryWP = _galResult && _galResult.val ? _galResult.val : 0;
      } catch(e) {}
      // Obol base WP: personal + family obols
      // Game reclassifies obols whose names contain skill keywords (Mining, Choppin,
      // Fishing, Catching, Trapping, Worship) — their Weapon_Power is treated as the
      // skill-specific power (e.g., Fishing_Power) and excluded from WP total.
      var _obolWP = 0;
      try {
        var _skillSuffixes = ['Mining', 'Choppin', 'Fishing', 'Catching', 'Trapping', 'Worship'];
        function _isSkillObol(name) {
          for (var _si2 = 0; _si2 < _skillSuffixes.length; _si2++) {
            if (name.indexOf(_skillSuffixes[_si2]) !== -1) return true;
          }
          var _it = ITEMS[name];
          if (_it && (_it.Type === 'PICKAXE' || _it.Type === 'HATCHET')) return true;
          return false;
        }
        var _pNames = obolNamesData && obolNamesData[ci];
        var _pMaps = obolMapsData && obolMapsData[ci];
        if (_pNames) {
          for (var _oi = 0; _oi < _pNames.length; _oi++) {
            var _on = _pNames[_oi];
            if (!_on || _on === 'Blank' || _on === 'Null') continue;
            if (_isSkillObol(_on)) continue;
            var _oItem = ITEMS[_on];
            var _oStat = _oItem ? (Number(_oItem.Weapon_Power) || 0) : 0;
            var _oMap = _pMaps && _pMaps[_oi] ? (Number(_pMaps[_oi].Weapon_Power) || 0) : 0;
            var _oSlot = _oStat + _oMap;
            if (_oSlot > 0) _obolWP += _oSlot;
          }
        }
        var _fNames = obolFamilyNames;
        var _fMaps = obolFamilyMaps;
        if (_fNames) {
          for (var _fi2 = 0; _fi2 < _fNames.length; _fi2++) {
            var _fn = _fNames[_fi2];
            if (!_fn || _fn === 'Blank' || _fn === 'Null') continue;
            if (_isSkillObol(_fn)) continue;
            var _fItem = ITEMS[_fn];
            var _fStat = _fItem ? (Number(_fItem.Weapon_Power) || 0) : 0;
            var _fMap = _fMaps && _fMaps[_fi2] ? (Number(_fMaps[_fi2].Weapon_Power) || 0) : 0;
            var _fSlot = _fStat + _fMap;
            if (_fSlot > 0) _obolWP += _fSlot;
          }
        }
      } catch(e) {}
      // Flat adds: 5 + BoxRewards["12a"] + CardLv(w5b2)
      var _br12a = safe(computeBoxReward, ci, '12a');
      var _box12a = (typeof _br12a === 'object' && _br12a) ? (_br12a.val || 0) : Number(_br12a) || 0;
      var _cardLvW5b2 = (function(){ var v=safe(computeCardLv, 'w5b2', s); return (typeof v==='object'&&v)?v.val||0:Number(v)||0; })();
      var _cardBon18 = (function(){ var v=safe(computeCardBonusByType, 18, ci, s); return (typeof v==='object'&&v)?v.val||0:Number(v)||0; })();
      var _sigil17 = (function(){ var v=rval(sigil, 17, ctx); return v; })();
      // Pct scaling on equip WP: (1 + (chipWP + bubW1 + bubA1 + bubM1)/100)
      // Game zeros class-mismatched bubbles: warrior→W1 only, archer→A1 only, mage→M1 only
      var _chipWP = safe(computeChipBonus, 'weppow');
      var _bubW1 = safe(bubbleValByKey, 'W1', ci, s);
      var _bubA1 = safe(bubbleValByKey, 'A1', ci, s);
      var _bubM1 = safe(bubbleValByKey, 'M1', ci, s);
      var _wpCls = Number(charClassData && charClassData[ci]) || 0;
      if (_wpCls < 7) { _bubW1 = 0; _bubA1 = 0; }
      else if (_wpCls < 18) { _bubA1 = 0; _bubM1 = 0; }
      else if (_wpCls < 30) { _bubW1 = 0; _bubM1 = 0; }
      else { _bubW1 = 0; _bubA1 = 0; }
      var _equipWPscaled = (_equipWP + _galleryWP + _obolWP) * (1 + (_chipWP + _bubW1 + _bubA1 + _bubM1) / 100);
      // Additive WP: vials + famBon16 + starSigns + arcade + skill talents
      var _vialWP = safe(computeVialByKey, 'WeaponPOW', s);
      var _wpFam = safe(computeFamBonusQTYs, ci, s);
      var _fam16 = _wpFam && typeof _wpFam === 'object' ? (Number(_wpFam[16]) || 0) : 0;
      var _starWP = safe(computeStarSignBonus, 'WepPow', ci, s);
      var _arc17 = rval(arcade, 17, ctx);
      // Skill-based WP talents
      var _lv0 = s.lv0AllData && s.lv0AllData[ci];
      var _t530 = rval(talent, 530, ctx) * Math.floor((Number(_lv0 && _lv0[12]) || 0) / 10);
      var _t140 = rval(talent, 140, ctx) * Math.floor((Number(_lv0 && _lv0[10]) || 0) / 10);
      var _t170 = rval(talent, 170, ctx) * Math.floor((Number(_lv0 && _lv0[15]) || 0) / 10);
      var _t320 = rval(talent, 320, ctx) * Math.floor((Number(_lv0 && _lv0[13]) || 0) / 10);
      var _t500 = rval(talent, 500, ctx) * Math.floor((Number(_lv0 && _lv0[14]) || 0) / 10);
      // Talent 365: WP per log of pet stored level
      var _petStored02 = Number(s.petsStoredData && s.petsStoredData[0] && s.petsStoredData[0][2]) || 0;
      var _t365 = rval(talent, 365, ctx) * getLOG(Math.max(1, _petStored02));
      // TalentCalc(616): min(GetTalentNumber(1,616), floor(maxBeginnerLv / 10))
      // Game finds the max char level among Beginner class chars (class < 6),
      // then returns min(talent616_value, floor(that_level / 10))
      var _tc616 = 0;
      try {
        var _maxBeginnerLv = 0;
        for (var _ci = 0; _ci < (charClassData || []).length; _ci++) {
          var _cls = Number(charClassData[_ci]) || 0;
          if (_cls < 6) {
            var _charLv = Number(s.lv0AllData && s.lv0AllData[_ci] && s.lv0AllData[_ci][0]) || 0;
            if (_charLv > _maxBeginnerLv) _maxBeginnerLv = _charLv;
          }
        }
        if (_maxBeginnerLv > 0) {
          var _t616val = rval(talent, 616, ctx);
          _tc616 = Math.min(_t616val, Math.floor(_maxBeginnerLv / 10));
        }
      } catch(e) {}
      // TotalFoodBonuses("WeaponPowerBoosts"): boost food for WP
      var _foodWP = 0;
      try {
        var _foodBag = equipOrderData && equipOrderData[ci] && equipOrderData[ci][2];
        var _foodQty = equipQtyData && equipQtyData[ci] && equipQtyData[ci][2];
        for (var _fi = 0; _fi < 16; _fi++) {
          var _fname = _foodBag && _foodBag[_fi];
          if (_fname && _fname !== 'Blank' && ITEMS[_fname] && ITEMS[_fname].Effect === 'WeaponPowerBoosts') {
            var _fqty = Number((_foodQty && _foodQty[_fi]) || 0);
            if (_fqty > 0) {
              _foodWP += Number(ITEMS[_fname].Amount) || 0;
            }
          }
        }
        // Apply FoodBonuses("BoostsEffectBonus") multiplier
        if (_foodWP > 0) {
          var _boostEff = 1;
          try {
            var _bBox = safe(computeBoxReward, ci, 'PowerFoodEffect');
            var _bBoxVal = (typeof _bBox === 'object' && _bBox) ? (_bBox.val || 0) : Number(_bBox) || 0;
            var _bStatue3 = safe(computeStatueBonusGiven, 3, ci, s);
            var _bStamp = safe(computeStampBonusOfTypeX, 'BFood', s);
            var _bStampVal = (typeof _bStamp === 'object' && _bStamp) ? (_bStamp.val || 0) : Number(_bStamp) || 0;
              var _bStar = safe(computeStarSignBonus, 'FoodEffect', ci, s);
              var _bCard48 = (function(){ var v=safe(computeCardBonusByType, 48, ci, s); return (typeof v==='object'&&v)?v.val||0:Number(v)||0; })();
            var _bT631 = rval(talent, 631, ctx);
            var _bEtc9raw = safe(etcBonus.resolve.bind(etcBonus), '9', ctx);
            var _bEtc9 = (typeof _bEtc9raw === 'object' && _bEtc9raw) ? (_bEtc9raw.val || 0) : Number(_bEtc9raw) || 0;
            var _bCardSet01 = safe(computeCardSetBonus, ci, '1') || 0;
            _boostEff = 1 + (_bBoxVal + _bStatue3 + _bEtc9 + _bStampVal + _bStar + _bCard48 + _bCardSet01 + _bT631) / 100;
          } catch(e2) {}
          _foodWP *= _boostEff;
        }
      } catch(e) {}
      wpRaw = 5 + _box12a + safe(computeFlurboShop, 0, s) + _foodWP + _cardLvW5b2 + _cardBon18 + _sigil17
      var _guild3 = (function(){ try { var v=guild.resolve(3,ctx); return v&&v.val||0; }catch(e){return 0;} })();
      wpRaw = 5 + _box12a + safe(computeFlurboShop, 0, s) + _foodWP + _cardLvW5b2 + _cardBon18 + _sigil17
        + _guild3
        + _equipWPscaled + _tc616 + _vialWP + _fam16 + _starWP + _arc17
        + _t530 + _t140 + _t170 + _t320 + _t500 + _t365;
    } catch(e) {}
    var talent97 = rval(talent, 97, ctx);
    var talent277 = rval(talent, 277, ctx);
    var talent457 = rval(talent, 457, ctx);
    var cosmoBonus24 = safe(computeCosmoBonus, 2, 4, s);
    var talent5 = rval(talent, 5, ctx);
    var wp = wpRaw * (1 + (talent97 + talent277 + talent457 + cosmoBonus24) / 100) + talent5;

    var gfBaseDmg = 0;
    try {
      var gf = goldFoodBonuses('BaseDamage', ci, undefined, ctx.saveData);
      gfBaseDmg = (gf && typeof gf === 'object') ? (Number(gf.total) || 0) : (Number(gf) || 0);
    } catch(e) {}

    var baseDmgRaw = Math.pow(wp / 3, 2)
      + statType + gfBaseDmg + Math.min(150, 2 * wpRaw + statType);

    // Additive sources
    var arcade0 = rval(arcade, 0, ctx);
    var vault0 = rval(vault, 0, ctx);
    // VaultUpgBonus(20) * VaultKillzTotal(5) — VaultKillzTotal counts total kills across vault maps
    var vault20 = rval(vault, 20, ctx) * safe(computeVaultKillzTotal, 5, s);

    baseDmgRaw += arcade0 + vault0 + vault20;

    // Additional additive sources (from game DDL[0] += section)
    var statue0 = safe(computeStatueBonusGiven, 0, ci, s);
    var _brBaseDmg = safe(computeBoxReward, ci, 'basedmg');
    var boxBaseDmg = (typeof _brBaseDmg === 'object' && _brBaseDmg) ? (_brBaseDmg.val || 0) : Number(_brBaseDmg) || 0;
    var etc16 = rval(etcBonus, '16', ctx);
    var _cb4 = safe(computeCardBonusByType, 4, ci, s);
    var card4 = (typeof _cb4 === 'object' && _cb4) ? (_cb4.val || 0) : Number(_cb4) || 0;
    baseDmgRaw += statue0 + boxBaseDmg + etc16 + card4;

    // Stamp, bubble, sigil, owl sources (from game: DamageDealtLIST[0] additive)
    var stampBaseDmg = safe(computeStampBonusOfTypeX, 'BaseDmg', s);
    var owlBonus1 = 0;
    try { owlBonus1 = owlResolver.resolve(1, ctx).val || 0; } catch(e) {}
    var sigil4 = rval(sigil, 4, ctx);
    // Bubble formulas: bdmgHP * LOG(max(HPmax-250,1)), bdmgSPD * (Log2(max(Speed-0.1,0))/0.25), bdmgMP * LOG(max(MPmax-150,1))
    var bdmgHP = safe(bubbleValByKey, 'bdmgHP', ci, s);
    var bdmgSPD = safe(bubbleValByKey, 'bdmgSPD', ci, s);
    var bdmgMP = safe(bubbleValByKey, 'bdmgMP', ci, s);
    // PlayerHPmax: game formula = (15 + card1 + BaseHP_bub + stampBaseHP + foodHP + statue4
    //   + boxBaseHP + talent0 + talent642 + pow(STR*(1+t95/100), 1.05))
    //   * (1+(t92+t272+etc15)/100) * (1+shrine1/100) * gfMaxHPpct * (1+boxPctHP/100) * (1+(-buff108_1)/100) * (1+(fam18+card8)/100) * (1+starTotalHP/100)
    var hpMax = 250;
    try {
      var _hpCard1 = (function(){ var v=safe(computeCardBonusByType,1,ci,s); return (typeof v==='object'&&v)?v.val||0:Number(v)||0; })();
      var _hpBubble = safe(bubbleValByKey, 'BaseHP', ci, s);
      var _hpStamp = safe(computeStampBonusOfTypeX, 'BaseHP', s);
      var _hpStampVal = (typeof _hpStamp === 'object' && _hpStamp) ? (_hpStamp.val || 0) : Number(_hpStamp) || 0;
      var _hpStatue4 = safe(computeStatueBonusGiven, 4, ci, s);
      var _hpBox = safe(computeBoxReward, ci, 'baseHP');
      var _hpBoxVal = (typeof _hpBox === 'object' && _hpBox) ? (_hpBox.val || 0) : Number(_hpBox) || 0;
      var _hpT0 = rval(talent, 0, ctx);
      var _hpT642 = rval(talent, 642, ctx);
      var _hpT95 = rval(talent, 95, ctx);
      var _hpSTR = computeTotalStat('STR', ci, ctx);
      var _hpStrVal = (typeof _hpSTR === 'object') ? (_hpSTR.computed || 0) : Number(_hpSTR) || 0;
      var hpList0 = 15 + _hpCard1 + _hpBubble + _hpStampVal + _hpStatue4
        + (_hpBoxVal + (_hpT0 + _hpT642))
        + Math.pow(_hpStrVal * (1 + _hpT95 / 100), 1.05);
      var _hpT92 = rval(talent, 92, ctx);
      var _hpT272 = rval(talent, 272, ctx);
      var _hpEtc15 = rval(etcBonus, '15', ctx);
      var _hpShrine1 = rval(shrine, 1, ctx);
      var _hpBoxPctHP = safe(computeBoxReward, ci, 'pctHP');
      var _hpBoxPctVal = (typeof _hpBoxPctHP === 'object' && _hpBoxPctHP) ? (_hpBoxPctHP.val || 0) : Number(_hpBoxPctHP) || 0;
      var _hpFam18 = 0;
      try { var _hpFamMap = safe(computeFamBonusQTYs, ci, s);
        if (_hpFamMap && typeof _hpFamMap === 'object') _hpFam18 = Number(_hpFamMap[18]) || 0; } catch(e2){}
      var _hpCard8 = (function(){ var v=safe(computeCardBonusByType,8,ci,s); return (typeof v==='object'&&v)?v.val||0:Number(v)||0; })();
      var _hpStarHP = safe(computeStarSignBonus, 'TotalHP', ci, s);
      var _hpGfPct = 1;
      try { var _gfHP = goldFoodBonuses('MaxHPpct', ci, undefined, ctx.saveData);
        _hpGfPct = (typeof _gfHP === 'object') ? (1 + (Number(_gfHP.total) || 0) / 100) : 1; } catch(e2){}
      var hpList1 = (1 + (_hpT92 + _hpT272 + _hpEtc15) / 100)
        * (1 + _hpShrine1 / 100) * _hpGfPct * (1 + _hpBoxPctVal / 100)
        * (1 + (_hpFam18 + _hpCard8) / 100) * (1 + _hpStarHP / 100);
      hpMax = Math.max(1, hpList0 * hpList1);
    } catch(e) {}
    // PlayerMPmax: game formula = (10 + card3 + BaseMP_bub + stampBaseMP + talent1 + TotalStats("WIS") + boxBaseMP)
    //   * (1+(t452+t272)/100) * (1+(boxPctMP+card29)/100)
    var mpMax = 150;
    try {
      var _mpCard3 = (function(){ var v=safe(computeCardBonusByType,3,ci,s); return (typeof v==='object'&&v)?v.val||0:Number(v)||0; })();
      var _mpBubble = safe(bubbleValByKey, 'BaseMP', ci, s);
      var _mpStamp = safe(computeStampBonusOfTypeX, 'BaseMP', s);
      var _mpStampVal = (typeof _mpStamp === 'object' && _mpStamp) ? (_mpStamp.val || 0) : Number(_mpStamp) || 0;
      var _mpT1 = rval(talent, 1, ctx);
      var _mpWIS = computeTotalStat('WIS', ci, ctx);
      var _mpWisVal = (typeof _mpWIS === 'object') ? (_mpWIS.computed || 0) : Number(_mpWIS) || 0;
      var _mpBox = safe(computeBoxReward, ci, 'baseMP');
      var _mpBoxVal = (typeof _mpBox === 'object' && _mpBox) ? (_mpBox.val || 0) : Number(_mpBox) || 0;
      var mpList0 = 10 + _mpCard3 + _mpBubble + _mpStampVal + (_mpT1 + (_mpWisVal + _mpBoxVal));
      var _mpT452 = rval(talent, 452, ctx);
      var _mpT272 = rval(talent, 272, ctx);
      var _mpBoxPctMP = safe(computeBoxReward, ci, 'pctMP');
      var _mpBoxPctVal = (typeof _mpBoxPctMP === 'object' && _mpBoxPctMP) ? (_mpBoxPctMP.val || 0) : Number(_mpBoxPctMP) || 0;
      var _mpCard29 = (function(){ var v=safe(computeCardBonusByType,29,ci,s); return (typeof v==='object'&&v)?v.val||0:Number(v)||0; })();
      var mpList1 = (1 + (_mpT452 + _mpT272) / 100) * (1 + (_mpBoxPctVal + _mpCard29) / 100);
      mpMax = Math.max(1, mpList0 * mpList1);
    } catch(e) {}
    var bubbleHP = bdmgHP * getLOG(Math.max(hpMax - 250, 1));
    var bubbleMP = bdmgMP * getLOG(Math.max(mpMax - 150, 1));
    // PlayerSpeedBonus: game formula computes movement speed
    var playerSpeed = 1;
    try {
      // Food scan: MoveSpdBoosts
      var _spdFood = 0;
      var _spdFoodBag = equipOrderData && equipOrderData[ci] && equipOrderData[ci][2];
      var _spdFoodQty = equipQtyData && equipQtyData[ci] && equipQtyData[ci][2];
      for (var _sfi = 0; _sfi < 16; _sfi++) {
        var _sfname = _spdFoodBag && _spdFoodBag[_sfi];
        if (_sfname && _sfname !== 'Blank' && ITEMS[_sfname] && ITEMS[_sfname].Effect === 'MoveSpdBoosts') {
          var _sfqty = Number((_spdFoodQty && _spdFoodQty[_sfi]) || 0);
          if (_sfqty > 0) {
            var _sfAmt = Number(ITEMS[_sfname].Amount) || 0;
            // Apply FoodBonuses("MoveSpdBoostsEffectBonus") multiplier
            var _sfBoost = 1;
            try {
              var _sfBox = safe(computeBoxReward, ci, 'PowerFoodEffect');
              var _sfBoxVal = (typeof _sfBox === 'object' && _sfBox) ? (_sfBox.val || 0) : Number(_sfBox) || 0;
              var _sfStatue3 = safe(computeStatueBonusGiven, 3, ci, s);
              var _sfStamp = safe(computeStampBonusOfTypeX, 'BFood', s);
              var _sfStampVal = (typeof _sfStamp === 'object' && _sfStamp) ? (_sfStamp.val || 0) : Number(_sfStamp) || 0;
              var _sfStar = safe(computeStarSignBonus, 'FoodEffect', ci, s);
              var _sfCard48 = (function(){ var v=safe(computeCardBonusByType, 48, ci, s); return (typeof v==='object'&&v)?v.val||0:Number(v)||0; })();
              var _sfT631 = rval(talent, 631, ctx);
              var _sfEtc9raw = safe(etcBonus.resolve.bind(etcBonus), '9', ctx);
              var _sfEtc9 = (typeof _sfEtc9raw === 'object' && _sfEtc9raw) ? (_sfEtc9raw.val || 0) : Number(_sfEtc9raw) || 0;
              var _sfCardSet01 = safe(computeCardSetBonus, ci, '1') || 0;
              _sfBoost = 1 + (_sfBoxVal + _sfStatue3 + _sfEtc9 + _sfStampVal + _sfStar + _sfCard48 + _sfCardSet01 + _sfT631) / 100;
            } catch(e2) {}
            _spdFood += _sfAmt * _sfBoost;
          }
        }
      }
      var _spdT266 = rval(talent, 266, ctx);
      var _spdStamp = safe(computeStampBonusOfTypeX, 'PctMoveSpd', s);
      var _ola438 = Number(optionsListData[438]) || 0;
      var _spdStatue1 = safe(computeStatueBonusGiven, 1, ci, s);
      var _spdStarMoveSpd = safe(computeStarSignBonus, 'MoveSpd', ci, s);
      var _spdEtc1 = rval(etcBonus, '1', ctx);
      var _spdCard6 = (function(){ var v=safe(computeCardBonusByType, 6, ci, s); return (typeof v==='object'&&v)?v.val||0:Number(v)||0; })();
      var _spdT77 = rval(talent, 77, ctx);
      // AGI scaling
      var _spdAGI = safe(computeTotalStat, 'AGI', ci, ctx);
      var _agiVal2 = (typeof _spdAGI === 'object') ? (_spdAGI.computed || 0) : Number(_spdAGI) || 0;
      var _agiScale = _agiVal2 < 1000
        ? (Math.pow(_agiVal2 + 1, 0.4) - 1) / 40
        : (_agiVal2 - 1000) / (_agiVal2 + 2500) * 0.5 + 0.371;
      var _spdPctSum = _spdFood + _spdT266 + _spdStamp + _ola438;
      playerSpeed = (_spdPctSum + _spdStatue1 + _spdStarMoveSpd + _spdEtc1 + _spdCard6 + _spdT77) / 100 + _agiScale / 2.2 + 1;
      // Caps (skip dungeon mode: always false for save-based calc)
      if (playerSpeed <= 2) {
        var _saltLick7 = safe(computeSaltLick, 7, s);
        var _chipMove = safe(computeChipBonus, 'move');
        var _spdT641 = rval(talent, 641, ctx);
        var _sigil13 = rval(sigil, 13, ctx);
        if (playerSpeed > 1.75) {
          playerSpeed = Math.min(2, Math.floor(100 * (playerSpeed + _spdT641 / 100)) / 100);
        } else {
          playerSpeed = Math.min(1.75, Math.floor(100 * (playerSpeed + (_saltLick7 + _chipMove + _spdT641 + _sigil13) / 100)) / 100);
        }
      }
      playerSpeed = Math.floor(100 * playerSpeed) / 100;
    } catch(e) {}
    // bdmgSPD * (Log2(max(speed - 0.1, 0)) / 0.25)
    var bubbleSPD = bdmgSPD * (Math.log2(Math.max(playerSpeed - 0.1, 0)) / 0.25);
    baseDmgRaw += stampBaseDmg + owlBonus1 + sigil4 + bubbleHP + bubbleMP + bubbleSPD;

    var _preSoftcapDDL0 = baseDmgRaw;

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
    var vault27 = rval(vault, 27, ctx) * safe(computeVaultKillzTotal, 6, s);
    var vault15 = rval(vault, 15, ctx);
    var ola338 = Number(optionsListData[338]) || 0;
    var vault10 = rval(vault, 10, ctx);
    var bribe30 = safe(getBribeBonus, '30', s);
    var bribe20 = safe(getBribeBonus, '20', s);
    var stampPctDmg = safe(computeStampBonusOfTypeX, 'PctDmg', s);
    var farmRank14 = safe(farmRankUpgBonus, 14, ci, s);
    var statue22 = safe(computeStatueBonusGiven, 22, ci, s);
    var talent113 = rval(talent, 113, ctx);
    var talent86 = rval(talent, 86, ctx);
    var talent446 = rval(talent, 446, ctx);
    var hpLog = getLOG(Math.max(hpMax, 1));
    var mpLog = getLOG(Math.max(mpMax, 1));
    var owlBonus2 = 0;
    try { owlBonus2 = owlResolver.resolve(2, ctx).val || 0; } catch(e) {}
    var rooBonus4 = safe(computeRooBonus, 4, s);
    var bubbaRoG4 = safe(bubbaRoGBonuses, 4, s);
    var vault80 = rval(vault, 80, ctx);

    var addBase = statPow + vault27 + vault15 * ola338 + 0.4 * vault10
      + bribe30 + bribe20 + stampPctDmg + farmRank14 + statue22 + talent113
      + hpLog * talent86 + mpLog * talent446
      + owlBonus2 + rooBonus4 + bubbaRoG4 + vault80;
    var pctMultBase = 1 + addBase / 100;

    // Sequential multipliers applied to DDL[1]
    var talent284 = rval(talent, 284, ctx);
    var smithingLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][2]) || 0;
    var smithMult = 1 + talent284 * (Math.min(100, smithingLv) / 10) / 100;

    var winBonus0 = rval(winBonus, 0, ctx);
    var winMult = 1 + winBonus0 / 100;

    // Huge TalentCalc chain: T463*floor(minigame/25) + W12+A12+M12 + TalentCalc(31,110,125,485,305/50,470/10)
    //   + B_UPG(57) + T290*floor(min(speed-1,10)/0.15) + TalentCalc(656)
    //   + log(OLA161)*T649 + log(OLA71)*T638 + min(quests,T658) + divMinor(ci,7)
    var talentChainSum = 0;
    var bubbleW12 = safe(bubbleValByKey, 'W12', ci, s);
    var bubbleA12 = safe(bubbleValByKey, 'A12', ci, s);
    var bubbleM12 = safe(bubbleValByKey, 'M12', ci, s);
    talentChainSum += bubbleW12 + bubbleA12 + bubbleM12;
    // TalentCalc(31): GTN(1,31) * floor(minCharSkillLv / 5)  — current char only
    var tc31raw = rval(talent, 31, ctx);
    var _minSkillLv = 1e9;
    var _lv0A = s.lv0AllData || [];
    var _lv0Ci = _lv0A[ci];
    if (_lv0Ci) {
      for (var _sk3 = 1; _sk3 <= 9; _sk3++) {
        var _slv3 = Number(_lv0Ci[_sk3]) || 0;
        if (_slv3 < _minSkillLv) _minSkillLv = _slv3;
      }
    }
    if (_minSkillLv > 1e8) _minSkillLv = 0;
    var tc31 = tc31raw * Math.floor(_minSkillLv / 5);
    // TalentCalc(110): GTN(1,110) * min(monstersOver100K, GTN(2,110))
    var _gtn1_110 = rval(talent, 110, ctx);
    var _gtn2_110 = rval(talent, 110, ctx, { tab: 2 });
    var _monstersOver100K = 0;
    if (_gtn1_110 > 0) {
      var _kla = klaData[ci] || [];
      for (var _mi = 0; _mi < MapAFKtarget.length; _mi++) {
        var _mob = MapAFKtarget[_mi];
        if (!_mob || _mob === 'Nothing' || _mob === 'Z' || _mob === 'Filler') continue;
        var _killReq = Number(MapDetails[_mi] && MapDetails[_mi][0] && MapDetails[_mi][0][0]) || 0;
        var _klaVal = Number(_kla[_mi] && _kla[_mi][0]) || 0;
        if (_killReq - _klaVal >= 100000) _monstersOver100K++;
      }
    }
    var tc110 = _gtn1_110 * Math.min(_monstersOver100K, _gtn2_110);
    // TalentCalc(125): GTN(1,125) * sum(Refinery[3..8][1])
    var gtn125 = rval(talent, 125, ctx);
    var _refSum = 0;
    if (s.refineryData) for (var _ri = 3; _ri <= 8; _ri++) _refSum += Number(s.refineryData[_ri] && s.refineryData[_ri][1]) || 0;
    var tc125 = gtn125 * _refSum;
    // TalentCalc(485): GTN(1,485) * count(vials with lv > 3)
    var _vialCount = 0;
    var _ci4 = cauldronInfoData && cauldronInfoData[4];
    if (_ci4) for (var _vi = 0; _vi < _ci4.length; _vi++) { if ((Number(_ci4[_vi]) || 0) > 3) _vialCount++; }
    var tc485 = rval(talent, 485, ctx) * _vialCount;
    // TalentCalc(305): GTN(1,305) * cardCount / 50
    // Game: deepCopy(Cards[1]), add missing ensured entries, remove Gem/"Cards" prefixed, use .length
    var _c1 = s.cards1Data || [];
    var _cardCount = _c1.length;
    // Game ensures certain entries exist at init (guarded pushes). Count any missing ones.
    var _ensured = ['MaxCapBagT1','MaxCapBag6','MaxCapBagT2','MaxCapBagM1','EquipmentTools1','OilBarrel4'];
    if (_c1.indexOf('Trophy6') !== -1) {
      for (var _ni = 1; _ni < 16; _ni++) { if (_ni !== 8) _ensured.push('NPCtoken' + _ni); }
      _ensured.push('BadgeG1','BadgeG2','BadgeG3','BadgeD1','BadgeD2','BadgeD3','BadgeI1','BadgeI2','BadgeI3');
    }
    for (var _ei = 0; _ei < _ensured.length; _ei++) { if (_c1.indexOf(_ensured[_ei]) === -1) _cardCount++; }
    for (var _cdi = 0; _cdi < _c1.length; _cdi++) { var _cn = '' + _c1[_cdi]; if (_cn.indexOf('Gem') === 0 || _cn.indexOf('Cards') === 0) _cardCount--; }
    var tc305 = rval(talent, 305, ctx) * _cardCount / 50;
    // TalentCalc(470): GTN(1,470) * stampCount / 10  — uses StampLevel
    var _stampCount = 0;
    if (stampLvData) for (var _sc = 0; _sc < 3; _sc++) {
      var _scat = stampLvData[_sc];
      if (!_scat) continue;
      for (var _sk in _scat) { if (isNaN(_sk)) continue; if ((Number(_scat[_sk]) || 0) > 0.5) _stampCount++; }
    }
    var tc470 = rval(talent, 470, ctx) * _stampCount / 10;
    talentChainSum += tc31 + tc110 + tc125 + tc485 + tc305 + tc470;
    // B_UPG(57)
    // B_UPG(57, 0) = 20 * floor(LOG(Holes[9][1]))
    var _holes9 = s.holesData && s.holesData[9];
    var _holes13 = s.holesData && s.holesData[13];
    var bUpg57 = (_holes13 && Number(_holes13[57]) || 0) > 0
      ? 20 * Math.floor(getLOG(Number(_holes9 && _holes9[1]) || 1)) : 0;
    talentChainSum += bUpg57;
    // T290 * floor(min(speed-1, 10) / 0.15)
    var talent290 = rval(talent, 290, ctx);
    var _spdClamp = Math.min(playerSpeed - 1, 10);
    talentChainSum += talent290 * Math.floor(_spdClamp / 0.15);
    // TalentCalc(656): GTN(1,656) * count(dream challenges where WeeklyBoss["d_"+i] == -1)
    var _dreamCount = 0;
    var _wb = s.weeklyBossData;
    if (_wb) for (var _di = 0; _di < 100; _di++) { if (Number(_wb['d_' + _di]) === -1) _dreamCount++; }
    var tc656 = rval(talent, 656, ctx) * _dreamCount;
    talentChainSum += tc656;
    // LOG(OLA[161]) * T649
    var ola161 = Number(optionsListData[161]) || 0;
    var talent649 = rval(talent, 649, ctx);
    talentChainSum += getLOG(ola161) * talent649;
    // LOG(OLA[71]) * T638
    var ola71 = Number(optionsListData[71]) || 0;
    var talent638 = rval(talent, 638, ctx);
    talentChainSum += getLOG(ola71) * talent638;
    // min(TotalQuestsComplete, T658)
    var talent658 = rval(talent, 658, ctx);
    // TotalQuestsComplete = union of completed quests across all chars
    var totalQuests = Number(s.totalQuestsComplete) || 0;
    talentChainSum += Math.min(totalQuests, talent658);
    // DivinityMinor(ci, 7)
    var divMinor7 = safe(computeDivinityMinor, ci, 7, s);
    talentChainSum += divMinor7;
    // T463 * floor(minigameHiScore[0] / 25) — game uses GetTalentNumber(2, 463) = second bonus
    var talent463 = rval(talent, 463, ctx, { tab: 2 });
    var minigameHS = 0;
    try {
      var _mhArr = s.minigameHiscores || (s.data && s.data.FamValMinigameHiscores);
      if (_mhArr) minigameHS = Number(_mhArr[0]) || 0;
    } catch(e) {}
    talentChainSum += talent463 * Math.floor(minigameHS / 25);
    var talentChainMult = 1 + talentChainSum / 100;

    var gfDamage = 1;
    try {
      var gfd = goldFoodBonuses('Damage', ci, undefined, ctx.saveData);
      // goldFoodBonuses returns raw % sum; game uses 1 + sum/100 as multiplier
      var gfdTotal = (gfd && typeof gfd === 'object') ? (Number(gfd.total) || 0) : (Number(gfd) || 0);
      gfDamage = 1 + gfdTotal / 100;
    } catch(e) {}

    var pctMult = pctMultBase * smithMult * winMult * talentChainMult * gfDamage;

    var _preSoftcapDDL1 = pctMult;

    // === DDL[1] softcaps ===
    if (pctMult > 100) pctMult = 100 + Math.max(Math.pow(pctMult - 100, 0.86), 0);
    if (pctMult > 2e6) pctMult = 2e6 * Math.pow(pctMult / 2e6, 0.5);
    if (pctMult > 1e8) pctMult = 1e8 * Math.pow(pctMult / 1e8, 0.3);

    // === DDL[2]: Big multiplier group ===
    // Initial value = WorkbenchStuff("AdditionExtraDMG")
    // Game: (1 + getbonus2(1,508, ctx.saveData)*LOG(OLA[152])/100) * (1 + getbonus2(1,208, ctx.saveData)*LOG(OLA[329])/100)
    var t508 = rval(talent, 508, ctx, { mode: 'max', tab: 1 });
    var t208 = rval(talent, 208, ctx, { mode: 'max', tab: 1 });
    var ola152 = Number(optionsListData[152]) || 0;
    var ola329 = Number(optionsListData[329]) || 0;
    var wbDmg = (1 + t508 * getLOG(ola152) / 100) * (1 + t208 * getLOG(ola329) / 100);
    if (wbDmg < 1) wbDmg = 1;

    var ddl2 = wbDmg;
    var _ddl2Steps = [['wbDmg', wbDmg, ddl2]];

    // Group multipliers before first softcap
    var vial7dmg = safe(computeVialByKey, '7dmg', s);
    ddl2 *= (1 + vial7dmg / 100);

    var eclipseSkulls = safe(computeEclipseSkulls, s);
    ddl2 *= (1 + eclipseSkulls / 100);
    var paletteBonus34 = safe(computePaletteBonus, 34, s);
    ddl2 *= (1 + paletteBonus34 / 100);

    // Dream[6]
    var dream6 = Number(dreamData && dreamData[6]) || 0;
    ddl2 *= (1 + dream6 / 10);

    var pristine0 = rval(pristine, 0, ctx);
    ddl2 *= (1 + pristine0 / 100);

    // SummUpgBonus(79): Summon[0][79] * SummonUPG[79][6] * gilded multiplier
    var vaultUpg79 = safe(computeSummUpgBonus, 79, s);
    ddl2 *= (1 + vaultUpg79 / 100);
    _ddl2Steps.push(['after_indivMults', ddl2]);

    // Buff+Friend+StarSigns+Divinity
    var starSignPctDmg = safe(computeStarSignBonus, 'PctDmg', ci, s);
    var friendDmg = 0;
    try { friendDmg = friend.resolve(0, ctx).val || 0; } catch(e) {}
    // Divinity[25] bonus: max(0, Div[25] - 10) * getbonus2(1, 507, -1, ctx.saveData)
    var div25 = Number(divinityData && divinityData[25]) || 0;
    var talent507 = rval(talent, 507, ctx, { mode: 'max', tab: 1 });
    var divLvBonus = Math.max(0, div25 - 10) * talent507;
    // floor(max(0, charLevel - 200) / 50) * getbonus2(1, 50, -1, ctx.saveData)
    var charLvl = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][0]) || 0;
    var talent50 = rval(talent, 50, ctx, { mode: 'max', tab: 1 });
    var lvlBonus = Math.floor(Math.max(0, charLvl - 200) / 50) * talent50;
    // GetBuffBonuses(108,2) — buff bonus, approximated as 0 (runtime state)
    var _grp1Sum = friendDmg + starSignPctDmg + divLvBonus + lvlBonus;
    ddl2 *= (1 + _grp1Sum / 100);
    _ddl2Steps.push(['friend/star/div', _grp1Sum, ddl2]);

    // Grimoire+Set+Shrine+Monument+Box+Art+Atom+Shiny+MSA+Shimmer+Crop+Vault41
    var grimoireUpg35 = safe(grimoireUpgBonus, 35, GrimoireUpg, s);
    var lustreSet = safe(getSetBonus, 'LUSTRE_SET');
    var shrine0 = rval(shrine, 0, ctx);
    // MonumentROGbonuses(0, 6)
    var monument06 = safe(computeMonumentROGbonus, 0, 6, s);
    var _br12c = safe(computeBoxReward, ci, '12c');
    var br12c = (typeof _br12c === 'object' && _br12c) ? (_br12c.val || 0) : Number(_br12c) || 0;
    var _br21c = safe(computeBoxReward, ci, '21c');
    var br21c = (typeof _br21c === 'object' && _br21c) ? (_br21c.val || 0) : Number(_br21c) || 0;
    var _br23c = safe(computeBoxReward, ci, '23c');
    var br23c = (typeof _br23c === 'object' && _br23c) ? (_br23c.val || 0) : Number(_br23c) || 0;
    // FamBonusQTYs[20]
    var _famMap = safe(computeFamBonusQTYs, ci, s);
    var famBonus20 = 0;
    try {
      if (_famMap && typeof _famMap === 'object') famBonus20 = Number(_famMap[20]) || 0;
    } catch(e) {}
    var artifact25 = safe(computeArtifactBonus, 25, ci, ctx);
    // AtomBonuses(9) = Atoms[9] * AtomInfo[9][4]
    var atomLevel9 = Number(s.atomsData && s.atomsData[9]) || 0;
    var atom9 = atomLevel9 * (Number(AtomInfo[9] && AtomInfo[9][4]) || 0);
    var shiny5 = safe(computeShinyBonusS, 5, s);
    var msa0 = safe(computeMSABonus, 0, s);
    // OLA[178] * AllShimmerBonuses(0) — shimmer bonuses
    var ola178 = Number(optionsListData[178]) || 0;
    var shimmerBonus = safe(computeAllShimmerBonuses, s);
    var cropSC0 = safe(computeCropSC, 0, s);
    var vault41 = rval(vault, 41, ctx);
    var ola346 = Number(optionsListData[346]) || 0;
    var v41Log = vault41 * getLOG(ola346);
    var _grp2Sum = grimoireUpg35 + lustreSet + shrine0 + monument06
      + br12c + br21c + br23c + famBonus20
      + artifact25 + atom9 + shiny5 + msa0
      + ola178 * shimmerBonus + cropSC0 + v41Log;
    ddl2 *= (1 + _grp2Sum / 100);
    _ddl2Steps.push(['grim/lust/etc', _grp2Sum, ddl2]);

    // RiftSkillETC + Bubbles(pctDmg1,2,3) + Artifacts(2,8) + Stat bubbles + Const + Tome + Compass + Exotic + OLA[419]
    var riftETC0 = safe(computeRiftSkillETC, 0, s);
    var pctDmg1 = safe(bubbleValByKey, 'pctDmg1', ci, s);
    var pctDmg2 = safe(bubbleValByKey, 'pctDmg2', ci, s);
    var pctDmg3 = safe(bubbleValByKey, 'pctDmg3', ci, s);
    var artifact2 = safe(computeArtifactBonus, 2, ci, ctx);
    var artifact8 = safe(computeArtifactBonus, 8, ci, ctx);
    var bubW5 = safe(bubbleValByKey, 'W5', ci, s);
    var bubA5 = safe(bubbleValByKey, 'A5', ci, s);
    var bubM5 = safe(bubbleValByKey, 'M5', ci, s);
    var totalSTR = safe(computeTotalStat, 'STR', ci, ctx);
    var strVal = (typeof totalSTR === 'object') ? (totalSTR.computed || 0) : Number(totalSTR) || 0;
    var totalAGI = safe(computeTotalStat, 'AGI', ci, ctx);
    var agiVal = (typeof totalAGI === 'object') ? (totalAGI.computed || 0) : Number(totalAGI) || 0;
    var totalWIS = safe(computeTotalStat, 'WIS', ci, ctx);
    var wisVal = (typeof totalWIS === 'object') ? (totalWIS.computed || 0) : Number(totalWIS) || 0;
    var totalLUK = safe(computeTotalStat, 'LUK', ci, ctx);
    var lukVal = (typeof totalLUK === 'object') ? (totalLUK.computed || 0) : Number(totalLUK) || 0;
    // Stat bubbles: game zeros non-matching class cauldron bubbles
    // Class <18 (beginner/warrior): keep W5, zero A5/M5
    // Class 18-29 (archer): keep A5, zero W5/M5
    // Class 30+ (mage): keep M5, zero W5/A5
    var _cls = Number(charClassData && charClassData[ci]) || 0;
    var _useW5 = _cls < 18 ? 1 : 0;
    var _useA5 = (_cls >= 18 && _cls < 30) ? 1 : 0;
    var _useM5 = _cls >= 30 ? 1 : 0;
    var statBubbles = _useW5 * bubW5 * Math.floor(Math.max(strVal, lukVal) / 250)
      + _useA5 * bubA5 * Math.floor(agiVal / 250)
      + _useM5 * bubM5 * Math.floor(wisVal / 250);
    // ConstMasteryBonus(1): Rift[0]>=40 && totalTowerLv sum
    // max(0, 2 * floor((totalTowerLv - 750) / 10))
    var constMastery1 = 0;
    try {
      var _riftLv = Number(s.riftData && s.riftData[0]) || 0;
      if (_riftLv >= 40) {
        var _tow = s.towerData;
        if (_tow && _tow.length > 26) {
          var _totalTowerLv = 0;
          for (var _ti = 0; _ti < 27; _ti++) _totalTowerLv += Number(_tow[_ti]) || 0;
          constMastery1 = Math.max(0, 2 * Math.floor((_totalTowerLv - 750) / 10));
        }
      }
    } catch(e) {}
    var tomeBonus0 = 0;
    try { tomeBonus0 = tome.resolve(0, ctx).val || 0; } catch(e) {}
    var compassBonus48 = safe(computeCompassBonus, 48, s);
    var exotic41 = safe(computeExoticBonus, 41, s);
    var ola419 = Number(optionsListData[419]) || 0;
    var _grp3Sum = riftETC0 + pctDmg1 + pctDmg2 + pctDmg3
      + artifact2 + artifact8 + statBubbles
      + constMastery1 + tomeBonus0 + compassBonus48 + exotic41 + ola419;
    ddl2 *= (1 + _grp3Sum / 100);
    _ddl2Steps.push(['rift/pctDmg/stat', _grp3Sum, ddl2]);

    // Talent6 + SaltLick(9) + EtcBonuses(45) + Prayer(15) + Mainframe(0,11,110) + Artifacts(27,29) + B_UPG(84) + Arcade(46) + OLA[435]
    var talent6 = rval(talent, 6, ctx);
    var saltLick9 = safe(computeSaltLick, 9, s);
    var etc45 = rval(etcBonus, '45', ctx);
    var prayer15 = safe(computePrayerReal, 15, 0, ci, s);
    var mf0 = safe(mainframeBonus, 0, s);
    var mf11 = safe(mainframeBonus, 11, s);
    var mf110 = safe(mainframeBonus, 110, s);
    var artifact27 = safe(computeArtifactBonus, 27, ci, ctx);
    var artifact29 = safe(computeArtifactBonus, 29, ci, ctx);
    // B_UPG(84, 100) = 100 * Holes[11][55] (game's literal formula)
    var holesData11 = s.holesData && s.holesData[11];
    var bUpg84 = (holesData11 && Number(holesData11[55]) || 0) > 0 && (s.holesData[13] && Number(s.holesData[13][84]) || 0) > 0
      ? 100 * Number(holesData11[55]) : 0;
    var arcade46 = rval(arcade, 46, ctx);
    var ola435 = Number(optionsListData[435]) || 0;
    var _grp4Sum = talent6 + saltLick9 + etc45 + prayer15
      + mf0 + mf11 + mf110
      + artifact27 + artifact29 + bUpg84 + arcade46 + ola435;
    ddl2 *= (1 + _grp4Sum / 100);
    _ddl2Steps.push(['tal6/salt/mf', _grp4Sum, ddl2]);

    // Companions(10,156) + CardBonusREAL(42) + CardSetBonuses(0,"5")
    var comp10 = rval(companion, 10, ctx);
    var comp156 = rval(companion, 156, ctx);
    var _cb42 = safe(computeCardBonusByType, 42, ci, s);
    var card42 = (typeof _cb42 === 'object' && _cb42) ? (_cb42.val || 0) : Number(_cb42) || 0;
    var cardSet5 = safe(computeCardSetBonus, ci, '5');
    var _grp5Sum = comp10 + comp156 + card42 + cardSet5;
    ddl2 *= (1 + _grp5Sum / 100);
    _ddl2Steps.push(['comp/card42', _grp5Sum, ddl2]);

    // PetArena + Chips + Meal + Achievements + Divinity bless
    var petArena2 = safe(computePetArenaBonus, 2);
    var petArena15 = safe(computePetArenaBonus, 15);
    var chipDmg = safe(computeChipBonus, 'dmg');
    var mealTotDmg = safe(computeMealBonus, 'TotDmg', s);
    var achSum = 2 * safe(achieveStatus, 58, s) + 3 * safe(achieveStatus, 59, s)
      + 5 * safe(achieveStatus, 60, s) + 5 * safe(achieveStatus, 62, s)
      + 2 * safe(achieveStatus, 119, s) + 3 * safe(achieveStatus, 120, s)
      + 5 * safe(achieveStatus, 121, s) + 4 * safe(achieveStatus, 189, s)
      + 2 * safe(achieveStatus, 185, s) + 3 * safe(achieveStatus, 186, s)
      + 5 * safe(achieveStatus, 187, s) + safe(achieveStatus, 240, s) + safe(achieveStatus, 280, s)
      + 3 * safe(achieveStatus, 297, s) + 2 * safe(achieveStatus, 303, s)
      + 2 * safe(achieveStatus, 364, s) + 4 * safe(achieveStatus, 354, s) + 3 * safe(achieveStatus, 375, s);
    var divBless7 = safe(computeDivinityBless, 7, s);
    var divBless8 = safe(computeDivinityBless, 8, s);
    var _grp6Sum = 20 * petArena2 + 40 * petArena15
      + chipDmg + mealTotDmg + achSum + divBless7 + divBless8;
    ddl2 *= (1 + _grp6Sum / 100);
    _ddl2Steps.push(['pet/meal/ach/div', _grp6Sum, ddl2]);

    // Penalty multiplier: max((1 - T24/100) * (1 - BuffBonuses(124,2)/100) * max(.01, 1 - (prayer6 + prayer13)/100), .05)
    var talent24 = rval(talent, 24, ctx);
    var prayer6penalty = safe(computePrayerReal, 6, 1, ci, s);
    var prayer13penalty = safe(computePrayerReal, 13, 1, ci, s);
    var penaltyMult = Math.max(
      (1 - talent24 / 100) * 1 * Math.max(0.01, 1 - (prayer6penalty + prayer13penalty) / 100),
      0.05
    );
    ddl2 *= penaltyMult;

    // Minehead bonuses (pre-softcap)
    var mineFloor = (s.stateR7 && s.stateR7[4]) || 0;
    var mhBonusQTY0 = mineheadBonusQTY(0, mineFloor);
    // WepPowDmgPCT = BonusQTY(4) * (ItemDef[weapon].WP + EMm0[weapon].WP)
    var mhWepPowDmgPCT = 0;
    try {
      var _mhBon4 = mineheadBonusQTY(4, mineFloor);
      if (_mhBon4 > 0) {
        var _eo = equipOrderData && equipOrderData[ci];
        var _weaponName = _eo && _eo[0] && _eo[0][1];
        var _baseWP = _weaponName && ITEMS[_weaponName] ? ITEMS[_weaponName].Weapon_Power || 0 : 0;
        var _em0 = emmData && emmData[ci] && emmData[ci][0];
        var _affixWP = _em0 && _em0[1] ? Number(_em0[1].Weapon_Power) || 0 : 0;
        mhWepPowDmgPCT = _mhBon4 * (_baseWP + _affixWP);
      }
    } catch(e) {}
    ddl2 *= (1 + mhBonusQTY0 / 100) * (1 + mhWepPowDmgPCT / 100);

    // WeeklyBoss.g bonus
    try {
      var _wb = s.weeklyBossData;
      if (_wb && _wb.g != null) ddl2 *= (1 + Math.min(150, Number(_wb.g) || 0) / 100);
    } catch(e) {}

    var _ddl2PreSoftcap = ddl2;

    // === DDL[2] softcap chain ===
    if (ddl2 > 100) ddl2 = 100 + Math.max(Math.pow(ddl2 - 100, 0.86), 0);
    if (ddl2 > 2e7) ddl2 = 2e7 * Math.pow(ddl2 / 2e7, 0.8);
    if (ddl2 > 5e8) ddl2 = 5e8 * Math.pow(ddl2 / 5e8, 0.6);
    if (ddl2 > 2e9) ddl2 = 2e9 * Math.pow(ddl2 / 2e9, 0.45);
    if (ddl2 > 15e9) ddl2 = 15e9 * Math.pow(ddl2 / 15e9, 0.36);
    if (ddl2 > 6e10) ddl2 = 6e10 * Math.pow(ddl2 / 6e10, 0.28);

    var _ddl2PostSoftcap = ddl2;

    // === Post-softcap multipliers ===
    var etc72 = rval(etcBonus, '72', ctx);
    var etc75 = rval(etcBonus, '75', ctx);
    var etc104 = rval(etcBonus, '104', ctx);
    var votingDmg = safe(votingBonusz, 1, 1, s);
    var rogBonus49 = safe(rogBonusQTY, 49, s.cachedUniqueSushi || 0);
    var superBit64 = safe(superBitType, 64, s.gamingData && s.gamingData[12]);
    var ola232 = Number(optionsListData[232]) || 0;
    var ola232Bonus = 10 * Math.floor((96 + ola232) / 100);
    var _cb96 = safe(computeCardBonusByType, 96, ci, s);
    var card96 = (typeof _cb96 === 'object' && _cb96) ? (_cb96.val || 0) : Number(_cb96) || 0;
    var stickerDmg = safe(computeStickerBonus, 0, s);
    if (stickerDmg < 1) stickerDmg = 1;
    var tomeBonus6 = 0;
    try { tomeBonus6 = tome.resolve(6, ctx).val || 0; } catch(e) {}
    var ach371 = safe(achieveStatus, 371, s);
    var ach384 = safe(achieveStatus, 384, s);

    ddl2 *= (1 + etc72 / 100) * (1 + etc75 / 100) * (1 + etc104 / 100)
      * (1 + votingDmg / 100) * (1 + rogBonus49 / 100)
      * (1 + 0.1 * superBit64)
      * (1 + ola232Bonus / 100)
      * (1 + card96 / 100)
      * Math.max(1, stickerDmg)
      * (1 + (tomeBonus6 + ach371 + ach384) / 100)
      * (1 + Math.max(0, Math.min(2, safe(computeKillroyDMG, s) / 100)));

    // More post-softcap: Companions(12,33,160) + Crystal6 card + Meritoc
    var comp12 = rval(companion, 12, ctx);
    var comp33 = rval(companion, 33, ctx);
    var comp160 = rval(companion, 160, ctx);
    var compMult = Math.max(1, (1 + comp12) * (1 + comp33) * (1 + 2 * comp160));
    var _crystal6 = safe(computeCardLv, 'Crystal6', s);
    var crystal6Lv = (typeof _crystal6 === 'object' && _crystal6) ? (_crystal6.val || 0) : Number(_crystal6) || 0;
    var crystal6Bonus = Math.min(1.5 * crystal6Lv, 15);
    var meritoc5 = safe(computeMeritocBonusz, 5, s);
    ddl2 *= compMult * (1 + crystal6Bonus / 100) * (1 + meritoc5 / 100);

    // Bundle bonus
    try {
      var _bun = s.bundlesData || (s.data ? s.data.BundlesReceived : s.BundlesReceived);
      if (_bun && _bun.bon_a == 1) ddl2 *= 1.5;
    } catch(e) {}

    // FamBonusQTYs[80]
    var _famMap2 = _famMap || safe(computeFamBonusQTYs, ci, s);
    var famBonus80 = 0;
    try {
      if (_famMap2 && typeof _famMap2 === 'object') famBonus80 = Number(_famMap2[80]) || 0;
    } catch(e) {}
    ddl2 *= (1 + famBonus80 / 100);

    // Reliquarium: if in possession, DDL[2] = pow(DDL[2], 4 / (5 + OLA[473]))
    try {
      var _reliq = friend.resolve && friend.resolve(-1, ctx);
      // Skip reliquarium — needs Thingies("ReliquariumInPosession")
    } catch(e) {}

    // === Final: MaxDmg = DDL[0] * DDL[1] * DDL[2] ===
    var maxDmg = baseDmgRaw * pctMult * ddl2;
    var minDmg = maxDmg * mastery;
    var val = maxDmg;
    if (val !== val || val == null) val = 0;

    var masteryChildren = [];
    masteryChildren.push({ name: 'Mastery Bubble', val: masteryBubble / 100, fmt: 'raw' });
    masteryChildren.push({ name: 'Card Bonus: Mastery', val: card21 / 100, fmt: 'raw' });
    masteryChildren.push({ name: label('Talent', 123), val: talent123 / 100, fmt: 'raw' });
    masteryChildren.push({ name: label('EtcBonus', 21), val: etc21 / 100, fmt: 'raw' });

    var children = [];
    children.push({ name: 'Max Damage', val: maxDmg, fmt: 'raw' });
    children.push({ name: 'Min Damage', val: minDmg, fmt: 'raw' });
    children.push({ name: 'Mastery (min/max ratio)', val: mastery, fmt: 'raw', note: 'cap 0.8',
      children: masteryChildren });
    children.push({ name: 'Primary Stat (' + primaryStatForClass(ci) + ')', val: statType, fmt: 'raw',
      note: 'raw=' + Math.round(pStatVal) });
    children.push({ name: 'Base Damage (with softcap)', val: baseDmgRaw, fmt: 'raw',
      _debug: { preSoftcap: baseDmgRaw, preSoftcapRaw: _preSoftcapDDL0, wpRaw: wpRaw, wp: wp, gfBaseDmg: gfBaseDmg,
                stampBaseDmg: stampBaseDmg, hpMax: hpMax, mpMax: mpMax, bdmgHP: bdmgHP, bdmgMP: bdmgMP,
                bdmgSPD: bdmgSPD, bubbleHP: bubbleHP, bubbleMP: bubbleMP, bubbleSPD: bubbleSPD,
                playerSpeed: playerSpeed, boxBaseDmg: boxBaseDmg, baseDmgFood: 0,
                owlBonus1: owlBonus1, card4: card4, vault0: vault0, arcade0: arcade0,
                statue0: statue0, sigil4: sigil4,
                equipWP: _equipWP, galleryWP: _galleryWP, obolWP: _obolWP,
                _box12a: _box12a, _flurbo: safe(computeFlurboShop, 0, s), _foodWP: _foodWP,
                _card18: _cardBon18, _cardW5b2: _cardLvW5b2, _sigil17: _sigil17, _guild3: _guild3,
                _chipWP: _chipWP, _bubW1: _bubW1, _bubA1: _bubA1, _bubM1: _bubM1,
                _tc616: _tc616, _vialWP: _vialWP, _fam16: _fam16, _starWP: _starWP, _arc17: _arc17,
                _t530: _t530, _t140: _t140, _t170: _t170, _t320: _t320, _t500: _t500, _t365: _t365 } });
    children.push({ name: 'Percent Multiplier DDL[1]', val: pctMult, fmt: 'x', note: 'after softcaps',
      _debug: { preSoftcap: _preSoftcapDDL1, postSoftcap: pctMult,
                addBase: addBase, pctMultBase: pctMultBase,
                smithMult: smithMult, winMult: winMult, winBonus0: winBonus0,
                talentChainSum: talentChainSum, talentChainMult: talentChainMult,
                gfDamage: gfDamage, statPow: statPow,
                vault27: vault27, vault15: vault15 * ola338, ola338: ola338, vault10: 0.4 * vault10, vault80: vault80,
                stampPctDmg: stampPctDmg,
                farmRank14: farmRank14, statue22: statue22, hpLog: hpLog, talent86: talent86, mpLog: mpLog, talent446: talent446,
                bubbleW12: bubbleW12, bubbleA12: bubbleA12, bubbleM12: bubbleM12,
                tc485: tc485, bUpg57: bUpg57, tc656: tc656, divMinor7: divMinor7,
                talent658: talent658,
                tc31: tc31, tc110: tc110, tc125: tc125,
                tc305d50: tc305, tc470d10: tc470,
                t290speed: talent290 * Math.floor(_spdClamp / 0.15),
                quests658: Math.min(totalQuests, talent658),
                owlBonus2: owlBonus2, rooBonus4: rooBonus4, bubbaRoG4: bubbaRoG4,
                talent463: talent463, minigameHS: minigameHS } });
    children.push({ name: 'Big Multiplier DDL[2]', val: ddl2, fmt: 'x', note: 'after softcaps',
      _debug: { preSoftcap: _ddl2PreSoftcap, postSoftcap: _ddl2PostSoftcap, final: ddl2,
                penaltyMult: penaltyMult, compMult: compMult,
                etc72: etc72, etc75: etc75, etc104: etc104, votingDmg: votingDmg,
                comp12: comp12, comp33: comp33, comp160: comp160,
                ola232: ola232, ola232Bonus: ola232Bonus, card96: card96,
                ach371: ach371, ach384: ach384, rog49: rogBonus49, superBit64: superBit64,
                tomeBonus6: tomeBonus6, crystal6Bonus: crystal6Lv,
                meritoc5: meritoc5, famBonus80: famBonus80,
                bundleApplied: !!(s.bundlesData && s.bundlesData.bon_a == 1),
                steps: _ddl2Steps } });

    return { val: val, children: children };
  }
});
