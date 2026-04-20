// ===== REGISTRY.JS — Unified system + descriptor registry =====
// Drop-in replacement for catalog.js. Holds both system resolvers
// (talent, guild, etc.) and stat descriptors (drop-rate, etc.).

// ----- System imports (same set as catalog.js) -----
import { talent } from './systems/common/talent.js';
import { guild } from './systems/common/guild.js';
import { equipment } from './systems/common/equipment.js';
import { starSign } from './systems/common/starSign.js';
import { achievement } from './systems/common/achievement.js';
import { bundle } from './systems/common/bundle.js';
import { goldenFood } from './systems/common/goldenFood.js';
import { card, cardSet, cardSingle } from './systems/common/cards.js';
import { companion, compMulti } from './systems/common/companions.js';
import { etcBonus } from './systems/common/etcBonus.js';
import { obol } from './systems/w2/obols.js';
import { vault } from './systems/common/vault.js';
import { friend } from './systems/common/friend.js';
import { lukScaling } from './systems/common/stats.js';
import { ola } from './systems/common/ola.js';
import { stamp } from './systems/w1/stamp.js';
import { owl } from './systems/w1/owl.js';
import { alchemy, sigil } from './systems/w2/alchemy.js';
import { postOffice } from './systems/w2/postOffice.js';
import { arcade } from './systems/w2/arcade.js';
import { voting } from './systems/w2/voting.js';
import { prayer } from './systems/w3/prayer.js';
import { setBonus } from './systems/w3/setBonus.js';
import { dream, cloudBonusSys } from './systems/w3/equinox.js';
import { grid, chip } from './systems/w4/lab.js';
import { tome } from './systems/w4/tome.js';
import { shiny } from './systems/w4/breeding.js';
import { shrine } from './systems/w3/construction.js';
import { holes, cosmo } from './systems/w5/hole.js';
import { winBonus } from './systems/w6/summoning.js';
import { farm } from './systems/w6/farming.js';
import { emperor } from './systems/w6/emperor.js';
import { pristine } from './systems/w6/sneaking.js';
import { legendPTS } from './systems/w7/legend.js';
import { spelunkShop, palette } from './systems/w7/spelunking.js';
import { nametag, premhat, trophy } from './systems/w7/gallery.js';
import { minehead } from './systems/w7/minehead.js';
import { meritoc } from './systems/w7/meritoc.js';
import { grimoire } from './systems/mc/grimoire.js';
import { arcaneMap } from './systems/mc/tesseract.js';
import { sushiRoG } from './systems/w7/sushi.js';
import { glimbo, workshop, eventShop } from './systems/common/wrappers.js';

// ----- Descriptor imports -----
import dropRate from './defs/drop-rate.js';
import votingMulti from './defs/voting-multi.js';
import gfoodMulti from './defs/gfood-multi.js';
import researchExp from './defs/research-exp.js';
import researchAfkGains from './defs/research-afk-gains.js';
import sushiBucks from './defs/sushi-bucks.js';
import mineheadCurrency from './defs/minehead-currency.js';
import coinMulti from './defs/coin-multi.js';
import monsterExp from './defs/monster-exp.js';
import killPerKill from './defs/kill-per-kill.js';
import fightingAfk from './defs/fighting-afk.js';
import skillAfk from './defs/skill-afk.js';
import damage from './defs/damage.js';
import spelunkingPow from './defs/spelunking-pow.js';
import skillEfficiency from './defs/skill-efficiency.js';
import skillExp from './defs/skill-exp.js';
import tomeScore from './defs/tome-score.js';
import buildRate from './defs/build-rate.js';
import constructionExp from './defs/construction-exp.js';
import flaggySpeed from './defs/flaggy-speed.js';
import { totalSTR, totalAGI, totalWIS, totalLUK } from './defs/base-stats.js';
import critChance from './defs/crit-chance.js';
import critDamage from './defs/crit-damage.js';
import maxHP from './defs/max-hp.js';
import maxMP from './defs/max-mp.js';
import accuracy from './defs/accuracy.js';
import defence from './defs/defence.js';
import movementSpeed from './defs/movement-speed.js';
import giantMob from './defs/giant-mob.js';
import crystalSpawn from './defs/crystal-spawn.js';

// ----- Internal storage -----
// Some systems use lazy getters to avoid circular-dep undefined at module
// evaluation time (loader.js → registry.js → system.js cycle).
var _systems = {
  talent, guild, equipment, starSign, achievement, bundle,
  get goldenFood() { return goldenFood; },
  get card() { return card; },
  get cardSet() { return cardSet; },
  get cardSingle() { return cardSingle; },
  companion, compMulti, vault, friend,
  get lukScaling() { return lukScaling; },
  ola, etcBonus, obol,
  stamp, owl,
  alchemy, sigil, postOffice, arcade, voting,
  prayer, setBonus, dream,
  cloudBonus: cloudBonusSys,
  get grid() { return grid; },
  get chip() { return chip; },
  tome, shiny,
  shrine, holes, cosmo,
  winBonus, farm, emperor, pristine,
  legendPTS,
  get spelunkShop() { return spelunkShop; },
  get palette() { return palette; },
  nametag, premhat, trophy,
  get minehead() { return minehead; },
  meritoc,
  grimoire, arcaneMap, sushiRoG,
  glimbo, workshop, eventShop,
};

var _descriptors = {};

// ----- Registration -----

export function registerSystem(name, resolver) {
  _systems[name] = resolver;
}

export function registerDescriptor(desc) {
  if (!desc || !desc.id) throw new Error('Descriptor must have an id');
  _descriptors[desc.id] = desc;
}

// ----- Lookup -----

export function getSystem(name) {
  return _systems[name] || null;
}

export function getDescriptor(id) {
  return _descriptors[id] || null;
}

/** Returns the full system map (catalog-compatible object for tree-builder). */
export function getCatalog() {
  return _systems;
}

/** Returns an array of all registered descriptors. */
export function allDescriptors() {
  return Object.values(_descriptors);
}

// ----- Auto-register built-in descriptors -----
registerDescriptor(dropRate);
registerDescriptor(votingMulti);
registerDescriptor(gfoodMulti);
registerDescriptor(researchExp);
registerDescriptor(researchAfkGains);
registerDescriptor(sushiBucks);
registerDescriptor(mineheadCurrency);
registerDescriptor(coinMulti);
registerDescriptor(monsterExp);
registerDescriptor(killPerKill);
registerDescriptor(fightingAfk);
registerDescriptor(skillAfk);
registerDescriptor(damage);
registerDescriptor(spelunkingPow);
registerDescriptor(skillEfficiency);
registerDescriptor(skillExp);
registerDescriptor(tomeScore);
registerDescriptor(buildRate);
registerDescriptor(constructionExp);
registerDescriptor(flaggySpeed);
registerDescriptor(totalSTR);
registerDescriptor(totalAGI);
registerDescriptor(totalWIS);
registerDescriptor(totalLUK);
registerDescriptor(critChance);
registerDescriptor(critDamage);
registerDescriptor(maxHP);
registerDescriptor(maxMP);
registerDescriptor(accuracy);
registerDescriptor(defence);
registerDescriptor(movementSpeed);
registerDescriptor(giantMob);
registerDescriptor(crystalSpawn);
